/**
 * Paramètres généraux de l'application.
 * Priorité de persistance :
 * 1) API Laravel (config/clé general) quand VITE_LARAVEL_API_URL est configurée
 * 2) localStorage en fallback / hors ligne
 */

import { laravelApiService } from './laravelApiService';

export type PageOrientation = 'portrait' | 'landscape';
export type TimeFormat = '24h' | '12h';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type AppLanguage = 'fr' | 'en';

export interface GeneralSettings {
  /** Nom de l'entreprise / organisation */
  companyName: string;
  /** Orientation par défaut des pages pour les exports et impressions */
  defaultPageOrientation: PageOrientation;
  /** Fuseau horaire utilisé pour l'affichage des dates/heures */
  timezone: string;
  /** Format d'affichage de l'heure */
  timeFormat: TimeFormat;
  /** Format d'affichage de la date */
  dateFormat: DateFormat;
  /** Langue de l'interface */
  language: AppLanguage;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  companyName: '',
  defaultPageOrientation: 'portrait',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  timeFormat: '24h',
  dateFormat: 'DD/MM/YYYY',
  language: 'fr',
};

const STORAGE_KEY = 'general_settings';
const CONFIG_KEY = 'general';

class GeneralSettingsService {
  private settingsKey = STORAGE_KEY;

  /**
   * Charge les paramètres : API Laravel d'abord, sinon localStorage.
   */
  async getSettings(): Promise<GeneralSettings> {
    const defaults = { ...DEFAULT_GENERAL_SETTINGS };

    if (laravelApiService.isConfigured()) {
      try {
        const remote = await laravelApiService.getConfig<Partial<GeneralSettings>>(CONFIG_KEY);
        if (remote && typeof remote === 'object') {
          const merged = { ...defaults, ...remote };
          this.saveToLocalStorage(merged);
          return merged;
        }
      } catch (e) {
        console.warn('[GeneralSettings] Impossible de charger depuis Laravel, fallback localStorage:', e);
      }
    }

    return this.getLocalSettings();
  }

  /**
   * Version synchrone : retourne immédiatement depuis localStorage.
   * À utiliser dans les contextes ne pouvant pas attendre (exports, formatage…).
   */
  getSettingsSync(): GeneralSettings {
    return this.getLocalSettings();
  }

  /**
   * Sauvegarde les paramètres : API Laravel si configurée, plus localStorage en cache.
   */
  async saveSettings(settings: GeneralSettings): Promise<void> {
    const cleaned: GeneralSettings = {
      companyName: settings.companyName || '',
      defaultPageOrientation: settings.defaultPageOrientation || DEFAULT_GENERAL_SETTINGS.defaultPageOrientation,
      timezone: settings.timezone || DEFAULT_GENERAL_SETTINGS.timezone,
      timeFormat: settings.timeFormat || DEFAULT_GENERAL_SETTINGS.timeFormat,
      dateFormat: settings.dateFormat || DEFAULT_GENERAL_SETTINGS.dateFormat,
      language: settings.language || DEFAULT_GENERAL_SETTINGS.language,
    };

    this.saveToLocalStorage(cleaned);

    if (laravelApiService.isConfigured()) {
      try {
        await laravelApiService.updateConfig(CONFIG_KEY, cleaned);
      } catch (e) {
        console.warn('[GeneralSettings] Sauvegarde Laravel échouée, conservée en localStorage:', e);
      }
    }
  }

  /**
   * Réinitialise aux valeurs par défaut.
   */
  async resetToDefaults(): Promise<GeneralSettings> {
    const defaults = { ...DEFAULT_GENERAL_SETTINGS };
    await this.saveSettings(defaults);
    return defaults;
  }

  /**
   * Formate une date selon les paramètres généraux.
   */
  formatDate(value: Date | string | number | null | undefined, includeTime = false): string {
    if (!value && value !== 0) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';

    const settings = this.getSettingsSync();
    const locale = settings.language === 'fr' ? 'fr-FR' : 'en-US';

    const dateOptions: Intl.DateTimeFormatOptions = {
      timeZone: settings.timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };

    let dateStr = '';
    switch (settings.dateFormat) {
      case 'MM/DD/YYYY':
        dateStr = date.toLocaleDateString('en-US', dateOptions);
        break;
      case 'YYYY-MM-DD':
        dateStr = date.toLocaleDateString('fr-CA', { ...dateOptions, month: '2-digit' });
        break;
      case 'DD/MM/YYYY':
      default:
        dateStr = date.toLocaleDateString('fr-FR', dateOptions);
        break;
    }

    if (!includeTime) return dateStr;

    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: settings.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings.timeFormat === '12h',
    };
    const timeStr = date.toLocaleTimeString(locale, timeOptions);

    return `${dateStr} ${timeStr}`;
  }

  private getLocalSettings(): GeneralSettings {
    try {
      const data = localStorage.getItem(this.settingsKey);
      if (!data) return { ...DEFAULT_GENERAL_SETTINGS };
      const parsed = JSON.parse(data);
      return { ...DEFAULT_GENERAL_SETTINGS, ...parsed };
    } catch (e) {
      console.error('Erreur lors du chargement des paramètres généraux:', e);
      return { ...DEFAULT_GENERAL_SETTINGS };
    }
  }

  private saveToLocalStorage(settings: GeneralSettings): void {
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des paramètres généraux:', error);
    }
  }
}

export const generalSettingsService = new GeneralSettingsService();
