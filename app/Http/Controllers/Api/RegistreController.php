<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\{Courrier,Assignation};
use App\Services\CourrierAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB,Cache};

class RegistreController extends Controller
{
 public function __construct(private CourrierAccessService $access){}
 private const FIELDS=['originalReference','originalDate','attachments','notes','signedAt','dispatchedAt','signatory','dispatchChannel','receiptAt','receiptReference'];
 private function record(Courrier $c, ?Assignation $a=null):array {
  $extra=$c->extra_fields??[];$meta=$c->registreMeta?->data??[];
  $trans=$a?($meta['transmissions'][$a->id]??[]):[];
  $record=['id'=>$a?->id??$c->id,'courrierId'=>$c->id,'systemReference'=>$c->numero,'organisationReference'=>$c->numero_organisationnel,
   'receivedAt'=>$c->date_reception?->format('Y-m-d'),'registeredAt'=>$c->date_enregistrement?->format('Y-m-d'),
   'sender'=>$c->expediteur,'recipient'=>$c->destinataire,'subject'=>$c->objet,'unit'=>implode(' / ',array_unique(array_filter([$c->direction,$c->service]))),'status'=>$c->statut,
   'fileCount'=>(int)($c->fichiers_count??0),'originalReference'=>array_key_exists('originalReference',$meta)?$meta['originalReference']:($extra['referenceExterne']??null),
   'transmittedAt'=>$a?->date_assignation?->format('Y-m-d H:i:s'),'assignedTo'=>$a?->assigneA?->name,'assignedBy'=>$a?->assignePar?->name,
   'instructions'=>$a?->instructions,'deadline'=>$a?->date_echeance?->format('Y-m-d'), 'transmissionReceiptAt'=>$trans['receiptAt']??null,'transmissionReceiptReference'=>$trans['receiptReference']??null,
   'transmissionNotes'=>$trans['notes']??null];
  foreach(self::FIELDS as $field)if($field!=='originalReference')$record[$field]=$meta[$field]??null;
  $record['canEdit']=request()->user()->can('modifier-courrier') && $this->access->canUpdateCourrier(request()->user(),$c);
  return $record;
 }
 public function index(Request $request){
  $this->authorize('voir-courriers');
  $v=$request->validate(['mode'=>'required|in:arrivee,depart,transmission','q'=>'nullable|string|max:200','unit'=>'nullable|string|max:255','from'=>'nullable|date_format:Y-m-d','to'=>'nullable|date_format:Y-m-d','page'=>'nullable|integer|min:1','per_page'=>'nullable|integer|min:1|max:200']);
  if(!empty($v['from'])&&!empty($v['to'])&&$v['to']<$v['from'])throw \Illuminate\Validation\ValidationException::withMessages(['to'=>'La fin doit suivre le début de période.']);
  $base=$this->access->getAccessibleCourriersQuery($request->user())->reorder();
  $units=(clone $base)->whereNotNull('direction')->distinct()->orderBy('direction')->pluck('direction');
  $counts=['arrivee'=>(clone $base)->where('sens','ENTRANT')->count(),'depart'=>(clone $base)->where('sens','SORTANT')->count(),'transmission'=>Assignation::whereIn('courrier_id',(clone $base)->select('id'))->count()];
  $query=clone $base;
  if($v['mode']!=='transmission')$query->where('sens',$v['mode']==='arrivee'?'ENTRANT':'SORTANT');
  if(!empty($v['unit']))$query->where('direction',$v['unit']);
  if(!empty($v['q'])){$term='%'.addcslashes(trim($v['q']),'%_\\').'%';$query->where(function($q)use($term){foreach(['numero','numero_organisationnel','objet','expediteur','destinataire'] as $f)$q->orWhere($f,'like',$term);$q->orWhere('extra_fields->registre->originalReference','like',$term)->orWhere('extra_fields->referenceExterne','like',$term);});}
  $date=$v['mode']==='arrivee'?'date_reception':'date_enregistrement';
  if($v['mode']==='transmission'){
   $rows=Assignation::whereIn('courrier_id',$query->select('id'))->with(['courrier'=>fn($q)=>$q->with('registreMeta')->withCount(['fichiers'=>fn($q)=>$q->where('type','fichier')]),'assigneA:id,name','assignePar:id,name']);
   if(!empty($v['from']))$rows->whereDate('date_assignation','>=',$v['from']);if(!empty($v['to']))$rows->whereDate('date_assignation','<=',$v['to']);
   $page=$rows->orderBy('date_assignation')->orderBy('id')->paginate($v['per_page']??25);
   $items=$page->getCollection()->map(fn($a)=>$this->record($a->courrier,$a));
  }else{
   if(!empty($v['from']))$query->whereDate($date,'>=',$v['from']);if(!empty($v['to']))$query->whereDate($date,'<=',$v['to']);
   $page=$query->with('registreMeta')->withCount(['fichiers'=>fn($q)=>$q->where('type','fichier')])->orderBy($date)->orderBy('id')->paginate($v['per_page']??25);
   $items=$page->getCollection()->map(fn($c)=>$this->record($c));
  }
  return response()->json(['data'=>['items'=>$items,'pagination'=>['page'=>$page->currentPage(),'pages'=>$page->lastPage(),'total'=>$page->total(),'perPage'=>$page->perPage()],'counts'=>$counts,'units'=>$units]]);
 }
 public function update(Request $request,string $id){
  $this->authorize('modifier-courrier');
  $validated=$request->validate([
   'originalReference'=>'sometimes|nullable|string|max:255','originalDate'=>'sometimes|nullable|date_format:Y-m-d','attachments'=>'sometimes|nullable|string|max:2000','notes'=>'sometimes|nullable|string|max:4000',
   'signedAt'=>'sometimes|nullable|date_format:Y-m-d','dispatchedAt'=>'sometimes|nullable|date_format:Y-m-d','signatory'=>'sometimes|nullable|string|max:255','dispatchChannel'=>'sometimes|nullable|in:PORTEUR,POSTE,EMAIL,WHATSAPP,AUTRE',
   'receiptAt'=>'sometimes|nullable|date_format:Y-m-d','receiptReference'=>'sometimes|nullable|string|max:1000','assignmentId'=>'sometimes|nullable|uuid',
  ]);
  return DB::transaction(function()use($request,$validated,$id){
   $c=Courrier::lockForUpdate()->findOrFail($id);abort_unless($this->access->canViewCourrier($request->user(),$c)&&$this->access->canUpdateCourrier($request->user(),$c),403);
   $extra=$c->extra_fields??[];$meta=$c->registreMeta?->data??[];
   if(!empty($validated['assignmentId'])){
    $a=Assignation::where('courrier_id',$c->id)->findOrFail($validated['assignmentId']);$fields=array_intersect_key($validated,array_flip(['receiptAt','receiptReference','notes']));
    $meta['transmissions'][$a->id]=array_merge($meta['transmissions'][$a->id]??[],$fields,['updatedBy'=>$request->user()->id,'updatedAt'=>now()->toIso8601String()]);
   }else{
    $meta=array_merge($meta,array_intersect_key($validated,array_flip(self::FIELDS)),['updatedBy'=>$request->user()->id,'updatedAt'=>now()->toIso8601String()]);
    if(!empty($meta['signedAt'])&&!empty($meta['dispatchedAt'])&&$meta['dispatchedAt']<$meta['signedAt'])throw \Illuminate\Validation\ValidationException::withMessages(['dispatchedAt'=>'L’expédition ne peut pas précéder la signature.']);
    if(!empty($meta['dispatchedAt'])&&!empty($meta['receiptAt'])&&$meta['receiptAt']<$meta['dispatchedAt'])throw \Illuminate\Validation\ValidationException::withMessages(['receiptAt'=>'La réception confirmée ne peut pas précéder l’expédition.']);
   }
   DB::table('courrier_registre')->updateOrInsert(['courrier_id'=>$c->id],['data'=>json_encode($meta,JSON_UNESCAPED_UNICODE),'updated_at'=>now()]);
   return response()->json(['data'=>['saved'=>true]]);
  });
 }
}
