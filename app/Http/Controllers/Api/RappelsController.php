<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Assignation;
use App\Models\Courrier;
use App\Models\Rappel;
use App\Services\CourrierAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class RappelsController extends Controller
{
    public function __construct(
        private CourrierAccessService $accessService
    ) {}

    /**
     * Liste des rappels à envoyer (non envoyés, date proche ou passée).
     * GET /api/rappels?assigne_a=userId
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $query = Rappel::query()->with(['assignation', 'courrier'])
            ->where('envoye', false)
            ->orderBy('date_rappel', 'asc');

        if ($request->filled('assigne_a')) {
            if ($user->id !== $request->input('assigne_a') && !$user->canSeeAllCourriers()) {
                return response()->json(['message' => 'Non autorisé'], 403);
            }
            $query->whereHas('assignation', fn ($q) => $q->where('assigne_a', $request->input('assigne_a')));
        } else {
            $query->whereHas('assignation', fn ($q) => $q->where('assigne_a', $user->id));
        }

        $items = $query->get();
        return response()->json(['data' => $items->map(fn (Rappel $r) => $r->toArray())]);
    }

    /**
     * Créer un rappel.
     * POST /api/rappels
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $validated = $request->validate([
            'assignationId' => 'required|uuid|exists:assignations,id',
            'courrierId' => 'required|uuid|exists:courriers,id',
            'dateRappel' => 'required|date',
            'message' => 'nullable|string',
        ]);

        $assignation = Assignation::findOrFail($validated['assignationId']);
        $courrier = Courrier::findOrFail($validated['courrierId']);
        if (!$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }

        $rappel = Rappel::create([
            'assignation_id' => $validated['assignationId'],
            'courrier_id' => $validated['courrierId'],
            'date_rappel' => $validated['dateRappel'],
            'envoye' => false,
            'message' => $validated['message'] ?? null,
        ]);

        return response()->json(['data' => $rappel->toArray()], 201);
    }

    /**
     * Marquer un rappel comme envoyé.
     * POST /api/rappels/{id}/envoye
     */
    public function marquerEnvoye(string $id): JsonResponse
    {
        $this->authorize('voir-courriers');
        $user = Auth::user();

        $rappel = Rappel::with('courrier')->findOrFail($id);
        if (!$this->accessService->canViewCourrier($user, $rappel->courrier)) {
            return response()->json(['message' => 'Non autorisé'], 403);
        }

        $rappel->update(['envoye' => true, 'envoye_at' => now()]);
        return response()->json(['data' => $rappel->fresh()->toArray()]);
    }
}
