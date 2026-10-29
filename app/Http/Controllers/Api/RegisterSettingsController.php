<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Gate;
class RegisterSettingsController extends Controller {
 private function path():string{return storage_path('app/register-settings.json');}
 private function read():array{return is_file($this->path())?json_decode(file_get_contents($this->path()),true,512,JSON_THROW_ON_ERROR):['version'=>null,'config'=>[]];}
 public function show(Request $r){Gate::authorize('voir-courriers');return response()->json(['data'=>$this->read()]);}
 public function save(Request $r){
  abort_unless($r->user()?->role==='SUPER_ADMIN',403);
  $rules=['version'=>'present|nullable|uuid','config'=>'required|array:title,subtitle,organisationName,organisationAddress,showHeader,includeQrCode,qrBaseUrl,includeStats,showBorders,showRowNumbers,paperSize,orientation,fontSize,tableAlign,tableMargin,columnPadding,columns'];
  foreach(['title','subtitle','organisationName','organisationAddress'] as $field)$rules['config.'.$field]='required|string|max:200';
  foreach(['subtitle','organisationAddress'] as $field)$rules['config.'.$field]='present|nullable|string|max:200';
  foreach(['showHeader','includeQrCode','includeStats','showBorders','showRowNumbers'] as $field)$rules['config.'.$field]='required|boolean';
  $rules+=['config.qrBaseUrl'=>'required|url:http,https|max:500','config.paperSize'=>'required|in:a4,a3,letter','config.orientation'=>'required|in:portrait,landscape','config.fontSize'=>'required|integer|in:8,9,10,11,12','config.tableAlign'=>'required|in:left,center,right','config.tableMargin'=>'required|numeric|min:5|max:30','config.columnPadding'=>'required|numeric|min:0|max:10','config.columns'=>'required|array|min:1|max:40','config.columns.*'=>'required|array:key,label,width,visible','config.columns.*.key'=>'required|string|max:100|distinct','config.columns.*.label'=>'required|string|max:100','config.columns.*.width'=>'required|numeric|min:5|max:300','config.columns.*.visible'=>'required|boolean'];
  $v=$r->validate($rules);foreach(['subtitle','organisationAddress'] as $field)$v['config'][$field]=$v['config'][$field]??'';abort_unless(collect($v['config']['columns'])->contains(fn($c)=>$c['visible']),422,'Sélectionnez au moins une colonne.');
  $lock=fopen($this->path().'.lock','c');if(!$lock||!flock($lock,LOCK_EX))abort(500);
  try{abort_unless($this->read()['version']===$v['version'],409,'Configuration modifiée. Rechargez avant d’enregistrer.');$state=['version'=>(string)Str::uuid(),'config'=>$v['config'],'updatedBy'=>$r->user()->id,'updatedAt'=>now()->toIso8601String()];$tmp=$this->path().'.tmp';file_put_contents($tmp,json_encode($state,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));chmod($tmp,0600);rename($tmp,$this->path());}finally{flock($lock,LOCK_UN);fclose($lock);}return response()->json(['data'=>$state]);
 }
}
