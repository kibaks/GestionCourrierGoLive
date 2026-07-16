import { Procedure, ProcedureInstance, ProcedureEvent, ProcedureAction, ProcedureEventInstance, ProcedureActionInstance } from '../types';

class ProcedureService {
  private proceduresKey = 'procedures';
  private procedureInstancesKey = 'procedure_instances';

  // CRUD pour les procédures
  createProcedure(procedure: Omit<Procedure, 'id' | 'dateCreation' | 'dateModification'>): Procedure {
    const procedures = this.getAllProcedures();
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newProcedure: Procedure = {
      ...procedure,
      id: uniqueId,
      dateCreation: new Date(),
      dateModification: new Date()
    };
    procedures.push(newProcedure);
    localStorage.setItem(this.proceduresKey, JSON.stringify(procedures));
    return newProcedure;
  }

  getAllProcedures(): Procedure[] {
    const data = localStorage.getItem(this.proceduresKey);
    if (!data) return [];
    return JSON.parse(data).map((p: any) => ({
      ...p,
      dateCreation: new Date(p.dateCreation),
      dateModification: new Date(p.dateModification),
      evenements: p.evenements.map((e: any) => ({
        ...e,
        dateDebut: new Date(e.dateDebut),
        dateFin: new Date(e.dateFin),
        actions: e.actions.map((a: any) => ({ ...a }))
      }))
    }));
  }

  getProcedureById(id: string): Procedure | undefined {
    return this.getAllProcedures().find(p => p.id === id);
  }

  updateProcedure(id: string, updates: Partial<Procedure>): Procedure | null {
    const procedures = this.getAllProcedures();
    const index = procedures.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    procedures[index] = {
      ...procedures[index],
      ...updates,
      dateModification: new Date()
    };
    localStorage.setItem(this.proceduresKey, JSON.stringify(procedures));
    return procedures[index];
  }

  deleteProcedure(id: string): boolean {
    const procedures = this.getAllProcedures();
    const filtered = procedures.filter(p => p.id !== id);
    if (filtered.length === procedures.length) return false;
    localStorage.setItem(this.proceduresKey, JSON.stringify(filtered));
    return true;
  }

  // Calculer la durée totale d'une procédure
  calculateDureeTotale(procedure: Procedure): number {
    return procedure.evenements.reduce((total, event) => {
      return total + event.actions.reduce((eventTotal, action) => {
        return eventTotal + action.dureeEstimee;
      }, 0);
    }, 0);
  }

  // Créer une instance de procédure pour un courrier
  createProcedureInstance(
    procedureId: string,
    courrierId: string,
    creePar: string,
    acteurs?: string[]
  ): ProcedureInstance {
    const procedure = this.getProcedureById(procedureId);
    if (!procedure) {
      throw new Error('Procédure non trouvée');
    }

    const dateDebut = new Date();
    const dureeTotale = this.calculateDureeTotale(procedure);
    const dateFinPrevue = new Date(dateDebut.getTime() + dureeTotale * 60 * 60 * 1000);

    // Créer les instances d'événements et d'actions
    const evenements: ProcedureEventInstance[] = [];
    let currentDate = new Date(dateDebut);

    procedure.evenements
      .sort((a, b) => a.ordre - b.ordre)
      .forEach((event, eventIndex) => {
        const eventDebut = new Date(currentDate);
        const eventDuree = event.actions.reduce((total, action) => total + action.dureeEstimee, 0);
        const eventFin = new Date(eventDebut.getTime() + eventDuree * 60 * 60 * 1000);

        const actions: ProcedureActionInstance[] = event.actions
          .sort((a, b) => a.ordre - b.ordre)
          .map((action, actionIndex) => {
            const actionDebut = new Date(currentDate);
            const actionFin = new Date(actionDebut.getTime() + action.dureeEstimee * 60 * 60 * 1000);
            currentDate = new Date(actionFin);

            return {
              id: `${Date.now()}-${eventIndex}-${actionIndex}`,
              actionId: action.id,
              dateFinPrevue: actionFin,
              statut: 'EN_ATTENTE' as const,
              acteurId: action.acteurId || (acteurs && acteurs.length > 0 ? acteurs[0] : undefined)
            };
          });

        evenements.push({
          id: `${Date.now()}-${eventIndex}`,
          eventId: event.id,
          dateDebut: eventDebut,
          dateFinPrevue: eventFin,
          statut: 'EN_ATTENTE' as const,
          actions
        });
      });

    const instance: ProcedureInstance = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      procedureId,
      courrierId,
      dateDebut,
      dateFinPrevue,
      statut: 'EN_ATTENTE',
      acteurs: acteurs || procedure.acteurs,
      evenements,
      creePar,
      createdAt: new Date()
    };

    const instances = this.getAllProcedureInstances();
    instances.push(instance);
    localStorage.setItem(this.procedureInstancesKey, JSON.stringify(instances));

    return instance;
  }

  getAllProcedureInstances(): ProcedureInstance[] {
    const data = localStorage.getItem(this.procedureInstancesKey);
    if (!data) return [];
    return JSON.parse(data).map((pi: any) => ({
      ...pi,
      dateDebut: new Date(pi.dateDebut),
      dateFinPrevue: new Date(pi.dateFinPrevue),
      dateFinReelle: pi.dateFinReelle ? new Date(pi.dateFinReelle) : undefined,
      createdAt: new Date(pi.createdAt),
      evenements: pi.evenements.map((e: any) => ({
        ...e,
        dateDebut: new Date(e.dateDebut),
        dateFinPrevue: new Date(e.dateFinPrevue),
        dateFinReelle: e.dateFinReelle ? new Date(e.dateFinReelle) : undefined,
        actions: e.actions.map((a: any) => ({
          ...a,
          dateDebut: a.dateDebut ? new Date(a.dateDebut) : undefined,
          dateFinPrevue: new Date(a.dateFinPrevue),
          dateFinReelle: a.dateFinReelle ? new Date(a.dateFinReelle) : undefined
        }))
      }))
    }));
  }

  getProcedureInstancesByCourrier(courrierId: string): ProcedureInstance[] {
    return this.getAllProcedureInstances().filter(pi => pi.courrierId === courrierId);
  }

  getProcedureInstancesByUser(userId: string): ProcedureInstance[] {
    return this.getAllProcedureInstances().filter(pi => 
      pi.acteurs.includes(userId) || 
      pi.evenements.some(e => e.actions.some(a => a.acteurId === userId))
    );
  }

  updateProcedureInstance(id: string, updates: Partial<ProcedureInstance>): ProcedureInstance | null {
    const instances = this.getAllProcedureInstances();
    const index = instances.findIndex(pi => pi.id === id);
    if (index === -1) return null;
    
    instances[index] = { ...instances[index], ...updates };
    localStorage.setItem(this.procedureInstancesKey, JSON.stringify(instances));
    return instances[index];
  }

  updateActionInstance(
    instanceId: string,
    eventId: string,
    actionId: string,
    updates: Partial<ProcedureActionInstance>
  ): boolean {
    const instance = this.getAllProcedureInstances().find(pi => pi.id === instanceId);
    if (!instance) return false;

    const event = instance.evenements.find(e => e.id === eventId);
    if (!event) return false;

    const action = event.actions.find(a => a.id === actionId);
    if (!action) return false;

    Object.assign(action, updates);
    
    // Mettre à jour le statut de l'événement si toutes les actions sont terminées
    if (updates.statut === 'TERMINE') {
      const allActionsTerminees = event.actions.every(a => a.statut === 'TERMINE');
      if (allActionsTerminees) {
        event.statut = 'TERMINE';
        event.dateFinReelle = new Date();
      }
    }

    // Mettre à jour le statut de l'instance si tous les événements sont terminés
    const allEventsTermines = instance.evenements.every(e => e.statut === 'TERMINE');
    if (allEventsTermines && instance.statut !== 'TERMINE') {
      instance.statut = 'TERMINE';
      instance.dateFinReelle = new Date();
    }

    this.updateProcedureInstance(instanceId, instance);
    return true;
  }
}

export const procedureService = new ProcedureService();


















