/**
 * Service de queue de notifications — approche professionnelle non-bloquante.
 * Accumule les notifications en mémoire, les déduplique, les envoie par batchs
 * et limite le débit pour ne pas ralentir l'enregistrement des courriers.
 */

import { laravelApiService } from './laravelApiService';
import { simpleNotificationService } from './simpleNotificationService';

export interface QueuedNotification {
  userId: string;
  type: 'assignation' | 'rappel' | 'echeance' | 'workflow' | 'courrier' | 'system';
  title: string;
  message: string;
  relatedId?: string;
  relatedType?: 'assignation' | 'courrier' | 'workflow' | 'rappel';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface QueuedAssignation {
  courrierId: string;
  assigneA: string;
  assignePar?: string;
  dateEcheance?: Date;
  instructions?: string;
  statut?: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE';
}

class NotificationQueueService {
  private notificationQueue: QueuedNotification[] = [];
  private assignationQueue: QueuedAssignation[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Notifications locales dont l'écriture a été différée (ex: création en masse de courriers)
  private deferredLocalNotifications: QueuedNotification[] = [];

  private readonly BATCH_SIZE = 5;
  private readonly FLUSH_DELAY_MS = 500;
  private readonly MAX_NOTIFICATIONS_PER_EVENT = 15;
  private readonly MAX_ASSIGNATIONS_PER_EVENT = 10;
  private readonly REQUEST_TIMEOUT_MS = 6000;

  /**
   * Ajouter une notification à la file. Déclenche un flush différé.
   * La notification est aussi créée immédiatement en local (léger).
   */
  enqueueNotification(notification: QueuedNotification): void {
    this.enqueueNotifications([notification]);
  }

  /**
   * Ajouter plusieurs notifications en une seule fois, avec déduplication et limite.
   * Par défaut, les notifications locales sont écrites immédiatement en un seul batch.
   * Option `deferLocal: true` retarde l'écriture locale jusqu'au flush pour ne pas ralentir
   * l'enregistrement en liste.
   */
  enqueueNotifications(notifications: QueuedNotification[], options?: { deferLocal?: boolean }): void {
    if (notifications.length === 0) return;

    if (!options?.deferLocal) {
      // Écriture locale groupée en une seule opération localStorage
      simpleNotificationService.createMany(
        notifications.map(n => ({
          userId: n.userId,
          type: n.type,
          title: n.title,
          message: n.message,
          relatedId: n.relatedId,
          relatedType: n.relatedType,
          priority: n.priority || 'normal',
          actionUrl: n.actionUrl,
          metadata: n.metadata,
        }))
      );
    }

    // Dédoublonnage par (userId, relatedId, type)
    const seen = new Map<string, QueuedNotification>();
    const keyOf = (n: QueuedNotification): string =>
      `${n.userId}:${n.relatedId ?? 'none'}:${n.type}`;

    [...this.notificationQueue, ...notifications].forEach(n => {
      const key = keyOf(n);
      if (!seen.has(key)) seen.set(key, n);
    });

    const deduplicated = Array.from(seen.values());
    this.notificationQueue = deduplicated.slice(-this.MAX_NOTIFICATIONS_PER_EVENT);

    if (options?.deferLocal) {
      this.deferredLocalNotifications.push(...deduplicated.slice(-this.MAX_NOTIFICATIONS_PER_EVENT));
    }

    console.log(`[NotificationQueue] Batch enqueued: ${notifications.length} notifications, queue size after dedup: ${this.notificationQueue.length}`);
    this.scheduleFlush();
  }

  /**
   * Ajouter une assignation à la file.
   */
  enqueueAssignation(assignation: QueuedAssignation): void {
    this.assignationQueue.push(assignation);
    this.scheduleFlush();
  }

  /**
   * Ajouter plusieurs assignations, avec limite.
   */
  enqueueAssignations(assignations: QueuedAssignation[]): void {
    if (assignations.length === 0) return;
    this.assignationQueue.push(...assignations.slice(0, this.MAX_ASSIGNATIONS_PER_EVENT));
    this.scheduleFlush();
  }

  /**
   * Créer une notification en local immédiatement (pas d'appel API).
   */
  private createLocalNotification(notification: QueuedNotification): void {
    try {
      simpleNotificationService.create({
        ...notification,
        priority: notification.priority || 'normal',
      });
    } catch {
      // Ignorer les erreurs de stockage local
    }
  }

  /**
   * Programmer un flush différé. S'il y a déjà un timer, on le réinitialise
   * pour regrouper les notifications proches dans un même batch.
   */
  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.FLUSH_DELAY_MS);
  }

  /**
   * Vider immédiatement les files en cours.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Créer en une seule opération les notifications locales différées
    if (this.deferredLocalNotifications.length > 0) {
      const deferred = this.deferredLocalNotifications.splice(0);
      simpleNotificationService.createMany(
        deferred.map(n => ({
          userId: n.userId,
          type: n.type,
          title: n.title,
          message: n.message,
          relatedId: n.relatedId,
          relatedType: n.relatedType,
          priority: n.priority || 'normal',
          actionUrl: n.actionUrl,
          metadata: n.metadata,
        }))
      );
    }

    console.log(`[NotificationQueue] Flushing: ${this.notificationQueue.length} notifications, ${this.assignationQueue.length} assignations`);
    await Promise.allSettled([
      this.flushNotifications(),
      this.flushAssignations(),
    ]);
    console.log('[NotificationQueue] Flush completed');
  }

  /**
   * Envoyer les notifications par batchs de BATCH_SIZE, avec timeout.
   */
  private async flushNotifications(): Promise<void> {
    while (this.notificationQueue.length > 0) {
      const batch = this.notificationQueue.splice(0, this.BATCH_SIZE);
      console.log(`[NotificationQueue] Sending batch of ${batch.length} notifications to API`);
      await Promise.allSettled(
        batch.map(n =>
          Promise.race([
            laravelApiService.createNotification(n),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout notification')), this.REQUEST_TIMEOUT_MS)
            ),
          ]).then(() => {
            console.log(`[NotificationQueue] Notification API OK for user ${n.userId}`);
          }).catch(e => {
            console.warn('⚠️ Notification API échouée (non bloquant):', e);
          })
        )
      );
    }
  }

  /**
   * Envoyer les assignations par batchs. Les assignations sont plus lourdes,
   * donc on les envoie aussi par petits groupes. On utilise directement l'API
   * Laravel pour éviter les cycles d'import avec le service courrier.
   */
  private async flushAssignations(): Promise<void> {
    const { laravelApiService } = await import('./laravelApiService');

    while (this.assignationQueue.length > 0) {
      const batch = this.assignationQueue.splice(0, this.BATCH_SIZE);
      await Promise.allSettled(
        batch.map(a =>
          Promise.race([
            laravelApiService.createAssignation(a),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout assignation')), this.REQUEST_TIMEOUT_MS)
            ),
          ]).catch(e => {
            console.warn('⚠️ Assignation automatique échouée (non bloquant):', e);
          })
        )
      );
    }
  }
}

export const notificationQueueService = new NotificationQueueService();
