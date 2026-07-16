<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courrier;
use App\Services\CourrierAccessService;
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
        private CourrierAccessService $accessService
    ) {}

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
        $isAdmin = $user->role === 'SUPER_ADMIN' || $user->isDirecteurGeneral() || $user->isSecretaire();
        $cacheKey = ($isAdmin ? 'courriers_all' : "courriers_{$user->id}") . ":{$filterHash}";

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
                    $q->where('sous_service', $filterSousService)
                      ->orWhereJsonContains('extra_fields->sousService', $filterSousService);
                });
            }
            if ($filterBureau) {
                $query->where(function (Builder $q) use ($filterBureau) {
                    $q->where('bureau', $filterBureau)
                      ->orWhereJsonContains('extra_fields->bureau', $filterBureau);
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

        return response()->json(['data' => $data]);
    }

    /**
     * Créer un courrier (enregistre_par = utilisateur connecté).
     * POST /api/courriers
     */
    public function store(Request $request): JsonResponse
    {
        $user = Auth::user();

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
            'statut' => 'nullable|string|max:32',
            'enregistrePar' => 'nullable|string|max:255',
            'direction' => 'nullable|string|max:255',
            'service' => 'nullable|string|max:255',
            'fichier' => 'nullable|string',
            'extraFields' => 'nullable|array',
        ]);

        $dateEnregistrement = isset($validated['dateEnregistrement'])
            ? $validated['dateEnregistrement']
            : now();
        $enregistrePar = $validated['enregistrePar'] ?? $user->id;

        $attempt = 0;
        $maxAttempts = 5;
        while (true) {
            try {
                // Tout dans UNE SEULE transaction : génération du numéro + insertion
                // Le lockForUpdate est maintenu jusqu'à l'insert, empêchant les doublons
                $courrier = DB::transaction(function () use ($validated, $dateEnregistrement, $enregistrePar) {
                    $numero = $validated['numero'] ?? $this->generateNumero($validated['type']);
                    return Courrier::create([
                        'numero' => $numero,
                        'type' => $validated['type'],
                        'sens' => $validated['sens'] ?? null,
                        'date_reception' => $validated['dateReception'],
                        'date_enregistrement' => $dateEnregistrement,
                        'expediteur' => $validated['expediteur'],
                        'destinataire' => $validated['destinataire'],
                        'objet' => $validated['objet'],
                        'priorite' => $this->resolvePriorite($validated['priorite'] ?? null, $validated['extraFields'] ?? null),
                        'statut' => $validated['statut'] ?? 'ENREGISTRE',
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
                if ($isDuplicate && $attempt < $maxAttempts - 1 && ! isset($validated['numero'])) {
                    $attempt++;
                    usleep(rand(50000, 200000));
                    Log::info('CourrierController::store — doublon détecté, nouvel essai', ['attempt' => $attempt]);
                    continue;
                }
                if ($isDuplicate) {
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

        $this->clearCourrierCache($user);

        return response()->json(['data' => $courrier->toArray()], 201);
    }

    /**
     * Créer plusieurs courriers en une requête (import massif).
     * POST /api/courriers/bulk
     * Body: { "courriers": [ { type, sens, dateReception, expediteur, destinataire, objet, ... }, ... ] }
     * Maximum 100 courriers par requête.
     */
    public function bulkStore(Request $request): JsonResponse
    {
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
            'courriers.*.statut' => 'nullable|string|max:32',
            'courriers.*.enregistrePar' => 'nullable|string|max:255',
            'courriers.*.direction' => 'nullable|string|max:255',
            'courriers.*.service' => 'nullable|string|max:255',
            'courriers.*.fichier' => 'nullable|string',
            'courriers.*.extraFields' => 'nullable|array',
        ]);

        $items = $validated['courriers'];
        $maxBulk = 100;
        if (count($items) > $maxBulk) {
            return response()->json([
                'message' => "Maximum {$maxBulk} courriers par requête. Envoyez plusieurs requêtes par lots.",
            ], 422);
        }

        $created = [];
        $enregistrePar = $user->id;

        try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($items, $enregistrePar, &$created) {
                foreach ($items as $item) {
                    $numero = $item['numero'] ?? $this->generateNumero($item['type']);
                    $dateEnregistrement = isset($item['dateEnregistrement'])
                        ? $item['dateEnregistrement']
                        : now();
                    $enregistreParItem = $item['enregistrePar'] ?? $enregistrePar;

                    $courrier = Courrier::create([
                        'numero' => $numero,
                        'type' => $item['type'],
                        'sens' => $item['sens'] ?? null,
                        'date_reception' => $item['dateReception'],
                        'date_enregistrement' => $dateEnregistrement,
                        'expediteur' => $item['expediteur'],
                        'destinataire' => $item['destinataire'],
                        'objet' => $item['objet'],
                        'priorite' => $item['priorite'] ?? 'NORMALE',
                        'statut' => $item['statut'] ?? 'ENREGISTRE',
                        'enregistre_par' => $enregistreParItem,
                        'direction' => $item['direction'] ?? null,
                        'service' => $item['service'] ?? null,
                        'fichier' => $item['fichier'] ?? null,
                        'extra_fields' => $item['extraFields'] ?? null,
                    ]);
                    $created[] = $courrier;
                }
            });
        } catch (QueryException $e) {
            $msg = $e->getMessage();
            if ($e->getCode() === '23000' || str_contains($msg, 'Duplicate entry') || str_contains($msg, 'UNIQUE')) {
                Log::warning('CourrierController::bulkStore — numéro déjà existant', ['message' => $msg]);
                return response()->json([
                    'message' => 'Un courrier avec ce numéro existe déjà dans ce lot. Vérifiez les numéros ou importez par lots plus petits.',
                ], 409);
            }
            Log::error('CourrierController::bulkStore — erreur base de données', ['exception' => $msg]);
            return response()->json(['message' => 'Erreur base de données: ' . $msg], 500);
        } catch (Throwable $e) {
            Log::error('CourrierController::bulkStore — exception', [
                'message' => $e->getMessage(),
                'exception' => get_class($e),
            ]);
            return response()->json([
                'message' => config('app.debug') ? $e->getMessage() : 'Erreur lors de l\'import en lot.',
            ], 500);
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
        $hasNotification = \App\Models\Notification::where('userId', $user->id)
            ->where('relatedId', $id)
            ->exists();

        if (!$hasNotification && !$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé à ce courrier'], 403);
        }

        return response()->json(['data' => $courrier->toArray()]);
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
            try {
                $courrier->update($this->mapToSnakeCase($validated));
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
            } catch (Throwable $e) {
                Log::error('CourrierController::update — exception', ['message' => $e->getMessage()]);
                $message = config('app.debug') ? $e->getMessage() : 'Erreur lors de la mise à jour du courrier.';
                return response()->json(['message' => $message], 500);
            }
            $this->clearCourrierCache($user);
            return response()->json(['data' => $courrier->fresh()->toArray()]);
        }

        // Courrier absent en MySQL (ex. créé dans Firestore) : créer avec cet ID pour permettre l'upload de fichiers
        // Pas de validate() strict : on prend les entrées et on applique des défauts pour accepter toute donnée partielle
        $this->authorize('creer-courrier');
        $input = $request->only([
            'numero', 'type', 'sens', 'dateReception', 'dateEnregistrement', 'expediteur', 'destinataire', 'objet',
            'priorite', 'statut', 'enregistrePar', 'direction', 'service', 'fichier', 'extraFields',
        ]);
        $type = in_array($input['type'] ?? null, ['INTERNE', 'EXTERNE']) ? ($input['type'] ?? 'EXTERNE') : 'EXTERNE';
        $sens = in_array($input['sens'] ?? null, ['ENTRANT', 'SORTANT']) ? ($input['sens'] ?? null) : null;
        $numero = isset($input['numero']) && trim((string) $input['numero']) !== '' ? trim((string) $input['numero']) : null;
        $dateReception = isset($input['dateReception']) && $input['dateReception']
            ? (is_string($input['dateReception']) ? \Carbon\Carbon::parse($input['dateReception']) : $input['dateReception'])
            : now();
        $dateEnregistrement = isset($input['dateEnregistrement']) && $input['dateEnregistrement']
            ? (is_string($input['dateEnregistrement']) ? \Carbon\Carbon::parse($input['dateEnregistrement']) : $input['dateEnregistrement'])
            : now();
        $enregistrePar = isset($input['enregistrePar']) && trim((string) $input['enregistrePar']) !== '' ? trim((string) $input['enregistrePar']) : $user->id;
        $expediteur = isset($input['expediteur']) && trim((string) $input['expediteur']) !== '' ? trim((string) $input['expediteur']) : 'Non renseigné';
        $destinataire = isset($input['destinataire']) && trim((string) $input['destinataire']) !== '' ? trim((string) $input['destinataire']) : 'Non renseigné';
        $objet = isset($input['objet']) && trim((string) $input['objet']) !== '' ? trim((string) $input['objet']) : 'Sans objet';
        $numero = $numero ?? $this->generateNumero($type);

        $priorite = in_array($input['priorite'] ?? null, ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']) ? ($input['priorite'] ?? 'NORMALE') : 'NORMALE';
        $statut = isset($input['statut']) && trim((string) $input['statut']) !== '' ? trim((string) $input['statut']) : 'ENREGISTRE';
        $direction = isset($input['direction']) && trim((string) $input['direction']) !== '' ? trim((string) $input['direction']) : null;
        $service = isset($input['service']) && trim((string) $input['service']) !== '' ? trim((string) $input['service']) : null;
        $fichier = isset($input['fichier']) && trim((string) $input['fichier']) !== '' ? trim((string) $input['fichier']) : null;
        $extraFields = isset($input['extraFields']) && is_array($input['extraFields']) ? $input['extraFields'] : null;

        try {
            $courrier = Courrier::create([
                'id' => $id,
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

        $this->clearCourrierCache($user);
        return response()->json(['data' => $courrier->toArray()], 201);
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

        Log::info('[updateStatut] Courrier trouvé', ['statut_avant' => $courrier->statut]);

        $validated = $request->validate([
            'statut' => 'required|string|in:ENREGISTRE,EN_ATTENTE_DG,ORIENTE_DG,ORIENTE_DIRECTEUR,EN_TRAITEMENT,ASSIGNE,TRAITE,ARCHIVE',
        ]);

        $courrier->update(['statut' => $validated['statut']]);
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

    private function generateNumero(string $type): string
    {
        $annee = now()->year;
        $prefix = $type === 'INTERNE' ? 'INT' : 'EXT';
        $pattern = $prefix . '-' . $annee . '-%';

        // Verrouiller la dernière ligne du type pour empêcher les lectures concurrentes
        $last = Courrier::where('type', $type)
            ->where('numero', 'like', $pattern)
            ->orderBy('id', 'desc')
            ->lockForUpdate()
            ->value('numero');

        $sequence = 1;
        if ($last && preg_match('/-(\d+)$/', $last, $m)) {
            $sequence = (int) $m[1] + 1;
        }
        return sprintf('%s-%d-%04d', $prefix, $annee, $sequence);
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
