/**
 * Client API Laravel (MySQL) - Niveau 2 du stockage à trois niveaux.
 * Courriers + gestion des fichiers (import) via l'API.
 */

import type { Courrier, CategorieFichier, Utilisateur, Assignation, Rappel, Annotation, WorkflowEtape, EntiteOrganisationnelle, EntiteTypeDefinition, RoleDefinition, Permission } from '../types';

function parseCategorieFichierFromApi(raw: Record<string, unknown>): CategorieFichier {
  const dateFields = ['dateCreation', 'dateModification'];
  const out = { ...raw } as Record<string, unknown>;
  if (raw.courrierId != null) out.courrierId = String(raw.courrierId);
  if (raw.id != null) out.id = String(raw.id);
  if (raw.type != null) out.type = raw.type as 'dossier' | 'fichier';
  // parentId: null, undefined, "" ou "null" → considérer comme racine
  const rawParent = raw.parentId;
  if (rawParent == null || rawParent === '' || rawParent === 'null') out.parentId = null;
  else out.parentId = String(rawParent);
  if (raw.estAccuseReception != null) out.estAccuseReception = Boolean(raw.estAccuseReception);
  if (raw.creePar != null) out.creePar = String(raw.creePar);
  for (const key of dateFields) {
    const v = raw[key];
    if (typeof v === 'string') out[key] = new Date(v);
  }
  return out as unknown as CategorieFichier;
}

export const getBaseUrl = (): string => {
  const url = import.meta.env.VITE_LARAVEL_API_URL;
  if (url && String(url).trim() !== '') return String(url).replace(/\/$/, '');
  // Ne pas deviner l'URL : si VITE_LARAVEL_API_URL n'est pas défini, l'API Laravel n'est pas utilisée.
  // Sinon en dev on considérerait Laravel "configuré" sans token → l'utilisateur serait déconnecté et les données ne chargeraient plus.
  return '';
};

export const getAuthToken = (): string | null => {
  // Adapter selon votre auth Laravel (Bearer, Sanctum, etc.)
  // Support multiple token storage keys for compatibility
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('token') || 
           localStorage.getItem('access_token') ||
           localStorage.getItem('auth_token') ||
           localStorage.getItem('laravel_token') ||
           localStorage.getItem('jwt_token') ||
           localStorage.getItem('user_token');
  }
  return null;
};

/**
 * Extrait et formate les erreurs de validation Laravel (422)
 * Laravel renvoie: { message: "...", errors: { field: ["error1", "error2"] } }
 */
function extractValidationError(text: string, status: number): string {
  if (status === 422) {
    try {
      const json = JSON.parse(text);
      if (json.errors && typeof json.errors === 'object') {
        const errorMessages: string[] = [];
        for (const [field, messages] of Object.entries(json.errors)) {
          if (Array.isArray(messages)) {
            const fieldLabel = field.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
            const fieldLabelFr = fieldLabel.charAt(0).toUpperCase() + fieldLabel.slice(1);
            errorMessages.push(`${fieldLabelFr}: ${messages.join(', ')}`);
          }
        }
        if (errorMessages.length > 0) {
          return errorMessages.join('\n');
        }
      }
      if (json.message) return json.message;
    } catch {
      // Pas du JSON valide, utiliser le texte brut
    }
  }
  // Fallback: retourner le texte brut
  return text;
}

const buildHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const token = getAuthToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn('[Auth] Aucun token trouvé dans localStorage - utilisateur non authentifié');
  }
  return headers;
};

/** Notifie l'application que la session a expiré (401) sans attendre un rechargement. */
function notifySessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('session-expired'));
  }
}

/** Parser la réponse d'erreur Laravel pour afficher un message clair (401, 422, 500). */
function parseApiErrorMessage(status: number, bodyText: string): string {
  if (status === 401) {
    console.warn('[Auth] 401 Unauthorized - token invalide ou expiré');
    notifySessionExpired();
    return 'Connexion refusée (401). Veuillez vous reconnecter.';
  }
  if (status === 403) {
    return 'Droits insuffisants (403). Votre compte n\'a pas la permission de créer un courrier.';
  }
  if (status === 409) {
    try {
      const data = JSON.parse(bodyText) as { message?: string };
      return data?.message ?? 'Un courrier avec ce numéro existe déjà.';
    } catch {
      return 'Un courrier avec ce numéro existe déjà (409).';
    }
  }
  if (status === 422) {
    try {
      const data = JSON.parse(bodyText) as { message?: string; errors?: Record<string, string[]> };
      const parts: string[] = [data?.message || 'Données invalides (422).'];
      if (data?.errors && typeof data.errors === 'object') {
        const details = Object.entries(data.errors)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
          .join(' ; ');
        if (details) parts.push(details);
      }
      return parts.join(' ');
    } catch {
      return `Données invalides (422). ${bodyText.slice(0, 200)}`;
    }
  }
  if (status >= 500) {
    try {
      const data = JSON.parse(bodyText) as { message?: string };
      if (data?.message && typeof data.message === 'string') {
        return data.message;
      }
    } catch {
      // pas du JSON, garder le message générique + extrait
    }
    return `Erreur serveur (${status}). Vérifiez que l\'API Laravel est démarrée (php artisan serve) et que la base MySQL est accessible. ${bodyText.slice(0, 150)}`;
  }
  return `API courrier: ${status} ${bodyText.slice(0, 200)}`;
}

/** Convertir les champs date ISO string du backend en Date + normaliser id/numero + extraFields/sens (API Laravel) */
function parseCourrierFromApi(raw: Record<string, unknown>): Courrier {
  const dateFields = [
    'dateReception', 'dateEnregistrement', 'createdAt', 'updatedAt'
  ];
  const out = { ...raw } as Record<string, unknown>;
  if (out.id != null) out.id = String(out.id);
  if (out.numero != null) out.numero = String(out.numero);
  for (const key of dateFields) {
    const v = out[key];
    if (typeof v === 'string') out[key] = new Date(v);
  }
  // Garantir extraFields (formulaire courrier) : API peut renvoyer extraFields ou extra_fields
  if (out.extraFields === undefined && out.extra_fields !== undefined) {
    out.extraFields = out.extra_fields;
  }
  if (out.extraFields !== undefined && out.extraFields !== null && typeof out.extraFields !== 'object') {
    out.extraFields = typeof out.extraFields === 'string' ? (() => { try { return JSON.parse(out.extraFields as string); } catch { return {}; } })() : {};
  }
  // Garantir sens (ENTRANT/SORTANT)
  if (out.sens === undefined && (raw.sens === undefined || raw.sens === null)) {
    out.sens = undefined;
  }
  // Garantir folderId (catégorie)
  if (out.folderId === undefined && (raw.folderId !== undefined || raw.folder_id !== undefined)) {
    out.folderId = (raw.folderId ?? raw.folder_id) as string | undefined;
  }
  if (out.folderId != null) out.folderId = String(out.folderId);
  // Récupérer objet depuis extraFields si la colonne directe est null/vide
  // ou contient le placeholder "Sans objet" (écrit par d'anciennes mises à jour partielles)
  const objetStr = out.objet == null ? '' : String(out.objet).trim();
  if (objetStr === '' || objetStr.toLowerCase() === 'sans objet') {
    const ef = out.extraFields as Record<string, unknown> | null | undefined;
    const fromExtra = ef?.objet ?? ef?.sujet ?? ef?.object;
    if (fromExtra && String(fromExtra).trim() !== '') {
      out.objet = String(fromExtra).trim();
    }
  }
  // Normaliser priorite : s'assurer qu'elle a une valeur valide (BASSE, NORMALE, HAUTE, URGENTE)
  // Si priorite n'est pas définie ou invalide, utiliser NORMALE par défaut
  const validPriorities = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'];
  if (!out.priorite || !validPriorities.includes(String(out.priorite))) {
    out.priorite = 'NORMALE';
  }
  return out as unknown as Courrier;
}

/** Champs réservés à l'UI — jamais envoyés à l'API Laravel */
const API_EXCLUDED_FIELDS = new Set([
  'files', 'creerWorkflow', 'notifierDG', 'notifierResponsable',
  'instructionsWorkflow', 'prioriteWorkflow', 'contenuCourrier', 'urgence',
  // Note: folderId est maintenant envoyé à l'API pour associer les courriers aux catégories
]);

/** Préparer un courrier pour l'envoi API (dates en ISO string + champs requis + extraFields/sens) */
function prepareCourrierForApi(c: Partial<Courrier>): Record<string, unknown> {
  // Copie défensive : exclure champs UI-only et tout objet File / FileList non sérialisable
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
    if (API_EXCLUDED_FIELDS.has(k)) {
      continue;
    }
    if (v instanceof File || v instanceof FileList) continue;
    if (Array.isArray(v) && v.length > 0 && v[0] instanceof File) continue;
    out[k] = v;
  }
  const dateKeys = ['dateReception', 'dateEnregistrement', 'createdAt', 'updatedAt'];
  for (const key of dateKeys) {
    const v = out[key];
    if (v instanceof Date) out[key] = (v as Date).toISOString();
  }
  // Ne pas envoyer numero si vide : l'API Laravel génère automatiquement le numéro (INT-AAAA-NNNN / EXT-AAAA-NNNN)
  const numeroVal = out.numero;
  if (numeroVal === undefined || numeroVal === null || String(numeroVal).trim() === '') {
    delete out.numero;
  }
  // S'assurer que les champs requis pour l'upsert Laravel ne sont pas vides (évite 422)
  // Note: ne pas toucher les champs undefined (partial update) - seulement corriger les valeurs null/explicitement vides
  if ('destinataire' in out && (out.destinataire === null || String(out.destinataire).trim() === '')) {
    out.destinataire = 'Non renseigné';
  }
  if ('expediteur' in out && (out.expediteur === null || String(out.expediteur).trim() === '')) {
    out.expediteur = 'Non renseigné';
  }
  // Ne toucher à l'objet que s'il est explicitement fourni (même vide/null)
  // En cas de mise à jour partielle (ex: statut uniquement), out.objet sera undefined
  // et on ne doit PAS remplacer l'objet existant par 'Sans objet'
  if ('objet' in out && (out.objet === null || String(out.objet).trim() === '')) {
    out.objet = 'Sans objet';
  }
  if (out.type === undefined || out.type === null || String(out.type).trim() === '') {
    out.type = 'EXTERNE';
  }
  if (!out.dateReception) {
    out.dateReception = new Date().toISOString();
  }
  // Garantir l'envoi des champs du formulaire (MySQL via Laravel)
  if ((c as Partial<Courrier>).extraFields !== undefined) {
    out.extraFields = (c as Partial<Courrier>).extraFields;
  }
  if ((c as Partial<Courrier>).sens !== undefined && (c as Partial<Courrier>).sens !== null) {
    out.sens = (c as Partial<Courrier>).sens;
  }
  return out;
}

class LaravelApiService {
  private baseUrl = '';
  private cache = new Map<string, { ts: number; ttlMs: number; data: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor() {
    this.baseUrl = getBaseUrl();
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttlMs) return null;
    return entry.data as T;
  }

  private setCached<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { ts: Date.now(), ttlMs, data });
  }

  private invalidate(prefix: string): void {
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) this.cache.delete(k);
    }
  }

  /**
   * Cache + anti-doublon (in-flight) pour les GET très sollicités.
   * - Si cache valide → retourne immédiatement.
   * - Si requête identique déjà en cours → réutilise la même Promise.
   */
  private cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.getCached<T>(key);
    if (cached !== null) return Promise.resolve(cached);
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = fetcher()
      .then((data) => {
        this.setCached<T>(key, data, ttlMs);
        return data;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, p as Promise<unknown>);
    return p;
  }

  /** Vérifie si l'API Laravel est configurée (rafraîchit baseUrl à chaque appel). */
  isConfigured(): boolean {
    this.baseUrl = getBaseUrl();
    return !!this.baseUrl;
  }

  /** Méthode request générique pour les appels API */
  async request(options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    data?: any;
  }): Promise<any> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    
    // S'assurer que l'URL commence par /api/
    let url = options.url;
    if (!url.startsWith('/api/')) {
      url = url.startsWith('/') ? `/api${url}` : `/api/${url}`;
    }
    
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    
    const fetchOptions: RequestInit = {
      method: options.method,
      headers: buildHeaders(),
    };
    
    if (options.data && (options.method === 'POST' || options.method === 'PUT')) {
      fetchOptions.body = JSON.stringify(options.data);
    }
    
    const res = await fetch(fullUrl, fetchOptions);
    if (!res.ok) {
      const text = await res.text();
      const msg = parseApiErrorMessage(res.status, text);
      throw new Error(msg);
    }
    
    return await res.json();
  }

  /** GET /api/courriers — filtres optionnels envoyés au serveur pour réduire le volume de données */
  async getCourriers(
    userId?: string,
    filters?: {
      direction?: string;
      service?: string;
      sousService?: string;
      bureau?: string;
      role?: string;
    }
  ): Promise<Courrier[]> {
    if (!this.baseUrl) return [];

    const params = new URLSearchParams();
    if (userId) params.set('created_by', userId);
    if (filters?.direction) params.set('direction', filters.direction);
    if (filters?.service) params.set('service', filters.service);
    if (filters?.sousService) params.set('sous_service', filters.sousService);
    if (filters?.bureau) params.set('bureau', filters.bureau);
    if (filters?.role) params.set('role', filters.role);

    const queryString = params.toString();
    const url = `${this.baseUrl}/api/courriers${queryString ? `?${queryString}` : ''}`;
    const cacheKey = `GET:courriers:${userId || 'all'}:${queryString}`;
    // TTL court: évite les rafales de refresh à chaque navigation/re-render
    return this.cached(cacheKey, 15000, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s max
      let res: Response;
      try {
        res = await fetch(url, { method: 'GET', headers: buildHeaders(), cache: 'no-store', signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) {
        if (res.status === 401) notifySessionExpired();
        throw new Error(`API courriers: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      // Accepter plusieurs formats de réponse Laravel : { data: [] }, { courriers: [] }, ou tableau direct
      const raw =
        Array.isArray(data?.data) ? data.data
        : Array.isArray(data?.courriers) ? data.courriers
        : Array.isArray(data) ? data
        : [];
      return raw.map((item: Record<string, unknown>) => parseCourrierFromApi(item));
    });
  }

  /** GET /api/courriers/:id */
  async getCourrierById(id: string): Promise<Courrier | null> {
    if (!this.baseUrl) return null;
    try {
      const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(id)}`;
      const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data?.data ?? data;
      if (!raw || typeof raw !== 'object') return null;
      return parseCourrierFromApi(raw as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  /** POST /api/courriers */
  async createCourrier(courrier: Omit<Courrier, 'id' | 'numero' | 'dateEnregistrement' | 'createdAt' | 'updatedAt'> & { numero?: string; dateEnregistrement?: Date; createdAt?: Date; updatedAt?: Date }): Promise<Courrier> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const url = `${this.baseUrl}/api/courriers`;
    const body = prepareCourrierForApi(courrier as Partial<Courrier>);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // Timeout 30s

    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      const msg = parseApiErrorMessage(res.status, text);
      throw new Error(msg);
    }
    const data = await res.json();
    const raw = data?.data ?? data;
    const result = parseCourrierFromApi(raw);
    // Invalidation cache courriers (liste)
    this.invalidate('GET:courriers:');
    return result;
  }

  /** POST /api/courriers/bulk — création en lot (max 100 par requête). Réduit le temps d'import. */
  async createCourriersBulk(
    courriers: Array<Partial<Courrier> & { numero?: string }>
  ): Promise<Courrier[]> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const url = `${this.baseUrl}/api/courriers/bulk`;
    const body = { courriers: courriers.map((c) => prepareCourrierForApi(c as Partial<Courrier>)) };
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      const msg = parseApiErrorMessage(res.status, text);
      throw new Error(msg);
    }
    const data = await res.json();
    const rawList = Array.isArray(data?.data) ? data.data : [];
    // Invalidation cache courriers (liste)
    this.invalidate('GET:courriers:');
    return rawList.map((item: Record<string, unknown>) => parseCourrierFromApi(item));
  }

  /** PUT /api/courriers/:id */
  async updateCourrier(id: string, updates: Partial<Courrier>): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(id)}`;
    const body = prepareCourrierForApi(updates);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // Timeout 30s

    const res = await fetch(url, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API update courrier: ${res.status} ${res.statusText} - ${text}`);
    }
    this.invalidate('GET:courriers:');
  }

  /** PATCH /api/courriers/:id/statut — mise à jour du statut uniquement, sans restriction de permission */
  async updateCourrierStatut(id: string, statut: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(id)}/statut`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify({ statut }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`updateCourrierStatut: ${res.status} ${res.statusText} — ${text}`);
    }
    this.invalidate('GET:courriers:');
  }

  /** DELETE tous les courriers (par lots de 5 en parallèle) */
  async deleteAllCourriers(): Promise<{ deleted: number; errors: number }> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const all = await this.getCourriers();
    let deleted = 0;
    let errors = 0;
    const BATCH = 5;
    for (let i = 0; i < all.length; i += BATCH) {
      const batch = all.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (c) => {
          try {
            await this.deleteCourrier(c.id);
            deleted++;
          } catch {
            errors++;
          }
        })
      );
    }
    return { deleted, errors };
  }

  /** DELETE /api/courriers/:id */
  async deleteCourrier(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    
    try {
      // D'abord, supprimer tous les fichiers associés au courrier
      await this.deleteCourrierFiles(id);
      
      // Ensuite, supprimer le courrier lui-même
      const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(id)}`;
      const res = await fetch(url, { method: 'DELETE', headers: buildHeaders() });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API delete courrier: ${res.status} ${res.statusText} - ${text}`);
      }
      this.invalidate('GET:courriers:');
    } catch (error) {
      console.error('Erreur lors de la suppression du courrier et de ses fichiers:', error);
      throw error;
    }
  }

  /** Supprimer tous les fichiers d'un courrier */
  async deleteCourrierFiles(courrierId: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    
    try {
      // Récupérer tous les fichiers du courrier
      const files = await this.getCourrierFiles(courrierId);
      
      // Supprimer chaque fichier
      const deletePromises = files.map(async (file) => {
        const deleteUrl = `${this.baseUrl}/api/dossiers-fichiers/${encodeURIComponent(file.id)}`;
        const res = await fetch(deleteUrl, { method: 'DELETE', headers: buildHeaders() });
        if (!res.ok) {
          const text = await res.text();
          console.warn(`Impossible de supprimer le fichier ${file.id}: ${res.status} ${res.statusText} - ${text}`);
          // Ne pas lancer d'erreur pour continuer la suppression des autres fichiers
        }
      });
      
      await Promise.all(deletePromises);
      console.log(`✅ ${files.length} fichier(s) supprimé(s) pour le courrier ${courrierId}`);
    } catch (error) {
      console.error('Erreur lors de la suppression des fichiers du courrier:', error);
      // Ne pas empêcher la suppression du courrier si les fichiers ne peuvent pas être supprimés
    }
  }

  /** Récupérer tous les fichiers d'un courrier */
  async getCourrierFiles(courrierId: string): Promise<any[]> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    
    const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(courrierId)}/fichiers`;
    const res = await fetch(url, { headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API get courrier files: ${res.status} ${res.statusText} - ${text}`);
    }
    return res.json();
  }

  // ——— Fichiers (import) ———

  /** GET /api/courriers/:courrierId/fichiers */
  async getFichiers(courrierId: string): Promise<CategorieFichier[]> {
    if (!this.baseUrl) return [];
    const cacheKey = `GET:fichiers:${courrierId}`;
    return this.cached(cacheKey, 15000, async () => {
      const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(courrierId)}/fichiers`;
      const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
      if (!res.ok) {
        const text = await res.text();
        let msg: string;
        try {
          const json = JSON.parse(text) as { message?: string };
          msg = json?.message || text.slice(0, 200) || `${res.status} ${res.statusText}`;
        } catch {
          msg = text.slice(0, 200) || `${res.status} ${res.statusText}`;
        }
        if (res.status === 401) msg = 'Non authentifié. Déconnectez-vous puis reconnectez-vous.';
        if (res.status === 403) msg = 'Accès non autorisé à ce courrier.';
        throw new Error(msg);
      }
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      return list.map((item: Record<string, unknown>) => parseCategorieFichierFromApi(item));
    });
  }

  /**
   * GET /api/courriers/files-counts — récupère le nombre de fichiers/catégories pour plusieurs courriers
   * Retourne une Map<courrierId, {nbFichiers, nbCategories}>
   */
  async getFilesCounts(courrierIds: string[]): Promise<Map<string, {nbFichiers: number; nbCategories: number}>> {
    const result = new Map<string, {nbFichiers: number; nbCategories: number}>();
    if (!this.baseUrl || courrierIds.length === 0) return result;
    
    try {
      // Appel batch pour récupérer les counts de tous les courriers en une requête
      const url = `${this.baseUrl}/api/courriers/files-counts?ids=${encodeURIComponent(courrierIds.join(','))}`;
      const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
      if (!res.ok) {
        // Fallback silencieux : retourner des zéros
        courrierIds.forEach(id => result.set(id, { nbFichiers: 0, nbCategories: 0 }));
        return result;
      }
      const data = await res.json();
      const counts = data?.data || data || {};
      courrierIds.forEach(id => {
        const c = counts[id] || { fichiers: 0, categories: 0 };
        result.set(id, { nbFichiers: c.fichiers || 0, nbCategories: c.categories || 0 });
      });
    } catch {
      // Fallback silencieux
      courrierIds.forEach(id => result.set(id, { nbFichiers: 0, nbCategories: 0 }));
    }
    return result;
  }

  /**
   * GET /api/courriers/:courrierId/files-count — récupère le nombre de fichiers/catégories pour un seul courrier
   */
  async getFilesCount(courrierId: string): Promise<{nbFichiers: number; nbCategories: number}> {
    if (!this.baseUrl) return { nbFichiers: 0, nbCategories: 0 };
    const cacheKey = `GET:files-count:${courrierId}`;
    return this.cached(cacheKey, 30000, async () => {
      const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(courrierId)}/files-count`;
      const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
      if (!res.ok) return { nbFichiers: 0, nbCategories: 0 };
      const data = await res.json();
      const c = data?.data || data || {};
      return { nbFichiers: c.fichiers || 0, nbCategories: c.categories || 0 };
    });
  }

  /**
   * POST /api/courriers/:courrierId/fichiers — envoi en base64 (JSON) pour éviter l'erreur PHP
   * "unable to create a temporary file" quand le répertoire temporaire système est injoignable.
   */
  async uploadFichier(
    courrierId: string,
    file: File,
    options?: { parentId?: string; estAccuseReception?: boolean; creePar?: string }
  ): Promise<CategorieFichier> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL). Démarrez l\'API et définissez l\'URL dans .env.');
    const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(courrierId)}/fichiers`;

    const base64 = await this.fileToBase64(file);
    const body: Record<string, unknown> = {
      fileBase64: base64,
      fileName: file.name || 'sans-nom',
    };
    if (options?.parentId) body.parentId = options.parentId;
    if (options?.estAccuseReception) body.estAccuseReception = true;
    if (options?.creePar) body.creePar = options.creePar;

    const headers: HeadersInit = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      let msg: string;
      try {
        const json = JSON.parse(text) as { message?: string; errors?: Record<string, string[]> };
        msg = json?.message || text.slice(0, 200);
        if (json?.errors && typeof json.errors === 'object') {
          const details = Object.entries(json.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' ; ');
          if (details) msg += ' ' + details;
        }
      } catch {
        msg = text.slice(0, 200) || `${res.status} ${res.statusText}`;
      }
      if (res.status === 404) msg = 'Courrier introuvable côté serveur. Synchronisez le courrier puis réessayez.';
      throw new Error(msg);
    }
    const data = await res.json();
    const raw = data?.data ?? data;
    this.invalidate(`GET:fichiers:${courrierId}`);
    return parseCategorieFichierFromApi(raw);
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.indexOf(',') >= 0 ? result.slice(result.indexOf(',') + 1) : result;
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /** POST /api/courriers/:courrierId/fichiers — créer un dossier (JSON) */
  async createDossierLaravel(
    courrierId: string,
    nom: string,
    options?: { parentId?: string; creePar?: string }
  ): Promise<CategorieFichier> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(courrierId)}/fichiers`;
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        nom,
        type: 'dossier',
        parentId: options?.parentId ?? null,
        creePar: options?.creePar ?? 'system',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API créer dossier: ${res.status} ${res.statusText} - ${text}`);
    }
    const data = await res.json();
    const raw = data?.data ?? data;
    this.invalidate(`GET:fichiers:${courrierId}`);
    return parseCategorieFichierFromApi(raw);
  }

  /** GET /api/fichiers/:id */
  async getFichier(id: string): Promise<CategorieFichier | null> {
    if (!this.baseUrl) return null;
    const url = `${this.baseUrl}/api/fichiers/${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.data ?? data;
    return parseCategorieFichierFromApi(raw);
  }

  /** URL de téléchargement d'un fichier (API Laravel) */
  getFichierDownloadUrl(id: string): string {
    if (!this.baseUrl) return '';
    return `${this.baseUrl}/api/fichiers/${encodeURIComponent(id)}/download`;
  }

  /** Récupérer le fichier en blob (avec auth) pour affichage ou téléchargement côté client */
  async fetchFichierBlob(id: string): Promise<Blob> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = this.getFichierDownloadUrl(id);
    const headers: HeadersInit = { Accept: '*/*' };
    const token = getAuthToken();
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`Téléchargement fichier: ${res.status} ${res.statusText}`);
    return res.blob();
  }

  /** Upload d'un document scanné pour prévisualisation (stockage API, même lecture que les PDF). */
  async uploadScanPreview(file: File): Promise<{ previewId: string }> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${this.baseUrl}/api/scan-preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken() || ''}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload prévisualisation: ${res.status} ${res.statusText} - ${text}`);
    }
    const data = await res.json();
    const previewId = data?.data?.previewId;
    if (!previewId) throw new Error('Réponse scan-preview invalide');
    return { previewId };
  }

  /** Récupérer le blob de la prévisualisation scannée (même mécanisme que fetchFichierBlob). */
  async fetchScanPreviewBlob(previewId: string): Promise<Blob> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = `${this.baseUrl}/api/scan-preview/${encodeURIComponent(previewId)}`;
    const headers: HeadersInit = { Accept: '*/*' };
    const token = getAuthToken();
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`Prévisualisation: ${res.status} ${res.statusText}`);
    return res.blob();
  }

  /** Supprimer une prévisualisation scannée côté API (nettoyage). */
  async deleteScanPreview(previewId: string): Promise<void> {
    if (!this.baseUrl) return;
    const url = `${this.baseUrl}/api/scan-preview/${encodeURIComponent(previewId)}`;
    await fetch(url, { method: 'DELETE', headers: buildHeaders() });
  }

  /** PUT /api/fichiers/:id */
  async updateFichier(id: string, updates: { nom?: string; parentId?: string | null; estAccuseReception?: boolean }): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const url = `${this.baseUrl}/api/fichiers/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API update fichier: ${res.status} ${res.statusText} - ${text}`);
    }
    // Invalidation large (on ne connait pas le courrierId ici)
    this.invalidate('GET:fichiers:');
  }

  /** DELETE /api/fichiers/:id */
  async deleteFichier(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const url = `${this.baseUrl}/api/fichiers/${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: 'DELETE', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API delete fichier: ${res.status} ${res.statusText} - ${text}`);
    }
    this.invalidate('GET:fichiers:');
  }

  /** GET /api/storage-stats — statistiques de stockage des fichiers (courriers accessibles). */
  async getStorageStats(userId?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    quota: number;
    byExtension: Array<{ extension: string; count: number; size: number }>;
  }> {
    if (!this.baseUrl) {
      return { totalFiles: 0, totalSize: 0, quota: 1073741824, byExtension: [] };
    }
    const url = userId 
      ? `${this.baseUrl}/api/storage-stats?user_id=${userId}`
      : `${this.baseUrl}/api/storage-stats`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) {
      console.warn('[Storage] getStorageStats:', res.status, res.statusText);
      return { totalFiles: 0, totalSize: 0, quota: 1073741824, byExtension: [] };
    }
    const data = await res.json();
    const raw = data?.data ?? data;
    return {
      totalFiles: Number(raw?.totalFiles ?? 0),
      totalSize: Number(raw?.totalSize ?? 0),
      quota: Number(raw?.quota ?? 1073741824),
      byExtension: Array.isArray(raw?.byExtension) ? raw.byExtension : [],
    };
  }

  // ——— Catégories de classement (courrier_folders) + map ———

  /** GET /api/folders?user_id=xxx — retourne toujours un tableau (catégories de classement). */
  async getFolders(userId: string): Promise<Array<{ id: string; name: string; parentId?: string | null; createdAt: string; updatedAt: string; userId?: string; color?: string | null }>> {
    if (!this.baseUrl) return [];
    const cacheKey = `GET:folders:${userId}`;
    return this.cached(cacheKey, 30000, async () => {
      const url = `${this.baseUrl}/api/folders?user_id=${encodeURIComponent(userId)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000); // Timeout 90s
      try {
        const res = await fetch(url, { method: 'GET', headers: buildHeaders(), signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`API folders: ${res.status} ${res.statusText}`);
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        return list;
      } catch (e: unknown) {
        clearTimeout(timeout);
        if (e instanceof Error && e.name === 'AbortError') {
          console.warn('[Dossiers] getFolders timeout après 90s');
          return [];
        }
        throw e;
      }
    });
  }

  /** POST /api/folders */
  async createFolder(body: { name: string; parentId?: string | null; color?: string | null; visibility?: 'dg' | 'direction' | 'service' | 'private' }): Promise<{ id: string; name: string; parentId?: string | null; createdAt: string; updatedAt: string; userId?: string; color?: string | null; visibility?: string; direction?: string | null; service?: string | null }> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = `${this.baseUrl}/api/folders`;
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      const error = extractValidationError(text, res.status);
      throw new Error(error);
    }
    const data = await res.json();
    this.invalidate('GET:folders:');
    return data?.data ?? data;
  }

  /** PUT /api/folders/:id */
  async updateFolder(id: string, body: { name?: string; parentId?: string | null; color?: string | null; visibility?: 'dg' | 'direction' | 'service' | 'private' }): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = `${this.baseUrl}/api/folders/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      const error = extractValidationError(text, res.status);
      throw new Error(error);
    }
    this.invalidate('GET:folders:');
  }

  /** DELETE /api/folders (body: { ids: string[] }) */
  async deleteFolders(ids: string[]): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = `${this.baseUrl}/api/folders`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: buildHeaders(),
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const text = await res.text();
      const error = extractValidationError(text, res.status);
      throw new Error(error);
    }
    this.invalidate('GET:folders:');
  }

  /** GET /api/folder-map — utilise le token (Auth::id()) côté backend */
  async getFolderMap(_userId?: string): Promise<Record<string, string | null>> {
    if (!this.baseUrl) return {};
    const cacheKey = 'GET:folder-map';
    return this.cached(cacheKey, 30000, async () => {
      const url = `${this.baseUrl}/api/folder-map`;
      console.log('[Catégories] getFolderMap START:', url);
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // Timeout 30s
      try {
        const res = await fetch(url, { method: 'GET', headers: buildHeaders(), signal: controller.signal });
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        console.log('[Catégories] getFolderMap response:', res.status, 'en', elapsed, 'ms');
        if (!res.ok) {
          const text = await res.text();
          console.warn('[Catégories] getFolderMap API erreur:', res.status, res.statusText, text || '');
          return {};
        }
        const data = await res.json();
        // Accepter data.data.map (Laravel) ou data.map
        const raw = data?.data?.map ?? data?.map;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        const out: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(raw)) {
          out[String(k)] = v == null ? null : String(v);
        }
        console.log('[Catégories] getFolderMap SUCCESS:', Object.keys(out).length, 'entrées');
        return out;
      } catch (e: unknown) {
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        if (e instanceof Error && e.name === 'AbortError') {
          console.warn('[Catégories] getFolderMap TIMEOUT après', elapsed, 'ms (timeout 30s)');
          return {};
        }
        // En cas d'erreur réseau, retourner un objet vide au lieu de throw
        console.warn('[Catégories] getFolderMap erreur réseau:', e);
        return {};
      }
    });
  }

  /** PUT /api/folder-map (body: { map: Record<string, string | null> }) */
  async saveFolderMap(userId: string, map: Record<string, string | null>): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = `${this.baseUrl}/api/folder-map`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // Timeout 30s
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify({ map }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API save folder map: ${res.status} ${res.statusText} - ${text}`);
      }
      this.invalidate('GET:folder-map');
    } catch (e: unknown) {
      clearTimeout(timeout);
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Timeout: le serveur met trop de temps à répondre');
      }
      throw e;
    }
  }

  /**
   * Récupérer l'utilisateur connecté via le token (GET /api/auth/me).
   * Utilisé pour une authentification basée sur le token : la session est dérivée du JWT.
   */
  async getMe(): Promise<Utilisateur | null> {
    if (!this.baseUrl) return null;
    const url = `${this.baseUrl}/api/auth/me`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.data;
    if (!raw || typeof raw !== 'object') return null;
    const u = raw as Record<string, unknown>;
    const entiteId = u.entiteId ?? u.entite_id;
    return {
      id: String(u.id ?? ''),
      nom: String(u.nom ?? u.name ?? ''),
      email: String(u.email ?? ''),
      role: (u.role as Utilisateur['role']) ?? 'AGENT',
      direction: u.direction != null ? String(u.direction) : undefined,
      service: u.service != null ? String(u.service) : undefined,
      entiteId: entiteId != null ? String(entiteId) : undefined,
      actif: Boolean(u.actif),
      photoUrl: u.photoUrl != null ? String(u.photoUrl) : (u.photo_url != null ? String(u.photo_url) : undefined),
      twoFactorEnabled: Boolean(u.twoFactorEnabled ?? u.two_factor_confirmed_at),
      permissions: Array.isArray(u.permissions) ? u.permissions as Permission[] : [],
      dateCreation: new Date(),
      dateModification: new Date(),
    };
  }

  /**
   * Connexion Laravel classique : email + mot de passe → JWT.
   * POST /api/auth/login
   */
  async login(email: string, password: string): Promise<{ token?: string; twoFactorRequired?: boolean; challenge?: string }> {
    if (!this.baseUrl) return {};
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return {
      token: typeof data?.token === 'string' ? data.token : undefined,
      twoFactorRequired: data?.twoFactorRequired === true,
      challenge: typeof data?.challenge === 'string' ? data.challenge : undefined,
    };
  }

  async completeTwoFactorLogin(challenge: string, code: string): Promise<string | null> {
    if (!this.baseUrl) return null;
    const res = await fetch(`${this.baseUrl}/api/auth/two-factor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ challenge, code }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.token === 'string' ? data.token : null;
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    await fetch(`${this.baseUrl}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email }) });
  }

  async resetPassword(email: string, token: string, password: string, passwordConfirmation: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email, token, password, password_confirmation: passwordConfirmation }) });
    if (!res.ok) throw new Error(await res.text());
  }

  async updateProfile(nom: string): Promise<Utilisateur> {
    const res = await fetch(`${this.baseUrl}/api/profile`, { method: 'PUT', headers: buildHeaders(), body: JSON.stringify({ name: nom }) });
    if (!res.ok) throw new Error(await res.text());
    return parseUtilisateurFromApi((await res.json()).data);
  }

  async uploadProfilePhoto(photo: File): Promise<Utilisateur> {
    const form = new FormData(); form.append('photo', photo);
    const token = getAuthToken();
    const res = await fetch(`${this.baseUrl}/api/profile/photo`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' }, body: form });
    if (!res.ok) throw new Error(await res.text());
    return parseUtilisateurFromApi((await res.json()).data);
  }

  async changeProfilePassword(currentPassword: string, password: string, passwordConfirmation: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/profile/password`, { method: 'PUT', headers: buildHeaders(), body: JSON.stringify({ current_password: currentPassword, password, password_confirmation: passwordConfirmation }) });
    if (!res.ok) throw new Error(await res.text());
  }

  async beginTwoFactor(): Promise<{ secret: string; otpauthUri: string }> {
    const res = await fetch(`${this.baseUrl}/api/profile/two-factor`, { method: 'POST', headers: buildHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async confirmTwoFactor(code: string): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/profile/two-factor/confirm`, { method: 'POST', headers: buildHeaders(), body: JSON.stringify({ code }) });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()).recoveryCodes ?? [];
  }

  async disableTwoFactor(currentPassword: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/profile/two-factor`, { method: 'DELETE', headers: buildHeaders(), body: JSON.stringify({ current_password: currentPassword }) });
    if (!res.ok) throw new Error(await res.text());
  }

  /** Définir le token d'authentification (après login Laravel/Sanctum) */
  setAuthToken(token: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('laravel_token', token);
    }
  }

  clearAuthToken(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('laravel_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');
      localStorage.removeItem('access_token');
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('user_token');
    }
  }

  // ——— Assignations (MySQL) ———
  async getAssignations(assigneA?: string): Promise<Assignation[]> {
    if (!this.baseUrl) return [];
    const url = assigneA
      ? `${this.baseUrl}/api/assignations?assigne_a=${encodeURIComponent(assigneA)}`
      : `${this.baseUrl}/api/assignations`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((item: Record<string, unknown>) => parseAssignationFromApi(item));
  }

  /**
   * Récupérer toutes les assignations d'une direction (optimisé pour les secrétaires)
   */
  async getAssignationsByDirection(direction: string): Promise<Assignation[]> {
    if (!this.baseUrl) return [];
    
    try {
      console.log(`📋 [API] Chargement des assignations pour la direction: ${direction}`);
      
      // Récupérer tous les utilisateurs de la direction
      const usersUrl = `${this.baseUrl}/api/users`;
      const usersRes = await fetch(usersUrl, { method: 'GET', headers: buildHeaders() });
      if (!usersRes.ok) return [];
      
      const usersData = await usersRes.json();
      const allUsers = Array.isArray(usersData?.data) ? usersData.data : [];
      const usersInDirection = allUsers.filter((user: any) => user.direction === direction);
      
      console.log(`👥 [API] ${usersInDirection.length} utilisateurs trouvés dans la direction ${direction}`);
      
      // Limiter à 5 utilisateurs maximum pour éviter la surcharge
      const limitedUsers = usersInDirection.slice(0, 5);
      
      // Charger les assignations pour chaque utilisateur en parallèle
      const assignationPromises = limitedUsers.map(async (user: any) => {
        try {
          const assignations = await this.getAssignations(user.id);
          console.log(`  - ${user.nom}: ${assignations.length} assignations`);
          return assignations;
        } catch (error) {
          console.warn(`⚠️ Erreur assignations pour ${user.nom}:`, error);
          return [];
        }
      });
      
      const allAssignationsArrays = await Promise.all(assignationPromises);
      const allAssignations = allAssignationsArrays.flat();
      
      // Éliminer les doublons
      const uniqueAssignations = allAssignations.filter((assignation, index, self) =>
        index === self.findIndex((a) => a.id === assignation.id)
      );
      
      console.log(`✅ [API] ${uniqueAssignations.length} assignations uniques chargées pour la direction ${direction}`);
      return uniqueAssignations;
    } catch (error) {
      console.error('❌ [API] Erreur getAssignationsByDirection:', error);
      return [];
    }
  }

  async getAssignationsByCourrier(courrierId: string): Promise<Assignation[]> {
    if (!this.baseUrl) return [];
    const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(courrierId)}/assignations`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((item: Record<string, unknown>) => parseAssignationFromApi(item));
  }

  async createAssignation(body: { courrierId: string; assigneA: string; assignePar?: string; dateEcheance?: Date; instructions?: string; statut?: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' }): Promise<Assignation> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/assignations`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        courrierId: body.courrierId,
        assigneA: body.assigneA,
        assignePar: body.assignePar,
        dateEcheance: body.dateEcheance?.toISOString?.() ?? undefined,
        instructions: body.instructions,
        statut: body.statut,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API create assignation: ${res.status} - ${text}`);
    }
    const data = await res.json();
    return parseAssignationFromApi(data?.data ?? data);
  }

  async updateAssignation(id: string, updates: { dateEcheance?: Date; instructions?: string; statut?: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' }): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/assignations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({
        dateEcheance: updates.dateEcheance?.toISOString?.(),
        instructions: updates.instructions,
        statut: updates.statut,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API update assignation: ${res.status} - ${text}`);
    }
  }

  async deleteAssignation(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/assignations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API delete assignation: ${res.status} - ${text}`);
    }
  }

  /**
   * GET /api/workflow-etapes/courrier-ids?assigne_a={userId}
   * Retourne les IDs de courriers ayant au moins une étape workflow assignée à cet utilisateur.
   */
  async getCourrierIdsByWorkflowAssignee(userId: string): Promise<string[]> {
    if (!this.baseUrl) return [];
    const url = `${this.baseUrl}/api/workflow-etapes/courrier-ids?assigne_a=${encodeURIComponent(userId)}`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((id: unknown) => String(id));
  }

  /**
   * GET /api/workflow-etapes/courrier-ids?direction={direction}[&service={service}]
   * 1 seul appel SQL — retourne les IDs de courriers ayant une étape pour n'importe quel
   * utilisateur de cette direction (et service optionnel). Évite N appels parallèles.
   */
  async getCourrierIdsByWorkflowDirection(direction: string, service?: string): Promise<string[]> {
    if (!this.baseUrl) return [];
    let url = `${this.baseUrl}/api/workflow-etapes/courrier-ids?direction=${encodeURIComponent(direction)}`;
    if (service) url += `&service=${encodeURIComponent(service)}`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((id: unknown) => String(id));
  }

  /**
   * GET /api/annotations/courrier-ids?auteur={userId}
   * Retourne les IDs de courriers ayant au moins une annotation créée par cet utilisateur.
   */
  async getCourrierIdsByAnnotationAuteur(userId: string): Promise<string[]> {
    if (!this.baseUrl) return [];
    const url = `${this.baseUrl}/api/annotations/courrier-ids?auteur=${encodeURIComponent(userId)}`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((id: unknown) => String(id));
  }

  // ——— Annotations (MySQL) ———
  async getAnnotationsByCourrier(courrierId: string): Promise<Annotation[]> {
    if (!this.baseUrl) return [];
    const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(courrierId)}/annotations`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((item: Record<string, unknown>) => parseAnnotationFromApi(item));
  }

  async createAnnotation(body: { courrierId: string; contenu: string; type: 'MINUTE' | 'NOTE' | 'COMMENTAIRE'; auteur?: string; workflowEtapeId?: string; fichiers?: string[] }): Promise<Annotation> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/annotations`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        courrierId: body.courrierId,
        contenu: body.contenu,
        type: body.type,
        workflowEtapeId: body.workflowEtapeId ?? undefined,
        fichiers: body.fichiers ?? undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API create annotation: ${res.status} - ${text}`);
    }
    const data = await res.json();
    return parseAnnotationFromApi(data?.data ?? data);
  }

  // ——— Notifications ———
  async createNotification(notification: {
    userId: string;
    type: 'assignation' | 'rappel' | 'echeance' | 'workflow' | 'courrier' | 'system';
    title: string;
    message: string;
    relatedId?: string;
    relatedType?: 'assignation' | 'courrier' | 'workflow' | 'rappel';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    actionUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = `${this.baseUrl}/api/notifications`;
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        ...notification,
        createdAt: new Date().toISOString(),
        read: false
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API create notification: ${res.status} - ${text}`);
    }
    return res.json();
  }

  async getNotificationsByUser(userId: string, options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    if (!this.baseUrl) return [];
    const params = new URLSearchParams();
    if (options?.unreadOnly) params.append('unreadOnly', 'true');
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    // GET /api/notifications — le contrôleur filtre par Auth::user()
    const url = `${this.baseUrl}/api/notifications?${params}`;
    const cacheKey = `GET:notifications:${userId}:${params.toString()}`;
    return this.cached(cacheKey, 15000, async () => {
      const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      // Le contrôleur retourne directement le tableau (pas enveloppé dans {data:...})
      return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    });
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    if (!this.baseUrl) return;
    // POST /api/notifications/{id}/mark-read
    const url = `${this.baseUrl}/api/notifications/${encodeURIComponent(notificationId)}/mark-read`;
    const res = await fetch(url, { method: 'POST', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API mark notification read: ${res.status} - ${text}`);
    }
    this.invalidate('GET:notifications:');
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    if (!this.baseUrl) return;
    // POST /api/notifications/mark-all-read
    const url = `${this.baseUrl}/api/notifications/mark-all-read`;
    const res = await fetch(url, { method: 'POST', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API mark all notifications read: ${res.status} - ${text}`);
    }
    this.invalidate('GET:notifications:');
  }

  async deleteNotification(notificationId: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = `${this.baseUrl}/api/notifications/${encodeURIComponent(notificationId)}`;
    const res = await fetch(url, { method: 'DELETE', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API delete notification: ${res.status} - ${text}`);
    }
    this.invalidate('GET:notifications:');
  }

  async deleteAllNotifications(): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const url = `${this.baseUrl}/api/notifications/all`;
    const res = await fetch(url, { method: 'DELETE', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API delete all notifications: ${res.status} - ${text}`);
    }
    this.invalidate('GET:notifications:');
  }

  async getUnreadNotificationsCount(userId: string): Promise<number> {
    if (!this.baseUrl) return 0;
    // GET /api/notifications/unread-count
    const cacheKey = `GET:notifications:unread-count:${userId}`;
    return this.cached(cacheKey, 15000, async () => {
      const url = `${this.baseUrl}/api/notifications/unread-count`;
      const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
      if (!res.ok) return 0;
      const data = await res.json();
      return data?.count || 0;
    });
  }

  // ——— Workflow étapes (MySQL) ———
  async getWorkflowEtapesByCourrier(courrierId: string): Promise<WorkflowEtape[]> {
    if (!this.baseUrl) return [];
    const url = `${this.baseUrl}/api/courriers/${encodeURIComponent(courrierId)}/workflow-etapes`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((item: Record<string, unknown>) => parseWorkflowEtapeFromApi(item));
  }

  async createWorkflowEtape(body: {
    courrierId: string;
    etape: string;
    assigneA: string;
    statut?: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'REJETE';
    commentaire?: string;
    dureeEstimee?: number;
    ordre?: number;
    declencheur?: { type: string; etapePrecedenteId?: string; dateDeclenchement?: Date };
    estCondition?: boolean;
    actionSiVrai?: string;
    actionSiFaux?: string;
  }): Promise<WorkflowEtape> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const payload: Record<string, unknown> = {
      courrierId: body.courrierId,
      etape: body.etape,
      assigneA: body.assigneA,
      statut: body.statut,
      commentaire: body.commentaire,
      dureeEstimee: body.dureeEstimee,
      ordre: body.ordre,
      estCondition: body.estCondition,
      // Ne pas envoyer les chaînes vides pour les UUIDs (validation Laravel 'nullable|uuid')
      ...(body.actionSiVrai ? { actionSiVrai: body.actionSiVrai } : {}),
      ...(body.actionSiFaux ? { actionSiFaux: body.actionSiFaux } : {}),
    };
    if (body.declencheur) {
      payload.declencheur = {
        type: body.declencheur.type,
        etapePrecedenteId: body.declencheur.etapePrecedenteId,
        dateDeclenchement: body.declencheur.dateDeclenchement?.toISOString?.(),
      };
    }
    const res = await fetch(`${this.baseUrl}/api/workflow-etapes`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API create workflow: ${res.status} - ${text}`);
    }
    const data = await res.json();
    return parseWorkflowEtapeFromApi(data?.data ?? data);
  }

  async updateWorkflowEtape(id: string, updates: Partial<WorkflowEtape>): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const payload: Record<string, unknown> = {};
    if (updates.etape != null) payload.etape = updates.etape;
    if (updates.assigneA != null) payload.assigneA = updates.assigneA;
    if (updates.statut != null) payload.statut = updates.statut;
    if (updates.dateDebut != null) payload.dateDebut = updates.dateDebut instanceof Date ? updates.dateDebut.toISOString() : updates.dateDebut;
    if (updates.dateFin != null) payload.dateFin = updates.dateFin instanceof Date ? updates.dateFin.toISOString() : updates.dateFin;
    if (updates.commentaire != null) payload.commentaire = updates.commentaire;
    if (updates.dureeEstimee != null) payload.dureeEstimee = updates.dureeEstimee;
    if (updates.ordre != null) payload.ordre = updates.ordre;
    const res = await fetch(`${this.baseUrl}/api/workflow-etapes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API update workflow: ${res.status} - ${text}`);
    }
  }

  async addWorkflowResponse(id: string, body: { message: string; decision?: string; auteurId?: string; auteurNom?: string }): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/workflow-etapes/${encodeURIComponent(id)}/responses`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ message: body.message, decision: body.decision }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API add workflow response: ${res.status} - ${text}`);
    }
  }

  async deleteWorkflowEtape(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/workflow-etapes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API delete workflow: ${res.status} - ${text}`);
    }
  }

  // ——— Rappels (MySQL) ———
  async getRappels(assigneA?: string): Promise<Rappel[]> {
    if (!this.baseUrl) return [];
    const url = assigneA
      ? `${this.baseUrl}/api/rappels?assigne_a=${encodeURIComponent(assigneA)}`
      : `${this.baseUrl}/api/rappels`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((item: Record<string, unknown>) => parseRappelFromApi(item));
  }

  async createRappel(body: { assignationId: string; courrierId: string; dateRappel: Date; message?: string }): Promise<Rappel> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/rappels`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        assignationId: body.assignationId,
        courrierId: body.courrierId,
        dateRappel: body.dateRappel?.toISOString?.() ?? new Date().toISOString(),
        message: body.message,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API create rappel: ${res.status} - ${text}`);
    }
    const data = await res.json();
    return parseRappelFromApi(data?.data ?? data);
  }

  async marquerRappelEnvoye(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/rappels/${encodeURIComponent(id)}/envoye`, { method: 'POST', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API marquer rappel envoyé: ${res.status} - ${text}`);
    }
  }

  // ——— Utilisateurs (MySQL, admin) ———
  async getUsers(): Promise<Utilisateur[]> {
    if (!this.baseUrl) return [];
    const headers = buildHeaders();
    const users: Utilisateur[] = [];

    // On gère à la fois les réponses paginées Laravel ({ data, meta, links })
    // et les réponses simples (tableau direct).
    let page = 1;
    const perPage = 100;
    let safety = 0;

    while (safety < 50) {
      const url = `${this.baseUrl}/api/users?page=${page}&per_page=${perPage}`;
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
      if (!res.ok) {
        if (page === 1) {
          const fallbackRes = await fetch(`${this.baseUrl}/api/users`, { method: 'GET', headers, cache: 'no-store' });
          if (!fallbackRes.ok) return [];
          const data = await fallbackRes.json();
          const list = Array.isArray(data?.data) ? data.data
            : Array.isArray(data) ? data
            : [];
          return list.map((item: Record<string, unknown>) => parseUtilisateurFromApi(item));
        }
        break;
      }

      const data = await res.json() as any;
      const list = Array.isArray(data?.data) ? data.data
        : Array.isArray(data) ? data
        : [];

      if (!list.length) break;
      users.push(...list.map((item: Record<string, unknown>) => parseUtilisateurFromApi(item)));

      const meta = data?.meta;
      const links = data?.links;
      const hasMoreByMeta =
        meta &&
        typeof meta.current_page === 'number' &&
        typeof meta.last_page === 'number' &&
        meta.current_page < meta.last_page;
      const hasNextLink =
        typeof links?.next === 'string' && links.next;

      if (hasMoreByMeta || hasNextLink) {
        page += 1;
        safety += 1;
        continue;
      }

      break;
    }

    return users;
  }

  async createUser(body: {
    nom: string;
    email: string;
    password?: string;
    role: Utilisateur['role'];
    direction?: string;
    service?: string;
    entiteId?: string;
    actif?: boolean;
  }): Promise<Utilisateur> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const password =
      body.password && String(body.password).trim() !== ''
        ? String(body.password)
        : 'Password123!';
    const payload: Record<string, unknown> = {
      name: body.nom,
      email: body.email,
      password,
      role: body.role,
      direction: body.direction ?? null,
      service: body.service ?? null,
      entite_id: body.entiteId ?? null,
      actif: body.actif ?? true,
    };
    const res = await fetch(`${this.baseUrl}/api/users`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API create user: ${res.status} - ${text}`);
    }
    const data = await res.json();
    return parseUtilisateurFromApi(data?.data ?? data);
  }

  async updateUser(id: string, updates: Partial<Utilisateur> & { password?: string }): Promise<Utilisateur> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const payload: Record<string, unknown> = {};
    if (updates.nom != null) payload.name = updates.nom;
    if (updates.email != null) payload.email = updates.email;
    if (updates.password != null && updates.password !== '') payload.password = updates.password;
    if (updates.role != null) payload.role = updates.role;
    if (updates.direction !== undefined) payload.direction = updates.direction;
    if (updates.service !== undefined) payload.service = updates.service;
    if (updates.entiteId !== undefined) payload.entite_id = updates.entiteId;
    if (updates.actif !== undefined) payload.actif = updates.actif;

    const res = await fetch(`${this.baseUrl}/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API update user: ${res.status} - ${text}`);
    }
    const data = await res.json();
    return parseUtilisateurFromApi(data?.data ?? data);
  }

  async deleteUser(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`API delete user: ${res.status} - ${text}`);
    }
  }

  // ——— Rôles et permissions (MySQL, table roles) ———
  async getRoles(): Promise<RoleDefinition[]> {
    if (!this.baseUrl) return [];
    try {
      const res = await fetch(`${this.baseUrl}/api/roles`, { method: 'GET', headers: buildHeaders(), cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : [];
      return list.map((item: Record<string, unknown>) => parseRoleFromApi(item));
    } catch {
      return [];
    }
  }

  async createRole(body: Omit<RoleDefinition, 'id' | 'dateCreation' | 'dateModification'>): Promise<RoleDefinition> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/roles`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        nom: body.nom,
        code: body.code,
        description: body.description ?? null,
        permissions: body.permissions ?? [],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiErrorMessage(res.status, text));
    }
    const data = await res.json();
    return parseRoleFromApi(data?.data ?? {});
  }

  async updateRole(id: string, updates: Partial<Pick<RoleDefinition, 'nom' | 'code' | 'description' | 'permissions'>>): Promise<RoleDefinition> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const payload: Record<string, unknown> = {};
    if (updates.nom !== undefined) payload.nom = updates.nom;
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.permissions !== undefined) payload.permissions = updates.permissions;
    const res = await fetch(`${this.baseUrl}/api/roles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiErrorMessage(res.status, text));
    }
    const data = await res.json();
    return parseRoleFromApi(data?.data ?? {});
  }

  async deleteRole(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/roles/${encodeURIComponent(id)}`, { method: 'DELETE', headers: buildHeaders() });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(parseApiErrorMessage(res.status, text));
    }
  }

  // ——— Config formulaire (MySQL) ———
  async getConfigFormulaire(): Promise<Record<string, unknown>> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/config/formulaire`, { method: 'GET', headers: buildHeaders() });
    if (res.status === 401) {
      throw new Error('Non authentifié. Connectez-vous avec votre compte Laravel (email / mot de passe).');
    }
    if (res.status === 403) {
      throw new Error('Droits insuffisants pour lire la config formulaire.');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Laravel config formulaire: ${res.status} - ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw = data?.data;
    return raw && typeof raw === 'object' ? raw : {};
  }

  async saveConfigFormulaire(config: Record<string, unknown>): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/config/formulaire`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({ data: config }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API save config formulaire: ${res.status} - ${text}`);
    }
  }

  /** Config générique par clé (GET /api/config/{key}). */
  async getConfigByKey(key: string): Promise<Record<string, unknown>> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/config/${encodeURIComponent(key)}`, { method: 'GET', headers: buildHeaders() });
    if (res.status === 401) {
      throw new Error('Non authentifié. Connectez-vous avec votre compte Laravel (email / mot de passe).');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Laravel config ${key}: ${res.status} - ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw = data?.data;
    return raw && typeof raw === 'object' ? raw : {};
  }

  /** Sauvegarde config générique par clé (PUT /api/config/{key}). */
  async saveConfigByKey(key: string, config: Record<string, unknown>): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/config/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({ data: config }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API save config ${key}: ${res.status} - ${text}`);
    }
  }

  /** Limites d'import de fichiers (pour tout utilisateur authentifié). */
  async getImportFichiersLimits(): Promise<{ maxSizeMo: number; compressImages: boolean }> {
    if (!this.baseUrl) return { maxSizeMo: 100, compressImages: true };
    try {
      const res = await fetch(`${this.baseUrl}/api/parametres/import-fichiers`, { method: 'GET', headers: buildHeaders() });
      if (!res.ok) return { maxSizeMo: 100, compressImages: true };
      const data = await res.json();
      const d = data?.data;
      const maxMo = Number(d?.maxSizeMo);
      return {
        maxSizeMo: Number.isFinite(maxMo) && maxMo >= 1 ? maxMo : 100,
        compressImages: typeof d?.compressImages === 'boolean' ? d.compressImages : true,
      };
    } catch {
      return { maxSizeMo: 100, compressImages: true };
    }
  }

  /** Mise à jour config import fichiers (paramétrage, nécessite droits admin). */
  async updateImportFichiersConfig(payload: { maxSizeMo: number; compressImages: boolean }): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/config/courrier_fichier`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mise à jour paramètres import: ${res.status} - ${text}`);
    }
  }

  // ——— Types d'entités (libellés Direction, Service, Sous-service, etc.) ———
  /** Libellés pour tout utilisateur authentifié (GET entite-types/labels). */
  async getEntiteTypesLabels(): Promise<EntiteTypeDefinition[]> {
    if (!this.baseUrl) return [];
    try {
      const res = await fetch(`${this.baseUrl}/api/entite-types/labels`, { method: 'GET', headers: buildHeaders(), cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : [];
      return list.map((item: Record<string, unknown>) => parseEntiteTypeFromApi(item));
    } catch {
      return [];
    }
  }

  /** Liste complète (admin, nécessite voir-roles). */
  async getEntiteTypes(): Promise<EntiteTypeDefinition[]> {
    if (!this.baseUrl) return [];
    try {
      const res = await fetch(`${this.baseUrl}/api/entite-types`, { method: 'GET', headers: buildHeaders(), cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : [];
      return list.map((item: Record<string, unknown>) => parseEntiteTypeFromApi(item));
    } catch {
      return [];
    }
  }

  async createEntiteType(payload: { code: string; libelleSingulier: string; libellePluriel: string; description?: string; icone?: string; ordre?: number; actif?: boolean }): Promise<EntiteTypeDefinition> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const res = await fetch(`${this.baseUrl}/api/entite-types`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiErrorMessage(res.status, text));
    }
    const data = await res.json();
    return parseEntiteTypeFromApi(data?.data ?? {});
  }

  async updateEntiteType(id: string, payload: Partial<{ code: string; libelleSingulier: string; libellePluriel: string; description: string; icone: string; ordre: number; actif: boolean }>): Promise<EntiteTypeDefinition> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    // Ne garder que les clés définies pour que le backend reçoive bien actif: false
    const body: Record<string, unknown> = {};
    if (payload.code !== undefined) body.code = payload.code;
    if (payload.libelleSingulier !== undefined) body.libelleSingulier = payload.libelleSingulier;
    if (payload.libellePluriel !== undefined) body.libellePluriel = payload.libellePluriel;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.icone !== undefined) body.icone = payload.icone;
    if (payload.ordre !== undefined) body.ordre = payload.ordre;
    if (payload.actif !== undefined) body.actif = Boolean(payload.actif);
    const res = await fetch(`${this.baseUrl}/api/entite-types/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiErrorMessage(res.status, text));
    }
    const data = await res.json();
    return parseEntiteTypeFromApi(data?.data ?? {});
  }

  async deleteEntiteType(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL)');
    const res = await fetch(`${this.baseUrl}/api/entite-types/${encodeURIComponent(id)}`, { method: 'DELETE', headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiErrorMessage(res.status, text));
    }
  }

  // ——— Entités organisationnelles (MySQL) ———
  async getEntitesOrganisationnelles(params?: { type?: string; parentId?: string }): Promise<EntiteOrganisationnelle[]> {
    if (!this.baseUrl) return [];
    const search = new URLSearchParams();
    if (params?.type) search.set('type', params.type);
    if (params?.parentId) search.set('parentId', params.parentId);
    const qs = search.toString();
    const url = `${this.baseUrl}/api/entites-organisationnelles${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { method: 'GET', headers: buildHeaders(), cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((item: Record<string, unknown>) => parseEntiteFromApi(item));
  }

  async createEntiteOrganisationnelle(body: Omit<EntiteOrganisationnelle, 'id'>): Promise<EntiteOrganisationnelle> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const payload: Record<string, unknown> = {
      nom: body.nom,
      type: body.type,
      description: body.description ?? null,
      parentId: body.parentId ?? null,
      ordre: body.ordre ?? 0,
      actif: body.actif ?? true,
      responsableId: body.responsableId ?? null,
    };
    const res = await fetch(`${this.baseUrl}/api/entites-organisationnelles`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API create entité: ${res.status} - ${text}`);
    }
    const data = await res.json();
    const raw = (data as any)?.data ?? data;
    return parseEntiteFromApi(raw as Record<string, unknown>);
  }

  async updateEntiteOrganisationnelle(id: string, updates: Partial<EntiteOrganisationnelle>): Promise<EntiteOrganisationnelle> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const payload: Record<string, unknown> = {};
    if (updates.nom !== undefined) payload.nom = updates.nom;
    if (updates.type !== undefined) payload.type = updates.type;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.parentId !== undefined) payload.parentId = updates.parentId;
    if (updates.ordre !== undefined) payload.ordre = updates.ordre;
    if (updates.actif !== undefined) payload.actif = updates.actif;
    if (updates.responsableId !== undefined) payload.responsableId = updates.responsableId;

    const res = await fetch(`${this.baseUrl}/api/entites-organisationnelles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API update entité: ${res.status} - ${text}`);
    }
    const data = await res.json();
    const raw = (data as any)?.data ?? data;
    return parseEntiteFromApi(raw as Record<string, unknown>);
  }

  async deleteEntiteOrganisationnelle(id: string): Promise<void> {
    if (!this.baseUrl) throw new Error('API Laravel non configurée');
    const res = await fetch(`${this.baseUrl}/api/entites-organisationnelles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API delete entité: ${res.status} - ${text}`);
    }
  }
}

function parseAssignationFromApi(raw: Record<string, unknown>): Assignation {
  const out = { ...raw } as Record<string, unknown>;
  for (const k of ['dateAssignation', 'dateEcheance']) {
    const v = raw[k] ?? (raw as Record<string, unknown>)[k === 'dateAssignation' ? 'date_assignation' : 'date_echeance'];
    if (typeof v === 'string') out[k === 'dateAssignation' ? 'dateAssignation' : 'dateEcheance'] = new Date(v);
  }
  if (raw.courrierId == null && (raw as Record<string, unknown>).courrier_id != null) out.courrierId = (raw as Record<string, unknown>).courrier_id as string;
  if (raw.assigneA == null && (raw as Record<string, unknown>).assigne_a != null) out.assigneA = (raw as Record<string, unknown>).assigne_a as string;
  if (raw.assignePar == null && (raw as Record<string, unknown>).assigne_par != null) out.assignePar = (raw as Record<string, unknown>).assigne_par as string;
  return out as unknown as Assignation;
}

function parseAnnotationFromApi(raw: Record<string, unknown>): Annotation {
  const out = { ...raw } as Record<string, unknown>;
  const created = raw.dateCreation ?? (raw as Record<string, unknown>).created_at ?? (raw as Record<string, unknown>).createdAt;
  if (typeof created === 'string') out.dateCreation = new Date(created);
  if (raw.auteur == null && (raw as Record<string, unknown>).created_by != null) out.auteur = (raw as Record<string, unknown>).created_by as string;
  return out as unknown as Annotation;
}

function parseWorkflowEtapeFromApi(raw: Record<string, unknown>): WorkflowEtape {
  const out = { ...raw } as Record<string, unknown>;
  for (const k of ['createdAt', 'dateDebut', 'dateFin']) {
    const v = (raw as Record<string, unknown>)[k] ?? (raw as Record<string, unknown>)[k === 'createdAt' ? 'created_at' : k === 'dateDebut' ? 'date_debut' : 'date_fin'];
    if (typeof v === 'string') (out as Record<string, unknown>)[k] = new Date(v);
  }
  if (raw.declencheur && typeof (raw.declencheur as Record<string, unknown>).dateDeclenchement === 'string') {
    (out.declencheur as Record<string, unknown>).dateDeclenchement = new Date((out.declencheur as Record<string, unknown>).dateDeclenchement as string);
  }
  if (Array.isArray(out.responses)) {
    out.responses = (out.responses as unknown[]).map((r: unknown) => {
      const o = r as Record<string, unknown>;
      if (typeof o?.createdAt === 'string') o.createdAt = new Date(o.createdAt);
      return o;
    });
  }
  return out as unknown as WorkflowEtape;
}

function parseRappelFromApi(raw: Record<string, unknown>): Rappel {
  const out = { ...raw } as Record<string, unknown>;
  const created = raw.createdAt ?? (raw as Record<string, unknown>).created_at;
  if (typeof created === 'string') out.createdAt = new Date(created);
  const dr = raw.dateRappel ?? (raw as Record<string, unknown>).date_rappel;
  if (typeof dr === 'string') out.dateRappel = new Date(dr);
  return out as unknown as Rappel;
}

const ROLES_NORM: Record<string, string> = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SECRETAIRE: 'SECRETAIRE',
  DIRECTEUR_GENERAL: 'DIRECTEUR_GENERAL',
  DIRECTEUR: 'DIRECTEUR',
  CHEF_SERVICE: 'CHEF_SERVICE',
  AGENT: 'AGENT',
};
function normalizeRoleFromApi(role: unknown): Utilisateur['role'] {
  const s = String(role ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  return (ROLES_NORM[s] ?? (s in ROLES_NORM ? s : 'AGENT')) as Utilisateur['role'];
}

function parseUtilisateurFromApi(raw: Record<string, unknown>): Utilisateur {
  const u = raw as Record<string, unknown>;
  const entiteId = u.entiteId ?? u.entite_id;
  return {
    id: String(u.id ?? ''),
    nom: String(u.nom ?? u.name ?? ''),
    email: String(u.email ?? ''),
    role: normalizeRoleFromApi(u.role),
    direction: u.direction != null ? String(u.direction) : undefined,
    service: u.service != null ? String(u.service) : undefined,
    entiteId: entiteId != null ? String(entiteId) : undefined,
    actif: Boolean(u.actif),
    photoUrl: u.photoUrl != null ? String(u.photoUrl) : (u.photo_url != null ? String(u.photo_url) : undefined),
    twoFactorEnabled: Boolean(u.twoFactorEnabled ?? u.two_factor_confirmed_at),
    dateCreation: new Date(),
    dateModification: new Date(),
  };
}

function parseEntiteFromApi(raw: Record<string, unknown>): EntiteOrganisationnelle {
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };
  if (r.id != null) out.id = String(r.id);
  const rawParentId = r.parentId ?? r.parent_id;
  out.parentId = rawParentId != null && rawParentId !== '' ? String(rawParentId) : undefined;
  const rawResponsableId = r.responsableId ?? r.responsable_id;
  out.responsableId = rawResponsableId != null && rawResponsableId !== '' ? String(rawResponsableId) : undefined;
  return out as unknown as EntiteOrganisationnelle;
}

function parseEntiteTypeFromApi(raw: Record<string, unknown>): EntiteTypeDefinition {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    code: (r.code ?? '') as EntiteTypeDefinition['code'],
    libelleSingulier: String(r.libelleSingulier ?? r.libelle_singulier ?? ''),
    libellePluriel: String(r.libellePluriel ?? r.libelle_pluriel ?? ''),
    description: r.description != null ? String(r.description) : undefined,
    icone: r.icone != null ? String(r.icone) : undefined,
    ordre: Number(r.ordre ?? 0),
    actif: r.actif === true || r.actif === 1,
  };
}

function parseRoleFromApi(raw: Record<string, unknown>): RoleDefinition {
  const r = raw as Record<string, unknown>;
  const perms = r.permissions;
  const permissions = Array.isArray(perms) ? (perms as unknown as Permission[]) : [];
  const dateCreation = r.dateCreation ?? r.created_at;
  const dateModification = r.dateModification ?? r.updated_at;
  return {
    id: String(r.id ?? ''),
    nom: String(r.nom ?? ''),
    code: (r.code ?? '') as RoleDefinition['code'],
    description: r.description != null ? String(r.description) : undefined,
    permissions,
    dateCreation: typeof dateCreation === 'string' ? new Date(dateCreation) : new Date(),
    dateModification: typeof dateModification === 'string' ? new Date(dateModification) : new Date(),
  };
}

export const laravelApiService = new LaravelApiService();
