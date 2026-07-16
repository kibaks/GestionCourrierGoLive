/**
 * Service de courriers — Redux + API Laravel (MySQL) uniquement.
 * L'insertion, la mise à jour et la suppression des courriers passent par l'API Laravel, pas par Firestore.
 */

import { store } from '../store/store';
import {
  fetchCourriers,
  createCourrier,
  createCourriersBulk,
  updateCourrier,
  deleteCourrier,
} from '../store/slices/courriersSlice';
import { Courrier, StatutCourrier, TypeCourrier, Assignation, Rappel, WorkflowEtape, Annotation, Role, WorkflowActivity, WorkflowResponse, WorkflowDecision, Utilisateur, SensCourrier } from '../types';
import { adminService } from './adminService';
import { notificationService } from './notificationService';
import { notificationQueueService, QueuedNotification, QueuedAssignation } from './notificationQueueService';
import { laravelApiService } from './laravelApiService';
import { realTimeTaskSyncService } from './realTimeTaskSyncService';
import { globalLoading } from '../context/GlobalLoadingContext';

/** Toutes les opérations de données passent par l’API Laravel (MySQL). Firestore n’est plus utilisé. */

class CourrierServiceFirebase {
  /**
   * Récupérer tous les courriers (depuis Redux)
   */
  getAllCourriers(): Courrier[] {
    const state = store.getState();
    return state.courriers.items;
  }

  /**
   * Récupérer les courriers accessibles pour un utilisateur.
   * Si userFallback est fourni et que getUserById(userId) retourne null, on utilise userFallback
   * pour le rôle/direction/service — évite une liste vide quand adminService n'a pas encore l'user.
   */
  async getAccessibleCourriers(userId: string, userFallback?: Pick<Utilisateur, 'id' | 'role' | 'direction' | 'service'>): Promise<Courrier[]> {
    // Récupérer l'utilisateur
    const user = userFallback || adminService.getUserById(userId);
    
    // Lire les courriers depuis le store (le caller a déjà effectué le fetch)
    let allCourriers = store.getState().courriers.items;

    // Fallback : si le store est vraiment vide, tenter un fetch unique
    if (allCourriers.length === 0) {
      try {
        await store.dispatch(fetchCourriers());
        allCourriers = store.getState().courriers.items;
      } catch (error) {
        console.error('❌ Erreur de chargement:', error);
        return [];
      }
    }
    
    // Si pas d'utilisateur identifiable, refuser l'accès par sécurité
    if (!user) {
      console.warn('⚠️ Utilisateur introuvable (userId:', userId, '), accès refusé');
      return [];
    }
    
    // SUPER_ADMIN et DIRECTEUR_GENERAL voient tous les courriers
    if (user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL) {
      console.log('👑 Super admin / DG, accès total à tous les courriers');
      return allCourriers;
    }
    
    // SECRETAIRE sans direction = niveau Direction Générale → voit tous les courriers
    if (user.role === Role.SECRETAIRE && !user.direction) {
      console.log('🏛️ Secrétaire DG (sans direction assignée), accès total');
      return allCourriers;
    }

    // Normalisation pour comparaison insensible à la casse et aux espaces
    const normDir = (d?: string) => (d || '').trim().toLowerCase();

    // ── SECRETAIRE DG (Direction Générale) → voit tous les courriers ──
    const isSecretaireDG = user.role === Role.SECRETAIRE && (
      !user.direction ||
      user.direction === 'Direction Générale' ||
      user.direction === 'Direction Generale' ||
      normDir(user.direction).includes('général') ||
      normDir(user.direction).includes('general')
    );

    if (isSecretaireDG) {
      console.log('🏛️ Secrétaire DG (Direction Générale), accès total');
      return allCourriers;
    }

    // ── SECRETAIRE de Direction X : courriers de la direction + workflow routé vers la direction ──
    if (user.role === Role.SECRETAIRE && user.direction) {
      console.log('🔒 Secrétaire Dir - filtrage pour direction:', user.direction);
      try {
        // 1 seul appel batch au lieu de N appels parallèles
        const [workflowIdsArr, dirAssignations] = await Promise.all([
          laravelApiService.getCourrierIdsByWorkflowDirection(user.direction).catch(() => [] as string[]),
          this.loadAssignationsByDirection(user.direction),
        ]);
        const visibleIds = new Set([...workflowIdsArr, ...dirAssignations.map(a => a.courrierId)]);

        const dirName = normDir(user.direction);
        const result = allCourriers.filter(c =>
          normDir(c.direction) === dirName ||
          normDir(c.destinataire) === dirName ||
          normDir(c.expediteur) === dirName ||
          visibleIds.has(c.id)
        );
        console.log(`📊 Secrétaire Dir: ${result.length} courriers visibles sur ${allCourriers.length}`);
        return result;
      } catch (err) {
        console.warn('❌ Erreur filtrage Secrétaire Dir:', err);
        return allCourriers.filter(c => normDir(c.direction) === normDir(user.direction));
      }
    }

    // ── DIRECTEUR de Direction X : même périmètre que le secrétaire de sa direction ──
    if (user.role === Role.DIRECTEUR) {
      if (!user.direction) return [];
      console.log('👨‍💼 Filtrage DIRECTEUR pour direction:', user.direction);
      try {
        const [workflowIdsArr, dirAssignations] = await Promise.all([
          laravelApiService.getCourrierIdsByWorkflowDirection(user.direction).catch(() => [] as string[]),
          this.loadAssignationsByDirection(user.direction),
        ]);
        const visibleIds = new Set([...workflowIdsArr, ...dirAssignations.map(a => a.courrierId)]);

        const dirName = normDir(user.direction);
        const result = allCourriers.filter(c =>
          normDir(c.direction) === dirName ||
          normDir(c.destinataire) === dirName ||
          normDir(c.expediteur) === dirName ||
          visibleIds.has(c.id)
        );
        console.log(`📊 Directeur: ${result.length} courriers visibles sur ${allCourriers.length}`);
        return result;
      } catch (err) {
        console.warn('❌ Erreur filtrage Directeur:', err);
        return allCourriers.filter(c => normDir(c.direction) === normDir(user.direction));
      }
    }

    // ── CHEF_SERVICE : courriers où une étape workflow est assignée à son service ──
    if (user.role === Role.CHEF_SERVICE) {
      if (!user.direction) return [];
      console.log('👔 Filtrage CHEF_SERVICE:', user.direction, '/', user.service);
      try {
        // 1 appel avec direction + service optionnel
        const [workflowIdsArr, myAssignations] = await Promise.all([
          laravelApiService.getCourrierIdsByWorkflowDirection(user.direction, user.service).catch(() => [] as string[]),
          this.loadAssignationsByUser(userId),
        ]);
        const visibleIds = new Set([...workflowIdsArr, ...myAssignations.map(a => a.courrierId)]);

        const result = allCourriers.filter(c => visibleIds.has(c.id));
        console.log(`📊 Chef Service: ${result.length} courriers visibles sur ${allCourriers.length}`);
        return result;
      } catch (err) {
        console.warn('❌ Erreur filtrage Chef Service:', err);
        return [];
      }
    }

    // ── AGENT : étapes workflow assignées + annotations créées ──
    if (user.role === Role.AGENT) {
      console.log('👤 Filtrage AGENT pour userId:', userId);
      try {
        const [workflowIdsArr, annotationIdsArr, myAssignations] = await Promise.all([
          laravelApiService.getCourrierIdsByWorkflowAssignee(userId).catch(() => [] as string[]),
          laravelApiService.getCourrierIdsByAnnotationAuteur(userId).catch(() => [] as string[]),
          this.loadAssignationsByUser(userId).catch(() => [] as Assignation[]),
        ]);
        const visibleIds = new Set([
          ...workflowIdsArr,
          ...annotationIdsArr,
          ...myAssignations.map(a => a.courrierId),
        ]);
        const result = allCourriers.filter(c => visibleIds.has(c.id));
        console.log(`📊 Agent: ${result.length} courriers visibles (workflow:${workflowIdsArr.length}, annot:${annotationIdsArr.length}, assign:${myAssignations.length})`);
        return result;
      } catch (err) {
        console.warn('❌ Erreur filtrage Agent:', err);
        return [];
      }
    }

    // ── Fallback pour tout autre rôle non géré : assignations directes uniquement ──
    console.log('⚠️ Rôle non géré explicitement:', user.role, '— assignations directes uniquement');
    try {
      const myAssignations = await this.loadAssignationsByUser(userId);
      const workflowIdsArr = await laravelApiService.getCourrierIdsByWorkflowAssignee(userId).catch(() => [] as string[]);
      const visibleIds = new Set([...myAssignations.map(a => a.courrierId), ...workflowIdsArr]);
      return allCourriers.filter(c => visibleIds.has(c.id));
    } catch {
      return [];
    }
  }

  /**
   * Construit les notifications et assignations pour un courrier donné.
   * Mutate les tableaux passés en paramètre pour éviter la création de tableaux
   * intermédiaires lors du traitement par lot.
   */
  private appendNotificationsAndAssignationsForCourrier(
    newCourrier: Courrier,
    allUsers: Utilisateur[],
    notifications: QueuedNotification[],
    assignations: QueuedAssignation[]
  ): void {
    const sens = newCourrier.sens || SensCourrier.ENTRANT;

    // 1. Admins et DG
    const adminsAndDG = allUsers.filter(u => u.role === Role.SUPER_ADMIN || u.role === Role.DIRECTEUR_GENERAL);
    adminsAndDG.forEach(admin => {
      notifications.push({
        userId: admin.id,
        type: 'courrier',
        title: 'Nouveau courrier enregistré',
        message: `Un nouveau courrier a été enregistré: ${newCourrier.numero} - ${newCourrier.objet}`,
        relatedId: newCourrier.id,
        relatedType: 'courrier',
        priority: 'normal',
        actionUrl: `/courriers/${newCourrier.id}`,
        metadata: {
          courrierId: newCourrier.id,
          courrierNumero: newCourrier.numero,
          courrierObjet: newCourrier.objet,
          type: newCourrier.type,
          expediteur: newCourrier.expediteur,
        },
      });
    });

    if (newCourrier.type === TypeCourrier.INTERNE) {
      const direction = (newCourrier.direction || '').trim().toLowerCase();
      const service = (newCourrier.service || '').trim().toLowerCase();
      const destinataire = (newCourrier.destinataire || '').trim().toLowerCase();

      // 2. Courrier sortant interne : secrétaires de l'organisation
      if (sens === SensCourrier.SORTANT) {
        const secretaires = allUsers.filter(u => {
          if (!u.actif || u.role !== Role.SECRETAIRE) return false;
          const uDir = (u.direction || '').trim().toLowerCase();
          const uSrv = (u.service || '').trim().toLowerCase();
          return (direction && (uDir === direction || uDir.includes(direction) || direction.includes(uDir)))
            || (service && (uSrv === service || uSrv.includes(service) || service.includes(uSrv)))
            || (destinataire && uDir && (uDir === destinataire || uDir.includes(destinataire) || destinataire.includes(uDir)));
        });
        secretaires.forEach(sec => {
          notifications.push({
            userId: sec.id,
            type: 'courrier',
            title: 'Nouveau courrier sortant interne',
            message: `Un courrier sortant interne de votre organisation a été enregistré: ${newCourrier.numero} - ${newCourrier.objet}`,
            relatedId: newCourrier.id,
            relatedType: 'courrier',
            priority: 'high',
            actionUrl: `/courriers/${newCourrier.id}`,
            metadata: {
              courrierId: newCourrier.id,
              courrierNumero: newCourrier.numero,
              courrierObjet: newCourrier.objet,
              type: newCourrier.type,
              sens,
              direction: newCourrier.direction,
              service: newCourrier.service,
            },
          });
        });
      }

      // 3. Destinataires (secrétaires/directeurs/DG) — max 10
      if (destinataire) {
        allUsers
          .filter(u => {
            if (!u.actif || u.id === newCourrier.enregistrePar) return false;
            if (u.role !== Role.SECRETAIRE && u.role !== Role.DIRECTEUR && u.role !== Role.DIRECTEUR_GENERAL) return false;
            const uDir = (u.direction || '').trim().toLowerCase();
            const uSrv = (u.service || '').trim().toLowerCase();
            return (uDir && (uDir === destinataire || uDir.includes(destinataire) || destinataire.includes(uDir)))
              || (uSrv && (uSrv === destinataire || uSrv.includes(destinataire) || destinataire.includes(uSrv)));
          })
          .slice(0, 10)
          .forEach(dest => {
            notifications.push({
              userId: dest.id,
              type: 'courrier',
              title: 'Nouveau courrier reçu',
              message: `Un courrier vous a été adressé : ${newCourrier.numero} - ${newCourrier.objet}`,
              relatedId: newCourrier.id,
              relatedType: 'courrier',
              priority: 'high',
              actionUrl: `/courriers/${newCourrier.id}`,
              metadata: {
                courrierId: newCourrier.id,
                courrierNumero: newCourrier.numero,
                courrierObjet: newCourrier.objet,
                type: newCourrier.type,
                expediteur: newCourrier.expediteur,
                destinataire: newCourrier.destinataire,
                notificationType: 'courrier_recu',
              },
            });
          });

        // 4. Secrétaires DG (communication interne)
        const isDgDirection = (dir: string) => {
          const d = dir.trim().toLowerCase();
          return !!d && (d === 'dg' || (d.includes('direction') && (d.includes('génér') || d.includes('gener'))));
        };
        allUsers
          .filter(u => {
            if (!u.actif || u.role !== Role.SECRETAIRE || u.id === newCourrier.enregistrePar) return false;
            const uDir = (u.direction || '').trim().toLowerCase();
            if (!isDgDirection(uDir)) return false;
            const dejaDestinataire = destinataire &&
              (uDir === destinataire || uDir.includes(destinataire) || destinataire.includes(uDir));
            return !dejaDestinataire;
          })
          .slice(0, 10)
          .forEach(sec => {
            notifications.push({
              userId: sec.id,
              type: 'courrier',
              title: 'Nouvelle communication interne',
              message: `Communication interne enregistrée : ${newCourrier.numero} - ${newCourrier.objet} (${newCourrier.expediteur} → ${newCourrier.destinataire})`,
              relatedId: newCourrier.id,
              relatedType: 'courrier',
              priority: 'normal',
              actionUrl: `/courriers/${newCourrier.id}`,
              metadata: {
                courrierId: newCourrier.id,
                courrierNumero: newCourrier.numero,
                courrierObjet: newCourrier.objet,
                type: newCourrier.type,
                expediteur: newCourrier.expediteur,
                destinataire: newCourrier.destinataire,
                notificationType: 'communication_interne_dg',
              },
            });
          });
      }

      // 5. Assignations automatiques pour courriers sortants internes
      if (sens === SensCourrier.SORTANT) {
        const secretaires = allUsers.filter(u => {
          if (!u.actif || u.role !== Role.SECRETAIRE) return false;
          const uDir = (u.direction || '').trim().toLowerCase();
          const uSrv = (u.service || '').trim().toLowerCase();
          return (direction && (uDir === direction || uDir.includes(direction) || direction.includes(uDir)))
            || (service && (uSrv === service || uSrv.includes(service) || service.includes(uSrv)))
            || (destinataire && uDir && (uDir === destinataire || uDir.includes(destinataire) || destinataire.includes(uDir)));
        });

        if (secretaires.length > 0) {
          let daysToAdd = 3;
          switch (newCourrier.priorite) {
            case 'URGENTE': daysToAdd = 1; break;
            case 'HAUTE': daysToAdd = 2; break;
            case 'NORMALE': daysToAdd = 3; break;
            case 'BASSE':
            default: daysToAdd = 5; break;
          }
          const dateEcheance = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
          const assignePar = newCourrier.enregistrePar || adminsAndDG[0]?.id || secretaires[0].id;
          secretaires.forEach(sec => {
            assignations.push({
              courrierId: newCourrier.id,
              assigneA: sec.id,
              assignePar,
              dateEcheance,
              instructions: 'Orientation automatique du courrier sortant interne vers votre secrétariat.',
              statut: 'EN_ATTENTE',
            });
          });
        }
      }
    }

    // Notification pour l'utilisateur qui a créé le courrier
    if (newCourrier.enregistrePar) {
      notifications.push({
        userId: newCourrier.enregistrePar,
        type: 'courrier',
        title: 'Courrier créé',
        message: `#${newCourrier.numero} a été créé.`,
        relatedId: newCourrier.id,
        relatedType: 'courrier',
        priority: 'normal',
        actionUrl: `/courriers/${newCourrier.id}`,
      });
    }
  }

  /**
   * Construit les notifications et assignations pour plusieurs courriers.
   * Les résultats sont regroupés pour un envoi unique à la queue (bulk).
   */
  private buildNotificationsAndAssignations(courriers: Courrier[]): { notifications: QueuedNotification[]; assignations: QueuedAssignation[] } {
    const allUsers = adminService.getAllUsers();
    const notifications: QueuedNotification[] = [];
    const assignations: QueuedAssignation[] = [];
    courriers.forEach(c => this.appendNotificationsAndAssignationsForCourrier(c, allUsers, notifications, assignations));
    return { notifications, assignations };
  }

  /**
   * Créer un nouveau courrier. Insertion uniquement via l'API Laravel (MySQL), pas Firestore.
   */
  async createCourrier(courrier: Omit<Courrier, 'id' | 'numero' | 'dateEnregistrement' | 'statut' | 'createdAt' | 'updatedAt'> & { numero?: string }): Promise<Courrier> {
    const courrierWithDefaults = {
      ...courrier,
      numero: courrier.numero ?? '', // Si fourni (ex. courrier interne), conservé ; sinon généré côté API
      statut: StatutCourrier.ENREGISTRE
    };
    const result = await store.dispatch(createCourrier(courrierWithDefaults));
    if (createCourrier.fulfilled.match(result)) {
      const newCourrier = result.payload;

      // ── Notifications & rappels automatiques — traités en arrière-plan via queue ──
      try {
        const { notifications, assignations } = this.buildNotificationsAndAssignations([newCourrier]);
        notificationQueueService.enqueueNotifications(notifications);
        notificationQueueService.enqueueAssignations(assignations);
      } catch (notifError) {
        console.warn('⚠️ Erreur lors de la préparation des notifications (non-bloquant):', notifError);
      }

      return newCourrier;
    }
    // Propager le message d'erreur réel de l'API (ex. 500 Laravel, doublon numéro, colonne manquante)
    const msg = (result as { error?: { message?: string } }).error?.message ?? 'Erreur lors de la création du courrier';
    throw new Error(msg);
  }

  /**
   * Créer plusieurs courriers en lot via l'API Laravel bulk.
   * Cette méthode est optimisée pour l'enregistrement en liste : une seule requête API,
   * puis génération et envoi groupés des notifications en arrière-plan.
   */
  async createCourriersBulk(
    courriers: Array<Omit<Courrier, 'id' | 'numero' | 'dateEnregistrement' | 'statut' | 'createdAt' | 'updatedAt'> & { numero?: string }>
  ): Promise<Courrier[]> {
    if (courriers.length === 0) return [];

    const result = await store.dispatch(createCourriersBulk(courriers));
    if (createCourriersBulk.fulfilled.match(result)) {
      const newCourriers = result.payload;

      // ── Notifications & rappels automatiques — traités en arrière-plan via queue ──
      // On diffère légèrement la construction pour ne pas bloquer le rendu juste après la sauvegarde.
      const buildAndEnqueue = () => {
        try {
          const { notifications, assignations } = this.buildNotificationsAndAssignations(newCourriers);
          notificationQueueService.enqueueNotifications(notifications, { deferLocal: true });
          notificationQueueService.enqueueAssignations(assignations);
        } catch (notifError) {
          console.warn('⚠️ Erreur lors de la préparation des notifications en lot (non-bloquant):', notifError);
        }
      };

      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(buildAndEnqueue, { timeout: 500 });
      } else {
        setTimeout(buildAndEnqueue, 0);
      }

      return newCourriers;
    }
    const msg = (result as { error?: { message?: string } }).error?.message ?? 'Erreur lors de la création en lot des courriers';
    throw new Error(msg);
  }

  /**
   * Mettre à jour un courrier
   */
  async updateCourrier(id: string, updates: Partial<Courrier>): Promise<void> {
    // Récupérer le courrier avant la mise à jour pour détecter les changements
    const oldCourrier = this.getCourrierById(id);
    
    await store.dispatch(updateCourrier({ id, updates }));
    
    // Détecter les changements de statut et créer des notifications
    if (updates.statut && oldCourrier && oldCourrier.statut !== updates.statut) {
      try {
        const updatedCourrier = this.getCourrierById(id);
        if (!updatedCourrier) return;
        
        // Notification pour le changement de statut
        if (updates.statut === StatutCourrier.EN_TRAITEMENT) {
          // Notifier les administrateurs et DG que le traitement a commencé
          const allUsers = adminService.getAllUsers();
          const adminsAndDG = allUsers.filter(u => 
            u.role === Role.SUPER_ADMIN || u.role === Role.DIRECTEUR_GENERAL
          );
          
          const notificationPromises = adminsAndDG.map(admin =>
            notificationService.createNotification({
              userId: admin.id,
              type: 'courrier',
              title: 'Traitement démarré',
              message: `Le traitement du courrier ${updatedCourrier.numero} - ${updatedCourrier.objet} a commencé`,
              relatedId: updatedCourrier.id,
              relatedType: 'courrier',
              priority: 'normal',
              actionUrl: `/courriers/${updatedCourrier.id}`,
              metadata: {
                courrierId: updatedCourrier.id,
                courrierNumero: updatedCourrier.numero,
                courrierObjet: updatedCourrier.objet,
                ancienStatut: oldCourrier.statut,
                nouveauStatut: updates.statut,
              },
            })
          );
          
          await Promise.all(notificationPromises);
        } else if (updates.statut === StatutCourrier.TRAITE) {
          // Notifier les administrateurs, DG et les personnes assignées que le courrier est traité
          const allUsers = adminService.getAllUsers();
          const adminsAndDG = allUsers.filter(u => 
            u.role === Role.SUPER_ADMIN || u.role === Role.DIRECTEUR_GENERAL
          );
          
          // Récupérer les assignations pour notifier les personnes assignées
          const allAssignations = await this.getAllAssignations();
          const assignations = allAssignations.filter(a => a.courrierId === id);
          const assignees = assignations.map(a => a.assigneA);
          
          // Combiner les admins/DG et les assignés (sans doublons)
          const userIdsToNotify = new Set([
            ...adminsAndDG.map(u => u.id),
            ...assignees
          ]);
          
          const notificationPromises = Array.from(userIdsToNotify).map(userId =>
            notificationService.createNotification({
              userId,
              type: 'courrier',
              title: 'Courrier traité',
              message: `Le courrier ${updatedCourrier.numero} - ${updatedCourrier.objet} a été traité avec succès`,
              relatedId: updatedCourrier.id,
              relatedType: 'courrier',
              priority: 'normal',
              actionUrl: `/courriers/${updatedCourrier.id}`,
              metadata: {
                courrierId: updatedCourrier.id,
                courrierNumero: updatedCourrier.numero,
                courrierObjet: updatedCourrier.objet,
                ancienStatut: oldCourrier.statut,
                nouveauStatut: updates.statut,
              },
            })
          );
          
          await Promise.all(notificationPromises);
        }
      } catch (notifError) {
        console.error('❌ Erreur lors de la création des notifications de statut:', notifError);
      }
    }
  }

  /**
   * Supprimer un courrier
   */
  async deleteCourrier(id: string): Promise<void> {
    await store.dispatch(deleteCourrier(id));
  }

  /**
   * Supprimer TOUS les courriers (API Laravel + vide le store Redux)
   */
  async deleteAllCourriers(): Promise<{ deleted: number; errors: number }> {
    const result = await laravelApiService.deleteAllCourriers();
    const { setCourriers } = await import('../store/slices/courriersSlice');
    store.dispatch(setCourriers([]));
    return result;
  }

  /**
   * Récupérer un courrier par ID
   */
  getCourrierById(id: string): Courrier | undefined {
    const state = store.getState();
    return state.courriers.items.find(c => c.id === id);
  }

  /**
   * Charger les courriers depuis l'API Laravel (MySQL).
   */
  async loadCourriers(userId?: string): Promise<void> {
    await globalLoading.withLoading(async () => {
    await store.dispatch(fetchCourriers(userId));
    });
  }

  /**
   * Récupérer les assignations d'un utilisateur (version synchrone avec cache)
   */
  getAssignationsByUser(userId: string): Assignation[] {
    // Pour compatibilité avec le code existant qui appelle cette méthode de manière synchrone
    // On retourne un tableau vide et on charge en arrière-plan
    // Les composants devront être mis à jour pour utiliser la version async
    this.loadAssignationsByUser(userId).catch(err => 
      console.error('Erreur lors du chargement des assignations:', err)
    );
    return [];
  }

  /**
   * Charger les assignations d'un utilisateur. Priorité API Laravel (MySQL).
   */
  async loadAssignationsByUser(userId: string): Promise<Assignation[]> {
    if (laravelApiService.isConfigured()) {
      try {
        const list = await laravelApiService.getAssignations(userId);
        return list.map((a) => ({ ...a, dateAssignation: a.dateAssignation instanceof Date ? a.dateAssignation : new Date(a.dateAssignation as unknown as string) }));
      } catch (e) {
        console.warn('loadAssignationsByUser Laravel échoué:', e);
        return [];
      }
    }
    return [];
  }

  /**
   * Charger toutes les assignations d'une direction (optimisé pour les secrétaires)
   */
  async loadAssignationsByDirection(direction: string): Promise<Assignation[]> {
    if (laravelApiService.isConfigured()) {
      try {
        console.log(`📋 [Direction] Chargement des assignations pour la direction: ${direction}`);
        const list = await laravelApiService.getAssignationsByDirection(direction);
        const assignations = list.map((a) => ({ ...a, dateAssignation: a.dateAssignation instanceof Date ? a.dateAssignation : new Date(a.dateAssignation as unknown as string) }));
        console.log(`✅ [Direction] ${assignations.length} assignations chargées pour ${direction}`);
        return assignations;
      } catch (e) {
        console.warn('loadAssignationsByDirection Laravel échoué:', e);
        return [];
      }
    }
    
    // Fallback: charger tous les utilisateurs de la direction et faire les requêtes individuellement
    console.log(`⚠️ [Direction] API non configurée, fallback vers méthode individuelle pour ${direction}`);
    const allUsers = adminService.getAllUsers();
    const usersInDirection = allUsers.filter(u => u.direction === direction);
    
    const allAssignations: Assignation[] = [];
    for (const user of usersInDirection) {
      try {
        const userAssignations = await this.loadAssignationsByUser(user.id);
        allAssignations.push(...userAssignations);
      } catch (error) {
        console.warn(`⚠️ Erreur assignations pour ${user.nom}:`, error);
      }
    }
    
    return allAssignations;
  }

  /**
   * Vérifier les échéances et créer des notifications automatiques
   */
  async checkEcheancesAndNotify(): Promise<void> {
    try {
      const assignations = await this.getAllAssignations();
      const now = new Date();
      
      for (const assignation of assignations) {
        if (!assignation.dateEcheance || assignation.statut === 'TERMINE') {
          continue;
        }

        const dateEcheance = new Date(assignation.dateEcheance);
        const diff = dateEcheance.getTime() - now.getTime();
        const joursRestants = diff / (1000 * 60 * 60 * 24);
        
        // Notifier si l'échéance est dans les 3 prochains jours ou dépassée
        if (joursRestants <= 3) {
          const courrier = this.getCourrierById(assignation.courrierId);
          if (courrier) {
            const isDepassee = joursRestants < 0;
            try {
              // Dédup : vérifier si une notif écheance existe déjà aujourd'hui pour cette assignation
              const { simpleNotificationService } = await import('./simpleNotificationService');
              const existing = simpleNotificationService.getByUserId(assignation.assigneA)
                .find(n =>
                  n.type === 'echeance' &&
                  n.relatedId === assignation.courrierId &&
                  (Date.now() - new Date(n.createdAt).getTime()) < 24 * 60 * 60 * 1000
                );
              if (existing) continue;

              const { NotificationHelper } = await import('./notificationHelper');
              NotificationHelper.createEcheance({
                userId: assignation.assigneA,
                courrierId: assignation.courrierId,
                courrierNumero: courrier.numero,
                dateEcheance: dateEcheance,
                priority: isDepassee ? 'urgent' : 'high'
              });
            } catch (notifError) {
              console.error('Erreur notification échéance:', notifError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des échéances:', error);
    }
  }

  /**
   * Récupérer les rappels à envoyer. Priorité API Laravel (MySQL).
   */
  async getRappelsAEnvoyerAsync(): Promise<Rappel[]> {
    if (laravelApiService.isConfigured()) {
      try {
        const list = await laravelApiService.getRappels();
        const now = new Date();
        return list
          .map((r) => ({ ...r, dateRappel: r.dateRappel instanceof Date ? r.dateRappel : new Date(r.dateRappel as unknown as string), createdAt: r.createdAt instanceof Date ? r.createdAt : new Date((r as unknown as Record<string, unknown>).createdAt as string) }))
          .filter((r) => !r.envoye && new Date(r.dateRappel).getTime() <= now.getTime() + 24 * 60 * 60 * 1000);
      } catch (e) {
        console.warn('getRappelsAEnvoyerAsync Laravel échoué:', e);
        return [];
      }
    }
    return [];
  }

  /**
   * Récupérer les rappels à envoyer (version synchrone depuis le cache)
   */
  getRappelsAEnvoyer(): Rappel[] {
    try {
      const cached = localStorage.getItem('rappels_a_envoyer');
      if (cached) {
        return JSON.parse(cached).map((r: any) => ({
          ...r,
          dateRappel: new Date(r.dateRappel),
          createdAt: new Date(r.createdAt),
        }));
      }
    } catch (error) {
      console.error('Erreur lors de la lecture du cache des rappels:', error);
    }
    return [];
  }

  /**
   * Récupérer les rappels depuis localStorage (version synchrone).
   */
  getRappels(): Rappel[] {
    try {
      const stored = localStorage.getItem('rappels');
      if (!stored) return [];
      return JSON.parse(stored).map((r: any) => ({
        ...r,
        dateRappel: new Date(r.dateRappel),
        createdAt: new Date(r.createdAt),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Récupérer les workflows d'un courrier (cache local / Redux). Pour les données à jour, utiliser getWorkflowsByCourrierAsync (API Laravel).
   */
  getWorkflowsByCourrier(courrierId: string): WorkflowEtape[] {
    // Version synchrone - retourner depuis le cache si disponible
    // Pour une vraie synchronisation, utiliser getWorkflowsByCourrierAsync
    const normalize = (w: any): WorkflowEtape => ({
      ...w,
      createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
      dateDebut: w.dateDebut ? new Date(w.dateDebut) : undefined,
      dateFin: w.dateFin ? new Date(w.dateFin) : undefined,
      declencheur: w.declencheur ? {
        ...w.declencheur,
        dateDeclenchement: w.declencheur.dateDeclenchement ? new Date(w.declencheur.dateDeclenchement) : undefined
      } : undefined,
      responses: (w.responses || []).map((r: any) => ({
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date()
      }))
    });
    try {
      const cacheKey = `workflows_${courrierId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const workflows = JSON.parse(cached).map(normalize);
        return workflows;
      }
      // Fallback : étapes stockées sur le courrier (Redux / chargement initial)
      const courrier = this.getCourrierById(courrierId);
      if (courrier?.workflow?.length) {
        return courrier.workflow.map(normalize);
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des workflows depuis le cache:', error);
    }
    return [];
  }

  /**
   * Récupérer les workflows d'un courrier. Priorité API Laravel (MySQL).
   */
  async getWorkflowsByCourrierAsync(courrierId: string): Promise<WorkflowEtape[]> {
    if (laravelApiService.isConfigured()) {
      try {
        const list = await laravelApiService.getWorkflowEtapesByCourrier(courrierId);
        const sorted = list.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
        // Mettre en cache local pour les stats synchrones (getWorkflowsByCourrier)
        try {
          const cacheKey = `workflows_${courrierId}`;
          localStorage.setItem(cacheKey, JSON.stringify(sorted));
        } catch {
          // Ignorer les erreurs de localStorage (quota, sandbox, etc.)
        }
        return sorted;
      } catch (e) {
        // Silencieux pour l'erreur 404 sur workflow-etapes (endpoint pas encore implémenté)
        if (e instanceof Error && e.message.includes('404')) {
          // Silencieux - l'endpoint workflow-etapes n'est pas encore prêt
        } else {
          console.warn('getWorkflowsByCourrierAsync Laravel échoué:', e);
        }
        return [];
      }
    }
    return [];
  }

  /**
   * Récupérer toutes les activités de workflow pour le planning
   */
  getWorkflowActivities(): WorkflowActivity[] {
    return [];
  }

  /**
   * Récupérer toutes les activités de workflow. Priorité API Laravel (MySQL).
   */
  async getWorkflowActivitiesAsync(): Promise<WorkflowActivity[]> {
    if (laravelApiService.isConfigured()) {
      try {
        const allCourriers = this.getAllCourriers();
        const activities: WorkflowActivity[] = [];
        for (const c of allCourriers) {
          const workflows = await laravelApiService.getWorkflowEtapesByCourrier(c.id);
          for (const w of workflows) {
            const dateDebutPrevue = w.dateDebut ?? w.createdAt ?? new Date();
            let dateFinPrevue: Date;
            if (w.dateFin) dateFinPrevue = w.dateFin instanceof Date ? w.dateFin : new Date(w.dateFin as unknown as string);
            else {
              dateFinPrevue = new Date(dateDebutPrevue);
              if (w.dureeEstimee) dateFinPrevue.setHours(dateFinPrevue.getHours() + w.dureeEstimee);
              else dateFinPrevue.setHours(dateFinPrevue.getHours() + 24);
            }
            activities.push({
              id: w.id,
              workflowEtapeId: w.id,
              courrierId: w.courrierId,
              courrierNumero: c.numero,
              courrierObjet: c.objet,
              etape: w.etape,
              assigneA: w.assigneA,
              dateDebutPrevue,
              dateFinPrevue,
              dateDebutReelle: w.dateDebut,
              dateFinReelle: w.dateFin,
              statut: w.statut,
              dureeEstimee: w.dureeEstimee,
              ordre: w.ordre,
            });
          }
        }
        return activities;
      } catch (e) {
        console.warn('getWorkflowActivitiesAsync Laravel échoué:', e);
        return [];
      }
    }
    return [];
  }

  /**
   * Récupérer les annotations d'un courrier. Priorité API Laravel (MySQL).
   */
  async getAnnotationsByCourrier(courrierId: string): Promise<Annotation[]> {
    if (laravelApiService.isConfigured()) {
      try {
        return await laravelApiService.getAnnotationsByCourrier(courrierId);
      } catch (e) {
        console.warn('getAnnotationsByCourrier Laravel échoué:', e);
        return [];
      }
    }
    return [];
  }

  /**
   * Récupérer les assignations d'un courrier. Priorité API Laravel (MySQL).
   */
  async getAssignationsByCourrier(courrierId: string): Promise<Assignation[]> {
    if (laravelApiService.isConfigured()) {
      try {
        const list = await laravelApiService.getAssignationsByCourrier(courrierId);
        return list.map((a) => ({ ...a, dateAssignation: a.dateAssignation instanceof Date ? a.dateAssignation : new Date(a.dateAssignation as unknown as string) }));
      } catch (e) {
        console.warn('getAssignationsByCourrier Laravel échoué:', e);
        return [];
      }
    }
    return [];
  }

  /**
   * Créer une annotation. Priorité API Laravel (MySQL).
   */
  async createAnnotation(data: {
    courrierId: string;
    auteur: string;
    contenu: string;
    type: 'MINUTE' | 'NOTE' | 'COMMENTAIRE';
    fichiers?: string[];
    workflowEtapeId?: string;
  }): Promise<Annotation> {
    if (laravelApiService.isConfigured()) {
      try {
        const created = await laravelApiService.createAnnotation({ courrierId: data.courrierId, auteur: data.auteur, contenu: data.contenu, type: data.type, workflowEtapeId: data.workflowEtapeId, fichiers: data.fichiers });
        const recipients = new Set<string>();
        const courrier = this.getCourrierById(data.courrierId);
        if (courrier?.enregistrePar) recipients.add(courrier.enregistrePar);
        try {
          const assignations = await this.getAssignationsByCourrier(data.courrierId);
          assignations.forEach((a) => a.assigneA && recipients.add(a.assigneA));
        } catch {}
        recipients.delete(data.auteur);
        const message = courrier?.numero ? `Annotation ${data.type.toLowerCase()} sur le courrier ${courrier.numero}` : `Annotation ${data.type.toLowerCase()} ajoutée`;
        
        // Créer des notifications pour tous les destinataires
        recipients.forEach((userId) => {
          notificationService.createNotification({ userId, type: 'courrier', title: 'Nouvelle annotation', message, relatedId: data.courrierId, relatedType: 'courrier', priority: 'normal' }).catch(() => {});
        });
        
        // Créer un rappel pour les annotations importantes (MINUTE et NOTE)
        if (data.type === 'MINUTE' || data.type === 'NOTE') {
          const rappelMessage = courrier?.numero 
            ? `Rappel: Annotation ${data.type.toLowerCase()} importante sur le courrier ${courrier.numero}`
            : `Rappel: Annotation ${data.type.toLowerCase()} importante ajoutée`;
          
          // Créer un rappel pour le lendemain à 9h
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          
          recipients.forEach((userId) => {
            // Utiliser laravelApiService pour créer le rappel
            laravelApiService.createRappel({
              assignationId: '', // Pas d'assignation spécifique pour les rappels d'annotations
              courrierId: data.courrierId,
              dateRappel: tomorrow,
              message: rappelMessage
            }).catch(() => {});
          });
          
          console.log('📅 Rappel créé pour annotation', data.type, 'à', tomorrow.toLocaleDateString());
        }
        
        // ── Règle métier : DG/Directeur annote un courrier en attente ou orienté ──────────────────
        // 1. Passer le courrier à EN_TRAITEMENT
        // 2. Terminer l'étape workflow "Attente DG" si elle existe
        const auteurUser = adminService.getUserById(data.auteur);
        const statutsOrientation = [StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ORIENTE_DG, StatutCourrier.ORIENTE_DIRECTEUR];
        if (
          (auteurUser?.role === Role.DIRECTEUR_GENERAL || auteurUser?.role === Role.DIRECTEUR) &&
          courrier?.statut &&
          statutsOrientation.includes(courrier.statut)
        ) {
          try {
            await store.dispatch(updateCourrier({ id: data.courrierId, updates: { statut: StatutCourrier.EN_TRAITEMENT } }));
            console.log(`✅ ${courrier.statut} → EN_TRAITEMENT (annotation par ${auteurUser?.role})`);
          } catch (e) { console.warn(`${courrier.statut} → EN_TRAITEMENT échoué:`, e); }

          // Terminer l'étape workflow "Attente DG" / "En attente DG"
          try {
            const etapes = await laravelApiService.getWorkflowEtapesByCourrier(data.courrierId);
            const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const attenteDG = etapes.find(w =>
              w.statut !== 'TERMINE' &&
              normalize(w.etape || '').includes('attente') &&
              (normalize(w.etape || '').includes('dg') || normalize(w.etape || '').includes('directeur general') || normalize(w.etape || '').includes('directeur général'))
            );
            if (attenteDG) {
              await laravelApiService.updateWorkflowEtape(attenteDG.id, {
                statut: 'TERMINE',
                dateFin: new Date(),
              });
            }
          } catch (e) { console.warn('Terminaison étape Attente DG échouée:', e); }
        }
        // ────────────────────────────────────────────────────────────────────────

        // Notifier en temps réel les autres onglets de la création de l'annotation
        realTimeTaskSyncService.notifyAnnotationCreated(
          data.courrierId,
          courrier?.numero || 'N/A',
          data.auteur,
          auteurUser?.role || 'AGENT',
          data.type
        );
        
        return { ...created, dateCreation: created.dateCreation instanceof Date ? created.dateCreation : new Date(created.dateCreation as unknown as string) };
      } catch (e) {
        console.warn('createAnnotation Laravel échoué:', e);
        throw e;
      }
    }
    throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL). Les annotations sont gérées via l\'API.');
  }

  /**
   * Fonction de diagnostic pour les rappels
   */
  async diagnosticRappelSystem(userEmail?: string): Promise<void> {
    console.log('⏰ DIAGNOSTIC DES RAPPELS');
    
    try {
      // 1. Vérifier l'utilisateur
      console.log('\n📋 ÉTAPE 1: Vérification de l\'utilisateur');
      const allUsers = adminService.getAllUsers();
      const targetEmail = userEmail || 'wlucas@example.com';
      console.log('Email cible pour diagnostic des rappels:', targetEmail);
      
      const targetUser = allUsers.find(u => u.email === targetEmail);
      if (!targetUser) {
        console.error('❌ Utilisateur non trouvé:', targetEmail);
        return;
      }
      
      console.log('✅ Utilisateur trouvé:', targetUser.nom, 'ID:', targetUser.id, 'Rôle:', targetUser.role);
      
      // 2. Vérifier les rappels dans le localStorage
      console.log('\n💾 ÉTAPE 2: Vérification des rappels dans localStorage');
      const { simpleNotificationService } = await import('./simpleNotificationService');
      
      // Toutes les notifications
      const allNotifications = (simpleNotificationService as any).getAllLocal();
      console.log('Total notifications dans localStorage:', allNotifications.length);
      
      // Filtrer les rappels
      const rappels = allNotifications.filter((notif: any) => 
        notif.type === 'rappel' || 
        notif.type === 'echeance' ||
        notif.title?.toLowerCase().includes('rappel') ||
        notif.message?.toLowerCase().includes('rappel') ||
        notif.message?.toLowerCase().includes('échéance')
      );
      
      console.log('Rappels trouvés dans localStorage:', rappels.length);
      
      // Rappels par utilisateur
      const rappelsByUser = rappels.reduce((acc: any, notif: any) => {
        acc[notif.userId] = (acc[notif.userId] || 0) + 1;
        return acc;
      }, {});
      console.log('Rappels par utilisateur:', rappelsByUser);
      
      // Rappels pour l'utilisateur cible
      const userRappels = rappels.filter((notif: any) => notif.userId === targetUser.id);
      console.log('Rappels pour', targetUser.nom, ':', userRappels.length);
      
      // 3. Afficher les détails des rappels de l'utilisateur
      console.log('\n📋 ÉTAPE 3: Détails des rappels pour', targetUser.nom);
      if (userRappels.length === 0) {
        console.log('❌ Aucun rappel trouvé pour cet utilisateur');
      } else {
        userRappels.forEach((rappel: any, index: number) => {
          console.log(`${index + 1}. ID: ${rappel.id}`);
          console.log(`   Type: ${rappel.type}`);
          console.log(`   Titre: ${rappel.title}`);
          console.log(`   Message: ${rappel.message}`);
          console.log(`   Lue: ${rappel.read}`);
          console.log(`   Créée: ${rappel.createdAt.toLocaleString('fr-FR')}`);
          console.log(`   Courrier ID: ${rappel.relatedId || 'N/A'}`);
          console.log('---');
        });
      }
      
      // 4. Vérifier les assignations avec échéances
      console.log('\n📋 ÉTAPE 4: Vérification des assignations');
      try {
        const userAssignations = await this.loadAssignationsByUser(targetUser.id);
        console.log('Assignations actives pour', targetUser.nom, ':', userAssignations.length);
        
        const assignationsWithEcheance = userAssignations.filter((assignation: any) => 
          assignation.dateEcheance && new Date(assignation.dateEcheance) > new Date()
        );
        
        console.log('Assignations avec échéance future:', assignationsWithEcheance.length);
        
        assignationsWithEcheance.forEach((assignation: any, index: number) => {
          const echeance = new Date(assignation.dateEcheance);
          const aujourdHui = new Date();
          const joursRestants = Math.ceil((echeance.getTime() - aujourdHui.getTime()) / (1000 * 60 * 60 * 24));
          
          console.log(`${index + 1}. Courrier: ${assignation.courrierId}`);
          console.log(`   Statut: ${assignation.statut}`);
          console.log(`   Échéance: ${echeance.toLocaleDateString('fr-FR')}`);
          console.log(`   Jours restants: ${joursRestants}`);
          console.log(`   Instructions: ${assignation.instructions || 'N/A'}`);
          console.log('---');
        });
        
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des assignations:', error);
      }
      
      // 5. Résumé
      console.log('\n✅ DIAGNOSTIC DES RAPPELS TERMINÉ');
      console.log(`📊 Résumé des rappels pour ${targetUser.nom}:`);
      console.log(`   - ID: ${targetUser.id}`);
      console.log(`   - Rôle: ${targetUser.role}`);
      console.log(`   - Rappels stockés: ${userRappels.length}`);
      console.log(`   - Assignations avec échéance: N/A (voir ÉTAPE 4 ci-dessus)`);
      
    } catch (error) {
      console.error('❌ Erreur lors du diagnostic des rappels:', error);
    }
  }

  /**
      // Récupérer George Mercier
      const georgeMercier = adminService.getAllUsers().find(u => 
        u.email === 'directeur.administratif.financier@example.com' || 
        u.email === 'directeur.financier@example.com' ||
        u.nom?.toLowerCase().includes('mercier')
      );
      
      if (!georgeMercier) {
        console.error('❌ George Mercier non trouvé');
        return;
      }
      
      console.log('👤 George Mercier trouvé:', georgeMercier);
      console.log('🆔 ID de George Mercier:', georgeMercier.id);
      
      // Créer une notification de test
      const { NotificationHelper } = await import('./notificationHelper');
      const notification = NotificationHelper.createWorkflow({
        userId: georgeMercier.id,
        courrierId: 'test-courrier-id',
        courrierNumero: 'TEST-001',
        etape: 'Test de notification',
        message: 'Ceci est une notification de test pour vérifier que George Mercier reçoit bien les notifications'
      });
      
      console.log('✅ Notification de test créée:', notification);
      
      // Vérifier immédiatement si elle est bien stockée
      const { simpleNotificationService } = await import('./simpleNotificationService');
      const storedNotifications = simpleNotificationService.getByUserId(georgeMercier.id);
      console.log('🔍 Notifications stockées pour George Mercier:', storedNotifications.length);
      console.log('📋 Détail des notifications:', storedNotifications);
      
    } catch (error) {
      console.error('❌ Erreur lors de la création de la notification de test:', error);
    }
  }

  /**
   * Créer une assignation. Priorité API Laravel (MySQL).
   */
  async createAssignation(data: {
    courrierId: string;
    assigneA: string;
    assignePar: string;
    dateEcheance?: Date;
    instructions?: string;
    statut?: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE';
  }): Promise<Assignation> {
    if (laravelApiService.isConfigured()) {
      try {
        const created = await laravelApiService.createAssignation({ courrierId: data.courrierId, assigneA: data.assigneA, assignePar: data.assignePar, dateEcheance: data.dateEcheance, instructions: data.instructions, statut: data.statut });
        try {
          const courrier = this.getCourrierById(data.courrierId);
          if (courrier) {
            console.log('📧 Création de notification pour assignation:', {
              userId: data.assigneA,
              assignationId: created.id,
              courrierId: data.courrierId,
              courrierNumero: courrier.numero,
              instructions: data.instructions
            });
            
            // Log spécial pour George Mercier
            if (data.assigneA && data.assigneA.includes('mercier')) {
              console.log('🎯 GEORGE MERCIER: Création de notification d\'assignation!');
              console.log('🎯 GEORGE MERCIER: Détails notification:', {
                assignationId: created.id,
                courrierNumero: courrier.numero,
                instructions: data.instructions
              });
            }
            
            // Utiliser NotificationHelper pour créer une notification d'assignation
            const { NotificationHelper } = await import('./notificationHelper');
            const { userService } = await import('./userService');
            const assignedUser = userService.getUserById(data.assigneA);
            const notification = NotificationHelper.createWorkflow({
              userId: data.assigneA,
              courrierId: data.courrierId,
              courrierNumero: courrier.numero,
              etape: 'Assignation reçue',
              message: `Vous avez reçu une nouvelle assignation pour le courrier "${courrier.numero}"${data.instructions ? ` - ${data.instructions}` : ''}${data.dateEcheance ? ` - Échéance: ${new Date(data.dateEcheance).toLocaleDateString('fr-FR')}` : ''}`,
              userRole: assignedUser?.role
            });
            console.log('✅ Notification d\'assignation créée:', notification);
          }
        } catch (notifError) {
          console.error('❌ Erreur lors de la création de la notification d\'assignation:', notifError);
        }
        return { ...created, dateAssignation: created.dateAssignation instanceof Date ? created.dateAssignation : new Date(created.dateAssignation as unknown as string) };
      } catch (e) {
        console.warn('createAssignation Laravel échoué:', e);
        throw e;
      }
    }
    throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL). Les assignations sont gérées via l\'API.');
  }

  /**
   * Récupérer toutes les assignations. Priorité API Laravel (MySQL).
   */
  async getAllAssignations(): Promise<Assignation[]> {
    if (laravelApiService.isConfigured()) {
      try {
        const list = await laravelApiService.getAssignations();
        return list.map((a) => ({ ...a, dateAssignation: a.dateAssignation instanceof Date ? a.dateAssignation : new Date(a.dateAssignation as unknown as string) }));
      } catch (e) {
        console.warn('getAllAssignations Laravel échoué:', e);
        return [];
      }
    }
    return [];
  }

  /**
   * Mettre à jour une assignation. Priorité API Laravel (MySQL).
   */
  async updateAssignation(id: string, updates: { statut?: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' }): Promise<void> {
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.updateAssignation(id, updates);
      } catch (e) {
        console.warn('updateAssignation Laravel échoué:', e);
        throw e;
      }
    }
  }

  /**
   * Créer un rappel. Priorité API Laravel (MySQL).
   */
  async createRappelAsync(data: {
    assignationId: string;
    courrierId: string;
    dateRappel: Date;
    message?: string;
  }): Promise<Rappel> {
    if (laravelApiService.isConfigured()) {
      try {
        const created = await laravelApiService.createRappel(data);
        localStorage.removeItem('rappels_a_envoyer');
        return { ...created, createdAt: created.createdAt instanceof Date ? created.createdAt : new Date(created.createdAt as unknown as string), dateRappel: created.dateRappel instanceof Date ? created.dateRappel : new Date(created.dateRappel as unknown as string) };
      } catch (e) {
        console.warn('createRappelAsync Laravel échoué:', e);
        throw e;
      }
    }
    throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL). Les rappels sont gérés via l\'API.');
  }

  /**
   * Créer un rappel (version synchrone pour compatibilité)
   */
  createRappel(data: {
    assignationId: string;
    courrierId: string;
    dateRappel: Date;
    message?: string;
  }): Rappel {
    // Créer un rappel temporaire (sera remplacé par la version async)
    const rappel: Rappel = {
      id: `rappel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      assignationId: data.assignationId,
      courrierId: data.courrierId,
      dateRappel: data.dateRappel,
      envoye: false,
      message: data.message,
      createdAt: new Date(),
    };
    // Appeler la version async en arrière-plan
    this.createRappelAsync(data).catch(error => {
      console.error('Erreur lors de la création asynchrone du rappel:', error);
    });
    return rappel;
  }

  /**
   * Marquer un rappel comme envoyé. Priorité API Laravel (MySQL).
   */
  async marquerRappelEnvoyeAsync(rappelId: string): Promise<void> {
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.marquerRappelEnvoye(rappelId);
        localStorage.removeItem('rappels_a_envoyer');
        return;
      } catch (e) {
        console.warn('marquerRappelEnvoyeAsync Laravel échoué:', e);
        throw e;
      }
    }
  }

  /**
   * Marquer un rappel comme envoyé (version synchrone pour compatibilité)
   */
  marquerRappelEnvoye(rappelId: string): void {
    // Marquer comme envoyé localement (sera synchronisé avec l'API)
    const rappels = this.getRappels();
    const rappelIndex = rappels.findIndex(r => r.id === rappelId);
    if (rappelIndex !== -1) {
      rappels[rappelIndex].envoye = true;
      localStorage.setItem('rappels', JSON.stringify(rappels));
    }
    // Appeler la version async en arrière-plan
    this.marquerRappelEnvoyeAsync(rappelId).catch(error => {
      console.error('Erreur lors du marquage asynchrone du rappel:', error);
    });
  }

  /**
   * Créer une étape de workflow. Priorité API Laravel (MySQL).
   */
  async createWorkflowEtapeAsync(data: {
    courrierId: string;
    etape: string;
    assigneA?: string;
    statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'REJETE';
    commentaire?: string;
    creePar: string;
    dureeEstimee?: number;
    declencheur?: {
      type: 'IMMEDIAT' | 'APRES_ETAPE' | 'CONDITION' | 'DATE';
      etapePrecedenteId?: string;
      dateDeclenchement?: Date;
    };
    ordre?: number;
    estCondition?: boolean;
    actionSiVrai?: string;
    actionSiFaux?: string;
  }): Promise<WorkflowEtape> {
    if (laravelApiService.isConfigured()) {
      try {
        // Normaliser la durée estimée pour respecter la validation Laravel (nullable|numeric|min:0)
        let dureeEstimee: number | undefined = undefined;
        const rawDuree: unknown = (data as any).dureeEstimee;
        if (rawDuree !== undefined && rawDuree !== null && rawDuree !== '') {
          const parsed = Number(rawDuree);
          if (Number.isFinite(parsed) && parsed >= 0) {
            dureeEstimee = Math.round(parsed * 100) / 100; // 2 décimales max
          }
        }

        const created = await laravelApiService.createWorkflowEtape({
          courrierId: data.courrierId,
          etape: data.etape,
          assigneA: data.assigneA ?? '',
          statut: data.statut,
          commentaire: data.commentaire,
          dureeEstimee,
          ordre: data.ordre,
          declencheur: data.declencheur,
          estCondition: data.estCondition,
          actionSiVrai: data.actionSiVrai,
          actionSiFaux: data.actionSiFaux,
        });
        if (data.assigneA) {
          try {
            await this.createAssignation({ courrierId: data.courrierId, assigneA: data.assigneA, assignePar: data.creePar, statut: 'EN_ATTENTE', instructions: data.etape ? `Étape workflow : ${data.etape}` : undefined });
          } catch {}
          notificationService.createNotification({ userId: data.assigneA, type: 'workflow', title: 'Nouvelle étape assignée', message: `${data.etape} vous est assignée sur le courrier ${data.courrierId}`, relatedId: data.courrierId, relatedType: 'courrier', priority: 'normal' }).catch(() => {});
        }
        localStorage.removeItem(`workflows_${data.courrierId}`);
        return created;
      } catch (e) {
        console.warn('createWorkflowEtapeAsync Laravel échoué:', e);
        throw e;
      }
    }
    throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL). Les étapes de workflow sont gérées via l\'API.');
  }

  /**
   * Créer une étape de workflow (version synchrone pour compatibilité).
   * La persistance réelle est faite via createWorkflowEtapeAsync (API Laravel).
   */
  createWorkflowEtape(data: {
    courrierId: string;
    etape: string;
    assigneA?: string;
    statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'REJETE';
    commentaire?: string;
    creePar: string;
    dureeEstimee?: number;
    declencheur?: {
      type: 'IMMEDIAT' | 'APRES_ETAPE' | 'CONDITION' | 'DATE';
      etapePrecedenteId?: string;
      dateDeclenchement?: Date;
    };
    ordre?: number;
    estCondition?: boolean;
    actionSiVrai?: string;
    actionSiFaux?: string;
  }): WorkflowEtape {
    // Créer l'objet localement
    const workflow: WorkflowEtape = {
      id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      courrierId: data.courrierId,
      etape: data.etape,
      assigneA: data.assigneA || '',
      statut: data.statut,
      commentaire: data.commentaire,
      creePar: data.creePar,
      createdAt: new Date(),
      dureeEstimee: data.dureeEstimee,
      declencheur: data.declencheur,
      ordre: data.ordre,
      estCondition: data.estCondition,
      actionSiVrai: data.actionSiVrai,
      actionSiFaux: data.actionSiFaux,
    };
    
    this.createWorkflowEtapeAsync(data).catch(error => {
      console.error('Erreur lors de la sauvegarde (API Laravel) en arrière-plan:', error);
    });
    
    return workflow;
  }

  /**
   * Mettre à jour une étape de workflow. Priorité API Laravel (MySQL).
   */
  async updateWorkflowEtapeAsync(id: string, updates: Partial<WorkflowEtape>): Promise<WorkflowEtape | null> {
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.updateWorkflowEtape(id, updates);
        return { id, ...updates } as WorkflowEtape;
      } catch (e) {
        console.warn('updateWorkflowEtapeAsync Laravel échoué:', e);
        throw e;
      }
    }
    return null;
  }

  /**
   * Ajouter une réponse/avis à une étape de workflow. Priorité API Laravel (MySQL).
   */
  async addWorkflowResponseAsync(params: {
    workflowId: string;
    courrierId: string;
    auteurId: string;
    auteurNom?: string;
    message: string;
    decision?: WorkflowDecision;
  }): Promise<void> {
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.addWorkflowResponse(params.workflowId, { message: params.message, decision: params.decision, auteurId: params.auteurId, auteurNom: params.auteurNom });
        localStorage.removeItem(`workflows_${params.courrierId}`);
        return;
      } catch (e) {
        console.warn('addWorkflowResponseAsync Laravel échoué:', e);
        throw e;
      }
    }
  }

  /**
   * Mettre à jour une étape de workflow (version synchrone pour compatibilité)
   */
  updateWorkflowEtape(id: string, updates: Partial<WorkflowEtape>): WorkflowEtape | null {
    this.updateWorkflowEtapeAsync(id, updates).catch(error => {
      console.error('Erreur lors de la mise à jour (API Laravel) en arrière-plan:', error);
    });
    
    // Retourner les données mises à jour localement (approximation)
    return { id, ...updates } as WorkflowEtape;
  }

  /**
   * Supprimer une étape de workflow. Priorité API Laravel (MySQL).
   */
  async deleteWorkflowEtapeAsync(id: string): Promise<void> {
    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.deleteWorkflowEtape(id);
        return;
      } catch (e) {
        console.warn('deleteWorkflowEtapeAsync Laravel échoué:', e);
        throw e;
      }
    }
  }

  /**
   * Supprimer une étape de workflow (version synchrone pour compatibilité)
   */
  deleteWorkflowEtape(id: string): void {
    this.deleteWorkflowEtapeAsync(id).catch(error => {
      console.error('Erreur lors de la suppression (API Laravel) en arrière-plan:', error);
    });
  }
}

export const courrierServiceFirebase = new CourrierServiceFirebase();

