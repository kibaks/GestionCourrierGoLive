<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Courrier;
use App\Services\OrganisationWorkflowService;
use Illuminate\Http\Request;
class WorkflowCircuitController extends Controller
{
    public function __construct(private OrganisationWorkflowService $service){}
    public function show(Request$r,string$courrierId){$this->authorize('voir-courriers');$courrier=Courrier::findOrFail($courrierId);$data=$this->service->overview($r->user(),$courrier);if($r->boolean('preview')){$v=$r->validate(['entityId'=>'required|uuid','agentId'=>'nullable|uuid']);$data['plan']=$this->service->plan($r->user(),$courrier,$v['entityId'],$v['agentId']??null);}return response()->json(['data'=>$data]);}
    public function store(Request$r,string$courrierId){
        $this->authorize('creer-workflow');$r->validate(['applyProcedure'=>'required|accepted']);
        $courrier=Courrier::findOrFail($courrierId);
        abort_unless(app(\App\Services\CourrierAccessService::class)->canUpdateCourrier($r->user(),$courrier),403);
        if(!$courrier->workflowEtapes()->exists())\App\Services\ProcedureSettings::apply($courrier,$r->user());
        abort_unless($courrier->workflowEtapes()->exists(),422,'Aucune procédure active ne correspond à ce courrier. Contactez l’administrateur.');
        return response()->json(['data'=>$this->service->overview($r->user(),$courrier->fresh())]);
    }
}
