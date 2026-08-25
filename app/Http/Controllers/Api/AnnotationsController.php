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

        return response()->json(['data' => $annotation->toArray()], 201);
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
