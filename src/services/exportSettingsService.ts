import { generalSettingsService } from './generalSettingsService';

export interface ExportColumn {
  key: string;
  label: string;
  enabled: boolean;
  width?: number; // Largeur relative (0-1)
}

export interface ExportSettings {
  format: 'A4' | 'A3' | 'A2' | 'A1' | 'auto';
  orientation: 'portrait' | 'landscape';
  scale: number;
  quality: 'low' | 'medium' | 'high';
  backgroundColor: string;
  includeHeaders: boolean;
  includeFilters: boolean;
  includeMinimap?: boolean; // Spécifique à l'organigramme
  includeProperties?: boolean; // Spécifique à l'organigramme
  colorMode: 'color' | 'grayscale' | 'blackwhite';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  // Colonnes à afficher
  columns?: ExportColumn[];
  // En-tête
  headerEnabled?: boolean;
  headerTitle?: string;
  headerTitleCase?: 'normal' | 'uppercase' | 'lowercase';
  headerSubtitle?: string;
  headerAlign?: 'left' | 'center' | 'right';
  headerLogoUrl?: string; // URL ou dataURL
  headerLogoWidthMm?: number; // largeur en mm
  // Filigrane
  watermarkEnabled?: boolean;
  watermarkText?: string;
  watermarkImageUrl?: string; // URL ou dataURL
  watermarkOpacity?: number; // 0..1
  watermarkAngle?: number; // degrés
  watermarkSize?: number; // pour le texte: pourcentage de la largeur (0..1)
  // Formatage des dates
  dateFormat?: 'DD/MM/YYYY' | 'DD/MM/YY' | 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'custom';
  customDateFormat?: string; // Format personnalisé (ex: 'dd/MM/yyyy HH:mm')
}

class ExportSettingsService {
  private settingsKey = 'export_settings';

  // Récupérer les paramètres d'export par défaut
  getDefaultSettings(): ExportSettings {
    const saved = localStorage.getItem(this.settingsKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erreur lors du chargement des paramètres d\'export:', e);
      }
    }
    
    // Paramètres par défaut (peuvent être surchargés par les paramètres généraux)
    const general = generalSettingsService.getSettings();
    return {
      format: 'A4',
      orientation: general.defaultPageOrientation || 'landscape',
      scale: 2,
      quality: 'high',
      backgroundColor: '#ffffff',
      includeHeaders: true,
      includeFilters: false,
      includeMinimap: false,
      includeProperties: false,
      colorMode: 'color',
      margins: {
        top: 20,
        right: 20,
        bottom: 20,
        left: 20
      },
      columns: [
        { key: 'numero', label: 'Numéro', enabled: true, width: 0.12 },
        { key: 'statut', label: 'Statut', enabled: true, width: 0.12 },
        { key: 'priorite', label: 'Priorité', enabled: true, width: 0.12 },
        { key: 'type', label: 'Type', enabled: true, width: 0.12 },
        { key: 'objet', label: 'Objet', enabled: true, width: 0.20 },
        { key: 'expediteur', label: 'Expéditeur', enabled: true, width: 0.15 },
        { key: 'destinataire', label: 'Destinataire', enabled: true, width: 0.15 },
        { key: 'dateEnregistrement', label: 'Date', enabled: true, width: 0.12 }
      ],
      headerEnabled: false,
      headerTitle: '',
      headerTitleCase: 'normal',
      headerSubtitle: '',
      headerAlign: 'left',
      headerLogoUrl: '',
      headerLogoWidthMm: 24,
      watermarkEnabled: false,
      watermarkText: '',
      watermarkImageUrl: '',
      watermarkOpacity: 0.08,
      watermarkAngle: -30,
      watermarkSize: 0.6,
      dateFormat: 'DD/MM/YYYY',
      customDateFormat: 'dd/MM/yyyy'
    };
  }

  // Sauvegarder les paramètres d'export
  saveSettings(settings: ExportSettings): void {
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    } catch (e) {
      console.error('Erreur lors de la sauvegarde des paramètres d\'export:', e);
    }
  }

  // Formater une date selon les paramètres généraux (fuseau horaire, format de date/heure)
  formatDate(date: Date | string, includeTime: boolean = false): string {
    return generalSettingsService.formatDate(date, includeTime);
  }

  /**
   * Retourne le titre d'en-tête à utiliser pour les exports : le titre explicitement
   * défini dans les paramètres d'export, sinon le nom de l'entreprise configuré dans
   * les paramètres généraux, sinon un libellé par défaut.
   */
  getHeaderTitle(explicitTitle?: string, fallback = 'Fiche d\'enregistrement'): string {
    const general = generalSettingsService.getSettings();
    return (explicitTitle || '').trim() || general.companyName.trim() || fallback;
  }

  // Réinitialiser aux paramètres par défaut
  resetToDefaults(): ExportSettings {
    const defaults: ExportSettings = {
      format: 'A4',
      orientation: 'landscape',
      scale: 2,
      quality: 'high',
      backgroundColor: '#ffffff',
      includeHeaders: true,
      includeFilters: false,
      includeMinimap: false,
      includeProperties: false,
      colorMode: 'color',
      margins: {
        top: 20,
        right: 20,
        bottom: 20,
        left: 20
      },
      columns: [
        { key: 'numero', label: 'Numéro', enabled: true, width: 0.12 },
        { key: 'statut', label: 'Statut', enabled: true, width: 0.12 },
        { key: 'priorite', label: 'Priorité', enabled: true, width: 0.12 },
        { key: 'type', label: 'Type', enabled: true, width: 0.12 },
        { key: 'objet', label: 'Objet', enabled: true, width: 0.20 },
        { key: 'expediteur', label: 'Expéditeur', enabled: true, width: 0.15 },
        { key: 'destinataire', label: 'Destinataire', enabled: true, width: 0.15 },
        { key: 'dateEnregistrement', label: 'Date', enabled: true, width: 0.12 }
      ],
      headerEnabled: false,
      headerTitle: '',
      headerTitleCase: 'normal',
      headerSubtitle: '',
      headerAlign: 'left',
      headerLogoUrl: '',
      headerLogoWidthMm: 24,
      watermarkEnabled: false,
      watermarkText: '',
      watermarkImageUrl: '',
      watermarkOpacity: 0.08,
      watermarkAngle: -30,
      watermarkSize: 0.6,
      dateFormat: 'DD/MM/YYYY',
      customDateFormat: 'dd/MM/yyyy'
    };
    this.saveSettings(defaults);
    return defaults;
  }
}

export const exportSettingsService = new ExportSettingsService();

