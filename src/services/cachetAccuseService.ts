/**
 * Service de configuration du cachet d'accusé de réception.
 * Stockage via API Laravel (/api/config/cachet_accuse) ou fallback localStorage.
 */

import { laravelApiService } from './laravelApiService';

const STORAGE_KEY = 'cachet_accuse_config';

export interface CachetAccuseConfig {
  organisation: string;
  forme: 'rectangle' | 'rond';
  couleurEncre: string;
  couleurFond: string;
  inclinaison: number;
  positionX: number;
  positionY: number;
  largeur: number;
  hauteur: number;
  bordureDouble: boolean;
  afficherQR: boolean;
}

const defaultConfig: CachetAccuseConfig = {
  organisation: '',
  forme: 'rectangle',
  couleurEncre: '#1a73e8',
  couleurFond: 'transparent',
  inclinaison: -3,
  positionX: 112,
  positionY: 8,
  largeur: 90,
  hauteur: 55,
  bordureDouble: true,
  afficherQR: false,
};

function normalizeConfig(data: Record<string, unknown>): CachetAccuseConfig {
  return {
    organisation: typeof data.organisation === 'string' ? data.organisation : defaultConfig.organisation,
    forme: data.forme === 'rond' ? 'rond' : defaultConfig.forme,
    couleurEncre: typeof data.couleurEncre === 'string' ? data.couleurEncre : defaultConfig.couleurEncre,
    couleurFond: typeof data.couleurFond === 'string' ? data.couleurFond : defaultConfig.couleurFond,
    inclinaison: typeof data.inclinaison === 'number' ? data.inclinaison : defaultConfig.inclinaison,
    positionX: typeof data.positionX === 'number' ? data.positionX : defaultConfig.positionX,
    positionY: typeof data.positionY === 'number' ? data.positionY : defaultConfig.positionY,
    largeur: typeof data.largeur === 'number' ? data.largeur : defaultConfig.largeur,
    hauteur: typeof data.hauteur === 'number' ? data.hauteur : defaultConfig.hauteur,
    bordureDouble: typeof data.bordureDouble === 'boolean' ? data.bordureDouble : defaultConfig.bordureDouble,
    afficherQR: typeof data.afficherQR === 'boolean' ? data.afficherQR : defaultConfig.afficherQR,
  };
}

export const cachetAccuseService = {
  async getConfig(): Promise<CachetAccuseConfig> {
    if (laravelApiService.isConfigured()) {
      try {
        const data = await laravelApiService.getConfigByKey('cachet_accuse');
        const config = normalizeConfig(data);
        // Miroir localStorage
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        }
        return config;
      } catch (e) {
        console.warn('Cachet accusé : erreur API, repli localStorage', e);
      }
    }
    // Repli localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return normalizeConfig(JSON.parse(raw));
      } catch {
        // ignore
      }
    }
    return { ...defaultConfig };
  },

  async saveConfig(config: CachetAccuseConfig): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
    if (laravelApiService.isConfigured()) {
      await laravelApiService.saveConfigByKey('cachet_accuse', config as unknown as Record<string, unknown>);
    }
  },
};
