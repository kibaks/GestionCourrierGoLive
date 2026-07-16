import { Role, Direction, Service, Utilisateur } from '../types';
import { directionService } from './directionService';
import { adminService } from './adminService';

export interface Responsabilite {
  id: string;
  role: Role;
  directionId?: string;
  serviceId?: string;
  responsabilites: string[];
  dateCreation: Date;
  dateModification: Date;
}

export interface ResponsabiliteDefinition {
  id: string;
  code: string;
  libelle: string;
  description?: string;
  niveau: 'direction' | 'service' | 'utilisateur' | 'global';
}

class ResponsabiliteService {
  private storageKey = 'responsabilites';
  private definitionsKey = 'responsabiliteDefinitions';

  // Initialiser les définitions de responsabilités par défaut
  initializeDefaultDefinitions(): ResponsabiliteDefinition[] {
    // Vérifier directement dans le localStorage pour éviter la récursion
    const data = localStorage.getItem(this.definitionsKey);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (parsed && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        // Si erreur de parsing, continuer pour créer les valeurs par défaut
      }
    }

    const definitions: ResponsabiliteDefinition[] = [
      {
        id: 'resp-001',
        code: 'GESTION_COURRIERS',
        libelle: 'Gestion des courriers',
        description: 'Gérer l\'enregistrement, le suivi et le traitement des courriers',
        niveau: 'global'
      },
      {
        id: 'resp-002',
        code: 'VALIDATION_DECISIONS',
        libelle: 'Validation des décisions',
        description: 'Valider les décisions importantes de la direction',
        niveau: 'direction'
      },
      {
        id: 'resp-003',
        code: 'SUPERVISION_EQUIPE',
        libelle: 'Supervision d\'équipe',
        description: 'Superviser le travail de l\'équipe du service',
        niveau: 'service'
      },
      {
        id: 'resp-004',
        code: 'TRAITEMENT_DOSSIERS',
        libelle: 'Traitement des dossiers',
        description: 'Traiter les dossiers assignés',
        niveau: 'utilisateur'
      },
      {
        id: 'resp-005',
        code: 'BUDGET_DIRECTION',
        libelle: 'Gestion budgétaire de la direction',
        description: 'Gérer le budget de la direction',
        niveau: 'direction'
      },
      {
        id: 'resp-006',
        code: 'PLANNING_SERVICE',
        libelle: 'Planification du service',
        description: 'Planifier les activités du service',
        niveau: 'service'
      },
      {
        id: 'resp-007',
        code: 'RAPPORTS',
        libelle: 'Élaboration de rapports',
        description: 'Élaborer et présenter les rapports',
        niveau: 'utilisateur'
      }
    ];

    localStorage.setItem(this.definitionsKey, JSON.stringify(definitions));
    return definitions;
  }

  // Obtenir toutes les définitions de responsabilités
  getDefinitions(): ResponsabiliteDefinition[] {
    // Vérifier si les données existent déjà
    const data = localStorage.getItem(this.definitionsKey);
    if (!data) {
      // Si aucune donnée, initialiser les valeurs par défaut
      this.initializeDefaultDefinitions();
      // Relire après initialisation
      const newData = localStorage.getItem(this.definitionsKey);
      if (!newData) return [];
      return JSON.parse(newData);
    }
    
    // Retourner les données existantes
    return JSON.parse(data);
  }

  // Obtenir une définition par code
  getDefinitionByCode(code: string): ResponsabiliteDefinition | undefined {
    return this.getDefinitions().find(d => d.code === code);
  }

  // Créer une nouvelle définition
  createDefinition(definition: Omit<ResponsabiliteDefinition, 'id'>): ResponsabiliteDefinition {
    const definitions = this.getDefinitions();
    const newDef: ResponsabiliteDefinition = {
      ...definition,
      id: `resp-${Date.now()}`
    };
    definitions.push(newDef);
    localStorage.setItem(this.definitionsKey, JSON.stringify(definitions));
    return newDef;
  }

  // Initialiser les responsabilités par défaut selon les rôles
  initializeDefaultResponsabilites(): Responsabilite[] {
    // Vérifier directement dans le localStorage pour éviter la récursion
    const data = localStorage.getItem(this.storageKey);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (parsed && parsed.length > 0) {
          return parsed.map((r: any) => ({
            ...r,
            dateCreation: new Date(r.dateCreation),
            dateModification: new Date(r.dateModification)
          }));
        }
      } catch (e) {
        // Si erreur de parsing, continuer pour créer les valeurs par défaut
      }
    }

    const definitions = this.getDefinitions();
    const responsabilites: Responsabilite[] = [];

    // Super Admin - toutes les responsabilités
    responsabilites.push({
      id: 'r-001',
      role: Role.SUPER_ADMIN,
      responsabilites: definitions.map(d => d.code),
      dateCreation: new Date(),
      dateModification: new Date()
    });

    // Directeur Général - responsabilités globales et de direction
    responsabilites.push({
      id: 'r-002',
      role: Role.DIRECTEUR_GENERAL,
      responsabilites: definitions
        .filter(d => d.niveau === 'global' || d.niveau === 'direction')
        .map(d => d.code),
      dateCreation: new Date(),
      dateModification: new Date()
    });

    // Secrétaire - gestion des courriers
    responsabilites.push({
      id: 'r-003',
      role: Role.SECRETAIRE,
      responsabilites: ['GESTION_COURRIERS'],
      dateCreation: new Date(),
      dateModification: new Date()
    });

    // Directeur - responsabilités de direction
    responsabilites.push({
      id: 'r-004',
      role: Role.DIRECTEUR,
      responsabilites: definitions
        .filter(d => d.niveau === 'direction')
        .map(d => d.code),
      dateCreation: new Date(),
      dateModification: new Date()
    });

    // Chef de Service - responsabilités de service
    responsabilites.push({
      id: 'r-005',
      role: Role.CHEF_SERVICE,
      responsabilites: definitions
        .filter(d => d.niveau === 'service')
        .map(d => d.code),
      dateCreation: new Date(),
      dateModification: new Date()
    });

    // Agent - responsabilités utilisateur
    responsabilites.push({
      id: 'r-006',
      role: Role.AGENT,
      responsabilites: definitions
        .filter(d => d.niveau === 'utilisateur')
        .map(d => d.code),
      dateCreation: new Date(),
      dateModification: new Date()
    });

    localStorage.setItem(this.storageKey, JSON.stringify(responsabilites));
    return responsabilites;
  }

  // Obtenir toutes les responsabilités
  getAllResponsabilites(): Responsabilite[] {
    // Vérifier si les données existent déjà
    const data = localStorage.getItem(this.storageKey);
    if (!data) {
      // Si aucune donnée, initialiser les valeurs par défaut
      this.initializeDefaultResponsabilites();
      // Relire après initialisation
      const newData = localStorage.getItem(this.storageKey);
      if (!newData) return [];
      return JSON.parse(newData).map((r: any) => ({
        ...r,
        dateCreation: new Date(r.dateCreation),
        dateModification: new Date(r.dateModification)
      }));
    }
    
    // Retourner les données existantes
    return JSON.parse(data).map((r: any) => ({
      ...r,
      dateCreation: new Date(r.dateCreation),
      dateModification: new Date(r.dateModification)
    }));
  }

  // Obtenir les responsabilités d'un rôle
  getResponsabilitesByRole(role: Role, directionId?: string, serviceId?: string): Responsabilite[] {
    const all = this.getAllResponsabilites();
    return all.filter(r => {
      if (r.role !== role) return false;
      if (directionId && r.directionId && r.directionId !== directionId) return false;
      if (serviceId && r.serviceId && r.serviceId !== serviceId) return false;
      return true;
    });
  }

  // Obtenir les responsabilités d'un utilisateur
  getResponsabilitesByUser(user: Utilisateur): string[] {
    const roleResp = this.getResponsabilitesByRole(
      user.role,
      user.direction ? directionService.getDirectionByName(user.direction)?.id : undefined,
      user.service ? directionService.getServiceByName(user.service)?.id : undefined
    );

    if (roleResp.length === 0) return [];

    // Fusionner toutes les responsabilités
    const allCodes = new Set<string>();
    roleResp.forEach(r => {
      r.responsabilites.forEach(code => allCodes.add(code));
    });

    return Array.from(allCodes);
  }

  // Créer ou mettre à jour une responsabilité
  saveResponsabilite(responsabilite: Omit<Responsabilite, 'id' | 'dateCreation' | 'dateModification'>): Responsabilite {
    const all = this.getAllResponsabilites();
    const existing = all.find(r => 
      r.role === responsabilite.role &&
      r.directionId === responsabilite.directionId &&
      r.serviceId === responsabilite.serviceId
    );

    if (existing) {
      // Mettre à jour
      existing.responsabilites = responsabilite.responsabilites;
      existing.dateModification = new Date();
      localStorage.setItem(this.storageKey, JSON.stringify(all));
      return existing;
    } else {
      // Créer
      const newResp: Responsabilite = {
        ...responsabilite,
        id: `r-${Date.now()}`,
        dateCreation: new Date(),
        dateModification: new Date()
      };
      all.push(newResp);
      localStorage.setItem(this.storageKey, JSON.stringify(all));
      return newResp;
    }
  }

  // Supprimer une responsabilité
  deleteResponsabilite(id: string): boolean {
    const all = this.getAllResponsabilites();
    const filtered = all.filter(r => r.id !== id);
    if (filtered.length === all.length) return false;
    localStorage.setItem(this.storageKey, JSON.stringify(filtered));
    return true;
  }
}

export const responsabiliteService = new ResponsabiliteService();

