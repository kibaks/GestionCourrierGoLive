import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';
import { Role, Utilisateur } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faUser, 
  faEnvelope, 
  faShieldAlt, 
  faBuilding, 
  faUsers,
  faEdit,
  faSave,
  faTimes,
  faCamera,
  faCheckCircle,
  faUserTie,
  faIdCard
} from '@fortawesome/free-solid-svg-icons';

const Profil: React.FC = () => {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    nom: user?.nom || '',
    email: user?.email || ''
  });
  const [visibleUsers, setVisibleUsers] = useState<Utilisateur[]>([]);

  useEffect(() => {
    if (user) {
      const users = userService.getVisibleUsers(user.id);
      setVisibleUsers(users);
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Mettre à jour le profil
    setEditing(false);
  };

  const getRoleColor = (role: Role) => {
    switch (role) {
      case Role.SUPER_ADMIN:
        return 'from-purple-500 to-purple-600';
      case Role.DIRECTEUR_GENERAL:
        return 'from-blue-500 to-blue-600';
      case Role.DIRECTEUR:
        return 'from-indigo-500 to-indigo-600';
      case Role.CHEF_SERVICE:
        return 'from-green-500 to-green-600';
      case Role.SECRETAIRE:
        return 'from-amber-500 to-amber-600';
      default:
        return 'from-surface-500 to-surface-600';
    }
  };

  const getRoleBadgeColor = (role: Role) => {
    switch (role) {
      case Role.SUPER_ADMIN:
        return 'bg-purple-100 text-purple-700';
      case Role.DIRECTEUR_GENERAL:
        return 'bg-blue-100 text-blue-700';
      case Role.DIRECTEUR:
        return 'bg-indigo-100 text-indigo-700';
      case Role.CHEF_SERVICE:
        return 'bg-green-100 text-green-700';
      case Role.SECRETAIRE:
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-surface-100 text-surface-700';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header Card */}
      <div className="bg-white rounded-3xl shadow-card overflow-hidden border border-surface-100">
        {/* Cover Image */}
        <div className={`h-40 bg-gradient-to-r ${getRoleColor(user?.role as Role)} relative`}>
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          
          {/* Edit Button */}
          <button
            onClick={() => setEditing(!editing)}
            className="absolute top-4 right-4 px-4 py-2 bg-white/20 backdrop-blur text-white rounded-xl font-medium hover:bg-white/30 transition-all flex items-center gap-2"
          >
            <FontAwesomeIcon icon={editing ? faTimes : faEdit} className="w-4 h-4" />
            {editing ? 'Annuler' : 'Modifier'}
          </button>
        </div>

        {/* Profile Info */}
        <div className="px-8 pb-8">
          {/* Avatar */}
          <div className="relative -mt-16 mb-6">
            <div className="relative inline-block">
              {user?.photoUrl ? (
                <img 
                  src={user.photoUrl} 
                  alt={user.nom} 
                  className="w-32 h-32 rounded-2xl border-4 border-white shadow-xl object-cover" 
                />
              ) : (
                <div className={`w-32 h-32 rounded-2xl bg-gradient-to-br ${getRoleColor(user?.role as Role)} border-4 border-white shadow-xl flex items-center justify-center text-white text-4xl font-bold`}>
                  {user?.nom.charAt(0).toUpperCase()}
                </div>
              )}
              {editing && (
                <button className="absolute bottom-2 right-2 w-10 h-10 bg-primary-500 text-white rounded-xl shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors">
                  <FontAwesomeIcon icon={faCamera} className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2">
                    Nom complet
                  </label>
                  <div className="relative">
                    <FontAwesomeIcon icon={faUser} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" />
                    <input
                      type="text"
                      value={formData.nom}
                      onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-0 focus:border-primary-400 focus:bg-white transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <FontAwesomeIcon icon={faEnvelope} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-0 focus:border-primary-400 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-6 py-3 bg-surface-100 text-surface-700 rounded-xl font-medium hover:bg-surface-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-medium shadow-lg shadow-primary-500/30 hover:from-primary-600 hover:to-primary-700 transition-all flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                  Enregistrer
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-surface-900 mb-1">{user?.nom}</h1>
                  <p className="text-surface-500 flex items-center gap-2">
                    <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4" />
                    {user?.email}
                  </p>
                </div>
                <span className={`px-4 py-2 rounded-xl text-sm font-semibold ${getRoleBadgeColor(user?.role as Role)}`}>
                  {user?.role}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-surface-100 shadow-card hover:shadow-card-hover transition-all">
          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mb-4">
            <FontAwesomeIcon icon={faShieldAlt} className="w-5 h-5 text-primary-600" />
          </div>
          <h3 className="text-sm font-medium text-surface-500 mb-1">Rôle</h3>
          <p className="text-lg font-bold text-surface-900">{user?.role}</p>
        </div>

        {user?.direction && (
          <div className="bg-white rounded-2xl p-6 border border-surface-100 shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-xl bg-secondary-100 flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faBuilding} className="w-5 h-5 text-secondary-600" />
            </div>
            <h3 className="text-sm font-medium text-surface-500 mb-1">Direction</h3>
            <p className="text-lg font-bold text-surface-900">{user.direction}</p>
          </div>
        )}

        {user?.service && (
          <div className="bg-white rounded-2xl p-6 border border-surface-100 shadow-card hover:shadow-card-hover transition-all">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faUsers} className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="text-sm font-medium text-surface-500 mb-1">Service</h3>
            <p className="text-lg font-bold text-surface-900">{user.service}</p>
          </div>
        )}
      </div>

      {/* Utilisateurs visibles */}
      {(user?.role === Role.DIRECTEUR_GENERAL || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR || user?.role === Role.CHEF_SERVICE) && (
        <div className="bg-white rounded-2xl border border-surface-100 shadow-card overflow-hidden">
          <div className="p-6 border-b border-surface-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <FontAwesomeIcon icon={faUserTie} className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-surface-900">
                  Utilisateurs visibles
                </h3>
                <p className="text-sm text-surface-500">Selon l'organigramme de votre organisation</p>
              </div>
            </div>
          </div>
          
          {visibleUsers.length > 0 ? (
            <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
              {visibleUsers.map((u) => (
                <div key={u.id} className="p-4 hover:bg-surface-50 transition-colors flex items-center gap-4">
                  {u.photoUrl ? (
                    <img 
                      src={u.photoUrl} 
                      alt={u.nom}
                      className="w-12 h-12 rounded-xl object-cover" 
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-semibold">
                      {u.nom.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-surface-900">{u.nom}</p>
                    <p className="text-sm text-surface-500">{u.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(u.role)}`}>
                      {u.role}
                    </span>
                    {u.direction && (
                      <span className="text-xs text-surface-400">
                        {u.direction}{u.service ? ` / ${u.service}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
                <FontAwesomeIcon icon={faUsers} className="w-6 h-6 text-surface-400" />
              </div>
              <p className="text-surface-500">Aucun utilisateur visible selon l'organigramme</p>
            </div>
          )}
          
          {visibleUsers.length > 0 && (
            <div className="p-4 bg-surface-50 border-t border-surface-100">
              <p className="text-sm text-surface-500 text-center">
                Total: <span className="font-semibold text-surface-700">{visibleUsers.length}</span> utilisateur{visibleUsers.length > 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Profil;
