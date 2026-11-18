<?php
use App\Models\{Courrier,WorkflowEtape,Annotation,Assignation,Notification};
use App\Services\{CourrierOrientationService,WorkflowExecutionService,DgAnnotationRoutingService};
use Illuminate\Support\Facades\DB;
$retainOrientationFixtures=true;
require __DIR__.'/orientation-integration.php';
try {
if (!Illuminate\Support\Facades\Schema::hasTable('config')) Illuminate\Support\Facades\Schema::create('config',function($table){$table->string('key')->primary();$table->text('value')->nullable();$table->timestamps();});
App\Models\Config::setValue(App\Services\ProcedureSettings::KEY,['version'=>'roundtrip-procedure','procedures'=>[['id'=>'roundtrip','nom'=>'Circuit interne configuré','actif'=>true,'ordre'=>1,'type'=>'INTERNE','sens'=>'TOUS','direction'=>null,'targetEntityId'=>$dgUnit->id,'targetFromCourrier'=>true,'agentId'=>null,'phases'=>[['code'=>'ORIENTATION','label'=>'Validation DG','hours'=>5],['code'=>'CLOTURE','label'=>'Classement','hours'=>1]]]]]);
$router=app(DgAnnotationRoutingService::class);$engine=app(WorkflowExecutionService::class);$orientation=app(CourrierOrientationService::class);
function internalRouteLetter($sender,$recipient,$creator,$direction){return Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'INTERNE','sens'=>'SORTANT','expediteur'=>$sender->id,'destinataire'=>$recipient->id,'enregistre_par'=>$creator->id,'direction'=>$direction->nom,'objet'=>'Transmission interne avec validations','numero'=>uniqid('ROUNDTRIP-'),'date_reception'=>now(),'date_enregistrement'=>now(),'priorite'=>'NORMALE','statut'=>'ENREGISTRE']));}
function attachRouteInstruction($courrier,$dg,$source,$text){return Annotation::create(['courrier_id'=>$courrier->id,'workflow_etape_id'=>$source->id,'created_by'=>$dg->id,'contenu'=>$text,'type'=>'NOTE','kind'=>'TEXTE','fichier_id'=>'roundtrip-document','page'=>1,'statut'=>'OUVERT']);}
$incoming=internalRouteLetter($unit,$dgUnit,$secretary,$unit);
$orientation->orient($secretary,$incoming,['assigneA'=>$director->id]);
$flow=WorkflowEtape::where('courrier_id',$incoming->id)->orderBy('ordre')->get();
check($flow->pluck('assigne_a')->take(4)->all()===[$secretary->id,$director->id,$secDG->id,$dg->id],'entity to DG initializes sender secretary, director, DG secretary, DG');
$orientation->orient($director,$incoming->fresh(),['assigneA'=>$secDG->id]);
$orientation->orient($secDG,$incoming->fresh(),['assigneA'=>$dg->id]);
$dgStep=WorkflowEtape::where('courrier_id',$incoming->id)->where('assigne_a',$dg->id)->firstOrFail();
check($engine->readiness($dgStep,WorkflowEtape::where('courrier_id',$incoming->id)->get())['ready'],'entity to DG reaches the DG active step');
check((float)$dgStep->duree_estimee===5.0&&$dgStep->declencheur['procedureId']==='roundtrip','automatic initialization retains configured procedure and duration');
$a=attachRouteInstruction($incoming,$dg,$dgStep,'Préparer la suite de ce courrier.');
$router->route($dg,$incoming,$a,['type'=>'ENTITE','id'=>$unit->id]);
$engine->transition($dgStep->id,$dg,['statut'=>'TERMINE','commentaire'=>'Instructions transmises à la direction.'],false);
$orientation->orient($secretary,$incoming->fresh(),['assigneA'=>$director->id]);
$options=$orientation->options($director,$incoming->fresh());
check($options['requiresDgAnnotation'],'sender director processing the DG instruction requires its annotation');
check(collect($options['targets'])->pluck('id')->contains($agent->id),'DG instruction returns to processing agent rather than DG secretary');
check(!collect($options['targets'])->pluck('id')->contains($secDG->id),'DG instruction does not loop back to DG reception');
$orientation->orient($director,$incoming->fresh(),['assigneA'=>$agent->id,'dgAnnotationId'=>$a->id]);
$incomingAgent=WorkflowEtape::where('courrier_id',$incoming->id)->where('assigne_a',$agent->id)->firstOrFail();
$incomingClosure=WorkflowEtape::where('courrier_id',$incoming->id)->where('declencheur->phase','CLOTURE')->firstOrFail();
$engine->transition($incomingAgent->id,$agent,['statut'=>'TERMINE','commentaire'=>'Instruction du DG exécutée.'],false);
check($orientation->targets($secDG,$incoming->fresh())->isEmpty(),'closure offers completion rather than another orientation');
$engine->transition($incomingClosure->id,$secDG,['statut'=>'TERMINE','commentaire'=>'Retour enregistré et courrier classé.'],false);
check($incoming->fresh()->statut==='TRAITE','entity to DG completes processing and closure');

$outgoing=internalRouteLetter($dgUnit,$unit,$secDG,$unit);
check($orientation->targets($secDG,$outgoing)->pluck('id')->contains($dg->id),'DG to entity first requires DG validation');
$orientation->orient($secDG,$outgoing,['assigneA'=>$dg->id]);
$source=WorkflowEtape::where('courrier_id',$outgoing->id)->where('assigne_a',$dg->id)->firstOrFail();
$closure=WorkflowEtape::where('courrier_id',$outgoing->id)->where('declencheur->phase','CLOTURE')->firstOrFail();
$a2=attachRouteInstruction($outgoing,$dg,$source,'Analyser et préparer la réponse dans la direction destinataire.');
try{$router->route($dg,$outgoing,$a2,['type'=>'ENTITE','id'=>$other->id]);throw new RuntimeException('Wrong recipient accepted');}catch(Symfony\Component\HttpKernel\Exception\HttpException $e){check($e->getStatusCode()===422,'DG outgoing refuses an unrelated recipient direction');}
$router->route($dg,$outgoing,$a2,['type'=>'ENTITE','id'=>$unit->id]);
$engine->transition($source->id,$dg,['statut'=>'TERMINE','commentaire'=>'Instruction validée et transmise.'],false);
$orientation->orient($secretary,$outgoing->fresh(),['assigneA'=>$director->id]);
$orientation->orient($director,$outgoing->fresh(),['assigneA'=>$agent->id,'dgAnnotationId'=>$a2->id]);
$agentStep=WorkflowEtape::where('courrier_id',$outgoing->id)->where('assigne_a',$agent->id)->firstOrFail();
$closure=$closure->fresh();
check(($agentStep->declencheur['finalRecipientId']??null)===$agent->id,'delegation identifies its actual recipient for opening receipts');
check($closure->assigne_a===$secDG->id&&$closure->declencheur['phase']==='CLOTURE','delegation preserves DG closure and its responsible');
check($closure->declencheur['etapePrecedenteId']===$agentStep->id,'DG closure waits for destination execution');
$count=WorkflowEtape::where('courrier_id',$outgoing->id)->count();$notices=Notification::where('relatedId',$outgoing->id)->count();
$orientation->orient($director,$outgoing->fresh(),['assigneA'=>$agent->id,'dgAnnotationId'=>$a2->id]);
check(WorkflowEtape::where('courrier_id',$outgoing->id)->count()===$count&&Notification::where('relatedId',$outgoing->id)->count()===$notices,'repeated transmission does not duplicate steps or notices');
$engine->transition($agentStep->id,$agent,['statut'=>'TERMINE','commentaire'=>'Analyse et réponse préparées.'],false);
$engine->transition($closure->id,$secDG,['statut'=>'TERMINE','commentaire'=>'Courrier classé après traitement.'],false);
check($outgoing->fresh()->statut==='TRAITE','DG to entity completes destination execution and DG closure');
$legacy=internalRouteLetter($dgUnit,$unit,$secDG,$unit);
$chief=person('CHEF_DIVISION',$unit,'roundtrip-chief');
$previous=null;$legacySteps=[];
foreach ([[$dg,'ORIENTATION'],[$director,'INSTRUCTION'],[$chief,'INSTRUCTION'],[$secDG,'CLOTURE']] as $index=>[$responsible,$phase]) {
    $step=WorkflowEtape::create(['courrier_id'=>$legacy->id,'etape'=>$phase,'assigne_a'=>$responsible->id,'cree_par'=>$secDG->id,'statut'=>'EN_ATTENTE','ordre'=>$index+1,'est_condition'=>false,'declencheur'=>['type'=>$previous?'APRES_ETAPE':'IMMEDIAT','etapePrecedenteId'=>$previous,'phase'=>$phase,'circuit'=>'ARMP']]);
    $engine->ensureAssignment($legacy,$step,$secDG);$legacySteps[]=$step;$previous=$step->id;
}
$legacyAnnotation=attachRouteInstruction($legacy,$dg,$legacySteps[0],'Poursuivre le circuit hiérarchique prévu.');
$router->route($dg,$legacy,$legacyAnnotation,['type'=>'ENTITE','id'=>$unit->id]);
check(WorkflowEtape::where('courrier_id',$legacy->id)->where('assigne_a',$director->id)->count()===1,'DG instruction reuses the planned director task without duplication');
$engine->transition($legacySteps[0]->id,$dg,['statut'=>'TERMINE','commentaire'=>'Circuit validé.'],false);
$orientation->orient($secretary,$legacy->fresh(),['assigneA'=>$director->id]);
$legacyOptions=$orientation->options($director,$legacy->fresh());
check(!$legacyOptions['requiresDgAnnotation']&&collect($legacyOptions['targets'])->pluck('id')->all()===[$chief->id],'validated hierarchy offers only the next planned responsible');
$orientation->orient($director,$legacy->fresh(),['assigneA'=>$chief->id]);
check($legacySteps[2]->fresh()->assigne_a===$chief->id&&$legacySteps[3]->fresh()->declencheur['etapePrecedenteId']===$legacySteps[2]->id,'hierarchy handoff preserves both the intermediate validation and final closure');
$division=App\Models\EntiteOrganisationnelle::create(['nom'=>'Division juridique dédiée','type'=>'division','parent_id'=>$unit->id,'actif'=>true]);
$divisionHead=person('CHEF_DIVISION',$division,'roundtrip-division');$division->update(['responsable_id'=>$divisionHead->id]);
$bureau=App\Models\EntiteOrganisationnelle::create(['nom'=>'Bureau des avis','type'=>'bureau','parent_id'=>$division->id,'actif'=>true]);
$bureauHead=person('CHEF_BUREAU',$bureau,'roundtrip-bureau');$bureau->update(['responsable_id'=>$bureauHead->id]);
app()->forgetInstance(App\Services\CourrierPartyService::class);
$nested=internalRouteLetter($dgUnit,$bureau,$secDG,$unit);$previous=null;$nestedSteps=[];
foreach ([[$dg,'ORIENTATION'],[$director,'INSTRUCTION'],[$divisionHead,'INSTRUCTION'],[$bureauHead,'INSTRUCTION'],[$secDG,'CLOTURE']] as $index=>[$responsible,$phase]) {
    $step=WorkflowEtape::create(['courrier_id'=>$nested->id,'etape'=>$phase,'assigne_a'=>$responsible->id,'cree_par'=>$secDG->id,'statut'=>'EN_ATTENTE','ordre'=>$index+1,'est_condition'=>false,'declencheur'=>['type'=>$previous?'APRES_ETAPE':'IMMEDIAT','etapePrecedenteId'=>$previous,'phase'=>$phase,'circuit'=>'ARMP']]);
    $engine->ensureAssignment($nested,$step,$secDG);$nestedSteps[]=$step;$previous=$step->id;
}
$nestedAnnotation=attachRouteInstruction($nested,$dg,$nestedSteps[0],'Transmettre au bureau destinataire par la hiérarchie prévue.');
$router->route($dg,$nested,$nestedAnnotation,['type'=>'ENTITE','id'=>$bureau->id]);
foreach ([$director,$divisionHead,$bureauHead] as $responsible) check(WorkflowEtape::where('courrier_id',$nested->id)->where('assigne_a',$responsible->id)->count()===1,'bureau routing preserves a single task for '.$responsible->role);
check($nestedSteps[2]->fresh()->declencheur['etapePrecedenteId']===$nestedSteps[1]->id&&$nestedSteps[3]->fresh()->declencheur['etapePrecedenteId']===$nestedSteps[2]->id,'bureau routing keeps director, division, bureau hierarchy');
$engine->transition($nestedSteps[0]->id,$dg,['statut'=>'TERMINE','commentaire'=>'Transmission au bureau validée.'],false);
$orientation->orient($secretary,$nested->fresh(),['assigneA'=>$director->id]);
$orientation->orient($director,$nested->fresh(),['assigneA'=>$divisionHead->id]);
$engine->transition($nestedSteps[2]->id,$divisionHead,['statut'=>'TERMINE','commentaire'=>'Instruction transmise au bureau.'],false);
$engine->transition($nestedSteps[3]->id,$bureauHead,['statut'=>'TERMINE','commentaire'=>'Avis du bureau préparé.'],false);
$engine->transition($nestedSteps[4]->id,$secDG,['statut'=>'TERMINE','commentaire'=>'Résultat enregistré et classé.'],false);
check($nested->fresh()->statut==='TRAITE','DG to bureau completes through the configured hierarchy');
App\Models\Config::setValue(App\Services\ProcedureSettings::KEY,['version'=>null,'procedures'=>[]]);
$fallback=internalRouteLetter($unit,$dgUnit,$secretary,$unit);
$orientation->orient($secretary,$fallback,['assigneA'=>$director->id]);
check(WorkflowEtape::where('courrier_id',$fallback->id)->where('assigne_a',$dg->id)->exists(),'missing configured procedure still initializes the complete mandatory hierarchy');
$noBypass=internalRouteLetter($dgUnit,$unit,$secDG,$unit);
denied(fn()=>$orientation->orient($secDG,$noBypass,['assigneA'=>$director->id]),403);
$admin=person('SUPER_ADMIN',$dgUnit,'orientation-admin');
check($orientation->targets($admin,$noBypass)->pluck('id')->all()===[$dg->id],'administrator target choices preserve mandatory initial DG validation');
$orientation->orient($secDG,$noBypass,['assigneA'=>$dg->id]);
check($orientation->targets($admin,$noBypass->fresh())->pluck('id')->all()===[$dg->id],'administrator sees only available circuit targets rather than queued tasks');
denied(fn()=>$orientation->orient($admin,$noBypass->fresh(),['assigneA'=>$director->id]),403);
echo "INTERNAL ROUNDTRIP TESTS PASSED\n";
} finally {if($existing)DB::rollBack();}
