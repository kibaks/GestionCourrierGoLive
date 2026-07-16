/**
 * Service de scan avancé pour macOS - Version Browser (utilise l'API)
 * Ce service appelle le backend server.js pour exécuter les commandes ICA/SANE
 */

// Types de scanners supportés
interface ScannerInfo {
  id: string;
  name: string;
  type: 'ica' | 'sane' | 'ipp';
  manufacturer?: string;
  model?: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: {
    color: boolean;
    duplex: boolean;
    resolutions: number[];
    formats: string[];
  };
}

interface ScanOptions {
  resolution?: number;
  format?: 'jpeg' | 'png' | 'pdf' | 'tiff';
  colorMode?: 'color' | 'grayscale' | 'bw';
  duplex?: boolean;
  source?: 'flatbed' | 'adf';
}

const API_BASE_URL = 'http://localhost:3001';

export class MacScannerService {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = API_BASE_URL;
  }

  /**
   * Liste tous les scanners disponibles via l'API backend
   */
  async listScanners(): Promise<ScannerInfo[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/scanners/detect`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Transformer les données du backend au format ScannerInfo
      return data.map((s: any) => ({
        id: s.id || s.saneDeviceName || `scanner-${Date.now()}`,
        name: s.name || s.model || 'Scanner inconnu',
        type: this.detectType(s),
        manufacturer: s.manufacturer || 'Unknown',
        model: s.model || 'Unknown',
        status: s.status || 'online',
        capabilities: {
          color: s.capabilities?.color ?? true,
          duplex: s.capabilities?.duplex ?? false,
          resolutions: s.capabilities?.resolution || [150, 300, 600],
          formats: s.capabilities?.formats || ['jpeg', 'png', 'tiff', 'pdf']
        }
      }));
    } catch (error) {
      console.error('Erreur lors de la détection des scanners:', error);
      return [];
    }
  }

  private detectType(scanner: any): 'ica' | 'sane' | 'ipp' {
    if (scanner.type?.includes('sane') || scanner.saneDeviceName) return 'sane';
    if (scanner.type?.includes('ipp') || scanner.type?.includes('airscan')) return 'ipp';
    if (scanner.type?.includes('ica')) return 'ica';
    return 'sane'; // Par défaut
  }

  /**
   * Compile l'outil ICA (appel API au backend)
   */
  async compileICATool(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/scanners/compile-ica`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('Compilation ICA non disponible via API');
        return false;
      }

      const result = await response.json();
      return result.success || false;
    } catch (error) {
      console.warn('API compile-ica non disponible:', error);
      return false;
    }
  }

  /**
   * Effectue un scan via l'API backend
   */
  async scan(
    scannerId: string,
    outputPath: string,
    options: ScanOptions = {}
  ): Promise<string> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/scanners/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scannerId,
          outputPath,
          options: {
            resolution: options.resolution || 300,
            format: options.format || 'jpeg',
            colorMode: options.colorMode || 'color',
            duplex: options.duplex || false,
            source: options.source || 'flatbed'
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.filePath) {
        return result.filePath;
      } else {
        throw new Error(result.error || 'Échec du scan');
      }
    } catch (error) {
      console.error('Erreur lors du scan:', error);
      throw error;
    }
  }

  /**
   * Vérifie si un scanner est disponible
   */
  async checkScannerStatus(scannerId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/scanners/status/${scannerId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.status === 'online' || result.available === true;
    } catch (error) {
      console.warn('Impossible de vérifier le statut du scanner:', error);
      return false;
    }
  }
}

// Export singleton
export const macScannerService = new MacScannerService();
export type { ScannerInfo, ScanOptions };
