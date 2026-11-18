<?php
$retainOrientationFixtures=true;
require __DIR__.'/orientation-integration.php';
use App\Services\CourrierRegistrationService;
$registration=app(CourrierRegistrationService::class);
foreach ([$secDG,$secretary] as $actor) foreach (['ENTRANT','SORTANT'] as $sense) {
    $data=$registration->input($actor,['type'=>'INTERNE','sens'=>$sense,'expediteur'=>'Expéditeur falsifié','destinataire'=>'Destinataire choisi','enregistrePar'=>'autre','extraFields'=>['entiteEmetteurJson'=>'{"direction":"fausse"}','contenu'=>'Texte conservé']]);
    check($data['expediteur']===App\Models\EntiteOrganisationnelle::find($actor->entite_id)->nom&&$data['enregistrePar']===$actor->id,'assigned entity supplies sender for '.$actor->role.' '.$sense);
    $expected=App\Models\EntiteOrganisationnelle::find($actor->entite_id);
    check(in_array($expected->id,json_decode($data['extraFields']['entiteEmetteurJson'],true),true),'sender entity is resolved from account, not input');
    check($data['destinataire']==='Destinataire choisi'&&$data['extraFields']['contenu']==='Texte conservé','recipient and configured information remain editable');
}
denied(fn()=>$registration->input($secretary,['type'=>'EXTERNE','sens'=>'ENTRANT','destinataire'=>'Direction Générale']),403);
denied(fn()=>$registration->input($secretary,['type'=>'EXTERNE','sens'=>'SORTANT','destinataire'=>'Institution externe']),403);
denied(fn()=>$registration->prepare($secretary,new App\Models\Courrier(['type'=>'EXTERNE'])),403);
$converted=new App\Models\Courrier(['type'=>'INTERNE']);$converted->exists=true;$converted->syncOriginal();$converted->type='EXTERNE';
denied(fn()=>$registration->prepare($secretary,$converted),403);
$external=$registration->input($secDG,['type'=>'EXTERNE','sens'=>'ENTRANT','expediteur'=>'Externe','destinataire'=>'Direction Générale']);
check($external['expediteur']===$dgUnit->nom,'external incoming uses DG entity instead of account name or role');
$record=new App\Models\Courrier(['type'=>'INTERNE','expediteur'=>'Original','extra_fields'=>['entiteEmetteurJson'=>'{"direction":"original"}','autre'=>'avant']]);$record->syncOriginal();$record->exists=true;
$record->expediteur='Modifié';$record->extra_fields=['entiteEmetteurJson'=>'{}','autre'=>'après'];$registration->prepare($secretary,$record);
check($record->expediteur==='Original'&&$record->extra_fields['entiteEmetteurJson']==='{"direction":"original"}','editing preserves the original immutable sender');
check($record->extra_fields['autre']==='après','editing other configured fields remains possible');
if($existing)Illuminate\Support\Facades\DB::rollBack();
echo "REGISTRATION PARTIES TESTS PASSED\n";
