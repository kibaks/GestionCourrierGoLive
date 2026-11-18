<?php
$retainOrientationFixtures = true;
require __DIR__.'/orientation-integration.php';
use App\Models\{Courrier, CourrierFichier};
use Illuminate\Support\Facades\{Auth, Storage};
use Illuminate\Http\Request;
$controller = app(App\Http\Controllers\Api\CourrierFichierController::class);
$letter = Courrier::withoutEvents(fn()=>Courrier::create(['type'=>'INTERNE','sens'=>'ENTRANT','statut'=>'ENREGISTRE','expediteur'=>$unit->id,'destinataire'=>$dgUnit->id,'enregistre_par'=>$secretary->id,'direction'=>$dgUnit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Vérification accusé unique','numero'=>uniqid('AR-')]));
$paths = [];
try {
 Auth::setUser($secDG);
 $folder = CourrierFichier::create(['courrier_id'=>$letter->id,'nom'=>'Accusés de réception','type'=>'dossier','cree_par'=>$secDG->id]);
 $payload=['fileBase64'=>base64_encode("%PDF-1.4\n%%EOF"),'fileName'=>'AR_reception.pdf','estAccuseReception'=>true,'parentId'=>$folder->id];
 $first=$controller->store(Request::create('/', 'POST', $payload), $letter->id);
 check($first->getStatusCode()===201,'first receipt is stored');
 $one=$first->getData(true)['data'];
 $paths[]=CourrierFichier::findOrFail($one['id'])->chemin;
 check($one['estAccuseReception']===true && $one['parentId']===$folder->id,'receipt flag and folder are persisted');
 $again=$controller->store(Request::create('/', 'POST', $payload), $letter->id);
 check($again->getStatusCode()===200 && $again->getData(true)['data']['id']===$one['id'],'retry reuses the same receipt');
 $service->orient($secDG, $letter->fresh(), ['assigneA'=>$dg->id]);
 Auth::setUser($dg);
 $otherUser=$controller->store(Request::create('/', 'POST', $payload), $letter->id);
 check($otherUser->getData(true)['data']['id']===$one['id'],'another recipient reuses the same receipt');
 check(CourrierFichier::where('courrier_id',$letter->id)->where('type','fichier')->count()===1,'no duplicate receipt rows');
 Auth::setUser($secDG);
 check($controller->destroy($one['id'])->getStatusCode()===409,'original receipt is preserved');
 check($controller->destroy($folder->id)->getStatusCode()===409,'folder deletion cannot erase the original receipt');
 check($controller->update(Request::create('/', 'PATCH', ['estAccuseReception'=>false]),$one['id'])->getStatusCode()===409,'receipt cannot be reclassified to bypass uniqueness');
 CourrierFichier::whereKey($one['id'])->update(['est_accuse_reception'=>false]);
 $legacy=$controller->store(Request::create('/', 'POST', $payload),$letter->id);
 check($legacy->getData(true)['data']['id']===$one['id'],'legacy AR filename also prevents regeneration');
 echo "RECEPTION RECEIPT ONCE TESTS PASSED\n";
} finally {
 foreach($paths as $path) Storage::disk('courrier_fichiers')->delete($path);
 if($existing) Illuminate\Support\Facades\DB::rollBack();
 Auth::forgetUser();
}
