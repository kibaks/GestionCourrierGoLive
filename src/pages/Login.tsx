import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faEnvelope, 
  faLock, 
  faArrowRight,
  faFileAlt,
  faShieldAlt,
  faUsers,
  faChartLine,
  faBell,
  faSpinner,
  faEye,
  faEyeSlash,
  faFileArchive,
  faExclamationTriangle,
  faTimes
} from '@fortawesome/free-solid-svg-icons';

declare global {
  interface Window {
    google: any;
  }
}

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const { login, completeTwoFactorLogin, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    
    // Vérifier que le client ID est configuré
    if (!googleClientId || googleClientId === 'YOUR_GOOGLE_CLIENT_ID') {
      console.error('❌ VITE_GOOGLE_CLIENT_ID non configuré dans les variables d\'environnement');
      setError('Configuration Google manquante. Vérifiez le fichier .env');
      return;
    }

    // Vérifier si le script est déjà chargé
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleSignIn,
        });
        console.log('✅ Google Sign-In initialisé');
      } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation Google Sign-In:', error);
        setError('Erreur lors de l\'initialisation de Google Sign-In');
      }
      return;
    }

    // Charger le script Google (idempotent) : éviter de l'ajouter plusieurs fois
    const existing = document.querySelector('script[data-google-gsi="true"]') as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleGsi = 'true';
      document.body.appendChild(script);
    }
    
    script.onload = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleSignIn,
          });
          console.log('✅ Google Sign-In initialisé avec succès');
        } catch (error) {
          console.error('❌ Erreur lors de l\'initialisation Google Sign-In:', error);
          setError('Erreur lors de l\'initialisation de Google Sign-In');
        }
      } else {
        console.error('❌ Google Sign-In API non disponible après chargement du script');
        setError('Impossible de charger Google Sign-In');
      }
    };

    script.onerror = () => {
      console.error('❌ Erreur lors du chargement du script Google Sign-In');
      setError('Impossible de charger Google Sign-In. Vérifiez votre connexion internet.');
    };

    return () => {
      // Ne pas retirer le script partagé pour éviter NotFoundError sur hot-reload
    };
  }, []);

  const handleGoogleSignIn = async (response: any) => {
    try {
      setLoading(true);
      setError('');
      
      console.log('🔄 Traitement de la réponse Google Sign-In...');
      
      if (!response || !response.credential) {
        throw new Error('Réponse Google invalide');
      }
      
      // Décoder le token JWT
      const parts = response.credential.split('.');
      if (parts.length !== 3) {
        throw new Error('Format de token Google invalide');
      }
      
      const payload = JSON.parse(atob(parts[1]));
      console.log('📋 Données Google reçues:', { email: payload.email, name: payload.name });
      
      if (!payload.email) {
        throw new Error('Email manquant dans la réponse Google');
      }
      
      const success = await loginWithGoogle(response.credential);

      if (success) {
        console.log('✅ Connexion Google réussie');
        navigate('/dashboard');
      } else {
        setError('Erreur lors de la connexion Google.\n\nVérifiez que votre compte est autorisé ou contactez l\'administrateur.');
      }
    } catch (err: any) {
      console.error('❌ Erreur Google Sign-In:', err);
      const errorMessage = err?.message || 'Erreur lors de la connexion Google';
      
      // Messages d'erreur plus détaillés
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('Données Google invalides')) {
        userFriendlyMessage = 'Réponse Google invalide.\n\nVeuillez réessayer ou contacter le support.';
      } else if (errorMessage.includes('Impossible de créer')) {
        userFriendlyMessage = `Erreur lors de la création du compte.\n\n${errorMessage}\n\nContactez l'administrateur si le problème persiste.`;
      } else if (errorMessage.includes('Impossible de récupérer')) {
        userFriendlyMessage = 'Impossible de récupérer les informations utilisateur.\n\nVérifiez votre connexion et réessayez.';
      }
      
      setError(userFriendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/dashboard');
      } else if (result.twoFactorRequired && result.challenge) {
        setTwoFactorChallenge(result.challenge);
        setTwoFactorCode('');
      } else {
        setError('Email ou mot de passe incorrect');
      }
    } catch (err) {
      setError('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorChallenge) return;
    setError('');
    setLoading(true);
    try {
      const success = await completeTwoFactorLogin(twoFactorChallenge, twoFactorCode.replace(/\s/g, ''));
      if (success) navigate('/dashboard');
      else setError('Code de sécurité invalide ou expiré.');
    } catch {
      setError('Impossible de vérifier le code de sécurité.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = () => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    
    if (!googleClientId || googleClientId === 'YOUR_GOOGLE_CLIENT_ID') {
      setError('Configuration Google manquante. Vérifiez le fichier .env et ajoutez VITE_GOOGLE_CLIENT_ID');
      return;
    }
    
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt();
      } catch (error: any) {
        console.error('❌ Erreur lors de l\'affichage du prompt Google:', error);
        setError(`Erreur Google Sign-In: ${error?.message || 'Impossible d\'afficher le prompt'}`);
      }
    } else {
      setError('Google Sign-In n\'est pas encore chargé. Veuillez réessayer dans quelques instants.');
      // Réessayer de charger le script
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleSignIn,
          });
          window.google.accounts.id.prompt();
        }
      };
      document.body.appendChild(script);
    }
  };

  const features = [
    { icon: faFileAlt, title: 'Gestion Complète', description: 'Suivez tous vos courriers' },
    { icon: faFileArchive, title: 'Module Archivage', description: 'Locaux, armoires, boîtes et rayonnages' },
    { icon: faShieldAlt, title: 'Sécurité Avancée', description: 'Rôles et permissions' },
    { icon: faUsers, title: 'Collaboration', description: 'Travail en équipe' },
    { icon: faChartLine, title: 'Statistiques', description: 'Tableaux de bord' },
    { icon: faBell, title: 'Rappels', description: 'Notifications auto' }
  ];

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Colonne gauche - Description (60%) */}
      <div className="hidden lg:flex lg:w-[60%] relative overflow-hidden">
        {/* Background avec gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-700" />
        
        {/* Formes décoratives */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-float" />
          <div className="absolute top-1/4 -right-32 w-80 h-80 bg-secondary-400/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
          <div className="absolute -bottom-32 left-1/4 w-72 h-72 bg-accent-400/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        </div>
        
        {/* Contenu */}
        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24 py-12 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-4 mb-10">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <FontAwesomeIcon icon={faFileAlt} className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">GestionCourriers</h2>
              <p className="text-primary-200 text-sm">Administration Moderne</p>
            </div>
          </div>

          <h1 className="text-3xl xl:text-4xl font-bold mb-4 leading-snug">
            Système de Gestion des{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-300 to-amber-300">
              Courriers
            </span>
          </h1>
          
          <p className="text-base xl:text-lg mb-8 text-primary-100 leading-snug max-w-xl">
            Une solution complète et moderne pour la gestion de vos courriers administratifs
            et l&apos;archivage physique (locaux, armoires, boîtes...).
          </p>
          
          {/* Features en grille de cards */}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group p-5 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-400/20 to-accent-600/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FontAwesomeIcon icon={feature.icon} className="w-5 h-5 text-accent-300" />
                </div>
                <h3 className="font-semibold text-white text-sm mb-0.5">{feature.title}</h3>
                <p className="text-xs text-primary-200 leading-snug">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Colonne droite - Formulaire (40%) */}
      <div className="flex-1 flex items-center justify-center bg-surface-50 px-8 lg:px-16">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="text-center mb-8 lg:hidden">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
              <FontAwesomeIcon icon={faFileAlt} className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-surface-900">GestionCourriers</h1>
          </div>

          {/* Titre */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-surface-900 mb-2">Connexion</h2>
            <p className="text-surface-500">Accédez à votre espace de travail</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-xl flex items-start gap-3 shadow-sm">
              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-white text-xs" />
              </div>
              <div className="flex-1">
                <p className="text-red-900 font-semibold text-sm mb-1">Erreur de connexion</p>
                <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
              </div>
              <button
                onClick={() => setError('')}
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-red-600 hover:bg-red-100 transition-colors"
                aria-label="Fermer"
              >
                <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
              </button>
            </div>
          )}

          {twoFactorChallenge ? (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
              <div>
                <label htmlFor="two-factor-code" className="block text-sm font-semibold text-surface-700 mb-2">Code de sécurité</label>
                <input id="two-factor-code" inputMode="numeric" autoComplete="one-time-code" maxLength={32} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} required autoFocus className="w-full px-4 py-3.5 bg-white border-2 border-surface-200 rounded-xl focus:ring-0 focus:border-primary-500 text-center tracking-[0.35em] text-lg" placeholder="000000" />
                <p className="mt-2 text-sm text-surface-500">Saisissez le code de votre application ou un code de récupération.</p>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white py-4 rounded-xl font-semibold disabled:opacity-70">{loading ? 'Vérification…' : 'Vérifier et se connecter'}</button>
              <button type="button" onClick={() => setTwoFactorChallenge(null)} className="w-full text-sm text-primary-600 font-medium">Retour à la connexion</button>
            </form>
          ) : <>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-surface-700 mb-2">
                Adresse email
              </label>
              <div className="relative">
                <FontAwesomeIcon 
                  icon={faEnvelope} 
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 w-5 h-5" 
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-surface-200 rounded-xl focus:ring-0 focus:border-primary-500 transition-all text-surface-900 placeholder-surface-400"
                  placeholder="votre@email.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-surface-700 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <FontAwesomeIcon 
                  icon={faLock} 
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 w-5 h-5" 
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-white border-2 border-surface-200 rounded-xl focus:ring-0 focus:border-primary-500 transition-all text-surface-900 placeholder-surface-400"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="w-5 h-5" />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white py-4 rounded-xl font-semibold hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-4 focus:ring-primary-500/30 disabled:opacity-70 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="w-5 h-5 animate-spin" />
                  <span>Connexion...</span>
                </>
              ) : (
                <>
                  <span>Se connecter</span>
                  <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="my-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-surface-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-surface-50 text-surface-400 text-sm">ou continuer avec</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleGoogleClick}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white border-2 border-surface-200 rounded-xl text-surface-700 font-medium hover:bg-surface-50 hover:border-surface-300 focus:outline-none focus:ring-4 focus:ring-surface-500/10 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Google</span>
          </button>
          <button type="button" onClick={() => navigate('/mot-de-passe-oublie')} className="mt-5 w-full text-sm text-primary-600 hover:text-primary-700 font-medium">Mot de passe oublié ?</button>
          </>}
        </div>
      </div>
    </div>
  );
};

export default Login;
