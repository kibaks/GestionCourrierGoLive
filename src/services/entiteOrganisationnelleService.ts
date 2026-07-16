import { EntiteOrganisationnelle, TypeEntiteOrganisationnelle, ENTITE_TYPE_ORDER } from '../types';
import { laravelApiService } from './laravelApiService';

/** Tri par type (ordre hiérarchique) puis par ordre d'affichage */
export function sortByTypeAndOrdre(list: EntiteOrganisationnelle[]): EntiteOrganisationnelle[] {
  return [...list].sort((a, b) => {
    const oA = ENTITE_TYPE_ORDER[a.type] ?? 99;
    const oB = ENTITE_TYPE_ORDER[b.type] ?? 99;
    if (oA !== oB) return oA - oB;
    return (a.ordre ?? 0) - (b.ordre ?? 0);
  });
}

// Service de gestion des entités organisationnelles.
// Quand l'API Laravel est configurée : toute la gestion passe par l'API (lecture = cache rempli par syncFromApi / refreshFromApi, écriture = API uniquement).
// Sinon : fallback localStorage + données de démo.
class EntiteOrganisationnelleService {
  private entitiesKey = 'entites_organisationnelles';
  private entitiesCache: EntiteOrganisationnelle[] = [];

  /**
   * Structure ARMP (Autorité de Régulation des Marchés Publics - RDC).
   * Données réinsérées dans l’ordre des types d’entité : direction_generale (racines) →
   * direction (sans la direction générale) → division → service → sous-service → bureau → cellule.
   */
  getArmpEntities(): EntiteOrganisationnelle[] {
    const dg = [
      { id: '1', nom: 'Direction Générale', type: 'direction_generale' as const, description: 'Autorité de Régulation des Marchés Publics (ARMP) - RDC', ordre: 1, actif: true },
    ];
    const directions = [
      { id: '3', nom: 'Commissaires aux Comptes', type: 'direction' as const, parentId: '1', description: 'Commissariat aux comptes', ordre: 1, actif: true },
      { id: '4', nom: 'Comité de Règlement des Différends', type: 'direction' as const, parentId: '1', description: 'CRD - Règlement des différends', ordre: 2, actif: true },
      { id: '5', nom: 'Services Rattachés à la Direction Générale', type: 'direction' as const, parentId: '1', description: 'Coordonnateur des Services Rattachés au DG', ordre: 3, actif: true },
      { id: '6', nom: 'Direction de la Régulation', type: 'direction' as const, parentId: '1', description: 'Régulation des marchés publics', ordre: 4, actif: true },
      { id: '7', nom: 'Direction des Statistiques et de la Communication', type: 'direction' as const, parentId: '1', description: 'Statistiques et communication', ordre: 5, actif: true },
      { id: '8', nom: 'Direction Administrative et Financière', type: 'direction' as const, parentId: '1', description: 'Administration et finances', ordre: 6, actif: true },
      { id: '9', nom: 'Direction de la Formation et des Appuis Techniques', type: 'direction' as const, parentId: '1', description: 'Formation et appuis techniques', ordre: 7, actif: true },
      { id: '10', nom: 'Direction de Partenariat Public-Privé', type: 'direction' as const, parentId: '1', description: 'Partenariat public-privé', ordre: 8, actif: true },
    ];
    const divisions = [
      { id: '11', nom: 'Division Administration des Provinces', type: 'division' as const, parentId: '5', description: 'Administration des provinces', ordre: 1, actif: true },
      { id: '12', nom: 'Division Audit interne', type: 'division' as const, parentId: '5', description: 'Audit interne', ordre: 2, actif: true },
      { id: '13', nom: 'Secrétariat Permanent CGPMP', type: 'division' as const, parentId: '5', description: 'Secrétariat permanent des CGPMP', ordre: 3, actif: true },
      { id: '14', nom: 'Division Audits et Enquêtes', type: 'division' as const, parentId: '6', description: 'Audits et enquêtes', ordre: 1, actif: true },
      { id: '15', nom: 'Division des Services Généraux', type: 'division' as const, parentId: '8', description: 'Services généraux', ordre: 1, actif: true },
      { id: '16', nom: 'Division des Ressources Humaines', type: 'division' as const, parentId: '8', description: 'Ressources humaines', ordre: 2, actif: true },
      { id: '17', nom: 'Division Finance et Comptabilité', type: 'division' as const, parentId: '8', description: 'Finance et comptabilité', ordre: 3, actif: true },
      { id: '18', nom: 'Division Facturation et Recouvrement', type: 'division' as const, parentId: '8', description: 'Facturation et recouvrement', ordre: 4, actif: true },
      { id: '19', nom: 'Division de la Formation', type: 'division' as const, parentId: '9', description: 'Formation des acteurs', ordre: 1, actif: true },
      { id: '20', nom: 'Division des Appuis Techniques', type: 'division' as const, parentId: '9', description: 'Appuis techniques', ordre: 2, actif: true },
    ];
    const services = [
      { id: '21', nom: 'Service Administration Provinces Est', type: 'service' as const, parentId: '11', description: 'Couverture provinces de l\'Est', ordre: 1, actif: true },
      { id: '22', nom: 'Service Administration Provinces Ouest', type: 'service' as const, parentId: '11', description: 'Couverture provinces de l\'Ouest', ordre: 2, actif: true },
      { id: '23', nom: 'Service Audit et Contrôle', type: 'service' as const, parentId: '12', description: 'Audit et contrôle interne', ordre: 1, actif: true },
      { id: '24', nom: 'Service Secrétariat CGPMP', type: 'service' as const, parentId: '13', description: 'Secrétariat permanent', ordre: 1, actif: true },
      { id: '25', nom: 'Service Enquêtes Régulation', type: 'service' as const, parentId: '14', description: 'Enquêtes et audits régulation', ordre: 1, actif: true },
      { id: '26', nom: 'Service Logistique et Moyens généraux', type: 'service' as const, parentId: '15', description: 'Logistique', ordre: 1, actif: true },
      { id: '27', nom: 'Service Recrutement et Carrières', type: 'service' as const, parentId: '16', description: 'Recrutement et carrières', ordre: 1, actif: true },
      { id: '28', nom: 'Service Formation et Développement', type: 'service' as const, parentId: '16', description: 'Formation RH', ordre: 2, actif: true },
      { id: '29', nom: 'Service Comptabilité Générale', type: 'service' as const, parentId: '17', description: 'Comptabilité générale', ordre: 1, actif: true },
      { id: '30', nom: 'Service Comptabilité Analytique', type: 'service' as const, parentId: '17', description: 'Comptabilité analytique', ordre: 2, actif: true },
      { id: '31', nom: 'Service Facturation', type: 'service' as const, parentId: '18', description: 'Facturation', ordre: 1, actif: true },
      { id: '32', nom: 'Service Recouvrement', type: 'service' as const, parentId: '18', description: 'Recouvrement', ordre: 2, actif: true },
      { id: '33', nom: 'Service Formation des Acteurs', type: 'service' as const, parentId: '19', description: 'Formation des acteurs des marchés publics', ordre: 1, actif: true },
      { id: '34', nom: 'Service Appuis et Accompagnement', type: 'service' as const, parentId: '20', description: 'Appuis techniques', ordre: 1, actif: true },
    ];
    const sousServices = [
      { id: '35', nom: 'Sous-service Classement et Archives', type: 'sous-service' as const, parentId: '21', description: 'Classement et indexation', ordre: 1, actif: true },
      { id: '36', nom: 'Sous-service Contentieux', type: 'sous-service' as const, parentId: '25', description: 'Gestion des contentieux', ordre: 1, actif: true },
      { id: '37', nom: 'Sous-service Conformité', type: 'sous-service' as const, parentId: '25', description: 'Conformité réglementaire', ordre: 2, actif: true },
      { id: '38', nom: 'Sous-service Paie', type: 'sous-service' as const, parentId: '27', description: 'Gestion de la paie', ordre: 1, actif: true },
      { id: '39', nom: 'Sous-service Avantages sociaux', type: 'sous-service' as const, parentId: '27', description: 'Avantages sociaux', ordre: 2, actif: true },
      { id: '40', nom: 'Sous-service Clôture et Consolidation', type: 'sous-service' as const, parentId: '29', description: 'Clôture et consolidation', ordre: 1, actif: true },
      { id: '41', nom: 'Sous-service Suivi Budget', type: 'sous-service' as const, parentId: '30', description: 'Suivi et contrôle budgétaire', ordre: 1, actif: true },
      { id: '42', nom: 'Sous-service Recouvrement Créances', type: 'sous-service' as const, parentId: '32', description: 'Recouvrement des créances', ordre: 1, actif: true },
      { id: '43', nom: 'Sous-service Formation Continue', type: 'sous-service' as const, parentId: '33', description: 'Formation continue', ordre: 1, actif: true },
    ];
    // Bureaux rattachés directement aux divisions (15, 16, 17, 18, 19)
    const bureaux = [
      { id: '44', nom: 'Bureau Courrier et Archives', type: 'bureau' as const, parentId: '15', description: 'Courrier et archives', ordre: 1, actif: true },
      { id: '45', nom: 'Bureau Achats et Marchés', type: 'bureau' as const, parentId: '15', description: 'Achats et marchés', ordre: 2, actif: true },
      { id: '46', nom: 'Bureau Sourcing et Recrutement', type: 'bureau' as const, parentId: '16', description: 'Sourcing et recrutement', ordre: 1, actif: true },
      { id: '47', nom: 'Bureau Comptabilité', type: 'bureau' as const, parentId: '17', description: 'Comptabilité', ordre: 1, actif: true },
      { id: '48', nom: 'Bureau Trésorerie', type: 'bureau' as const, parentId: '17', description: 'Trésorerie', ordre: 2, actif: true },
      { id: '49', nom: 'Bureau Facturation Client', type: 'bureau' as const, parentId: '18', description: 'Facturation client', ordre: 1, actif: true },
      { id: '50', nom: 'Bureau Formation Interne', type: 'bureau' as const, parentId: '19', description: 'Formation interne', ordre: 1, actif: true },
    ];
    return [...dg, ...directions, ...divisions, ...services, ...sousServices, ...bureaux];
  }

  /** Initialise les données démo (structure ARMP ordonnée par type). Appelé quand aucune donnée en localStorage. */
  initializeDemoData() {
    const existingData = localStorage.getItem(this.entitiesKey);
    if (!existingData) {
      const entities = this.getArmpEntities();
      localStorage.setItem(this.entitiesKey, JSON.stringify(entities));
    }
  }

  /**
   * Réinsère les données par défaut dans l’ordre des types d’entité (directions sans DG → divisions → services → sous-services → bureaux).
   * Écrase le contenu actuel en localStorage. À utiliser pour repartir sur la structure ARMP de référence.
   */
  reinsertDemoData() {
    const entities = this.getArmpEntities();
    localStorage.setItem(this.entitiesKey, JSON.stringify(entities));
    if (this.entitiesCache.length > 0) this.entitiesCache = [];
  }

  // Récupérer toutes les entités (triées par type puis ordre). Jamais de liste vide : repli sur démo si besoin.
  getAllEntities(): EntiteOrganisationnelle[] {
    let list: EntiteOrganisationnelle[];
    if (laravelApiService.isConfigured()) {
      list = this.entitiesCache.length > 0 ? [...this.entitiesCache] : this.getArmpEntities();
    } else {
      this.initializeDemoData();
      const data = localStorage.getItem(this.entitiesKey);
      if (!data) return sortByTypeAndOrdre(this.getArmpEntities());
      try {
        list = JSON.parse(data);
      } catch {
        return sortByTypeAndOrdre(this.getArmpEntities());
      }
      if (!Array.isArray(list) || list.length === 0) return sortByTypeAndOrdre(this.getArmpEntities());
    }
    return sortByTypeAndOrdre(list);
  }

  /**
   * Remplit le cache avec les entités reçues (après appel API par la page).
   * Quand l'API est configurée, aucune écriture localStorage pour la liste.
   */
  syncFromApi(entities: EntiteOrganisationnelle[]): void {
    this.entitiesCache = entities;
  }

  /**
   * Rafraîchit le cache depuis l'API Laravel (GET entites-organisationnelles).
   * En cas d'erreur ou de liste vide, utilise les données de démo pour que les select restent utilisables.
   */
  async refreshFromApi(): Promise<void> {
    if (!laravelApiService.isConfigured()) return;
    try {
      const list = await laravelApiService.getEntitesOrganisationnelles();
      this.entitiesCache = list.length > 0 ? list : this.getArmpEntities();
    } catch {
      this.entitiesCache = this.getArmpEntities();
    }
  }

  // Récupérer les entités par type
  getEntitiesByType(type: TypeEntiteOrganisationnelle): EntiteOrganisationnelle[] {
    return this.getAllEntities().filter(e => e.type === type && e.actif !== false);
  }

  // Récupérer les entités par parent (triées par type puis ordre)
  getEntitiesByParent(parentId: string): EntiteOrganisationnelle[] {
    const list = this.getAllEntities().filter(e => e.parentId === parentId && e.actif !== false);
    return sortByTypeAndOrdre(list);
  }

  // Récupérer une entité par ID
  getEntityById(id: string): EntiteOrganisationnelle | undefined {
    return this.getAllEntities().find(e => e.id === id);
  }

  // Récupérer une entité par nom
  getEntityByName(nom: string): EntiteOrganisationnelle | undefined {
    return this.getAllEntities().find(e => e.nom === nom);
  }

  // Récupérer les directions (Direction générale + Directions, ordre hiérarchique)
  getDirections(): EntiteOrganisationnelle[] {
    const all = [
      ...this.getEntitiesByType('direction_generale'),
      ...this.getEntitiesByType('direction')
    ];
    return all.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  }

  /** Directions à afficher dans les filtres (uniquement les directions sous la Direction Générale, pas la Direction Générale ni le Conseil) */
  getDirectionsForFilters(): EntiteOrganisationnelle[] {
    return this.getEntitiesByType('direction').sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  }

  // Récupérer les divisions d'une direction (hiérarchie Direction → Division → Service)
  getDivisionsByDirection(directionId: string): EntiteOrganisationnelle[] {
    return this.getEntitiesByParent(directionId)
      .filter(e => e.type === 'division')
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  }

  // Récupérer les services d'une direction (enfants directs de type service)
  getServicesByDirection(directionId: string): EntiteOrganisationnelle[] {
    return this.getEntitiesByParent(directionId)
      .filter(e => e.type === 'service')
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  }

  // Récupérer les services d'une division
  getServicesByDivision(divisionId: string): EntiteOrganisationnelle[] {
    return this.getEntitiesByParent(divisionId)
      .filter(e => e.type === 'service')
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  }

  // Récupérer les sous-services d'un service
  getSubServicesByService(serviceId: string): EntiteOrganisationnelle[] {
    return this.getEntitiesByParent(serviceId)
      .filter(e => e.type === 'sous-service')
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  }

  // Récupérer la hiérarchie complète d'une entité
  getEntityHierarchy(entityId: string): EntiteOrganisationnelle[] {
    const hierarchy: EntiteOrganisationnelle[] = [];
    let currentId: string | undefined = entityId;
    
    while (currentId) {
      const entity = this.getEntityById(currentId);
      if (!entity) break;
      hierarchy.unshift(entity);
      currentId = entity.parentId;
    }
    
    return hierarchy;
  }

  /** IDs de l'entité et de toutes ses descendantes (récursif). Utile pour filtrer les agents d'une division. */
  getDescendantEntityIds(parentId: string): string[] {
    const ids: string[] = [parentId];
    const stack: string[] = [parentId];
    const all = this.getAllEntities();
    while (stack.length > 0) {
      const id = stack.pop()!;
      all.filter(e => e.parentId === id && e.actif !== false).forEach(e => {
        ids.push(e.id);
        stack.push(e.id);
      });
    }
    return ids;
  }

  // CRUD — persiste en base Laravel quand l'API est configurée
  async createEntity(entity: Omit<EntiteOrganisationnelle, 'id'>): Promise<EntiteOrganisationnelle> {
    if (laravelApiService.isConfigured()) {
      const created = await laravelApiService.createEntiteOrganisationnelle({
        ...entity,
        actif: entity.actif ?? true,
        ordre: entity.ordre ?? 0,
      });
      this.entitiesCache = [...this.entitiesCache, created];
      return created;
    }
    const entities = this.getAllEntities();
    const newId = String(Math.max(...entities.map(e => parseInt(e.id) || 0), 0) + 1);
    const newEntity: EntiteOrganisationnelle = {
      id: newId,
      actif: true,
      ordre: 0,
      ...entity
    };
    const list = [...entities, newEntity];
    localStorage.setItem(this.entitiesKey, JSON.stringify(list));
    return newEntity;
  }

  async updateEntity(id: string, updates: Partial<EntiteOrganisationnelle>): Promise<EntiteOrganisationnelle> {
    if (laravelApiService.isConfigured()) {
      const updated = await laravelApiService.updateEntiteOrganisationnelle(id, updates);
      const idx = this.entitiesCache.findIndex(e => e.id === id);
      if (idx >= 0) this.entitiesCache[idx] = updated;
      return updated;
    }
    const entities = this.getAllEntities();
    const index = entities.findIndex(e => e.id === id);
    if (index === -1) throw new Error('Entité non trouvée');
    entities[index] = { ...entities[index], ...updates };
    localStorage.setItem(this.entitiesKey, JSON.stringify(entities));
    return entities[index];
  }

  async deleteEntity(id: string): Promise<void> {
    if (laravelApiService.isConfigured()) {
      await laravelApiService.deleteEntiteOrganisationnelle(id);
      // Retirer de la liste en mémoire l'entité et ses descendants
      const toRemove = new Set<string>();
      toRemove.add(id);
      let added = true;
      while (added) {
        added = false;
        for (const e of this.entitiesCache) {
          if (e.parentId && toRemove.has(e.parentId) && !toRemove.has(e.id)) {
            toRemove.add(e.id);
            added = true;
          }
        }
      }
      this.entitiesCache = this.entitiesCache.filter(e => !toRemove.has(e.id));
      return;
    }
    const entities = this.getAllEntities().filter(e => e.id !== id);
    const children = this.getEntitiesByParent(id);
    const childIds = new Set(children.map(c => c.id));
    const filtered = entities.filter(e => !childIds.has(e.id));
    localStorage.setItem(this.entitiesKey, JSON.stringify(filtered));
  }

  // Désactiver une entité (au lieu de la supprimer)
  async deactivateEntity(id: string): Promise<void> {
    await this.updateEntity(id, { actif: false });
  }

  // Activer une entité
  async activateEntity(id: string): Promise<void> {
    await this.updateEntity(id, { actif: true });
  }

  // Réorganiser l'ordre des entités (local uniquement si pas d'endpoint API dédié)
  reorderEntities(entityIds: string[]): void {
    const entities = this.getAllEntities();
    entityIds.forEach((id, index) => {
      const entity = entities.find(e => e.id === id);
      if (entity) entity.ordre = index + 1;
    });
    if (!laravelApiService.isConfigured()) {
      localStorage.setItem(this.entitiesKey, JSON.stringify(entities));
    }
  }
}

export const entiteOrganisationnelleService = new EntiteOrganisationnelleService();

