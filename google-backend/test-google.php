<?php
require '/workspace/gestion-courrier/backend/vendor/autoload.php';
$app = require '/workspace/gestion-courrier/backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
require __DIR__.'/GoogleAuthController.php';
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Models\User;
use Google\Auth\AccessToken;
use Firebase\JWT\JWT;
$count=0;
function check($condition, $name) {global $count; if (!$condition) throw new RuntimeException('FAILED: '.$name); ++$count;}
config(['google.client_id'=>'test-client','google.frontend_origin'=>'https://gestion-courrier-golive.vercel.app','cache.default'=>'array']);
$c = new class extends App\Http\Controllers\Api\GoogleAuthController {
 public array|false $claims=false; public ?User $fixture=null;
 protected function verifyCredential(string $credential,string $clientId): array|false {return $this->claims;}
 protected function findUser(string $email): ?User {return $this->fixture;}
 protected function authenticatedResponse(User $user): JsonResponse {return response()->json(['verified'=>true]);}
};
$valid=['iss'=>'https://accounts.google.com','aud'=>'test-client','sub'=>'test-sub','email'=>'test@gmail.com','email_verified'=>true,'exp'=>time()+3600];
$call=fn($origin='https://gestion-courrier-golive.vercel.app')=>$c(Request::create('/api/auth/google','POST',['credential'=>'test'],[],[],['HTTP_ORIGIN'=>$origin,'HTTP_ACCEPT'=>'application/json']));
$c->fixture=new User(['email'=>'test@gmail.com','actif'=>true]);$c->fixture->id='test-user';
$c->claims=$valid;check($call()->getStatusCode()===200,'active existing account');
$c->claims=false;check($call()->getStatusCode()===401,'unverified token');
foreach ([['iss'=>'attacker'],['email_verified'=>false],['exp'=>time()-1],['sub'=>'']] as $bad){$c->claims=array_replace($valid,$bad);check($call()->getStatusCode()===401,'invalid identity claim');}
$c->claims=$valid;check($call('https://attacker.example')->getStatusCode()===403,'cross-origin login denied');
$c->fixture=null;check($call()->getStatusCode()===403,'unknown account denied');
$c->fixture=new User(['actif'=>false]);check($call()->getStatusCode()===403,'disabled account denied');
$c->fixture=new User(['actif'=>true]);$c->fixture->id='test-user';$c->fixture->two_factor_confirmed_at=now();
$r=$call();$d=$r->getData(true);check(!empty($d['twoFactorRequired'])&&!isset($d['token'])&&!empty($d['challenge']),'second factor preserved');
$c->claims=array_replace($valid,['email'=>'test@example.org']);check($call()->getStatusCode()===403,'non-authoritative email denied');
// Real signature and audience validation through Google's library using test-only keys.
$key=openssl_pkey_new(['private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_RSA]);openssl_pkey_export($key,$private);$details=openssl_pkey_get_details($key);
$b64=fn($v)=>rtrim(strtr(base64_encode($v),'+/','-_'),'=');
$jwk=['keys'=>[['kty'=>'RSA','kid'=>'test-key','alg'=>'RS256','use'=>'sig','n'=>$b64($details['rsa']['n']),'e'=>$b64($details['rsa']['e'])]]];
$verifier=new AccessToken(fn()=>new GuzzleHttp\Psr7\Response(200,['Content-Type'=>'application/json'],json_encode($jwk)));
$token=JWT::encode(array_merge($valid,['iat'=>time()-2]),$private,'RS256','test-key');
check((bool)$verifier->verify($token,['audience'=>'test-client']),'valid signature');
check($verifier->verify($token,['audience'=>'other-client'])===false,'wrong audience');
$expired=JWT::encode(array_merge($valid,['iat'=>time()-100,'exp'=>time()-20]),$private,'RS256','test-key');
check($verifier->verify($expired,['audience'=>'test-client'])===false,'expired signed token');
$parts=explode('.',$token);$parts[1]=$b64(json_encode(array_replace($valid,['email'=>'victim@gmail.com'])));check($verifier->verify(implode('.',$parts),['audience'=>'test-client'])===false,'forged payload');
echo 'GOOGLE_TESTS_PASSED '.$count.PHP_EOL;
