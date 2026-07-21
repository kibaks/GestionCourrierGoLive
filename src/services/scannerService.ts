// Service pour la détection et la gestion des scanners réseau
import { macScannerService } from './macScannerService';

/** Format de sortie du scan */
export type ScanFormat = 'PDF' | 'JPEG' | 'PNG' | 'TIFF';

/** Mode de scan : une page ou plusieurs pages (fusion en un fichier) */
export type ScanType = 'single' | 'multiple';

/** Source de scan : vitre (plateau) ou bac (chargeur / ADF) */
export type ScanSource = 'vitre' | 'bac';

/** Orientation de sortie du scan (appliquée côté serveur si supportée) */
export type ScanOrientation = 'auto' | 'portrait' | 'landscape';

/** Taille du document pour le scan (WIA / pilotes) */
export type ScanPageSize = 'A4' | 'A3' | 'Letter' | 'Legal' | 'Auto';

/** Taille de l'image scannée dans le document (mise à l'échelle sur la page) */
export type ScanImageScaleMode = 'fill-width' | 'fill-height' | 'fill-page' | 'fit';

/** Paramètres de scan sauvegardés (paramétrage utilisateur) */
export interface ScanSettings {
  format: ScanFormat;
  scanType: ScanType;
  /** Source : vitre (plateau) ou bac (chargeur automatique) */
  scanSource: ScanSource;
  /** Taille du document scanné (pour chargeur ADF notamment) */
  pageSize?: ScanPageSize;
  /** Orientation : auto (inchangé), portrait ou paysage */
  orientation: ScanOrientation;
  /** Taille de l'image dans le document : remplir largeur, hauteur, toute la page, ou contenir */
  imageScaleMode?: ScanImageScaleMode;
  compress: boolean;
  /** Limite de taille par fichier après compression (Ko). Ignorée si compress = false. */
  compressionLimitKb: number;
  resolution?: number;
  color?: boolean;
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  format: 'PDF',
  scanType: 'single',
  scanSource: 'vitre',
  pageSize: 'A4',
  orientation: 'auto',
  imageScaleMode: 'fill-page',
  compress: false,
  compressionLimitKb: 500,
  resolution: 300,
  color: true,
};

/** Approche de détection des scanners : auto (toutes), sane, network, system (pilote système WIA/SANE) */
export type ScannerDetectionApproach = 'auto' | 'sane' | 'network' | 'system';

export interface Scanner {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  type: 'network' | 'usb' | 'local' | 'twain' | 'vendor-driver' | 'sane';
  ipAddress?: string;
  status: 'online' | 'offline' | 'busy';
  // Champs additionnels pour compatibilité TWAIN/WIA et pilotes constructeur
  twainDeviceId?: string;
  instanceId?: string;
  isCanon?: boolean;
  capabilities: {
    color: boolean;
    duplex: boolean;
    resolution: number[];
    formats: string[];
  };
}

/**
 * Récupère dynamiquement l'URL de base du backend de scan.
 * Ordre de priorité :
 * 1) Valeur configurée dans les paramètres (Firestore) et stockée dans localStorage
 *    sous la clé "scanner_backend_url" (gérée par userSettingsService côté UI)
 * 2) Variable d'environnement VITE_SCANNER_API_BASE_URL
 * 3) Variable d'environnement VITE_API_URL
 * 4) Fallback: http://localhost:3001
 */
const getScannerApiBaseUrl = (): string => {
  try {
    const stored = localStorage.getItem('scanner_backend_url');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'string' && parsed.trim().length > 0) {
        return parsed.trim();
      }
    }
  } catch {
    // Ignorer les erreurs de parsing / accès localStorage
  }

  return (
    import.meta.env.VITE_SCANNER_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:3001'
  );
};

/** Vérifie si le serveur de scan (backend) répond. */
export async function checkScannerBackendHealth(): Promise<boolean> {
  try {
    const base = getScannerApiBaseUrl();
    const res = await fetch(`${base}/api/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Config du serveur de scan : plateforme (macOS/Windows/Linux) et méthode de détection recommandée. */
export interface ScannerServerConfig {
  platform: string;
  platformLabel: string;
  recommendedApproach: ScannerDetectionApproach;
  approaches: { value: string; label: string; forPlatform: string | null }[];
}

/** Récupère la config du serveur de scan (plateforme + méthode recommandée). */
export async function getScannerServerConfig(): Promise<ScannerServerConfig | null> {
  try {
    const base = getScannerApiBaseUrl();
    const res = await fetch(`${base}/api/scanners/config`, { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Message d’erreur WIA / pilotes avec conseils de dépannage. */
/** Convertit une erreur technique en message clair pour l'utilisateur. */
function toUserScanError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Scan annulé';
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (!msg || msg === '[object Object]') {
    return 'Une erreur inattendue s\'est produite lors du scan. Vérifiez que le serveur de scan est démarré (port 3001) et que le scanner est connecté.';
  }
  // Erreurs réseau / indisponibilité serveur
  if (/failed to fetch|network error|load failed|networkrequestfailed/i.test(msg)) {
    return 'Impossible de joindre le serveur de scan. Démarrez le serveur (dossier server : node server.js, port 3001) et vérifiez l\'URL dans Paramètres > Gestion des scanners.';
  }
  if (/timeout|aborted/i.test(msg)) {
    return 'Le scan a pris trop de temps. Réessayez ; si vous utilisez le bac (chargeur), vérifiez que les feuilles sont bien en place et le chargeur fermé.';
  }
  // Message backend déjà explicite (dépannage SANE sur Mac/Linux ou WIA sur Windows) — garder tel quel
  if (/Le scan a échoué\. À vérifier/i.test(msg)) {
    return msg;
  }
  // Détails techniques — message générique (le backend envoie un message adapté à la plateforme)
  if (/command failed|powershell|scan-detect-|AppData[\\/]Local[\\/]Temp|EPERM|ETIMEDOUT|scanimage|sane/i.test(msg)) {
    return 'Le scan a échoué. Vérifiez que le scanner est branché et allumé, que le serveur de scan est démarré (port 3001). Sous Mac/Linux : SANE (scanimage -L). Sous Windows : scanner visible dans Paramètres > Périphériques.';
  }
  const clean = msg.replace(/^Erreur lors du scan\s*:\s*/i, '').trim();
  // Messages backend déjà explicites (bac, vitre, etc.) — les garder tels quels
  if (/bac ADF|chargeur|vitre|impossible de lancer/i.test(clean)) {
    return clean;
  }
  // Erreur HTTP générique
  if (/erreur http:\s*\d+/i.test(clean)) {
    return clean + ' Vérifiez que le serveur de scan est démarré et que le scanner est configuré.';
  }
  // Autres erreurs techniques — renvoyer le message en l’état s’il est court, sinon résumé
  if (clean.length <= 120) return clean;
  return clean.slice(0, 120) + '…';
}

class ScannerService {
  private storageKey = 'scanners';
  private detectedScanners: Scanner[] = [];

  private mergeScanners(existing: Scanner[], incoming: Scanner[]): Scanner[] {
    const byKey = new Map<string, Scanner>();

    const getKey = (s: Scanner): string => {
      // Priorité aux IP réseau si présentes
      if (s.ipAddress && s.ipAddress.trim().length > 0) return `ip:${s.ipAddress.trim()}`;
      // Sinon clé composite stable sur nom+modèle+fabricant
      const name = (s.name || '').trim().toLowerCase();
      const model = (s.model || '').trim().toLowerCase();
      const manufacturer = (s.manufacturer || '').trim().toLowerCase();
      return `nmm:${name}|${model}|${manufacturer}`;
    };

    const ensureScannerName = (scanner: Scanner): Scanner => {
      const name = (scanner.name && String(scanner.name).trim()) || (scanner.model && String(scanner.model).trim()) || (scanner.manufacturer && String(scanner.manufacturer).trim()) || (scanner.ipAddress ? `Scanner réseau ${scanner.ipAddress}` : null) || 'Scanner';
      const manufacturer = (scanner.manufacturer && String(scanner.manufacturer).trim()) || 'Inconnu';
      const model = (scanner.model && String(scanner.model).trim()) || name;
      return { ...scanner, name, manufacturer, model };
    };

    // D'abord seeded avec l'existant (ex: ajouts manuels)
    for (const s of existing) {
      byKey.set(getKey(s), ensureScannerName(s));
    }
    // Puis injecter les nouveaux (détection backend), en complétant les champs manquants
    for (const s of incoming) {
      const key = getKey(s);
      const normalized = ensureScannerName(s);
      if (byKey.has(key)) {
        const prev = byKey.get(key)!;
        byKey.set(key, {
          ...prev,
          ...normalized,
          capabilities: {
            ...prev.capabilities,
            ...normalized.capabilities
          },
          status: normalized.status || prev.status
        });
      } else {
        byKey.set(key, normalized);
      }
    }

    return Array.from(byKey.values());
  }

  /**
   * Détecter tous les scanners disponibles (réseau et locaux) via l'API backend.
   * @param preferSystemDriver — si true, sous Windows seule la détection WIA est utilisée (sans pilotes fabricant). Si non fourni, lit la préférence sauvegardée (scanner_prefer_system_driver).
   * @param approach — approche de détection : auto | sane | network | system. Si non fourni, lit la préférence sauvegardée (scanner_detection_approach).
   */
  async detectScanners(preferSystemDriver?: boolean, approach?: ScannerDetectionApproach): Promise<Scanner[]> {
    try {
      let prefer = preferSystemDriver;
      if (prefer === undefined && typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem('scanner_prefer_system_driver');
          if (raw !== null) {
            const v = JSON.parse(raw);
            if (typeof v === 'boolean') prefer = v;
          }
        } catch {
          prefer = false;
        }
      }
      let approachVal = approach;
      if (approachVal === undefined && typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem('scanner_detection_approach');
          if (raw !== null) {
            const v = JSON.parse(raw);
            if (typeof v === 'string' && ['auto', 'sane', 'network', 'system'].includes(v)) approachVal = v as ScannerDetectionApproach;
          }
        } catch {
          approachVal = 'auto';
        }
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Timeout porté à 15s (détection WIA/TWAIN)
      const url = new URL(`${getScannerApiBaseUrl()}/api/scanners/detect`);
      if (prefer === true) {
        url.searchParams.set('prefer_system_driver', '1');
      }
      if (approachVal && approachVal !== 'auto') {
        url.searchParams.set('approach', approachVal);
      }
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      const detectedScanners: Scanner[] = await response.json();

      // Sur macOS, compléter avec la détection ICA/SANE locale
      if (navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac')) {
        try {
          const macScanners = await macScannerService.listScanners();
          const adaptedScanners: Scanner[] = macScanners.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type === 'ica' ? 'local' : (s.type === 'sane' ? 'vendor-driver' : 'network'),
            manufacturer: s.manufacturer || 'Unknown',
            model: s.model || 'Unknown',
            ipAddress: undefined,
            status: s.status,
            capabilities: {
              color: s.capabilities.color,
              duplex: s.capabilities.duplex,
              resolution: s.capabilities.resolutions,
              formats: s.capabilities.formats as any
            }
          }));
          detectedScanners.push(...adaptedScanners);
        } catch (macError) {
          console.warn('Détection Mac échouée:', macError);
        }
      }

      // Fusionner avec les scanners déjà sauvegardés (évite la disparition après navigation)
      const saved = this.getSavedScanners();
      const merged = this.mergeScanners(saved, detectedScanners);

      this.detectedScanners = merged;
      localStorage.setItem(this.storageKey, JSON.stringify(merged));
      return merged;
    } catch (error: any) {
      // Erreur silencieuse si le serveur n'est pas disponible (connexion refusée ou timeout)
      // C'est normal si le backend de scanners n'est pas démarré
      if (error.name === 'AbortError' || 
          error.message?.includes('Failed to fetch') || 
          error.message?.includes('ERR_CONNECTION_REFUSED') ||
          error.message?.includes('NetworkError')) {
        // Retourner les scanners sauvegardés sans logger d'erreur
        const saved = this.getSavedScanners();
        return saved;
      }
      
      // Pour les autres erreurs, logger et retourner les scanners sauvegardés
      console.error('Erreur lors de la détection des scanners:', error);
      const saved = this.getSavedScanners();
      if (saved.length > 0) {
        return saved;
      }
      throw error;
    }
  }


  // Obtenir la liste des scanners sauvegardés
  getSavedScanners(): Scanner[] {
    const data = localStorage.getItem(this.storageKey);
    if (!data) return [];
    return JSON.parse(data);
  }

  // Obtenir un scanner par ID
  getScannerById(id: string): Scanner | undefined {
    const scanners = this.getSavedScanners();
    return scanners.find(s => s.id === id);
  }

  /**
   * Compresse un fichier image (JPEG/PNG) pour ne pas dépasser maxSizeKb.
   * Utilise un canvas pour réduire la qualité ou les dimensions.
   */
  async compressImageFile(file: File, maxSizeKb: number): Promise<File> {
    const maxBytes = Math.max(50 * 1024, maxSizeKb * 1024);
    if (file.size <= maxBytes) return file;
    const type = (file.type || '').toLowerCase();
    const isJpeg = type.includes('jpeg') || type.includes('jpg');
    const isPng = type.includes('png');
    if (!isJpeg && !isPng) return file;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        const w = img.width;
        const h = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        const tryBlob = (quality: number, scale: number): Promise<Blob> => {
          const cw = Math.max(1, Math.floor(w * scale));
          const ch = Math.max(1, Math.floor(h * scale));
          canvas.width = cw;
          canvas.height = ch;
          ctx.drawImage(img, 0, 0, cw, ch);
          const mime = isJpeg ? 'image/jpeg' : 'image/png';
          return new Promise((res) => {
            canvas.toBlob(
              (b) => res(b || new Blob()),
              mime,
              isJpeg ? Math.min(0.95, quality) : undefined
            );
          });
        };

        const attempt = (quality: number, scale: number): void => {
          tryBlob(quality, scale).then((blob) => {
            if (blob.size <= maxBytes) {
              const ext = isJpeg ? 'jpg' : 'png';
              const name = file.name.replace(/\.[^.]+$/, '') + '_compressed.' + ext;
              resolve(new File([blob], name, { type: blob.type }));
              return;
            }
            if (scale > 0.2) {
              attempt(quality, Math.max(0.2, scale - 0.2));
            } else if (quality > 0.15) {
              attempt(Math.max(0.15, quality - 0.15), 1);
            } else {
              const ext = isJpeg ? 'jpg' : 'png';
              const name = file.name.replace(/\.[^.]+$/, '') + '_compressed.' + ext;
              resolve(new File([blob], name, { type: blob.type }));
            }
          });
        };
        attempt(0.85, 1);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  /**
   * Compresse un fichier PDF pour ne pas dépasser maxSizeKb (ré-encodage des pages en JPEG).
   * Réessaie avec qualité et échelle réduites jusqu'à respecter la limite ou atteindre le minimum.
   */
  async compressPdfFile(file: File, maxSizeKb: number): Promise<File> {
    const maxBytes = Math.max(50 * 1024, maxSizeKb * 1024);
    const type = (file.type || '').toLowerCase();
    if (!type.includes('pdf')) return file;
    if (file.size <= maxBytes) return file;

    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      }
      const { jsPDF } = await import('jspdf');
      const data = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
      const numPages = doc.numPages;
      const pageW = 210; // A4 mm
      const pageH = 297;

      const pairs: { scale: number; quality: number }[] = [
        { scale: 0.9, quality: 0.5 },
        { scale: 0.8, quality: 0.4 },
        { scale: 0.7, quality: 0.35 },
        { scale: 0.6, quality: 0.28 },
        { scale: 0.5, quality: 0.22 },
      ];
      let best: File | null = null;

      for (const { scale, quality } of pairs) {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        for (let i = 1; i <= numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const imgData = canvas.toDataURL('image/jpeg', quality);
          if (i > 1) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
        }
        const blob = pdf.output('blob');
        if (blob.size <= maxBytes) {
          return new File(
            [blob],
            file.name.replace(/\.pdf$/i, '_compressed.pdf'),
            { type: 'application/pdf' }
          );
        }
        if (!best || blob.size < best.size) {
          best = new File([blob], file.name.replace(/\.pdf$/i, '_compressed.pdf'), { type: 'application/pdf' });
        }
      }
      return best ?? file;
    } catch {
      return file;
    }
  }

  // Scanner un document avec un scanner spécifique
  async scanDocument(scannerId: string, options: {
    resolution?: number;
    color?: boolean;
    duplex?: boolean;
    format?: ScanFormat;
    /** Source : vitre (plateau) ou bac (chargeur) */
    scanSource?: ScanSource;
    /** Taille du document (A4, A3, Letter, Legal, Auto) pour le scan / chargeur */
    pageSize?: ScanPageSize | string;
    /** Orientation : auto (normaliser pour A4/Letter), portrait ou landscape */
    orientation?: ScanOrientation;
    /** Taille de l'image dans le document : fill-width | fill-height | fill-page | fit */
    imageScaleMode?: ScanImageScaleMode;
    /** Mode de scan : une page ou plusieurs pages fusionnées */
    scanType?: ScanType;
    /** Nombre de pages à scanner : 0 = toutes, N = nombre de pages (défaut 1 si single, 0 si multiple) */
    pages?: number;
    compress?: boolean;
    compressionLimitKb?: number;
    /** Signal pour annuler le scan (AbortController.signal) */
    signal?: AbortSignal;
  } = {}): Promise<File> {
    const scanner = this.getScannerById(scannerId);
    
    if (!scanner) {
      throw new Error('Scanner non trouvé. Vérifiez que le scanner est bien celui affiché dans Paramètres > Gestion des scanners, puis rafraîchissez la liste.');
    }

    // Ne pas bloquer si le statut est "offline" (vérification peut avoir échoué ou timeout) — on tente le scan, le backend renverra une erreur si besoin
    if (scanner.status !== 'online') {
      console.warn(`Scanner ${scanner.name} marqué ${scanner.status}, tentative de scan quand même.`);
    }

    // Vérifier que le serveur de scan répond avant d'envoyer la requête
    const backendOk = await checkScannerBackendHealth();
    if (!backendOk) {
      throw new Error(
        'Le serveur de scan ne répond pas. Démarrez-le (dossier server : node server.js, port 3001) puis vérifiez l\'URL dans Paramètres > Gestion des scanners.'
      );
    }

    // Essayer d'abord d'utiliser l'API backend pour un vrai scan
    try {
      // Adaptation: si ajouté en "network" mais c'est un Canon avec pilote constructeur,
      // forcer l'appel en "vendor-driver" (le backend utilisera WIA sans lib TWAIN externe)
      const looksCanon = (scanner.manufacturer?.toLowerCase().includes('canon') ||
                          scanner.name?.toLowerCase().includes('canon') ||
                          scanner.model?.toLowerCase().includes('canon')) ?? false;
      const effectiveType = (scanner.type === 'network' && looksCanon) ? 'vendor-driver' : (scanner.type || 'vendor-driver');

      const response = await fetch(`${getScannerApiBaseUrl()}/api/scanners/${scannerId}/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: options.signal,
        body: JSON.stringify({
          scanner: {
            ...scanner,
            type: effectiveType
          }, // Envoyer les infos complètes du scanner avec type adapté
          scannerType: effectiveType,
          resolution: options.resolution || 300,
          color: options.color !== undefined ? options.color : true,
          duplex: options.duplex || false,
          format: options.format || 'PDF',
          scanSource: options.scanSource || 'vitre',
          pageSize: options.pageSize || 'A4',
          orientation: options.orientation || 'auto',
          imageScaleMode: options.imageScaleMode || 'fill-page',
          scanType: options.scanType || 'single',
          pages: options.pages != null ? options.pages : (options.scanType === 'multiple' ? 0 : 1)
        }),
      });

      if (response.ok) {
        // Le backend retourne directement le fichier scanné
        const contentType = response.headers.get('Content-Type') || 
                           (options.format?.toLowerCase() === 'pdf' ? 'application/pdf' :
                            options.format?.toLowerCase() === 'png' ? 'image/png' :
                            options.format?.toLowerCase() === 'tiff' ? 'image/tiff' :
                            'image/jpeg');
        
        const fileName = response.headers.get('X-File-Name') || 
                        `scan_${Date.now()}.${options.format?.toLowerCase() || 'jpg'}`;
        
        const blob = await response.blob();
        if (!blob || blob.size === 0) {
          throw new Error(
            'Le scan n\'a retourné aucun fichier. Vérifiez : 1) Serveur de scan démarré (port 3001) ; 2) Scanner branché et allumé ; 3) Bac (chargeur) : feuilles en place et chargeur fermé.'
          );
        }
        let resultFile = new File([blob], fileName, { type: contentType });
        const limitKb = (options.compressionLimitKb != null && options.compressionLimitKb > 0) ? options.compressionLimitKb : 500;
        const shouldCompress = options.compress === true && limitKb > 0;
        const isImageByType = (contentType || '').toLowerCase().includes('image/');
        const isImageByExt = /\.(jpe?g|png|gif|webp|bmp)$/i.test(fileName || '');
        const fmt = (options.format || '').toLowerCase();
        const isImageByFormat = fmt === 'jpeg' || fmt === 'png';
        const isImage = isImageByType || isImageByExt || isImageByFormat;
        const isPdf = (contentType || '').toLowerCase().includes('application/pdf') || /\.pdf$/i.test(fileName || '');
        if (shouldCompress && isImage) {
          resultFile = await this.compressImageFile(resultFile, limitKb);
        } else if (shouldCompress && isPdf) {
          resultFile = await this.compressPdfFile(resultFile, limitKb);
        }
        return resultFile;
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        const backendMsg = errorData.error || errorData.details || `Erreur HTTP: ${response.status}`;
        throw new Error(toUserScanError(new Error(backendMsg)));
      }
    } catch (error: unknown) {
      const userMsg = toUserScanError(error);
      // Toujours remonter l'erreur pour que l'interface l'affiche dans le modal
      throw new Error(userMsg);
    }

    // Fallback: utiliser le sélecteur de fichiers avec un message informatif
    return new Promise((resolve, reject) => {
      // Afficher un message à l'utilisateur
      const userMessage = `Le scanner "${scanner?.name ?? 'inconnu'}" nécessite une configuration backend pour le scan direct.\n\n` +
        `Veuillez sélectionner un fichier scanné depuis votre ordinateur.\n\n` +
        `Pour activer le scan direct, démarrez le serveur backend (port 3001) et configurez SANE/TWAIN.`;
      
      if (!confirm(userMessage)) {
        reject(new Error('Scan annulé par l\'utilisateur'));
        return;
      }

      // Ouvrir le sélecteur de fichiers
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.pdf';
      input.onchange = (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files[0]) {
          resolve(target.files[0]);
        } else {
          reject(new Error('Aucun fichier sélectionné'));
        }
      };
      input.oncancel = () => {
        reject(new Error('Scan annulé'));
      };
      input.click();
    });
  }

  // Vérifier le statut d'un scanner via l'API backend
  async checkScannerStatus(scannerId: string): Promise<'online' | 'offline' | 'busy'> {
    const scanner = this.getScannerById(scannerId);
    if (!scanner) return 'offline';
    
    try {
      const response = await fetch(`${getScannerApiBaseUrl()}/api/scanners/${scannerId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scanner),
      });

      if (response.ok) {
        const data = await response.json();
        return data.status;
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du statut:', error);
    }
    
    // Fallback: retourner le statut sauvegardé
    return scanner.status;
  }

  /** Rafraîchir la liste des scanners (re-détection). @param preferSystemDriver — voir detectScanners. @param approach — approche de détection. */
  async refreshScanners(preferSystemDriver?: boolean, approach?: ScannerDetectionApproach): Promise<Scanner[]> {
    return this.detectScanners(preferSystemDriver, approach);
  }

  // Tester la connexion à un scanner via l'API backend
  async testScannerConnection(scannerId: string): Promise<boolean> {
    const scanner = this.getScannerById(scannerId);
    if (!scanner) return false;
    
    try {
      const status = await this.checkScannerStatus(scannerId);
      return status === 'online';
    } catch (error) {
      console.error('Erreur lors du test de connexion:', error);
      return false;
    }
  }

  // Ajouter un scanner manuellement (par IP)
  async addScannerManually(ipAddress: string, scannerInfo?: {
    name?: string;
    manufacturer?: string;
    model?: string;
  }): Promise<Scanner> {
    // Vérifier d'abord si l'IP répond et est un scanner
    try {
      // Tenter de détecter le scanner à cette IP via le backend
      const response = await fetch(`${getScannerApiBaseUrl()}/api/scanners/detect`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const allScanners = await response.json();
        const found = allScanners.find((s: Scanner) => s.ipAddress === ipAddress);
        if (found) {
          const scanners = this.getSavedScanners();
          if (!scanners.find(s => s.id === found.id)) {
            scanners.push(found);
            localStorage.setItem(this.storageKey, JSON.stringify(scanners));
          }
          return found;
        }
      }
    } catch (error) {
      console.warn('Backend non disponible pour la détection automatique:', error);
    }
    
    // Vérifier si l'IP répond (ping)
    let isOnline = false;
    try {
      // Tenter de vérifier si l'IP est accessible
      const testResponse = await fetch(`http://${ipAddress}`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: AbortSignal.timeout(2000)
      } as any);
      isOnline = true;
    } catch (error) {
      // En mode no-cors, on ne peut pas vraiment savoir, mais on assume que c'est accessible
      isOnline = true;
    }
    
    // Créer un scanner avec les informations fournies ou par défaut
    const inferredIsCanon =
      (scannerInfo?.manufacturer && scannerInfo.manufacturer.toLowerCase().includes('canon')) ||
      (scannerInfo?.name && scannerInfo.name.toLowerCase().includes('canon')) ||
      (scannerInfo?.model && scannerInfo.model.toLowerCase().includes('canon')) ||
      false;

    const newScanner: Scanner = {
      id: `scanner-${ipAddress.replace(/\./g, '-')}-${Date.now()}`,
      name: scannerInfo?.name || `Scanner réseau ${ipAddress}`,
      manufacturer: scannerInfo?.manufacturer || (inferredIsCanon ? 'Canon' : 'Non spécifié'),
      model: scannerInfo?.model || (inferredIsCanon ? 'Canon Network Scanner' : 'Scanner réseau'),
      type: 'network',
      ipAddress,
      status: isOnline ? 'online' : 'offline',
      capabilities: {
        color: true,
        duplex: true,
        resolution: [150, 200, 300, 600],
        formats: ['PDF', 'JPEG', 'PNG']
      }
    };

    const scanners = this.getSavedScanners();
    // Vérifier qu'il n'existe pas déjà un scanner avec cette IP
    const existing = scanners.find(s => s.ipAddress === ipAddress);
    if (existing) {
      // Mettre à jour l'existant
      Object.assign(existing, newScanner);
      localStorage.setItem(this.storageKey, JSON.stringify(scanners));
      return existing;
    }
    
    scanners.push(newScanner);
    localStorage.setItem(this.storageKey, JSON.stringify(scanners));

    return newScanner;
  }

  // Supprimer un scanner
  removeScanner(scannerId: string): boolean {
    const scanners = this.getSavedScanners();
    const filtered = scanners.filter(s => s.id !== scannerId);
    if (filtered.length === scanners.length) return false;
    
    localStorage.setItem(this.storageKey, JSON.stringify(filtered));
    return true;
  }
}

export const scannerService = new ScannerService();

