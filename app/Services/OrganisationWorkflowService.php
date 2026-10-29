<?php
namespace App\Services;

use App\Models\{User, Courrier, EntiteOrganisationnelle, WorkflowEtape, Annotation};
use Illuminate\Support\Facades\{DB, Gate};
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OrganisationWorkflowService
{
    public function __construct(private CourrierAccessService $access, private WorkflowExecutionService $execution) {}
    private function fail(string $message): never { throw ValidationException::withMessages(['circuit'=>$message]); }

    public function canManage(User $actor,Courrier $courrier): bool
    {
        return Gate::forUser($actor)->allows('creer-workflow') && $this->access->canUpdateCourrier($actor,$courrier);
    }

    public function entities(User $actor)
    {
        $all=EntiteOrganisationnelle::where('actif',true)->orderBy('ordre')->orderBy('nom')->get();
        if($actor->isSuperAdmin())return $all;
        $root=$actor->entite_id?:$all->first(fn($e)=>$e->type==='direction'&&$e->nom===$actor->direction)?->id;
        if(!$root)return collect();$ids=[$root];
        do{$before=count($ids);foreach($all as$e)if(in_array($e->parent_id,$ids,true)&&!in_array($e->id,$ids,true))$ids[]=$e->id;}while(count($ids)>$before);
        return $all->whereIn('id',$ids)->values();
    }

    public function plan(User $actor,Courrier $courrier,string $entityId,?string $agentId,bool $automatic=false): array
    {
        if(!$automatic)abort_unless($this->canManage($actor,$courrier),403);
        if(!$automatic&&!$this->entities($actor)->contains('id',$entityId))abort(403,'Unité hors de votre périmètre.');
        $all=EntiteOrganisationnelle::where('actif',true)->get()->keyBy('id');$path=[];$seen=[];
        for($entity=$all->get($entityId);$entity;$entity=$all->get($entity->parent_id)) {
            if(isset($seen[$entity->id]))$this->fail('Cycle dans l’organigramme.');$seen[$entity->id]=true;array_unshift($path,$entity);
        }
        $dg=collect($path)->first(fn($e)=>$e->type==='direction_generale'&&mb_strtolower($e->nom)==='direction générale');
        if(!$dg)$this->fail('Choisissez une unité opérationnelle rattachée à la Direction Générale.');
        $secretary=User::where('role','SECRETAIRE')->where('entite_id',$dg->id)->where('actif',true)->orderBy('created_at')->first();
        if(!$secretary)$this->fail('Rattachez un secrétariat actif à la Direction Générale.');
        $plan=[];$add=function(string$name,User$person,string$phase,?string$unit=null)use(&$plan){$plan[]=['etape'=>$name,'assigneA'=>$person->id,'assigneNom'=>$person->name,'role'=>$person->role,'phase'=>$phase,'entiteNom'=>$unit];};
        $add('Contrôle et orientation du secrétariat',$secretary,'SECRETARIAT',$dg->nom);
        $validator=null;
        foreach($path as$entity) {
            $person=$entity->responsable_id?User::whereKey($entity->responsable_id)->where('actif',true)->first():null;
            if(!$person)$this->fail('Responsable actif manquant : '.$entity->nom);
            if($person->entite_id!==$entity->id)$this->fail('Rattachement du responsable à corriger : '.$entity->nom);
            $phase=$entity->id===$dg->id?'ORIENTATION':'INSTRUCTION';
            $add(($phase==='ORIENTATION'?'Orientation DG':'Instruction — '.$entity->nom),$person,$phase,$entity->nom);
            if($person->role==='DIRECTEUR')$validator=$person;
        }
        if($agentId) {
            $agent=User::whereKey($agentId)->where('actif',true)->where('role','AGENT')->first();
            if(!$agent)$this->fail('Choisissez un agent actif.');
            $ids=[$entityId];do{$n=count($ids);foreach($all as$entity)if(in_array($entity->parent_id,$ids,true)&&!in_array($entity->id,$ids,true))$ids[]=$entity->id;}while(count($ids)>$n);
            if(!in_array($agent->entite_id,$ids,true))$this->fail('L’agent doit appartenir à l’unité destinataire ou à ses unités rattachées.');
            if(end($plan)['assigneA']!==$agent->id)$add('Analyse et préparation de la réponse',$agent,'EXECUTION',$all->get($agent->entite_id)?->nom);
        }
        $validator??=User::whereKey($dg->responsable_id)->where('actif',true)->first();
        $add('Validation du traitement et de la réponse',$validator,'VALIDATION',$validator->direction);
        $add('Clôture et classement du courrier',$secretary,'CLOTURE',$dg->nom);
        return $plan;
    }

    public function create(User$actor,Courrier$courrier,string$entityId,?string$agentId,?array$procedure=null): void
    {
        DB::transaction(function()use($actor,$courrier,$entityId,$agentId,$procedure){
            $courrier=Courrier::whereKey($courrier->id)->lockForUpdate()->firstOrFail();
            $key=hash('sha256',json_encode([$entityId,$agentId]));$existing=WorkflowEtape::where('courrier_id',$courrier->id)->lockForUpdate()->get();
            if($existing->isNotEmpty()) {
                if($existing->contains(fn($s)=>($s->declencheur['planKey']??null)===$key))return;
                abort(409,'Un workflow existe déjà : il est conservé. Utilisez ses étapes existantes.');
            }
            if(in_array($courrier->statut,['TRAITE','ARCHIVE'],true))$this->fail('Le courrier est déjà clôturé ou archivé.');
            $plan=$procedure?ProcedureSettings::preview($procedure,$actor,$courrier->priorite):$this->plan($actor,$courrier,$entityId,$agentId);$previous=null;$circuit=(string)Str::uuid();
            foreach($plan as$index=>$item) {
                $step=WorkflowEtape::create(['courrier_id'=>$courrier->id,'etape'=>$item['etape'],'assigne_a'=>$item['assigneA'],'statut'=>'EN_ATTENTE','cree_par'=>$actor->id,'ordre'=>$index+1,'est_condition'=>false,'duree_estimee'=>$item['dureeEstimee']??null,'declencheur'=>['type'=>$previous?'APRES_ETAPE':'IMMEDIAT','etapePrecedenteId'=>$previous,'circuit'=>'ARMP','circuitId'=>$circuit,'phase'=>$item['phase'],'procedureId'=>$procedure['id']??null,'procedureName'=>$procedure['nom']??null,'procedureVersion'=>$procedure['_version']??null,'hoursByUrgency'=>$item['hoursByUrgency']??null,'circulation'=>$procedure['circulation']??['notifyNext'=>true,'deadlineOnReopen'=>'CONSERVER'],'targetEntityId'=>$entityId,'planKey'=>$key]]);
                $this->execution->ensureAssignment($courrier,$step,$actor);$previous=$step->id;
            }
            $steps=WorkflowEtape::where('courrier_id',$courrier->id)->get();$this->execution->synchronize($courrier,$steps);$this->execution->notifyReady($courrier,$steps);
        },3);
    }

    public function overview(User$actor,Courrier$courrier): array
    {
        abort_unless($this->access->canViewCourrier($actor,$courrier),403);
        $manager=$this->canManage($actor,$courrier);$steps=WorkflowEtape::where('courrier_id',$courrier->id)->orderBy('ordre')->orderBy('created_at')->get();
        $annotations=Annotation::where('courrier_id',$courrier->id)->whereNotNull('workflow_etape_id')->orderBy('created_at')->get()->groupBy('workflow_etape_id');
        $people=User::whereIn('id',$steps->pluck('assigne_a')->merge($annotations->flatten(1)->pluck('created_by'))->filter()->unique())->get()->keyBy('id');
        $entities=$manager?$this->entities($actor):collect();
        $annotationPolicy=app(AnnotationActionPolicy::class);$annotationReason=$annotationPolicy->reason($actor,$courrier);
        return ['canConfigureProcedures'=>$actor->isSuperAdmin(),'procedureName'=>$steps->first()?->declencheur['procedureName']??null,'canAnnotate'=>$annotationReason===null,'annotationBlockReason'=>$annotationReason,'reference'=>$courrier->numero_organisationnel?:$courrier->numero,'statut'=>$courrier->statut,'canManage'=>$manager,'steps'=>$steps->map(function($step)use($actor,$manager,$steps,$people,$courrier,$annotations){$ready=$this->execution->readiness($step,$steps);$canAct=($step->assigne_a===$actor->id||$actor->isSuperAdmin())&&$courrier->statut!=='ARCHIVE';return $step->toArray()+['timing'=>$this->execution->timing($step,$courrier,$steps),'annotations'=>($annotations->get($step->id)??collect())->map(fn($a)=>['id'=>$a->id,'contenu'=>$a->contenu,'auteurNom'=>$people->get($a->created_by)?->name??'Utilisateur','createdAt'=>$a->created_at?->toIso8601String()])->values(),'assigneNom'=>$people->get($step->assigne_a)?->name??'Non affecté','ready'=>$ready['ready'],'skipped'=>$ready['skipped'],'blockedReason'=>$ready['reason'],'canAct'=>$canAct,'canReopen'=>$this->execution->canManageStep($actor,$step,$courrier)&&$courrier->statut!=='ARCHIVE'&&$step->statut==='REJETE'];})->values(),
            'entities'=>$entities->map(fn($e)=>['id'=>$e->id,'nom'=>$e->nom,'parentId'=>$e->parent_id,'type'=>$e->type]),
            'agents'=>$manager?User::where('actif',true)->where('role','AGENT')->whereIn('entite_id',$entities->pluck('id'))->get()->map(fn($u)=>['id'=>$u->id,'nom'=>$u->name,'entiteId'=>$u->entite_id]):[]];
    }
}
