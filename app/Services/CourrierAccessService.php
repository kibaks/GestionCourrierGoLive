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
        do{$count=count($ids);foreach($entities as$e)if(in_array($e->parent_id,$ids,true)&&!in_array($e->id,$ids,true))$ids[]=$e->id;}while($count!==count($ids));
        $names=$entities->whereIn('id',$ids)->pluck('nom')->merge($ids)->all();
        return $query->where(function(Builder$q)use($names,$ids,$user){
            $q->whereIn('direction',$names)->orWhere(function(Builder$blank)use($names,$ids,$user){
                $blank->where(fn($missing)=>$missing->whereNull('direction')->orWhere('direction',''));
                $blank->where(function($scoped)use($names,$ids,$user){
                    $scoped->whereIn('service',$names)->orWhereHas('workflowEtapes',fn($steps)=>$steps->whereIn('declencheur->targetEntityId',$ids));
                    $scoped->orWhere(fn($own)=>$own->where('enregistre_par',$user->id)->where(fn($empty)=>$empty->whereNull('service')->orWhere('service','')));
                });
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

    public function getAccessibleCourriersQuery(User $user): Builder
    {
        $query = Courrier::query()->orderBy('date_enregistrement', 'desc');

        // SUPER_ADMIN voit tous les courriers
        if ($user->isSuperAdmin()) {
            return $query;
        }

        if($user->isSecretaire())return $this->secretaryQuery($query,$user);

        // DG : courriers orientés (assignés) + courriers qu'il a enregistrés
        if ($user->isDirecteurGeneral()) {
            $assigneAIds = $this->assignedCourriers($user);
            $query->where(function (Builder $q) use ($user, $assigneAIds) {
                $q->whereIn('id', $assigneAIds)
                  ->orWhere('enregistre_par', $user->id);
            });
            return $query;
        }

        // DIRECTEUR / CHEF_DIVISION : courriers orientés (assignés) + courriers enregistrés + courriers de leur direction
        if ($user->isDirecteur() || $user->isChefDivision()) {
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
        if ($user->isDirecteur() || $user->isChefDivision()) {
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
            return (string)$courrier->enregistre_par===(string)$user->id && $courrier->statut==='ENREGISTRE' || \App\Models\Assignation::where('courrier_id',$courrier->id)->where('assigne_a',$user->id)->whereIn('statut',['EN_ATTENTE','EN_COURS'])->exists();
        }
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
        return $user->isSuperAdmin() || $user->isDirecteurGeneral() || $courrier->enregistre_par === $user->id;
    }
}
