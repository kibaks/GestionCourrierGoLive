<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courrier;
use App\Models\CourrierFichier;
use App\Models\EntiteOrganisationnelle;
use App\Models\User;
use App\Services\CourrierAccessService;
use App\Services\CourrierFileService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Courriers : même logique de stockage que Firebase + permissions par rôle (JWT).
 * Liste = courriers accessibles pour l'utilisateur connecté (getAccessibleCourriers).
 */
class CourrierController extends Controller
{
    public function __construct(
        private CourrierAccessService $accessService,
        private CourrierFileService $fileService
    ) {}

    /**
     * Nombre de fichiers pour une liste de courriers.
     * GET /api/courriers/files-counts?ids=uuid1,uuid2,...
     * Retourne { "data": { "uuid1": 3, "uuid2": 0 } }
     * Ne lève jamais d'exception — les IDs inconnus retournent 0.
     */
    public function filesCounts(Request $request): JsonResponse
    {
        $raw = $request->input('ids', '');
        // Support virgule ET encodage URL (%2C)
        $ids = array_values(array_filter(
            array_map('trim', explode(',', urldecode($raw))),
            fn ($id) => $id !== '' && Str::isUuid($id)
        ));

        if (empty($ids)) {
            return response()->json(['data' => (object) []]);
        }

        // Compte les fichiers (pas les dossiers) groupés par courrier_id
        $counts = CourrierFichier::whereIn('courrier_id', $ids)
            ->where('type', 'fichier')
            ->selectRaw('courrier_id, COUNT(*) as total')
            ->groupBy('courrier_id')
            ->pluck('total', 'courrier_id')
            ->toArray();

        // S'assurer que tous les IDs demandés sont dans la réponse (0 si aucun fichier)
        $result = [];
        foreach ($ids as $id) {
            $result[$id] = (int) ($counts[$id] ?? 0);
        }

        return response()->json(['data' => $result]);
    }

    /**
     * Liste des courriers accessibles pour l'utilisateur connecté (aligné Firebase).
     * GET /api/courriers
     *
     * Paramètres optionnels (query string) pour le chargement filtré côté serveur :
     *   - direction    : ne retourner que les courriers de cette direction
     *   - service      : affiner par service (utilisé conjointement avec direction)
     *   - sous_service : affiner par sous-service
     *   - bureau       : affiner par bureau
     *   - created_by   : filtrer par auteur (admin uniquement)
     *   - role         : hint du rôle frontend (documentatif, non utilisé pour sécurité)
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        // Paramètres de filtre envoyés par le frontend
        $filterDirection  = $request->input('direction');
        $filterService    = $request->input('service');
        $filterSousService = $request->input('sous_service');
        $filterBureau     = $request->input('bureau');

        // Construire une clé de cache unique selon les filtres actifs
        $filterHash = md5(implode('|', array_filter([
            $filterDirection, $filterService, $filterSousService, $filterBureau,
            $request->input('created_by'),
        ])));
        $isAdmin = $user->role === 'SUPER_ADMIN';
        $cacheKey = ($isAdmin ? 'courriers_all' : "courriers_{$user->id}") . ":{$filterHash}";
        $cacheKey .= ':' . Cache::get('courriers_cache_version', '0') . ':' . md5(json_encode([$user->role, $user->direction, $user->service, $user->entite_id]));

        $data = Cache::remember($cacheKey, 30, function () use ($user, $request, $filterDirection, $filterService, $filterSousService, $filterBureau) {
            // SUPER_ADMIN voit toujours tous les courriers (évite liste vide si rôle mal résolu)
            $query = $user->role === 'SUPER_ADMIN'
                ? Courrier::query()->orderBy('date_enregistrement', 'desc')
                : $this->accessService->getAccessibleCourriersQuery($user);

            if ($request->filled('created_by') && $user->canSeeAllCourriers()) {
                $query->where('enregistre_par', $request->input('created_by'));
            }

            // ── Filtres organisationnels supplémentaires ──────────────────────────
            // Ces filtres réduisent le volume de données renvoyé au frontend.
            // Ils ne remplacent pas la logique d'accès (CourrierAccessService) mais
            // s'ajoutent à celle-ci via des AND supplémentaires.
            if ($filterDirection) {
                $query->where('direction', $filterDirection);
            }
            if ($filterService) {
                $query->where('service', $filterService);
            }
            if ($filterSousService) {
                // sous_service peut être stocké dans extra_fields (JSON) ou dans une colonne dédiée
                $query->where(function (Builder $q) use ($filterSousService) {
                    $q->whereJsonContains('extra_fields->sousService', $filterSousService);
                });
            }
            if ($filterBureau) {
                $query->where(function (Builder $q) use ($filterBureau) {
                    $q->whereJsonContains('extra_fields->bureau', $filterBureau);
                });
            }

            $courriers = $query->get();

            if ($courriers->isEmpty()) {
                Log::info('CourrierController::index — 0 courrier(s) pour cet utilisateur', [
                    'user_id'        => $user->id,
                    'role'           => $user->role,
                    'direction'      => $user->direction ?? null,
                    'service'        => $user->service ?? null,
                    'filter_dir'     => $filterDirection,
                    'filter_service' => $filterService,
                ]);
            }

            return $courriers->map(fn (Courrier $c) => $c->toArray())->values()->all();
        });

        // Read receipts are personal and deliberately outside the shared courrier cache.
        $reads = DB::table('courrier_reads')->where('user_id', $user->id)
            ->whereIn('courrier_id', array_column($data, 'id'))->pluck('read_at', 'courrier_id');
        $data = array_map(fn ($row) => array_merge($row, ['isRead' => isset($reads[$row['id']]), 'readAt' => $reads[$row['id']] ?? null]), $data);
        return response()->json(['data' => $data]);
    }

    public function markRead(string $id): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();
        $courrier = Courrier::findOrFail($id);
        $hasNotification = !$user->isSecretaire() && \App\Models\Notification::where('userId', $user->id)->where('relatedId', $id)->exists();
        abort_unless($hasNotification || $this->accessService->canViewCourrier($user, $courrier), 403);
        DB::table('courrier_reads')->insertOrIgnore(['courrier_id' => $id, 'user_id' => $user->id, 'read_at' => now()]);
        return response()->json(['data' => ['id' => $id, 'isRead' => true, 'readAt' => DB::table('courrier_reads')->where('courrier_id', $id)->where('user_id', $user->id)->value('read_at')]]);
    }

    /**
     * Créer un courrier (enregistre_par = utilisateur connecté).
     * POST /api/courriers
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-courrier');
        $user = Auth::user();

        if ($request->has('extraFields') && is_string($request->input('extraFields'))) {
            $decoded = json_decode($request->input('extraFields'), true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $request->merge(['extraFields' => $decoded]);
            }
        }

        $validated = $request->validate([
            'numero' => 'nullable|string|max:64',
            'type' => 'required|in:INTERNE,EXTERNE',
            'sens' => 'nullable|string|in:ENTRANT,SORTANT',
            'dateReception' => 'required|date',
            'dateEnregistrement' => 'nullable|date',
            'expediteur' => 'required|string|max:255',
            'destinataire' => 'required|string|max:255',
            'objet' => 'required|string',
            'priorite' => 'nullable|in:BASSE,NORMALE,HAUTE,URGENTE',
            'statut' => 'nullable|in:ENREGISTRE',
            'enregistrePar' => 'nullable|string|max:255',
            'direction' => 'nullable|string|max:255',
            'service' => 'nullable|string|max:255',
            'fichier' => 'nullable',
            'file' => 'nullable',
            'files' => 'nullable',
            'fichiers' => 'nullable',
            'fileBase64' => 'nullable|string',
            'fileName' => 'nullable|string',
            'extraFields' => 'nullable|array',
            'clientRequestId' => 'nullable|string|max:64',
            'entiteNumerotationId' => 'nullable|uuid',
        ]);

        // Idempotence (C3) : replay d'une requête déjà traitée (retry réseau,
        // double clic, replay du fallback front) → renvoyer le courrier existant.
        $clientRequestId = $validated['clientRequestId'] ?? null;
        if ($clientRequestId) {
            $existing = Courrier::where('client_request_id', $clientRequestId)->first();
            if ($existing) {
                abort_unless($this->accessService->canViewCourrier(Auth::user(), $existing), 403);
                Log::info('CourrierController::store — replay idempotent (clientRequestId déjà traité)', [
                    'client_request_id' => $clientRequestId,
                    'courrier_id' => $existing->id,
                ]);
                return response()->json([
                    'data' => $existing->toArray(),
                    'idempotentReplay' => true,
                ], 200);
            }
        }

        // Sécurité (C4) : normalisation du numéro — seuls les numéros officiels
        // (INT/EXT-AAAA-NNNN) sont acceptés tels quels. Les numéros générés côté
        // client (ex. INT-2026-<ms>-<aléatoire>) sont IGNORÉS : le système génère
        // la séquence officielle. Compatibilité avec les anciens builds du frontend.
        if (isset($validated['numero']) && !$this->isOfficialNumeroFormat($validated['numero'])) {
            Log::warning('CourrierController::store — numéro client non conforme ignoré, le système génère le sien', [
                'numero' => $validated['numero'],
                'user_id' => $user?->id,
            ]);
            unset($validated['numero']);
        }

        if (($restrictionError = $this->validateOrganisationManagerPayload($user, $validated)) !== null) {
            return $restrictionError;
        }

        $dateEnregistrement = isset($validated['dateEnregistrement'])
            ? $validated['dateEnregistrement']
            : now();
        $enregistrePar = $user->id;

        $attempt = 0;
        $maxAttempts = 5;
        while (true) {
            try {
                // Le modèle attribue les deux références dans la même transaction que l’insertion.
                $courrier = DB::transaction(function () use ($validated, $dateEnregistrement, $enregistrePar, $clientRequestId) {
                    $numero = null;
                    return Courrier::create([
                        'numero' => $numero,
                        'client_request_id' => $clientRequestId,
                        'entite_numerotation_id' => $validated['entiteNumerotationId'] ?? null,
                        'type' => $validated['type'],
                        'sens' => $validated['sens'] ?? null,
                        'date_reception' => $validated['dateReception'],
                        'date_enregistrement' => $dateEnregistrement,
                        'expediteur' => $validated['expediteur'],
                        'destinataire' => $validated['destinataire'],
                        'objet' => $validated['objet'],
                        'priorite' => $this->resolvePriorite($validated['priorite'] ?? null, $validated['extraFields'] ?? null),
                        'statut' => 'ENREGISTRE',
                        'enregistre_par' => $enregistrePar,
                        'direction' => $validated['direction'] ?? null,
                        'service' => $validated['service'] ?? null,
                        'fichier' => $validated['fichier'] ?? null,
                        'extra_fields' => $validated['extraFields'] ?? null,
                    ]);
                });
                break;
            } catch (QueryException $e) {
                $code = $e->getCode();
                $msg = $e->getMessage();
                $isDuplicate = $code === '23000' || str_contains($msg, 'Duplicate entry') || str_contains($msg, 'UNIQUE');
                if ($isDuplicate) {
                    // Idempotence (C3) : doublon (souvent sur client_request_id lors d'un
                    // double submit concurrent) → renvoyer le courrier déjà créé.
                    if ($clientRequestId) {
                        $existing = Courrier::where('client_request_id', $clientRequestId)->first();
                        if ($existing) {
                abort_unless($this->accessService->canViewCourrier(Auth::user(), $existing), 403);
                            Log::info('CourrierController::store — doublon résolu par replay idempotent', [
                                'client_request_id' => $clientRequestId,
                                'courrier_id' => $existing->id,
                            ]);
                            return response()->json([
                                'data' => $existing->toArray(),
                                'idempotentReplay' => true,
                            ], 200);
                        }
                    }
                    if ($attempt < $maxAttempts - 1 && ! isset($validated['numero'])) {
                        $attempt++;
                        usleep(rand(50000, 200000));
                        Log::info('CourrierController::store — doublon détecté, nouvel essai', ['attempt' => $attempt]);
                        continue;
                    }
                    Log::warning('CourrierController::store — numéro déjà existant', ['attempt' => $attempt]);
                    return response()->json([
                        'message' => 'Un courrier avec ce numéro existe déjà.',
                        'errors' => ['numero' => ['Ce numéro est déjà utilisé.']],
                    ], 409);
                }
                // Colonne manquante (ex: migration sens non exécutée)
                if (str_contains($msg, 'Unknown column') || str_contains($msg, 'sens')) {
                    Log::error('CourrierController::store — colonne manquante (exécutez: php artisan migrate)', ['exception' => $msg]);
                    return response()->json([
                        'message' => 'Base de données à jour requise. Exécutez: php artisan migrate',
                    ], 500);
                }
                Log::error('CourrierController::store — erreur base de données', ['exception' => $msg]);
                return response()->json(['message' => 'Erreur base de données: ' . $msg], 500);
            } catch (\Illuminate\Validation\ValidationException $e) {
                throw $e;
            } catch (Throwable $e) {
                Log::error('CourrierController::store — exception à l\'insertion', [
                    'message' => $e->getMessage(),
                    'exception' => get_class($e),
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                ]);
                $message = config('app.debug')
                    ? 'Insertion courrier: ' . $e->getMessage()
                    : 'Erreur lors de l\'insertion du courrier. Vérifiez les logs ou exécutez php artisan migrate.';
                return response()->json(['message' => $message], 500);
            }
        }

        // Traiter et enregistrer automatiquement les fichiers joints à la création
        $this->fileService->handleRequestFiles($request, $courrier, (string) $user->id);

        $this->clearCourrierCache($user);

        return response()->json(['data' => $courrier->fresh()->toArray()], 201);
    }

    /**
     * Créer plusieurs courriers en une requête (import massif).
     * POST /api/courriers/bulk
     * Body: { "courriers": [ { type, sens, dateReception, expediteur, destinataire, objet, ... }, ... ] }
     * Maximum 100 courriers par requête.
     */
    public function bulkStore(Request $request): JsonResponse
    {
        $this->authorize('creer-courrier');
        $user = Auth::user();

        $validated = $request->validate([
            'courriers' => 'required|array',
                'courriers.*.numero' => 'nullable|string|max:64',
            'courriers.*.type' => 'required|in:INTERNE,EXTERNE',
            'courriers.*.sens' => 'nullable|string|in:ENTRANT,SORTANT',
            'courriers.*.dateReception' => 'required|date',
            'courriers.*.dateEnregistrement' => 'nullable|date',
            'courriers.*.expediteur' => 'required|string|max:255',
            'courriers.*.destinataire' => 'required|string|max:255',
            'courriers.*.objet' => 'required|string',
            'courriers.*.priorite' => 'nullable|in:BASSE,NORMALE,HAUTE,URGENTE',
            'courriers.*.statut' => 'nullable|in:ENREGISTRE',
            'courriers.*.enregistrePar' => 'nullable|string|max:255',
            'courriers.*.direction' => 'nullable|string|max:255',
            'courriers.*.service' => 'nullable|string|max:255',
            'courriers.*.fichier' => 'nullable|string',
            'courriers.*.extraFields' => 'nullable|array',
            'courriers.*.clientRequestId' => 'nullable|string|max:64',
            'courriers.*.entiteNumerotationId' => 'nullable|uuid',
        ]);

        $items = $validated['courriers'];

        // Sécurité (C4) : normalisation des numéros du lot (mêmes règles que store()).
        foreach ($items as $idx => $item) {
            if (isset($item['numero']) && !$this->isOfficialNumeroFormat($item['numero'])) {
                Log::warning('CourrierController::bulkStore — numéro client non conforme ignoré', [
                    'index' => $idx,
                    'numero' => $item['numero'],
                ]);
                unset($items[$idx]['numero']);
            }
        }
        foreach ($items as $item) {
            if (($restrictionError = $this->validateOrganisationManagerPayload($user, $item)) !== null) {
                return $restrictionError;
            }
        }
        $maxBulk = 100;
        if (count($items) > $maxBulk) {
            return response()->json([
                'message' => "Maximum {$maxBulk} courriers par requête. Envoyez plusieurs requêtes par lots.",
            ], 422);
        }

        $created = [];
        $enregistrePar = $user->id;
        $bulkAttempt = 0;
        $maxBulkAttempts = 3;

        while (true) {
            $created = [];
            try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($items, $enregistrePar, &$created) {
                foreach ($items as $item) {
                    // Idempotence (C3) : item déjà créé (replay du lot) → on le renvoie tel quel.
                    $clientRequestId = $item['clientRequestId'] ?? null;
                    if ($clientRequestId) {
                        $existing = Courrier::where('client_request_id', $clientRequestId)->first();
                        if ($existing) {
                abort_unless($this->accessService->canViewCourrier(Auth::user(), $existing), 403);
                            $created[] = $existing;
                            continue;
                        }
                    }

                    $numero = null;
                    $dateEnregistrement = isset($item['dateEnregistrement'])
                        ? $item['dateEnregistrement']
                        : now();
                    $enregistreParItem = $enregistrePar;

                    $courrier = Courrier::create([
                        'numero' => $numero,
                        'client_request_id' => $clientRequestId,
                        'entite_numerotation_id' => $item['entiteNumerotationId'] ?? null,
                        'type' => $item['type'],
                        'sens' => $item['sens'] ?? null,
                        'date_reception' => $item['dateReception'],
                        'date_enregistrement' => $dateEnregistrement,
                        'expediteur' => $item['expediteur'],
                        'destinataire' => $item['destinataire'],
                        'objet' => $item['objet'],
                        'priorite' => $item['priorite'] ?? 'NORMALE',
                        'statut' => 'ENREGISTRE',
                        'enregistre_par' => $enregistreParItem,
                        'direction' => $item['direction'] ?? null,
                        'service' => $item['service'] ?? null,
                        'fichier' => $item['fichier'] ?? null,
                        'extra_fields' => $item['extraFields'] ?? null,
                    ]);
                    $created[] = $courrier;
                }
            });
            break;
            } catch (QueryException $e) {
            $msg = $e->getMessage();
            // C3 — course concurrente : un appel simultané (double soumission du
            // même lot) a créé un courrier du lot pendant que celui-ci se
            // traitait. On rejoue le lot : les items déjà créés sont détectés
            // par clientRequestId au pré-check et renvoyés sans recréation.
            if (str_contains($msg, 'client_request_id') && $bulkAttempt < $maxBulkAttempts - 1) {
                $bulkAttempt++;
                usleep(rand(50000, 200000));
                Log::info('CourrierController::bulkStore — collision client_request_id, rejeu du lot', ['attempt' => $bulkAttempt]);
                continue;
            }
            if ($e->getCode() === '23000' || str_contains($msg, 'Duplicate entry') || str_contains($msg, 'UNIQUE')) {
                Log::warning('CourrierController::bulkStore — numéro déjà existant', ['message' => $msg]);
                return response()->json([
                    'message' => 'Un courrier avec ce numéro existe déjà dans ce lot. Vérifiez les numéros ou importez par lots plus petits.',
                ], 409);
            }
            Log::error('CourrierController::bulkStore — erreur base de données', ['exception' => $msg]);
            return response()->json(['message' => 'Erreur base de données: ' . $msg], 500);
        } catch (\Illuminate\Validation\ValidationException $e) {
                throw $e;
            } catch (Throwable $e) {
            Log::error('CourrierController::bulkStore — exception', [
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ]);
            return response()->json([
                'message' => config('app.debug') ? $e->getMessage() : 'Erreur lors de l\'import en lot.',
            ], 500);
            }
        }

        $this->clearCourrierCache($user);

        return response()->json([
            'data' => array_map(fn (Courrier $c) => $c->toArray(), $created),
        ], 201);
    }

    /**
     * Afficher un courrier (si l'utilisateur y a accès).
     * GET /api/courriers/{id}
     */
    public function show(string $id): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $courrier = Courrier::findOrFail($id);

        // Accès autorisé si l'utilisateur a une notification liée à ce courrier
        $hasNotification = !$user->isSecretaire() && \App\Models\Notification::where('userId', $user->id)
            ->where('relatedId', $id)
            ->exists();

        if (!$hasNotification && !$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé à ce courrier'], 403);
        }

        return response()->json(['data' => array_merge($courrier->toArray(), ['isRead' => DB::table('courrier_reads')->where('courrier_id', $id)->where('user_id', $user->id)->exists()])]);
    }

    /**
     * Créer ou mettre à jour un courrier (upsert).
     * Si le courrier n'existe pas en MySQL (ex. ID Firestore), il est créé avec cet ID pour permettre l'upload de fichiers.
     * PUT /api/courriers/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $user = Auth::user();
        $courrier = Courrier::find($id);

        if ($courrier) {
            $this->authorize('modifier-courrier');
            if (!$this->accessService->canUpdateCourrier($user, $courrier)) {
                return response()->json(['message' => 'Modification non autorisée'], 403);
            }
            foreach (['numero' => $courrier->numero, 'numeroSysteme' => $courrier->numero, 'numeroOrganisationnel' => $courrier->numero_organisationnel, 'entiteNumerotationId' => $courrier->entite_numerotation_id] as $field => $value) {
                if ($request->exists($field) && $request->input($field) !== $value) throw \Illuminate\Validation\ValidationException::withMessages([$field => 'Référence immuable après attribution.']);
            }
            $request->offsetUnset('enregistrePar');

            $validated = $request->validate([
                'numero' => 'sometimes|string|max:64',
                'type' => 'sometimes|in:INTERNE,EXTERNE',
                'sens' => 'nullable|string|in:ENTRANT,SORTANT',
                'dateReception' => 'sometimes|date',
                'dateEnregistrement' => 'sometimes|date',
                'expediteur' => 'sometimes|string|max:255',
                'destinataire' => 'sometimes|string|max:255',
                'objet' => 'sometimes|string',
                'priorite' => 'sometimes|in:BASSE,NORMALE,HAUTE,URGENTE',
                'statut' => 'sometimes|string|max:32',
                'enregistrePar' => 'sometimes|string|max:255',
                'direction' => 'nullable|string|max:255',
                'service' => 'nullable|string|max:255',
                'fichier' => 'nullable|string',
                'extraFields' => 'nullable|array',
            ]);

            // Sécurité (C4) : ne jamais laisser modifier le numéro vers un format non
            // officiel (ex. numéro généré côté client). Le numéro d'origine est conservé.
            if (isset($validated['numero']) && $validated['numero'] !== $courrier->numero
                && !$this->isOfficialNumeroFormat($validated['numero'])) {
                Log::warning('CourrierController::update — modification de numéro non conforme ignorée', [
                    'courrier_id' => $id,
                    'numero_envoye' => $validated['numero'],
                ]);
                unset($validated['numero']);
            }

            $candidate = array_merge([
                'type' => $courrier->type,
                'sens' => $courrier->sens,
                'destinataire' => $courrier->destinataire,
                'extraFields' => $courrier->extra_fields,
            ], $validated);
            if (($restrictionError = $this->validateOrganisationManagerPayload($user, $candidate)) !== null) {
                return $restrictionError;
            }
            try {
                DB::transaction(function()use($courrier,$validated,$user){$locked=Courrier::whereKey($courrier->id)->lockForUpdate()->firstOrFail();if(isset($validated['statut']))app(\App\Services\WorkflowExecutionService::class)->assertCourrierStatus($locked,$validated['statut'],$user);$locked->update($this->mapToSnakeCase($validated));if(isset($validated['priorite'])&&!in_array($locked->statut,['TRAITE','ARCHIVE'],true)){ $steps=\App\Models\WorkflowEtape::where('courrier_id',$locked->id)->lockForUpdate()->get();app(\App\Services\WorkflowExecutionService::class)->refreshTiming($locked,$steps);}});
            } catch (QueryException $e) {
                $msg = $e->getMessage();
                if (str_contains($msg, 'Duplicate entry') || str_contains($msg, 'UNIQUE')) {
                    return response()->json([
                        'message' => 'Un courrier avec ce numéro existe déjà.',
                        'errors' => ['numero' => ['Ce numéro est déjà utilisé.']],
                    ], 409);
                }
                Log::error('CourrierController::update — erreur base de données', ['exception' => $msg]);
                return response()->json(['message' => 'Erreur base de données: ' . $msg], 500);
            } catch (\Illuminate\Validation\ValidationException $e) {
                throw $e;
            } catch (Throwable $e) {
                Log::error('CourrierController::update — exception', ['message' => $e->getMessage()]);
                $message = config('app.debug') ? $e->getMessage() : 'Erreur lors de la mise à jour du courrier.';
                return response()->json(['message' => $message], 500);
            }
            $this->fileService->handleRequestFiles($request, $courrier, (string) $user->id);
            $this->clearCourrierCache($user);
            return response()->json(['data' => $courrier->fresh()->toArray()]);
        }

        // Courrier absent en MySQL (ex. créé dans Firestore) : créer avec cet ID pour permettre l'upload de fichiers
        // Pas de validate() strict : on prend les entrées et on applique des défauts pour accepter toute donnée partielle
        $this->authorize('creer-courrier');
        $input = $request->only([
            'entiteNumerotationId', 'numero', 'type', 'sens', 'dateReception', 'dateEnregistrement', 'expediteur', 'destinataire', 'objet',
            'priorite', 'statut', 'enregistrePar', 'direction', 'service', 'fichier', 'extraFields',
        ]);
        $type = in_array($input['type'] ?? null, ['INTERNE', 'EXTERNE']) ? ($input['type'] ?? 'EXTERNE') : 'EXTERNE';
        $sens = in_array($input['sens'] ?? null, ['ENTRANT', 'SORTANT']) ? ($input['sens'] ?? null) : null;
        $numero = isset($input['numero']) && trim((string) $input['numero']) !== '' ? trim((string) $input['numero']) : null;
        if ($numero !== null && !$this->isOfficialNumeroFormat($numero)) {
            Log::warning('CourrierController::update (create) — numéro client non conforme ignoré', ['numero' => $numero]);
            $numero = null;
        }
        $dateReception = isset($input['dateReception']) && $input['dateReception']
            ? (is_string($input['dateReception']) ? \Carbon\Carbon::parse($input['dateReception']) : $input['dateReception'])
            : now();
        $dateEnregistrement = isset($input['dateEnregistrement']) && $input['dateEnregistrement']
            ? (is_string($input['dateEnregistrement']) ? \Carbon\Carbon::parse($input['dateEnregistrement']) : $input['dateEnregistrement'])
            : now();
        $enregistrePar = $user->id;
        $expediteur = isset($input['expediteur']) && trim((string) $input['expediteur']) !== '' ? trim((string) $input['expediteur']) : 'Non renseigné';
        $destinataire = isset($input['destinataire']) && trim((string) $input['destinataire']) !== '' ? trim((string) $input['destinataire']) : 'Non renseigné';
        $objet = isset($input['objet']) && trim((string) $input['objet']) !== '' ? trim((string) $input['objet']) : 'Sans objet';
        $numero = null;

        $priorite = in_array($input['priorite'] ?? null, ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']) ? ($input['priorite'] ?? 'NORMALE') : 'NORMALE';
        $statut = 'ENREGISTRE';
        $direction = isset($input['direction']) && trim((string) $input['direction']) !== '' ? trim((string) $input['direction']) : null;
        $service = isset($input['service']) && trim((string) $input['service']) !== '' ? trim((string) $input['service']) : null;
        $fichier = isset($input['fichier']) && trim((string) $input['fichier']) !== '' ? trim((string) $input['fichier']) : null;
        $extraFields = isset($input['extraFields']) && is_array($input['extraFields']) ? $input['extraFields'] : null;
        if (($restrictionError = $this->validateOrganisationManagerPayload($user, [
            'type' => $type,
            'sens' => $sens,
            'destinataire' => $destinataire,
            'extraFields' => $extraFields,
        ])) !== null) {
            return $restrictionError;
        }

        try {
            $courrier = Courrier::create([
                'id' => $id,
                'entite_numerotation_id' => $input['entiteNumerotationId'] ?? null,
                'numero' => $numero,
                'type' => $type,
                'sens' => $sens,
                'date_reception' => $dateReception,
                'date_enregistrement' => $dateEnregistrement,
                'expediteur' => $expediteur,
                'destinataire' => $destinataire,
                'objet' => $objet,
                'priorite' => $priorite,
                'statut' => $statut,
                'enregistre_par' => $enregistrePar,
                'direction' => $direction,
                'service' => $service,
                'fichier' => $fichier,
                'extra_fields' => $extraFields,
            ]);
        } catch (QueryException $e) {
            $msg = $e->getMessage();
            if ($e->getCode() === '23000' || str_contains($msg, 'Duplicate entry') || str_contains($msg, 'UNIQUE')) {
                Log::warning('CourrierController::update (create) — numéro déjà existant', ['numero' => $numero]);
                return response()->json([
                    'message' => 'Un courrier avec ce numéro existe déjà.',
                    'errors' => ['numero' => ['Ce numéro est déjà utilisé.']],
                ], 409);
            }
            if (str_contains($msg, 'Unknown column') || str_contains($msg, 'sens')) {
                Log::error('CourrierController::update (create) — colonne manquante', ['exception' => $msg]);
                return response()->json([
                    'message' => 'Base de données à jour requise. Exécutez: php artisan migrate',
                ], 500);
            }
            Log::error('CourrierController::update (create) — erreur base de données', ['exception' => $msg]);
            return response()->json(['message' => 'Erreur base de données: ' . $msg], 500);
        } catch (\Illuminate\Validation\ValidationException $e) {
                throw $e;
            } catch (Throwable $e) {
            Log::error('CourrierController::update (create) — exception à l\'insertion', [
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ]);
            $message = config('app.debug')
                ? 'Insertion courrier: ' . $e->getMessage()
                : 'Erreur lors de l\'insertion du courrier. Vérifiez les logs ou php artisan migrate.';
            return response()->json(['message' => $message], 500);
        }

        $this->fileService->handleRequestFiles($request, $courrier, (string) $user->id);
        $this->clearCourrierCache($user);
        return response()->json(['data' => $courrier->fresh()->toArray()], 201);
    }

    /**
     * PATCH /api/courriers/{id}/statut
     * Met à jour uniquement le statut d'un courrier.
     * Accessible à tout utilisateur authentifié pouvant voir le courrier.
     */
    public function updateStatut(Request $request, string $id): JsonResponse
    {
        $user = Auth::user();
        $courrier = Courrier::find($id);

        Log::info('[updateStatut] PATCH reçu', [
            'courrier_id' => $id,
            'body' => $request->all(),
            'user_id' => $user?->id,
        ]);

        if (!$courrier) {
            Log::warning('[updateStatut] Courrier non trouvé', ['id' => $id]);
            return response()->json(['message' => 'Courrier non trouvé'], 404);
        }

        // Sécurité (C2) : même garde-fou que update() — l'utilisateur doit disposer
        // de la permission et du droit d'accès sur CE courrier.
        $this->authorize('modifier-courrier');
        if (!$this->accessService->canUpdateCourrier($user, $courrier)) {
            Log::warning('[updateStatut] Modification refusée (accès)', [
                'courrier_id' => $id,
                'user_id' => $user?->id,
                'statut_avant' => $courrier->statut,
            ]);
            return response()->json(['message' => 'Modification du statut non autorisée pour ce courrier.'], 403);
        }

        Log::info('[updateStatut] Courrier trouvé', ['statut_avant' => $courrier->statut]);

        $validated = $request->validate([
            'statut' => 'required|string|in:ENREGISTRE,EN_ATTENTE_DG,ORIENTE_DG,ORIENTE_DIRECTEUR,EN_TRAITEMENT,ASSIGNE,TRAITE,ARCHIVE',
        ]);

        DB::transaction(function()use($courrier,$validated,$user){$locked=Courrier::whereKey($courrier->id)->lockForUpdate()->firstOrFail();app(\App\Services\WorkflowExecutionService::class)->assertCourrierStatus($locked,$validated['statut'],$user);$locked->update(['statut'=>$validated['statut']]);});
        $this->clearCourrierCache($user);

        Log::info('[updateStatut] Statut mis à jour', ['statut_apres' => $courrier->fresh()->statut]);

        return response()->json(['data' => $courrier->fresh()->toArray()]);
    }

    /**
     * Supprimer un courrier (admin ou créateur uniquement, aligné Firestore).
     * DELETE /api/courriers/{id}
     */
    public function destroy(string $id): JsonResponse
    {
        $this->authorize('supprimer-courrier');
        $user = Auth::user();

        $courrier = Courrier::findOrFail($id);

        if (!$this->accessService->canDeleteCourrier($user, $courrier)) {
            return response()->json(['message' => 'Suppression non autorisée'], 403);
        }

        $courrier->delete();
        $this->clearCourrierCache($user);
        return response()->json(null, 204);
    }

    /**
     * Génère un numéro unique pour un courrier (INT-AAAA-NNNN ou EXT-AAAA-NNNN).
     * Utilise un verrou de ligne (SELECT FOR UPDATE) dans une transaction
     * pour éviter les doublons lors de créations parallèles.
     */
    private function clearCourrierCache($user): void
    {
        Cache::forever('courriers_cache_version', (string) \Illuminate\Support\Str::uuid());
        // Invalider les clés sans filtre (hash de chaîne vide)
        $emptyHash = md5('');
        Cache::forget("courriers_all:{$emptyHash}");
        Cache::forget('courriers_all');
        if ($user?->id) {
            Cache::forget("courriers_{$user->id}:{$emptyHash}");
            Cache::forget("courriers_{$user->id}");
        }
        // Les clés avec filtres (hash non vide) expirent naturellement après 30s (TTL Cache::remember).
        // Pour une invalidation complète immédiate avec Redis, utiliser Cache::tags(['courriers'])->flush().
    }

    /**
     * Sécurité (C4) : le seul format de numéro accepté comme valeur explicite est la
     * séquence officielle INT/EXT-AAAA-NNNN (attribuée par le registre serveur). Les valeurs
     * vides/null sont acceptées (le système génère). Tout le reste — notamment les
     * numéros générés côté client (INT-2026-<ms>-<aléatoire>) — est rejeté.
     */
    private function isOfficialNumeroFormat(?string $numero): bool
    {
        if ($numero === null) {
            return true;
        }
        $numero = trim($numero);
        if ($numero === '') {
            return true;
        }
        return (bool) preg_match('/^(INT|EXT)-\d{4}-\d{4,}$/', $numero);
    }

    private function validateOrganisationManagerPayload(User $user, array $payload): ?JsonResponse
    {
        if (!in_array($user->role, ['DIRECTEUR', 'CHEF_DIVISION', 'CHEF_BUREAU'], true)) return null;
        if (($payload['type'] ?? null) !== 'INTERNE' || ($payload['sens'] ?? null) !== 'SORTANT') {
            return response()->json(['message' => 'Les responsables d’unités peuvent uniquement adresser des courriers internes sortants.'], 403);
        }
        $sender = $user->entite_id
            ? EntiteOrganisationnelle::where('id', $user->entite_id)->where('actif', true)->first()
            : EntiteOrganisationnelle::where('type', 'direction')->where('nom', $user->direction)->where('actif', true)->first();
        $cascade = $payload['extraFields']['entiteDestinataireJson'] ?? null;
        if (is_string($cascade)) $cascade = json_decode($cascade, true);
        $recipientId = is_array($cascade) ? end($cascade) : null;
        $recipient = $recipientId
            ? EntiteOrganisationnelle::where('id', $recipientId)->where('actif', true)->first()
            : EntiteOrganisationnelle::where('nom', $payload['destinataire'] ?? '')->where('actif', true)->first();
        if (!$sender || !$recipient) return response()->json(['message' => 'Une entité organisationnelle valide est requise.'], 422);
        if ($recipient->type === 'direction_generale') return null;
        $ids = [];
        $pending = [$sender->id];
        while ($pending) {
            $pending = EntiteOrganisationnelle::whereIn('parent_id', $pending)->where('actif', true)->pluck('id')->all();
            $ids = array_merge($ids, $pending);
        }
        return in_array($recipient->id, $ids, true)
            ? null
            : response()->json(['message' => 'Le destinataire doit être une unité rattachée à votre organisation ou la Direction Générale.'], 403);
    }

    private function mapToSnakeCase(array $input): array
    {
        $map = [
            'dateReception' => 'date_reception',
            'dateEnregistrement' => 'date_enregistrement',
            'enregistrePar' => 'enregistre_par',
            'extraFields' => 'extra_fields',
            'sens' => 'sens',
        ];
        $out = [];
        foreach ($input as $key => $value) {
            $dbKey = $map[$key] ?? Str::snake($key);
            $out[$dbKey] = $value;
        }
        return $out;
    }

    /**
     * Résout la priorité d'un courrier à partir de la priorité fournie ou du niveau dans extraFields.
     * Logique : 
     * - Si priorité fournie (BASSE, NORMALE, HAUTE, URGENTE), l'utiliser
     * - Sinon, calculer à partir du niveau (extraFields['niveau']) :
     *   - niveau <= 0 → BASSE
     *   - niveau == 1 → NORMALE  
     *   - niveau == 2 → HAUTE
     *   - niveau >= 3 → URGENTE
     * - Par défaut : NORMALE
     */
    private function resolvePriorite(?string $priorite, ?array $extraFields): string
    {
        // Si une priorité valide est fournie, l'utiliser
        if (in_array($priorite, ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'])) {
            return $priorite;
        }

        // Sinon, calculer à partir du niveau dans extraFields
        $niveau = isset($extraFields['niveau']) ? intval($extraFields['niveau']) : 0;

        if ($niveau <= 0) {
            return 'BASSE';
        } elseif ($niveau === 1) {
            return 'NORMALE';
        } elseif ($niveau === 2) {
            return 'HAUTE';
        } else {
            // niveau >= 3
            return 'URGENTE';
        }
    }
}
