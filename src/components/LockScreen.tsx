import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

/**
 * Écran de verrouillage affiché lorsque le token a expiré.
 * L'utilisateur reste sur la même page et saisit uniquement son mot de passe pour déverrouiller.
 */
const LockScreen: React.FC = () => {
  const { user, unlockWithPassword, logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password.trim()) {
      setError('Veuillez saisir votre mot de passe.');
      return;
    }
    setLoading(true);
    try {
      const ok = await unlockWithPassword(password);
      if (ok) {
        setPassword('');
      } else {
        setError('Mot de passe incorrect.');
      }
    } catch {
      setError('Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (!user?.email) return null;

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
    >
      <div className="w-full max-w-sm mx-4 bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <FontAwesomeIcon icon={faLock} className="w-7 h-7 text-slate-600" />
          </div>
          <h1 id="lock-title" className="text-xl font-bold text-slate-900">
            Session expirée
          </h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Entrez votre mot de passe pour continuer.
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label htmlFor="lock-email" className="block text-xs font-medium text-slate-600 mb-1">
              Compte
            </label>
            <input
              id="lock-email"
              type="email"
              value={user.email}
              readOnly
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-sm"
            />
          </div>
          <div>
            <label htmlFor="lock-password" className="block text-xs font-medium text-slate-600 mb-1">
              Mot de passe
            </label>
            <input
              id="lock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              autoFocus
              autoComplete="current-password"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Vérification…' : 'Déverrouiller'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-slate-500 hover:text-slate-700 text-sm font-medium"
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
};

export default LockScreen;
