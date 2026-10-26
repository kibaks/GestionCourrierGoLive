<?php
namespace App\Services;
use App\Jobs\DeliverCommunication;
use App\Models\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
class NotificationDeliveryService {
    public function deliver(Notification $notification): void {
        $user=$notification->user; if (!$user) return;
        $prefs=$user->notification_preferences ?? [];
        $channels=$prefs[$notification->type] ?? $prefs['default'] ?? [];
        foreach(['email','sms','whatsapp'] as $channel) {
            if (empty($channels[$channel])) continue;
            if (!$notification->exists) { $this->sendChannel($notification,$channel); continue; }
            $id=(string)Str::uuid();
            $inserted=DB::table('communication_deliveries')->insertOrIgnore(['id'=>$id,'notification_id'=>$notification->id,'channel'=>$channel,'status'=>'queued','created_at'=>now(),'updated_at'=>now()]);
            if ($inserted) DeliverCommunication::dispatch($id);
        }
    }
    public function sendChannel(Notification $notification,string $channel): bool {
        $user=$notification->user; if (!$user) return false;
        $prefs=$user->notification_preferences??[]; $channels=$prefs[$notification->type]??$prefs['default']??[];
        if (empty($channels[$channel])) return false;
        $settings=CommunicationSettings::get();
        if ($channel==='email') {
            if (!CommunicationSettings::configureMail()) return false;
            Mail::raw("{$notification->title}\n\n{$notification->message}",function($mail)use($user,$notification){$mail->to($user->email)->subject($notification->title);});
        } elseif ($channel==='sms') {
            if (!$user->sms_verified_at || !$user->sms_phone || empty($settings['sms']['enabled'])) return false;
            app(TwilioService::class)->send($user->sms_phone,mb_strimwidth($notification->title.': '.$notification->message,0,150,'…'));
        } elseif ($channel==='whatsapp') {
            if (!$user->sms_verified_at || !$user->sms_phone || empty($settings['whatsapp']['enabled'])) return false;
            app(TwilioService::class)->sendWhatsapp($user->sms_phone,$notification->title,$notification->message);
        } else return false;
        return true;
    }
}
