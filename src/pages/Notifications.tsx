import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { simpleNotificationService } from '../services/simpleNotificationService';
import { laravelApiService } from '../services/laravelApiService';
import { notificationService } from '../services/notificationService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faEnvelope,
  faEnvelopeOpen,
  faTrash,
  faCheckDouble,
  faSearch,
  faFileAlt,
  faExclamationTriangle,
  faSyncAlt,
  faInbox,
  faChevronLeft,
  faArrowRight,
  faFilter,
  faTimes,
  faTrashAlt
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

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  
  // Ref pour éviter les rechargements multiples
  const isLoadingRef = useRef(false);
  const lastLoadTime = useRef(0);
  const lastDeleteTime = useRef(0);

  useEffect(() => {
    if (!user) return;

    const loadNotifications = async () => {
      // Éviter les rechargements multiples (debounce de 3 secondes)
      const now = Date.now();
      if (isLoadingRef.current || (now - lastLoadTime.current) < 3000) {
        return;
      }

      // Éviter le chargement depuis l'API pendant 10 secondes après suppression
      const skipApi = (now - lastDeleteTime.current) < 10000;

      isLoadingRef.current = true;
      lastLoadTime.current = now;
      setLoading(true);

      try {
        console.log('📥 Chargement des notifications pour utilisateur:', user.id, skipApi ? '(API skip - après suppression)' : '');
        // 1. Local
        const localNotifs = simpleNotificationService.getByUserId(user.id, { limit: 100 });

        // 2. API Laravel (notifications créées par d'autres utilisateurs) - seulement si pas de suppression récente
        let apiNotifs: Notification[] = [];
        if (!skipApi && laravelApiService.isConfigured()) {
          try {
            const raw = await laravelApiService.getNotificationsByUser(user.id, { limit: 100 });
            apiNotifs = raw.map((n: any) => ({
              ...n,
              createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
              updatedAt: n.updatedAt ? new Date(n.updatedAt) : new Date(),
              readAt:    n.readAt    ? new Date(n.readAt)    : undefined,
            }));
          } catch { /* silencieux */ }
        }

        // 3. Fusionner (API prime sur local pour le statut lu/non-lu)
        const merged = new Map<string, Notification>();
        localNotifs.forEach(n => merged.set(n.id, n));
        apiNotifs.forEach(n => merged.set(n.id, n));
        const notifs = Array.from(merged.values())
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        console.log('📋 Notifications (local:', localNotifs.length, '+ API:', apiNotifs.length, '= fusionnées:', notifs.length, ')');
        setNotifications(notifs);
        applyFilters(notifs, filter, searchQuery);
      } catch (error) {
        console.error('❌ Erreur chargement notifications:', error);
      } finally {
        setLoading(false);
        isLoadingRef.current = false;
      }
    };

    loadNotifications();

    // Pas d'abonnement nécessaire avec le service simple (localStorage)
    // Recharger toutes les 30 secondes pour les mises à jour
    const interval = setInterval(() => {
      loadNotifications();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [user, filter, searchQuery]);

  const applyFilters = (
    notifs: Notification[],
    statusFilter: typeof filter,
    search: string
  ) => {
    let filtered = [...notifs];

    if (statusFilter === 'unread') {
      filtered = filtered.filter(n => !n.read);
    } else if (statusFilter === 'read') {
      filtered = filtered.filter(n => n.read);
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.message.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setFilteredNotifications(filtered);
  };

  useEffect(() => {
    applyFilters(notifications, filter, searchQuery);
  }, [filter, searchQuery, notifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      simpleNotificationService.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true, readAt: new Date() } : n)
      );
      if (laravelApiService.isConfigured()) {
        laravelApiService.markNotificationAsRead(notificationId).catch(() => {});
      }
    } catch (error) {
      console.error('❌ Erreur marquage comme lu:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      simpleNotificationService.markAllAsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: new Date() })));
      if (laravelApiService.isConfigured()) {
        laravelApiService.markAllNotificationsAsRead(user.id).catch(() => {});
      }
    } catch (error) {
      console.error('❌ Erreur marquage toutes comme lues:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (selectedNotification?.id === notificationId) {
        setSelectedNotification(null);
        setViewMode('list');
      }
      // Marquer le moment de la suppression pour éviter le rechargement API
      lastDeleteTime.current = Date.now();
    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedNotifications);
    await Promise.allSettled(ids.map(id => notificationService.deleteNotification(id)));
    setNotifications(prev => prev.filter(n => !selectedNotifications.has(n.id)));
    setSelectedNotifications(new Set());
    // Marquer le moment de la suppression pour éviter le rechargement API
    lastDeleteTime.current = Date.now();
  };

  const handleDeleteAll = async () => {
    const confirmMessage = '⚠️ ATTENTION : Cette action est irréversible !\n\n' +
      `Voulez-vous vraiment supprimer TOUTES les notifications (${notifications.length}) ?\n\n` +
      'Cette action ne peut pas être annulée.';
    if (!window.confirm(confirmMessage)) return;

    await notificationService.deleteAllNotifications(user?.id);
    setNotifications([]);
    setFilteredNotifications([]);
    setSelectedNotifications(new Set());
    setSelectedNotification(null);
    setViewMode('list');

    // Marquer le moment de la suppression pour éviter le rechargement API
    lastDeleteTime.current = Date.now();

    // Forcer un rechargement depuis localStorage uniquement pour éviter la réintroduction via l'API
    if (user) {
      const localNotifs = simpleNotificationService.getByUserId(user.id, { limit: 100 });
      setNotifications(localNotifs);
      applyFilters(localNotifs, filter, searchQuery);
    }
  };

  const handleSelectNotification = (notification: Notification) => {
    console.log('🔔 [Notifications] Clic notification:', {
      id: notification.id,
      title: notification.title,
      actionUrl: notification.actionUrl,
      relatedId: notification.relatedId,
      relatedType: notification.relatedType
    });
    
    if (!notification.read) {
      handleMarkAsRead(notification.id);
    }
    if (notification.actionUrl) {
      console.log('🔔 [Notifications] Navigation vers:', notification.actionUrl);
      navigate(notification.actionUrl);
    } else {
      console.log('🔔 [Notifications] Pas d\'actionUrl, ouverture détail');
      setSelectedNotification(notification);
      setViewMode('detail');
    }
  };

  const handleNavigate = (notification: Notification) => {
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'assignation':
        return faFileAlt;
      case 'echeance':
        return faExclamationTriangle;
      case 'rappel':
        return faBell;
      case 'workflow':
        return faSyncAlt;
      case 'courrier':
        return faFileAlt;
      case 'system':
        return faBell;
      default:
        return faEnvelope;
    }
  };

  const getNotificationStyle = (type: Notification['type'], priority: Notification['priority']) => {
    if (priority === 'urgent') return { bg: 'bg-red-50', border: 'border-red-200', icon: 'bg-red-100 text-red-600', badge: 'bg-red-500' };
    if (priority === 'high') return { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'bg-orange-100 text-orange-600', badge: 'bg-orange-500' };
    if (type === 'echeance') return { bg: 'bg-red-50', border: 'border-red-200', icon: 'bg-red-100 text-red-600', badge: 'bg-red-500' };
    if (type === 'assignation') return { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'bg-blue-100 text-blue-600', badge: 'bg-blue-500' };
    if (type === 'rappel') return { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'bg-amber-100 text-amber-600', badge: 'bg-amber-500' };
    if (type === 'workflow') return { bg: 'bg-violet-50', border: 'border-violet-200', icon: 'bg-violet-100 text-violet-600', badge: 'bg-violet-500' };
    return { bg: 'bg-slate-50', border: 'border-slate-200', icon: 'bg-slate-100 text-slate-600', badge: 'bg-slate-500' };
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredUnreadCount = filteredNotifications.filter(n => !n.read).length;

  const filterPills = [
    { value: 'all' as const, label: 'Toutes' },
    { value: 'unread' as const, label: 'Non lues' },
    { value: 'read' as const, label: 'Lues' },
  ];

  if (viewMode === 'detail' && selectedNotification) {
    const style = getNotificationStyle(selectedNotification.type, selectedNotification.priority);
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <button
            onClick={() => {
              setViewMode('list');
              setSelectedNotification(null);
            }}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium mb-6 transition-colors"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
            Retour aux notifications
          </button>

          <article className={`rounded-2xl border-2 ${style.border} ${style.bg} overflow-hidden shadow-lg`}>
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${style.icon} shadow-inner`}>
                    <FontAwesomeIcon icon={getNotificationIcon(selectedNotification.type)} className="w-7 h-7" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                      {selectedNotification.title}
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                      {new Date(selectedNotification.createdAt).toLocaleString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${style.badge}`}>
                        {selectedNotification.priority}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedNotification.read && (
                    <button
                      onClick={() => handleMarkAsRead(selectedNotification.id)}
                      className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                      title="Marquer comme lu"
                    >
                      <FontAwesomeIcon icon={faEnvelopeOpen} className="w-5 h-5 text-slate-600" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(selectedNotification.id)}
                    className="p-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                    title="Supprimer"
                  >
                    <FontAwesomeIcon icon={faTrash} className="w-5 h-5" />
                  </button>
                  {selectedNotification.actionUrl && (
                    <button
                      onClick={() => handleNavigate(selectedNotification)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 shadow-md shadow-primary-500/25 transition-all"
                    >
                      Voir le détail
                      <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200/80">
                <p className="text-slate-700 text-base leading-relaxed whitespace-pre-line">
                  {selectedNotification.message}
                </p>
              </div>

              {selectedNotification.metadata && Object.keys(selectedNotification.metadata).length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200/80">
                  <h3 className="font-semibold text-slate-900 mb-3">Détails supplémentaires</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(selectedNotification.metadata).map(([key, value]) => (
                      <div key={key} className="flex rounded-xl bg-white/80 px-4 py-2.5 border border-slate-100">
                        <span className="font-medium text-slate-600 w-36 shrink-0 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}:
                        </span>
                        <span className="text-slate-800">
                          {value instanceof Date ? value.toLocaleString('fr-FR') : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <FontAwesomeIcon icon={faBell} className="w-7 h-7 text-white" />
                </div>
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[1.4rem] h-[1.4rem] bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center px-1 shadow-md">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Notifications</h1>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <p className="text-slate-500 text-sm">
                    {unreadCount > 0
                      ? <span><span className="font-bold text-blue-600">{unreadCount}</span> non lue{unreadCount > 1 ? 's' : ''} sur {notifications.length}</span>
                      : <span className="text-emerald-600 font-medium">Toutes lues ✓</span>}
                  </p>
                  {filteredNotifications.length !== notifications.length && (
                    <span className="text-xs text-slate-400">{filteredNotifications.length} affichées</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {selectedNotifications.size > 0 ? (
                <>
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 font-semibold text-sm transition-all"
                  >
                    <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                    Supprimer ({selectedNotifications.size})
                  </button>
                  <button
                    onClick={() => setSelectedNotifications(new Set())}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold text-sm transition-all"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={unreadCount === 0}
                  >
                    <FontAwesomeIcon icon={faCheckDouble} className="w-4 h-4" />
                    Tout marquer comme lu
                  </button>
                  <button
                    onClick={handleDeleteAll}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={notifications.length === 0}
                    title="Supprimer toutes les notifications"
                  >
                    <FontAwesomeIcon icon={faTrashAlt} className="w-4 h-4" />
                    Tout supprimer
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recherche et filtres */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher dans les notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <FontAwesomeIcon icon={faFilter} className="w-4 h-4" />
              Filtres
            </span>
            {filterPills.map((pill) => (
              <button
                key={pill.value}
                onClick={() => setFilter(pill.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  filter === pill.value
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-500/25'
                    : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="rounded-2xl border-2 border-slate-100 bg-white p-5 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-40 bg-slate-100 rounded-lg" />
                      <div className="h-4 w-12 bg-slate-100 rounded-full" />
                    </div>
                    <div className="h-3 w-64 bg-slate-50 rounded-lg" />
                    <div className="h-3 w-32 bg-slate-50 rounded-lg" />
                  </div>
                  <div className="h-9 w-9 bg-slate-100 rounded-xl flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 rounded-2xl bg-white border border-dashed border-slate-200">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center mb-5 shadow-inner">
                <FontAwesomeIcon icon={faInbox} className="w-9 h-9 text-slate-300" />
              </div>
              <p className="text-slate-700 font-extrabold text-lg">Aucune notification</p>
              <p className="text-slate-500 text-sm mt-2 text-center max-w-sm leading-relaxed">
                {searchQuery || filter !== 'all'
                  ? 'Aucun résultat pour ces filtres. Essayez de modifier votre recherche.'
                  : "Vous n'avez pas encore de notifications. Elles apparaîtront ici automatiquement."}
              </p>
              {(searchQuery || filter !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setFilter('all'); }}
                  className="mt-5 px-5 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-semibold text-sm hover:bg-blue-100 transition-all"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const style = getNotificationStyle(notification.type, notification.priority);
              const isSelected = selectedNotifications.has(notification.id);
              return (
                <div
                  key={notification.id}
                  onClick={() => {
                    if (selectedNotifications.size > 0) {
                      const newSelected = new Set(selectedNotifications);
                      if (newSelected.has(notification.id)) newSelected.delete(notification.id);
                      else newSelected.add(notification.id);
                      setSelectedNotifications(newSelected);
                    } else {
                      handleSelectNotification(notification);
                    }
                  }}
                  className={`group rounded-2xl border transition-all cursor-pointer overflow-hidden hover:-translate-y-px ${
                    !notification.read
                      ? `${style.border} ${style.bg} shadow-md hover:shadow-lg`
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
                  } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                >
                  <div className="p-4 sm:p-5 flex items-start gap-4">
                    {selectedNotifications.size > 0 && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          const newSelected = new Set(selectedNotifications);
                          if (e.target.checked) newSelected.add(notification.id);
                          else newSelected.delete(notification.id);
                          setSelectedNotifications(newSelected);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-5 h-5 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500"
                      />
                    )}
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${style.icon}`}>
                      <FontAwesomeIcon icon={getNotificationIcon(notification.type)} className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`font-semibold ${!notification.read ? 'text-slate-900' : 'text-slate-600'}`}>
                              {notification.title}
                            </h3>
                            {!notification.read && (
                              <span className="w-2.5 h-2.5 rounded-full bg-primary-500 shrink-0" />
                            )}
                            <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
                              notification.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                              notification.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {notification.priority}
                            </span>
                          </div>
                          <p className={`text-sm mt-1 line-clamp-2 ${!notification.read ? 'text-slate-700' : 'text-slate-500'}`}>
                            {notification.message}
                          </p>
                          <p className="text-xs text-slate-400 mt-2">
                            {new Date(notification.createdAt).toLocaleString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {!notification.read && (
                            <button
                              onClick={() => handleMarkAsRead(notification.id)}
                              className="p-2.5 rounded-xl hover:bg-white/80 transition-colors"
                              title="Marquer comme lu"
                            >
                              <FontAwesomeIcon icon={faEnvelopeOpen} className="w-4 h-4 text-slate-500" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(notification.id)}
                            className="p-2.5 rounded-xl hover:bg-red-100 text-red-500 transition-colors"
                            title="Supprimer"
                          >
                            <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications;
