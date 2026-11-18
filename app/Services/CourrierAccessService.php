<?php

namespace App\Services;

use App\Models\Assignation;
use App\Models\Courrier;
use App\Models\User;
use App\Models\WorkflowEtape;
use Illuminate\Database\Eloquent\Builder;

/**
 * Logique d'accès aux courriers (alignée Firebase / getAccessibleCourriers).
 * SUPER_ADMIN : tous les courriers.
 * SECRETAIRE sans rattachement : aucun accès global.
 * SECRETAIRE de direction : périmètre de sa direction ; secrétariat DG : périmètre central.
 * DIRECTEUR_GENERAL : uniquement les courriers qui lui sont orientés (assignés).
 * DIRECTEUR / CHEF_DIVISION : courriers de leur direction + assignés + enregistrés par eux.
 * CHEF_SERVICE, CHEF_BUREAU, AGENT : courriers de leur service + direction, ou assignés.
 */
class CourrierAccessService
{
    public function secretaryRoot(User $user): ?\App\Models\EntiteOrganisationnelle
    {
        $all=\App\Models\EntiteOrganisationnelle::where('actif',true)->get()->keyBy('id');
        $entity=$all->get($user->entite_id);$seen=[];
        while($entity&&!isset($seen[$entity->id])){if(in_array($entity->type,['direction','direction_generale'],true))return $entity;$seen[$entity->id]=true;$entity=$all->get($entity->parent_id);}
        return $all->first(fn($e)=>in_array($e->type,['direction','direction_generale'],true)&&($e->nom===$user->direction||$e->id===$user->direction));
    }
    private function secretaryQuery(Builder $query,User $user):Builder
    {
        $root=$this->secretaryRoot($user);if(!$root)return $query->whereRaw('1=0');
        if($root->type==='direction_generale')return $query;
        $entities=\App\Models\EntiteOrganisationnelle::where('actif',true)->get();$ids=[$root->id];
        do{$count=count($ids);foreach($entities as$entity)if(in_array($entity->parent_id,$ids,true)&&!in_array($entity->id,$ids,true))$ids[]=$entity->id;}while($count!==count($ids));
        $names=$entities->whereIn('id',$ids)->pluck('nom')->merge($ids)->all();
        $central=collect(app(CourrierPartyService::class)->path($root))->first(fn($entity)=>$entity->type==='direction_generale');
        $dgIds=$central?User::where('role','DIRECTEUR_GENERAL')->where('entite_id',$central->id)->pluck('id')->all():[];
        $dgNames=$central?[$central->id,$central->nom]:[];
        $secretaries=User::where('role','SECRETAIRE')->get()->filter(fn($person)=>$this->secretaryRoot($person)?->id===$root->id)->pluck('id')->all();
        $agentIds=User::where('role','AGENT')->whereIn('entite_id',$ids)->pluck('id')->all();
        $instructors=User::where('role','DIRECTEUR')->get()->filter(fn($person)=>$this->secretaryRoot($person)?->id===$root->id)->pluck('id')->merge($dgIds)->all();
        return $query->where(function(Builder $scope)use($names,$root,$secretaries,$dgIds,$dgNames,$user,$agentIds,$instructors){
            // Outgoing correspondence belongs to the entity that emitted it to the DG.
            $scope->where(function(Builder $outgoing)use($names,$root,$dgNames){
                $outgoing->where('type','INTERNE')->whereIn('destinataire',$dgNames)
                    ->where(fn(Builder $sender)=>$sender->whereIn('expediteur',$names)
                        ->orWhere('extra_fields->entiteEmetteurJson','like','%"'.$root->id.'"%'));
            });
            // A DG instruction explicitly naming this secretariat grants reception access.
            $scope->orWhereHas('workflowEtapes',fn(Builder $steps)=>$steps->whereIn('assigne_a',$secretaries)
                ->whereIn('declencheur->orientation->actorId',$dgIds));
            $scope->orWhereHas('assignations',fn(Builder $assignments)=>$assignments->whereIn('assigne_a',$secretaries)
                ->whereIn('assigne_par',$dgIds)->where(fn(Builder $actual)=>$actual->whereNull('instructions')->orWhere('instructions','not like','[WORKFLOW]%')));
            // The secretariat follows actual instructions addressed to its agents.
            $scope->orWhereHas('workflowEtapes',fn(Builder $steps)=>$steps->whereIn('assigne_a',$agentIds)
                ->whereIn('declencheur->orientation->targetId',$agentIds)->whereIn('declencheur->orientation->actorId',$instructors));
            $scope->orWhereHas('assignations',fn(Builder $assignments)=>$assignments->whereIn('assigne_a',$agentIds)
                ->whereIn('assigne_par',$instructors)->whereNotNull('instructions')->where('instructions','!=','')->where('instructions','not like','[WORKFLOW]%'));
            // A directly addressed DG letter is received after central validation,
            // or when registered locally from the already received DG document.
            $scope->orWhere(function(Builder $incoming)use($names,$root,$dgNames,$dgIds,$secretaries){
                $incoming->whereIn('expediteur',$dgNames)
                    ->where(fn(Builder $recipient)=>$recipient->whereIn('destinataire',$names)
                        ->orWhere('extra_fields->entiteDestinataireJson','like','%"'.$root->id.'"%'))
                    ->where(fn(Builder $received)=>$received->whereIn('enregistre_par',$secretaries)
                        ->orWhereHas('workflowEtapes',fn(Builder $validated)=>$validated->whereIn('assigne_a',$dgIds)
                            ->where('statut','TERMINE')->where('declencheur->phase','ORIENTATION')));
            });
        });
    }
    public function prepareSecretaryCourrier(User$user,Courrier$courrier):void
    {
        if(!$user->isSecretaire())return;$root=$this->secretaryRoot($user);
        abort_unless($root,403,'Rattachez ce secrétaire à une direction avant toute opération.');
        if($root->type==='direction_generale')return;
        if(!$courrier->direction)$courrier->direction=$root->nom;
        abort_unless(in_array($courrier->direction,[$root->nom,$root->id],true),403,'Le secrétaire peut enregistrer et modifier uniquement les courriers de sa direction.');
    }

    private function assignedCourriers(User $user)
    {
        return Assignation::where('assigne_a',$user->id)->select('courrier_id')
            ->union(WorkflowEtape::where('assigne_a',$user->id)->select('courrier_id'));
    }

    /** Prepared workflow assignments do not constitute a secretary's actual handoff. */
    private function receivedByLeaderQuery(User $user): Builder
    {
        $root = $this->secretaryRoot($user);
        $secretaries = $root ? User::where('role', 'SECRETAIRE')->get()
            ->filter(fn($secretary) => $this->secretaryRoot($secretary)?->id === $root->id)->pluck('id')->all() : [];
        return $this->routedByQuery($user, $secretaries);
    }

    private function instructedAgentQuery(User $user): Builder
    {
        $root = $this->secretaryRoot($user);
        $actors = $root ? User::whereIn('role', ['DIRECTEUR','DIRECTEUR_GENERAL'])->get()->filter(function ($person) use ($root) {
            if ($person->isDirecteur()) return $this->secretaryRoot($person)?->id === $root->id;
            return collect(app(CourrierPartyService::class)->path($root))->contains('responsable_id', $person->id);
        })->pluck('id')->all() : [];
        return $this->routedByQuery($user, $actors, true);
    }

    private function routedByQuery(User $user, array $secretaries, bool $requireInstruction = false): Builder
    {
        return Courrier::query()->where(function (Builder $query) use ($user, $secretaries, $requireInstruction) {
            $query->whereHas('workflowEtapes', fn(Builder $steps) => $steps
                ->where('assigne_a', $user->id)
                ->where('declencheur->orientation->targetId', $user->id)
                ->whereIn('declencheur->orientation->actorId', $secretaries))
                ->orWhereHas('assignations', fn(Builder $assignments) => $assignments
                    ->where('assigne_a', $user->id)->whereIn('assigne_par', $secretaries)
                    ->where(fn(Builder $explicit) => $explicit->whereNull('instructions')->orWhere('instructions', 'not like', '[WORKFLOW]%'))
                    ->when($requireInstruction, fn(Builder $explicit) => $explicit->whereNotNull('instructions')->where('instructions', '!=', '')));
        });
    }

    public function getAccessibleCourriersQuery(User $user): Builder
    {
        $query = Courrier::query()->orderBy('date_enregistrement', 'desc');

        // SUPER_ADMIN voit tous les courriers
        if ($user->isSuperAdmin()) {
            return $query;
        }

        if($user->isSecretaire())return $this->secretaryQuery($query,$user);

        if ($user->isDirecteurGeneral() || $user->isDirecteur()) {
            return $this->receivedByLeaderQuery($user)->orderBy('date_enregistrement', 'desc');
        }

        if ($user->isAgent()) return $this->instructedAgentQuery($user)->orderBy('date_enregistrement', 'desc');

        // DIRECTEUR / CHEF_DIVISION : courriers orientés (assignés) + courriers enregistrés + courriers de leur direction
        if ($user->isChefDivision()) {
            $assigneAIds = $this->assignedCourriers($user);
            $query->where(function (Builder $q) use ($user, $assigneAIds) {
                $q->whereIn('id', $assigneAIds)
                  ->orWhere('enregistre_par', $user->id);
                if ($user->direction) {
                    $q->orWhere('direction', $user->direction);
                }
            });
            return $query;
        }

        $assigneAIds = $this->assignedCourriers($user);

        $query->where(function (Builder $q) use ($user, $assigneAIds) {
            $q->whereIn('id', $assigneAIds)
              ->orWhere('enregistre_par', $user->id);

            if (($user->isChefService() || $user->isChefBureau() || $user->isAgent()) && $user->service && $user->direction) {
                $q->orWhere(function (Builder $q2) use ($user) {
                    $q2->where('service', $user->service)->where('direction', $user->direction);
                });
            }
        });

        return $query;
    }

    public function canViewCourrier(User $user, Courrier $courrier): bool
    {
        if($user->isSecretaire())return $this->secretaryQuery(Courrier::query(),$user)->whereKey($courrier->id)->exists();
        // SUPER_ADMIN voit tout
        if ($user->isSuperAdmin()) {
            return true;
        }

        if ($user->isDirecteurGeneral() || $user->isDirecteur()) {
            return $this->receivedByLeaderQuery($user)->whereKey($courrier->id)->exists();
        }

        if ($user->isAgent()) return $this->instructedAgentQuery($user)->whereKey($courrier->id)->exists();

        // L'expéditeur (celui qui a enregistré) voit toujours son courrier
        if ($courrier->enregistre_par === (string) $user->id) {
            return true;
        }

        // Toute assignation explicite donne accès
        if (Assignation::where('courrier_id', $courrier->id)->where('assigne_a', $user->id)->exists() || WorkflowEtape::where('courrier_id', $courrier->id)->where('assigne_a', $user->id)->exists()) {
            return true;
        }

        // DG : courriers orientés (assignés)
        if ($user->isDirecteurGeneral()) {
            return false;
        }

        // DIRECTEUR / CHEF_DIVISION : courriers de leur direction
        if ($user->isChefDivision()) {
            return $user->direction && $courrier->direction === $user->direction;
        }

        if (($user->isChefService() || $user->isChefBureau() || $user->isAgent()) && $user->service && $user->direction
            && $courrier->service === $user->service && $courrier->direction === $user->direction) {
            return true;
        }

        return false;
    }

    public function canUpdateCourrier(User $user, Courrier $courrier): bool
    {
        if($user->isSecretaire())return $this->canViewCourrier($user,$courrier);
        if ($user->isSuperAdmin()) {
            return true;
        }
        if ($user->isAgent()) {
            return $this->canViewCourrier($user, $courrier) && \App\Models\Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$user->id)->whereIn('statut',['EN_ATTENTE','EN_COURS'])->exists();
        }
        if ($user->isDirecteurGeneral() || $user->isDirecteur()) return $this->canViewCourrier($user, $courrier);
        if ((string) $courrier->enregistre_par === (string) $user->id) {
            return true;
        }
        if ($user->isDirecteurGeneral()) {
            return $this->canViewCourrier($user, $courrier);
        }
        if ($user->isSecretaire()) {
            return $this->canViewCourrier($user, $courrier);
        }
        return $this->canViewCourrier($user, $courrier);
    }

    public function canDeleteCourrier(User $user, Courrier $courrier): bool
    {
        if($user->isSecretaire())return $this->canViewCourrier($user,$courrier);
        return $user->isSuperAdmin() || (($user->isDirecteurGeneral() || $courrier->enregistre_par === $user->id) && $this->canViewCourrier($user, $courrier));
    }
}
