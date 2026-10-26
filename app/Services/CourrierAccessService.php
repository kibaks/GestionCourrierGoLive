<?php

namespace App\Services;

use App\Models\Assignation;
use App\Models\Courrier;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Logique d'accès aux courriers (alignée Firebase / getAccessibleCourriers).
 * SUPER_ADMIN : tous les courriers.
 * SECRETAIRE sans direction : tous les courriers.
 * SECRETAIRE avec direction : courriers de sa direction + assignés + enregistrés par lui.
 * DIRECTEUR_GENERAL : uniquement les courriers qui lui sont orientés (assignés).
 * DIRECTEUR / CHEF_DIVISION : courriers de leur direction + assignés + enregistrés par eux.
 * CHEF_SERVICE, CHEF_BUREAU, AGENT : courriers de leur service + direction, ou assignés.
 */
class CourrierAccessService
{
    public function getAccessibleCourriersQuery(User $user): Builder
    {
        $query = Courrier::query()->orderBy('date_enregistrement', 'desc');

        // SUPER_ADMIN voit tous les courriers
        if ($user->isSuperAdmin()) {
            return $query;
        }

        // SECRETAIRE rattaché à une direction : assignés + enregistrés + courriers de sa direction
        if ($user->isSecretaire()) {
            if (!$user->direction) {
                return $query;
            }
            $assigneAIds = Assignation::where('assigne_a', $user->id)->select('courrier_id');
            $query->where(function (Builder $q) use ($user, $assigneAIds) {
                $q->whereIn('id', $assigneAIds)
                  ->orWhere('enregistre_par', $user->id)
                  ->orWhere('direction', $user->direction);
            });
            return $query;
        }

        // DG : courriers orientés (assignés) + courriers qu'il a enregistrés
        if ($user->isDirecteurGeneral()) {
            $assigneAIds = Assignation::where('assigne_a', $user->id)->select('courrier_id');
            $query->where(function (Builder $q) use ($user, $assigneAIds) {
                $q->whereIn('id', $assigneAIds)
                  ->orWhere('enregistre_par', $user->id);
            });
            return $query;
        }

        // DIRECTEUR / CHEF_DIVISION : courriers orientés (assignés) + courriers enregistrés + courriers de leur direction
        if ($user->isDirecteur() || $user->isChefDivision()) {
            $assigneAIds = Assignation::where('assigne_a', $user->id)->select('courrier_id');
            $query->where(function (Builder $q) use ($user, $assigneAIds) {
                $q->whereIn('id', $assigneAIds)
                  ->orWhere('enregistre_par', $user->id);
                if ($user->direction) {
                    $q->orWhere('direction', $user->direction);
                }
            });
            return $query;
        }

        $assigneAIds = Assignation::where('assigne_a', $user->id)->select('courrier_id');

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
        // SUPER_ADMIN voit tout
        if ($user->isSuperAdmin()) {
            return true;
        }

        // L'expéditeur (celui qui a enregistré) voit toujours son courrier
        if ($courrier->enregistre_par === (string) $user->id) {
            return true;
        }

        // Toute assignation explicite donne accès
        if (Assignation::where('courrier_id', $courrier->id)->where('assigne_a', $user->id)->exists()) {
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

        // SECRETAIRE rattaché à une direction : courriers de sa direction
        if ($user->isSecretaire()) {
            return !$user->direction || $courrier->direction === $user->direction;
        }

        if (($user->isChefService() || $user->isChefBureau() || $user->isAgent()) && $user->service && $user->direction
            && $courrier->service === $user->service && $courrier->direction === $user->direction) {
            return true;
        }

        return false;
    }

    public function canUpdateCourrier(User $user, Courrier $courrier): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }
        if ((string) $courrier->enregistre_par === (string) $user->id) {
            return true;
        }
        if ($user->isDirecteurGeneral()) {
            return $this->canViewCourrier($user, $courrier);
        }
        if ($user->isSecretaire()) {
            return true;
        }
        return $this->canViewCourrier($user, $courrier);
    }

    public function canDeleteCourrier(User $user, Courrier $courrier): bool
    {
        return $user->isSuperAdmin() || $user->isDirecteurGeneral() || $user->isSecretaire() || $courrier->enregistre_par === $user->id;
    }
}
