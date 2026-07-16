/**
 * Service d'authentification Firebase
 * Gère l'authentification et les permissions pour Firestore
 */

import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Utilisateur, Role } from '../types';

export interface AuthUser extends FirebaseUser {
  customData?: Utilisateur;
}

class FirebaseAuthService {
  /**
   * Connexion avec email et mot de passe
   */
  async signIn(email: string, password: string): Promise<AuthUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const customData = await this.getUserData(userCredential.user.uid);
      return {
        ...userCredential.user,
        customData
      } as AuthUser;
    } catch (error: any) {
      throw new Error(`Erreur de connexion: ${error.message}`);
    }
  }

  /**
   * Création de compte. Firestore désactivé : pas d’écriture utilisateur Firestore.
   */
  async signUp(email: string, password: string, userData: Omit<Utilisateur, 'id'>): Promise<AuthUser> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (db) {
        const userRef = doc(db, 'utilisateurs', userCredential.user.uid);
        await setDoc(userRef, {
          ...userData,
          id: userCredential.user.uid,
          email: userCredential.user.email,
        });
      }
      return {
        ...userCredential.user,
        customData: { ...userData, id: userCredential.user.uid }
      } as AuthUser;
    } catch (error: any) {
      throw new Error(`Erreur lors de la création du compte: ${error.message}`);
    }
  }

  /**
   * Déconnexion
   */
  async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      throw new Error(`Erreur de déconnexion: ${error.message}`);
    }
  }

  /**
   * Récupérer les données utilisateur. Firestore désactivé : retourne null (utiliser Laravel getMe si besoin).
   */
  async getUserData(userId: string): Promise<Utilisateur | null> {
    if (!db) return null;
    try {
      const userRef = doc(db, 'utilisateurs', userId);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        return userSnap.data() as Utilisateur;
      }
      return null;
    } catch (error) {
      console.error('Erreur lors de la récupération des données utilisateur:', error);
      return null;
    }
  }

  /**
   * Écouter les changements d'état d'authentification
   */
  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const customData = await this.getUserData(firebaseUser.uid);
        callback({
          ...firebaseUser,
          customData: customData || undefined
        } as AuthUser);
      } else {
        callback(null);
      }
    });
  }

  /**
   * Obtenir l'utilisateur actuel
   */
  getCurrentUser(): FirebaseUser | null {
    return auth.currentUser;
  }

  /**
   * Vérifier si l'utilisateur a un rôle spécifique
   */
  async hasRole(userId: string, role: Role): Promise<boolean> {
    const userData = await this.getUserData(userId);
    return userData?.role === role;
  }

  /**
   * Vérifier si l'utilisateur est admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    return this.hasRole(userId, Role.SUPER_ADMIN);
  }
}

export const firebaseAuthService = new FirebaseAuthService();

