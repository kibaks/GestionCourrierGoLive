<?php
namespace App\Services;

use App\Models\{User, Courrier, Annotation, WorkflowEtape, Assignation, Notification};
use Illuminate\Support\Facades\{DB, Gate};
use Illuminate\Support\Str;

class CourrierOrientationService
{
    public function __construct(private CourrierAccessService $access, private WorkflowExecutionService $execution) {}

    public function targets(User $actor, Courrier $courrier)
    {
        if (!Gate::forUser($actor)->allows('assigner-courrier')) return collect();
        if (!$this->access->canUpdateCourrier($actor, $courrier) || in_array($courrier->statut, ['TRAITE','ARCHIVE'], true)) return collect();
        $users = User::where('actif', true)->where('id', '!=', $actor->id)->get();
        if ($actor->isSuperAdmin()) return $users;
        if ($actor->isSecretaire()) {
            $root = $this->access->secretaryRoot($actor);
            if (!$root || !$root->responsable_id) return collect();
            $role = $root->type === 'direction_generale' ? 'DIRECTEUR_GENERAL' : 'DIRECTEUR';
            return $users->filter(fn($u) => $u->id === $root->responsable_id && $u->role === $role);
        }
        if ($actor->role !== 'DIRECTEUR') return collect();
        $entities = app(OrganisationWorkflowService::class)->entities($actor);
        return $users->filter(fn($u) => !in_array($u->role, ['SUPER_ADMIN','DIRECTEUR_GENERAL','DIRECTEUR','SECRETAIRE'], true) && $entities->contains('id', $u->entite_id));
    }

    public function instructions(Courrier $courrier)
    {
        return Annotation::where('courrier_id', $courrier->id)
            ->whereIn('created_by', User::where('role', 'DIRECTEUR_GENERAL')->select('id'))
            ->whereNotNull('fichier_id')->whereNull('parent_id')
            ->where(fn($q) => $q->whereNull('decision')->orWhere('decision','!=','INFO'))
            ->orderByDesc('created_at')->get();
    }

    public function options(User $actor, Courrier $courrier): array
    {
        abort_unless($this->access->canViewCourrier($actor,$courrier),403);
        return [
            'requiresDgAnnotation' => $actor->role === 'DIRECTEUR',
            'targets' => $this->targets($actor,$courrier)->map(fn($u)=>['id'=>$u->id,'nom'=>$u->name,'role'=>$u->role])->values(),
            'instructions' => $this->instructions($courrier)->map(fn($a)=>['id'=>$a->id,'contenu'=>$a->contenu,'fichierId'=>$a->fichier_id,'page'=>$a->page])->values(),
        ];
    }

    public function orient(User $actor, Courrier $courrier, array $data): Assignation
    {
        abort_unless(Gate::forUser($actor)->allows('assigner-courrier'),403);
        return DB::transaction(function() use($actor,$courrier,$data) {
            $courrier = Courrier::whereKey($courrier->id)->lockForUpdate()->firstOrFail();
            $target = $this->targets($actor,$courrier)->firstWhere('id',$data['assigneA']);
            abort_unless($target,403,'Orientation non autorisée : choisissez le responsable de votre secrétariat ou une personne de votre direction.');
            $annotation = empty($data['dgAnnotationId']) ? null : $this->instructions($courrier)->firstWhere('id',$data['dgAnnotationId']);
            abort_if($actor->role === 'DIRECTEUR' && !$annotation,422,'Sélectionnez une instruction du DG dans le document avant d’affecter le courrier.');
            abort_if(!empty($data['dgAnnotationId']) && !$annotation,422,'Cette instruction du DG n’appartient pas à ce courrier.');
            $steps = WorkflowEtape::where('courrier_id',$courrier->id)->lockForUpdate()->get();
            $source = $steps->first(fn($s) => $s->assigne_a === $actor->id && in_array($s->statut,['EN_ATTENTE','EN_COURS'],true) && $this->execution->readiness($s,$steps)['ready']);

            // Reuse only an unstarted task; preserve completed work and the existing procedure.
            $destination = $steps->first(fn($s) => $s->assigne_a === $target->id && $s->statut === 'EN_ATTENTE' && !$s->date_debut);
            if (!$destination && $steps->contains(fn($s)=>$s->statut!=='TERMINE' && $s->id!==$source?->id)) {
                $destination = $steps->first(fn($s) => $source && $s->statut === 'EN_ATTENTE' && !$s->date_debut && ($s->declencheur['etapePrecedenteId']??null) === $source->id);
                abort_unless($destination,409,'Le circuit existant ne prévoit pas cette transmission. Aucune étape en cours n’a été remplacée.');
            }

            $previous = $destination?->declencheur['orientation'] ?? null;
            if ($previous && ($previous['actorId']??null) === $actor->id && ($previous['targetId']??null) === $target->id && ($previous['annotationId']??null) === ($annotation?->id)) {
                return Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$target->id)->firstOrFail();
            }
            if ($actor->role === 'DIRECTEUR' && !$source && $steps->isNotEmpty()) abort(409,'Votre étape doit être disponible avant de transmettre le courrier.');
            if (!$source && $destination) abort_unless($this->execution->readiness($destination,$steps)['ready'],409,'Le responsable précédent doit terminer son étape avant cette transmission.');
            $instruction = trim($data['instructions']??'');
            $evidence = ['actorId'=>$actor->id,'targetId'=>$target->id,'annotationId'=>$annotation?->id,'annotationText'=>$annotation?->contenu,'fichierId'=>$annotation?->fichier_id,'page'=>$annotation?->page,'instructions'=>$instruction,'createdAt'=>now()->toIso8601String()];
            if ($source) {
                $history=$source->responses??[];
                $history[]=['id'=>(string)Str::uuid(),'auteurId'=>$actor->id,'auteurNom'=>$actor->name,'message'=>'Transmission à '.$target->name.($annotation?' selon l’annotation du DG : '.$annotation->contenu:''),'createdAt'=>now()->toIso8601String()];
                $source->responses=$history;$source->statut='TERMINE';$source->date_debut??=now();$source->date_fin=now();$source->save();
            }
            $destination ??= new WorkflowEtape(['courrier_id'=>$courrier->id,'etape'=>$target->role==='DIRECTEUR_GENERAL'?'Examen et annotations du DG':($target->role==='DIRECTEUR'?'Prise en compte des instructions du DG':'Traitement selon les instructions du DG'),'statut'=>'EN_ATTENTE','cree_par'=>$actor->id,'ordre'=>($steps->max('ordre')??0)+1,'est_condition'=>false]);
            $oldTarget=$destination->assigne_a;
            $destination->assigne_a=$target->id;
            $trigger=$destination->declencheur??['type'=>'IMMEDIAT','circuit'=>'HIERARCHIQUE'];
            $trigger['orientation']=$evidence;$destination->declencheur=$trigger;
            $destination->save();
            $assignment=Assignation::firstOrCreate(['courrier_id'=>$courrier->id,'assigne_a'=>$target->id],['assigne_par'=>$actor->id,'date_assignation'=>now(),'date_echeance'=>$data['dateEcheance']??null,'instructions'=>$instruction,'statut'=>'EN_ATTENTE']);
            if ($oldTarget && $oldTarget!==$target->id && !WorkflowEtape::where('courrier_id',$courrier->id)->where('assigne_a',$oldTarget)->exists()) {
                Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$oldTarget)->where('instructions','[WORKFLOW] Circuit du courrier')->delete();
            }
            if ($actor->role==='DIRECTEUR') {
                $root=$this->access->secretaryRoot($actor);
                if ($root) {$courrier->direction=$root->nom;$courrier->save();}
            }
            if ($actor->role==='DIRECTEUR' && ($trigger['circuit']??null)==='HIERARCHIQUE') {
                $root=$this->access->secretaryRoot($actor);
                $secretary=$root?User::where('role','SECRETAIRE')->where('actif',true)->get()->first(fn($s)=>$this->access->secretaryRoot($s)?->id===$root->id):null;
                abort_unless($secretary,422,'Rattachez un secrétaire actif à cette direction avant de transmettre le courrier.');
                WorkflowEtape::create(['courrier_id'=>$courrier->id,'etape'=>'Clôture et classement','assigne_a'=>$secretary->id,'statut'=>'EN_ATTENTE','cree_par'=>$actor->id,'ordre'=>$destination->ordre+1,'est_condition'=>false,'declencheur'=>['type'=>'APRES_ETAPE','etapePrecedenteId'=>$destination->id,'circuit'=>'HIERARCHIQUE','phase'=>'CLOTURE']]);
                $last=WorkflowEtape::where('courrier_id',$courrier->id)->where('declencheur->phase','CLOTURE')->latest()->first();
                $this->execution->ensureAssignment($courrier,$last,$actor);
            }
            $fresh=WorkflowEtape::where('courrier_id',$courrier->id)->get();
            $this->execution->synchronize($courrier,$fresh);$this->execution->notifyReady($courrier,$fresh);
            $recipients=collect([$target]);
            if ($actor->role==='DIRECTEUR') {
                $root=$this->access->secretaryRoot($actor);
                if ($root) $recipients=$recipients->merge(User::where('role','SECRETAIRE')->where('actif',true)->get()->filter(fn($s)=>$this->access->secretaryRoot($s)?->id===$root->id));
            }
            foreach ($recipients->unique('id') as $recipient) {
                Notification::create(['userId'=>$recipient->id,'type'=>'workflow','title'=>'Courrier orienté — '.($courrier->numero_organisationnel?:$courrier->numero),'message'=>$actor->name.' a transmis le courrier à '.$target->name.'.','priority'=>'normal','read'=>false,'relatedId'=>$courrier->id,'relatedType'=>'courrier','actionUrl'=>'/courriers/'.$courrier->id.'?vue=annotations','metadata'=>['orientation'=>$evidence]]);
            }
            return $assignment;
        },3);
    }
}
