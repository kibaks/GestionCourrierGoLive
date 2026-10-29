<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if(!str_ends_with(config('database.connections.mysql.database'),'_test'))throw new RuntimeException('Test database required');
use App\Models\{User,Courrier};use Illuminate\Support\Facades\DB;
function check($value,$label){if(!$value)throw new RuntimeException($label);echo "PASS $label\n";}
function callApi($method,$path,$user=null,$body=null,$expected=200){$headers=['Accept: application/json','Content-Type: application/json'];if($user)$headers[]='Authorization: Bearer '.Tymon\JWTAuth\Facades\JWTAuth::fromUser($user);$ch=curl_init('http://127.0.0.1:18084/api/'.$path);curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers]);if($body!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($body));$raw=curl_exec($ch);$code=curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);check($code===$expected,"$method $path HTTP $expected (actual $code: ".substr($raw,0,220).")");return json_decode($raw,true)['data']??null;}
$tag='read-'.bin2hex(random_bytes(5));$users=[];$c=null;
try{
 foreach(['SUPER_ADMIN','SUPER_ADMIN','AGENT'] as $i=>$role)$users[]=User::create(['name'=>'Read test','email'=>"$tag-$i@example.test",'password'=>bin2hex(random_bytes(32)),'role'=>$role,'actif'=>true]);
 $c=Courrier::create(['type'=>'INTERNE','sens'=>'ENTRANT','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>$tag,'expediteur'=>'Test','destinataire'=>'Test','priorite'=>'NORMALE','statut'=>'ENREGISTRE','enregistre_par'=>$users[0]->id]);
 $find=fn($rows)=>collect($rows)->firstWhere('id',$c->id);
 check($find(callApi('GET','courriers',$users[0]))['isRead']===false,'list does not mark courrier read');
 callApi('POST',"courriers/{$c->id}/read",null,null,401);
 callApi('POST',"courriers/{$c->id}/read",$users[2],null,403);
 $receipt=callApi('POST',"courriers/{$c->id}/read",$users[0],['user_id'=>$users[1]->id]);check($receipt['isRead']===true,'authenticated actor receives receipt');
 callApi('POST',"courriers/{$c->id}/read",$users[0]);check(DB::table('courrier_reads')->where('courrier_id',$c->id)->count()===1,'repeat open is idempotent');
 check($find(callApi('GET','courriers',$users[0]))['isRead']===true,'reader sees own status immediately despite cache');
 check($find(callApi('GET','courriers',$users[1]))['isRead']===false,'second user remains unread with shared admin cache');
 callApi('POST',"courriers/{$c->id}/read",$users[1]);check(DB::table('courrier_reads')->where('courrier_id',$c->id)->count()===2,'independent read rows');
 echo "ALL READ RECEIPT TESTS PASSED\n";
}finally{if($c)$c->delete();foreach($users as $u)$u->delete();}
