// v2.1 - Cache buster: force reload
import { getAuthToken, getBaseUrl } from './laravelApiService';

export interface UploadOptions {
  maxConcurrent?: number;
  maxRetries?: number;
  timeout?: number;
  chunkSize?: number;
  compressImages?: boolean;
  maxImageWidth?: number;
  maxImageHeight?: number;
  onProgress?: (progress: UploadProgress) => void;
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
  creePar?: string;
}

export interface UploadProgress {
  fileName: string;
  uploaded: number;
  total: number;
  percentage: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface UploadResult {
  success: boolean;
  fileName: string;
  fileId?: string;
  error?: string;
  duration: number;
}

/**
 * Service d'upload optimisé avec:
 * - Upload parallèle avec limite de concurrence
 * - Compression d'images côté client
 * - Chunked upload pour gros fichiers
 * - Timeout et retry logic
 * - Progress tracking
 */
class OptimizedUploadService {
  private defaultOptions: UploadOptions = {
    maxConcurrent: 1,
    maxRetries: 3,
    timeout: 300000,
    chunkSize: 5 * 1024 * 1024,
    compressImages: true,
    maxImageWidth: 1280,
    maxImageHeight: 720,
    enableHeartbeat: true,
    heartbeatInterval: 15000,
  };

  /**
   * Vérifie et retourne le token d'authentification
   */
  private checkAndRefreshToken(): string | null {
    return getAuthToken();
  }

  /**
   * Compresse une image avant upload
   */
  async compressImage(file: File): Promise<File> {
    // Vérifier si c'est une image
    if (!file.type.startsWith('image/')) {
      return file;
    }

    // Ne pas compresser les images déjà petites (< 100KB)
    if (file.size < 100 * 1024) {
      return file;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(file);
        return;
      }

      img.onload = () => {
        let { width, height } = img;
        const maxWidth = this.defaultOptions.maxImageWidth!;
        const maxHeight = this.defaultOptions.maxImageHeight!;

        // Calculer les nouvelles dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir en blob avec qualité réduite pour JPEG
        const mimeType = file.type === 'image/png' ? 'image/jpeg' : file.type;
        const quality = 0.72; // aggressif pour minimiser le temps de traitement PHP

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // Créer un nouveau fichier compressé
            const compressedFile = new File([blob], file.name, {
              type: mimeType,
              lastModified: file.lastModified,
            });

            console.log(`📸 Image compressée: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB)`);
            resolve(compressedFile);
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => resolve(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Ping/Heartbeat pour maintenir la connexion active pendant l'upload
   * Utilise un endpoint simple qui existe forcément
   */
  private async sendHeartbeat(): Promise<boolean> {
    try {
      const baseUrl = getBaseUrl?.() || '';
      if (!baseUrl) return false;
      
      // Utiliser l'URL racine ou une requête HEAD minimale
      const res = await fetch(`${baseUrl}/`, {
        method: 'HEAD',
        headers: { 
          'Authorization': `Bearer ${getAuthToken() || ''}`,
        },
        signal: AbortSignal.timeout(5000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Upload direct avec FormData (pas de conversion base64) - plus rapide
   */
  private async uploadWithFormData(
    courrierId: string, 
    file: File, 
    creePar?: string,
    signal?: AbortSignal
  ): Promise<{ id: string }> {
    const baseUrl = getBaseUrl?.() || '';
    if (!baseUrl) throw new Error('API Laravel non configurée');

    // Rafraîchir le token avant l'upload
    const token = this.checkAndRefreshToken();
    if (!token) throw new Error('Token d\'authentification manquant');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('courrierId', courrierId);
    if (creePar) formData.append('creePar', creePar);

    const res = await fetch(`${baseUrl}/api/courriers/${courrierId}/fichiers`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'X-Keep-Alive': 'true',
      },
      body: formData,
      keepalive: true,
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Erreur inconnue');
      if (res.status === 401) {
        throw new Error('Token expiré ou invalide - reconnectez-vous');
      }
      throw new Error(`Upload échoué: ${res.status} - ${text}`);
    }

    const data = await res.json();
    return { id: data?.data?.id || data?.id || data?.fichier?.id };
  }

  /**
   * Upload un fichier avec heartbeat et retry
   */
  async uploadFileWithRetry(
    courrierId: string,
    file: File,
    options: UploadOptions = {},
    attempt: number = 1
  ): Promise<UploadResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    let heartbeatInterval: NodeJS.Timeout | null = null;

    try {
      // Compression si activée (pour les images scannées)
      let fileToUpload = file;
      if (opts.compressImages && file.type.startsWith('image/')) {
        fileToUpload = await this.compressImage(file);
        console.log(`🗜️ ${file.name}: ${(file.size/1024).toFixed(0)}KB → ${(fileToUpload.size/1024).toFixed(0)}KB`);
      }

      // Démarrer le heartbeat si activé (désactivé par défaut)
      if (opts.enableHeartbeat) {
        heartbeatInterval = setInterval(async () => {
          try {
            await this.sendHeartbeat();
          } catch {
            // Silencieux
          }
        }, opts.heartbeatInterval || 30000);
      }

      // Upload avec timeout et heartbeat
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error(`Timeout après ${opts.timeout}ms`)), opts.timeout);
      let result: { id: string };
      try {
        result = await this.uploadWithFormData(courrierId, fileToUpload, options.creePar, controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }

      // Arrêter le heartbeat
      if (heartbeatInterval) clearInterval(heartbeatInterval);

      const duration = Date.now() - startTime;
      console.log(`✅ Upload réussi: ${file.name} en ${duration}ms`);

      return {
        success: true,
        fileName: file.name,
        fileId: result.id,
        duration,
      };
    } catch (error) {
      // Arrêter le heartbeat en cas d'erreur
      if (heartbeatInterval) clearInterval(heartbeatInterval);

      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error(`❌ Échec upload ${file.name}:`, errorMessage);

      // Retry si pas trop d'essais
      if (attempt < (opts.maxRetries || 3)) {
        console.warn(`🔄 Retry ${attempt}/${opts.maxRetries} pour ${file.name} dans ${attempt * 2}s...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
        return this.uploadFileWithRetry(courrierId, file, options, attempt + 1);
      }

      return {
        success: false,
        fileName: file.name,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Upload multiple fichiers en parallèle avec limite de concurrence
   */
  async uploadFiles(
    courrierId: string,
    files: File[],
    options: UploadOptions = {}
  ): Promise<UploadResult[]> {
    const opts = { ...this.defaultOptions, ...options };
    const maxConcurrent = opts.maxConcurrent || 3;

    console.log(`🚀 Upload optimisé démarré: ${files.length} fichiers, ${maxConcurrent} simultanés max`);

    const results: UploadResult[] = [];
    const queue = [...files];
    const inProgress: Promise<void>[] = [];

    // Fonction pour traiter un fichier
    const processFile = async (file: File) => {
      const result = await this.uploadFileWithRetry(courrierId, file, options);
      results.push(result);

      // Notifier le progrès
      if (opts.onProgress) {
        const progress: UploadProgress = {
          fileName: file.name,
          uploaded: result.success ? file.size : 0,
          total: file.size,
          percentage: result.success ? 100 : 0,
          status: result.success ? 'completed' : 'error',
          error: result.error,
        };
        opts.onProgress(progress);
      }
    };

    // Traiter les fichiers avec limite de concurrence
    while (queue.length > 0 || inProgress.length > 0) {
      // Lancer de nouveaux uploads tant qu'on n'a pas atteint la limite
      while (inProgress.length < maxConcurrent && queue.length > 0) {
        const file = queue.shift()!;
        const promise = processFile(file).then(() => {
          // Retirer de la liste des promesses en cours
          const index = inProgress.indexOf(promise);
          if (index > -1) inProgress.splice(index, 1);
        });
        inProgress.push(promise);
      }

      // Attendre qu'au moins une promesse se termine
      if (inProgress.length > 0) {
        await Promise.race(inProgress);
      }
    }

    // Résumé
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`✅ Upload terminé: ${successCount} succès, ${failCount} échecs, ${totalDuration}ms total`);

    return results;
  }

  /**
   * Vérifie la taille totale des fichiers avant upload
   */
  validateFiles(files: File[], maxTotalSizeMB: number = 100): { valid: boolean; error?: string } {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const maxSize = maxTotalSizeMB * 1024 * 1024;

    if (totalSize > maxSize) {
      return {
        valid: false,
        error: `Taille totale ${(totalSize / 1024 / 1024).toFixed(1)}MB dépasse la limite de ${maxTotalSizeMB}MB`,
      };
    }

    // Vérifier les fichiers individuels (max 50MB par fichier)
    const maxFileSize = 50 * 1024 * 1024;
    for (const file of files) {
      if (file.size > maxFileSize) {
        return {
          valid: false,
          error: `Le fichier "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)}MB) dépasse la limite de 50MB`,
        };
      }
    }

    return { valid: true };
  }
}

export const optimizedUploadService = new OptimizedUploadService();
