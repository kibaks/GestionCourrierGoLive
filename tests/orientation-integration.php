<?php
// Isolated SQLite database only; no production credentials or records are used.
putenv('APP_ENV=testing');putenv('DB_CONNECTION=sqlite');putenv('DB_DATABASE=:memory:');putenv('CACHE_STORE=array');putenv('CACHE_DRIVER=array');
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default'=>'sqlite','database.connections.sqlite.database'=>':memory:','cache.default'=>'array']);
use Illuminate\Support\Facades\{Schema,Gate,DB};
use Illuminate\Database\Schema\Blueprint;
use App\Models\{User,Courrier,Annotation,EntiteOrganisationnelle,WorkflowEtape,Assignation,Notification};
use App\Services\CourrierOrientationService;
foreach ([
 'users'=>['name','email','password','role','entite_id','direction','service'],
 'entites_organisationnelles'=>['nom','type','parent_id','responsable_id'],
 'courriers'=>['numero','numero_organisationnel','direction','service','statut','enregistre_par','priorite'],
 'annotations'=>['courrier_id','created_by','contenu','type','fichier_id','workflow_etape_id','parent_id','decision','kind','statut'],
 'workflow_etapes'=>['courrier_id','etape','assigne_a','statut','cree_par','commentaire','date_debut','date_fin','declencheur','responses'],
 'assignations'=>['courrier_id','assigne_a','assigne_par','date_assignation','date_echeance','statut','instructions'],
 'notifications'=>['userId','type','title','message','priority','relatedId','relatedType','actionUrl','metadata']
] as $table=>$columns) Schema::create($table,function(Blueprint $t)use($table,$columns){
 $t->string('id')->primary();foreach($columns as $column)$t->text($column)->nullable();
 if(in_array($table,['users','entites_organisationnelles']))$t->boolean('actif')->default(true);
 if($table==='entites_organisationnelles')$t->integer('ordre')->default(0);
 if($table==='annotations')$t->integer('page')->nullable();
 if($table==='workflow_etapes'){$t->integer('ordre')->default(0);$t->boolean('est_condition')->default(false);$t->integer('duree_estimee')->nullable();$t->string('action_si_vrai')->nullable();$t->string('action_si_faux')->nullable();}
 if($table==='notifications')$t->boolean('read')->default(false);$t->timestamps();
});
Gate::define('assigner-courrier',fn($user)=>true);
function check($ok,$message){if(!$ok)throw new RuntimeException($message);echo "PASS $message\n";}
function denied(callable $call,int $status){try{$call();throw new RuntimeException('Expected denial '.$status);}catch(Symfony\Component\HttpKernel\Exception\HttpException $e){check($e->getStatusCode()===$status,'denied '.$status);}}
function person($role,$unit,$name){return User::create(['name'=>$name,'email'=>$name.'@example.test','password'=>'test-password','role'=>$role,'entite_id'=>$unit->id,'direction'=>$unit->nom,'actif'=>true]);}
$dgUnit=EntiteOrganisationnelle::create(['nom'=>'Direction Générale','type'=>'direction_generale','actif'=>true]);
$unit=EntiteOrganisationnelle::create(['nom'=>'Direction juridique','type'=>'direction','parent_id'=>$dgUnit->id,'actif'=>true]);
$other=EntiteOrganisationnelle::create(['nom'=>'Direction financière','type'=>'direction','parent_id'=>$dgUnit->id,'actif'=>true]);
$dg=person('DIRECTEUR_GENERAL',$dgUnit,'dg');$director=person('DIRECTEUR',$unit,'director');$otherDirector=person('DIRECTEUR',$other,'otherdirector');
$dgUnit->update(['responsable_id'=>$dg->id]);$unit->update(['responsable_id'=>$director->id]);$other->update(['responsable_id'=>$otherDirector->id]);
$secDG=person('SECRETAIRE',$dgUnit,'secdg');$secretary=person('SECRETAIRE',$unit,'secretary');$otherSecretary=person('SECRETAIRE',$other,'othersecretary');$agent=person('AGENT',$unit,'agent');$outsider=person('AGENT',$other,'outsider');
$c=Courrier::withoutEvents(fn()=>Courrier::create(['numero'=>'TEST-001','direction'=>$unit->nom,'statut'=>'ENREGISTRE','enregistre_par'=>$secDG->id,'priorite'=>'NORMALE']));
$service=app(CourrierOrientationService::class);
check($service->targets($secDG,$c)->pluck('id')->all()===[$dg->id],'DG secretary targets only DG');
check($service->targets($secretary,$c)->pluck('id')->all()===[$director->id],'direction secretary targets only its director');
denied(fn()=>$service->orient($secDG,$c,['assigneA'=>$director->id]),403);
denied(fn()=>$service->orient($agent,$c,['assigneA'=>$outsider->id]),403);
$service->orient($secDG,$c,['assigneA'=>$dg->id]);
check(WorkflowEtape::where('courrier_id',$c->id)->count()===1,'orientation creates tracked task');
$service->orient($secDG,$c->fresh(),['assigneA'=>$dg->id]);
check(WorkflowEtape::count()===1,'retry does not duplicate orientation');
$step=WorkflowEtape::first();$step->update(['statut'=>'TERMINE']);
$c->update(['statut'=>'EN_TRAITEMENT']);
$service->orient($secretary,$c->fresh(),['assigneA'=>$director->id]);
denied(fn()=>$service->orient($director,$c->fresh(),['assigneA'=>$agent->id]),422);
$annotation=Annotation::create(['courrier_id'=>$c->id,'created_by'=>$dg->id,'contenu'=>'Analyser la conformité du dossier.','type'=>'NOTE','kind'=>'TEXTE','fichier_id'=>'document-test','page'=>1,'statut'=>'OUVERT']);
$foreign=Courrier::withoutEvents(fn()=>Courrier::create(['numero'=>'OTHER','statut'=>'ASSIGNE','enregistre_par'=>$secDG->id]));
$foreignAnnotation=Annotation::create(['courrier_id'=>$foreign->id,'created_by'=>$dg->id,'contenu'=>'Autre dossier','type'=>'NOTE','fichier_id'=>'other']);
denied(fn()=>$service->orient($director,$c->fresh(),['assigneA'=>$agent->id,'dgAnnotationId'=>$foreignAnnotation->id]),422);
denied(fn()=>$service->orient($director,$c->fresh(),['assigneA'=>$outsider->id,'dgAnnotationId'=>$annotation->id]),403);
$service->orient($director,$c->fresh(),['assigneA'=>$agent->id,'dgAnnotationId'=>$annotation->id,'instructions'=>'Préparer la note de synthèse.']);
$task=WorkflowEtape::where('assigne_a',$agent->id)->firstOrFail();
check($task->declencheur['orientation']['annotationId']===$annotation->id,'task linked to the selected DG annotation');
check($task->declencheur['orientation']['annotationText']===$annotation->contenu,'instruction snapshot retained');
check(Notification::where('userId',$secretary->id)->where('metadata->orientation->targetId',$agent->id)->exists(),'concerned secretary notified');
check(!Notification::where('userId',$otherSecretary->id)->exists(),'other direction secretary not notified');
check(app(App\Services\CourrierAccessService::class)->canViewCourrier($secretary,$c->fresh()),'secretary keeps tracking access');
check(WorkflowEtape::where('declencheur->phase','CLOTURE')->exists(),'validation and closure follow execution');
$count=Notification::count();$service->orient($director,$c->fresh(),['assigneA'=>$agent->id,'dgAnnotationId'=>$annotation->id]);check(Notification::count()===$count,'retry sends no duplicate notifications');
$c->update(['statut'=>'ARCHIVE']);denied(fn()=>$service->orient($secretary,$c->fresh(),['assigneA'=>$director->id]),403);
echo "ORIENTATION TESTS PASSED\n";
