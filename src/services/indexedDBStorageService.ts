/**
 * Service de stockage local IndexedDB (niveau 1 du stockage à trois niveaux).
 * Utilisé pour la persistance locale immédiate avant sync Laravel et Firebase.
 */

const DB_NAME = 'GestionCourrierDB';
const DB_VERSION = 1;
const STORES = {
  COURRIERS: 'courriers',
  ASSIGNATIONS: 'assignations',
  RAPPELS: 'rappels',
  WORKFLOW_ETAPES: 'workflow_etapes',
  ANNOTATIONS: 'annotations',
  SYNC_QUEUE: 'sync_queue', // File d'attente pour les opérations à synchroniser
} as const;

/** Convertir les dates en ISO string pour IndexedDB */
function serializeForIDB<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v instanceof Date) out[k] = v.toISOString();
    else if (v && typeof v === 'object' && !Array.isArray(v) && (v as object).constructor === Object) {
      out[k] = serializeForIDB(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' && (item as object).constructor === Date
          ? (item as Date).toISOString()
          : item && typeof item === 'object' && !Array.isArray(item)
            ? serializeForIDB(item as Record<string, unknown>)
            : item
      );
    } else out[k] = v;
  }
  return out;
}

/** Reconstruire les dates depuis ISO string */
function deserializeFromIDB<T extends Record<string, unknown>>(obj: Record<string, unknown>): T {
  const dateKeys = [
    'dateEnregistrement', 'dateReception', 'createdAt', 'updatedAt', 'dateAssignation', 'dateEcheance',
    'dateRappel', 'dateDebut', 'dateFin', 'dateCreation', 'dateModification'
  ];
  const out: Record<string, unknown> = { ...obj };
  for (const key of dateKeys) {
    const val = out[key];
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      out[key] = new Date(val);
    }
  }
  if (out.declencheur && typeof (out.declencheur as Record<string, unknown>).dateDeclenchement === 'string') {
    (out.declencheur as Record<string, unknown>).dateDeclenchement = new Date((out.declencheur as Record<string, unknown>).dateDeclenchement as string);
  }
  if (Array.isArray(out.responses)) {
    out.responses = (out.responses as unknown[]).map((r: unknown) => {
      const o = r as Record<string, unknown>;
      if (typeof o?.createdAt === 'string') o.createdAt = new Date(o.createdAt);
      return o;
    });
  }
  return out as T;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.COURRIERS)) {
        const courriers = db.createObjectStore(STORES.COURRIERS, { keyPath: 'id' });
        courriers.createIndex('dateEnregistrement', 'dateEnregistrement', { unique: false });
        courriers.createIndex('createdBy', 'createdBy', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.ASSIGNATIONS)) {
        db.createObjectStore(STORES.ASSIGNATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.RAPPELS)) {
        db.createObjectStore(STORES.RAPPELS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.WORKFLOW_ETAPES)) {
        db.createObjectStore(STORES.WORKFLOW_ETAPES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.ANNOTATIONS)) {
        db.createObjectStore(STORES.ANNOTATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    fn(store).then(resolve).catch(reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export interface SyncQueueItem {
  id?: number;
  op: 'create' | 'update' | 'delete';
  store: string;
  payload: unknown;
  createdAt: string;
}

class IndexedDBStorageService {
  // ——— Courriers ———
  async getCourriers(): Promise<unknown[]> {
    return withStore(STORES.COURRIERS, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result || []).map((r: Record<string, unknown>) => deserializeFromIDB(r)));
        req.onerror = () => reject(req.error);
      });
    });
  }

  async getCourrierById(id: string): Promise<unknown | null> {
    return withStore(STORES.COURRIERS, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
          const r = req.result;
          resolve(r ? deserializeFromIDB(r) : null);
        };
        req.onerror = () => reject(req.error);
      });
    });
  }

  async putCourrier(courrier: Record<string, unknown>): Promise<void> {
    const serialized = serializeForIDB(courrier);
    return withStore(STORES.COURRIERS, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.put(serialized);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  async putCourriers(courriers: Record<string, unknown>[]): Promise<void> {
    return withStore(STORES.COURRIERS, 'readwrite', (store) => {
      return Promise.all(
        courriers.map((c) => {
          const serialized = serializeForIDB(c);
          return new Promise<void>((resolve, reject) => {
            const req = store.put(serialized);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        })
      ).then(() => undefined);
    });
  }

  async deleteCourrier(id: string): Promise<void> {
    return withStore(STORES.COURRIERS, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  /** Vide tout le store courriers (utilisé après nettoyage côté Laravel). */
  async clearCourriers(): Promise<void> {
    return withStore(STORES.COURRIERS, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  // ——— File de synchronisation (pour retry Laravel/Firebase) ———
  async enqueueSync(item: Omit<SyncQueueItem, 'id' | 'createdAt'>): Promise<void> {
    return withStore(STORES.SYNC_QUEUE, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.add({
          ...item,
          createdAt: new Date().toISOString(),
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return withStore(STORES.SYNC_QUEUE, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async removeSyncQueueItem(id: number): Promise<void> {
    return withStore(STORES.SYNC_QUEUE, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  async clearSyncQueue(): Promise<void> {
    return withStore(STORES.SYNC_QUEUE, 'readwrite', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }
}

export const indexedDBStorageService = new IndexedDBStorageService();
export { STORES as INDEXEDDB_STORES };
