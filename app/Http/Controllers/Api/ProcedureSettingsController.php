<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\{EntiteOrganisationnelle,User};
use App\Services\ProcedureSettings;
use Illuminate\Http\Request;
class ProcedureSettingsController extends Controller {
 private function admin(Request$r):void{abort_unless($r->user()?->role==='SUPER_ADMIN',403);}
 private function rules():array{return [
  'previewUrgency'=>'sometimes|in:BASSE,NORMALE,HAUTE,URGENTE','version'=>'present|nullable|uuid','procedures'=>'present|array|max:50','procedures.*'=>'array:id,nom,actif,ordre,type,sens,direction,targetEntityId,agentId,phases,circulation,targetFromCourrier',
  'procedures.*.id'=>'required|uuid|distinct','procedures.*.nom'=>'required|string|max:120','procedures.*.actif'=>'required|boolean','procedures.*.ordre'=>'required|integer|min:1|max:999|distinct',
  'procedures.*.type'=>'required|in:TOUS,INTERNE,EXTERNE','procedures.*.sens'=>'required|in:TOUS,ENTRANT,SORTANT','procedures.*.direction'=>'present|nullable|string|max:255',
  'procedures.*.targetFromCourrier'=>'sometimes|boolean','procedures.*.targetEntityId'=>'required|uuid|exists:entites_organisationnelles,id','procedures.*.agentId'=>'present|nullable|uuid|exists:users,id',
  'procedures.*.phases'=>'required|array|min:1|max:6','procedures.*.phases.*'=>'array:code,label,hours,hoursByUrgency','procedures.*.phases.*.code'=>'required|in:SECRETARIAT,ORIENTATION,INSTRUCTION,EXECUTION,VALIDATION,CLOTURE',
  'procedures.*.phases.*.label'=>'present|nullable|string|max:200','procedures.*.phases.*.hours'=>'required|numeric|min:0.25|max:8760',
  'procedures.*.phases.*.hoursByUrgency'=>'sometimes|array:BASSE,NORMALE,HAUTE,URGENTE',
  'procedures.*.phases.*.hoursByUrgency.BASSE'=>'required_with:procedures.*.phases.*.hoursByUrgency|numeric|min:0.25|max:8760',
  'procedures.*.phases.*.hoursByUrgency.NORMALE'=>'required_with:procedures.*.phases.*.hoursByUrgency|numeric|min:0.25|max:8760',
  'procedures.*.phases.*.hoursByUrgency.HAUTE'=>'required_with:procedures.*.phases.*.hoursByUrgency|numeric|min:0.25|max:8760',
  'procedures.*.phases.*.hoursByUrgency.URGENTE'=>'required_with:procedures.*.phases.*.hoursByUrgency|numeric|min:0.25|max:8760',
  'procedures.*.circulation'=>'sometimes|array:notifyNext,deadlineOnReopen',
  'procedures.*.circulation.notifyNext'=>'required_with:procedures.*.circulation|boolean',
  'procedures.*.circulation.deadlineOnReopen'=>'required_with:procedures.*.circulation|in:CONSERVER,REINITIALISER'
 ];}
 public function show(Request$r){$this->admin($r);return response()->json(['data'=>ProcedureSettings::state()+['entities'=>EntiteOrganisationnelle::where('actif',true)->orderBy('nom')->get(['id','nom','type','parent_id']),'agents'=>User::where('actif',true)->where('role','AGENT')->get(['id','name','entite_id'])]]);}
 public function save(Request$r){$this->admin($r);$data=$r->validate($this->rules());
  foreach($data['procedures']as$p){$codes=array_column($p['phases'],'code');if(count(array_unique($codes))!==count($codes))abort(422,'Une phase ne peut pas être répétée.');if(in_array('EXECUTION',$codes,true)&&!$p['agentId'])abort(422,'Choisissez un agent pour la phase d’exécution.');}
  return response()->json(['data'=>ProcedureSettings::save($data,$r->user())]);
 }
 public function preview(Request$r){$this->admin($r);$data=$r->validate($this->rules());abort_unless(count($data['procedures'])===1,422);return response()->json(['data'=>ProcedureSettings::preview($data['procedures'][0],$r->user(),$data['previewUrgency']??'NORMALE')]);}
}
