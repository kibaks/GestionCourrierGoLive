<?php
$retainOrientationFixtures=true;
require __DIR__.'/orientation-integration.php';
use App\Models\{Courrier,WorkflowEtape,Notification,Annotation};
use Illuminate\Support\Facades\{Auth,Gate,DB};
$access=app(App\Services\CourrierAccessService::class);
$engine=app(App\Services\WorkflowExecutionService::class);
$orientation=app(App\Services\CourrierOrientationService::class);
try {
 $letter=Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'EXTERNE','sens'=>'ENTRANT','statut'=>'ENREGISTRE','expediteur'=>'Institution partenaire','destinataire'=>$dgUnit->id,'enregistre_par'=>$director->id,'direction'=>$unit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Visibilité après transmission effective','numero'=>uniqid('VISIBILITY-')]));
 $previous=null;$flow=[];
 foreach([[$secDG,'SECRETARIAT'],[$dg,'ORIENTATION'],[$secretary,'RECEPTION_SECRETARIAT'],[$director,'INSTRUCTION'],[$agent,'EXECUTION'],[$secDG,'CLOTURE']]as$i=>[$person,$phase]) {
  $step=WorkflowEtape::create(['courrier_id'=>$letter->id,'etape'=>$phase,'assigne_a'=>$person->id,'cree_par'=>$secDG->id,'statut'=>'EN_ATTENTE','ordre'=>$i+1,'est_condition'=>false,'declencheur'=>['type'=>$previous?'APRES_ETAPE':'IMMEDIAT','etapePrecedenteId'=>$previous,'phase'=>$phase,'circuit'=>'ARMP','targetEntityId'=>$unit->id]]);
  $engine->ensureAssignment($letter,$step,$secDG);$flow[]=$step;$previous=$step->id;
 }
 check(!$access->canViewCourrier($secretary,$letter),'direction label alone does not grant secretariat visibility');
 foreach([$dg,$director,$agent]as$person){
  check(!$access->canViewCourrier($person,$letter),'planned task does not grant detail visibility to '.$person->role);
  check(!$access->getAccessibleCourriersQuery($person)->whereKey($letter->id)->exists(),'planned task does not grant list visibility to '.$person->role);
 }
 check(!$access->canUpdateCourrier($director,$letter),'being the creator does not bypass leader reception');
 Gate::define('voir-courriers',fn($user)=>true);
 $controller=app(App\Http\Controllers\Api\CourrierController::class);
 foreach([$dg,$director,$agent]as$person){
  Notification::create(['userId'=>$person->id,'relatedId'=>$letter->id,'relatedType'=>'courrier','type'=>'workflow','title'=>'Information','message'=>'Notification antérieure','priority'=>'normal','read'=>false]);
  Auth::setUser($person);
  check($controller->show($letter->id)->getStatusCode()===403,'notification cannot bypass detail visibility for '.$person->role);
  $notices=app(App\Http\Controllers\Api\NotificationsController::class)->index(Illuminate\Http\Request::create('/','GET'))->getData(true);
  check(!collect($notices)->contains('relatedId',$letter->id),'notification list hides inaccessible courrier for '.$person->role);
  denied(fn()=>$controller->markRead($letter->id),403);
 }
 Auth::forgetUser();
 $orientation->orient($secDG,$letter,['assigneA'=>$dg->id,'initialOrientation'=>true]);
 check($access->canViewCourrier($dg,$letter),'DG sees actual handoff from DG secretariat');
 check(!$access->canViewCourrier($director,$letter),'director does not see central handoff alone');
 $instruction=Annotation::create(['courrier_id'=>$letter->id,'workflow_etape_id'=>$flow[1]->id,'created_by'=>$dg->id,'contenu'=>'Examiner le dossier et préparer la réponse.','type'=>'NOTE','fichier_id'=>'visibility-document']);
 app(App\Services\DgAnnotationRoutingService::class)->route($dg,$letter->fresh(),$instruction,['type'=>'ENTITE','id'=>$unit->id]);
 $engine->transition($flow[1]->id,$dg,['statut'=>'TERMINE','commentaire'=>'Validation centrale terminée.'],false);
 $orientation->orient($secretary,$letter->fresh(),['assigneA'=>$director->id,'initialOrientation'=>true]);
 check($access->canViewCourrier($director,$letter),'director sees actual handoff from own secretary');
 check($access->getAccessibleCourriersQuery($director)->whereKey($letter->id)->exists(),'director list matches detail access');
 check(!$access->canViewCourrier($otherDirector,$letter),'another director does not see the handoff');
 check(!$access->canViewCourrier($agent,$letter),'agent still cannot see an unassigned future task');
 $wrong=$flow[4]->declencheur;$wrong['orientation']=['actorId'=>$otherDirector->id,'targetId'=>$agent->id,'instructions'=>'Instruction hors périmètre'];$flow[4]->update(['declencheur'=>$wrong]);
 check(!$access->canViewCourrier($agent,$letter),'another direction director cannot grant agent visibility');
 $wrong['orientation']=['actorId'=>$dg->id,'targetId'=>$agent->id,'annotationId'=>'dg-instruction'];$flow[4]->update(['declencheur'=>$wrong]);
 check($access->canViewCourrier($agent,$letter),'DG instruction explicitly naming agent grants visibility');
 unset($wrong['orientation']);$flow[4]->update(['declencheur'=>$wrong]);

 $orientation->orient($director,$letter->fresh(),['assigneA'=>$agent->id,'dgAnnotationId'=>$instruction->id,'instructions'=>'Préparer la note.']);
 check($access->canViewCourrier($agent,$letter),'agent sees actual instruction assigned by own director');
 check($access->getAccessibleCourriersQuery($agent)->whereKey($letter->id)->exists(),'agent list matches detail access');
 check(!$access->canViewCourrier($outsider,$letter),'another agent does not see the instruction');
 $outgoing=Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'INTERNE','sens'=>'SORTANT','statut'=>'ENREGISTRE','expediteur'=>$unit->id,'destinataire'=>$dgUnit->id,'enregistre_par'=>$secretary->id,'direction'=>$unit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Suivi des courriers émis','numero'=>uniqid('EMITTED-')]));
 check($access->canViewCourrier($secretary,$outgoing),'secretariat follows its entity letters emitted to DG');
 check(!$access->canViewCourrier($otherSecretary,$outgoing),'another secretariat cannot follow unrelated entity outgoing letters');
 $agentLetter=Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'EXTERNE','sens'=>'ENTRANT','statut'=>'ENREGISTRE','expediteur'=>'Institution partenaire','destinataire'=>$dgUnit->id,'enregistre_par'=>$agent->id,'direction'=>$unit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Instruction agent et suivi du secrétariat','numero'=>uniqid('AGENT-')]));
 check(!$access->canViewCourrier($agent,$agentLetter),'agent creation alone does not grant visibility');
 check(!$access->canViewCourrier($secretary,$agentLetter),'secretariat cannot see an unrelated same-direction record');
 WorkflowEtape::create(['courrier_id'=>$agentLetter->id,'etape'=>'Instruction au destinataire','assigne_a'=>$agent->id,'cree_par'=>$director->id,'statut'=>'EN_ATTENTE','ordre'=>1,'declencheur'=>['type'=>'IMMEDIAT','phase'=>'EXECUTION','orientation'=>['actorId'=>$director->id,'targetId'=>$agent->id,'instructions'=>'Examiner le courrier.','createdAt'=>now()->toIso8601String()]]]);
 check($access->canViewCourrier($agent,$agentLetter),'own director instruction grants visibility to the named agent');
 check($access->canViewCourrier($secretary,$agentLetter),'secretariat follows actual instructions addressed to its agents');
 check(!$access->canViewCourrier($otherSecretary,$agentLetter),'another secretariat cannot see another entity agent instruction');
 $direct=Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'INTERNE','sens'=>'SORTANT','statut'=>'ASSIGNE','expediteur'=>$dgUnit->id,'destinataire'=>$unit->id,'enregistre_par'=>$secDG->id,'direction'=>$unit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Courrier DG adressé directement à la direction','numero'=>uniqid('DIRECT-DG-')]));
 $validated=WorkflowEtape::create(['courrier_id'=>$direct->id,'etape'=>'Validation DG','assigne_a'=>$dg->id,'cree_par'=>$secDG->id,'statut'=>'TERMINE','ordre'=>1,'date_fin'=>now(),'declencheur'=>['type'=>'IMMEDIAT','phase'=>'ORIENTATION','orientation'=>['actorId'=>$secDG->id,'targetId'=>$dg->id]]]);
 WorkflowEtape::create(['courrier_id'=>$direct->id,'etape'=>'Réception par le Directeur','assigne_a'=>$director->id,'cree_par'=>$secDG->id,'statut'=>'EN_ATTENTE','ordre'=>2,'declencheur'=>['type'=>'APRES_ETAPE','etapePrecedenteId'=>$validated->id,'phase'=>'INSTRUCTION','circuit'=>'ARMP']]);
 check($access->canViewCourrier($secretary,$direct),'secretariat sees direct DG letter after DG validation');
 check(!$access->canViewCourrier($director,$direct),'direct addressing alone does not bypass own secretary presentation');
 check($orientation->receptionState($secretary,$direct)['orientationPendingReception'],'legacy direct DG receipt is pending presentation to its director');
 $orientation->orient($secretary,$direct,['assigneA'=>$director->id,'initialOrientation'=>true]);
 check($access->canViewCourrier($director,$direct),'direct DG letter becomes visible after own secretary presentation');
 denied(fn()=>$orientation->orient($secretary,$direct->fresh(),['assigneA'=>$director->id,'initialOrientation'=>true]),409);
 echo "COURRIER VISIBILITY TESTS PASSED\n";
} finally {Auth::forgetUser();if($existing)DB::rollBack();}
