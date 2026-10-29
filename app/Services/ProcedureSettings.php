<?php
namespace App\Services;
use App\Models\{Config,Courrier,User,EntiteOrganisationnelle};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
class ProcedureSettings {
 const KEY='workflow_procedures';
 public static function state():array{return Config::getValue(self::KEY,['version'=>null,'procedures'=>[]]);}
 public static function save(array$data,User$actor):array{
  return DB::transaction(function()use($data,$actor){
   Config::firstOrCreate(['key'=>self::KEY],['value'=>['version'=>null,'procedures'=>[]]]);
   $row=Config::whereKey(self::KEY)->lockForUpdate()->firstOrFail();
   if(($row->value['version']??null)!==$data['version'])abort(409,'Les procédures ont changé. Rechargez avant d’enregistrer.');
   foreach($data['procedures'] as$p)if($p['actif'])self::preview($p,$actor);
   $value=['version'=>(string)Str::uuid(),'procedures'=>$data['procedures'],'updatedBy'=>$actor->id,'updatedAt'=>now()->toIso8601String()];
   $row->value=$value;$row->save();return $value;
  },3);
 }
 public static function preview(array$p,User$actor,string$urgency="NORMALE"):array{
  $plan=app(OrganisationWorkflowService::class)->plan($actor,new Courrier(),$p['targetEntityId'],$p['agentId']??null,true);
  $result=[];
  foreach($p['phases']as$phase)foreach($plan as$item)if($item['phase']===$phase['code']){
   $budgets=$phase['hoursByUrgency']??array_fill_keys(['BASSE','NORMALE','HAUTE','URGENTE'],$phase['hours']);
   $label=strtr($phase['label']?:$item['etape'],['{unite}'=>$item['entiteNom']??'','{responsable}'=>$item['assigneNom'],'{role}'=>$item['role']]);
   if(mb_strlen($label)>255)throw ValidationException::withMessages(['procedures'=>'Le libellé généré dépasse 255 caractères. Raccourcissez le modèle.']);
   $result[]=array_merge($item,['etape'=>$label,'dureeEstimee'=>$budgets[$urgency]??$phase['hours'],'hoursByUrgency'=>$budgets]);
  }
  if(!$result)throw ValidationException::withMessages(['procedures'=>'Le circuit doit contenir au moins une tâche.']);
  return $result;
 }
 public static function resolveEntity(Courrier$c,string$fallback):string{
  $entities=EntiteOrganisationnelle::where('actif',true)->get();
  $raw=$c->extra_fields['entiteDestinataireJson']??null;
  try{$cascade=is_string($raw)?json_decode($raw,true,512,JSON_THROW_ON_ERROR):$raw;}catch(\Throwable){$cascade=null;}
  if(is_array($cascade)){
   $selected=$entities->whereIn('id',array_values($cascade));
   $deepest=$selected->filter(fn($entity)=>!$selected->contains(fn($child)=>$child->parent_id===$entity->id));
   if($deepest->count()===1)return $deepest->first()->id;
  }
  foreach([$c->service,$c->direction,$c->destinataire]as$name){
   if(!$name)continue;$matches=$entities->filter(fn($e)=>$e->id===$name||$e->nom===$name);
   if($matches->count()===1)return $matches->first()->id;
  }
  return $fallback;
 }
 public static function apply(Courrier$c,User$actor):void{
  $state=self::state();$rules=collect($state['procedures'])->where('actif',true)->sortBy('ordre');
  $p=$rules->first(fn($p)=>($p['type']==='TOUS'||$p['type']===$c->type)&&($p['sens']==='TOUS'||$p['sens']===$c->sens)&&(!$p['direction']||$p['direction']===$c->direction));
  if(!$p)return;$p['_version']=$state['version'];
  if($p['targetFromCourrier']??false)$p['targetEntityId']=self::resolveEntity($c,$p['targetEntityId']);
  app(OrganisationWorkflowService::class)->create($actor,$c,$p['targetEntityId'],$p['agentId']??null,$p);
 }
}
