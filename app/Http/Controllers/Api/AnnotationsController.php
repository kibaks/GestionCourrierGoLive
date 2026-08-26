<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Annotation;
use App\Models\Courrier;
use App\Models\Notification;
use App\Models\User;
use App\Models\WorkflowEtape;
use App\Services\CourrierAccessService;
use App\Services\NotificationDeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AnnotationsController extends Controller
{
    public function __construct(
        private CourrierAccessService $accessService
    ) {}

    /**
     * Liste des annotations d'un courrier.
     * GET /api/courriers/{courrierId}/annotations
     */
    public function index(string $courrierId): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $courrier = Courrier::findOrFail($courrierId);
        if (!$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }

        $items = Annotation::where('courrier_id', $courrierId)->orderBy('created_at', 'desc')->get();
        return response()->json(['data' => $items->map(fn (Annotation $a) => $a->toArray())]);
    }

    /**
     * P3a — Boîte « Courriers à annoter » du DG.
     * Courriers accessibles (DG : orientés + enregistrés ; SUPER_ADMIN : tous) qui ont :
     *  (a) des étapes non terminées assignées à l'utilisateur, ou
     *  (b) des annotations OUVERTES déposées par d'autres acteurs.
     * GET /api/annotations/dg-inbox  (DG / SUPER_ADMIN uniquement)
     */
    public function dgInbox(): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();
        if (!in_array($user->role, ['DIRECTEUR_GENERAL', 'SUPER_ADMIN'], true)) {
            return response()->json(['message' => 'Réservé au Directeur Général'], 403);
        }

        $courriers = $this->accessService->getAccessibleCourriersQuery($user)
            ->get(['id', 'numero', 'objet', 'type', 'sens', 'priorite', 'statut', 'date_enregistrement']);
        if ($courriers->isEmpty()) {
            return response()->json(['data' => []]);
        }

        $ids = $courriers->pluck('id')->all();

        $steps = WorkflowEtape::whereIn('courrier_id', $ids)
            ->whereNotIn('statut', ['TERMINE', 'REJETE'])
            ->get(['courrier_id', 'assigne_a', 'created_at']);

        $openAnn = Annotation::whereIn('courrier_id', $ids)
            ->where('statut', 'OUVERT')
            ->whereNull('parent_id')
            ->get(['courrier_id', 'created_by', 'decision', 'created_at']);

        $items = [];
        foreach ($courriers as $c) {
            $mySteps = $steps->where('courrier_id', $c->id)
                ->where('assigne_a', (string) $user->id)
                ->values();
            $othersOpen = $openAnn->where('courrier_id', $c->id)
                ->reject(fn (Annotation $a) => (string) $a->created_by === (string) $user->id)
                ->values();
            if ($mySteps->isEmpty() && $othersOpen->isEmpty()) {
                continue;
            }
            $last = collect()
                ->merge($mySteps->pluck('created_at'))
                ->merge($othersOpen->pluck('created_at'))
                ->filter()
                ->max();
            $items[] = [
                'id' => $c->id,
                'numero' => $c->numero,
                'objet' => $c->objet,
                'type' => $c->type,
                'sens' => $c->sens,
                'priorite' => $c->priorite,
                'statut' => $c->statut,
                'date_enregistrement' => $c->date_enregistrement,
                'nb_etapes_a_traiter' => $mySteps->count(),
                'nb_avis_a_traiter' => $othersOpen->count(),
                'derniere_activite' => $last,
            ];
        }
        usort($items, fn ($a, $b) => strcmp((string) ($b['derniere_activite'] ?? ''), (string) ($a['derniere_activite'] ?? '')));

        return response()->json(['data' => $items]);
    }

    /**
     * IDs de courriers ayant au moins une annotation écrite par un auteur ou une direction donnée.
     * GET /api/annotations/courrier-ids?auteur={userId}
     * GET /api/annotations/courrier-ids?direction={direction}
     */
    public function courrierIds(Request $request): JsonResponse
    {
        $this->authorize('voir-courriers');
        $auteur    = $request->query('auteur');
        $direction = $request->query('direction');

        $query = Annotation::query();

        if ($auteur) {
            $query->where('created_by', (string) $auteur);
        } elseif ($direction) {
            $entiteIds = $this->getDescendantEntityIds($direction);

            $userIds = User::where(function ($q) use ($direction, $entiteIds) {
                $q->where('direction', $direction);
                if (!empty($entiteIds)) {
                    $q->orWhereIn('entite_id', $entiteIds);
                }
            })->pluck('id')->map(fn ($id) => (string) $id)->toArray();

            if (empty($userIds)) {
                return response()->json(['data' => []]);
            }
            $query->whereIn('created_by', $userIds);
        }

        $ids = $query->distinct()->pluck('courrier_id')->map(fn ($id) => (string) $id)->values();
        return response()->json(['data' => $ids]);
    }

    /**
     * Retourne récursivement tous les IDs d'entités enfants d'une direction donnée.
     */
    private function getDescendantEntityIds(string $directionName): array
    {
        $root = \App\Models\EntiteOrganisationnelle::whereRaw('LOWER(nom) = ?', [mb_strtolower($directionName)])
            ->where('type', 'direction')
            ->first();

        if (!$root) {
            return [];
        }

        $ids   = [];
        $queue = [$root->id];

        while (!empty($queue)) {
            $parentId = array_shift($queue);
            $children = \App\Models\EntiteOrganisationnelle::where('parent_id', $parentId)
                ->pluck('id')
                ->toArray();
            foreach ($children as $childId) {
                $ids[]   = $childId;
                $queue[] = $childId;
            }
        }

        return $ids;
    }

    /**
     * Créer une annotation (libre ou ancrée sur un document).
     * POST /api/annotations
     *
     * Champs P1 (annotations sur le document) :
     *  - fichierId / fichierNom : fichier du courrier annoté
     *  - page (1-based) + position {x,y,w,h} normalisés 0..1000
     *  - kind (COMMENTAIRE|TRACE|TEXTE|TAMPOUR|SIGNATURE), parentId, statut
     *  - decision (FAVORABLE|A_REVOIR|INFO) optionnelle
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('modifier-courrier');
        $user = Auth::user();

        $validated = $request->validate([
            'courrierId' => 'required|uuid|exists:courriers,id',
            'contenu' => 'required|string',
            'type' => 'required|in:MINUTE,NOTE,COMMENTAIRE',
            'workflowEtapeId' => 'nullable|uuid',
            'fichiers' => 'nullable|array',
            'fichiers.*' => 'string',
            // P1 — annotations sur le document
            'fichierId' => 'nullable|string|max:255',
            'fichierNom' => 'nullable|string|max:255',
            'page' => 'nullable|integer|min:1|max:1024',
            'position' => 'nullable|array',
            'position.x' => 'required_with:position|numeric|between:0,1000',
            'position.y' => 'required_with:position|numeric|between:0,1000',
            'position.w' => 'required_with:position|numeric|between:0,1000',
            'position.h' => 'required_with:position|numeric|between:0,1000',
            // P2 — champs additionnels par kind (TRACE / TEXTE / TAMPOUR / SIGNATURE)
            'position.points' => 'nullable|array|max:5000',
            'position.points.*' => 'array|size:2',
            'position.color' => 'nullable|string|max:20',
            'position.label' => 'nullable|in:FAVORABLE,A_REVOIR',
            'position.rotation' => 'nullable|numeric|between:-90,90',
            'position.text' => 'nullable|string|max:1000',
            'position.image' => 'nullable|string|max:500000',
            'kind' => 'nullable|in:COMMENTAIRE,TRACE,TEXTE,TAMPOUR,SIGNATURE',
            'parentId' => 'nullable|uuid',
            'statut' => 'nullable|in:OUVERT,RESOLU',
            'decision' => 'nullable|in:FAVORABLE,A_REVOIR,INFO',
        ]);

        $courrier = Courrier::findOrFail($validated['courrierId']);
        if (!$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }

        $annotation = Annotation::create([
            'courrier_id' => $validated['courrierId'],
            'created_by' => $user->id,
            'contenu' => $validated['contenu'],
            'type' => $validated['type'],
            'workflow_etape_id' => $validated['workflowEtapeId'] ?? null,
            'fichiers' => $validated['fichiers'] ?? null,
            // P1 — annotations sur le document
            'fichier_id' => $validated['fichierId'] ?? null,
            'fichier_nom' => $validated['fichierNom'] ?? null,
            'page' => $validated['page'] ?? null,
            'position' => $validated['position'] ?? null,
            'kind' => $validated['kind'] ?? 'COMMENTAIRE',
            'parent_id' => $validated['parentId'] ?? null,
            'statut' => $validated['statut'] ?? 'OUVERT',
            'decision' => $validated['decision'] ?? null,
        ]);

        // Notification : une annotation ANCRÉE sur un document posée par le DG / un admin
        // alerte l'enregistreur du courrier + les assignés des étapes ouvertes.
        if ($annotation->position && in_array($user->role, ['DIRECTEUR_GENERAL', 'SUPER_ADMIN'], true)) {
            $this->notifyDocumentAnnotation($courrier, $annotation, $user);
        }

        // P4 (P6 : toujours créé, même si le DG est l'enregistreur) — annotation DG /
        // SUPER_ADMIN posée au niveau du document ou du courrier (pas sur une étape) :
        // création DIRECTE de l'étape correspondante, à traiter par l'enregistreur du
        // courrier (ou réutilisation de l'étape DG auto ouverte).
        if (
            in_array($user->role, ['DIRECTEUR_GENERAL', 'SUPER_ADMIN'], true)
            && empty($validated['workflowEtapeId'])
            && empty($validated['parentId'])
            && !empty($courrier->enregistre_par)
        ) {
            $step = $this->attachOrCreateDgStep($courrier, $annotation, $user);
            if ($step) {
                $annotation->workflow_etape_id = $step->id;
                $annotation->save();
            }
        }

        return response()->json(['data' => $annotation->toArray()], 201);
    }

    /**
     * P4 — Crée (ou réutilise) l'étape « annotation du DG » du courrier.
     * Marqueur : commentaire = 'auto_dg_annotation'.
     * Si une étape DG auto est déjà OUVERTE sur le courrier (série de traits de stylo,
     * tampons et textes posés sur le même dossier), on la RÉUTILISE au lieu d'en
     * créer une nouvelle à chaque annotation.
     */
    private function attachOrCreateDgStep(Courrier $courrier, Annotation $annotation, User $author): ?WorkflowEtape
    {
        $existing = WorkflowEtape::where('courrier_id', $courrier->id)
            ->where('commentaire', 'auto_dg_annotation')
            ->whereNotIn('statut', ['TERMINE', 'REJETE'])
            ->orderBy('created_at')
            ->first();
        if ($existing) {
            return $existing;
        }

        $label = ($annotation->decision === 'A_REVOIR')
            ? 'Correction demandée par le DG'
            : 'Avis DG — à prendre en compte';

        $etape = WorkflowEtape::create([
            'courrier_id' => $courrier->id,
            'etape' => $label,
            'assigne_a' => $courrier->enregistre_par,
            'statut' => 'EN_ATTENTE',
            'commentaire' => 'auto_dg_annotation',
            'cree_par' => $author->id,
            'duree_estimee' => 48,
            'declencheur' => ['type' => 'IMMEDIAT'],
        ]);

        // Notification haute priorité à l'assigné de l'étape
        // (P6 : pas de notification à soi-même si l'assigné est l'auteur de l'annotation)
        if ((string) $courrier->enregistre_par !== (string) $author->id) {
            try {
                Notification::create([
                    'userId' => $courrier->enregistre_par,
                    'type' => 'workflow',
                    'title' => "Nouvelle étape à traiter — {$courrier->numero}",
                    'message' => "Étape « {$label} » créée automatiquement après l'annotation du DG ({$author->name}) sur « {$courrier->objet} ».",
                    'priority' => 'high',
                    'read' => false,
                    'relatedId' => $courrier->id,
                    'relatedType' => 'courrier',
                ]);
            } catch (\Throwable $e) {
                \Log::warning('P4 : notification de l\'étape DG automatique échouée', [
                    'courrier_id' => $courrier->id,
                    'etape_id' => $etape->id,
                    'erreur' => $e->getMessage(),
                ]);
            }
        }

        return $etape;
    }

    /**
     * Mettre à jour une annotation (contenu, statut, décision, rattachement étape).
     * PATCH /api/annotations/{id}
     * Autorisé : l'auteur de l'annotation ou un DG / SUPER_ADMIN.
     */
    public function update(string $id, Request $request): JsonResponse
    {
        $this->authorize('modifier-courrier');
        $user = Auth::user();
        $annotation = Annotation::findOrFail($id);
        $courrier = $annotation->courrier;

        if (!$courrier || !$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }
        $isAuthor = (string) $annotation->created_by === (string) $user->id;
        $isDg = in_array($user->role, ['DIRECTEUR_GENERAL', 'SUPER_ADMIN'], true);
        if (!$isAuthor && !$isDg) {
            return response()->json(['message' => 'Seul l\'auteur ou le Directeur Général peut modifier cette annotation'], 403);
        }

        $validated = $request->validate([
            'contenu' => 'sometimes|required|string',
            'statut' => 'sometimes|required|in:OUVERT,RESOLU',
            'decision' => 'nullable|in:FAVORABLE,A_REVOIR,INFO',
            'workflowEtapeId' => 'nullable|uuid',
        ]);

        $annotation->fill([
            'contenu' => $validated['contenu'] ?? $annotation->contenu,
            'statut' => $validated['statut'] ?? $annotation->statut,
            'decision' => array_key_exists('decision', $validated) ? $validated['decision'] : $annotation->decision,
            'workflow_etape_id' => array_key_exists('workflowEtapeId', $validated) ? $validated['workflowEtapeId'] : $annotation->workflow_etape_id,
        ])->save();

        return response()->json(['data' => $annotation->toArray()]);
    }

    /**
     * Supprimer une annotation.
     * DELETE /api/annotations/{id}
     * Autorisé : l'auteur de l'annotation ou un DG / SUPER_ADMIN.
     */
    public function destroy(string $id): JsonResponse
    {
        $this->authorize('modifier-courrier');
        $user = Auth::user();
        $annotation = Annotation::findOrFail($id);
        $courrier = $annotation->courrier;

        if (!$courrier || !$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }
        $isAuthor = (string) $annotation->created_by === (string) $user->id;
        $isDg = in_array($user->role, ['DIRECTEUR_GENERAL', 'SUPER_ADMIN'], true);
        if (!$isAuthor && !$isDg) {
            return response()->json(['message' => 'Seul l\'auteur ou le Directeur Général peut supprimer cette annotation'], 403);
        }

        // Supprime aussi les réponses du fil
        Annotation::where('parent_id', $annotation->id)->delete();
        $annotation->delete();

        return response()->json(['message' => 'Annotation supprimée']);
    }

    /**
     * Notifie l'enregistreur du courrier et les assignés des étapes ouvertes
     * lorsqu'une annotation ancrée sur un document est posée (DG / SUPER_ADMIN).
     */
    private function notifyDocumentAnnotation(Courrier $courrier, Annotation $annotation, User $author): void
    {
        $recipients = collect();

        $enregistrePar = $courrier->enregistre_par;
        if ($enregistrePar) {
            $recipients->push((string) $enregistrePar);
        }

        $openAssignees = WorkflowEtape::where('courrier_id', $courrier->id)
            ->whereNotIn('statut', ['TERMINE', 'REJETE'])
            ->whereNotNull('assigne_a')
            ->pluck('assigne_a')
            ->map(fn ($v) => (string) $v);
        $recipients = $recipients->merge($openAssignees)
            ->filter()
            ->unique()
            ->reject(fn ($uid) => $uid === (string) $author->id)
            ->values();

        if ($recipients->isEmpty()) {
            return;
        }

        $validUserIds = User::whereIn('id', $recipients->all())->where('actif', true)->pluck('id')->map(fn ($v) => (string) $v)->all();
        if (empty($validUserIds)) {
            return;
        }

        $decisionLabel = match ($annotation->decision) {
            'FAVORABLE' => 'Décision : AVIS FAVORABLE',
            'A_REVOIR' => 'Décision : À REVOIR',
            'INFO' => 'Décision : INFO',
            default => null,
        };
        $message = sprintf(
            '%s a annoté le document %s du courrier %s (page %d)%s : « %s »',
            $author->name,
            $annotation->fichier_nom ?: 'PDF',
            $courrier->numero,
            (int) $annotation->page,
            $decisionLabel ? " — {$decisionLabel}" : '',
            mb_strimwidth($annotation->contenu, 0, 120, '…')
        );

        $delivery = app(NotificationDeliveryService::class);
        foreach ($validUserIds as $uid) {
            $notification = Notification::create([
                'userId' => $uid,
                'type' => 'courrier',
                'title' => "Annotation du document — {$courrier->numero}",
                'message' => $message,
                'priority' => 'high',
                'read' => false,
                'relatedId' => $courrier->id,
                'relatedType' => 'courrier',
                'actionUrl' => '/courriers/' . $courrier->id,
                'metadata' => [
                    'kind' => 'ANNOTATION_DOCUMENT',
                    'annotationId' => $annotation->id,
                    'fichierId' => $annotation->fichier_id,
                    'page' => (int) $annotation->page,
                    'decision' => $annotation->decision,
                ],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            try {
                $delivery->deliver($notification);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}
