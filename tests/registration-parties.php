<?php
$retainOrientationFixtures=true;
require __DIR__.'/orientation-integration.php';
use App\Services\CourrierRegistrationService;
$registration=app(CourrierRegistrationService::class);
foreach ([$secDG,$secretary] as $actor) foreach (['ENTRANT','SORTANT'] as $sense) {
    $data=$registration->input($actor,['type'=>'INTERNE','sens'=>$sense,'expediteur'=>'Expéditeur falsifié','destinataire'=>'Destinataire choisi','enregistrePar'=>'autre','extraFields'=>['entiteEmetteurJson'=>'{"direction":"fausse"}','contenu'=>'Texte conservé']]);
    check($data['expediteur']===$actor->name&&$data['enregistrePar']===$actor->id,'authenticated account supplies sender for '.$actor->role.' '.$sense);
    $expected=app(App\Services\CourrierAccessService::class)->secretaryRoot($actor);
    check(in_array($expected->id,json_decode($data['extraFields']['entiteEmetteurJson'],true),true),'sender entity is resolved from account, not input');
    check($data['destinataire']==='Destinataire choisi'&&$data['extraFields']['contenu']==='Texte conservé','recipient and configured information remain editable');
}
$external=$registration->input($secDG,['type'=>'EXTERNE','sens'=>'ENTRANT','expediteur'=>'Externe','destinataire'=>'Direction Générale']);
check($external['expediteur']===$secDG->name,'external incoming uses the automatic account sender as requested');
$record=new App\Models\Courrier(['type'=>'INTERNE','expediteur'=>'Original','extra_fields'=>['entiteEmetteurJson'=>'{"direction":"original"}','autre'=>'avant']]);$record->syncOriginal();$record->exists=true;
$record->expediteur='Modifié';$record->extra_fields=['entiteEmetteurJson'=>'{}','autre'=>'après'];$registration->prepare($secretary,$record);
check($record->expediteur==='Original'&&$record->extra_fields['entiteEmetteurJson']==='{"direction":"original"}','editing preserves the original immutable sender');
check($record->extra_fields['autre']==='après','editing other configured fields remains possible');
if($existing)Illuminate\Support\Facades\DB::rollBack();
echo "REGISTRATION PARTIES TESTS PASSED\n";
