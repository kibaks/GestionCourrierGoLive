/**
 * Service catégories de classement (courrier_categories + courrier_category_maps).
 * Uniquement API Laravel (MySQL) — Firestore désactivé.
 */

import { laravelApiService } from './laravelApiService';

/** Événements de synchronisation pour le SyncStatusContext */
export type SyncEventType = 'start' | 'progress' | 'finish' | 'error';
export interface SyncEvent {
  type: SyncEventType;
  operation: string;
  progress?: number;
  message?: string;
}

type SyncListener = (event: SyncEvent) => void;
const syncListeners = new Set<SyncListener>();

/** S'abonner aux événements de sync */
export function onSyncEvent(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

/** Émettre un événement de sync */
function emitSyncEvent(event: SyncEvent): void {
  syncListeners.forEach(fn => { try { fn(event); } catch { /* ignore */ } });
}

export interface CategorieCourrier {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  color?: string | null;
  visibility?: 'dg' | 'direction' | 'service' | 'private';
  direction?: string | null;
  service?: string | null;
}

/** Erreur réseau (API Laravel injoignable). */
function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('Network request failed')
  );
}

class CategorieCourrierService {
  async getCategories(userId: string): Promise<CategorieCourrier[]> {
    // 1. Retourner localStorage en premier (instantané)
    const cached = this.loadCategoriesFromStorage(userId);
    if (cached.length > 0) return cached;

    // 2. Fallback API si pas de cache
    if (!laravelApiService.isConfigured()) return [];
    try {
      const list = await laravelApiService.getFolders(userId);
      const arr = Array.isArray(list) ? list : [];
      return arr.map((f: Record<string, unknown>) => ({
        id: f.id != null ? String(f.id) : '',
        name: (f.name as string) ?? '',
        parentId: f.parentId != null ? String(f.parentId) : null,
        createdAt: (f.createdAt as string) ?? new Date().toISOString(),
        updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
        userId: (f.userId as string) ?? userId,
        color: (f.color as string | null) ?? null,
        visibility: (f.visibility as CategorieCourrier['visibility']) ?? 'private',
        direction: (f.direction as string | null) ?? null,
        service: (f.service as string | null) ?? null,
      }));
    } catch (e) {
      console.warn('getFolders échoué:', (e as Error)?.message ?? e);
      return [];
    }
  }

  /**
   * OPTIMISÉ : Retourne immédiatement depuis localStorage sans bloquer sur l'API.
   * La synchronisation API se fait en arrière-plan (fire-and-forget).
   * Si onSyncComplete est fourni, il sera appelé avec les données fusionnées après la sync API.
   */
  async getCategoriesAndMapForUser(
    primaryUserId: string,
    fallbackUserId?: string | null,
    onSyncComplete?: (data: { folders: CategorieCourrier[]; map: Record<string, string | null> }) => void
  ): Promise<{ folders: CategorieCourrier[]; map: Record<string, string | null> }> {
    // 1. Vérifier si le cache local est à jour avec la version de visibilité
    const VISIBILITY_VERSION = 'v3'; // Incrémenter quand la structure de visibilité change
    const cacheVersion = localStorage.getItem(`courrier_folders_vis_version_${primaryUserId}`);
    const needsFullSync = cacheVersion !== VISIBILITY_VERSION;
    if (needsFullSync) {
      // Structure changée → purger le cache local et forcer la sync API
      localStorage.removeItem(`courrier_folders_${primaryUserId}`);
      localStorage.setItem(`courrier_folders_vis_version_${primaryUserId}`, VISIBILITY_VERSION);
    }

    // 2. Retourner depuis localStorage (instantané si données présentes)
    const folders = this.loadCategoriesFromStorage(primaryUserId);
    const map = this.loadMapFromStorage(primaryUserId);

    // 3. Si le cache est vide (première visite ou version changée), attendre la sync API
    if (needsFullSync || folders.length === 0) {
      // Attendre la synchronisation API avant de retourner
      try {
        const syncedData = await this.performSyncAndWait(primaryUserId, fallbackUserId);
        onSyncComplete?.(syncedData);
        return syncedData;
      } catch {
        // En cas d'échec, retourner ce qu'on a (probablement vide)
      }
    } else {
      // Données en cache → retour immédiat, sync en arrière-plan
      this.syncWithApiInBackground(primaryUserId, fallbackUserId, onSyncComplete);
    }

    return { folders, map };
  }

  /** Effectue la synchronisation API et attend le résultat (bloquant). */
  private async performSyncAndWait(
    primaryUserId: string,
    fallbackUserId?: string | null
  ): Promise<{ folders: CategorieCourrier[]; map: Record<string, string | null> }> {
    if (!laravelApiService.isConfigured()) {
      return { folders: [], map: {} };
    }

    this.syncInProgress = true;
    this.lastSyncTime = Date.now();

    emitSyncEvent({ type: 'start', operation: 'folders', message: 'Chargement des catégories...' });

    try {
      const [apiFolders, apiMap] = await Promise.all([
        this.getFoldersFromApi(primaryUserId),
        this.getFolderMapFromApi(primaryUserId),
      ]);

      emitSyncEvent({ type: 'progress', operation: 'folders', progress: 60, message: 'Fusion des données...' });

      const localFolders = this.loadCategoriesFromStorage(primaryUserId);
      const localIds = new Set(localFolders.map(f => f.id));
      const apiIds = new Set(apiFolders.map(f => f.id));
      const deletedIds = this.loadDeletedIds(primaryUserId);

      const mergedFolders = apiFolders.filter(f => !deletedIds.has(f.id));

      const idRemapping = this.loadIdRemapping(primaryUserId);
      const remappedLocalIds = new Set(Object.keys(idRemapping));

      const recentThreshold = Date.now() - 60000;
      for (const lf of localFolders) {
        if (!apiIds.has(lf.id) && !remappedLocalIds.has(lf.id) && !deletedIds.has(lf.id)) {
          const createdMs = lf.createdAt ? new Date(lf.createdAt).getTime() : 0;
          if (createdMs > recentThreshold) {
            mergedFolders.push(lf);
          }
        }
      }

      const seen = new Set<string>();
      const deduped = mergedFolders.filter(f => {
        const key = `${f.name}::${f.parentId ?? 'root'}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const localMap = this.loadMapFromStorage(primaryUserId);
      const remappedLocalMap: Record<string, string | null> = {};
      for (const [courrierId, categorieId] of Object.entries(localMap)) {
        if (categorieId && idRemapping[categorieId]) {
          remappedLocalMap[courrierId] = idRemapping[categorieId];
        } else if (categorieId && !deletedIds.has(categorieId)) {
          remappedLocalMap[courrierId] = categorieId;
        } else if (!categorieId) {
          remappedLocalMap[courrierId] = null;
        }
      }

      const mergedMap: Record<string, string | null> = {};
      const allKeys = new Set([...Object.keys(apiMap), ...Object.keys(remappedLocalMap)]);
      for (const key of allKeys) {
        const localVal = remappedLocalMap[key];
        const apiVal = apiMap[key];
        if (localVal !== undefined && localVal !== null) {
          mergedMap[key] = localVal;
        } else if (apiVal !== undefined && apiVal !== null) {
          mergedMap[key] = apiVal;
        } else {
          mergedMap[key] = localVal ?? apiVal ?? null;
        }
      }

      const finalDeletedIds = this.loadDeletedIds(primaryUserId);
      const finalFolders = deduped.filter(f => !finalDeletedIds.has(f.id));

      localStorage.setItem(`courrier_folders_${primaryUserId}`, JSON.stringify(finalFolders));
      localStorage.setItem(`courrier_folder_map_${primaryUserId}`, JSON.stringify(mergedMap));

      this.cleanupIdRemapping(primaryUserId);

      emitSyncEvent({ type: 'finish', operation: 'folders', progress: 100, message: 'Catégories chargées' });

      return { folders: finalFolders, map: mergedMap };
    } catch {
      emitSyncEvent({ type: 'error', operation: 'folders', message: 'Échec du chargement des catégories' });
      return { folders: [], map: {} };
    } finally {
      this.syncInProgress = false;
    }
  }

  /** Charger depuis localStorage - INSTANTANÉ */
  loadCategoriesFromStorage(userId: string): CategorieCourrier[] {
    try {
      const saved = localStorage.getItem(`courrier_folders_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as CategorieCourrier[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  }

  /** Timestamp de la dernière sauvegarde de mapping pour éviter la sync API */
  private lastSaveTime = 0;

  /** Timestamp de la dernière sync API complète */
  private lastSyncTime = 0;

  /** Indique si une sync API est en cours */
  private syncInProgress = false;

  /** Marquer le moment de la dernière sauvegarde de mapping */
  public markLastSaveTime(): void {
    this.lastSaveTime = Date.now();
  }

  /** Charger le mapping depuis localStorage */
  private loadMapFromStorage(userId: string): Record<string, string | null> {
    try {
      const saved = localStorage.getItem(`courrier_folder_map_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, string | null>;
        if (typeof parsed === 'object' && parsed !== null) return parsed;
      }
    } catch { /* ignore */ }
    return {};
  }

  /** Charger les IDs de catégories récemment supprimées (pour éviter qu'elles réapparaissent via l'API) */
  loadDeletedIds(userId: string): Set<string> {
    try {
      const saved = localStorage.getItem(`courrier_folders_deleted_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as { ids: string[]; ts: number };
        if (parsed?.ids && Array.isArray(parsed.ids)) {
          // Auto-nettoyage : supprimer la liste après 30 minutes
          if (Date.now() - parsed.ts > 30 * 60 * 1000) {
            localStorage.removeItem(`courrier_folders_deleted_${userId}`);
            return new Set();
          }
          return new Set(parsed.ids);
        }
      }
    } catch { /* ignore */ }
    return new Set();
  }

  /** Marquer des catégories comme récemment supprimées (pour empêcher leur réapparition) */
  markDeleted(userId: string, categorieIds: string[]): void {
    const existing = this.loadDeletedIds(userId);
    categorieIds.forEach(id => existing.add(id));
    localStorage.setItem(`courrier_folders_deleted_${userId}`, JSON.stringify({
      ids: [...existing],
      ts: Date.now(),
    }));
  }

  /** Charger le remapping des IDs locaux → IDs API */
  private loadIdRemapping(userId: string): Record<string, string> {
    try {
      const saved = localStorage.getItem(`courrier_folders_id_remapping_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as { mapping: Record<string, string>; ts: number };
        if (parsed?.mapping && typeof parsed.mapping === 'object') return parsed.mapping;
      }
    } catch { /* ignore */ }
    return {};
  }

  /** Sauvegarder un remapping d'ID local → ID API */
  private saveIdRemapping(userId: string, localId: string, apiId: string): void {
    const mapping = this.loadIdRemapping(userId);
    mapping[localId] = apiId;
    localStorage.setItem(`courrier_folders_id_remapping_${userId}`, JSON.stringify({
      mapping,
      ts: Date.now(),
    }));
  }

  /** Nettoyer le remapping ancien (plus de 10 minutes) */
  private cleanupIdRemapping(userId: string): void {
    try {
      const saved = localStorage.getItem(`courrier_folders_id_remapping_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as { mapping: Record<string, string>; ts: number };
        if (parsed?.ts && Date.now() - parsed.ts > 10 * 60 * 1000) {
          localStorage.removeItem(`courrier_folders_id_remapping_${userId}`);
        }
      }
    } catch { /* ignore */ }
  }

  /** Synchronisation en arrière-plan avec l'API (FIRE AND FORGET) */
  private syncWithApiInBackground(
    primaryUserId: string,
    fallbackUserId?: string | null,
    onSyncComplete?: (data: { folders: CategorieCourrier[]; map: Record<string, string | null> }) => void
  ): void {
    // Ne rien faire si API non configurée
    if (!laravelApiService.isConfigured()) return;

    // THROTTLE : pas plus d'une sync toutes les 60 secondes
    const now = Date.now();
    if (now - this.lastSyncTime < 60000) return;

    // DÉDUPLICATION : pas de sync simultanée
    if (this.syncInProgress) return;

    // PROTECTION : pas de sync pendant 30s après sauvegarde locale
    if (now - this.lastSaveTime < 30000) return;

    this.syncInProgress = true;
    this.lastSyncTime = now;

    // Émettre événement de début de sync
    emitSyncEvent({ type: 'start', operation: 'folders', message: 'Synchronisation des catégories...' });

    // Charger folders et map en parallèle
    const foldersPromise = this.getFoldersFromApi(primaryUserId);
    const mapPromise = this.getFolderMapFromApi(primaryUserId);

    emitSyncEvent({ type: 'progress', operation: 'folders', progress: 30, message: 'Chargement des catégories API...' });

    Promise.all([foldersPromise, mapPromise])
      .then(([apiFolders, apiMap]) => {
        // Progression : données API reçues
        emitSyncEvent({ type: 'progress', operation: 'folders', progress: 60, message: 'Fusion des données...' });

        // Fusion intelligente : on ne réintroduit pas les catégories récemment supprimées
        const localFolders = this.loadCategoriesFromStorage(primaryUserId);
        const localIds = new Set(localFolders.map(f => f.id));
        const apiIds = new Set(apiFolders.map(f => f.id));
        const deletedIds = this.loadDeletedIds(primaryUserId);

        // Partir de l'API (source de vérité), mais exclure les IDs récemment supprimés
        const mergedFolders = apiFolders.filter(f => !deletedIds.has(f.id));

        // Charger le remapping des IDs locaux → IDs API (pour éviter les doublons)
        const idRemapping = this.loadIdRemapping(primaryUserId);
        const remappedLocalIds = new Set(Object.keys(idRemapping));

        // Ajouter UNIQUEMENT les catégories locales créées récemment (< 60s) pas encore sur l'API
        // Les catégories locales anciennes qui ne sont pas dans l'API = hors visibilité → ne pas réintroduire
        const recentThreshold = Date.now() - 60000;
        for (const lf of localFolders) {
          if (!apiIds.has(lf.id) && !remappedLocalIds.has(lf.id) && !deletedIds.has(lf.id)) {
            const createdMs = lf.createdAt ? new Date(lf.createdAt).getTime() : 0;
            if (createdMs > recentThreshold) {
              mergedFolders.push(lf);
            }
          }
        }

        // Dédupliquer par nom+parentId pour les cas où une catégorie locale et API ont même nom
        const seen = new Set<string>();
        const deduped = mergedFolders.filter(f => {
          const key = `${f.name}::${f.parentId ?? 'root'}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Fusion du mapping : localStorage prioritaire sur API
        const localMap = this.loadMapFromStorage(primaryUserId);
        // Remapper les IDs locaux → IDs API dans le mapping
        const remappedLocalMap: Record<string, string | null> = {};
        for (const [courrierId, categorieId] of Object.entries(localMap)) {
          if (categorieId && idRemapping[categorieId]) {
            remappedLocalMap[courrierId] = idRemapping[categorieId];
          } else if (categorieId && !deletedIds.has(categorieId)) {
            remappedLocalMap[courrierId] = categorieId;
          } else if (!categorieId) {
            remappedLocalMap[courrierId] = null;
          }
          // Si categorieId est dans deletedIds, on ne l'inclut pas
        }
        // IMPORTANT : fusion intelligente pour éviter les race conditions.
        // Règle : le local prime s'il a un categorieId valide et l'API a null ou pas l'entrée.
        // L'API prime si le local n'a pas l'entrée du tout (nouveau côté serveur).
        // Les deux ont categorieId valide → local prime (dernière action utilisateur).
        const mergedMap: Record<string, string | null> = {};
        const allKeys = new Set([...Object.keys(apiMap), ...Object.keys(remappedLocalMap)]);
        for (const key of allKeys) {
          const localVal = remappedLocalMap[key];
          const apiVal = apiMap[key];
          if (localVal !== undefined && localVal !== null) {
            // Le local a un categorieId valide → toujours prioritaire
            mergedMap[key] = localVal;
          } else if (apiVal !== undefined && apiVal !== null) {
            // L'API a un categorieId valide et le local est null ou absent → API prime
            mergedMap[key] = apiVal;
          } else {
            // Les deux sont null ou absent → null
            mergedMap[key] = localVal ?? apiVal ?? null;
          }
        }

        // Recharger deletedIds au dernier moment (au cas où une suppression a eu lieu pendant la sync)
        const finalDeletedIds = this.loadDeletedIds(primaryUserId);
        const finalFolders = deduped.filter(f => !finalDeletedIds.has(f.id));

        // Sauvegarder dans localStorage (avec les catégories supprimées filtrées)
        localStorage.setItem(`courrier_folders_${primaryUserId}`, JSON.stringify(finalFolders));
        localStorage.setItem(`courrier_folder_map_${primaryUserId}`, JSON.stringify(mergedMap));

        // Progression : sauvegarde locale terminée
        emitSyncEvent({ type: 'progress', operation: 'folders', progress: 90, message: 'Sauvegarde locale...' });

        // Nettoyer le remapping ancien (plus de 10 minutes)
        this.cleanupIdRemapping(primaryUserId);

        // Notifier le composant si callback fourni
        onSyncComplete?.({ folders: finalFolders, map: mergedMap });

        // Sync terminée avec succès
        emitSyncEvent({ type: 'finish', operation: 'folders', progress: 100, message: 'Synchronisation terminée' });
      })
      .catch(() => {
        // Silencieux — ne pas écraser l'état local en cas d'erreur API
      })
      .finally(() => {
        this.syncInProgress = false;
      });
  }

  /** Appel API folders (pour usage interne) */
  private async getFoldersFromApi(userId: string): Promise<CategorieCourrier[]> {
    try {
      const list = await laravelApiService.getFolders(userId);
      const arr = Array.isArray(list) ? list : [];
      return arr.map((f: Record<string, unknown>) => ({
        id: f.id != null ? String(f.id) : '',
        name: (f.name as string) ?? '',
        parentId: f.parentId != null ? String(f.parentId) : null,
        createdAt: (f.createdAt as string) ?? new Date().toISOString(),
        updatedAt: (f.updatedAt as string) ?? new Date().toISOString(),
        userId: (f.userId as string) ?? userId,
        color: (f.color as string | null) ?? null,
        visibility: (f.visibility as CategorieCourrier['visibility']) ?? 'private',
        direction: (f.direction as string | null) ?? null,
        service: (f.service as string | null) ?? null,
      }));
    } catch {
      return [];
    }
  }

  /** Appel API map (pour usage interne) */
  private async getFolderMapFromApi(userId: string): Promise<Record<string, string | null>> {
    try {
      return await laravelApiService.getFolderMap(userId);
    } catch {
      return {};
    }
  }

  /**
   * Retourne le mapping depuis localStorage (instantané).
   * La sync API se fait via getCategoriesAndMapForUser().
   */
  async getFolderMap(userId: string): Promise<Record<string, string | null>> {
    return this.loadMapFromStorage(userId);
  }

  async saveCategories(folders: CategorieCourrier[], userId: string): Promise<void> {
    if (folders.length === 0) return;
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    // Marquer le moment pour bloquer la sync API
    this.markLastSaveTime();

    const now = new Date().toISOString();
    // Utiliser localStorage au lieu de l'API pour éviter un timeout
    const localFolders = this.loadCategoriesFromStorage(userId);
    let laravelIds: Set<string>;
    try {
      laravelIds = new Set(localFolders.map((f) => f.id));
    } catch {
      laravelIds = new Set();
    }
    const idMap: Record<string, string> = {};
    const resolveParentId = (parentId: string | null | undefined): string | null => {
      if (!parentId) return null;
      return idMap[parentId] ?? (laravelIds.has(parentId) ? parentId : null);
    };
    const sorted = this.sortCategoriesParentFirst(folders);
    for (const folder of sorted) {
      const parentIdResolved = resolveParentId(folder.parentId ?? undefined);
      if (folder.id && laravelIds.has(folder.id)) {
        await laravelApiService.updateFolder(folder.id, {
          name: folder.name,
          parentId: parentIdResolved,
          color: folder.color ?? null,
        });
      } else {
        const created = await laravelApiService.createFolder({
          name: folder.name,
          parentId: parentIdResolved,
          color: folder.color ?? null,
        });
        if (folder.id) {
          idMap[folder.id] = created.id;
          // Enregistrer le remapping ancien ID local → nouvel ID API
          if (folder.id !== created.id) {
            this.saveIdRemapping(userId, folder.id, created.id);
          }
        }
        laravelIds.add(created.id);
        const idx = folders.findIndex((f) => f.id === folder.id);
        if (idx >= 0) {
          folders[idx] = {
            ...folder,
            id: created.id,
            createdAt: created.createdAt ?? now,
            updatedAt: created.updatedAt ?? now,
          };
        }
      }
    }
  }

  private sortCategoriesParentFirst(folders: CategorieCourrier[]): CategorieCourrier[] {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const done = new Set<string>();
    const result: CategorieCourrier[] = [];
    let added = true;
    while (added) {
      added = false;
      for (const f of folders) {
        if (done.has(f.id)) continue;
        const parentId = f.parentId ?? null;
        if (!parentId || !byId.has(parentId) || done.has(parentId)) {
          result.push(f);
          done.add(f.id);
          added = true;
        }
      }
    }
    return result.length === folders.length ? result : folders;
  }

  async saveCategory(folder: CategorieCourrier, userId: string): Promise<CategorieCourrier> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    const now = new Date().toISOString();
    const oldId = folder.id;
    const doCreate = (): Promise<{ id: string; createdAt?: string; updatedAt?: string }> =>
      laravelApiService.createFolder({
        name: folder.name,
        parentId: folder.parentId ?? null,
        color: folder.color ?? null,
      });
    if (folder.id) {
      try {
        await laravelApiService.updateFolder(folder.id, {
          name: folder.name,
          parentId: folder.parentId ?? null,
          color: folder.color ?? null,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('404') || msg.includes('Catégorie non trouvée')) {
          const created = await doCreate();
          // Enregistrer le remapping ancien ID → nouvel ID
          if (oldId && oldId !== created.id) {
            this.saveIdRemapping(userId, oldId, created.id);
          }
          folder.id = created.id;
          folder.createdAt = created.createdAt ?? now;
          folder.updatedAt = created.updatedAt ?? now;
          // Mettre à jour localStorage immédiatement
          this.updateCategoryInStorage(userId, oldId, { ...folder });
        } else throw e;
      }
    } else {
      const created = await doCreate();
      folder.id = created.id;
      folder.createdAt = created.createdAt ?? now;
      folder.updatedAt = created.updatedAt ?? now;
    }
    return folder;
  }

  /** Mettre à jour une catégorie dans localStorage (remplacement par ID) */
  private updateCategoryInStorage(userId: string, oldId: string, updatedFolder: CategorieCourrier): void {
    try {
      const folders = this.loadCategoriesFromStorage(userId);
      const idx = folders.findIndex(f => f.id === oldId);
      if (idx >= 0) {
        folders[idx] = updatedFolder;
      } else {
        folders.push(updatedFolder);
      }
      localStorage.setItem(`courrier_folders_${userId}`, JSON.stringify(folders));
    } catch { /* ignore */ }
  }

  static isNetworkError(e: unknown): boolean {
    return isNetworkError(e);
  }

  async saveCategoryMap(userId: string, map: Record<string, string | null>): Promise<void> {
    // 1. Sauvegarder en localStorage EN PREMIER (instantané, pas de timeout)
    const existing = this.loadMapFromStorage(userId);
    const merged = { ...existing, ...map };
    localStorage.setItem(`courrier_folder_map_${userId}`, JSON.stringify(merged));

    // 2. Marquer le moment pour bloquer la sync API
    this.markLastSaveTime();

    // 3. Synchroniser avec l'API en arrière-plan (non bloquant)
    if (!laravelApiService.isConfigured()) {
      console.warn('[Catégories] API non configurée, mapping sauvegardé uniquement en local');
      return;
    }
    emitSyncEvent({ type: 'start', operation: 'mapping', message: 'Sauvegarde du classement...' });
    emitSyncEvent({ type: 'progress', operation: 'mapping', progress: 50, message: 'Envoi au serveur...' });
    try {
      await laravelApiService.saveFolderMap(userId, merged);
      emitSyncEvent({ type: 'finish', operation: 'mapping', progress: 100, message: 'Classement synchronisé' });
    } catch (e) {
      console.warn('[Catégories] saveCategoryMap API échoué (mapping déjà en local):', (e as Error)?.message ?? e);
    }
  }

  async deleteCategories(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    await laravelApiService.deleteFolders(ids);
  }
}

export const categorieCourrierService = new CategorieCourrierService();
