<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Assignation;
use App\Models\Courrier;
use App\Services\CourrierAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AssignationsController extends Controller
{
    public function __construct(
        private CourrierAccessService $accessService
    ) {}

    /**
     * Liste des assignations de l'utilisateur connecté.
     * GET /api/assignations?assigne_a=userId
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $query = Assignation::query()->with('courrier')->orderBy('date_assignation', 'desc');

        if ($request->filled('assigne_a')) {
            if ($user->id !== $request->input('assigne_a') && !$user->canSeeAllCourriers()) {
                return response()->json(['message' => 'Non autorisé'], 403);
            }
            $query->where('assigne_a', $request->input('assigne_a'));
        } else {
            $query->where('assigne_a', $user->id);
        }

        $items = $query->get();
        return response()->json(['data' => $items->map(fn (Assignation $a) => $a->toArray())]);
    }

    /**
     * Liste des assignations d'un courrier (si accès autorisé).
     * GET /api/courriers/{courrierId}/assignations
     */
    public function indexByCourrier(string $courrierId): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $courrier = Courrier::findOrFail($courrierId);
        if (!$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }

        $items = Assignation::where('courrier_id', $courrierId)->orderBy('date_assignation', 'desc')->get();
        return response()->json(['data' => $items->map(fn (Assignation $a) => $a->toArray())]);
    }

    /**
     * Créer une assignation (si accès au courrier + rôle autorisé).
     * POST /api/assignations
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('assigner-courrier');
        $user = Auth::user();

        $validated = $request->validate([
            'courrierId' => 'required|uuid|exists:courriers,id',
            // assigneA peut être un identifiant applicatif (non-UUID) ; ne pas imposer le format UUID ici
            'assigneA' => 'required|string|max:255',
            'dateEcheance' => 'nullable|date',
            'instructions' => 'nullable|string',
            'statut' => 'nullable|in:EN_ATTENTE,EN_COURS,TERMINE',
        ]);

        $courrier = Courrier::findOrFail($validated['courrierId']);
        if (!$this->accessService->canUpdateCourrier($user, $courrier)) {
            return response()->json(['message' => 'Non autorisé à assigner ce courrier'], 403);
        }

        $assignation = Assignation::create([
            'courrier_id' => $validated['courrierId'],
            'assigne_a' => $validated['assigneA'],
            'assigne_par' => $user->id,
            'date_assignation' => now(),
            'date_echeance' => $validated['dateEcheance'] ?? null,
            'statut' => $validated['statut'] ?? 'EN_ATTENTE',
            'instructions' => $validated['instructions'] ?? null,
        ]);

        return response()->json(['data' => $assignation->toArray()], 201);
    }

    /**
     * Mettre à jour une assignation.
     * PUT /api/assignations/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize('assigner-courrier');
        $user = Auth::user();

        $assignation = Assignation::with('courrier')->findOrFail($id);
        if (!$this->accessService->canUpdateCourrier($user, $assignation->courrier)) {
            return response()->json(['message' => 'Non autorisé'], 403);
        }

        $validated = $request->validate([
            'dateEcheance' => 'nullable|date',
            'instructions' => 'nullable|string',
            'statut' => 'nullable|in:EN_ATTENTE,EN_COURS,TERMINE',
        ]);

        $assignation->update([
            'date_echeance' => $validated['dateEcheance'] ?? $assignation->date_echeance,
            'instructions' => $validated['instructions'] ?? $assignation->instructions,
            'statut' => $validated['statut'] ?? $assignation->statut,
        ]);

        return response()->json(['data' => $assignation->fresh()->toArray()]);
    }

    /**
     * Supprimer une assignation (admin ou créateur de l'assignation / courrier).
     * DELETE /api/assignations/{id}
     */
    public function destroy(string $id): JsonResponse
    {
        $this->authorize('assigner-courrier');
        $user = Auth::user();

        $assignation = Assignation::with('courrier')->findOrFail($id);
        if (!$this->accessService->canUpdateCourrier($user, $assignation->courrier)) {
            return response()->json(['message' => 'Non autorisé'], 403);
        }

        $assignation->delete();
        return response()->json(null, 204);
    }
}
