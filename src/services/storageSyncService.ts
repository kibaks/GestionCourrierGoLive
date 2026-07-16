/**
 * Orchestrateur de stockage : API Laravel / MySQL uniquement.
 * L'insertion, la lecture, la mise à jour et la suppression des courriers passent par l'API (pas Firestore).
 * Plus de cache IndexedDB ni de file de synchronisation en mémoire navigateur.
 */

import type { Courrier } from '../types';
import { StatutCourrier } from '../types';
import { laravelApiService } from './laravelApiService';
import { auth } from '../config/firebase';

function normalizeCourrier(c: Record<string, unknown>): Courrier {
  const dateFields = ['dateReception', 'dateEnregistrement', 'createdAt', 'updatedAt'];
  const out = { ...c } as Record<string, unknown>;
  for (const key of dateFields) {
    const v = out[key];
    if (typeof v === 'string') out[key] = new Date(v);
    if (v && typeof v === 'object' && (v as { toDate?: () => Date }).toDate) {
      out[key] = (v as { toDate: () => Date }).toDate();
    }
  }
  return out as unknown as Courrier;
}

class StorageSyncService {
  /**
   * Lecture locale désactivée : plus de cache navigateur, retourne une liste vide.
   */
  async getCourriersFromLocal(): Promise<Courrier[]> {
    return [];
  }

  /**
   * Chargement des courriers : API Laravel (MySQL) uniquement, sans mise en cache.
   */
  async syncCourriersFromRemote(
    userId?: string,
    serverFilters?: { direction?: string; service?: string; sousService?: string; bureau?: string; role?: string }
  ): Promise<Courrier[]> {
    if (!laravelApiService.isConfigured()) {
      return [];
    }
    const laravelList = await laravelApiService.getCourriers(userId, serverFilters);
    return laravelList.sort((a, b) => {
      const da = (a.dateEnregistrement && new Date(a.dateEnregistrement).getTime()) || 0;
      const db_ = (b.dateEnregistrement && new Date(b.dateEnregistrement).getTime()) || 0;
      return db_ - da;
    });
  }

  /**
   * Récupération des courriers : depuis l'API Laravel uniquement (fromRemote = true) ou liste vide (fromRemote = false).
   */
  async fetchCourriers(
    userId?: string,
    fromRemote = true,
    serverFilters?: { direction?: string; service?: string; sousService?: string; bureau?: string; role?: string }
  ): Promise<Courrier[]> {
    if (fromRemote) {
      return this.syncCourriersFromRemote(userId, serverFilters);
    }
    return [];
  }

  /**
   * Plus de file de sync : aucun rejeu en mémoire, retourne 0.
   */
  async processSyncQueueToLaravel(): Promise<number> {
    return 0;
  }

  private async generateNumero(type: 'INTERNE' | 'EXTERNE', existingInLocal: Courrier[]): Promise<string> {
    const now = new Date();
    const annee = now.getFullYear();
    const prefix = type === 'INTERNE' ? 'INT' : 'EXT';
    const sameYear = existingInLocal.filter((c) => {
      const d = c.dateEnregistrement ? new Date(c.dateEnregistrement) : null;
      return d && d.getFullYear() === annee && c.type === type;
    });
    const sequence = sameYear.length + 1;
    return `${prefix}-${annee}-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Créer un courrier : appel direct à l'API Laravel (MySQL) uniquement. Aucune écriture Firestore.
   * Si numero est fourni (ex. import CSV/Excel), il est envoyé à Laravel ; sinon Laravel génère le numéro.
   */
  async createCourrier(
    courrier: Omit<Courrier, 'id' | 'numero' | 'dateEnregistrement' | 'statut' | 'createdAt' | 'updatedAt'> & { numero?: string }
  ): Promise<Courrier> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée. Définissez VITE_LARAVEL_API_URL dans le fichier .env à la racine du projet (ex: http://localhost:8000).');
    }
    console.log('[StorageSync] Enregistrement du courrier via API Laravel (MySQL), pas Firebase.');
    const now = new Date();
    const createdBy = courrier.enregistrePar || auth.currentUser?.uid || 'anonymous';

    const payload = {
      ...courrier,
      dateEnregistrement: now,
      statut: StatutCourrier.ENREGISTRE,
      createdAt: now,
      updatedAt: now,
      enregistrePar: createdBy,
    };
    // Ne pas écraser numero si fourni (ex. import) ; sinon omis → Laravel génère
    if (payload.numero === undefined || payload.numero === '') {
      delete (payload as Record<string, unknown>).numero;
    }
    const fromApi = await laravelApiService.createCourrier(payload);
    console.log('[DEBUG] Courrier créé retourné par API:', fromApi.id);
    return fromApi;
  }

  /**
   * Créer plusieurs courriers en lot : appel à l'API Laravel bulk (max 100 par requête).
   * Permet de réduire drastiquement le temps d'enregistrement en liste.
   */
  async createCourriersBulk(
    courriers: Array<Omit<Courrier, 'id' | 'numero' | 'dateEnregistrement' | 'statut' | 'createdAt' | 'updatedAt'> & { numero?: string }>
  ): Promise<Courrier[]> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée. Définissez VITE_LARAVEL_API_URL dans le fichier .env à la racine du projet (ex: http://localhost:8000).');
    }
    if (courriers.length === 0) return [];
    console.log(`[StorageSync] Enregistrement de ${courriers.length} courriers via API Laravel bulk.`);
    const apiStart = performance.now();
    const now = new Date();
    const createdBy = courriers[0]?.enregistrePar || auth.currentUser?.uid || 'anonymous';

    const payloads = courriers.map((c) => {
      const payload = {
        ...c,
        dateEnregistrement: now,
        statut: StatutCourrier.ENREGISTRE,
        createdAt: now,
        updatedAt: now,
        enregistrePar: c.enregistrePar || createdBy,
      };
      if (payload.numero === undefined || payload.numero === '') {
        delete (payload as Record<string, unknown>).numero;
      }
      return payload;
    });

    const created = await laravelApiService.createCourriersBulk(payloads);
    console.log(`[StorageSync] Bulk API terminé en ${(performance.now() - apiStart).toFixed(0)}ms`);
    return created;
  }

  /**
   * Mettre à jour un courrier : appel direct à l'API Laravel. Pas de stockage local.
   */
  async updateCourrier(id: string, updates: Partial<Courrier>): Promise<void> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    await laravelApiService.updateCourrier(id, updates);
  }

  /**
   * Supprimer un courrier : appel direct à l'API Laravel. Pas de stockage local.
   */
  async deleteCourrier(id: string): Promise<void> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    await laravelApiService.deleteCourrier(id);
  }
}

export const storageSyncService = new StorageSyncService();
