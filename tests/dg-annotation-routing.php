<?php
use Illuminate\Support\Facades\{DB,Gate};
$retainOrientationFixtures=true;
require __DIR__.'/orientation-integration.php';
try {
Gate::define('modifier-courrier',fn($user)=>true);
$policy=app(App\Services\AnnotationActionPolicy::class);
foreach ([$secretary,$director,$agent] as $person) check($policy->reason($person,$c)!==null,'non-DG cannot annotate: '.$person->role);
$c2=App\Models\Courrier::withoutEvents(fn()=>App\Models\Courrier::create(['type'=>'EXTERNE','sens'=>'ENTRANT','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'DG routing test','expediteur'=>'Test','destinataire'=>'Test','numero'=>uniqid('DG-'),'statut'=>'ASSIGNE','enregistre_par'=>$secDG->id,'priorite'=>'NORMALE']));
$plan=app(App\Services\OrganisationWorkflowService::class)->plan($dg,$c2,$unit->id,null,true);
check(!collect($plan)->contains('phase','SECRETARIAT'),'initial secretary check removed');
check(collect($plan)->first()['phase']==='ORIENTATION','DG is the first step');
check(collect($plan)->contains('phase','VALIDATION'),'final validation retained');
$source=App\Models\WorkflowEtape::create(['courrier_id'=>$c2->id,'etape'=>'DG','assigne_a'=>$dg->id,'cree_par'=>$dg->id,'statut'=>'EN_ATTENTE','ordre'=>1,'declencheur'=>['type'=>'IMMEDIAT','phase'=>'ORIENTATION']]);
$visa=App\Models\WorkflowEtape::create(['courrier_id'=>$c2->id,'etape'=>'Visa','assigne_a'=>$dg->id,'cree_par'=>$dg->id,'statut'=>'EN_ATTENTE','ordre'=>2,'declencheur'=>['type'=>'APRES_ETAPE','etapePrecedenteId'=>$source->id,'phase'=>'VALIDATION']]);
$a=App\Models\Annotation::create(['courrier_id'=>$c2->id,'created_by'=>$dg->id,'workflow_etape_id'=>$source->id,'contenu'=>'Instruction DG','type'=>'NOTE','fichier_id'=>'test']);
$router=app(App\Services\DgAnnotationRoutingService::class);
$router->route($dg,$c2,$a,['type'=>'ENTITE','id'=>$unit->id]);
$task=App\Models\WorkflowEtape::where('courrier_id',$c2->id)->where('assigne_a',$director->id)->firstOrFail();
check($task->declencheur['orientation']['annotationId']===$a->id,'entity target creates task with DG evidence');
check($visa->fresh()->declencheur['etapePrecedenteId']===$task->id,'final visa waits for target');
$router->route($dg,$c2,$a,['type'=>'ENTITE','id'=>$unit->id]);
check(App\Models\WorkflowEtape::where('courrier_id',$c2->id)->count()===3,'same target reuses task');
$router->route($dg,$c2,$a,['type'=>'USER','id'=>$agent->id]);
check(App\Models\WorkflowEtape::where('courrier_id',$c2->id)->where('assigne_a',$agent->id)->exists(),'specific user target creates task');
denied(fn()=>$router->route($director,$c2,$a,['type'=>'USER','id'=>$agent->id]),403);
App\Models\WorkflowEtape::whereKey($source->id)->update(['statut'=>'TERMINE','date_fin'=>now()]);
$engine=app(App\Services\WorkflowExecutionService::class);
$engine->transition($task->id,$director,['statut'=>'EN_COURS'],false);
$engine->transition($task->id,$director,['statut'=>'TERMINE','commentaire'=>'Retour du directeur sans annotation'],false);
check($task->fresh()->statut==='TERMINE','non-DG completes task using return only');
echo "DG ROUTING TESTS PASSED\n";
} finally {if ($existing) DB::rollBack();}
