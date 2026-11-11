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

        $query->whereIn('courrier_id',$this->accessService->getAccessibleCourriersQuery($user)->reorder()->select('id'));
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
    public function orientationOptions(string $courrierId): JsonResponse
    {
        $this->authorize('voir-courriers');
        return response()->json(['data'=>app(\App\Services\CourrierOrientationService::class)->options(Auth::user(),Courrier::findOrFail($courrierId))]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated=$request->validate([
            'courrierId'=>'required|uuid|exists:courriers,id',
            'assigneA'=>'required|uuid|exists:users,id',
            'dgAnnotationId'=>'nullable|uuid',
            'dateEcheance'=>'nullable|date|after:now',
            'instructions'=>'nullable|string|max:20000',
            'statut'=>'nullable|in:EN_ATTENTE',
        ]);
        $assignment=app(\App\Services\CourrierOrientationService::class)->orient(Auth::user(),Courrier::findOrFail($validated['courrierId']),$validated);
        return response()->json(['data'=>$assignment->toArray()],201);
    }

    /**
     * Mettre à jour une assignation.
     * PUT /api/assignations/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $user=Auth::user();$assignation=Assignation::with('courrier')->findOrFail($id);
        abort_unless($this->accessService->canViewCourrier($user,$assignation->courrier),403);
        $own=(string)$assignation->assigne_a===(string)$user->id;
        if(!$own){$this->authorize('assigner-courrier');abort_unless($this->accessService->canUpdateCourrier($user,$assignation->courrier),403);}
        elseif(array_diff(array_keys($request->all()),['statut'])){$this->authorize('assigner-courrier');abort_unless($this->accessService->canUpdateCourrier($user,$assignation->courrier),403);}
        $v=$request->validate(['dateEcheance'=>'nullable|date','instructions'=>'nullable|string|max:20000','statut'=>'nullable|in:EN_ATTENTE,EN_COURS,TERMINE']);
        $assignment=\Illuminate\Support\Facades\DB::transaction(function()use($assignation,$v){
            $courrier=Courrier::whereKey($assignation->courrier_id)->lockForUpdate()->firstOrFail();$assignment=Assignation::whereKey($assignation->id)->lockForUpdate()->firstOrFail();
            abort_if($courrier->statut==='ARCHIVE',409,'Le courrier est archivé.');
            if(isset($v['statut'])&&$v['statut']!==$assignment->statut){
                if(\App\Models\WorkflowEtape::where('courrier_id',$courrier->id)->where('assigne_a',$assignment->assigne_a)->exists())abort(409,'Le statut de cette affectation est synchronisé avec ses étapes de workflow.');
                $allowed=['EN_ATTENTE'=>['EN_COURS','TERMINE'],'EN_COURS'=>['TERMINE'],'TERMINE'=>[]];abort_unless(in_array($v['statut'],$allowed[$assignment->statut]??[],true),422,'Transition non autorisée.');$assignment->statut=$v['statut'];
            }
            if(array_key_exists('dateEcheance',$v))$assignment->date_echeance=$v['dateEcheance'];if(array_key_exists('instructions',$v))$assignment->instructions=$v['instructions'];$assignment->save();return $assignment;
        },3);
        return response()->json(['data'=>$assignment->toArray()]);
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

        abort_if(\App\Models\WorkflowEtape::where('courrier_id',$assignation->courrier_id)->where('assigne_a',$assignation->assigne_a)->exists(),409,'Cette affectation est liée au workflow.');
        $assignation->delete();
        return response()->json(null, 204);
    }
}
