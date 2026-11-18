<?php
namespace App\Services;

use App\Models\{User, Courrier, Annotation, WorkflowEtape, Assignation, Notification};
use Illuminate\Support\Facades\{DB, Gate};
use Illuminate\Support\Str;

class CourrierOrientationService
{
    public function __construct(private CourrierAccessService $access, private WorkflowExecutionService $execution) {}

    private function activeStep(User $actor, Courrier $courrier, $steps = null): ?WorkflowEtape
    {
        $steps ??= WorkflowEtape::where('courrier_id', $courrier->id)->orderBy('ordre')->get();
        return $steps->first(fn($step) => $step->assigne_a === $actor->id
            && in_array($step->statut, ['EN_ATTENTE','EN_COURS'], true)
            && $this->execution->readiness($step, $steps)['ready']);
    }

    public function alreadyForwarded(User $actor, Courrier $courrier, $steps = null): bool
    {
        $steps ??= WorkflowEtape::where('courrier_id', $courrier->id)->orderBy('ordre')->get();
        // A later reception or instruction is a distinct, legitimate circuit step.
        return !$this->activeStep($actor, $courrier, $steps)
            && $steps->contains(fn($step) => ($step->declencheur['orientation']['actorId'] ?? null) === $actor->id);
    }

    private function outgoingDirector(User $actor, Courrier $courrier): bool
    {
        if ($actor->role !== 'DIRECTEUR' || $courrier->type !== 'INTERNE') return false;
        $source = $this->activeStep($actor, $courrier);
        $phase = $source?->declencheur['phase'] ?? null;
        if ($phase === 'TRANSMISSION_DIRECTION') return true;
        // An incoming DG instruction is a new processing phase, even when the
        // correspondence was originally emitted by this director's entity.
        if (in_array($phase, ['INSTRUCTION','EXECUTION','VALIDATION','CLOTURE'], true)
            || !empty($source?->declencheur['orientation']['annotationId'])) return false;
        return app(CourrierPartyService::class)->sense($courrier, $actor) === 'SORTANT';
    }

    private function validatedDgAncestor(?WorkflowEtape $source, $steps): ?WorkflowEtape
    {
        $seen=[];
        while ($source && !isset($seen[$source->id])) {
            $seen[$source->id]=true;
            if (($source->declencheur['phase'] ?? null)==='ORIENTATION'
                && $source->statut==='TERMINE' && User::find($source->assigne_a)?->role==='DIRECTEUR_GENERAL') return $source;
            $source=$steps->firstWhere('id',$source->declencheur['etapePrecedenteId'] ?? '');
        }
        return null;
    }

    private function requiresDgAnnotation(User $actor, Courrier $courrier): bool
    {
        if ($actor->role!=='DIRECTEUR' || $this->outgoingDirector($actor,$courrier)) return false;
        $steps=WorkflowEtape::where('courrier_id',$courrier->id)->orderBy('ordre')->get();
        $source=$this->activeStep($actor,$courrier,$steps);
        $receiptEntity=$source?->declencheur['receivingEntityId']??null;
        if ($courrier->type==='INTERNE' && $receiptEntity && $this->access->secretaryRoot($actor)?->id===$receiptEntity
            && app(CourrierPartyService::class)->entity($courrier,'expediteur')?->type==='direction_generale') return false;
        $next=$source ? $steps->first(fn($step)=>($step->declencheur['etapePrecedenteId']??null)===$source->id && $step->statut==='EN_ATTENTE') : null;
        // Continuing a fixed hierarchy task already validated by the DG is not a new delegation.
        if ($next && in_array($next->declencheur['phase']??null,['INSTRUCTION','EXECUTION'],true)
            && $this->validatedDgAncestor($source,$steps)) return false;
        return true;
    }

    public function targets(User $actor, Courrier $courrier)
    {
        if (!Gate::forUser($actor)->allows('assigner-courrier')) return collect();
        try { app(CourrierPartyService::class)->assertDistinct($courrier); }
        catch (\Illuminate\Validation\ValidationException) { return collect(); }
        if ($courrier->type === 'INTERNE' && (!app(CourrierPartyService::class)->entity($courrier, 'expediteur') || !app(CourrierPartyService::class)->entity($courrier, 'destinataire'))) return collect();
        if (!$this->access->canUpdateCourrier($actor, $courrier) || in_array($courrier->statut, ['TRAITE','ARCHIVE'], true)) return collect();
        if ($this->alreadyForwarded($actor, $courrier)) return collect();
        $users = User::where('actif', true)->where('id', '!=', $actor->id)->get();
        if ($actor->isSuperAdmin()) {
            $steps=WorkflowEtape::where('courrier_id',$courrier->id)->orderBy('ordre')->get();
            if ($steps->isNotEmpty()) {
                $source=$this->activeStep($actor,$courrier,$steps);
                $available=$steps->filter(fn($step)=>$step->statut==='EN_ATTENTE' && !$step->date_debut
                    && ($source ? ($step->declencheur['etapePrecedenteId']??null)===$source->id : $this->execution->readiness($step,$steps)['ready']));
                return $users->whereIn('id',$available->pluck('assigne_a'));
            }
            if ($courrier->type==='INTERNE') {
                $recipient=app(CourrierPartyService::class)->entity($courrier,'destinataire');
                $dg=collect(app(CourrierPartyService::class)->path($recipient))->first(fn($entity)=>$entity->type==='direction_generale');
                return $users->where('id',$dg?->responsable_id);
            }
            return $users;
        }
        if ($actor->isSecretaire()) {
            $root = $this->access->secretaryRoot($actor);
            if (!$root || !$root->responsable_id) return collect();
            $responsibleRole=$root->type==='direction_generale'?'DIRECTEUR_GENERAL':'DIRECTEUR';
            $responsible=$users->first(fn($person)=>$person->id===$root->responsable_id && $person->role===$responsibleRole);
            if (!$responsible) return collect();
            $parties = app(CourrierPartyService::class);
            $recipient = $parties->entity($courrier, 'destinataire');
            if (!$recipient && !($courrier->type === 'EXTERNE' && $courrier->sens === 'SORTANT')) return collect();
            $path = $parties->path($recipient);
            $pathIds = array_map(fn($entity) => $entity->id, $path);
            $steps = WorkflowEtape::where('courrier_id', $courrier->id)->orderBy('ordre')->get();
            $source = $this->activeStep($actor, $courrier, $steps);
            if ($source && in_array($source->declencheur['phase'] ?? null, ['VALIDATION','CLOTURE'], true)) return collect();
            // Preserve the sender's validation before handing an outgoing letter over.
            $sender = $parties->entity($courrier, 'expediteur');
            $senderPath = array_map(fn($entity) => $entity->id, $parties->path($sender));
            if ($root->type === 'direction' && in_array($root->id, $senderPath, true) && !in_array($root->id, $pathIds, true)) {
                if ($courrier->type === 'INTERNE' && !$source && $steps->contains(fn($step) => $step->statut !== 'TERMINE')) return collect();
                return $users->where('id', $root->responsable_id);
            }
            $next = $source ? $steps->first(fn($step) => ($step->declencheur['etapePrecedenteId'] ?? null) === $source->id && $step->statut === 'EN_ATTENTE') : null;
            if (!$next && $steps->isNotEmpty()) $next = $steps->first(fn($step) => $step->assigne_a !== $actor->id && $step->statut === 'EN_ATTENTE' && $this->execution->readiness($step, $steps)['ready']);
            if ($next) {
                $person = $users->firstWhere('id', $next->assigne_a);
                return $person && $person->id===$responsible->id ? collect([$responsible]) : collect();
            }
            if ($steps->contains(fn($step) => $step->statut !== 'TERMINE')) return collect();
            return collect([$responsible]);
        }
        if ($actor->role !== 'DIRECTEUR') return collect();
        $steps = WorkflowEtape::where('courrier_id', $courrier->id)->orderBy('ordre')->get();
        $source = $this->activeStep($actor, $courrier, $steps);
        if ($steps->isNotEmpty() && (!$source || in_array($source->declencheur['phase'] ?? null, ['VALIDATION','CLOTURE'], true))) return collect();
        if ($this->outgoingDirector($actor, $courrier)) {
            $recipient = app(CourrierPartyService::class)->entity($courrier, 'destinataire');
            if (!$recipient || $recipient->type !== 'direction_generale') return collect();
            return $users->filter(fn($person) => $person->role === 'SECRETAIRE' && $person->entite_id === $recipient->id);
        }
        $entities = app(OrganisationWorkflowService::class)->entities($actor);
        $parties = app(CourrierPartyService::class);
        $recipient = $parties->entity($courrier, 'destinataire');
        if (!$recipient) return collect();
        $entities = $entities->filter(fn($entity) => in_array($recipient->id, array_map(fn($e) => $e->id, $parties->path($entity)), true) || in_array($entity->id, array_map(fn($e) => $e->id, $parties->path($recipient)), true));
        $candidates = $users->filter(fn($u) => !in_array($u->role, ['SUPER_ADMIN','DIRECTEUR_GENERAL','DIRECTEUR','SECRETAIRE'], true) && $entities->contains('id', $u->entite_id));
        $next = $source ? $steps->first(fn($step) => ($step->declencheur['etapePrecedenteId'] ?? null) === $source->id && $step->statut === 'EN_ATTENTE') : null;
        if ($next && !in_array($next->declencheur['phase'] ?? null, ['VALIDATION','CLOTURE'], true)) return $candidates->where('id', $next->assigne_a);
        return $candidates;
    }

    public function instructions(Courrier $courrier)
    {
        return Annotation::where('courrier_id', $courrier->id)
            ->whereIn('created_by', User::where('role', 'DIRECTEUR_GENERAL')->select('id'))
            ->whereNotNull('fichier_id')->whereNull('parent_id')
            ->where(fn($q) => $q->whereNull('decision')->orWhere('decision','!=','INFO'))
            ->orderByDesc('created_at')->get();
    }

    private function unavailableReason(User $actor, Courrier $courrier): string
    {
        if ($courrier->statut === 'TRAITE') return 'Ce courrier est déjà traité. Consultez son circuit pour voir les étapes réalisées.';
        if ($courrier->statut === 'ARCHIVE') return 'Ce courrier est archivé. Aucune nouvelle orientation n’est attendue.';
        if ($this->alreadyForwarded($actor, $courrier)) return 'Ce courrier a déjà été orienté par votre compte. Le prochain responsable doit poursuivre le circuit.';
        $steps = WorkflowEtape::where('courrier_id', $courrier->id)->orderBy('ordre')->get();
        $ready = $steps->filter(fn($step) => in_array($step->statut, ['EN_ATTENTE','EN_COURS','REJETE'], true)
            && $this->execution->readiness($step, $steps)['ready']);
        $rejected = $ready->firstWhere('statut', 'REJETE');
        if ($rejected) return 'Une étape du circuit a été rejetée. Consultez le motif et corrigez cette étape avant une nouvelle transmission.';
        $source = $this->activeStep($actor, $courrier, $steps);
        if ($source && in_array($source->declencheur['phase'] ?? null, ['VALIDATION','CLOTURE'], true))
            return 'Ce courrier attend une validation ou sa clôture dans le circuit, plutôt qu’une nouvelle orientation.';
        $current = $ready->first(fn($step) => $step->assigne_a !== $actor->id);
        if ($current) {
            $person = User::find($current->assigne_a);
            return 'Ce courrier est déjà dans le circuit. Étape en attente : '.$current->etape
                .($person ? ' — '.$person->name : '').'. Aucune nouvelle transmission par ce secrétariat n’est nécessaire à cette étape.';
        }
        if ($actor->isSecretaire()) {
            $root = $this->access->secretaryRoot($actor);
            $responsible = $root?->responsable_id ? User::find($root->responsable_id) : null;
            if (!$responsible || !$responsible->actif) return 'Le responsable de votre entité doit être renseigné et actif dans les paramètres de l’organisation.';
        }
        return 'Le circuit ne prévoit pas de transmission par votre compte à cette étape. Consultez le circuit pour identifier l’action attendue.';
    }

    public function initialOrientationAllowed(Courrier $courrier): bool
    {
        return in_array($courrier->statut, ['ENREGISTRE','EN_ATTENTE_DG'], true);
    }

    public function options(User $actor, Courrier $courrier): array
    {
        abort_unless($this->access->canViewCourrier($actor,$courrier),403);
        app(CourrierPartyService::class)->assertDistinct($courrier);
        if ($courrier->type === 'INTERNE') abort_unless(app(CourrierPartyService::class)->entity($courrier, 'expediteur') && app(CourrierPartyService::class)->entity($courrier, 'destinataire'),422,'Renseignez les entités expéditrice et destinataire du courrier interne avant son orientation.');
        $targets = $this->targets($actor, $courrier);
        return [
            'initialOrientation' => $this->initialOrientationAllowed($courrier),
            'blockedReason' => $targets->isEmpty() ? $this->unavailableReason($actor, $courrier) : null,
            'requiresDgAnnotation' => $this->requiresDgAnnotation($actor, $courrier),
            'targets' => $targets->map(fn($u)=>['id'=>$u->id,'nom'=>$u->name,'role'=>$u->role])->values(),
            'instructions' => $this->instructions($courrier)->map(fn($a)=>['id'=>$a->id,'contenu'=>$a->contenu,'fichierId'=>$a->fichier_id,'page'=>$a->page])->values(),
        ];
    }

    public function orient(User $actor, Courrier $courrier, array $data): Assignation
    {
        abort_unless(Gate::forUser($actor)->allows('assigner-courrier'),403);
        return DB::transaction(function() use($actor,$courrier,$data) {
            $courrier = Courrier::whereKey($courrier->id)->lockForUpdate()->firstOrFail();
            abort_unless($this->access->canUpdateCourrier($actor, $courrier) && !in_array($courrier->statut, ['TRAITE','ARCHIVE'], true),403);
            $steps = WorkflowEtape::where('courrier_id', $courrier->id)->lockForUpdate()->get();
            if (array_key_exists('initialOrientation',$data)) {
                if ((bool)$data['initialOrientation']) abort_unless($this->initialOrientationAllowed($courrier),409,'Seuls les courriers en attente d’orientation peuvent être orientés.');
                else abort_unless($this->activeStep($actor,$courrier,$steps),409,'Poursuivez le circuit uniquement depuis votre étape active.');
            }
            abort_if($this->alreadyForwarded($actor, $courrier, $steps),409,'Ce courrier a déjà été orienté par votre compte. Le prochain responsable doit poursuivre le circuit.');
            $target = $this->targets($actor,$courrier)->firstWhere('id',$data['assigneA']);
            abort_unless($target,403,'Orientation non autorisée : choisissez le responsable correspondant au destinataire, en respectant les validations du circuit.');
            $annotation = empty($data['dgAnnotationId']) ? null : $this->instructions($courrier)->firstWhere('id',$data['dgAnnotationId']);
            abort_if($this->requiresDgAnnotation($actor, $courrier) && !$annotation,422,'Sélectionnez une instruction du DG dans le document avant d’affecter le courrier.');
            abort_if(!empty($data['dgAnnotationId']) && !$annotation,422,'Cette instruction du DG n’appartient pas à ce courrier.');
            if ($courrier->type === 'INTERNE' && $steps->isEmpty()) {
                $recipient = app(CourrierPartyService::class)->entity($courrier, 'destinataire');
                ProcedureSettings::apply($courrier, $actor);
                if (!WorkflowEtape::where('courrier_id', $courrier->id)->exists()) {
                    app(OrganisationWorkflowService::class)->create($actor, $courrier, $recipient->id, null, null, true);
                }
                $courrier->refresh();
            }
            $steps = WorkflowEtape::where('courrier_id',$courrier->id)->orderBy('ordre')->lockForUpdate()->get();
            $source = $steps->first(fn($s) => $s->assigne_a === $actor->id && in_array($s->statut,['EN_ATTENTE','EN_COURS'],true) && $this->execution->readiness($s,$steps)['ready']);

            // Keep the next hierarchy/validation tasks; never turn a closure into an execution task.
            $nextSteps = $source ? $steps->filter(fn($step) => ($step->declencheur['etapePrecedenteId'] ?? null) === $source->id) : collect();
            $destination = $nextSteps->first(fn($step) => $step->assigne_a === $target->id && $step->statut === 'EN_ATTENTE' && !$step->date_debut);
            if (!$source) $destination = $steps->first(fn($step) => $step->assigne_a === $target->id && $step->statut === 'EN_ATTENTE' && !$step->date_debut && $this->execution->readiness($step, $steps)['ready']);
            $insertBefore = collect();
            if (!$destination && $nextSteps->isNotEmpty()) {
                abort_unless($nextSteps->every(fn($step) => in_array($step->declencheur['phase'] ?? null, ['VALIDATION','CLOTURE'], true) && $step->statut === 'EN_ATTENTE' && !$step->date_debut),409,'Le circuit impose une étape intermédiaire avant cette transmission.');
                $insertBefore = $nextSteps;
            } elseif (!$destination && !$source && $steps->contains(fn($step) => $step->statut !== 'TERMINE')) {
                abort(409,'Le responsable précédent doit terminer son étape avant cette transmission.');
            }

            $previous = $destination?->declencheur['orientation'] ?? null;
            if ($previous && ($previous['actorId']??null) === $actor->id && ($previous['targetId']??null) === $target->id && ($previous['annotationId']??null) === ($annotation?->id)) {
                return Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$target->id)->firstOrFail();
            }
            if ($actor->role === 'DIRECTEUR' && !$source && $steps->isNotEmpty()) abort(409,'Votre étape doit être disponible avant de transmettre le courrier.');
            if (!$source && $destination) abort_unless($this->execution->readiness($destination,$steps)['ready'],409,'Le responsable précédent doit terminer son étape avant cette transmission.');
            $instruction = trim($data['instructions']??'');
            $evidence = ['sourceStepId'=>$source?->id,'processingBeforeForward'=>$source?->statut==='EN_COURS','actorId'=>$actor->id,'targetId'=>$target->id,'annotationId'=>$annotation?->id,'annotationText'=>$annotation?->contenu,'validationStepId'=>$this->validatedDgAncestor($source,$steps)?->id,'fichierId'=>$annotation?->fichier_id,'page'=>$annotation?->page,'instructions'=>$instruction,'createdAt'=>now()->toIso8601String()];
            if ($source) {
                $history=$source->responses??[];
                $history[]=['id'=>(string)Str::uuid(),'auteurId'=>$actor->id,'auteurNom'=>$actor->name,'message'=>'Transmission à '.$target->name.($annotation?' selon l’annotation du DG : '.$annotation->contenu:''),'createdAt'=>now()->toIso8601String()];
                $source->responses=$history;$source->statut='TERMINE';$source->date_debut??=now();$source->date_fin=now();$source->save();
            }
            $newDestination = !$destination;
            if (!$destination && $source) {
                foreach ($steps->where('ordre', '>', $source->ordre) as $later) $later->update(['ordre'=>$later->ordre + 1]);
            }
            $destination ??= new WorkflowEtape(['courrier_id'=>$courrier->id,'etape'=>$target->role==='DIRECTEUR_GENERAL'?'Examen et annotations du DG':($target->role==='DIRECTEUR'?'Prise en compte des instructions du DG':'Traitement selon les instructions du DG'),'statut'=>'EN_ATTENTE','cree_par'=>$actor->id,'ordre'=>$source ? $source->ordre + 1 : ($steps->max('ordre')??0)+1,'est_condition'=>false]);
            $oldTarget=$destination->assigne_a;
            $destination->assigne_a=$target->id;
            $trigger=$destination->declencheur ?? ($source
                ? array_merge($source->declencheur ?? [], ['type'=>'APRES_ETAPE','etapePrecedenteId'=>$source->id,'phase'=>'EXECUTION'])
                : ['type'=>'IMMEDIAT','circuit'=>'HIERARCHIQUE']);
            if ($newDestination) {
                $trigger['finalRecipientId']=$target->id;
                $trigger['targetEntityId']=$target->entite_id;
                if ($validation=$this->validatedDgAncestor($source,$steps)) $trigger['dgSourceStepId']=$validation->id;
            }
            $trigger['orientation']=$evidence;$destination->declencheur=$trigger;
            $destination->save();
            foreach ($insertBefore as $next) { $link=$next->declencheur; $link['etapePrecedenteId']=$destination->id; $next->update(['declencheur'=>$link]); }
            $assignment=Assignation::firstOrCreate(['courrier_id'=>$courrier->id,'assigne_a'=>$target->id],['assigne_par'=>$actor->id,'date_assignation'=>now(),'date_echeance'=>$data['dateEcheance']??null,'instructions'=>$instruction,'statut'=>'EN_ATTENTE']);
            if ($oldTarget && $oldTarget!==$target->id && !WorkflowEtape::where('courrier_id',$courrier->id)->where('assigne_a',$oldTarget)->exists()) {
                Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$oldTarget)->where('instructions','[WORKFLOW] Circuit du courrier')->delete();
            }
            if ($actor->role==='DIRECTEUR') {
                $root=$this->access->secretaryRoot($actor);
                if ($root) {$courrier->direction=$root->nom;$courrier->save();}
            }
            if ($actor->role==='DIRECTEUR' && ($trigger['circuit']??null)==='HIERARCHIQUE' && !WorkflowEtape::where('courrier_id',$courrier->id)->where('declencheur->phase','CLOTURE')->exists()) {
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
