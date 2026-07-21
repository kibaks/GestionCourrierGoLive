/**
 * Paramètres généraux de l'application.
 * Stockés dans localStorage.
 */

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

class GeneralSettingsService {
  private settingsKey = STORAGE_KEY;

  getSettings(): GeneralSettings {
    const saved = localStorage.getItem(this.settingsKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_GENERAL_SETTINGS, ...parsed };
      } catch (e) {
        console.error('Erreur lors du chargement des paramètres généraux:', e);
      }
    }
    return { ...DEFAULT_GENERAL_SETTINGS };
  }

  saveSettings(settings: GeneralSettings): void {
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    } catch (e) {
      console.error('Erreur lors de la sauvegarde des paramètres généraux:', e);
    }
  }

  resetToDefaults(): GeneralSettings {
    const defaults = { ...DEFAULT_GENERAL_SETTINGS };
    this.saveSettings(defaults);
    return defaults;
  }

  /**
   * Formate une date selon les paramètres généraux.
   */
  formatDate(value: Date | string | number | null | undefined, includeTime = false): string {
    if (!value && value !== 0) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';

    const settings = this.getSettings();
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
}

export const generalSettingsService = new GeneralSettingsService();
