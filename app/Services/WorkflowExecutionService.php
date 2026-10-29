<?php
namespace App\Services;

use App\Models\{Courrier, WorkflowEtape, Assignation, User, Notification, Annotation};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Authoritative execution rules. Every mutation locks courrier, then its steps. */
class WorkflowExecutionService
{
    private function fail(string $message): never { throw ValidationException::withMessages(['workflow' => $message]); }

    public function readiness(WorkflowEtape $step, $steps, array $seen = []): array
    {
        if (isset($seen[$step->id])) return ['ready'=>false,'skipped'=>false,'reason'=>'Cycle dans le circuit.'];
        $seen[$step->id]=true;
        foreach ($steps->where('est_condition', true) as $condition) {
            if (!in_array($step->id, [$condition->action_si_vrai,$condition->action_si_faux], true)) continue;
            $parent=$this->readiness($condition,$steps,$seen);
            if ($parent['skipped']) return ['ready'=>false,'skipped'=>true,'reason'=>'Branche non retenue.'];
            if ($condition->statut!=='TERMINE') return ['ready'=>false,'skipped'=>false,'reason'=>'Décision de la condition attendue.'];
            $decision=$this->decision($condition);
            if (!$decision) return ['ready'=>false,'skipped'=>false,'reason'=>'Décision de la condition manquante.'];
            $chosen=$decision==='AVIS_FAVORABLE'?$condition->action_si_vrai:$condition->action_si_faux;
            if ($chosen!==$step->id) return ['ready'=>false,'skipped'=>true,'reason'=>'Branche non retenue.'];
        }
        $trigger=$step->declencheur??[];
        if (in_array($trigger['type']??'', ['APRES_ETAPE','CONDITION'], true)) {
            $before=$steps->firstWhere('id',$trigger['etapePrecedenteId']??'');
            if (!$before) return ['ready'=>false,'skipped'=>false,'reason'=>'Étape précédente introuvable.'];
            $previous=$this->readiness($before,$steps,$seen);
            if ($previous['skipped']) return ['ready'=>false,'skipped'=>true,'reason'=>'Branche non retenue.'];
            if ($before->statut!=='TERMINE') return ['ready'=>false,'skipped'=>false,'reason'=>$before->statut==='REJETE'?'Étape précédente rejetée : correction requise.':'Terminez l’étape précédente.'];
        }
        if (($trigger['type']??'')==='DATE') {
            $date=$trigger['dateDeclenchement']??null;
            if (!$date || now()->lt(\Carbon\Carbon::parse($date))) return ['ready'=>false,'skipped'=>false,'reason'=>'Date de déclenchement non atteinte.'];
        }
        return ['ready'=>true,'skipped'=>false,'reason'=>null];
    }

    private function decision(WorkflowEtape $step): ?string
    {
        foreach(array_reverse($step->responses??[]) as $response) if(in_array($response['decision']??'', ['AVIS_FAVORABLE','A_REVOIR'], true)) return $response['decision'];
        return null;
    }

    public function validateGraph($steps): void
    {
        $edges=[];
        foreach($steps as $step) {
            $trigger=$step->declencheur??[];$kind=$trigger['type']??'IMMEDIAT';
            if(in_array($kind,['APRES_ETAPE','CONDITION'],true)) {
                $parent=$steps->firstWhere('id',$trigger['etapePrecedenteId']??'');
                if(!$parent || $parent->id===$step->id) $this->fail('L’étape précédente doit appartenir au même courrier et être différente.');
                if($kind==='CONDITION'&&!$parent->est_condition) $this->fail('Le déclencheur doit référencer une condition.');
                $edges[$parent->id][]=$step->id;
            }
            if($kind==='DATE'&&empty($trigger['dateDeclenchement'])) $this->fail('Une date de déclenchement est obligatoire.');
            if($step->est_condition) {
                if(!$step->action_si_vrai||!$step->action_si_faux||$step->action_si_vrai===$step->action_si_faux) $this->fail('Une condition nécessite deux actions distinctes.');
                foreach([$step->action_si_vrai,$step->action_si_faux] as $id) {
                    if(!$steps->contains('id',$id)||$id===$step->id) $this->fail('Les branches doivent appartenir au même courrier.');
                    $edges[$step->id][]=$id;
                }
            }
        }
        $visited=[];$stack=[];
        $visit=function($id)use(&$visit,&$visited,&$stack,$edges){if(isset($stack[$id]))$this->fail('Ce lien créerait un cycle dans le workflow.');if(isset($visited[$id]))return;$stack[$id]=true;foreach($edges[$id]??[]as$next)$visit($next);unset($stack[$id]);$visited[$id]=true;};
        foreach($steps as $step)$visit($step->id);
    }

    private function journal(WorkflowEtape $step, User $actor, string $message, ?string $decision=null): void
    {
        $history=$step->responses??[];$history[]=['id'=>(string)Str::uuid(),'auteurId'=>$actor->id,'auteurNom'=>$actor->name,'message'=>$message,'decision'=>$decision,'createdAt'=>now()->toIso8601String()];$step->responses=$history;
    }

    /** Clock starts when the actor can act, never while waiting for a predecessor. */
    public function timing(WorkflowEtape $step, Courrier $courrier, $steps): array
    {
        $trigger=$step->declencheur??[];$urgency=$step->statut==='TERMINE'?($trigger['completedUrgency']??$courrier->priorite):$courrier->priorite;$hours=$trigger['hoursByUrgency'][$urgency]??$step->duree_estimee;
        $available=$trigger['availableAt']??null;
        $due=$available&&$hours?\Carbon\Carbon::parse($available)->addSeconds((int)round((float)$hours*3600)):null;
        $ready=$this->readiness($step,$steps);
        $open=in_array($step->statut,['EN_ATTENTE','EN_COURS','REJETE'],true);
        $late=$open&&$ready['ready']&&$due&&now()->gt($due);
        return ['urgency'=>$urgency,'allowedHours'=>$hours,'availableAt'=>$available,'deadline'=>$due?->toIso8601String(),'isLate'=>(bool)$late,'remainingSeconds'=>$due&&$open?(int)(($due->getTimestamp())-now()->getTimestamp()):null];
    }
    public function refreshTiming(Courrier $courrier,$steps):void
    {
        foreach($steps as$step){
            if(!in_array($step->statut,['EN_ATTENTE','EN_COURS','REJETE'],true))continue;
            if(!$this->readiness($step,$steps)['ready'])continue;
            $trigger=$step->declencheur??[];
            if(empty($trigger['availableAt'])){$trigger['availableAt']=now()->toIso8601String();$step->declencheur=$trigger;$step->save();}
        }
        foreach($steps->pluck('assigne_a')->filter()->unique()as$userId){
            $deadlines=$steps->filter(fn($s)=>$s->assigne_a===$userId&&in_array($s->statut,['EN_ATTENTE','EN_COURS','REJETE'],true)&&$this->readiness($s,$steps)['ready'])->map(fn($s)=>$this->timing($s,$courrier,$steps)['deadline'])->filter()->sort()->values();
            Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$userId)->where('instructions','[WORKFLOW] Circuit du courrier')->update(['date_echeance'=>$deadlines->isNotEmpty()?\Carbon\Carbon::parse($deadlines->first()):null]);
        }
    }

    public function notifyReady(Courrier $courrier, $steps): void
    {
        foreach($steps as $step) {
            if($step->statut!=='EN_ATTENTE'||!$step->assigne_a||!$this->readiness($step,$steps)['ready'])continue;
            if(($step->declencheur['circulation']['notifyNext']??true)===false)continue;
            $key='workflow-ready:'.$step->id.':'.($step->declencheur['revision']??0);
            if(Notification::where('relatedId',$step->id)->where('type','workflow')->where('metadata->dedupKey',$key)->exists())continue;
            // Internal notice only. External channels are deliberately not dispatched here.
            Notification::create(['userId'=>$step->assigne_a,'type'=>'workflow','title'=>'Étape prête à traiter','message'=>$step->etape.' — '.($courrier->numero_organisationnel?:$courrier->numero),'priority'=>'normal','read'=>false,'relatedId'=>$step->id,'relatedType'=>'workflow','actionUrl'=>'/courriers/'.$courrier->id,'metadata'=>['dedupKey'=>$key,'courrierId'=>$courrier->id]]);
        }
    }

    public function synchronize(Courrier $courrier, $steps): void
    {
        if($courrier->statut==='ARCHIVE')return;
        $relevant=$steps->filter(fn($step)=>!$this->readiness($step,$steps)['skipped']);
        if($relevant->isEmpty())return;
        $this->refreshTiming($courrier,$steps);
        $done=$relevant->every(fn($step)=>$step->statut==='TERMINE');
        $started=$relevant->contains(fn($step)=>in_array($step->statut,['EN_COURS','TERMINE','REJETE'],true));
        $courrier->statut=$done?'TRAITE':($started?'EN_TRAITEMENT':'ASSIGNE');$courrier->save();\Illuminate\Support\Facades\Cache::forever('courriers_cache_version',(string)Str::uuid());
        if($done) Assignation::where('courrier_id',$courrier->id)->update(['statut'=>'TERMINE']);
        // A person with several steps remains assigned until every applicable step is done.
        foreach($steps->pluck('assigne_a')->filter()->unique()as$userId) {
            $own=$relevant->where('assigne_a',$userId);$state=$own->every(fn($s)=>$s->statut==='TERMINE')?'TERMINE':($own->contains(fn($s)=>in_array($s->statut,['EN_COURS','TERMINE','REJETE'],true))?'EN_COURS':'EN_ATTENTE');
            Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$userId)->update(['statut'=>$state]);
        }
    }

    public function canManageStep(User $actor, WorkflowEtape $step, Courrier $courrier): bool
    {
        if(!\Illuminate\Support\Facades\Gate::forUser($actor)->allows('modifier-workflow')||!app(CourrierAccessService::class)->canUpdateCourrier($actor,$courrier))return false;
        if($actor->isSuperAdmin())return true;
        $target=User::find($step->assigne_a);if(!$target)return false;
        if($actor->role==='SECRETAIRE'&&$target->role!=='SECRETAIRE')return false;
        return app(OrganisationWorkflowService::class)->entities($actor)->contains('id',$target->entite_id);
    }

    public function transition(string $id, User $actor, array $data, bool $manager): WorkflowEtape
    {
        $courrierId=WorkflowEtape::findOrFail($id)->courrier_id;
        return DB::transaction(function()use($courrierId,$id,$actor,$data,$manager){
            $courrier=Courrier::whereKey($courrierId)->lockForUpdate()->firstOrFail();
            $steps=WorkflowEtape::where('courrier_id',$courrierId)->lockForUpdate()->get();$step=$steps->firstWhere('id',$id);
            abort_unless(app(CourrierAccessService::class)->canViewCourrier($actor,$courrier),403,'Courrier hors de votre périmètre.');
            if($courrier->statut==='ARCHIVE')$this->fail('Un courrier archivé ne peut plus être modifié.');
            $own=(string)$step->assigne_a===(string)$actor->id;
            abort_unless($own||$manager,403,'Cette étape ne vous est pas assignée.');
            if(isset($data['statut']) && $data['statut']!==$step->statut && $data['statut']!=='EN_ATTENTE' && !$own && !$actor->isSuperAdmin()) abort(403,'Seul le responsable affecté peut exécuter cette étape.');
            $allowed=['statut','commentaire','dateDebut','dateFin','decision','annotation'];
            if(!$manager&&array_diff(array_keys($data),$allowed))abort(403,'L’assigné peut uniquement exécuter sa tâche et ajouter un commentaire.');
            if(isset($data['responses']))$this->fail('Utilisez l’ajout de réponse pour préserver l’historique.');
            $structural=array_intersect(array_keys($data),['assigneA','etape','ordre','declencheur','estCondition','actionSiVrai','actionSiFaux','dureeEstimee']);
            if($structural&&($step->declencheur['circuit']??null)==='ARMP')$this->fail('Les étapes du circuit généré sont protégées ; utilisez les actions de traitement ou de correction.');
            if($structural&&$step->statut!=='EN_ATTENTE')$this->fail('Une étape démarrée ne peut plus être restructurée.');
            $oldAssignee=$step->assigne_a;
            if(isset($data['assigneA']) && $data['assigneA']!==$actor->id && !in_array($actor->role,['SUPER_ADMIN'],true)) {
                $target=User::find($data['assigneA']);
                abort_unless($target && app(OrganisationWorkflowService::class)->entities($actor)->contains('id',$target->entite_id),403,'Utilisateur hors de votre périmètre.');
            }
            $map=['assigneA'=>'assigne_a','etape'=>'etape','ordre'=>'ordre','declencheur'=>'declencheur','estCondition'=>'est_condition','actionSiVrai'=>'action_si_vrai','actionSiFaux'=>'action_si_faux','dureeEstimee'=>'duree_estimee'];
            foreach($map as$key=>$column)if(array_key_exists($key,$data))$step->$column=$data[$key];
            if(isset($data['assigneA'])&&!User::whereKey($data['assigneA'])->where('actif',true)->exists())$this->fail('Choisissez un utilisateur actif.');
            $this->validateGraph($steps);
            $from=$step->statut;$to=$data['statut']??$from;
            if($to!==$from) {
                $transitions=['EN_ATTENTE'=>['EN_COURS','TERMINE','REJETE'],'EN_COURS'=>['TERMINE','REJETE'],'REJETE'=>$manager?['EN_ATTENTE']:[],'TERMINE'=>[]];
                if(!in_array($to,$transitions[$from]??[],true))$this->fail('Transition non autorisée.');
                if($to==='EN_ATTENTE') {
                    if(empty(trim($data['commentaire']??'')))$this->fail('Précisez les corrections attendues avant de renvoyer l’étape.');
                    $step->date_debut=null;$step->date_fin=null;$trigger=$step->declencheur??[];$trigger['revision']=($trigger['revision']??0)+1;$step->declencheur=$trigger;
                    if(($trigger['circulation']['deadlineOnReopen']??'CONSERVER')==='REINITIALISER'){$trigger['availableAt']=now()->toIso8601String();$step->declencheur=$trigger;}
                } else {
                    if(!$step->assigne_a||!User::whereKey($step->assigne_a)->where('actif',true)->exists())$this->fail('L’étape doit être affectée à un utilisateur actif.');
                    $ready=$this->readiness($step,$steps);if(!$ready['ready'])$this->fail($ready['reason']);
                    if(in_array($to,['EN_COURS','TERMINE'],true)) {
                        $annotation=Annotation::where('courrier_id',$courrier->id)->where('workflow_etape_id',$step->id)->exists();
                        if(!$annotation) {
                            $content=trim($data['annotation']??'');
                            if($content==='')$this->fail('Rédigez l’annotation de cette tâche avant son exécution.');
                            if(mb_strlen($content)>20000)$this->fail('L’annotation ne peut pas dépasser 20 000 caractères.');
                            $policy=app(AnnotationActionPolicy::class);$policy->assert($actor,$courrier);$policy->validateLinks($actor,$courrier,['workflowEtapeId'=>$step->id]);
                            Annotation::create(['courrier_id'=>$courrier->id,'created_by'=>$actor->id,'workflow_etape_id'=>$step->id,'contenu'=>$content,'type'=>'NOTE','kind'=>'COMMENTAIRE','statut'=>'OUVERT']);
                        }
                    }
                    if($to==='TERMINE'){
                        $report=trim($data['commentaire']??'');
                        if($report==='')$this->fail('Le retour de l’assigné est obligatoire : indiquez le résultat et les actions réalisées.');
                        $this->journal($step,$actor,'Retour de traitement : '.$report);
                    }
                    if($to==='REJETE'&&empty(trim($data['commentaire']??'')))$this->fail('Un motif de rejet est obligatoire.');
                    if(isset($data['decision']))$this->journal($step,$actor,trim($data['commentaire']??'Décision de validation'),$data['decision']);
                    if($to==='TERMINE'&&$step->est_condition&&!$this->decision($step))$this->fail('Renseignez un avis favorable ou à revoir pour choisir la branche.');
                    $step->date_debut??=now();if(in_array($to,['TERMINE','REJETE'],true))$step->date_fin=now();
                }
                if($to==='TERMINE'){$trigger=$step->declencheur??[];$trigger['completedUrgency']=$courrier->priorite;$step->declencheur=$trigger;}
                $step->statut=$to;$this->journal($step,$actor,$from.' → '.$to.(!empty($data['commentaire'])?' : '.$data['commentaire']:''));
            }
            if(isset($data['commentaire'])){if($to===$from&&$step->commentaire!==$data['commentaire'])$this->journal($step,$actor,'Commentaire : '.$data['commentaire']);$step->commentaire=$data['commentaire'];}
            $step->save();
            if($oldAssignee && $oldAssignee!==$step->assigne_a && !$steps->contains(fn($s)=>$s->assigne_a===$oldAssignee)) Assignation::where('courrier_id',$courrierId)->where('assigne_a',$oldAssignee)->where('instructions','[WORKFLOW] Circuit du courrier')->delete();
            $this->ensureAssignment($courrier,$step,$actor);$this->synchronize($courrier,$steps);$this->notifyReady($courrier,$steps);
            return $step->fresh();
        },3);
    }

    public function ensureAssignment(Courrier $courrier, WorkflowEtape $step, User $actor): void
    {
        if(!$step->assigne_a)return;
        Assignation::firstOrCreate(['courrier_id'=>$courrier->id,'assigne_a'=>$step->assigne_a,'instructions'=>'[WORKFLOW] Circuit du courrier'],['assigne_par'=>$actor->id,'date_assignation'=>now(),'statut'=>'EN_ATTENTE']);
    }

    public function assertCourrierStatus(Courrier $courrier, string $status, User $actor): void
    {
        $steps=WorkflowEtape::where('courrier_id',$courrier->id)->get();
        $valid=['ENREGISTRE','EN_ATTENTE_DG','ORIENTE_DG','ORIENTE_DIRECTEUR','EN_TRAITEMENT','ASSIGNE','TRAITE','ARCHIVE'];if(!in_array($status,$valid,true))$this->fail('Statut de courrier non reconnu.');
        if($courrier->statut==='ARCHIVE'&&$status!==$courrier->statut)$this->fail('Le courrier est archivé.');
        if($courrier->statut==='TRAITE'&&!in_array($status,['TRAITE','ARCHIVE'],true))$this->fail('Le courrier est déjà traité.');
        if($steps->isEmpty()){
            if($status===$courrier->statut)return;
            if($status==='ENREGISTRE')$this->fail('Une orientation existante ne peut pas être annulée par un simple changement de statut.');
            if(!Assignation::where('courrier_id',$courrier->id)->exists())$this->fail('Orientez ce courrier avant de modifier son avancement.');
            if(in_array($status,['TRAITE','ARCHIVE'],true)){if(Assignation::where('courrier_id',$courrier->id)->where('statut','!=','TERMINE')->exists())$this->fail('Terminez les affectations avant de clôturer le courrier.');if(!in_array($actor->role,['SUPER_ADMIN','DIRECTEUR_GENERAL','SECRETAIRE'],true))abort(403,'Clôture réservée à la direction ou au secrétariat.');}
            return;
        }
        if($status===$courrier->statut)return;
        if($courrier->statut==='TRAITE'&&!in_array($status,['TRAITE','ARCHIVE'],true))$this->fail('Le circuit est terminé. Le courrier est prêt pour l’archivage.');
        if($courrier->statut==='ARCHIVE')$this->fail('Le courrier est archivé.');
        if(in_array($status,['TRAITE','ARCHIVE'],true)) {
            $open=$steps->filter(fn($s)=>!$this->readiness($s,$steps)['skipped'])->contains(fn($s)=>$s->statut!=='TERMINE');
            if($open)$this->fail('Terminez et validez toutes les étapes avant la clôture ou l’archivage.');
            if($status==='ARCHIVE'&&!in_array($actor->role,['SUPER_ADMIN','DIRECTEUR_GENERAL','SECRETAIRE'],true))abort(403,'Archivage réservé au secrétariat et à la direction.');
        } else {
            $relevant=$steps->filter(fn($s)=>!$this->readiness($s,$steps)['skipped']);
            $expected=$relevant->contains(fn($s)=>in_array($s->statut,['EN_COURS','TERMINE','REJETE'],true))?'EN_TRAITEMENT':'ASSIGNE';
            if($status!==$expected)$this->fail('Le statut est piloté par les étapes du workflow.');
        }
    }
}
