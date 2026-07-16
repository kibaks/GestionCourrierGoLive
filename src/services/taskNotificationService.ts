import { notificationService } from './notificationService';
import { taskCompletionService } from './taskCompletionService';
import { Role } from '../types';

export interface TaskNotification {
  id: string;
  userId: string;
  type: 'task_completed' | 'task_assigned' | 'task_overdue';
  title: string;
  message: string;
  courrierId?: string;
  courrierNumero?: string;
  action?: string;
  userRole?: string;
  requiredAction?: string; // Action requise pour compléter la tâche
  createdAt: Date;
  read: boolean;
}

class TaskNotificationService {
  private notifications: TaskNotification[] = [];
  private listeners: ((notifications: TaskNotification[]) => void)[] = [];

  // S'abonner aux changements de notifications
  subscribe(listener: (notifications: TaskNotification[]) => void) {
    this.listeners.push(listener);
    listener(this.notifications);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notifier tous les abonnés
  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.notifications));
  }

  // Créer une notification de tâche complétée
  async createTaskCompletedNotification(data: {
    userId: string;
    userRole: string;
    courrierId: string;
    courrierNumero: string;
    action: string;
  }) {
    const notification: TaskNotification = {
      id: `task-${Date.now()}-${Math.random()}`,
      userId: data.userId,
      type: 'task_completed',
      title: 'Tâche automatiquement complétée',
      message: `L'action "${data.action}" a été détectée comme terminée pour le courrier ${data.courrierNumero}`,
      courrierId: data.courrierId,
      courrierNumero: data.courrierNumero,
      action: data.action,
      userRole: data.userRole,
      createdAt: new Date(),
      read: false
    };

    this.notifications.unshift(notification);
    this.notifyListeners();

    // Envoyer la notification au service de notification principal
    try {
      await notificationService.createNotification({
        userId: data.userId,
        type: 'system',
        title: notification.title,
        message: notification.message,
        relatedId: data.courrierId,
        relatedType: 'courrier',
        priority: 'normal',
        metadata: {
          courrierNumero: data.courrierNumero,
          action: data.action,
          userRole: data.userRole
        }
      });
    } catch (error) {
      console.error('Erreur envoi notification principale:', error);
    }

    console.log(`🔔 [TaskNotification] Tâche complétée: ${data.action} pour ${data.courrierNumero}`);
  }

  // Obtenir le texte de l'action requise selon le rôle
  private getRequiredActionText(userRole: string): string {
    const role = userRole as Role;
    
    if (taskCompletionService.completesByAnnotationOrStep(role)) {
      return 'Créer au moins une annotation ou une étape de workflow pour ce courrier';
    }
    
    if (taskCompletionService.completesByOrientation(role)) {
      return 'Effectuer l\'orientation du courrier vers le service concerné';
    }
    
    if (taskCompletionService.completesByStepCompletion(role)) {
      return 'Terminer toutes les étapes qui vous sont assignées dans le workflow';
    }
    
    return 'Consulter et traiter ce courrier selon vos attributions';
  }

  // Créer une notification de tâche assignée
  async createTaskAssignedNotification(data: {
    userId: string;
    userRole: string;
    courrierId: string;
    courrierNumero: string;
    action: string;
  }) {
    const requiredAction = this.getRequiredActionText(data.userRole);
    const completionRule = taskCompletionService.isManagementRole(data.userRole as Role) 
      ? 'Votre tâche sera automatiquement terminée lorsque vous aurez créé une annotation ou une étape.'
      : taskCompletionService.completesByOrientation(data.userRole as Role)
        ? 'Votre tâche sera automatiquement terminée lorsque l\'orientation sera effectuée.'
        : 'Votre tâche sera automatiquement terminée lorsque vous aurez terminé toutes les étapes assignées.';
    
    const notification: TaskNotification = {
      id: `task-${Date.now()}-${Math.random()}`,
      userId: data.userId,
      type: 'task_assigned',
      title: 'Nouvelle tâche assignée',
      message: `Une nouvelle action "${data.action}" est requise pour le courrier ${data.courrierNumero}.\n\n📋 Action requise : ${requiredAction}\n\n✅ ${completionRule}`,
      courrierId: data.courrierId,
      courrierNumero: data.courrierNumero,
      action: data.action,
      userRole: data.userRole,
      requiredAction,
      createdAt: new Date(),
      read: false
    };

    this.notifications.unshift(notification);
    this.notifyListeners();

    console.log(`📋 [TaskNotification] Tâche assignée: ${data.action} pour ${data.courrierNumero} (Action requise: ${requiredAction})`);
  }

  // Marquer une notification comme lue
  markAsRead(notificationId: string) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.notifyListeners();
    }
  }

  // Marquer toutes les notifications comme lues
  markAllAsRead(userId: string) {
    this.notifications
      .filter(n => n.userId === userId)
      .forEach(n => n.read = true);
    this.notifyListeners();
  }

  // Obtenir les notifications non lues pour un utilisateur
  getUnreadNotifications(userId: string): TaskNotification[] {
    return this.notifications.filter(n => n.userId === userId && !n.read);
  }

  // Obtenir toutes les notifications pour un utilisateur
  getNotifications(userId: string, limit: number = 50): TaskNotification[] {
    return this.notifications
      .filter(n => n.userId === userId)
      .slice(0, limit);
  }

  // Supprimer une notification
  deleteNotification(notificationId: string) {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.notifyListeners();
  }

  // Vider toutes les notifications
  clear() {
    this.notifications = [];
    this.notifyListeners();
  }
}

export const taskNotificationService = new TaskNotificationService();
