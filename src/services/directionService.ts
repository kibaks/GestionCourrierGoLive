import { Direction, Service, Utilisateur } from '../types';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';

// Service de gestion des directions et services (pour rétrocompatibilité)
class DirectionService {
  private directionsKey = 'directions';
  private servicesKey = 'services';

  // Initialiser les données de démonstration
  initializeDemoData() {
    if (!localStorage.getItem(this.directionsKey)) {
      const directions: Direction[] = [
        { id: '1', nom: 'Direction Administrative', description: 'Gestion administrative et ressources humaines' },
        { id: '2', nom: 'Direction Financière', description: 'Gestion financière et comptable' },
        { id: '3', nom: 'Direction Technique', description: 'Gestion technique et projets' },
        { id: '4', nom: 'Direction Commerciale', description: 'Gestion commerciale et marketing' }
      ];
      localStorage.setItem(this.directionsKey, JSON.stringify(directions));
    }

    if (!localStorage.getItem(this.servicesKey)) {
      const services: Service[] = [
        { id: '1', nom: 'Service RH', directionId: '1', description: 'Ressources Humaines' },
        { id: '2', nom: 'Service Juridique', directionId: '1', description: 'Affaires juridiques' },
        { id: '3', nom: 'Service Comptabilité', directionId: '2', description: 'Comptabilité générale' },
        { id: '4', nom: 'Service Trésorerie', directionId: '2', description: 'Gestion de trésorerie' },
        { id: '5', nom: 'Division Informatique', directionId: '3', description: 'Support informatique et systèmes' },
        { id: '6', nom: 'Service Maintenance', directionId: '3', description: 'Maintenance technique' },
        { id: '7', nom: 'Service Ventes', directionId: '4', description: 'Gestion des ventes' },
        { id: '8', nom: 'Service Marketing', directionId: '4', description: 'Marketing et communication' }
      ];
      localStorage.setItem(this.servicesKey, JSON.stringify(services));
    }
  }

  // Directions (utilise les entités organisationnelles)
  getAllDirections(): Direction[] {
    // Essayer d'abord d'utiliser les entités organisationnelles
    try {
      const entities = entiteOrganisationnelleService.getDirections();
      return entities.map(e => ({
        id: e.id,
        nom: e.nom,
        description: e.description
      }));
    } catch {
      // Fallback sur l'ancien système
      this.initializeDemoData();
      const data = localStorage.getItem(this.directionsKey);
      if (!data) return [];
      return JSON.parse(data);
    }
  }

  getDirectionById(id: string): Direction | undefined {
    return this.getAllDirections().find(d => d.id === id);
  }

  getDirectionByName(nom: string): Direction | undefined {
    return this.getAllDirections().find(d => d.nom === nom);
  }

  // Services (utilise les entités organisationnelles)
  getAllServices(): Service[] {
    // Essayer d'abord d'utiliser les entités organisationnelles
    try {
      const entities = entiteOrganisationnelleService.getAllEntities();
      const services: Service[] = [];
      
      // Récupérer tous les services et sous-services
      entities.filter(e => (e.type === 'service' || e.type === 'sous-service') && e.actif !== false)
        .forEach(entity => {
          services.push({
            id: entity.id,
            nom: entity.nom,
            directionId: this.getDirectionIdFromParent(entity.parentId || '', entities),
            serviceId: entity.type === 'sous-service' ? entity.parentId : undefined,
            description: entity.description
          });
        });
      
      return services;
    } catch {
      // Fallback sur l'ancien système
      this.initializeDemoData();
      const data = localStorage.getItem(this.servicesKey);
      if (!data) return [];
      return JSON.parse(data);
    }
  }

  // Helper pour obtenir le directionId depuis le parent
  private getDirectionIdFromParent(parentId: string, entities: any[]): string {
    if (!parentId) return '';
    const parent = entities.find(e => e.id === parentId);
    if (!parent) return '';
    if (parent.type === 'direction_generale' || parent.type === 'direction') return parent.id;
    if (parent.parentId) return this.getDirectionIdFromParent(parent.parentId, entities);
    return '';
  }

  getServiceById(id: string): Service | undefined {
    return this.getAllServices().find(s => s.id === id);
  }

  getServiceByName(nom: string): Service | undefined {
    return this.getAllServices().find(s => s.nom === nom);
  }

  getServicesByDirection(directionId: string): Service[] {
    return this.getAllServices().filter(s => s.directionId === directionId);
  }

  getServicesByDirectionName(directionName: string): Service[] {
    const direction = this.getDirectionByName(directionName);
    if (!direction) return [];
    return this.getServicesByDirection(direction.id);
  }

  // CRUD pour Directions
  createDirection(direction: Omit<Direction, 'id'>): Direction {
    const directions = this.getAllDirections();
    const newId = String(Math.max(...directions.map(d => parseInt(d.id) || 0), 0) + 1);
    const newDirection: Direction = {
      id: newId,
      ...direction
    };
    directions.push(newDirection);
    localStorage.setItem(this.directionsKey, JSON.stringify(directions));
    return newDirection;
  }

  updateDirection(id: string, updates: Partial<Direction>): Direction {
    const directions = this.getAllDirections();
    const index = directions.findIndex(d => d.id === id);
    if (index === -1) {
      throw new Error('Direction non trouvée');
    }
    directions[index] = { ...directions[index], ...updates };
    localStorage.setItem(this.directionsKey, JSON.stringify(directions));
    return directions[index];
  }

  deleteDirection(id: string): void {
    const directions = this.getAllDirections().filter(d => d.id !== id);
    localStorage.setItem(this.directionsKey, JSON.stringify(directions));
    // Supprimer aussi tous les services de cette direction
    const services = this.getAllServices().filter(s => s.directionId !== id);
    localStorage.setItem(this.servicesKey, JSON.stringify(services));
  }

  // CRUD pour Services
  createService(service: Omit<Service, 'id'>): Service {
    const services = this.getAllServices();
    const newId = String(Math.max(...services.map(s => parseInt(s.id) || 0), 0) + 1);
    const newService: Service = {
      id: newId,
      ...service
    };
    services.push(newService);
    localStorage.setItem(this.servicesKey, JSON.stringify(services));
    return newService;
  }

  updateService(id: string, updates: Partial<Service>): Service {
    const services = this.getAllServices();
    const index = services.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error('Service non trouvé');
    }
    services[index] = { ...services[index], ...updates };
    localStorage.setItem(this.servicesKey, JSON.stringify(services));
    return services[index];
  }

  deleteService(id: string): void {
    const services = this.getAllServices().filter(s => s.id !== id);
    localStorage.setItem(this.servicesKey, JSON.stringify(services));
  }
}

export const directionService = new DirectionService();

