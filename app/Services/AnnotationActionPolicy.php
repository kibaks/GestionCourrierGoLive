<?php
namespace App\Services;
use App\Models\{User,Courrier,Assignation,WorkflowEtape};
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
class AnnotationActionPolicy
{
 public function reason(User$user,Courrier$courrier):?string{
  if(!Gate::forUser($user)->allows('modifier-courrier')||!app(CourrierAccessService::class)->canViewCourrier($user,$courrier))return 'Ce courrier est hors de votre périmètre d’action.';
  if(in_array($courrier->statut,['TRAITE','ARCHIVE'],true))return 'Ce courrier est clôturé : les annotations sont en lecture seule.';
  if($courrier->statut==='ENREGISTRE'||(!Assignation::where('courrier_id',$courrier->id)->exists()&&!WorkflowEtape::where('courrier_id',$courrier->id)->exists()))return 'Orientez ce courrier vers un responsable avant de l’annoter.';
  if($user->isSuperAdmin())return null;
  $steps=WorkflowEtape::where('courrier_id',$courrier->id)->get();
  if($steps->isNotEmpty()){
   $ready=$steps->contains(fn($s)=>$s->assigne_a===$user->id&&in_array($s->statut,['EN_ATTENTE','EN_COURS'],true)&&app(WorkflowExecutionService::class)->readiness($s,$steps)['ready']);
   return $ready?null:'Votre étape n’est pas encore disponible ou a déjà été terminée. Les annotations sont réservées au responsable de l’étape actuelle.';
  }
  return Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$user->id)->whereIn('statut',['EN_ATTENTE','EN_COURS'])->exists()?null:'Ce courrier ne vous est pas affecté pour traitement.';
 }
 public function assert(User$user,Courrier$courrier):void{if($reason=$this->reason($user,$courrier)){if(!app(CourrierAccessService::class)->canViewCourrier($user,$courrier)||(!$user->isSuperAdmin()&&!Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$user->id)->exists()&&!WorkflowEtape::where('courrier_id',$courrier->id)->where('assigne_a',$user->id)->exists()&&$courrier->statut!=='ENREGISTRE'))abort(403,$reason);throw ValidationException::withMessages(['annotation'=>$reason]);}}
 public function validateLinks(User$user,Courrier$courrier,array$data):void{
  if(in_array($data['kind']??'COMMENTAIRE',['SIGNATURE','TAMPOUR'],true)&&!in_array($user->role,['SUPER_ADMIN','DIRECTEUR_GENERAL'],true))abort(403,'Les signatures et tampons sont réservés à la Direction Générale.');
  if(!empty($data['parentId'])&&!\App\Models\Annotation::whereKey($data['parentId'])->where('courrier_id',$courrier->id)->exists())throw ValidationException::withMessages(['parentId'=>'La réponse doit appartenir au même courrier.']);
  if(!empty($data['workflowEtapeId'])){
   $step=WorkflowEtape::whereKey($data['workflowEtapeId'])->where('courrier_id',$courrier->id)->first();
   if(!$step)throw ValidationException::withMessages(['workflowEtapeId'=>'Cette étape n’appartient pas au courrier.']);
   abort_unless($step->assigne_a===$user->id||$user->isSuperAdmin(),403,'Cette étape appartient à un autre acteur.');
   $steps=WorkflowEtape::where('courrier_id',$courrier->id)->get();if(!in_array($step->statut,['EN_ATTENTE','EN_COURS'],true)||!app(WorkflowExecutionService::class)->readiness($step,$steps)['ready'])throw ValidationException::withMessages(['workflowEtapeId'=>'Cette étape n’est pas disponible pour annotation.']);
  }
 }
}
