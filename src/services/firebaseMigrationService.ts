/**
 * Service de migration des données de localStorage vers Firebase
 * et d'import Firestore → Laravel (formulaire).
 */

import { collection, addDoc, setDoc, doc, getDoc, getDocFromCache, Timestamp, type DocumentSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { courrierService } from './courrierService';
import { archivageService } from './archivageService';
import { formulaireCourrierService } from './formulaireCourrierService';
import { adminService } from './adminService';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';
import { laravelApiService } from './laravelApiService';
import type { ExtraFieldsBySensAndType, FormStructure } from './formulaireCourrierService';
import { SensCourrier, TypeCourrier } from '../types';

// Helper pour convertir une date en Timestamp Firebase
const toTimestamp = (date: Date | string): Timestamp => {
  if (date instanceof Date) {
    return Timestamp.fromDate(date);
  }
  return Timestamp.fromDate(new Date(date));
};

const emptyFormStructure = (): FormStructure => [];
const getDefaultByType = (): Record<TypeCourrier, FormStructure> => ({
  [TypeCourrier.EXTERNE]: emptyFormStructure(),
  [TypeCourrier.INTERNE]: emptyFormStructure(),
});
const getDefaultFormulaireConfig = (): ExtraFieldsBySensAndType => ({
  [SensCourrier.ENTRANT]: getDefaultByType(),
  [SensCourrier.SORTANT]: getDefaultByType(),
});

/** Normalise les données Firestore (config/formulaire) en ExtraFieldsBySensAndType. */
function normalizeFirestoreFormulaireConfig(raw: Record<string, unknown> | null): ExtraFieldsBySensAndType {
  if (!raw || typeof raw !== 'object') return getDefaultFormulaireConfig();
  const entrant = raw[SensCourrier.ENTRANT] as Record<string, FormStructure> | undefined;
  const sortant = raw[SensCourrier.SORTANT] as Record<string, FormStructure> | undefined;
  return {
    [SensCourrier.ENTRANT]: {
      [TypeCourrier.EXTERNE]: Array.isArray(entrant?.[TypeCourrier.EXTERNE]) ? entrant[TypeCourrier.EXTERNE] : emptyFormStructure(),
      [TypeCourrier.INTERNE]: Array.isArray(entrant?.[TypeCourrier.INTERNE]) ? entrant[TypeCourrier.INTERNE] : emptyFormStructure(),
    },
    [SensCourrier.SORTANT]: {
      [TypeCourrier.EXTERNE]: Array.isArray(sortant?.[TypeCourrier.EXTERNE]) ? sortant[TypeCourrier.EXTERNE] : emptyFormStructure(),
      [TypeCourrier.INTERNE]: Array.isArray(sortant?.[TypeCourrier.INTERNE]) ? sortant[TypeCourrier.INTERNE] : emptyFormStructure(),
    },
  };
}

export const firebaseMigrationService = {
  /**
   * Migrer tous les courriers vers Firebase. Firestore désactivé : no-op, retourne 0.
   */
  async migrateCourriers(): Promise<number> {
    if (!db) return 0;
    try {
      const courriers = courrierService.getAllCourriers();
      let count = 0;
      
      for (const courrier of courriers) {
        // Vérifier si le courrier existe déjà dans Firebase
        const courrierRef = doc(db, 'courriers', courrier.id);
        await setDoc(courrierRef, {
          ...courrier,
          dateReception: toTimestamp(courrier.dateReception),
          dateEnregistrement: toTimestamp(courrier.dateEnregistrement),
          createdAt: toTimestamp(courrier.createdAt),
          updatedAt: toTimestamp(courrier.updatedAt),
        }, { merge: true });
        count++;
      }
      
      console.log(`✅ ${count} courriers migrés vers Firebase`);
      return count;
    } catch (error) {
      console.error('❌ Erreur lors de la migration des courriers:', error);
      throw error;
    }
  },

  /**
   * Migrer les locaux d'archivage. Firestore désactivé : no-op, retourne 0.
   */
  async migrateArchivage(): Promise<number> {
    if (!db) return 0;
    try {
      const locaux = archivageService.getAllLocaux();
      let count = 0;
      
      for (const local of locaux) {
        const localRef = doc(db, 'archivage_locaux', local.id);
        await setDoc(localRef, {
          ...local,
          dateCreation: toTimestamp(local.dateCreation),
          dateModification: toTimestamp(local.dateModification),
        }, { merge: true });
        count++;
      }
      
      console.log(`✅ ${count} locaux migrés vers Firebase`);
      return count;
    } catch (error) {
      console.error('❌ Erreur lors de la migration de l\'archivage:', error);
      throw error;
    }
  },

  /**
   * Migrer la configuration du formulaire. Firestore désactivé : no-op.
   */
  async migrateFormulaireConfig(): Promise<void> {
    if (!db) return;
    try {
      const config = formulaireCourrierService.getConfig();
      const configRef = doc(db, 'config', 'formulaire');
      await setDoc(configRef, config);
      console.log('✅ Configuration du formulaire migrée vers Firebase');
    } catch (error) {
      console.error('❌ Erreur lors de la migration de la configuration:', error);
      throw error;
    }
  },

  /** Message utilisateur pour erreur Firestore hors ligne / injoignable. */
  FIRESTORE_OFFLINE_MSG:
    'Firestore est hors ligne ou injoignable. Vérifiez votre connexion internet. ' +
    'Si vous avez déjà ouvert cette page, ouvrez à nouveau « Formulaire courriers » pour charger le cache, puis réessayez l\'import. ' +
    'Sinon, utilisez « Charger depuis Laravel » si la config est déjà dans l\'API.',

  /**
   * Importer la configuration du formulaire depuis Firestore (config/formulaire) vers Laravel API.
   * Lit d'abord le cache (fiable hors ligne), sinon le serveur avec retries.
   */
  async importFormulaireConfigFromFirestoreToLaravel(): Promise<ExtraFieldsBySensAndType> {
    if (!db) throw new Error('Firestore non configuré');
    if (!laravelApiService.isConfigured()) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');

    const isOfflineError = (e: unknown): boolean => {
      const msg = e instanceof Error ? e.message : String(e);
      return /offline|client\s+is\s+offline|UNAVAILABLE|unavailable|failed\s+to\s+get/i.test(msg);
    };
    const offlineMsg = this.FIRESTORE_OFFLINE_MSG;
    const toUserFriendlyError = (e: unknown): Error => {
      if (isOfflineError(e)) return new Error(offlineMsg);
      if (e instanceof Error) return e;
      return new Error(String(e));
    };

    try {
      const configRef = doc(db, 'config', 'formulaire');
      const readFromCache = (): Promise<DocumentSnapshot> =>
        getDocFromCache(configRef) as Promise<DocumentSnapshot>;
      const readFromServer = (): Promise<DocumentSnapshot> =>
        getDoc(configRef) as Promise<DocumentSnapshot>;

      let snapshot: DocumentSnapshot | null = null;

      // 1) Essayer le cache d'abord (instantané et fonctionne hors ligne si déjà chargé)
      try {
        const cached = await readFromCache();
        if (cached.exists()) {
          snapshot = cached;
          console.log('✅ Config formulaire lue depuis le cache Firestore');
        }
      } catch {
        // Pas de cache ou client offline : on continuera avec le serveur
      }

      // 2) Si pas de cache, lire depuis le serveur avec retries
      if (!snapshot?.exists()) {
        const maxRetries = 3;
        const delayMs = 1200;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            snapshot = await readFromServer();
            if (snapshot.exists()) break;
          } catch (err) {
            if (isOfflineError(err) && attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, delayMs));
              continue;
            }
            try {
              const cached = await readFromCache();
              if (cached.exists()) {
                snapshot = cached;
                console.log('✅ Config formulaire lue depuis le cache (serveur injoignable)');
                break;
              }
            } catch {
              // ignore
            }
            if (!snapshot?.exists()) throw toUserFriendlyError(err);
          }
        }
      }

      if (!snapshot?.exists()) {
        throw new Error(
          'Aucune configuration formulaire dans Firestore (config/formulaire). ' +
          'Enregistrez d\'abord une config dans Paramètres > Formulaire courriers, ou utilisez « Charger depuis Laravel » si la config est déjà dans l\'API.'
        );
      }

      const raw = snapshot.data();
      const config = normalizeFirestoreFormulaireConfig(raw);
      await laravelApiService.saveConfigFormulaire(config as unknown as Record<string, unknown>);
      await formulaireCourrierService.saveConfig(config);
      console.log('✅ Configuration formulaire importée Firestore → Laravel');
      return config;
    } catch (e) {
      throw toUserFriendlyError(e);
    }
  },

  /**
   * Synchroniser les informations configurées dans Firestore vers MySQL (API Laravel).
   * - Config formulaire : importée via PUT /api/config/formulaire.
   * - Pour une sync complète (utilisateurs, courriers, entités, assignations, etc.) :
   *   exécuter en ligne de commande : npm run migrate:firebase-mysql (voir scripts/README-migration-firebase-mysql.md).
   */
  async syncFromFirestoreToLaravel(): Promise<{ configFormulaire: boolean }> {
    if (!laravelApiService.isConfigured()) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    await this.importFormulaireConfigFromFirestoreToLaravel();
    return { configFormulaire: true };
  },

  /**
   * Migrer les utilisateurs. Firestore désactivé : no-op, retourne 0.
   */
  async migrateUtilisateurs(): Promise<number> {
    if (!db) return 0;
    try {
      const utilisateurs = adminService.getAllUsers();
      let count = 0;
      
      for (const user of utilisateurs) {
        const userRef = doc(db, 'utilisateurs', user.id);
        await setDoc(userRef, user, { merge: true });
        count++;
      }
      
      console.log(`✅ ${count} utilisateurs migrés vers Firebase`);
      return count;
    } catch (error) {
      console.error('❌ Erreur lors de la migration des utilisateurs:', error);
      throw error;
    }
  },

  /**
   * Migrer les entités organisationnelles. Firestore désactivé : no-op, retourne 0.
   */
  async migrateEntites(): Promise<number> {
    if (!db) return 0;
    try {
      const entites = entiteOrganisationnelleService.getAllEntities();
      let count = 0;
      
      for (const entite of entites) {
        const entiteRef = doc(db, 'entites_organisationnelles', entite.id);
        await setDoc(entiteRef, entite, { merge: true });
        count++;
      }
      
      console.log(`✅ ${count} entités migrées vers Firebase`);
      return count;
    } catch (error) {
      console.error('❌ Erreur lors de la migration des entités:', error);
      throw error;
    }
  },

  /**
   * Migrer toutes les données
   */
  async migrateAll(): Promise<void> {
    console.log('🚀 Début de la migration vers Firebase...');
    
    try {
      await this.migrateCourriers();
      await this.migrateArchivage();
      await this.migrateFormulaireConfig();
      await this.migrateUtilisateurs();
      await this.migrateEntites();
      
      console.log('✅ Migration complète terminée avec succès!');
    } catch (error) {
      console.error('❌ Erreur lors de la migration complète:', error);
      throw error;
    }
  },
};

