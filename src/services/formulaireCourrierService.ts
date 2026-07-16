import { TypeCourrier, SensCourrier, Priorite } from '../types';
import { laravelApiService } from './laravelApiService';

export type ExtraFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'datetime'
  | 'email'
  | 'number'
  | 'phone'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'url'
  | 'slider'
  | 'urgency';

export const isDateFieldType = (type?: ExtraFieldType): boolean => type === 'date' || type === 'datetime';

/** Valeurs par défaut pour le type "niveau d'urgence" (paramétrable) */
export const URGENCY_DEFAULT_OPTIONS = ['Très faible', 'Faible', 'Moyen', 'Élevé', 'Urgent'] as const;

/** Pourcentage → Priorité (0-25 BASSE, 25-50 NORMALE, 50-75 HAUTE, 75-100 URGENTE) */
export function percentToPriorite(percent: number): Priorite {
  if (percent <= 25) return Priorite.BASSE;
  if (percent <= 50) return Priorite.NORMALE;
  if (percent <= 75) return Priorite.HAUTE;
  return Priorite.URGENTE;
}

/** Index de l'option urgence (0..n-1) → pourcentage 0..100 */
export function urgencyOptionIndexToPercent(options: string[], index: number): number {
  if (!options.length) return 0;
  if (options.length === 1) return 50;
  return Math.round((index / (options.length - 1)) * 100);
}

/** Libellé sélectionné du champ urgence → Priorité du courrier (selon position dans les options = pourcentage) */
export function urgencyOptionLabelToPriorite(options: string[], selectedLabel: string): Priorite {
  if (!options.length) return Priorite.NORMALE;
  const index = options.findIndex(opt => String(opt).trim() === String(selectedLabel).trim());
  const percent = index >= 0 ? urgencyOptionIndexToPercent(options, index) : 50;
  return percentToPriorite(percent);
}

/** Priorité du courrier → libellé d'option urgence le plus proche (pour préremplissage) */
export function prioriteToUrgencyOptionLabel(options: string[], priorite: Priorite): string {
  if (!options.length) return '';
  const prioriteToPercent = (p: Priorite): number => {
    if (p === Priorite.BASSE) return 12;
    if (p === Priorite.NORMALE) return 37;
    if (p === Priorite.HAUTE) return 62;
    if (p === Priorite.URGENTE) return 87;
    return 50;
  };
  const targetPercent = prioriteToPercent(priorite);
  let bestIndex = 0;
  let bestDiff = Math.abs(urgencyOptionIndexToPercent(options, 0) - targetPercent);
  for (let i = 1; i < options.length; i++) {
    const diff = Math.abs(urgencyOptionIndexToPercent(options, i) - targetPercent);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return options[bestIndex] ?? '';
}

export type ExtraFieldConfig = {
  id: string;
  name: string;
  label: string;
  /** Champ obligatoire */
  required?: boolean;
  /** Placeholder ou aide contextuelle */
  placeholder?: string;
  /** Type de champ (texte, email, etc.) */
  type?: ExtraFieldType;
  /** Liste d'options pour select / radio / checkbox / urgency */
  options?: string[];
  /** Curseur : valeur minimale (défaut 0) */
  min?: number;
  /** Curseur : valeur maximale (défaut 100) */
  max?: number;
  /** Curseur : pas (défaut 1) */
  step?: number;
  /** Nom de l'icône FontAwesome (optionnel) */
  icon?: string;
  /** Afficher ce champ dans le tableau de la liste des courriers (par défaut: true pour les types appropriés) */
  showInTable?: boolean;
};

export type StyleConfig = {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderRadius?: number;
  padding?: number;
  margin?: number;
};

export type ColumnConfig = {
  id: string;
  width: number; // 1-12 (système de grille 12 colonnes, par défaut 6 = 50%)
  fields: ExtraFieldConfig[];
  style?: StyleConfig;
};

export type SectionConfig = {
  id: string;
  type: 'section';
  label: string;
  placeholder?: string; // Description de la section
  columns: ColumnConfig[];
  style?: StyleConfig;
};

export type FormStructure = SectionConfig[];

export type ExtraFieldsByType = Record<TypeCourrier, FormStructure>;

/** Configuration par sens puis par type (ENTRANT/SORTANT × EXTERNE/INTERNE) — utilisé par l’UI. */
export type ExtraFieldsBySensAndType = Record<SensCourrier, Record<TypeCourrier, FormStructure>>;

const STORAGE_KEY = 'courrier_extra_fields_config';

const emptyFormStructure = (): FormStructure => [];
// Champs communs à tous les sens/types.
const baseIncomingExterneFields: ExtraFieldConfig[] = [
  {
    id: 'dateReception',
    name: 'dateReception',
    label: 'Date de Réception',
    type: 'datetime',
    required: true,
    placeholder: 'Sélectionnez la date de réception du courrier'
  },
  {
    id: 'objet',
    name: 'objet',
    label: 'Objet du Courrier',
    type: 'text',
    required: true,
    placeholder: 'Saisissez l\'objet du courrier externe'
  },
  {
    id: 'expediteur',
    name: 'expediteur',
    label: 'Expéditeur',
    type: 'text',
    required: true,
    placeholder: 'Nom de l\'expéditeur externe'
  },
  {
    id: 'destinataire',
    name: 'destinataire',
    label: 'Destinataire',
    type: 'text',
    required: true,
    placeholder: 'Nom du destinataire'
  },
  {
    id: 'referenceExterne',
    name: 'referenceExterne',
    label: 'Référence Externe',
    type: 'text',
    required: false,
    placeholder: 'Référence du courrier externe'
  },
  {
    id: 'urgence',
    name: 'urgence',
    label: 'Niveau d\'Urgence',
    type: 'slider',
    required: false,
    placeholder: 'Définissez le niveau d\'urgence (1-5)'
  }
];

const baseIncomingInterneFields: ExtraFieldConfig[] = [
  {
    id: 'dateReception',
    name: 'dateReception',
    label: 'Date de Réception',
    type: 'datetime',
    required: true,
    placeholder: 'Sélectionnez la date de réception du courrier'
  },
  {
    id: 'objet',
    name: 'objet',
    label: 'Objet du Courrier',
    type: 'text',
    required: true,
    placeholder: 'Saisissez l\'objet du courrier interne'
  },
  {
    id: 'expediteur',
    name: 'expediteur',
    label: 'Expéditeur',
    type: 'text',
    required: true,
    placeholder: 'Nom de l\'expéditeur (service ou entité émettrice)'
  },
  {
    id: 'destinataire',
    name: 'destinataire',
    label: 'Destinataire',
    type: 'text',
    required: true,
    placeholder: 'Nom du destinataire (service ou entité destinataire)'
  },
  {
    id: 'urgence',
    name: 'urgence',
    label: 'Niveau d\'Urgence',
    type: 'slider',
    required: false,
    placeholder: 'Définissez le niveau d\'urgence (1-5)'
  },
  {
    id: 'contenu',
    name: 'contenu',
    label: 'Contenu du Courrier',
    type: 'textarea',
    required: false,
    placeholder: 'Rédigez le contenu détaillé du courrier interne'
  }
];

/** Champs spécifiques aux courriers sortants. */
const outgoingOnlyFields: ExtraFieldConfig[] = [
  {
    id: 'hasAnnexe',
    name: 'hasAnnexe',
    label: 'Annexe(s) jointe(s)',
    type: 'checkbox',
    required: false,
    placeholder: 'Cocher si une ou plusieurs annexes accompagnent ce courrier'
  },
  {
    id: 'dateSignature',
    name: 'dateSignature',
    label: 'Date de signature du document',
    type: 'datetime',
    required: false,
    placeholder: 'Sélectionnez la date et l\'heure de signature du document'
  }
];

const getDefaultByType = (): Record<TypeCourrier, FormStructure> => ({
  [TypeCourrier.EXTERNE]: [
    {
      id: 'default-section',
      type: 'section' as const,
      label: 'Informations du courrier',
      columns: [
        {
          id: 'default-column',
          width: 12,
          fields: baseIncomingExterneFields
        }
      ]
    }
  ],
  [TypeCourrier.INTERNE]: [
    {
      id: 'default-section',
      type: 'section' as const,
      label: 'Informations du courrier',
      columns: [
        {
          id: 'default-column',
          width: 12,
          fields: baseIncomingInterneFields
        }
      ]
    }
  ],
});

/** Config différenciée : les courriers sortants ont des champs supplémentaires. */
const getDefaultBySensAndType = (): ExtraFieldsBySensAndType => ({
  [SensCourrier.ENTRANT]: getDefaultByType(),
  [SensCourrier.SORTANT]: {
    [TypeCourrier.EXTERNE]: [
      {
        id: 'default-section',
        type: 'section' as const,
        label: 'Informations du courrier',
        columns: [
          {
            id: 'default-column',
            width: 12,
            fields: [
              ...baseIncomingExterneFields,
              ...outgoingOnlyFields
            ]
          }
        ]
      }
    ],
    [TypeCourrier.INTERNE]: [
      {
        id: 'default-section',
        type: 'section' as const,
        label: 'Informations du courrier',
        columns: [
          {
            id: 'default-column',
            width: 12,
            fields: [
              ...baseIncomingInterneFields,
              ...outgoingOnlyFields
            ]
          }
        ]
      }
    ],
  }
});

const getDefaultConfig = (): ExtraFieldsBySensAndType => getDefaultBySensAndType();

// Cache en mémoire. Source de vérité : API Laravel (GET/PUT /api/config/formulaire) lorsque VITE_LARAVEL_API_URL est défini — pas de Firebase.
let cachedConfig: ExtraFieldsBySensAndType | null = null;
let loadingPromise: Promise<ExtraFieldsBySensAndType> | null = null;

/** Convertit l’ancienne structure (ExtraFieldsByType) en ExtraFieldsBySensAndType. */
const fromLegacyByType = (data: Partial<ExtraFieldsByType>): ExtraFieldsBySensAndType => {
  const byType: Record<TypeCourrier, FormStructure> = {
    [TypeCourrier.EXTERNE]: (data[TypeCourrier.EXTERNE] as FormStructure) || emptyFormStructure(),
    [TypeCourrier.INTERNE]: (data[TypeCourrier.INTERNE] as FormStructure) || emptyFormStructure(),
  };
  return {
    [SensCourrier.ENTRANT]: { ...byType },
    [SensCourrier.SORTANT]: { ...byType },
  };
};

const loadFromLocalStorage = (): ExtraFieldsBySensAndType => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultConfig();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeApiConfig(parsed);
  } catch {
    return getDefaultConfig();
  }
};

/** Retourne la valeur ou le défaut si vide (tableau vide [] est truthy mais invalide). */
const withDefault = (val: FormStructure | undefined, fallback: FormStructure): FormStructure =>
  (!val || (Array.isArray(val) && val.length === 0)) ? fallback : val;

/** Normalise la réponse API Laravel (Record) en ExtraFieldsBySensAndType. */
const normalizeApiConfig = (data: Record<string, unknown> | null): ExtraFieldsBySensAndType => {
  if (!data || typeof data !== 'object') return getDefaultConfig();
  const parsed = data as unknown as Record<string, any>;
  if (parsed[TypeCourrier.EXTERNE] !== undefined || parsed[TypeCourrier.INTERNE] !== undefined) {
    return fromLegacyByType(parsed as unknown as Partial<ExtraFieldsByType>);
  }
  const defaults = getDefaultConfig();
  return {
    [SensCourrier.ENTRANT]: {
      [TypeCourrier.EXTERNE]: withDefault(
        (parsed[SensCourrier.ENTRANT] as Record<TypeCourrier, FormStructure>)?.[TypeCourrier.EXTERNE],
        defaults[SensCourrier.ENTRANT][TypeCourrier.EXTERNE]
      ),
      [TypeCourrier.INTERNE]: withDefault(
        (parsed[SensCourrier.ENTRANT] as Record<TypeCourrier, FormStructure>)?.[TypeCourrier.INTERNE],
        defaults[SensCourrier.ENTRANT][TypeCourrier.INTERNE]
      ),
    },
    [SensCourrier.SORTANT]: {
      [TypeCourrier.EXTERNE]: withDefault(
        (parsed[SensCourrier.SORTANT] as Record<TypeCourrier, FormStructure>)?.[TypeCourrier.EXTERNE],
        defaults[SensCourrier.SORTANT][TypeCourrier.EXTERNE]
      ),
      [TypeCourrier.INTERNE]: withDefault(
        (parsed[SensCourrier.SORTANT] as Record<TypeCourrier, FormStructure>)?.[TypeCourrier.INTERNE],
        defaults[SensCourrier.SORTANT][TypeCourrier.INTERNE]
      ),
    },
  };
};

/** Chargement : API Laravel si configurée, sinon localStorage. En cas d'erreur API, repli sur localStorage. */
const loadFromStorage = async (): Promise<ExtraFieldsBySensAndType> => {
  if (loadingPromise) return loadingPromise;
  const p = (async () => {
    if (laravelApiService.isConfigured()) {
      try {
        if (typeof window !== 'undefined' && import.meta.env.DEV) {
          console.log('Configuration formulaire : chargement depuis l’API Laravel (GET /api/config/formulaire)');
        }
        const data = await laravelApiService.getConfigFormulaire();
        const config = normalizeApiConfig(data);
        cachedConfig = config;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        }
        if (typeof window !== 'undefined' && import.meta.env.DEV) {
          console.log('Configuration formulaire : chargée depuis l’API Laravel');
        }
        return config;
      } catch (e) {
        console.warn('Configuration formulaire : erreur API, repli localStorage', e);
        const config = loadFromLocalStorage();
        cachedConfig = config;
        return config;
      }
    }
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      console.log('Configuration formulaire : chargement depuis le localStorage (API Laravel non configurée)');
    }
    const config = loadFromLocalStorage();
    cachedConfig = config;
    return config;
  })();
  loadingPromise = p;
  p.finally(() => { loadingPromise = null; });
  return p;
};

export const formulaireCourrierService = {
  /** Config synchrone : cache si déjà chargé, sinon localStorage (ou défaut si API configurée et cache vide). Appeler getConfigAsync() au démarrage pour remplir le cache quand l'API est configurée. */
  getConfig(): ExtraFieldsBySensAndType {
    if (cachedConfig) return cachedConfig;
    if (laravelApiService.isConfigured()) {
      return getDefaultConfig();
    }
    cachedConfig = loadFromLocalStorage();
    return cachedConfig;
  },

  async getConfigAsync(): Promise<ExtraFieldsBySensAndType> {
    const config = await loadFromStorage();
    cachedConfig = config;
    return config;
  },

  /** Charger la config uniquement depuis Laravel (sans repli localStorage). Lance en cas d'erreur. */
  async loadFromLaravelOnly(): Promise<ExtraFieldsBySensAndType> {
    const data = await laravelApiService.getConfigFormulaire();
    const config = normalizeApiConfig(data);
    cachedConfig = config;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
    return config;
  },

  /** Réinitialise la configuration aux valeurs par défaut (avec les champs sortants annexes/signature). */
  async resetToDefaults(): Promise<ExtraFieldsBySensAndType> {
    const defaults = getDefaultConfig();
    await this.saveConfig(defaults);
    cachedConfig = defaults;
    return defaults;
  },

  /** Sauvegarder la configuration : API Laravel PUT /api/config/formulaire si configurée (pas de Firebase), puis cache local. */
  async saveConfig(config: ExtraFieldsBySensAndType): Promise<void> {
    const configString = JSON.stringify(config);
    if (new Blob([configString]).size > 5 * 1024 * 1024) {
      throw new Error('La configuration est trop volumineuse (limite: 5MB)');
    }
    if (laravelApiService.isConfigured()) {
      await laravelApiService.saveConfigFormulaire(config as unknown as Record<string, unknown>);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, configString);
    }
    cachedConfig = config;
  },

  async updateConfigForType(sens: SensCourrier, type: TypeCourrier, sections: FormStructure): Promise<ExtraFieldsBySensAndType> {
    const current = await loadFromStorage();
    const updated: ExtraFieldsBySensAndType = {
      ...current,
      [sens]: {
        ...current[sens],
        [type]: sections,
      },
    };
    await this.saveConfig(updated);
    cachedConfig = updated;
    return updated;
  },

  /**
   * Retourne la liste unique des champs extra (name + label) issus du paramétrage formulaire,
   * pour générer le fichier modèle d'import (colonnes Excel/CSV).
   */
  getTemplateExtraFields(): Array<{ name: string; label: string }> {
    const config = this.getConfig();
    const seen = new Set<string>();
    const out: Array<{ name: string; label: string }> = [];
    const push = (name: string, label: string) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      out.push({ name, label: label || name });
    };
    ([SensCourrier.ENTRANT, SensCourrier.SORTANT] as const).forEach((sens) => {
      ([TypeCourrier.EXTERNE, TypeCourrier.INTERNE] as const).forEach((type) => {
        const structure = config[sens]?.[type] || [];
        structure.forEach((section) => {
          section.columns?.forEach((col) => {
            col.fields?.forEach((field) => {
              if (field.name) push(field.name, field.label || field.name);
            });
          });
        });
      });
    });
    return out;
  },

  /**
   * Indique si le formulaire courrier est configuré (au moins un champ avec nom non vide pour un sens/type).
   * Utilisé pour autoriser ou bloquer l'import et le téléchargement du modèle.
   * @param config - Si fourni, utilise cette config ; sinon utilise getConfig().
   */
  isFormulaireConfigured(config?: ExtraFieldsBySensAndType): boolean {
    const c = config ?? this.getConfig();
    const hasRealField = (f: { name?: string }) =>
      typeof f?.name === 'string' && f.name.trim() !== '';
    for (const sens of [SensCourrier.ENTRANT, SensCourrier.SORTANT] as const) {
      for (const type of [TypeCourrier.EXTERNE, TypeCourrier.INTERNE] as const) {
        const st = c[sens]?.[type];
    const structure = Array.isArray(st) ? st : [];
        for (const section of structure) {
          if (!section || !Array.isArray(section.columns)) continue;
          for (const col of section.columns) {
            if (Array.isArray(col?.fields) && col.fields.some(hasRealField)) return true;
          }
        }
      }
    }
    return false;
  },

  /**
   * Retourne tous les champs à afficher pour un sens+type, dans l'ordre du formulaire.
   * Utilisé pour le résumé, le modal et le détail du courrier (affichage uniquement des champs configurés).
   * Les champs essentiels (expediteur, destinataire) sont toujours affichés même s'ils ne sont pas dans la config.
   */
  getDisplayFields(sens: SensCourrier, type: TypeCourrier): Array<{ id: string; name: string; label: string; type?: ExtraFieldType; icon?: string }> {
    const config = this.getConfig()[sens]?.[type] || [];
    const list: Array<{ id: string; name: string; label: string; type?: ExtraFieldType; icon?: string }> = [];
    config.forEach((section) => {
      if (!section.columns || !Array.isArray(section.columns)) return;
      section.columns.forEach((column) => {
        if (!column.fields || !Array.isArray(column.fields)) return;
        column.fields.forEach((field) => {
          if (field.id && field.name) {
            list.push({
              id: field.id,
              name: field.name,
              label: field.label || field.name,
              type: field.type,
              icon: field.icon,
            });
          }
        });
      });
    });
    
    // Courriers sortants externes : ne pas afficher Expéditeur, et s'assurer que Destinataire est toujours affiché
    if (sens === SensCourrier.SORTANT && type === TypeCourrier.EXTERNE) {
      const filtered = list.filter((f) => f.name !== 'expediteur');
      const hasDestinataire = filtered.some((f) => f.name === 'destinataire');
      if (!hasDestinataire) {
        filtered.unshift({
          id: 'destinataire',
          name: 'destinataire',
          label: 'Destinataire',
          type: undefined,
          icon: 'building',
        });
      }
      return filtered;
    }
    
    // Pour tous les autres types de courriers, s'assurer que expediteur et destinataire sont affichés
    const hasExpediteur = list.some((f) => f.name === 'expediteur');
    const hasDestinataire = list.some((f) => f.name === 'destinataire');
    
    if (!hasExpediteur) {
      list.unshift({
        id: 'expediteur',
        name: 'expediteur',
        label: 'Expéditeur',
        type: undefined,
        icon: 'envelope',
      });
    }
    if (!hasDestinataire) {
      list.unshift({
        id: 'destinataire',
        name: 'destinataire',
        label: 'Destinataire',
        type: undefined,
        icon: 'envelope-open',
      });
    }
    
    return list;
  },
};

