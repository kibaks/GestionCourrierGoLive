import React, { createContext, useContext, useState, useEffect } from 'react';
import { Utilisateur, Role, Permission } from '../types';
import { adminService } from '../services/adminService';
import { laravelApiService } from '../services/laravelApiService';
import { formulaireCourrierService } from '../services/formulaireCourrierService';

type LoginResult = { success: boolean; twoFactorRequired?: boolean; challenge?: string };

interface AuthContextType {
  user: Utilisateur | null;
  authReady: boolean;
  locked: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeTwoFactorLogin: (challenge: string, code: string) => Promise<boolean>;
  loginWithGoogle: (credential: string) => Promise<boolean>;
  updateCurrentUser: (user: Utilisateur) => void;
  logout: () => void;
  unlockWithPassword: (password: string) => Promise<boolean>;
  isAuthenticated: boolean;
  hasRole: (role: Role | Role[]) => boolean;
  hasPermission: (permission: Permission) => boolean;
  hasAccessToDirection: (direction: string) => boolean;
  hasAccessToService: (service: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initialiser les utilisateurs par défaut
const initializeDefaultUsers = () => {
  const existingUsers = adminService.getAllUsers();
  
  // Toujours vérifier que le super admin existe
  const superAdminExists = existingUsers.some(u => u.email === 'admin@example.com');
  if (!superAdminExists) {
    adminService.createUser({
      nom: 'Super Admin',
      email: 'admin@example.com',
      role: Role.SUPER_ADMIN,
      actif: true
    });
  }
  
  // Toujours s'assurer que Marie Dupont a la bonne direction (secrétaire DG)
  const marieDupont = existingUsers.find(u => u.email === 'secretaire@example.com');
  console.log('🔍 Vérification Marie Dupont:', marieDupont ? {
    nom: marieDupont.nom,
    direction: marieDupont.direction,
    needsUpdate: !marieDupont.direction || marieDupont.direction !== 'Direction Générale'
  } : 'Non trouvée');
  
  if (marieDupont && (!marieDupont.direction || marieDupont.direction !== 'Direction Générale')) {
    console.log('🔄 Mise à jour de Marie Dupont vers Direction Générale');
    adminService.updateUser(marieDupont.id, { direction: 'Direction Générale' });
  }
  
  // Créer les autres utilisateurs de démo seulement s'il n'y a pas d'utilisateurs
  if (existingUsers.length === 0 || (existingUsers.length === 1 && !superAdminExists)) {
    // Mettre à jour les secrétaires sans direction
    existingUsers.forEach(user => {
      if (user.role === Role.SECRETAIRE && !user.direction) {
        adminService.updateUser(user.id, { direction: 'Direction Générale' });
      }
    });
    
    // Créer d'autres utilisateurs de démo
    if (!existingUsers.some(u => u.email === 'secretaire@example.com')) {
      adminService.createUser({
        nom: 'Marie Dupont',
        email: 'secretaire@example.com',
        role: Role.SECRETAIRE,
        direction: 'Direction Générale',
        actif: true
      });
    } else {
      // Mettre à jour Marie Dupont si elle existe sans direction
      const marieDupont = existingUsers.find(u => u.email === 'secretaire@example.com');
      if (marieDupont && !marieDupont.direction) {
        adminService.updateUser(marieDupont.id, { direction: 'Direction Générale' });
      }
    }
    
    if (!existingUsers.some(u => u.email === 'dg@example.com')) {
      adminService.createUser({
        nom: 'Jean Martin',
        email: 'dg@example.com',
        role: Role.DIRECTEUR_GENERAL,
        actif: true
      });
    }
    
    // Ajouter des utilisateurs avec directions et services pour l'organigramme
    if (!existingUsers.some(u => u.email === 'directeur.admin@example.com')) {
      adminService.createUser({
        nom: 'Sophie Bernard',
        email: 'directeur.admin@example.com',
        role: Role.DIRECTEUR,
        direction: 'Direction Administrative',
        actif: true
      });
    }
    
    if (!existingUsers.some(u => u.email === 'chef.rh@example.com')) {
      adminService.createUser({
        nom: 'Pierre Durand',
        email: 'chef.rh@example.com',
        role: Role.CHEF_SERVICE,
        direction: 'Direction Administrative',
        service: 'Service RH',
        actif: true
      });
    }
    
    if (!existingUsers.some(u => u.email === 'agent.rh@example.com')) {
      adminService.createUser({
        nom: 'Lucie Moreau',
        email: 'agent.rh@example.com',
        role: Role.AGENT,
        direction: 'Direction Administrative',
        service: 'Service RH',
        actif: true
      });
    }
    
    if (!existingUsers.some(u => u.email === 'directeur.fin@example.com')) {
      adminService.createUser({
        nom: 'Thomas Lefebvre',
        email: 'directeur.fin@example.com',
        role: Role.DIRECTEUR,
        direction: 'Direction Financière',
        actif: true
      });
    }
    
    if (!existingUsers.some(u => u.email === 'chef.compta@example.com')) {
      adminService.createUser({
        nom: 'Emma Petit',
        email: 'chef.compta@example.com',
        role: Role.CHEF_SERVICE,
        direction: 'Direction Financière',
        service: 'Service Comptabilité',
        actif: true
      });
    }
    
    if (!existingUsers.some(u => u.email === 'agent.compta@example.com')) {
      adminService.createUser({
        nom: 'Marc Dubois',
        email: 'agent.compta@example.com',
        role: Role.AGENT,
        direction: 'Direction Financière',
        service: 'Service Comptabilité',
        actif: true
      });
    }
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Utilisateur | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const handleSessionExpired = () => {
      laravelApiService.clearAuthToken();
      setUser(prev => {
        if (prev?.email) {
          setLocked(true);
          return prev;
        }
        localStorage.removeItem('user');
        return null;
      });
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    // Utilisateurs par défaut uniquement en mode local (pas d'API) ; sinon la base Laravel fait foi
    if (!laravelApiService.isConfigured()) {
      initializeDefaultUsers();
    }

    const savedUser = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
    const parsed = savedUser ? (() => { try { return JSON.parse(savedUser); } catch { return null; } })() : null;

    // Timeout de sécurité : si l'API ne répond pas, afficher l'interface après 12s (données en cache ou login)
    const AUTH_LOAD_TIMEOUT_MS = 12000;
    const timeoutId = setTimeout(() => {
      setAuthReady(prev => {
        if (prev) return prev;
        setUser(parsed ?? null);
        setLocked(false);
        console.warn('Session: chargement interrompu après 12s. Interface affichée (données en cache ou page de connexion).');
        return true;
      });
    }, AUTH_LOAD_TIMEOUT_MS);

    const isNetworkError = (e: unknown): boolean => {
      const msg = e instanceof Error ? e.message : String(e);
      return /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
    };

    const restoreSession = async () => {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
      const parsedUser = saved ? (() => { try { return JSON.parse(saved); } catch { return null; } })() : null;

      if (laravelApiService.isConfigured()) {
        await Promise.all([adminService.refreshUsersFromApi(), adminService.refreshRolesFromApi()]);
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('laravel_token') : null;
        if (token) {
          try {
            const me = await laravelApiService.getMe();
            if (me) {
              setUser(me);
              localStorage.setItem('user', JSON.stringify(me));
              setLocked(false);
              await formulaireCourrierService.getConfigAsync().catch(() => {});
              setAuthReady(true);
              return;
            }
          } catch (e) {
            if (isNetworkError(e) && parsedUser) {
              setUser(parsedUser);
              setLocked(false);
              setAuthReady(true);
              return;
            }
          }
          // Token expiré ou invalide : verrouiller au lieu de déconnecter (garder user pour l'email)
          laravelApiService.clearAuthToken();
          if (parsedUser?.email) {
            setUser(parsedUser);
            setLocked(true);
          } else {
            setUser(null);
            localStorage.removeItem('user');
          }
          setAuthReady(true);
          return;
        }
        setUser(null);
        localStorage.removeItem('user');
        setLocked(false);
        setAuthReady(true);
        return;
      }
      if (saved) setUser(parsedUser);
      setAuthReady(true);
    };
    restoreSession().finally(() => clearTimeout(timeoutId));
  }, []);

  const establishSession = async (token: string): Promise<boolean> => {
    laravelApiService.setAuthToken(token);
    const me = await laravelApiService.getMe();
    if (!me) { laravelApiService.clearAuthToken(); return false; }
    setUser(me);
    setLocked(false);
    localStorage.setItem('user', JSON.stringify(me));
    await Promise.all([adminService.refreshUsersFromApi(), adminService.refreshRolesFromApi()]);
    await formulaireCourrierService.getConfigAsync().catch(() => {});
    return true;
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    if (!laravelApiService.isConfigured()) return { success: false };
    const response = await laravelApiService.login(email, password);
    if (response.twoFactorRequired && response.challenge) return { success: false, twoFactorRequired: true, challenge: response.challenge };
    return { success: response.token ? await establishSession(response.token) : false };
  };

  const completeTwoFactorLogin = async (challenge: string, code: string): Promise<boolean> => {
    const token = await laravelApiService.completeTwoFactorLogin(challenge, code);
    return token ? establishSession(token) : false;
  };;

  const unlockWithPassword = async (password: string): Promise<boolean> => {
    if (!user?.email) return false;
    const result = await login(user.email, password);
    if (result.success) setLocked(false);
    return result.success;
  };

  const loginWithGoogle = async (_credential: string): Promise<boolean> => {
    throw new Error('La connexion Google doit être validée par l’API Laravel avant activation.');
  };

  const updateCurrentUser = (nextUser: Utilisateur): void => {
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
  };

  const logout = () => {
    setUser(null);
    setLocked(false);
    localStorage.removeItem('user');
    laravelApiService.clearAuthToken();
  };

  const hasRole = (role: Role | Role[]): boolean => {
    if (!user) return false;
    if (Array.isArray(role)) {
      return role.includes(user.role);
    }
    return user.role === role;
  };

  const hasAccessToDirection = (direction: string): boolean => {
    if (!user) return false;
    // Le DG et le secrétaire ont accès à toutes les directions
    if (user.role === Role.DIRECTEUR_GENERAL || user.role === Role.SECRETAIRE) {
      return true;
    }
    return user.direction === direction;
  };

  const hasAccessToService = (service: string): boolean => {
    if (!user) return false;
    // Le super admin, DG et le secrétaire ont accès à tous les services
    if (user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL || user.role === Role.SECRETAIRE) {
      return true;
    }
    // Le directeur a accès à tous les services de sa direction
    if (user.role === Role.DIRECTEUR) {
      return true; // Simplifié pour la démo
    }
    return user.service === service;
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    // Le super admin et le directeur général ont toutes les permissions
    if (user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL) return true;
    
    // Vérifier les permissions personnalisées de l'utilisateur
    if (user.permissions && user.permissions.includes(permission)) {
      return true;
    }
    
    // Vérifier les permissions du rôle
    const roles = adminService.getAllRoles();
    const roleDef = roles.find(r => r.code === user.role);
    if (roleDef && roleDef.permissions.includes(permission)) {
      return true;
    }
    
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        locked,
        login,
        completeTwoFactorLogin,
        loginWithGoogle,
        updateCurrentUser,
        logout,
        unlockWithPassword,
        isAuthenticated: !!user,
        hasRole,
        hasPermission,
        hasAccessToDirection,
        hasAccessToService
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

