import { Utilisateur, Role, Direction, Service, Departement, EntiteOrganisationnelle } from '../types';
import { adminService } from './adminService';
import { directionService } from './directionService';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';
import { entiteTypeService } from './entiteTypeService';
import { userService } from './userService';

/** Ordre hiérarchique : Direction générale → Direction → Division → Service → … */
const ENTITY_TYPE_ORDER: Record<string, number> = {
  direction_generale: 0,
  direction: 1,
  division: 2,
  service: 3,
  'sous-service': 4,
  bureau: 5,
  cellule: 6,
};

/** Type d'entité du nœud parent (pour afficher la responsabilité : Directeur, Chef de division, etc.) */
export type ParentEntityTypeForResponsabilite = 'direction' | 'division' | 'service' | 'sous-service' | 'bureau' | 'cellule';

export interface OrganigrammeNode {
  id: string;
  type: 'direction_generale' | 'direction' | 'division' | 'service' | 'sous-service' | 'bureau' | 'utilisateur' | 'fonction' | 'sous-fonction';
  label: string;
  role?: Role;
  /** Type d'entité parente (pour libellé responsabilité dans l'organigramme) */
  parentEntityType?: ParentEntityTypeForResponsabilite;
  directionId?: string;
  serviceId?: string;
  children?: OrganigrammeNode[];
  data?: Direction | Service | Utilisateur;
  level: number;
  parentId?: string; // Pour les sous-fonctions personnalisées
  isCustom?: boolean; // Indique si c'est une fonction/sous-fonction ajoutée manuellement
}

/** Libellé de la responsabilité selon le type d'entité (organisation) et le rôle. */
export function getResponsabiliteLabel(role: Role | undefined, parentEntityType?: ParentEntityTypeForResponsabilite): string {
  // Sous une direction : distinguer Directeur et Secrétaire (pas tout le monde en "Directeur")
  if (parentEntityType === 'direction' && role === Role.SECRETAIRE) return 'Secrétaire';
  if (parentEntityType) {
    const byType: Record<ParentEntityTypeForResponsabilite, string> = {
      direction: 'Directeur',
      division: 'Chef de division',
      service: 'Chef de service',
      'sous-service': 'Chef de sous-service',
      bureau: 'Chef de bureau',
      cellule: 'Responsable de cellule',
    };
    return byType[parentEntityType];
  }
  const byRole: Record<string, string> = {
    [Role.SUPER_ADMIN]: 'Super admin',
    [Role.DIRECTEUR_GENERAL]: 'Directeur général',
    [Role.SECRETAIRE]: 'Secrétaire',
    [Role.DIRECTEUR]: 'Directeur',
    [Role.CHEF_SERVICE]: 'Chef de service',
    [Role.AGENT]: 'Agent',
  };
  return (role && byRole[role]) || 'Agent';
}

class OrganigrammeService {
  /** Trouver une entité sous un parent dont le nom correspond (récursif). */
  private findEntityUnderParentByNom(parentId: string, nom: string, entities: { id: string; parentId?: string | null; nom: string }[]): { id: string; type: string } | null {
    const direct = entities.filter(e => e.parentId === parentId);
    const byNom = direct.find(e => e.nom === nom);
    if (byNom) return { id: byNom.id, type: (byNom as { type?: string }).type ?? 'service' };
    for (const child of direct) {
      const found = this.findEntityUnderParentByNom(child.id, nom, entities);
      if (found) return found;
    }
    return null;
  }

  /** Pour chaque utilisateur sans entiteId, résoudre l'entité (direction ou sous-entité par direction+service). */
  private resolveUserEntityIds(users: Utilisateur[], entities: { id: string; parentId?: string | null; nom: string; type: string }[], racines: { id: string; nom: string }[]): Map<string, string> {
    const map = new Map<string, string>();
    const firstRacineId = racines.length > 0 ? racines[0].id : null;
    for (const u of users) {
      if (u.entiteId) {
        const normalizedEntiteId = String(u.entiteId);
        const matchedEntity = entities.find(e => String(e.id) === normalizedEntiteId);
        if (matchedEntity) {
          map.set(u.id, matchedEntity.id);
          continue;
        }
        // entiteId set mais entité non trouvée dans les types configurés → fallback direction/service
      }
      if (!u.direction) {
        // Sans direction : placer dans la première direction pour qu'ils apparaissent dans l'organigramme
        if (firstRacineId) map.set(u.id, firstRacineId);
        continue;
      }
      const racine = racines.find(r => r.nom === u.direction);
      if (!racine) {
        // Direction inconnue : placer dans la première direction pour qu'ils apparaissent
        if (firstRacineId) map.set(u.id, firstRacineId);
        continue;
      }
      if (!u.service) {
        map.set(u.id, racine.id);
        continue;
      }
      const found = this.findEntityUnderParentByNom(racine.id, u.service, entities);
      if (found) map.set(u.id, found.id);
      else map.set(u.id, racine.id);
    }
    return map;
  }

  // Construire l'organigramme à partir de la division de l'utilisateur (pour les chefs de division)
  buildOrganigrammeFromUserDivision(user: Utilisateur): OrganigrammeNode[] {
    if (!user.service) {
      console.warn('⚠️ Utilisateur sans service, retour à l\'organigramme complet');
      return this.buildOrganigramme();
    }

    const configuredTypeCodes = new Set(
      entiteTypeService.getAll().filter(t => t.actif).map(t => t.code)
    );
    
    const entities = entiteOrganisationnelleService
      .getAllEntities()
      .filter(e => e.actif !== false && configuredTypeCodes.has(e.type));
    
    const users = adminService.getAllUsers().filter(u => u.actif && u.role !== Role.SUPER_ADMIN);

    // Trouver la division de l'utilisateur
    const userDivision = entities.find(e => 
      e.type === 'division' && e.nom === user.service
    );

    if (!userDivision) {
      console.warn('⚠️ Division non trouvée pour l\'utilisateur:', user.service);
      return this.buildOrganigramme();
    }

    console.log('🎯 Construction organigramme depuis la division:', userDivision.nom);

    // Créer un mapping des utilisateurs aux entités
    const racines = entities.filter(e => e.type === 'direction');
    const userPlacedAtEntityId = this.resolveUserEntityIds(users, entities, racines);

    // Logs de diagnostic pour voir ce qui est disponible
    console.log('📊 Diagnostic chef de division:', {
      userDivision: { id: userDivision.id, nom: userDivision.nom, type: userDivision.type, parentId: userDivision.parentId },
      totalEntities: entities.length,
      entitiesByType: entities.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalUsers: users.length,
      usersByRole: users.reduce((acc, u) => {
        acc[u.role] = (acc[u.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      userPlacedMappings: Array.from(userPlacedAtEntityId.entries()).slice(0, 5)
    });

    // Utiliser la logique existante pour construire la hiérarchie
    // Adapter la logique de buildOrganigramme pour partir de la division
    const buildDivisionHierarchy = (division: EntiteOrganisationnelle): OrganigrammeNode => {
      console.log('🔍 Construction hiérarchie pour la division:', division.nom);
      
      const divisionNode: OrganigrammeNode = {
        id: `ent-${division.id}`,
        type: division.type as any,
        label: division.nom,
        level: 0,
        data: division,
        children: []
      };

      // Ajouter les enfants de la division (services, sous-services, bureaux, etc.)
      const children = entities
        .filter(e => {
          // Inclure les entités enfant de cette division
          const directChild = e.parentId === division.id;
          
          // Utiliser le mapping par noms pour trouver les services/bureaux liés à cette division
          let mappedChild = false;
          if (e.type === 'service' || e.type === 'bureau' || e.type === 'sous-service') {
            mappedChild = this.isServiceUnderDivision(e, division, users);
          }
          
          // Pour les services, aussi vérifier si le nom contient des mots-clés de la division
          let keywordMatch = false;
          if (e.type === 'service' || e.type === 'bureau' || e.type === 'sous-service') {
            const divisionName = division.nom.toLowerCase();
            const entityName = e.nom.toLowerCase();
            
            // Mots-clés pour Division Finance et Comptabilité
            if (divisionName.includes('finance') || divisionName.includes('compt')) {
              keywordMatch = entityName.includes('compt') || entityName.includes('financ') || entityName.includes('budget');
            }
            // Mots-clés pour Division Audit et Enquêtes
            else if (divisionName.includes('audit') || divisionName.includes('enqu')) {
              keywordMatch = entityName.includes('audit') || entityName.includes('enqu') || entityName.includes('contrôle');
            }
            // Mots-clés pour Division Ressources Humaines
            else if (divisionName.includes('ressource') || divisionName.includes('humain')) {
              keywordMatch = entityName.includes('recrut') || entityName.includes('carri') || entityName.includes('form') || entityName.includes('personnel');
            }
            // Mots-clés pour Division Formation
            else if (divisionName.includes('formation')) {
              keywordMatch = entityName.includes('form') || entityName.includes('stage') || entityName.includes('apprent');
            }
            // Mots-clés pour Division Logistique
            else if (divisionName.includes('logist')) {
              keywordMatch = entityName.includes('logist') || entityName.includes('transport') || entityName.includes('stock');
            }
            // Mots-clés pour Division Administration
            else if (divisionName.includes('admin')) {
              keywordMatch = entityName.includes('admin') || entityName.includes('secret') || entityName.includes('archiv');
            }
          }
          
          const isChild = directChild || mappedChild || keywordMatch;
          
          if (isChild) {
            console.log('✅ Enfant trouvé pour la division:', e.nom, e.type, 'directChild:', directChild, 'mappedChild:', mappedChild, 'keywordMatch:', keywordMatch);
          }
          
          return isChild;
        })
        .sort((a, b) => {
          const orderA = ENTITY_TYPE_ORDER[a.type] ?? 99;
          const orderB = ENTITY_TYPE_ORDER[b.type] ?? 99;
          if (orderA !== orderB) return orderA - orderB;
          return (a.ordre ?? 0) - (b.ordre ?? 0);
        });

      console.log('📋 Enfants trouvés pour la division:', children.length, children.map(c => ({ nom: c.nom, type: c.type })));

      for (const child of children) {
        const childNode = this.buildEntityNode(child, entities, users, userPlacedAtEntityId, 1);
        if (childNode) {
          divisionNode.children!.push(childNode);
        }
      }

      // Ajouter les utilisateurs directement sous la division
      const divisionUsers = users.filter(u => {
        const placeId = u.entiteId || userPlacedAtEntityId.get(u.id);
        const isUnderDivision = placeId === division.id;
        if (isUnderDivision && u.role === Role.CHEF_SERVICE) {
          console.log('👤 Chef de division trouvé:', u.nom, 'placeId:', placeId);
        }
        return isUnderDivision;
      });

      console.log('👥 Utilisateurs sous la division:', divisionUsers.length, divisionUsers.map(u => ({ nom: u.nom, role: u.role })));

      for (const user of divisionUsers) {
        const userNode: OrganigrammeNode = {
          id: `user-${user.id}`,
          type: 'utilisateur',
          label: user.nom,
          role: user.role,
          level: 1,
          data: user,
          children: []
        };
        divisionNode.children!.push(userNode);
      }

      console.log('🌳 Nœud division final:', {
        label: divisionNode.label,
        childrenCount: divisionNode.children!.length,
        childrenTypes: divisionNode.children!.map(c => ({ type: c.type, label: c.label }))
      });

      return divisionNode;
    };

    const divisionNode = buildDivisionHierarchy(userDivision);

    console.log('🌳 Organigramme final pour chef de division:', {
      divisionNode: {
        id: divisionNode.id,
        label: divisionNode.label,
        childrenCount: divisionNode.children?.length || 0,
        grandChildrenCount: divisionNode.children?.[0]?.children?.length || 0
      }
    });

    // Retourner directement la division comme racine (pas de nœud artificiel)
    return [divisionNode];
  }

  // Helper pour vérifier si un service est sous une division
  private isServiceUnderDivision(service: EntiteOrganisationnelle, division: EntiteOrganisationnelle, users: Utilisateur[]): boolean {
    // Utiliser la logique de mapping basée sur les noms
    const serviceName = service.nom.toLowerCase();
    const divisionName = division.nom.toLowerCase();
    
    return divisionName.includes('finance') && serviceName.includes('compt') ||
           divisionName.includes('compt') && serviceName.includes('compt') ||
           divisionName.includes('ressource') && serviceName.includes('recrut') ||
           divisionName.includes('humain') && (serviceName.includes('recrut') || serviceName.includes('carri')) ||
           divisionName.includes('formation') && serviceName.includes('form') ||
           divisionName.includes('audit') && serviceName.includes('audit') ||
           divisionName.includes('enqu') && serviceName.includes('enqu') ||
           divisionName.includes('logist') && serviceName.includes('logist') ||
           divisionName.includes('admin') && serviceName.includes('admin') ||
           divisionName.includes('factur') && serviceName.includes('factur') ||
           divisionName.includes('recouv') && serviceName.includes('recouv') ||
           (divisionName === 'division audit interne' && serviceName.includes('audit')) ||
           (divisionName === 'secrétariat permanent cgpmp' && serviceName.includes('secrét')) ||
           (divisionName === 'division audits et enquêtes' && (serviceName.includes('audit') || serviceName.includes('enqu'))) ||
           (divisionName === 'division des services généraux' && serviceName.includes('logist')) ||
           (divisionName === 'division des ressources humaines' && (serviceName.includes('recrut') || serviceName.includes('carri'))) ||
           (divisionName === 'division finance et comptabilité' && serviceName.includes('compt')) ||
           (divisionName === 'division facturation et recouvrement' && (serviceName.includes('factur') || serviceName.includes('recouv'))) ||
           (divisionName === 'division de la formation' && serviceName.includes('form')) ||
           (divisionName === 'division des appuis techniques' && serviceName.includes('appui')) ||
           (divisionName === 'division administration des provinces' && serviceName.includes('admin'));
  }

  // Helper pour construire un nœud d'entité
  private buildEntityNode(entity: EntiteOrganisationnelle, allEntities: EntiteOrganisationnelle[], users: Utilisateur[], userPlacedAtEntityId: Map<string, string>, level: number): OrganigrammeNode | null {
    const node: OrganigrammeNode = {
      id: `ent-${entity.id}`,
      type: entity.type as any,
      label: entity.nom,
      level,
      data: entity,
      children: []
    };

    // Ajouter les enfants récursivement
    const children = allEntities.filter(e => e.parentId === entity.id);
    for (const child of children) {
      const childNode = this.buildEntityNode(child, allEntities, users, userPlacedAtEntityId, level + 1);
      if (childNode) {
        node.children!.push(childNode);
      }
    }

    // Ajouter les utilisateurs sous cette entité
    const entityUsers = users.filter(u => {
      const placeId = u.entiteId || userPlacedAtEntityId.get(u.id);
      return placeId === entity.id;
    });

    for (const user of entityUsers) {
      const userNode: OrganigrammeNode = {
        id: `user-${user.id}`,
        type: 'utilisateur',
        label: user.nom,
        role: user.role,
        level: level + 1,
        data: user,
        children: []
      };
      node.children!.push(userNode);
    }

    return node;
  }

  // Construire l'organigramme uniquement avec les entités administratives telles que configurées :
  // - Types actifs dans la configuration (EntiteTypeDefinition / entiteTypeService)
  // - Entités actives (actif !== false)
  // - Racines = directions uniquement (sans la direction générale)
  // - Tous les utilisateurs actifs (hors SUPER_ADMIN) sont placés via entiteId ou résolution direction/service
  buildOrganigramme(): OrganigrammeNode[] {
    const configuredTypeCodes = new Set(
      entiteTypeService.getAll().filter(t => t.actif).map(t => t.code)
    );
    
    const entities = entiteOrganisationnelleService
      .getAllEntities()
      .filter(e => e.actif !== false && configuredTypeCodes.has(e.type));
    
    const users = adminService.getAllUsers().filter(u => u.actif && u.role !== Role.SUPER_ADMIN);

    // Racines = directions uniquement (sans la direction générale)
    const racines = entities
      .filter(e => e.type === 'direction')
      .sort((a, b) => {
        const oA = ENTITY_TYPE_ORDER[a.type] ?? 99;
        const oB = ENTITY_TYPE_ORDER[b.type] ?? 99;
        if (oA !== oB) return oA - oB;
        return (a.ordre ?? 0) - (b.ordre ?? 0);
      });

    // Trier les entités par ordre hiérarchique puis par nom
    const sortedEntities = [...entities].sort((a, b) => {
      const oA = ENTITY_TYPE_ORDER[a.type] ?? 999;
      const oB = ENTITY_TYPE_ORDER[b.type] ?? 999;
      if (oA !== oB) return oA - oB;
      return (a.ordre ?? 0) - (b.ordre ?? 0);
    });

    // Créer un mapping des divisions aux directions basé sur les chefs de service
    const divisionsToDirections = new Map<string, string>();
    const divisions = entities.filter(e => e.type === 'division');
    const chefs = users.filter(u => u.role === Role.CHEF_SERVICE);
    
    console.log('🔧 Mapping divisions-directions:', {
      divisionsCount: divisions.length,
      chefsCount: chefs.length
    });
    
    divisions.forEach(division => {
      const divisionName = division.nom.toLowerCase();
      
      // Chercher un chef de service qui pourrait correspondre à cette division
      const matchingChef = chefs.find(chef => {
        if (!chef.direction || !chef.service) return false;
        
        const serviceName = chef.service.toLowerCase();
        const directionName = chef.direction.toLowerCase();
        
        // Même logique de mapping que pour trouver les chefs
        const isRelated = 
          divisionName.includes('finance') && serviceName.includes('compt') ||
          divisionName.includes('compt') && serviceName.includes('compt') ||
          divisionName.includes('ressource') && serviceName.includes('recrut') ||
          divisionName.includes('humain') && (serviceName.includes('recrut') || serviceName.includes('carri')) ||
          divisionName.includes('formation') && serviceName.includes('form') ||
          divisionName.includes('audit') && serviceName.includes('audit') ||
          divisionName.includes('enqu') && serviceName.includes('enqu') ||
          divisionName.includes('logist') && serviceName.includes('logist') ||
          divisionName.includes('admin') && serviceName.includes('admin') ||
          divisionName.includes('factur') && serviceName.includes('factur') ||
          divisionName.includes('recouv') && serviceName.includes('recouv') ||
          (divisionName === 'division audit interne' && serviceName.includes('audit')) ||
          (divisionName === 'secrétariat permanent cgpmp' && serviceName.includes('secrét')) ||
          (divisionName === 'division audits et enquêtes' && (serviceName.includes('audit') || serviceName.includes('enqu'))) ||
          (divisionName === 'division des services généraux' && serviceName.includes('logist')) ||
          (divisionName === 'division des ressources humaines' && (serviceName.includes('recrut') || serviceName.includes('carri'))) ||
          (divisionName === 'division finance et comptabilité' && serviceName.includes('compt')) ||
          (divisionName === 'division facturation et recouvrement' && (serviceName.includes('factur') || serviceName.includes('recouv'))) ||
          (divisionName === 'division de la formation' && serviceName.includes('form')) ||
          (divisionName === 'division des appuis techniques' && serviceName.includes('appui')) ||
          (divisionName === 'division administration des provinces' && serviceName.includes('admin'));
        
        if (isRelated) {
          console.log('🔗 Mapping division -> direction:', division.nom, '->', chef.direction, '(chef:', chef.nom, ')');
          return true;
        }
        return false;
      });
      
      if (matchingChef && matchingChef.direction) {
        // Trouver la direction correspondante
        const targetDirection = entities.find(e => e.type === 'direction' && e.nom === matchingChef.direction);
        if (targetDirection) {
          divisionsToDirections.set(division.id, targetDirection.id);
        }
      }
    });

    const resolvedUserEntityId = this.resolveUserEntityIds(users, entities, racines);
    const userPlacedAtEntityId = new Map<string, string>();
    for (const [uid, eid] of resolvedUserEntityId) userPlacedAtEntityId.set(uid, eid);

    // DIAGNOSTIC: Log des utilisateurs et leur placement
    console.log('🏗️ buildOrganigramme diagnostic:', {
      totalEntities: entities.length,
      totalUsers: users.length,
      racines: racines.length,
      entitiesSample: entities.slice(0, 5).map(e => ({ id: e.id, type: e.type, nom: e.nom.substring(0, 25), parentId: e.parentId })),
      chefs: users.filter(u => u.role === Role.CHEF_SERVICE).map(u => ({ 
        nom: u.nom, 
        entiteId: u.entiteId, 
        direction: u.direction, 
        service: u.service,
        placedAt: resolvedUserEntityId.get(u.id)
      })),
      divisions: entities.filter(e => e.type === 'division').map(d => ({ 
        id: d.id, 
        nom: d.nom, 
        parentId: d.parentId 
      }))
    });

    const rootNodes: OrganigrammeNode[] = [];

    for (const racine of racines) {
      const rootNode: OrganigrammeNode = {
        id: `dir-${racine.id}`,
        type: 'direction',
        label: racine.nom,
        data: { id: racine.id, nom: racine.nom, description: racine.description } as Direction,
        level: 1,
        children: []
      };

      const entityTypeForResponsabilite = (entity: { type: string }): ParentEntityTypeForResponsabilite =>
        (['direction', 'division', 'service', 'sous-service', 'bureau', 'cellule'].includes(entity.type) ? entity.type as ParentEntityTypeForResponsabilite : 'service');

      // Enfants récursifs : division → service → sous-service/bureau (jamais direction_generale).
      const buildEntityHierarchy = (parentId: string, level: number, directionId: string, directionNom: string): OrganigrammeNode[] => {
        // Inclure les divisions qui sont mappées à cette direction
        const children = entities
          .filter(e => {
            // Entités avec parentId normal
            if (e.parentId === parentId && e.type !== 'direction_generale') return true;
            // Divisions sans parentId mais mappées à cette direction
            if (e.type === 'division' && !e.parentId && divisionsToDirections.get(e.id) === directionId) return true;
            return false;
          })
          .sort((a, b) => {
            const orderA = ENTITY_TYPE_ORDER[a.type] ?? 99;
            const orderB = ENTITY_TYPE_ORDER[b.type] ?? 99;
            if (orderA !== orderB) return orderA - orderB;
            return (a.ordre ?? 0) - (b.ordre ?? 0);
          });
        const nodes: OrganigrammeNode[] = [];

        for (const entity of children) {
          const entityIdStr = String(entity.id);
          const directionIdStr = String(directionId);
          const entityUsers = users.filter(u => {
            const placeId = u.entiteId || userPlacedAtEntityId.get(u.id);
            if (placeId != null && String(placeId) === entityIdStr) {
              return true;
            }
            // Fallback par (direction, service) : s'applique quand l'utilisateur n'est pas rattaché
            // à une sous-entité spécifique (placeId absent ou égal à la direction racine)
            const isAtDirectionLevel = !placeId || String(placeId) === directionIdStr;
            if (isAtDirectionLevel && u.direction === directionNom && u.service === entity.nom) {
              if (entity.type === 'division') return true;
              if (entity.type === 'service') return true;
              if (entity.type === 'bureau' || entity.type === 'sous-service' || entity.type === 'cellule') return true;
            }
            return false;
          });
          
          const responsableId = (entity as { responsableId?: string }).responsableId;
          const responsableUser = responsableId ? users.find(u => u.id === responsableId) : undefined;

          let nodeType: OrganigrammeNode['type'];
          if (entity.type === 'direction') nodeType = 'direction';
          else if (entity.type === 'division') nodeType = 'division';
          else if (entity.type === 'service') nodeType = 'service';
          else if (entity.type === 'sous-service') nodeType = 'sous-service';
          else if (entity.type === 'bureau') nodeType = 'bureau';
          else if (entity.type === 'direction_generale') nodeType = 'direction_generale';
          else nodeType = 'service';

          const entityNode: OrganigrammeNode = {
            id: `ent-${entity.id}`,
            type: nodeType,
            label: entity.nom,
            directionId,
            serviceId: entity.id,
            data: { id: entity.id, nom: entity.nom, directionId, description: entity.description, responsableId: entity.responsableId } as Service,
            level,
            children: []
          };

          const childNodes = buildEntityHierarchy(entity.id, level + 1, directionId, directionNom);
          entityNode.children!.push(...childNodes);
          const parentType = entityTypeForResponsabilite(entity);

          // Règles d'affichage :
          // - division / service : uniquement le chef (1 personne)
          // - bureau / sous-service / cellule : chef + autres agents
          const showOnlyChef = entity.type === 'division' || entity.type === 'service';
          const showChefAndAgents =
            entity.type === 'sous-service' || entity.type === 'bureau' || entity.type === 'cellule';

          if (showOnlyChef) {
            let chefToShow =
              responsableUser ??
              entityUsers.find(u => u.role === Role.CHEF_SERVICE) ??
              (entityUsers.length > 0 ? entityUsers[0] : undefined);

            // Division sans utilisateur rattaché directement : chercher un chef dans les bureaux / services descendants
            if (!chefToShow && entity.type === 'division') {
              const descendantIds = entiteOrganisationnelleService.getDescendantEntityIds(entity.id).map(String);
              console.log('🔍 Recherche chef pour division:', entity.nom, 'descendants:', descendantIds.length);
              
              // Chercher d'abord par entiteId (si les entités sont correctement liées)
              let descendantChef = users.find(u => {
                const placeId = u.entiteId || userPlacedAtEntityId.get(u.id);
                if (!placeId) return false;
                const match = descendantIds.includes(String(placeId)) && u.role === Role.CHEF_SERVICE;
                if (match) console.log('✅ Chef trouvé par entiteId:', u.nom, 'placeId:', placeId);
                return match;
              });
              
              // Si non trouvé, chercher par mapping direction/service (fallback pour parentId=NULL)
              if (!descendantChef) {
                descendantChef = users.find(u => {
                  // Le chef doit être un CHEF_SERVICE
                  if (u.role !== Role.CHEF_SERVICE) return false;
                  if (!u.direction || !u.service) return false;
                  
                  // La division doit correspondre au service du chef (mapping basé sur les noms)
                  // Ex: "Division Finance et Comptabilité" -> "Service Comptabilité Générale"
                  const divisionName = entity.nom.toLowerCase();
                  const serviceName = u.service.toLowerCase();
                  const directionName = u.direction.toLowerCase();
                  
                  // Vérifier si le service est lié à cette division par similarité de noms
                  const isRelatedService = 
                    divisionName.includes('finance') && serviceName.includes('compt') ||
                    divisionName.includes('compt') && serviceName.includes('compt') ||
                    divisionName.includes('ressource') && serviceName.includes('recrut') ||
                    divisionName.includes('humain') && (serviceName.includes('recrut') || serviceName.includes('carri')) ||
                    divisionName.includes('formation') && serviceName.includes('form') ||
                    divisionName.includes('audit') && serviceName.includes('audit') ||
                    divisionName.includes('enqu') && serviceName.includes('enqu') ||
                    divisionName.includes('logist') && serviceName.includes('logist') ||
                    divisionName.includes('admin') && serviceName.includes('admin') ||
                    divisionName.includes('factur') && serviceName.includes('factur') ||
                    divisionName.includes('recouv') && serviceName.includes('recouv') ||
                    // Mapping exact pour certains cas
                    (divisionName === 'division audit interne' && serviceName.includes('audit')) ||
                    (divisionName === 'secrétariat permanent cgpmp' && serviceName.includes('secrét')) ||
                    (divisionName === 'division audits et enquêtes' && (serviceName.includes('audit') || serviceName.includes('enqu'))) ||
                    (divisionName === 'division des services généraux' && serviceName.includes('logist')) ||
                    (divisionName === 'division des ressources humaines' && (serviceName.includes('recrut') || serviceName.includes('carri'))) ||
                    (divisionName === 'division finance et comptabilité' && serviceName.includes('compt')) ||
                    (divisionName === 'division facturation et recouvrement' && (serviceName.includes('factur') || serviceName.includes('recouv'))) ||
                    (divisionName === 'division de la formation' && serviceName.includes('form')) ||
                    (divisionName === 'division des appuis techniques' && serviceName.includes('appui')) ||
                    (divisionName === 'division administration des provinces' && serviceName.includes('admin'));
                  
                  if (isRelatedService) {
                    console.log('✅ Chef trouvé par mapping division/service:', u.nom, 'division:', entity.nom, 'service:', u.service, 'direction:', u.direction);
                    return true;
                  }
                  return false;
                });
              }
              
              // Fallback : chercher un DIRECTEUR dans les descendants
              if (!descendantChef) {
                descendantChef = users.find(u => {
                  const placeId = u.entiteId || userPlacedAtEntityId.get(u.id);
                  if (!placeId) return false;
                  return descendantIds.includes(String(placeId)) && u.role === Role.DIRECTEUR;
                });
              }
              
              if (descendantChef) {
                chefToShow = descendantChef;
              } else {
                console.log('❌ Aucun chef trouvé pour division:', entity.nom);
              }
            }
            if (chefToShow) {
              entityNode.children!.push({
                id: `user-${chefToShow.id}`,
                type: 'utilisateur',
                label: chefToShow.nom,
                role: chefToShow.role,
                parentEntityType: parentType,
                directionId,
                serviceId: entity.id,
                data: chefToShow,
                level: level + 1
              });
            }
          } else if (showChefAndAgents) {
            // Chef de bureau / sous-service / cellule : responsable explicite, sinon CHEF_SERVICE, sinon premier utilisateur
            const chefToShow =
              responsableUser ??
              entityUsers.find(u => u.role === Role.CHEF_SERVICE) ??
              (entityUsers.length > 0 ? entityUsers[0] : undefined);
            if (chefToShow) {
              entityNode.children!.push({
                id: `user-${chefToShow.id}`,
                type: 'utilisateur',
                label: chefToShow.nom,
                role: chefToShow.role,
                parentEntityType: parentType,
                directionId,
                serviceId: entity.id,
                data: chefToShow,
                level: level + 1
              });
            }
            // Autres agents : jamais marqués comme chef de bureau / sous-service / cellule
            for (const user of entityUsers) {
              if (chefToShow && user.id === chefToShow.id) continue;
              entityNode.children!.push({
                id: `user-${user.id}`,
                type: 'utilisateur',
                label: user.nom,
                role: Role.AGENT,
                // parentEntityType volontairement omis pour que le libellé soit "Agent"
                directionId,
                serviceId: entity.id,
                data: user,
                level: level + 1
              });
            }
          }
          nodes.push(entityNode);
        }
        return nodes;
      };

      rootNode.children!.push(...buildEntityHierarchy(racine.id, 2, racine.id, racine.nom));

      // Direction : uniquement le directeur (1) et son/secrétaire(s)
      const directionResponsableId = (racine as { responsableId?: string }).responsableId;
      const directeurUser = directionResponsableId ? users.find(u => u.id === directionResponsableId) : users.find(u => userPlacedAtEntityId.get(u.id) === racine.id && u.role === Role.DIRECTEUR);
      const secretaires = users.filter(u => userPlacedAtEntityId.get(u.id) === racine.id && u.role === Role.SECRETAIRE);
      const parentTypeDir: ParentEntityTypeForResponsabilite = 'direction';
      if (directeurUser) {
        rootNode.children!.push({
          id: `user-${directeurUser.id}`,
          type: 'utilisateur',
          label: directeurUser.nom,
          role: directeurUser.role,
          parentEntityType: parentTypeDir,
          directionId: racine.id,
          data: directeurUser,
          level: 2
        });
      }
      for (const user of secretaires) {
        rootNode.children!.push({
          id: `user-${user.id}`,
          type: 'utilisateur',
          label: user.nom,
          role: user.role,
          parentEntityType: parentTypeDir,
          directionId: racine.id,
          data: user,
          level: 2
        });
      }
      rootNodes.push(rootNode);
    }

    return rootNodes;
  }

  // Filtrer l'organigramme selon le niveau d'accès de l'utilisateur
  filterByAccess(organigramme: OrganigrammeNode[], user: Utilisateur | null): OrganigrammeNode[] {
    if (!user) return [];

    if (user.role === Role.SUPER_ADMIN) return organigramme;

    if (user.role === Role.DIRECTEUR_GENERAL) {
      const withoutSuperAdmin = this.filterSuperAdminFromNodes(organigramme);
      return this.filterUserFromNodes(withoutSuperAdmin, user.id);
    }

    if (user.role === Role.SECRETAIRE) {
      return this.filterSuperAdminFromNodes(organigramme);
    }

    const filtered = this.filterSuperAdminFromNodes(organigramme);
    const filteredBySubordinates = this.filterBySubordinates(filtered, user.id);

    if (user.role === Role.DIRECTEUR) {
      return this.filterUserFromNodes(filteredBySubordinates, user.id);
    }
    
    // Cas spécial pour les chefs de division (CHEF_SERVICE)
    // Pour ce rôle, l'organigramme est déjà construit par buildOrganigrammeFromUserDivision
    // donc on ne doit pas filtrer davantage
    if (user.role === Role.CHEF_SERVICE) {
      console.log('🔑 CHEF_SERVICE détecté, utilisation de l organigramme personnalisé sans filtrage supplémentaire');
      return organigramme; // Retourner l'organigramme tel quel (déjà construit pour ce rôle)
    }
    
    return filteredBySubordinates;
  }

  // Filtrer les directions selon l'accès (fonction helper - conservée pour compatibilité)
  private filterDirectionsByAccess(directions: OrganigrammeNode[], user: Utilisateur): OrganigrammeNode[] {
    // Cette fonction n'est plus utilisée mais conservée pour compatibilité
    return directions;
  }

  // Obtenir les statistiques de l'organigramme
  getStats(organigramme: OrganigrammeNode[]): {
    totalDirections: number;
    totalDivisions: number;
    totalServices: number;
    totalUsers: number;
    usersByRole: Record<Role, number>;
  } {
    const stats = {
      totalDirections: 0,
      totalDivisions: 0,
      totalServices: 0,
      totalUsers: 0,
      usersByRole: {} as Record<Role, number>
    };

    const countNodes = (nodes: OrganigrammeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'direction_generale' || node.type === 'direction') {
          stats.totalDirections++;
        } else if (node.type === 'division') {
          stats.totalDivisions++;
        } else if (node.type === 'service' || node.type === 'sous-service' || node.type === 'bureau') {
          stats.totalServices++;
        } else if (node.type === 'utilisateur') {
          stats.totalUsers++;
          if (node.role) {
            stats.usersByRole[node.role] = (stats.usersByRole[node.role] || 0) + 1;
          }
        }

        if (node.children) {
          countNodes(node.children);
        }
      }
    };

    countNodes(organigramme);
    return stats;
  }

  // Rechercher dans l'organigramme
  search(organigramme: OrganigrammeNode[], query: string): OrganigrammeNode[] {
    const results: OrganigrammeNode[] = [];
    const lowerQuery = query.toLowerCase();

    const searchNodes = (nodes: OrganigrammeNode[]) => {
      for (const node of nodes) {
        if (node.label.toLowerCase().includes(lowerQuery)) {
          results.push(node);
        }
        if (node.children) {
          searchNodes(node.children);
        }
      }
    };

    searchNodes(organigramme);
    return results;
  }

  // Filtrer les nœuds SUPER_ADMIN de l'organigramme
  filterSuperAdminFromNodes(nodes: OrganigrammeNode[]): OrganigrammeNode[] {
    return nodes.map(node => {
      // Filtrer les enfants SUPER_ADMIN
      const filteredChildren = node.children 
        ? node.children
            .filter(child => {
              if (child.type === 'utilisateur' && child.data) {
                const user = child.data as Utilisateur;
                return user.role !== Role.SUPER_ADMIN;
              }
              return true;
            })
            .map(child => {
              if (child.children) {
                const filteredChildChildren = this.filterSuperAdminFromNodes(child.children || []);
                if (child.type === 'direction_generale' || child.type === 'direction' || child.type === 'division' || child.type === 'service' || child.type === 'sous-service' || child.type === 'bureau') {
                  return {
                    ...child,
                    children: filteredChildChildren || []
                  };
                }
                return {
                  ...child,
                  children: filteredChildChildren.length > 0 ? filteredChildChildren : undefined
                };
              }
              return child;
            })
            .filter(child => {
              if (child.type === 'utilisateur') return true;
              if (child.type === 'direction_generale' || child.type === 'direction' || child.type === 'division' || child.type === 'service' || child.type === 'sous-service' || child.type === 'bureau') return true;
              return child.children && child.children.length > 0;
            })
        : undefined;

      return {
        ...node,
        children: filteredChildren
      };
    }).filter(node => {
      // Toujours garder les nœuds racine (direction_generale, direction) même s'ils n'ont plus d'enfants
      // car ils représentent la structure organisationnelle
      if (node.type === 'direction_generale' || node.type === 'direction') return true;
      return node.children && node.children.length > 0;
    });
  }

  // Filtrer un utilisateur spécifique de l'organigramme (uniquement le nœud utilisateur, pas la structure)
  filterUserFromNodes(nodes: OrganigrammeNode[], userId: string): OrganigrammeNode[] {
    return nodes.map(node => {
      // Filtrer les enfants qui correspondent à l'utilisateur
      const filteredChildren = node.children 
        ? node.children
            .filter(child => {
              // Filtrer uniquement les nœuds de type 'utilisateur' qui correspondent à l'ID
              if (child.type === 'utilisateur' && child.data) {
                const user = child.data as Utilisateur;
                return user.id !== userId;
              }
              // Garder tous les autres nœuds (directions, services, etc.)
              return true;
            })
            .map(child => {
              // Récursivement filtrer les enfants des nœuds non-utilisateur
              if (child.children) {
                const filteredChildChildren = this.filterUserFromNodes(child.children || [], userId);
                // Toujours garder les nœuds de structure même s'ils n'ont plus d'enfants après filtrage
                // IMPORTANT: Les nœuds de structure (direction, division, service) doivent toujours être préservés
                if (child.type === 'direction_generale' || child.type === 'direction' || child.type === 'division' || child.type === 'service' || child.type === 'sous-service' || child.type === 'bureau') {
                  return {
                    ...child,
                    children: filteredChildChildren || []
                  };
                }
                return {
                  ...child,
                  children: filteredChildChildren.length > 0 ? filteredChildChildren : undefined
                };
              }
              return child;
            })
            .filter(child => {
              if (child.type === 'utilisateur') return true;
              if (child.type === 'direction_generale' || child.type === 'direction' || child.type === 'division' || child.type === 'service' || child.type === 'sous-service' || child.type === 'bureau') return true;
              return child.children && child.children.length > 0;
            })
        : undefined;

      return {
        ...node,
        children: filteredChildren
      };
    }).filter(node => {
      if (node.type === 'direction_generale' || node.type === 'direction') return true;
      return node.children && node.children.length > 0;
    });
  }

  // Filtrer l'organigramme selon le niveau hiérarchique
  // Un utilisateur au niveau X voit tous les utilisateurs avec un niveau >= X
  filterByHierarchicalLevel(organigramme: OrganigrammeNode[], userLevel: number): OrganigrammeNode[] {
    const filterNodes = (nodes: OrganigrammeNode[]): OrganigrammeNode[] => {
      return nodes
        .map((node): OrganigrammeNode | null => {
          // Pour les nœuds de structure (direction, division, service), toujours les inclure
          if (node.type === 'direction_generale' || node.type === 'direction' || node.type === 'division' || node.type === 'service' || node.type === 'sous-service' || node.type === 'bureau') {
            const filteredChildren = node.children 
              ? filterNodes(node.children)
              : undefined;
            
            // Garder le nœud même s'il n'a plus d'enfants (structure organisationnelle)
            return {
              ...node,
              children: filteredChildren
            };
          }
          
          // Pour les utilisateurs, vérifier le niveau
          if (node.type === 'utilisateur') {
            // Inclure l'utilisateur si son niveau est >= au niveau de l'utilisateur connecté
            if (node.level >= userLevel) {
              const filteredChildren = node.children 
                ? filterNodes(node.children)
                : undefined;
              return {
                ...node,
                children: filteredChildren
              };
            }
            // Exclure l'utilisateur si son niveau est inférieur
            return null;
          }
          
          // Pour les autres types (fonction, sous-fonction), inclure avec leurs enfants filtrés
          const filteredChildren = node.children 
            ? filterNodes(node.children)
            : undefined;
          return {
            ...node,
            children: filteredChildren
          };
        })
        .filter((node): node is OrganigrammeNode => {
          // Retirer les nœuds null
          if (!node || node === null) return false;
          
          // Pour les nœuds de structure, toujours les garder
          if (node.type === 'direction_generale' || node.type === 'direction' || node.type === 'division' || node.type === 'service' || node.type === 'sous-service' || node.type === 'bureau') {
            return true;
          }
          
          // Pour les utilisateurs, vérifier qu'ils ont été inclus
          if (node.type === 'utilisateur') {
            return node.level >= userLevel;
          }
          
          // Pour les autres types, garder s'ils ont des enfants ou s'ils sont valides
          return node.children ? node.children.length > 0 : true;
        });
    };
    
    return filterNodes(organigramme);
  }

  // Filtrer l'organigramme pour ne montrer que la hiérarchie de l'utilisateur selon l'organigramme
  filterBySubordinates(organigramme: OrganigrammeNode[], userId: string): OrganigrammeNode[] {
    const currentUser = userService.getUserById(userId);
    if (!currentUser) return [];

    // Si SUPER_ADMIN ou DIRECTEUR_GENERAL, voir tout
    if (currentUser.role === Role.SUPER_ADMIN || currentUser.role === Role.DIRECTEUR_GENERAL) {
      return organigramme;
    }

    // Pour les DIRECTEUR, CHEF_SERVICE, AGENT, etc., inclure toute la structure de leur direction/service
    // Trouver la direction de l'utilisateur dans l'organigramme
    const findDirectionNode = (nodes: OrganigrammeNode[], directionName: string): OrganigrammeNode | null => {
      for (const node of nodes) {
        if ((node.type === 'direction_generale' || node.type === 'direction') && node.label === directionName) {
          return node;
        }
        if (node.children) {
          const found = findDirectionNode(node.children, directionName);
          if (found) return found;
        }
      }
      return null;
    };

    // Pour un DIRECTEUR, inclure toute sa direction avec tous ses services et sous-services
    if (currentUser.role === Role.DIRECTEUR && currentUser.direction) {
      // Essayer avec la direction exacte, puis avec des variations
      let directionNode = findDirectionNode(organigramme, currentUser.direction);
      
      // Si non trouvé, chercher la direction qui contient cet utilisateur directement
      if (!directionNode) {
        const findDirectionContainingUser = (nodes: OrganigrammeNode[]): OrganigrammeNode | null => {
          for (const node of nodes) {
            if (node.type === 'direction' || node.type === 'direction_generale') {
              const hasUser = (children: OrganigrammeNode[]): boolean =>
                children.some(c =>
                  (c.type === 'utilisateur' && (c.data as Utilisateur)?.id === userId) ||
                  (c.children ? hasUser(c.children) : false)
                );
              if (hasUser(node.children || [])) return node;
            }
          }
          return null;
        };
        directionNode = findDirectionContainingUser(organigramme);
      }
      
      if (directionNode) {
        const includeAllChildren = (node: OrganigrammeNode): OrganigrammeNode => ({
          ...node,
          children: node.children ? node.children.map(includeAllChildren) : undefined
        });
        return [includeAllChildren(directionNode)];
      }
    }

    // Pour un CHEF_SERVICE ou AGENT, trouver leur service et inclure tous les sous-services
    if ((currentUser.role === Role.CHEF_SERVICE || currentUser.role === Role.AGENT) && currentUser.direction && currentUser.service) {
      const findServiceNode = (nodes: OrganigrammeNode[], serviceName: string): OrganigrammeNode | null => {
        for (const node of nodes) {
          if (node.type === 'service' && node.label === serviceName) {
            return node;
          }
          if (node.children) {
            const found = findServiceNode(node.children, serviceName);
            if (found) return found;
          }
        }
        return null;
      };

      const directionNode = findDirectionNode(organigramme, currentUser.direction);
      if (directionNode && directionNode.children) {
        const serviceNode = findServiceNode(directionNode.children, currentUser.service);
        if (serviceNode) {
          // Inclure le service avec tous ses sous-services et utilisateurs
          const includeAllChildren = (node: OrganigrammeNode): OrganigrammeNode => {
            return {
              ...node,
              children: node.children ? node.children.map(includeAllChildren) : undefined
            };
          };
          
          // Retourner la direction avec seulement le service de l'utilisateur (mais avec tous ses enfants)
          return [{
            ...directionNode,
            children: [includeAllChildren(serviceNode)]
          }];
        }
      }
    }

    // Fallback: trouver le nœud utilisateur et son chemin
    let userNode: OrganigrammeNode | null = null;
    let userNodePath: OrganigrammeNode[] = [];

    const findUserNode = (nodes: OrganigrammeNode[], path: OrganigrammeNode[] = []): boolean => {
      for (const node of nodes) {
        const currentPath = [...path, node];
        
        if (node.type === 'utilisateur' && node.data) {
          const user = node.data as Utilisateur;
          if (user.id === userId) {
            userNode = node;
            userNodePath = currentPath;
            return true;
          }
        }

        if (node.children) {
          if (findUserNode(node.children, currentPath)) {
            return true;
          }
        }
      }
      return false;
    };

    findUserNode(organigramme);

    // Si l'utilisateur n'est pas trouvé dans l'organigramme, retourner vide
    if (!userNode || userNodePath.length === 0) {
      return [];
    }

    // Construire l'organigramme filtré en gardant le chemin depuis la racine jusqu'à l'utilisateur
    // et tous ses descendants (enfants directs et indirects)
    const buildFilteredPath = (nodes: OrganigrammeNode[], pathIndex: number): OrganigrammeNode[] => {
      if (pathIndex >= userNodePath.length) {
        // On a atteint le nœud utilisateur, inclure l'utilisateur et tous ses descendants
        if (userNode) {
          const processDescendants = (node: OrganigrammeNode): OrganigrammeNode => {
            return {
              ...node,
              children: node.children ? node.children.map(processDescendants) : undefined
            };
          };
          return [processDescendants(userNode)];
        }
        return [];
      }

      const targetNode = userNodePath[pathIndex];
      
      return nodes
        .filter(node => node.id === targetNode.id)
        .map(node => {
          const filteredChildren = node.children 
            ? buildFilteredPath(node.children, pathIndex + 1)
            : undefined;

          // Si c'est une direction, inclure toutes les divisions et services
          if ((node.type === 'direction_generale' || node.type === 'direction') && node.children) {
            const allServices = node.children.filter(child => child.type === 'direction_generale' || child.type === 'direction' || child.type === 'division' || child.type === 'service' || child.type === 'sous-service' || child.type === 'bureau');
            
            // Combiner les services du chemin filtré avec tous les autres services
            const filteredServices = filteredChildren || [];
            const existingServiceIds = new Set(filteredServices.map(s => s.id));
            
            // Ajouter tous les services qui ne sont pas déjà dans le chemin filtré
            allServices.forEach(service => {
              if (!existingServiceIds.has(service.id)) {
                // Inclure le service avec tous ses enfants (récursivement)
                const includeAllChildren = (s: OrganigrammeNode): OrganigrammeNode => {
                  return {
                    ...s,
                    children: s.children ? s.children.map(includeAllChildren) : undefined
                  };
                };
                filteredServices.push(includeAllChildren(service));
              }
            });

            return {
              ...node,
              children: filteredServices.length > 0 ? filteredServices : undefined
            };
          }

          // Si c'est une division, inclure tous ses services (même logique que service)
          if (node.type === 'division' && node.children) {
            const allSubServices = node.children.filter(child => child.type === 'service');
            const filteredSubServices = filteredChildren || [];
            const existingSubServiceIds = new Set(filteredSubServices.map(s => s.id));
            allSubServices.forEach(subService => {
              if (!existingSubServiceIds.has(subService.id)) {
                const includeAllChildren = (s: OrganigrammeNode): OrganigrammeNode => ({
                  ...s,
                  children: s.children ? s.children.map(includeAllChildren) : undefined
                });
                filteredSubServices.push(includeAllChildren(subService));
              }
            });
            return {
              ...node,
              children: filteredSubServices.length > 0 ? filteredSubServices : undefined
            };
          }

          // Si c'est un service, toujours inclure tous ses sous-services
          if (node.type === 'service' && node.children) {
            const allSubServices = node.children.filter(child => child.type === 'service');
            const filteredSubServices = filteredChildren || [];
            const existingSubServiceIds = new Set(filteredSubServices.map(s => s.id));
            
            allSubServices.forEach(subService => {
              if (!existingSubServiceIds.has(subService.id)) {
                const includeAllChildren = (s: OrganigrammeNode): OrganigrammeNode => {
                  return {
                    ...s,
                    children: s.children ? s.children.map(includeAllChildren) : undefined
                  };
                };
                filteredSubServices.push(includeAllChildren(subService));
              }
            });

            return {
              ...node,
              children: filteredSubServices.length > 0 ? filteredSubServices : undefined
            };
          }

          return {
            ...node,
            children: filteredChildren
          };
        });
    };

    return buildFilteredPath(organigramme, 0);
  }

  // Extraire tous les utilisateurs de l'organigramme filtré selon les permissions
  getUsersFromOrganigramme(user: Utilisateur | null): Utilisateur[] {
    if (!user) return [];
    
    // Construire l'organigramme complet
    const fullOrganigramme = this.buildOrganigramme();
    
    // Filtrer selon les permissions de l'utilisateur
    const filteredOrganigramme = this.filterByAccess(fullOrganigramme, user);
    
    // Extraire tous les utilisateurs de l'organigramme filtré
    const users: Utilisateur[] = [];
    
    const extractUsers = (nodes: OrganigrammeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'utilisateur' && node.data) {
          const userData = node.data as Utilisateur;
          // Ne pas inclure l'utilisateur connecté lui-même
          if (userData.id !== user.id) {
            users.push(userData);
          }
        }
        if (node.children) {
          extractUsers(node.children);
        }
      }
    };
    
    extractUsers(filteredOrganigramme);
    
    // Dédupliquer par ID (au cas où un utilisateur apparaîtrait plusieurs fois)
    const uniqueUsers = Array.from(
      new Map(users.map(u => [u.id, u])).values()
    );
    
    console.log('📋 Organigramme - Utilisateurs extraits:', {
      user: user.nom,
      role: user.role,
      count: uniqueUsers.length,
      users: uniqueUsers.map(u => `${u.nom} (${u.role}) - ${u.direction || 'N/A'}${u.service ? ` / ${u.service}` : ''}`)
    });
    
    return uniqueUsers;
  }

  // Compter les utilisateurs dans les nœuds de l'organigramme
  private countUsersInNodes(nodes: OrganigrammeNode[]): number {
    let count = 0;
    const countInNode = (node: OrganigrammeNode) => {
      if (node.type === 'utilisateur') {
        count++;
      }
      if (node.children) {
        node.children.forEach(countInNode);
      }
    };
    nodes.forEach(countInNode);
    return count;
  }

  // Vérifier si une entité est descendante d'une autre (récursif)
  private isEntityDescendantOf(entityId: string, ancestorId: string, entities: EntiteOrganisationnelle[]): boolean {
    const entity = entities.find(e => e.id === entityId);
    if (!entity) return false;
    
    // Si l'entité est l'ancêtre direct
    if (entity.id === ancestorId) return true;
    
    // Si l'entité n'a pas de parent, ce n'est pas un descendant
    if (!entity.parentId) return false;
    
    // Si le parent est l'ancêtre
    if (entity.parentId === ancestorId) return true;
    
    // Vérifier récursivement si le parent est un descendant de l'ancêtre
    return this.isEntityDescendantOf(entity.parentId, ancestorId, entities);
  }
}

export const organigrammeService = new OrganigrammeService();

