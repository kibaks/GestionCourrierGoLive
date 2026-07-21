import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import OtpInput from '../components/OtpInput';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';
import { laravelApiService } from '../services/laravelApiService';
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
  const { user, updateCurrentUser, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [passwordData, setPasswordData] = useState({ current: '', password: '', confirmation: '' });
  const [twoFactorUri, setTwoFactorUri] = useState('');
  const [twoFactorQr, setTwoFactorQr] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const next = await laravelApiService.updateProfile({ nom: formData.nom });
      updateCurrentUser(next);
      setEditing(false);
      setStatus('Profil mis à jour.');
    } catch { setStatus('Impossible de mettre à jour le profil.'); }
  };

  const handlePhoto = async (file?: File) => {
    if (!file) return;
    try { updateCurrentUser(await laravelApiService.uploadProfilePhoto(file)); setStatus('Photo de profil mise à jour.'); }
    catch { setStatus('La photo doit être une image de 2 Mo maximum.'); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await laravelApiService.changeProfilePassword(passwordData.current, passwordData.password, passwordData.confirmation);
      setStatus('Mot de passe modifié. Reconnectez-vous pour continuer.');
      logout();
    } catch { setStatus('Impossible de modifier le mot de passe. Vérifiez les champs saisis.'); }
  };

  const beginTwoFactor = async () => {
    try {
      const data = await laravelApiService.beginTwoFactor();
      setTwoFactorUri(data.otpauthUri);
      setTwoFactorQr(await QRCode.toDataURL(data.otpauthUri, { width: 220, margin: 1 }));
      setRecoveryCodes([]);
    } catch { setStatus('Impossible de démarrer la configuration du second facteur.'); }
  };

  const confirmTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setRecoveryCodes(await laravelApiService.confirmTwoFactor(twoFactorCode));
      setTwoFactorUri(''); setTwoFactorQr(''); setTwoFactorCode('');
      if (user) updateCurrentUser({ ...user, twoFactorEnabled: true } as Utilisateur);
    } catch { setStatus('Code de vérification invalide.'); }
  };

  const disableTwoFactor = async () => {
    const currentPassword = window.prompt('Saisissez votre mot de passe actuel pour désactiver le second facteur.');
    if (!currentPassword) return;
    try {
      await laravelApiService.disableTwoFactor(currentPassword);
      if (user) updateCurrentUser({ ...user, twoFactorEnabled: false } as Utilisateur);
      setRecoveryCodes([]); setStatus('Authentification à deux facteurs désactivée.');
    } catch { setStatus('Mot de passe incorrect ou opération impossible.'); }
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
                <button type="button" onClick={() => photoInputRef.current?.click()} className="absolute bottom-2 right-2 w-10 h-10 bg-primary-500 text-white rounded-xl shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors">
                  <FontAwesomeIcon icon={faCamera} className="w-4 h-4" />
                </button>
              )}
              <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => handlePhoto(e.target.files?.[0])} />
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
                      readOnly
                      className="w-full pl-12 pr-4 py-3 bg-surface-100 border-2 border-surface-200 rounded-xl text-surface-500 cursor-not-allowed"
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

      {status && <p className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800">{status}</p>}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={changePassword} className="rounded-2xl border border-surface-100 bg-white p-6 shadow-card space-y-4">
          <h2 className="text-lg font-bold text-surface-900">Mot de passe</h2>
          <input type="password" required autoComplete="current-password" value={passwordData.current} onChange={e => setPasswordData({ ...passwordData, current: e.target.value })} placeholder="Mot de passe actuel" className="w-full rounded-xl border-2 border-surface-200 px-4 py-3" />
          <input type="password" required autoComplete="new-password" value={passwordData.password} onChange={e => setPasswordData({ ...passwordData, password: e.target.value })} placeholder="Nouveau mot de passe" className="w-full rounded-xl border-2 border-surface-200 px-4 py-3" />
          <input type="password" required autoComplete="new-password" value={passwordData.confirmation} onChange={e => setPasswordData({ ...passwordData, confirmation: e.target.value })} placeholder="Confirmer le nouveau mot de passe" className="w-full rounded-xl border-2 border-surface-200 px-4 py-3" />
          <button className="rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white">Modifier le mot de passe</button>
        </form>
        <section className="rounded-2xl border border-surface-100 bg-white p-6 shadow-card">
          <h2 className="text-lg font-bold text-surface-900">Authentification à deux facteurs</h2>
          <p className="mt-2 text-sm text-surface-500">Facultative, compatible Google Authenticator, Authy et Microsoft Authenticator.</p>
          {user?.twoFactorEnabled ? <button type="button" onClick={disableTwoFactor} className="mt-4 rounded-xl border border-red-300 px-4 py-3 font-semibold text-red-700">Désactiver</button> : !twoFactorUri ? <button type="button" onClick={beginTwoFactor} className="mt-4 rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white">Configurer</button> : <form onSubmit={confirmTwoFactor} className="mt-4 space-y-3">
            {twoFactorQr && <img src={twoFactorQr} alt="QR code de configuration TOTP" className="mx-auto h-[220px] w-[220px]" />}
            <p className="break-all text-xs text-surface-500">{twoFactorUri}</p>
            <OtpInput value={twoFactorCode} onChange={setTwoFactorCode} />
            <button className="rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white">Activer</button>
          </form>}
          {recoveryCodes.length > 0 && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Conservez ces codes dans un lieu sûr :</strong><div className="mt-2 grid grid-cols-2 gap-2 font-mono">{recoveryCodes.map(code => <span key={code}>{code}</span>)}</div></div>}
        </section>
      </section>

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
