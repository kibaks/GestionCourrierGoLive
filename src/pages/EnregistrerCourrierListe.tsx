import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formulaireCourrierService, ExtraFieldConfig, ExtraFieldsBySensAndType } from '../services/formulaireCourrierService';
import { courrierService } from '../services/courrierService';
import { categorieCourrierService } from '../services/categorieCourrierService';
import { classifyByObjet, getDefaultCategoryIndex, resolveDefaultFolderId } from '../services/courrierClassificationService';
import { categorieFichierService } from '../services/categorieFichierService';
import { laravelApiService, getAuthToken } from '../services/laravelApiService';
import { directionService } from '../services/directionService';
import { entiteOrganisationnelleService } from '../services/entiteOrganisationnelleService';
import { entiteTypeService } from '../services/entiteTypeService';
import { scannerService, checkScannerBackendHealth, Scanner, DEFAULT_SCAN_SETTINGS, type ScanSettings, type ScanFormat, type ScanPageSize } from '../services/scannerService';
import { TypeCourrier, Priorite, SensCourrier, CategorieCourrier, Role, EntiteOrganisationnelle, StatutCourrier, Courrier } from '../types';
import { MaterialDateTimeField } from '../components/MaterialDateTimeField';
import MaterialInput from '../components/MaterialInput';
import CustomDialog, { DialogOptions } from '../components/CustomDialog';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faSave, faArrowLeft, faCheckCircle, faTimesCircle, faSpinner, faListAlt, faInfoCircle, faCopy, faChevronDown, faChevronUp, faChevronRight, faBuilding, faCheck, faFolder, faFolderOpen, faFolderPlus, faEllipsisV, faPen, faArrowsAlt, faTimes, faUpload, faPrint, faEye, faExclamationTriangle, faFilePdf, faFile, faExpand, faLink, faRotateLeft, faRotateRight, faMagnifyingGlassMinus, faMagnifyingGlassPlus, faDownload, faTasks, faEdit } from '@fortawesome/free-solid-svg-icons';

interface RowData {
  id: string; sens: SensCourrier; type: TypeCourrier; dateReception: string;
  expediteur: string; destinataire: string; objet: string;
  direction: string; service: string;
  folderId: string; referenceExterne: string;
  extraFields: Record<string, string>;
  entiteEmetteur: Record<string, string>;
  entiteDestinataire: Record<string, string>;
  files?: File[];
}
type RowStatus = 'idle' | 'saving' | 'saved' | 'error';
type RowError = Record<string, string>;

const uid = () => Math.random().toString(36).slice(2);
// Champs qui existent directement dans RowData (pas dans extraFields)
const DIRECT_ROW_KEYS = new Set(['dateReception', 'objet', 'expediteur', 'destinataire', 'referenceExterne']);

interface RowDefaults {
  sens?: SensCourrier;
  type?: TypeCourrier;
  direction?: string;
  service?: string;
  expediteur?: string;
  destinataire?: string;
}

const makeRow = (defaults: RowDefaults = {}): RowData => ({
  id: uid(),
  sens: defaults.sens ?? SensCourrier.ENTRANT,
  type: defaults.type ?? TypeCourrier.EXTERNE,
  dateReception: new Date().toISOString().split('T')[0],
  expediteur: defaults.expediteur ?? '',
  destinataire: defaults.destinataire ?? '',
  objet: '',
  direction: defaults.direction ?? '',
  service: defaults.service ?? '',
  folderId: '',
  referenceExterne: '',
  extraFields: {},
  entiteEmetteur: {},
  entiteDestinataire: {},
});
const validate = (r: RowData, cols: ExtraFieldConfig[]): RowError => {
  const e: RowError = {};
  cols.forEach(col => {
    if (!col.required) return;
    const val = DIRECT_ROW_KEYS.has(col.name)
      ? String(r[col.name as keyof RowData] ?? '')
      : r.extraFields[col.name] ?? '';
    if (!val.trim()) e[col.name] = 'Requis';
  });
  return e;
};
const inp = (err?: string) => `w-full px-2.5 py-1.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 disabled:bg-surface-50 disabled:text-surface-500 ${err ? 'border-red-400 bg-red-50/60' : 'border-surface-200 bg-white hover:border-surface-300'}`;
const sel = 'w-full px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 hover:border-surface-300 disabled:bg-surface-50 disabled:text-surface-500';

const EnregistrerCourrierListe: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Lire les préférences depuis l'URL et le profil utilisateur
  const urlSens = searchParams.get('sens') as SensCourrier | null;
  const urlType = searchParams.get('type') as TypeCourrier | null;
  const initSens = urlSens && Object.values(SensCourrier).includes(urlSens) ? urlSens : SensCourrier.ENTRANT;
  const initType = urlType && Object.values(TypeCourrier).includes(urlType) ? urlType : TypeCourrier.EXTERNE;

  const normDir = (d?: string) => (d || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

  const isDirectionGenerale = (dir?: string): boolean => {
    const n = normDir(dir);
    return !n || n.includes('general') || n.includes('generale') || n === 'dg';
  };

  // Déduire les valeurs par défaut depuis le rôle et la direction de l'utilisateur
  const getDefaults = (forSens: SensCourrier = initSens, forType: TypeCourrier = initType): RowDefaults => {
    const defaults: RowDefaults = {
      sens: forSens,
      type: forType,
      direction: user?.direction ?? '',
      service: user?.service ?? '',
    };

    const userDirection = user?.direction || '';
    const isSecDG = user?.role === Role.SECRETAIRE && isDirectionGenerale(userDirection);
    const fallbackEntity = userDirection || 'Direction Générale';

    // Pour les courriers externes, les deux champs (expéditeur et destinataire) sont requis côté API.
    // Le champ visible est celui que l'utilisateur remplit ; l'autre champ est pré-rempli automatiquement.
    if (forType === TypeCourrier.EXTERNE) {
      if (forSens === SensCourrier.ENTRANT) {
        defaults.expediteur = '';
        defaults.destinataire = fallbackEntity;
      } else {
        defaults.expediteur = fallbackEntity;
        defaults.destinataire = '';
      }
    } else if (isSecDG) {
      // Secrétaire du DG
      if (forSens === SensCourrier.ENTRANT) {
        defaults.destinataire = 'Direction Générale';
      } else {
        defaults.expediteur = 'Direction Générale';
      }
    } else if (user?.role === Role.SECRETAIRE) {
      // Secrétaire d'une direction X
      if (forSens === SensCourrier.ENTRANT) {
        defaults.destinataire = userDirection;
      } else {
        defaults.expediteur = userDirection;
      }
    } else if (user?.role === Role.DIRECTEUR) {
      // Directeur d'une direction X
      if (forSens === SensCourrier.ENTRANT) {
        defaults.destinataire = 'Direction Générale';
      } else {
        defaults.expediteur = userDirection;
        defaults.destinataire = 'Direction Générale';
      }
    } else if (user?.role === Role.DIRECTEUR_GENERAL) {
      if (forSens === SensCourrier.ENTRANT) {
        defaults.destinataire = fallbackEntity;
      } else {
        defaults.expediteur = fallbackEntity;
      }
    } else if (user?.direction) {
      // Autres rôles avec direction (chef service, agent...)
      if (forSens === SensCourrier.ENTRANT) {
        defaults.destinataire = userDirection;
      } else {
        defaults.expediteur = userDirection;
      }
    }
    return defaults;
  };

  const [rows, setRows] = useState<RowData[]>(() => { const d = getDefaults(); return [makeRow(d), makeRow(d)]; });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const userDefaultsApplied = useRef(false);
  const toggleExpand = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [errors, setErrors] = useState<Record<string, RowError>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [directions, setDirections] = useState<{ id: string; nom: string }[]>([]);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [folders, setFolders] = useState<CategorieCourrier[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [draggedOverFolderId, setDraggedOverFolderId] = useState<string | null>(null);
  // État pour la gestion des catégories
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [inlineAddParentId, setInlineAddParentId] = useState<string | null>(null);
  const [inlineAddName, setInlineAddName] = useState('');
  const [inlineAddRoot, setInlineAddRoot] = useState(false);
  const [dialog, setDialog] = useState({ isOpen: false, options: { message: '' } as DialogOptions });
  
  // États pour la gestion des fichiers et du scanner
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ phase: 'idle' | 'uploading' | 'done'; total: number; current: number; currentFileName: string | null; failed: Array<{ fileName: string; error: string }>; succeeded: number } | null>(null);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [importLimits, setImportLimits] = useState({ maxSizeMo: 100, compressImages: true });
  const [addFileModalDraggingOver, setAddFileModalDraggingOver] = useState(false);
  const [processingFiles, setProcessingFiles] = useState(false);
  
  // États pour le scanner
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>('');
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [scanning, setScanning] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanModalPreviewUrl, setScanModalPreviewUrl] = useState<string | null>(null);
  const [scanModalPreviewFile, setScanModalPreviewFile] = useState<File | null>(null);
  const [scanModalPreviewId, setScanModalPreviewId] = useState<string | null>(null);
  const [scanModalError, setScanModalError] = useState<string | null>(null);
  const [scanModalTarget, setScanModalTarget] = useState<{ rowId: string } | null>(null);
  const [scannersLoading, setScannersLoading] = useState(false);
  const [scanBackendStatus, setScanBackendStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [showScanPopout, setShowScanPopout] = useState(false);
  const [showPreviewPopout, setShowPreviewPopout] = useState(false);
  const [filePreviewZoom, setFilePreviewZoom] = useState(1);
  const [filePreviewRotation, setFilePreviewRotation] = useState<0 | 90 | 180 | 270>(0);
  const [filePreviewFit, setFilePreviewFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [imagePreviewZoom, setImagePreviewZoom] = useState(1);
  const [imagePreviewRotation, setImagePreviewRotation] = useState<0 | 90 | 180 | 270>(0);
  const [imagePreviewFit, setImagePreviewFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [imagePreviewSize, setImagePreviewSize] = useState<{ w: number; h: number } | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const addFileBrowseInputRef = useRef<HTMLInputElement>(null);

  // États pour la prévisualisation des fichiers
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [entities, setEntities] = useState<EntiteOrganisationnelle[]>(() =>
    entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false)
  );
  const filterLevels = entiteTypeService.getActiveTypesForFilters();

  // Sens/type actifs (contrôlent les colonnes dynamiques)
  const [activeSens, setActiveSens] = useState<SensCourrier>(initSens);
  const [activeType, setActiveType] = useState<TypeCourrier>(initType);

  // Config formulaire + colonnes dynamiques extraites
  const [formConfig, setFormConfig] = useState<ExtraFieldsBySensAndType | null>(null);
  const [extraColumns, setExtraColumns] = useState<ExtraFieldConfig[]>([]);

  const allowed = user && [Role.SECRETAIRE, Role.SUPER_ADMIN, Role.DIRECTEUR_GENERAL].includes(user.role);

  // Champs structurels gérés par des colonnes fixes dédiées — ne pas les dupliquer
  const FIXED_FIELDS = new Set(['sens', 'type', 'direction', 'service', 'sousService', 'priorite', 'folderId']);
  // Tous les types utilisables inline (exclure uniquement 'file')
  const INLINE_TYPES = new Set(['text', 'email', 'number', 'phone', 'url', 'date', 'datetime', 'select', 'radio', 'checkbox', 'slider', 'urgency', 'textarea']);
  // Champs essentiels à afficher dans le tableau (le reste va dans l'expandable)
  const ESSENTIAL_TABLE_FIELDS = new Set(['expediteur', 'destinataire', 'objet', 'referenceExterne']);

  useEffect(() => {
    setDirections(directionService.getAllDirections());
    setAllServices(directionService.getAllServices() as any[]);
    entiteOrganisationnelleService.refreshFromApi?.()
      .then(() => setEntities(entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.id) {
      // Charger depuis localStorage instantanément, sync API en arrière-plan
      categorieCourrierService.getCategoriesAndMapForUser(user.id).then(({ folders: f }) => {
        const deletedIds = categorieCourrierService.loadDeletedIds(user.id);
        setFolders(f.filter(folder => !deletedIds.has(folder.id)));
      }).catch(() => {});
    }
  }, [user?.id]);

  // Charger la config formulaire (même source que l'étape 2 de EnregistrerCourrier)
  useEffect(() => {
    formulaireCourrierService.getConfigAsync().then(cfg => setFormConfig(cfg)).catch(() => {});
  }, []);

  // Charger les scanners au démarrage
  useEffect(() => {
    loadScanners();
  }, []);

  // Extraire les champs dynamiques sauf priorité
  useEffect(() => {
    if (!formConfig) return;
    const sections = formConfig[activeSens]?.[activeType] ?? [];
    const seen = new Set<string>();
    const cols: ExtraFieldConfig[] = [];
    sections.forEach(section => {
      section.columns?.forEach(col => {
        col.fields?.forEach(field => {
          const isPriority = field.name?.toLowerCase().includes('priorit') || 
                            field.label?.toLowerCase().includes('priorit');
          if (
            field.name &&
            !FIXED_FIELDS.has(field.name) &&
            !seen.has(field.name) &&
            INLINE_TYPES.has(field.type ?? 'text') &&
            field.showInTable !== false &&
            !isPriority
          ) {
            seen.add(field.name);
            cols.push(field);
          }
        });
      });
    });
    setExtraColumns(cols);
  }, [formConfig, activeSens, activeType]);

  // Une fois l'utilisateur chargé, appliquer les valeurs par défaut sensibles au rôle
  // (sinon les lignes créées au premier rendu ont expéditeur/destinataire vides)
  useEffect(() => {
    if (user && !userDefaultsApplied.current) {
      userDefaultsApplied.current = true;
      const d = getDefaults(activeSens, activeType);
      setRows(prev => prev.map(r => {
        if (status[r.id] === 'saved') return r;
        const base = makeRow(d);
        return {
          ...base,
          id: r.id,
          dateReception: r.dateReception || base.dateReception,
          objet: r.objet || base.objet,
          expediteur: r.expediteur || base.expediteur,
          destinataire: r.destinataire || base.destinataire,
          extraFields: r.extraFields,
          folderId: r.folderId,
          referenceExterne: r.referenceExterne,
          files: r.files,
        };
      }));
    }
  }, [user]);

  // Synchroniser les lignes non sauvegardées avec les options globales Sens/Type
  useEffect(() => {
    setRows(prev => prev.map(r => {
      // Ne pas modifier les lignes déjà sauvegardées (vérification via closure sur status)
      if (r.sens === activeSens && r.type === activeType) return r;
      // Mettre à jour le sens et type pour correspondre aux options globales
      // Ré-appliquer les valeurs par défaut de l'expéditeur/destinataire pour éviter un champ requis caché vide
      const defaults = getDefaults(activeSens, activeType);
      return {
        ...r,
        sens: activeSens,
        type: activeType,
        ...(defaults.expediteur !== undefined ? { expediteur: defaults.expediteur } : {}),
        ...(defaults.destinataire !== undefined ? { destinataire: defaults.destinataire } : {}),
      };
    }));
  }, [activeSens, activeType]);

  const upd = useCallback((id: string, f: keyof RowData, v: string) => {
    setRows(p => p.map(r => r.id !== id ? r : { ...r, [f]: v, ...(f === 'direction' ? { service: '' } : {}) }));
    setErrors(p => { const e = { ...p[id] }; delete (e as any)[f]; return { ...p, [id]: e }; });
    setStatus(p => ({ ...p, [id]: 'idle' }));
  }, []);

  const updExtra = useCallback((id: string, fieldName: string, value: string) => {
    setRows(p => p.map(r => r.id !== id ? r : { ...r, extraFields: { ...r.extraFields, [fieldName]: value } }));
    setErrors(p => { const e = { ...p[id] }; delete (e as any)[fieldName]; return { ...p, [id]: e }; });
    setStatus(p => ({ ...p, [id]: 'idle' }));
  }, []);

  // Fonctions pour la gestion des fichiers
  const openAddFileModal = (rowId: string) => {
    setSelectedRowId(rowId);
    setSelectedFiles([]);
    setUploadProgress(null);
    setShowAddFileModal(true);
    if (laravelApiService.isConfigured()) {
      laravelApiService.getImportFichiersLimits().then(setImportLimits).catch(() => {
        setImportLimits({ maxSizeMo: 100, compressImages: true });
      });
    }
  };

  const closeAddFileModal = () => {
    setShowAddFileModal(false);
    setSelectedRowId(null);
    setSelectedFiles([]);
    setUploadProgress(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleModalFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAddFileModalDraggingOver(false);
    let files: File[] = [];
    if (e.dataTransfer.files) {
      files = Array.from(e.dataTransfer.files);
    } else if (e.dataTransfer.items) {
      const list: File[] = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === 'file') {
          try {
            const f = e.dataTransfer.items[i].getAsFile();
            if (f) list.push(f);
          } catch {
            /* ignorer */
          }
        }
      }
      files = list;
    }
    if (files.length === 0) return;
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const confirmAddFiles = () => {
    if (!selectedRowId || selectedFiles.length === 0) return;
    
    setRows(prev => prev.map(r => {
      if (r.id === selectedRowId) {
        return { ...r, files: [...(r.files || []), ...selectedFiles] };
      }
      return r;
    }));
    
    closeAddFileModal();
  };

  // Fonctions pour le scanner
  const handleScanSettingsChange = async (next: Partial<ScanSettings>) => {
    setScanSettings(prev => ({ ...prev, ...next }));
  };

  const closeScanModal = useCallback(() => {
    if (scanModalPreviewUrl) URL.revokeObjectURL(scanModalPreviewUrl);
    setScanModalPreviewUrl(null);
    setScanModalPreviewFile(null);
    setScanModalPreviewId(null);
    setScanModalError(null);
    setScanModalTarget(null);
    setScanBackendStatus('idle');
    setShowScanModal(false);
  }, [scanModalPreviewUrl]);

  useEffect(() => {
    if (!showScanModal) return;
    setScanBackendStatus('checking');
    const saved = scannerService.getSavedScanners();
    if (saved.length > 0) {
      setScanners(saved);
      if (!selectedScanner) setSelectedScanner(saved[0].id);
    }
    setScannersLoading(true);
    checkScannerBackendHealth()
      .then(ok => setScanBackendStatus(ok ? 'ok' : 'error'))
      .catch(() => setScanBackendStatus('error'));
    (async () => {
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
    })();
  }, [showScanModal]);

  const refreshScannersInModal = useCallback(async () => {
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
  }, []);

  const handleScanInModal = async () => {
    setScanModalError(null);
    if (scanBackendStatus === 'error') {
      setScanModalError('Le serveur de scan ne répond pas. Démarrez-le puis fermez et rouvrez ce modal.');
      return;
    }
    if (scanners.length === 0) {
      setScanModalError('Aucun scanner détecté. Allez dans Paramètres > Gestion des scanners.');
      return;
    }
    const scannerId = selectedScanner || scanners[0]?.id;
    if (!scannerId) { setScanModalError('Sélectionnez un scanner.'); return; }
    if (scanModalPreviewUrl) { URL.revokeObjectURL(scanModalPreviewUrl); setScanModalPreviewUrl(null); }
    setScanModalPreviewFile(null);
    const controller = new AbortController();
    scanAbortControllerRef.current = controller;
    setScanning(true);
    try {
      const opts = {
        resolution: scanSettings.resolution ?? 300,
        color: scanSettings.color !== false,
        format: scanSettings.format,
        scanSource: (scanSettings.scanSource ?? 'vitre') as 'vitre' | 'bac',
        pageSize: scanSettings.pageSize ?? 'A4',
        orientation: scanSettings.orientation ?? 'auto',
        imageScaleMode: scanSettings.imageScaleMode ?? 'fill-page',
        compress: scanSettings.compress ?? false,
        compressionLimitKb: (scanSettings.compressionLimitKb != null && scanSettings.compressionLimitKb > 0) ? scanSettings.compressionLimitKb : 500,
        signal: controller.signal,
      };
      const scannedFile = await scannerService.scanDocument(scannerId, opts);
      if (!scannedFile || scannedFile.size === 0) {
        setScanModalError('Le scan n\'a retourné aucun fichier. Vérifiez le scanner et le serveur de scan (port 3001).');
        return;
      }
      setScanModalError(null);
      setScanModalPreviewFile(scannedFile);
      setImagePreviewZoom(1);
      setImagePreviewRotation(0);
      setImagePreviewFit('contain');
      setScanModalPreviewUrl(URL.createObjectURL(scannedFile));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur lors du scan';
      setScanModalError(msg || 'Le scan a échoué. Vérifiez le scanner et le serveur de scan.');
    } finally {
      setScanning(false);
      scanAbortControllerRef.current = null;
    }
  };

  const handleCancelScan = useCallback(() => {
    if (scanAbortControllerRef.current) scanAbortControllerRef.current.abort();
  }, []);

  const handleAddScannedToRow = useCallback(() => {
    if (!scanModalPreviewFile || !scanModalTarget) return;
    setRows(prev => prev.map(r => {
      if (r.id === scanModalTarget.rowId) {
        return { ...r, files: [...(r.files || []), scanModalPreviewFile] };
      }
      return r;
    }));
    closeScanModal();
    setDialog({ isOpen: true, options: { message: 'Document scanné ajouté avec succès', type: 'success' } });
  }, [scanModalPreviewFile, scanModalTarget, closeScanModal]);

  const loadScanners = async () => {
    setScannersLoading(true);
    try {
      const list = await scannerService.detectScanners();
      setScanners(list);
      if (list.length > 0 && !selectedScanner) {
        setSelectedScanner(list[0].id);
      }
    } catch (error) {
      console.error('Erreur chargement scanners:', error);
    } finally {
      setScannersLoading(false);
    }
  };

  // Fonction pour prévisualiser un fichier
  const openFilePreview = (file: File) => {
    setPreviewFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const closeFilePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
    setShowPreviewPopout(false);
    setFilePreviewZoom(1);
    setFilePreviewRotation(0);
    setFilePreviewFit('contain');
  };

  const addRow = () => {
    const d = getDefaults(activeSens, activeType);
    setRows(p => [...p, makeRow(d)]);
  };
  const rmRow = (id: string) => {
    setRows(p => p.filter(r => r.id !== id));
    setErrors(p => { const n = { ...p }; delete n[id]; return n; });
    setStatus(p => { const n = { ...p }; delete n[id]; return n; });
  };
  const dupRow = (row: RowData) => {
    const nr: RowData = { ...row, id: uid(), objet: '', referenceExterne: '' };
    setRows(p => { const i = p.findIndex(r => r.id === row.id); const c = [...p]; c.splice(i + 1, 0, nr); return c; });
  };

  // ── Helpers cascade entités organisationnelles ─────────────────────────────
  const getEntitiesForLevel = (typeCode: string, parentId?: string) =>
    entities.filter(e => e.type === typeCode && e.actif !== false && (parentId ? e.parentId === parentId : true));

  const getParentIdForLevel = (levelIndex: number, cascade: Record<string, string>): string | undefined => {
    if (levelIndex === 0) return undefined;
    const parentType = filterLevels[levelIndex - 1];
    return parentType ? cascade[parentType.code] : undefined;
  };

  const getDeepestEntityName = (cascade: Record<string, string>): string => {
    for (let i = filterLevels.length - 1; i >= 0; i--) {
      const code = filterLevels[i].code;
      if (cascade[code]) {
        const entity = entities.find(e => e.id === cascade[code]);
        return entity?.nom || '';
      }
    }
    return '';
  };

  // ── Helpers catégories ─────────────────────────────
  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const assignRowToFolder = (rowId: string, folderId: string | null) => {
    const targetFolderId = folderId || '';
    console.log('[DEBUG] assignRowToFolder:', rowId, '→', targetFolderId);
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, folderId: targetFolderId } : r));
  };

  const handleRowDragStart = (e: React.DragEvent, rowId: string) => {
    setDraggedRowId(rowId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', rowId);
  };

  const handleRowDragEnd = () => {
    setDraggedRowId(null);
    setDraggedOverFolderId(null);
  };

  // Ouvrir le champ inline pour créer un sous-catégorie
  const startInlineAddSubfolder = (parentId: string) => {
    setFolderMenuOpen(null);
    setInlineAddParentId(parentId);
    setInlineAddName('');
    setExpandedFolderIds(prev => new Set(prev).add(parentId));
  };

  // Ouvrir le champ inline pour créer une catégorie racine
  const startInlineAddRootFolder = () => {
    setInlineAddRoot(true);
    setInlineAddName('');
  };

  const cancelInlineAdd = () => {
    setInlineAddParentId(null);
    setInlineAddRoot(false);
    setInlineAddName('');
  };

  const commitInlineAdd = async () => {
    const trimmed = inlineAddName.trim();
    if (!trimmed || !user?.id) {
      cancelInlineAdd();
      return;
    }
    try {
      const tempFolder: CategorieCourrier = {
        id: '',
        name: trimmed,
        parentId: inlineAddParentId,
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const savedFolder = await categorieCourrierService.saveCategory(tempFolder, user.id);

      const newFolder: CategorieCourrier = {
        id: savedFolder.id,
        name: savedFolder.name,
        parentId: savedFolder.parentId,
        userId: savedFolder.userId,
        createdAt: savedFolder.createdAt,
        updatedAt: savedFolder.updatedAt
      };

      setFolders(prev => {
        const updated = [...prev, newFolder];
        localStorage.setItem(`courrier_folders_${user.id}`, JSON.stringify(updated));
        return updated;
      });
    } catch {
      console.warn('Erreur lors de la création de la catégorie');
    }
    cancelInlineAdd();
  };

  const createFolder = () => {
    startInlineAddRootFolder();
  };

  const deleteFolder = (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    setDialog({
      isOpen: true,
      options: {
        title: 'Supprimer la catégorie',
        message: `Voulez-vous vraiment supprimer "${folder?.name || 'cette catégorie'}" ?\n\nLes courriers ne seront pas supprimés.`,
        type: 'warning',
        variant: 'confirm',
        confirmText: 'Supprimer',
        cancelText: 'Annuler',
        onConfirm: () => {
          setFolders(prev => {
            const updated = prev.filter(f => f.id !== folderId);
            if (user?.id) localStorage.setItem(`courrier_folders_${user.id}`, JSON.stringify(updated));
            return updated;
          });
          setRows(prev => prev.map(r => r.folderId === folderId ? { ...r, folderId: '' } : r));
          categorieCourrierService.deleteCategories([folderId]).then(() => {
            if (user?.id) categorieCourrierService.markDeleted(user.id, [folderId]);
          }).catch(() => {
            console.warn('Erreur lors de la suppression de la catégorie');
          });
        }
      }
    });
  };

  const startRenameFolder = (folder: CategorieCourrier) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setFolderMenuOpen(null);
  };

  const saveRenameFolder = async () => {
    if (!editingFolderId || !editingFolderName.trim()) {
      setEditingFolderId(null);
      return;
    }
    setFolders(prev => {
      const updated = prev.map(f => f.id === editingFolderId ? { ...f, name: editingFolderName.trim() } : f);
      if (user?.id) localStorage.setItem(`courrier_folders_${user.id}`, JSON.stringify(updated));
      return updated;
    });
    const folder = folders.find(f => f.id === editingFolderId);
    if (folder && user?.id) {
      try {
        await categorieCourrierService.saveCategory({ ...folder, name: editingFolderName.trim() }, user.id);
      } catch {
        console.warn('Erreur lors du renommage de la catégorie');
      }
    }
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const startMoveFolder = (folderId: string) => {
    setMovingFolderId(folderId);
    setFolderMenuOpen(null);
  };

  const moveFolderTo = async (targetFolderId: string | null) => {
    if (!movingFolderId || movingFolderId === targetFolderId) {
      setMovingFolderId(null);
      return;
    }
    setFolders(prev => {
      const updated = prev.map(f => f.id === movingFolderId ? { ...f, parentId: targetFolderId } : f);
      if (user?.id) localStorage.setItem(`courrier_folders_${user.id}`, JSON.stringify(updated));
      return updated;
    });
    const folder = folders.find(f => f.id === movingFolderId);
    if (folder && user?.id) {
      try {
        await categorieCourrierService.saveCategory({ ...folder, parentId: targetFolderId }, user.id);
      } catch {
        console.warn('Erreur lors du déplacement de la catégorie');
      }
    }
    setMovingFolderId(null);
  };

  const isDescendantOf = (potentialDescendantId: string, ancestorId: string): boolean => {
    const folder = folders.find(f => f.id === potentialDescendantId);
    if (!folder || !folder.parentId) return false;
    if (folder.parentId === ancestorId) return true;
    return isDescendantOf(folder.parentId, ancestorId);
  };

  const updEntiteEmetteur = useCallback((rowId: string, levelCode: string, entityId: string, levelIndex: number) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const newCascade: Record<string, string> = {};
      for (let i = 0; i < levelIndex; i++) {
        const code = filterLevels[i].code;
        if (r.entiteEmetteur[code]) newCascade[code] = r.entiteEmetteur[code];
      }
      if (entityId) newCascade[levelCode] = entityId;
      const nom = entities.find(e => e.id === entityId)?.nom || getDeepestEntityName(newCascade);
      return { ...r, entiteEmetteur: newCascade, expediteur: nom };
    }));
    setStatus(p => ({ ...p, [rowId]: 'idle' }));
  }, [entities, filterLevels]);

  const updEntiteDestinataire = useCallback((rowId: string, levelCode: string, entityId: string, levelIndex: number) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const newCascade: Record<string, string> = {};
      for (let i = 0; i < levelIndex; i++) {
        const code = filterLevels[i].code;
        if (r.entiteDestinataire[code]) newCascade[code] = r.entiteDestinataire[code];
      }
      if (entityId) newCascade[levelCode] = entityId;
      const nom = entities.find(e => e.id === entityId)?.nom || getDeepestEntityName(newCascade);
      return { ...r, entiteDestinataire: newCascade, destinataire: nom };
    }));
    setStatus(p => ({ ...p, [rowId]: 'idle' }));
  }, [entities, filterLevels]);

  const saveAll = async () => {
    if (!user) return;
    const newErr: Record<string, RowError> = {};
    let hasErr = false;
    for (const r of rows) {
      if (status[r.id] === 'saved') continue;
      const e = validate(r, extraColumns); newErr[r.id] = e;
      if (Object.keys(e).length) hasErr = true;
    }
    setErrors(newErr);
    if (hasErr) {
      setDialog({
        isOpen: true,
        options: {
          type: 'warning',
          title: 'Champs requis manquants',
          message: 'Certains champs obligatoires sont vides. Vérifiez les lignes marquées en rouge.',
          confirmText: 'OK',
          onConfirm: () => setDialog({ isOpen: false, options: { message: '' } }),
        }
      });
      return;
    }
    setSaving(true);

    // Filtrer les courriers en attente
    const pendingRows = rows.filter(r => status[r.id] !== 'saved');

    if (laravelApiService.isConfigured() && pendingRows.length > 0) {
      // Vérifier que le token d'authentification est disponible
      const token = getAuthToken();
      if (!token) {
        setDialog({
          isOpen: true,
          options: {
            type: 'warning',
            title: 'Authentification requise',
            message: 'Vous devez être connecté à l\'API Laravel pour enregistrer des courriers. Déconnectez-vous puis reconnectez-vous (connexion par email/mot de passe ou token par email) pour obtenir un token Laravel.',
            confirmText: 'OK',
            onConfirm: () => setDialog({ isOpen: false, options: { message: '' } }),
          }
        });
        setSaving(false);
        return;
      }

      pendingRows.forEach(r => setStatus(p => ({ ...p, [r.id]: 'saving' })));
      const saveStart = performance.now();

      // Construire le courrierData pour une ligne
      const buildCourrierData = (r: RowData) => {
        const urgenceVal = Number(Object.entries(r.extraFields).find(([k]) => k.toLowerCase().includes('urgenc'))?.[1] ?? 3);
        const resolvedPriorite: Priorite = urgenceVal <= 2 ? Priorite.BASSE
          : urgenceVal === 4 ? Priorite.HAUTE
          : urgenceVal >= 5 ? Priorite.URGENTE
          : Priorite.NORMALE;
        const isInternal = r.type === TypeCourrier.INTERNE;
        const extraFieldsCopy: Record<string, string> = { ...(r.referenceExterne ? { referenceExterne: r.referenceExterne } : {}), ...r.extraFields };
        if (isInternal) {
          delete (extraFieldsCopy as any)['numero'];
          delete (extraFieldsCopy as any)['Numero'];
          delete (extraFieldsCopy as any)['NUMERO'];
        }
        const data: Omit<Courrier, 'id' | 'numero' | 'dateEnregistrement' | 'createdAt' | 'updatedAt'> & { numero?: string } = {
          type: r.type, sens: r.sens, dateReception: new Date(r.dateReception),
          expediteur: r.expediteur.trim(), destinataire: r.destinataire.trim(),
          objet: r.objet.trim(), direction: r.direction || undefined,
          service: r.service || undefined, priorite: resolvedPriorite,
          statut: StatutCourrier.ENREGISTRE, enregistrePar: user?.id,
          extraFields: extraFieldsCopy,
        } as any;
        if (isInternal) {
          const now = new Date();
          data.numero = `INT-${now.getFullYear()}-${now.getTime()}-${Math.floor(Math.random() * 1000)}`;
        }
        return data;
      };

      // Uploader les fichiers d'une ligne donnée
      const uploadFilesForRow = async (c: Courrier, r: RowData) => {
        if (!r.files || r.files.length === 0) return;
        const uploadCreePar = user?.id || 'system';
        const results = await Promise.allSettled(
          r.files.map(file => categorieFichierService.createFichier(c.id, file.name, file, undefined, uploadCreePar, file.size))
        );
        const failed = results.filter(res => res.status === 'rejected').length;
        if (failed > 0) {
          setDialog({
            isOpen: true,
            options: {
              type: 'warning',
              title: 'Fichiers non uploadés',
              message: `${failed} fichier(s) n'ont pas pu être uploadés pour le courrier ${c.numero || c.id}. Vous pouvez les ajouter plus tard depuis la page de détail du courrier.`,
              confirmText: 'OK',
              onConfirm: () => setDialog({ isOpen: false, options: { message: '' } }),
            }
          });
        }
      };

      // Sauvegarder le mapping des catégories pour les courriers créés (non-bloquant)
      const saveCategoryMapping = (createdCourriers: Courrier[]) => {
        if (!user?.id || createdCourriers.length === 0) return;
        const folderMapBatch: Record<string, string> = {};
        createdCourriers.forEach((c, idx) => {
          const folderId = pendingRows.find(r => r.objet.trim() === c.objet)?.folderId || pendingRows[idx]?.folderId;
          if (folderId) {
            folderMapBatch[String(c.id)] = folderId;
            const key = `courrier_folder_map_${user.id}`;
            try {
              const existing = localStorage.getItem(key);
              const map = existing ? JSON.parse(existing) : {};
              map[String(c.id)] = folderId;
              localStorage.setItem(key, JSON.stringify(map));
            } catch (e) {
              console.warn('[Catégorie] Erreur localStorage:', e);
            }
          }
        });
        if (Object.keys(folderMapBatch).length > 0) {
          categorieCourrierService.saveCategoryMap(user.id, folderMapBatch)
            .catch((err) => console.warn('[Catégorie] Mapping API échoué (non bloquant):', err));
        }
      };

      // Créer un courrier + uploader ses fichiers, puis mettre à jour le statut (fallback séquentiel)
      const saveSingleLaravel = async (r: RowData): Promise<Courrier | null> => {
        try {
          const c = await courrierService.createCourrier(buildCourrierData(r));
          await uploadFilesForRow(c, r);
          setStatus(p => ({ ...p, [r.id]: 'saved' }));
          return c;
        } catch (error) {
          console.error('[SaveAll] Erreur création courrier:', error);
          setStatus(p => ({ ...p, [r.id]: 'error' }));
          return null;
        }
      };

      const created: Courrier[] = [];
      let firstError: string | null = null;

      // Tentative en bulk : une seule requête API pour tous les courriers
      try {
        const bulkPayload = pendingRows.map(buildCourrierData);
        console.log(`[SaveAll] Bulk create démarré pour ${bulkPayload.length} courriers`);
        const bulkStart = performance.now();
        const bulkCreated = await courrierService.createCourriersBulk(bulkPayload);
        console.log(`[SaveAll] Bulk create terminé en ${(performance.now() - bulkStart).toFixed(0)}ms pour ${bulkCreated.length} courriers`);

        created.push(...bulkCreated);
        const savedStatuses = pendingRows.reduce<Record<string, RowStatus>>((acc, r) => {
          acc[r.id] = 'saved';
          return acc;
        }, {});
        setStatus(p => ({ ...p, ...savedStatuses }));

        // Libérer l'UI immédiatement : le bouton arrête de tourner
        const successCount = bulkCreated.length;
        console.log(`[SaveAll] ${successCount}/${pendingRows.length} courriers sauvegardés en ${(performance.now() - saveStart).toFixed(0)}ms`);
        setSavedCount(x => x + successCount);
        setSaving(false);

        // Upload fichiers et mapping catégories en arrière-plan (non bloquant pour l'UI)
        const uploadStart = performance.now();
        Promise.allSettled(
          bulkCreated.map((c, idx) => {
            const r = pendingRows.find(row => row.objet.trim() === c.objet.trim()) || pendingRows[idx];
            return r ? uploadFilesForRow(c, r) : Promise.resolve();
          })
        ).then(() => {
          console.log(`[SaveAll] Uploads fichiers terminés en ${(performance.now() - uploadStart).toFixed(0)}ms`);
        }).catch(e => console.warn('[SaveAll] Uploads fichiers échoués:', e));
        saveCategoryMapping(bulkCreated);

        return;
      } catch (bulkError) {
        console.warn('[SaveAll] Échec bulk create, fallback séquentiel par lots de 5:', bulkError);
        // Fallback : traitement par batchs de 5 en parallèle
        const BATCH = 5;
        for (let i = 0; i < pendingRows.length; i += BATCH) {
          const batch = pendingRows.slice(i, i + BATCH);
          const results = await Promise.all(batch.map(saveSingleLaravel));
          results.forEach(c => { if (c) created.push(c); else if (!firstError) firstError = 'Échec enregistrement'; });
        }
      }

      const successCount = created.length;
      console.log(`[SaveAll] Total opération : ${successCount}/${pendingRows.length} courriers sauvegardés en ${(performance.now() - saveStart).toFixed(0)}ms`);

      if (firstError && successCount === 0) {
        setDialog({
          isOpen: true,
          options: {
            type: 'error',
            title: 'Erreur lors de l\'enregistrement',
            message: `Impossible d'enregistrer les courriers. Vérifiez la connexion à l'API.`,
            confirmText: 'OK',
            onConfirm: () => setDialog({ isOpen: false, options: { message: '' } }),
          }
        });
      }

      setSavedCount(x => x + successCount);
      saveCategoryMapping(created);
      setSaving(false);
      return;
    }
    const totalPending = pendingRows.length;
    let completed = 0;

    // Fonction pour sauvegarder un seul courrier
    const saveSingle = async (r: RowData) => {
      setStatus(p => ({ ...p, [r.id]: 'saving' }));
      try {
        const urgenceVal = Number(Object.entries(r.extraFields).find(([k]) => k.toLowerCase().includes('urgenc'))?.[1] ?? 3);
        const resolvedPriorite: Priorite = urgenceVal <= 2 ? Priorite.BASSE
          : urgenceVal === 4 ? Priorite.HAUTE
          : urgenceVal >= 5 ? Priorite.URGENTE
          : Priorite.NORMALE;

        const courrierData = {
          type: r.type, sens: r.sens, dateReception: new Date(r.dateReception),
          expediteur: r.expediteur.trim(), destinataire: r.destinataire.trim(),
          objet: r.objet.trim(), priorite: resolvedPriorite, enregistrePar: user.id,
          direction: r.direction || undefined, service: r.service || undefined,
          extraFields: {
            ...(r.referenceExterne ? { referenceExterne: r.referenceExterne } : {}),
            ...r.extraFields,
          },
        };

        const c = await courrierService.createCourrier(courrierData as any);
        const currentCourrierId = c.id;
        const currentFolderId = r.folderId;
        const currentUserId = user?.id;

        console.log('[DEBUG Save] Courrier créé:', { id: currentCourrierId, type: typeof currentCourrierId, folderId: currentFolderId, userId: currentUserId });

        // Sauvegarder le mapping - localStorage en PRIORITÉ, API en arrière-plan
        if (currentFolderId && currentUserId) {
          // 1. Mettre à jour localStorage IMMÉDIATEMENT (pas de blocage)
          const key = `courrier_folder_map_${currentUserId}`;
          try {
            const existing = localStorage.getItem(key);
            const map = existing ? JSON.parse(existing) : {};
            map[String(currentCourrierId)] = currentFolderId;
            localStorage.setItem(key, JSON.stringify(map));
            console.log('[Catégorie] Mapping localStorage:', String(currentCourrierId), '→', currentFolderId);
          } catch (e) {
            console.warn('[Catégorie] Erreur localStorage:', e);
          }

          // 2. API en arrière-plan (non-bloquant)
          categorieCourrierService.saveCategoryMap(currentUserId, { [String(currentCourrierId)]: currentFolderId })
            .then(() => console.log('[Catégorie] Mapping API OK:', String(currentCourrierId), '→', currentFolderId))
            .catch((err) => console.warn('[Catégorie] Mapping API échoué (non bloquant):', err));
        }

        setStatus(p => ({ ...p, [r.id]: 'saved' }));
        return { success: true, id: r.id };
      } catch {
        setStatus(p => ({ ...p, [r.id]: 'error' }));
        return { success: false, id: r.id };
      }
    };

    // Traitement parallèle par batchs de 10 pour éviter de surcharger le serveur
    const BATCH_SIZE = 10;
    let successCount = 0;

    for (let i = 0; i < pendingRows.length; i += BATCH_SIZE) {
      const batch = pendingRows.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(saveSingle));

      // Compter les succès
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        }
      });

      completed += batch.length;
      console.log(`[SaveAll] Progression: ${completed}/${totalPending} (${successCount} succès)`);
    }

    setSavedCount(x => x + successCount);
    setSaving(false);
  };

  if (!allowed) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center"><FontAwesomeIcon icon={faTimesCircle} className="text-red-400 text-5xl mb-4" /><p className="text-surface-600">Accès non autorisé.</p></div>
    </div>
  );

  const pending = rows.filter(r => status[r.id] !== 'saved');
  const allSaved = pending.length === 0 && rows.length > 0;

  // Compter les courriers dans une catégorie et ses sous-catégories de manière récursive
  const getTotalCourriersInFolder = (folderId: string): number => {
    const directCourriers = rows.filter(r => r.folderId === folderId && status[r.id] !== 'saved').length;
    const childFolders = folders.filter(f => f.parentId === folderId);
    const childCourriers = childFolders.reduce((sum, child) => sum + getTotalCourriersInFolder(child.id), 0);
    return directCourriers + childCourriers;
  };

  // ── Rendu des catégories et courriers ─────────────────────────────
  const renderFolderRow = (folder: CategorieCourrier, level: number = 0) => {
    const isExpanded = expandedFolderIds.has(folder.id);
    const folderRows = rows.filter(r => r.folderId === folder.id && status[r.id] !== 'saved');
    const totalCourriers = getTotalCourriersInFolder(folder.id);
    const isDraggedOver = draggedOverFolderId === folder.id;

    return (
      <React.Fragment key={`folder-${folder.id}`}>
        {/* Ligne catégorie */}
        <tr className={`bg-amber-50 border-b border-amber-100 ${isDraggedOver ? 'bg-blue-100' : ''}`}>
          <td colSpan={8} className="px-3 py-2">
            <div
              className={`flex items-center gap-2 rounded-xl border-2 transition-all ${
                isDraggedOver
                  ? 'border-blue-400 bg-blue-50 shadow-md'
                  : 'border-amber-200 bg-white'
              }`}
              style={{ marginLeft: `${level * 20}px` }}
              onDragOver={(e) => {
                e.preventDefault();
                setDraggedOverFolderId(folder.id);
              }}
              onDragLeave={() => setDraggedOverFolderId(null)}
              onDrop={(e) => {
                e.preventDefault();
                const rowId = e.dataTransfer.getData('text/plain');
                if (rowId) assignRowToFolder(rowId, folder.id);
                setDraggedOverFolderId(null);
              }}
            >
              <button
                onClick={() => toggleFolderExpand(folder.id)}
                className="p-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
              >
                <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} className="text-xs" />
              </button>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center">
                <FontAwesomeIcon icon={isExpanded ? faFolderOpen : faFolder} className="text-white text-sm" />
              </div>
              {editingFolderId === folder.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editingFolderName}
                    onChange={e => setEditingFolderName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveRenameFolder()}
                    onBlur={saveRenameFolder}
                    autoFocus
                    className="flex-1 px-2 py-1 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button onClick={saveRenameFolder} className="p-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                    <FontAwesomeIcon icon={faCheck} className="text-xs" />
                  </button>
                  <button onClick={() => { setEditingFolderId(null); setEditingFolderName(''); }} className="p-1 rounded bg-surface-100 text-surface-600 hover:bg-surface-200">
                    <FontAwesomeIcon icon={faTimes} className="text-xs" />
                  </button>
                </div>
              ) : (
                <span className="font-bold text-slate-700">{folder.name}</span>
              )}
              <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                {totalCourriers} courrier{totalCourriers > 1 ? 's' : ''}
              </span>
              {/* Raccourcis d'actions de la catégorie */}
              {editingFolderId !== folder.id && (
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    onClick={() => startRenameFolder(folder)}
                    className="p-1.5 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                    title="Renommer"
                  >
                    <FontAwesomeIcon icon={faPen} className="text-xs" />
                  </button>
                  <button
                    onClick={() => startInlineAddSubfolder(folder.id)}
                    className="p-1.5 rounded-lg hover:bg-amber-100 text-slate-400 hover:text-amber-600 transition-colors"
                    title="Nouveau sous-catégorie"
                  >
                    <FontAwesomeIcon icon={faFolder} className="text-xs" />
                  </button>
                  <button
                    onClick={() => startMoveFolder(folder.id)}
                    className="p-1.5 rounded-lg hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Déplacer"
                  >
                    <FontAwesomeIcon icon={faArrowsAlt} className="text-xs" />
                  </button>
                  <button
                    onClick={() => deleteFolder(folder.id)}
                    className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                    title="Supprimer"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-xs" />
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
        {/* Mode déplacement - sélection de la catégorie cible */}
        {movingFolderId && (
          <tr className="bg-blue-50/50">
            <td colSpan={8} className="px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <FontAwesomeIcon icon={faArrowsAlt} />
                <span>Sélectionnez la catégorie de destination pour "{folders.find(f => f.id === movingFolderId)?.name}"</span>
                <button onClick={() => moveFolderTo(null)} className="ml-2 px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-xs">Racine</button>
                <button onClick={() => setMovingFolderId(null)} className="ml-auto px-2 py-1 bg-surface-100 hover:bg-surface-200 rounded text-xs text-surface-600">Annuler</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {folders.filter(f => f.id !== movingFolderId && !isDescendantOf(f.id, movingFolderId!)).map(f => (
                  <button
                    key={f.id}
                    onClick={() => moveFolderTo(f.id)}
                    className="px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg text-xs flex items-center gap-1.5"
                  >
                    <FontAwesomeIcon icon={faFolder} className="text-amber-500" />
                    {f.name}
                  </button>
                ))}
              </div>
            </td>
          </tr>
        )}
        {/* Sous-catégories */}
        {isExpanded && folders.filter(f => f.parentId === folder.id).map(sf => renderFolderRow(sf, level + 1))}
        {/* Champ inline pour créer un sous-catégorie */}
        {isExpanded && inlineAddParentId === folder.id && (
          <tr className="bg-amber-50/50">
            <td colSpan={8} className="px-3 py-2">
              <div className="flex items-center gap-2 ml-4" style={{ paddingLeft: `${(level + 1) * 24 + 12}px` }}>
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <FontAwesomeIcon icon={faFolderPlus} className="text-amber-500 text-xs" />
                </div>
                <input
                  type="text"
                  value={inlineAddName}
                  onChange={e => setInlineAddName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitInlineAdd(); }
                    else if (e.key === 'Escape') { e.preventDefault(); cancelInlineAdd(); }
                  }}
                  onBlur={commitInlineAdd}
                  autoFocus
                  placeholder="Nom du nouveau sous-catégorie…"
                  className="flex-1 px-2 py-1 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </td>
          </tr>
        )}
        {/* Courriers */}
        {isExpanded && folderRows.map((row, idx) => renderCourrierRow(row, idx, level + 1))}
      </React.Fragment>
    );
  };

  const renderCourrierRow = (row: RowData, idx: number, level: number = 0) => {
    const st = status[row.id] || 'idle';
    const err = errors[row.id] || {};
    const isDragged = draggedRowId === row.id;
    const selectedDir = directions.find(d => d.nom === row.direction);
    const svcList = row.direction && selectedDir
      ? allServices.filter((s: any) => s.directionId === selectedDir.id)
      : allServices;
    const lborder = st === 'saved' ? '' : st === 'error' ? '' : st === 'saving' ? 'border-l-4 border-l-blue-400' : 'border-l-4 border-l-transparent';
    const rowBg = st === 'saved' ? 'bg-emerald-50 border-l-4 border-l-emerald-400' : st === 'error' ? 'bg-red-50 border-l-4 border-l-red-400' : isDragged ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';

    return (
      <React.Fragment key={row.id}>
        <tr
          className={`${rowBg} ${lborder} hover:bg-blue-50/20 focus-within:bg-blue-50/60 focus-within:ring-2 focus-within:ring-blue-400/30 focus-within:border-blue-200 transition-all group ${isDragged ? 'cursor-grabbing' : 'cursor-grab'}`}
          draggable={st !== 'saved'}
          onDragStart={(e) => handleRowDragStart(e, row.id)}
          onDragEnd={handleRowDragEnd}
          style={{ marginLeft: `${level * 20}px` }}
        >
          <td className="px-3 py-2 text-center">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-100 text-xs font-bold text-surface-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">{idx + 1}</span>
          </td>
          {/* Colonne 2: Expediteur/Destinataire */}
          <td className="px-2 py-1.5">
            {activeType === TypeCourrier.INTERNE ? (
              <div className={`w-full px-2 py-1.5 rounded-lg border text-sm bg-slate-100 text-slate-600 cursor-not-allowed ${err.expediteur || err.destinataire ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                {row.sens === SensCourrier.ENTRANT ? row.expediteur : row.destinataire}
                <span className="ml-2 text-xs text-slate-400">(via entités)</span>
              </div>
            ) : (
              <MaterialInput
                label={row.sens === SensCourrier.ENTRANT ? 'Expéditeur' : 'Destinataire'}
                value={row.sens === SensCourrier.ENTRANT ? row.expediteur : row.destinataire}
                onChange={e => upd(row.id, row.sens === SensCourrier.ENTRANT ? 'expediteur' : 'destinataire', e.target.value)}
                disabled={st === 'saved'}
                error={err.expediteur || err.destinataire}
              />
            )}
          </td>
          {/* Colonne 3: Objet */}
          <td className="px-2 py-1.5">
            <MaterialInput
              label="Objet du courrier"
              value={row.objet}
              onChange={e => upd(row.id, 'objet', e.target.value)}
              disabled={st === 'saved'}
              error={err.objet}
            />
          </td>
          {/* Colonne 3b: Référence / Numéro de la lettre */}
          <td className="px-2 py-1.5">
            <MaterialInput
              label="Référence"
              value={row.referenceExterne}
              onChange={e => upd(row.id, 'referenceExterne', e.target.value)}
              disabled={st === 'saved'}
              error={err.referenceExterne}
            />
          </td>
          {/* Colonne 4: Urgence (depuis extraFields) */}
          <td className="px-2 py-1.5 text-center">
            {(() => {
              const urgCol = extraColumns.find(c => c.name.toLowerCase().includes('urgenc') || c.label?.toLowerCase().includes('urgenc'));
              if (!urgCol) return <span className="text-surface-300 text-xs">—</span>;
              const val = row.extraFields[urgCol.name] ?? '';
              const numVal = Math.max(1, Math.min(5, Number(val) || 3));
              const colors = ['#10b981', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];
              return (
                <div className="flex items-center justify-center">
                  <input
                    type="range" min={1} max={5} step={1}
                    value={numVal}
                    disabled={st === 'saved'}
                    onChange={e => updExtra(row.id, urgCol.name, e.target.value)}
                    style={{background: `linear-gradient(to right, ${colors[numVal-1]} ${((numVal-1)/4)*100}%, #e2e8f0 ${((numVal-1)/4)*100}%)`}}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
              );
            })()}
          </td>
          {/* Colonne 5: Catégorie */}
          <td className="px-2 py-1.5">
            <select
              value={row.folderId}
              onChange={e => upd(row.id, 'folderId', e.target.value)}
              disabled={st === 'saved'}
              className="px-2 py-1.5 text-sm border-2 border-slate-200 rounded-lg focus:border-amber-400 focus:outline-none bg-white disabled:opacity-60"
            >
              <option value="">— Non classé —</option>
              {folders.map(folder => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
          </td>
          <td className="px-3 py-2 text-center">
            {st === 'saving' && <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-medium"><FontAwesomeIcon icon={faSpinner} spin />…</span>}
            {st === 'saved' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><FontAwesomeIcon icon={faCheckCircle} />OK</span>}
            {st === 'error' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><FontAwesomeIcon icon={faTimesCircle} />Erreur</span>}
            {st === 'idle' && <span className="w-2 h-2 rounded-full bg-surface-200 inline-block" />}
          </td>
          <td className="px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1">
              <button onClick={() => toggleExpand(row.id)} className={`p-1.5 rounded-lg transition-all ${expanded[row.id] ? 'bg-indigo-100 text-indigo-600' : 'bg-surface-100 text-surface-500 hover:bg-indigo-50 hover:text-indigo-500'}`}>
                <FontAwesomeIcon icon={expanded[row.id] ? faChevronUp : faChevronDown} className="text-xs" />
              </button>
              <button onClick={() => dupRow(row)} className="p-1.5 rounded-lg hover:bg-blue-100 text-surface-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100">
                <FontAwesomeIcon icon={faCopy} className="text-xs" />
              </button>
              <button onClick={() => rmRow(row.id)} disabled={rows.length === 1 || st === 'saving'} className="p-1.5 rounded-lg hover:bg-red-100 text-surface-400 hover:text-red-600 transition-colors disabled:opacity-30 opacity-0 group-hover:opacity-100">
                <FontAwesomeIcon icon={faTrash} className="text-xs" />
              </button>
            </div>
          </td>
        </tr>
        {expanded[row.id] && (
          <tr className={rowBg}>
            <td colSpan={8} className="px-3 pb-3 pt-0">
              <div className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-blue-50/60 border-b border-indigo-100">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <FontAwesomeIcon icon={faBuilding} className="text-white" style={{fontSize: '0.6rem'}} />
                  </div>
                  <span className="text-xs font-bold text-indigo-800">Classement &amp; Métadonnées</span>
                </div>
                <div className="p-4 space-y-4">
                  {/* ── Organisation : INTERNE → cascade entités, EXTERNE → direction/service ── */}
                  {activeType === TypeCourrier.INTERNE ? (
                    <div className={`rounded-xl border-2 p-4 ${row.sens === SensCourrier.ENTRANT ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${row.sens === SensCourrier.ENTRANT ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                          <FontAwesomeIcon icon={faBuilding} className="text-white text-xs" />
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${row.sens === SensCourrier.ENTRANT ? 'text-blue-900' : 'text-emerald-900'}`}>
                            {row.sens === SensCourrier.ENTRANT ? 'Entité Émettrice' : 'Entité Destinataire'}
                          </p>
                          <p className={`text-xs ${row.sens === SensCourrier.ENTRANT ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {row.sens === SensCourrier.ENTRANT ? 'Service / département émetteur' : 'Service / département destinataire'}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {filterLevels.map((level, lvlIdx) => {
                          const cascade = row.sens === SensCourrier.ENTRANT ? row.entiteEmetteur : row.entiteDestinataire;
                          const parentId = getParentIdForLevel(lvlIdx, cascade);
                          const options = getEntitiesForLevel(level.code, parentId);
                          const isVisible = lvlIdx === 0 || !!getParentIdForLevel(lvlIdx, cascade);
                          if (!isVisible) return null;
                          const borderCls = row.sens === SensCourrier.ENTRANT ? 'border-blue-200 focus:border-blue-500' : 'border-emerald-200 focus:border-emerald-500';
                          const labelCls = row.sens === SensCourrier.ENTRANT ? 'text-blue-800' : 'text-emerald-800';
                          return (
                            <div key={level.code}>
                              <label className={`block text-xs font-semibold mb-1 uppercase tracking-wide ${labelCls}`}>{level.libelleSingulier}</label>
                              <select
                                value={cascade[level.code] || ''}
                                onChange={e => row.sens === SensCourrier.ENTRANT
                                  ? updEntiteEmetteur(row.id, level.code, e.target.value, lvlIdx)
                                  : updEntiteDestinataire(row.id, level.code, e.target.value, lvlIdx)}
                                disabled={st === 'saved'}
                                className={`w-full px-3 py-2 border-2 rounded-xl text-sm focus:outline-none bg-white disabled:opacity-60 ${borderCls}`}>
                                <option value="">- Sélectionner -</option>
                                {options.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                      {(row.sens === SensCourrier.ENTRANT ? row.expediteur : row.destinataire) && (
                        <p className={`mt-2 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-2 bg-white/70 ${row.sens === SensCourrier.ENTRANT ? 'text-blue-800' : 'text-emerald-800'}`}>
                          <FontAwesomeIcon icon={faCheck} className={row.sens === SensCourrier.ENTRANT ? 'text-blue-500' : 'text-emerald-500'} />
                          {row.sens === SensCourrier.ENTRANT ? row.expediteur : row.destinataire}
                        </p>
                      )}
                    </div>
                  ) : null}
                  {/* ── Niveau d'urgence ── */}
                  {(() => {
                    const urgCol = extraColumns.find(c => c.name.toLowerCase().includes('urgenc') || c.label?.toLowerCase().includes('urgenc'));
                    if (!urgCol) return null;
                    const val = row.extraFields[urgCol.name] ?? '';
                    const numVal = Math.max(1, Math.min(5, Number(val) || 3));
                    const labels = ['Très faible', 'Faible', 'Moyenne', 'Élevée', 'Urgente'];
                    const colors = ['#10b981', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];
                    return (
                      <div className="border-t border-surface-200 pt-4">
                        <label className="block text-xs font-bold text-surface-600 mb-2 uppercase tracking-wide">{urgCol.label}</label>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium px-2 py-1 rounded-full" style={{backgroundColor: colors[numVal-1] + '20', color: colors[numVal-1]}}>
                            {labels[numVal-1]}
                          </span>
                          <input
                            type="range" min={1} max={5} step={1}
                            value={numVal}
                            disabled={st === 'saved'}
                            onChange={e => updExtra(row.id, urgCol.name, e.target.value)}
                            style={{background: `linear-gradient(to right, ${colors[numVal-1]} ${((numVal-1)/4)*100}%, #e2e8f0 ${((numVal-1)/4)*100}%)`}}
                            className="flex-1 h-2 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className="text-xs font-bold text-surface-500">{numVal}/5</span>
                        </div>
                      </div>
                    );
                  })()}
                  {/* ── Autres champs dynamiques ── */}
                  {extraColumns.filter(col => !ESSENTIAL_TABLE_FIELDS.has(col.name) && !col.name.toLowerCase().includes('urgenc') && !col.label?.toLowerCase().includes('urgenc')).length > 0 && (
                    <div className="border-t border-surface-200 pt-4 mt-4">
                      <p className="text-xs font-bold text-surface-600 mb-3 uppercase tracking-wide">Autres informations</p>
                      <div className="grid grid-cols-2 gap-4">
                        {extraColumns.filter(col => !ESSENTIAL_TABLE_FIELDS.has(col.name) && !col.name.toLowerCase().includes('urgenc') && !col.label?.toLowerCase().includes('urgenc')).map(col => {
                          const isDirect = DIRECT_ROW_KEYS.has(col.name);
                          const val = isDirect ? String(row[col.name as keyof RowData] ?? '') : (row.extraFields[col.name] ?? '');
                          const errMsg = err[col.name];
                          const dis = st === 'saved';
                          const chg = (v: string) => isDirect ? upd(row.id, col.name as keyof RowData, v) : updExtra(row.id, col.name, v);
                          const inp = `w-full px-3 py-2 rounded-xl border-2 text-sm focus:outline-none ${errMsg ? 'border-red-300 bg-red-50' : 'border-surface-200'} ${dis ? 'opacity-60 cursor-not-allowed' : ''}`;
                          return (
                            <div key={col.name}>
                              {col.type === 'select' && col.options?.length ? (
                                <MaterialInput label={col.label} value={val} onChange={e => chg(e.target.value)} disabled={dis} error={errMsg} required={col.required} type="select">
                                  <option value="">— Sélectionner —</option>
                                  {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                                </MaterialInput>
                              ) : col.type === 'date' || col.type === 'datetime' ? (
                                <MaterialDateTimeField value={val} onChange={(v) => chg(v || '')} label={col.label} disabled={dis} />
                              ) : col.type === 'textarea' && (col.name?.toLowerCase().includes('contenu') || col.label?.toLowerCase().includes('contenu')) ? (
                                <div>
                                  {col.label && <p className="text-xs font-semibold text-surface-600 mb-1.5 uppercase tracking-wide">{col.label}{col.required && <span className="text-red-500 ml-1">*</span>}</p>}
                                  <div className={`rounded-xl border-2 overflow-hidden ${errMsg ? 'border-red-300' : 'border-surface-200'} ${dis ? 'opacity-60 pointer-events-none' : ''}`}>
                                    <ReactQuill
                                      theme="snow"
                                      value={val}
                                      onChange={v => chg(v)}
                                      readOnly={dis}
                                      placeholder={col.placeholder || 'Rédigez le contenu du courrier...'}
                                      modules={{ toolbar: [['bold','italic','underline','strike'],['blockquote'],[ {list:'ordered'},{list:'bullet'}],['clean']] }}
                                      style={{ minHeight: '120px' }}
                                    />
                                  </div>
                                  {errMsg && <p className="text-xs text-red-500 mt-1">{errMsg}</p>}
                                </div>
                              ) : col.type === 'textarea' ? (
                                <MaterialInput label={col.label} value={val} onChange={e => chg(e.target.value)} disabled={dis} error={errMsg} required={col.required} multiline rows={3} placeholder={col.placeholder} />
                              ) : col.type === 'radio' && col.options?.length && col.options.length === 2 ? (
                                <div>
                                  {col.label && <p className="text-xs font-semibold text-surface-600 mb-1.5 uppercase tracking-wide">{col.label}</p>}
                                  <label className={`relative inline-flex items-center cursor-pointer ${dis ? 'cursor-not-allowed opacity-60' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={val === col.options?.[1]}
                                      onChange={e => chg(e.target.checked ? col.options?.[1] ?? '' : col.options?.[0] ?? '')}
                                      disabled={dis}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-surface-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    <span className="ml-2 text-sm font-medium text-surface-700">{val || col.options?.[0] || ''}</span>
                                  </label>
                                </div>
                              ) : col.type === 'radio' && col.options?.length ? (
                                <div className="flex flex-wrap gap-3">
                                  {col.options.map(opt => (
                                    <label key={opt} className={`flex items-center gap-1.5 text-sm cursor-pointer px-3 py-1.5 rounded-full border ${val === opt ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-surface-50 border-surface-200 text-surface-600'} ${dis ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                      <input type="radio" name={`${row.id}-${col.name}`} value={opt} checked={val === opt} onChange={e => chg(e.target.value)} disabled={dis} className="text-blue-600" />
                                      <span>{opt}</span>
                                    </label>
                                  ))}
                                </div>
                              ) : col.type === 'checkbox' ? (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={val === 'true' || val === '1'} onChange={e => chg(e.target.checked ? 'true' : 'false')} disabled={dis} className="w-4 h-4 text-blue-600 rounded" />
                                  <span className="text-sm">{col.label}</span>
                                </label>
                              ) : (
                                <MaterialInput
                                  label={col.label}
                                  value={val}
                                  onChange={e => chg(e.target.value)}
                                  type={col.type === 'number' ? 'number' : col.type === 'email' ? 'email' : 'text'}
                                  disabled={dis}
                                  error={errMsg}
                                  required={col.required}
                                  placeholder={col.placeholder}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* ── Fichiers attachés ── */}
                  <div className="border-t border-surface-200 pt-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-surface-600 uppercase tracking-wide">Fichiers attachés</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openAddFileModal(row.id)}
                          disabled={st === 'saved'}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <FontAwesomeIcon icon={faUpload} />
                          Ajouter
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRowId(row.id);
                            setScanModalTarget({ rowId: row.id });
                            setShowScanModal(true);
                          }}
                          disabled={st === 'saved' || scanning}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <FontAwesomeIcon icon={faPrint} />
                          Scanner
                        </button>
                      </div>
                    </div>
                    {row.files && row.files.length > 0 ? (
                      <div className="space-y-2">
                        {row.files.map((file, idx) => {
                          const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
                          const isImage = ext && ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
                          const isPdf = ext === 'pdf';
                          return (
                            <div key={`${file.name}-${file.size}-${idx}`} className="flex items-center gap-3 p-2 rounded-lg bg-surface-50 border border-surface-200">
                              <button
                                onClick={() => openFilePreview(file)}
                                className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0 hover:bg-blue-100 transition-colors text-blue-600"
                                title="Prévisualiser"
                              >
                                <FontAwesomeIcon icon={faEye} />
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-surface-700 truncate">{file.name}</p>
                                <p className="text-xs text-surface-500">{(file.size / 1024).toFixed(1)} Ko</p>
                              </div>
                              <button
                                onClick={() => {
                                  setRows(prev => prev.map(r => {
                                    if (r.id === row.id) {
                                      return { ...r, files: r.files?.filter((_, i) => i !== idx) };
                                    }
                                    return r;
                                  }));
                                }}
                                disabled={st === 'saved'}
                                className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <FontAwesomeIcon icon={faTimes} className="text-xs" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-surface-400 text-center py-4">Aucun fichier attaché</p>
                    )}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-50 to-white">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur border-b border-surface-200 shadow-sm sticky top-0 z-20">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/enregistrer')} className="p-2 rounded-xl hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors">
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <FontAwesomeIcon icon={faListAlt} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-surface-900">Saisie en liste</h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeSens === SensCourrier.ENTRANT ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}>{activeSens === SensCourrier.ENTRANT ? '↓ Entrant' : '↑ Sortant'}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                  {activeType === TypeCourrier.INTERNE ? 'Interne' : 'Externe'}
                </span>
              </div>
              <p className="text-xs text-surface-400 mt-0.5">
                {rows.length} courrier{rows.length > 1 ? 's' : ''}
                {' · '}{rows.filter(r => status[r.id] === 'saved').length} enregistré{rows.filter(r => status[r.id] === 'saved').length !== 1 ? 's' : ''}
                {user?.direction ? ` · ${user.direction}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {savedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold border border-emerald-200">
                <FontAwesomeIcon icon={faCheckCircle} />{savedCount} enregistré{savedCount > 1 ? 's' : ''}
              </span>
            )}
            <button onClick={createFolder} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-sm font-medium border border-amber-200 transition-colors">
              <FontAwesomeIcon icon={faFolder} className="text-xs" />Nouvelle catégorie
            </button>
            <button onClick={addRow} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-100 text-surface-700 hover:bg-surface-200 text-sm font-medium border border-surface-200 transition-colors">
              <FontAwesomeIcon icon={faPlus} className="text-xs" />Ajouter
            </button>
            <button onClick={saveAll} disabled={saving || allSaved || !pending.length}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold shadow-md hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {saving ? <><FontAwesomeIcon icon={faSpinner} spin />En cours…</>
                : allSaved ? <><FontAwesomeIcon icon={faCheckCircle} />Tout enregistré</>
                : <><FontAwesomeIcon icon={faSave} />Enregistrer ({pending.length})</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Config bar */}
      <div className="px-4 sm:px-6 pt-4 pb-2">
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-white border border-surface-200 shadow-sm">
          <span className="text-xs font-bold text-surface-400 uppercase tracking-widest">Type</span>
          <div className="flex items-center bg-surface-100 rounded-xl p-0.5">
            {Object.values(SensCourrier).map(s => (
              <button key={s} onClick={() => setActiveSens(s)}
                className={`px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all ${
                  activeSens === s
                    ? 'bg-white shadow text-blue-600 border border-surface-200'
                    : 'text-surface-500 hover:text-surface-700'
                }`}>
                {s === SensCourrier.ENTRANT ? '↓ Entrant' : '↑ Sortant'}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-surface-100 rounded-xl p-0.5">
            {Object.values(TypeCourrier).map(t => (
              <button key={t} onClick={() => setActiveType(t)}
                className={`px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all ${
                  activeType === t
                    ? 'bg-white shadow text-indigo-600 border border-surface-200'
                    : 'text-surface-500 hover:text-surface-700'
                }`}>
                {t === TypeCourrier.INTERNE ? 'Interne' : 'Externe'}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-surface-200 hidden sm:block" />
          {!formConfig && (
            <span className="inline-flex items-center gap-1.5 text-xs text-surface-400">
              <FontAwesomeIcon icon={faSpinner} spin className="text-blue-400" />Chargement…
            </span>
          )}
          {formConfig && extraColumns.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold border border-indigo-100">
              <FontAwesomeIcon icon={faCheckCircle} />
              {extraColumns.length} champ{extraColumns.length > 1 ? 's' : ''} configuré{extraColumns.length > 1 ? 's' : ''}
            </span>
          )}
          {formConfig && extraColumns.length === 0 && (
            <span className="text-xs text-surface-400 italic">Aucun champ configuré pour cette combinaison</span>
          )}
          <div className="ml-auto flex items-center gap-1 text-xs text-surface-400">
            <FontAwesomeIcon icon={faInfoCircle} className="text-surface-300" />
            Champs <span className="text-red-400 font-bold ml-1">*</span> requis
          </div>
        </div>
      </div>

      {/* Table - Sans scroll horizontal, colonnes essentielles uniquement */}
      <div className="px-4 sm:px-6 pb-32">
        <div className="rounded-2xl border border-surface-200 shadow-sm">
          <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-surface-50 to-surface-50/50 border-b-2 border-surface-100">
              <th className="px-3 py-3 text-center w-10 text-xs font-bold text-surface-400">#</th>
              <th className="px-3 py-3 text-left text-xs font-bold text-surface-600 uppercase tracking-wider">{activeSens === SensCourrier.ENTRANT ? 'Expéditeur' : 'Destinataire'}</th>
              <th className="px-3 py-3 text-left w-64 text-xs font-bold text-surface-600 uppercase tracking-wider">Objet</th>
              <th className="px-3 py-3 text-left w-32 text-xs font-bold text-surface-600 uppercase tracking-wider">Référence</th>
              <th className="px-3 py-3 text-center w-28 text-xs font-bold text-surface-600 uppercase tracking-wider">Urgence</th>
              <th className="px-3 py-3 text-left w-40 text-xs font-bold text-surface-600 uppercase tracking-wider">Catégorie</th>
              <th className="px-3 py-3 text-center w-20 text-xs font-bold text-surface-600 uppercase tracking-wider">État</th>
              <th className="px-3 py-3 text-center w-24 text-xs font-bold text-surface-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Section "Non classés" - Courriers sans catégorie */}
            {(() => {
              const unassigned = rows.filter(r => !r.folderId && status[r.id] !== 'saved');
              if (unassigned.length === 0) return null;
              return (
                <React.Fragment key="unassigned">
                  <tr className="bg-slate-50/80 border-b border-slate-200">
                    <td colSpan={8} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center">
                          <FontAwesomeIcon icon={faFolderOpen} className="text-white text-sm" />
                        </div>
                        <span className="font-bold text-slate-600">Non classés</span>
                        <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                          {unassigned.length} courrier{unassigned.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {unassigned.map((row, idx) => renderCourrierRow(row, idx))}
                </React.Fragment>
              );
            })()}
            {/* Catégories racines avec leurs courriers et sous-catégories */}
            {folders.filter(f => !f.parentId).map(folder => renderFolderRow(folder))}
            {/* Champ inline pour créer une catégorie racine */}
            {inlineAddRoot && (
              <tr className="bg-amber-50/50">
                <td colSpan={8} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faFolderPlus} className="text-amber-500 text-sm" />
                    </div>
                    <input
                      type="text"
                      value={inlineAddName}
                      onChange={e => setInlineAddName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitInlineAdd(); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelInlineAdd(); }
                      }}
                      onBlur={commitInlineAdd}
                      autoFocus
                      placeholder="Nom de la nouvelle catégorie…"
                      className="flex-1 px-2 py-1 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      <div className="px-4 sm:px-6">
        <button onClick={addRow} className="mt-3 w-full py-3 rounded-2xl border-2 border-dashed border-surface-200 text-surface-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 text-sm font-semibold transition-all flex items-center justify-center gap-2 group">
          <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center group-hover:bg-blue-500 group-hover:border-blue-500 group-hover:text-white transition-all"><FontAwesomeIcon icon={faPlus} className="text-xs" /></span>
          Ajouter une ligne
        </button>
      </div>

      <div className="px-4 sm:px-6 pb-8">
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-surface-200 shadow-sm">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-surface-700">{rows.length} ligne{rows.length > 1 ? 's' : ''}</span>
            <span className="h-4 w-px bg-surface-200" />
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
              <FontAwesomeIcon icon={faCheckCircle} />{rows.filter(r => status[r.id] === 'saved').length} ok
            </span>
            {rows.filter(r => status[r.id] === 'error').length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold border border-red-100">
                <FontAwesomeIcon icon={faTimesCircle} />{rows.filter(r => status[r.id] === 'error').length} erreur{rows.filter(r => status[r.id] === 'error').length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button onClick={saveAll} disabled={saving || allSaved || !pending.length}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold shadow-md hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {saving ? <><FontAwesomeIcon icon={faSpinner} spin />En cours…</>
              : allSaved ? <><FontAwesomeIcon icon={faCheckCircle} />Tout enregistré</>
              : <><FontAwesomeIcon icon={faSave} />Enregistrer ({pending.length})</>
            }
          </button>
        </div>
      </div>

      {/* Modal d'ajout de fichiers */}
      {showAddFileModal && selectedRowId && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100050]"
          onClick={closeAddFileModal}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Ajouter des fichiers
                  {selectedFiles.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-green-600">
                      ({selectedFiles.length} fichier{selectedFiles.length > 1 ? 's' : ''} sélectionné{selectedFiles.length > 1 ? 's' : ''})
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Images, PDF, Word, Excel…</p>
              </div>
              <button onClick={closeAddFileModal} className="text-gray-400 hover:text-gray-600">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="p-4">
              <input
                id="add-file-browse-input"
                ref={addFileBrowseInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.odt,.ods,.ppt,.pptx,.zip"
                onChange={handleFileSelect}
                className="sr-only"
                aria-label="Choisir des fichiers"
                tabIndex={-1}
              />
              {/* Bouton pour ouvrir le scan modal */}
              <button
                type="button"
                onClick={() => {
                  setShowAddFileModal(false);
                  setShowScanModal(true);
                }}
                className="w-full mb-4 py-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 font-medium transition-all flex items-center justify-center gap-2"
              >
                <FontAwesomeIcon icon={faPrint} />
                Scanner un document
              </button>
              <div
                role="button"
                tabIndex={0}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors min-h-[180px] flex flex-col items-center justify-center ${
                  addFileModalDraggingOver
                    ? 'border-blue-500 bg-blue-50'
                    : selectedFiles.length > 0
                      ? 'border-emerald-400 bg-emerald-50/50'
                      : 'border-gray-300 bg-gray-50'
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.types.includes('Files')) {
                    e.dataTransfer.dropEffect = 'copy';
                    setAddFileModalDraggingOver(true);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.types.includes('Files')) {
                    e.dataTransfer.dropEffect = 'copy';
                  }
                }}
                onDrop={handleModalFileDrop}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAddFileModalDraggingOver(false);
                }}
              >
                {selectedFiles.length === 0 ? (
                  <>
                    <FontAwesomeIcon icon={faUpload} className={`text-4xl mb-4 ${addFileModalDraggingOver ? 'text-blue-500' : 'text-gray-400'}`} />
                    <p className={`mb-2 ${addFileModalDraggingOver ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>
                      {addFileModalDraggingOver ? 'Déposez les fichiers ici' : 'Glissez-déposez vos fichiers ici'}
                    </p>
                    {processingFiles && (
                      <p className="mt-2 text-sm text-blue-600 flex items-center gap-2">
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                        Préparation des fichiers…
                      </p>
                    )}
                    {!addFileModalDraggingOver && !processingFiles && (
                      <>
                        <p className="text-sm text-gray-500">ou</p>
                        <label
                          htmlFor="add-file-browse-input"
                          className="mt-2 inline-block cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                          Parcourir
                        </label>
                      </>
                    )}
                  </>
                ) : (
                  <div className="space-y-2" key={`files-list-${selectedFiles.length}`}>
                    <p className="text-sm font-medium text-gray-700 mb-4">
                      {selectedFiles.length} fichier(s) sélectionné(s)
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto min-h-[80px]">
                      {selectedFiles.map((file, index) => (
                        <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm text-gray-700 truncate">{file.name}</span>
                            <span className="text-xs text-gray-500 shrink-0">({(file.size / 1024).toFixed(1)} Ko)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                            className="text-red-600 hover:text-red-700 p-1 shrink-0"
                            aria-label={`Retirer ${file.name}`}
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <label
                      htmlFor="add-file-browse-input"
                      className="mt-2 inline-block cursor-pointer px-3 py-1.5 text-sm font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Ajouter d'autres fichiers
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50 sticky bottom-0">
              <button type="button" onClick={closeAddFileModal} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmAddFiles}
                disabled={selectedFiles.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 min-w-[120px]"
              >
                Ajouter {selectedFiles.length > 0 && `(${selectedFiles.length})`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Preview Modal — Design moderne */}
      {previewFile && previewUrl && createPortal(
        <div className="fixed inset-0 z-[100030] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={closeFilePreview} role="dialog" aria-modal="true">
          <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200/50" onClick={e => e.stopPropagation()}>
            {/* En-tête */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/50 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shrink-0">
                  <FontAwesomeIcon icon={previewFile.type === 'application/pdf' || previewFile.name.endsWith('.pdf') ? faFilePdf : faFile} className="text-white w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate">{previewFile.name}</h3>
                  <p className="text-xs text-slate-500">{(previewFile.size / 1024).toFixed(1)} Ko</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setShowPreviewPopout(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 border border-slate-200/50 text-slate-700 hover:bg-slate-100 text-sm font-medium transition-all shadow-sm"><FontAwesomeIcon icon={faExpand} className="w-4 h-4" /><span>Popout</span></button>
                <button type="button" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 border border-slate-200/50 text-slate-700 hover:bg-slate-100 text-sm font-medium transition-all shadow-sm"><FontAwesomeIcon icon={faLink} className="w-4 h-4" /><span>Nouvel onglet</span></button>
                <button type="button" onClick={closeFilePreview} className="rounded-2xl p-2.5 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 transition-all" aria-label="Fermer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
              </div>
            </div>
            {/* Corps */}
            <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-slate-100 to-blue-50/30">
              {(() => {
                const isPdf = previewFile.type === 'application/pdf' || previewFile.name.toLowerCase().endsWith('.pdf');
                const isImage = /^image\/(jpeg|jpg|png|gif|bmp|webp)$/i.test(previewFile.type) || /\.(jpe?g|png|gif|bmp|webp)$/i.test(previewFile.name);
                if (isPdf) return (
                  <div className="flex flex-col w-full h-full min-h-[500px]">
                    <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-200 rounded-t-xl shrink-0">
                      <span className="text-xs font-semibold text-blue-800 flex items-center gap-1"><FontAwesomeIcon icon={faFilePdf} className="text-red-500" /> {previewFile.name}</span>
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1"><FontAwesomeIcon icon={faLink} className="w-3 h-3" /> Ouvrir</a>
                    </div>
                    <iframe src={previewUrl} title={previewFile.name} className="flex-1 w-full rounded-b-xl" style={{ minHeight: 500, border: 'none' }} />
                  </div>
                );
                if (isImage) return (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3 p-3 bg-white/70 backdrop-blur-sm border border-slate-200/50 rounded-2xl shrink-0">
                      <span className="text-sm font-medium text-slate-700">Zoom :</span>
                      <button type="button" onClick={() => setFilePreviewZoom(z => Math.max(0.25, z - 0.25))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"><FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-4 h-4" /></button>
                      <span className="text-sm font-medium text-slate-600 min-w-[3rem] text-center bg-slate-100 px-2 py-1 rounded-lg">{Math.round(filePreviewZoom * 100)}%</span>
                      <button type="button" onClick={() => setFilePreviewZoom(z => Math.min(3, z + 0.25))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"><FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-4 h-4" /></button>
                      <button type="button" onClick={() => { setFilePreviewZoom(1); setFilePreviewRotation(0); setFilePreviewFit('contain'); }} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-all"><FontAwesomeIcon icon={faExpand} className="mr-1 w-4 h-4" />Réinitialiser</button>
                      <div className="h-4 w-px bg-slate-300"></div>
                      <span className="text-sm font-medium text-slate-700">Rotation :</span>
                      <button type="button" onClick={() => setFilePreviewRotation(r => (r - 90 + 360) % 360 as 0|90|180|270)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"><FontAwesomeIcon icon={faRotateLeft} className="w-4 h-4" /></button>
                      <span className="text-sm font-medium text-slate-600 min-w-[2.5rem] text-center bg-slate-100 px-2 py-1 rounded-lg">{filePreviewRotation}°</span>
                      <button type="button" onClick={() => setFilePreviewRotation(r => (r + 90) % 360 as 0|90|180|270)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"><FontAwesomeIcon icon={faRotateRight} className="w-4 h-4" /></button>
                      <div className="h-4 w-px bg-slate-300"></div>
                      <span className="text-sm font-medium text-slate-700">Ajuster :</span>
                      {(['contain','cover','fill'] as const).map(fit => (
                        <button key={fit} type="button" onClick={() => setFilePreviewFit(fit)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${filePreviewFit === fit ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>{fit === 'contain' ? 'Contenir' : fit === 'cover' ? 'Couvrir' : 'Étirer'}</button>
                      ))}
                    </div>
                    <div className="flex items-center justify-center bg-white rounded-2xl shadow-xl p-4 overflow-auto min-h-[400px]">
                      <img src={previewUrl} alt={previewFile.name} className="max-w-full max-h-full w-auto h-auto origin-center transition-transform duration-300" style={{ objectFit: filePreviewFit, transform: `scale(${filePreviewZoom}) rotate(${filePreviewRotation}deg)` }} />
                    </div>
                  </div>
                );
                return (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><FontAwesomeIcon icon={faFile} className="text-slate-400 w-8 h-8" /></div>
                    <p className="text-sm font-medium text-slate-600">Prévisualisation non disponible</p>
                    <p className="text-xs text-slate-400 mt-1">{previewFile.type || 'Type inconnu'}</p>
                  </div>
                );
              })()}
            </div>
            {/* Pied de page */}
            <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200/50 bg-gradient-to-r from-slate-50/70 to-blue-50/30">
              <a href={previewUrl} download={previewFile.name} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:from-emerald-600 hover:to-teal-700 shadow-lg transition-all transform hover:scale-[1.02]"><FontAwesomeIcon icon={faDownload} className="w-4 h-4" />Télécharger</a>
              <button type="button" onClick={closeFilePreview} className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-300/50 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-all"><FontAwesomeIcon icon={faTimes} className="w-4 h-4" />Fermer</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Popout prévisualisation fichier */}
      {showPreviewPopout && previewUrl && previewFile && createPortal(
        <div className="fixed inset-0 z-[100050] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowPreviewPopout(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <h3 className="font-bold text-slate-900 truncate">{previewFile.name}</h3>
              <button type="button" onClick={() => setShowPreviewPopout(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all"><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-50 flex items-center justify-center">
              {previewFile.type.startsWith('image/') ? (
                <img src={previewUrl} alt={previewFile.name} className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-xl" />
              ) : (
                <iframe src={previewUrl} title={previewFile.name} className="w-full" style={{ minHeight: '80vh', border: 'none' }} />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Scan — Design moderne deux colonnes */}
      {showScanModal && createPortal(
        <div
          className="fixed inset-0 z-[100040] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={() => closeScanModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-modal-title"
        >
          <div
            className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/50 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-6 py-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 rounded-2xl blur-xl opacity-20"></div>
                  <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <FontAwesomeIcon icon={faPrint} className="text-white w-6 h-6" />
                  </div>
                </div>
                <div>
                  <h2 id="scan-modal-title" className="text-xl font-bold text-slate-900 truncate">Scan et traitement de documents</h2>
                  <p className="text-sm text-slate-600 mt-0.5">Numérisation et prévisualisation</p>
                </div>
              </div>
              <button type="button" onClick={() => closeScanModal()} className="shrink-0 rounded-2xl p-3 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 transition-all duration-200" aria-label="Fermer">
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>

            {/* Contenu principal en deux colonnes */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-full">
                {/* Colonne gauche - Prévisualisation */}
                <div className="flex flex-col space-y-4">
                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-lg overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                          <FontAwesomeIcon icon={faEye} className="text-white w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Prévisualisation du document</h3>
                          <p className="text-sm text-slate-600">Aperçu du fichier scanné</p>
                        </div>
                      </div>
                    </div>
                    <div className="px-5 pb-5">
                      <div className="rounded-2xl border border-slate-200/50 overflow-auto flex flex-col p-4 bg-gradient-to-br from-slate-100 to-blue-50/30" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                        {scanModalPreviewUrl && scanModalPreviewFile ? (
                          <>
                            <div className="flex flex-wrap gap-2 justify-center mb-4 flex-shrink-0">
                              <button type="button" onClick={() => setShowScanPopout(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 text-sm font-bold transition-all duration-300 shadow-lg transform hover:scale-[1.02]">
                                <FontAwesomeIcon icon={faExpand} className="w-4 h-4" /><span>Ouvrir en popout</span>
                              </button>
                              <button type="button" onClick={() => scanModalPreviewUrl && window.open(scanModalPreviewUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-sm border border-slate-200/50 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-medium transition-all duration-200 shadow-sm">
                                <FontAwesomeIcon icon={faLink} className="w-4 h-4" /><span>Nouvel onglet</span>
                              </button>
                            </div>
                            {(() => {
                              const file = scanModalPreviewFile;
                              const isPdf = file.type === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf'));
                              const isImage = /^image\/(jpeg|jpg|png|gif|bmp|webp)$/i.test(file.type) || /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name || '');
                              return (
                                <div className="flex-1 overflow-auto">
                                  {isPdf ? (
                                    <div className="flex flex-col w-full min-h-[500px]">
                                      <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-200 flex-shrink-0">
                                        <span className="text-xs font-semibold text-blue-800 flex items-center gap-1"><FontAwesomeIcon icon={faFilePdf} className="text-red-500" /> {scanModalPreviewFile.name}</span>
                                        <a href={scanModalPreviewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1"><FontAwesomeIcon icon={faLink} className="w-3 h-3" /> Ouvrir</a>
                                      </div>
                                      <iframe src={scanModalPreviewUrl} title="Aperçu PDF" className="flex-1 w-full" style={{ minHeight: 480, border: 'none' }} />
                                    </div>
                                  ) : isImage ? (
                                    <div className="flex flex-col">
                                      <div className="flex-shrink-0 flex flex-wrap items-center gap-3 p-4 bg-white/70 backdrop-blur-sm border-b border-slate-200/50 rounded-t-2xl">
                                        <span className="text-sm font-medium text-slate-700">Affichage:</span>
                                        <div className="flex items-center gap-2">
                                          <button type="button" onClick={() => setImagePreviewZoom((z) => Math.max(0.25, z - 0.25))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all" title="Zoom arrière"><FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-4 h-4" /></button>
                                          <span className="text-sm font-medium text-slate-600 min-w-[3rem] text-center bg-slate-100 px-2 py-1 rounded-lg">{Math.round(imagePreviewZoom * 100)}%</span>
                                          <button type="button" onClick={() => setImagePreviewZoom((z) => Math.min(3, z + 0.25))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all" title="Zoom avant"><FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-4 h-4" /></button>
                                        </div>
                                        <button type="button" onClick={() => { setImagePreviewZoom(1); setImagePreviewRotation(0); }} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-all"><FontAwesomeIcon icon={faExpand} className="mr-1.5 w-4 h-4" /> Réinitialiser</button>
                                        <div className="h-4 w-px bg-slate-300"></div>
                                        <div className="flex items-center gap-2">
                                          <button type="button" onClick={() => setImagePreviewRotation((r) => (r - 90 + 360) % 360 as 0 | 90 | 180 | 270)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all" title="Pivoter à gauche"><FontAwesomeIcon icon={faRotateLeft} className="w-4 h-4" /></button>
                                          <span className="text-sm font-medium text-slate-600 min-w-[2.5rem] text-center bg-slate-100 px-2 py-1 rounded-lg">{imagePreviewRotation}°</span>
                                          <button type="button" onClick={() => setImagePreviewRotation((r) => (r + 90) % 360 as 0 | 90 | 180 | 270)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all" title="Pivoter à droite"><FontAwesomeIcon icon={faRotateRight} className="w-4 h-4" /></button>
                                        </div>
                                        <div className="h-4 w-px bg-slate-300"></div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-slate-700">Ajuster:</span>
                                          {(['contain', 'cover', 'fill'] as const).map((fit) => (
                                            <button key={fit} type="button" onClick={() => setImagePreviewFit(fit)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${imagePreviewFit === fit ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                                              {fit === 'contain' ? 'Contenir' : fit === 'cover' ? 'Couvrir' : 'Étirer'}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50/30 min-h-[400px]">
                                        <div className="bg-white rounded-2xl overflow-hidden relative flex items-center justify-center w-full shadow-xl" style={{ maxWidth: '100%' }}>
                                          <img
                                            key={scanModalPreviewUrl}
                                            src={scanModalPreviewUrl}
                                            alt="Document scanné"
                                            onLoad={(e) => { const img = e.currentTarget; if (img.naturalWidth && img.naturalHeight) setImagePreviewSize({ w: img.naturalWidth, h: img.naturalHeight }); }}
                                            className="max-w-full max-h-full w-auto h-auto origin-center transition-transform duration-300 object-contain rounded-2xl"
                                            style={{ objectFit: imagePreviewFit, transform: `scale(${imagePreviewZoom}) rotate(${imagePreviewRotation}deg)`, minHeight: 1 }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center p-8 text-center">
                                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><FontAwesomeIcon icon={faFile} className="text-slate-400 w-8 h-8" /></div>
                                      <p className="text-sm font-medium text-slate-600">Format non prévisualisable</p>
                                      <p className="text-xs text-slate-500 mt-1">({file.type || 'inconnu'})</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center py-12">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><FontAwesomeIcon icon={faPrint} className="text-slate-300 w-8 h-8" /></div>
                            <p className="text-sm font-medium text-slate-600">Aucun document à prévisualiser</p>
                            <p className="text-xs text-slate-400 mt-1">Lancez un scan pour afficher l'aperçu ici</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Colonne droite - Contrôles et paramètres */}
                <div className="flex flex-col space-y-4">
                  {/* Périphérique de scan */}
                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-lg overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                          <FontAwesomeIcon icon={faPrint} className="text-white w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Périphérique de scan</h3>
                          <p className="text-sm text-slate-600">Sélectionnez votre scanner</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label htmlFor="scan-modal-scanner" className="block text-sm font-semibold text-slate-700">Scanner disponible</label>
                        {scannersLoading ? (
                          <div className="flex items-center gap-3 rounded-xl border border-slate-200/50 bg-white/70 px-4 py-3 text-sm text-slate-600">
                            <FontAwesomeIcon icon={faSpinner} className="animate-spin w-5 h-5 text-blue-600" />
                            <span>Détection des scanners...</span>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <select
                              id="scan-modal-scanner"
                              value={selectedScanner}
                              onChange={(e) => setSelectedScanner(e.target.value)}
                              className="flex-1 rounded-xl border border-slate-200/50 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white/70 backdrop-blur-sm transition-all"
                            >
                              <option value="">Choisir un scanner...</option>
                              {scanners.map((s) => (
                                <option key={s.id} value={s.id}>{s.name || s.id}</option>
                              ))}
                            </select>
                            <button type="button" onClick={refreshScannersInModal} disabled={scannersLoading} className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-300/50 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-all shadow-sm" title="Rafraîchir">
                              <FontAwesomeIcon icon={faRotateRight} className={scannersLoading ? 'animate-spin' : ''} />
                              <span>Rafraîchir</span>
                            </button>
                          </div>
                        )}
                        {!scannersLoading && scanners.length === 0 && (
                          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5"><FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 w-4 h-4" /></div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-amber-900">Aucun scanner détecté</p>
                                <p className="text-xs text-amber-700 mt-1">Vérifiez le serveur de scan (port 3001) et configurez les scanners dans{' '}
                                  <Link to="/parametres" className="font-medium underline text-amber-800 hover:text-amber-900" onClick={() => closeScanModal()}>Paramètres &gt; Gestion des scanners</Link>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Statut du serveur */}
                      <div className="mt-4 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${scanBackendStatus === 'checking' ? 'bg-amber-500 animate-pulse' : scanBackendStatus === 'ok' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                        <span className={`text-sm font-medium ${scanBackendStatus === 'checking' ? 'text-amber-600' : scanBackendStatus === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {scanBackendStatus === 'checking' && 'Vérification du serveur...'}
                          {scanBackendStatus === 'ok' && 'Serveur de scan : Connecté'}
                          {(scanBackendStatus === 'error' || scanBackendStatus === 'idle') && 'Serveur de scan : Hors ligne'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Paramètres de numérisation */}
                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-lg overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                          <FontAwesomeIcon icon={faTasks} className="text-white w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Paramètres de numérisation</h3>
                          <p className="text-sm text-slate-600">Configuration actuelle</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-xl p-4 border border-slate-200/50">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="font-medium text-slate-700">Format:</span><span className="text-slate-600">{scanSettings.format ?? 'PDF'}</span></div>
                          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"></div><span className="font-medium text-slate-700">Source:</span><span className="text-slate-600">{scanSettings.scanSource ?? 'vitre'}</span></div>
                          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="font-medium text-slate-700">Page:</span><span className="text-slate-600">{scanSettings.pageSize ?? 'A4'}</span></div>
                          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500"></div><span className="font-medium text-slate-700">Résolution:</span><span className="text-slate-600">{scanSettings.resolution ?? 300} dpi</span></div>
                          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-pink-500"></div><span className="font-medium text-slate-700">Couleur:</span><span className="text-slate-600">{scanSettings.color !== false ? 'Oui' : 'N&B'}</span></div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-200/50">
                          <Link to="/parametres" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors" onClick={() => closeScanModal()}>
                            <FontAwesomeIcon icon={faEdit} className="w-4 h-4" />
                            Modifier dans Paramètres &gt; Scanners
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Message d'erreur */}
                  {scanModalError && (
                    <div className={`rounded-2xl border p-4 text-sm backdrop-blur-sm ${scanModalError === 'Scan annulé' ? 'border-slate-300/50 bg-slate-50/70 text-slate-700' : 'border-red-300/50 bg-red-50/70 text-red-800'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${scanModalError === 'Scan annulé' ? 'bg-slate-100' : 'bg-red-100'}`}>
                          <FontAwesomeIcon icon={scanModalError === 'Scan annulé' ? faInfoCircle : faExclamationTriangle} className={`w-4 h-4 ${scanModalError === 'Scan annulé' ? 'text-slate-600' : 'text-red-600'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">{scanModalError === 'Scan annulé' ? 'Information' : 'Erreur de scan'}</p>
                          <p className="mt-1">{scanModalError}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pied de page */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-slate-200/50 bg-gradient-to-r from-slate-50/70 to-blue-50/30 px-6 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleScanInModal()}
                  disabled={scanning || !selectedScanner || scanners.length === 0 || scanBackendStatus === 'error' || scannersLoading}
                  className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-3 text-sm font-bold text-white hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {scanning ? (
                    <><FontAwesomeIcon icon={faSpinner} className="animate-spin w-5 h-5" /><span>Numérisation en cours...</span></>
                  ) : (
                    <><FontAwesomeIcon icon={faPrint} className="w-5 h-5" /><span>Scanner un document</span></>
                  )}
                </button>
                {scanning && (
                  <button type="button" onClick={handleCancelScan} className="inline-flex items-center gap-2 rounded-xl border-2 border-red-300/50 bg-white/70 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-all">
                    <FontAwesomeIcon icon={faTimes} className="w-4 h-4" /><span>Annuler</span>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {scanModalPreviewFile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (scanModalPreviewFile) {
                          const url = URL.createObjectURL(scanModalPreviewFile);
                          const a = document.createElement('a');
                          a.href = url; a.download = scanModalPreviewFile.name || 'scan.pdf';
                          document.body.appendChild(a); a.click();
                          document.body.removeChild(a); URL.revokeObjectURL(url);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:from-emerald-600 hover:to-teal-700 shadow-lg transition-all transform hover:scale-[1.02]"
                    >
                      <FontAwesomeIcon icon={faDownload} className="w-4 h-4" /><span>Télécharger</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddScannedToRow}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:from-blue-600 hover:to-indigo-700 shadow-lg transition-all transform hover:scale-[1.02]"
                    >
                      <FontAwesomeIcon icon={faPlus} className="w-4 h-4" /><span>Ajouter au courrier</span>
                    </button>
                  </>
                ) : (
                  <div className="text-xs text-slate-500 italic">Scannez un document pour débloquer les actions</div>
                )}
                <button type="button" onClick={() => closeScanModal()} className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-300/50 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-all">
                  <FontAwesomeIcon icon={faTimes} className="w-4 h-4" /><span>Fermer</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Popout prévisualisation scan */}
      {showScanPopout && scanModalPreviewUrl && scanModalPreviewFile && createPortal(
        <div className="fixed inset-0 z-[100050] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowScanPopout(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <h3 className="font-bold text-slate-900 truncate">{scanModalPreviewFile.name}</h3>
              <button type="button" onClick={() => setShowScanPopout(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all"><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-50 flex items-center justify-center">
              {scanModalPreviewFile.type.startsWith('image/') ? (
                <img src={scanModalPreviewUrl} alt="Document scanné" className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-xl" />
              ) : (
                <iframe src={scanModalPreviewUrl} title="Aperçu PDF" className="w-full" style={{ minHeight: '80vh', border: 'none' }} />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom Dialogs */}
      <CustomDialog
        isOpen={dialog.isOpen}
        onClose={() => setDialog({ isOpen: false, options: { message: '' } })}
        {...dialog.options}
      />
    </div>
  );
};

export default EnregistrerCourrierListe;
