import { courrierService } from './courrierService';
import { userService } from './userService';
import { taskNotificationService } from './taskNotificationService';
import { notificationService } from './notificationService';
import { taskCompletionService } from './taskCompletionService';
import { Role } from '../types';

export interface RealTimeSyncEvent {
  type: 'action_completed' | 'task_assigned' | 'status_changed';
  courrierId: string;
  courrierNumero: string;
  userId: string;
  userRole: string;
  action: string;
  previousStatus?: string;
  newStatus: string;
  timestamp: Date;
  automatic: boolean;
}

class RealTimeTaskSyncService {
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastKnownStatuses = new Map<string, string>();
  private listeners: ((event: RealTimeSyncEvent) => void)[] = [];
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    // Initialiser le BroadcastChannel pour la communication cross-onglets
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('workflow_sync');
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'workflow_created') {
          console.log('📡 [RealTimeSync] Message reçu via BroadcastChannel:', event.data);
          // Convertir le message en RealTimeSyncEvent et notifier les listeners locaux
          const syncEvent: RealTimeSyncEvent = {
            type: 'task_assigned',
            courrierId: event.data.courrierId,
            courrierNumero: event.data.courrierNumero,
            userId: event.data.userId,
            userRole: event.data.userRole,
            action: `Étape créée: ${event.data.etapeName}`,
            newStatus: 'EN_ATTENTE',
            timestamp: new Date(event.data.timestamp),
            automatic: false
          };
          this.notifyListeners(syncEvent);
        }
        
        if (event.data && event.data.type === 'annotation_created') {
          console.log('📡 [RealTimeSync] Message annotation reçu via BroadcastChannel:', event.data);
          // Convertir le message en RealTimeSyncEvent et notifier les listeners locaux
          const syncEvent: RealTimeSyncEvent = {
            type: 'action_completed',
            courrierId: event.data.courrierId,
            courrierNumero: event.data.courrierNumero,
            userId: event.data.userId,
            userRole: event.data.userRole,
            action: `Annotation créée: ${event.data.annotationType}`,
            newStatus: 'TERMINE',
            timestamp: new Date(event.data.timestamp),
            automatic: false
          };
          this.notifyListeners(syncEvent);
        }
      };
      console.log('📡 [RealTimeSync] BroadcastChannel initialisé');
    }
  }

  // S'abonner aux événements de synchronisation
  subscribe(listener: (event: RealTimeSyncEvent) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notifier tous les abonnés
  private notifyListeners(event: RealTimeSyncEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Erreur dans listener de synchronisation:', error);
      }
    });
  }

  // Démarrer la surveillance en temps réel
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('🔄 [RealTimeSync] Surveillance déjà en cours');
      return;
    }

    console.log('🚀 [RealTimeSync] Démarrage de la surveillance en temps réel');
    this.isMonitoring = true;

    // Surveiller toutes les 60 secondes pour réduire encore plus la charge
    this.monitoringInterval = setInterval(async () => {
      await this.checkForStatusChanges();
    }, 60000);
  }

  // Arrêter la surveillance
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('⏹️ [RealTimeSync] Surveillance arrêtée');
  }

  // Vérifier les changements de statut (optimisé)
  private async checkForStatusChanges() {
    try {
      console.log('🔍 [RealTimeSync] Vérification des changements de statut...');
      
      // Récupérer tous les courriers avec des assignations actives
      const allCourriers = await this.getAllCourriersWithAssignments();
      console.log(`📊 [RealTimeSync] ${allCourriers.length} courriers à vérifier`);
      
      // Traiter par lots pour éviter la surcharge
      const BATCH_SIZE = 10;
      for (let i = 0; i < allCourriers.length; i += BATCH_SIZE) {
        const batch = allCourriers.slice(i, i + BATCH_SIZE);
        
        for (const courrier of batch) {
          const currentStatus = courrier.statut;
          const lastStatus = this.lastKnownStatuses.get(courrier.id);
          
          // Si le statut a changé
          if (lastStatus && lastStatus !== currentStatus) {
            console.log(`🔄 [RealTimeSync] Changement détecté: ${courrier.numero} ${lastStatus} → ${currentStatus}`);
            
            // Analyser le changement et notifier les utilisateurs concernés
            await this.handleStatusChange(courrier, lastStatus, currentStatus);
          }
          
          // Mettre à jour le dernier statut connu
          this.lastKnownStatuses.set(courrier.id, currentStatus);
        }
        
        // Pause entre les batches
        if (i + BATCH_SIZE < allCourriers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log('✅ [RealTimeSync] Vérification terminée');
    } catch (error) {
      console.error('❌ [RealTimeSync] Erreur surveillance changements:', error);
    }
  }

  // Gérer un changement de statut
  private async handleStatusChange(courrier: any, previousStatus: string, newStatus: string) {
    try {
      // Récupérer les assignations pour ce courrier
      const assignations = await courrierService.getAssignationsByCourrier(courrier.id);
      
      // Récupérer les workflows du courrier pour vérifier la complétion des étapes
      const workflows = await (courrierService as any).getWorkflowsByCourrierAsync(courrier.id).catch(() => []);
      
      for (const assignation of assignations) {
        const assignedUser = userService.getUserById(assignation.assigneA);
        if (!assignedUser) continue;

        // Détecter l'action qui a été effectuée
        const detectedAction = this.detectActionFromStatusChange(previousStatus, newStatus);
        
        // Vérifier si l'action est liée à l'orientation
        const isOrientationRelated = detectedAction === 'Orientation' || 
                                     taskCompletionService.isOrientationRelated(detectedAction || '', courrier.etape);
        
        // Vérifier si la tâche est terminée selon le rôle de l'utilisateur
        const assignedSteps = workflows.filter((w: any) => w.assigneA === assignedUser.id);
        const completionCheck = taskCompletionService.checkTaskCompletion(assignedUser, {
          assignedSteps,
          orientationDone: newStatus.includes('ORIENTE'),
          isOrientationRelated
        });
        
        if (detectedAction || completionCheck.isComplete) {
          const event: RealTimeSyncEvent = {
            type: completionCheck.isComplete ? 'action_completed' : 'status_changed',
            courrierId: courrier.id,
            courrierNumero: courrier.numero,
            userId: assignation.assigneA,
            userRole: assignedUser.role,
            action: detectedAction || completionCheck.reason,
            previousStatus,
            newStatus,
            timestamp: completionCheck.completedAt || new Date(),
            automatic: true
          };

          // Notifier immédiatement si la tâche est terminée
          if (completionCheck.isComplete) {
            await this.notifyUserOfTaskCompleted(event, completionCheck.reason);
          }
          
          // Notifier les abonnés
          this.notifyListeners(event);
        }
      }
    } catch (error) {
      console.error('❌ [RealTimeSync] Erreur traitement changement statut:', error);
    }
  }

  // Notifier un utilisateur qu'une tâche est complétée avec les détails de la raison
  private async notifyUserOfTaskCompleted(event: RealTimeSyncEvent, completionReason: string) {
    try {
      console.log(`🔔 [RealTimeSync] Tâche terminée pour ${event.userRole}: ${event.action} sur ${event.courrierNumero}`);
      
      // Créer la notification de tâche
      await taskNotificationService.createTaskCompletedNotification({
        userId: event.userId,
        userRole: event.userRole,
        courrierId: event.courrierId,
        courrierNumero: event.courrierNumero,
        action: event.action
      });
      
      // Synchroniser avec le système principal avec les détails de complétion
      await notificationService.createNotification({
        userId: event.userId,
        type: 'system',
        title: '✅ Tâche terminée automatiquement',
        message: `${completionReason}\n\nCourrier: ${event.courrierNumero}`,
        relatedId: event.courrierId,
        relatedType: 'courrier',
        priority: 'high',
        metadata: {
          courrierNumero: event.courrierNumero,
          action: event.action,
          userRole: event.userRole,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          completionReason,
          detectedAt: event.timestamp.toISOString(),
          automatic: true,
          realTime: true
        }
      });
      
      console.log(`✅ [RealTimeSync] Notification de complétion envoyée pour ${event.courrierNumero}`);
    } catch (error) {
      console.error(`❌ [RealTimeSync] Erreur notification complétion:`, error);
    }
  }

  // Détecter l'action depuis le changement de statut
  private detectActionFromStatusChange(previousStatus: string, newStatus: string): string | null {
    // Orientation
    if (!previousStatus.includes('ORIENTE') && newStatus.includes('ORIENTE')) {
      return 'Orientation';
    }
    
    // Ouverture
    if (!previousStatus.includes('OUVERT') && newStatus.includes('OUVERT')) {
      return 'Ouverture';
    }
    
    // Annotation
    if (!previousStatus.includes('ANNOTATION') && newStatus.includes('ANNOTATION')) {
      return 'Annotation';
    }
    
    // Traitement
    if (!previousStatus.includes('EN_COURS_TRAITEMENT') && newStatus.includes('EN_COURS_TRAITEMENT')) {
      return 'Traitement';
    }
    
    // Finalisation
    if (!previousStatus.includes('TRAITE') && newStatus.includes('TRAITE')) {
      return 'Finalisation';
    }
    
    return null;
  }

  // Notifier un utilisateur d'une action complétée
  private async notifyUserOfActionCompleted(event: RealTimeSyncEvent) {
    try {
      console.log(`🔔 [RealTimeSync] Notification temps réel pour ${event.userRole}: ${event.action} sur ${event.courrierNumero}`);
      
      // Créer la notification de tâche
      await taskNotificationService.createTaskCompletedNotification({
        userId: event.userId,
        userRole: event.userRole,
        courrierId: event.courrierId,
        courrierNumero: event.courrierNumero,
        action: event.action
      });
      
      // Synchroniser avec le système principal
      await notificationService.createNotification({
        userId: event.userId,
        type: 'system',
        title: '✅ Action terminée automatiquement',
        message: `L'action "${event.action}" pour le courrier ${event.courrierNumero} a été détectée comme terminée.`,
        relatedId: event.courrierId,
        relatedType: 'courrier',
        priority: 'high',
        metadata: {
          courrierNumero: event.courrierNumero,
          action: event.action,
          userRole: event.userRole,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          detectedAt: event.timestamp.toISOString(),
          automatic: true,
          realTime: true
        }
      });
      
      console.log(`✅ [RealTimeSync] Notification temps réel envoyée pour ${event.courrierNumero}`);
    } catch (error) {
      console.error(`❌ [RealTimeSync] Erreur notification temps réel:`, error);
    }
  }

  // Récupérer tous les courriers avec des assignations
  private async getAllCourriersWithAssignments(): Promise<any[]> {
    // Implémenter selon votre service
    // Pour l'instant, retourne un tableau vide
    return [];
  }

  // Forcer une vérification manuelle
  async forceCheck() {
    console.log('🔍 [RealTimeSync] Vérification manuelle forcée');
    await this.checkForStatusChanges();
  }

  // Notifier manuellement la création d'une étape de workflow
  notifyWorkflowCreated(courrierId: string, courrierNumero: string, userId: string, userRole: string, etapeName: string) {
    console.log(`📢 [RealTimeSync] Notification création étape: ${etapeName} sur ${courrierNumero}`);
    
    const event: RealTimeSyncEvent = {
      type: 'task_assigned',
      courrierId,
      courrierNumero,
      userId,
      userRole,
      action: `Étape créée: ${etapeName}`,
      newStatus: 'EN_ATTENTE',
      timestamp: new Date(),
      automatic: false
    };

    // Notifier les listeners locaux
    this.notifyListeners(event);
    
    // Envoyer via BroadcastChannel pour notifier les autres onglets
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'workflow_created',
        courrierId,
        courrierNumero,
        userId,
        userRole,
        etapeName,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 [RealTimeSync] Message envoyé via BroadcastChannel`);
    }
    
    console.log(`✅ [RealTimeSync] Listeners notifiés de la création d'étape`);
  }

  // Notifier manuellement la création d'une annotation
  notifyAnnotationCreated(courrierId: string, courrierNumero: string, userId: string, userRole: string, annotationType: string) {
    console.log(`📢 [RealTimeSync] Notification création annotation: ${annotationType} sur ${courrierNumero}`);
    
    const event: RealTimeSyncEvent = {
      type: 'action_completed',
      courrierId,
      courrierNumero,
      userId,
      userRole,
      action: `Annotation créée: ${annotationType}`,
      newStatus: 'TERMINE',
      timestamp: new Date(),
      automatic: false
    };

    // Notifier les listeners locaux
    this.notifyListeners(event);
    
    // Envoyer via BroadcastChannel pour notifier les autres onglets
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'annotation_created',
        courrierId,
        courrierNumero,
        userId,
        userRole,
        annotationType,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 [RealTimeSync] Message annotation envoyé via BroadcastChannel`);
    }
    
    console.log(`✅ [RealTimeSync] Listeners notifiés de la création d'annotation`);
  }

  // Notifier manuellement la complétion d'une tâche (orientation, annotation, etc.)
  notifyTaskCompleted(courrierId: string, courrierNumero: string, userId: string, userRole: string, action: string, completionReason: string) {
    console.log(`📢 [RealTimeSync] Notification tâche complétée: ${action} sur ${courrierNumero}`);
    
    const event: RealTimeSyncEvent = {
      type: 'action_completed',
      courrierId,
      courrierNumero,
      userId,
      userRole,
      action: `Tâche terminée: ${action}`,
      newStatus: 'TERMINE',
      timestamp: new Date(),
      automatic: true
    };

    // Notifier les listeners locaux
    this.notifyListeners(event);
    
    // Envoyer via BroadcastChannel pour notifier les autres onglets
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'task_completed',
        courrierId,
        courrierNumero,
        userId,
        userRole,
        action,
        completionReason,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 [RealTimeSync] Message complétion envoyé via BroadcastChannel`);
    }
    
    // Créer la notification de tâche complétée
    this.createTaskCompletedNotification(event, completionReason);
    
    console.log(`✅ [RealTimeSync] Listeners notifiés de la complétion de tâche`);
  }

  // Créer une notification de tâche complétée
  private async createTaskCompletedNotification(event: RealTimeSyncEvent, completionReason: string) {
    try {
      await taskNotificationService.createTaskCompletedNotification({
        userId: event.userId,
        userRole: event.userRole,
        courrierId: event.courrierId,
        courrierNumero: event.courrierNumero,
        action: event.action
      });
      
      await notificationService.createNotification({
        userId: event.userId,
        type: 'system',
        title: '✅ Tâche terminée',
        message: `${completionReason}\n\nCourrier: ${event.courrierNumero}`,
        relatedId: event.courrierId,
        relatedType: 'courrier',
        priority: 'high',
        metadata: {
          courrierNumero: event.courrierNumero,
          action: event.action,
          userRole: event.userRole,
          completionReason,
          detectedAt: event.timestamp.toISOString(),
          automatic: true,
          realTime: true
        }
      });
    } catch (error) {
      console.error(`❌ [RealTimeSync] Erreur création notification:`, error);
    }
  }

  // Obtenir le statut de surveillance
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      trackedCourriers: this.lastKnownStatuses.size,
      listenersCount: this.listeners.length
    };
  }
}

export const realTimeTaskSyncService = new RealTimeTaskSyncService();
