<?php
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\{User,Notification};
use App\Services\{CommunicationSettings as Settings,NotificationDeliveryService,MetaWhatsappService};
use App\Jobs\DeliverCommunication;
use Illuminate\Support\Facades\{DB,Http,Queue};
function verify($condition,$label) {if (!$condition) throw new RuntimeException($label); echo 'PASS '.$label.PHP_EOL;}
config(['cache.default'=>'array']);
Queue::fake(); Http::preventStrayRequests();
DB::beginTransaction();
try {
 $settings=Settings::defaults();$settings['sms']['mode']='test';
 $settings['whatsapp']=array_replace($settings['whatsapp'],['enabled'=>true,'provider'=>'meta','accessToken'=>'meta-test-secret-not-real','phoneNumberId'=>'123456789012345','templateName'=>'notification_courrier','language'=>'fr']);
 $public=Settings::save($settings);
 verify($public['whatsapp']['accessToken']==='' && $public['whatsapp']['hasSecret'],'Meta secret is write-only');
 verify(str_starts_with(Settings::get()['whatsapp']['accessToken'],'enc:'),'Meta secret encrypted at rest');
 Settings::save($public);
 verify(Settings::secret(Settings::get()['whatsapp']['accessToken'])==='meta-test-secret-not-real','Blank Meta secret preserves stored token');
 verify(!Settings::get()['sms']['enabled'] && Settings::get()['whatsapp']['enabled'],'Meta independent of disabled/test Twilio');
 $user=User::create(['name'=>'Communication fixture','email'=>uniqid('communication-').'@example.invalid','role'=>'AGENT','password'=>bin2hex(random_bytes(20)),'actif'=>true,'sms_phone'=>'+243812345678','sms_verified_at'=>now(),'notification_preferences'=>['default'=>['sms'=>false,'whatsapp'=>true]]]);
 Http::fake(['graph.facebook.com/*'=>Http::sequence()->push(['messages'=>[['id'=>'wamid.fake']]],200)->push(['error'=>['code'=>190]],401)]);
 $n=Notification::create(['userId'=>$user->id,'type'=>'workflow','title'=>'Courrier orienté','message'=>'Référence ARMP','priority'=>'normal','read'=>false]);
 $rows=DB::table('communication_deliveries')->where('notification_id',$n->id)->get();
 verify($rows->count()===1 && $rows[0]->channel==='whatsapp','Workflow notification automatically queues WhatsApp');
 app(NotificationDeliveryService::class)->deliver($n);
 verify(DB::table('communication_deliveries')->where('notification_id',$n->id)->count()===1,'Same notification/channel never queued twice');
 (new DeliverCommunication($rows[0]->id))->handle(app(NotificationDeliveryService::class));
 verify(DB::table('communication_deliveries')->where('id',$rows[0]->id)->value('status')==='sent','Accepted Meta message recorded as transmitted');
 verify(Http::recorded(fn($r)=>$r->url()==='https://graph.facebook.com/v22.0/123456789012345/messages' && $r->hasHeader('Authorization','Bearer meta-test-secret-not-real') && $r['to']==='243812345678' && $r['type']==='template' && $r['template']['language']['code']==='fr' && count($r['template']['components'][0]['parameters'])===2)->count()===1,'Meta template payload');
 verify(true,'Meta request uses configured ID, bearer token, language and two template variables');
 (new DeliverCommunication($rows[0]->id))->handle(app(NotificationDeliveryService::class));
 verify(Http::recorded()->count()===1,'Replayed job does not send twice');
 $user->update(['notification_preferences'=>['default'=>['sms'=>false,'whatsapp'=>false]]]);
 $off=Notification::create(['userId'=>$user->id,'type'=>'courrier','title'=>'Off','message'=>'Opt-out','priority'=>'normal','read'=>false]);
 verify(!DB::table('communication_deliveries')->where('notification_id',$off->id)->exists(),'User opt-out respected');
 $user->update(['notification_preferences'=>['default'=>['whatsapp'=>true]],'sms_verified_at'=>null]);
 $unverified=Notification::create(['userId'=>$user->id,'type'=>'courrier','title'=>'Unverified','message'=>'Unverified','priority'=>'normal','read'=>false]);
 $id=DB::table('communication_deliveries')->where('notification_id',$unverified->id)->value('id');
 (new DeliverCommunication($id))->handle(app(NotificationDeliveryService::class));
 verify(DB::table('communication_deliveries')->where('id',$id)->value('status')==='skipped','Unverified number never sent');
 $user->update(['sms_verified_at'=>now()]);
 $failed=Notification::create(['userId'=>$user->id,'type'=>'courrier','title'=>'Failure','message'=>'Failure','priority'=>'normal','read'=>false]);
 $id=DB::table('communication_deliveries')->where('notification_id',$failed->id)->value('id');
 (new DeliverCommunication($id))->handle(app(NotificationDeliveryService::class));
 verify(DB::table('communication_deliveries')->where('id',$id)->value('status')==='failed','Provider rejection recorded without losing notification');
 $invalid=Settings::publicValue(Settings::get());$invalid['whatsapp']['phoneNumberId']='';
 try {Settings::save($invalid);throw new RuntimeException('Incomplete configuration accepted');} catch (Illuminate\Validation\ValidationException $e) {verify(true,'Incomplete Meta activation rejected');}
 echo "COMMUNICATION META TESTS PASSED — HTTP mocked, transaction rolled back\n";
} finally {DB::rollBack();}
