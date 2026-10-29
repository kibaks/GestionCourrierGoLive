<?php
namespace App\Services;
use App\Models\{Courrier,WorkflowEtape,Assignation,User};

/** Observations only: a missing workflow never becomes an invented percentage or blockage. */
class OrganisationProgressService
{
    public function performance(int $processed,int $assigned): ?int { return $assigned>0?(int)round(100*$processed/$assigned):null; }

    private function branch(WorkflowEtape $s,$steps,array $seen=[]): array
    {
        if(isset($seen[$s->id]))return [false,false];$seen[$s->id]=true;
        foreach($steps->where('est_condition',true)as$c){if(!in_array($s->id,[$c->action_si_vrai,$c->action_si_faux],true))continue;[$ready,$skipped]=$this->branch($c,$steps,$seen);if($skipped)return [false,true];if($c->statut!=='TERMINE')return [false,false];$decision=null;foreach(array_reverse($c->responses??[])as$r)if(in_array($r['decision']??null,['AVIS_FAVORABLE','A_REVOIR'],true)){$decision=$r['decision'];break;}if(!$decision)return [false,false];if(($decision==='AVIS_FAVORABLE'?$c->action_si_vrai:$c->action_si_faux)!==$s->id)return [false,true];}
        $t=$s->declencheur??[];if(in_array($t['type']??'', ['APRES_ETAPE','CONDITION'],true)){$p=$steps->firstWhere('id',$t['etapePrecedenteId']??'');if(!$p)return [false,false];[$ready,$skip]=$this->branch($p,$steps,$seen);if($skip)return [false,true];if($p->statut!=='TERMINE')return [false,false];}
        if(($t['type']??'')==='DATE'){try{if(empty($t['dateDeclenchement'])||now()->lt(\Carbon\Carbon::parse($t['dateDeclenchement'])))return [false,false];}catch(\Throwable){return [false,false];}}
        return [true,false];
    }

    public function records(Courrier $courrier,$steps,$assignments): array
    {
        $closed=in_array($courrier->statut,['TRAITE','ARCHIVE'],true);$relevant=$steps->filter(fn($s)=>!$this->branch($s,$steps)[1]);
        $progress=$closed?100:($relevant->isEmpty()?null:(int)floor(100*$relevant->where('statut','TERMINE')->count()/$relevant->count()));
        $stage=['ENREGISTRE'=>'enregistré','ASSIGNE'=>'affecté','EN_TRAITEMENT'=>'en traitement','EN_ATTENTE_DG'=>'en attente de la DG','ORIENTE_DG'=>'orienté vers la DG','ORIENTE_DIRECTEUR'=>'orienté vers le directeur'][$courrier->statut]??strtolower($courrier->statut);
        $ids=$steps->pluck('assigne_a')->merge($assignments->pluck('assigne_a'))->filter()->unique();$rows=[];
        foreach($ids as$id){$own=$relevant->where('assigne_a',$id);$active=$own->filter(fn($s)=>$s->statut!=='TERMINE'&&$this->branch($s,$steps)[0]);$rejected=!$closed&&$active->contains('statut','REJETE');$current=!$closed&&$active->isNotEmpty();$openAssignments=$assignments->where('assigne_a',$id)->where('statut','!=','TERMINE');$assignment=$openAssignments->filter(fn($a)=>$a->date_echeance!==null)->sortBy('date_echeance')->first()??$openAssignments->first();$deadline=$assignment?->date_echeance;$assigned=$assignment?->date_assignation;
            if($steps->isNotEmpty()){
                $deadlines=$active->map(fn($s)=>app(WorkflowExecutionService::class)->timing($s,$courrier,$steps)['deadline'])->filter()->sort()->values();
                $deadline=$deadlines->isNotEmpty()?\Carbon\Carbon::parse($deadlines->first()):null;
                $available=$active->first()?->declencheur['availableAt']??null;
                if($available)$assigned=\Carbon\Carbon::parse($available);
            }
            $late=!$closed&&$deadline&&$deadline->isPast()&&($steps->isEmpty()||$current);$state=$closed?'TERMINE':($rejected?'BLOQUE':($late?'RETARD':($current?'EN_COURS':($steps->isEmpty()?'AFFECTE':'EN_ATTENTE'))));
            if(!$closed&&$steps->isNotEmpty()&&$own->isNotEmpty()&&$own->every(fn($s)=>$s->statut==='TERMINE'))$state='ETAPE_TERMINEE';
            if(!$closed&&$steps->isEmpty()&&$assignments->where('assigne_a',$id)->isNotEmpty()&&$assignments->where('assigne_a',$id)->every(fn($a)=>$a->statut==='TERMINE'))$state='ETAPE_TERMINEE';
            $step=$active->first();$reason=$rejected?($active->firstWhere('statut','REJETE')?->commentaire?:'Étape rejetée, correction attendue.'):($late?'Échéance dépassée.':($current?'Étape disponible chez ce responsable.':($closed?'Courrier clôturé.':($steps->isEmpty()?'Courrier '.$stage.' : affectation existante, circuit non défini.':'En attente de l’étape précédente.'))));
            $actorTotal=$own->count();$actorDone=$own->where('statut','TERMINE')->count();
            if($steps->isEmpty()||$steps->where('assigne_a',$id)->isEmpty()){$ownAssignments=$assignments->where('assigne_a',$id);$actorTotal=$ownAssignments->isNotEmpty()?1:0;$actorDone=$actorTotal&&$ownAssignments->every(fn($a)=>$a->statut==='TERMINE')?1:0;}
            $rows[]=['userId'=>$id,'courrierId'=>$courrier->id,'reference'=>$courrier->numero_organisationnel?:$courrier->numero,'objet'=>strip_tags($courrier->objet??''),'courrierStatut'=>$courrier->statut,'actorTasksDone'=>$actorDone,'actorTasksTotal'=>$actorTotal,'actorProgress'=>$actorTotal?(int)floor(100*$actorDone/$actorTotal):null,'progress'=>$progress,'completedSteps'=>$relevant->where('statut','TERMINE')->count(),'totalSteps'=>$relevant->count(),'state'=>$state,'isCurrent'=>$current,'isBlocked'=>$rejected,'isLate'=>(bool)$late,'step'=>$step?->etape,'reason'=>$reason,'assignedAt'=>$assigned?->toIso8601String(),'deadline'=>$deadline?->toIso8601String(),'waitingSince'=>($step?->date_debut??$assigned)?->toIso8601String()];
        }
        return $rows;
    }

    public function summary(User $actor,CourrierAccessService $access): array
    {
        $people=[];$total=0;$blocked=[];$late=[];
        $access->getAccessibleCourriersQuery($actor)->reorder()->orderBy('id')->chunkById(200,function($courriers)use(&$people,&$total,&$blocked,&$late){
            $steps=WorkflowEtape::whereIn('courrier_id',$courriers->pluck('id'))->orderBy('ordre')->get()->groupBy('courrier_id');$assignments=Assignation::whereIn('courrier_id',$courriers->pluck('id'))->get()->groupBy('courrier_id');
            foreach($courriers as$c){$total++;foreach($this->records($c,$steps->get($c->id,collect()),$assignments->get($c->id,collect()))as$row){$id=$row['userId'];$people[$id]??=['userId'=>$id,'current'=>0,'blocked'=>0,'late'=>0,'done'=>0,'assigned'=>0,'tasksDone'=>0,'tasksTotal'=>0,'processed'=>0];$people[$id]['assigned']++;$people[$id]['processed']+=(int)in_array($row['courrierStatut'],['TRAITE','ARCHIVE'],true);$people[$id]['tasksDone']+=$row['actorTasksDone'];$people[$id]['tasksTotal']+=$row['actorTasksTotal'];$people[$id]['current']+=(int)$row['isCurrent'];$people[$id]['blocked']+=(int)$row['isBlocked'];$people[$id]['late']+=(int)$row['isLate'];$people[$id]['done']+=(int)in_array($row['state'],['TERMINE','ETAPE_TERMINEE'],true);if($row['isBlocked'])$blocked[$c->id]=true;if($row['isLate'])$late[$c->id]=true;}}
        });
        return ['generatedAt'=>now()->toIso8601String(),'scope'=>'courriers-accessibles','totalCourriers'=>$total,'blockedCourriers'=>count($blocked),'lateCourriers'=>count($late),'people'=>array_values(array_map(fn($p)=>$p+['performance'=>$this->performance($p['processed'],$p['assigned']),'remaining'=>$p['assigned']-$p['processed'],'progress'=>$p['tasksTotal']?(int)floor(100*$p['tasksDone']/$p['tasksTotal']):null],$people))];
    }

    public function details(User$actor,User$target,CourrierAccessService$access,int$page):array
    {
        $query=$access->getAccessibleCourriersQuery($actor)->where(function($q)use($target){$q->whereIn('id',Assignation::where('assigne_a',$target->id)->select('courrier_id'))->orWhereIn('id',WorkflowEtape::where('assigne_a',$target->id)->select('courrier_id'));});
        $pager=$query->paginate(20,['*'],'page',$page);$steps=WorkflowEtape::whereIn('courrier_id',$pager->getCollection()->pluck('id'))->orderBy('ordre')->get()->groupBy('courrier_id');$assignments=Assignation::whereIn('courrier_id',$pager->getCollection()->pluck('id'))->get()->groupBy('courrier_id');$items=[];
        foreach($pager as$c)foreach($this->records($c,$steps->get($c->id,collect()),$assignments->get($c->id,collect()))as$row)if($row['userId']===$target->id)$items[]=$row;
        return ['user'=>['id'=>$target->id,'nom'=>$target->name,'role'=>$target->role],'items'=>$items,'pagination'=>['page'=>$pager->currentPage(),'pages'=>$pager->lastPage(),'total'=>$pager->total()]];
    }
}
