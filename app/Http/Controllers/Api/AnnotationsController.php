<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Annotation;
use App\Models\Courrier;
use App\Services\CourrierAccessService;
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

            $userIds = \App\Models\User::where(function ($q) use ($direction, $entiteIds) {
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
     * Créer une annotation.
     * POST /api/annotations
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
        ]);

        return response()->json(['data' => $annotation->toArray()], 201);
    }
}
