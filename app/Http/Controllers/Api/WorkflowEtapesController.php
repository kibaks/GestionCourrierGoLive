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

        $query->whereIn('courrier_id', $this->accessService->getAccessibleCourriersQuery(Auth::user())->reorder()->select('id'));
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
    private function rules(): array
    {
        return ['etape'=>'sometimes|required|string|max:255','assigneA'=>'nullable|uuid|exists:users,id','statut'=>'sometimes|in:EN_ATTENTE,EN_COURS,TERMINE,REJETE','dateDebut'=>'nullable|date','dateFin'=>'nullable|date','annotation'=>'nullable|string|max:20000','commentaire'=>'nullable|string|max:20000','dureeEstimee'=>'nullable|numeric|min:0','ordre'=>'nullable|integer|min:0','estCondition'=>'sometimes|boolean','actionSiVrai'=>'nullable|uuid','actionSiFaux'=>'nullable|uuid','declencheur'=>'nullable|array:type,etapePrecedenteId,dateDeclenchement','declencheur.type'=>'sometimes|in:IMMEDIAT,APRES_ETAPE,CONDITION,DATE','declencheur.etapePrecedenteId'=>'nullable|uuid','declencheur.dateDeclenchement'=>'nullable|date','decision'=>'nullable|in:AVIS_FAVORABLE,A_REVOIR,INFO'];
    }

    public function store(Request $request): JsonResponse
    {
        abort(409,'Créez les tâches depuis les procédures des paramètres administrateur.');
        $this->authorize('creer-workflow');$actor=Auth::user();
        $v=$request->validate($this->rules()+['courrierId'=>'required|uuid|exists:courriers,id']);
        if(empty($v['etape']))throw \Illuminate\Validation\ValidationException::withMessages(['etape'=>'Indiquez le nom de l’étape.']);
        $item=\Illuminate\Support\Facades\DB::transaction(function()use($v,$actor){
            $courrier=Courrier::whereKey($v['courrierId'])->lockForUpdate()->firstOrFail();
            abort_unless($this->accessService->canUpdateCourrier($actor,$courrier),403);
            abort_if(in_array($courrier->statut,['TRAITE','ARCHIVE'],true),409,'Le courrier est clôturé.');
            abort_if(WorkflowEtape::where('courrier_id',$courrier->id)->where('declencheur->circuit','ARMP')->exists(),409,'Ce circuit est protégé : utilisez ses étapes de traitement.');
            $target=$v['assigneA']??(($v['estCondition']??false)?$actor->id:null);
            if(!$target||!\App\Models\User::whereKey($target)->where('actif',true)->exists())throw \Illuminate\Validation\ValidationException::withMessages(['assigneA'=>'Choisissez un responsable actif.']);
            $person=\App\Models\User::findOrFail($target);$allowed=app(\App\Services\OrganisationWorkflowService::class)->entities($actor);
            abort_unless($target===$actor->id||in_array($actor->role,['SUPER_ADMIN'],true)||$allowed->contains('id',$person->entite_id),403,'Responsable hors de votre périmètre.');
            $step=WorkflowEtape::create(['courrier_id'=>$courrier->id,'etape'=>$v['etape'],'assigne_a'=>$target,'statut'=>'EN_ATTENTE','cree_par'=>$actor->id,'commentaire'=>$v['commentaire']??null,'duree_estimee'=>$v['dureeEstimee']??null,'ordre'=>$v['ordre']??null,'est_condition'=>$v['estCondition']??false,'action_si_vrai'=>$v['actionSiVrai']??null,'action_si_faux'=>$v['actionSiFaux']??null,'declencheur'=>$v['declencheur']??null]);
            $engine=app(\App\Services\WorkflowExecutionService::class);$steps=WorkflowEtape::where('courrier_id',$courrier->id)->get();$engine->validateGraph($steps);$engine->ensureAssignment($courrier,$step,$actor);$engine->synchronize($courrier,$steps);$engine->notifyReady($courrier,$steps);
            if(($v['statut']??'EN_ATTENTE')!=='EN_ATTENTE')$step=$engine->transition($step->id,$actor,$v,true);
            return $step;
        },3);
        return response()->json(['data'=>$item->toArray()],201);
    }

    public function update(Request $request,string $id): JsonResponse
    {
        $actor=Auth::user();$step=WorkflowEtape::with('courrier')->findOrFail($id);
        $manager=app(\App\Services\WorkflowExecutionService::class)->canManageStep($actor,$step,$step->courrier);
        abort_unless($manager||(string)$step->assigne_a===(string)$actor->id,403);
        if($request->exists('responses'))throw \Illuminate\Validation\ValidationException::withMessages(['responses'=>'Ajoutez une réponse sans remplacer l’historique.']);
        $v=$request->validate($this->rules());
        $updated=app(\App\Services\WorkflowExecutionService::class)->transition($id,$actor,$v,$manager);
        return response()->json(['data'=>$updated->toArray()]);
    }

    public function addResponse(Request $request,string $id): JsonResponse
    {
        $this->authorize('voir-courriers');$actor=Auth::user();$v=$request->validate(['message'=>'required|string|max:20000','decision'=>'nullable|in:AVIS_FAVORABLE,A_REVOIR,INFO']);
        $courrierId=WorkflowEtape::findOrFail($id)->courrier_id;
        $step=\Illuminate\Support\Facades\DB::transaction(function()use($actor,$v,$id,$courrierId){
            $courrier=Courrier::whereKey($courrierId)->lockForUpdate()->firstOrFail();$step=WorkflowEtape::whereKey($id)->lockForUpdate()->firstOrFail();
            app(\App\Services\AnnotationActionPolicy::class)->assert($actor,$courrier);
            abort_unless((string)$step->assigne_a===(string)$actor->id||$actor->isSuperAdmin(),403);
            abort_if($courrier->statut==='ARCHIVE',409,'Le courrier est archivé.');
            if(in_array($v['decision']??'INFO',['AVIS_FAVORABLE','A_REVOIR'],true)) {
                abort_unless($step->assigne_a===$actor->id||$actor->isSuperAdmin(),403,'Avis réservé au responsable affecté.');
                abort_if(in_array($step->statut,['TERMINE','REJETE'],true),409,'La décision est déjà enregistrée.');
            }
            $history=$step->responses??[];$history[]=['id'=>(string)\Illuminate\Support\Str::uuid(),'auteurId'=>$actor->id,'auteurNom'=>$actor->name,'message'=>$v['message'],'decision'=>$v['decision']??'INFO','createdAt'=>now()->toIso8601String()];$step->update(['responses'=>$history]);return $step;
        },3);
        return response()->json(['data'=>$step->toArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->authorize('modifier-workflow');$actor=Auth::user();$courrierId=WorkflowEtape::findOrFail($id)->courrier_id;
        \Illuminate\Support\Facades\DB::transaction(function()use($id,$courrierId,$actor){
            $courrier=Courrier::whereKey($courrierId)->lockForUpdate()->firstOrFail();$step=WorkflowEtape::whereKey($id)->lockForUpdate()->firstOrFail();abort_unless($this->accessService->canUpdateCourrier($actor,$courrier),403);
            abort_if($step->statut!=='EN_ATTENTE'||($step->declencheur['circuit']??null)==='ARMP'||$courrier->statut==='ARCHIVE',409,'Cette étape possède un historique ou appartient à un circuit protégé.');
            $step->delete();$steps=WorkflowEtape::where('courrier_id',$courrierId)->get();app(\App\Services\WorkflowExecutionService::class)->validateGraph($steps);
        },3);
        return response()->json(null,204);
    }
}
