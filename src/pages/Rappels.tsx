import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Role, Assignation, Courrier } from '../types';
import { useNavigate } from 'react-router-dom';
import { courrierService } from '../services/courrierService';
import { laravelApiService } from '../services/laravelApiService';
import { userService } from '../services/userService';
// taskNotificationService importé si besoin futur
import { realTimeTaskSyncService } from '../services/realTimeTaskSyncService';
import { taskCompletionService } from '../services/taskCompletionService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faClock, 
  faCheck, 
  faTimes, 
  faSearch, 
  faExclamationTriangle,
  faExternalLinkAlt,
  faEye,
  faCalendarAlt,
  faSync,
  faBell,
  faUser,
  faFileAlt,
  faHourglassHalf,
  faRocket,
  faEnvelope,
  faTag,
  faMapMarkerAlt,
  faTrash,
  faBroom,
  faStopwatch
} from '@fortawesome/free-solid-svg-icons';

interface RappelItem {
  id: string;
  assignationId: string;
  courrierId: string;
  dateRappel: Date;
  message: string;
  envoye: boolean;
  createdAt: Date;
  assigneA: string;
  assignePar: string;
  instructions?: string;
  courrier?: {
    id: string;
    numero: string;
    objet: string;
    type: string;
    dateReception: Date;
  };
  actionCompleted: boolean;
  requiredAction: string;
  currentStatus: string;
  statusDetail?: string;
  assignationStatut?: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE';
}

/** Retourne un tick mis à jour toutes les 100ms (pour les comptes à rebours au dixième). */
const useNowTick = () => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  return now;
};

const Rappels: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rappels, setRappels] = useState<RappelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'sent' | 'stopped'>('all');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [cleaningAll, setCleaningAll] = useState(false);
  const nowTick = useNowTick();
  
  // Panel de detail courrier (slide-over au lieu de naviguer)
  const [selectedRappel, setSelectedRappel] = useState<RappelItem | null>(null);
  const [panelCourrier, setPanelCourrier] = useState<Courrier | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  const cacheRef = useRef<Map<string, any>>(new Map());
  const lastLoadTime = useRef<number>(0);
  const loadingRef = useRef<boolean>(false);
  const hasDataRef = useRef<boolean>(false);
  
  // Nettoyer le cache toutes les 10 minutes
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cache = cacheRef.current;
      const keysToDelete: string[] = [];
      cache.forEach((value, key) => {
        if (now - value.timestamp > 300000) keysToDelete.push(key);
      });
      keysToDelete.forEach(key => cache.delete(key));
    }, 600000);
    return () => clearInterval(cleanupInterval);
  }, []);

  const canViewRappels = user && [
    Role.SUPER_ADMIN,
    Role.DIRECTEUR_GENERAL,
    Role.DIRECTEUR,
    Role.CHEF_SERVICE,
    Role.SECRETAIRE
  ].includes(user.role);

  const checkActionCompleted = useCallback(async (courrierId: string, userRole: string, assigneA?: string): Promise<{completed: boolean, action: string, currentStatus: string}> => {
    const cacheKey = `action-${courrierId}-${userRole}-${assigneA || 'none'}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30000) return cached.data;
    
    try {
      const courrier = await courrierService.getCourrierById(courrierId);
      if (!courrier) {
        const result = { completed: false, action: 'Inconnue', currentStatus: 'COURRIER_NON_TROUVE' };
        cacheRef.current.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
      
      const role = userRole as Role;
      let actionText = 'Consulter et traiter ce courrier';
      if (taskCompletionService.completesByAnnotationOrStep(role)) actionText = 'Créer annotation ou étape';
      else if (taskCompletionService.completesByOrientation(role)) actionText = 'Orientation';
      else if (taskCompletionService.completesByStepCompletion(role)) actionText = 'Terminer étapes assignées';
      
      let result;
      switch (userRole) {
        case Role.SECRETAIRE: {
          const hasDirection = courrier.direction && courrier.direction !== '';
          const isOriented = courrier.statut.includes('ORIENTE') || courrier.statut.includes('ASSIGNE') || hasDirection;
          result = { completed: !!isOriented, action: actionText, currentStatus: courrier.statut as string };
          break;
        }
        case Role.DIRECTEUR_GENERAL:
        case Role.DIRECTEUR:
        case Role.CHEF_SERVICE:
          try {
            const annotations = await courrierService.getAnnotationsByCourrier(courrierId);
            const workflows = await (courrierService as any).getWorkflowsByCourrierAsync(courrierId).catch(() => []);
            const hasCreatedAnnotation = annotations.some((a: any) => a.auteur === assigneA);
            const hasCreatedStep = workflows.some((w: any) => w.creePar === assigneA || w.assigneA === assigneA);
            result = { completed: hasCreatedAnnotation || hasCreatedStep, action: actionText, currentStatus: courrier.statut as string };
          } catch {
            result = { completed: false, action: actionText, currentStatus: courrier.statut as string };
          }
          break;
        case Role.AGENT:
          try {
            const workflows = await (courrierService as any).getWorkflowsByCourrierAsync(courrierId).catch(() => []);
            const assignedSteps = workflows.filter((w: any) => w.assigneA === assigneA);
            const allDone = assignedSteps.length > 0 && assignedSteps.every((w: any) => w.statut === 'TERMINE');
            result = { completed: allDone, action: actionText, currentStatus: courrier.statut as string };
          } catch {
            result = { completed: false, action: actionText, currentStatus: courrier.statut as string };
          }
          break;
        default:
          result = { completed: false, action: actionText, currentStatus: courrier.statut as string };
      }
      cacheRef.current.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Erreur vérification statut courrier:', error);
      const result = { completed: false, action: 'Inconnue', currentStatus: 'ERREUR' };
      cacheRef.current.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  }, []);

  const getRappelsVisiblesByAccessLevel = useCallback(async (currentUser: any): Promise<Assignation[]> => {
    const cacheKey = `assignations-${currentUser.id}-${currentUser.role}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15000) return cached.data;
    
    let allAssignations: Assignation[] = [];
    try {
      if (currentUser.role === Role.SECRETAIRE) {
        const userAssignations = await courrierService.loadAssignationsByUser(currentUser.id);
        allAssignations = [...userAssignations];
        if (currentUser.direction) {
          const allUsers = userService.getAllUsers();
          const usersInSameDirection = allUsers.filter(u => u.id !== currentUser.id && u.direction === currentUser.direction).slice(0, 3);
          const otherAssignations = await Promise.all(
            usersInSameDirection.map(async (u) => {
              try { return await courrierService.loadAssignationsByUser(u.id); }
              catch { return []; }
            })
          );
          otherAssignations.forEach(a => allAssignations.push(...a));
        }
      } else {
        allAssignations = await courrierService.loadAssignationsByUser(currentUser.id);
      }
    } catch (error) {
      console.warn('Erreur chargement assignations:', error);
      allAssignations = [];
    }
    
    const filtered = allAssignations
      .filter((a, idx, self) => idx === self.findIndex((b) => b.id === a.id));
    
    cacheRef.current.set(cacheKey, { data: filtered, timestamp: Date.now() });
    return filtered;
  }, []);

  const loadRappels = useCallback(async () => {
    if (loadingRef.current) return;
    const now = Date.now();
    if (now - lastLoadTime.current < 3000) return;
    
    loadingRef.current = true;
    lastLoadTime.current = now;
    
    try {
      // Ne montrer le loading skeleton que si on n'a pas encore de données
      if (!hasDataRef.current) setLoading(true);
      if (!user) { setRappels([]); return; }

      // Charger tous les courriers directement depuis l'API pour avoir les vrais objets
      let allCourriersFromApi: Courrier[] = [];
      try {
        if (laravelApiService.isConfigured()) {
          allCourriersFromApi = await laravelApiService.getCourriers();
        }
      } catch { /* non bloquant, fallback store */ }
      
      const assignations = await getRappelsVisiblesByAccessLevel(user);
      if (assignations.length === 0) {
        // Ne vider que si c'est le premier chargement
        if (!hasDataRef.current) setRappels([]);
        return;
      }
      
      const validAssignations = assignations.filter(a => a.courrierId && a.courrierId.trim() !== '');
      
      // Convertir assignations -> rappels
      const data: RappelItem[] = validAssignations.map((a: Assignation) => {
        // Correction: dateEcheance peut être une string venant de l'API → forcer la conversion en Date
        let rappelDate: Date;
        if (a.dateEcheance) {
          rappelDate = a.dateEcheance instanceof Date ? a.dateEcheance : new Date(a.dateEcheance as unknown as string);
          if (isNaN(rappelDate.getTime())) rappelDate = new Date(a.dateAssignation.getTime() + 48 * 60 * 60 * 1000);
        } else {
          rappelDate = new Date(a.dateAssignation.getTime() + 48 * 60 * 60 * 1000);
        }
        let msg = `Assigné le ${a.dateAssignation.toLocaleDateString('fr-FR')}`;
        const assignedUser = userService.getUserById(a.assigneA);
        if (assignedUser) msg += `\nAssigné à: ${assignedUser.nom}`;
        
        return {
          id: `rappel-${a.id}`, assignationId: a.id, courrierId: a.courrierId,
          dateRappel: rappelDate, message: msg, envoye: false, createdAt: a.dateAssignation,
          assigneA: a.assigneA, assignePar: a.assignePar, instructions: a.instructions,
          actionCompleted: false, requiredAction: 'En attente', currentStatus: 'ENREGISTRE',
          assignationStatut: (a.statut as 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE') || 'EN_ATTENTE'
        };
      });

      // Construire la map des courriers depuis l'API (priorité) ou le store (fallback)
      const courrierIds = [...new Set(data.map(r => r.courrierId))];
      const courrierMap = new Map<string, Courrier | null>();

      // Priorité 1 : depuis l'appel API déjà fait
      if (allCourriersFromApi.length > 0) {
        allCourriersFromApi.forEach(c => courrierMap.set(c.id, c));
        // Pour les IDs manquants, marquer null (plutôt que lancer d'autres appels)
        courrierIds.forEach(cid => { if (!courrierMap.has(cid)) courrierMap.set(cid, null); });
      } else {
        // Fallback : store Redux (batch)
        const BATCH_SIZE = 3;
        for (let i = 0; i < courrierIds.length; i += BATCH_SIZE) {
          const batch = courrierIds.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(batch.map(async (cid) => {
            const ck = `courrier-${cid}`;
            const cached = cacheRef.current.get(ck);
            if (cached && Date.now() - cached.timestamp < 60000) return { id: cid, data: cached.data };
            try {
              const c = await Promise.race([
                courrierService.getCourrierById(cid),
                new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 10000))
              ]) as Courrier | undefined;
              cacheRef.current.set(ck, { data: c ?? null, timestamp: Date.now() });
              return { id: cid, data: c ?? null };
            } catch {
              cacheRef.current.set(ck, { data: null, timestamp: Date.now() });
              return { id: cid, data: null };
            }
          }));
          results.forEach(r => courrierMap.set(r.id, r.data));
          if (i + BATCH_SIZE < courrierIds.length) await new Promise(r => setTimeout(r, 200));
        }
      }
      
      // Assembler avec infos courrier + vérification action
      // Tri par défaut : par date de rappel, ordre décroissant (le plus récent en premier)
      const sorted = [...data].sort((a, b) => b.dateRappel.getTime() - a.dateRappel.getTime());
      const final: RappelItem[] = [];
      
      for (const rappel of sorted) {
        const courrier = courrierMap.get(rappel.courrierId);
        if (!courrier) {
          // Courrier supprimé de la BDD → supprimer silencieusement l'assignation orpheline
          laravelApiService.deleteAssignation(rappel.assignationId).catch(() => {});
          continue;
        }
        try {
          const assignedUser = userService.getUserById(rappel.assigneA);
          const isStopped = rappel.assignationStatut === 'TERMINE';
          const actionCheck = isStopped
            ? { completed: true, action: 'Assignation terminée', currentStatus: 'TERMINE' }
            : await checkActionCompleted(rappel.courrierId, assignedUser?.role || user?.role || '', rappel.assigneA);
          final.push({
            ...rappel,
            courrier: { id: courrier.id, numero: courrier.numero, objet: courrier.objet, type: courrier.type, dateReception: courrier.dateReception },
            actionCompleted: actionCheck.completed, requiredAction: actionCheck.action, currentStatus: actionCheck.currentStatus
          });
        } catch {
          final.push({
            ...rappel,
            courrier: { id: courrier.id, numero: courrier.numero, objet: courrier.objet, type: courrier.type, dateReception: courrier.dateReception },
            actionCompleted: false, requiredAction: 'Vérifier annotation/étape', currentStatus: 'ERREUR_VERIFICATION'
          });
        }
      }
      setRappels(final);
      hasDataRef.current = final.length > 0;
    } catch (error) {
      console.error('[Rappels] Erreur générale:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [user, getRappelsVisiblesByAccessLevel, checkActionCompleted]);

  // --- Utilitaires priorité ---
  const getPriorityInfo = (dateRappel: Date) => {
    const diffHours = (dateRappel.getTime() - nowTick) / (1000 * 60 * 60);
    if (diffHours < 0) return { color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', label: 'En retard', icon: faExclamationTriangle };
    if (diffHours < 24) return { color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', label: 'Urgent', icon: faRocket };
    if (diffHours < 72) return { color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Proche', icon: faClock };
    return { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'À venir', icon: faCalendarAlt };
  };

  const getRetardInfo = (dateRappel: Date) => {
    const diffMs = nowTick - dateRappel.getTime();
    if (diffMs <= 0) return null;
    const totalDs = Math.floor(diffMs / 100); // dixièmes
    const days = Math.floor(totalDs / 864000);
    const hours = Math.floor((totalDs % 864000) / 36000);
    const mins = Math.floor((totalDs % 36000) / 600);
    const secs = Math.floor((totalDs % 600) / 10);
    const tenths = totalDs % 10;
    if (days > 0) return `${days}j ${String(hours).padStart(2,'0')}h${String(mins).padStart(2,'0')} de retard`;
    return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${tenths} de retard`;
  };

  /** Compte à rebours pour les tâches non terminées. Retourne null si déjà en retard. */
  const getCountdown = (dateRappel: Date): string | null => {
    const diffMs = dateRappel.getTime() - nowTick;
    if (diffMs <= 0) return null;
    const totalDs = Math.floor(diffMs / 100); // dixièmes
    const days = Math.floor(totalDs / 864000);
    const hours = Math.floor((totalDs % 864000) / 36000);
    const mins = Math.floor((totalDs % 36000) / 600);
    const secs = Math.floor((totalDs % 600) / 10);
    const tenths = totalDs % 10;
    if (days > 0) return `${days}j ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${tenths}`;
    return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${tenths}`;
  };

  /** Supprimer une tâche terminée (assignation) de la BDD. */
  const handleDeleteRappel = async (rappel: RappelItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingIds.has(rappel.id)) return;
    setDeletingIds(prev => new Set(prev).add(rappel.id));
    try {
      await laravelApiService.deleteAssignation(rappel.assignationId);
      setRappels(prev => prev.filter(r => r.id !== rappel.id));
      cacheRef.current.delete(`assignations-${user?.id}-${user?.role}`);
    } catch (err) {
      console.error('Erreur suppression assignation:', err);
    } finally {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(rappel.id); return s; });
    }
  };

  /** Nettoyer toutes les tâches terminées et arrêtées d'un coup. */
  const handleCleanCompleted = async () => {
    const completed = rappels.filter(r => r.actionCompleted || r.assignationStatut === 'TERMINE');
    if (completed.length === 0) return;
    setCleaningAll(true);
    const ids = new Set(completed.map(r => r.id));
    setDeletingIds(ids);
    try {
      await Promise.all(completed.map(r => laravelApiService.deleteAssignation(r.assignationId).catch(() => {})));
      setRappels(prev => prev.filter(r => !r.actionCompleted && r.assignationStatut !== 'TERMINE'));
      cacheRef.current.delete(`assignations-${user?.id}-${user?.role}`);
    } finally {
      setCleaningAll(false);
      setDeletingIds(new Set());
    }
  };

  // --- Ouvrir le panneau de détail courrier (sans quitter la page) ---
  const handleViewCourrier = async (rappel: RappelItem) => {
    setSelectedRappel(rappel);
    setPanelCourrier(null);
    setPanelLoading(true);
    try {
      // D'abord essayer le cache local pour éviter les side-effects Redux
      const ck = `courrier-${rappel.courrierId}`;
      const cached = cacheRef.current.get(ck);
      if (cached && cached.data && Date.now() - cached.timestamp < 120000) {
        setPanelCourrier(cached.data);
        setPanelLoading(false);
        return;
      }
      const c = await courrierService.getCourrierById(rappel.courrierId);
      setPanelCourrier(c || null);
    } catch {
      setPanelCourrier(null);
    } finally {
      setPanelLoading(false);
    }
  };

  const closePanel = () => {
    setSelectedRappel(null);
    setPanelCourrier(null);
  };

  // --- Ouvrir dans la page DetailCourrier (navigation complète) ---
  const handleOpenFullDetail = (courrierId: string) => {
    navigate(`/courriers/${courrierId}`);
  };

  // Filtrer les rappels
  const filteredRappels = rappels.filter(rappel => {
    const matchesSearch = !searchTerm || 
      rappel.courrier?.numero?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rappel.courrier?.objet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rappel.message?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || 
      (filter === 'pending' && !rappel.actionCompleted && rappel.assignationStatut !== 'TERMINE') ||
      (filter === 'sent' && rappel.actionCompleted && rappel.assignationStatut !== 'TERMINE') ||
      (filter === 'stopped' && rappel.assignationStatut === 'TERMINE');
    return matchesSearch && matchesFilter;
  });

  // Statistiques rapides (basées sur nowTick pour cohérence)
  const statsEnRetard = rappels.filter(r => r.dateRappel.getTime() < nowTick && !r.actionCompleted && r.assignationStatut !== 'TERMINE').length;
  const statsEnCours = rappels.filter(r => r.dateRappel.getTime() >= nowTick && !r.actionCompleted && r.assignationStatut !== 'TERMINE').length;
  const statsTermines = rappels.filter(r => r.actionCompleted && r.assignationStatut !== 'TERMINE').length;
  const statsArretes = rappels.filter(r => r.assignationStatut === 'TERMINE').length;

  // Charger au montage
  useEffect(() => {
    if (user && canViewRappels) {
      loadRappels();
      const unsubscribe = realTimeTaskSyncService.subscribe((event) => {
        const affects = user && (event.userId === user.id || (user.role === Role.SECRETAIRE && !!user.direction));
        if (!affects) return;
        const keys = Array.from(cacheRef.current.keys()).filter(k => k.includes(event.courrierId) || k.startsWith('action-'));
        keys.forEach(k => cacheRef.current.delete(k));
        // Ne pas recharger si le panneau de détail est ouvert
        if (!document.querySelector('.animate-slideInRight')) {
          setTimeout(() => loadRappels(), 1000);
        }
      });
      realTimeTaskSyncService.startMonitoring();
      return () => { realTimeTaskSyncService.stopMonitoring(); unsubscribe(); };
    }
  }, [user, canViewRappels, loadRappels]);

  // Fermer le panel avec Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!canViewRappels) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-10 rounded-2xl bg-white border border-red-100 shadow-lg max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
            <FontAwesomeIcon icon={faExclamationTriangle} className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Accès non autorisé</h2>
          <p className="text-slate-500 text-sm leading-relaxed">Vous n'avez pas les permissions nécessaires pour accéder au module des rappels.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 relative">
      {/* ===== EN-TÊTE ===== */}
      <div className="bg-white border-b border-slate-200/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-2.5 shadow-lg shadow-blue-200/50">
                <FontAwesomeIcon icon={faBell} className="text-white text-lg" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Rappels & Tâches</h1>
                <p className="text-xs text-slate-500 mt-0.5">{rappels.length} notification{rappels.length !== 1 ? 's' : ''} au total</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(statsTermines > 0 || statsArretes > 0) && (
                <button
                  onClick={handleCleanCompleted}
                  disabled={cleaningAll}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                  title="Supprimer toutes les tâches terminées et arrêtées de la base de données"
                >
                  <FontAwesomeIcon icon={faBroom} className={cleaningAll ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">Nettoyer ({statsTermines + statsArretes})</span>
                </button>
              )}
              <button
                onClick={() => { cacheRef.current.clear(); loadRappels(); }}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* ===== STATISTIQUES COMPACTES ===== */}
        {statsEnRetard > 0 && (
          <div className="mb-4 bg-red-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-red-200/60 animate-pulse">
            <div className="bg-white/20 rounded-lg p-2 flex-shrink-0">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-white text-base" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-sm">
                {statsEnRetard === 1
                  ? '⚠️ 1 tâche est EN RETARD'
                  : `⚠️ ${statsEnRetard} tâches sont EN RETARD`}
              </div>
              <div className="text-red-100 text-xs mt-0.5">Ces tâches ont dépassé leur date d'échéance et nécessitent une action immédiate.</div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className={`rounded-xl border p-3 flex items-center gap-3 ${statsEnRetard > 0 ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200/60'}`}>
            <div className={`rounded-lg p-2 ${statsEnRetard > 0 ? 'bg-red-200' : 'bg-red-100'}`}><FontAwesomeIcon icon={faExclamationTriangle} className="text-red-600 text-sm" /></div>
            <div>
              <div className={`text-lg font-bold ${statsEnRetard > 0 ? 'text-red-700' : 'text-slate-800'}`}>{statsEnRetard}</div>
              <div className="text-xs text-slate-500">En retard</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/60 p-3 flex items-center gap-3">
            <div className="bg-amber-100 rounded-lg p-2"><FontAwesomeIcon icon={faHourglassHalf} className="text-amber-600 text-sm" /></div>
            <div><div className="text-lg font-bold text-slate-800">{statsEnCours}</div><div className="text-xs text-slate-500">En cours</div></div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/60 p-3 flex items-center gap-3">
            <div className="bg-emerald-100 rounded-lg p-2"><FontAwesomeIcon icon={faCheck} className="text-emerald-600 text-sm" /></div>
            <div><div className="text-lg font-bold text-slate-800">{statsTermines}</div><div className="text-xs text-slate-500">Terminés</div></div>
          </div>
        </div>

        {/* ===== BARRE DE RECHERCHE + FILTRES ===== */}
        <div className="bg-white rounded-xl border border-slate-200/60 p-3 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text"
              placeholder="Rechercher par numéro, objet..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-slate-700 placeholder-slate-400"
            />
          </div>
          <div className="flex gap-1.5">
            {[
              { id: 'all' as const, label: 'Tous', count: rappels.length },
              { id: 'pending' as const, label: 'En cours', count: statsEnCours + statsEnRetard },
              { id: 'sent' as const, label: 'Terminés', count: statsTermines },
              { id: 'stopped' as const, label: 'Arrêtés', count: statsArretes }
            ].map(({ id, label, count }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  filter === id 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label} <span className="opacity-70">({count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ===== LISTE DES RAPPELS (tableau compact) ===== */}
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-4">
                <div className="h-8 w-20 bg-slate-100 rounded-full" />
                <div className="flex-1 space-y-2"><div className="h-4 w-32 bg-slate-100 rounded" /><div className="h-3 w-48 bg-slate-50 rounded" /></div>
                <div className="h-8 w-24 bg-slate-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : filteredRappels.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-10 text-center">
            <div className="bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <FontAwesomeIcon icon={faClock} className="text-slate-400 text-2xl" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              {searchTerm ? 'Aucun résultat' : 'Aucune notification'}
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              {searchTerm ? 'Modifiez votre recherche ou vos filtres.' : 'Vous êtes à jour ! Toutes les tâches ont été traitées.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRappels.map((rappel) => {
              const isStopped = rappel.assignationStatut === 'TERMINE';
              const isCompleted = rappel.actionCompleted || isStopped;
              const isDeleting = deletingIds.has(rappel.id);
              const priority = getPriorityInfo(rappel.dateRappel);
              const retard = !isCompleted ? getRetardInfo(rappel.dateRappel) : null;
              const countdown = !isCompleted ? getCountdown(rappel.dateRappel) : null;
              const isSelected = selectedRappel?.id === rappel.id;
              
              return (
                <div 
                  key={rappel.id}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                    isStopped
                      ? 'opacity-60 bg-slate-50 border-slate-300 cursor-default'
                      : isCompleted
                      ? 'opacity-60 bg-emerald-50/60 border-emerald-200 cursor-default'
                      : isSelected
                        ? 'border-blue-400 ring-2 ring-blue-100 shadow-md bg-white cursor-pointer hover:shadow-md'
                        : retard
                          ? 'border-red-400 shadow-sm shadow-red-100 bg-white cursor-pointer hover:shadow-md'
                          : 'border-slate-200/60 hover:border-slate-300 bg-white cursor-pointer hover:shadow-md'
                  }`}
                  onClick={() => !isCompleted && rappel.courrier && handleViewCourrier(rappel)}
                >
                  {/* Bannière retard — uniquement pour les tâches actives */}
                  {retard && !isCompleted && (
                    <div className="bg-red-600 text-white px-4 py-1.5 flex items-center gap-2 text-xs font-bold">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="animate-pulse" />
                      TÂCHE EN RETARD — {retard} — Action immédiate requise
                    </div>
                  )}
                  {/* Bannière tâche terminée */}
                  {isCompleted && (
                    <div className={`${isStopped ? 'bg-slate-500' : 'bg-emerald-600'} text-white px-4 py-1 flex items-center gap-2 text-[11px] font-semibold`}>
                      <FontAwesomeIcon icon={isStopped ? faTimes : faCheck} />
                      {isStopped ? 'Rappel arrêté — peut être supprimé' : 'Tâche traitée — peut être supprimée'}
                    </div>
                  )}

                  <div className="p-4 flex items-center gap-4">
                    {/* Indicateur priorité */}
                    <div className={`w-2 h-12 rounded-full flex-shrink-0 ${isStopped ? 'bg-slate-400' : isCompleted ? 'bg-emerald-400' : priority.dot}`} />
                    
                    {/* Contenu principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {rappel.courrier ? (
                          <span className={`font-bold text-sm ${isCompleted ? 'text-slate-500' : 'text-slate-900'}`}>{rappel.courrier.numero}</span>
                        ) : (
                          <span className="font-bold text-red-500 text-sm">Courrier introuvable</span>
                        )}
                        {!isCompleted && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priority.color}`}>
                            <FontAwesomeIcon icon={priority.icon} className="text-[9px]" />
                            {priority.label}
                          </span>
                        )}
                        {isCompleted && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${isStopped ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                            <FontAwesomeIcon icon={isStopped ? faTimes : faCheck} className="text-[9px]" />
                            {isStopped ? 'Arrêté' : 'Terminé'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {(() => {
                          const c = rappel.courrier;
                          if (!c) return 'Sans objet';
                          const strip = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
                          if (c.objet) { const t = strip(c.objet); if (t && t.toLowerCase() !== 'sans objet') return t; }
                          const ef = (c as any).extraFields as Record<string, unknown> | undefined;
                          const fx = ef?.objet ?? ef?.sujet ?? ef?.object;
                          if (fx) { const t = strip(String(fx)); if (t) return t; }
                          return 'Sans objet';
                        })()}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <FontAwesomeIcon icon={faUser} className="text-[10px]" />
                          {userService.getUserById(rappel.assigneA)?.nom || 'Inconnu'}
                        </span>
                        {!isCompleted && (
                          <span className={`flex items-center gap-1 font-mono font-bold ${
                            retard ? 'text-red-600' : countdown ? 'text-blue-600' : 'text-slate-400'
                          }`}>
                            <FontAwesomeIcon icon={faStopwatch} className="text-[10px]" />
                            {retard
                              ? retard
                              : countdown
                                ? `Reste ${countdown}`
                                : 'Échéance dépassée'
                            }
                          </span>
                        )}
                        {isCompleted && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <FontAwesomeIcon icon={faCalendarAlt} className="text-[10px]" />
                            Échéance : {rappel.dateRappel instanceof Date && !isNaN(rappel.dateRappel.getTime())
                              ? rappel.dateRappel.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Colonne droite : action requise OU bouton supprimer si terminé */}
                    {isCompleted ? (
                      <button
                        onClick={(e) => handleDeleteRappel(rappel, e)}
                        disabled={isDeleting}
                        className="flex-shrink-0 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border border-red-200"
                        title="Supprimer cette tâche de la base de données"
                      >
                        <FontAwesomeIcon icon={isDeleting ? faSync : faTrash} className={isDeleting ? 'animate-spin' : ''} />
                        <span className="hidden lg:inline">Supprimer</span>
                      </button>
                    ) : (
                      <div className="hidden md:block text-right flex-shrink-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5 text-amber-600">
                          Action requise
                        </div>
                        <div className="text-xs text-slate-600 font-medium max-w-[160px] truncate">{rappel.requiredAction}</div>
                      </div>
                    )}

                    {/* Bouton voir — uniquement si tâche active */}
                    {!isCompleted && rappel.courrier && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleViewCourrier(rappel); }}
                        className="flex-shrink-0 bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        <FontAwesomeIcon icon={faEye} />
                        <span className="hidden lg:inline">Voir</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== PANNEAU DETAIL COURRIER (Slide-over) ===== */}
      {selectedRappel && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity" onClick={closePanel} />
          
          {/* Panel */}
          <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-40 flex flex-col animate-slideInRight">
            {/* Header du panel */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div className="text-white">
                <h2 className="font-bold text-base">{selectedRappel.courrier?.numero || 'Courrier'}</h2>
                <p className="text-blue-100 text-xs mt-0.5">Détail du courrier</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenFullDetail(selectedRappel.courrierId)}
                  className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} className="text-[10px]" />
                  Page complète
                </button>
                <button
                  onClick={closePanel}
                  className="bg-white/20 hover:bg-white/30 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>

            {/* Contenu du panel */}
            <div className="flex-1 overflow-y-auto">
              {panelLoading ? (
                <div className="p-6 space-y-4 animate-pulse">
                  <div className="h-6 w-48 bg-slate-100 rounded" />
                  <div className="h-4 w-full bg-slate-50 rounded" />
                  <div className="h-4 w-3/4 bg-slate-50 rounded" />
                  <div className="h-32 bg-slate-50 rounded-xl" />
                </div>
              ) : panelCourrier ? (
                <div className="p-5 space-y-5">
                  {/* Infos du rappel / action requise */}
                  <div className={`rounded-xl border-l-4 px-4 py-3 ${
                    selectedRappel.actionCompleted ? 'bg-emerald-50 border-emerald-500' : 'bg-amber-50 border-amber-500'
                  }`}>
                    <div className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${
                      selectedRappel.actionCompleted ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {selectedRappel.actionCompleted ? 'Action effectuée' : 'Action en attente'}
                    </div>
                    <div className={`text-sm font-semibold ${
                      selectedRappel.actionCompleted ? 'text-emerald-900' : 'text-amber-900'
                    }`}>
                      {selectedRappel.requiredAction}
                    </div>
                    {selectedRappel.instructions && (
                      <div className="text-xs text-slate-600 mt-1">{selectedRappel.instructions}</div>
                    )}
                  </div>

                  {/* Informations courrier */}
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Informations du courrier</h3>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem icon={faFileAlt} label="Numéro" value={panelCourrier.numero} />
                      <InfoItem icon={faTag} label="Type" value={panelCourrier.type} />
                      <InfoItem icon={faCalendarAlt} label="Date réception" value={new Date(panelCourrier.dateReception).toLocaleDateString('fr-FR')} />
                      <InfoItem icon={faEnvelope} label="Expéditeur" value={panelCourrier.expediteur || '-'} />
                      <InfoItem icon={faUser} label="Destinataire" value={panelCourrier.destinataire || '-'} />
                      <InfoItem icon={faMapMarkerAlt} label="Direction" value={panelCourrier.direction || '-'} />
                    </div>

                    {/* Objet */}
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Objet</div>
                      <div className="text-sm text-slate-700">{panelCourrier.objet?.replace(/<[^>]*>/g, '') || 'Sans objet'}</div>
                    </div>

                    {/* Statut */}
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Statut</div>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        {panelCourrier.statut}
                      </span>
                    </div>

                    {/* Priorité */}
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Priorité</div>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        panelCourrier.priorite === 'URGENTE' ? 'bg-red-100 text-red-700' :
                        panelCourrier.priorite === 'HAUTE' ? 'bg-orange-100 text-orange-700' :
                        panelCourrier.priorite === 'NORMALE' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {panelCourrier.priorite}
                      </span>
                    </div>
                  </div>

                  {/* Échéance du rappel */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Échéance du rappel</h3>
                    <div className="text-sm font-medium text-slate-800">
                      {selectedRappel.dateRappel.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {getRetardInfo(selectedRappel.dateRappel) && (
                      <div className="mt-2 flex items-center gap-2 text-red-600 text-xs font-semibold bg-red-50 px-3 py-1.5 rounded-lg">
                        <FontAwesomeIcon icon={faExclamationTriangle} />
                        {getRetardInfo(selectedRappel.dateRappel)}
                      </div>
                    )}
                  </div>

                  {/* Assignation */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Assignation</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faUser} className="text-slate-400 text-xs w-4" />
                        <span className="text-slate-500">Assigné à :</span>
                        <span className="font-medium text-slate-800">{userService.getUserById(selectedRappel.assigneA)?.nom || 'Inconnu'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faUser} className="text-slate-400 text-xs w-4" />
                        <span className="text-slate-500">Par :</span>
                        <span className="font-medium text-slate-800">{userService.getUserById(selectedRappel.assignePar)?.nom || 'Inconnu'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bouton page complète */}
                  <button
                    onClick={() => handleOpenFullDetail(selectedRappel.courrierId)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} />
                    Ouvrir la page complète du courrier
                  </button>
                </div>
              ) : (
                <div className="p-6 text-center">
                  <div className="bg-red-50 rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-3">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 text-xl" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-1">Courrier introuvable</h3>
                  <p className="text-sm text-slate-500">ID : {selectedRappel.courrierId}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* CSS pour animation slide-in */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slideInRight {
          animation: slideInRight 0.25s ease-out;
        }
      `}</style>
    </div>
  );
};

// Composant utilitaire pour afficher une info
const InfoItem: React.FC<{ icon: any; label: string; value: string }> = ({ icon, label, value }) => (
  <div>
    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">
      <FontAwesomeIcon icon={icon} className="text-[9px]" />
      {label}
    </div>
    <div className="text-sm text-slate-800 font-medium truncate">{value}</div>
  </div>
);

export default Rappels;
