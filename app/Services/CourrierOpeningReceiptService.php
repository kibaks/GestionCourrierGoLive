<?php
namespace App\Services;
use App\Models\{Courrier,User,WorkflowEtape,Notification};
use Illuminate\Support\Facades\DB;

class CourrierOpeningReceiptService
{
    public function record(Courrier $courrier, User $reader): array
    {
        return DB::transaction(function()use($courrier,$reader){
            $courrier=Courrier::whereKey($courrier->id)->lockForUpdate()->firstOrFail();
            $new=DB::table('courrier_reads')->insertOrIgnore(['courrier_id'=>$courrier->id,'user_id'=>$reader->id,'read_at'=>now()]);
            $readAt=DB::table('courrier_reads')->where('courrier_id',$courrier->id)->where('user_id',$reader->id)->value('read_at');
            if($courrier->type==='INTERNE' && $reader->role!=='SECRETAIRE') {
                $steps=WorkflowEtape::where('courrier_id',$courrier->id)->get();
                $eligible=$steps->contains(fn($s)=>$s->assigne_a===$reader->id && ($s->declencheur['finalRecipientId']??null)===$reader->id);
                $origin=User::find($courrier->enregistre_par);
                if($reader->role==='DIRECTEUR_GENERAL' && $origin && app(CourrierAccessService::class)->secretaryRoot($origin)?->type==='direction') {
                    $eligible=$steps->contains(fn($s)=>$s->assigne_a===$reader->id && ($s->declencheur['phase']??null)==='ORIENTATION');
                }
                if($eligible) {
                    $senders=collect([$courrier->enregistre_par]);
                    foreach($steps as $step){
                        $trigger=$step->declencheur??[];
                        if(($trigger['finalRecipientId']??null)===$reader->id && !empty($trigger['orientation']['actorId']))$senders->push($trigger['orientation']['actorId']);
                        if(($trigger['phase']??null)==='TRANSMISSION_DIRECTION')$senders->push($step->assigne_a);
                    }
                    foreach($senders->filter()->unique() as $sender) {
                        if($sender===$reader->id)continue;
                        if(Notification::where('userId',$sender)->where('relatedId',$courrier->id)->where('metadata->openingReceipt->readerId',$reader->id)->exists())continue;
                        Notification::create(['userId'=>$sender,'type'=>'workflow','title'=>'Accusé d’ouverture — '.($courrier->numero_organisationnel?:$courrier->numero),'message'=>$reader->name.' a ouvert le courrier « '.$courrier->objet.' ».','priority'=>'normal','read'=>false,'relatedId'=>$courrier->id,'relatedType'=>'courrier','actionUrl'=>'/courriers/'.$courrier->id,'metadata'=>['openingReceipt'=>['readerId'=>$reader->id,'readerName'=>$reader->name,'readAt'=>(string)$readAt,'senderId'=>$sender]]]);
                    }
                }
            }
            return ['id'=>$courrier->id,'isRead'=>true,'readAt'=>$readAt];
        },3);
    }
}
