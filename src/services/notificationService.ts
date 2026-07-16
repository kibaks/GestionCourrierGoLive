/**
 * Service de gestion des notifications avec API Laravel (ULTRA-LÉGER)
 * Gère les notifications des tâches et autres actions selon le niveau d'accès
 */

import { laravelApiService } from './laravelApiService';

export interface Notification {
  id: string;
  userId: string; // Utilisateur destinataire
  type: 'assignation' | 'rappel' | 'echeance' | 'workflow' | 'courrier' | 'system';
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  read: boolean;
  readAt?: Date;
  relatedId?: string; // ID de l'élément lié (courrier, assignation, etc.)
  relatedType?: string; // Type de l'élément lié
  actionUrl?: string; // URL pour l'action
  metadata?: Record<string, any>; // Données supplémentaires
  createdAt: Date;
  updatedAt: Date;
}

class NotificationService {
  private subscribers: Map<string, (notifications: Notification[]) => void> = new Map();
  private notificationCache: Map<string, Notification[]> = new Map();
  private readonly NOTIFICATION_TIMEOUT = 8000; // 8 secondes max pour l'API

  /**
   * Créer une notification de manière NON-BLOQUANTE (fire-and-forget)
   * Retourne immédiatement pour ne pas ralentir l'enregistrement du courrier
   */
  async createNotification(data: Omit<Notification, 'id' | 'read' | 'createdAt' | 'updatedAt'>): Promise<Notification> {
    // Créer d'abord la notification en local (immédiat)
    const { simpleNotificationService } = await import('./simpleNotificationService');
    const localNotification = simpleNotificationService.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedId: data.relatedId,
      relatedType: data.relatedType,
      priority: data.priority,
      actionUrl: data.actionUrl
    });

    // Notifier les abonnés immédiatement
    this.notifySubscribers(data.userId);

    // Essayer de synchroniser avec l'API Laravel en arrière-plan (non-bloquant)
    if (laravelApiService.isConfigured()) {
      // Utiliser un timeout pour éviter les blocages
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout création notification')), this.NOTIFICATION_TIMEOUT);
      });

      // Race entre l'appel API et le timeout
      Promise.race([
        laravelApiService.createNotification({
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          relatedId: data.relatedId,
          relatedType: data.relatedType as any,
          priority: data.priority,
          actionUrl: data.actionUrl,
          metadata: data.metadata
        }),
        timeoutPromise
      ]).then(() => {
        // Synchronisation API réussie
      }).catch(() => {
        // Silencieux - la notification locale est déjà créée, l'échec API est non-critique
      });
    }

    return localNotification;
  }

  /**
   * Récupérer les notifications d'un utilisateur via API Laravel (avec fallback localStorage)
   */
  async getNotificationsByUser(userId: string, options?: {
    unreadOnly?: boolean;
    limit?: number;
    type?: Notification['type'];
  }): Promise<Notification[]> {
    let apiNotifications: Notification[] = [];

    // Essayer d'abord l'API Laravel si configurée
    if (laravelApiService.isConfigured()) {
      try {
        apiNotifications = await laravelApiService.getNotificationsByUser(userId, options);
      } catch (error) {
        console.warn('⚠️ Échec récupération notifications via API Laravel, fallback localStorage:', error);
      }
    }

    // Toujours fusionner avec les notifications locales (créées en mode offline/queue)
    const { simpleNotificationService } = await import('./simpleNotificationService');
    const localNotifications = simpleNotificationService.getByUserId(userId);

    const merged = this.mergeNotifications(apiNotifications, localNotifications);

    if (options?.unreadOnly) {
      return merged.filter(n => !n.read);
    }

    if (options?.type) {
      return merged.filter(n => n.type === options.type);
    }

    if (options?.limit) {
      return merged.slice(0, options.limit);
    }

    return merged;
  }

  private mergeNotifications(apiNotifications: Notification[], localNotifications: Notification[]): Notification[] {
    const seen = new Set<string>();
    const keyOf = (n: Notification): string =>
      `${n.userId}:${n.type}:${n.relatedId ?? 'none'}:${n.title}:${n.message}`;

    const merged: Notification[] = [];
    [...apiNotifications, ...localNotifications].forEach(n => {
      const key = keyOf(n);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(n);
      }
    });

    return merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Marquer une notification comme lue via API Laravel (avec fallback localStorage)
   */
  async markAsRead(notificationId: string): Promise<void> {
    // Essayer d'abord l'API Laravel si configurée
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.markNotificationAsRead(notificationId);
        return;
      } catch (error) {
        console.warn('⚠️ Échec marquage notification lue via API Laravel, fallback localStorage:', error);
      }
    }
    
    // Fallback: utiliser localStorage
    const { simpleNotificationService } = await import('./simpleNotificationService');
    simpleNotificationService.markAsRead(notificationId);
  }

  /**
   * Marquer toutes les notifications d'un utilisateur comme lues via API Laravel (avec fallback localStorage)
   */
  async markAllAsRead(userId: string): Promise<void> {
    // Essayer d'abord l'API Laravel si configurée
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.markAllNotificationsAsRead(userId);
        return;
      } catch (error) {
        console.warn('⚠️ Échec marquage toutes notifications lues via API Laravel, fallback localStorage:', error);
      }
    }
    
    // Fallback: utiliser localStorage
    const { simpleNotificationService } = await import('./simpleNotificationService');
    simpleNotificationService.markAllAsRead(userId);
  }

  /**
   * Supprimer une notification via API Laravel (avec fallback localStorage)
   */
  async deleteNotification(notificationId: string): Promise<void> {
    // Supprimer d'abord dans localStorage (immédiat)
    const { simpleNotificationService } = await import('./simpleNotificationService');
    simpleNotificationService.delete(notificationId);

    // Ensuite essayer l'API Laravel si configurée (non bloquant)
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.deleteNotification(notificationId);
      } catch (error) {
        console.warn('⚠️ Échec suppression notification via API Laravel (déjà supprimée en local):', error);
      }
    }
  }

  /**
   * Obtenir le nombre de notifications non lues
   */
  async getUnreadCount(userId: string): Promise<number> {
    const notifications = await this.getNotificationsByUser(userId, { unreadOnly: true });
    return notifications.length;
  }

  /**
   * Supprimer TOUTES les notifications via API Laravel (avec fallback localStorage)
   */
  async deleteAllNotifications(userId?: string): Promise<void> {
    // Supprimer d'abord dans localStorage (immédiat)
    const { simpleNotificationService } = await import('./simpleNotificationService');
    simpleNotificationService.deleteAll();
    console.log('✅ Toutes les notifications supprimées du localStorage');

    // Ensuite essayer l'API Laravel si configurée (non bloquant)
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.deleteAllNotifications();
        console.log('✅ Toutes les notifications supprimées via API Laravel');
      } catch (error) {
        console.warn('⚠️ Échec suppression toutes notifications via API Laravel (déjà supprimées en local):', error);
      }
    }

    if (userId) this.notifySubscribers(userId);
  }

  /**
   * S'abonner aux notifications d'un utilisateur (COMPLÈTEMENT DÉSACTIVÉ)
   */
  subscribeToNotifications(userId: string, callback: (notifications: Notification[]) => void, options?: {
    pollingInterval?: number;
  }): () => void {
    // Service complètement désactivé - retourne une fonction vide
    return () => {};
  }

  /**
   * Notifier les abonnés (COMPLÈTEMENT DÉSACTIVÉ)
   */
  private notifySubscribers(userId: string): void {
    // Service complètement désactivé - aucune action
  }

  /**
   * Méthodes compatibles pour l'ancien code (DÉSACTIVÉ)
   */
  async notifyEcheance(data: {
    userId: string;
    assignationId: string;
    courrierId: string;
    courrierNumero: string;
    dateEcheance: Date;
    priority: 'normal' | 'urgent';
  }): Promise<void> {
    // Service désactivé
  }

  async notifyAssignation(data: {
    userId: string;
    assignationId: string;
    courrierId: string;
    courrierNumero: string;
    courrierObjet: string;
    dateEcheance?: Date;
    priority: 'normal' | 'urgent';
  }): Promise<void> {
    // Service désactivé
  }

  /**
   * Mettre à jour le cache et notifier les abonnés (COMPLÈTEMENT DÉSACTIVÉ)
   */
  private updateCacheAndNotify(userId: string): void {
    // Service complètement désactivé - aucune action
  }
}

export const notificationService = new NotificationService();
