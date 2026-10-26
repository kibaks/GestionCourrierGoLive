<?php
namespace App\Jobs;
use App\Models\Notification;
use App\Services\NotificationDeliveryService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
class DeliverCommunication implements ShouldQueue {
    use Dispatchable,InteractsWithQueue,Queueable,SerializesModels;
    public int $tries=1;
    public int $timeout=60;
    public function __construct(public string $deliveryId) { $this->afterCommit(); }
    public function handle(NotificationDeliveryService $service): void {
        $row=DB::table('communication_deliveries')->where('id',$this->deliveryId)->first();
        if (!$row || DB::table('communication_deliveries')->where('id',$row->id)->where('status','queued')->update(['status'=>'sending','updated_at'=>now()])!==1) return;
        try {
            $notification=Notification::find($row->notification_id);
            $sent=$notification && $service->sendChannel($notification,$row->channel);
            DB::table('communication_deliveries')->where('id',$row->id)->update(['status'=>$sent?'sent':'skipped','error'=>null,'updated_at'=>now()]);
        } catch (\Throwable $e) {
            DB::table('communication_deliveries')->where('id',$row->id)->update(['status'=>'failed','error'=>'Le fournisseur n’a pas confirmé l’envoi. Vérifier avant toute nouvelle tentative.','updated_at'=>now()]);
            report($e);
        }
    }
}
