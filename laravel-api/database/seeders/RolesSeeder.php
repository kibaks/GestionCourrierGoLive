<?php

namespace Database\Seeders;

use App\Models\RoleDefinition;
use App\Permissions\Permission;
use App\Services\PermissionService;
use Illuminate\Database\Seeder;

/**
 * Insère les rôles par défaut et leurs permissions en base (table roles).
 * Aligné sur le frontend (adminService.getDefaultRoles()) et PermissionService.
 */
class RolesSeeder extends Seeder
{
    public function run(): void
    {
        $allPermissions = Permission::all();

        $roles = [
            [
                'nom' => 'Super Administrateur',
                'code' => 'SUPER_ADMIN',
                'description' => 'Accès complet à toutes les fonctionnalités',
                'permissions' => $allPermissions,
            ],
            [
                'nom' => 'Secrétaire',
                'code' => 'SECRETAIRE',
                'description' => 'Gestion des courriers entrants',
                'permissions' => [
                    Permission::VOIR_COURRIERS,
                    Permission::CREER_COURRIER,
                    Permission::MODIFIER_COURRIER,
                    Permission::ASSIGNER_COURRIER,
                    Permission::VOIR_UTILISATEURS,
                    Permission::VOIR_DEPARTEMENTS,
                    Permission::FILTRER_PAR_DIRECTION,
                    Permission::FILTRER_PAR_SERVICE,
                    Permission::FILTRER_PAR_SOUS_SERVICE,
                ],
            ],
            [
                'nom' => 'Directeur Général',
                'code' => 'DIRECTEUR_GENERAL',
                'description' => 'Supervision et validation - Accès complet comme le Super Admin',
                'permissions' => $allPermissions,
            ],
            [
                'nom' => 'Directeur',
                'code' => 'DIRECTEUR',
                'description' => 'Gestion de la direction et supervision des services',
                'permissions' => [
                    Permission::VOIR_COURRIERS,
                    Permission::MODIFIER_COURRIER,
                    Permission::ASSIGNER_COURRIER,
                    Permission::VOIR_UTILISATEURS,
                    Permission::CREER_WORKFLOW,
                    Permission::MODIFIER_WORKFLOW,
                    Permission::FILTRER_PAR_DIRECTION,
                    Permission::FILTRER_PAR_SERVICE,
                ],
            ],
            [
                'nom' => 'Chef de Service',
                'code' => 'CHEF_SERVICE',
                'description' => 'Gestion du service et des agents',
                'permissions' => [
                    Permission::VOIR_COURRIERS,
                    Permission::MODIFIER_COURRIER,
                    Permission::ASSIGNER_COURRIER,
                    Permission::VOIR_UTILISATEURS,
                    Permission::FILTRER_PAR_SERVICE,
                    Permission::FILTRER_PAR_SOUS_SERVICE,
                ],
            ],
            [
                'nom' => 'Agent',
                'code' => 'AGENT',
                'description' => 'Agent opérationnel - Consultation et traitement des courriers',
                'permissions' => [
                    Permission::VOIR_COURRIERS,
                    Permission::MODIFIER_COURRIER,
                ],
            ],
        ];

        $permissionService = app(PermissionService::class);

        foreach ($roles as $data) {
            RoleDefinition::updateOrCreate(
                ['code' => $data['code']],
                [
                    'nom' => $data['nom'],
                    'description' => $data['description'],
                    'permissions' => $data['permissions'],
                ]
            );
            $permissionService->clearRoleCache($data['code']);
        }

        $this->command->info('Rôles et permissions insérés (table roles). Cache des permissions vidé.');
    }
}
