import { userSettingsService } from './userSettingsService';

export interface Archive3DConfig {
  // Couleurs
  armoireColor: string;
  etagereColor: string;
  boitePleineColor: string;
  boiteVideColor: string;
  dossierColors: string[];
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  planGridColor: string;
  
  // Tailles
  boiteSize: { width: number; height: number; depth: number };
  etagereThickness: number;
  armoireDoorThickness: number;
  roomWidth: number;    // largeur du local (m)
  roomDepth: number;    // longueur du local (m)
  roomHeight: number;   // hauteur du local (m)
  wallThickness: number; // épaisseur des murs (m)
  armoiresPerRow: number;
  armoireSpacing: number;
  showFrontWall: boolean;
  frontWallOpacity: number;
  
  // Visibilité
  showDossiers: boolean;
  showEtiquettes: boolean;
  showPortes: boolean;
  porteOuverte: boolean;
  roomDoorEnabled: boolean;
  roomDoorOpen: boolean;
  
  // Éclairage
  ambientLightIntensity: number;
  directionalLightIntensity: number;
  
  // Autres
  boitesPerRow: number;
  dossiersPerBoite: number;
  planGridEnabled: boolean;
  planGridSpacing: number;
  roomDoorWidth: number;
  roomDoorHeight: number;
  roomDoorOffset: number;      // décalage gauche/droite sur le mur (X)
  roomDoorOffsetY: number;     // décalage vertical de la porte (Y)
  roomDoorOffsetZ: number;     // décalage en profondeur depuis le mur (Z)
  roomDoorOpenAngle: number; // en degrés
  roomDoorColor: string;
  // Positionnement
  armoireBackOffset: number;   // distance depuis le mur arrière (m)
  armoireBaseXOffset: number;  // décalage global sur X pour les armoires (m)
  armoireOffsetZ: number;      // décalage global avant/arrière sur Z (m)
  armoireOffsetY: number;      // décalage global en hauteur (m)
}

const DEFAULT_CONFIG: Archive3DConfig = {
  armoireColor: '#1e40af',
  etagereColor: '#92400e',
  boitePleineColor: '#d97706',
  boiteVideColor: '#fbbf24',
  dossierColors: ['#3b82f6', '#10b981', '#f59e0b'],
  wallColor: '#9ca3af',
  floorColor: '#e5e7eb',
  ceilingColor: '#f3f4f6',
  planGridColor: '#d1d5db',
  boiteSize: { width: 0.18, height: 0.12, depth: 0.22 },
  etagereThickness: 0.025,
  armoireDoorThickness: 0.025,
  roomWidth: 8,
  roomDepth: 5,
  roomHeight: 3,
  wallThickness: 0.2,
  armoiresPerRow: 3,
  armoireSpacing: 1.5,
  showFrontWall: true,
  frontWallOpacity: 0.45,
  showDossiers: true,
  showEtiquettes: true,
  showPortes: true,
  porteOuverte: false,
  roomDoorEnabled: true,
  roomDoorOpen: true,
  ambientLightIntensity: 0.5,
  directionalLightIntensity: 1,
  boitesPerRow: 5,
  dossiersPerBoite: 6,
  planGridEnabled: true,
  planGridSpacing: 1,
  roomDoorWidth: 1,
  roomDoorHeight: 2.1,
  roomDoorOffset: 0,
  roomDoorOffsetY: 0,
  roomDoorOffsetZ: 0,
  roomDoorOpenAngle: 60,
  roomDoorColor: '#9ca3af',
  armoireBackOffset: 0.8,
  armoireBaseXOffset: 0,
  armoireOffsetZ: 0,
  armoireOffsetY: 0,
};

class Archive3DConfigService {
  private readonly STORAGE_KEY = 'archive3DConfig';

  /**
   * Récupère la configuration (synchrone, depuis le cache)
   */
  getConfig(): Archive3DConfig {
    const cached = userSettingsService.getSettingsSync(this.STORAGE_KEY, DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG, ...cached };
  }

  /**
   * Récupère la configuration de manière asynchrone (depuis Firestore)
   */
  async getConfigAsync(): Promise<Archive3DConfig> {
    const config = await userSettingsService.getSettings(this.STORAGE_KEY, DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Sauvegarde la configuration dans Firestore et localStorage
   */
  async saveConfig(config: Partial<Archive3DConfig>): Promise<void> {
    const current = await this.getConfigAsync();
    const updated = { ...current, ...config };
    await userSettingsService.saveSettings(this.STORAGE_KEY, updated);
  }

  /**
   * Sauvegarde synchrone (pour compatibilité avec l'ancien code)
   * Note: utilise localStorage uniquement, Firestore sera mis à jour en arrière-plan
   */
  saveConfigSync(config: Partial<Archive3DConfig>): void {
    const current = this.getConfig();
    const updated = { ...current, ...config };
    // Sauvegarder dans localStorage immédiatement
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving 3D config to localStorage:', error);
    }
    // Sauvegarder dans Firestore en arrière-plan
    userSettingsService.saveSettings(this.STORAGE_KEY, updated).catch(() => undefined);
  }

  /**
   * Réinitialise la configuration
   */
  async resetConfig(): Promise<void> {
    await userSettingsService.deleteSettings(this.STORAGE_KEY);
  }
}

export const archive3DConfigService = new Archive3DConfigService();
