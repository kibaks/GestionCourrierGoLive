<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courrier;
use App\Models\WorkflowEtape;
use App\Services\CourrierAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class WorkflowEtapesController extends Controller
{
    public function __construct(
        private CourrierAccessService $accessService
    ) {}

    /**
     * Liste des étapes de workflow d'un courrier.
     * GET /api/courriers/{courrierId}/workflow-etapes
     */
    public function index(string $courrierId): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $courrier = Courrier::findOrFail($courrierId);
        if (!$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }

        $items = WorkflowEtape::where('courrier_id', $courrierId)
            ->orderBy('ordre')
            ->orderBy('created_at')
            ->get();

        return response()->json(['data' => $items->map(fn (WorkflowEtape $w) => $w->toArray())]);
    }

    /**
     * IDs de courriers ayant au moins une étape assignée à un utilisateur ou une direction donnée.
     * GET /api/workflow-etapes/courrier-ids?assigne_a={userId}
     * GET /api/workflow-etapes/courrier-ids?direction={direction}
     * GET /api/workflow-etapes/courrier-ids?direction={direction}&service={service}
     */
    public function courrierIds(Request $request): JsonResponse
    {
        $this->authorize('voir-courriers');
        $assigneA  = $request->query('assigne_a');
        $direction = $request->query('direction');
        $service   = $request->query('service');

        $query = WorkflowEtape::query();

        if ($assigneA) {
            $query->where('assigne_a', (string) $assigneA);
        } elseif ($direction) {
            $entiteIds = $this->getDescendantEntityIds($direction);

            $userQuery = \App\Models\User::where(function ($q) use ($direction, $service, $entiteIds) {
                // Correspondance directe sur le champ direction
                $sub = $q->where('direction', $direction);
                if ($service) {
                    $sub->where('service', $service);
                }
                // Correspondance via entite_id (tous niveaux : division, bureau, cellule…)
                if (!empty($entiteIds)) {
                    $q->orWhereIn('entite_id', $entiteIds);
                }
            });

            $userIds = $userQuery->pluck('id')->map(fn ($id) => (string) $id)->toArray();
            if (empty($userIds)) {
                return response()->json(['data' => []]);
            }
            $query->whereIn('assigne_a', $userIds);
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
     * Créer une étape de workflow.
     * POST /api/workflow-etapes
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-workflow');
        $user = Auth::user();

        $validated = $request->validate([
            'courrierId' => 'required|uuid|exists:courriers,id',
            'etape' => 'required|string|max:255',
            // assigneA facultatif, stocké tel quel (id front/Firebase, etc.)
            'assigneA' => 'nullable|string',
            'statut' => 'nullable|in:EN_ATTENTE,EN_COURS,TERMINE,REJETE',
            'commentaire' => 'nullable|string',
            'dureeEstimee' => 'nullable|numeric|min:0',
            'ordre' => 'nullable|integer|min:0',
            'estCondition' => 'nullable|boolean',
            'actionSiVrai' => 'nullable|uuid',
            'actionSiFaux' => 'nullable|uuid',
            'declencheur' => 'nullable|array',
            'declencheur.type' => 'nullable|in:IMMEDIAT,APRES_ETAPE,CONDITION,DATE',
            'declencheur.etapePrecedenteId' => 'nullable|uuid',
            'declencheur.dateDeclenchement' => 'nullable|date',
        ]);

        $courrier = Courrier::findOrFail($validated['courrierId']);
        if (!$this->accessService->canUpdateCourrier($user, $courrier)) {
            return response()->json(['message' => 'Non autorisé'], 403);
        }

        $etape = WorkflowEtape::create([
            'courrier_id' => $validated['courrierId'],
            'etape' => $validated['etape'],
            'assigne_a' => $validated['assigneA'] ?? null,
            'statut' => $validated['statut'] ?? 'EN_ATTENTE',
            'commentaire' => $validated['commentaire'] ?? null,
            'cree_par' => $user->id,
            'duree_estimee' => $validated['dureeEstimee'] ?? null,
            'ordre' => $validated['ordre'] ?? null,
            'est_condition' => $validated['estCondition'] ?? false,
            'action_si_vrai' => $validated['actionSiVrai'] ?? null,
            'action_si_faux' => $validated['actionSiFaux'] ?? null,
            'declencheur' => $validated['declencheur'] ?? null,
        ]);

        return response()->json(['data' => $etape->toArray()], 201);
    }

    /**
     * Mettre à jour une étape de workflow.
     * PUT /api/workflow-etapes/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize('modifier-workflow');
        $user = Auth::user();

        $etape = WorkflowEtape::with('courrier')->findOrFail($id);
        if (!$this->accessService->canUpdateCourrier($user, $etape->courrier)) {
            return response()->json(['message' => 'Non autorisé'], 403);
        }

        $validated = $request->validate([
            'etape' => 'sometimes|string|max:255',
            'assigneA' => 'sometimes|string',
            'statut' => 'sometimes|in:EN_ATTENTE,EN_COURS,TERMINE,REJETE',
            'dateDebut' => 'nullable|date',
            'dateFin' => 'nullable|date',
            'commentaire' => 'nullable|string',
            'dureeEstimee' => 'nullable|numeric|min:0',
            'ordre' => 'nullable|integer|min:0',
            'declencheur' => 'nullable|array',
            'responses' => 'nullable|array',
        ]);

        $update = [];
        if (isset($validated['etape'])) $update['etape'] = $validated['etape'];
        if (isset($validated['assigneA'])) $update['assigne_a'] = $validated['assigneA'];
        if (isset($validated['statut'])) $update['statut'] = $validated['statut'];
        if (array_key_exists('dateDebut', $validated)) $update['date_debut'] = $validated['dateDebut'];
        if (array_key_exists('dateFin', $validated)) $update['date_fin'] = $validated['dateFin'];
        if (array_key_exists('commentaire', $validated)) $update['commentaire'] = $validated['commentaire'];
        if (array_key_exists('dureeEstimee', $validated)) $update['duree_estimee'] = $validated['dureeEstimee'];
        if (array_key_exists('ordre', $validated)) $update['ordre'] = $validated['ordre'];
        if (isset($validated['declencheur'])) $update['declencheur'] = $validated['declencheur'];
        if (isset($validated['responses'])) $update['responses'] = $validated['responses'];

        $etape->update($update);

        // Auto-transition courrier → TRAITE si toutes les étapes sont TERMINE ou REJETE
        if (isset($validated['statut']) && in_array($validated['statut'], ['TERMINE', 'REJETE'])) {
            $courrier = $etape->courrier;
            if ($courrier && $courrier->statut !== 'TRAITE' && $courrier->statut !== 'ARCHIVE') {
                $autresEtapes = WorkflowEtape::where('courrier_id', $courrier->id)
                    ->where('est_condition', false)
                    ->get();
                $allDone = $autresEtapes->isNotEmpty() && $autresEtapes->every(
                    fn($e) => in_array($e->statut, ['TERMINE', 'REJETE'])
                );
                if ($allDone) {
                    $courrier->update(['statut' => 'TRAITE']);
                }
            }
        }

        return response()->json(['data' => $etape->fresh()->toArray()]);
    }

    /**
     * Ajouter une réponse/avis à une étape (historique).
     * POST /api/workflow-etapes/{id}/responses
     * Accessible à : l'assigné de l'étape, le créateur, ou tout utilisateur pouvant voir le courrier (supérieur hiérarchique).
     */
    public function addResponse(Request $request, string $id): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $etape = WorkflowEtape::with('courrier')->findOrFail($id);

        $isAssigne  = (string) $etape->assigne_a  === (string) $user->id;
        $isCreateur = (string) $etape->cree_par   === (string) $user->id;
        $canView    = $this->accessService->canViewCourrier($user, $etape->courrier);

        if (!$isAssigne && !$isCreateur && !$canView) {
            return response()->json(['message' => 'Non autorisé — vous devez être assigné à cette étape ou avoir accès au courrier'], 403);
        }

        $validated = $request->validate([
            'message' => 'required|string',
            'decision' => 'nullable|in:AVIS_FAVORABLE,A_REVOIR,INFO',
        ]);

        $responses = $etape->responses ?? [];
        $responses[] = [
            'id' => \Illuminate\Support\Str::uuid()->toString(),
            'auteurId' => $user->id,
            'auteurNom' => $user->name,
            'message' => $validated['message'],
            'decision' => $validated['decision'] ?? null,
            'createdAt' => now()->format('c'),
        ];
        $etape->update(['responses' => $responses]);

        return response()->json(['data' => $etape->fresh()->toArray()]);
    }

    /**
     * Supprimer une étape de workflow.
     * DELETE /api/workflow-etapes/{id}
     */
    public function destroy(string $id): JsonResponse
    {
        $this->authorize('modifier-workflow');
        $user = Auth::user();

        $etape = WorkflowEtape::with('courrier')->findOrFail($id);
        if (!$this->accessService->canUpdateCourrier($user, $etape->courrier)) {
            return response()->json(['message' => 'Non autorisé'], 403);
        }

        $etape->delete();
        return response()->json(null, 204);
    }
}
