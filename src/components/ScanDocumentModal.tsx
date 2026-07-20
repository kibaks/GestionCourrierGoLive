import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faSpinner,
  faRefresh,
  faCirclePlay,
  faCheck,
  faFilePdf,
  faLink,
  faExclamationTriangle,
  faExpand
} from '@fortawesome/free-solid-svg-icons';
import {
  scannerService,
  checkScannerBackendHealth,
  Scanner,
  DEFAULT_SCAN_SETTINGS,
  ScanSettings,
  ScanFormat,
  ScanSource,
  ScanPageSize,
  ScanOrientation,
  ScanImageScaleMode
} from '../services/scannerService';
import { userSettingsService } from '../services/userSettingsService';

interface ScanDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (file: File) => void;
}

const ScanDocumentModal: React.FC<ScanDocumentModalProps> = ({ isOpen, onClose, onScanComplete }) => {
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>('');
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [scanning, setScanning] = useState(false);
  const [scanBackendStatus, setScanBackendStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [scannersLoading, setScannersLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const resetPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    setError(null);
  }, [previewUrl]);

  const closeModal = useCallback(() => {
    resetPreview();
    setScanBackendStatus('idle');
    setScanners([]);
    setSelectedScanner('');
    onClose();
  }, [onClose, resetPreview]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setScanBackendStatus('checking');
    setScannersLoading(true);

    const saved = scannerService.getSavedScanners();
    if (saved.length > 0) {
      setScanners(saved);
      if (!selectedScanner) setSelectedScanner(saved[0].id);
    }

    checkScannerBackendHealth()
      .then(ok => setScanBackendStatus(ok ? 'ok' : 'error'))
      .catch(() => setScanBackendStatus('error'));

    (async () => {
      try {
        const [savedScan, detected] = await Promise.all([
          userSettingsService.getSettings<ScanSettings>('scan_settings', DEFAULT_SCAN_SETTINGS),
          scannerService.detectScanners()
        ]);
        setScanSettings(prev => ({ ...DEFAULT_SCAN_SETTINGS, ...prev, ...savedScan }));
        const list = detected.length > 0 ? detected : scannerService.getSavedScanners();
        setScanners(list);
        if (list.length > 0) setSelectedScanner(list[0].id);
      } catch {
        const fallback = scannerService.getSavedScanners();
        setScanners(fallback);
        if (fallback.length > 0) setSelectedScanner(fallback[0].id);
      } finally {
        setScannersLoading(false);
      }
    })();

    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [isOpen, selectedScanner]);

  const refreshScanners = async () => {
    setScannersLoading(true);
    try {
      const detected = await scannerService.detectScanners();
      const list = detected.length > 0 ? detected : scannerService.getSavedScanners();
      setScanners(list);
      if (list.length > 0) setSelectedScanner(list[0].id);
    } catch {
      const fallback = scannerService.getSavedScanners();
      setScanners(fallback);
      if (fallback.length > 0) setSelectedScanner(fallback[0].id);
    } finally {
      setScannersLoading(false);
    }
  };

  const handleScan = async () => {
    setError(null);
    if (scanBackendStatus === 'error') {
      setError('Le serveur de scan ne répond pas. Démarrez-le puis fermez et rouvrez ce modal.');
      return;
    }
    if (scanners.length === 0) {
      setError('Aucun scanner détecté. Allez dans Paramètres > Gestion des scanners.');
      return;
    }
    const scannerId = selectedScanner || scanners[0]?.id;
    if (!scannerId) {
      setError('Sélectionnez un scanner.');
      return;
    }
    resetPreview();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setScanning(true);
    try {
      const scannedFile = await scannerService.scanDocument(scannerId, {
        resolution: scanSettings.resolution ?? 300,
        color: scanSettings.color !== false,
        format: scanSettings.format,
        scanSource: scanSettings.scanSource ?? 'vitre',
        pageSize: scanSettings.pageSize ?? 'A4',
        orientation: scanSettings.orientation ?? 'auto',
        imageScaleMode: scanSettings.imageScaleMode ?? 'fill-page',
        compress: scanSettings.compress ?? false,
        compressionLimitKb: (scanSettings.compressionLimitKb != null && scanSettings.compressionLimitKb > 0)
          ? scanSettings.compressionLimitKb
          : 500,
        signal: controller.signal
      });
      if (!scannedFile || scannedFile.size === 0) {
        setError('Le scan n\'a retourné aucun fichier. Vérifiez le scanner et le serveur de scan (port 3001).');
        return;
      }
      setPreviewFile(scannedFile);
      setPreviewUrl(URL.createObjectURL(scannedFile));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du scan';
      setError(msg || 'Le scan a échoué. Vérifiez le scanner et le serveur de scan.');
    } finally {
      setScanning(false);
      abortControllerRef.current = null;
    }
  };

  const handleConfirm = () => {
    if (!previewFile) return;
    onScanComplete(previewFile);
    closeModal();
  };

  const handleCancelScan = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
  };

  const updateSetting = <K extends keyof ScanSettings>(key: K, value: ScanSettings[K]) => {
    setScanSettings(prev => ({ ...prev, [key]: value }));
  };

  if (!isOpen) return null;

  const isImage = previewFile?.type.startsWith('image/') || previewUrl?.match(/\.(jpeg|jpg|png)$/i);

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-slideIn">
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FontAwesomeIcon icon={faCirclePlay} /> Scanner un document
          </h3>
          <button onClick={closeModal} className="w-8 h-8 rounded-xl bg-white/20 text-white hover:bg-white/30 flex items-center justify-center">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div>
                <label className="text-sm font-semibold text-surface-700 mb-2 block">Scanner</label>
                <div className="flex gap-2">
                  <select
                    value={selectedScanner}
                    onChange={(e) => setSelectedScanner(e.target.value)}
                    className="flex-1 px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 text-surface-900"
                  >
                    <option value="">{scannersLoading ? 'Détection...' : 'Sélectionner un scanner'}</option>
                    {scanners.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={refreshScanners}
                    disabled={scannersLoading}
                    className="px-3 py-3 bg-surface-100 border border-surface-200 rounded-xl hover:bg-surface-200 text-surface-700 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faRefresh} spin={scannersLoading} />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-surface-700 mb-2 block">Format</label>
                <select
                  value={scanSettings.format}
                  onChange={(e) => updateSetting('format', e.target.value as ScanFormat)}
                  className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 text-surface-900"
                >
                  <option value="PDF">PDF</option>
                  <option value="JPEG">JPEG</option>
                  <option value="PNG">PNG</option>
                  <option value="TIFF">TIFF</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-surface-700 mb-2 block">Source</label>
                <select
                  value={scanSettings.scanSource}
                  onChange={(e) => updateSetting('scanSource', e.target.value as ScanSource)}
                  className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 text-surface-900"
                >
                  <option value="vitre">Vitre (plateau)</option>
                  <option value="bac">Bac (chargeur ADF)</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-surface-700 mb-2 block">Taille de page</label>
                <select
                  value={scanSettings.pageSize}
                  onChange={(e) => updateSetting('pageSize', e.target.value as ScanPageSize)}
                  className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 text-surface-900"
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                  <option value="Letter">Letter</option>
                  <option value="Legal">Legal</option>
                  <option value="Auto">Auto</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-surface-700 mb-2 block">Résolution (DPI)</label>
                <select
                  value={scanSettings.resolution ?? 300}
                  onChange={(e) => updateSetting('resolution', Number(e.target.value))}
                  className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 text-surface-900"
                >
                  <option value={150}>150 dpi</option>
                  <option value={200}>200 dpi</option>
                  <option value={300}>300 dpi</option>
                  <option value={600}>600 dpi</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-surface-700 mb-2 block">Orientation</label>
                <select
                  value={scanSettings.orientation}
                  onChange={(e) => updateSetting('orientation', e.target.value as ScanOrientation)}
                  className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 text-surface-900"
                >
                  <option value="auto">Auto</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Paysage</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-surface-700 mb-2 block">Mode d&apos;image</label>
                <select
                  value={scanSettings.imageScaleMode}
                  onChange={(e) => updateSetting('imageScaleMode', e.target.value as ScanImageScaleMode)}
                  className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 text-surface-900"
                >
                  <option value="fill-page">Remplir la page</option>
                  <option value="fill-width">Remplir la largeur</option>
                  <option value="fill-height">Remplir la hauteur</option>
                  <option value="fit">Adapter</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  id="scan-color"
                  type="checkbox"
                  checked={scanSettings.color !== false}
                  onChange={(e) => updateSetting('color', e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 border-surface-300"
                />
                <label htmlFor="scan-color" className="text-sm text-surface-700">Couleur</label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="scan-compress"
                  type="checkbox"
                  checked={scanSettings.compress ?? false}
                  onChange={(e) => updateSetting('compress', e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 border-surface-300"
                />
                <label htmlFor="scan-compress" className="text-sm text-surface-700">Compresser</label>
              </div>

              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${scanBackendStatus === 'checking' ? 'bg-amber-500 animate-pulse' : scanBackendStatus === 'ok' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className={`text-sm font-medium ${scanBackendStatus === 'checking' ? 'text-amber-600' : scanBackendStatus === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {scanBackendStatus === 'checking' && 'Vérification du serveur...'}
                  {scanBackendStatus === 'ok' && 'Serveur de scan : Connecté'}
                  {(scanBackendStatus === 'error' || scanBackendStatus === 'idle') && 'Serveur de scan : Hors ligne'}
                </span>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-surface-200 bg-surface-50 flex flex-col overflow-hidden" style={{ minHeight: 480 }}>
                {previewUrl && previewFile ? (
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-surface-200">
                      <div className="flex items-center gap-2 text-sm text-surface-700">
                        <FontAwesomeIcon icon={isImage ? faFilePdf : faFilePdf} />
                        <span className="font-medium truncate">{previewFile.name}</span>
                        <span className="text-surface-500">({(previewFile.size / 1024).toFixed(1)} Ko)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                          className="p-2 text-surface-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <FontAwesomeIcon icon={faLink} />
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(previewUrl, '_blank')}
                          className="p-2 text-surface-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <FontAwesomeIcon icon={faExpand} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-surface-100">
                      {isImage ? (
                        <img src={previewUrl} alt="Document scanné" className="max-w-full max-h-full object-contain rounded-xl shadow-lg" />
                      ) : (
                        <iframe src={previewUrl} title="Aperçu du scan" className="w-full h-full min-h-[420px] rounded-xl bg-white shadow-lg" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-surface-500 p-8">
                    <div className="w-20 h-20 rounded-full bg-surface-100 flex items-center justify-center mb-4">
                      <FontAwesomeIcon icon={faCirclePlay} className="w-10 h-10 text-surface-400" />
                    </div>
                    <p className="font-semibold text-surface-700">Aucun aperçu</p>
                    <p className="text-sm text-surface-500 mt-1">Lancez le scan pour prévisualiser le document.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-surface-200 flex justify-end gap-3 bg-surface-50 rounded-b-3xl">
          <button
            type="button"
            onClick={closeModal}
            className="px-5 py-2.5 border-2 border-surface-300 text-surface-700 font-semibold rounded-xl hover:bg-surface-100 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={scanning ? handleCancelScan : handleScan}
            className={`px-5 py-2.5 font-semibold rounded-xl text-white transition-all flex items-center gap-2 ${scanning ? 'bg-red-500 hover:bg-red-600' : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700'}`}
          >
            {scanning ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> Annuler le scan
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faCirclePlay} /> Scanner
              </>
            )}
          </button>
          {previewFile && (
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faCheck} /> Utiliser ce document
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ScanDocumentModal;
