<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CourrierAccessService;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Builder;

class WorkspaceController extends Controller
{
    public function index(Request $request, CourrierAccessService $access)
    {
        $this->authorize('voir-courriers');
        $v=$request->validate([
            'q'=>'nullable|string|max:200', 'sens'=>'nullable|in:ENTRANT,SORTANT', 'type'=>'nullable|in:INTERNE,EXTERNE',
            'statut'=>'nullable|in:ENREGISTRE,EN_ATTENTE_DG,ORIENTE_DG,ORIENTE_DIRECTEUR,EN_TRAITEMENT,ASSIGNE,TRAITE,ARCHIVE',
            'priorite'=>'nullable|in:BASSE,NORMALE,HAUTE,URGENTE', 'view'=>'nullable|in:all,mine,active,done,urgent,overdue',
            'page'=>'nullable|integer|min:1', 'per_page'=>'nullable|integer|min:1|max:50', 'sort'=>'nullable|in:newest,oldest',
        ]);
        $user=$request->user();
        $base=$access->getAccessibleCourriersQuery($user)->reorder();
        $stats=(clone $base)->selectRaw("COUNT(*) as total, COALESCE(SUM(statut NOT IN ('TRAITE','ARCHIVE')),0) as active, COALESCE(SUM(statut IN ('TRAITE','ARCHIVE')),0) as done, COALESCE(SUM(priorite='URGENTE' AND statut NOT IN ('TRAITE','ARCHIVE')),0) as urgent")->first();
        $query=clone $base;
        $overdue=(clone $base)->whereNotIn('statut',['TRAITE','ARCHIVE'])->whereHas('assignations',fn(Builder $q)=>$q->where('date_echeance','<',now())->whereNotIn('statut',['TERMINE','ANNULE']));
        $overdueCount=(clone $overdue)->count();
        $flows=(clone $base)->selectRaw('sens, COUNT(*) as count')->groupBy('sens')->pluck('count','sens');
        $statuses=(clone $base)->selectRaw('statut, COUNT(*) as count')->groupBy('statut')->pluck('count','statut');
        $start=now()->startOfMonth()->subMonths(5);
        $monthly=(clone $base)->where('date_enregistrement','>=',$start)->where('date_enregistrement','<',now()->startOfMonth()->addMonth())
            ->selectRaw("DATE_FORMAT(date_enregistrement, '%Y-%m') as month, COUNT(*) as count")->groupBy('month')->pluck('count','month');
        $activity=[];
        for($i=0;$i<6;$i++) { $month=$start->copy()->addMonths($i)->format('Y-m'); $activity[]=['month'=>$month,'count'=>(int)($monthly[$month]??0)]; }
        if (!empty($v['q'])) {
            $term='%'.addcslashes(trim($v['q']), '%_\\').'%';
            $query->where(function(Builder $q) use($term) { foreach(['numero','numero_organisationnel','objet','expediteur','destinataire'] as $field) $q->orWhere($field,'like',$term); });
        }
        foreach(['sens','type','statut','priorite'] as $key) if(!empty($v[$key])) $query->where($key,$v[$key]);
        match($v['view']??'all') {
            'mine'=>$query->where('enregistre_par',$user->id),
            'active'=>$query->whereNotIn('statut',['TRAITE','ARCHIVE']),
            'done'=>$query->whereIn('statut',['TRAITE','ARCHIVE']),
            'urgent'=>$query->where('priorite','URGENTE')->whereNotIn('statut',['TRAITE','ARCHIVE']),
            'overdue'=>$query->whereNotIn('statut',['TRAITE','ARCHIVE'])->whereHas('assignations',fn(Builder $q)=>$q->where('date_echeance','<',now())->whereNotIn('statut',['TERMINE','ANNULE'])),
            default=>null,
        };
        $direction=($v['sort']??'newest')==='oldest'?'asc':'desc';
        $page=$query->orderBy('date_enregistrement',$direction)->orderBy('id',$direction)->paginate($v['per_page']??25);
        return response()->json(['data'=>[
            'items'=>$page->items(), 'pagination'=>['page'=>$page->currentPage(),'pages'=>$page->lastPage(),'total'=>$page->total(),'perPage'=>$page->perPage()],
            'stats'=>['total'=>(int)$stats->total,'active'=>(int)$stats->active,'done'=>(int)$stats->done,'urgent'=>(int)$stats->urgent,'overdue'=>$overdueCount,'incoming'=>(int)($flows['ENTRANT']??0),'outgoing'=>(int)($flows['SORTANT']??0)],
            'analytics'=>['monthly'=>$activity,'statuses'=>$statuses],
        ]]);
    }
}
