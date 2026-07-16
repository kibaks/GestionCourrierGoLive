/**
 * Service de scan via IPP/AirScan (AirPrint Scan) - Version Browser
 * Compatible avec les scanners réseau modernes incluant Canon imageRUNNER
 * Utilise l'API backend pour les opérations système
 */

const API_BASE_URL = 'http://localhost:3001';

// Types de scanners supportés
interface IPPScanner {
  id: string;
  name: string;
  ipAddress: string;
  manufacturer: string;
  model: string;
  type: 'ipp';
  status: 'online' | 'offline';
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
  pageSize?: 'A4' | 'Letter' | 'Legal';
}

class AirScanService {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = API_BASE_URL;
  }

  /**
   * Détecte les scanners via l'API backend
   */
  async detectNetworkScanners(): Promise<IPPScanner[]> {
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
      
      // Filtrer uniquement les scanners IPP/AirScan
      return data
        .filter((s: any) => s.type === 'ipp' || s.type?.includes('airscan'))
        .map((s: any) => ({
          id: s.id || `ipp-${s.ipAddress}`,
          name: s.name || s.model || 'Scanner réseau',
          ipAddress: s.ipAddress || 'unknown',
          manufacturer: s.manufacturer || 'Unknown',
          model: s.model || 'Unknown',
          type: 'ipp' as const,
          status: s.status || 'online',
          capabilities: {
            color: s.capabilities?.color ?? true,
            duplex: s.capabilities?.duplex ?? false,
            resolutions: s.capabilities?.resolutions || [150, 300, 600],
            formats: s.capabilities?.formats || ['jpeg', 'png', 'pdf', 'tiff']
          }
        }));
    } catch (error) {
      console.error('Erreur détection AirScan:', error);
      return [];
    }
  }

  /**
   * Scan via AirScan/IPP
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
            source: options.source || 'flatbed',
            pageSize: options.pageSize || 'A4'
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
        throw new Error(result.error || 'Échec du scan AirScan');
      }
    } catch (error) {
      console.error('Erreur scan AirScan:', error);
      throw error;
    }
  }
}

export const airScanService = new AirScanService();
export type { IPPScanner, ScanOptions };
