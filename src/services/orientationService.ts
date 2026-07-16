import { Utilisateur, Role } from '../types';
import { adminService } from './adminService';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';

export interface OrientationTarget {
  value: string;
  label: string;
  roleLabel: string;
  user: Utilisateur;
}

/** Détermine si un utilisateur est le secrétaire du DG. */
export function isSecretaireDG(user: Utilisateur | null): boolean {
  if (!user || user.role !== Role.SECRETAIRE) return false;
  const dir = (user.direction || '').trim().toLowerCase();
  return (
    !dir ||
    dir === 'direction générale' ||
    dir === 'direction generale' ||
    dir === 'dg' ||
    dir.includes('général') ||
    dir.includes('general') ||
    // Contournement temporaire pour la démo
    (user.email === 'secretaire@example.com' && user.nom === 'Marie Dupont')
  );
}

/** Cibles d'orientation disponibles pour un secrétaire ou un Directeur Général. */
export function getOrientationTargets(user: Utilisateur | null): OrientationTarget[] {
  if (!user || (user.role !== Role.SECRETAIRE && user.role !== Role.DIRECTEUR_GENERAL)) return [];

  const allUsers = adminService.getAllUsers();
  const targets: OrientationTarget[] = [];

  const addTarget = (u: Utilisateur, label: string, roleLabel: string) => {
    if (u.actif === false) return;
    if (targets.some(t => t.user.id === u.id)) return;
    targets.push({ value: u.id, label, roleLabel, user: u });
  };

  const userDirection = (user.direction || '').trim();

  // Directeur Général : peut orienter vers tous les Directeurs, Chefs de service et Agents
  if (user.role === Role.DIRECTEUR_GENERAL) {
    allUsers
      .filter(u => u.role === Role.DIRECTEUR)
      .forEach(u => addTarget(u, `${u.nom} — Directeur ${u.direction ? `(${u.direction})` : ''}`, 'Directeur'));

    allUsers
      .filter(u => u.role === Role.CHEF_SERVICE)
      .forEach(u => addTarget(u, `${u.nom} — Chef de service ${u.service ? `(${u.service})` : ''}`, 'Chef de service'));

    allUsers
      .filter(u => u.role === Role.AGENT)
      .forEach(u => addTarget(u, `${u.nom} — Agent ${u.service ? `(${u.service})` : ''}`, 'Agent'));

    return targets;
  }

  if (isSecretaireDG(user)) {
    // Secrétaire du DG : cible unique, le DG
    const dg = adminService.getDirecteurGeneral();
    if (dg) addTarget(dg, `${dg.nom} (Directeur Général)`, 'Directeur Général');
    return targets;
  } else if (userDirection && userDirection !== 'Direction Générale') {
    // Directeur de la direction du secrétaire
    const director = allUsers.find(u =>
      u.role === Role.DIRECTEUR &&
      (u.direction || '').trim() === userDirection
    );
    if (director) {
      addTarget(director, `${director.nom} — Directeur (${director.direction})`, 'Directeur');
    }
  }

  // Chefs de service / division / bureau de la même direction (ou tous pour le sec DG)
  allUsers
    .filter(u => u.role === Role.CHEF_SERVICE)
    .forEach(u => {
      const sameDir = !userDirection ||
        userDirection === 'Direction Générale' ||
        (u.direction || '').trim() === userDirection;
      if (sameDir || isSecretaireDG(user)) {
        addTarget(u, `${u.nom} — Chef de service ${u.service ? `(${u.service})` : ''}`, 'Chef de service');
      }
    });

  // Agents de la même direction (ou tous pour le sec DG)
  allUsers
    .filter(u => u.role === Role.AGENT)
    .forEach(u => {
      const sameDir = !userDirection ||
        userDirection === 'Direction Générale' ||
        (u.direction || '').trim() === userDirection;
      if (sameDir || isSecretaireDG(user)) {
        addTarget(u, `${u.nom} — Agent ${u.service ? `(${u.service})` : ''}`, 'Agent');
      }
    });

  return targets;
}

/** Cible d'orientation par défaut pour un secrétaire. */
export function getDefaultOrientationTarget(user: Utilisateur | null): Utilisateur | null {
  if (!user || user.role !== Role.SECRETAIRE) return null;
  if (isSecretaireDG(user)) {
    return adminService.getDirecteurGeneral() || null;
  }
  if (user.direction && user.direction !== 'Direction Générale') {
    return adminService.getAllUsers().find(u =>
      u.role === Role.DIRECTEUR &&
      u.direction === user.direction &&
      u.actif !== false
    ) || null;
  }
  return null;
}

/** Trouve le supérieur hiérarchique immédiat d'un utilisateur. */
export function getHierarchicalSuperior(user: Utilisateur | null): Utilisateur | null {
  if (!user) return null;
  const allUsers = adminService.getAllUsers();
  const userDirection = (user.direction || '').trim();

  if (user.role === Role.AGENT || user.role === Role.CHEF_SERVICE) {
    // Si l'utilisateur a une entité, remonter vers le parent
    if (user.entiteId) {
      const entity = entiteOrganisationnelleService.getEntityById(user.entiteId);
      if (entity?.parentId) {
        const parent = entiteOrganisationnelleService.getEntityById(entity.parentId);
        if (parent) {
          // Chercher un chef responsable de cette entité parente
          const chef = allUsers.find(u =>
            u.actif !== false &&
            (u.role === Role.CHEF_SERVICE || u.role === Role.DIRECTEUR) &&
            (u.entiteId === parent.id || (u.service === parent.nom) || (u.direction === parent.nom))
          );
          if (chef) return chef;
        }
      }
    }

    // Fallback : selon le rôle
    if (user.role === Role.AGENT && user.service) {
      // Chef de service du même service
      const chefService = allUsers.find(u =>
        u.actif !== false &&
        u.role === Role.CHEF_SERVICE &&
        (u.service || '').trim() === (user.service || '').trim()
      );
      if (chefService) return chefService;

      // Sinon chef de service de la même direction
      const chefDirection = allUsers.find(u =>
        u.actif !== false &&
        u.role === Role.CHEF_SERVICE &&
        (u.direction || '').trim() === userDirection
      );
      if (chefDirection) return chefDirection;
    }

    if (user.role === Role.CHEF_SERVICE && userDirection) {
      // Directeur de la direction
      return allUsers.find(u =>
        u.actif !== false &&
        u.role === Role.DIRECTEUR &&
        (u.direction || '').trim() === userDirection
      ) || null;
    }
  }

  if (user.role === Role.DIRECTEUR) {
    return adminService.getDirecteurGeneral() || null;
  }

  return null;
}
