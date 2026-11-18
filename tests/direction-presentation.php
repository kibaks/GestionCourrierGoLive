<?php
$retainOrientationFixtures=true;
require __DIR__.'/orientation-integration.php';
use App\Models\{Courrier,WorkflowEtape,Annotation};
use Illuminate\Support\Facades\{DB,Auth,Gate};
$engine=app(App\Services\WorkflowExecutionService::class);
$orientation=app(App\Services\CourrierOrientationService::class);
$access=app(App\Services\CourrierAccessService::class);
$makeLegacy=function()use($unit,$dgUnit,$secDG,$dg,$director,$engine){
 $letter=Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'INTERNE','sens'=>'SORTANT','statut'=>'ENREGISTRE','expediteur'=>$unit->id,'destinataire'=>$dgUnit->id,'enregistre_par'=>$secDG->id,'direction'=>$unit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Présentation au Directeur émetteur','numero'=>uniqid('PRESENT-')]));
 $previous=null;$steps=[];
 foreach([[$secDG,'SECRETARIAT'],[$dg,'ORIENTATION'],[$director,'INSTRUCTION'],[$secDG,'CLOTURE']]as$i=>[$person,$phase]){
  $step=WorkflowEtape::create(['courrier_id'=>$letter->id,'etape'=>$phase,'assigne_a'=>$person->id,'cree_par'=>$secDG->id,'statut'=>'EN_ATTENTE','ordre'=>$i+1,'est_condition'=>false,'duree_estimee'=>4,'declencheur'=>['type'=>$previous?'APRES_ETAPE':'IMMEDIAT','etapePrecedenteId'=>$previous,'phase'=>$phase,'circuit'=>'ARMP','procedureId'=>'existing-procedure','procedureVersion'=>'existing-version','hoursByUrgency'=>['NORMALE'=>4],'availableAt'=>$i===0?now()->subDays(2)->toIso8601String():null]]);
  $engine->ensureAssignment($letter,$step,$secDG);$steps[]=$step;$previous=$step->id;
 }
 return [$letter,$steps];
};
try {
 [$letter,$original]=$makeLegacy();
 check($orientation->targets($secretary,$letter)->pluck('id')->all()===[$director->id],'legacy emitting secretary can present to its director');
 check($orientation->receptionState($secretary,$letter)['orientationPendingReception'],'legacy sender queue is pending local presentation');
 check($orientation->targets($secDG,$letter)->isEmpty(),'central secretariat cannot bypass sender director validation');
 check(WorkflowEtape::where('courrier_id',$letter->id)->count()===4,'loading options never rewrites the workflow');
 Gate::define('voir-courriers',fn($user)=>true);Auth::setUser($secretary);
 $rows=app(App\Http\Controllers\Api\CourrierController::class)->index(Illuminate\Http\Request::create('/','GET'))->getData(true)['data'];
 $row=collect($rows)->firstWhere('id',$letter->id);
 check($row && $row['orientationPendingReception'] && !$row['orientationAwaitingPreviousStep'],'list API exposes the same local presentation eligibility');
 Auth::forgetUser();
 $orientation->orient($secretary,$letter,['assigneA'=>$director->id,'initialOrientation'=>true]);
 $fresh=WorkflowEtape::where('courrier_id',$letter->id)->orderBy('ordre')->get();
 check($fresh->count()===6,'first presentation adds only the two missing emitting direction steps');
 check(!$fresh->first()->duree_estimee && empty($fresh->first()->declencheur['hoursByUrgency']),'new presentation does not inherit the central control time budget');
 check($fresh->take(4)->pluck('assigne_a')->all()===[$secretary->id,$director->id,$secDG->id,$dg->id],'correct order is secretary, own director, DG secretary, DG');
 foreach($original as$step)check($step->fresh()->declencheur['procedureId']==='existing-procedure' && (float)$step->fresh()->duree_estimee===4.0,'configured original step and duration are preserved');
 check($letter->fresh()->statut==='ASSIGNE','successful presentation changes status to oriented');
 check($access->canViewCourrier($director,$letter),'director receives access after own secretary presentation');
 denied(fn()=>$orientation->orient($secretary,$letter->fresh(),['assigneA'=>$director->id,'initialOrientation'=>true]),409);
 check(WorkflowEtape::where('courrier_id',$letter->id)->count()===6,'retry cannot add duplicate prefix steps');
 $orientation->orient($director,$letter->fresh(),['assigneA'=>$secDG->id]);
 $orientation->orient($secDG,$letter->fresh(),['assigneA'=>$dg->id]);
 check($access->canViewCourrier($dg,$letter),'DG receives access only after central handoff');
 [$started,$startedSteps]=$makeLegacy();$startedSteps[0]->update(['statut'=>'EN_COURS','date_debut'=>now()]);
 check($orientation->targets($secretary,$started)->isEmpty(),'started central circuit is never rewound');
 denied(fn()=>$orientation->orient($secretary,$started,['assigneA'=>$director->id,'initialOrientation'=>true]),403);
 check(WorkflowEtape::where('courrier_id',$started->id)->count()===4,'refused restart preserves all existing steps');
 [$annotated,$annotatedSteps]=$makeLegacy();Annotation::create(['courrier_id'=>$annotated->id,'created_by'=>$dg->id,'contenu'=>'Contrôle déjà effectué','type'=>'NOTE']);
 check($orientation->targets($secretary,$annotated)->isEmpty(),'existing annotation prevents automatic legacy preparation');
 $return=Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'INTERNE','sens'=>'SORTANT','statut'=>'EN_TRAITEMENT','expediteur'=>$unit->id,'destinataire'=>$dgUnit->id,'enregistre_par'=>$secDG->id,'direction'=>$unit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Retour après validation DG','numero'=>uniqid('RETURN-')]));
 $dgDone=WorkflowEtape::create(['courrier_id'=>$return->id,'etape'=>'DG','assigne_a'=>$dg->id,'cree_par'=>$secDG->id,'statut'=>'TERMINE','ordre'=>1,'declencheur'=>['type'=>'IMMEDIAT','phase'=>'ORIENTATION']]);
 WorkflowEtape::create(['courrier_id'=>$return->id,'etape'=>'Instruction du Directeur','assigne_a'=>$director->id,'cree_par'=>$secDG->id,'statut'=>'EN_ATTENTE','ordre'=>2,'declencheur'=>['type'=>'APRES_ETAPE','etapePrecedenteId'=>$dgDone->id,'phase'=>'INSTRUCTION','circuit'=>'ARMP']]);
 check($orientation->receptionState($secretary,$return)['orientationPendingReception'],'validated DG return is pending presentation in direction');
 check($orientation->targets($secretary,$return)->pluck('id')->all()===[$director->id],'sender rule no longer blocks its ready director after DG validation');
 $orientation->orient($secretary,$return,['assigneA'=>$director->id,'initialOrientation'=>true]);
 check(WorkflowEtape::where('courrier_id',$return->id)->count()===2,'DG return reuses its existing ready director step');
 check($access->canViewCourrier($director,$return),'director sees validated return after presentation');
 echo "DIRECTION PRESENTATION TESTS PASSED\n";
} finally {Auth::forgetUser();if($existing)DB::rollBack();}
