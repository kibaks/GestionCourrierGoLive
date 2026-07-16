interface Notification {
  id: string;
  userId: string;
  type: 'courrier' | 'assignation' | 'rappel' | 'echeance' | 'workflow' | 'system';
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  read: boolean;
  readAt?: Date;
  relatedId?: string;
  relatedType?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface SimpleNotification extends Omit<Notification, 'id' | 'read' | 'createdAt' | 'updatedAt'> {
  id?: string;
  read?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

class SimpleNotificationService {
  private storageKey = 'simple_notifications';

  /**
   * Créer une notification simple et locale
   */
  create(data: SimpleNotification): Notification {
    const notifications = this.createMany([data]);
    return notifications[0];
  }

  /**
   * Créer plusieurs notifications locales en une seule écriture localStorage.
   * Réduit le coût de stockage lors de la création en masse de courriers.
   */
  createMany(dataList: SimpleNotification[]): Notification[] {
    if (dataList.length === 0) return [];

    const notifications: Notification[] = dataList.map(data => ({
      id: data.id || `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      priority: data.priority || 'normal',
      read: data.read || false,
      readAt: data.readAt,
      relatedId: data.relatedId,
      relatedType: data.relatedType,
      actionUrl: data.actionUrl,
      metadata: data.metadata || {},
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date()
    }));

    this.saveManyLocal(notifications);
    return notifications;
  }

  /**
   * Récupérer les notifications d'un utilisateur
   */
  getByUserId(userId: string, options?: {
    limit?: number;
    unreadOnly?: boolean;
  }): Notification[] {
    try {
      const notifications = this.getAllLocal();
      let filtered = notifications.filter(n => n.userId === userId);

      if (options?.unreadOnly) {
        filtered = filtered.filter(n => !n.read);
      }

      // Trier par date décroissante
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered;
    } catch (error) {
      console.error('Erreur lors de la récupération des notifications:', error);
      return [];
    }
  }

  /**
   * Marquer une notification comme lue
   */
  markAsRead(notificationId: string): boolean {
    try {
      const notifications = this.getAllLocal();
      const index = notifications.findIndex(n => n.id === notificationId);
      
      if (index === -1) return false;

      notifications[index] = {
        ...notifications[index],
        read: true,
        readAt: new Date(),
        updatedAt: new Date()
      };

      this.saveAllLocal(notifications);
      return true;
    } catch (error) {
      console.error('Erreur lors du marquage de la notification:', error);
      return false;
    }
  }

  /**
   * Marquer toutes les notifications d'un utilisateur comme lues
   */
  markAllAsRead(userId: string): boolean {
    try {
      const notifications = this.getAllLocal();
      const updated = notifications.map(n => 
        n.userId === userId && !n.read 
          ? { ...n, read: true, readAt: new Date(), updatedAt: new Date() }
          : n
      );

      this.saveAllLocal(updated);
      return true;
    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications:', error);
      return false;
    }
  }

  /**
   * Supprimer une notification
   */
  delete(notificationId: string): boolean {
    try {
      const notifications = this.getAllLocal();
      const filtered = notifications.filter(n => n.id !== notificationId);
      
      if (filtered.length === notifications.length) return false;

      this.saveAllLocal(filtered);
      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression de la notification:', error);
      return false;
    }
  }

  /**
   * Obtenir le nombre de notifications non lues
   */
  getUnreadCount(userId: string): number {
    try {
      const notifications = this.getAllLocal();
      return notifications.filter(n => n.userId === userId && !n.read).length;
    } catch (error) {
      console.error('Erreur lors du comptage des notifications:', error);
      return 0;
    }
  }

  /**
   * Nettoyer les anciennes notifications (plus de 30 jours)
   */
  cleanup(): void {
    try {
      const notifications = this.getAllLocal();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const filtered = notifications.filter(n => n.createdAt > thirtyDaysAgo);
      this.saveAllLocal(filtered);
    } catch (error) {
      console.error('Erreur lors du nettoyage des notifications:', error);
    }
  }

  /**
   * Supprimer TOUTES les notifications de la base de données
   */
  deleteAll(): boolean {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('✅ Toutes les notifications ont été supprimées du localStorage');
      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression de toutes les notifications:', error);
      return false;
    }
  }

  // Méthodes privées pour la gestion locale

  private getAllLocal(): Notification[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return [];

      return JSON.parse(stored).map((n: any) => ({
        ...n,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
        readAt: n.readAt ? new Date(n.readAt) : undefined
      }));
    } catch (error) {
      console.error('Erreur lors de la lecture des notifications locales:', error);
      return [];
    }
  }

  private saveManyLocal(newNotifications: Notification[]): void {
    try {
      const notifications = this.getAllLocal();
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const existingKeys = new Set(
        notifications
          .filter(n => new Date(n.createdAt).getTime() > oneDayAgo)
          .map(n => `${n.userId}:${n.type}:${n.relatedId ?? ''}`)
      );

      const toAdd = newNotifications.filter(n => {
        if (n.relatedId === undefined) return true;
        const key = `${n.userId}:${n.type}:${n.relatedId}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      const updated = [...toAdd, ...notifications].slice(0, 200);
      this.saveAllLocal(updated);
    } catch (error) {
      console.error('Erreur sauvegarde notifications batch:', error);
    }
  }

  private saveLocal(notification: Notification): void {
    try {
      const notifications = this.getAllLocal();
      // Déduplication : ignorer si même userId+type+relatedId dans les dernières 24h
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const duplicate = notifications.find(n =>
        n.userId === notification.userId &&
        n.type === notification.type &&
        n.relatedId === notification.relatedId &&
        n.relatedId !== undefined &&
        new Date(n.createdAt).getTime() > oneDayAgo
      );
      if (duplicate) return;
      const updated = [notification, ...notifications].slice(0, 200);
      this.saveAllLocal(updated);
    } catch (error) {
      console.error('Erreur sauvegarde notification:', error);
    }
  }

  private saveAllLocal(notifications: Notification[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(notifications));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des notifications:', error);
    }
  }
}

export const simpleNotificationService = new SimpleNotificationService();
