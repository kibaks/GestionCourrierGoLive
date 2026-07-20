import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { useAuth } from '../context/AuthContext';
import { useSyncStatus } from '../context/SyncStatusContext';
import { Role } from '../types';
import { simpleNotificationService } from '../services/simpleNotificationService';
import { storageSyncService } from '../services/storageSyncService';
import { laravelApiService } from '../services/laravelApiService';
import { fetchCourriers } from '../store/slices/courriersSlice';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useNetworkStatus } from '../context/NetworkStatusContext';
import { 
  faChartLine, 
  faFileAlt, 
  faPlusCircle, 
  faSyncAlt, 
  faBell, 
  faCog,
  faUser,
  faSignOutAlt,
  faChevronDown,
  faChevronRight,
  faTimes,
  faBars,
  faSitemap,
  faCalendar,
  faClock,
  faSearch,
  faDownload,
  faSun,
  faArchive,
  faExclamationTriangle,
  faBook,
  faFolder,
  faFilter,
  faSort
} from '@fortawesome/free-solid-svg-icons';

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

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user, logout, hasRole } = useAuth();
  const { online, isApiStatus } = useNetworkStatus();
  const syncStatus = useSyncStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const prevOnlineRef = useRef(online);
  const visibleRef = useRef(true);

  // Au retour en ligne : rejouer la file de sync vers l'API Laravel puis recharger les courriers
  useEffect(() => {
    if (online && isApiStatus && laravelApiService.isConfigured()) {
      const wasOffline = !prevOnlineRef.current;
      prevOnlineRef.current = true;
      if (wasOffline) {
        storageSyncService.processSyncQueueToLaravel().then((count) => {
          if (count > 0) {
            void dispatch(fetchCourriers());
          }
        });
      }
    } else {
      prevOnlineRef.current = online;
    }
  }, [online, isApiStatus, dispatch]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    // Charger les notifications : localStorage + API Laravel (cross-user)
    const loadNotifications = async () => {
      try {
        // Ne pas poller si onglet masqué
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

        // 1. Notifications locales (toujours disponibles, même hors ligne)
        const localNotifs = simpleNotificationService.getByUserId(user.id, { limit: 100 });

        // 2. Notifications API Laravel (créées par d'autres users) — seulement si en ligne
        let apiNotifs: Notification[] = [];
        if (online && isApiStatus && laravelApiService.isConfigured()) {
          try {
            const raw = await laravelApiService.getNotificationsByUser(user.id, { limit: 100 });
            apiNotifs = raw.map((n: any) => ({
              ...n,
              createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
              updatedAt: n.updatedAt ? new Date(n.updatedAt) : new Date(),
              readAt:    n.readAt    ? new Date(n.readAt)    : undefined,
              metadata:  n.metadata || {}, // S'assurer que metadata est un objet
            }));
          } catch {
            // silencieux — on utilise seulement le local
          }
        }

        // 3. Fusionner sans doublons (l'API prime sur le local pour le statut lu/non-lu)
        const merged = new Map<string, Notification>();
        localNotifs.forEach(n => merged.set(n.id, n));
        apiNotifs.forEach(n => merged.set(n.id, n));   // écrase le local si même ID
        const notifs = Array.from(merged.values())
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, 50);

        setNotifications(notifs);
      } catch (error) {
        console.error('❌ Erreur chargement notifications navbar:', error);
        setNotifications([]);
      }
    };

    // Vérifier les échéances et créer des rappels automatiques
    const checkEcheances = async () => {
      try {
        // Éviter les appels en arrière-plan si onglet masqué ou API offline
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        if (!online || !isApiStatus) return;
        console.log('📅 Vérification automatique des échéances...');
        const courrierService = (await import('../services/courrierServiceFirebase')).courrierServiceFirebase;
        await courrierService.checkEcheancesAndNotify();
        console.log('✅ Vérification des échéances terminée');
      } catch (error) {
        console.error('❌ Erreur lors de la vérification des échéances:', error);
      }
    };

    // Suivre visibilité onglet : on déclenche un refresh à la reprise
    const handleVisibility = () => {
      const isVisible = typeof document === 'undefined' ? true : document.visibilityState === 'visible';
      const wasVisible = visibleRef.current;
      visibleRef.current = isVisible;
      if (!wasVisible && isVisible) {
        loadNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    loadNotifications();
    checkEcheances(); // Vérifier au chargement

    // Recharger les notifications toutes les 60 secondes (mais seulement si onglet visible, voir garde-fous plus haut)
    const notificationInterval = setInterval(() => {
      loadNotifications();
    }, 60000);

    // Vérifier les échéances toutes les heures (3600000 ms)
    const echeanceInterval = setInterval(() => {
      checkEcheances();
    }, 3600000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(notificationInterval);
      clearInterval(echeanceInterval);
    };
  }, [user, online, isApiStatus]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const { pathname, search } = location;
  const searchParams = new URLSearchParams(search);
  const isActive = (path: string) => pathname === path;
  const isCourrierActive = pathname === '/courriers';
  const isEnregistrerActive = pathname === '/enregistrer' || pathname === '/enregistrer-liste';

  const isCourrierSubActive = (sens?: string, type?: string) => {
    if (!isCourrierActive) return false;
    const s = searchParams.get('sens') || '';
    const t = searchParams.get('type') || '';
    return (sens || '') === s && (type || '') === t;
  };
  const isEnregistrerSubActive = (sens?: string, type?: string) => {
    if (!isEnregistrerActive) return false;
    const s = searchParams.get('sens') || '';
    const t = searchParams.get('type') || '';
    return (sens || '') === s && (type || '') === t;
  };

  const [expandedCourriers, setExpandedCourriers] = useState(isCourrierActive);
  const [expandedEnregistrer, setExpandedEnregistrer] = useState(isEnregistrerActive);
  const [expandedCategories, setExpandedCategories] = useState(false);
  const [expandedCourriersEntrant, setExpandedCourriersEntrant] = useState(() => isCourrierActive && searchParams.get('sens') === 'ENTRANT');
  const [expandedCourriersSortant, setExpandedCourriersSortant] = useState(() => isCourrierActive && searchParams.get('sens') === 'SORTANT');
  const [expandedEnregistrerEntrant, setExpandedEnregistrerEntrant] = useState(() => isEnregistrerActive && searchParams.get('sens') === 'ENTRANT');
  const [expandedEnregistrerSortant, setExpandedEnregistrerSortant] = useState(() => isEnregistrerActive && searchParams.get('sens') === 'SORTANT');

  // Synchroniser les états d'expansion avec l'URL (pathname + search string)
  useEffect(() => {
    const params = new URLSearchParams(search);
    const sens = params.get('sens');
    if (pathname === '/courriers') {
      setExpandedCourriers(true);
      if (sens === 'ENTRANT') setExpandedCourriersEntrant(true);
      if (sens === 'SORTANT') setExpandedCourriersSortant(true);
    }
    if (pathname === '/enregistrer' || pathname === '/enregistrer-liste') {
      setExpandedEnregistrer(true);
      if (sens === 'ENTRANT') setExpandedEnregistrerEntrant(true);
      if (sens === 'SORTANT') setExpandedEnregistrerSortant(true);
    }
  }, [pathname, search]);

  const canEnregistrer = hasRole(Role.SECRETAIRE) || hasRole(Role.DIRECTEUR_GENERAL) || hasRole(Role.SUPER_ADMIN);

  // Détermine si le secrétaire connecté est celui de la Direction Générale (accès aux archives)
  const isSecretaireDG = useMemo(() => {
    if (!user || user.role !== Role.SECRETAIRE) return false;
    const dir = (user.direction || '').toLowerCase();
    return !dir || dir.includes('général') || dir.includes('general') || dir.includes('dg');
  }, [user]);

  const canVoirArchives = hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL) || isSecretaireDG;

  // Menu principal (secrétaire inclus) : tout le monde a accès au tableau de bord,
  // mais certaines sections avancées restent cachées au secrétaire (organigramme, annotations, planning).
  // Les archives sont accessibles au secrétaire de la Direction Générale.
  const simpleMenuItems = [
    { path: '/dashboard', label: 'Tableau de bord', icon: faChartLine },
    { path: '/rappels', label: 'Rappels', icon: faClock },
    { path: '/cahier-registre', label: 'Registre', icon: faBook },
    { path: '/archives', label: 'Archives', icon: faArchive, visible: canVoirArchives },
    { path: '/organigramme', label: 'Organigramme', icon: faSitemap, hiddenForRoles: [Role.SECRETAIRE] as Role[] },
    { path: '/workflow', label: 'Annotations', icon: faSyncAlt, hiddenForRoles: [Role.SECRETAIRE] as Role[] },
    { path: '/planning', label: 'Planning', icon: faCalendar, hiddenForRoles: [Role.SECRETAIRE] as Role[] },
    { path: '/notifications', label: 'Notifications', icon: faBell },
    { path: '/parametres', label: 'Paramètres', icon: faCog, roles: [Role.SUPER_ADMIN, Role.DIRECTEUR_GENERAL] as Role[] }
  ];

  const unreadNotifications = notifications.filter(n => !n.read).length;

  const pageTitle = pathname === '/dashboard' ? 'Tableau de bord'
    : pathname === '/courriers' ? (searchParams.get('sens') || searchParams.get('type') ? `Courriers · ${searchParams.get('sens') === 'ENTRANT' ? 'Entrant' : searchParams.get('sens') === 'SORTANT' ? 'Sortant' : ''} ${searchParams.get('type') === 'INTERNE' ? 'Interne' : searchParams.get('type') === 'EXTERNE' ? 'Externe' : ''}`.trim() : 'Courriers')
    : pathname === '/enregistrer' ? (searchParams.get('sens') || searchParams.get('type') ? `Enregistrer · ${searchParams.get('sens') === 'ENTRANT' ? 'Entrant' : searchParams.get('sens') === 'SORTANT' ? 'Sortant' : ''} ${searchParams.get('type') === 'INTERNE' ? 'Interne' : searchParams.get('type') === 'EXTERNE' ? 'Externe' : ''}`.trim() : 'Enregistrer')
    : pathname === '/enregistrer-liste' ? 'Enregistrer en liste'
    : pathname === '/registre' ? 'Registre des Courriers'
    : pathname === '/cahier-registre' ? 'Cahier Registre'
    : pathname === '/rappels' ? 'Rappels'
    : pathname === '/archives' ? 'Archives' : pathname === '/organigramme' ? 'Organigramme' : pathname === '/workflow' ? 'Annotations' : pathname === '/planning' ? 'Planning' : pathname === '/notifications' ? 'Notifications' : pathname === '/parametres' ? 'Paramètres' : pathname === '/profil' ? 'Mon profil' : 'Tableau de bord';

  return (
    <div className="h-screen bg-surface-100 bg-mesh flex flex-col overflow-hidden">
      {/* Barre de statut : hors-ligne OU synchronisation en cours */}
      {(!online || syncStatus.syncing) && (
        <div className={`text-white text-sm font-semibold px-4 py-2 flex items-center justify-center gap-3 z-50 ${
          !online ? 'bg-amber-600' : 'bg-primary-600'
        }`}>
          {syncStatus.syncing ? (
            <>
              {/* Indicateur circulaire SVG */}
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 36 36">
                <circle
                  cx="18" cy="18" r="15.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="3"
                />
                <circle
                  cx="18" cy="18" r="15.5"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeDasharray={`${syncStatus.progress * 0.974} 97.4`}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <span>{syncStatus.message || 'Synchronisation en cours...'}</span>
              <span className="opacity-80">{Math.round(syncStatus.progress)}%</span>
            </>
          ) : isApiStatus ? (
            <span>L'API Laravel est injoignable. Démarrez-la avec « php artisan serve » dans le dossier laravel-api, et vérifiez que VITE_LARAVEL_API_URL pointe vers http://localhost:8000.</span>
          ) : (
            <span>Pas de connexion internet : certaines données peuvent ne pas se charger.</span>
          )}
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar - fond bleu unifié, bords arrondis à droite sur desktop (masqué à l'impression) */}
        <aside className={`no-print ${
          `
          fixed inset-y-0 left-0 z-50 bg-sidebar-menu
          transform transition-all duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarCollapsed ? 'w-20' : 'w-72'}
          lg:translate-x-0 lg:static lg:inset-0
          lg:rounded-r-2xl lg:overflow-hidden
          `.trim()
        }`}
        style={{ 
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          WebkitTransform: sidebarOpen ? 'translateX(0) translateZ(0)' : 'translateX(-100%) translateZ(0)',
          transform: sidebarOpen ? 'translateX(0) translateZ(0)' : 'translateX(-100%) translateZ(0)',
          isolation: 'isolate'
        }}>
          <div className="flex flex-col h-full">
            {/* Logo — bloc épuré avec icône type “glass” */}
            <div className="flex-shrink-0 flex items-center justify-between h-20 px-5 border-b sidebar-border">
              <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/10">
                  <FontAwesomeIcon icon={faFileAlt} className="text-white text-lg" />
                </div>
                {!sidebarCollapsed && (
                  <div className="animate-fade-in">
                    <h1 className="text-lg font-bold sidebar-text tracking-tight">GestionCourriers</h1>
                    <p className="text-xs sidebar-text-muted -mt-0.5">Administration</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden sidebar-text-muted hover:sidebar-text transition-colors p-2.5 rounded-xl hover:bg-white/10"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
              </button>
            </div>

            {/* Collapse button for desktop — pastille flottante */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex absolute -right-3 top-24 w-7 h-7 bg-white rounded-full shadow-md items-center justify-center text-primary-600 hover:bg-primary-50 hover:scale-110 transition-all duration-200 z-10 ring-2 ring-primary-100"
              aria-label={sidebarCollapsed ? 'Ouvrir le menu' : 'Réduire le menu'}
            >
              <FontAwesomeIcon 
                icon={faChevronDown} 
                className={`w-3.5 h-3.5 transition-transform duration-300 ${sidebarCollapsed ? '-rotate-90' : 'rotate-90'}`} 
              />
            </button>

            {/* Menu — scroll personnalisé */}
            <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto min-h-0 sidebar-nav-scroll">
              {/* Tableau de bord — visible pour tous les rôles */}
              {user && (
              <Link
                to="/dashboard"
                className={`
                  group flex items-center rounded-xl transition-all duration-200
                  ${sidebarCollapsed ? 'px-3 py-3 justify-center' : 'px-3 py-2.5'}
                  ${isActive('/dashboard') ? 'bg-white/15 sidebar-text shadow-sm' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}
                  ${!sidebarCollapsed && (isActive('/dashboard') ? 'border-l-2 border-white/50 -ml-0.5 pl-3.5' : 'border-l-2 border-transparent')}
                `}
                title={sidebarCollapsed ? 'Tableau de bord' : undefined}
              >
                <div className={`
                  flex items-center justify-center rounded-lg transition-all duration-200 shrink-0
                  ${isActive('/dashboard') ? 'bg-white/25 sidebar-text' : 'sidebar-text-muted group-hover:sidebar-text'}
                  ${sidebarCollapsed ? 'w-10 h-10' : 'w-9 h-9 mr-3'}
                `}>
                  <FontAwesomeIcon icon={faChartLine} className="w-4 h-4" />
                </div>
                {!sidebarCollapsed && <span className="font-medium">Tableau de bord</span>}
                {!sidebarCollapsed && isActive('/dashboard') && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse-soft" />}
              </Link>
              )}

              {/* Courriers avec sous-menus (Sens × Type) */}
              {sidebarCollapsed ? (
                <Link to="/courriers" className="flex items-center justify-center px-3 py-3 rounded-xl sidebar-text-muted hover:bg-white/8 hover:sidebar-text transition-colors" title="Courriers">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${isCourrierActive ? 'bg-white/25 sidebar-text' : 'sidebar-text-muted'}`}>
                    <FontAwesomeIcon icon={faFileAlt} className="w-4 h-4" />
                  </div>
                </Link>
              ) : (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setExpandedCourriers(!expandedCourriers)}
                    className={`
                      w-full group flex items-center rounded-xl px-3 py-2.5 transition-all duration-200
                      ${isCourrierActive ? 'bg-white/15 sidebar-text' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}
                      ${!sidebarCollapsed && (isCourrierActive ? 'border-l-2 border-white/50 -ml-0.5 pl-3.5' : 'border-l-2 border-transparent')}
                    `}
                  >
                    <div className={`w-9 h-9 mr-3 flex items-center justify-center rounded-lg ${isCourrierActive ? 'bg-white/25 sidebar-text' : 'sidebar-text-muted group-hover:sidebar-text'}`}>
                      <FontAwesomeIcon icon={faFileAlt} className="w-4 h-4" />
                    </div>
                    <span className="font-medium flex-1 text-left">Courriers</span>
                    <FontAwesomeIcon icon={expandedCourriers ? faChevronDown : faChevronRight} className="w-3.5 h-3.5 sidebar-text-muted group-hover:sidebar-text" />
                  </button>
                  {expandedCourriers && (
                    <div className="ml-6 pl-4 mt-1.5 border-l-2 sidebar-border space-y-0.5 animate-fade-in">
                      <Link to="/courriers" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isCourrierSubActive() ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Tous</Link>
                      <button type="button" onClick={() => setExpandedCourriersEntrant(!expandedCourriersEntrant)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm sidebar-text-label hover:bg-white/8 hover:sidebar-text-muted text-left font-semibold uppercase tracking-wider">
                        Entrant
                        <FontAwesomeIcon icon={expandedCourriersEntrant ? faChevronDown : faChevronRight} className="w-3 h-3" />
                      </button>
                      {expandedCourriersEntrant && (
                        <div className="pl-3 ml-1 border-l border-white/15 space-y-0.5">
                          <Link to="/courriers?sens=ENTRANT&type=INTERNE" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isCourrierSubActive('ENTRANT', 'INTERNE') ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Interne</Link>
                          <Link to="/courriers?sens=ENTRANT&type=EXTERNE" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isCourrierSubActive('ENTRANT', 'EXTERNE') ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Externe</Link>
                        </div>
                      )}
                      <button type="button" onClick={() => setExpandedCourriersSortant(!expandedCourriersSortant)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm sidebar-text-label hover:bg-white/8 hover:sidebar-text-muted text-left font-semibold uppercase tracking-wider">
                        Sortant
                        <FontAwesomeIcon icon={expandedCourriersSortant ? faChevronDown : faChevronRight} className="w-3 h-3" />
                      </button>
                      {expandedCourriersSortant && (
                        <div className="pl-3 ml-1 border-l border-white/15 space-y-0.5">
                          <Link to="/courriers?sens=SORTANT&type=INTERNE" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isCourrierSubActive('SORTANT', 'INTERNE') ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Interne</Link>
                          <Link to="/courriers?sens=SORTANT&type=EXTERNE" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isCourrierSubActive('SORTANT', 'EXTERNE') ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Externe</Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Enregistrer avec sous-menus (Sens × Type) */}
              {canEnregistrer && (
                sidebarCollapsed ? (
                  <Link to="/enregistrer" className="flex items-center justify-center px-3 py-3 rounded-xl sidebar-text-muted hover:bg-white/8 hover:sidebar-text transition-colors" title="Enregistrer">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${isEnregistrerActive ? 'bg-white/25 sidebar-text' : 'sidebar-text-muted'}`}>
                      <FontAwesomeIcon icon={faPlusCircle} className="w-4 h-4" />
                    </div>
                  </Link>
                ) : (
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => setExpandedEnregistrer(!expandedEnregistrer)}
                      className={`
                        w-full group flex items-center rounded-xl px-3 py-2.5 transition-all duration-200
                        ${isEnregistrerActive ? 'bg-white/15 sidebar-text' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}
                        ${!sidebarCollapsed && (isEnregistrerActive ? 'border-l-2 border-white/50 -ml-0.5 pl-3.5' : 'border-l-2 border-transparent')}
                      `}
                    >
                      <div className={`w-9 h-9 mr-3 flex items-center justify-center rounded-lg ${isEnregistrerActive ? 'bg-white/25 sidebar-text' : 'sidebar-text-muted group-hover:sidebar-text'}`}>
                        <FontAwesomeIcon icon={faPlusCircle} className="w-4 h-4" />
                      </div>
                      <span className="font-medium flex-1 text-left">Enregistrer</span>
                      <FontAwesomeIcon icon={expandedEnregistrer ? faChevronDown : faChevronRight} className="w-3.5 h-3.5 sidebar-text-muted group-hover:sidebar-text" />
                    </button>
                    {expandedEnregistrer && (
                      <div className="ml-6 pl-4 mt-1.5 border-l-2 sidebar-border space-y-0.5 animate-fade-in">
                        <button type="button" onClick={() => setExpandedEnregistrerEntrant(!expandedEnregistrerEntrant)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm sidebar-text-label hover:bg-white/8 hover:sidebar-text-muted transition-colors text-left font-semibold uppercase tracking-wider">
                          Entrant
                          <FontAwesomeIcon icon={expandedEnregistrerEntrant ? faChevronDown : faChevronRight} className="w-3 h-3 opacity-80" />
                        </button>
                        {expandedEnregistrerEntrant && (
                          <div className="pl-3 ml-1 border-l border-white/15 space-y-0.5">
                            <Link to="/enregistrer?sens=ENTRANT&type=INTERNE" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isEnregistrerSubActive('ENTRANT', 'INTERNE') ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Interne</Link>
                            <Link to="/enregistrer?sens=ENTRANT&type=EXTERNE" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isEnregistrerSubActive('ENTRANT', 'EXTERNE') ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Externe</Link>
                          </div>
                        )}
                        <button type="button" onClick={() => setExpandedEnregistrerSortant(!expandedEnregistrerSortant)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm sidebar-text-label hover:bg-white/8 hover:sidebar-text-muted transition-colors text-left font-semibold uppercase tracking-wider">
                          Sortant
                          <FontAwesomeIcon icon={expandedEnregistrerSortant ? faChevronDown : faChevronRight} className="w-3 h-3 opacity-80" />
                        </button>
                        {expandedEnregistrerSortant && (
                          <div className="pl-3 ml-1 border-l border-white/15 space-y-0.5">
                            <Link to="/enregistrer?sens=SORTANT&type=INTERNE" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isEnregistrerSubActive('SORTANT', 'INTERNE') ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Interne</Link>
                            <Link to="/enregistrer?sens=SORTANT&type=EXTERNE" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${isEnregistrerSubActive('SORTANT', 'EXTERNE') ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>Externe</Link>
                          </div>
                        )}
                        {/* Enregistrer en liste */}
                        <Link to="/enregistrer-liste" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${pathname === '/enregistrer-liste' ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>
                          En liste
                        </Link>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* Catégories de courriers avec sous-menus */}
              {sidebarCollapsed ? (
                 <Link to="/gestion-categories" className="flex items-center justify-center px-3 py-3 rounded-xl sidebar-text-muted hover:bg-white/8 hover:sidebar-text transition-colors" title="Catégories">
                   <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${pathname === '/gestion-categories' || pathname === '/statistiques-categories' || pathname === '/statistiques-avancees' ? 'bg-white/25 sidebar-text' : 'sidebar-text-muted'}`}>
                    <FontAwesomeIcon icon={faFolder} className="w-4 h-4" />
                  </div>
                </Link>
              ) : (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setExpandedCategories(!expandedCategories)}
                    className={`
                      w-full group flex items-center rounded-xl px-3 py-2.5 transition-all duration-200
                      ${pathname === '/gestion-categories' || pathname === '/statistiques-categories' || pathname === '/statistiques-avancees' ? 'bg-white/15 sidebar-text' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}
                      ${!sidebarCollapsed && (pathname === '/gestion-categories' || pathname === '/statistiques-categories' || pathname === '/statistiques-avancees' ? 'border-l-2 border-white/50 -ml-0.5 pl-3.5' : 'border-l-2 border-transparent')}
                    `}
                  >
                    <div className={`w-9 h-9 mr-3 flex items-center justify-center rounded-lg ${pathname === '/gestion-categories' || pathname === '/statistiques-categories' || pathname === '/statistiques-avancees' ? 'bg-white/25 sidebar-text' : 'sidebar-text-muted group-hover:sidebar-text'}`}>
                      <FontAwesomeIcon icon={faFolder} className="w-4 h-4" />
                    </div>
                    <span className="font-medium flex-1 text-left">Catégories</span>
                    <FontAwesomeIcon icon={expandedCategories ? faChevronDown : faChevronRight} className="w-3.5 h-3.5 sidebar-text-muted group-hover:sidebar-text" />
                  </button>
                  {expandedCategories && (
                    <div className="ml-6 pl-4 mt-1.5 border-l-2 sidebar-border space-y-0.5 animate-fade-in">
                      <Link to="/gestion-categories" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${pathname === '/gestion-categories' ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>
                        Gérer les catégories
                      </Link>
                      <Link to="/statistiques-categories" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${pathname === '/statistiques-categories' ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>
                        Statistiques catégories
                      </Link>
                      <Link to="/statistiques-avancees" className={`block py-2 px-3 rounded-lg text-sm transition-colors ${pathname === '/statistiques-avancees' ? 'bg-white/20 sidebar-text font-semibold' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}`}>
                        Statistiques avancées
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Autres liens simples */}
              {simpleMenuItems.filter(item => item.path !== '/dashboard').map((item) => {
                const roles = 'roles' in item ? (item as { roles?: Role[] }).roles : undefined;
                if (roles && roles.length > 0 && !roles.some(r => hasRole(r))) return null;
                const hiddenFor = (item as { hiddenForRoles?: Role[] }).hiddenForRoles;
                if (hiddenFor?.length && user?.role && hiddenFor.includes(user.role)) return null;
                const visible = (item as { visible?: boolean }).visible;
                if (visible === false) return null;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`
                      group flex items-center rounded-xl transition-all duration-200
                      ${sidebarCollapsed ? 'px-3 py-3 justify-center' : 'px-3 py-2.5'}
                      ${isActive(item.path) ? 'bg-white/15 sidebar-text shadow-sm' : 'sidebar-text-muted hover:bg-white/8 hover:sidebar-text'}
                      ${!sidebarCollapsed && (isActive(item.path) ? 'border-l-2 border-white/50 -ml-0.5 pl-3.5' : 'border-l-2 border-transparent')}
                    `}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <div className={`
                      flex items-center justify-center rounded-lg transition-all duration-200 shrink-0
                      ${isActive(item.path) ? 'bg-white/25 sidebar-text' : 'sidebar-text-muted group-hover:sidebar-text'}
                      ${sidebarCollapsed ? 'w-10 h-10' : 'w-9 h-9 mr-3'}
                    `}>
                      <FontAwesomeIcon icon={item.icon} className="w-4 h-4" />
                    </div>
                    {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
                    {!sidebarCollapsed && isActive(item.path) && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse-soft" />}
                  </Link>
                );
              })}
            </nav>

            {/* User info — bloc type carte en bas du sidebar */}
            <div className={`flex-shrink-0 p-3 border-t sidebar-border ${sidebarCollapsed ? 'px-2' : ''}`}>
              <div className={`
                rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-3
                flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}
              `}>
                {user?.photoUrl ? (
                  <img 
                    src={user.photoUrl} 
                    alt={user.nom} 
                    className="w-11 h-11 rounded-xl border-2 border-white/20 shadow-md object-cover ring-2 ring-white/5" 
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-white/20 border border-white/20 flex items-center justify-center sidebar-text font-semibold shadow-md ring-2 ring-white/5">
                    {user?.nom.charAt(0).toUpperCase()}
                  </div>
                )}
                {!sidebarCollapsed && (
                  <div className="flex-1 min-w-0 animate-fade-in">
                    <p className="text-sm font-semibold sidebar-text truncate">{user?.nom}</p>
                    <p className="text-xs sidebar-text-muted truncate flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-soft shrink-0" />
                      {user?.role}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Overlay pour mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            style={{
              willChange: 'opacity',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)',
              isolation: 'isolate'
            }}
          />
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-surface-100/50">
          {/* Header — barre épurée, bordure douce (masqué à l'impression) */}
          <header className="no-print flex-shrink-0 bg-white/95 lg:bg-white/90 backdrop-blur-md border-b border-surface-200/80 h-20 flex items-center justify-between px-4 sm:px-6 z-[100] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          style={{
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            WebkitTransform: 'translateZ(0)',
            transform: 'translateZ(0)',
            isolation: 'isolate'
          }}>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-surface-500 hover:text-surface-700 p-2.5 rounded-xl hover:bg-surface-100 transition-all"
              >
                <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
              </button>
              
              <div className="hidden md:block">
                <h2 className="text-xl font-bold text-surface-900 tracking-tight">
                  {pageTitle}
                </h2>
                <p className="text-sm text-surface-600 -mt-0.5">
                  Bienvenue, <span className="font-semibold text-primary-600">{user?.nom}</span>
                </p>
              </div>
            </div>

            {/* Barre de recherche */}
            <div className={`hidden lg:flex items-center transition-all duration-300 ${searchFocused ? 'w-96' : 'w-72'}`}>
              <div className="relative w-full">
                <FontAwesomeIcon 
                  icon={faSearch} 
                  className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${searchFocused ? 'text-primary-500' : 'text-surface-400'}`} 
                />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="w-full pl-11 pr-4 py-2.5 bg-surface-100/80 border border-surface-200 rounded-xl text-sm text-surface-700 placeholder-surface-400 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all duration-200"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Mode jour indicator */}
              <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50/90 text-amber-600 border border-amber-100 mr-2">
                <FontAwesomeIcon icon={faSun} className="w-4 h-4" />
                <span className="text-xs font-semibold">Mode Jour</span>
              </div>

              {/* Notifications */}
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2.5 text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-xl transition-all focus:outline-none"
                >
                  <FontAwesomeIcon icon={faBell} className="w-5 h-5" />
                  {unreadNotifications > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-gradient-to-br from-red-400 to-red-600 text-[10px] text-white font-bold items-center justify-center">
                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                      </span>
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[199] bg-slate-900/20 backdrop-blur-sm"
                      aria-hidden
                      onClick={() => setNotificationsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-[400px] max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 z-[200] overflow-hidden animate-slide-in">
                      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-primary-50/80 to-slate-50">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-bold text-slate-900">Notifications</h3>
                          {unreadNotifications > 0 && (
                            <span className="px-3 py-1.5 bg-primary-500 text-white text-xs font-semibold rounded-xl shadow-sm">
                              {unreadNotifications} nouveau{unreadNotifications > 1 ? 'x' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto p-2 space-y-1.5">
                        {notifications.length > 0 ? (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={`rounded-xl p-4 cursor-pointer transition-all group ${
                                !notif.read ? 'bg-primary-50/60 hover:bg-primary-50' : 'hover:bg-slate-50'
                              }`}
                              onClick={async () => {
                                console.log('🔔 [Layout Dropdown] Clic notification:', {
                                  id: notif.id,
                                  title: notif.title,
                                  actionUrl: notif.actionUrl,
                                  relatedId: notif.relatedId,
                                  relatedType: notif.relatedType,
                                  metadata: notif.metadata
                                });
                                if (!notif.read) {
                                  simpleNotificationService.markAsRead(notif.id);
                                  setNotifications(prev => 
                                    prev.map(n => n.id === notif.id ? { ...n, read: true, readAt: new Date() } : n)
                                  );
                                }
                                if (notif.actionUrl) {
                                  console.log('🔔 [Layout Dropdown] Navigation vers:', notif.actionUrl);
                                  navigate(notif.actionUrl);
                                  setNotificationsOpen(false);
                                } else {
                                  console.log('🔔 [Layout Dropdown] Pas d\'actionUrl');
                                }
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                  notif.type === 'assignation'
                                    ? 'bg-primary-100 text-primary-600'
                                    : notif.type === 'echeance'
                                    ? 'bg-red-100 text-red-600'
                                    : notif.type === 'rappel'
                                    ? 'bg-amber-100 text-amber-600'
                                    : notif.type === 'workflow'
                                    ? 'bg-violet-100 text-violet-600'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  <FontAwesomeIcon
                                    icon={
                                      notif.type === 'assignation' ? faFileAlt :
                                      notif.type === 'echeance' ? faExclamationTriangle :
                                      faBell
                                    }
                                    className="w-5 h-5"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 group-hover:text-primary-600 transition-colors line-clamp-1">
                                    {notif.title}
                                  </p>
                                  <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{notif.message}</p>
                                  <p className="text-xs text-slate-400 mt-1.5">
                                    {new Date(notif.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {notif.metadata?.type === 'accuse_reception_disponible' && notif.relatedId && (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        console.log('🔔 [Layout Dropdown] Téléchargement AR pour courrier:', notif.relatedId);
                                        try {
                                          // Rediriger vers le courrier pour accéder à l'AR
                                          navigate(`/courriers/${notif.relatedId}`);
                                          setNotificationsOpen(false);
                                        } catch (error) {
                                          console.error('Erreur téléchargement AR:', error);
                                        }
                                      }}
                                      className="p-2 text-xs bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors flex-shrink-0"
                                      title="Télécharger l'accusé de réception"
                                    >
                                      <FontAwesomeIcon icon={faDownload} className="w-3 h-3" />
                                    </button>
                                  )}
                                  {!notif.read && (
                                    <div className="w-2.5 h-2.5 rounded-full bg-primary-500 flex-shrink-0 mt-2" />
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="py-12 px-4 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                              <FontAwesomeIcon icon={faBell} className="w-7 h-7 text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">Aucune notification</p>
                          </div>
                        )}
                      </div>
                      {notifications.length > 0 && (
                        <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex gap-2 rounded-b-2xl">
                          {unreadNotifications > 0 && (
                            <button
                              onClick={async () => {
                                if (user) {
                                  simpleNotificationService.markAllAsRead(user.id);
                                  setNotifications(prev => 
                                    prev.map(n => ({ ...n, read: true, readAt: new Date() }))
                                  );
                                }
                              }}
                              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-primary-600 hover:bg-primary-50 transition-colors"
                            >
                              Tout marquer comme lu
                            </button>
                          )}
                          <Link
                            to="/notifications"
                            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-center text-slate-700 hover:bg-slate-100 transition-colors"
                            onClick={() => setNotificationsOpen(false)}
                          >
                            Voir tout
                          </Link>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Profile Menu */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-100 transition-all focus:outline-none"
                >
                  {user?.photoUrl ? (
                    <img src={user.photoUrl} alt={user.nom} className="w-10 h-10 rounded-xl object-cover border-2 border-surface-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-semibold shadow-md">
                      {user?.nom.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <FontAwesomeIcon 
                    icon={faChevronDown} 
                    className={`w-3 h-3 text-surface-400 transition-transform duration-200 ${profileMenuOpen ? 'rotate-180' : ''}`} 
                  />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-surface-200 z-[200] overflow-hidden animate-slide-in">
                    <div className="px-5 py-4 bg-gradient-to-r from-primary-500 to-secondary-500">
                      <p className="font-bold text-white">{user?.nom}</p>
                      <p className="text-sm text-white/80">{user?.email}</p>
                    </div>
                    <div className="py-2">
                      <Link
                        to="/profil"
                        className="flex items-center gap-3 px-5 py-3 text-sm text-surface-700 hover:bg-surface-50 transition-colors"
                        onClick={() => setProfileMenuOpen(false)}
                      >
                        <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center text-surface-600">
                          <FontAwesomeIcon icon={faUser} className="w-4 h-4" />
                        </div>
                        <span className="font-medium">Mon profil</span>
                      </Link>
                      {(hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL)) && (
                        <Link
                          to="/parametres"
                          className="flex items-center gap-3 px-5 py-3 text-sm text-surface-700 hover:bg-surface-50 transition-colors"
                          onClick={() => setProfileMenuOpen(false)}
                        >
                          <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center text-surface-600">
                            <FontAwesomeIcon icon={faCog} className="w-4 h-4" />
                          </div>
                          <span className="font-medium">Paramètres</span>
                        </Link>
                      )}
                    </div>
                    <div className="border-t border-surface-100 py-2">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-5 py-3 w-full text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center text-red-500">
                          <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" />
                        </div>
                        <span className="font-medium">Déconnexion</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main content — zone de scroll avec padding et transition */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-6 min-h-0 bg-transparent scroll-smooth">
            <div className="animate-fade-in max-w-[1600px] mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
