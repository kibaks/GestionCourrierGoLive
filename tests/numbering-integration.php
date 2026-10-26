<?php
// Run only against a disposable MariaDB database, after migrations.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
set_exception_handler(function (Throwable $e) { fwrite(STDERR, (string) $e); exit(1); });
if (!str_ends_with(config('database.connections.mysql.database'), '_test')) throw new RuntimeException('Refus : base de test obligatoire.');

use App\Models\Courrier;
use App\Models\EntiteOrganisationnelle as Entity;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Carbon\Carbon;

function payload(array $extra = []): array {
    return $extra + ['type'=>'INTERNE','sens'=>'ENTRANT','dateReception'=>'2026-10-25','expediteur'=>'Test','destinataire'=>'Test','objet'=>'Test numérotation'];
}
function directCreate(array $extra = []): array {
    Auth::forgetGuards();
    return Courrier::create($extra + ['type'=>'INTERNE','sens'=>'ENTRANT','date_reception'=>now(),'date_enregistrement'=>now(), 'expediteur'=>'Test','destinataire'=>'Test','objet'=>'Clock test','priorite'=>'NORMALE','statut'=>'ENREGISTRE','enregistre_par'=>'test'])->toArray();
}
if (($argv[1] ?? '') === 'worker') {
    $c = Courrier::create(['type'=>'INTERNE','sens'=>'ENTRANT','date_reception'=>now(),'date_enregistrement'=>now(),
        'expediteur'=>'Test','destinataire'=>'Test','objet'=>'Concurrent','priorite'=>'NORMALE','statut'=>'ENREGISTRE',
        'enregistre_par'=>$argv[3], 'entite_numerotation_id'=>$argv[2]]);
    echo json_encode([$c->numero, $c->numero_organisationnel]); exit;
}
function ok($condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
    echo "PASS $message\n";
}
function api(string $method, string $path, ?User $user, ?array $body = null, int $status = 200): array {
    Auth::forgetGuards();
    $headers = ['CONTENT_TYPE'=>'application/json','HTTP_ACCEPT'=>'application/json'];
    if ($user) $headers['HTTP_AUTHORIZATION'] = 'Bearer '.Tymon\JWTAuth\Facades\JWTAuth::fromUser($user);
    $curl = curl_init('http://127.0.0.1:18082/api/'.$path);
    $httpHeaders = ['Content-Type: application/json','Accept: application/json'];
    if ($user) $httpHeaders[] = 'Authorization: '.$headers['HTTP_AUTHORIZATION'];
    curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>$httpHeaders,CURLOPT_TIMEOUT=>20]);
    if ($body !== null) curl_setopt($curl,CURLOPT_POSTFIELDS,json_encode($body));
    $content=curl_exec($curl);$actual=curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);
    $json=json_decode($content,true) ?? [];
    if ($actual !== $status) throw new RuntimeException("$method $path: expected $status, got $actual $content");
    return $json['data'] ?? $json;
}
function saveSettings(User $admin, array $rules, array $entities, bool $enabled = true): void {
    $current = api('GET', 'numbering/settings', $admin);
    api('PUT', 'numbering/settings', $admin, ['version'=>$current['version'], 'settings'=>[
        'enabled'=>$enabled,'organisation'=>'ARMP','timezone'=>'Africa/Kinshasa','rules'=>$rules],
        'codes'=>array_map(fn ($e)=>['id'=>$e->id,'code'=>$e->code],$entities)]);
}

$app->make(Illuminate\Contracts\Console\Kernel::class)->call('db:seed', ['--class'=>'RolesSeeder','--force'=>true]);
$app->make(Illuminate\Contracts\Console\Kernel::class)->call('db:seed', ['--class'=>'EntiteTypeDefinitionSeeder','--force'=>true]);
$admin = User::create(['name'=>'Test Admin','email'=>Str::uuid().'@test.invalid','password'=>Str::random(32),'role'=>'SUPER_ADMIN','actif'=>true]);
$blocked = User::create(['name'=>'No rights','email'=>Str::uuid().'@test.invalid','password'=>Str::random(32),'role'=>'LOCKED','actif'=>true]);
$a = Entity::create(['nom'=>'Direction A','type'=>'direction','actif'=>true]);
$b = Entity::create(['nom'=>'Direction B','type'=>'direction','actif'=>true]);
$a->code='DA'; $b->code='DB'; $a->save(); $b->save();
$service = Entity::create(['nom'=>'Service A','type'=>'service','parent_id'=>$a->id,'actif'=>true]);
$service->code='SA'; $service->save();

api('POST','courriers',$blocked,payload(),403);
api('PUT','numbering/settings',$blocked,[],403);
ok(true,'creation and settings denied without permission');
$before = api('POST','courriers',$admin,payload(),201);
ok($before['numeroOrganisationnel'] === null && $before['numeroSysteme'] === $before['numero'], 'disabled organisation numbering and API compatibility');
api('PUT','courriers/'.$before['id'],$admin,['numero'=>'INT-2026-9999'],422);
ok(Courrier::find($before['id'])->numero === $before['numero'], 'system reference immutable');

$rule = ['id'=>(string)Str::uuid(),'name'=>'Directions','scopeType'=>'direction','entityId'=>null,'type'=>'*','sens'=>'*',
    'format'=>'{organisation}/{code}/{annee}/{compteur}','period'=>'year','width'=>4,'start'=>1,'splitType'=>false,'splitSens'=>false];
saveSettings($admin,[$rule],[$a,$b,$service]);
$count = DB::table('numbering_issues')->count();
$example = api('POST','numbering/preview',$admin,['entityId'=>$a->id,'type'=>'INTERNE','sens'=>'ENTRANT']);
ok($example['reserved'] === false && DB::table('numbering_issues')->count() === $count,'preview consumes no number');
$limitedRole=App\Models\RoleDefinition::create(['nom'=>'Test creator','code'=>'TEST_CREATOR','permissions'=>['CREER_COURRIER','VOIR_COURRIERS']]);
$limited=User::create(['name'=>'Creator','email'=>Str::uuid().'@test.invalid','password'=>Str::random(32),'role'=>'TEST_CREATOR','actif'=>true,'entite_id'=>$a->id]);
api('POST','courriers',$limited,payload(['entiteNumerotationId'=>$b->id]),422);
ok(true,'creator cannot select another direction register');
$requestId=(string)Str::uuid();
$first=api('POST','courriers',$admin,payload(['entiteNumerotationId'=>$a->id,'clientRequestId'=>$requestId,'enregistrePar'=>$blocked->id]),201);
ok(str_ends_with($first['numeroOrganisationnel'],'/0001') && $first['enregistrePar']===$admin->id,'organisation reference and trusted actor');
$replay=api('POST','courriers',$admin,payload(['entiteNumerotationId'=>$a->id,'clientRequestId'=>$requestId]),200);
ok($replay['id']===$first['id'] && $replay['numero']===$first['numero'],'idempotent retry keeps both references');
$other=api('POST','courriers',$admin,payload(['entiteNumerotationId'=>$b->id]),201);
ok(str_ends_with($other['numeroOrganisationnel'],'/0001') && $other['numeroOrganisationnel']!==$first['numeroOrganisationnel'],'independent directions');
$child=api('POST','courriers',$admin,payload(['entiteNumerotationId'=>$service->id]),201);
ok(str_contains($child['numeroOrganisationnel'],'/DA/') && str_ends_with($child['numeroOrganisationnel'],'/0002'),'nearest ancestor rule inherited');
$previous=$child['numero'];
api('DELETE','courriers/'.$child['id'],$admin,null,204);
$next=api('POST','courriers',$admin,payload(['entiteNumerotationId'=>$a->id]),201);
ok($next['numero']!==$previous && str_ends_with($next['numeroOrganisationnel'],'/0003'),'deleted numbers never reused');
$a->code='DAX'; $a->save();
ok(Courrier::find($first['id'])->numero_organisationnel===$first['numeroOrganisationnel'],'entity rename preserves historical reference');
$rule['name']='Directions v2'; saveSettings($admin,[$rule],[$a,$b,$service]);
$after=api('POST','courriers',$admin,payload(['entiteNumerotationId'=>$a->id]),201);
ok(str_contains($after['numeroOrganisationnel'],'/DAX/') && str_ends_with($after['numeroOrganisationnel'],'/0004'),'new version does not reset counters');
api('POST','courriers',$admin,payload(),422);
ok(true,'missing required entity rejected clearly');
$bulk=api('POST','courriers/bulk',$admin,['courriers'=>[payload(['entiteNumerotationId'=>$a->id]),payload(['entiteNumerotationId'=>$a->id])]],201);
ok(count(array_unique(array_column($bulk,'numeroOrganisationnel')))===2,'bulk uses same allocator');

// Every process bootstraps its own connection: actual DB concurrency, not a mock.
Auth::forgetGuards();
$cEntity=Entity::create(['nom'=>'Direction C','type'=>'direction','actif'=>true]);$cEntity->code='DC';$cEntity->save();
$processes=[];
for($i=0;$i<8;$i++) {
    $pipes=[];
    $process=proc_open([PHP_BINARY,__FILE__,'worker',$cEntity->id,$admin->id],[1=>['pipe','w'],2=>['pipe','w']],$pipes);
    $processes[]=[$process,$pipes];
}
$numbers=[];
foreach($processes as [$process,$pipes]) {
    $out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);
    fclose($pipes[1]);fclose($pipes[2]);$code=proc_close($process);
    if($code!==0)throw new RuntimeException('Worker failed: '.$err);
    $numbers[]=json_decode($out,true,512,JSON_THROW_ON_ERROR);
}
ok(count(array_unique(array_column($numbers,0)))===8 && count(array_unique(array_column($numbers,1)))===8,'8 concurrent writers receive distinct references');

$monthly=$rule; $monthly['id']=(string)Str::uuid();$monthly['period']='month';$monthly['format']='M/{code}/{annee}/{mois}/{type}/{sens}/{compteur}';$monthly['splitType']=true;$monthly['splitSens']=true;
saveSettings($admin,[$monthly],[$a,$b,$service]);
Carbon::setTestNow(Carbon::parse('2026-12-31 23:30:00','UTC'));
$jan=directCreate(['entite_numerotation_id'=>$a->id]);
ok(str_contains($jan['numeroOrganisationnel'],'/2027/01/') && str_ends_with($jan['numeroOrganisationnel'],'/0001'),'monthly period uses configured timezone');
$sortant=directCreate(['entite_numerotation_id'=>$a->id,'sens'=>'SORTANT']);
ok(str_contains($sortant['numeroOrganisationnel'],'/SORT/') && str_ends_with($sortant['numeroOrganisationnel'],'/0001'),'separate incoming and outgoing counters');
Carbon::setTestNow();

$current=api('GET','numbering/settings',$admin);
api('PUT','numbering/settings',$admin,['version'=>null,'settings'=>$current['settings'],'codes'=>[]],409);
ok(true,'stale configuration cannot overwrite new settings');

// An organisation counter collision rolls back the entire courrier insertion.
$collision=$monthly;$collision['id']=(string)Str::uuid();
$collision['start']=4;$collision['period']='year';$collision['format']=$rule['format'];$collision['splitType']=false;$collision['splitSens']=false;
saveSettings($admin,[$collision],[$a,$b,$service]);
$total=Courrier::count();
api('POST','courriers',$admin,payload(['entiteNumerotationId'=>$a->id]),422);
ok(Courrier::count()===$total,'ambiguous format is rejected atomically');

$disabled=api('GET','numbering/settings',$admin);
saveSettings($admin,[],[$a,$b,$service],false);
Carbon::setTestNow(Carbon::parse('2030-06-01','UTC'));
DB::table('numbering_issues')->insert(['kind'=>'system','number'=>'INT-2030-9999','courrier_id'=>(string)Str::uuid(),'actor_id'=>null,'snapshot'=>null,'created_at'=>now()]);
$large=directCreate();
ok($large['numero']==='INT-2030-10000','historical maximum and sequence beyond 9999');
Carbon::setTestNow();
$customType=api('POST','entite-types',$admin,['code'=>'section_test','libelleSingulier'=>'Section','libellePluriel'=>'Sections'],201);
$customEntity=api('POST','entites-organisationnelles',$admin,['nom'=>'Section test','type'=>'section_test'],201);
$section=Entity::find($customEntity['id']);$section->code='SEC';$section->save();
$sectionRule=$rule;$sectionRule['id']=(string)Str::uuid();$sectionRule['scopeType']='section_test';$sectionRule['format']='S/{code}/{annee}/{compteur}';
saveSettings($admin,[$sectionRule],[$section]);
$custom=api('POST','courriers',$admin,payload(['entiteNumerotationId'=>$section->id]),201);
ok(str_contains($custom['numeroOrganisationnel'],'S/SEC/'),'custom organisation level works end to end');
echo "ALL NUMBERING INTEGRATION TESTS PASSED\n";
