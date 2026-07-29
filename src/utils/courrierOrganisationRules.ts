import { EntiteOrganisationnelle, Role, SensCourrier, TypeCourrier, Utilisateur } from '../types';

const restrictedRoles = new Set<Role>([Role.DIRECTEUR, Role.CHEF_DIVISION, Role.CHEF_BUREAU]);

export const isRestrictedOrganisationManager = (user?: Utilisateur | null): boolean =>
  Boolean(user && restrictedRoles.has(user.role));

export const getOrganisationEntity = (
  user: Utilisateur | null | undefined,
  entities: EntiteOrganisationnelle[],
): EntiteOrganisationnelle | undefined => {
  if (!user) return undefined;
  if (user.entiteId) return entities.find(entity => entity.id === user.entiteId);
  if (user.role === Role.DIRECTEUR && user.direction) {
    return entities.find(entity => entity.type === 'direction' && entity.nom === user.direction);
  }
  if (user.role === Role.CHEF_DIVISION && user.direction) {
    // Le champ direction contient ici la division ; on cherche une entité de type division
    return entities.find(entity => entity.type === 'division' && entity.nom === user.direction);
  }
  if ((user.role === Role.CHEF_SERVICE || user.role === Role.CHEF_BUREAU) && user.service) {
    return entities.find(entity => entity.type === 'service' && entity.nom === user.service);
  }
  return undefined;
};

export const getAllowedRecipientIds = (
  user: Utilisateur | null | undefined,
  entities: EntiteOrganisationnelle[],
): Set<string> => {
  const allowed = new Set(entities.filter(entity => entity.type === 'direction_generale').map(entity => entity.id));
  const organisation = getOrganisationEntity(user, entities);
  if (!organisation) return allowed;
  const pending = [organisation.id];
  while (pending.length) {
    const parentId = pending.pop()!;
    entities.filter(entity => entity.parentId === parentId && entity.actif !== false).forEach(entity => {
      allowed.add(entity.id);
      pending.push(entity.id);
    });
  }
  return allowed;
};

export const hasRestrictedCourrierShape = (type: TypeCourrier, sens: SensCourrier): boolean =>
  type === TypeCourrier.INTERNE && sens === SensCourrier.SORTANT;
