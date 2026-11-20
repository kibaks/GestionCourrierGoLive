<?php
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Services\{CommunicationSettings as S,GmailService,NotificationDeliveryService};use App\Models\{User,Notification};use App\Jobs\DeliverCommunication;use Illuminate\Support\Facades\{DB,Http,Queue};
function ok($v,$s){if(!$v)throw new RuntimeException($s);echo 'PASS '.$s."\n";}
config(['cache.default'=>'array']);Http::preventStrayRequests();Queue::fake();DB::beginTransaction();
try{
 $s=S::publicValue(S::get());$s['mail']=array_replace($s['mail'],['enabled'=>true,'provider'=>'gmail','username'=>'sender@example.invalid','fromAddress'=>'sender@example.invalid','googleClientId'=>'client.apps.googleusercontent.com','googleClientSecret'=>'fixture-client-secret','googleRefreshToken'=>'fixture-refresh-token']);
 $p=S::save($s);ok($p['mail']['googleClientSecret']===''&&$p['mail']['googleRefreshToken']===''&&$p['mail']['hasGoogleClientSecret']&&$p['mail']['hasGoogleRefreshToken'],'Google secrets masked');
 ok(str_starts_with(S::get()['mail']['googleRefreshToken'],'enc:'),'Google refresh token encrypted');S::save($p);ok(S::secret(S::get()['mail']['googleRefreshToken'])==='fixture-refresh-token','Blank secrets preserve authorization');
 Http::fake(['oauth2.googleapis.com/token'=>Http::sequence()->push(['access_token'=>'fixture-access'],200)->push(['error'=>'invalid_grant'],400),'gmail.googleapis.com/*'=>Http::response(['id'=>'gmail-fixture'],200)]);
 $u=User::create(['name'=>'Gmail fixture','email'=>uniqid('gmail-').'@example.invalid','role'=>'AGENT','password'=>bin2hex(random_bytes(20)),'actif'=>true,'notification_preferences'=>['default'=>['email'=>true]]]);
 $n=Notification::create(['userId'=>$u->id,'type'=>'courrier','title'=>'Courrier reçu','message'=>'Votre courrier est disponible.','priority'=>'normal','read'=>false]);$id=DB::table('communication_deliveries')->where('notification_id',$n->id)->where('channel','email')->value('id');ok((bool)$id,'Notification queues email automatically');
 (new DeliverCommunication($id))->handle(app(NotificationDeliveryService::class));ok(DB::table('communication_deliveries')->where('id',$id)->value('status')==='sent','Gmail acceptance recorded');
 ok(Http::recorded(fn($r)=>$r->url()==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'&&$r->hasHeader('Authorization','Bearer fixture-access')&&str_contains(base64_decode(strtr($r['raw'],'-_','+/')),'Votre courrier est disponible.'))->count()===1,'MIME payload sent to Google HTTPS');
 (new DeliverCommunication($id))->handle(app(NotificationDeliveryService::class));ok(Http::recorded()->count()===2,'Replayed job never duplicates email');
 try{app(GmailService::class)->send('recipient@example.invalid','Failure','Fixture');throw new RuntimeException('Invalid token accepted');}catch(RuntimeException $e){ok(str_contains($e->getMessage(),'Autorisation Gmail'),'Expired authorization rejected');}
 echo "GMAIL TESTS PASSED — HTTP mocked, database rolled back\n";
}finally{DB::rollBack();}
