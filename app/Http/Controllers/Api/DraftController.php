<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
class DraftController extends Controller {
    public function show(Request $r) { $this->authorize('creer-courrier');$row=DB::table('user_drafts')->where('user_id',$r->user()->id)->first(); return response()->json(['data'=>$row?['payload'=>json_decode($row->payload,true),'savedAt'=>$row->updated_at]:null]); }
    public function save(Request $r) { $this->authorize('creer-courrier');$v=$r->validate(['payload'=>'required|array:formData,currentStep,selectedFolderId','payload.formData'=>'required|array','payload.currentStep'=>'required|integer|between:1,4','payload.selectedFolderId'=>'nullable|string|max:100']);abort_if(strlen(json_encode($v['payload']))>131072,422,'Brouillon trop volumineux.');DB::table('user_drafts')->updateOrInsert(['user_id'=>$r->user()->id],['payload'=>json_encode($v['payload']),'created_at'=>now(),'updated_at'=>now()]);return $this->show($r); }
    public function destroy(Request $r) { $this->authorize('creer-courrier');DB::table('user_drafts')->where('user_id',$r->user()->id)->delete();return response()->json(['data'=>null]); }
}
