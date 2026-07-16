import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';
import { simpleNotificationService } from '../services/simpleNotificationService';
import { laravelApiService } from '../services/laravelApiService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faEnvelope, faCheckCircle, faTimesCircle, faSearch, faFilter, faClock, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

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
  createdAt: Date;
  updatedAt: Date;
}

const NotificationsModule: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  // Vérifier les permissions - tous les utilisateurs connectés peuvent voir les notifications
  const canViewNotifications = !!user;

  useEffect(() => {
    if (!canViewNotifications) {
      setLoading(false);
      return;
    }

    loadNotifications();
  }, [user, canViewNotifications]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const uid = user?.id || '';

      // 1. Local
      const localNotifs = simpleNotificationService.getByUserId(uid, { limit: 100 });

      // 2. API Laravel (cross-user)
      let apiNotifs: Notification[] = [];
      if (laravelApiService.isConfigured()) {
        try {
          const raw = await laravelApiService.getNotificationsByUser(uid, { limit: 100 });
          apiNotifs = raw.map((n: any) => ({
            ...n,
            createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
            updatedAt: n.updatedAt ? new Date(n.updatedAt) : new Date(),
            readAt:    n.readAt    ? new Date(n.readAt)    : undefined,
          }));
        } catch { /* silencieux */ }
      }

      // 3. Fusionner sans doublons
      const merged = new Map<string, Notification>();
      localNotifs.forEach(n => merged.set(n.id, n));
      apiNotifs.forEach(n => merged.set(n.id, n));
      const data = Array.from(merged.values())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setNotifications(data);
    } catch (error) {
      console.error('Erreur lors du chargement des notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

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
      console.error('Erreur lors du marquage de la notification:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      if (notifications.filter(n => !n.read).length === 0) return;
      simpleNotificationService.markAllAsRead(user?.id || '');
      setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: new Date() })));
      if (laravelApiService.isConfigured()) {
        laravelApiService.markAllNotificationsAsRead(user?.id || '').catch(() => {});
      }
    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications:', error);
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    // Filtrage par recherche
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesTitle = notification.title.toLowerCase().includes(searchLower);
      const matchesMessage = notification.message.toLowerCase().includes(searchLower);
      
      if (!matchesTitle && !matchesMessage) {
        return false;
      }
    }

    // Filtrage par statut
    if (filter === 'unread') {
      return !notification.read;
    } else if (filter === 'read') {
      return notification.read;
    }

    return true;
  });

  const getTypeIcon = (type: Notification['type']) => {
    switch (type) {
      case 'courrier': return faEnvelope;
      case 'assignation': return faCheckCircle;
      case 'rappel': return faClock;
      case 'echeance': return faTimesCircle;
      case 'workflow': return faInfoCircle;
      default: return faBell;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!canViewNotifications) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <FontAwesomeIcon icon={faTimesCircle} className="text-red-500 text-3xl mb-4" />
          <h2 className="text-xl font-bold text-red-800 mb-2">Accès non autorisé</h2>
          <p className="text-red-600">
            Vous n'avez pas les permissions nécessaires pour accéder au module des notifications.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Notifications</h1>
            <p className="text-slate-600">
              Gérez vos notifications et restez informé des activités importantes
            </p>
          </div>
          {unreadCount > 0 && (
            <div className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <FontAwesomeIcon 
                icon={faSearch} 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Rechercher une notification..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'unread' 
                  ? 'bg-orange-600 text-white' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Non lues
            </button>
            <button
              onClick={() => setFilter('read')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'read' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Lues
            </button>
          </div>
        </div>
        
        {unreadCount > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
              Marquer toutes comme lues
            </button>
          </div>
        )}
      </div>

      {/* Liste des notifications */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-600">Chargement des notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <FontAwesomeIcon icon={faBell} className="text-slate-400 text-3xl mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {searchTerm || filter !== 'all'
                ? 'Aucune notification trouvée'
                : 'Aucune notification pour le moment'
              }
            </h3>
            <p className="text-slate-600">
              {searchTerm || filter !== 'all'
                ? 'Essayez de modifier votre recherche ou vos filtres.'
                : 'Les notifications apparaîtront ici lorsqu\'elles seront créées.'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredNotifications.map((notification) => (
              <div 
                key={notification.id} 
                className={`p-4 hover:bg-slate-50 transition-colors ${
                  !notification.read ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <FontAwesomeIcon 
                        icon={getTypeIcon(notification.type)} 
                        className="text-slate-600"
                      />
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                    
                    <div className="mb-2">
                      <h3 className="font-medium text-slate-900 mb-1">
                        {notification.title}
                      </h3>
                      <p className="text-slate-600 text-sm">
                        {notification.message}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <FontAwesomeIcon icon={faClock} />
                        <span>
                          {notification.createdAt.toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      {notification.readAt && (
                        <div className="flex items-center gap-1">
                          <FontAwesomeIcon icon={faCheckCircle} />
                          <span>Lu le {notification.readAt.toLocaleDateString('fr-FR')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    {!notification.read && (
                      <button
                        onClick={() => handleMarkAsRead(notification.id)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        Marquer comme lu
                      </button>
                    )}
                    {notification.actionUrl && (
                      <button
                        onClick={() => window.open(notification.actionUrl, '_blank')}
                        className="px-3 py-1.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                      >
                        Voir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsModule;
