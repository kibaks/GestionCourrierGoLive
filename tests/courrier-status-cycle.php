<?php
$retainOrientationFixtures=true;
require __DIR__.'/orientation-integration.php';
use App\Models\{Courrier, WorkflowEtape, Assignation};
$engine=app(App\Services\WorkflowExecutionService::class);
$letter=Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'EXTERNE','sens'=>'ENTRANT','statut'=>'ENREGISTRE','expediteur'=>$unit->id,'destinataire'=>$dgUnit->id,'enregistre_par'=>$secDG->id,'direction'=>$dgUnit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Cycle des statuts','numero'=>uniqid('CYCLE-')]));
$previous=null;$planned=[];
foreach ([[$secDG,'SECRETARIAT'],[$dg,'INSTRUCTION'],[$secDG,'CLOTURE']] as $index=>[$person,$phase]) {
 $step=WorkflowEtape::create(['courrier_id'=>$letter->id,'etape'=>$phase,'assigne_a'=>$person->id,'cree_par'=>$secDG->id,'statut'=>'EN_ATTENTE','ordre'=>$index+1,'est_condition'=>false,'declencheur'=>['type'=>$previous?'APRES_ETAPE':'IMMEDIAT','etapePrecedenteId'=>$previous,'phase'=>$phase,'circuit'=>'HIERARCHIQUE']]);
 $engine->ensureAssignment($letter,$step,$secDG);$planned[]=$step;$previous=$step->id;
}
$engine->synchronize($letter,WorkflowEtape::where('courrier_id',$letter->id)->get());
check($letter->fresh()->statut==='ENREGISTRE','prepared circuit remains awaiting orientation after registration');
$legacy=Assignation::where('courrier_id',$letter->id)->firstOrFail();$legacy->update(['instructions'=>'Transmission validée']);
check($engine->courrierStatus($letter,WorkflowEtape::where('courrier_id',$letter->id)->get())==='ASSIGNE','historical explicit assignment remains oriented');
$legacy->update(['instructions'=>'[WORKFLOW] Circuit du courrier']);
try{$engine->assertCourrierStatus($letter,'EN_TRAITEMENT',$secDG);throw new RuntimeException('Premature status accepted');}catch(Illuminate\Validation\ValidationException){check(true,'processing cannot be set before work begins');}
$service->orient($secDG,$letter->fresh(),['assigneA'=>$dg->id,'initialOrientation'=>true]);
check($letter->fresh()->statut==='ASSIGNE','transmission changes status to oriented, not processing');
check(!$service->options($secDG,$letter->fresh())['initialOrientation'],'oriented courrier no longer offers initial orientation');
denied(fn()=>$service->orient($secDG,$letter->fresh(),['assigneA'=>$dg->id,'initialOrientation'=>true]),409);
denied(fn()=>$service->orient($secDG,$letter->fresh(),['assigneA'=>$dg->id,'initialOrientation'=>false]),409);
$engine->transition($planned[1]->id,$dg,['statut'=>'EN_COURS'],false);
check($letter->fresh()->statut==='EN_TRAITEMENT','starting substantive work changes status to processing');
denied(fn()=>$service->orient($secDG,$letter->fresh(),['assigneA'=>$dg->id,'initialOrientation'=>true]),409);
try{$engine->assertCourrierStatus($letter->fresh(),'ARCHIVE',$secDG);throw new RuntimeException('Early archive accepted');}catch(Illuminate\Validation\ValidationException){check(true,'archiving is refused before completion');}
$engine->transition($planned[1]->id,$dg,['statut'=>'TERMINE','commentaire'=>'Examen et traitement terminés.'],false);
check($letter->fresh()->statut==='EN_TRAITEMENT','closure remains necessary before treated');
$engine->transition($planned[2]->id,$secDG,['statut'=>'TERMINE','commentaire'=>'Résultat classé et clôturé.'],false);
check($letter->fresh()->statut==='TRAITE','completed circuit changes status to treated');
$engine->assertCourrierStatus($letter->fresh(),'ARCHIVE',$secDG);$letter->update(['statut'=>'ARCHIVE']);
$engine->synchronize($letter,WorkflowEtape::where('courrier_id',$letter->id)->get());
check($letter->fresh()->statut==='ARCHIVE','archived courrier remains archived');
if($existing)Illuminate\Support\Facades\DB::rollBack();
echo "COURRIER STATUS CYCLE TESTS PASSED\n";
