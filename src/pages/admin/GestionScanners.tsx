import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { scannerService, Scanner, checkScannerBackendHealth, getScannerServerConfig, DEFAULT_SCAN_SETTINGS, type ScanSettings, type ScanFormat, type ScanType, type ScanSource, type ScanOrientation, type ScanPageSize, type ScanImageScaleMode, type ScannerDetectionApproach } from '../../services/scannerService';
import { userSettingsService } from '../../services/userSettingsService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPrint,
  faPlus,
  faTrash,
  faRefresh,
  faCheckCircle,
  faTimesCircle,
  faClock,
  faDesktop,
  faServer,
  faSearch,
  faEdit,
  faSave,
  faTimes,
  faWifi,
  faPlug,
  faSpinner,
  faDownload,
  faExternalLinkAlt,
  faInfoCircle
} from '@fortawesome/free-solid-svg-icons';

const GestionScanners: React.FC = () => {
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedScanner, setSelectedScanner] = useState<Scanner | null>(null);
  const [newScannerIP, setNewScannerIP] = useState('');
  const [newScannerName, setNewScannerName] = useState('');
  const [newScannerManufacturer, setNewScannerManufacturer] = useState('');
  const [newScannerModel, setNewScannerModel] = useState('');
  const [addingScanner, setAddingScanner] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingScanner, setEditingScanner] = useState<Scanner | null>(null);
  const [showDriverLinksModal, setShowDriverLinksModal] = useState(false);
  const [driverLinks, setDriverLinks] = useState<any>(null);
  const [loadingDriverLinks, setLoadingDriverLinks] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');
  const [initialBackendUrl, setInitialBackendUrl] = useState('');
  const [savingBackendUrl, setSavingBackendUrl] = useState(false);
  const [preferSystemDriver, setPreferSystemDriver] = useState(false);
  const [savingPreferSystemDriver, setSavingPreferSystemDriver] = useState(false);
  const [detectionApproach, setDetectionApproach] = useState<ScannerDetectionApproach>('auto');
  const [savingDetectionApproach, setSavingDetectionApproach] = useState(false);
  const [testingBackendUrl, setTestingBackendUrl] = useState(false);
  const [scannerServerConfig, setScannerServerConfig] = useState<{ platform: string; platformLabel: string; recommendedApproach: ScannerDetectionApproach } | null>(null);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [savingScanSettings, setSavingScanSettings] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const url = await userSettingsService.getSettings<string>('scanner_backend_url', '');
        setBackendUrl(url || '');
        setInitialBackendUrl(url || '');
        const prefer = await userSettingsService.getSettings<boolean>('scanner_prefer_system_driver', false);
        setPreferSystemDriver(!!prefer);

        // Récupérer la config du serveur de scan (plateforme + méthode recommandée, ex. SANE sur Mac)
        const serverConfig = await getScannerServerConfig();
        if (serverConfig) {
          setScannerServerConfig({ platform: serverConfig.platform, platformLabel: serverConfig.platformLabel, recommendedApproach: serverConfig.recommendedApproach as ScannerDetectionApproach });
        }

        let approach = await userSettingsService.getSettings<ScannerDetectionApproach | null>('scanner_detection_approach', null);
        const hasSavedApproach = approach && ['auto', 'sane', 'network', 'system'].includes(approach);
        // Sur macOS/Linux : SANE obligatoire (tous les scanners doivent être gérés via scanimage/SANE)
        if (serverConfig && (serverConfig.platform === 'darwin' || serverConfig.platform === 'linux')) {
          approach = 'sane';
          setDetectionApproach('sane');
          await userSettingsService.saveSettings('scanner_detection_approach', 'sane');
          setPreferSystemDriver(false);
          await userSettingsService.saveSettings('scanner_prefer_system_driver', false);
        } else if (!hasSavedApproach && serverConfig) {
          approach = serverConfig.recommendedApproach as ScannerDetectionApproach;
          setDetectionApproach(approach);
          await userSettingsService.saveSettings('scanner_detection_approach', approach);
          if (approach === 'system') {
            setPreferSystemDriver(true);
            await userSettingsService.saveSettings('scanner_prefer_system_driver', true);
          }
        } else if (prefer && approach === 'auto') {
          approach = 'system';
          setDetectionApproach('system');
        } else {
          setDetectionApproach(approach || 'auto');
          if (!approach) approach = (serverConfig?.recommendedApproach as ScannerDetectionApproach) || 'auto';
        }

        const savedScan = await userSettingsService.getSettings<ScanSettings>('scan_settings', DEFAULT_SCAN_SETTINGS);
        setScanSettings({ ...DEFAULT_SCAN_SETTINGS, ...savedScan });
        setLoading(true);
        const detectedScanners = await scannerService.detectScanners(!!prefer, (approach || 'auto') as ScannerDetectionApproach);
        setScanners(detectedScanners);
      } catch (error) {
        console.error('Erreur lors du chargement des scanners:', error);
        setScanners(scannerService.getSavedScanners());
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    let cancelled = false;
    checkScannerBackendHealth().then(async (ok) => {
      if (!cancelled) setBackendReachable(ok);
      if (ok && !cancelled) {
        const config = await getScannerServerConfig();
        if (config && !cancelled) setScannerServerConfig({ platform: config.platform, platformLabel: config.platformLabel, recommendedApproach: config.recommendedApproach as ScannerDetectionApproach });
      }
    });
    return () => { cancelled = true; };
  }, [backendUrl, initialBackendUrl]);

  const loadBackendUrl = async () => {
    try {
      const url = await userSettingsService.getSettings<string>('scanner_backend_url', '');
      setBackendUrl(url || '');
      setInitialBackendUrl(url || '');
    } catch (error) {
      console.error('Erreur lors du chargement de l’URL du backend scanner :', error);
    }
  };

  const loadScanners = async () => {
    setLoading(true);
    try {
      const detectedScanners = await scannerService.detectScanners(preferSystemDriver, detectionApproach);
      setScanners(detectedScanners);
    } catch (error) {
      console.error('Erreur lors du chargement des scanners:', error);
      const savedScanners = scannerService.getSavedScanners();
      setScanners(savedScanners);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const ok = await checkScannerBackendHealth();
      setBackendReachable(ok);
      const refreshedScanners = await scannerService.refreshScanners(preferSystemDriver, detectionApproach);
      setScanners(refreshedScanners);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleScanSettingsChange = async (next: Partial<ScanSettings>) => {
    const updated = { ...scanSettings, ...next };
    setScanSettings(updated);
    setSavingScanSettings(true);
    try {
      await userSettingsService.saveSettings('scan_settings', updated);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des paramètres de scan :', error);
    } finally {
      setSavingScanSettings(false);
    }
  };

  const handleTogglePreferSystemDriver = async (checked: boolean) => {
    setPreferSystemDriver(checked);
    setSavingPreferSystemDriver(true);
    try {
      await userSettingsService.saveSettings('scanner_prefer_system_driver', checked);
      setRefreshing(true);
      const refreshedScanners = await scannerService.refreshScanners(checked, detectionApproach);
      setScanners(refreshedScanners);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la préférence pilote système :', error);
    } finally {
      setSavingPreferSystemDriver(false);
      setRefreshing(false);
    }
  };

  const handleDetectionApproachChange = async (approach: ScannerDetectionApproach) => {
    setDetectionApproach(approach);
    setSavingDetectionApproach(true);
    try {
      await userSettingsService.saveSettings('scanner_detection_approach', approach);
      const preferSystem = approach === 'system';
      await userSettingsService.saveSettings('scanner_prefer_system_driver', preferSystem);
      setPreferSystemDriver(preferSystem);
      setRefreshing(true);
      const refreshedScanners = await scannerService.refreshScanners(preferSystem, approach);
      setScanners(refreshedScanners);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'approche de détection :', error);
    } finally {
      setSavingDetectionApproach(false);
      setRefreshing(false);
    }
  };

  const handleSaveBackendUrl = async () => {
    const trimmed = backendUrl.trim();
    if (!trimmed) {
      if (
        !window.confirm(
          'Aucune URL n’est renseignée. Le système utilisera la configuration par défaut (variables d’environnement ou http://localhost:3001).\n\nVoulez-vous vraiment effacer la valeur sauvegardée ?'
        )
      ) {
        return;
      }
    }

    setSavingBackendUrl(true);
    try {
      await userSettingsService.saveSettings<string>('scanner_backend_url', trimmed);
      setInitialBackendUrl(trimmed);
      // Pas besoin de recharger la page : scannerService lit directement dans localStorage
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l’URL du backend scanner :', error);
      alert(
        'Erreur lors de la sauvegarde de l’URL du backend scanner. Vérifiez la console pour plus de détails.'
      );
    } finally {
      setSavingBackendUrl(false);
    }
  };

  const handleTestBackendUrl = async () => {
    const trimmed = backendUrl.trim();
    if (!trimmed) {
      alert('Veuillez saisir une URL de serveur de scan avant de tester la connexion.');
      return;
    }
    setTestingBackendUrl(true);
    try {
      const base = trimmed.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setBackendReachable(true);
        alert('Connexion au serveur de scan réussie.');
      } else {
        setBackendReachable(false);
        alert(`Le serveur de scan a répondu avec le code HTTP ${res.status}.`);
      }
    } catch (error) {
      console.error('Erreur lors du test de l’URL du backend scanner :', error);
      setBackendReachable(false);
      alert('Impossible de joindre ce serveur de scan. Vérifiez l’adresse (ex: http://192.168.1.50:3001), le réseau et que le serveur est démarré.');
    } finally {
      setTestingBackendUrl(false);
    }
  };

  const handleAddScanner = async () => {
    if (!newScannerIP.trim()) {
      alert('Veuillez entrer une adresse IP');
      return;
    }

    // Valider le format IP
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(newScannerIP.trim())) {
      alert('Format d\'adresse IP invalide');
      return;
    }

    setAddingScanner(true);
    try {
      const newScanner = await scannerService.addScannerManually(newScannerIP.trim(), {
        name: newScannerName.trim() || undefined,
        manufacturer: newScannerManufacturer.trim() || undefined,
        model: newScannerModel.trim() || undefined
      });
      setScanners(prev => [...prev, newScanner]);
      setNewScannerIP('');
      setNewScannerName('');
      setNewScannerManufacturer('');
      setNewScannerModel('');
      setShowAddModal(false);
    } catch (error) {
      console.error('Erreur lors de l\'ajout:', error);
      alert('Erreur lors de l\'ajout du scanner: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setAddingScanner(false);
    }
  };

  const handleEditScanner = (scanner: Scanner) => {
    setEditingScanner(scanner);
    setNewScannerName(scanner.name);
    setNewScannerManufacturer(scanner.manufacturer);
    setNewScannerModel(scanner.model);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editingScanner) return;

    const updatedScanner: Scanner = {
      ...editingScanner,
      name: newScannerName.trim() || editingScanner.name,
      manufacturer: newScannerManufacturer.trim() || editingScanner.manufacturer,
      model: newScannerModel.trim() || editingScanner.model
    };

    // Mettre à jour dans localStorage
    const scanners = scannerService.getSavedScanners();
    const index = scanners.findIndex(s => s.id === editingScanner.id);
    if (index !== -1) {
      scanners[index] = updatedScanner;
      localStorage.setItem('scanners', JSON.stringify(scanners));
      setScanners(scanners);
    }

    setShowEditModal(false);
    setEditingScanner(null);
    setNewScannerName('');
    setNewScannerManufacturer('');
    setNewScannerModel('');
    if (selectedScanner?.id === editingScanner.id) {
      setSelectedScanner(updatedScanner);
    }
  };

  const handleGetDriverLinks = async (scanner: Scanner) => {
    setLoadingDriverLinks(true);
    setShowDriverLinksModal(true);
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${API_BASE_URL}/api/scanners/${scanner.id}/driver-links?manufacturer=${encodeURIComponent(scanner.manufacturer)}&model=${encodeURIComponent(scanner.model)}`
      );
      
      if (response.ok) {
        const links = await response.json();
        setDriverLinks(links);
      } else {
        // Fallback: générer les liens localement
        const manufacturer = scanner.manufacturer || 'Unknown';
        const model = scanner.model || scanner.name || 'Unknown';
        
        const links: any = {
          manufacturer: manufacturer,
          model: model,
          links: [],
          instructions: ''
        };
        
        // Générer des liens selon le fabricant
        const manufacturerLower = manufacturer.toLowerCase();
        if (manufacturerLower.includes('canon')) {
          links.links = [
            {
              type: 'Recherche Canon',
              url: `https://www.canon.fr/support?q=${encodeURIComponent(model)}`,
              description: 'Rechercher les pilotes sur le site Canon'
            },
            {
              type: 'Support Canon',
              url: 'https://www.canon.fr/support',
              description: 'Page principale du support Canon'
            }
          ];
          links.instructions = 'Recherchez "ScanGear" ou "Pilotes TWAIN" pour votre modèle';
        } else if (manufacturerLower.includes('hp')) {
          links.links = [
            {
              type: 'Support HP',
              url: `https://support.hp.com/drivers/${encodeURIComponent(model)}`,
              description: 'Télécharger les pilotes HP'
            },
            {
              type: 'Scanners HP',
              url: 'https://support.hp.com/drivers/scanners',
              description: 'Page des scanners HP'
            }
          ];
        } else if (manufacturerLower.includes('epson')) {
          links.links = [
            {
              type: 'Support Epson',
              url: `https://www.epson.fr/support?q=${encodeURIComponent(model)}`,
              description: 'Rechercher les pilotes Epson'
            },
            {
              type: 'Epson Scan',
              url: 'https://www.epson.fr/support/downloads',
              description: 'Téléchargements Epson'
            }
          ];
        } else {
          links.links = [
            {
              type: 'Recherche Google',
              url: `https://www.google.com/search?q=${encodeURIComponent(`${manufacturer} ${model} driver TWAIN download`)}`,
              description: 'Rechercher les pilotes sur Google'
            }
          ];
        }
        
        setDriverLinks(links);
      }
    } catch (error) {
      console.error('Erreur récupération liens:', error);
      alert('Erreur lors de la récupération des liens. Utilisez la recherche manuelle.');
    } finally {
      setLoadingDriverLinks(false);
    }
  };

  const handleDeleteScanner = async (scannerId: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ce scanner ?`)) {
      return;
    }

    try {
      const success = scannerService.removeScanner(scannerId);
      if (success) {
        setScanners(prev => prev.filter(s => s.id !== scannerId));
        if (selectedScanner?.id === scannerId) {
          setShowDetailsModal(false);
          setSelectedScanner(null);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Erreur lors de la suppression du scanner');
    }
  };

  const handleTestConnection = async (scannerId: string) => {
    setTestingConnection(scannerId);
    try {
      const isConnected = await scannerService.testScannerConnection(scannerId);
      const updatedStatus = await scannerService.checkScannerStatus(scannerId);
      
      // Mettre à jour le statut dans la liste
      setScanners(prev => prev.map(s => 
        s.id === scannerId ? { ...s, status: updatedStatus } : s
      ));
      
      if (selectedScanner?.id === scannerId) {
        setSelectedScanner(prev => prev ? { ...prev, status: updatedStatus } : null);
      }
      
      alert(isConnected ? 'Connexion réussie !' : 'Connexion échouée');
    } catch (error) {
      console.error('Erreur lors du test:', error);
      alert('Erreur lors du test de connexion');
    } finally {
      setTestingConnection(null);
    }
  };

  const handleViewDetails = (scanner: Scanner) => {
    setSelectedScanner(scanner);
    setShowDetailsModal(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />;
      case 'offline':
        return <FontAwesomeIcon icon={faTimesCircle} className="text-red-500" />;
      case 'busy':
        return <FontAwesomeIcon icon={faClock} className="text-yellow-500" />;
      default:
        return <FontAwesomeIcon icon={faTimesCircle} className="text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online':
        return 'En ligne';
      case 'offline':
        return 'Hors ligne';
      case 'busy':
        return 'Occupé';
      default:
        return 'Inconnu';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'network':
        return <FontAwesomeIcon icon={faWifi} className="text-blue-500" />;
      case 'usb':
        return <FontAwesomeIcon icon={faPlug} className="text-purple-500" />;
      case 'local':
        return <FontAwesomeIcon icon={faDesktop} className="text-gray-500" />;
      case 'sane':
        return <FontAwesomeIcon icon={faPrint} className="text-emerald-600" />;
      default:
        return <FontAwesomeIcon icon={faPrint} />;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'network':
        return 'Réseau';
      case 'usb':
        return 'USB';
      case 'local':
        return 'Local';
      case 'sane':
        return 'SANE';
      case 'twain':
        return 'WIA/TWAIN';
      case 'vendor-driver':
        return 'Pilote fabricant';
      default:
        return type;
    }
  };

  const filteredScanners = scanners.filter(scanner =>
    scanner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    scanner.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    scanner.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    scanner.ipAddress?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <FontAwesomeIcon icon={faSpinner} className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Gestion des Scanners</h2>
          <p className="text-gray-600 mt-1">
            Détecter et gérer les scanners connectés en réseau et configurer le serveur de scan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} className={refreshing ? 'animate-spin' : ''} />
            <span>Rafraîchir</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 transition-all shadow-lg flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faPlus} />
            <span>Ajouter un scanner</span>
          </button>
        </div>
      </div>

      {backendReachable === false && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
          <FontAwesomeIcon icon={faInfoCircle} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-900">Serveur de scan non démarré</p>
            <p className="text-sm text-amber-800 mt-1">
              Le serveur de scan (port 3001) ne répond pas. Les scanners ne peuvent pas être détectés tant que le serveur n’est pas lancé sur cette machine.
            </p>
            <p className="text-xs text-amber-700 mt-2">
              Démarrez le serveur avec : <code className="px-1.5 py-0.5 bg-amber-100 rounded">node server/server.js</code> (dans le dossier du projet), puis cliquez sur <strong>Rafraîchir</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Configuration de l’URL du backend scanner */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          URL du serveur de scan (backend)
        </h3>
        <p className="text-xs text-blue-800 mb-3">
          Cette URL pointe vers la machine où tourne le serveur de scan (PC Windows avec WIA, ou Linux/macOS avec SANE).
          Le serveur utilise WIA (Windows) ou SANE (Linux/macOS) et permet souvent de scanner <strong>sans pilote fabricant</strong>. Elle est stockée dans Firestore et utilisée par l’application en priorité.
        </p>
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <input
            type="text"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            placeholder="http://192.168.88.50:3001"
            className="flex-1 px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <button
            onClick={handleSaveBackendUrl}
            disabled={savingBackendUrl || backendUrl.trim() === initialBackendUrl.trim()}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingBackendUrl ? (
              <>
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSave} />
                <span>Enregistrer</span>
              </>
            )}
          </button>
          <button
            onClick={handleTestBackendUrl}
            disabled={testingBackendUrl || !backendUrl.trim()}
            className="px-4 py-2 bg-white text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testingBackendUrl ? (
              <>
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                <span>Test...</span>
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faPlug} />
                <span>Tester la connexion</span>
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-blue-700">
          Si ce champ est vide, l’application utilisera la variable d’environnement{' '}
          <code className="px-1 py-0.5 bg-blue-100 rounded">VITE_SCANNER_API_BASE_URL</code>, puis{' '}
          <code className="px-1 py-0.5 bg-blue-100 rounded">VITE_API_URL</code>, puis enfin{' '}
          <code className="px-1 py-0.5 bg-blue-100 rounded">http://localhost:3001</code>.
        </p>
      </div>

      {/* Méthode de détection / Pilote (SANE sur Mac, WIA sur Windows) */}
      <div className="mt-4 p-4 bg-sky-50 border border-sky-200 rounded-xl">
        <h3 className="text-sm font-semibold text-sky-900 mb-2 flex items-center gap-2">
          <FontAwesomeIcon icon={faSearch} className="text-sky-600" />
          Méthode de détection / Pilote
        </h3>
        {scannerServerConfig && (
          <p className="text-xs text-sky-800 mb-2">
            Machine du serveur de scan : <strong>{scannerServerConfig.platformLabel}</strong>
            {scannerServerConfig.recommendedApproach === 'sane' && (
              <> — sur Mac/Linux, le pilote recommandé est <strong>SANE</strong> (pas WIA, réservé à Windows).</>
            )}
            {scannerServerConfig.recommendedApproach === 'system' && (
              <> — sur Windows, le pilote recommandé est <strong>WIA</strong> (pilote système).</>
            )}
          </p>
        )}
        <p className="text-xs text-sky-800 mb-3">
          {scannerServerConfig && (scannerServerConfig.platform === 'darwin' || scannerServerConfig.platform === 'linux')
            ? 'Sur cette machine, la détection est forcée sur SANE (scanimage -L) pour garantir que tous les scanners détectés soient scannables.'
            : 'Choisissez la méthode utilisée pour détecter les scanners : WIA (Windows), réseau ou auto.'}
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-sky-800">Méthode :</label>
            <select
              value={detectionApproach}
              onChange={(e) => handleDetectionApproachChange(e.target.value as ScannerDetectionApproach)}
              disabled={savingDetectionApproach || (scannerServerConfig?.platform === 'darwin' || scannerServerConfig?.platform === 'linux')}
              className="px-3 py-2 border border-sky-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-sm bg-white min-w-[240px]"
            >
              <option value="auto">Auto (toutes les méthodes)</option>
              <option value="sane">SANE uniquement (Mac / Linux)</option>
              <option value="network">Réseau uniquement</option>
              <option value="system">Pilote système — WIA (Windows)</option>
            </select>
            {scannerServerConfig && (scannerServerConfig.platform === 'darwin' || scannerServerConfig.platform === 'linux') && (
              <span className="text-xs text-sky-700 font-semibold">SANE imposé sur cette machine</span>
            )}
            {scannerServerConfig?.recommendedApproach === detectionApproach && (
              <span className="text-xs text-sky-600 font-medium">Recommandé pour cette machine</span>
            )}
            {savingDetectionApproach && <FontAwesomeIcon icon={faSpinner} className="animate-spin text-sky-600" />}
          </div>
          {scannerServerConfig && (
            <label className="inline-flex items-center gap-2 text-xs text-sky-800">
              <input
                type="checkbox"
                className="rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                checked={detectionApproach === scannerServerConfig.recommendedApproach}
                onChange={(e) =>
                  handleDetectionApproachChange(
                    e.target.checked ? (scannerServerConfig.recommendedApproach as ScannerDetectionApproach) : 'auto'
                  )
                }
              />
              <span>
                {scannerServerConfig.recommendedApproach === 'sane'
                  ? 'Toujours utiliser SANE (recommandé sur cette machine)'
                  : 'Toujours utiliser le pilote système (WIA sur Windows)'}
              </span>
            </label>
          )}
        </div>
        <p className="text-[11px] text-sky-600 mt-2">
          <strong>SANE</strong> : pilote standard Mac/Linux (<code className="px-1 bg-sky-100 rounded">scanimage -L</code>). <strong>WIA</strong> : Windows uniquement. <strong>Réseau</strong> : scanners par IP. <strong>Auto</strong> : toutes les méthodes selon la plateforme.
        </p>
        <p className="text-[11px] text-sky-500 mt-1 italic">
          La détection peut varier selon l’état des périphériques et du réseau. Si la liste est incomplète ou incorrecte, utilisez <strong>Rafraîchir</strong> ou vérifiez la méthode choisie.
        </p>
      </div>

      {/* Scanner sans pilote fabricant (WIA / SANE), y compris Wi‑Fi */}
      <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <h3 className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-2">
          <FontAwesomeIcon icon={faInfoCircle} className="text-emerald-600" />
          Scanner sans pilote fabricant (USB ou Wi‑Fi)
        </h3>
        <p className="text-xs text-emerald-800 mb-2">
          L’application peut utiliser votre scanner (USB ou <strong>Wi‑Fi / réseau</strong>) <strong>sans installer les pilotes du fabricant</strong>, via les APIs système suivantes :
        </p>
        <ul className="text-xs text-emerald-800 space-y-1 list-disc list-inside mb-2">
          <li><strong>Windows :</strong> WIA — ajoutez le scanner Wi‑Fi dans Paramètres &gt; Périphériques &gt; Imprimantes et scanners ; le pilote Windows suffit souvent.</li>
          <li><strong>Linux :</strong> SANE (<code className="px-1 bg-emerald-100 rounded">sane-backends</code>) — open source ; scanners réseau : ajout par IP, backend <code className="px-1 bg-emerald-100 rounded">net</code>.</li>
          <li><strong>macOS :</strong> SANE (via Homebrew) ou outils système ; scanners Wi‑Fi : ajout par adresse IP.</li>
        </ul>
        <p className="text-[11px] text-emerald-700 mb-3">
          Connectez le scanner (USB ou Wi‑Fi sur le même réseau), assurez-vous qu’il est reconnu par Windows (Périphériques et imprimantes) ou par SANE sur Linux/macOS, puis <strong>Rafraîchir</strong> ou <strong>Ajouter un scanner</strong> (par IP pour un scanner Wi‑Fi sous Linux/macOS). Détails : <code className="px-1 bg-emerald-100 rounded">server/SCAN_SANS_PILOTE_FABRICANT.md</code>.
        </p>
        <label className="flex items-center gap-2 cursor-pointer text-emerald-800 text-sm font-medium">
          <input
            type="checkbox"
            checked={preferSystemDriver}
            onChange={(e) => handleTogglePreferSystemDriver(e.target.checked)}
            disabled={savingPreferSystemDriver}
            className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>Privilégier pilote système (WIA/SANE) sans pilote fabricant</span>
          {savingPreferSystemDriver && <FontAwesomeIcon icon={faSpinner} className="animate-spin text-emerald-600" />}
        </label>
        <p className="text-[11px] text-emerald-600 mt-1">
          Sous Windows, n’afficher que les scanners détectés via WIA ; sous Linux/macOS, détection inchangée (SANE + réseau). Pour une gestion centralisée, utilisez le menu déroulant « Approche de détection » ci‑dessus.
        </p>
      </div>

      {/* Paramètres de scan (format, type, compression) */}
      <div className="mt-4 p-4 bg-violet-50 border border-violet-200 rounded-xl">
        <h3 className="text-sm font-semibold text-violet-900 mb-3 flex items-center gap-2">
          <FontAwesomeIcon icon={faPrint} className="text-violet-600" />
          Paramètres de scan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-violet-800 mb-1">Format de sortie</label>
            <select
              value={scanSettings.format}
              onChange={(e) => handleScanSettingsChange({ format: e.target.value as ScanFormat })}
              className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-500 text-sm"
            >
              <option value="PDF">PDF</option>
              <option value="JPEG">JPEG</option>
              <option value="PNG">PNG</option>
              <option value="TIFF">TIFF</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-violet-800 mb-1">Source de scan</label>
            <select
              value={scanSettings.scanSource}
              onChange={(e) => handleScanSettingsChange({ scanSource: e.target.value as ScanSource })}
              className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-500 text-sm"
            >
              <option value="vitre">Vitre (plateau)</option>
              <option value="bac">Bac (chargeur / ADF)</option>
            </select>
            <p className="text-[11px] text-violet-600 mt-1">
              Vitre = plateau vitré ; Bac = chargeur automatique (ADF). {scanSettings.scanSource === 'bac' && 'Placez les documents dans le chargeur en haut de l’imprimante.'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-violet-800 mb-1">Taille du document</label>
            <select
              value={scanSettings.pageSize ?? 'A4'}
              onChange={(e) => handleScanSettingsChange({ pageSize: e.target.value as ScanPageSize })}
              className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-500 text-sm"
            >
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
              <option value="Auto">Auto</option>
            </select>
            <p className="text-[11px] text-violet-600 mt-1">Utilisée pour le chargeur ADF.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-violet-800 mb-1">Orientation de sortie</label>
            <select
              value={scanSettings.orientation ?? 'auto'}
              onChange={(e) => handleScanSettingsChange({ orientation: e.target.value as ScanOrientation })}
              className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-500 text-sm"
            >
              <option value="auto">Automatique (inchangé)</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Paysage</option>
            </select>
            <p className="text-[11px] text-violet-600 mt-1">Appliquée côté serveur après le scan.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-violet-800 mb-1">Taille de l'image dans le document</label>
            <select
              value={scanSettings.imageScaleMode ?? 'fill-page'}
              onChange={(e) => handleScanSettingsChange({ imageScaleMode: e.target.value as ScanImageScaleMode })}
              className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-500 text-sm"
            >
              <option value="fill-page">Remplir toute la page (sans marge)</option>
              <option value="fill-width">Remplir la largeur</option>
              <option value="fill-height">Remplir la hauteur</option>
              <option value="fit">Contenir (avec marges si besoin)</option>
            </select>
            <p className="text-[11px] text-violet-600 mt-1">Comment l'image scannée est mise à l'échelle sur la page.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-violet-800 mb-2">Type de scan</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-violet-800 text-sm">
                <input
                  type="radio"
                  name="scanType"
                  checked={scanSettings.scanType === 'single'}
                  onChange={() => handleScanSettingsChange({ scanType: 'single' as ScanType })}
                  className="text-violet-600 focus:ring-violet-500"
                />
                <span>Unique (une page)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-violet-800 text-sm">
                <input
                  type="radio"
                  name="scanType"
                  checked={scanSettings.scanType === 'multiple'}
                  onChange={() => handleScanSettingsChange({ scanType: 'multiple' as ScanType })}
                  className="text-violet-600 focus:ring-violet-500"
                />
                <span>Multiple (plusieurs pages)</span>
              </label>
            </div>
            <p className="text-[11px] text-violet-600 mt-1">Multiple : scannez plusieurs pages puis fusionnez en un fichier.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-violet-800 mb-1">Résolution (ppp)</label>
            <select
              value={scanSettings.resolution ?? 300}
              onChange={(e) => handleScanSettingsChange({ resolution: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-500 text-sm"
            >
              <option value={150}>150</option>
              <option value={200}>200</option>
              <option value={300}>300</option>
              <option value={400}>400</option>
              <option value={600}>600</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-violet-800 mb-1">Couleur</label>
            <select
              value={scanSettings.color === false ? '0' : '1'}
              onChange={(e) => handleScanSettingsChange({ color: e.target.value === '1' })}
              className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:ring-2 focus:ring-violet-500 text-sm"
            >
              <option value="1">Couleur</option>
              <option value="0">Niveaux de gris</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-medium text-violet-800 mb-2">Taille du fichier</p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-violet-800 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={scanSettings.compress}
                  onChange={(e) => handleScanSettingsChange({ compress: e.target.checked })}
                  className="rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                />
                <span>Compresser les fichiers scannés (images et PDF)</span>
              </label>
              {scanSettings.compress && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-violet-800">Taille max. du fichier (Ko) :</label>
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={scanSettings.compressionLimitKb}
                    onChange={(e) => handleScanSettingsChange({ compressionLimitKb: Math.max(50, Math.min(5000, Number(e.target.value) || 500)) })}
                    className="w-24 px-2 py-1 border border-violet-300 rounded text-sm"
                  />
                  <span className="text-[11px] text-violet-600">50–5000 Ko</span>
                </div>
              )}
              {savingScanSettings && <FontAwesomeIcon icon={faSpinner} className="animate-spin text-violet-600" />}
            </div>
            <p className="text-[11px] text-violet-600 mt-1">Limite la taille des fichiers après compression.</p>
          </div>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <FontAwesomeIcon 
          icon={faSearch} 
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="Rechercher un scanner..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Liste des scanners */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredScanners.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <FontAwesomeIcon icon={faPrint} className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">Aucun scanner trouvé</p>
            <p className="text-gray-400 text-sm mt-2">
              {searchTerm ? 'Essayez une autre recherche' : 'Cliquez sur "Ajouter un scanner" pour en ajouter un'}
            </p>
          </div>
        ) : (
          filteredScanners.map((scanner) => (
            <div
              key={scanner.id}
              onClick={() => handleViewDetails(scanner)}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getTypeIcon(scanner.type)}
                  <div>
                    <h3 className="font-semibold text-gray-800">{scanner.name}</h3>
                    <p className="text-sm text-gray-500">{scanner.manufacturer} - {scanner.model}</p>
                  </div>
                </div>
                {getStatusIcon(scanner.status)}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Type:</span>
                  <span className="font-medium text-gray-700">{getTypeText(scanner.type)}</span>
                </div>
                {scanner.ipAddress && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">IP:</span>
                    <span className="font-medium text-gray-700">{scanner.ipAddress}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Statut:</span>
                  <span className={`font-medium ${
                    scanner.status === 'online' ? 'text-green-600' :
                    scanner.status === 'offline' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {getStatusText(scanner.status)}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGetDriverLinks(scanner);
                  }}
                  className="px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                  title="Télécharger les pilotes"
                >
                  <FontAwesomeIcon icon={faDownload} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTestConnection(scanner.id);
                  }}
                  disabled={testingConnection === scanner.id}
                  className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testingConnection === scanner.id ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      <span>Test...</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faPlug} />
                      <span>Tester</span>
                    </>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteScanner(scanner.id);
                  }}
                  className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                  title="Supprimer"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal d'ajout */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Ajouter un scanner réseau</h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewScannerIP('');
                  }}
                  className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse IP du scanner <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newScannerIP}
                  onChange={(e) => setNewScannerIP(e.target.value)}
                  placeholder="192.168.1.100"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Entrez l'adresse IP du scanner réseau (Wi‑Fi) à ajouter
                </p>
                <p className="text-xs text-amber-700 mt-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  <strong>Windows :</strong> pour lancer un scan, ajoutez aussi ce scanner dans <strong>Paramètres &gt; Périphériques &gt; Imprimantes et scanners</strong>, puis rafraîchissez la liste.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du scanner
                </label>
                <input
                  type="text"
                  value={newScannerName}
                  onChange={(e) => setNewScannerName(e.target.value)}
                  placeholder="Scanner Bureau Principal"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Nom personnalisé pour identifier le scanner
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fabricant
                  </label>
                  <input
                    type="text"
                    value={newScannerManufacturer}
                    onChange={(e) => setNewScannerManufacturer(e.target.value)}
                    placeholder="HP, Canon, Epson..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modèle
                  </label>
                  <input
                    type="text"
                    value={newScannerModel}
                    onChange={(e) => setNewScannerModel(e.target.value)}
                    placeholder="LaserJet Pro, PIXMA..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewScannerIP('');
                  setNewScannerName('');
                  setNewScannerManufacturer('');
                  setNewScannerModel('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleAddScanner}
                disabled={addingScanner || !newScannerIP.trim()}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {addingScanner ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                    <span>Ajout...</span>
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faPlus} />
                    <span>Ajouter</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de détails */}
      {showDetailsModal && selectedScanner && createPortal(
        <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-blue-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getTypeIcon(selectedScanner.type)}
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{selectedScanner.name}</h3>
                    <p className="text-sm text-gray-600">{selectedScanner.manufacturer} - {selectedScanner.model}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedScanner(null);
                  }}
                  className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Informations générales */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-3">Informations générales</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-500">Type</span>
                    <p className="font-medium text-gray-800">{getTypeText(selectedScanner.type)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Statut</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(selectedScanner.status)}
                      <p className="font-medium text-gray-800">{getStatusText(selectedScanner.status)}</p>
                    </div>
                  </div>
                  {selectedScanner.ipAddress && (
                    <div className="col-span-2">
                      <span className="text-sm text-gray-500">Adresse IP</span>
                      <p className="font-medium text-gray-800">{selectedScanner.ipAddress}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Capacités */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-3">Capacités</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-500">Couleur</span>
                    <p className="font-medium text-gray-800">
                      {selectedScanner.capabilities.color ? 'Oui' : 'Non'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Recto-verso</span>
                    <p className="font-medium text-gray-800">
                      {selectedScanner.capabilities.duplex ? 'Oui' : 'Non'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Résolutions</span>
                    <p className="font-medium text-gray-800">
                      {selectedScanner.capabilities.resolution.join(', ')} DPI
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Formats</span>
                    <p className="font-medium text-gray-800">
                      {selectedScanner.capabilities.formats.join(', ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleGetDriverLinks(selectedScanner)}
                  className="px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium flex items-center gap-2"
                  title="Télécharger les pilotes"
                >
                  <FontAwesomeIcon icon={faDownload} />
                  <span>Pilotes</span>
                </button>
                <button
                  onClick={() => handleEditScanner(selectedScanner)}
                  className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faEdit} />
                  <span>Modifier</span>
                </button>
                <button
                  onClick={() => handleTestConnection(selectedScanner.id)}
                  disabled={testingConnection === selectedScanner.id}
                  className="flex-1 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testingConnection === selectedScanner.id ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      <span>Test en cours...</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faPlug} />
                      <span>Tester la connexion</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleDeleteScanner(selectedScanner.id)}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faTrash} />
                  <span>Supprimer</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal d'édition */}
      {showEditModal && editingScanner && createPortal(
        <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Modifier le scanner</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingScanner(null);
                    setNewScannerName('');
                    setNewScannerManufacturer('');
                    setNewScannerModel('');
                  }}
                  className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du scanner
                </label>
                <input
                  type="text"
                  value={newScannerName}
                  onChange={(e) => setNewScannerName(e.target.value)}
                  placeholder="Scanner Bureau Principal"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fabricant
                  </label>
                  <input
                    type="text"
                    value={newScannerManufacturer}
                    onChange={(e) => setNewScannerManufacturer(e.target.value)}
                    placeholder="HP, Canon, Epson..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modèle
                  </label>
                  <input
                    type="text"
                    value={newScannerModel}
                    onChange={(e) => setNewScannerModel(e.target.value)}
                    placeholder="LaserJet Pro, PIXMA..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              {editingScanner.ipAddress && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Adresse IP</p>
                  <p className="text-sm font-medium text-gray-700">{editingScanner.ipAddress}</p>
                  <p className="text-xs text-gray-400 mt-1">L'adresse IP ne peut pas être modifiée</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingScanner(null);
                  setNewScannerName('');
                  setNewScannerManufacturer('');
                  setNewScannerModel('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 transition-all flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faSave} />
                <span>Enregistrer</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal liens pilotes */}
      {showDriverLinksModal && createPortal(
        <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Télécharger les Pilotes</h3>
                  {driverLinks && (
                    <p className="text-sm text-gray-600 mt-1">
                      {driverLinks.manufacturer} {driverLinks.model}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowDriverLinksModal(false);
                    setDriverLinks(null);
                  }}
                  className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {loadingDriverLinks ? (
                <div className="flex items-center justify-center py-12">
                  <FontAwesomeIcon icon={faSpinner} className="w-8 h-8 text-indigo-600 animate-spin" />
                  <span className="ml-3 text-gray-600">Chargement des liens...</span>
                </div>
              ) : driverLinks ? (
                <div className="space-y-4">
                  {driverLinks.instructions && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-blue-800 whitespace-pre-line">{driverLinks.instructions}</p>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    {driverLinks.links.map((link: any, index: number) => (
                      <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block p-4 border rounded-lg hover:shadow-md transition-all ${
                          link.priority 
                            ? 'border-green-300 bg-green-50 hover:bg-green-100' 
                            : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-gray-800">{link.type}</h4>
                              {link.priority && (
                                <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                                  Recommandé
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{link.description}</p>
                            <p className="text-xs text-gray-400 mt-1 break-all">{link.url}</p>
                          </div>
                          <FontAwesomeIcon 
                            icon={faExternalLinkAlt} 
                            className="w-5 h-5 text-gray-400 ml-4"
                          />
                        </div>
                      </a>
                    ))}
                  </div>
                  
                  <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>Note :</strong> Recherchez "TWAIN" ou "ScanGear" (pour Canon) dans les téléchargements disponibles.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">Aucun lien disponible</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end">
              <button
                onClick={() => {
                  setShowDriverLinksModal(false);
                  setDriverLinks(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GestionScanners;

