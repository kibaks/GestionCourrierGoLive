<?php

namespace App\Permissions;

/**
 * Codes de permission (alignés sur le front Permission enum).
 * Utilisés pour les Gates Laravel et le PermissionService.
 */
final class Permission
{
    // Gestion des courriers
    public const VOIR_COURRIERS = 'VOIR_COURRIERS';
    public const CREER_COURRIER = 'CREER_COURRIER';
    public const MODIFIER_COURRIER = 'MODIFIER_COURRIER';
    public const SUPPRIMER_COURRIER = 'SUPPRIMER_COURRIER';
    public const ASSIGNER_COURRIER = 'ASSIGNER_COURRIER';

    // Gestion des workflows
    public const CREER_WORKFLOW = 'CREER_WORKFLOW';
    public const MODIFIER_WORKFLOW = 'MODIFIER_WORKFLOW';

    // Gestion des utilisateurs
    public const VOIR_UTILISATEURS = 'VOIR_UTILISATEURS';
    public const CREER_UTILISATEUR = 'CREER_UTILISATEUR';
    public const MODIFIER_UTILISATEUR = 'MODIFIER_UTILISATEUR';
    public const SUPPRIMER_UTILISATEUR = 'SUPPRIMER_UTILISATEUR';

    // Gestion des rôles
    public const VOIR_ROLES = 'VOIR_ROLES';
    public const CREER_ROLE = 'CREER_ROLE';
    public const MODIFIER_ROLE = 'MODIFIER_ROLE';
    public const SUPPRIMER_ROLE = 'SUPPRIMER_ROLE';

    // Gestion des départements
    public const VOIR_DEPARTEMENTS = 'VOIR_DEPARTEMENTS';
    public const CREER_DEPARTEMENT = 'CREER_DEPARTEMENT';
    public const MODIFIER_DEPARTEMENT = 'MODIFIER_DEPARTEMENT';
    public const SUPPRIMER_DEPARTEMENT = 'SUPPRIMER_DEPARTEMENT';

    // Gestion des permissions
    public const VOIR_PERMISSIONS = 'VOIR_PERMISSIONS';
    public const MODIFIER_PERMISSIONS = 'MODIFIER_PERMISSIONS';

    // Filtres par entités organisationnelles
    public const FILTRER_PAR_DIRECTION = 'FILTRER_PAR_DIRECTION';
    public const FILTRER_PAR_SERVICE = 'FILTRER_PAR_SERVICE';
    public const FILTRER_PAR_SOUS_SERVICE = 'FILTRER_PAR_SOUS_SERVICE';

    /** Toutes les permissions (pour SUPER_ADMIN). */
    public static function all(): array
    {
        return [
            self::VOIR_COURRIERS,
            self::CREER_COURRIER,
            self::MODIFIER_COURRIER,
            self::SUPPRIMER_COURRIER,
            self::ASSIGNER_COURRIER,
            self::CREER_WORKFLOW,
            self::MODIFIER_WORKFLOW,
            self::VOIR_UTILISATEURS,
            self::CREER_UTILISATEUR,
            self::MODIFIER_UTILISATEUR,
            self::SUPPRIMER_UTILISATEUR,
            self::VOIR_ROLES,
            self::CREER_ROLE,
            self::MODIFIER_ROLE,
            self::SUPPRIMER_ROLE,
            self::VOIR_DEPARTEMENTS,
            self::CREER_DEPARTEMENT,
            self::MODIFIER_DEPARTEMENT,
            self::SUPPRIMER_DEPARTEMENT,
            self::VOIR_PERMISSIONS,
            self::MODIFIER_PERMISSIONS,
            self::FILTRER_PAR_DIRECTION,
            self::FILTRER_PAR_SERVICE,
            self::FILTRER_PAR_SOUS_SERVICE,
        ];
    }

    /** Nom de la Gate Laravel (kebab-case). */
    public static function toGateName(string $permission): string
    {
        return strtolower(str_replace('_', '-', $permission));
    }
}
