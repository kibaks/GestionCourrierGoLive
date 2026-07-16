import { CategorieFichier } from '../types';
import { laravelApiService } from './laravelApiService';

/**
 * Service catégories/fichiers (arborescence par courrier).
 * Uniquement API Laravel (MySQL) — Firestore et Firebase Storage désactivés.
 * VITE_LARAVEL_API_URL doit être configuré pour les fichiers.
 */
class CategorieFichierService {

  /**
   * Résoudre une URL exploitable (affichage / lien). Uniquement API Laravel ou blob.
   */
  async resolveFileUrl(raw: string | undefined | null, fileId?: string): Promise<string> {
    if (fileId && laravelApiService.isConfigured()) {
      return laravelApiService.getFichierDownloadUrl(fileId);
    }
    if (!raw) return '';
    const baseUrl = import.meta.env.VITE_LARAVEL_API_URL?.replace(/\/$/, '') || '';
    if (baseUrl && (raw.startsWith(baseUrl) || (raw.includes('/api/fichiers/') && raw.includes('/download')))) {
      return raw;
    }
    if (raw.startsWith('blob:')) return raw;
    return raw;
  }

  /**
   * URL pour afficher le fichier dans une iframe/img (blob uniquement).
   * Ne renvoie jamais l'URL API directe : l'iframe ne envoie pas le token, donc la page resterait vide (401).
   */
  async getFileDisplayUrl(fichier: CategorieFichier): Promise<string> {
    if (laravelApiService.isConfigured() && fichier.type === 'fichier' && fichier.id) {
      try {
        const blob = await laravelApiService.fetchFichierBlob(fichier.id);
        return URL.createObjectURL(blob);
      } catch (e) {
        console.warn('getFileDisplayUrl: échec récupération via API:', e);
        return '';
      }
    }
    if ((fichier.chemin || '').startsWith('blob:')) return fichier.chemin!;
    return '';
  }

  /** URL pour lien de téléchargement (API ou blob). */
  async getFileDownloadUrl(fichier: CategorieFichier): Promise<string> {
    const display = await this.getFileDisplayUrl(fichier);
    if (display) return display;
    const resolved = await this.resolveFileUrl(fichier.chemin || undefined, fichier.id);
    return resolved || '';
  }
  async getCategoriesFichiersByCourrier(courrierId: string): Promise<CategorieFichier[]> {
    if (!laravelApiService.isConfigured()) return [];
    const items = await laravelApiService.getFichiers(courrierId);
    return items.map((it) => ({ ...it, dateCreation: new Date(it.dateCreation), dateModification: new Date(it.dateModification) }));
  }

  async createCategorie(
    courrierId: string,
    nom: string,
    parentId?: string,
    userId?: string
  ): Promise<CategorieFichier> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    const item = await laravelApiService.createDossierLaravel(courrierId, nom, { parentId, creePar: userId });
    return { ...item, dateCreation: new Date(item.dateCreation), dateModification: new Date(item.dateModification) };
  }

  /**
   * Crée un fichier joint au courrier : envoi du fichier (images, Word, Excel, PDF, etc.)
   * au serveur Laravel, qui le copie dans storage/app/courriers/{courrierId}/fichiers/.
   */
  async createFichier(
    courrierId: string,
    nom: string,
    chemin: string | File,
    parentId?: string,
    userId?: string,
    _taille?: number,
    estAccuseReception?: boolean
  ): Promise<CategorieFichier> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    if (chemin instanceof File) {
      const item = await laravelApiService.uploadFichier(courrierId, chemin, {
        parentId,
        estAccuseReception,
        creePar: userId,
      });
      return { ...item, dateCreation: new Date(item.dateCreation), dateModification: new Date(item.dateModification) };
    }
    throw new Error('Création de fichier : fournir un File (upload via API Laravel).');
  }

  async updateCategorieFichier(id: string, updates: Partial<CategorieFichier>): Promise<void> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    const payload: { nom?: string; parentId?: string | null; estAccuseReception?: boolean } = {};
    if (updates.nom !== undefined) payload.nom = updates.nom;
    if (updates.parentId !== undefined) payload.parentId = updates.parentId;
    if (updates.estAccuseReception !== undefined) payload.estAccuseReception = updates.estAccuseReception;
    if (Object.keys(payload).length > 0) {
      await laravelApiService.updateFichier(id, payload);
    }
  }

  async updateFichierWithFile(id: string, file: File, userId?: string): Promise<void> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    const fichier = await this.getCategorieFichierById(id);
    if (!fichier || fichier.type !== 'fichier') {
      throw new Error('Fichier non trouvé');
    }
    await laravelApiService.deleteFichier(id);
    await laravelApiService.uploadFichier(fichier.courrierId, file, {
      parentId: fichier.parentId ?? undefined,
      estAccuseReception: fichier.estAccuseReception,
      creePar: userId,
    });
  }

  async deleteCategorieFichier(id: string): Promise<void> {
    if (!laravelApiService.isConfigured()) {
      throw new Error('API Laravel non configurée (VITE_LARAVEL_API_URL).');
    }
    const courrierId = (await this.getCategorieFichierById(id))?.courrierId ?? '';
    const items = await laravelApiService.getFichiers(courrierId);
    const getDescendantIds = (parentId: string): string[] => {
      const direct = items.filter((df) => df.parentId === parentId).map((df) => df.id);
      return [parentId, ...direct.flatMap((cid) => getDescendantIds(cid))];
    };
    const idsToDelete = [...new Set(getDescendantIds(id))];
    
    for (const deleteId of idsToDelete) {
      try {
        await laravelApiService.deleteFichier(deleteId);
      } catch (error: any) {
        // Gérer les erreurs 401 (authentification expirée)
        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          console.warn('⚠️ Session expirée lors de la suppression du fichier. Veuillez vous reconnecter.');
          throw new Error('Session expirée. Veuillez vous reconnecter.');
        }
        throw error;
      }
    }
  }

  // Construire l'arborescence (fonction pure, inchangée)
  buildTree(
    categoriesFichiers: CategorieFichier[]
  ): (CategorieFichier & { children?: (CategorieFichier & { children?: CategorieFichier[] })[] })[] {
    const map = new Map<
      string,
      CategorieFichier & { children?: (CategorieFichier & { children?: CategorieFichier[] })[] }
    >();
    const roots: (CategorieFichier & {
      children?: (CategorieFichier & { children?: CategorieFichier[] })[];
    })[] = [];

    categoriesFichiers.forEach(item => {
      map.set(item.id, { ...item, children: [] });
    });

    categoriesFichiers.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parentId) {
        const parent = map.get(item.parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async copyCategorieFichier(
    id: string,
    targetParentId: string,
    courrierId: string,
    userId?: string
  ): Promise<CategorieFichier | null> {
    if (!laravelApiService.isConfigured()) return null;
    const all = await this.getCategoriesFichiersByCourrier(courrierId);
    const source = all.find((df: CategorieFichier) => df.id === id);
    if (!source) return null;
    if (source.type === 'categorie' && this.isDescendant(source.id, targetParentId, all)) {
      return null;
    }
    if (source.type === 'categorie') {
      const item = await laravelApiService.createDossierLaravel(courrierId, source.nom, { parentId: targetParentId, creePar: userId });
      const result = { ...item, dateCreation: new Date(item.dateCreation), dateModification: new Date(item.dateModification) };
      const children = all.filter((df: CategorieFichier) => df.parentId === source.id && df.courrierId === courrierId);
      for (const child of children) {
        await this.copyCategorieFichier(child.id, result.id, courrierId, userId);
      }
      return result;
    }
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('laravel_token') || localStorage.getItem('auth_token') || '' : '';
      const res = await fetch(laravelApiService.getFichierDownloadUrl(source.id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const file = new File([blob], source.nom, { type: blob.type || 'application/octet-stream' });
      const item = await laravelApiService.uploadFichier(courrierId, file, {
        parentId: targetParentId,
        creePar: userId,
        estAccuseReception: source.estAccuseReception,
      });
      return { ...item, dateCreation: new Date(item.dateCreation), dateModification: new Date(item.dateModification) };
    } catch {
      return null;
    }
  }

  // Vérifier si une catégorie est un descendant d'un autre (fonction pure)
  private isDescendant(descendantId: string, ancestorId: string, all: CategorieFichier[]): boolean {
    let current = all.find(df => df.id === descendantId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = all.find(df => df.id === current!.parentId);
    }
    return false;
  }

  // Déplacer un fichier ou catégorie dans une autre catégorie
  async moveCategorieFichier(
    id: string,
    targetParentId: string | undefined,
    courrierId: string
  ): Promise<boolean> {
    const all = await this.getCategoriesFichiersByCourrier(courrierId);
    const item = all.find(df => df.id === id);
    if (!item) return false;

    if (item.type === 'categorie' && targetParentId && this.isDescendant(item.id, targetParentId, all)) {
      return false;
    }

    await this.updateCategorieFichier(id, { parentId: targetParentId });
    return true;
  }

  async getCategorieFichierById(id: string): Promise<CategorieFichier | null> {
    if (!laravelApiService.isConfigured()) return null;
    const item = await laravelApiService.getFichier(id);
    if (!item) return null;
    return { ...item, dateCreation: new Date(item.dateCreation), dateModification: new Date(item.dateModification) };
  }

}

export const categorieFichierService = new CategorieFichierService();

