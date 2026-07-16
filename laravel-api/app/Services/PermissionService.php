<?php

namespace App\Services;

use App\Models\RoleDefinition;
use App\Models\User;
use App\Permissions\Permission;
use Illuminate\Support\Facades\Cache;

/**
 * Service de permissions : détermine les permissions d'un utilisateur selon son rôle.
 * Les permissions du rôle sont lues depuis la table `roles` (RoleDefinition).
 * SUPER_ADMIN et DIRECTEUR_GENERAL ont toutes les permissions par défaut si le rôle n'est pas en base.
 */
class PermissionService
{
    private const CACHE_TTL_SECONDS = 300;
    private const CACHE_KEY_PREFIX = 'role_permissions:';

    /** Retourne la liste des codes de permission pour un utilisateur. */
    public function getPermissionsForUser(User $user): array
    {
        if (!$user || !$user->role) {
            return [];
        }

        $cacheKey = self::CACHE_KEY_PREFIX . $user->role;
        $permissions = Cache::get($cacheKey);

        if ($permissions !== null) {
            return $permissions;
        }

        $permissions = $this->getPermissionsForRoleCode($user->role);
        Cache::put($cacheKey, $permissions, self::CACHE_TTL_SECONDS);

        return $permissions;
    }

    /** Retourne les permissions pour un code de rôle (depuis table roles ou défaut). */
    public function getPermissionsForRoleCode(string $roleCode): array
    {
        $roleDef = RoleDefinition::where('code', $roleCode)->first();

        if ($roleDef && is_array($roleDef->permissions) && count($roleDef->permissions) > 0) {
            $permissions = $roleDef->permissions;
        } else {
            $permissions = $this->getDefaultPermissionsForRole($roleCode);
        }

        // Secrétaire et Directeur : toujours avoir VOIR_DEPARTEMENTS pour l'organigramme et les formulaires
        if (in_array($roleCode, ['SECRETAIRE', 'DIRECTEUR'], true) && !in_array(Permission::VOIR_DEPARTEMENTS, $permissions, true)) {
            $permissions[] = Permission::VOIR_DEPARTEMENTS;
        }

        return $permissions;
    }

    /** Vérifie si l'utilisateur a la permission donnée. */
    public function hasPermission(User $user, string $permission): bool
    {
        if (!$user) {
            return false;
        }

        $permissions = $this->getPermissionsForUser($user);

        return in_array($permission, $permissions, true);
    }

    /** Vérifie si l'utilisateur a au moins une des permissions. */
    public function hasAnyPermission(User $user, array $permissions): bool
    {
        foreach ($permissions as $p) {
            if ($this->hasPermission($user, $p)) {
                return true;
            }
        }
        return false;
    }

    /** Invalide le cache des permissions pour un rôle (après mise à jour du rôle). */
    public function clearRoleCache(string $roleCode): void
    {
        Cache::forget(self::CACHE_KEY_PREFIX . $roleCode);
    }

    /** Permissions par défaut selon le rôle (aligné adminService.getDefaultRoles()). */
    private function getDefaultPermissionsForRole(string $roleCode): array
    {
        $all = Permission::all();

        return match ($roleCode) {
            'SUPER_ADMIN', 'DIRECTEUR_GENERAL' => $all,
            'SECRETAIRE' => [
                Permission::VOIR_COURRIERS,
                Permission::CREER_COURRIER,
                Permission::MODIFIER_COURRIER,
                Permission::ASSIGNER_COURRIER,
                Permission::CREER_WORKFLOW,
                Permission::MODIFIER_WORKFLOW,
                Permission::VOIR_UTILISATEURS, // nécessaire pour voir le DG et orienter les courriers (liste users / organigramme)
                Permission::VOIR_DEPARTEMENTS, // nécessaire pour charger Direction/Division/Service dans le formulaire d'enregistrement
                Permission::FILTRER_PAR_DIRECTION,
                Permission::FILTRER_PAR_SERVICE,
                Permission::FILTRER_PAR_SOUS_SERVICE,
            ],
            'DIRECTEUR' => [
                Permission::VOIR_COURRIERS,
                Permission::MODIFIER_COURRIER,
                Permission::ASSIGNER_COURRIER,
                Permission::VOIR_UTILISATEURS,
                Permission::VOIR_DEPARTEMENTS,
                Permission::CREER_WORKFLOW,
                Permission::MODIFIER_WORKFLOW,
                Permission::FILTRER_PAR_DIRECTION,
                Permission::FILTRER_PAR_SERVICE,
            ],
            'CHEF_SERVICE' => [
                Permission::VOIR_COURRIERS,
                Permission::MODIFIER_COURRIER,
                Permission::ASSIGNER_COURRIER,
                Permission::VOIR_UTILISATEURS,
                Permission::VOIR_DEPARTEMENTS, // Ajouté pour l'organigramme
                Permission::FILTRER_PAR_SERVICE,
                Permission::FILTRER_PAR_SOUS_SERVICE,
            ],
            'AGENT' => [
                Permission::VOIR_COURRIERS,
                Permission::MODIFIER_COURRIER,
            ],
            default => [],
        };
    }
}
