import { EntiteTypeDefinition, TypeEntiteOrganisationnelle } from '../types';
import { laravelApiService } from './laravelApiService';

// Service pour gérer les dénominations des types d'entités (Direction, Service, etc.)
// Quand l'API Laravel est configurée : source = API uniquement (cache mémoire rempli par syncFromApi + CRUD).
// Sinon : fallback localStorage.
class EntiteTypeService {
  private storageKey = 'entite_type_definitions';
  private typesCache: EntiteTypeDefinition[] = [];

  private getDefaults(): EntiteTypeDefinition[] {
    const base: {
      code: TypeEntiteOrganisationnelle;
      singulier: string;
      pluriel: string;
      ordre: number;
      description?: string;
      icone?: string;
    }[] = [
      { code: 'direction_generale', singulier: 'Direction générale', pluriel: 'Directions générales', ordre: 1, description: 'Sommet de la structure', icone: 'building' },
      { code: 'direction', singulier: 'Direction', pluriel: 'Directions', ordre: 2, description: 'Directions sous la Direction générale', icone: 'sitemap' },
      { code: 'division', singulier: 'Division', pluriel: 'Divisions', ordre: 3, description: 'Divisions sous une direction', icone: 'columns' },
      { code: 'service', singulier: 'Service', pluriel: 'Services', ordre: 4, description: 'Services sous une division', icone: 'folder' },
      { code: 'sous-service', singulier: 'Sous-service', pluriel: 'Sous-services', ordre: 5, description: 'Sous-services', icone: 'layer-group' },
      { code: 'bureau', singulier: 'Bureau', pluriel: 'Bureaux', ordre: 6, icone: 'briefcase' },
      { code: 'cellule', singulier: 'Cellule', pluriel: 'Cellules', ordre: 7, icone: 'cube' }
    ];

    return base.map((item, index) => ({
      id: `entite-type-${index + 1}`,
      code: item.code,
      libelleSingulier: item.singulier,
      libellePluriel: item.pluriel,
      description: item.description,
      icone: item.icone,
      ordre: item.ordre,
      actif: true
    }));
  }

  /** Synchronise les types depuis l'API Laravel (MySQL). À appeler au chargement des pages admin. */
  async syncFromApi(): Promise<boolean> {
    if (!laravelApiService.isConfigured()) return false;
    try {
      const list = await laravelApiService.getEntiteTypes();
      this.typesCache = list;
      if (list.length > 0) localStorage.setItem(this.storageKey, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

  /** Liste des types.
   *  Quand l'API Laravel est configurée :
   *   - si le cache est rempli (syncFromApi déjà appelé) → on l'utilise
   *   - sinon → on retombe sur localStorage / valeurs par défaut pour éviter un écran vide au premier chargement.
   */
  getAll(): EntiteTypeDefinition[] {
    if (laravelApiService.isConfigured()) {
      if (this.typesCache.length > 0) {
        return [...this.typesCache];
      }
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        return JSON.parse(data) as EntiteTypeDefinition[];
      }
      const defaults = this.getDefaults();
      localStorage.setItem(this.storageKey, JSON.stringify(defaults));
      return defaults;
    }
    const data = localStorage.getItem(this.storageKey);
    if (!data) {
      const defaults = this.getDefaults();
      localStorage.setItem(this.storageKey, JSON.stringify(defaults));
      return defaults;
    }
    return JSON.parse(data) as EntiteTypeDefinition[];
  }

  /** Types actifs pour les filtres (direction_generale exclue, actif === true uniquement, triés par ordre). */
  getActiveTypesForFilters(): EntiteTypeDefinition[] {
    return this.getAll()
      .filter((t) => t.code !== 'direction_generale' && t.actif === true)
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  }

  /** Libellé au singulier pour un code (ex. direction → "Direction" ou valeur paramétrée). */
  getLibelleSingulier(code: TypeEntiteOrganisationnelle): string {
    const def = this.getAll().find(t => t.code === code);
    return def?.libelleSingulier ?? code;
  }

  /** Libellé au pluriel pour un code (ex. direction → "Directions"). */
  getLibellePluriel(code: TypeEntiteOrganisationnelle): string {
    const def = this.getAll().find(t => t.code === code);
    return def?.libellePluriel ?? code;
  }

  /** Crée un type (persiste en MySQL via API Laravel si configurée). */
  async create(def: Omit<EntiteTypeDefinition, 'id' | 'ordre' | 'actif'> & { ordre?: number; actif?: boolean }): Promise<EntiteTypeDefinition> {
    if (laravelApiService.isConfigured()) {
      const all = this.getAll();
      const maxOrdre = all.reduce((max, t) => Math.max(max, t.ordre || 0), 0);
      const created = await laravelApiService.createEntiteType({
        code: def.code,
        libelleSingulier: def.libelleSingulier,
        libellePluriel: def.libellePluriel,
        description: def.description,
        icone: def.icone,
        ordre: def.ordre ?? maxOrdre + 1,
        actif: def.actif ?? true,
      });
      this.typesCache = [...this.typesCache, created];
      return created;
    }
    const all = this.getAll();
    const maxOrdre = all.reduce((max, t) => Math.max(max, t.ordre || 0), 0);
    const newDef: EntiteTypeDefinition = {
      id: `entite-type-${Date.now()}`,
      code: def.code,
      libelleSingulier: def.libelleSingulier,
      libellePluriel: def.libellePluriel,
      description: def.description,
      icone: def.icone,
      ordre: def.ordre ?? maxOrdre + 1,
      actif: def.actif ?? true
    };
    all.push(newDef);
    localStorage.setItem(this.storageKey, JSON.stringify(all));
    return newDef;
  }

  /** Met à jour un type (persiste en MySQL via API Laravel si configurée). */
  async update(id: string, updates: Partial<EntiteTypeDefinition>): Promise<EntiteTypeDefinition | null> {
    if (laravelApiService.isConfigured()) {
      const updated = await laravelApiService.updateEntiteType(id, {
        code: updates.code,
        libelleSingulier: updates.libelleSingulier,
        libellePluriel: updates.libellePluriel,
        description: updates.description,
        icone: updates.icone,
        ordre: updates.ordre,
        actif: updates.actif,
      });
      const index = this.typesCache.findIndex(t => t.id === id);
      if (index >= 0) this.typesCache[index] = updated;
      else this.typesCache.push(updated);
      return updated;
    }
    const all = this.getAll();
    const index = all.findIndex(t => t.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...updates };
    localStorage.setItem(this.storageKey, JSON.stringify(all));
    return all[index];
  }

  /** Supprime un type (persiste en MySQL via API Laravel si configurée). */
  async delete(id: string): Promise<void> {
    if (laravelApiService.isConfigured()) {
      await laravelApiService.deleteEntiteType(id);
      this.typesCache = this.typesCache.filter(t => t.id !== id);
      return;
    }
    const all = this.getAll().filter(t => t.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(all));
  }
}

export const entiteTypeService = new EntiteTypeService();


