import { simpleNotificationService } from './simpleNotificationService';
import { taskCompletionService } from './taskCompletionService';
import { Role } from '../types';

/**
 * Fonctions utilitaires pour créer facilement des notifications
 */
export class NotificationHelper {
  /**
   * Obtenir le texte de l'action requise selon le rôle
   */
  private static getRequiredActionText(userRole: string): string {
    const role = userRole as Role;
    
    if (taskCompletionService.completesByAnnotationOrStep(role)) {
      return 'Créer au moins une annotation ou une étape de workflow pour compléter votre tâche';
    }
    
    if (taskCompletionService.completesByOrientation(role)) {
      return 'Effectuer l\'orientation du courrier vers le service concerné';
    }
    
    if (taskCompletionService.completesByStepCompletion(role)) {
      return 'Terminer toutes les étapes qui vous sont assignées dans le workflow';
    }
    
    return 'Consulter et traiter ce courrier selon vos attributions';
  }
  /**
   * Créer une notification pour un nouvel enregistrement de courrier
   */
  static createCourrierEnregistre(data: {
    userId: string;
    courrierId: string;
    courrierNumero: string;
    courrierObjet?: string;
  }) {
    console.log('🔔 NotificationHelper.createCourrierEnregistre appelé avec:', data);
    const notification = simpleNotificationService.create({
      userId: data.userId,
      type: 'courrier',
      title: 'Courrier enregistré',
      message: `Le courrier "${data.courrierNumero}" a été enregistré avec succès${data.courrierObjet ? ` - ${data.courrierObjet}` : ''}`,
      priority: 'normal',
      relatedId: data.courrierId,
      relatedType: 'courrier',
      actionUrl: `/courriers/${data.courrierId}`
    });
    console.log('✅ Notification créée avec succès:', notification);
    return notification;
  }

  /**
   * Créer une notification pour le secrétaire DG
   */
  static createNotificationSecretaireDG(data: {
    userId: string;
    courrierId: string;
    courrierNumero: string;
    courrierObjet?: string;
  }) {
    console.log('🔔 NotificationHelper.createNotificationSecretaireDG appelé avec:', data);
    const notification = simpleNotificationService.create({
      userId: data.userId,
      type: 'courrier',
      title: 'Nouveau courrier enregistré',
      message: `Un nouveau courrier "${data.courrierNumero}" a été enregistré et nécessite votre attention${data.courrierObjet ? ` - ${data.courrierObjet}` : ''}`,
      priority: 'high',
      relatedId: data.courrierId,
      relatedType: 'courrier',
      actionUrl: `/courriers/${data.courrierId}`
    });
    console.log('✅ Notification secrétaire DG créée avec succès:', notification);
    return notification;
  }

  /**
   * Créer une notification de rappel avec l'action requise selon le rôle
   */
  static createRappel(data: {
    userId: string;
    courrierId: string;
    courrierNumero: string;
    message: string;
    userRole?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }) {
    const requiredAction = data.userRole ? this.getRequiredActionText(data.userRole) : '';
    const fullMessage = requiredAction 
      ? `${data.message}\n\n📋 Action requise pour terminer votre tâche : ${requiredAction}`
      : data.message;
    
    return simpleNotificationService.create({
      userId: data.userId,
      type: 'rappel',
      title: 'Rappel de courrier',
      message: fullMessage,
      priority: data.priority || 'normal',
      relatedId: data.courrierId,
      relatedType: 'courrier',
      actionUrl: `/courriers/${data.courrierId}`
    });
  }

  /**
   * Créer une notification d'échéance avec l'action requise selon le rôle
   */
  static createEcheance(data: {
    userId: string;
    courrierId: string;
    courrierNumero: string;
    dateEcheance: Date;
    userRole?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }) {
    const requiredAction = data.userRole ? this.getRequiredActionText(data.userRole) : '';
    const baseMessage = `Le courrier "${data.courrierNumero}" arrive à échéance le ${data.dateEcheance.toLocaleDateString('fr-FR')}`;
    const fullMessage = requiredAction 
      ? `${baseMessage}\n\n📋 Action requise pour terminer votre tâche : ${requiredAction}`
      : baseMessage;
    
    return simpleNotificationService.create({
      userId: data.userId,
      type: 'echeance',
      title: 'Échéance de courrier',
      message: fullMessage,
      priority: data.priority || 'high',
      relatedId: data.courrierId,
      relatedType: 'courrier',
      actionUrl: `/courriers/${data.courrierId}`
    });
  }

  /**
   * Créer une notification de workflow avec l'action requise selon le rôle
   */
  static createWorkflow(data: {
    userId: string;
    courrierId: string;
    courrierNumero: string;
    etape: string;
    message?: string;
    userRole?: string;
  }) {
    const requiredAction = data.userRole ? this.getRequiredActionText(data.userRole) : '';
    const baseMessage = data.message || `Le courrier "${data.courrierNumero}" nécessite votre attention pour l'étape: ${data.etape}`;
    const fullMessage = requiredAction 
      ? `${baseMessage}\n\n📋 Action requise pour terminer votre tâche : ${requiredAction}`
      : baseMessage;
    
    return simpleNotificationService.create({
      userId: data.userId,
      type: 'workflow',
      title: `Workflow: ${data.etape}`,
      message: fullMessage,
      priority: 'normal',
      relatedId: data.courrierId,
      relatedType: 'courrier',
      actionUrl: `/courriers/${data.courrierId}`
    });
  }

  /**
   * Créer une notification système
   */
  static createSystem(data: {
    userId: string;
    title: string;
    message: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    actionUrl?: string;
  }) {
    return simpleNotificationService.create({
      userId: data.userId,
      type: 'system',
      title: data.title,
      message: data.message,
      priority: data.priority || 'normal',
      actionUrl: data.actionUrl
    });
  }
}
