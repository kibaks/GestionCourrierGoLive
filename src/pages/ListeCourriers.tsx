import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactDOM from 'react-dom';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { courrierService } from '../services/courrierService';
import { Courrier, StatutCourrier, TypeCourrier, Priorite, Role, CategorieFichier, WorkflowEtape, Assignation, Permission, CategorieCourrier, SensCourrier, TypeEntiteOrganisationnelle, Utilisateur, Archive } from '../types';
import { categorieFichierService } from '../services/categorieFichierService';
import { categorieCourrierService } from '../services/categorieCourrierService';
import { auth } from '../config/firebase';
import { userService } from '../services/userService';
import { entiteOrganisationnelleService } from '../services/entiteOrganisationnelleService';
import { entiteTypeService } from '../services/entiteTypeService';
import { directionService } from '../services/directionService';
import { procedureService } from '../services/procedureService';
import { formulaireCourrierService } from '../services/formulaireCourrierService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faEnvelopeOpen, faSync, faEye, faEdit, faTrash, faChevronLeft, faChevronRight, faFile, faFilePdf, faFileAlt, faPaperclip, faFolder, faFolderOpen, faFileWord, faFileExcel, faFileImage, faFileArchive, faFileCode, faPlus, faChevronDown, faChevronRight as faChevronRightIcon, faTimes, faUpload, faPrint, faDownload, faCopy, faPaste, faCheckSquare, faSquare, faSort, faSortUp, faSortDown, faSortAmountDown, faUserCheck, faBuilding, faUsers, faCalendar, faClock, faInfoCircle, faSearch, faExclamationTriangle, faCheckCircle, faTasks, faUser, faUserTie, faFilter, faAt, faPhone, faLink, faTag, faMapMarkerAlt, faGlobe, faEllipsisV, faLayerGroup, faFileImport, faFileExport, faClipboardCheck, faBars, faSpinner, faMagnifyingGlassPlus, faMagnifyingGlassMinus, faRotateRight, faRotateLeft, faExpand, faArrowRight, faDatabase, faHardDrive, faBell, faHashtag, faArrowDown, faArrowUp, faCheck, faBook, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import WordEditor from '../components/WordEditor';
import ExcelEditor from '../components/ExcelEditor';
import CustomDialog, { DialogOptions } from '../components/CustomDialog';
import Preloader from '../components/Preloader';
import SearchableSelect from '../components/SearchableSelect';
import CourriersSkeleton from '../components/CourriersSkeleton';
import ListeCourrierStats from '../components/ListeCourrierStats';
import ListeCourrierStatsCards from '../components/ListeCourrierStatsCards';
import StatsViewToggle from '../components/StatsViewToggle';
import ListeControls from '../components/ListeControls';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { generateAccusePdf } from '../services/accuseReceptionService';
import ExcelJS from 'exceljs';
import { exportSettingsService, ExportSettings } from '../services/exportSettingsService';
import { archivageService } from '../services/archivageService';
import { laravelApiService } from '../services/laravelApiService';
import { adminService } from '../services/adminService';
import { isSecretaireDG } from '../services/orientationService';
import { taskCompletionService } from '../services/taskCompletionService';
import { realTimeTaskSyncService } from '../services/realTimeTaskSyncService';
import { scannerService, checkScannerBackendHealth, Scanner, DEFAULT_SCAN_SETTINGS, type ScanSettings, type ScanFormat, type ScanSource, type ScanOrientation, type ScanPageSize } from '../services/scannerService';
import { userSettingsService } from '../services/userSettingsService';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
// Worker PDF.js : servi depuis public/ pour éviter "Failed to fetch dynamically imported module" avec Vite
const PDF_WORKER_SRC = '/pdf.worker.min.mjs';

// Helper pour appliquer la casse choisie sur les titres/sous-titres
const applyTitleCase = (text: string, mode?: 'normal' | 'uppercase' | 'lowercase') => {
  if (!text) return '';
  if (mode === 'uppercase') return text.toUpperCase();
  if (mode === 'lowercase') return text.toLowerCase();
  return text;
};

// Composant pour afficher le contenu des fichiers texte
const TextFileViewer: React.FC<{ url: string }> = ({ url }) => {
  const [content, setContent] = useState<string>('Chargement...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Impossible de charger le fichier');
        return res.text();
      })
      .then(text => setContent(text))
      .catch(err => {
        setError(err.message);
        setContent('');
      });
  }, [url]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 bg-gray-50 p-4 rounded border h-full overflow-auto">
      {content}
    </pre>
  );
};

// Aperçu PDF : rendu de la 1ère page dans un canvas ; fillContainer=true adapte la taille au conteneur (page entière visible)
const PdfPreviewCanvas: React.FC<{ url: string; fillContainer?: boolean; showPageLabel?: boolean }> = ({ url, fillContainer = false, showPageLabel = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [numPages, setNumPages] = useState<number>(1);

  useEffect(() => {
    if (!fillContainer || !containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? {};
      if (width > 0 && height > 0) setContainerSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) setContainerSize({ w: Math.floor(width), h: Math.floor(height) });
    return () => ro.disconnect();
  }, [fillContainer, loading]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
        }
        const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
        if (cancelled) return;
        setNumPages(doc.numPages);
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const containerW = fillContainer && containerSize?.w ? containerSize.w : 500;
        const containerH = fillContainer && containerSize?.h ? containerSize.h : 480;
        const scale = Math.min(containerW / viewport.width, containerH / viewport.height, 3);
        const fitViewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = fitViewport.width;
        canvas.height = fitViewport.height;
        await page.render({ canvasContext: ctx, viewport: fitViewport } as any).promise;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url, fillContainer, containerSize?.w, containerSize?.h]);

  if (error) {
    return (
      <div className="flex flex-col w-full h-full min-h-0 items-center justify-center p-6 bg-white rounded-lg border border-red-200">
        <FontAwesomeIcon icon={faFilePdf} className="text-4xl text-red-400 mb-3" />
        <p className="text-sm text-red-600 text-center font-medium">{error}</p>
        <p className="text-xs text-gray-500 mt-2 text-center max-w-xs">Affichage du PDF impossible ; le fichier sera bien ajouté à la liste.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col w-full ${fillContainer ? 'h-full min-h-0' : ''}`}>
      <div className={fillContainer ? 'flex-1 min-h-0 overflow-auto flex items-center justify-center bg-[#f8fafc] p-4' : 'flex flex-1 items-center justify-center overflow-hidden min-h-0 bg-[#f8fafc] p-4'}>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">Chargement de l'aperçu PDF…</span>
            <div className="w-64 h-80 bg-gray-200 rounded animate-pulse max-w-full" />
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="bg-white rounded-md shadow-sm ring-1 ring-gray-200/80 overflow-hidden">
              <canvas
                ref={canvasRef}
                className="max-w-full block"
                style={{ display: 'block', objectFit: 'contain' }}
              />
            </div>
            {showPageLabel && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                Page 1{numPages > 1 ? ` / ${numPages}` : ''}
              </p>
            )}
          </div>
        )}
      </div>
      {!fillContainer && showPageLabel && (
        <p className="text-xs text-gray-500 mt-2 text-center px-2 flex-shrink-0">
          Aperçu de la 1ère page du PDF scanné.
        </p>
      )}
    </div>
  );
};

// Petit helper pour rendre les modals au niveau du <body> (toujours au premier plan)
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(children, document.body);
};

const ListeCourriers: React.FC = () => {
  console.log('🔄 ListeCourriers component rendered');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const { user, hasPermission } = auth;
  const fallbackUid = user?.id ?? undefined;
  
  // Debug pour vérifier que hasPermission est accessible (limité)
  if (process.env.NODE_ENV === 'development') {
    // console.log('🔐 [DEBUG] hasPermission disponible:', typeof hasPermission, hasPermission ? 'OK' : 'KO');
  }
  
  // Fonction de sécurité pour vérifier les permissions
  const checkPermission = (permission: Permission): boolean => {
    if (!hasPermission) {
      console.warn('hasPermission non disponible, autorisation refusée par défaut');
      return false;
    }
    return hasPermission(permission);
  };
  
  // Fonction pour détecter si l'expéditeur est une organisation interne
  const isInternalOrganization = (expediteur?: string): boolean => {
    if (!expediteur) return false;
    
    // Liste des organisations internes connues
    const internalOrganizations = [
      'Direction Générale',
      'Direction Financière',
      'Direction Administrative',
      'Direction Technique',
      'Direction des Ressources Humaines',
      'Direction Commerciale',
      'Service Informatique',
      'Service Juridique',
      'Service Comptabilité',
      'Division',
      'Département',
      'Bureau',
      'Cellule'
    ];
    
    const expediteurLower = expediteur.toLowerCase();
    
    // Vérifier si l'expéditeur contient des termes d'organisation interne
    const hasInternalKeywords = internalOrganizations.some(org => 
      expediteurLower.includes(org.toLowerCase())
    );
    
    // Vérifier si ce n'est pas un email ou une source externe évidente
    const isExternalSource = expediteurLower.includes('@') || 
                           expediteurLower.includes('externe') ||
                           expediteurLower.includes('email') ||
                           expediteurLower.includes('gmail') ||
                           expediteurLower.includes('yahoo') ||
                           expediteurLower.includes('outlook') ||
                           expediteurLower.includes('hotmail');
    
    return hasInternalKeywords && !isExternalSource;
  };
  
  // Fonction pour créer un fichier d'accusé de réception automatiquement
  const createAccuseReceptionFile = async (courrier: Courrier): Promise<void> => {
    try {
      console.log('📄 [DEBUG] Création du fichier d\'accusé de réception pour:', courrier.numero);

      // Récupérer tous les fichiers du courrier
      const fichiers = dossiersFichiers.get(courrier.id) || [];
      const hasFiles = fichiers.some(f =>
        f.type === 'fichier' &&
        !f.estAccuseReception &&
        !f.nom.startsWith('annoté_') &&
        !f.nom.startsWith('traité_') &&
        !f.nom.startsWith('final_')
      );

      if (!hasFiles) {
        console.log('📄 [DEBUG] Aucun document chargé, accusé non généré');
        return;
      }

      if (!user) return;

      // Générer le PDF tamponné reprenant tous les fichiers chargés
      const accuseFile = await generateAccusePdf(courrier, {} as any, user, fichiers);

      // Trouver ou créer le dossier "Accusés de réception"
      let accuseDossierId = fichiers.find(d => d.type === 'categorie' && d.nom === 'Accusés de réception')?.id;
      if (!accuseDossierId) {
        const newDossier = await categorieFichierService.createCategorie(
          courrier.id,
          'Accusés de réception',
          user?.id
        );
        accuseDossierId = newDossier.id;
        await loadDossiersFichiers(courrier.id);
      }

      // Ajouter le fichier d'accusé
      await categorieFichierService.createFichier(
        courrier.id,
        accuseFile.name,
        accuseFile,
        accuseDossierId,
        user?.id,
        undefined,
        true // estAccuseReception
      );
      
      console.log('[DEBUG] Fichier d\'accusé de réception créé avec succès');
    } catch (error) {
      console.error('[DEBUG] Erreur lors de la création du fichier d\'accusé:', error);
      throw error;
    }
  };
  
  
  // Fonctions pour gérer le dialog
  const showAlert = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', title?: string) => {
    setDialog({
      isOpen: true,
      message,
      type,
      title,
      variant: 'alert',
      confirmText: 'OK',
      onConfirm: () => {},
      onClose: () => {}
    });
  };
  
  const [courriers, setCourriers] = useState<Courrier[]>([]);
  const [allCourriers, setAllCourriers] = useState<Courrier[]>([]);
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loadingCourriers, setLoadingCourriers] = useState(false);
  const [loadingMoreCourriers, setLoadingMoreCourriers] = useState(false);
  const [loadingOperations, setLoadingOperations] = useState<{
    insert: boolean;
    delete: boolean;
    update: boolean;
    operationName?: string;
    progress?: number;
    completed?: boolean;
    success?: boolean;
    error?: string;
  }>({
    insert: false,
    delete: false,
    update: false
  });

  // États pour l'état de stockage
  interface StorageInfo {
    totalSize: number;
    usedSize: number;
    availableSize: number;
    usagePercent: number;
    totalFiles: number;
    items: Array<{ extension: string; count: number; size: number; percentage: number }>;
  }
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [selectedCourriers, setSelectedCourriers] = useState<Set<string>>(new Set());
  const [expandedCourriers, setExpandedCourriers] = useState<Set<string>>(new Set());
  const [dossiersFichiers, setDossiersFichiers] = useState<Map<string, CategorieFichier[]>>(new Map());
  const dossiersFichiersRef = useRef(dossiersFichiers);
  useEffect(() => { dossiersFichiersRef.current = dossiersFichiers; }, [dossiersFichiers]);
  // État optimisé pour stocker seulement les counts (pas tous les fichiers) - pour affichage rapide
  const [filesCounts, setFilesCounts] = useState<Map<string, {nbFichiers: number; nbCategories: number}>>(new Map());
  const [loadingFichiersCourrierId, setLoadingFichiersCourrierId] = useState<string | null>(null);
  const [availableDirections, setAvailableDirections] = useState<string[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [availableSousServices, setAvailableSousServices] = useState<string[]>([]);
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [dossierModalData, setDossierModalData] = useState<{
    courrierId: string;
    parentId?: string;
    parentName?: string;
  } | null>(null);
  const [newDossierName, setNewDossierName] = useState('');
  const [draggedOverDossier, setDraggedOverDossier] = useState<string | null>(null);
  const [draggedOverCourrier, setDraggedOverCourrier] = useState<string | null>(null);
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [addFileModalData, setAddFileModalData] = useState<{
    courrierId: string;
    dossierId?: string;
  } | null>(null);
  const [addFileModalDraggingOver, setAddFileModalDraggingOver] = useState(false);
  const [importLimits, setImportLimits] = useState<{ maxSizeMo: number; compressImages: boolean }>({ maxSizeMo: 100, compressImages: true });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>('');
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [showScanModal, setShowScanModal] = useState(false);
  /** Quand défini, le fichier scanné sera envoyé directement à ce courrier (modal scan ouvert depuis une ligne courrier) */
  const [scanModalTarget, setScanModalTarget] = useState<{ courrierId: string; dossierId?: string } | null>(null);
  const [scanModalPreviewFile, setScanModalPreviewFile] = useState<File | null>(null);
  const [scanModalPreviewUrl, setScanModalPreviewUrl] = useState<string | null>(null);
  /** ID de la prévisualisation côté API (stockage scan-preview) pour même lecture que les PDF */
  const [scanModalPreviewId, setScanModalPreviewId] = useState<string | null>(null);
  const [scanModalError, setScanModalError] = useState<string | null>(null);
  const [scanBackendStatus, setScanBackendStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [scannersLoading, setScannersLoading] = useState(false);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  // Popout pour la prévisualisation du document scanné
  const [showScanPopout, setShowScanPopout] = useState(false);
  const [showAccuseModal, setShowAccuseModal] = useState(false);
  const [accuseModalCourrier, setAccuseModalCourrier] = useState<Courrier | null>(null);
  const [accuseFiles, setAccuseFiles] = useState<File[]>([]);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    phase: 'idle' | 'uploading' | 'done';
    total: number;
    current: number;
    currentFileName: string | null;
    failed: { fileName: string; error: string }[];
    succeeded: number;
  } | null>(null);
  const [isAddingAccuses, setIsAddingAccuses] = useState(false);
  const [showViewFileModal, setShowViewFileModal] = useState(false);
  const [viewFileData, setViewFileData] = useState<{
    fichier: CategorieFichier;
    url: string;
    loadDone?: boolean;
  } | null>(null);
  const [imagePreviewSize, setImagePreviewSize] = useState<{ w: number; h: number } | null>(null);
  const [imagePreviewZoom, setImagePreviewZoom] = useState(1);
  const [imagePreviewRotation, setImagePreviewRotation] = useState<0 | 90 | 180 | 270>(0);
  const [imagePreviewFit, setImagePreviewFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [editMode, setEditMode] = useState<'view' | 'edit'>('view');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [copiedItems, setCopiedItems] = useState<CategorieFichier[]>([]);
  const [draggedItem, setDraggedItem] = useState<CategorieFichier | null>(null);
  const [itemsPerPage] = useState(10);
  const [formConfig, setFormConfig] = useState(formulaireCourrierService.getConfig());
  const isFormConfigured = useMemo(() => formulaireCourrierService.isFormulaireConfigured(formConfig), [formConfig]);
  const [filters, setFilters] = useState({
    statut: '',
    type: '',
    sens: '',
    search: '',
    priorite: '',
    direction: '',
    service: '',
    sousService: '',
    dateDebut: '',
    dateFin: '',
    categorie: '', // Filtre pour afficher uniquement les courriers d'une catégorie spécifique
    mesAssignations: false, // Filtre pour afficher uniquement les courriers assignés à l'utilisateur
    nonClassifies: false // Filtre pour afficher uniquement les courriers non classés
  });
  const debouncedSearch = useDebouncedValue(filters.search, 350);
  /** Sélections par niveau pour les filtres dynamiques (entités organisationnelles) */
  const [filterSelectionIds, setFilterSelectionIds] = useState<(string | null)[]>([]);

  // Rafraîchir la config formulaire au retour sur la page (onglet ou fenêtre) pour que l'état "import activé/désactivé" soit à jour
  useEffect(() => {
    const refreshFormConfig = () => setFormConfig(formulaireCourrierService.getConfig());
    const onFocus = () => refreshFormConfig();
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshFormConfig(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Synchroniser les paramètres URL avec les filtres au chargement
  useEffect(() => {
    const urlSens = searchParams.get('sens');
    const urlType = searchParams.get('type');
    if (urlSens || urlType) {
      setFilters(prev => ({
        ...prev,
        sens: urlSens || prev.sens,
        type: urlType || prev.type
      }));
    }
  }, []); // Seulement au montage

  // Mettre à jour l'URL lorsque les filtres sens ou type changent
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    if (filters.sens) {
      newSearchParams.set('sens', filters.sens);
    } else {
      newSearchParams.delete('sens');
    }
    if (filters.type) {
      newSearchParams.set('type', filters.type);
    } else {
      newSearchParams.delete('type');
    }
    setSearchParams(newSearchParams, { replace: true });
  }, [filters.sens, filters.type]);
  const [mesAssignations, setMesAssignations] = useState<Map<string, Assignation>>(new Map());
  const [sortBy, setSortBy] = useState<string>('dateEnregistrement');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // Par défaut, décroissant (derniers enregistrés en premier)
  const [groupBy, setGroupBy] = useState<'none' | 'statut' | 'priorite' | 'type' | 'sens' | 'direction' | 'service' | 'dateReception' | 'dateEnregistrement'>('direction'); // Par défaut : chaque cas rangé à sa direction
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [courrierFolders, setCategorieCourriers] = useState<CategorieCourrier[]>([]);
  const [courrierFolderMap, setCategorieCourrierMap] = useState<Record<string, string | null>>({});
  const [folderViewMode, setFolderViewMode] = useState<'liste' | 'arborescence'>(() => {
    try {
      const saved = localStorage.getItem('listecourriers_folder_view_mode');
      if (saved === 'liste' || saved === 'arborescence') return saved;
    } catch { /* ignore */ }
    return 'arborescence';
  });
  useEffect(() => {
    try {
      localStorage.setItem('listecourriers_folder_view_mode', folderViewMode);
    } catch { /* ignore */ }
  }, [folderViewMode]);

  // État pour le mode d'affichage des statistiques
  const [statsView, setStatsView] = useState<'cards' | 'charts' | 'none'>(() => {
    try {
      const saved = localStorage.getItem('listecourriers_stats_view');
      if (saved === 'cards' || saved === 'charts' || saved === 'none') return saved;
    } catch { /* ignore */ }
    return 'charts'; // Par défaut: graphiques
  });
  useEffect(() => {
    try {
      localStorage.setItem('listecourriers_stats_view', statsView);
    } catch { /* ignore */ }
  }, [statsView]);

  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [showBulkActionsModal, setShowBulkActionsModal] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'move' | 'rename' | null>(null);
  const [bulkMoveTargetFolderId, setBulkMoveTargetFolderId] = useState<string | null>(null);
  const [bulkRenamePrefix, setBulkRenamePrefix] = useState('');
  const [bulkRenameSuffix, setBulkRenameSuffix] = useState('');
  
  // États pour la navigation hiérarchique des filtres d'entités
  const [hierarchicalLevel, setHierarchicalLevel] = useState<0 | 1 | 2 | 3 | 4>(0); // 0: direction, 1: division, 2: service, 3: sous-service, 4: bureau
  const [selectedParentEntity, setSelectedParentEntity] = useState<string | null>(null);
  const [hierarchicalPath, setHierarchicalPath] = useState<Array<{ id: string; nom: string; type: TypeEntiteOrganisationnelle }>>([]);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderModalName, setFolderModalName] = useState('');
  const [folderModalParentId, setFolderModalParentId] = useState<string | undefined>(undefined);
  const [folderEditingId, setFolderEditingId] = useState<string | null>(null);
  const [folderInlineEditId, setFolderInlineEditId] = useState<string | null>(null);
  const [folderInlineEditName, setFolderInlineEditName] = useState('');
  const [folderInlineAddParentId, setFolderInlineAddParentId] = useState<string | null>(null);
  const [folderInlineAddName, setFolderInlineAddName] = useState('');
  const [draggedCourrierId, setDraggedCourrierId] = useState<string | null>(null);
  const [draggedOverFolderId, setDraggedOverFolderId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogOptions & { isOpen: boolean }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  // IDs des catégories existantes (pour ne pas « perdre » les courriers dont la catégorie a été supprimée ou n'existe plus)
  const validFolderIds = useMemo(
    () => new Set(courrierFolders.map(f => String(f.id))),
    [courrierFolders]
  );

  const filteredCourriers = useMemo(() => applyFilters(), [
    filters.statut,
    filters.type,
    filters.sens,
    debouncedSearch,
    filters.priorite,
    filters.direction,
    filters.service,
    filters.sousService,
    filters.dateDebut,
    filters.dateFin,
    filters.categorie,
    filters.mesAssignations,
    filters.nonClassifies,
    allCourriers,
    courriers,
    sortBy,
    sortOrder,
    courrierFolderMap,
    validFolderIds,
  ]);

  // Lookup normalisé courrier → catégorie (clé toujours string pour éviter disparitions dans les catégories)
  const getFolderIdForCourrier = useCallback((courrierId: string | undefined) => {
    const key = courrierId != null ? String(courrierId) : '';
    const v = courrierFolderMap[key];
    return v != null && v !== '' ? v : null;
  }, [courrierFolderMap]);
  // Catégorie effective : null si pas de catégorie ou si la catégorie n'existe plus → affichés en « Courriers non classés »
  const getEffectiveFolderIdForCourrier = useCallback(
    (courrierId: string | undefined) => {
      const fid = getFolderIdForCourrier(courrierId);
      if (fid == null || fid === '') {
        return null;
      }
      const fidStr = String(fid);
      if (!validFolderIds.has(fidStr)) {
        return null;
      }
      return fidStr;
    },
    [getFolderIdForCourrier, validFolderIds]
  );

  // Chargement progressif avec bouton "voir plus"
  const [visibleCount, setVisibleCount] = useState(itemsPerPage);
  
  // Chargement progressif pour les courriers non classés
  const [uncategorizedVisibleCount, setUncategorizedVisibleCount] = useState(itemsPerPage);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Pagination par catégorie en mode arborescence (évite de rendre 500+ lignes d'un coup)
  const folderItemsPerPage = 10;
  const [folderVisibleLimits, setFolderVisibleLimits] = useState<Map<string, number>>(new Map());
  const [rootVisibleLimit, setRootVisibleLimit] = useState<number>(folderItemsPerPage);
  const [loadingFolderMore, setLoadingFolderMore] = useState<Set<string>>(new Set());
  
  // Chargement progressif des dossiers en mode arborescence
  const [allFolders, setAllFolders] = useState<CategorieCourrier[]>([]);
  const [visibleFolders, setVisibleFolders] = useState<CategorieCourrier[]>([]);
  const [loadingMoreFolders, setLoadingMoreFolders] = useState(false);
  const [foldersBatchSize] = useState(20);

  // Réinitialiser le nombre visible quand les filtres changent
  useEffect(() => {
    setVisibleCount(itemsPerPage);
    setUncategorizedVisibleCount(itemsPerPage);
    setFolderVisibleLimits(new Map());
    setRootVisibleLimit(folderItemsPerPage);
    
    // Réinitialiser aussi les dossiers visibles
    if (allFolders.length > 0) {
      const firstBatch = allFolders.slice(0, foldersBatchSize);
      setVisibleFolders(firstBatch);
    }
  }, [filters, itemsPerPage]);
  
  // Réinitialiser les dossiers visibles quand tous les dossiers changent
  useEffect(() => {
    if (allFolders.length > 0) {
      const firstBatch = allFolders.slice(0, foldersBatchSize);
      setVisibleFolders(firstBatch);
    }
  }, [allFolders, foldersBatchSize]);

  // Charger plus de dossiers
  const loadMoreFolders = async () => {
    if (loadingMoreFolders || visibleFolders.length >= allFolders.length) return;
    
    setLoadingMoreFolders(true);
    
    // Simuler un délai pour montrer l'animation de chargement
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const currentLength = visibleFolders.length;
    const nextBatch = allFolders.slice(currentLength, currentLength + foldersBatchSize);
    
    setVisibleFolders(prev => [...prev, ...nextBatch]);
    setLoadingMoreFolders(false);
  };
  
  const handleLoadMore = () => {
    setLoadingMore(true);
    // Simuler un délai pour afficher le skeleton
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + itemsPerPage, filteredCourriers.length));
      setLoadingMore(false);
    }, 500);
  };

  // Charger plus de courriers dans une catégorie (arborescence)
  const handleLoadMoreInFolder = (folderKey: string) => {
    setLoadingFolderMore(prev => new Set(prev).add(folderKey));
    setTimeout(() => {
      setFolderVisibleLimits(prev => {
        const next = new Map(prev);
        const current = next.get(folderKey) ?? folderItemsPerPage;
        next.set(folderKey, current + folderItemsPerPage);
        return next;
      });
      setLoadingFolderMore(prev => {
        const next = new Set(prev);
        next.delete(folderKey);
        return next;
      });
    }, 300);
  };

  // Charger plus de courriers non classés (arborescence)
  const handleLoadMoreRootCourriers = () => {
    setRootVisibleLimit(prev => prev + folderItemsPerPage);
  };
  // Menu contextuel
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    courrier: Courrier | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    courrier: null
  });
  useEffect(() => {
    const onGlobalClick = () => setContextMenu(prev => ({ ...prev, open: false, courrier: null }));
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onGlobalClick();
    };
    window.addEventListener('click', onGlobalClick);
    window.addEventListener('contextmenu', onGlobalClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('click', onGlobalClick);
      window.removeEventListener('contextmenu', onGlobalClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  // À l'ouverture du menu contextuel : vérifier si le courrier est déjà orienté vers le DG (Set ou assignations du courrier)
  useEffect(() => {
    if (!contextMenu.open || !contextMenu.courrier) {
      setContextMenuCourrierOrientedToDG(false);
      return;
    }
    const c = contextMenu.courrier;
    const cid = String(c.id);
    if (courrierIdsAssignedToDG.has(cid)) {
      setContextMenuCourrierOrientedToDG(true);
      return;
    }
    const dgUser = adminService.getDirecteurGeneral();
    if (!dgUser) {
      setContextMenuCourrierOrientedToDG(false);
      return;
    }
    courrierService.getAssignationsByCourrier(cid).then(assignations => {
      const oriented = assignations.some(a => String(a.assigneA) === String(dgUser.id));
      setContextMenuCourrierOrientedToDG(oriented);
    }).catch(() => setContextMenuCourrierOrientedToDG(false));
  }, [contextMenu.open, contextMenu.courrier?.id]);

  // À l'ouverture du menu contextuel : vérifier si le courrier est déjà orienté vers un directeur (pour les secrétaires de direction)
  useEffect(() => {
    if (!contextMenu.open || !contextMenu.courrier || !user || user.role !== Role.SECRETAIRE || !user.direction || user.direction === 'Direction Générale') {
      setContextMenuCourrierOrientedToDirector(false);
      return;
    }
    const c = contextMenu.courrier;
    const cid = String(c.id);
    if (courrierIdsAssignedToDirectors.has(cid)) {
      setContextMenuCourrierOrientedToDirector(true);
      return;
    }
    const director = getAppropriateDirector(user);
    if (!director) {
      setContextMenuCourrierOrientedToDirector(false);
      return;
    }
    courrierService.getAssignationsByCourrier(cid).then(assignations => {
      const oriented = assignations.some(a => String(a.assigneA) === String(director.id));
      setContextMenuCourrierOrientedToDirector(oriented);
    }).catch(() => setContextMenuCourrierOrientedToDirector(false));
  }, [contextMenu.open, contextMenu.courrier?.id, user]);

  // Helper: extraire l'objet d'un courrier en nettoyant le HTML et en tombant sur extraFields si vide
  const getCourrierObjet = (courrier: Courrier): string => {
    const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (courrier.objet) {
      const clean = stripHtml(courrier.objet);
      // Ignorer le placeholder "Sans objet" écrit par d'anciennes mises à jour partielles
      // afin de retomber sur extraFields si l'objet réel y est présent
      if (clean && clean.toLowerCase() !== 'sans objet') return clean;
    }
    // Fallback sur extraFields si la colonne directe est vide ou contient du HTML vide
    const ef = (courrier as any).extraFields as Record<string, unknown> | null | undefined;
    const fromExtra = ef?.objet ?? ef?.sujet ?? ef?.object;
    if (fromExtra) {
      const clean = stripHtml(String(fromExtra));
      if (clean) return clean;
    }
    return '';
  };

  // Helper: retrouver la date de réception depuis un champ dynamique si configuré (sinon fallback core)
  const getDynamicReceptionDateValue = (courrier: Courrier): any => {
    try {
      const sens = (courrier as Courrier & { sens?: SensCourrier }).sens ?? SensCourrier.ENTRANT;
      const sections = formConfig[sens]?.[courrier.type] || [];
      const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // Aplatir tous les champs
      const allFields = sections.flatMap(sec => (sec.columns || []).flatMap(col => col.fields || []));
      // Chercher un champ de type date/datetime lié à la réception
      const candidate = allFields.find(f => {
        const name = normalize(f.name || '');
        const label = normalize(f.label || '');
        const isDateType = (f.type === 'datetime') || name.includes('date') || label.includes('date');
        const isReception = name.includes('reception') || label.includes('reception');
        return isDateType && isReception;
      });
      if (candidate && candidate.name) {
        const val = courrier.extraFields?.[candidate.name];
        if (val) return val;
      }
      // Fallback sur quelques clés communes si le nom exact diffère
      const commonKeys = ['dateReception', 'date_reception', 'dateReceptionCourrier', 'date_reception_courrier'];
      for (const key of commonKeys) {
        const v = courrier.extraFields?.[key as keyof typeof courrier.extraFields];
        if (v) return v;
      }
    } catch {}
    return undefined;
  };

  // Helper: retrouver la priorité depuis champ dynamique si configuré
  const getDynamicPriorityValue = (courrier: Courrier): any => {
    try {
      const sens = (courrier as Courrier & { sens?: SensCourrier }).sens ?? SensCourrier.ENTRANT;
      const sections = formConfig[sens]?.[courrier.type] || [];
      const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const allFields = sections.flatMap(sec => (sec.columns || []).flatMap(col => col.fields || []));
      const candidate = allFields.find(f => {
        const name = normalize(f.name || '');
        const label = normalize(f.label || '');
        const hasUrgence = name.includes('urgence') || label.includes('urgence') || name.includes('urgent') || label.includes('urgent');
        const hasPriorite = name.includes('priorite') || label.includes('priorite') || name.includes('priorité') || label.includes('priorité');
        return hasUrgence || hasPriorite;
      });
      if (candidate?.name) {
        let val: any = courrier.extraFields?.[candidate.name];
        // Gérer les structures { value, label, name, code, key, text } et tableaux
        if (Array.isArray(val)) {
          val = val[0];
        }
        if (val && typeof val === 'object') {
          const possibleKeys = ['value', 'label', 'name', 'code', 'key', 'text'];
          for (const k of possibleKeys) {
            if (val[k] !== undefined && val[k] !== null && `${val[k]}`.trim() !== '') {
              val = val[k];
              break;
            }
          }
        }
        if (val !== undefined && val !== null && `${val}`.trim() !== '') {
          // Si le champ a des options, essayer de mapper via l'index ou la correspondance de texte
          if (candidate.options && candidate.options.length > 0) {
            const strVal = String(val).trim();
            const numIdx = Number(strVal);
            if (!Number.isNaN(numIdx) && numIdx >= 0 && numIdx < candidate.options.length) {
              return candidate.options[numIdx];
            }
            const normVal = normalize(strVal);
            // Trouver l'option la plus proche (inclusion réciproque)
            const foundOpt = candidate.options.find(opt => {
              const nopt = normalize(opt);
              return nopt === normVal || nopt.includes(normVal) || normVal.includes(nopt);
            });
            if (foundOpt) return foundOpt;
          }
          return val;
        }
      }
      const commonKeys = ['priorite', 'urgence', 'niveauUrgence', 'niveau_urgence'];
      for (const key of commonKeys) {
        let v: any = courrier.extraFields?.[key as keyof typeof courrier.extraFields];
        if (Array.isArray(v)) {
          v = v[0];
        }
        if (v && typeof v === 'object') {
          const possibleKeys = ['value', 'label', 'name', 'code', 'key', 'text'];
          for (const k of possibleKeys) {
            if (v[k] !== undefined && v[k] !== null && `${v[k]}`.trim() !== '') {
              v = v[k];
              break;
            }
          }
        }
        if (v !== undefined && v !== null && `${v}`.trim() !== '') return v;
      }

      // Fallback ultime: scanner toutes les clés de extraFields à la recherche d'une clé contenant priorite/urgence
      if (courrier.extraFields) {
        for (const [k, raw] of Object.entries(courrier.extraFields)) {
          const nk = normalize(k);
          if (nk.includes('priorite') || nk.includes('priorité') || nk.includes('urgence') || nk.includes('urgent')) {
            let v: any = raw;
            if (Array.isArray(v)) v = v[0];
            if (v && typeof v === 'object') {
              const possibleKeys = ['value', 'label', 'name', 'code', 'key', 'text'];
              for (const key of possibleKeys) {
                if (v[key] !== undefined && v[key] !== null && `${v[key]}`.trim() !== '') {
                  v = v[key];
                  break;
                }
              }
            }
            if (v !== undefined && v !== null && `${v}`.trim() !== '') return v;
          }
        }
      }
    } catch {}
    return undefined;
  };

  const mapToPriorite = (value: any): Priorite | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      // Slider 0..3
      if (value <= 0) return Priorite.BASSE;
      if (value === 1) return Priorite.NORMALE;
      if (value === 2) return Priorite.HAUTE;
      if (value >= 3) return Priorite.URGENTE;
    }
    // Tenter numérique sous forme de chaîne
    // Extraire le premier chiffre si présent (ex: "3 - Urgente")
    const numMatch = String(value).match(/(\d+)/);
    let maybeNum = Number(String(value).trim());
    if (numMatch && !Number.isNaN(Number(numMatch[1]))) {
      maybeNum = Number(numMatch[1]);
    }
    if (!Number.isNaN(maybeNum)) {
      if (maybeNum <= 0) return Priorite.BASSE;
      if (maybeNum === 1) return Priorite.NORMALE;
      if (maybeNum === 2) return Priorite.HAUTE;
      if (maybeNum >= 3) return Priorite.URGENTE;
    }
    const str = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    // Détection par sous-chaînes (plus tolérant)
    if (str.includes('urgent') || str.includes('critique') || str.includes('immed')) return Priorite.URGENTE;
    if (str.includes('tres urgent') || str.includes('tres-urgent') || str.includes('tresurgent')) return Priorite.URGENTE;
    if (str.includes('haut') || str.includes('eleve') || str.includes('elevee') || str.includes('elev') || str.includes('high')) return Priorite.HAUTE;
    if (str.includes('normal') || str.includes('moyen') || str.includes('moyenne') || str.includes('standard') || str.includes('medium')) return Priorite.NORMALE;
    if (str.includes('bas') || str.includes('faibl')) return Priorite.BASSE;
    if (['basse', 'faible', 'low'].includes(str)) return Priorite.BASSE;
    if (['normale', 'normal', 'medium', 'moyenne'].includes(str)) return Priorite.NORMALE;
    if (['haute', 'elevee', 'élevée', 'high'].includes(str)) return Priorite.HAUTE;
    if (['urgente', 'urgence', 'urgent', 'critique', 'very high'].includes(str)) return Priorite.URGENTE;
    return null;
  };

  const getPrioriteLabel = (priorite: Priorite | string | null | undefined): string => {
    if (!priorite) return 'Priorité inconnue';
    const p = String(priorite).toUpperCase() as Priorite;
    switch (p) {
      case Priorite.BASSE:
        return 'Faible';
      case Priorite.NORMALE:
        return 'Normale';
      case Priorite.HAUTE:
        return 'Urgent';
      case Priorite.URGENTE:
        return 'Très urgent';
      default:
        return String(priorite);
    }
  };
  
  // États pour les modals
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [selectedCourrierForResume, setSelectedCourrierForResume] = useState<Courrier | null>(null);
  const [showRegistreModal, setShowRegistreModal] = useState(false);
  const [showRegistrePreviewModal, setShowRegistrePreviewModal] = useState(false);
  const [registrePreviewUrl, setRegistrePreviewUrl] = useState<string | null>(null);
  const [registreConfig, setRegistreConfig] = useState({
    title: 'Cahier registre des Courriers',
    includeStats: true,
    showBorders: true,
    paperSize: 'a4' as 'a4' | 'a3' | 'letter',
    orientation: 'portrait' as 'portrait' | 'landscape',
    fontSize: 9 as 8 | 9 | 10 | 11 | 12,
    tableMargin: 10 as number,
    tableAlign: 'center' as 'left' | 'center' | 'right',
    columnPadding: 2 as number,
    filterSens: 'ALL' as 'ALL' | 'ENTRANT' | 'SORTANT',
    filterType: 'ALL' as 'ALL' | 'INTERNE' | 'EXTERNE',
    filterStatut: 'ALL' as 'ALL' | 'ENREGISTRE' | 'EN_ATTENTE_DG' | 'ORIENTE_DG' | 'ORIENTE_DIRECTEUR' | 'EN_TRAITEMENT' | 'ASSIGNE' | 'TRAITE' | 'ARCHIVE',
    filterPriorite: 'ALL' as 'ALL' | 'HAUTE' | 'MOYENNE' | 'BASSE',
    filterEntityType: 'direction' as 'ALL' | string,
    filterEntityId: 'ALL' as 'ALL' | string,
    filterDateDebut: '' as string,
    filterDateFin: '' as string,
    filterSearch: '' as string,
    filterMesAssignations: false as boolean,
    filterNonClassifies: false as boolean,
    filterAnnotationDG: 'ALL' as 'ALL' | 'AVEC_ANNOTATION_DG' | 'SANS_ANNOTATION_DG',
    columns: (() => {
      const fields = formulaireCourrierService.getDisplayFields(SensCourrier.ENTRANT, TypeCourrier.EXTERNE);
      const cols: Array<{ key: string; label: string; width: number; visible: boolean }> = [];
      fields.forEach(f => {
        cols.push({ key: f.name, label: f.label, width: 35, visible: true });
      });
      return cols;
    })(),
  });
  const debouncedRegistreSearch = useDebouncedValue(registreConfig.filterSearch, 350);

  // Optimiser le calcul du nombre de courriers filtrés pour le modal
  const filteredCourriersCount = useMemo(() => {
    let count = courriers.length;
    if (registreConfig.filterSens !== 'ALL') {
      count = courriers.filter(c => c.sens === registreConfig.filterSens).length;
    }
    if (registreConfig.filterType !== 'ALL') {
      count = courriers.filter(c => c.type === registreConfig.filterType).length;
    }
    return count;
  }, [courriers, registreConfig.filterSens, registreConfig.filterType]);

  // Adapter les colonnes selon le sens et le type filtrés en utilisant les champs du formulaire configuré
  const adaptColumnsToFilters = useCallback(() => {
    const currentSens = registreConfig.filterSens;
    const currentType = registreConfig.filterType;
    
    // Déterminer le sens et le type à utiliser pour récupérer les champs du formulaire
    const sens = currentSens && currentSens !== 'ALL' ? currentSens as SensCourrier : SensCourrier.ENTRANT;
    const type = currentType && currentType !== 'ALL' ? currentType as TypeCourrier : TypeCourrier.EXTERNE;
    
    // Récupérer les champs configurés dans le formulaire
    const displayFields = formulaireCourrierService.getDisplayFields(sens, type);
    
    // Construire les colonnes à partir des champs du formulaire en préservant l'état de visibilité
    const existingColumnsMap = new Map(registreConfig.columns.map(col => [col.key, col]));
    
    const newColumns: Array<{ key: string; label: string; width: number; visible: boolean }> = [];
    
    // Ajouter uniquement les champs du formulaire configuré (colonnes dynamiques)
    displayFields.forEach(field => {
      const existingCol = existingColumnsMap.get(field.name);
      newColumns.push({
        key: field.name,
        label: field.label,
        width: 35,
        visible: existingCol?.visible ?? true,
      });
    });
    
    setRegistreConfig(prev => {
      const unchanged =
        prev.columns.length === newColumns.length &&
        prev.columns.every((col, i) => {
          const n = newColumns[i];
          return col.key === n.key && col.label === n.label && col.width === n.width && col.visible === n.visible;
        });
      if (unchanged) return prev;
      return { ...prev, columns: newColumns };
    });
  }, [registreConfig.columns]); // Only depend on columns to avoid cyclic dependency

  // Recharger les colonnes du registre quand les filtres de sens/type changent
  useEffect(() => {
    adaptColumnsToFilters();
  }, [registreConfig.filterSens, registreConfig.filterType, adaptColumnsToFilters]);

  // Recharger les colonnes du registre quand la configuration du formulaire change
  useEffect(() => {
    adaptColumnsToFilters();
  }, [formConfig, adaptColumnsToFilters]);

  // Version "pure" pour la génération PDF : évite de déclencher un setState au moment de générer (moins de re-renders).
  const getRegistreColumnsForCurrentFilters = useCallback(() => {
    const currentSens = registreConfig.filterSens;
    const currentType = registreConfig.filterType;
    const sens = currentSens && currentSens !== 'ALL' ? (currentSens as SensCourrier) : SensCourrier.ENTRANT;
    const type = currentType && currentType !== 'ALL' ? (currentType as TypeCourrier) : TypeCourrier.EXTERNE;
    const displayFields = formulaireCourrierService.getDisplayFields(sens, type);

    const existingColumnsMap = new Map(registreConfig.columns.map(col => [col.key, col]));
    const newColumns: Array<{ key: string; label: string; width: number; visible: boolean }> = [];
    displayFields.forEach(field => {
      const existingCol = existingColumnsMap.get(field.name);
      newColumns.push({
        key: field.name,
        label: field.label,
        width: 35,
        visible: existingCol?.visible ?? true,
      });
    });
    return newColumns;
  }, [registreConfig.filterSens, registreConfig.filterType, registreConfig.columns]);

  // Handlers optimisés pour les filtres du modal registre
  const handleFilterSens = useCallback((sens: 'ALL' | 'ENTRANT' | 'SORTANT') => {
    setRegistreConfig(prev => ({ ...prev, filterSens: sens }));
  }, []);

  const handleFilterType = useCallback((type: 'ALL' | 'INTERNE' | 'EXTERNE') => {
    setRegistreConfig(prev => ({ ...prev, filterType: type }));
  }, []);

  const handleFilterStatut = useCallback((statut: string) => {
    setRegistreConfig(prev => ({ ...prev, filterStatut: statut as any }));
  }, []);

  const handleFilterPriorite = useCallback((priorite: string) => {
    setRegistreConfig(prev => ({ ...prev, filterPriorite: priorite as any }));
  }, []);

  const handleFilterAnnotationDG = useCallback((annotationDG: string) => {
    setRegistreConfig(prev => ({ ...prev, filterAnnotationDG: annotationDG as any }));
  }, []);

  const handleFilterSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterSearch: e.target.value }));
  }, []);

  const handleFilterDateDebutChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterDateDebut: e.target.value }));
  }, []);

  const handleFilterDateFinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterDateFin: e.target.value }));
  }, []);

  const handleFilterMesAssignationsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterMesAssignations: e.target.checked }));
  }, []);

  const handleFilterNonClassifiesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterNonClassifies: e.target.checked }));
  }, []);

  const [showEditModal, setShowEditModal] = useState(false); // plus utilisé pour l'instant (édition plein écran)
  const [selectedCourrierForEdit, setSelectedCourrierForEdit] = useState<Courrier | null>(null); // conservé si besoin plus tard
  const [assignSubmenuOpen, setAssignSubmenuOpen] = useState<string | null>(null);
  const [workflowsForPreview, setWorkflowsForPreview] = useState<WorkflowEtape[]>([]);
  const [selectedCourrierForMenu, setSelectedCourrierForMenu] = useState<Courrier | null>(null);
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [showActionsDrawer, setShowActionsDrawer] = useState(false);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(exportSettingsService.getDefaultSettings());
  const [exporting, setExporting] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [modalLogoDragging, setModalLogoDragging] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const printViewRef = useRef<HTMLDivElement>(null);
  const courrierListRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  
  // Fonction pour scroller vers le haut de la liste des courriers
  const scrollToTop = () => {
    setTimeout(() => {
      if (courrierListRef.current) {
        courrierListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (tableRef.current) {
        tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  const normalizeText = (value?: string) =>
    (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const internalNameSet = React.useMemo(() => {
    const names = [...availableDirections, ...availableServices].map(normalizeText).filter(Boolean);
    return new Set(names);
  }, [availableDirections, availableServices]);

  // Résoudre le sens (fallback pour anciens courriers sans sens)
  function getCourrierSens(courrier: Courrier) {
    if (courrier.sens) return courrier.sens;
    
    const expediteur = normalizeText(courrier.expediteur);
    const destinataire = normalizeText(courrier.destinataire);
    
    // Pour les courriers externes
    if (courrier.type === TypeCourrier.EXTERNE) {
      // Si l'expéditeur est externe et le destinataire est interne -> Entrant
      if (!internalNameSet.has(expediteur) && internalNameSet.has(destinataire)) {
        return SensCourrier.ENTRANT;
      }
      // Si l'expéditeur est interne et le destinataire est externe -> Sortant
      if (internalNameSet.has(expediteur) && !internalNameSet.has(destinataire)) {
        return SensCourrier.SORTANT;
      }
    }
    
    // Pour les courriers internes
    if (courrier.type === TypeCourrier.INTERNE) {
      // Si l'expéditeur est la Direction Générale -> Sortant (la DG envoie)
      if (expediteur && expediteur.toLowerCase().includes('général') && internalNameSet.has(destinataire)) {
        return SensCourrier.SORTANT;
      }
      // Si le destinataire est la Direction Générale -> Entrant (la DG reçoit)
      if (destinataire && destinataire.toLowerCase().includes('général') && internalNameSet.has(expediteur)) {
        return SensCourrier.ENTRANT;
      }
      // Sinon, logique standard : si l'expéditeur est interne -> Entrant pour le destinataire
      if (expediteur && internalNameSet.has(expediteur)) {
        return SensCourrier.SORTANT;
      }
      if (destinataire && internalNameSet.has(destinataire)) {
        return SensCourrier.ENTRANT;
      }
    }
    
    // Fallback par défaut
    return SensCourrier.ENTRANT;
  }

  // Calcul des statistiques (les courriers archivés ne comptent pas dans "traités")
  const stats = React.useMemo(() => {
    const archivedIds = new Set(archives.map(a => a.courrierId).filter(Boolean) as string[]);
    // Source complète = tous les courriers accessibles
    const sourceCourriers = allCourriers.length > 0 ? allCourriers : courriers;
    // Le total global (tous les courriers sans filtre)
    const total = sourceCourriers.length;
    // Le nombre après filtres (pour cohérence avec la liste affichée)
    const filtered = filteredCourriers.length;
    
    // Détecter si des filtres sont actifs – si oui, utiliser filteredCourriers pour
    // que les stats (Entrants, Sortants, Urgents, etc.) correspondent à la liste visible
    const hasActiveFilters =
      filters.statut !== '' || filters.type !== '' || filters.sens !== '' ||
      filters.priorite !== '' || filters.direction !== '' || filters.service !== '' ||
      filters.sousService !== '' || filters.dateDebut !== '' || filters.dateFin !== '' ||
      debouncedSearch !== '' || filters.categorie !== '' || filters.mesAssignations ||
      filters.nonClassifies;
    
    // Utiliser filteredCourriers si des filtres sont actifs ET qu'ils ont réduit la liste,
    // sinon utiliser sourceCourriers (tous les courriers)
    const statsCourriers = hasActiveFilters && filteredCourriers.length > 0
      ? filteredCourriers
      : sourceCourriers;
    
    const byStatut = Object.values(StatutCourrier).reduce((acc, statut) => {
      // Pour "Traités", exclure les courriers archivés (ils ne doivent pas figurer dans les stats traités)
      if (statut === StatutCourrier.TRAITE) {
        acc[statut] = statsCourriers.filter(c => c.statut === statut && !archivedIds.has(c.id)).length;
      } else {
        acc[statut] = statsCourriers.filter(c => c.statut === statut).length;
      }
      return acc;
    }, {} as Record<string, number>);
    const byType = {
      [TypeCourrier.EXTERNE]: statsCourriers.filter(c => c.type === TypeCourrier.EXTERNE).length,
      [TypeCourrier.INTERNE]: statsCourriers.filter(c => c.type === TypeCourrier.INTERNE).length,
    };
    const bySens = {
      [SensCourrier.ENTRANT]: statsCourriers.filter(c => getCourrierSens(c) === SensCourrier.ENTRANT).length,
      [SensCourrier.SORTANT]: statsCourriers.filter(c => getCourrierSens(c) === SensCourrier.SORTANT).length
    };
    const bySensType = {
      [SensCourrier.ENTRANT]: {
        [TypeCourrier.INTERNE]: statsCourriers.filter(c => getCourrierSens(c) === SensCourrier.ENTRANT && c.type === TypeCourrier.INTERNE).length,
        [TypeCourrier.EXTERNE]: statsCourriers.filter(c => getCourrierSens(c) === SensCourrier.ENTRANT && c.type === TypeCourrier.EXTERNE).length
      },
      [SensCourrier.SORTANT]: {
        [TypeCourrier.INTERNE]: statsCourriers.filter(c => getCourrierSens(c) === SensCourrier.SORTANT && c.type === TypeCourrier.INTERNE).length,
        [TypeCourrier.EXTERNE]: statsCourriers.filter(c => getCourrierSens(c) === SensCourrier.SORTANT && c.type === TypeCourrier.EXTERNE).length
      }
    };
    const byPriorite = Object.values(Priorite).reduce((acc, priorite) => {
      acc[priorite] = statsCourriers.filter(c => c.priorite === priorite).length;
      return acc;
    }, {} as Record<string, number>);
    // Urgent inclut HAUTE (affiché comme "Urgent"), URGENTE (affiché comme "Très urgent") et URGENT (compatibilité avec la base de données)
    const urgentCourriers = statsCourriers.filter(c => c.priorite === Priorite.HAUTE || c.priorite === Priorite.URGENTE);
    const urgent = urgentCourriers.length;
    // En attente inclut EN_ATTENTE_DG, ORIENTE_DG, ORIENTE_DIRECTEUR (courriers en attente de traitement)
    const enAttente = statsCourriers.filter(c =>
      c.statut === StatutCourrier.EN_ATTENTE_DG ||
      c.statut === StatutCourrier.ORIENTE_DG ||
      c.statut === StatutCourrier.ORIENTE_DIRECTEUR
    ).length;
    // Courriers orientés vers les directeurs (statut ORIENTE_DIRECTEUR) - visible uniquement pour DG et SUPER_ADMIN
    const orientesDirecteurs = statsCourriers.filter(c => c.statut === StatutCourrier.ORIENTE_DIRECTEUR).length;
    const traites = statsCourriers.filter(c => c.statut === StatutCourrier.TRAITE && !archivedIds.has(c.id)).length;
    return { total, filtered, byStatut, byType, bySens, bySensType, byPriorite, urgent, enAttente, orientesDirecteurs, traites };
  }, [allCourriers, courriers, filteredCourriers, internalNameSet, filters, debouncedSearch, archives]);

  // Calcul des statistiques des catégories (catégorie « effective » = existante, pour ne pas compter les orphelins)
  const folderStats = React.useMemo(() => {
    const totalFolders = courrierFolders.length;
    const rootFolders = courrierFolders.filter(f => !f.parentId).length;
    const subFolders = courrierFolders.filter(f => f.parentId).length;
    // Utiliser allCourriers (tous les courriers accessibles) au lieu de courriers (chargés progressivement)
    const availableCourriers = allCourriers.length > 0 ? allCourriers : courriers;
    const courriersInFolders = availableCourriers.filter(c => {
      const key = c.id != null ? String(c.id) : '';
      const fid = courrierFolderMap[key];
      if (fid == null || fid === '') return false;
      const fidStr = String(fid);
      return validFolderIds.has(fidStr);
    }).length;
    const courriersUnclassified = availableCourriers.length - courriersInFolders;
    const foldersWithCourriers = availableCourriers.length === 0 ? 0 : new Set(
      availableCourriers.map(c => {
        const key = c.id != null ? String(c.id) : '';
        const fid = courrierFolderMap[key];
        if (fid == null || fid === '') return null;
        const fidStr = String(fid);
        return validFolderIds.has(fidStr) ? fidStr : null;
      }).filter((f): f is string => f != null)
    ).size;
    const emptyFolders = totalFolders - foldersWithCourriers;
    
    return {
      total: totalFolders,
      root: rootFolders,
      sub: subFolders,
      courriersInFolders,
      courriersUnclassified,
      foldersWithCourriers,
      emptyFolders
    };
  }, [courrierFolders, courrierFolderMap, allCourriers, courriers, validFolderIds]);

  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filters.statut || filters.type || filters.sens || filters.search || filters.priorite ||
    filters.direction || filters.service || filters.sousService || filters.dateDebut || filters.dateFin || filters.categorie || filters.mesAssignations || filters.nonClassifies;

  /** Niveaux de filtre dynamiques : types d'entités actifs uniquement (libellés depuis Admin → Types d'entités) */
  const filterLevels = entiteTypeService.getActiveTypesForFilters();

  /** Synchroniser direction / service / sousService à partir des sélections par niveau */
  const filterLevelCodes = filterLevels.map(t => t.code).join(',');
  useEffect(() => {
    let direction = '';
    let service = '';
    let sousService = '';
    const levels = entiteTypeService.getActiveTypesForFilters();
    for (let i = 0; i < filterSelectionIds.length; i++) {
      const id = filterSelectionIds[i];
      if (!id) continue;
      const entity = entiteOrganisationnelleService.getEntityById(id);
      if (!entity) continue;
      const code = (levels[i]?.code) as TypeEntiteOrganisationnelle | undefined;
      if (code === 'direction') direction = entity.nom;
      if (code === 'division' || code === 'service') service = entity.nom;
      if (code === 'sous-service') sousService = entity.nom;
    }
    setFilters(prev => (prev.direction === direction && prev.service === service && prev.sousService === sousService ? prev : { ...prev, direction, service, sousService }));
  }, [filterSelectionIds, filterLevelCodes]);

  // Charger les workflows quand le modal de prévisualisation s'ouvre
  useEffect(() => {
    if (showResumeModal && selectedCourrierForResume) {
      const workflows = courrierService.getWorkflowsByCourrier(selectedCourrierForResume.id);
      const sorted = workflows.sort((a, b) => {
        if (a.ordre !== undefined && b.ordre !== undefined) {
          return a.ordre - b.ordre;
        }
        if (a.ordre !== undefined) return -1;
        if (b.ordre !== undefined) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      setWorkflowsForPreview(sorted);
      
      // Accusé de réception désactivé
      // if (shouldTriggerAccuseReception(selectedCourrierForResume)) {
      //   handleAccuseReceptionNotification(selectedCourrierForResume);
      // }
    } else if (!showResumeModal) {
      setWorkflowsForPreview([]);
    }
  }, [showResumeModal, selectedCourrierForResume]);

  // Debug: Vérifier les états des modals
  useEffect(() => {
    if (showResumeModal) {
      console.log('Modal de résumé ouvert pour:', selectedCourrierForResume?.numero);
    }
    if (showEditModal) {
      console.log('Modal d\'édition ouvert pour:', selectedCourrierForEdit?.numero);
    }
  }, [showResumeModal, showEditModal, selectedCourrierForResume, selectedCourrierForEdit]);

  // Fonctions helper pour les dialogs
  const showConfirm = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'warning', title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        message,
        type,
        title,
        variant: 'confirm',
        confirmText: 'Confirmer',
        cancelText: 'Annuler',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
        onClose: () => resolve(false)
      });
    });
  };

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    loadCourriers();
    // Charger les archives pour les stats (exclusion des courriers archivés des "traités")
    let cancelled = false;
    archivageService.getAllArchives().then(data => {
      if (!cancelled) setArchives(data);
    }).catch(() => {
      if (!cancelled) setArchives([]);
    });
    // loadStorageInfo fait N+1 appels API (1 par courrier) — différé pour ne pas
    // saturer PHP-FPM pendant le chargement principal + uploads en arrière-plan
    const storageTimer = setTimeout(() => { loadStorageInfo(); }, 5000);
    return () => {
      cancelled = true;
      clearTimeout(storageTimer);
    };
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const typeParam = params.get('type');
    if (typeParam === TypeCourrier.EXTERNE || typeParam === TypeCourrier.INTERNE) {
      setFilters(prev => ({ ...prev, type: typeParam }));
    }
    const sensParam = params.get('sens');
    if (sensParam === SensCourrier.ENTRANT || sensParam === SensCourrier.SORTANT) {
      setFilters(prev => ({ ...prev, sens: sensParam }));
    }
  }, [location.search]);

  useEffect(() => {
    setCollapsedGroups(new Set());
  }, [groupBy]);

  // Charger les counts de fichiers en arrière-plan après le chargement des courriers
  useEffect(() => {
    if (courriers.length === 0 || !laravelApiService.isConfigured()) return;
    
    // Charger les counts en arrière-plan (ne pas bloquer l'UI)
    const loadCounts = async () => {
      try {
        const courrierIds = courriers.map(c => c.id);
        const counts = await laravelApiService.getFilesCounts(courrierIds);
        setFilesCounts(counts);
      } catch (e) {
        // Silencieux - fallback sur 0 si l'API n'est pas disponible
        console.warn('Impossible de charger les counts de fichiers:', e);
      }
    };
    
    loadCounts();
  }, [courriers]);

  // Clé pour la section « Courriers non classés » (réductible comme les catégories)
  const ROOT_FOLDER_KEY = '__root__';

  // États pour la gestion des catégories
  const [folderReloadTrigger, setFolderReloadTrigger] = useState(0);
  const hasRefetchedWhenEmpty = useRef(false);
  /** Éviter de synchroniser vers l'API juste après un chargement distant (données déjà à jour). */
  const skipFolderSyncUntil = useRef(0);
  const lastFolderSyncTime = useRef(0);
  const lastSyncedFoldersSnapshot = useRef('');
  const lastMapSyncTime = useRef(0);
  const lastSyncedMapSnapshot = useRef('');
  const lastLoadTime = useRef(0);
  const lastFolderLoadOnVisible = useRef(0);

  // Fonction pour charger les données des catégories
  const loadFolderData = useCallback(async () => {
    if (!user) return;
    
    hasRefetchedWhenEmpty.current = false;

    try {
      // Charger IMMÉDIATEMENT depuis localStorage, sync API en arrière-plan
      const { folders: localFolders, map: localMap } = await categorieCourrierService.getCategoriesAndMapForUser(
        user.id,
        fallbackUid,
        (synced) => {
          // La sync API est terminée → mettre à jour l'état React avec les données fusionnées
          // Filtrer les catégories récemment supprimées (race condition)
          const deletedIds = categorieCourrierService.loadDeletedIds(user.id);
          const filteredFolders = synced.folders.filter(f => !deletedIds.has(f.id));
          setCategorieCourriers(filteredFolders);
          setCategorieCourrierMap(synced.map);
          
          // Mettre à jour le chargement progressif des dossiers
          setAllFolders(filteredFolders);
          const firstBatch = filteredFolders.slice(0, foldersBatchSize);
          setVisibleFolders(firstBatch);
        }
      );
      setCategorieCourriers(localFolders);
      setCategorieCourrierMap(localMap);
      
      // Initialiser le chargement progressif des dossiers
      setAllFolders(localFolders);
      const firstBatch = localFolders.slice(0, foldersBatchSize);
      setVisibleFolders(firstBatch);
    } catch (error) {
      console.error('[Catégories] Erreur chargement:', error);
    }
  }, [user, fallbackUid, folderReloadTrigger]);

  // Charger les catégories et le mapping au montage de la page et au changement d'utilisateur
  useEffect(() => {
    if (!user) return;
    hasRefetchedWhenEmpty.current = false;

    void loadFolderData();
  }, [user?.id, folderReloadTrigger]);

  // En mode arborescence : ouvrir uniquement la section "non classés" par défaut (pas toutes les catégories)
  useEffect(() => {
    if (folderViewMode === 'arborescence') {
      setExpandedFolderIds(prev => {
        if (prev.has(ROOT_FOLDER_KEY)) return prev;
        const next = new Set(prev);
        next.add(ROOT_FOLDER_KEY);
        return next;
      });
    }
  }, [folderViewMode]);

  // Constantes pour la synchronisation
  /** Cooldown entre deux syncs (éviter 429 Too Many Requests). */
  const SYNC_COOLDOWN_MS = 30000;
  const SKIP_SYNC_AFTER_LOAD_MS = 8000;

  // Recharger les catégories au retour sur l'onglet (visibilité), avec throttle pour éviter 429
  useEffect(() => {
    if (!user?.id) return;
    const MIN_RELOAD_INTERVAL_MS = 15000; // 15 sec — cache Laravel = pas besoin de recharger souvent
    const onVisible = () => {
      const now = Date.now();
      if (now - lastFolderLoadOnVisible.current < MIN_RELOAD_INTERVAL_MS) return;
      
      lastFolderLoadOnVisible.current = now;
      if (!user?.id) return;
      
      // NON BLOQUANT : Utiliser then/catch au lieu de await
      categorieCourrierService.getCategoriesAndMapForUser(user.id, '', (synced) => {
        const deletedIds = categorieCourrierService.loadDeletedIds(user.id);
        const filteredFolders = synced.folders.filter(f => !deletedIds.has(f.id));
        setCategorieCourriers(filteredFolders);
        setCategorieCourrierMap(synced.map);
        
        // Mettre à jour le chargement progressif des dossiers
        setAllFolders(filteredFolders);
        const firstBatch = filteredFolders.slice(0, foldersBatchSize);
        setVisibleFolders(firstBatch);
      })
        .then(({ folders: localFolders, map: localMap }) => {
          setCategorieCourriers(localFolders);
          setCategorieCourrierMap(localMap);
        })
        .catch(() => {}); // Silencieux
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [user?.id]);

  // Après nettoyage du cache : si catégories vides avec user connecté, recharger une fois depuis l'API
  useEffect(() => {
    if (!user?.id || courrierFolders.length > 0) return;
    if (hasRefetchedWhenEmpty.current) return;
    
    
    hasRefetchedWhenEmpty.current = true;
    console.log('[Catégories] Catégories vides avec user connecté → rechargement depuis l\'API (après nettoyage cache)');
    const t = setTimeout(() => {
      setFolderReloadTrigger((x) => x + 1);
    }, 1500);
    return () => clearTimeout(t);
  }, [user?.id, courrierFolders.length]);

  // Synchroniser en arrière-plan les catégories vers l'API Laravel (éviter 429 Too Many Requests)
  useEffect(() => {
    if (!user?.id || courrierFolders.length === 0) return;


    const foldersSnapshot = JSON.stringify(courrierFolders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, updatedAt: f.updatedAt })));
    if (foldersSnapshot === lastSyncedFoldersSnapshot.current) return;

    const timeoutId = setTimeout(async () => {
      if (Date.now() < skipFolderSyncUntil.current) return;
      if (Date.now() - lastFolderSyncTime.current < SYNC_COOLDOWN_MS) return;

      try {
        console.log(`Synchronisation de ${courrierFolders.length} catégorie(s) vers l'API Laravel...`);
        await categorieCourrierService.saveCategories(courrierFolders, user.id);
        lastSyncedFoldersSnapshot.current = foldersSnapshot;
        lastFolderSyncTime.current = Date.now();
        console.log('Catégories synchronisées avec l\'API Laravel');
    } catch (error: any) {
      const code = error?.code ?? '';
      const msg = (error?.message && String(error.message)) || '';
      const msgLower = msg.toLowerCase();
      const fullErrorStr = JSON.stringify(error);
      
      // Ignorer les erreurs 404 (catégories déjà supprimées)
      if (error.message?.includes('404') || error.message?.includes('Catégorie non trouvée')) {
        console.log('Ignorer erreur 404 - catégorie déjà supprimée');
        return;
      }

      const isNetworkOrUnreachable =
        msg.includes('API_LARAVEL_UNREACHABLE') ||
        msgLower.includes('failed to fetch') ||
        msg.includes('NetworkError') ||
        msgLower.includes('load failed') ||
        msgLower.includes('network request failed') ||
        fullErrorStr.includes('failed to fetch');
        if (isNetworkOrUnreachable) {
          showAlert(
            "Les catégories ont été sauvegardées dans l'API. Si l'API Laravel est injoignable : vérifiez qu'elle est démarrée (php artisan serve) et que VITE_LARAVEL_API_URL dans .env est correct.",
            'info',
            'API Laravel injoignable'
          );
        }
      }
    }, 2500);

    return () => clearTimeout(timeoutId);
  }, [courrierFolders, user?.id]);

  // Synchroniser en arrière-plan le mapping courrier -> catégorie vers l'API Laravel (éviter 429)
  useEffect(() => {
    if (!user?.id || Object.keys(courrierFolderMap).length === 0) return;

    const mapSnapshot = JSON.stringify(courrierFolderMap);
    if (mapSnapshot === lastSyncedMapSnapshot.current) return;

    const timeoutId = setTimeout(async () => {
      if (Date.now() < skipFolderSyncUntil.current) return;
      if (Date.now() - lastMapSyncTime.current < SYNC_COOLDOWN_MS) return;

      try {
        console.log(`Synchronisation du mapping (${Object.keys(courrierFolderMap).length} entrée(s)) vers l'API Laravel...`);
        await categorieCourrierService.saveCategoryMap(user.id, courrierFolderMap);
        lastSyncedMapSnapshot.current = mapSnapshot;
        lastMapSyncTime.current = Date.now();
        console.log('Mapping de classement synchronisé avec l\'API Laravel');
      } catch (error: any) {
        const code = error?.code ?? '';
        const msg = (error?.message && String(error.message)) || '';
        const is429 =
          code === 'resource-exhausted' ||
          String(code).includes('429') ||
          msg.toLowerCase().includes('429') ||
          msg.toLowerCase().includes('too many requests');

        console.error('ERREUR lors de la synchronisation API du mapping:', {
          error,
          errorCode: code,
          errorMessage: msg,
          is429,
          mapSize: Object.keys(courrierFolderMap).length,
          userId: user.id
        });

        if (is429) {
          showAlert(
            'Trop de requêtes vers l\'API (429). La synchronisation du classement sera réessayée. Évitez de changer d’onglet ou de rafraîchir trop souvent.',
            'warning',
            'Limite de requêtes (429)'
          );
          skipFolderSyncUntil.current = Date.now() + 60000;
          return;
        }

        const msgLower = msg.toLowerCase();
        const fullErrorStr = (error != null ? String(error) : '').toLowerCase();
        const isNetworkOrUnreachable =
          msg.includes('API_LARAVEL_UNREACHABLE') ||
          msgLower.includes('failed to fetch') ||
          msg.includes('NetworkError') ||
          msgLower.includes('load failed') ||
          msgLower.includes('network request failed') ||
          fullErrorStr.includes('failed to fetch');
        if (isNetworkOrUnreachable) {
          showAlert(
            "Le classement a bien été sauvegardé dans l'API. L'API Laravel est injoignable : vérifiez qu'elle est démarrée (php artisan serve) et que VITE_LARAVEL_API_URL dans .env est correct.",
            'info',
            'API Laravel injoignable'
          );
        }
      }
    }, 2500);

    return () => clearTimeout(timeoutId);
  }, [courrierFolderMap, user?.id]);

  // Chargement progressif : utiliser visibleCount pour déterminer les courriers à afficher
  // Les stats sont calculées sur filteredCourriers (tous les courriers filtrés)
  // L'affichage n'utilise que currentCourriers (courriers visibles progressivement)
  const currentCourriers = filteredCourriers.slice(0, visibleCount);
  const hasMoreCourriers = visibleCount < filteredCourriers.length && filteredCourriers.length > itemsPerPage;

  // Lazy loader : charger plus de courriers automatiquement au scroll
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMoreCourriers || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreCourriers, loadingMore, handleLoadMore]);

  // Gestion de la sélection (sur tous les courriers filtrés, pas seulement la page courante)
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedCourriers(new Set(filteredCourriers.map(c => c.id)));
    } else {
      setSelectedCourriers(new Set());
    }
  };

  const handleSelectCourrier = (courrierId: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    console.log('Debug sélection courrier:', {
      courrierId,
      avantSelection: Array.from(selectedCourriers),
      evenement: e?.type
    });
    
    setSelectedCourriers(prev => {
      const next = new Set(prev);
      if (next.has(courrierId)) {
        next.delete(courrierId);
        console.log('Désélection:', courrierId);
      } else {
        next.add(courrierId);
        console.log('Sélection:', courrierId);
      }
      console.log('Après sélection:', Array.from(next));
      return next;
    });
  };

  const isAllSelected = filteredCourriers.length > 0 && filteredCourriers.every(c => selectedCourriers.has(c.id));
  const isIndeterminate = filteredCourriers.some(c => selectedCourriers.has(c.id)) && !isAllSelected;

  const groupByOptions = [
    { value: 'none', label: 'Aucun regroupement' },
    { value: 'statut', label: 'Statut' },
    { value: 'priorite', label: 'Priorité' },
    { value: 'sens', label: 'Sens (entrant/sortant)' },
    { value: 'type', label: 'Type (interne/externe)' },
    { value: 'direction', label: 'Direction' },
    { value: 'service', label: 'Service' },
    { value: 'dateReception', label: 'Date de réception (mois)' },
    { value: 'dateEnregistrement', label: 'Date d\'enregistrement (mois)' }
  ] as const;

  const getTypeLabel = (type?: TypeCourrier) => {
    if (type === TypeCourrier.EXTERNE) return 'Externe';
    if (type === TypeCourrier.INTERNE) return 'Interne';
    return 'Type inconnu';
  };

  const getSensLabel = (sens?: SensCourrier) => {
    if (sens === SensCourrier.ENTRANT) return 'Entrant';
    if (sens === SensCourrier.SORTANT) return 'Sortant';
    return 'Sens inconnu';
  };


  const getDateGroup = (value: any) => {
    if (!value) {
      return { key: 'date-inconnue', label: 'Date inconnue' };
    }
    const dateValue = value instanceof Date ? value : new Date(value);
    if (isNaN(dateValue.getTime())) {
      return { key: 'date-inconnue', label: 'Date inconnue' };
    }
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    return {
      key: `${year}-${month}`,
      label: dateValue.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    };
  };

  const getGroupKeyAndLabel = (courrier: Courrier) => {
    switch (groupBy) {
      case 'statut':
        return {
          key: courrier.statut || 'statut-inconnu',
          label: courrier.statut || 'Statut inconnu'
        };
      case 'priorite':
        return {
          key: courrier.priorite || 'priorite-inconnue',
          label: courrier.priorite || 'Priorité inconnue'
        };
      case 'sens': {
        const resolvedSens = getCourrierSens(courrier);
        return {
          key: resolvedSens || 'sens-inconnu',
          label: getSensLabel(resolvedSens)
        };
      }
      case 'type':
        return {
          key: courrier.type || 'type-inconnu',
          label: getTypeLabel(courrier.type)
        };
      case 'direction':
        return {
          key: courrier.direction || 'direction-inconnue',
          label: courrier.direction || 'Direction inconnue'
        };
      case 'service':
        return {
          key: courrier.service || 'service-inconnu',
          label: courrier.service || 'Service inconnu'
        };
      case 'dateReception': {
        const dynamicReception = getDynamicReceptionDateValue(courrier);
        const baseValue = dynamicReception || (courrier as any).dateReception;
        return getDateGroup(baseValue);
      }
      case 'dateEnregistrement':
        return getDateGroup(courrier.dateEnregistrement);
      default:
        return { key: 'tous', label: 'Tous les courriers' };
    }
  };

  const groupedCourriers = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'tous', label: 'Tous les courriers', items: currentCourriers }];
    }

    const groups: Array<{ key: string; label: string; items: Courrier[] }> = [];
    const indexMap = new Map<string, number>();

    currentCourriers.forEach(courrier => {
      const { key, label } = getGroupKeyAndLabel(courrier);
      const existingIndex = indexMap.get(key);
      if (existingIndex === undefined) {
        indexMap.set(key, groups.length);
        groups.push({ key, label, items: [courrier] });
      } else {
        groups[existingIndex].items.push(courrier);
      }
    });

    return groups;
  }, [currentCourriers, groupBy, formConfig]);

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const activeGroupLabel = groupByOptions.find(option => option.value === groupBy)?.label ?? 'Aucun regroupement';

  const openFolderModal = (parentId?: string, folderToEdit?: CategorieCourrier) => {
    if (folderToEdit) {
      setFolderEditingId(folderToEdit.id);
      setFolderModalName(folderToEdit.name);
      setFolderModalParentId(folderToEdit.parentId ?? undefined);
    } else {
      setFolderEditingId(null);
      setFolderModalName('');
      setFolderModalParentId(parentId);
    }
    setShowFolderModal(true);
  };

  const closeFolderModal = () => {
    setShowFolderModal(false);
    setFolderModalName('');
    setFolderModalParentId(undefined);
    setFolderEditingId(null);
  };

  const handleSaveFolder = async () => {
    const trimmed = folderModalName.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    if (folderEditingId) {
      let previous: CategorieCourrier | undefined;
      setCategorieCourriers(prev => {
        previous = prev.find(f => f.id === folderEditingId);
        return prev.map(folder =>
          folder.id === folderEditingId
            ? { ...folder, name: trimmed, parentId: folderModalParentId, updatedAt: now }
            : folder
        );
      });

      if (user?.id) {
        try {
          const saved = await categorieCourrierService.saveCategory(
            {
              id: folderEditingId,
              name: trimmed,
              parentId: folderModalParentId,
              createdAt: previous?.createdAt ?? now,
              updatedAt: now,
              userId: user.id,
            },
            user.id
          );
          setCategorieCourriers(prev =>
            prev.map(folder =>
              folder.id === folderEditingId ? saved : folder
            )
          );
          
          // Mettre à jour les dossiers visibles si nécessaire
          setVisibleFolders(prev =>
            prev.map(folder =>
              folder.id === folderEditingId ? saved : folder
            )
          );
          showAlert('Catégorie mise à jour', 'success');
        } catch (error) {
          console.error('Synchronisation API catégorie (update) échouée:', error);
          // Revenir à l'état précédent si la synchro échoue
          setCategorieCourriers(prev =>
            prev.map(folder =>
              folder.id === folderEditingId ? { ...folder, ...(previous as CategorieCourrier) } : folder
            )
          );
          showAlert(error instanceof Error ? error.message : 'Erreur lors de la synchronisation', 'error');
          return;
        }
      } else {
        showAlert('Catégorie mise à jour en local (utilisateur manquant).', 'warning');
      }
    } else {
      const newFolder: CategorieCourrier = {
        id: '',
        name: trimmed,
        parentId: folderModalParentId,
        createdAt: now,
        updatedAt: now
      };

      if (user?.id) {
        try {
          const saved = await categorieCourrierService.saveCategory(newFolder, user.id);
          setCategorieCourriers(prev => [...prev, saved]);
          
          // Ajouter aux dossiers visibles si dans le premier batch
          if (visibleFolders.length < foldersBatchSize) {
            setVisibleFolders(prev => [...prev, saved]);
          }
          showAlert('Catégorie créée', 'success');
        } catch (error) {
          console.error('Synchronisation API catégorie (create) échouée:', error);
          showAlert('Erreur lors de la création de la catégorie', 'error');
        }
      } else {
        setCategorieCourriers(prev => [...prev, newFolder]);
        
        // Ajouter aux dossiers visibles si dans le premier batch
        if (visibleFolders.length < foldersBatchSize) {
          setVisibleFolders(prev => [...prev, newFolder]);
        }
        showAlert('Catégorie créée en local (utilisateur manquant).', 'warning');
      }
    }
    closeFolderModal();
  };

  // Supprimer une catégorie (avec tous ses enfants)
  const handleDeleteFolder = async (folderId: string) => {
    const allFolders = courrierFolders;
    const collectIds = (id: string, acc: Set<string>) => {
      acc.add(id);
      allFolders.filter(f => f.parentId === id).forEach(child => collectIds(child.id, acc));
      return acc;
    };
    const idsToDelete = collectIds(folderId, new Set<string>());
    
    const confirmed = await showConfirm('Supprimer cette catégorie et tous ses sous-catégories ?', 'warning');
    if (!confirmed) return;

    try {
      console.log('[DEBUG] Début suppression catégorie:', { 
        folderId, 
        idsToDelete: Array.from(idsToDelete),
        currentFoldersCount: courrierFolders.length,
        currentFolderMapKeys: Object.keys(courrierFolderMap)
      });
      
      // Marquer les IDs comme supprimés AVANT l'appel API pour empêcher leur réapparition
      // si la sync API en arrière-plan se résout pendant l'attente
      if (user?.id) categorieCourrierService.markDeleted(user.id, Array.from(idsToDelete));
      // Supprimer dans l'API
      await categorieCourrierService.deleteCategories(Array.from(idsToDelete));
      console.log('[DEBUG] Suppression API réussie');
      
      
      // Ensuite, supprimer localement seulement si l'API a réussi
      console.log('[DEBUG] Début suppression locale');
      setCategorieCourriers(prev => {
        const newFolders = prev.filter(folder => !idsToDelete.has(folder.id));
        // Mettre à jour localStorage immédiatement
        if (user?.id) {
          localStorage.setItem(`courrier_folders_${user.id}`, JSON.stringify(newFolders));
        }
        return newFolders;
      });
      
      // Mettre à jour les dossiers visibles
      setVisibleFolders(prev => prev.filter(folder => !idsToDelete.has(folder.id)));
      setAllFolders(prev => prev.filter(folder => !idsToDelete.has(folder.id)));
      // Forcer un rechargement depuis localStorage pour garantir que l'état React reflète la suppression
      setTimeout(() => {
        if (user?.id) {
          setCategorieCourriers(categorieCourrierService.loadCategoriesFromStorage(user.id));
        }
      }, 50);

      setCategorieCourrierMap(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (next[key] && idsToDelete.has(next[key] as string)) {
            next[key] = null;
          }
        });
        // Mettre à jour localStorage immédiatement
        if (user?.id) {
          localStorage.setItem(`courrier_folder_map_${user.id}`, JSON.stringify(next));
        }
        return next;
      });
      
      // Nettoyer les états d'expansion et de sélection
      setExpandedFolderIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        console.log('[DEBUG] Nettoyage expansion:', {
          avant: prev.size,
          après: next.size,
          supprimés: idsToDelete.size
        });
        return next;
      });
      setSelectedFolderIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
      
      showAlert('Catégorie supprimée avec succès', 'success');
      console.log('[DEBUG] Suppression catégorie terminée avec succès');
    } catch (error: any) {
      console.error('[DEBUG] Erreur suppression catégorie:', error);
      if (error.message?.includes('Session expirée')) {
        showAlert('Session expirée. Veuillez vous reconnecter.', 'error');
      } else {
        showAlert(`Erreur lors de la suppression: ${error.message}`, 'error');
      }
    }
  };

  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleSelectAllFolders = () => {
    if (selectedFolderIds.size === courrierFolders.length) {
      setSelectedFolderIds(new Set());
    } else {
      setSelectedFolderIds(new Set(courrierFolders.map(f => f.id)));
    }
  };

  const handleDeleteSelectedFolders = async () => {
    if (selectedFolderIds.size === 0) return;

    const allFolders = courrierFolders;
    const collectIds = (id: string, acc: Set<string>) => {
      acc.add(id);
      allFolders.filter(f => f.parentId === id).forEach(child => collectIds(child.id, acc));
      return acc;
    };

    // Collecter tous les IDs à supprimer (catégories sélectionnées + leurs enfants)
    const idsToDelete = new Set<string>();
    selectedFolderIds.forEach(folderId => {
      collectIds(folderId, idsToDelete);
    });

    const totalFolders = idsToDelete.size;
    const totalCourriers = Object.entries(courrierFolderMap).filter(([, fId]) => fId && idsToDelete.has(fId)).length;
    const message = `Supprimer ${selectedFolderIds.size} catégorie(s) sélectionnée(s) supprimera ${totalFolders} catégorie(s) au total (incluant les sous-catégories) et détachera ${totalCourriers} courrier(s). Cette action est irréversible.`;
    const confirmed = await showConfirm(message, 'warning', 'Supprimer les catégories');
    if (!confirmed) return;

    try {
      // Marquer les IDs comme supprimés AVANT l'appel API pour empêcher leur réapparition
      if (user?.id) {
        categorieCourrierService.markDeleted(user.id, Array.from(idsToDelete));
        await categorieCourrierService.deleteCategories(Array.from(idsToDelete));
      }

      // Ensuite, supprimer localement seulement si l'API a réussi
      setCategorieCourriers(prev => {
        const newFolders = prev.filter(folder => !idsToDelete.has(folder.id));
        if (user?.id) localStorage.setItem(`courrier_folders_${user.id}`, JSON.stringify(newFolders));
        return newFolders;
      });
      
      // Mettre à jour les dossiers visibles
      setVisibleFolders(prev => prev.filter(folder => !idsToDelete.has(folder.id)));
      setAllFolders(prev => prev.filter(folder => !idsToDelete.has(folder.id)));
      // Forcer un rechargement depuis localStorage pour garantir que l'état React reflète la suppression
      setTimeout(() => {
        if (user?.id) {
          setCategorieCourriers(categorieCourrierService.loadCategoriesFromStorage(user.id));
        }
      }, 50);

      setCategorieCourrierMap(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (next[key] && idsToDelete.has(next[key] as string)) {
            next[key] = null;
          }
        });
        if (user?.id) localStorage.setItem(`courrier_folder_map_${user.id}`, JSON.stringify(next));
        return next;
      });

      // Nettoyer les états d'expansion et de sélection
      setExpandedFolderIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });

      const deletedCount = selectedFolderIds.size;
      setSelectedFolderIds(new Set());
      showAlert(`${deletedCount} catégorie(s) supprimée(s)`, 'success');
    } catch (error: any) {
      console.error('Erreur suppression multiple des catégories:', error);
      if (error.message?.includes('Session expirée')) {
        showAlert('Session expirée. Veuillez vous reconnecter.', 'error');
      } else {
        showAlert(`Erreur lors de la suppression: ${error.message}`, 'error');
      }
    }
  };

  const handleMoveSelectedFolders = async (targetParentId: string | null) => {
    if (selectedFolderIds.size === 0) return;

    // Vérifier qu'aucune catégorie sélectionnée n'est un parent de la catégorie cible
    const allFolders = courrierFolders;
    const isDescendant = (folderId: string, ancestorId: string | null): boolean => {
      if (!ancestorId) return false;
      const folder = allFolders.find(f => f.id === folderId);
      if (!folder || !folder.parentId) return false;
      if (folder.parentId === ancestorId) return true;
      return isDescendant(folder.parentId, ancestorId);
    };

    const invalidMoves = Array.from(selectedFolderIds).filter(folderId => {
      if (!targetParentId) return false;
      return isDescendant(targetParentId, folderId) || folderId === targetParentId;
    });

    if (invalidMoves.length > 0) {
      showAlert('Impossible de déplacer certaines catégories (catégorie parent invalide)', 'error');
      return;
    }

    const now = new Date().toISOString();
    setCategorieCourriers(prev => prev.map(folder => {
      if (selectedFolderIds.has(folder.id)) {
        return { ...folder, parentId: targetParentId || undefined, updatedAt: now };
      }
      return folder;
    }));
    
    // Mettre à jour les dossiers visibles
    setVisibleFolders(prev => prev.map(folder => {
      if (selectedFolderIds.has(folder.id)) {
        return { ...folder, parentId: targetParentId || undefined, updatedAt: now };
      }
      return folder;
    }));
    setAllFolders(prev => prev.map(folder => {
      if (selectedFolderIds.has(folder.id)) {
        return { ...folder, parentId: targetParentId || undefined, updatedAt: now };
      }
      return folder;
    }));

    // Sauvegarder via l'API Laravel
    if (user?.id) {
      const foldersToUpdate = courrierFolders.filter(f => selectedFolderIds.has(f.id));
      const savedFolders = await Promise.all(
        foldersToUpdate.map(folder => 
          categorieCourrierService.saveCategory(
            { ...folder, parentId: targetParentId || undefined, updatedAt: now },
            user.id
          )
        )
      );
      setCategorieCourriers(prev =>
        prev.map(folder => {
          const saved = savedFolders.find(s => s.id === folder.id);
          return saved ? saved : folder;
        })
      );
      
      // Mettre à jour les dossiers visibles
      setVisibleFolders(prev =>
        prev.map(folder => {
          const saved = savedFolders.find(s => s.id === folder.id);
          return saved ? saved : folder;
        })
      );
      setAllFolders(prev =>
        prev.map(folder => {
          const saved = savedFolders.find(s => s.id === folder.id);
          return saved ? saved : folder;
        })
      );
    }

    const movedCount = selectedFolderIds.size;
    setSelectedFolderIds(new Set());
    setShowBulkActionsModal(false);
    setBulkMoveTargetFolderId(null);
    showAlert(`${movedCount} catégorie(s) déplacée(s)`, 'success');
  };

  const handleRenameSelectedFolders = async () => {
    if (selectedFolderIds.size === 0 || (!bulkRenamePrefix && !bulkRenameSuffix)) return;

    const now = new Date().toISOString();
    setCategorieCourriers(prev => prev.map(folder => {
      if (selectedFolderIds.has(folder.id)) {
        let newName = folder.name;
        if (bulkRenamePrefix) {
          newName = `${bulkRenamePrefix}${newName}`;
        }
        if (bulkRenameSuffix) {
          newName = `${newName}${bulkRenameSuffix}`;
        }
        return { ...folder, name: newName, updatedAt: now };
      }
      return folder;
    }));

    // Sauvegarder via l'API Laravel
    if (user?.id) {
      const foldersToUpdate = courrierFolders.filter(f => selectedFolderIds.has(f.id));
      const savedFolders = await Promise.all(
        foldersToUpdate.map(folder => {
          let newName = folder.name;
          if (bulkRenamePrefix) {
            newName = `${bulkRenamePrefix}${newName}`;
          }
          if (bulkRenameSuffix) {
            newName = `${newName}${bulkRenameSuffix}`;
          }
          return categorieCourrierService.saveCategory(
            { ...folder, name: newName, updatedAt: now },
            user.id
          );
        })
      );
      setCategorieCourriers(prev =>
        prev.map(folder => {
          const saved = savedFolders.find(s => s.id === folder.id);
          return saved ? saved : folder;
        })
      );
      
      // Mettre à jour les dossiers visibles
      setVisibleFolders(prev =>
        prev.map(folder => {
          const saved = savedFolders.find(s => s.id === folder.id);
          return saved ? saved : folder;
        })
      );
      setAllFolders(prev =>
        prev.map(folder => {
          const saved = savedFolders.find(s => s.id === folder.id);
          return saved ? saved : folder;
        })
      );
    }

    setSelectedFolderIds(new Set());
    setShowBulkActionsModal(false);
    const renamedCount = selectedFolderIds.size;
    setBulkRenamePrefix('');
    setBulkRenameSuffix('');
    showAlert(`${renamedCount} catégorie(s) renommée(s)`, 'success');
  };

  const assignCourrierToFolder = (courrierId: string, folderId?: string | null) => {
    setCategorieCourrierMap(prev => {
      const next = {
        ...prev,
        [courrierId]: folderId ?? null
      };
      if (user?.id) {
        try { localStorage.setItem(`courrier_folder_map_${user.id}`, JSON.stringify(next)); } catch { /* ignore */ }
        categorieCourrierService.saveCategoryMap(user.id, next).catch(err => {
          console.error('[Catégories] Erreur sauvegarde mapping courrier→catégorie:', err);
          showAlert('Le classement n\'a pas pu être enregistré. Vérifiez la connexion à l\'API.', 'error');
        });
      }
      return next;
    });
  };

  // Fonctions pour les actions groupées des courriers
  const handleMoveSelectedCourriers = async (targetFolderId: string | null) => {
    if (selectedCourriers.size === 0) return;

    const count = selectedCourriers.size;
    // Une seule mise à jour de la map (évite le batching React qui ne gardait qu'un courrier)
    setCategorieCourrierMap(prev => {
      const next = { ...prev };
      selectedCourriers.forEach(id => {
        next[id] = targetFolderId ?? null;
      });
      if (user?.id) {
        try { localStorage.setItem(`courrier_folder_map_${user.id}`, JSON.stringify(next)); } catch { /* ignore */ }
        categorieCourrierService.saveCategoryMap(user.id, next).catch(err => {
          console.error('[Catégories] Erreur sauvegarde mapping courrier→catégorie:', err);
          showAlert('Le classement n\'a pas pu être enregistré. Vérifiez la connexion à l\'API.', 'error');
        });
      }
      return next;
    });

    setSelectedCourriers(new Set());
    setShowCourrierBulkModal(false);
    setCourrierBulkActionType(null);
    setCourrierBulkMoveTargetFolderId(null);
    showAlert(`${count} courrier(s) déplacé(s) ${targetFolderId ? 'vers la catégorie' : 'retiré(s) des catégories'}`, 'success');
  };

  const handleChangeSelectedCourriersStatut = async () => {
    if (selectedCourriers.size === 0 || !courrierBulkStatut) return;

    const count = selectedCourriers.size;
    const operationName = `Mise à jour du statut (${count} courrier${count > 1 ? 's' : ''})`;
    
    // Démarrer le preload avec message contextuel
    setLoadingOperations(prev => ({ 
      ...prev, 
      update: true,
      operationName,
      progress: 0,
      completed: false
    }));
    
    try {
      const promises = Array.from(selectedCourriers).map((id, index) => 
        courrierService.updateCourrier(id, { statut: courrierBulkStatut as StatutCourrier })
          .then(() => {
            // Mettre à jour la progression
            setLoadingOperations(prev => ({
              ...prev,
              progress: Math.round(((index + 1) / count) * 100)
            }));
          })
      );
      
      await Promise.all(promises);
      await loadCourriers();
      
      // Marquer l'opération comme terminée avec succès
      setLoadingOperations(prev => ({
        ...prev,
        progress: 100,
        completed: true,
        success: true
      }));
      
      // Attendre un peu pour montrer le succès
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setSelectedCourriers(new Set());
      setShowCourrierBulkModal(false);
      setCourrierBulkActionType(null);
      setCourrierBulkStatut('');
      setLoadingOperations(prev => ({ ...prev, update: false }));
      showAlert(`Statut mis à jour pour ${count} courrier(s)`, 'success');
    } catch (error) {
      // Marquer l'opération comme échouée
      setLoadingOperations(prev => ({
        ...prev,
        completed: true,
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      }));
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      setLoadingOperations(prev => ({ ...prev, update: false }));
      showAlert('Erreur lors de la mise à jour du statut', 'error');
    }
  };

  const handleChangeSelectedCourriersPriorite = async () => {
    if (selectedCourriers.size === 0 || !courrierBulkPriorite) return;

    const count = selectedCourriers.size;
    const operationName = `Mise à jour de la priorité (${count} courrier${count > 1 ? 's' : ''})`;
    
    // Démarrer le preload avec message contextuel
    setLoadingOperations(prev => ({ 
      ...prev, 
      update: true,
      operationName,
      progress: 0,
      completed: false
    }));
    
    try {
      const promises = Array.from(selectedCourriers).map((id, index) => 
        courrierService.updateCourrier(id, { priorite: courrierBulkPriorite as Priorite })
          .then(() => {
            // Mettre à jour la progression
            setLoadingOperations(prev => ({
              ...prev,
              progress: Math.round(((index + 1) / count) * 100)
            }));
          })
      );
      
      await Promise.all(promises);
      await loadCourriers();
      
      // Marquer l'opération comme terminée avec succès
      setLoadingOperations(prev => ({
        ...prev,
        progress: 100,
        completed: true,
        success: true
      }));
      
      // Attendre un peu pour montrer le succès
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setSelectedCourriers(new Set());
      setShowCourrierBulkModal(false);
      setCourrierBulkActionType(null);
      setCourrierBulkPriorite('');
      setLoadingOperations(prev => ({ ...prev, update: false }));
      showAlert(`Priorité mise à jour pour ${count} courrier(s)`, 'success');
    } catch (error) {
      // Marquer l'opération comme échouée
      setLoadingOperations(prev => ({
        ...prev,
        completed: true,
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      }));
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      setLoadingOperations(prev => ({ ...prev, update: false }));
      showAlert('Erreur lors de la mise à jour de la priorité', 'error');
    }
  };

  const handleBulkOrienterVersDG = async () => {
    if (selectedCourriers.size === 0 || !user?.id) return;
    
    const count = selectedCourriers.size;
    const operationName = `Orientation vers le Directeur Général (${count} courrier${count > 1 ? 's' : ''})`;
    
    setBulkOrienterLoading(true);
    try {
      let done = 0;
      
      // Démarrer le preload avec message contextuel
      setLoadingOperations(prev => ({ 
        ...prev, 
        update: true,
        operationName,
        progress: 0,
        completed: false
      }));
      
      for (let i = 0; i < selectedCourriers.size; i++) {
        const courrierId = Array.from(selectedCourriers)[i];
        try {
          const courrier = courriers.find(c => c.id === courrierId);
          if (!courrier) continue;
          
          // Logique d'orientation selon le type et le sens du courrier
          let targetUser = null;
          let instructions = '';
          
          // Pour le secrétaire DG, toujours orienter vers le DG
          if (isSecretaireDG(user)) {
            const dg = adminService.getDirecteurGeneral();
            if (!dg) {
              showAlert('Aucun Directeur Général trouvé. Vérifiez qu\'un utilisateur a le rôle "Directeur Général" et qu\'il est actif.', 'error');
              continue;
            }
            
            targetUser = dg.id;
            instructions = `Orientation secrétariat DG : Annotation vers le Directeur Général`;
            console.log('Orientation vers DG (secrétaire DG):', dg.nom);
          } else {
            // Pour les autres secrétaires de direction, orienter vers le directeur de leur direction
            let director = getAppropriateDirector(user);
            if (!director && laravelApiService.isConfigured()) {
              await adminService.refreshUsersFromApi();
              director = getAppropriateDirector(user);
            }
            
            if (!director) {
              const directorName = `Directeur de ${user?.direction}`;
              const roleRequis = 'Directeur';
              const directionRequise = user?.direction;
              showAlert(`Aucun ${directorName} trouvé. Vérifiez qu'un utilisateur a le rôle "${roleRequis}" et que sa direction est "${directionRequise}" et qu'il est actif.`, 'error');
              continue;
            }
            
            targetUser = director.id;
            instructions = `Orientation secrétariat${user?.direction ? ` ${user.direction}` : ''} : Annotation vers le Directeur ${director.nom}`;
            console.log('Orientation vers directeur:', director.nom);
          }
          
          // Créer l'assignation
          if (targetUser) {
            await courrierService.createAssignation({
              courrierId,
              assigneA: targetUser,
              assignePar: user.id,
              statut: 'EN_ATTENTE',
              instructions
            });
            await courrierService.updateCourrier(courrierId, { statut: StatutCourrier.ORIENTE_DG }).catch(() => {});
            
            // Vérifier la complétion de la tâche pour le secrétaire (orientation effectuée)
            const completionCheck = taskCompletionService.checkTaskCompletion(user, {
              orientationDone: true
            });
            if (completionCheck.isComplete) {
              // Notifier la complétion de la tâche en temps réel
              realTimeTaskSyncService.notifyTaskCompleted(
                courrierId,
                courrier.numero || '',
                user.id,
                user.role,
                'Orientation vers le DG',
                completionCheck.reason
              );
            }
            
            done++;
            
            // Mettre à jour la progression
            setLoadingOperations(prev => ({
              ...prev,
              progress: Math.round(((i + 1) / count) * 100)
            }));
          }
        } catch (_) { /* ignorer doublon ou erreur par courrier */ }
      }
      
      // Marquer l'opération comme terminée avec succès
      setLoadingOperations(prev => ({
        ...prev,
        progress: 100,
        completed: true,
        success: true
      }));
      
      // Attendre un peu pour montrer le succès
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setSelectedCourriers(new Set());
      setShowCourrierBulkModal(false);
      setCourrierBulkActionType(null);
      setLoadingOperations(prev => ({ ...prev, update: false }));
      showAlert(`${done} courrier(s) orienté(s) vers le DG`, 'success');
      await loadCourriers();
    } catch (error) {
      // Marquer l'opération comme échouée
      setLoadingOperations(prev => ({
        ...prev,
        completed: true,
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      }));
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      setLoadingOperations(prev => ({ ...prev, update: false }));
      showAlert('Erreur lors de l\'orientation des courriers', 'error');
    } finally {
      setBulkOrienterLoading(false);
    }
  };

  const handleBulkOrienterVersDirecteur = async () => {
    if (selectedCourriers.size === 0 || !user?.id) return;
    
    setBulkOrienterLoading(true);
    try {
      let done = 0;
      setLoadingOperations(prev => ({ ...prev, update: true }));
      
      // Pour les secrétaires de direction, orienter vers le directeur de leur direction
      let director = getAppropriateDirector(user);
      if (!director && laravelApiService.isConfigured()) {
        await adminService.refreshUsersFromApi();
        director = getAppropriateDirector(user);
      }
      
      if (!director) {
        const directorName = `Directeur de ${user?.direction}`;
        const roleRequis = 'Directeur';
        const directionRequise = user?.direction;
        showAlert(`Aucun ${directorName} trouvé. Vérifiez qu'un utilisateur a le rôle "${roleRequis}" et que sa direction est "${directionRequise}" et qu'il est actif.`, 'error');
        return;
      }
      
      for (const courrierId of selectedCourriers) {
        try {
          const courrier = courriers.find(c => c.id === courrierId);
          if (!courrier) continue;
          
          await courrierService.createAssignation({
            courrierId,
            assigneA: director.id,
            assignePar: user.id,
            statut: 'EN_ATTENTE',
            instructions: `Orientation secrétariat${user?.direction ? ` ${user.direction}` : ''} : Annotation vers le Directeur ${director.nom}`
          });
          await courrierService.updateCourrier(courrierId, { statut: StatutCourrier.ORIENTE_DIRECTEUR }).catch(() => {});
          
          // Vérifier la complétion de la tâche pour le secrétaire (orientation effectuée)
          const completionCheck = taskCompletionService.checkTaskCompletion(user, {
            orientationDone: true
          });
          if (completionCheck.isComplete) {
            // Notifier la complétion de la tâche en temps réel
            realTimeTaskSyncService.notifyTaskCompleted(
              courrierId,
              courrier.numero || '',
              user.id,
              user.role,
              `Orientation vers le directeur de ${director.direction}`,
              completionCheck.reason
            );
          }
          
          done++;
        } catch (_) { /* ignorer doublon ou erreur par courrier */ }
      }
      
      setSelectedCourriers(new Set());
      setShowCourrierBulkModal(false);
      setCourrierBulkActionType(null);
      setLoadingOperations(prev => ({ ...prev, update: false }));
      showAlert(`${done} courrier(s) orienté(s) vers le directeur de ${director.direction}`, 'success');
      await loadCourriers();
    } finally {
      setBulkOrienterLoading(false);
    }
  };

  const handleBulkOrienterVersDirection = async () => {
    if (selectedCourriers.size === 0 || !courrierBulkOrienterDirectionNom || !user?.id) return;
    const directeurs = adminService.getAllUsers().filter(u => u.role === Role.DIRECTEUR_GENERAL && u.direction === courrierBulkOrienterDirectionNom && u.actif);
    const directeurId = directeurs.length > 0 ? directeurs[0].id : null;
    setBulkOrienterLoading(true);
    try {
      let done = 0;
      setLoadingOperations(prev => ({ ...prev, update: true }));
      for (const courrierId of selectedCourriers) {
        try {
          const courrier = courriers.find(c => c.id === courrierId);
          await courrierService.updateCourrier(courrierId, { direction: courrierBulkOrienterDirectionNom, statut: StatutCourrier.ORIENTE_DIRECTEUR });
          if (directeurId) {
            try {
              await courrierService.createAssignation({
                courrierId,
                assigneA: directeurId,
                assignePar: user.id,
                statut: 'EN_ATTENTE',
                instructions: `Orientation vers la direction ${courrierBulkOrienterDirectionNom}`
              });
            } catch (_) {}
          }
          
          // Vérifier la complétion de la tâche pour le secrétaire (orientation effectuée)
          const completionCheck = taskCompletionService.checkTaskCompletion(user, {
            orientationDone: true
          });
          if (completionCheck.isComplete) {
            // Notifier la complétion de la tâche en temps réel
            realTimeTaskSyncService.notifyTaskCompleted(
              courrierId,
              courrier?.numero || '',
              user.id,
              user.role,
              `Orientation vers la direction ${courrierBulkOrienterDirectionNom}`,
              completionCheck.reason
            );
          }
          
          done++;
        } catch (_) {}
      }
      setSelectedCourriers(new Set());
      setShowCourrierBulkModal(false);
      setCourrierBulkActionType(null);
      setCourrierBulkOrienterDirectionNom(null);
      setLoadingOperations(prev => ({ ...prev, update: false }));
      showAlert(`${done} courrier(s) orienté(s) vers la direction ${courrierBulkOrienterDirectionNom}`, 'success');
      await loadCourriers();
    } finally {
      setBulkOrienterLoading(false);
    }
  };

  const startInlineRenameFolder = (folder: CategorieCourrier) => {
    setFolderInlineEditId(folder.id);
    setFolderInlineEditName(folder.name);
  };

  const cancelInlineRename = () => {
    setFolderInlineEditId(null);
    setFolderInlineEditName('');
  };

  const commitInlineRename = () => {
    if (!folderInlineEditId) return;
    const trimmed = folderInlineEditName.trim();
    if (!trimmed) {
      cancelInlineRename();
      return;
    }
    const now = new Date().toISOString();
    setCategorieCourriers(prev => {
      const next = prev.map(folder =>
        folder.id === folderInlineEditId
          ? { ...folder, name: trimmed, updatedAt: now }
          : folder
      );
      const updated = next.find(folder => folder.id === folderInlineEditId);
      if (updated && user?.id) {
        categorieCourrierService.saveCategory(updated, user.id).then(saved => {
          setCategorieCourriers(prev =>
            prev.map(folder => folder.id === saved.id ? saved : folder)
          );
          // Mettre à jour les dossiers visibles
          setVisibleFolders(prev =>
            prev.map(folder => folder.id === saved.id ? saved : folder)
          );
          setAllFolders(prev =>
            prev.map(folder => folder.id === saved.id ? saved : folder)
          );
        }).catch(err => {
          console.error('Erreur sauvegarde catégorie:', err);
        });
      }
      return next;
    });
    
    // Mettre à jour les dossiers visibles immédiatement
    setVisibleFolders(prev =>
      prev.map(folder =>
        folder.id === folderInlineEditId
          ? { ...folder, name: trimmed, updatedAt: now }
          : folder
      )
    );
    setAllFolders(prev =>
      prev.map(folder =>
        folder.id === folderInlineEditId
          ? { ...folder, name: trimmed, updatedAt: now }
          : folder
      )
    );
    setFolderInlineEditId(null);
    setFolderInlineEditName('');
    showAlert('Catégorie renommée', 'success');
  };

  const startInlineAddSubfolder = (parentId: string) => {
    setFolderInlineAddParentId(parentId);
    setFolderInlineAddName('');
    setExpandedFolderIds(prev => new Set(prev).add(parentId));
  };

  const cancelInlineAddSubfolder = () => {
    setFolderInlineAddParentId(null);
    setFolderInlineAddName('');
  };

  const commitInlineAddSubfolder = () => {
    if (!folderInlineAddParentId) return;
    const trimmed = folderInlineAddName.trim();
    if (!trimmed) {
      cancelInlineAddSubfolder();
      return;
    }
    const now = new Date().toISOString();
    const newFolder: CategorieCourrier = {
      id: '',
      name: trimmed,
      parentId: folderInlineAddParentId,
      createdAt: now,
      updatedAt: now
    };
    if (user?.id) {
      categorieCourrierService.saveCategory(newFolder, user.id).then(saved => {
        setCategorieCourriers(prev => [...prev, saved]);
        // Ajouter aux dossiers visibles si dans le premier batch
        if (visibleFolders.length < foldersBatchSize) {
          setVisibleFolders(prev => [...prev, saved]);
        }
        setAllFolders(prev => [...prev, saved]);
      }).catch(err => {
        console.error('Erreur sauvegarde catégorie:', err);
      });
    } else {
      setCategorieCourriers(prev => [...prev, newFolder]);
      // Ajouter aux dossiers visibles si dans le premier batch
      if (visibleFolders.length < foldersBatchSize) {
        setVisibleFolders(prev => [...prev, newFolder]);
      }
      setAllFolders(prev => [...prev, newFolder]);
    }
    setFolderInlineAddParentId(null);
    setFolderInlineAddName('');
    showAlert('Sous-catégorie créée', 'success');
  };

  const toggleFolderExpand = (folderId: string) => {
    const key = folderId != null ? String(folderId) : '';
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, CategorieCourrier[]>();
    courrierFolders.forEach(folder => {
      const key = folder.parentId != null ? String(folder.parentId) : null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(folder);
    });
    map.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name, 'fr')));
    return map;
  }, [courrierFolders]);

  // En arborescence : répartir TOUS les courriers filtrés par catégorie (pas seulement la page courante)
  // Clé null pour "non classés" (jamais '' pour éviter rootCourriers vide)
  const courriersByFolder = useMemo(() => {
    const map = new Map<string | null, Courrier[]>();
    filteredCourriers.forEach(courrier => {
      const folderId = getFolderIdForCourrier(courrier.id);
      const key = folderId == null || folderId === '' ? null : folderId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(courrier);
    });
    return map;
  }, [filteredCourriers, getFolderIdForCourrier]);

  // State pour le menu d'actions en lot
  const [showBulkActions, setShowBulkActions] = useState(false);
  // États pour les modals d'actions groupées des courriers
  const [showCourrierBulkModal, setShowCourrierBulkModal] = useState(false);
  const [courrierBulkActionType, setCourrierBulkActionType] = useState<'move' | 'statut' | 'priorite' | 'orienter-dg' | 'orienter-directeur' | 'orienter-direction' | null>(null);
  const [courrierBulkMoveTargetFolderId, setCourrierBulkMoveTargetFolderId] = useState<string | null>(null);
  const [courrierBulkStatut, setCourrierBulkStatut] = useState<StatutCourrier | ''>('');
  const [courrierBulkPriorite, setCourrierBulkPriorite] = useState<Priorite | ''>('');
  const [courrierBulkOrienterDirectionNom, setCourrierBulkOrienterDirectionNom] = useState<string | null>(null);
  const [bulkOrienterLoading, setBulkOrienterLoading] = useState(false);
  
  // Fonction pour trouver le directeur approprié selon la direction du secrétaire
const getAppropriateDirector = (user: Utilisateur | null) => {
  if (!user) return null;
  
  console.log('Recherche directeur pour utilisateur:', { 
    role: user.role, 
    direction: user.direction,
    nom: user.nom,
    email: user.email
  });
  
  // Si c'est un secrétaire DG, orienter vers le DG
  const isSecretaryDG = isSecretaireDG(user);
  
  console.log('Est secrétaire DG?', isSecretaryDG, 'Direction:', user.direction);
  
  if (isSecretaryDG) {
    const dg = adminService.getDirecteurGeneral();
    console.log('Secrétaire DG oriente vers le DG:', dg ? { nom: dg.nom, role: dg.role } : 'Non trouvé');
    return dg;
  }
  
  // Si c'est un secrétaire de direction, trouver le directeur de sa direction
  if (user.role === Role.SECRETAIRE && user.direction && user.direction !== 'Direction Générale') {
    const users = adminService.getAllUsers();
    console.log('Utilisateurs disponibles:', users.map(u => ({ nom: u.nom, role: u.role, direction: u.direction, actif: u.actif })));
    
    const director = users.find(u => 
      u.role === Role.DIRECTEUR && 
      u.direction === user.direction &&
      u.actif
    );
    
    console.log('Secrétaire de direction oriente vers le directeur:', director ? { nom: director.nom, role: director.role, direction: director.direction } : 'Non trouvé');
    return director;
  }
  
  // Pour les autres (super admin), trouver le DG par défaut
  const dg = adminService.getDirecteurGeneral();
  console.log('Autre rôle oriente vers le DG:', dg ? { nom: dg.nom, role: dg.role } : 'Non trouvé');
  return dg;
};

// Timer pour retarder l'affichage des actions groupées
  const bulkActionsTimerRef = useRef<NodeJS.Timeout | null>(null);
  /** IDs des courriers déjà orientés vers le DG (pour désactiver le bouton "Orienter vers le DG") */
  const [courrierIdsAssignedToDG, setCourrierIdsAssignedToDG] = useState<Set<string>>(new Set());
  /** IDs des courriers déjà orientés vers les directeurs (pour désactiver le bouton "Orienter vers le directeur") */
  const [courrierIdsAssignedToDirectors, setCourrierIdsAssignedToDirectors] = useState<Set<string>>(new Set());
  /** Pour le menu contextuel : le courrier affiché est-il déjà orienté vers le DG (vérifié à l'ouverture du menu) */
  const [contextMenuCourrierOrientedToDG, setContextMenuCourrierOrientedToDG] = useState<boolean>(false);
  /** Pour le menu contextuel : le courrier affiché est-il déjà orienté vers un directeur (vérifié à l'ouverture du menu) */
  const [contextMenuCourrierOrientedToDirector, setContextMenuCourrierOrientedToDirector] = useState<boolean>(false);
  const [importingFolders, setImportingFolders] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [showImportDropdown, setShowImportDropdown] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const addFileBrowseInputRef = useRef<HTMLInputElement>(null);
  const addFileModalJustDroppedRef = useRef(false);

  // Fermer les dropdowns quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showImportDropdown && !target.closest('.import-dropdown-container')) {
        setShowImportDropdown(false);
      }
    };

    if (showImportDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showImportDropdown]);

  // Export des catégorie avec leurs courriers (données complètes)
  const exportFoldersStructure = async () => {
    if (!user) return;
    
    try {
      const exportData = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        userId: user.id,
        folders: courrierFolders.map(folder => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId || null,
          color: folder.color || null
        })),
        folderMap: courrierFolderMap,
        courriers: courriers.map(c => {
          // Exporter toutes les données du courrier (sans les références circulaires)
          const courrierData: any = {
            id: c.id,
            numero: c.numero,
            type: c.type,
            sens: c.sens,
            dateReception: c.dateReception instanceof Date ? c.dateReception.toISOString() : c.dateReception,
            dateEnregistrement: c.dateEnregistrement instanceof Date ? c.dateEnregistrement.toISOString() : c.dateEnregistrement,
            expediteur: c.expediteur,
            destinataire: c.destinataire,
            objet: c.objet,
            priorite: c.priorite,
            statut: c.statut,
            enregistrePar: c.enregistrePar,
            direction: c.direction,
            service: c.service,
            extraFields: c.extraFields || {},
            folderId: getFolderIdForCourrier(c.id) || null,
            createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
            updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt
          };
          // Ne pas exporter les fichiers, workflows, annotations, assignations (trop complexes)
          return courrierData;
        })
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `courriers_avec_categorie_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showAlert(`Export réussi : ${exportData.courriers.length} courrier(s) avec ${exportData.folders.length} catégorie(s)`, 'success');
    } catch (error) {
      console.error('Erreur lors de l\'export des catégorie:', error);
      showAlert('Erreur lors de l\'export des catégorie', 'error');
    }
  };

  // Import des catégorie avec leurs courriers (structure uniquement)
  const importFoldersStructure = async (file: File) => {
    if (!user) return;
    
    setImportingFolders(true);
    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.folders || !Array.isArray(importData.folders)) {
        throw new Error('Format de fichier invalide : catégories manquantes');
      }

      if (!importData.folderMap || typeof importData.folderMap !== 'object') {
        throw new Error('Format de fichier invalide : mapping manquant');
      }

      // Vérifier que les IDs de catégories existent dans les courriers
      const existingCourrierIds = new Set(courriers.map(c => c.id));
      const validFolderMap: Record<string, string | null> = {};
      
      for (const [courrierId, folderId] of Object.entries(importData.folderMap)) {
        if (existingCourrierIds.has(courrierId)) {
          validFolderMap[courrierId] = folderId as string | null;
        }
      }

      // Vérifier que les IDs de catégories référencés existent dans la liste des catégories
      const importedFolderIds = new Set(importData.folders.map((f: any) => f.id));
      const validFolders: CategorieCourrier[] = importData.folders
        .filter((f: any) => {
          // Une catégorie est valide si elle n'a pas de parent ou si son parent est dans la liste
          return !f.parentId || importedFolderIds.has(f.parentId);
        })
        .map((f: any) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId || undefined,
          color: f.color || undefined,
          userId: user.id
        }));

      // Filtrer le mapping pour ne garder que les catégories valides
      const finalFolderMap: Record<string, string | null> = {};
      for (const [courrierId, folderId] of Object.entries(validFolderMap)) {
        if (folderId === null || importedFolderIds.has(folderId)) {
          finalFolderMap[courrierId] = folderId as string | null;
        }
      }

      // Sauvegarder les catégories via l'API Laravel
      await categorieCourrierService.saveCategories(validFolders, user.id);
      
      // Sauvegarder le mapping via l'API Laravel
      await categorieCourrierService.saveCategoryMap(user.id, finalFolderMap);

      // Mettre à jour l'état (données déjà en API via saveFolders/saveFolderMap ci-dessus)
      setCategorieCourriers(validFolders);
      setCategorieCourrierMap(finalFolderMap);
      
      // Mettre à jour les dossiers pour le chargement progressif
      setAllFolders(validFolders);
      const firstBatch = validFolders.slice(0, foldersBatchSize);
      setVisibleFolders(firstBatch);

      showAlert(
        `Import réussi : ${validFolders.length} catégorie(s) et ${Object.keys(finalFolderMap).length} courrier(s) classé(s)`,
        'success'
      );
    } catch (error) {
      console.error('Erreur lors de l\'import des catégories:', error);
      showAlert(
        `Erreur lors de l'import : ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    } finally {
      setImportingFolders(false);
    }
  };

  // Import des courriers avec leur structure de catégories (création des courriers)
  const importCourriersWithFolders = async (file: File) => {
    if (!user) return;
    
    setImportingFolders(true);
    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.folders || !Array.isArray(importData.folders)) {
        throw new Error('Format de fichier invalide : catégories manquantes');
      }

      if (!importData.courriers || !Array.isArray(importData.courriers)) {
        throw new Error('Format de fichier invalide : courriers manquants');
      }

      console.log(`Import de ${importData.courriers.length} courrier(s) avec ${importData.folders.length} catégorie(s)`);

      // 1. Créer les catégories d'abord (exclure « Courriers non classés »)
      const nonClasseFolderIds = new Set(
        (importData.folders as Array<{ id: string; name?: string }>)
          .filter((f: any) => isNonClasseFolderName(f.name || ''))
          .map((f: any) => f.id)
      );
      const importedFolderIds = new Set(importData.folders.map((f: any) => f.id));
      const validFolders: CategorieCourrier[] = importData.folders
        .filter((f: any) => {
          if (nonClasseFolderIds.has(f.id)) return false;
          return !f.parentId || importedFolderIds.has(f.parentId);
        })
        .map((f: any) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId || undefined,
          color: f.color || undefined,
          userId: user.id
        }));

      // Trier les catégories pour créer d'abord les parents
      const sortedFolders = [...validFolders].sort((a, b) => {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return 0;
      });

      // Sauvegarder les catégories via l'API Laravel
      await categorieCourrierService.saveCategories(sortedFolders, user.id);
      console.log(`${sortedFolders.length} catégorie(s) créée(s)`);

      // 2. Créer les courriers (par lots si API Laravel pour aller plus vite)
      const existingCourrierNumeros = new Set(courriers.map(c => c.numero));
      const createdCourriers: Courrier[] = [];
      const courrierIdMap = new Map<string, string>(); // Map ancien ID -> nouveau ID

      const BULK_CHUNK_SIZE = 50;
      const itemsToCreate: Array<{ courrierData: typeof importData.courriers[0]; courrierToCreate: Omit<Courrier, 'id' | 'dateEnregistrement' | 'statut' | 'createdAt' | 'updatedAt'> & { numero?: string } }> = [];
      for (const courrierData of importData.courriers) {
        if (existingCourrierNumeros.has(courrierData.numero)) {
          console.log(`Courrier ${courrierData.numero} existe déjà, ignoré`);
          continue;
        }
        itemsToCreate.push({
          courrierData,
          courrierToCreate: {
            numero: courrierData.numero || undefined,
            type: courrierData.type,
            sens: courrierData.sens,
            dateReception: new Date(courrierData.dateReception),
            expediteur: courrierData.expediteur,
            destinataire: courrierData.destinataire,
            objet: courrierData.objet,
            priorite: courrierData.priorite,
            enregistrePar: user.id,
            direction: courrierData.direction,
            service: courrierData.service,
            extraFields: courrierData.extraFields || {}
          }
        });
      }

      if (laravelApiService.isConfigured() && itemsToCreate.length > 0) {
        for (let i = 0; i < itemsToCreate.length; i += BULK_CHUNK_SIZE) {
          const chunk = itemsToCreate.slice(i, i + BULK_CHUNK_SIZE);
          setImportProgress({ current: createdCourriers.length, total: itemsToCreate.length, message: `Import : ${createdCourriers.length} / ${itemsToCreate.length} courriers...` });
          try {
            const created = await laravelApiService.createCourriersBulk(chunk.map((x) => x.courrierToCreate) as any[]);
            if (Array.isArray(created) && created.length > 0) {
              chunk.forEach((x, idx) => { courrierIdMap.set(x.courrierData.id, created[idx].id); });
              createdCourriers.push(...created);
            }
          } catch (err) {
            console.error('Erreur lot import:', err);
            for (const { courrierData, courrierToCreate } of chunk) {
              try {
                setLoadingOperations(prev => ({ ...prev, insert: true }));
                const newCourrier = await courrierService.createCourrier(courrierToCreate);
                createdCourriers.push(newCourrier);
                courrierIdMap.set(courrierData.id, newCourrier.id);
                setLoadingOperations(prev => ({ ...prev, insert: false }));
              } catch (e) {
                console.error(`Courrier ${courrierData.numero}:`, e);
              }
            }
          }
        }
        setImportProgress(null);
      } else {
        for (const { courrierData, courrierToCreate } of itemsToCreate) {
          try {
            setLoadingOperations(prev => ({ ...prev, insert: true }));
            const newCourrier = await courrierService.createCourrier(courrierToCreate);
            createdCourriers.push(newCourrier);
            courrierIdMap.set(courrierData.id, newCourrier.id);
            console.log(`Courrier créé: ${newCourrier.numero} - ${newCourrier.objet}`);
            setLoadingOperations(prev => ({ ...prev, insert: false }));
          } catch (error) {
            console.error(`Erreur lors de la création du courrier ${courrierData.numero}:`, error);
          }
        }
      }

      console.log(`${createdCourriers.length} courrier(s) créé(s)`);

      // 3. Créer le mapping des courriers vers les catégories
      const finalFolderMap: Record<string, string | null> = {};
      
      // Utiliser folderMap si disponible, sinon utiliser folderId dans les courriers
      const folderMapping = importData.folderMap || {};
      
      for (const courrierData of importData.courriers) {
        const newCourrierId = courrierIdMap.get(courrierData.id);
        if (newCourrierId) {
          let folderId = courrierData.folderId ?? folderMapping[courrierData.id] ?? null;
          if (folderId != null && nonClasseFolderIds.has(folderId)) folderId = null;
          if (folderId === null || importedFolderIds.has(folderId)) {
            finalFolderMap[newCourrierId] = folderId;
          }
        }
      }

      // Sauvegarder le mapping via l'API Laravel
      if (Object.keys(finalFolderMap).length > 0) {
        // Récupérer le mapping existant et le fusionner
        const existingMap = await categorieCourrierService.getFolderMap(user.id);
        const mergedMap = { ...existingMap, ...finalFolderMap };
        await categorieCourrierService.saveCategoryMap(user.id, mergedMap);
        console.log(`Mapping de ${Object.keys(finalFolderMap).length} courrier(s) sauvegardé`);
      }

      // 4. Recharger les données
      await loadCourriers();
      const { folders: reloadedFolders, map: reloadedMap } = await categorieCourrierService.getCategoriesAndMapForUser(user.id);
      const deletedIds = categorieCourrierService.loadDeletedIds(user.id);
      const filteredFolders = reloadedFolders.filter(folder => !deletedIds.has(folder.id));
      setCategorieCourriers(filteredFolders);
      setCategorieCourrierMap(reloadedMap);
      
      // Mettre à jour les dossiers pour le chargement progressif
      setAllFolders(filteredFolders);
      const firstBatch = filteredFolders.slice(0, foldersBatchSize);
      setVisibleFolders(firstBatch);
      // Marquer le moment de la suppression pour éviter la sync API
      categorieCourrierService.markLastSaveTime();

      showAlert(
        `Import réussi : ${createdCourriers.length} courrier(s) créé(s) et ${sortedFolders.length} catégorie(s) avec leur organisation`,
        'success'
      );
    } catch (error) {
      console.error('Erreur lors de l\'import des courriers:', error);
      showAlert(
        `Erreur lors de l'import : ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    } finally {
      setImportProgress(null);
      setImportingFolders(false);
    }
  };

  // Gestionnaire de changement de fichier pour l'import (structure uniquement)
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importFoldersStructure(file);
    }
    // Réinitialiser l'input pour permettre de sélectionner le même fichier
    e.target.value = '';
  };

  // Parser CSV simple (BOM UTF-8, guillemets, virgule ou point-virgule)
  const parseCSV = (text: string): string[][] => {
    const raw = text.startsWith('\uFEFF') ? text.slice(1) : text;
    const firstLineEnd = raw.indexOf('\n') >= 0 ? raw.indexOf('\n') : raw.length;
    const firstLine = raw.slice(0, firstLineEnd);
    const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      const nextChar = raw[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === sep && !inQuotes) {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        // End of line
        if (currentField || currentLine.length > 0) {
          currentLine.push(currentField.trim());
          if (currentLine.length > 0 && currentLine.some(f => f !== '')) {
            lines.push(currentLine);
          }
          currentLine = [];
          currentField = '';
        }
        // Skip \r\n
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentField += char;
      }
    }

    // Add last field and line
    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      if (currentLine.length > 0 && currentLine.some(f => f !== '')) {
        lines.push(currentLine);
      }
    }

    return lines;
  };

  /** Indique si le libellé de catégorie correspond à « Courriers non classés » (ne pas créer de catégorie, mapper à null). */
  const isNonClasseFolderName = (name: string): boolean => {
    const n = (name || '').trim().toLowerCase();
    if (!n) return true;
    return n === 'courriers non classés' || n === 'non classés' || n === 'non classé';
  };

  // Import des courriers depuis CSV avec leur structure de catégories
  const importCourriersFromCSV = async (file: File) => {
    if (!user) return;

    if (!laravelApiService.isConfigured()) {
      showAlert(
        'L\'import nécessite l\'API Laravel. Dans le .env à la racine du projet, définissez VITE_LARAVEL_API_URL=http://localhost:8000 puis redémarrez le serveur (npm run dev). Démarrez aussi l\'API (cd laravel-api && php artisan serve).',
        'error',
        'Import impossible'
      );
      return;
    }
    const tokenCsv = typeof localStorage !== 'undefined' ? (localStorage.getItem('laravel_token') || localStorage.getItem('auth_token')) : null;
    if (!tokenCsv) {
      showAlert(
        'Vous devez être connecté à l\'API Laravel pour importer. Déconnectez-vous puis reconnectez-vous (connexion par email/mot de passe ou token par email) pour obtenir un token Laravel.',
        'error',
        'Import impossible'
      );
      return;
    }

    setImportingFolders(true);
    try {
      const text = await file.text();
      const lines = parseCSV(text);
      
      if (lines.length < 2) {
        throw new Error('Le fichier CSV doit contenir au moins une ligne d\'en-tête et une ligne de données');
      }

      // Première ligne = en-têtes (accepter noms avec notes entre parenthèses)
      const headers = lines[0].map(h => (h || '').trim());
      const dataLines = lines.slice(1).filter(line => line.length > 0 && line.some(c => (c || '').trim() !== ''));

      // Variantes de noms (avec/sans accents) pour faciliter l'import
      const getColumnIndex = (names: string | string[], allowStartsWith = false): number => {
        const list = Array.isArray(names) ? names : [names];
        const normalized = (s: string) => (s || '').toLowerCase().trim();
        for (const name of list) {
          const n = normalized(name);
          let index = headers.findIndex((h: string) => normalized(h) === n);
          if (index === -1 && allowStartsWith) {
            index = headers.findIndex((h: string) => normalized(h).startsWith(n) || n.startsWith(normalized(h)));
          }
          if (index >= 0) return index;
        }
        throw new Error(`Colonne manquante : ${list[0]}. En-têtes trouvés : ${headers.filter(Boolean).join(', ')}`);
      };

      // Colonnes requises (variantes avec/sans accents)
      const numCol = getColumnIndex(['Numéro', 'Numero']);
      const typeCol = getColumnIndex('Type');
      const sensCol = getColumnIndex('Sens');
      const dateReceptionCol = getColumnIndex(['Date de réception', 'Date de reception'], true);
      const expediteurCol = getColumnIndex(['Expéditeur (organisation externe si EXTERNE+ENTRANT)', 'Expéditeur', 'Expediteur'], true);
      const destinataireCol = getColumnIndex(['Destinataire (obligatoire si EXTERNE+SORTANT)', 'Destinataire'], true);
      const objetCol = getColumnIndex('Objet');
      const prioriteCol = getColumnIndex(['Priorité', 'Priorite']);

      // Colonnes optionnelles
      const dateEnregistrementCol = headers.findIndex((h: string) => (h || '').toLowerCase().includes('date d\'enregistrement'));
      const statutCol = headers.findIndex((h: string) => (h || '').toLowerCase() === 'statut');
      const directionCol = headers.findIndex((h: string) => (h || '').toLowerCase() === 'direction');
      const serviceCol = headers.findIndex((h: string) => (h || '').toLowerCase() === 'service');
      const categorieCol = headers.findIndex((h: string) => (h || '').toLowerCase().includes('catégorie'));
      const extraFieldsCol = headers.findIndex((h: string) => (h || '').toLowerCase().includes('champs extra'));
      const templateExtraFieldsCsv = formulaireCourrierService.getTemplateExtraFields();
      const extraColByLabelCsv = new Map<string, number>();
      templateExtraFieldsCsv.forEach((f) => {
        const idx = headers.findIndex((h: string) => (h || '').trim() === f.label || (h || '').trim() === f.name);
        if (idx >= 0) extraColByLabelCsv.set(f.name, idx);
      });

      console.log(`Import CSV : ${dataLines.length} ligne(s) de données`);

      // Créer un map des catégories uniques
      const foldersMap = new Map<string, { name: string; parentId?: string }>();
      const folderNameToId = new Map<string, string>();

      // 1. Parcourir les données pour collecter les catégories (exclure « Courriers non classés »)
      for (const line of dataLines) {
        if (categorieCol >= 0) {
          const folderName = (line[categorieCol] != null ? String(line[categorieCol]).trim() : '');
          if (folderName && !isNonClasseFolderName(folderName) && !foldersMap.has(folderName)) {
            foldersMap.set(folderName, { name: folderName });
          }
        }
      }

      // 2. Créer les catégories (API renvoie l'id réel — utiliser folder.id après save)
      const createdFolders: CategorieCourrier[] = [];
      for (const [folderName, folderData] of foldersMap) {
        try {
          const folder: CategorieCourrier = {
            id: '',
            name: folderName,
            parentId: folderData.parentId || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            userId: user.id
          };
          const saved = await categorieCourrierService.saveCategory(folder, user.id);
          createdFolders.push(saved);
          folderNameToId.set(folderName, saved.id);
          console.log(`Catégorie créée: ${folderName} (id: ${saved.id})`);
        } catch (error) {
          console.error(`Erreur lors de la création de la catégorie ${folderName}:`, error);
        }
      }

      // 3. Construire la liste des courriers valides puis créer par lots
      const existingCourrierNumeros = new Set(courriers.map(c => c.numero));
      const createdCourriers: Courrier[] = [];
      const finalFolderMap: Record<string, string | null> = {};

      let skippedCount = 0;
      let firstSkipReasonCsv: string | null = null;
      const setFirstSkipCsv = (r: string) => { if (firstSkipReasonCsv == null) firstSkipReasonCsv = r; };
      let emptyLinesCount = 0;

      type CsvItem = { courrierToCreate: Omit<Courrier, 'id' | 'dateEnregistrement' | 'statut' | 'createdAt' | 'updatedAt'> & { numero?: string }; folderId: string | null };
      const csvItemsToCreate: CsvItem[] = [];

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        if (!Array.isArray(line)) {
          skippedCount++;
          continue;
        }
        try {
          const safe = (idx: number) => (line[idx] != null ? String(line[idx]).replace(/\u00A0/g, ' ').trim() : '');
          const numero = safe(numCol);
          const typeStr = safe(typeCol).toUpperCase() || '';
          const sensStr = safe(sensCol).toUpperCase() || '';
          const objet = safe(objetCol);
          if (!numero && !objet && !typeStr) {
            emptyLinesCount++;
            continue;
          }
          const type = (typeStr === TypeCourrier.EXTERNE || typeStr === TypeCourrier.INTERNE ? typeStr : '') as TypeCourrier;
          const sens = (sensStr === SensCourrier.ENTRANT || sensStr === SensCourrier.SORTANT ? sensStr : '') as SensCourrier;
          const dateReceptionStr = safe(dateReceptionCol);
          let expediteur = safe(expediteurCol);
          const destinataire = safe(destinataireCol);
          const prioriteStr = safe(prioriteCol) || 'NORMALE';

          if (!type || !sens) {
            setFirstSkipCsv('Type ou Sens invalide (INTERNE/EXTERNE, ENTRANT/SORTANT)');
            skippedCount++;
            continue;
          }
          if (type === TypeCourrier.EXTERNE && sens === SensCourrier.ENTRANT && !expediteur) expediteur = 'Organisation externe';
          if (type === TypeCourrier.EXTERNE && sens === SensCourrier.SORTANT && !destinataire) {
            setFirstSkipCsv('Courrier sortant externe sans destinataire');
            skippedCount++;
            continue;
          }
          if (!dateReceptionStr || !expediteur || !destinataire || !objet) {
            setFirstSkipCsv('Données incomplètes (date, expéditeur, destinataire ou objet)');
            skippedCount++;
            continue;
          }
          if (numero && existingCourrierNumeros.has(numero)) {
            setFirstSkipCsv(`Numéro ${numero} existe déjà`);
            skippedCount++;
            continue;
          }
          const dateReception = new Date(dateReceptionStr);
          if (Number.isNaN(dateReception.getTime())) {
            setFirstSkipCsv('Date de réception invalide');
            skippedCount++;
            continue;
          }
          let priorite = prioriteStr.toUpperCase() as Priorite;
          if (!Object.values(Priorite).includes(priorite)) priorite = Priorite.NORMALE;
          let extraFields: Record<string, any> = {};
          templateExtraFieldsCsv.forEach((f) => {
            const colIndex = extraColByLabelCsv.get(f.name);
            if (colIndex !== undefined && colIndex >= 0) { const v = safe(colIndex); if (v !== '') extraFields[f.name] = v; }
          });
          if (extraFieldsCol >= 0 && safe(extraFieldsCol)) {
            try {
              const parsed = JSON.parse(safe(extraFieldsCol)) as Record<string, unknown>;
              extraFields = { ...extraFields, ...parsed };
            } catch { /* ignore */ }
          }
          const folderId = categorieCol >= 0
            ? (() => { const folderName = safe(categorieCol); return !folderName || isNonClasseFolderName(folderName) ? null : (folderNameToId.get(folderName) ?? null); })()
            : null;
          csvItemsToCreate.push({
            courrierToCreate: {
              numero: numero || '',
              type,
              sens,
              dateReception,
              expediteur,
              destinataire,
              objet,
              priorite,
              enregistrePar: user.id,
              direction: directionCol >= 0 ? safe(directionCol) || undefined : undefined,
              service: serviceCol >= 0 ? safe(serviceCol) || undefined : undefined,
              extraFields
            },
            folderId
          });
        } catch (error) {
          setFirstSkipCsv(error instanceof Error ? error.message : String(error));
          skippedCount++;
        }
      }

      const BULK_CHUNK_SIZE_CSV = 50;
      if (laravelApiService.isConfigured() && csvItemsToCreate.length > 0) {
        for (let i = 0; i < csvItemsToCreate.length; i += BULK_CHUNK_SIZE_CSV) {
          const chunk = csvItemsToCreate.slice(i, i + BULK_CHUNK_SIZE_CSV);
          setImportProgress({ current: createdCourriers.length, total: csvItemsToCreate.length, message: `Import CSV : ${createdCourriers.length} / ${csvItemsToCreate.length} courriers...` });
          try {
            const created = await laravelApiService.createCourriersBulk(chunk.map((x) => x.courrierToCreate) as any[]);
            if (Array.isArray(created) && created.length > 0) {
              chunk.forEach((x, idx) => { finalFolderMap[created[idx].id] = x.folderId; if (created[idx].numero) existingCourrierNumeros.add(created[idx].numero); });
              createdCourriers.push(...created);
            }
          } catch (err) {
            console.error('Erreur lot import CSV:', err);
            for (const { courrierToCreate, folderId } of chunk) {
              try {
                const newCourrier = await courrierService.createCourrier(courrierToCreate);
                createdCourriers.push(newCourrier);
                finalFolderMap[newCourrier.id] = folderId;
                if (newCourrier.numero) existingCourrierNumeros.add(newCourrier.numero);
              } catch (e) {
                console.error('Erreur création courrier CSV:', e);
              }
            }
          }
        }
        setImportProgress(null);
      } else {
        for (const { courrierToCreate, folderId } of csvItemsToCreate) {
          try {
            const newCourrier = await courrierService.createCourrier(courrierToCreate);
            createdCourriers.push(newCourrier);
            finalFolderMap[newCourrier.id] = folderId;
            if (newCourrier.numero) existingCourrierNumeros.add(newCourrier.numero);
          } catch (error) {
            console.error('Erreur création courrier:', error);
            skippedCount++;
          }
        }
      }

      // 4. Sauvegarder le mapping des catégories
      if (Object.keys(finalFolderMap).length > 0) {
        const existingMap = await categorieCourrierService.getFolderMap(user.id);
        const mergedMap = { ...existingMap, ...finalFolderMap };
        await categorieCourrierService.saveCategoryMap(user.id, mergedMap);
        console.log(`Mapping de ${Object.keys(finalFolderMap).length} courrier(s) sauvegardé`);
      }

      // 5. Recharger les données
      await loadCourriers();
      const { folders: reloadedFolders2, map: reloadedMap2 } = await categorieCourrierService.getCategoriesAndMapForUser(user.id);
      const deletedIds2 = categorieCourrierService.loadDeletedIds(user.id);
      const filteredFolders2 = reloadedFolders2.filter(folder => !deletedIds2.has(folder.id));
      setCategorieCourriers(filteredFolders2);
      setCategorieCourrierMap(reloadedMap2);
      
      // Mettre à jour les dossiers pour le chargement progressif
      setAllFolders(filteredFolders2);
      const firstBatch2 = filteredFolders2.slice(0, foldersBatchSize);
      setVisibleFolders(firstBatch2);
      categorieCourrierService.markLastSaveTime();

      let msg = skippedCount > 0 || emptyLinesCount > 0
        ? `Import CSV : ${createdCourriers.length} courrier(s) créé(s), ${createdFolders.length} catégorie(s)${skippedCount > 0 ? `, ${skippedCount} ligne(s) ignorée(s)` : ''}${emptyLinesCount > 0 ? `, ${emptyLinesCount} ligne(s) vide(s)` : ''}`
        : `Import CSV réussi : ${createdCourriers.length} courrier(s) créé(s) et ${createdFolders.length} catégorie(s) avec leur organisation`;
      if (skippedCount > 0 && firstSkipReasonCsv) {
        msg += ` Raison (1ère ligne ignorée) : ${firstSkipReasonCsv}`;
      }
      if (createdCourriers.length === 0 && (skippedCount > 0 || emptyLinesCount > 0)) {
        msg += ' Conseil : vérifiez que l\'API Laravel est démarrée (port 8000), que vous êtes connecté, et que le fichier a les en-têtes Type, Sens, Date de réception, Expéditeur, Destinataire, Objet (numéro optionnel).';
      }
      showAlert(msg, createdCourriers.length > 0 ? 'success' : (skippedCount > 0 ? 'warning' : 'success'));
    } catch (error) {
      console.error('Erreur lors de l\'import CSV:', error);
      showAlert(
        `Erreur lors de l'import CSV : ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    } finally {
      setImportProgress(null);
      setImportingFolders(false);
    }
  };

  // Import des courriers depuis Excel (XLSX/XLS)
  const importCourriersFromExcel = async (file: File) => {
    if (!user) return;

    if (!laravelApiService.isConfigured()) {
      showAlert(
        'L\'import nécessite l\'API Laravel. Dans le .env à la racine du projet, définissez VITE_LARAVEL_API_URL=http://localhost:8000 puis redémarrez le serveur (npm run dev). Démarrez aussi l\'API (cd laravel-api && php artisan serve).',
        'error',
        'Import impossible'
      );
      return;
    }
    const token = typeof localStorage !== 'undefined' ? (localStorage.getItem('laravel_token') || localStorage.getItem('auth_token')) : null;
    if (!token) {
      showAlert(
        'Vous devez être connecté à l\'API Laravel pour importer. Déconnectez-vous puis reconnectez-vous (connexion par email/mot de passe ou token par email) pour obtenir un token Laravel.',
        'error',
        'Import impossible'
      );
      return;
    }

    setImportingFolders(true);
    try {
      console.log(`Import Excel : ${file.name}`);
      
      // Lire le fichier Excel
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      
      if (workbook.worksheets.length === 0) {
        throw new Error('Le fichier Excel ne contient aucune feuille');
      }
      
      // Utiliser la première feuille
      const worksheet = workbook.worksheets[0];
      
      // Lire les en-têtes (première ligne, remplir les trous)
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const v = cell?.value;
        if (v == null || v === '') {
          headers[colNumber - 1] = '';
          return;
        }
        if (typeof v === 'number' && v > 0 && v < 100000) {
          const d = new Date((v - 25569) * 86400 * 1000);
          headers[colNumber - 1] = Number.isNaN(d.getTime()) ? String(v) : d.toISOString().split('T')[0];
        } else {
          headers[colNumber - 1] = (v?.toString() || '').trim();
        }
      });
      
      console.log('En-têtes détectés:', headers.filter(Boolean).join(', '));

      const getColumnIndexExcel = (names: string | string[], allowStartsWith = false): number => {
        const list = Array.isArray(names) ? names : [names];
        const normalized = (s: string) => (s || '').toLowerCase().trim();
        for (const name of list) {
          const n = normalized(name);
          let index = headers.findIndex((h: string) => normalized(h) === n);
          if (index === -1 && allowStartsWith) {
            index = headers.findIndex((h: string) => normalized(h).startsWith(n) || n.startsWith(normalized(h)));
          }
          if (index >= 0) return index;
        }
        throw new Error(`Colonne manquante : ${list[0]}. En-têtes trouvés : ${headers.filter(Boolean).join(', ')}`);
      };

      const numCol = getColumnIndexExcel(['Numéro', 'Numero']);
      const typeCol = getColumnIndexExcel('Type');
      const sensCol = getColumnIndexExcel('Sens');
      const dateReceptionCol = getColumnIndexExcel(['Date de réception', 'Date de reception'], true);
      const expediteurCol = getColumnIndexExcel(['Expéditeur (organisation externe si EXTERNE+ENTRANT)', 'Expéditeur', 'Expediteur'], true);
      const destinataireCol = getColumnIndexExcel(['Destinataire (obligatoire si EXTERNE+SORTANT)', 'Destinataire'], true);
      const objetCol = getColumnIndexExcel('Objet');
      const prioriteCol = getColumnIndexExcel(['Priorité', 'Priorite']);

      const dateEnregistrementCol = headers.findIndex((h: string) => (h || '').toLowerCase().includes('date d\'enregistrement'));
      const statutCol = headers.findIndex((h: string) => (h || '').toLowerCase() === 'statut');
      const directionCol = headers.findIndex((h: string) => (h || '').toLowerCase() === 'direction');
      const serviceCol = headers.findIndex((h: string) => (h || '').toLowerCase() === 'service');
      const categorieCol = headers.findIndex((h: string) => (h || '').toLowerCase().includes('catégorie'));
      const extraFieldsCol = headers.findIndex((h: string) => (h || '').toLowerCase().includes('champs extra'));
      const templateExtraFieldsForImport = formulaireCourrierService.getTemplateExtraFields();
      const extraColByLabel = new Map<string, number>();
      templateExtraFieldsForImport.forEach((f) => {
        const idx = headers.findIndex((h: string) => (h || '').trim() === f.label || (h || '').trim() === f.name);
        if (idx >= 0) extraColByLabel.set(f.name, idx);
      });

      // Créer un map des catégories uniques
      const foldersMap = new Map<string, { name: string; parentId?: string }>();
      const folderNameToId = new Map<string, string>();
      
      // 1. Parcourir les données pour collecter les catégories (exclure « Courriers non classés »)
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        
        const categorieCell = categorieCol >= 0 ? row.getCell(categorieCol + 1) : null;
        if (categorieCell && categorieCell.value) {
          const folderName = categorieCell.value.toString().trim();
          if (folderName && !isNonClasseFolderName(folderName) && !foldersMap.has(folderName)) {
            foldersMap.set(folderName, { name: folderName });
          }
        }
      });
      
      // 2. Créer les catégories (API peut renvoyer l'id réel — utiliser folder.id après save)
      const createdFolders: CategorieCourrier[] = [];
      for (const [folderName, folderData] of foldersMap) {
        try {
          const folder: CategorieCourrier = {
            id: '',
            name: folderName,
            parentId: folderData.parentId || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            userId: user.id
          };
          const saved = await categorieCourrierService.saveCategory(folder, user.id);
          createdFolders.push(saved);
          folderNameToId.set(folderName, saved.id);
          console.log(`Catégorie créée: ${folderName} (id: ${saved.id})`);
        } catch (error) {
          console.error(`Erreur lors de la création de la catégorie ${folderName}:`, error);
        }
      }
      
      // 3. Créer les courriers
      const existingCourrierNumeros = new Set(courriers.map(c => c.numero));
      const createdCourriers: Courrier[] = [];
      const finalFolderMap: Record<string, string | null> = {};
      
      // Collecter toutes les lignes de données d'abord
      const dataRows: Array<{ row: ExcelJS.Row; rowNumber: number }> = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        dataRows.push({ row, rowNumber });
      });
      
      const getCellValue = (row: ExcelJS.Row, colIndex: number): string => {
        if (colIndex < 0) return '';
        const cell = row.getCell(colIndex + 1);
        if (!cell || cell.value == null || cell.value === '') return '';
        const v = cell.value;
        if (v instanceof Date) return v.toISOString().split('T')[0];
        if (typeof v === 'number') {
          if (v > 0 && v < 100000) {
            const d = new Date((v - 25569) * 86400 * 1000);
            if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
          }
          return String(v);
        }
        return String(v).replace(/\u00A0/g, ' ').trim();
      };
      
      let excelSkippedCount = 0;
      let excelEmptyRowsCount = 0;
      let firstSkipReason: string | null = null;

      const setFirstSkipReason = (reason: string) => {
        if (firstSkipReason == null) firstSkipReason = reason;
      };

      type ExcelItem = { courrierToCreate: Omit<Courrier, 'id' | 'dateEnregistrement' | 'statut' | 'createdAt' | 'updatedAt'> & { numero?: string }; folderId: string | null };
      const excelItemsToCreate: ExcelItem[] = [];

      for (const { row, rowNumber } of dataRows) {
        try {
          const numero = getCellValue(row, numCol);
          const objet = getCellValue(row, objetCol);
          const typeStr = getCellValue(row, typeCol);
          if (!numero && !objet && !typeStr) {
            excelEmptyRowsCount++;
            continue;
          }
          const typeStrNorm = typeStr.toUpperCase();
          const sensStr = getCellValue(row, sensCol).toUpperCase();
          const type = (typeStrNorm === TypeCourrier.EXTERNE || typeStrNorm === TypeCourrier.INTERNE ? typeStrNorm : '') as TypeCourrier;
          const sens = (sensStr === SensCourrier.ENTRANT || sensStr === SensCourrier.SORTANT ? sensStr : '') as SensCourrier;
          const dateReceptionStr = getCellValue(row, dateReceptionCol);
          let expediteur = getCellValue(row, expediteurCol);
          const destinataire = getCellValue(row, destinataireCol);
          const prioriteStr = getCellValue(row, prioriteCol) || 'NORMALE';

          if (!type || !sens) {
            setFirstSkipReason('Type ou Sens invalide (attendu INTERNE/EXTERNE, ENTRANT/SORTANT)');
            excelSkippedCount++;
            continue;
          }
          if (type === TypeCourrier.EXTERNE && sens === SensCourrier.ENTRANT && !expediteur) expediteur = 'Organisation externe';
          if (type === TypeCourrier.EXTERNE && sens === SensCourrier.SORTANT && !destinataire) {
            setFirstSkipReason('Courrier sortant externe sans destinataire');
            excelSkippedCount++;
            continue;
          }
          if (!dateReceptionStr || !expediteur || !destinataire || !objet) {
            setFirstSkipReason('Données incomplètes (date, expéditeur, destinataire ou objet manquant)');
            excelSkippedCount++;
            continue;
          }
          if (numero && existingCourrierNumeros.has(numero)) {
            setFirstSkipReason(`Numéro ${numero} existe déjà`);
            excelSkippedCount++;
            continue;
          }

          let dateReception: Date;
          const dateReceptionCell = row.getCell(dateReceptionCol + 1);
          const dateReceptionVal = dateReceptionCell?.value;
          if (dateReceptionVal instanceof Date) {
            dateReception = dateReceptionVal;
          } else if (typeof dateReceptionVal === 'number' && dateReceptionVal > 0 && dateReceptionVal < 100000) {
            dateReception = new Date((dateReceptionVal - 25569) * 86400 * 1000);
          } else {
            dateReception = new Date(dateReceptionStr);
          }
          if (Number.isNaN(dateReception.getTime())) {
            setFirstSkipReason('Date de réception invalide');
            excelSkippedCount++;
            continue;
          }

          let priorite = prioriteStr.toUpperCase() as Priorite;
          if (!Object.values(Priorite).includes(priorite)) priorite = Priorite.NORMALE;

          let extraFields: Record<string, any> = {};
          templateExtraFieldsForImport.forEach((f) => {
            const colIndex = extraColByLabel.get(f.name);
            if (colIndex !== undefined && colIndex >= 0) { const v = getCellValue(row, colIndex); if (v !== '') extraFields[f.name] = v; }
          });
          if (extraFieldsCol >= 0) {
            const extraFieldsValue = getCellValue(row, extraFieldsCol);
            if (extraFieldsValue) {
              try {
                const parsed = JSON.parse(extraFieldsValue) as Record<string, unknown>;
                extraFields = { ...extraFields, ...parsed };
              } catch { /* ignore */ }
            }
          }

          const folderId = categorieCol >= 0
            ? (() => { const folderName = getCellValue(row, categorieCol); return !folderName || isNonClasseFolderName(folderName) ? null : (folderNameToId.get(folderName) ?? null); })()
            : null;

          excelItemsToCreate.push({
            courrierToCreate: {
              numero: numero || '',
              type,
              sens,
              dateReception,
              expediteur,
              destinataire,
              objet,
              priorite,
              enregistrePar: user.id,
              direction: directionCol >= 0 ? getCellValue(row, directionCol) || undefined : undefined,
              service: serviceCol >= 0 ? getCellValue(row, serviceCol) || undefined : undefined,
              extraFields
            },
            folderId
          });
        } catch (error) {
          setFirstSkipReason(error instanceof Error ? error.message : String(error));
          excelSkippedCount++;
        }
      }

      const BULK_CHUNK_SIZE_EXCEL = 50;
      if (laravelApiService.isConfigured() && excelItemsToCreate.length > 0) {
        for (let i = 0; i < excelItemsToCreate.length; i += BULK_CHUNK_SIZE_EXCEL) {
          const chunk = excelItemsToCreate.slice(i, i + BULK_CHUNK_SIZE_EXCEL);
          setImportProgress({ current: createdCourriers.length, total: excelItemsToCreate.length, message: `Import Excel : ${createdCourriers.length} / ${excelItemsToCreate.length} courriers...` });
          try {
            const created = await laravelApiService.createCourriersBulk(chunk.map((x) => x.courrierToCreate) as any[]);
            if (Array.isArray(created) && created.length > 0) {
              chunk.forEach((x, idx) => { finalFolderMap[created[idx].id] = x.folderId; if (created[idx].numero) existingCourrierNumeros.add(created[idx].numero); });
              createdCourriers.push(...created);
            }
          } catch (err) {
            console.error('Erreur lot import Excel:', err);
            for (const { courrierToCreate, folderId } of chunk) {
              try {
                const newCourrier = await courrierService.createCourrier(courrierToCreate);
                createdCourriers.push(newCourrier);
                finalFolderMap[newCourrier.id] = folderId;
                if (newCourrier.numero) existingCourrierNumeros.add(newCourrier.numero);
              } catch (e) {
                console.error('Erreur création courrier Excel:', e);
              }
            }
          }
        }
        setImportProgress(null);
      } else {
        for (const { courrierToCreate, folderId } of excelItemsToCreate) {
          try {
            const newCourrier = await courrierService.createCourrier(courrierToCreate);
            createdCourriers.push(newCourrier);
            finalFolderMap[newCourrier.id] = folderId;
            if (newCourrier.numero) existingCourrierNumeros.add(newCourrier.numero);
          } catch (error) {
            console.error('Erreur création courrier Excel:', error);
            excelSkippedCount++;
          }
        }
      }

      console.log(`${createdCourriers.length} courrier(s) créé(s), ${excelSkippedCount} ligne(s) ignorée(s)${excelEmptyRowsCount > 0 ? `, ${excelEmptyRowsCount} ligne(s) vide(s)` : ''}`);
      
      // 4. Sauvegarder le mapping des catégories
      if (Object.keys(finalFolderMap).length > 0) {
        const existingMap = await categorieCourrierService.getFolderMap(user.id);
        const mergedMap = { ...existingMap, ...finalFolderMap };
        await categorieCourrierService.saveCategoryMap(user.id, mergedMap);
        console.log(`Mapping de ${Object.keys(finalFolderMap).length} courrier(s) sauvegardé`);
      }
      
      // 5. Recharger les données
      await loadCourriers();
      const { folders: reloadedFolders3, map: reloadedMap3 } = await categorieCourrierService.getCategoriesAndMapForUser(user.id);
      const deletedIds3 = categorieCourrierService.loadDeletedIds(user.id);
      const filteredFolders3 = reloadedFolders3.filter(folder => !deletedIds3.has(folder.id));
      setCategorieCourriers(filteredFolders3);
      setCategorieCourrierMap(reloadedMap3);
      
      // Mettre à jour les dossiers pour le chargement progressif
      setAllFolders(filteredFolders3);
      const firstBatch3 = filteredFolders3.slice(0, foldersBatchSize);
      setVisibleFolders(firstBatch3);
      categorieCourrierService.markLastSaveTime();
      
      let excelMsg = excelSkippedCount > 0 || excelEmptyRowsCount > 0
        ? `Import Excel : ${createdCourriers.length} courrier(s) créé(s), ${createdFolders.length} catégorie(s)${excelSkippedCount > 0 ? `, ${excelSkippedCount} ligne(s) ignorée(s)` : ''}${excelEmptyRowsCount > 0 ? `, ${excelEmptyRowsCount} ligne(s) vide(s)` : ''}`
        : `Import Excel réussi : ${createdCourriers.length} courrier(s) créé(s) et ${createdFolders.length} catégorie(s) avec leur organisation`;
      if (excelSkippedCount > 0 && firstSkipReason) {
        excelMsg += ` Raison (1ère ligne ignorée) : ${firstSkipReason}`;
      }
      if (createdCourriers.length === 0 && (excelSkippedCount > 0 || excelEmptyRowsCount > 0)) {
        excelMsg += ' Conseil : vérifiez que l\'API Laravel est démarrée (port 8000), que vous êtes connecté, et que le fichier a les en-têtes Type, Sens, Date de réception, Expéditeur, Destinataire, Objet (numéro optionnel).';
      }
      showAlert(excelMsg, createdCourriers.length > 0 ? 'success' : (excelSkippedCount > 0 ? 'warning' : 'success'));
    } catch (error) {
      console.error('Erreur lors de l\'import Excel:', error);
      showAlert(
        `Erreur lors de l'import Excel : ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    } finally {
      setImportProgress(null);
      setImportingFolders(false);
    }
  };

  // Gestionnaire de changement de fichier pour l'import des courriers avec catégories
  const handleImportCourriersFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user) {
      showAlert('Connectez-vous pour importer des courriers.', 'error', 'Import impossible');
      e.target.value = '';
      return;
    }
    if (!isFormConfigured) {
      showAlert('Configurez le formulaire courrier (Paramètres > Formulaire courriers) pour activer l\'import.', 'warning', 'Formulaire non configuré');
      e.target.value = '';
      return;
    }
    if (!laravelApiService.isConfigured()) {
      showAlert('L\'API Laravel n\'est pas configurée (VITE_LARAVEL_API_URL). Démarrez l\'API (php artisan serve) et définissez l\'URL dans le .env.', 'error', 'Import impossible');
      e.target.value = '';
      return;
    }

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop();

    // Détecter le format et appeler la fonction appropriée
    if (fileExtension === 'csv') {
      importCourriersFromCSV(file);
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      importCourriersFromExcel(file);
    } else if (fileExtension === 'json') {
      importCourriersWithFolders(file);
    } else {
      showAlert('Format de fichier non supporté. Utilisez CSV, JSON ou Excel (.xlsx, .xls)', 'error');
    }

    // Réinitialiser l'input pour permettre de sélectionner le même fichier
    e.target.value = '';
    setShowImportDropdown(false);
  };
  
  // Fonction pour déclencher l'import selon le format (clic différé pour que le dialog fichier s'ouvre après fermeture du dropdown)
  const triggerImport = (format: 'csv' | 'json' | 'excel') => {
    if (!isFormConfigured) {
      showAlert('Configurez le formulaire courrier (Paramètres > Formulaire courriers) pour activer l\'import et le téléchargement du modèle.', 'warning', 'Formulaire non configuré');
      return;
    }
    const input = importFileInputRef.current;
    if (!input) return;
    const accept = format === 'csv' ? '.csv' : format === 'json' ? '.json' : '.xlsx,.xls';
    input.accept = accept;
    input.value = '';
    requestAnimationFrame(() => {
      if (importFileInputRef.current) importFileInputRef.current.click();
    });
  };

  // Générer le contenu CSV du modèle selon le paramétrage formulaire (en-têtes + ligne d'exemple)
  const getCsvTemplateContent = (): string => {
    const escapeCsv = (v: string) => {
      if (v.includes('"') || v.includes(',') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const baseHeaders = ['Numéro', 'Type', 'Sens', 'Date de réception', 'Date d\'enregistrement', 'Expéditeur (organisation externe si EXTERNE+ENTRANT)', 'Destinataire (obligatoire si EXTERNE+SORTANT)', 'Objet', 'Priorité', 'Statut', 'Direction', 'Service', 'Catégorie de classement'];
    const templateExtras = formulaireCourrierService.getTemplateExtraFields();
    const extraHeaders = templateExtras.map((f) => f.label);
    const headers = [...baseHeaders, ...extraHeaders, 'Champs extra (JSON)'];
    const headerLine = headers.map(escapeCsv).join(',');
    const exampleRow = [
      'INT-2026-0001', 'INTERNE', 'ENTRANT', '2026-01-15', '2026-01-15',
      'Primature', 'Service Informatique', 'Demande de proposition', 'HAUTE', 'ENREGISTRE',
      'Direction Technique', 'Service Informatique', 'Catégorie A',
      ...templateExtras.map(() => ''),
      '{"reference":"REF-001","montant":50000}',
    ];
    const rowLine = exampleRow.map(escapeCsv).join(',');
    return [headerLine, rowLine].join('\n');
  };

  // Fonction pour générer et télécharger le modèle Excel (colonnes selon paramétrage formulaire)
  const downloadExcelTemplate = async () => {
    if (!isFormConfigured) {
      showAlert('Configurez le formulaire courrier (Paramètres > Formulaire courriers) pour activer le téléchargement du modèle.', 'warning', 'Formulaire non configuré');
      return;
    }
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Courriers');

      const templateExtraFields = formulaireCourrierService.getTemplateExtraFields();

      // Colonnes de base + une colonne par champ extra configuré + Champs extra (JSON) en fallback
      const baseColumns: Array<{ header: string; key: string; width: number }> = [
        { header: 'Numéro', key: 'numero', width: 18 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Sens', key: 'sens', width: 12 },
        { header: 'Date de réception', key: 'dateReception', width: 18 },
        { header: 'Date d\'enregistrement', key: 'dateEnregistrement', width: 20 },
        { header: 'Expéditeur (organisation externe si EXTERNE+ENTRANT)', key: 'expediteur', width: 45 },
        { header: 'Destinataire (obligatoire si EXTERNE+SORTANT)', key: 'destinataire', width: 40 },
        { header: 'Objet', key: 'objet', width: 40 },
        { header: 'Priorité', key: 'priorite', width: 12 },
        { header: 'Statut', key: 'statut', width: 15 },
        { header: 'Direction', key: 'direction', width: 25 },
        { header: 'Service', key: 'service', width: 25 },
        { header: 'Catégorie de classement', key: 'categorie', width: 25 },
      ];
      const extraColumns = templateExtraFields.map((f) => ({
        header: f.label,
        key: `extra_${f.name}`,
        width: 20,
      }));
      worksheet.columns = [
        ...baseColumns,
        ...extraColumns,
        { header: 'Champs extra (JSON)', key: 'extraFields', width: 40 },
      ];

      // Style de l'en-tête
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 25;

      // Données d'exemple (colonnes extra_* remplies selon paramétrage formulaire)
      const exampleRows = [
        { numero: 'INT-2026-0001', type: 'INTERNE', sens: 'ENTRANT', dateReception: new Date('2026-01-15'), dateEnregistrement: new Date('2026-01-15'), expediteur: 'Primature', destinataire: 'Service Informatique', objet: 'Demande de proposition', priorite: 'HAUTE', statut: 'ENREGISTRE', direction: 'Direction Technique', service: 'Service Informatique', categorie: 'Catégorie A', extraFieldsJson: '{"reference":"REF-001","montant":50000}' },
        { numero: 'EXT-2026-0002', type: 'EXTERNE', sens: 'ENTRANT', dateReception: new Date('2026-01-16'), dateEnregistrement: new Date('2026-01-16'), expediteur: 'Ministère de l\'Économie', destinataire: 'Direction Administrative', objet: 'Notification de renouvellement', priorite: 'HAUTE', statut: 'ENREGISTRE', direction: 'Direction Administrative', service: 'Service Comptabilité', categorie: 'Courriers non classés', extraFieldsJson: '{"reference":"REF-002"}' },
        { numero: 'INT-2026-0003', type: 'INTERNE', sens: 'SORTANT', dateReception: new Date('2026-01-17'), dateEnregistrement: new Date('2026-01-17'), expediteur: 'Direction Technique', destinataire: 'Service Maintenance', objet: 'Demande d\'intervention', priorite: 'URGENTE', statut: 'EN_TRAITEMENT', direction: 'Direction Technique', service: 'Service Maintenance', categorie: 'Catégorie A', extraFieldsJson: '{"intervention":"maintenance système"}' },
        { numero: 'EXT-2026-0004', type: 'EXTERNE', sens: 'ENTRANT', dateReception: new Date('2026-01-18'), dateEnregistrement: new Date('2026-01-18'), expediteur: 'Organisme de Certification', destinataire: 'Direction Administrative', objet: 'Notification de renouvellement de certification ISO 9001', priorite: 'HAUTE', statut: 'ENREGISTRE', direction: 'Direction Administrative', service: 'Service Qualité', categorie: 'Catégorie B', extraFieldsJson: '{"certification":"ISO 9001","date_expiration":"2026-12-31"}' },
        { numero: 'INT-2026-0005', type: 'INTERNE', sens: 'ENTRANT', dateReception: new Date('2026-01-19'), dateEnregistrement: new Date('2026-01-19'), expediteur: 'Direction Administrative', destinataire: 'Service RH', objet: 'Demande de recrutement', priorite: 'NORMALE', statut: 'ENREGISTRE', direction: 'Direction Administrative', service: 'Service RH', categorie: 'Catégorie B', extraFieldsJson: '{"poste":"Développeur","departement":"IT"}' },
        { numero: 'INT-2026-0006', type: 'INTERNE', sens: 'SORTANT', dateReception: new Date('2026-01-20'), dateEnregistrement: new Date('2026-01-20'), expediteur: 'Direction Technique', destinataire: 'Service Client', objet: 'Proposition commerciale', priorite: 'HAUTE', statut: 'ENREGISTRE', direction: 'Direction Technique', service: 'Service Commercial', categorie: 'Catégorie A', extraFieldsJson: '{"client":"Entreprise XYZ","montant":75000}' },
        { numero: 'EXT-2026-0007', type: 'EXTERNE', sens: 'ENTRANT', dateReception: new Date('2026-01-21'), dateEnregistrement: new Date('2026-01-21'), expediteur: 'Ministère des Finances', destinataire: 'Direction Administrative', objet: 'Demande de documents budgétaires', priorite: 'URGENTE', statut: 'EN_ATTENTE_DG', direction: 'Direction Administrative', service: 'Service Comptabilité', categorie: 'Catégorie C', extraFieldsJson: '{"exercice":"2026","type":"budget"}' },
        { numero: 'INT-2026-0008', type: 'INTERNE', sens: 'ENTRANT', dateReception: new Date('2026-01-22'), dateEnregistrement: new Date('2026-01-22'), expediteur: 'Direction Administrative', destinataire: 'Service Juridique', objet: 'Demande d\'avis juridique', priorite: 'NORMALE', statut: 'EN_TRAITEMENT', direction: 'Direction Administrative', service: 'Service Juridique', categorie: 'Catégorie C', extraFieldsJson: '{"domaine":"contrat","urgence":"moyenne"}' },
        { numero: 'EXT-2026-0009', type: 'EXTERNE', sens: 'ENTRANT', dateReception: new Date('2026-01-23'), dateEnregistrement: new Date('2026-01-23'), expediteur: 'Organisation externe', destinataire: 'Direction Administrative', objet: 'Courrier entrant externe', priorite: 'NORMALE', statut: 'ENREGISTRE', direction: 'Direction Administrative', service: 'Service Courrier', categorie: 'Courriers non classés', extraFieldsJson: '{}' },
        { numero: 'EXT-2026-0010', type: 'EXTERNE', sens: 'SORTANT', dateReception: new Date('2026-01-24'), dateEnregistrement: new Date('2026-01-24'), expediteur: 'Direction Administrative', destinataire: 'Partenaire externe / Client XYZ', objet: 'Courrier sortant externe', priorite: 'HAUTE', statut: 'ENREGISTRE', direction: 'Direction Administrative', service: 'Service Commercial', categorie: 'Catégorie C', extraFieldsJson: '{}' },
      ];

      exampleRows.forEach((row) => {
        let parsed: Record<string, unknown> = {};
        try {
          if (row.extraFieldsJson) parsed = JSON.parse(row.extraFieldsJson) as Record<string, unknown>;
        } catch {}
        const data: Record<string, unknown> = {
          numero: row.numero,
          type: row.type,
          sens: row.sens,
          dateReception: row.dateReception,
          dateEnregistrement: row.dateEnregistrement,
          expediteur: row.expediteur,
          destinataire: row.destinataire,
          objet: row.objet,
          priorite: row.priorite,
          statut: row.statut,
          direction: row.direction,
          service: row.service,
          categorie: row.categorie,
        };
        templateExtraFields.forEach((f) => {
          data[`extra_${f.name}`] = parsed[f.name] ?? '';
        });
        data.extraFields = row.extraFieldsJson;
        worksheet.addRow(data);
      });

      // Formater les dates
      worksheet.getColumn('dateReception').numFmt = 'yyyy-mm-dd';
      worksheet.getColumn('dateEnregistrement').numFmt = 'yyyy-mm-dd';

      // Appliquer des bordures à toutes les cellules
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          if (rowNumber > 1) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }
        });
      });

      // Générer le fichier
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'modele_import_courriers.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showAlert('Modèle Excel téléchargé avec succès', 'success');
    } catch (error) {
      console.error('Erreur lors de la génération du modèle Excel:', error);
      showAlert('Erreur lors de la génération du modèle Excel', 'error');
    }
  };

  // Charger les informations de stockage
  const loadStorageInfo = async () => {
    try {
      if (!laravelApiService.isConfigured()) {
        setStorageInfo(null);
        return;
      }
      
      console.log('Chargement du stockage...');
      
      // Récupérer les courriers accessibles
      const accessibleCourriers = await courrierService.getAccessibleCourriers(user?.id || '', user || undefined);
      console.log('Courriers accessibles pour stockage:', accessibleCourriers.length);
      
      // Calculer les stats avec répartition par type
      let totalSize = 0;
      let totalFiles = 0;
      const extensionMap = new Map<string, { count: number; size: number }>();
      
      for (const courrier of accessibleCourriers) {
        try {
          const fichiers = await categorieFichierService.getCategoriesFichiersByCourrier(courrier.id);
          for (const file of fichiers) {
            totalSize += file.taille || 0;
            totalFiles++;
            
            const extension = file.nom?.split('.').pop()?.toLowerCase() || 'autre';
            if (!extensionMap.has(extension)) {
              extensionMap.set(extension, { count: 0, size: 0 });
            }
            const data = extensionMap.get(extension)!;
            data.count++;
            data.size += file.taille || 0;
          }
        } catch (error) {
          // Ignorer les erreurs
        }
      }
      
      const quota = 1073741824; // 1GB
      const usagePercent = quota > 0 ? (totalSize / quota) * 100 : 0;

      const items = Array.from(extensionMap.entries())
        .map(([extension, data]) => ({
          type: getFileTypeName(extension),
          extension,
          count: data.count,
          size: data.size,
          percentage: totalSize > 0 ? (data.size / totalSize) * 100 : 0,
        }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 10);

      setStorageInfo({
        totalSize,
        usedSize: totalSize,
        availableSize: Math.max(0, quota - totalSize),
        usagePercent,
        totalFiles,
        items,
      });
      
      console.log('Stockage chargé avec répartition:', { totalSize, totalFiles, usagePercent, typesCount: items.length });
    } catch (error) {
      console.error('Erreur stockage:', error);
      setStorageInfo(null);
    }
  };

  // Helper function pour getFileTypeName
  const getFileTypeName = (extension: string): string => {
    const typeMap: { [key: string]: string } = {
      'pdf': 'PDF',
      'doc': 'Word',
      'docx': 'Word',
      'xls': 'Excel',
      'xlsx': 'Excel',
      'ppt': 'PowerPoint',
      'pptx': 'PowerPoint',
      'jpg': 'Image',
      'jpeg': 'Image',
      'png': 'Image',
      'gif': 'Image',
      'txt': 'Texte',
      'rtf': 'Texte',
      'zip': 'Archive',
      'rar': 'Archive',
      '7z': 'Archive',
      'mp4': 'Vidéo',
      'avi': 'Vidéo',
      'mp3': 'Audio',
      'wav': 'Audio'
    };
    return typeMap[extension.toLowerCase()] || extension.toUpperCase() || 'Autre';
  };

  /**
   * Construit les filtres serveur selon le rôle et l'entité organisationnelle de l'utilisateur.
   * - SUPER_ADMIN / DIRECTEUR_GENERAL : pas de filtre (tous les courriers)
   * - SECRETAIRE DG (sans direction ou Direction Générale) : pas de filtre
   * - SECRETAIRE de direction / DIRECTEUR : filtrer par direction
   * - CHEF_SERVICE : filtrer par direction + service
   * - AGENT : pas de filtre serveur (filtrage fin fait côté client via assignations)
   */
  const buildServerFilters = (): { direction?: string; service?: string; role?: string } | undefined => {
    if (!user) return undefined;
    const normDir = (d?: string) => (d || '').trim().toLowerCase();

    if (user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL) return undefined;

    const isSecretaireDG =
      user.role === Role.SECRETAIRE &&
      (!user.direction ||
        normDir(user.direction).includes('général') ||
        normDir(user.direction).includes('general') ||
        normDir(user.direction) === 'dg');
    if (isSecretaireDG) return undefined;

    if (user.role === Role.SECRETAIRE && user.direction) {
      return { direction: user.direction, role: user.role };
    }
    if (user.role === Role.DIRECTEUR && user.direction) {
      return { direction: user.direction, role: user.role };
    }
    if (user.role === Role.CHEF_SERVICE && user.direction) {
      return {
        direction: user.direction,
        ...(user.service ? { service: user.service } : {}),
        role: user.role,
      };
    }
    // AGENT et autres : pas de filtre serveur (le filtrage par assignations se fait côté client)
    return undefined;
  };

  const loadCourriers = async () => {
    if (!user) return;
    setLoadingCourriers(true);

    if (!laravelApiService.isConfigured()) {
      entiteOrganisationnelleService.initializeDemoData();
    }

    // ── Phase 1 : fetch courriers → affichage progressif par lots ────────────────────
    const timeoutMs = 15000;
    const timeoutId = setTimeout(() => {
      setLoadingCourriers(false);
    }, timeoutMs);

    try {
      const { fetchCourriers } = await import('../store/slices/courriersSlice');
      const { store } = await import('../store/store');
      const serverFilters = buildServerFilters();
      // Race : abandon après 10s même si PHP ne répond pas (évite un await infini)
      await Promise.race([
        store.dispatch(fetchCourriers({ serverFilters })),
        new Promise<void>(resolve => setTimeout(resolve, 10000)),
      ]);

      // Lire directement le store après le fetch (évite un 2ème appel API dans getAccessibleCourriers)
      const allCourriersData = await courrierService.getAccessibleCourriers(user.id, user);
      
      // Stocker tous les courriers dans allCourriers dès le début pour les stats
      setAllCourriers(allCourriersData);
      
      // Charger uniquement le premier lot de 50 courriers
      const BATCH_SIZE = 50;
      const firstBatch = allCourriersData.slice(0, BATCH_SIZE);
      setCourriers(firstBatch);
      setFormConfig(formulaireCourrierService.getConfig());
    } catch (error) {
      console.error('Erreur chargement courriers:', error);
      setCourriers([]);
      setAllCourriers([]);
    } finally {
      clearTimeout(timeoutId);
      // Fin Phase 1 → skeleton disparaît, liste visible
      setLoadingCourriers(false);
    }

    // ── Phase 0 : syncs secondaires différés — après Phase 1 pour ne pas
    //             saturer PHP-FPM pendant le chargement principal ──────────
    if (laravelApiService.isConfigured()) {
      setTimeout(() => {
        entiteTypeService.syncFromApi().catch(() => {});
        entiteOrganisationnelleService.refreshFromApi().catch(() => {});
        adminService.refreshUsersFromApi().catch(() => {});
        formulaireCourrierService.getConfigAsync()
          .then(cfg => setFormConfig(cfg))
          .catch(() => {});
      }, 1000); // 1s après la liste affichée — cache Laravel = réponses rapides
    }

    // ── Phase 2 : données secondaires en arrière-plan ─────────────────────
    const loadSecondary = async () => {
      // Assignations personnelles
      try {
        const assignations = await courrierService.loadAssignationsByUser(user.id);
        const assignationsMap = new Map<string, Assignation>();
        assignations.forEach(a => assignationsMap.set(a.courrierId, a));
        setMesAssignations(assignationsMap);
      } catch { /* non-bloquant */ }

      // Assignations DG
      if (user.role === Role.SECRETAIRE || user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL) {
        try {
          const dgUser = adminService.getDirecteurGeneral();
          if (dgUser?.id) {
            const dgAssignations = await courrierService.loadAssignationsByUser(dgUser.id);
            // Assignations DG chargées avec succès - non stockées actuellement
            (dgAssignations);
          }
        } catch { /* non-bloquant */ }
      }

      // Dossiers et fichiers - chargement différé par courrier lors de l'accès
    };

    // Lancer Phase 2 en arrière-plan sans bloquer
    loadSecondary().catch(() => {});
  };

  const loadMoreCourriers = async () => {
    if (loadingMoreCourriers || courriers.length >= allCourriers.length) return;
    
    setLoadingMoreCourriers(true);
    
    try {
      // Simuler un délai pour montrer l'animation skeleton
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const BATCH_SIZE = 50;
      const currentLength = courriers.length;
      const nextBatch = allCourriers.slice(currentLength, currentLength + BATCH_SIZE);
      
      setCourriers(prev => [...prev, ...nextBatch]);
    } catch (error) {
      console.error('Erreur chargement plus de courriers:', error);
    } finally {
      setLoadingMoreCourriers(false);
    }
  };


  // Fonctions d'export
  const getFormatDimensions = (format: string, orientation: 'portrait' | 'landscape') => {
    const formats: Record<string, { width: number; height: number }> = {
      'A4': { width: 210, height: 297 },
      'A3': { width: 297, height: 420 },
      'A2': { width: 420, height: 594 },
      'A1': { width: 594, height: 841 }
    };
    
    const dims = formats[format] || formats['A4'];
    return orientation === 'landscape' 
      ? { width: dims.height, height: dims.width }
      : dims;
  };


  const exportPDF = async (settings?: typeof exportSettings) => {
    const params = settings || exportSettings;
    setExporting(true);
    
    try {
      // Utiliser la nouvelle approche directe
      const pdf = generatePDFDirect(params);
      
      // Télécharger le PDF
      pdf.save(`courriers_${new Date().toISOString().split('T')[0]}.pdf`);
      setShowExportSettings(false);
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert('Erreur lors de l\'export PDF: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setExporting(false);
    }
  };

  // Fonction pour générer le PDF directement avec jsPDF (sans html2canvas)
  const generatePDFDirect = (settings?: ExportSettings): jsPDF => {
    const params = settings || exportSettings;
    const unifiedFields = getUnifiedTableFields();
    const CORE_FIELDS = ['type', 'expediteur', 'destinataire', 'objet'];
    const dynamicFields = unifiedFields.filter(field => field.name && !CORE_FIELDS.includes(field.name));

    // Déterminer le format
    const dims = params.format === 'auto' 
      ? { width: 210, height: 297 } // A4 par défaut
      : getFormatDimensions(params.format, params.orientation);
    
    // Créer le PDF
    const pdf = new jsPDF({
      orientation: params.orientation,
      unit: 'mm',
      format: [dims.width, dims.height]
    });

    const pageWidth = dims.width;
    const pageHeight = dims.height;
    const marginLeft = Math.max(5, Math.min(params.margins.left || 10, pageWidth / 4));
    const marginRight = Math.max(5, Math.min(params.margins.right || 10, pageWidth / 4));
    const marginTop = Math.max(5, Math.min(params.margins.top || 10, pageHeight / 4));
    const marginBottom = Math.max(5, Math.min(params.margins.bottom || 10, pageHeight / 4));
    
    const contentWidth = pageWidth - marginLeft - marginRight;
    const contentHeight = pageHeight - marginTop - marginBottom;
    
    let currentY = marginTop;
    const lineHeight = 6;
    const cellPadding = 3;
    const headerHeight = 12;
    
    // Fonction pour ajouter une nouvelle page si nécessaire
    const checkNewPage = (requiredHeight: number) => {
      if (currentY + requiredHeight > pageHeight - marginBottom) {
        pdf.addPage();
        currentY = marginTop;
        return true;
      }
      return false;
    };

    // Fonction pour obtenir la couleur du badge
    const getBadgeColor = (type: string, value: string) => {
      if (type === 'statut') {
        return value === StatutCourrier.TRAITE ? '#10b981' : 
               value === StatutCourrier.EN_TRAITEMENT ? '#3b82f6' : 
               value === StatutCourrier.ASSIGNE ? '#8b5cf6' :
               value === StatutCourrier.ORIENTE_DG ? '#f97316' :
               value === StatutCourrier.ORIENTE_DIRECTEUR ? '#ea580c' :
               value === StatutCourrier.EN_ATTENTE_DG ? '#f59e0b' : 
               value === StatutCourrier.ENREGISTRE ? '#6b7280' : '#ef4444';
      } else if (type === 'priorite') {
        return value === Priorite.URGENTE ? '#ef4444' : 
               value === Priorite.HAUTE ? '#f59e0b' : 
               value === Priorite.NORMALE ? '#3b82f6' : '#6b7280';
      } else if (type === 'type') {
        return value === TypeCourrier.EXTERNE ? '#06b6d4' : '#10b981';
      }
      return '#6b7280';
    };

    // Fonction pour formater une valeur
    const formatValue = (value: any, fieldType?: string): string => {
      if (value === null || value === undefined || value === '') return '—';
      if (fieldType === 'date') {
        return new Date(value).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      return String(value);
    };

    // Fonction pour ajouter une ligne de tableau
    const addTableRow = (label: string, value: string, badgeColor?: string) => {
      const labelWidth = contentWidth * 0.3;
      const valueWidth = contentWidth * 0.7;
      const rowHeight = lineHeight + cellPadding * 2;
      
      // Vérifier si on a besoin d'une nouvelle page
      checkNewPage(rowHeight);
      
      // Fond gris pour la colonne label
      pdf.setFillColor(249, 250, 251);
      pdf.rect(marginLeft, currentY, labelWidth, rowHeight, 'F');
      
      // Bordure
      pdf.setDrawColor(229, 231, 235);
      pdf.rect(marginLeft, currentY, contentWidth, rowHeight);
      pdf.setDrawColor(209, 213, 219);
      pdf.line(marginLeft + labelWidth, currentY, marginLeft + labelWidth, currentY + rowHeight);
      
      // Texte label
      pdf.setFontSize(11);
      pdf.setTextColor(55, 65, 81);
      pdf.setFont('helvetica', 'bold');
      pdf.text(label, marginLeft + cellPadding, currentY + cellPadding + 4, {
        maxWidth: labelWidth - cellPadding * 2,
        align: 'left'
      });
      
      // Texte valeur ou badge
      if (badgeColor) {
        // Dessiner le badge
        const badgeWidth = 25;
        const badgeHeight = 6;
        const badgeX = marginLeft + labelWidth + cellPadding;
        const badgeY = currentY + cellPadding;
        
        const color = badgeColor.startsWith('#') ? badgeColor : `#${badgeColor}`;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        
        pdf.setFillColor(r, g, b);
        pdf.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 1, 1, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.text(value.toUpperCase(), badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 1.5, { align: 'center' });
        pdf.setTextColor(17, 24, 39);
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(17, 24, 39);
        pdf.text(value, marginLeft + labelWidth + cellPadding, currentY + cellPadding + 4, {
          maxWidth: valueWidth - cellPadding * 2,
          align: 'left'
        });
      }
      
      currentY += rowHeight;
    };

    // Utiliser les colonnes configurées ou les colonnes par défaut
    let columns = (params.columns || []).filter(col => col.enabled);
    
    // Si aucune colonne n'est configurée, utiliser les colonnes par défaut
    if (columns.length === 0) {
      columns = [
        { key: 'numero', label: 'Numéro', enabled: true, width: 0.12 },
        { key: 'statut', label: 'Statut', enabled: true, width: 0.12 },
        { key: 'priorite', label: 'Priorité', enabled: true, width: 0.12 },
        { key: 'type', label: 'Type', enabled: true, width: 0.12 },
        { key: 'objet', label: 'Objet', enabled: true, width: 0.20 },
        { key: 'expediteur', label: 'Expéditeur', enabled: true, width: 0.15 },
        { key: 'destinataire', label: 'Destinataire', enabled: true, width: 0.15 },
        { key: 'dateEnregistrement', label: 'Date', enabled: true, width: 0.12 }
      ];
    }
    
    // Ajouter les colonnes dynamiques qui ne sont pas déjà dans la liste
    const allDynamicFields = filteredCourriers.flatMap(courrier => {
      return dynamicFields.filter(field => {
        const isAvailable = field.availableIn?.has(getAvailabilityKey(resolveCourrierSens(courrier), courrier.type)) ?? false;
        const value = isAvailable ? courrier.extraFields?.[field.name] : undefined;
        return isAvailable && value !== undefined && value !== null && value !== '';
      });
    });
    
    const uniqueDynamicFields = Array.from(new Map(allDynamicFields.map(f => [f.name, f])).values());
    uniqueDynamicFields.forEach(field => {
      const colKey = `extra_${field.name}`;
      if (!columns.find(col => col.key === colKey)) {
        columns.push({ key: colKey, label: field.label || field.name, enabled: true, width: 0.15 });
      }
    });
    
    // Ajuster les largeurs pour qu'elles totalisent 1.0
    const totalWidth = columns.reduce((sum, col) => sum + (col.width || 0.1), 0);
    if (totalWidth > 0) {
      columns.forEach(col => col.width = (col.width || 0.1) / totalWidth);
    }
    
    const headerTitle = applyTitleCase((params.headerTitle || '').trim() || 'Fiche d’enregistrement', params.headerTitleCase);
    const headerSubtitle = (params.headerSubtitle || '').trim();
    const headerLogo = params.headerLogoUrl;

    const rowHeight = lineHeight + cellPadding * 2;
    
    // Vérifier si on a besoin d'une nouvelle page pour le titre
    checkNewPage(headerHeight + rowHeight * (filteredCourriers.length + 1));

    // Bloc en-tête (logo + titres)
    if (headerLogo) {
      try {
        const props = pdf.getImageProperties(headerLogo);
        const ratio = props.width && props.height ? props.width / props.height : 1;
        const maxW = params.headerLogoWidthMm || 24;
        const maxH = (params.headerLogoWidthMm || 24) * 1.5;
        let w = maxW;
        let h = w / (ratio || 1);
        if (h > maxH) {
          h = maxH;
          w = h * (ratio || 1);
        }
        const align = params.headerAlign || 'left';
        let logoX = marginLeft;
        if (align === 'center') {
          logoX = marginLeft + (contentWidth - w) / 2;
        } else if (align === 'right') {
          logoX = marginLeft + contentWidth - w;
        }
        pdf.addImage(headerLogo, props.fileType || 'PNG', logoX, currentY, w, h, undefined, 'FAST');
        currentY += h + 2;
      } catch {}
    }
    const align = params.headerAlign || 'left';
    const textAlign: any = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
    const textX = align === 'center' ? marginLeft + contentWidth / 2 : align === 'right' ? marginLeft + contentWidth : marginLeft;
    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(headerTitle, textX, currentY + 6, { align: textAlign });
    if (headerSubtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(75, 85, 99);
      pdf.text(headerSubtitle, textX, currentY + 12, { align: textAlign });
    }
    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Généré le ${new Date().toLocaleString('fr-FR')} • Total: ${filteredCourriers.length} courrier(s)`, textX, currentY + 18, { align: textAlign });
    currentY += headerHeight + 4;
    
    // On n'ajoute plus de titre supplémentaire pour éviter les doublons sous le logo
    
    // En-tête du tableau
    pdf.setFillColor(249, 250, 251);
    pdf.rect(marginLeft, currentY, contentWidth, rowHeight, 'F');
    pdf.setDrawColor(209, 213, 219);
    pdf.rect(marginLeft, currentY, contentWidth, rowHeight);
    
    let colX = marginLeft;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(55, 65, 81);
    
    columns.forEach((col, colIndex) => {
      const colWidth = contentWidth * (col.width ?? 0);
      if (colIndex > 0) {
        pdf.line(colX, currentY, colX, currentY + rowHeight);
      }
      pdf.text(col.label, colX + cellPadding, currentY + cellPadding + 4, {
        maxWidth: colWidth - cellPadding * 2,
        align: 'left'
      });
      colX += colWidth;
    });
    
    currentY += rowHeight;
    
    // Lignes de données
    filteredCourriers.forEach((courrier, index) => {
      checkNewPage(rowHeight);
      
      // Fond alterné pour les lignes
      if (index % 2 === 0) {
        pdf.setFillColor(255, 255, 255);
      } else {
        pdf.setFillColor(249, 250, 251);
      }
      pdf.rect(marginLeft, currentY, contentWidth, rowHeight, 'F');
      
      // Bordures
      pdf.setDrawColor(229, 231, 235);
      pdf.rect(marginLeft, currentY, contentWidth, rowHeight);
      
      colX = marginLeft;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(17, 24, 39);
      
      columns.forEach((col, colIndex) => {
        const colWidth = contentWidth * (col.width ?? 0);
        if (colIndex > 0) {
          pdf.line(colX, currentY, colX, currentY + rowHeight);
        }
        
        let cellValue = '';
        let badgeColor: string | undefined;
        
        if (col.key === 'numero') {
          cellValue = `#${courrier.numero}`;
          pdf.setFont('helvetica', 'bold');
        } else if (col.key === 'statut') {
          cellValue = courrier.statut;
          badgeColor = getBadgeColor('statut', courrier.statut);
        } else if (col.key === 'priorite') {
          cellValue = courrier.priorite;
          badgeColor = getBadgeColor('priorite', courrier.priorite);
        } else if (col.key === 'type') {
          cellValue = courrier.type;
          badgeColor = getBadgeColor('type', courrier.type);
        } else if (col.key === 'objet') {
          cellValue = formatValue((courrier.objet || '').replace(/<[^>]*>/g, ''));
        } else if (col.key === 'expediteur') {
          cellValue = formatValue(courrier.expediteur);
        } else if (col.key === 'destinataire') {
          cellValue = formatValue(courrier.destinataire);
        } else if (col.key === 'dateEnregistrement') {
          cellValue = courrier.dateEnregistrement ? formatValue(courrier.dateEnregistrement, 'date') : '—';
        } else if (col.key.startsWith('extra_')) {
          const fieldName = col.key.replace('extra_', '');
          const field = dynamicFields.find(f => f.name === fieldName);
          if (field) {
            const isAvailable = field.availableIn?.has(getAvailabilityKey(resolveCourrierSens(courrier), courrier.type)) ?? false;
            const value = isAvailable ? courrier.extraFields?.[fieldName] : undefined;
            if (isAvailable && value !== undefined && value !== null && value !== '') {
              const formattedValue = formatFieldValue(value, field.type);
              cellValue = formatValue(formattedValue, field.type);
            } else {
              cellValue = '—';
            }
          }
        }
        
        if (badgeColor) {
          // Dessiner le badge
          const badgeWidth = Math.min(20, colWidth - cellPadding * 2);
          const badgeHeight = 5;
          const badgeX = colX + cellPadding;
          const badgeY = currentY + cellPadding;
          
          const color = badgeColor.startsWith('#') ? badgeColor : `#${badgeColor}`;
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          
          pdf.setFillColor(r, g, b);
          pdf.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 1, 1, 'F');
          
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'bold');
          pdf.text(cellValue.toUpperCase(), badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 1.2, { align: 'center' });
          pdf.setTextColor(17, 24, 39);
        } else {
          pdf.text(cellValue, colX + cellPadding, currentY + cellPadding + 4, {
            maxWidth: colWidth - cellPadding * 2,
            align: 'left'
          });
        }
        
        pdf.setFont('helvetica', 'normal');
        colX += colWidth;
      });
      
      currentY += rowHeight;
    });

    return pdf;
  };

  // Prévisualisation PDF
  const previewPDF = async (settings?: ExportSettings) => {
    const params = settings || exportSettings;
    setGeneratingPreview(true);
    
    try {
      const pdf = generatePDFDirect(params);
      
      // Générer l'URL du PDF pour la prévisualisation
      const pdfBlob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      setPdfPreviewUrl(url);
      setShowPDFPreview(true);
    } catch (error) {
      console.error('Erreur prévisualisation PDF:', error);
      alert('Erreur lors de la prévisualisation PDF: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setGeneratingPreview(false);
    }
  };

  // Fonction pour générer le HTML de la vue d'impression personnalisée
  const renderPrintViewHTML = (settings?: ExportSettings): string => {
    const params = settings || exportSettings;
    const unifiedFields = getUnifiedTableFields();
    const CORE_FIELDS = ['type', 'expediteur', 'destinataire', 'objet'];
    const dynamicFields = unifiedFields.filter(field => field.name && !CORE_FIELDS.includes(field.name));

    const escapeHtml = (text: string): string => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };
    
    // Utiliser les colonnes configurées
    let columns = (params.columns || []).filter(col => col.enabled);
    
    // Si aucune colonne n'est configurée, utiliser les colonnes par défaut
    if (columns.length === 0) {
      columns = [
        { key: 'numero', label: 'Numéro', enabled: true, width: 0.12 },
        { key: 'statut', label: 'Statut', enabled: true, width: 0.12 },
        { key: 'priorite', label: 'Priorité', enabled: true, width: 0.12 },
        { key: 'type', label: 'Type', enabled: true, width: 0.12 },
        { key: 'objet', label: 'Objet', enabled: true, width: 0.20 },
        { key: 'expediteur', label: 'Expéditeur', enabled: true, width: 0.15 },
        { key: 'destinataire', label: 'Destinataire', enabled: true, width: 0.15 },
        { key: 'dateEnregistrement', label: 'Date', enabled: true, width: 0.12 }
      ];
    }
    
    // Ajouter les colonnes dynamiques
    const allDynamicFields = filteredCourriers.flatMap(courrier => {
      return dynamicFields.filter(field => {
        const isAvailable = field.availableIn?.has(getAvailabilityKey(resolveCourrierSens(courrier), courrier.type)) ?? false;
        const value = isAvailable ? courrier.extraFields?.[field.name] : undefined;
        return isAvailable && value !== undefined && value !== null && value !== '';
      });
    });
    
    const uniqueDynamicFields = Array.from(new Map(allDynamicFields.map(f => [f.name, f])).values());
    uniqueDynamicFields.forEach(field => {
      const colKey = `extra_${field.name}`;
      if (!columns.find(col => col.key === colKey)) {
        columns.push({ key: colKey, label: field.label || field.name, enabled: true, width: 0.15 });
      }
    });
    
    // Ajuster les largeurs
    const totalWidth = columns.reduce((sum, col) => sum + (col.width || 0.1), 0);
    if (totalWidth > 0) {
      columns.forEach(col => col.width = (col.width || 0.1) / totalWidth);
    }

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            padding: 5mm;
            background: white;
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            width: 100%;
            overflow-x: hidden;
          }
          .print-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 100%;
            max-width: 100%;
            height: 100%;
          }
          .header p {
            font-size: 12px;
            color: #6b7280;
            margin: 5px 0;
          }
          .courrier-card {
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px 14px;
            background: white;
            page-break-inside: avoid;
            margin-bottom: 12px;
          }
          .courrier-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e5e7eb;
          }
          .courrier-info {
            display: flex;
            align-items: start;
            gap: 12px;
            flex: 1;
          }
          .courrier-icon {
            width: 40px;
            height: 40px;
            background: #f3f4f6;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
=======
          .fiche-container {
            border: 2px solid #1f2937;
            border-radius: 4px;
            background: white;
            page-break-inside: avoid;
            margin-bottom: 10px;
            width: 100%;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            min-height: 0;
          }
          .fiche-title {
            background: #1f2937;
            color: white;
            padding: 12px 15px;
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin: 0;
            border-bottom: 2px solid #1f2937;
            width: 100%;
>>>>>>> 63f9a6d (feat: Amélioration des exports PDF/Excel/Image avec sélection de colonnes et nouveau design)
            flex-shrink: 0;
          }
          .fiche-content {
            padding: 15px;
            width: 100%;
            overflow: hidden;
            flex: 1;
            min-height: 0;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            table-layout: fixed;
            word-wrap: break-word;
            margin: 0;
          }
          .info-table thead {
            background: #1f2937;
          }
          .info-table thead th {
            padding: 10px 8px;
            border: 1px solid #374151;
            color: white;
            font-weight: bold;
            text-align: left;
            font-size: 11px;
          }
          .info-table tbody td {
            padding: 8px 10px;
            border: 1px solid #e5e7eb;
            vertical-align: top;
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
            line-height: 1.4;
            color: #111827;
            background: white;
          }
          .info-table tbody tr:nth-child(even) td {
            background: #f9fafb;
          }
          .badge-cell {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            color: white;
            margin-right: 6px;
            white-space: nowrap;
          }
          .courrier-title {
            font-size: 16px;
            font-weight: 600;
            color: #374151;
            margin: 0 0 10px 0;
          }
          .courrier-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            font-size: 12px;
          }
          .field-row {
            display: grid;
            grid-template-columns: minmax(110px, 160px) 1fr;
            gap: 8px 12px;
            align-items: start;
          }
          .field-label {
            font-weight: 600;
            color: #4b5563;
            min-width: 120px;
          }
          .field-value {
            color: #111827;
            overflow-wrap: anywhere;
=======
          @media print {
            body {
              padding: 0;
            }
            .fiche-container {
              page-break-inside: avoid;
            }
>>>>>>> 63f9a6d (feat: Amélioration des exports PDF/Excel/Image avec sélection de colonnes et nouveau design)
          }
        </style>
      </head>
      <body>
        <div class="header" style="
          display:flex;
          flex-direction:column;
          align-items:${(exportSettings.headerAlign === 'right' ? 'flex-end' : (exportSettings.headerAlign === 'center' ? 'center' : 'flex-start'))};
          gap:10px;
          margin-bottom:16px;
          padding-bottom:12px;
          border-bottom:1px solid #e5e7eb;
        ">
          ${ (exportSettings.headerLogoUrl || '').trim() ? `
            <img src="${exportSettings.headerLogoUrl}" style="
              width:auto;
              height:auto;
              max-width:${(exportSettings.headerLogoWidthMm || 24)}mm;
              max-height:${(exportSettings.headerLogoWidthMm || 24) * 1.5}mm;
              object-fit:contain;
              flex-shrink:0;
              display:block;
            " />
          ` : ``}
          <div style="flex:1; width:100%; text-align:${exportSettings.headerAlign === 'right' ? 'right' : (exportSettings.headerAlign === 'center' ? 'center' : 'left')};">
            <h1 style="text-align:${exportSettings.headerAlign === 'right' ? 'right' : (exportSettings.headerAlign === 'center' ? 'center' : 'left')};">${applyTitleCase((exportSettings.headerTitle || '').trim() || 'Fiche d’enregistrement', exportSettings.headerTitleCase)}</h1>
            ${(exportSettings.headerSubtitle || '').trim() ? `<p style="text-align:${exportSettings.headerAlign === 'right' ? 'right' : (exportSettings.headerAlign === 'center' ? 'center' : 'left')};">${applyTitleCase(exportSettings.headerSubtitle || '', exportSettings.headerTitleCase)}</p>` : ``}
            <p style="text-align:${exportSettings.headerAlign === 'right' ? 'right' : (exportSettings.headerAlign === 'center' ? 'center' : 'left')};">Généré le ${new Date().toLocaleDateString('fr-FR', { 
              day: '2-digit', 
              month: 'long', 
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })} • Total: ${filteredCourriers.length} courrier(s)</p>
          </div>
        </div>
        <div class="print-container">
    `;

    filteredCourriers.forEach((courrier) => {
      const statutColor = courrier.statut === StatutCourrier.TRAITE ? '#10b981' : 
                         courrier.statut === StatutCourrier.EN_TRAITEMENT ? '#3b82f6' : 
                         courrier.statut === StatutCourrier.ASSIGNE ? '#8b5cf6' :
                         courrier.statut === StatutCourrier.ORIENTE_DG ? '#f97316' :
                         courrier.statut === StatutCourrier.ORIENTE_DIRECTEUR ? '#ea580c' :
                         courrier.statut === StatutCourrier.EN_ATTENTE_DG ? '#f59e0b' : 
                         courrier.statut === StatutCourrier.ENREGISTRE ? '#6b7280' : '#ef4444';
      const prioriteColor = courrier.priorite === Priorite.URGENTE ? '#ef4444' : 
                           courrier.priorite === Priorite.HAUTE ? '#f59e0b' : 
                           courrier.priorite === Priorite.NORMALE ? '#3b82f6' : '#6b7280';
      const typeColor = courrier.type === TypeCourrier.EXTERNE ? '#06b6d4' : '#10b981';

      // Créer le tableau avec colonnes
      html += `
        <div class="fiche-container">
          <h1 class="fiche-title">Fiche d'enregistrement du courrier</h1>
          <div class="fiche-content">
            <table class="info-table">
              <thead>
                <tr>
                  ${columns.map(col => `<th style="width: ${(col.width || 0.1) * 100}%;">${escapeHtml(col.label)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                <tr>
                  ${columns.map(col => {
                    let cellContent = '';
                    let badgeColor: string | undefined;
                    
                    if (col.key === 'numero') {
                      cellContent = `<strong>#${escapeHtml(courrier.numero)}</strong>`;
                    } else if (col.key === 'statut') {
                      cellContent = escapeHtml(courrier.statut);
                      badgeColor = statutColor;
                    } else if (col.key === 'priorite') {
                      cellContent = escapeHtml(courrier.priorite);
                      badgeColor = prioriteColor;
                    } else if (col.key === 'type') {
                      cellContent = escapeHtml(courrier.type);
                      badgeColor = typeColor;
                    } else if (col.key === 'objet') {
                      cellContent = escapeHtml((courrier.objet || '').replace(/<[^>]*>/g, '') || '—');
                    } else if (col.key === 'expediteur') {
                      cellContent = escapeHtml(courrier.expediteur || '—');
                    } else if (col.key === 'destinataire') {
                      cellContent = escapeHtml(courrier.destinataire || '—');
                    } else if (col.key === 'dateEnregistrement') {
                      cellContent = courrier.dateEnregistrement ? new Date(courrier.dateEnregistrement).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '—';
                    } else if (col.key.startsWith('extra_')) {
                      const fieldName = col.key.replace('extra_', '');
                      const field = dynamicFields.find(f => f.name === fieldName);
                      if (field) {
                        const isAvailable = field.availableIn?.has(getAvailabilityKey(resolveCourrierSens(courrier), courrier.type)) ?? false;
                        const value = isAvailable ? courrier.extraFields?.[fieldName] : undefined;
                        if (isAvailable && value !== undefined && value !== null && value !== '') {
                          const formattedValue = formatFieldValue(value, field.type);
                          cellContent = escapeHtml(String(formattedValue));
                        } else {
                          cellContent = '—';
                        }
                      } else {
                        cellContent = '—';
                      }
                    }
                    
                    if (badgeColor) {
                      return `<td><span class="badge-cell" style="background: ${badgeColor};">${cellContent}</span></td>`;
                    }
                    return `<td>${cellContent}</td>`;
                  }).join('')}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </body>
      </html>
    `;

    return html;
  };

  const exportImage = async (settings?: typeof exportSettings) => {
    const params = settings || exportSettings;
    setExporting(true);
    
    try {
      // Créer un conteneur temporaire pour la vue d'impression
      const printContainer = document.createElement('div');
      const htmlContent = renderPrintViewHTML(params);
      
      // Créer un iframe pour rendre le HTML
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '794px'; // 210mm à 96dpi
      iframe.style.height = '1123px'; // 297mm à 96dpi
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';
      iframe.style.opacity = '0';
      iframe.style.zIndex = '-9999';
      
      document.body.appendChild(iframe);
      
      // Attendre que l'iframe soit chargé
      await new Promise<void>((resolve) => {
        iframe.onload = () => resolve();
        iframe.srcdoc = htmlContent;
      });
      
      // Attendre un peu pour que le contenu soit rendu
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const scaleMap = { low: 1, medium: 2, high: 3 };
      const scale = scaleMap[params.quality] || params.scale;
      
      // Capturer le contenu de l'iframe
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc || !iframeDoc.body) {
        throw new Error('Impossible d\'accéder au contenu de l\'iframe');
      }
      
      const canvas = await html2canvas(iframeDoc.body, {
        scale,
        backgroundColor: params.backgroundColor || '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: false,
        width: iframeDoc.body.scrollWidth,
        height: iframeDoc.body.scrollHeight
      });
      
      // Dessiner en-tête + filigrane sur le canvas
      const ctx = canvas.getContext('2d');
      const pxPerMm = 3.779528;
      if (ctx) {
        // En-tête
        const headerActive = params.headerEnabled || params.headerLogoUrl || params.headerTitle || params.headerSubtitle;
        if (headerActive) {
          const marginLeftPx = (exportSettings.margins.left || 20) * pxPerMm;
          const marginTopPx = (exportSettings.margins.top || 20) * pxPerMm;
          let x = marginLeftPx;
          const y = marginTopPx * 0.6;
          if (params.headerLogoUrl) {
            try {
              const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const im = new Image();
                im.crossOrigin = 'anonymous';
                im.onload = () => resolve(im);
                im.onerror = reject;
                im.src = params.headerLogoUrl!;
              });
              const logoW = (params.headerLogoWidthMm || 24) * pxPerMm;
              const logoH = logoW * (img.height / img.width);
              ctx.drawImage(img, x, y, logoW, logoH);
              x += logoW + 8;
            } catch {}
          }
          const title = params.headerTitle?.trim();
          const sub = params.headerSubtitle?.trim();
          if (title || sub) {
            ctx.save();
            ctx.fillStyle = '#111827';
            ctx.textBaseline = 'top';
            let textX = x;
            if (params.headerAlign === 'center') {
              ctx.textAlign = 'center';
              textX = canvas.width / 2;
            } else if (params.headerAlign === 'right') {
              ctx.textAlign = 'right';
              textX = canvas.width - (exportSettings.margins.right || 20) * pxPerMm;
            } else {
              ctx.textAlign = 'left';
            }
            if (title) {
              ctx.font = '700 16px Helvetica, Arial, sans-serif';
              ctx.fillText(title, textX, y + 2);
            }
            if (sub) {
              ctx.font = '400 13px Helvetica, Arial, sans-serif';
              ctx.fillStyle = '#374151';
              ctx.fillText(sub, textX, y + 20);
            }
            ctx.restore();
          }
        }
        // Filigrane
        if (params.watermarkEnabled && (params.watermarkText || params.watermarkImageUrl)) {
          ctx.save();
          const angle = (params.watermarkAngle ?? -30) * Math.PI / 180;
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate(angle);
          if (params.watermarkText) {
            const sizePx = Math.max(24, Math.floor((params.watermarkSize ?? 0.6) * canvas.width));
            ctx.font = `700 ${sizePx}px Helvetica, Arial, sans-serif`;
            ctx.fillStyle = `rgba(0,0,0,${params.watermarkOpacity ?? 0.08})`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(params.watermarkText, 0, 0);
          }
          if (params.watermarkImageUrl) {
            try {
              const wmImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                const im = new Image();
                im.crossOrigin = 'anonymous';
                im.onload = () => resolve(im);
                im.onerror = reject;
                im.src = params.watermarkImageUrl!;
              });
              const wmW = canvas.width * (params.watermarkSize ?? 0.6);
              const wmH = wmW * (wmImg.height / wmImg.width);
              ctx.globalAlpha = params.watermarkOpacity ?? 0.08;
              ctx.drawImage(wmImg, -wmW / 2, -wmH / 2, wmW, wmH);
            } catch {}
          }
          ctx.restore();
        }
      }
      
      let dataUrl = canvas.toDataURL('image/png', 1.0);
      
      if (params.colorMode === 'grayscale' || params.colorMode === 'blackwhite') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          for (let i = 0; i < data.length; i += 4) {
            const gray = params.colorMode === 'blackwhite' 
              ? (data[i] + data[i + 1] + data[i + 2]) / 3 > 128 ? 255 : 0
              : (data[i] + data[i + 1] + data[i + 2]) / 3;
            
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          }
          
          ctx.putImageData(imageData, 0, 0);
          dataUrl = canvas.toDataURL('image/png', 1.0);
        }
      }
      
      const link = document.createElement('a');
      link.download = `courriers_${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
      setShowExportSettings(false);
      
      // Nettoyer
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    } catch (error) {
      console.error('Erreur export image:', error);
      alert('Erreur lors de l\'export image: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setExporting(false);
    }
  };



  const exportExcel = async () => {
    setExporting(true);
    
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Courriers');
      
      // Utiliser les colonnes configurées
      let columns = (exportSettings.columns || []).filter(col => col.enabled);
      
      // Si aucune colonne n'est configurée, utiliser les colonnes par défaut
      if (columns.length === 0) {
        columns = [
          { key: 'numero', label: 'Numéro', enabled: true, width: 0.12 },
          { key: 'statut', label: 'Statut', enabled: true, width: 0.12 },
          { key: 'priorite', label: 'Priorité', enabled: true, width: 0.12 },
          { key: 'type', label: 'Type', enabled: true, width: 0.12 },
          { key: 'objet', label: 'Objet', enabled: true, width: 0.20 },
          { key: 'expediteur', label: 'Expéditeur', enabled: true, width: 0.15 },
          { key: 'destinataire', label: 'Destinataire', enabled: true, width: 0.15 },
          { key: 'dateEnregistrement', label: 'Date', enabled: true, width: 0.12 }
        ];
      }
      
      // Ajouter les colonnes dynamiques
      const allFields = new Set<string>();
      filteredCourriers.forEach(c => {
        const fields = getTableFields(resolveCourrierSens(c), c.type);
        fields.forEach(f => allFields.add(f.name));
      });
      
      allFields.forEach(fieldName => {
        const colKey = `extra_${fieldName}`;
        if (!columns.find(col => col.key === colKey)) {
          const field = getUnifiedTableFields().find(ff => ff.name === fieldName);
          columns.push({ key: colKey, label: field?.label || fieldName, enabled: true, width: 0.15 });
        }
      });
      
      // En-têtes
      const headers = columns.map(col => col.label);
      
      worksheet.columns = headers.map((h, i) => ({
        header: h,
        key: `col${i}`,
        width: 20
      }));

      // Logo Excel (conversion URL/dataURL en base64)
      const resolveLogoBase64 = async (): Promise<{ base64: string; ext: 'png' | 'jpeg' | 'gif' } | null> => {
        const logo = (exportSettings.headerLogoUrl || '').trim();
        if (!logo) return null;
        const fromDataUrl = (dataUrl: string) => {
          const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/i);
          if (!match) return null;
          const rawExt = match[1].toLowerCase();
          const ext = rawExt === 'jpg' ? 'jpeg' : rawExt === 'webp' ? 'png' : rawExt as 'png' | 'jpeg' | 'gif';
          return { ext, base64: match[2] };
        };
        if (logo.startsWith('data:image/')) {
          return fromDataUrl(logo);
        }
        try {
          const res = await fetch(logo, { mode: 'cors' });
          const blob = await res.blob();
          const reader = new FileReader();
          const dataUrl: string = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return fromDataUrl(dataUrl);
        } catch {
          return null;
        }
      };

      const addLogoIfPossible = async () => {
        const logoInfo = await resolveLogoBase64();
        if (!logoInfo) return;
        try {
          const logoImg = workbook.addImage({
            base64: logoInfo.base64,
            extension: logoInfo.ext
          });
          const pxPerMm = 3.78;
          const widthMm = exportSettings.headerLogoWidthMm || 32;
          const maxW = widthMm * pxPerMm;
          const maxH = maxW * 1.2;
          const centerCol = Math.max(0, (colCount / 2) - 1);
          worksheet.addImage(logoImg, {
            tl: { col: centerCol, row: 0 },
            ext: { width: maxW, height: maxH }
          });
        } catch {}
      };

      const colCount = headers.length;
      const titleText = applyTitleCase((exportSettings.headerTitle || '').trim() || 'Fiche d’enregistrement', exportSettings.headerTitleCase);
      const subtitleText = applyTitleCase((exportSettings.headerSubtitle || '').trim(), exportSettings.headerTitleCase);
      const infoText = applyTitleCase(`Généré le ${new Date().toLocaleString('fr-FR')} • Total: ${filteredCourriers.length} courrier(s)`, exportSettings.headerTitleCase);
      const titleRows: any[][] = [[titleText]];
      if (subtitleText) titleRows.push([subtitleText]);
      titleRows.push([infoText]);
      const topBlankRows = 1;
      const spacerAfterHeader = 3; // plus d'espace avant le tableau
      const blanksBefore = Array.from({ length: topBlankRows }, () => ['']);
      const blanksAfter = Array.from({ length: spacerAfterHeader }, () => ['']);
      worksheet.spliceRows(1, 0, ...blanksBefore, ...titleRows, ...blanksAfter);
      await addLogoIfPossible();
      const titleStartRow = topBlankRows + 1; // après les lignes vides initiales
      titleRows.forEach((_, idx) => {
        const r = titleStartRow + idx;
        worksheet.mergeCells(r, 1, r, colCount);
        const row = worksheet.getRow(r);
        row.alignment = { vertical: 'middle', horizontal: (exportSettings.headerAlign === 'right' ? 'right' : (exportSettings.headerAlign === 'center' ? 'center' : 'left')) };
        row.font = {
          bold: idx === 0,
          size: idx === 0 ? 14 : 11,
          color: { argb: idx === 0 ? 'FF111827' : 'FF374151' }
        };
      });
      const headerRowIndex = titleStartRow + titleRows.length + spacerAfterHeader; // première ligne d'en-tête du tableau
      
      // Données
      filteredCourriers.forEach((courrier, index) => {
        const row: any = {};
        
        columns.forEach((col, colIndex) => {
          let cellValue: any = '';
          
          if (col.key === 'numero') {
            cellValue = `#${courrier.numero}`;
          } else if (col.key === 'statut') {
            cellValue = courrier.statut;
          } else if (col.key === 'priorite') {
            cellValue = courrier.priorite;
          } else if (col.key === 'type') {
            cellValue = courrier.type;
          } else if (col.key === 'objet') {
            cellValue = (courrier.objet || '').replace(/<[^>]*>/g, '');
          } else if (col.key === 'expediteur') {
            cellValue = courrier.expediteur || '';
          } else if (col.key === 'destinataire') {
            cellValue = courrier.destinataire || '';
          } else if (col.key === 'dateEnregistrement') {
            cellValue = courrier.dateEnregistrement ? new Date(courrier.dateEnregistrement).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : '';
          } else if (col.key.startsWith('extra_')) {
            const fieldName = col.key.replace('extra_', '');
            const field = getTableFields(resolveCourrierSens(courrier), courrier.type).find(f => f.name === fieldName);
            if (field) {
              const efAny: any = (courrier as any).extraFields;
              if (efAny) {
                if (Array.isArray(efAny)) {
                  cellValue = efAny.find((ef: any) => ef?.name === fieldName)?.value ?? '';
                } else if (typeof efAny === 'object') {
                  cellValue = efAny[fieldName];
                }
              }
              if (cellValue !== undefined && cellValue !== null) {
                cellValue = typeof cellValue === 'object' ? JSON.stringify(cellValue) : String(cellValue);
              } else {
                cellValue = '';
              }
            }
          }
          
          row[`col${colIndex}`] = cellValue;
        });
        
        worksheet.addRow(row);
      });
      
      // Style de l'en-tête (même design que PDF)
      const headerRow = worksheet.getRow(titleRows.length + 1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F2937' } // Même couleur que le titre PDF
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 20;
      
      // Style des lignes de données (fond alterné comme PDF)
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > titleRows.length + 1) {
          // Fond alterné
          if (rowNumber % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFFFF' } // Blanc
            };
          } else {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF9FAFB' } // Gris clair
            };
          }
          
          // Bordures
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
              left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
              bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
              right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
            cell.font = { size: 10 };
            cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
          });
        }
      });
      
      // Ajuster la largeur des colonnes
      columns.forEach((col, index) => {
        const column = worksheet.getColumn(index + 1);
        const baseWidth = 15;
        column.width = baseWidth * (col.width || 0.1) * 10;
      });
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const link = document.createElement('a');
      link.download = `courriers_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      
      setShowExportSettings(false);
    } catch (error) {
      console.error('Erreur export Excel:', error);
      alert('Erreur lors de l\'export Excel');
    } finally {
      setExporting(false);
    }
  };

  const getAvailabilityKey = (sens: SensCourrier, type: TypeCourrier) => `${sens}:${type}`;

  const resolveCourrierSens = (courrier: Courrier): SensCourrier =>
    courrier.sens || getCourrierSens(courrier) || SensCourrier.ENTRANT;

  // Fonction pour obtenir les champs dynamiques pertinents pour le tableau
  const getTableFields = (
    sens: SensCourrier,
    type: TypeCourrier
  ): Array<{ id: string; name: string; label: string; type?: string; icon?: string; order?: number }> => {
    // Vérifier que formConfig est initialisé
    if (!formConfig) {
      return [];
    }
    
    try {
    const config = formConfig?.[sens]?.[type] || [];
    const tableFields: Array<{ id: string; name: string; label: string; type?: string; icon?: string; order?: number }> = [];
      
      // Champs de base à exclure (déjà affichés dans les colonnes principales)
      const CORE_FIELDS = ['type', 'expediteur', 'destinataire', 'objet'];
    
    // Types de champs à exclure par défaut du tableau
    const excludedTypes = ['textarea', 'file'];
    
    // Parcourir les sections et colonnes dans l'ordre pour préserver l'ordre du formulaire
      if (Array.isArray(config)) {
    config.forEach((section, sectionIndex) => {
          if (section && section.columns && Array.isArray(section.columns)) {
      section.columns.forEach((column, columnIndex) => {
              if (column && column.fields && Array.isArray(column.fields)) {
        column.fields.forEach((field, fieldIndex) => {
          // Vérifier si le champ doit être affiché dans le tableau
          const shouldShowInTable = field.showInTable !== false; // Par défaut true sauf si explicitement false
          const isExcludedType = field.type && excludedTypes.includes(field.type);
                  const isCoreField = field.name && CORE_FIELDS.includes(field.name);
          
          // Inclure le champ si :
          // 1. showInTable n'est pas false ET
          // 2. Le type n'est pas dans la liste des types exclus
                  // 3. Le champ a un nom et un id valides
                  // 4. Le champ n'est pas un champ de base (pour éviter les doublons)
                  if (shouldShowInTable && !isExcludedType && !isCoreField && field.type && field.name && field.id) {
            // Calculer un ordre basé sur la position dans le formulaire
            const order = (sectionIndex * 1000) + (columnIndex * 100) + fieldIndex;
            tableFields.push({
              id: field.id,
              name: field.name,
                      label: field.label || field.name,
              type: field.type,
              icon: field.icon,
              order: order
            });
          }
        });
              }
      });
          }
    });
      }
    
    // Trier par ordre pour respecter l'ordre du formulaire
    return tableFields.sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (error) {
      console.error('Erreur lors de la récupération des champs du tableau:', error);
      return [];
    }
  };

  // Fonction pour obtenir les champs unifiés (sans doublons) pour tous les types et sens
  // Si un champ existe dans les deux types avec le même nom, une seule colonne est créée
  const getUnifiedTableFields = (): Array<{ 
    id: string; 
    name: string; 
    label: string; 
    type?: string; 
    icon?: string; 
    order?: number;
    availableIn: Set<string>; // Sens+type pour lesquels ce champ est disponible
  }> => {
    // Vérifier que formConfig est initialisé
    if (!formConfig) {
      return [];
    }
    
    try {
      const sensList = filters.sens
        ? [filters.sens as SensCourrier]
        : [SensCourrier.ENTRANT, SensCourrier.SORTANT];
      const typeList = filters.type
        ? [filters.type as TypeCourrier]
        : [TypeCourrier.EXTERNE, TypeCourrier.INTERNE];
      
      // Map pour éviter les doublons basés sur le nom du champ
      // Si un champ existe dans les deux types avec le même nom, on crée une seule entrée
      const fieldMap = new Map<string, { 
        id: string; 
        name: string; 
        label: string; 
        type?: string; 
        icon?: string; 
        order?: number;
        availableIn: Set<string>;
      }>();
      
      sensList.forEach(sens => {
        typeList.forEach(type => {
          const availabilityKey = getAvailabilityKey(sens, type);
          const fields = getTableFields(sens, type);
          fields.forEach(field => {
            if (!field.name) return;
            if (!fieldMap.has(field.name)) {
              fieldMap.set(field.name, {
                ...field,
                availableIn: new Set([availabilityKey])
              });
              return;
            }
            const existing = fieldMap.get(field.name)!;
            existing.availableIn.add(availabilityKey);
            // Prendre l'ordre le plus petit pour les champs communs
            if ((field.order || 0) < (existing.order || 0)) {
              fieldMap.set(field.name, {
                ...field,
                availableIn: existing.availableIn
              });
            }
          });
        });
      });
      
      // Convertir en tableau et trier par ordre (le filtrage des champs de base se fera à l'affichage)
      return Array.from(fieldMap.values())
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (error) {
      console.error('Erreur lors de la récupération des champs unifiés:', error);
      return [];
    }
  };

  // Helper pour obtenir l'icône à partir du nom (simplifié pour ListeCourriers)
  const getIconByName = (iconName?: string) => {
    if (!iconName) return null;
    const iconMap: Record<string, any> = {
      'user': faUser,
      'building': faBuilding,
      'file': faFile,
      'fileAlt': faFileAlt,
      'folder': faFolder,
      'folderOpen': faFolderOpen,
      'infoCircle': faInfoCircle,
      'checkCircle': faCheckCircle,
      'envelope': faEnvelope,
      'envelopeOpen': faEnvelopeOpen,
      'calendar': faCalendar,
      'clock': faClock,
      'phone': faPhone,
      'at': faAt,
      'link': faLink,
      'tag': faTag,
      'mapMarkerAlt': faMapMarkerAlt,
      'globe': faGlobe,
    };
    return iconMap[iconName] || null;
  };

  // Fonction pour formater la valeur d'un champ dynamique
  const formatFieldValue = (value: any, fieldType?: string): string => {
    if (value === null || value === undefined || value === '') return '-';
    
    if (fieldType === 'datetime') {
      try {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return '-';
      }
    }
    
    if (fieldType === 'checkbox') {
      if (Array.isArray(value)) {
        return value.filter(Boolean).join(', ') || '-';
      }
      return value ? 'Oui' : 'Non';
    }
    
    if (fieldType === 'select' || fieldType === 'radio') {
      return String(value);
    }
    
    return String(value);
  };

  // Fonction pour calculer le délai restant avant l'échéance
  const getDelaiRestant = (dateEcheance?: Date | string): { jours: number; estDepasse: boolean; estUrgent: boolean } => {
    if (!dateEcheance) {
      return { jours: Infinity, estDepasse: false, estUrgent: false };
    }
    try {
      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);
      const echeance = dateEcheance instanceof Date 
        ? dateEcheance 
        : new Date(dateEcheance);
      
      // Vérifier si la date est valide
      if (isNaN(echeance.getTime())) {
        return { jours: Infinity, estDepasse: false, estUrgent: false };
      }
      
      echeance.setHours(0, 0, 0, 0);
      const diffTime = echeance.getTime() - aujourdhui.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        jours: diffDays,
        estDepasse: diffDays < 0,
        estUrgent: diffDays >= 0 && diffDays <= 3
      };
    } catch (error) {
      console.error('Erreur lors du calcul du délai:', error);
      return { jours: Infinity, estDepasse: false, estUrgent: false };
    }
  };

  function applyFilters(): Courrier[] {
    // Utiliser allCourriers pour le filtrage (tous les courriers accessibles)
    // Si allCourriers est vide, utiliser courriers comme fallback
    const sourceCourriers = allCourriers.length > 0 ? allCourriers : courriers;
    let filtered = [...sourceCourriers];

    // Filtrage simple par statut, type, etc.
    if (filters.statut) {
      filtered = filtered.filter(c => c.statut === filters.statut);
    }
    if (filters.sens) {
      filtered = filtered.filter(c => getCourrierSens(c) === filters.sens);
    }
    if (filters.type) {
      filtered = filtered.filter(c => c.type === filters.type);
    }
    if (filters.priorite) {
      filtered = filtered.filter(c => c.priorite === filters.priorite);
    }
    if (filters.direction) {
      filtered = filtered.filter(c => c.direction === filters.direction);
    }
    if (filters.service) {
      filtered = filtered.filter(c => c.service === filters.service);
    }
    if (filters.sousService) {
      filtered = filtered.filter(c => (c.extraFields as Record<string, string>)?.['sousService'] === filters.sousService);
    }
    if (filters.dateDebut) {
      const dateDebut = new Date(filters.dateDebut);
      dateDebut.setHours(0, 0, 0, 0);
      filtered = filtered.filter(c => {
        const dateReception = c.dateReception instanceof Date 
          ? c.dateReception 
          : new Date(c.dateReception);
        dateReception.setHours(0, 0, 0, 0);
        return dateReception >= dateDebut;
      });
    }
    if (filters.dateFin) {
      const dateFin = new Date(filters.dateFin);
      dateFin.setHours(23, 59, 59, 999);
      filtered = filtered.filter(c => {
        const dateReception = c.dateReception instanceof Date 
          ? c.dateReception 
          : new Date(c.dateReception);
        dateReception.setHours(0, 0, 0, 0);
        return dateReception <= dateFin;
      });
    }
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(c =>
        (c.numero || '').toLowerCase().includes(searchLower) ||
        (c.objet || '').toLowerCase().includes(searchLower) ||
        (c.expediteur || '').toLowerCase().includes(searchLower) ||
        (c.destinataire || '').toLowerCase().includes(searchLower) ||
        (c.direction || '').toLowerCase().includes(searchLower) ||
        (c.service || '').toLowerCase().includes(searchLower)
      );
    }
    if (filters.categorie) {
      filtered = filtered.filter(c => {
        const key = c.id != null ? String(c.id) : '';
        const fid = courrierFolderMap[key];
        if (fid == null || fid === '') return false;
        const fidStr = String(fid);
        return validFolderIds.has(fidStr) && fidStr === filters.categorie;
      });
    }
    if (filters.nonClassifies) {
      filtered = filtered.filter(c => {
        const key = c.id != null ? String(c.id) : '';
        const fid = courrierFolderMap[key];
        if (fid == null || fid === '') return true;
        const fidStr = String(fid);
        return !validFolderIds.has(fidStr);
      });
    }
    if (filters.mesAssignations) {
      filtered = filtered.filter(c => mesAssignations.has(c.id));
    }

    // Trier selon le critère sélectionné
    filtered.sort((a, b) => {
      let comparison = 0;
      
      try {
        switch (sortBy) {
          case 'dateEnregistrement': {
            // Gérer les dates qui peuvent être des strings ou des objets Date
            const dateA = a.dateEnregistrement instanceof Date 
              ? a.dateEnregistrement 
              : (a.dateEnregistrement ? new Date(a.dateEnregistrement) : new Date(0));
            const dateB = b.dateEnregistrement instanceof Date 
              ? b.dateEnregistrement 
              : (b.dateEnregistrement ? new Date(b.dateEnregistrement) : new Date(0));
            
            // Vérifier si les dates sont valides
            const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
            const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
            comparison = timeA - timeB;
            break;
          }
          case 'dateReception': {
            // Gérer les dates qui peuvent être des strings ou des objets Date
            const dateA = a.dateReception instanceof Date 
              ? a.dateReception 
              : (a.dateReception ? new Date(a.dateReception) : new Date(0));
            const dateB = b.dateReception instanceof Date 
              ? b.dateReception 
              : (b.dateReception ? new Date(b.dateReception) : new Date(0));
            
            // Vérifier si les dates sont valides
            const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
            const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
            comparison = timeA - timeB;
            break;
          }
          case 'numero':
            comparison = (a.numero || '').localeCompare(b.numero || '', 'fr', { numeric: true });
            break;
          case 'objet':
            comparison = (a.objet || '').localeCompare(b.objet || '', 'fr');
            break;
          case 'expediteur':
            comparison = (a.expediteur || '').localeCompare(b.expediteur || '', 'fr');
            break;
          default: {
            // Gérer les champs dynamiques (extraFields)
            if (sortBy.startsWith('extraFields.')) {
              const fieldName = sortBy.replace('extraFields.', '');
              const valueA = a.extraFields?.[fieldName];
              const valueB = b.extraFields?.[fieldName];
              
              // Trier selon le type de valeur
              if (valueA === null || valueA === undefined) {
                comparison = valueB === null || valueB === undefined ? 0 : 1;
              } else if (valueB === null || valueB === undefined) {
                comparison = -1;
              } else if (typeof valueA === 'number' && typeof valueB === 'number') {
                comparison = valueA - valueB;
              } else if (valueA instanceof Date || (typeof valueA === 'string' && !isNaN(Date.parse(valueA)))) {
                const dateA = valueA instanceof Date ? valueA : new Date(valueA);
                const dateB = valueB instanceof Date ? valueB : new Date(valueB);
                const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
                const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
                comparison = timeA - timeB;
              } else {
                comparison = String(valueA).localeCompare(String(valueB), 'fr');
              }
              break;
            }
            // Par défaut, trier par date d'enregistrement
            const dateA = a.dateEnregistrement instanceof Date 
              ? a.dateEnregistrement 
              : (a.dateEnregistrement ? new Date(a.dateEnregistrement) : new Date(0));
            const dateB = b.dateEnregistrement instanceof Date 
              ? b.dateEnregistrement 
              : (b.dateEnregistrement ? new Date(b.dateEnregistrement) : new Date(0));
            
            const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
            const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
            comparison = timeA - timeB;
          }
        }
      } catch (error) {
        console.error('Erreur lors du tri:', error, { 
          a: { id: a.id, numero: a.numero, dateEnregistrement: a.dateEnregistrement },
          b: { id: b.id, numero: b.numero, dateEnregistrement: b.dateEnregistrement },
          sortBy 
        });
        // En cas d'erreur, utiliser l'ID comme critère de tri pour maintenir un ordre stable
        try {
          comparison = (a.id || '').localeCompare(b.id || '');
        } catch {
          comparison = 0;
        }
      }
      
      // Appliquer l'ordre (ascendant ou descendant)
      // Si comparison est 0 (égalité), utiliser l'ID pour un tri stable
      if (comparison === 0) {
        comparison = a.id.localeCompare(b.id);
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      // Si on clique sur le même champ, inverser l'ordre
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sinon, définir le nouveau champ et mettre en décroissant par défaut
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getStatutColor = (statut: StatutCourrier) => {
    switch (statut) {
      case StatutCourrier.TRAITE:
        return 'bg-green-100 text-green-800';
      case StatutCourrier.ASSIGNE:
        return 'bg-purple-100 text-purple-800';
      case StatutCourrier.EN_TRAITEMENT:
        return 'bg-blue-100 text-blue-800';
      case StatutCourrier.ORIENTE_DG:
        return 'bg-orange-100 text-orange-800';
      case StatutCourrier.ORIENTE_DIRECTEUR:
        return 'bg-orange-100 text-orange-700';
      case StatutCourrier.EN_ATTENTE_DG:
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatutLabel = (statut: string): string => {
    switch (statut) {
      case 'ENREGISTRE': return 'Enregistré';
      case 'EN_ATTENTE_DG': return 'En attente DG';
      case 'ORIENTE_DG': return 'Orienté DG';
      case 'ORIENTE_DIRECTEUR': return 'Orienté Directeur';
      case 'EN_TRAITEMENT': return 'En traitement';
      case 'ASSIGNE': return 'Assigné';
      case 'TRAITE': return 'Traité';
      case 'ARCHIVE': return 'Archivé';
      default: return statut;
    }
  };

  const getPrioriteColor = (priorite: Priorite) => {
    switch (priorite) {
      case Priorite.URGENTE:
        return 'bg-red-100 text-red-800';
      case Priorite.HAUTE:
        return 'bg-orange-100 text-orange-800';
      case Priorite.NORMALE:
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Fonction pour déterminer l'icône selon l'extension
  const getFileIcon = (extension?: string, fichier?: string) => {
    if (!extension && fichier) {
      extension = fichier.split('.').pop()?.toLowerCase();
    }
    
    if (!extension) return faFileAlt;
    
    switch (extension.toLowerCase()) {
      case 'pdf':
        return faFilePdf;
      case 'doc':
      case 'docx':
        return faFileWord;
      case 'xls':
      case 'xlsx':
        return faFileExcel;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'svg':
        return faFileImage;
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return faFileArchive;
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
      case 'html':
      case 'css':
      case 'json':
      case 'xml':
        return faFileCode;
      default:
        return faFileAlt;
    }
  };

  // Fonction pour obtenir la couleur de l'icône selon l'extension
  const getFileIconColor = (extension?: string, fichier?: string) => {
    if (!extension && fichier) {
      extension = fichier.split('.').pop()?.toLowerCase();
    }
    
    if (!extension) return 'text-blue-600';
    
    switch (extension.toLowerCase()) {
      case 'pdf':
        return 'text-red-600';
      case 'doc':
      case 'docx':
        return 'text-blue-700';
      case 'xls':
      case 'xlsx':
        return 'text-green-600';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'svg':
        return 'text-purple-600';
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return 'text-yellow-600';
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
      case 'html':
      case 'css':
      case 'json':
      case 'xml':
        return 'text-orange-600';
      default:
        return 'text-blue-600';
    }
  };

  // Charger les dossiers/fichiers pour un courrier (depuis l'API Laravel)
  const loadDossiersFichiers = async (courrierId: string) => {
    setLoadingFichiersCourrierId(courrierId);
    try {
      // Si l'API Laravel est configurée, synchroniser le courrier d'abord pour qu'il existe côté serveur (sinon GET /fichiers renvoie une liste vide)
      if (laravelApiService.isConfigured()) {
        const courrier = courriers.find((c) => c.id === courrierId) ?? courrierService.getCourrierById(courrierId);
        if (courrier) {
          try {
            await laravelApiService.updateCourrier(courrier.id, courrier);
          } catch (syncErr) {
            const syncMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
            // Avertir si la sync échoue (ex. migrations non exécutées) pour expliquer une liste vide
            if (/migrate|base de données|500/i.test(syncMsg)) {
              showAlert(
                `Le courrier n'a pas été synchronisé avec le serveur : ${syncMsg}. Exécutez "php artisan migrate" dans laravel-api si besoin, puis réessayez.`,
                'warning',
                'Synchronisation'
              );
            }
            // Continuer quand même le chargement des fichiers (liste peut être vide)
          }
        }
      }
      const df = await categorieFichierService.getCategoriesFichiersByCourrier(courrierId);
      setDossiersFichiers(prev => {
        const newMap = new Map(prev);
        // Toujours mettre à jour avec les données fraîches de l'API
        // pour garantir que le nombre affiché est correct
        newMap.set(courrierId, df);
        return newMap;
      });
    } catch (e) {
      console.warn('loadDossiersFichiers échoué:', e);
      const msg = e instanceof Error ? e.message : String(e);
      showAlert(
        `Impossible de charger les fichiers externes : ${msg}. Vérifiez que l'API Laravel est démarrée, que vous êtes connecté et que le courrier existe côté serveur.`,
        'error',
        'Chargement des fichiers'
      );
      // Ne pas écraser la liste en cas d'erreur pour ne pas faire disparaître les fichiers déjà affichés
    } finally {
      setLoadingFichiersCourrierId(prev => (prev === courrierId ? null : prev));
    }
  };

  // Toggle l'expansion de l'arborescence
  const toggleExpand = (courrierId: string) => {
    setExpandedCourriers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(courrierId)) {
        newSet.delete(courrierId);
      } else {
        newSet.add(courrierId);
        // Toujours recharger les données à l'ouverture pour avoir les dernières données
        // Utiliser le ref pour avoir la valeur à jour
        const hasData = dossiersFichiersRef.current.has(courrierId);
        const existingData = dossiersFichiersRef.current.get(courrierId);
        // Recharger si pas de données ou si c'est un tableau vide
        if (!hasData || !existingData || existingData.length === 0) {
          loadDossiersFichiers(courrierId);
        } else {
          // Recharger en arrière-plan pour mettre à jour sans bloquer l'UI
          loadDossiersFichiers(courrierId);
        }
      }
      return newSet;
    });
  };

  // Ouvrir le modal de création de dossier
  const openDossierModal = (courrierId: string, parentId?: string, parentName?: string) => {
    setDossierModalData({ courrierId, parentId, parentName });
    setNewDossierName('');
    setShowDossierModal(true);
  };

  // Fermer le modal
  const closeDossierModal = () => {
    setShowDossierModal(false);
    setDossierModalData(null);
    setNewDossierName('');
  };

  // Créer un dossier
  const handleCreateDossier = async () => {
    if (!dossierModalData || !newDossierName.trim()) return;

    try {
      setLoadingOperations(prev => ({ ...prev, insert: true }));
      console.log('Création d\'un nouveau dossier:', {
        courrierId: dossierModalData.courrierId,
        nom: newDossierName.trim(),
        parentId: dossierModalData.parentId,
        userId: user?.id
      });
      
      const createdDossier = await categorieFichierService.createCategorie(
        dossierModalData.courrierId,
        newDossierName.trim(),
        dossierModalData.parentId,
        user?.id
      );

      console.log('Dossier créé avec succès:', createdDossier.id);

      // Recharger les dossiers/fichiers
      await loadDossiersFichiers(dossierModalData.courrierId);
      closeDossierModal();
      showAlert('Dossier créé avec succès', 'success');
      setLoadingOperations(prev => ({ ...prev, insert: false }));
    } catch (error: any) {
      console.error('ERREUR lors de la création du dossier:', {
        error,
        errorCode: error?.code,
        errorMessage: error?.message,
        errorName: error?.name
      });
      setLoadingOperations(prev => ({ ...prev, insert: false }));
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      showAlert(`Erreur lors de la création du dossier: ${errorMessage}`, 'error', 'Erreur');
    }
  };

  // Gérer le drop de fichiers (ouvre le modal ; gère fichiers externes : Explorer, bureau)
  const handleFileDrop = async (e: React.DragEvent, courrierId: string, dossierId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverDossier(null);
    setDraggedOverCourrier(null);
    let files = getFilesFromDataTransfer(e.dataTransfer);
    if (files.length === 0 && e.dataTransfer.files?.length) files = Array.from(e.dataTransfer.files);
    if (files.length === 0 && e.dataTransfer.items) {
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
    setAddFileModalData({ courrierId, dossierId });
    setSelectedFiles(files);
    setShowAddFileModal(true);
  };

  // Gérer le drag over
  const handleDragOver = (e: React.DragEvent, dossierId?: string, courrierId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) e.dataTransfer.dropEffect = 'copy';
    if (dossierId) {
      setDraggedOverDossier(dossierId);
    }
    if (courrierId) {
      setDraggedOverCourrier(courrierId);
    }
  };

  // Gérer le drag leave
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverDossier(null);
    setDraggedOverCourrier(null);
  };

  // Ouvrir le modal d'ajout de fichiers et charger les limites d'import
  const openAddFileModal = (courrierId: string, dossierId?: string) => {
    setAddFileModalData({ courrierId, dossierId });
    setSelectedFiles([]);
    setUploadProgress(null);
    setShowAddFileModal(true);
    if (laravelApiService.isConfigured()) {
      laravelApiService.getImportFichiersLimits().then(setImportLimits).catch(() => {
        setImportLimits({ maxSizeMo: 100, compressImages: true });
      });
    }
  };

  // Fermer le modal d'ajout de fichiers
  const closeAddFileModal = () => {
    setShowAddFileModal(false);
    setAddFileModalData(null);
    setSelectedFiles([]);
    setAddFileModalDraggingOver(false);
    setUploadProgress(null);
  };

  // Compresser une image (redimensionnement + qualité) pour réduire la taille
  const compressImageFile = (file: File, maxSizeBytes: number): Promise<File> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1920;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const out = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
            resolve(out.size <= maxSizeBytes ? out : file);
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  };

  // Appliquer limite de taille et compression aux fichiers avant ajout à la liste
  const processFilesForImport = async (files: File[]): Promise<File[]> => {
    const maxBytes = importLimits.maxSizeMo * 1024 * 1024;
    const out: File[] = [];
    const isImage = (f: File) => f.type.startsWith('image/');
    for (const file of files) {
      if (file.size > maxBytes) {
        if (importLimits.compressImages && isImage(file)) {
          try {
            const compressed = await compressImageFile(file, maxBytes);
            if (compressed.size <= maxBytes) {
              out.push(compressed);
            } else {
              showAlert(`« ${file.name} » dépasse ${importLimits.maxSizeMo} Mo même après compression. Taille max. configurable dans Paramètres > Import de fichiers.`, 'warning', 'Fichier trop volumineux');
            }
          } catch {
            showAlert(`« ${file.name} » : compression impossible. Taille max. ${importLimits.maxSizeMo} Mo.`, 'warning');
          }
        } else {
          showAlert(`« ${file.name} » dépasse la taille max. (${importLimits.maxSizeMo} Mo). Paramètres > Import de fichiers.`, 'warning', 'Fichier trop volumineux');
        }
        continue;
      }
      if (importLimits.compressImages && isImage(file) && (file.size > 500 * 1024 || file.type === 'image/png')) {
        try {
          const compressed = await compressImageFile(file, maxBytes);
          out.push(compressed);
        } catch {
          out.push(file);
        }
      } else {
        out.push(file);
      }
    }
    return out;
  };

  // Gérer le sélecteur de fichiers (ajoute aux fichiers déjà sélectionnés / scannés)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    input.value = '';
    setProcessingFiles(true);
    try {
      const processed = await processFilesForImport(list);
      if (processed.length > 0) {
        setSelectedFiles(prev => [...prev, ...processed]);
      } else if (list.length > 0) {
        // Fallback : si le traitement ne renvoie rien (erreur ou tout refusé), ajouter quand même pour que l'interface charge
        setSelectedFiles(prev => [...prev, ...list]);
      }
    } catch {
      if (list.length > 0) setSelectedFiles(prev => [...prev, ...list]);
    } finally {
      setProcessingFiles(false);
    }
  };

  // Ouvrir le sélecteur de fichiers du modal (Parcourir) — ref + fallback getElementById pour fiabilité
  const triggerAddFileBrowse = () => {
    const input = addFileBrowseInputRef.current ?? (typeof document !== 'undefined' ? document.getElementById('add-file-browse-input') : null) as HTMLInputElement | null;
    if (!input) {
      showAlert('Impossible d\'ouvrir le sélecteur de fichiers. Fermez et rouvrez le modal puis réessayez.', 'warning');
      return;
    }
    input.value = '';
    input.removeAttribute('disabled');
    requestAnimationFrame(() => {
      input.click();
    });
  };

  // Récupérer les fichiers depuis un drop (Explorer, bureau, navigateur) : .files et .items
  const getFilesFromDataTransfer = (dataTransfer: DataTransfer): File[] => {
    const fromFiles = dataTransfer.files?.length ? Array.from(dataTransfer.files) : [];
    if (fromFiles.length > 0) return fromFiles;
    const out: File[] = [];
    if (dataTransfer.items) {
      for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i];
        if (item.kind === 'file') {
          try {
            const file = item.getAsFile();
            if (file) out.push(file);
          } catch {
            // ignorer si getAsFile() échoue (certains types)
          }
        }
      }
    }
    return out;
  };

  // Gérer le drop de fichiers dans le modal (fichiers externes : Explorer, bureau, etc.)
  const handleModalFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAddFileModalDraggingOver(false);
    let files = getFilesFromDataTransfer(e.dataTransfer);
    if (files.length === 0 && e.dataTransfer.files?.length) {
      files = Array.from(e.dataTransfer.files);
    }
    if (files.length === 0 && e.dataTransfer.items) {
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
    if (files.length > 0) {
      addFileModalJustDroppedRef.current = true;
      setProcessingFiles(true);
      processFilesForImport(files).then((processed) => {
        if (processed.length > 0) {
          setSelectedFiles(prev => [...prev, ...processed]);
        } else {
          setSelectedFiles(prev => [...prev, ...files]);
        }
        setProcessingFiles(false);
      }).catch(() => {
        setSelectedFiles(prev => [...prev, ...files]);
        setProcessingFiles(false);
      });
    } else {
      showAlert('Aucun fichier reçu. Utilisez « Parcourir » ou glissez-déposez à nouveau depuis l’Explorateur ou le bureau.', 'warning', 'Drop sans fichier');
    }
  };

  // Confirmer l'ajout des fichiers (upload un par un avec progression et rapport d'erreurs)
  const confirmAddFiles = async () => {
    if (!addFileModalData || selectedFiles.length === 0) return;

    if (!laravelApiService.isConfigured()) {
      showAlert(
        'L\'upload de fichiers nécessite l\'API Laravel. Démarrez l\'API (cd laravel-api && php artisan serve) et définissez VITE_LARAVEL_API_URL=http://localhost:8000 dans le .env à la racine, puis redémarrez le front (npm run dev).',
        'error',
        'Upload impossible'
      );
      return;
    }
    const token = typeof localStorage !== 'undefined' ? (localStorage.getItem('laravel_token') || localStorage.getItem('auth_token')) : null;
    if (!token) {
      showAlert(
        'Vous devez être connecté à l\'API Laravel pour ajouter des fichiers. Déconnectez-vous puis reconnectez-vous (connexion par email/mot de passe ou token par email).',
        'error',
        'Upload impossible'
      );
      return;
    }

    const courrierId = addFileModalData.courrierId;
    const courrier = courriers.find((c) => c.id === courrierId) ?? courrierService.getCourrierById(courrierId);
    if (!courrier) {
      showAlert(
        'Impossible de synchroniser le courrier vers l\'API. Le courrier n\'est pas chargé. Réessayez après avoir rafraîchi la liste.',
        'warning',
        'Courrier introuvable'
      );
      return;
    }

    setIsAddingFiles(true);
    setUploadProgress({ phase: 'uploading', total: selectedFiles.length, current: 0, currentFileName: null, failed: [], succeeded: 0 });
    setLoadingOperations(prev => ({ ...prev, insert: true }));

    try {
      try {
        await laravelApiService.updateCourrier(courrier.id, courrier);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/404|introuvable|not found/i.test(msg)) {
          await laravelApiService.createCourrier(courrier);
        } else {
          throw e;
        }
      }

      const created: CategorieFichier[] = [];
      const failed: { fileName: string; error: string }[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(prev => prev ? { ...prev, current: i, currentFileName: file.name } : null);
        try {
          const item = await categorieFichierService.createFichier(
            addFileModalData.courrierId,
            file.name,
            file,
            addFileModalData.dossierId,
            user?.id,
            file.size
          );
          created.push(item);
          setUploadProgress(prev => prev ? { ...prev, succeeded: created.length } : null);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          failed.push({ fileName: file.name, error: errorMessage });
          setUploadProgress(prev => prev ? { ...prev, failed: [...(prev.failed || []), { fileName: file.name, error: errorMessage }] } : null);
        }
      }

      setUploadProgress(prev => prev ? { ...prev, phase: 'done', current: selectedFiles.length, currentFileName: null } : null);

      if (created.length > 0) {
        setDossiersFichiers(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(courrierId) || [];
          const withDates = created.map(f => ({
            ...f,
            dateCreation: f.dateCreation instanceof Date ? f.dateCreation : new Date(f.dateCreation as unknown as string),
            dateModification: f.dateModification instanceof Date ? f.dateModification : new Date(f.dateModification as unknown as string),
          }));
          newMap.set(courrierId, [...current, ...withDates]);
          return newMap;
        });
        setExpandedCourriers(prev => {
          const next = new Set([...prev, courrierId]);
          if (addFileModalData.dossierId) next.add(`folder-${addFileModalData.dossierId}`);
          return next;
        });
        loadDossiersFichiers(courrierId);
        setTimeout(() => loadDossiersFichiers(courrierId), 500);
      }

      if (failed.length === 0) {
        showAlert(`${selectedFiles.length} fichier(s) ajouté(s) avec succès`, 'success');
        closeAddFileModal();
        loadStorageInfo(); // Mettre à jour l'état de stockage
      } else if (created.length > 0) {
        showAlert(`${created.length} fichier(s) ajouté(s), ${failed.length} en erreur. Consultez le détail dans le modal.`, 'warning', 'Upload partiel');
        loadStorageInfo(); // Mettre à jour l'état de stockage
      } else {
        showAlert(`Aucun fichier n'a pu être envoyé. Vérifiez la connexion et les droits.`, 'error', 'Erreur');
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout des fichiers:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      setUploadProgress(prev => prev ? { ...prev, phase: 'done', failed: [...(prev.failed || []), { fileName: '', error: errorMessage }] } : null);
      showAlert(`Erreur : ${errorMessage}`, 'error', 'Erreur');
    } finally {
      setIsAddingFiles(false);
      setLoadingOperations(prev => ({ ...prev, insert: false }));
    }
  };

  // Réinitialiser le modal après upload (revenir à l'étape de sélection pour ajouter d'autres fichiers)
  const resetAddFileModalToIdle = () => {
    setSelectedFiles([]);
    setUploadProgress(null);
  };

  // Mettre à jour les options de scan (répercutées dans Paramètres > Scanners)
  const handleScanSettingsChange = async (next: Partial<ScanSettings>) => {
    const updated = { ...scanSettings, ...next };
    setScanSettings(updated);
    try {
      await userSettingsService.saveSettings('scan_settings', updated);
    } catch (e) {
      console.error('Erreur sauvegarde options de scan:', e);
    }
  };

  // Scanner un document (scanner configuré dans Paramètres > Scanners)
  const handleScan = async () => {
    if (!addFileModalData) return;
    if (!selectedScanner && scanners.length > 0) {
      showAlert('Veuillez sélectionner un scanner', 'warning');
      return;
    }
    if (scanners.length === 0) {
      showAlert('Aucun scanner détecté. Configurez un scanner dans Paramètres > Gestion des scanners.', 'warning');
      return;
    }
    const scannerId = selectedScanner || scanners[0]?.id;
    if (!scannerId) return;

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
        scanType: scanSettings.scanType ?? 'single',
        compress: scanSettings.compress ?? false,
        compressionLimitKb: (scanSettings.compressionLimitKb != null && scanSettings.compressionLimitKb > 0) ? scanSettings.compressionLimitKb : 500,
      };
      const scannedFile = await scannerService.scanDocument(scannerId, opts);
      setSelectedFiles(prev => [...prev, scannedFile]);
      showAlert('Document scanné et ajouté à la liste', 'success');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur lors du scan';
      showAlert(msg || 'Le scan a échoué. Vérifiez le scanner, le chargeur (bac) et que le serveur de scan est démarré (Paramètres > Scanners).', 'error', 'Erreur de scan');
    } finally {
      setScanning(false);
    }
  };

  // Fermer le modal de scan, révoquer l'URL et supprimer la prévisualisation côté API
  const closeScanModal = useCallback(() => {
    if (scanModalPreviewUrl) URL.revokeObjectURL(scanModalPreviewUrl);
    if (scanModalPreviewId && laravelApiService.isConfigured()) {
      laravelApiService.deleteScanPreview(scanModalPreviewId).catch(() => {});
    }
    setScanModalPreviewUrl(null);
    setScanModalPreviewFile(null);
    setScanModalPreviewId(null);
    setScanModalError(null);
    setScanModalTarget(null);
    setScanBackendStatus('idle');
    setShowScanModal(false);
  }, [scanModalPreviewUrl, scanModalPreviewId]);

  // À l'ouverture du modal de scan : afficher d'abord les scanners des préférences, puis rafraîchir avec la même méthode
  useEffect(() => {
    if (!showScanModal) return;
    setScanBackendStatus('checking');
    // Afficher immédiatement les scanners sauvegardés (identiques aux préférences) pour éviter liste vide
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
        const [prefer, approach, savedScan] = await Promise.all([
          userSettingsService.getSettings<boolean>('scanner_prefer_system_driver', false),
          userSettingsService.getSettings<string>('scanner_detection_approach', 'auto'),
          userSettingsService.getSettings<ScanSettings>('scan_settings', DEFAULT_SCAN_SETTINGS),
        ]);
        setScanSettings(prev => ({ ...DEFAULT_SCAN_SETTINGS, ...prev, ...savedScan }));
        const detected = await scannerService.detectScanners(!!prefer, (approach === 'auto' || !approach ? undefined : approach as 'sane' | 'network' | 'system'));
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

  // Rafraîchir la liste des scanners dans le modal (même méthode que dans Préférences)
  const refreshScannersInModal = useCallback(async () => {
    setScannersLoading(true);
    try {
      const [prefer, approach] = await Promise.all([
        userSettingsService.getSettings<boolean>('scanner_prefer_system_driver', false),
        userSettingsService.getSettings<string>('scanner_detection_approach', 'auto'),
      ]);
      const detected = await scannerService.detectScanners(!!prefer, (approach === 'auto' || !approach ? undefined : approach as 'sane' | 'network' | 'system'));
      const list = detected.length > 0 ? detected : scannerService.getSavedScanners();
      setScanners(list);
      if (list.length > 0) setSelectedScanner(list[0].id);
    } catch {
      setScanners(scannerService.getSavedScanners());
      if (scannerService.getSavedScanners().length > 0) setSelectedScanner(scannerService.getSavedScanners()[0].id);
    } finally {
      setScannersLoading(false);
    }
  }, []);

  // Ouvrir le modal de scan (sans cible : le fichier pourra être ajouté à la liste du modal « Ajouter des fichiers » si ouvert)
  const openScanModal = useCallback(() => {
    setScanModalTarget(null);
    setScanModalError(null);
    setShowScanModal(true);
  }, []);

  // Ouvrir le modal de scan pour un courrier : le fichier scanné sera envoyé directement à ce courrier
  const openScanModalForCourrier = useCallback((courrierId: string, dossierId?: string) => {
    setScanModalTarget({ courrierId, dossierId });
    setScanModalError(null);
    setShowScanModal(true);
  }, []);

  // Lancer le scan depuis le modal et afficher la prévisualisation
  const handleScanInModal = async () => {
    setScanModalError(null);
    if (scanBackendStatus === 'error') {
      setScanModalError('Le serveur de scan ne répond pas. Démarrez-le (répertoire server, node server.js, port 3001) puis fermez et rouvrez ce modal.');
      return;
    }
    if (scanners.length === 0) {
      setScanModalError('Aucun scanner détecté. Allez dans Paramètres > Gestion des scanners, démarrez le serveur de scan (port 3001) puis rafraîchissez la liste.');
      return;
    }
    const scannerId = selectedScanner || scanners[0]?.id;
    if (!scannerId) {
      setScanModalError('Sélectionnez un scanner dans la liste ci-dessus.');
      return;
    }
    if (scanModalPreviewUrl) {
      URL.revokeObjectURL(scanModalPreviewUrl);
      setScanModalPreviewUrl(null);
    }
    if (scanModalPreviewId && laravelApiService.isConfigured()) {
      laravelApiService.deleteScanPreview(scanModalPreviewId).catch(() => {});
      setScanModalPreviewId(null);
    }
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
        scanType: scanSettings.scanType ?? 'single',
        compress: scanSettings.compress ?? false,
        compressionLimitKb: (scanSettings.compressionLimitKb != null && scanSettings.compressionLimitKb > 0) ? scanSettings.compressionLimitKb : 500,
        signal: controller.signal,
      };
      const scannedFile = await scannerService.scanDocument(scannerId, opts);
      if (!scannedFile || scannedFile.size === 0) {
        setScanModalError('Le scan n\'a retourné aucun fichier. Vérifiez le scanner, le chargeur (bac) et que le serveur de scan est démarré (port 3001).');
        return;
      }
      setScanModalError(null);
      setScanModalPreviewFile(scannedFile);
      setImagePreviewZoom(1);
      setImagePreviewRotation(0);
      setImagePreviewFit('contain');
      if (laravelApiService.isConfigured()) {
        try {
          const { previewId } = await laravelApiService.uploadScanPreview(scannedFile);
          setScanModalPreviewId(previewId);
          const blob = await laravelApiService.fetchScanPreviewBlob(previewId);
          setScanModalPreviewUrl(URL.createObjectURL(blob));
        } catch (e) {
          setScanModalPreviewId(null);
          setScanModalPreviewUrl(URL.createObjectURL(scannedFile));
        }
      } else {
        setScanModalPreviewUrl(URL.createObjectURL(scannedFile));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur lors du scan';
      const displayMsg = msg || 'Le scan a échoué. Vérifiez le scanner et le serveur de scan (Paramètres > Scanners).';
      setScanModalError(displayMsg);
      if (displayMsg !== 'Scan annulé') {
        showAlert(displayMsg, 'error', 'Erreur de scan');
      } else {
        showAlert('Scan annulé.', 'info', 'Annulation');
      }
    } finally {
      setScanning(false);
      scanAbortControllerRef.current = null;
    }
  };

  const handleCancelScan = useCallback(() => {
    if (scanAbortControllerRef.current) {
      scanAbortControllerRef.current.abort();
    }
  }, []);

  // Appliquer le paramétrage (limite de taille + compression) au fichier scanné avant envoi.
  // Cible 95 % de la limite pour éviter les rejets côté backend (arrondis, marge).
  const processScannedFile = async (
    file: File,
    limits: { maxSizeMo: number; compressImages: boolean }
  ): Promise<File> => {
    const maxBytes = limits.maxSizeMo * 1024 * 1024;
    const targetBytes = Math.max(50 * 1024, Math.floor(maxBytes * 0.95));
    const maxSizeKb = Math.floor(targetBytes / 1024);
    const isImage = (f: File) => f.type.startsWith('image/');
    const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

    if (isImage(file)) {
      if (file.size > maxBytes && limits.compressImages) {
        try {
          const compressed = await compressImageFile(file, targetBytes);
          return compressed;
        } catch {
          return file;
        }
      }
      if (limits.compressImages && (file.size > 500 * 1024 || file.type === 'image/png')) {
        try {
          return await compressImageFile(file, targetBytes);
        } catch {
          return file;
        }
      }
      return file;
    }

    if (isPdf(file)) {
      const shouldCompressPdf = file.size > maxBytes || (limits.compressImages && file.size > 500 * 1024);
      if (shouldCompressPdf) {
        try {
          return await scannerService.compressPdfFile(file, maxSizeKb);
        } catch {
          return file;
        }
      }
    }

    return file;
  };

  // Ajouter le document prévisualisé : soit upload direct au courrier (si scanModalTarget), soit à la liste du modal « Ajouter des fichiers »
  const handleAddScannedToFiles = useCallback(async () => {
    const file = scanModalPreviewFile;
    if (!file) {
      setScanModalTarget(null);
      setShowScanModal(false);
      return;
    }

    setLoadingOperations(prev => ({ ...prev, insert: true }));
    const limits = await laravelApiService.getImportFichiersLimits().catch(() => ({ maxSizeMo: 100, compressImages: true }));
    const maxBytes = limits.maxSizeMo * 1024 * 1024;
    let fileToUse: File;
    try {
      fileToUse = await processScannedFile(file, limits);
    } catch {
      fileToUse = file;
    }

    if (fileToUse.size > maxBytes) {
      const sizeMo = (fileToUse.size / (1024 * 1024)).toFixed(2);
      showAlert(
        `Le document scanné dépasse la limite après compression (${sizeMo} Mo). Limite actuelle : ${limits.maxSizeMo} Mo. Augmentez la limite dans Paramètres > Import de fichiers puis réessayez.`,
        'warning',
        'Fichier trop volumineux'
      );
      return;
    }

    if (scanModalPreviewUrl) URL.revokeObjectURL(scanModalPreviewUrl);
    if (scanModalPreviewId && laravelApiService.isConfigured()) {
      laravelApiService.deleteScanPreview(scanModalPreviewId).catch(() => {});
    }
    setScanModalPreviewUrl(null);
    setScanModalPreviewFile(null);
    setScanModalPreviewId(null);

    if (scanModalTarget && laravelApiService.isConfigured()) {
      const { courrierId, dossierId } = scanModalTarget;
      setScanModalTarget(null);
      setShowScanModal(false);
      try {
        const courrier = courriers.find(c => c.id === courrierId) ?? courrierService.getCourrierById(courrierId);
        if (courrier) {
          try {
            await laravelApiService.updateCourrier(courrier.id, courrier);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/404|introuvable|not found/i.test(msg)) await laravelApiService.createCourrier(courrier);
            else throw e;
          }
        }
        const created = await categorieFichierService.createFichier(courrierId, fileToUse.name, fileToUse, dossierId, user?.id, fileToUse.size);
        const withDates = { ...created, dateCreation: new Date(created.dateCreation as unknown as string), dateModification: new Date(created.dateModification as unknown as string) };
        setDossiersFichiers(prev => {
          const next = new Map(prev);
          const list = next.get(courrierId) || [];
          next.set(courrierId, [...list, withDates]);
          return next;
        });
        setExpandedCourriers(prev => new Set([...prev, courrierId]));
        loadDossiersFichiers(courrierId);
        loadStorageInfo(); // Mettre à jour l'état de stockage
        showAlert('Document scanné ajouté au courrier', 'success');
        setLoadingOperations(prev => ({ ...prev, insert: false }));
      } catch (err) {
        setLoadingOperations(prev => ({ ...prev, insert: false }));
        const msg = err instanceof Error ? err.message : String(err);
        showAlert(`Erreur lors de l'ajout du document scanné : ${msg}`, 'error', 'Erreur');
      }
      return;
    }

    setSelectedFiles(prev => [...prev, fileToUse]);
    showAlert('Document ajouté à la liste', 'success');
    setScanModalTarget(null);
    setShowScanModal(false);
    setLoadingOperations(prev => ({ ...prev, insert: false }));
  }, [scanModalPreviewFile, scanModalPreviewUrl, scanModalPreviewId, scanModalTarget, courriers, user?.id]);

  // Effacer la prévisualisation pour un nouveau scan (et supprimer côté API)
  const handleNewScanInModal = useCallback(() => {
    if (scanModalPreviewUrl) URL.revokeObjectURL(scanModalPreviewUrl);
    if (scanModalPreviewId && laravelApiService.isConfigured()) {
      laravelApiService.deleteScanPreview(scanModalPreviewId).catch(() => {});
    }
    setScanModalPreviewUrl(null);
    setScanModalPreviewFile(null);
    setScanModalPreviewId(null);
    setScanModalError(null);
  }, [scanModalPreviewUrl, scanModalPreviewId]);

  // Ouvrir le modal de visualisation (fichiers gérés par l'API Laravel quand configurée)
  const openViewFileModal = async (fichier: CategorieFichier) => {
    setViewFileData({ fichier, url: '', loadDone: false });
    setImagePreviewSize(null);
    setImagePreviewZoom(1);
    setImagePreviewRotation(0);
    setImagePreviewFit('contain');
    setShowViewFileModal(true);
    setEditMode('view');
    try {
      const url = await categorieFichierService.getFileDisplayUrl(fichier);
      setViewFileData(prev => (prev ? { ...prev, url: url || '', loadDone: true } : prev));
    } catch {
      setViewFileData(prev => (prev ? { ...prev, url: '', loadDone: true } : prev));
    }
  };

  // Ouvrir le fichier dans un nouvel onglet (approche fiable : le navigateur affiche PDF/image)
  const handleOpenViewedFileInNewTab = async () => {
    if (!viewFileData?.fichier) return;
    if (viewFileData.url?.startsWith('blob:')) {
      window.open(viewFileData.url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const blob = await laravelApiService.fetchFichierBlob(viewFileData.fichier.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showAlert(`Impossible d'ouvrir : ${msg}`, 'error', 'Ouvrir');
    }
  };

  // Télécharger le fichier affiché (utilise le blob ou fetch avec auth si l'affichage a échoué)
  const handleDownloadViewedFile = async () => {
    if (!viewFileData?.fichier) return;
    if (viewFileData.url && viewFileData.url.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = viewFileData.url;
      a.download = viewFileData.fichier.nom;
      a.click();
      return;
    }
    try {
      const blob = await laravelApiService.fetchFichierBlob(viewFileData.fichier.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = viewFileData.fichier.nom;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showAlert(`Impossible de télécharger : ${msg}`, 'error', 'Téléchargement');
    }
  };

  const handleGenerateRegistre = async (preview = false) => {
    try {
    // Adapter les colonnes sans setState (évite de re-render pendant la génération)
    const columnsForPdf = getRegistreColumnsForCurrentFilters();
    
    // Filtrer les courriers selon les filtres du registre
    let filteredCourriers = courriers;
    if (registreConfig.filterSens !== 'ALL') {
      filteredCourriers = filteredCourriers.filter(c => c.sens === registreConfig.filterSens);
    }
    if (registreConfig.filterType !== 'ALL') {
      filteredCourriers = filteredCourriers.filter(c => c.type === registreConfig.filterType);
    }
    if (registreConfig.filterStatut !== 'ALL') {
      filteredCourriers = filteredCourriers.filter(c => c.statut === registreConfig.filterStatut);
    }
    if (registreConfig.filterPriorite !== 'ALL') {
      filteredCourriers = filteredCourriers.filter(c => c.priorite === registreConfig.filterPriorite);
    }
    if (registreConfig.filterEntityId !== 'ALL') {
      const entityId = registreConfig.filterEntityId;
      const selectedEntity = entiteOrganisationnelleService.getEntityById(entityId);
      
      if (selectedEntity) {
        // Récupérer toutes les sous-entités de l'entité sélectionnée (y compris elle-même)
        const getAllSubEntities = (parentId: string): string[] => {
          const entity = entiteOrganisationnelleService.getEntityById(parentId);
          if (!entity) return [parentId];
          
          const children = entiteOrganisationnelleService.getEntitiesByParent(parentId);
          if (children.length === 0) return [parentId];
          
          return [parentId, ...children.flatMap(child => getAllSubEntities(child.id))];
        };
        
        const allEntityIds = getAllSubEntities(entityId);
        
        filteredCourriers = filteredCourriers.filter(c => {
          // Filtrer selon le type de l'entité sélectionnée
          if (selectedEntity.type === 'direction') {
            return allEntityIds.includes(c.direction || '');
          } else if (selectedEntity.type === 'service') {
            return allEntityIds.includes(c.service || '');
          } else if (selectedEntity.type === 'sous-service') {
            return allEntityIds.includes((c.extraFields as Record<string, string>)?.['sousService'] || '');
          } else if (selectedEntity.type === 'division') {
            // Pour les divisions, filtrer sur les services qui appartiennent à cette division
            return allEntityIds.includes(c.service || '');
          }
          return false;
        });
      }
    }
    if (registreConfig.filterDateDebut) {
      const dateDebut = new Date(registreConfig.filterDateDebut);
      filteredCourriers = filteredCourriers.filter(c => new Date(c.dateReception) >= dateDebut);
    }
    if (registreConfig.filterDateFin) {
      const dateFin = new Date(registreConfig.filterDateFin);
      filteredCourriers = filteredCourriers.filter(c => new Date(c.dateReception) <= dateFin);
    }
    if (debouncedRegistreSearch) {
      const searchLower = debouncedRegistreSearch.toLowerCase();
      filteredCourriers = filteredCourriers.filter(c =>
        c.numero.toLowerCase().includes(searchLower) ||
        c.objet.toLowerCase().includes(searchLower) ||
        (c.expediteur && c.expediteur.toLowerCase().includes(searchLower)) ||
        (c.destinataire && c.destinataire.toLowerCase().includes(searchLower))
      );
    }
    if (registreConfig.filterMesAssignations) {
      filteredCourriers = filteredCourriers.filter(c => mesAssignations.has(c.id));
    }
    if (registreConfig.filterNonClassifies) {
      filteredCourriers = filteredCourriers.filter(c => !c.categorieId);
    }
    // Récupérer les annotations DG si nécessaire (filtre ou colonne visible)
    const dgAnnotationMap = new Map<string, string>(); // courrierId -> contenu annotation DG
    const needsDGAnnotations =
      registreConfig.filterAnnotationDG !== 'ALL' ||
      registreConfig.columns.some(col => col.key === 'annotationDG' && col.visible);
    if (needsDGAnnotations) {
      const dgUser = adminService.getDirecteurGeneral();
      if (dgUser) {
        const dgAnnotationCourrierIds = new Set<string>();

        // Garde-fous anti-plantage: limiter la concurrence + timeout global.
        const CONCURRENCY = 6;
        const TIMEOUT_MS = 12000;
        const startTs = Date.now();
        const items = filteredCourriers.slice(); // copie stable
        let idx = 0;

        const worker = async () => {
          while (idx < items.length) {
            // Stop si on dépasse le timeout global (évite freeze si serveur lent)
            if (Date.now() - startTs > TIMEOUT_MS) return;
            const i = idx;
            idx += 1;
            const c = items[i];
            if (!c?.id) continue;
            try {
              const annotations = await courrierService.getAnnotationsByCourrier(c.id);
              const dgAnnotation = annotations.find(a => a.auteur === dgUser.id);
              if (dgAnnotation) {
                dgAnnotationCourrierIds.add(c.id);
                dgAnnotationMap.set(c.id, dgAnnotation.contenu);
              }
            } catch {
              // silencieux: ne jamais bloquer la génération du registre
            }
          }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker());
        await Promise.all(workers);

        if (registreConfig.filterAnnotationDG === 'AVEC_ANNOTATION_DG') {
          filteredCourriers = filteredCourriers.filter(c => dgAnnotationCourrierIds.has(c.id));
        } else if (registreConfig.filterAnnotationDG === 'SANS_ANNOTATION_DG') {
          filteredCourriers = filteredCourriers.filter(c => !dgAnnotationCourrierIds.has(c.id));
        }
      }
    }

    // Déterminer l'orientation jsPDF
    const jsPdfOrientation = registreConfig.orientation === 'landscape' ? 'l' : 'p';
    const doc = new jsPDF(jsPdfOrientation, 'mm', registreConfig.paperSize);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageMargin = 15;
    const tableMargin = registreConfig.tableMargin;

    // Couleurs du thème
    const primaryColor: [number, number, number] = [22, 101, 52]; // vert foncé
    const accentColor: [number, number, number] = [34, 197, 94]; // vert vif
    const headerBg: [number, number, number] = [30, 64, 175]; // bleu foncé
    const headerText: [number, number, number] = [255, 255, 255];
    const rowEven: [number, number, number] = [248, 250, 252]; // slate-50
    const rowOdd: [number, number, number] = [255, 255, 255];
    const footerColor: [number, number, number] = [100, 116, 139]; // slate-500

    // ── Bandeau d'en-tête coloré ──
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 32, 'F');
    // Ligne d'accent sous le bandeau
    doc.setFillColor(...accentColor);
    doc.rect(0, 32, pageWidth, 2, 'F');

    // Titre dans le bandeau
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...headerText);
    doc.text(registreConfig.title, pageWidth / 2, 15, { align: 'center' });

    // Sous-titre : date de génération
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 230, 200);
    doc.text(`Généré le ${exportSettingsService.formatDate(new Date(), true)}`, pageWidth / 2, 23, { align: 'center' });

    // ── Période et filtres ──
    let yCursor = 40;
    doc.setTextColor(51, 65, 85); // slate-700
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    let filterInfo = '';
    if (registreConfig.filterSens !== 'ALL') filterInfo += `Sens: ${registreConfig.filterSens}  `;
    if (registreConfig.filterType !== 'ALL') filterInfo += `Type: ${registreConfig.filterType}  `;
    if (registreConfig.filterAnnotationDG === 'AVEC_ANNOTATION_DG') filterInfo += `Avec annotation DG  `;
    if (registreConfig.filterAnnotationDG === 'SANS_ANNOTATION_DG') filterInfo += `Sans annotation DG  `;
    if (filterInfo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(filterInfo.trim(), pageMargin, yCursor);
      yCursor += 5;
    }

    // ── Statistiques si activé ──
    if (registreConfig.includeStats) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const entrantsCount = filteredCourriers.filter(c => c.sens === SensCourrier.ENTRANT).length;
      const sortantsCount = filteredCourriers.filter(c => c.sens === SensCourrier.SORTANT).length;
      const dgAnnotCount = registreConfig.filterAnnotationDG !== 'ALL' ? filteredCourriers.length : 0;

      // Carte statistique avec fond
      const statsY = yCursor;
      const statsH = 10;
      const statsW = pageWidth - 2 * pageMargin;
      doc.setFillColor(241, 245, 249); // slate-100
      doc.roundedRect(pageMargin, statsY, statsW, statsH, 2, 2, 'F');
      doc.setTextColor(30, 64, 175);
      doc.setFontSize(9);
      doc.text(`Total: ${filteredCourriers.length}`, pageMargin + 4, statsY + 6.5);
      doc.setTextColor(22, 101, 52);
      doc.text(`Entrants: ${entrantsCount}`, pageMargin + statsW * 0.25, statsY + 6.5);
      doc.setTextColor(180, 83, 9);
      doc.text(`Sortants: ${sortantsCount}`, pageMargin + statsW * 0.5, statsY + 6.5);
      if (registreConfig.filterAnnotationDG !== 'ALL') {
        doc.setTextColor(147, 51, 234);
        doc.text(`Annot. DG: ${dgAnnotCount}`, pageMargin + statsW * 0.75, statsY + 6.5);
      }
      yCursor += statsH + 4;
    }

    // ── Colonnes visibles ──
    const visibleColumns = (columnsForPdf || registreConfig.columns).filter(col => col.visible);
    const headers = visibleColumns.map(col => col.label);
    const colKeys = visibleColumns.map(col => col.key);

    // Calculer les largeurs de colonnes en fonction du contenu
    doc.setFontSize(registreConfig.fontSize);
    const calculateColumnWidth = (key: string, header: string) => {
      let maxWidth = doc.getTextWidth(header) + 6;
      filteredCourriers.forEach(c => {
        let value = '-';
        if (key === 'numero') value = c.numero || '-';
        else if (key === 'dateReception') value = exportSettingsService.formatDate(c.dateReception);
        else if (key === 'annotationDG') {
          const annotContent = dgAnnotationMap.get(c.id);
          value = annotContent ? (annotContent.length > 30 ? annotContent.substring(0, 27) + '...' : annotContent) : '-';
        }
        else if (key === 'statut') value = c.statut || '-';
        else {
          if (c.extraFields && key in c.extraFields) {
            value = c.extraFields[key] || '-';
          } else {
            value = (c as any)[key] || '-';
          }
        }
        const textWidth = doc.getTextWidth(String(value)) + 6;
        if (textWidth > maxWidth) maxWidth = textWidth;
      });
      return Math.min(Math.max(maxWidth, 15), 50);
    };

    const colWidths = colKeys.map((key, i) => calculateColumnWidth(key, headers[i]));

    // Ajuster les largeurs pour remplir la page
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const availableWidth = pageWidth - (2 * pageMargin);
    if (totalWidth < availableWidth) {
      const extraSpace = (availableWidth - totalWidth) / colWidths.length;
      colWidths.forEach((_, i) => colWidths[i] += extraSpace);
    }

    // ── Dessiner le tableau ──
    const rowHeight = 8;
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);

    let startX = tableMargin;
    if (registreConfig.tableAlign === 'center') {
      startX = (pageWidth - tableWidth) / 2;
    } else if (registreConfig.tableAlign === 'right') {
      startX = pageWidth - tableWidth - tableMargin;
    }

    // Fonction pour dessiner l'en-tête du tableau
    const drawTableHeader = (y: number) => {
      // Fond bleu foncé pour l'en-tête
      doc.setFillColor(...headerBg);
      doc.rect(startX, y, tableWidth, rowHeight, 'F');
      // Ligne de séparation sous l'en-tête
      doc.setFillColor(...accentColor);
      doc.rect(startX, y + rowHeight, tableWidth, 0.8, 'F');
      // Texte des en-têtes en blanc
      doc.setFontSize(registreConfig.fontSize);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...headerText);
      let xPos = startX;
      headers.forEach((header, i) => {
        doc.text(header, xPos + 3, y + rowHeight - 2.5);
        xPos += colWidths[i];
      });
      doc.setTextColor(0, 0, 0);
    };

    let y = yCursor + 2;
    drawTableHeader(y);

    // Lignes de données
    doc.setFont('helvetica', 'normal');
    let pageIndex = 0;
    let lineIndex = 0;
    console.log('[Registre PDF] filteredCourriers count:', filteredCourriers.length, 'yStart:', y, 'yCursor:', yCursor);
    filteredCourriers.forEach((c, idx) => {
      y += rowHeight;

      // Nouvelle page si nécessaire
      if (y > pageHeight - 25) {
        // Pied de page de la page courante
        doc.setFontSize(7);
        doc.setTextColor(...footerColor);
        doc.text(`Page ${pageIndex + 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text(`Total: ${filteredCourriers.length} courriers`, pageMargin, pageHeight - 10);

        doc.addPage();
        pageIndex++;
        y = 20;
        drawTableHeader(y);
        lineIndex = 0;
      }

      // Alternance des couleurs de ligne
      const isEven = lineIndex % 2 === 0;
      doc.setFillColor(...(isEven ? rowEven : rowOdd));
      doc.rect(startX, y, tableWidth, rowHeight, 'F');

      // Bordure horizontale fine
      if (registreConfig.showBorders) {
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.1);
        doc.line(startX, y, startX + tableWidth, y);
      }

      // Données de la ligne
      doc.setFontSize(registreConfig.fontSize);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59); // slate-800
      let xPos = startX;
      colKeys.forEach((key, i) => {
        let value = '-';
        if (key === 'numero') value = c.numero || '-';
        else if (key === 'dateReception') value = exportSettingsService.formatDate(c.dateReception);
        else if (key === 'annotationDG') {
          const annotContent = dgAnnotationMap.get(c.id);
          value = annotContent ? (annotContent.length > 30 ? annotContent.substring(0, 27) + '...' : annotContent) : '-';
          if (annotContent) doc.setTextColor(147, 51, 234);
          else doc.setTextColor(100, 116, 139);
        }
        else if (key === 'statut') {
          value = c.statut || '-';
          // Colorer le statut
          if (c.statut === StatutCourrier.TRAITE) doc.setTextColor(22, 101, 52);
          else if (c.statut === StatutCourrier.EN_ATTENTE_DG) doc.setTextColor(180, 83, 9);
          else if (c.statut === StatutCourrier.EN_TRAITEMENT) doc.setTextColor(30, 64, 175);
          else if (c.statut === StatutCourrier.ORIENTE_DG) doc.setTextColor(147, 51, 234);
          else if (c.statut === StatutCourrier.ARCHIVE) doc.setTextColor(100, 116, 139);
          else doc.setTextColor(30, 41, 59);
        } else {
          if (c.extraFields && key in c.extraFields) {
            value = c.extraFields[key] || '-';
          } else {
            value = (c as any)[key] || '-';
          }
        }

        const truncated = String(value).substring(0, Math.floor(colWidths[i] / 2.2));
        doc.text(truncated, xPos + 3, y + rowHeight - 2.5);
        xPos += colWidths[i];

        // Réinitialiser la couleur
        doc.setTextColor(30, 41, 59);
      });
      lineIndex++;
    });

    // Bordure de fermeture du tableau
    if (registreConfig.showBorders) {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.rect(startX, yCursor + 2 + rowHeight, tableWidth, y - yCursor - 2);
    }

    // Ligne d'accent en bas du tableau
    doc.setFillColor(...accentColor);
    doc.rect(startX, y + rowHeight, tableWidth, 0.8, 'F');

    // ── Pied de page final ──
    doc.setFontSize(8);
    doc.setTextColor(...footerColor);
    doc.text(`Total: ${filteredCourriers.length} courriers`, pageMargin, pageHeight - 10);
    doc.text(`Page ${pageIndex + 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Généré le ${exportSettingsService.formatDate(new Date())}`, pageWidth - pageMargin, pageHeight - 10, { align: 'right' });

    // Ligne de pied de page
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(pageMargin, pageHeight - 14, pageWidth - pageMargin, pageHeight - 14);

    if (preview) {
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      setRegistrePreviewUrl(blobUrl);
      setShowRegistrePreviewModal(true);
    } else {
      doc.save(`registre-courriers-${new Date().toISOString().split('T')[0]}.pdf`);
      setShowRegistreModal(false);
    }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Registre PDF] Erreur:', e);
      showAlert(`Erreur lors de la génération du registre : ${msg}`, 'error', 'Registre');
    }
  };

  // Fermer le modal de visualisation
  const closeViewFileModal = () => {
    setShowViewFileModal(false);
    setViewFileData(null);
    setImagePreviewSize(null);
    setImagePreviewZoom(1);
    setImagePreviewRotation(0);
    setImagePreviewFit('contain');
    setEditMode('view');
  };

  // Supprimer un fichier
  const handleDeleteFile = async (fichierId: string, courrierId: string) => {
    const confirmed = await showConfirm(
      'Êtes-vous sûr de vouloir supprimer ce fichier ?',
      'warning',
      'Confirmation de suppression'
    );
    if (!confirmed) return;
    
    try {
      setLoadingOperations(prev => ({ ...prev, delete: true }));
      await categorieFichierService.deleteCategorieFichier(fichierId);
      await loadDossiersFichiers(courrierId);
      loadStorageInfo(); // Mettre à jour l'état de stockage
      if (viewFileData?.fichier.id === fichierId) {
        closeViewFileModal();
      }
      showAlert('Fichier supprimé avec succès', 'success');
      setLoadingOperations(prev => ({ ...prev, delete: false }));
    } catch (error) {
      setLoadingOperations(prev => ({ ...prev, delete: false }));
      const msg = error instanceof Error ? error.message : 'Erreur inconnue';
      showAlert(`Erreur lors de la suppression : ${msg}`, 'error', 'Erreur');
    }
  };

  // Supprimer un dossier (avec tous ses enfants)
  const handleDeleteDossier = async (dossierId: string, dossierNom: string, courrierId: string) => {
    // Compter les enfants pour le message de confirmation
    const df = dossiersFichiers.get(courrierId) || [];
    const children = df.filter(d => d.parentId === dossierId);
    
    // Fonction récursive pour compter tous les descendants
    const countChildren = (parentId: string): number => {
      const direct = df.filter(d => d.parentId === parentId);
      return direct.length + direct.reduce((acc, child) => acc + countChildren(child.id), 0);
    };
    
    const totalChildren = countChildren(dossierId);
    
    const message = totalChildren > 0
      ? `Êtes-vous sûr de vouloir supprimer le dossier "${dossierNom}" ?\n\nCette action supprimera également ${totalChildren} élément(s) contenu(s) dans ce dossier (fichiers et sous-dossiers).\n\nCette action est irréversible.`
      : `Êtes-vous sûr de vouloir supprimer le dossier "${dossierNom}" ?\n\nCette action est irréversible.`;
    
    const confirmed = await showConfirm(message, 'warning', 'Confirmation de suppression');
    if (confirmed) {
      setLoadingOperations(prev => ({ ...prev, delete: true }));
      try {
        await categorieFichierService.deleteCategorieFichier(dossierId);
        await loadDossiersFichiers(courrierId);
        loadStorageInfo(); // Mettre à jour l'état de stockage
        // Fermer le dossier s'il était ouvert
        setExpandedCourriers(prev => {
          const next = new Set(prev);
          next.delete(dossierId);
          return next;
        });
        showAlert(`Dossier "${dossierNom}" supprimé avec succès`, 'success');
      } catch (error: any) {
        console.error('Erreur suppression dossier:', error);
        if (error.message?.includes('Session expirée')) {
          showAlert('Session expirée. Veuillez vous reconnecter.', 'error');
        } else {
          showAlert(`Erreur lors de la suppression du dossier: ${error.message}`, 'error');
        }
      } finally {
        setLoadingOperations(prev => ({ ...prev, delete: false }));
      }
    }
  };

  const handleSaveEditedFile = async (file: File, fichier: CategorieFichier) => {
    try {
      setLoadingOperations(prev => ({ ...prev, update: true }));
      // Utiliser la nouvelle méthode pour mettre à jour le fichier avec upload dans Firebase Storage
      await categorieFichierService.updateFichierWithFile(fichier.id, file, user?.id);

      // Recharger les fichiers
      await loadDossiersFichiers(fichier.courrierId);

      // Récupérer le fichier mis à jour pour obtenir la nouvelle URL
      const updatedFichier = await categorieFichierService.getCategorieFichierById(fichier.id);
      const newFileUrl = updatedFichier?.chemin;

      // Mettre à jour l'URL dans le modal
      if (newFileUrl) {
        setViewFileData(prev => (prev ? { ...prev, url: newFileUrl } : null));
      }
      setEditMode('view');
      showAlert('Fichier mis à jour avec succès', 'success');
      setLoadingOperations(prev => ({ ...prev, update: false }));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      setLoadingOperations(prev => ({ ...prev, update: false }));
      const errorMessage =
        error instanceof Error ? error.message : 'Une erreur inconnue est survenue';
      showAlert(`Erreur lors de la sauvegarde du fichier: ${errorMessage}`, 'error', 'Erreur');
    }
  };

  // Obtenir le fichier principal ou le premier fichier
  const getMainFile = (courrier: Courrier): string | undefined => {
    if (courrier.fichier) return courrier.fichier;
    if (courrier.categorieFichiers && courrier.categorieFichiers.length > 0) {
      const firstFile = courrier.categorieFichiers.find(df => df.type === 'fichier');
      return firstFile?.chemin;
    }
    const df = dossiersFichiers.get(courrier.id);
    if (df && df.length > 0) {
      const firstFile = df.find(d => d.type === 'fichier');
      return firstFile?.chemin;
    }
    return undefined;
  };

  // Gérer la sélection d'éléments
  const handleSelectItem = (itemId: string, e?: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => {
    e?.stopPropagation();
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Copier les éléments sélectionnés (du courrier courant)
  const handleCopyItems = (courrierId: string) => {
    const df = dossiersFichiers.get(courrierId) || [];
    const itemsToCopy = df.filter(item => selectedItems.has(item.id));
    setCopiedItems(itemsToCopy);
    showAlert(`${itemsToCopy.length} élément(s) copié(s)`, 'success');
  };

  // Supprimer les éléments sélectionnés (du courrier courant) — avec confirmation
  const handleDeleteSelectedItems = async (courrierId: string) => {
    const df = dossiersFichiers.get(courrierId) || [];
    const toDelete = df.filter(item => selectedItems.has(item.id));
    if (toDelete.length === 0) return;
    const confirmed = await showConfirm(
      `Êtes-vous sûr de vouloir supprimer ${toDelete.length} élément(s) ? Cette action est irréversible.`,
      'warning',
      'Confirmation de suppression'
    );
    if (!confirmed) return;
    try {
      setLoadingOperations(prev => ({ ...prev, delete: true }));
      for (const item of toDelete) {
        await categorieFichierService.deleteCategorieFichier(item.id);
      }
      setSelectedItems(prev => {
        const next = new Set(prev);
        for (const item of toDelete) {
          next.delete(item.id);
        }
        return next;
      });
      await loadDossiersFichiers(courrierId);
      loadStorageInfo(); // Mettre à jour l'état de stockage
      setLoadingOperations(prev => ({ ...prev, delete: false }));
      showAlert(`${toDelete.length} élément(s) supprimé(s)`, 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erreur inconnue';
      showAlert(`Erreur lors de la suppression : ${msg}`, 'error', 'Erreur');
    }
  };

  // Nombre d'éléments sélectionnés pour un courrier donné (affichage cohérent par courrier)
  const getSelectedCountForCourrier = (courrierId: string): number => {
    const df = dossiersFichiers.get(courrierId) || [];
    return df.filter(item => selectedItems.has(item.id)).length;
  };

  // Tout sélectionner / tout désélectionner pour les documents d'un courrier
  const handleSelectAllItemsForCourrier = (courrierId: string, select: boolean) => {
    const df = dossiersFichiers.get(courrierId) || [];
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (select) {
        df.forEach(item => next.add(item.id));
      } else {
        df.forEach(item => next.delete(item.id));
      }
      return next;
    });
  };

  // Coller les éléments copiés dans une catégorie
  const handlePasteItems = async (targetParentId: string | undefined, courrierId: string) => {
    if (copiedItems.length === 0) return;
    
    try {
      setLoadingOperations(prev => ({ ...prev, insert: true }));
      // Attendre toutes les copies pour s'assurer qu'elles sont persistées dans l'API
      await Promise.all(
        copiedItems.map(item =>
          categorieFichierService.copyCategorieFichier(item.id, targetParentId || '', courrierId, user?.id)
        )
      );
      
      // Si on colle dans une catégorie, l'ouvrir automatiquement
      if (targetParentId) {
        const folderKey = `folder-${targetParentId}`;
        setExpandedCourriers(prev => new Set([...prev, folderKey]));
      }
      
      // Recharger les dossiers/fichiers depuis l'API
      await loadDossiersFichiers(courrierId);
      const count = copiedItems.length;
      setCopiedItems([]);
      setSelectedItems(new Set());
      
      setLoadingOperations(prev => ({ ...prev, insert: false }));
      showAlert(`${count} élément(s) collé(s) avec succès`, 'success');
    } catch (error) {
      console.error('Erreur lors du collage des éléments:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      showAlert(`Erreur lors du collage: ${errorMessage}`, 'error', 'Erreur');
    }
  };

  // Gérer le drag d'un élément
  const handleItemDragStart = (item: CategorieFichier, e: React.DragEvent) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Gérer le drop d'un élément
  const handleItemDrop = async (targetDossierId: string, courrierId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedItem) return;
    
    try {
      setLoadingOperations(prev => ({ ...prev, update: true }));
      
      // Empêcher de déplacer un élément dans lui-même ou ses descendants
      if (draggedItem.id === targetDossierId) {
        showAlert('Impossible de déplacer un élément dans lui-même', 'error', 'Erreur de déplacement');
        return;
      }
      
      // Déplacer l'élément
      await categorieFichierService.updateCategorieFichier(draggedItem.id, {
        parentId: targetDossierId
      });
      
      // Recharger les fichiers depuis l'API pour s'assurer que le déplacement est persisté
      await loadDossiersFichiers(courrierId);
      showAlert(`${draggedItem.nom} déplacé avec succès`, 'success');
    } catch (error) {
      console.error('Erreur lors du déplacement:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      showAlert(`Erreur lors du déplacement: ${errorMessage}`, 'error', 'Erreur');
    } finally {
      setLoadingOperations(prev => ({ ...prev, update: false }));
      setDraggedItem(null);
      setDraggedOverDossier(null);
    }
  };

  // Rendre l'arborescence
  const renderTree = (items: CategorieFichier[], level: number = 0, courrierId: string): React.ReactNode => {
    // TOUJOURS utiliser les données les plus récentes du state, pas celles passées en paramètre
    const allItems = dossiersFichiers.get(courrierId) || items;
    
    // Éléments racine : pas de parentId (null, undefined ou chaîne vide)
    const rootItems = allItems.filter(item => item.parentId == null || item.parentId === '');
    
    // Créer un map pour trouver rapidement les enfants d'un parent
    const childrenMap = new Map<string, CategorieFichier[]>();
    allItems.forEach(item => {
      if (item.parentId) {
        if (!childrenMap.has(item.parentId)) {
          childrenMap.set(item.parentId, []);
        }
        childrenMap.get(item.parentId)!.push(item);
      }
    });
    
    // Fonction récursive pour rendre un élément et ses enfants
    const renderItem = (item: CategorieFichier, currentLevel: number = 0): React.ReactNode => {
      const isDraggedOver = draggedOverDossier === item.id;
      const isSelected = selectedItems.has(item.id);
      const isExpanded = expandedCourriers.has(`folder-${item.id}`);
      // Toujours chercher les enfants dans les données les plus récentes
      const itemChildren = childrenMap.get(item.id) || [];
      const hasChildren = itemChildren.length > 0;

      return (
        <div key={item.id} className="py-1 group">
          {item.type === 'categorie' ? (
            <div
              className={`flex items-center gap-2 text-sm p-2 rounded transition-colors ${
                isDraggedOver ? 'bg-blue-100 border-2 border-blue-400 border-dashed' : 
                isSelected ? 'bg-blue-50 border border-blue-300' : 
                'hover:bg-gray-50'
              }`}
              style={{ paddingLeft: `${currentLevel * 24}px` }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (draggedItem) {
                  handleItemDrop(item.id, courrierId, e);
                } else {
                  handleFileDrop(e, courrierId, item.id);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDragOver(e, item.id);
              }}
              onDragLeave={handleDragLeave}
              draggable
              onDragStart={(e) => handleItemDragStart(item, e)}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  handleSelectItem(item.id, e);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const key = `folder-${item.id}`;
                  const willBeExpanded = !isExpanded;
                  
                  setExpandedCourriers(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(key)) {
                      newSet.delete(key);
                    } else {
                      newSet.add(key);
                    }
                    return newSet;
                  });
                  
                  // Recharger les données si on ouvre la catégorie
                  if (willBeExpanded) {
                    loadDossiersFichiers(courrierId);
                  }
                }}
                className="text-gray-500 hover:text-gray-700 w-4"
                title={isExpanded ? "Réduire" : "Développer"}
              >
                <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRightIcon} className="text-xs" />
              </button>
              <div
                className="flex items-center gap-2 flex-1 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  const key = `folder-${item.id}`;
                  const willBeExpanded = !isExpanded;
                  
                  setExpandedCourriers(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(key)) {
                      newSet.delete(key);
                    } else {
                      newSet.add(key);
                    }
                    return newSet;
                  });
                  
                  // Recharger les données si on ouvre la catégorie pour s'assurer d'avoir les dernières données
                  if (willBeExpanded) {
                    loadDossiersFichiers(courrierId);
                  }
                }}
              >
                <FontAwesomeIcon icon={isExpanded ? faFolderOpen : faFolder} className="text-yellow-600 text-base" />
                <span className="text-gray-700 font-medium">{item.nom}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {copiedItems.length > 0 && (
                <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePasteItems(item.id, courrierId);
                    }}
                    className="text-green-600 hover:text-green-700"
                    title="Coller ici"
                  >
                    <FontAwesomeIcon icon={faPaste} className="text-xs" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openAddFileModal(courrierId, item.id);
                  }}
                  className="text-blue-600 hover:text-blue-700"
                  title="Ajouter un fichier"
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDossierModal(courrierId, item.id, item.nom);
                  }}
                  className="text-blue-600 hover:text-blue-700"
                  title="Créer un sous-dossier"
                >
                  <FontAwesomeIcon icon={faFolder} className="text-xs" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDossier(item.id, item.nom, courrierId);
                  }}
                  className="text-red-600 hover:text-red-700"
                  title="Supprimer le dossier"
                >
                  <FontAwesomeIcon icon={faTrash} className="text-xs" />
                </button>
              </div>
            </div>
            ) : (
              <div 
                className={`flex items-center gap-2 text-sm hover:bg-gray-50 p-1 rounded group ${
                  isSelected ? 'bg-blue-50 border border-blue-300' : ''
                }`}
                style={{ paddingLeft: `${currentLevel * 24}px` }}
                draggable
                onDragStart={(e) => handleItemDragStart(item, e)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => handleSelectItem(item.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div 
                  className="flex items-center gap-2 flex-1 cursor-pointer"
                onClick={() => openViewFileModal(item)}
              >
                <FontAwesomeIcon 
                  icon={getFileIcon(item.extension)} 
                  className={`text-base ${getFileIconColor(item.extension)}`}
                />
                <span className="text-gray-600">{item.nom}</span>
                {item.extension && (
                  <span className="text-xs text-gray-400">.{item.extension}</span>
                )}
                {/* Afficher la catégorie parente si le fichier a un parentId */}
                {item.parentId && (() => {
                  const parent = allItems.find(i => i.id === item.parentId && i.type === 'categorie');
                  if (parent) {
                    return (
                      <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        dans {parent.nom}
                      </span>
                    );
                  }
                  return null;
                })()}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openViewFileModal(item);
                    }}
                    className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                    title="Visualiser/Éditer"
                  >
                    <FontAwesomeIcon icon={faEye} className="text-xs" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(item.id, courrierId);
                    }}
                    className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                    title="Supprimer"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-xs" />
                  </button>
                </div>
              </div>
            )}
          {isExpanded && itemChildren.length > 0 && (
            <div className="ml-4 border-l-2 border-gray-200 pl-2">
              {itemChildren.map(child => renderItem(child, currentLevel + 1))}
            </div>
          )}
          {isExpanded && itemChildren.length === 0 && (
            <div className="ml-4 border-l-2 border-gray-200 pl-2">
              <div className="text-xs text-gray-400 italic py-2 px-4">
                Catégorie vide
              </div>
            </div>
          )}
        </div>
      );
    };
    
    // Rendre tous les éléments racine
    return rootItems.map(item => renderItem(item, level));
  };

  const renderCourrierRow = (courrier: Courrier, index: number, level: number = 0): React.ReactNode => (
    <React.Fragment key={courrier.id}>
      <tr 
        className={`group transition-all duration-200 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent even:bg-surface-50/40 cursor-pointer ${
          selectedCourriers.has(courrier.id) 
            ? 'bg-blue-50/70 border-l-4 border-l-blue-500' 
            : 'border-l-4 border-l-transparent'
        } ${draggedCourrierId === courrier.id ? 'opacity-70' : ''}`}
        style={{ animationDelay: `${index * 30}ms` }}
        draggable={folderViewMode === 'arborescence'}
        onDragStart={(e) => {
          if (folderViewMode !== 'arborescence') return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', courrier.id);
          setDraggedCourrierId(courrier.id);
        }}
        onDragEnd={() => {
          setDraggedCourrierId(null);
          setDraggedOverFolderId(null);
        }}
        onClick={() => {
          setSelectedCourrierForResume(courrier);
          setShowResumeModal(true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            courrier
          });
        }}
      >
      <td className="px-4 py-4 whitespace-nowrap">
        {/* Checkbox déplacée à droite dans Actions */}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center gap-3"
            style={folderViewMode === 'arborescence' ? { paddingLeft: `${level * 18}px` } : undefined}
          >
            <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center">
              {(() => {
                const mainFile = getMainFile(courrier);
                if (mainFile) {
                  const extension = mainFile.split('.').pop()?.toLowerCase();
                  return (
                    <FontAwesomeIcon 
                      icon={getFileIcon(extension, mainFile)} 
                      className={`text-lg ${getFileIconColor(extension, mainFile)}`}
                      title={`Document: ${mainFile}`}
                    />
                  );
                }
                return (
                  <FontAwesomeIcon 
                    icon={faPaperclip}
                    className="text-surface-300 text-lg"
                    title="Aucun document attaché"
                  />
                );
              })()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-surface-900">{courrier.numero}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(courrier.id);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-all"
                  title={expandedCourriers.has(courrier.id) ? "Masquer les fichiers" : "Visualiser les fichiers"}
                >
                  <FontAwesomeIcon 
                    icon={expandedCourriers.has(courrier.id) ? faFolderOpen : faFolder} 
                    className="text-xs"
                  />
                  <span>{expandedCourriers.has(courrier.id) ? "Masquer" : "Visualiser"}</span>
                  {(() => {
                    // Priorité 1: filesCounts (chargé en arrière-plan au démarrage - le plus rapide)
                    const count = filesCounts.get(courrier.id);
                    if (count && (count.nbFichiers > 0 || count.nbCategories > 0)) {
                      const total = count.nbFichiers + count.nbCategories;
                      return (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">
                          {total}
                        </span>
                      );
                    }
                    // Priorité 2: dossiersFichiers (si déjà chargé via Visualiser)
                    const df = dossiersFichiers.get(courrier.id);
                    if (df && df.length > 0) {
                      const total = df.length;
                      return (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">
                          {total}
                        </span>
                      );
                    }
                    // Priorité 3: courrier.categorieFichiers (données initiales du courrier)
                    if (courrier.categorieFichiers && courrier.categorieFichiers.length > 0) {
                      return (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">
                          {courrier.categorieFichiers.length}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </button>
              </div>
              {/* Objet du courrier */}
              <p className="mt-1 text-sm text-surface-700 line-clamp-2" title={getCourrierObjet(courrier)}>
                {getCourrierObjet(courrier)}
              </p>
              {/* Date de réception sous l'objet (champ dynamique si présent, sinon core) */}
              {(() => {
                let dateStr = '—';
                let timeStr = '';
                let dr: any = getDynamicReceptionDateValue(courrier);
                // Fallback core si pas de champ dynamique
                if (!dr) {
                  dr = (courrier as any).dateReception;
                }
                if (typeof dr === 'string') {
                  // Essayer de capturer aussi l'heure si présente
                  const match = dr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
                  if (match) {
                    // Formater sans décalage de fuseau (JJ/MM/AAAA) + heure si fournie
                    dateStr = `${match[3]}/${match[2]}/${match[1]}`;
                    if (match[4] && match[5]) {
                      timeStr = `${match[4]}:${match[5]}`;
                    }
                  } else {
                    try {
                      const d = new Date(dr);
                      if (!isNaN(d.getTime())) {
                        dateStr = d.toLocaleDateString('fr-FR');
                        timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                      }
                    } catch {}
                  }
                } else if (dr instanceof Date) {
                  if (!isNaN(dr.getTime())) {
                    dateStr = dr.toLocaleDateString('fr-FR');
                    timeStr = dr.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  }
                }
                if (dateStr !== '—' && !timeStr) {
                  // Si on n'a pas d'heure explicite, afficher 00:00 par défaut
                  timeStr = '00:00';
                }
                const dateTitle = dateStr === '—'
                  ? 'Date de réception indisponible'
                  : `Date de réception: ${dateStr} à ${timeStr}`;
                return (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                      title={dateTitle}
                    >
                      <FontAwesomeIcon icon={faCalendar} className="w-3 h-3 text-slate-400" />
                      {dateStr}
                    </span>
                    {dateStr !== '—' && (
                      <span
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                        title={`Heure de réception: ${timeStr}`}
                      >
                        <FontAwesomeIcon icon={faClock} className="w-3 h-3 text-slate-400" />
                        {timeStr}
                      </span>
                    )}
                  </div>
                );
              })()}
              <div className="mt-2 flex flex-wrap items-center gap-2 min-w-0">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg uppercase tracking-wide shadow-sm border max-w-[160px] ${getStatutColor(courrier.statut)}`}
                  title={`Statut: ${getStatutLabel(courrier.statut)}`}
                >
                  <FontAwesomeIcon icon={faInfoCircle} className="w-3.5 h-3.5" />
                  <span className="truncate">{getStatutLabel(courrier.statut)}</span>
                </span>
                {(() => {
                  const dynamicPriority = getDynamicPriorityValue(courrier);
                  const mapped = mapToPriorite(dynamicPriority);
                  const label = dynamicPriority !== undefined && dynamicPriority !== null && `${dynamicPriority}`.trim() !== ''
                    ? getPrioriteLabel(mapToPriorite(dynamicPriority) || courrier.priorite)
                    : getPrioriteLabel(courrier.priorite);
                  // Fallback couleur sur la priorité core si le mapping dynamique échoue
                  const fallbackMapped = mapToPriorite(courrier.priorite);
                  const colorClass = mapped
                    ? getPrioriteColor(mapped)
                    : (fallbackMapped ? getPrioriteColor(fallbackMapped) : getPrioriteColor(courrier.priorite));
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg uppercase tracking-wide shadow-sm border max-w-[160px] ${colorClass}`}
                      title={`Priorité: ${label}`}
                    >
                      <FontAwesomeIcon icon={faExclamationTriangle} className="w-3.5 h-3.5" />
                      <span className="truncate">{label}</span>
                    </span>
                  );
                })()}
                {courrier.sens && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg uppercase tracking-wide shadow-sm border max-w-[160px] ${
                      courrier.sens === SensCourrier.ENTRANT
                        ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-indigo-700 border-indigo-200'
                        : 'bg-gradient-to-r from-purple-100 to-violet-100 text-violet-700 border-violet-200'
                    }`}
                    title={`Sens: ${getSensLabel(courrier.sens)}`}
                  >
                    <FontAwesomeIcon icon={courrier.sens === SensCourrier.ENTRANT ? faArrowDown : faArrowUp} className="w-3.5 h-3.5" />
                    <span className="truncate">{getSensLabel(courrier.sens)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </td>
      {/* Expéditeur / Destinataire */}
      <td className="px-6 py-4">
        <div className="max-w-[280px] space-y-2" title={`Expéditeur: ${courrier.expediteur || '—'} — Destinataire: ${courrier.destinataire || '—'}`}>
          <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-100">
            <div className="flex-shrink-0 w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center">
              <FontAwesomeIcon icon={faUser} className="w-3 h-3 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Expéditeur</div>
              <div className="text-xs font-medium text-slate-700 truncate">{courrier.expediteur || '—'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-1.5 border border-purple-100">
            <div className="flex-shrink-0 w-6 h-6 rounded-md bg-purple-500 flex items-center justify-center">
              <FontAwesomeIcon icon={faUserCheck} className="w-3 h-3 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide">Destinataire</div>
              <div className="text-xs font-medium text-slate-700 truncate">{courrier.destinataire || '—'}</div>
            </div>
          </div>
        </div>
      </td>
      {/* Colonne actions - clics ne doivent pas ouvrir le modal résumé */}
      <td className="px-4 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              key={`${courrier.id}-${selectedCourriers.has(courrier.id)}`}
              checked={selectedCourriers.has(courrier.id)}
              onChange={(e) => handleSelectCourrier(courrier.id, e)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 text-blue-600 border-2 border-surface-300 rounded focus:ring-blue-500 focus:ring-offset-0 transition-colors cursor-pointer"
              aria-label={`Sélectionner le courrier ${courrier.numero}`}
            />
          </div>
          <button
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              setContextMenu({
                open: true,
                x: rect.left + rect.width,
                y: rect.top + rect.height,
                courrier
              });
            }}
            aria-label="Menu actions"
            title="Actions"
          >
            <FontAwesomeIcon icon={faEllipsisV} className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
    {expandedCourriers.has(courrier.id) && (
      <tr>
        <td colSpan={4} className="px-6 py-4 bg-gray-50">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 flex-wrap gap-2">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-semibold text-gray-800">Documents et dossiers</span>
                {(() => {
                  // Priorité 1: dossiersFichiers (si déjà chargé avec détail)
                  const df = dossiersFichiers.get(courrier.id);
                  if (df && df.length > 0) {
                    const nbCategories = df.filter(item => item.type === 'categorie').length;
                    const nbFichiers = df.filter(item => item.type === 'fichier').length;
                    return (
                      <span className="text-xs text-gray-500">
                        {nbCategories > 0 && (
                          <span className="inline-flex items-center gap-1 mr-2">
                            <FontAwesomeIcon icon={faFolder} className="text-yellow-500" />
                            {nbCategories} catégorie{nbCategories > 1 ? 's' : ''}
                          </span>
                        )}
                        {nbFichiers > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <FontAwesomeIcon icon={faFile} className="text-blue-500" />
                            {nbFichiers} fichier{nbFichiers > 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                    );
                  }
                  // Priorité 2: filesCounts (chargé au démarrage - sans détail mais rapide)
                  const count = filesCounts.get(courrier.id);
                  if (count && (count.nbFichiers > 0 || count.nbCategories > 0)) {
                    return (
                      <span className="text-xs text-gray-500">
                        {count.nbCategories > 0 && (
                          <span className="inline-flex items-center gap-1 mr-2">
                            <FontAwesomeIcon icon={faFolder} className="text-yellow-500" />
                            {count.nbCategories} catégorie{count.nbCategories > 1 ? 's' : ''}
                          </span>
                        )}
                        {count.nbFichiers > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <FontAwesomeIcon icon={faFile} className="text-blue-500" />
                            {count.nbFichiers} fichier{count.nbFichiers > 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                    );
                  }
                  // Si aucune donnée
                  return <span className="text-gray-400">Aucun document</span>;
                })()}
                {(() => {
                  const n = getSelectedCountForCourrier(courrier.id);
                  return n > 0 ? (
                    <span className="text-xs text-blue-600 font-medium">
                      {n} élément{n > 1 ? 's' : ''} sélectionné{n > 1 ? 's' : ''}
                    </span>
                  ) : null;
                })()}
                {copiedItems.length > 0 && (
                  <span className="text-xs text-green-600 font-medium">
                    {copiedItems.length} élément{copiedItems.length > 1 ? 's' : ''} copié{copiedItems.length > 1 ? 's' : ''} — Cliquez sur « Coller » dans une catégorie
                  </span>
                )}
                {(() => {
                  const df = dossiersFichiers.get(courrier.id) || [];
                  const n = getSelectedCountForCourrier(courrier.id);
                  if (df.length === 0) return null;
                  const allSelected = n === df.length;
                  return (
                    <button
                      type="button"
                      onClick={() => handleSelectAllItemsForCourrier(courrier.id, !allSelected)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {allSelected ? 'Tout désélectionner' : `Tout sélectionner (${df.length})`}
                    </button>
                  );
                })()}
              </div>
              <div className="flex gap-2 flex-wrap">
                {getSelectedCountForCourrier(courrier.id) > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCopyItems(courrier.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                    >
                      <FontAwesomeIcon icon={faCopy} />
                      Copier ({getSelectedCountForCourrier(courrier.id)})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSelectedItems(courrier.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                      Supprimer ({getSelectedCountForCourrier(courrier.id)})
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => openAddFileModal(courrier.id)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Ajouter des fichiers
                </button>
                <button
                  type="button"
                  onClick={() => openScanModalForCourrier(courrier.id)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
                  title="Scanner un document et l’ajouter à ce courrier"
                >
                  <FontAwesomeIcon icon={faPrint} />
                  Scanner
                </button>
                <button
                  type="button"
                  onClick={() => openDossierModal(courrier.id)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <FontAwesomeIcon icon={faFolder} />
                  Nouveau dossier
                </button>
              </div>
            </div>
            {(() => {
              const df = dossiersFichiers.get(courrier.id) || [];
              const isDraggedOver = draggedOverCourrier === courrier.id;
              const isLoadingFichiers = loadingFichiersCourrierId === courrier.id;
              
              // Récupérer les accusés de réception depuis localStorage (pour courriers sortants uniquement)
              const isSortant = getCourrierSens(courrier) === SensCourrier.SORTANT;
              const accuseStorageKey = `accuses_reception_${courrier.id}`;
              const storedAccuses = isSortant ? JSON.parse(localStorage.getItem(accuseStorageKey) || '[]') : [];
              
              return (
                <div
                  className={`min-h-[200px] p-4 rounded-lg border-2 border-dashed transition-colors ${
                    isDraggedOver 
                      ? 'bg-blue-100 border-blue-400' 
                      : 'bg-white border-gray-300'
                  }`}
                  onDrop={(e) => handleFileDrop(e, courrier.id)}
                  onDragOver={(e) => handleDragOver(e, undefined, courrier.id)}
                  onDragLeave={handleDragLeave}
                >
                  {isLoadingFichiers && (
                    <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xl" />
                      <span>Chargement des fichiers…</span>
                    </div>
                  )}
                  {!isLoadingFichiers && (
                  <>
                  {/* Section Accusés de réception (courriers sortants uniquement) */}
                  {isSortant && storedAccuses.length > 0 && (
                    <div className="mb-4 pb-4 border-b-2 border-green-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon icon={faClipboardCheck} className="text-green-600" />
                          <h4 className="text-sm font-bold text-green-700">Accusés de réception ({storedAccuses.length})</h4>
                          <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">localStorage</span>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`Supprimer tous les accusés de réception (${storedAccuses.length}) ?`)) {
                              localStorage.removeItem(accuseStorageKey);
                              // Forcer le re-render
                              setDossiersFichiers(prev => new Map(prev));
                            }
                          }}
                          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-all"
                          title="Supprimer tous les accusés de réception"
                        >
                          <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {storedAccuses.map((accuse: { name: string; data: string; type: string; size: number; date: string }, index: number) => (
                          <div
                            key={index}
                            className="relative group bg-white rounded-lg border-2 border-green-200 overflow-hidden hover:border-green-400 transition-all"
                          >
                            <div
                              className="cursor-pointer"
                              onClick={() => {
                                // Ouvrir l'image dans une nouvelle fenêtre
                                const newWindow = window.open();
                                if (newWindow) {
                                  newWindow.document.write(`<img src="${accuse.data}" style="max-width:100%; height:auto;" />`);
                                }
                              }}
                            >
                              <img
                                src={accuse.data}
                                alt={accuse.name}
                                className="w-full h-32 object-cover"
                              />
                              <div className="p-2">
                                <p className="text-xs font-medium text-gray-900 truncate" title={accuse.name}>
                                  {accuse.name}
                                </p>
                                <p className="text-xs text-gray-500">{(accuse.size / 1024).toFixed(2)} KB</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (confirm(`Supprimer "${accuse.name}" ?`)) {
                                  const updated = storedAccuses.filter((_: any, i: number) => i !== index);
                                  localStorage.setItem(accuseStorageKey, JSON.stringify(updated));
                                  // Forcer le re-render
                                  setDossiersFichiers(prev => new Map(prev));
                                }
                              }}
                              className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                              title="Supprimer"
                            >
                              <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {df.length === 0 && storedAccuses.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-sm text-gray-500 italic mb-4">
                        Glissez-déposez des fichiers ici ou créez une catégorie
                      </div>
                      {laravelApiService.isConfigured() && (
                        <p className="text-xs text-gray-400 mb-3">
                          Les fichiers importés sont enregistrés sur le serveur Laravel. Si vous venez d’en ajouter, cliquez sur « Réessayer le chargement » pour les afficher.
                        </p>
                      )}
                      <div className="flex gap-2 justify-center flex-wrap">
                        <button
                          type="button"
                          onClick={() => openAddFileModal(courrier.id)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <FontAwesomeIcon icon={faPlus} />
                          Ajouter des fichiers
                        </button>
                        <button
                          type="button"
                          onClick={() => openScanModalForCourrier(courrier.id)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                          title="Scanner un document et l’ajouter à ce courrier"
                        >
                          <FontAwesomeIcon icon={faPrint} />
                          Scanner
                        </button>
                        <button
                          onClick={() => openDossierModal(courrier.id)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <FontAwesomeIcon icon={faFolder} />
                          Créer un dossier
                        </button>
                        {laravelApiService.isConfigured() && (
                          <button
                            type="button"
                            onClick={() => loadDossiersFichiers(courrier.id)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                          >
                            <FontAwesomeIcon icon={faSync} />
                            Réessayer le chargement
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    df.length > 0 && (
                      <div className="space-y-1">
                        {renderTree(df, 0, courrier.id)}
                      </div>
                    )
                  )}
                  </>
                  )}
                </div>
              );
            })()}
          </div>
        </td>
      </tr>
    )}
  </React.Fragment>
  );

  // Compter les courriers dans une catégorie et ses sous-catégories — calculé une seule fois via useMemo
  const totalCourriersPerFolder = useMemo(() => {
    const totals = new Map<string, number>();
    const countFolder = (folderId: string): number => {
      if (totals.has(folderId)) return totals.get(folderId)!;
      const direct = (courriersByFolder.get(folderId) || []).length;
      const children = foldersByParent.get(folderId) || [];
      const childTotal = children.reduce((sum, child) => sum + countFolder(String(child.id)), 0);
      const total = direct + childTotal;
      totals.set(folderId, total);
      return total;
    };
    courrierFolders.forEach(f => countFolder(String(f.id)));
    return totals;
  }, [courriersByFolder, foldersByParent, courrierFolders]);

  const getTotalCourriersInFolder = (folderId: string): number =>
    totalCourriersPerFolder.get(folderId) ?? 0;

  const renderFolderRows = (parentId: string | null, level: number = 0): React.ReactNode => {
    const parentKey = parentId != null ? String(parentId) : null;
    const folders = foldersByParent.get(parentKey) || [];
    
    // En mode arborescence, limiter le nombre de dossiers racines affichés
    let foldersToRender = folders;
    if (folderViewMode === 'arborescence' && parentId === null && folders.length > rootVisibleLimit) {
      foldersToRender = folders.slice(0, rootVisibleLimit);
    }
    
    return foldersToRender.map(folder => {
      const folderKey = folder.id != null ? String(folder.id) : '';
      const isExpanded = expandedFolderIds.has(folderKey);
      const folderCourriers = courriersByFolder.get(folderKey) || [];
      const totalCourriers = getTotalCourriersInFolder(folderKey);
      const isDraggedOver = draggedOverFolderId === folder.id;

      return (
        <React.Fragment key={folder.id}>
          <tr className="bg-gradient-to-r from-amber-50/30 via-yellow-50/20 to-amber-50/30 hover:from-amber-50/50 hover:via-yellow-50/40 hover:to-amber-50/50 transition-all duration-200">
            <td colSpan={4} className="px-6 py-2">
              <div
                className={`flex items-center justify-between rounded-xl border-2 transition-all duration-300 shadow-sm hover:shadow-md ${
                  isDraggedOver 
                    ? 'bg-gradient-to-r from-blue-100 to-cyan-100 border-blue-400 shadow-lg shadow-blue-500/20 scale-[1.01]' 
                    : 'bg-white border-amber-200/60 hover:border-amber-300'
                }`}
                style={{ paddingLeft: `${level * 18}px` }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedCourrierId) setDraggedOverFolderId(folder.id);
                }}
                onDragLeave={() => setDraggedOverFolderId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedCourrierId) {
                    assignCourrierToFolder(draggedCourrierId, folder.id);
                    setDraggedCourrierId(null);
                    setDraggedOverFolderId(null);
                    setExpandedFolderIds(prev => new Set(prev).add(folderKey));
                    showAlert('Courrier déplacé dans la catégorie', 'success');
                  }
                }}
              >
                <div className="flex items-center gap-3 px-4 py-3 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedFolderIds.has(folder.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectFolder(folder.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-amber-600 border-2 border-amber-300 rounded focus:ring-2 focus:ring-amber-500/30 transition-all cursor-pointer hover:border-amber-400"
                  />
                  <button
                    onClick={() => toggleFolderExpand(folder.id)}
                    className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800 flex items-center justify-center transition-all duration-200 hover:scale-110"
                    title={isExpanded ? 'Réduire' : 'Développer'}
                  >
                    <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRightIcon} className="text-xs" />
                  </button>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-md shadow-amber-500/30">
                    <FontAwesomeIcon icon={isExpanded ? faFolderOpen : faFolder} className="text-white text-sm" />
                  </div>
                  {folderInlineEditId === folder.id ? (
                    <input
                      value={folderInlineEditName}
                      onChange={(e) => setFolderInlineEditName(e.target.value)}
                      onBlur={commitInlineRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelInlineRename();
                        }
                      }}
                      className="text-sm font-bold text-slate-800 bg-white border-2 border-blue-400 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="text-sm font-bold text-slate-800 cursor-text hover:text-amber-700 transition-colors"
                      onDoubleClick={() => startInlineRenameFolder(folder)}
                      title="Double-cliquez pour renommer"
                    >
                      {folder.name}
                    </span>
                  )}
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200 shadow-sm">
                    {totalCourriers} courrier{totalCourriers > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-4">
                  <button
                    onClick={() => startInlineAddSubfolder(folder.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 hover:border-amber-300 transition-all duration-200 hover:shadow-sm"
                    title="Créer un sous-dossier"
                  >
                    <FontAwesomeIcon icon={faFolder} className="text-xs" />
                    <span className="hidden sm:inline">Sous-dossier</span>
                  </button>
                  <button
                    onClick={() => startInlineRenameFolder(folder)}
                    className="w-8 h-8 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-all duration-200"
                    title="Renommer"
                  >
                    <FontAwesomeIcon icon={faEdit} className="text-xs" />
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="text-red-500 hover:text-red-600"
                    title="Supprimer"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-xs" />
                  </button>
                </div>
              </div>
            </td>
          </tr>
          {isExpanded && (
            <>
              {folderCourriers.map((courrier, index) => renderCourrierRow(courrier, index, level + 1))}
              {folderInlineAddParentId === folder.id && (
                <tr>
                  <td colSpan={4} className="px-6 py-2">
                    <div
                      className="flex items-center gap-2 bg-white border border-surface-200 rounded-lg px-3 py-2"
                      style={{ paddingLeft: `${(level + 1) * 18}px` }}
                    >
                      <FontAwesomeIcon icon={faFolder} className="text-yellow-600 text-xs" />
                      <input
                        value={folderInlineAddName}
                        onChange={(e) => setFolderInlineAddName(e.target.value)}
                        onBlur={commitInlineAddSubfolder}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitInlineAddSubfolder();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelInlineAddSubfolder();
                          }
                        }}
                        placeholder="Nom du sous-catégorie"
                        className="text-sm text-surface-700 bg-white border border-surface-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                        autoFocus
                      />
                    </div>
                  </td>
                </tr>
              )}
              {renderFolderRows(folder.id != null ? String(folder.id) : null, level + 1)}
            </>
          )}
        </React.Fragment>
      );
    });
  };

  // En arborescence : courriers non classés (sans catégorie ou catégorie introuvable) — même source qu'en mode liste
  const rootCourriers = useMemo(
    () => filteredCourriers.filter(c => {
      const key = c.id != null ? String(c.id) : '';
      const fid = courrierFolderMap[key];
      if (fid == null || fid === '') return true;
      const fidStr = String(fid);
      return !validFolderIds.has(fidStr);
    }),
    [filteredCourriers, courrierFolderMap, validFolderIds]
  );

  // Afficher le skeleton loader pendant le chargement initial
  if (loadingCourriers && courriers.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
        <CourriersSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" ref={tableRef}>
      {/* Inputs fichier toujours dans le DOM pour que .click() fonctionne (import courriers + Parcourir dans le modal expandable) */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".csv,.json,.xlsx,.xls"
        onChange={handleImportCourriersFileChange}
        className="sr-only"
        disabled={importingFolders}
        aria-label="Importer un fichier CSV, JSON ou Excel"
      />
      
      {/* Header moderne avec statistiques */}
      <div className="bg-gradient-to-r from-blue-500 via-blue-600 to-cyan-500 rounded-2xl shadow-xl p-6 mb-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faEnvelope} className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Courriers</h1>
              <p className="text-blue-100 text-sm">
                {stats.filtered !== stats.total ? (
                  <>{stats.filtered} résultat{stats.filtered > 1 ? 's' : ''} (sur {stats.total})</>
                ) : (
                  <>{stats.total} résultat{stats.total > 1 ? 's' : ''}</>
                )}
              </p>
            </div>
          </div>
          
          {/* Recherche et switch à droite */}
          <div className="flex items-center gap-3">
            {/* Barre de recherche rapide */}
            <div className="relative min-w-[200px] max-w-[280px]">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Rechercher..."
                className="w-full pl-10 pr-4 py-2.5 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/50"
              />
            </div>
            
            {/* Switch Liste/Arborescence */}
            <div className="inline-flex items-center gap-1 rounded-xl border-2 border-white/30 bg-white/20 backdrop-blur-sm p-1">
              <button
                onClick={() => setFolderViewMode('liste')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  folderViewMode === 'liste'
                    ? 'bg-white text-blue-600 shadow-lg'
                    : 'text-white hover:bg-white/20'
                }`}
                title="Affichage en liste"
              >
                <FontAwesomeIcon icon={folderViewMode === 'liste' ? faCheckCircle : faLayerGroup} className="w-3 h-3" />
                <span className="hidden sm:inline">Liste</span>
              </button>
              <button
                onClick={() => setFolderViewMode('arborescence')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                  folderViewMode === 'arborescence'
                    ? 'bg-white text-blue-600 shadow-lg'
                    : 'text-white hover:bg-white/20'
                }`}
                title="Affichage en arborescence"
              >
                <FontAwesomeIcon icon={folderViewMode === 'arborescence' ? faCheckCircle : faFolderOpen} className="w-3 h-3" />
                <span className="hidden sm:inline">Arborescence</span>
              </button>
            </div>
          </div>
        </div>

        {/* En-tête des statistiques avec sélecteur de vue */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white tracking-tight">Statistiques des courriers</h2>
          <StatsViewToggle view={statsView} onChange={setStatsView} />
        </div>

        {/* Affichage conditionnel des statistiques */}
        {statsView === 'charts' && (
          <ListeCourrierStats 
            stats={{
              total: stats.total,
              byStatut: stats.byStatut,
              byType: stats.byType,
              bySens: stats.bySens,
              byPriorite: stats.byPriorite,
              urgent: stats.urgent,
              enAttente: stats.enAttente,
              orientesDirecteurs: stats.orientesDirecteurs,
              entrants: stats.bySensType[SensCourrier.ENTRANT],
              sortants: stats.bySensType[SensCourrier.SORTANT]
            }}
          />
        )}
        
        {statsView === 'cards' && (
          <ListeCourrierStatsCards 
            stats={{
              total: stats.total,
              byStatut: stats.byStatut,
              byType: stats.byType,
              bySens: stats.bySens,
              byPriorite: stats.byPriorite,
              urgent: stats.urgent,
              enAttente: stats.enAttente,
              orientesDirecteurs: stats.orientesDirecteurs,
              entrants: stats.bySensType[SensCourrier.ENTRANT],
              sortants: stats.bySensType[SensCourrier.SORTANT]
            }}
          />
        )}
        
        {statsView === 'none' && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-6 text-center">
            <div className="inline-flex items-center gap-3 text-white/70">
              <FontAwesomeIcon icon={faEyeSlash} className="w-5 h-5" />
              <span className="font-medium">Les statistiques sont actuellement masquées</span>
            </div>
            <p className="text-white/50 text-sm mt-2">
              Utilisez le sélecteur ci-dessus pour afficher les cartes ou graphiques
            </p>
          </div>
        )}
      </div>

      {/* Affichage en haut — z-50 pour que les dropdowns passent au-dessus du bloc titre "Courriers" */}
      <div className="relative z-50 bg-white rounded-2xl shadow-lg border border-slate-200/80 p-4 sm:p-5">
        {/* Bouton Menu / Options visible uniquement sur petits écrans — ouvre le drawer Actions */}
        <div className="flex lg:hidden items-center justify-between gap-3">
          <span className="text-gray-600 font-medium truncate">Courriers</span>
          <button
            type="button"
            onClick={() => setShowActionsDrawer(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium shadow-md hover:bg-blue-700 transition-colors"
            aria-label="Ouvrir le menu des actions"
          >
            <FontAwesomeIcon icon={faBars} className="w-4 h-4" />
            <span>Menu</span>
          </button>
        </div>

        {/* Barre d'outils complète — visible uniquement sur lg et plus */}
        <div className="hidden lg:flex items-center justify-between gap-3 flex-nowrap overflow-visible min-w-0">
          {/* Zone de boutons à gauche */}
          <div className="flex items-center gap-3 flex-nowrap flex-shrink-0">
            {/* Bouton Filtres */}
            <button
              onClick={() => {
                setShowFiltersDrawer(true);
                scrollToTop();
              }}
              className={`px-4 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                hasActiveFilters
                  ? 'bg-amber-400 text-amber-900 shadow-lg'
                  : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              <FontAwesomeIcon icon={faFilter} />
              <span className="hidden sm:inline">Filtres</span>
              {hasActiveFilters && (
                <span className="w-5 h-5 rounded-full bg-amber-900 text-amber-100 text-xs flex items-center justify-center">!</span>
              )}
            </button>

            {/* Bouton Registre */}
            <Link
              to="/cahier-registre"
              className="px-4 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 whitespace-nowrap bg-green-600 text-white hover:bg-green-700 shadow-md"
            >
              <FontAwesomeIcon icon={faBook} />
              <span className="hidden sm:inline">Cahier registre</span>
            </Link>
          </div>

          {/* Autres boutons à droite */}
          <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative import-dropdown-container">
                <button
                  onClick={() => {
                    if (!isFormConfigured) {
                      showAlert('Configurez le formulaire courrier (Paramètres > Formulaire courriers) pour activer l\'import et le téléchargement du modèle.', 'warning', 'Formulaire non configuré');
                      return;
                    }
                    setShowImportDropdown(!showImportDropdown);
                  }}
                  disabled={importingFolders || !isFormConfigured}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 border border-transparent ${!isFormConfigured ? 'text-gray-400 cursor-not-allowed opacity-70' : 'text-blue-600 hover:bg-white hover:text-blue-700 hover:border-blue-200 hover:shadow-md cursor-pointer'}`}
                  title={!isFormConfigured ? 'Configurez le formulaire courrier (Paramètres > Formulaire courriers) pour activer l\'import et le modèle' : 'Importer des courriers ou télécharger un modèle'}
                >
                  <FontAwesomeIcon icon={importingFolders ? faSync : faFileImport} className={`w-3 h-3 ${importingFolders ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{importingFolders && importProgress ? importProgress.message : 'Importer / Modèle'}</span>
                  <FontAwesomeIcon icon={faChevronDown} className="w-2 h-2 ml-1" />
                </button>
                {showImportDropdown && !importingFolders && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] min-w-[220px] py-1">
                    <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Importer courriers</p>
                    <button
                      onClick={() => { triggerImport('csv'); setShowImportDropdown(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faFileAlt} className="w-3 h-3 text-gray-500" />
                      <span>CSV (UTF-8)</span>
                    </button>
                    <button
                      onClick={() => { triggerImport('json'); setShowImportDropdown(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faFileCode} className="w-3 h-3 text-gray-500" />
                      <span>JSON</span>
                    </button>
                    <button
                      onClick={() => { triggerImport('excel'); setShowImportDropdown(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faFileExcel} className="w-3 h-3 text-green-600" />
                      <span>Excel (.xlsx, .xls)</span>
                    </button>
                    <div className="border-t border-gray-200 my-1" />
                    <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Télécharger modèle</p>
                    <button
                      onClick={() => {
                        if (!isFormConfigured) return;
                        const csvContent = getCsvTemplateContent();
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'modele_import_courriers.csv';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        setShowImportDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faFileAlt} className="w-3 h-3 text-gray-500" />
                      <span>Modèle CSV (UTF-8)</span>
                    </button>
                    <button
                      onClick={() => { downloadExcelTemplate(); setShowImportDropdown(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faFileExcel} className="w-3 h-3 text-green-600" />
                      <span>Modèle Excel (.xlsx)</span>
                    </button>
                  </div>
                )}
              </div>
            {/* Dropdown Nouveau / Exporter à droite au fond */}
            <details className="relative">
              <summary className="list-none [&::-webkit-details-marker]:hidden">
                <span className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer">
                  <FontAwesomeIcon icon={faPlus} />
                  <span className="hidden sm:inline">Nouveau</span>
                  <FontAwesomeIcon icon={faChevronDown} className="text-xs opacity-80" />
                </span>
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden z-[100]">
                {(user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL) && (
                  <>
                    <Link
                      to="/enregistrer"
                      className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faEnvelope} className="text-blue-500" />
                      Nouveau courrier
                    </Link>
                    <button
                      onClick={() => openFolderModal()}
                      className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faFolder} className="text-amber-500" />
                      Nouveau dossier
                    </button>
                    <div className="border-t border-gray-200 my-1" />
                  </>
                )}
                <button
                  onClick={() => {
                    setExportSettings(exportSettingsService.getDefaultSettings());
                    setShowExportSettings(true);
                  }}
                  className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faPrint} className="text-green-500" />
                  Exporter
                </button>
              </div>
            </details>
            </div>
          </div>
        </div>

      {/* Drawer Actions (responsive) — recherche, filtres, liste/arbo, importer, modèle, nouveau */}
      {showActionsDrawer && (
        <ModalPortal>
          <div className="fixed inset-0 z-[50000]">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowActionsDrawer(false)} />
            <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-slideInRight z-[50010]">
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <FontAwesomeIcon icon={faBars} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Actions</h2>
                    <p className="text-xs text-gray-500">Recherche, filtres et actions</p>
                  </div>
                </div>
                <button onClick={() => setShowActionsDrawer(false)} className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors" aria-label="Fermer">
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Recherche */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2"><FontAwesomeIcon icon={faSearch} className="mr-2 text-gray-400" />Rechercher</label>
                  <div className="relative">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 pointer-events-none" />
                    <input
                      type="text"
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      placeholder="Rechercher..."
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Filtres — ouvre le drawer Filtres et ferme celui-ci */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Filtres</label>
                  <button
                    onClick={() => { setShowActionsDrawer(false); setShowFiltersDrawer(true); }}
                    className={`w-full px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                      hasActiveFilters ? 'bg-amber-400 text-amber-900 shadow-md' : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    <FontAwesomeIcon icon={faFilter} />
                    Filtres avancés
                    {hasActiveFilters && <span className="w-5 h-5 rounded-full bg-amber-900 text-amber-100 text-xs flex items-center justify-center">!</span>}
                  </button>
                </div>

                {/* Liste / Arborescence */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Affichage</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFolderViewMode('liste')}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        folderViewMode === 'liste' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <FontAwesomeIcon icon={folderViewMode === 'liste' ? faCheckCircle : faLayerGroup} /> Liste
                    </button>
                    <button
                      onClick={() => setFolderViewMode('arborescence')}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        folderViewMode === 'arborescence' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <FontAwesomeIcon icon={folderViewMode === 'arborescence' ? faCheckCircle : faFolderOpen} /> Arborescence
                    </button>
                  </div>
                </div>

                {/* Importer / Modèle (courriers + télécharger modèle) */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Importer / Modèle</label>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider px-1">Importer courriers</p>
                    <button onClick={() => { triggerImport('csv'); setShowActionsDrawer(false); }} disabled={importingFolders || !isFormConfigured} className={`w-full px-4 py-2.5 rounded-xl text-sm text-left border flex items-center gap-2 disabled:opacity-50 ${!isFormConfigured ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                      <FontAwesomeIcon icon={faFileAlt} className="text-gray-500" /> CSV (UTF-8)
                    </button>
                    <button onClick={() => { triggerImport('json'); setShowActionsDrawer(false); }} disabled={importingFolders || !isFormConfigured} className={`w-full px-4 py-2.5 rounded-xl text-sm text-left border flex items-center gap-2 disabled:opacity-50 ${!isFormConfigured ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                      <FontAwesomeIcon icon={faFileCode} className="text-gray-500" /> JSON
                    </button>
                    <button onClick={() => { triggerImport('excel'); setShowActionsDrawer(false); }} disabled={importingFolders || !isFormConfigured} className={`w-full px-4 py-2.5 rounded-xl text-sm text-left border flex items-center gap-2 disabled:opacity-50 ${!isFormConfigured ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                      <FontAwesomeIcon icon={faFileExcel} className="text-green-600" /> Excel (.xlsx, .xls)
                    </button>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider px-1 pt-2">Télécharger modèle</p>
                    <button
                      onClick={() => {
                        if (!isFormConfigured) {
                          showAlert('Configurez le formulaire courrier (Paramètres > Formulaire courriers) pour activer le téléchargement du modèle.', 'warning', 'Formulaire non configuré');
                          return;
                        }
                        const csvContent = getCsvTemplateContent();
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'modele_import_courriers.csv';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        setShowActionsDrawer(false);
                      }}
                      disabled={!isFormConfigured}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm text-left border flex items-center gap-2 ${!isFormConfigured ? 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                    >
                      <FontAwesomeIcon icon={faFileAlt} className="text-gray-500" /> Modèle CSV (UTF-8)
                    </button>
                    <button
                      onClick={() => { downloadExcelTemplate(); setShowActionsDrawer(false); }}
                      disabled={!isFormConfigured}
                      className={`w-full px-4 py-2.5 rounded-xl text-sm text-left border flex items-center gap-2 ${!isFormConfigured ? 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                    >
                      <FontAwesomeIcon icon={faFileExcel} className="text-green-600" /> Modèle Excel (.xlsx)
                    </button>
                  </div>
                </div>

                {/* Nouveau / Exporter */}
                <div className="pt-4 border-t border-gray-100 space-y-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nouveau & Exporter</label>
                  {(user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL) && (
                    <>
                      <Link to="/enregistrer" onClick={() => setShowActionsDrawer(false)} className="w-full px-4 py-2.5 rounded-xl text-sm bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center justify-center gap-2">
                        <FontAwesomeIcon icon={faEnvelope} /> Nouveau courrier
                      </Link>
                      <button onClick={() => { openFolderModal(); setShowActionsDrawer(false); }} className="w-full px-4 py-2.5 rounded-xl text-sm bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 flex items-center justify-center gap-2">
                        <FontAwesomeIcon icon={faFolder} /> Nouvelle catégorie
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { setExportSettings(exportSettingsService.getDefaultSettings()); setShowExportSettings(true); setShowActionsDrawer(false); }}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 flex items-center justify-center gap-2"
                  >
                    <FontAwesomeIcon icon={faPrint} /> Exporter
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Drawer Filtres (responsive) — filtres avancés */}
      {showFiltersDrawer && (
        <ModalPortal>
          <div className="fixed inset-0 z-[50000]">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
            <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-slideInRight z-[50010]">
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                    <FontAwesomeIcon icon={faFilter} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Filtres avancés</h2>
                    <p className="text-xs text-gray-500">Filtrer les courriers</p>
                  </div>
                </div>
                <button onClick={() => setShowFiltersDrawer(false)} className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors" aria-label="Fermer">
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Sens */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Sens</label>
                  <select
                    value={filters.sens}
                    onChange={(e) => setFilters({ ...filters, sens: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">Tous</option>
                    <option value={SensCourrier.ENTRANT}>Entrants</option>
                    <option value={SensCourrier.SORTANT}>Sortants</option>
                  </select>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                  <select
                    value={filters.type}
                    onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">Tous</option>
                    <option value={TypeCourrier.INTERNE}>Interne</option>
                    <option value={TypeCourrier.EXTERNE}>Externe</option>
                  </select>
                </div>

                {/* Statut */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Statut</label>
                  <select
                    value={filters.statut}
                    onChange={(e) => setFilters({ ...filters, statut: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">Tous</option>
                    <option value={StatutCourrier.ENREGISTRE}>Enregistré</option>
                    <option value={StatutCourrier.EN_ATTENTE_DG}>En attente DG</option>
                    <option value={StatutCourrier.ORIENTE_DG}>Orienté DG</option>
                    <option value={StatutCourrier.ORIENTE_DIRECTEUR}>Orienté Directeur</option>
                    <option value={StatutCourrier.EN_TRAITEMENT}>En traitement</option>
                    <option value={StatutCourrier.ASSIGNE}>Assigné</option>
                    <option value={StatutCourrier.TRAITE}>Traité</option>
                    <option value={StatutCourrier.ARCHIVE}>Archivé</option>
                  </select>
                </div>

                {/* Priorité */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Priorité</label>
                  <select
                    value={filters.priorite}
                    onChange={(e) => setFilters({ ...filters, priorite: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">Toutes</option>
                    <option value={Priorite.BASSE}>Basse</option>
                    <option value={Priorite.NORMALE}>Normale</option>
                    <option value={Priorite.HAUTE}>Haute</option>
                    <option value={Priorite.URGENTE}>Urgente</option>
                  </select>
                </div>

                {/* Direction */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Direction</label>
                  <select
                    value={filters.direction}
                    onChange={(e) => setFilters({ ...filters, direction: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">Toutes</option>
                    {entiteOrganisationnelleService.getDirectionsForFilters().map(dir => (
                      <option key={dir.id} value={dir.id}>{dir.nom}</option>
                    ))}
                  </select>
                </div>

                {/* Service */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Service</label>
                  <select
                    value={filters.service}
                    onChange={(e) => setFilters({ ...filters, service: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">Tous</option>
                    {entiteOrganisationnelleService.getAllEntities()
                      .filter(e => e.type === 'service')
                      .map(svc => (
                        <option key={svc.id} value={svc.id}>{svc.nom}</option>
                      ))}
                  </select>
                </div>

                {/* Dates */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date de début</label>
                  <input
                    type="date"
                    value={filters.dateDebut}
                    onChange={(e) => setFilters({ ...filters, dateDebut: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date de fin</label>
                  <input
                    type="date"
                    value={filters.dateFin}
                    onChange={(e) => setFilters({ ...filters, dateFin: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Filtres supplémentaires */}
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.mesAssignations}
                      onChange={(e) => setFilters({ ...filters, mesAssignations: e.target.checked })}
                      className="mr-3 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Mes assignations uniquement</span>
                  </label>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.nonClassifies}
                      onChange={(e) => setFilters({ ...filters, nonClassifies: e.target.checked })}
                      className="mr-3 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Non classés uniquement</span>
                  </label>
                </div>

                {/* Boutons d'action */}
                <div className="pt-4 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => {
                      setFilters({
                        statut: '',
                        type: '',
                        sens: '',
                        search: '',
                        priorite: '',
                        direction: '',
                        service: '',
                        sousService: '',
                        dateDebut: '',
                        dateFin: '',
                        categorie: '',
                        mesAssignations: false,
                        nonClassifies: false
                      });
                      scrollToTop();
                    }}
                    className="flex-1 px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-all"
                  >
                    Réinitialiser
                  </button>
                  <button
                    onClick={() => setShowFiltersDrawer(false)}
                    className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

        {/* Indicateurs de filtres actifs */}
        {hasActiveFilters && (
          <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <FontAwesomeIcon icon={faFilter} className="text-[10px]" />
              Filtres:
            </span>
            {filters.statut && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title={filters.statut}>{filters.statut}</span>
                <button onClick={() => setFilters({ ...filters, statut: '' })} className="hover:text-blue-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {filters.type && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title={getTypeLabel(filters.type as TypeCourrier)}>
                  {getTypeLabel(filters.type as TypeCourrier)}
                </span>
                <button onClick={() => setFilters({ ...filters, type: '' })} className="hover:text-green-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {filters.sens && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title={getSensLabel(filters.sens as SensCourrier)}>
                  {getSensLabel(filters.sens as SensCourrier)}
                </span>
                <button onClick={() => setFilters({ ...filters, sens: '' })} className="hover:text-indigo-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {filters.priorite && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title={filters.priorite}>{filters.priorite}</span>
                <button onClick={() => setFilters({ ...filters, priorite: '' })} className="hover:text-red-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {filters.direction && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title={filters.direction}>{filters.direction}</span>
                <button onClick={() => setFilters({ ...filters, direction: '' })} className="hover:text-purple-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {filters.service && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title={filters.service}>{filters.service}</span>
                <button onClick={() => setFilters({ ...filters, service: '' })} className="hover:text-teal-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {filters.sousService && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title={filters.sousService}>{filters.sousService}</span>
                <button onClick={() => setFilters({ ...filters, sousService: '' })} className="hover:text-amber-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {filters.categorie && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title={courrierFolders.find(f => f.id === filters.categorie)?.name || 'Catégorie'}>{courrierFolders.find(f => f.id === filters.categorie)?.name || 'Catégorie'}</span>
                <button onClick={() => setFilters({ ...filters, categorie: '' })} className="hover:text-orange-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {filters.mesAssignations && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-100 text-violet-700 rounded-lg text-xs font-medium max-w-[160px]">
                <span className="truncate" title="Mes tâches">Mes tâches</span>
                <button onClick={() => setFilters({ ...filters, mesAssignations: false })} className="hover:text-violet-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            {groupBy !== 'none' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-700 rounded-lg text-xs font-medium max-w-[200px]">
                <span className="truncate" title={`Organisé par: ${activeGroupLabel}`}>Organisé par: {activeGroupLabel}</span>
                <button onClick={() => setGroupBy('none')} className="hover:text-teal-900"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
              </span>
            )}
            <button
              onClick={() => {
                setFilters({ statut: '', type: '', sens: '', search: '', priorite: '', direction: '', service: '', sousService: '', dateDebut: '', dateFin: '', categorie: '', mesAssignations: false, nonClassifies: false });
                setGroupBy('none');
              }}
              className="text-xs text-gray-500 hover:text-gray-700 underline ml-2"
            >
              Effacer tout
            </button>
        </div>
          )}

      {/* Barre de contrôle de tri et d'organisation - Interface professionnelle */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Section Organiser par */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Organiser par</div>
                <div className="text-sm text-gray-700 font-medium mt-0.5">Regrouper les courriers</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {groupByOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setGroupBy(option.value as typeof groupBy)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                    groupBy === option.value
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Séparateur vertical */}
          <div className="hidden sm:block w-px h-12 bg-gray-200 mx-2" />

          {/* Section Trier par */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <FontAwesomeIcon icon={faSortAmountDown} className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trier par</div>
                <div className="text-sm text-gray-700 font-medium mt-0.5">Ordonner les résultats</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Sélecteur de champ de tri */}
              <div className="relative flex-1 min-w-[180px]">
                <select
                  value={sortBy}
                  onChange={(e) => handleSort(e.target.value as typeof sortBy)}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none pr-10"
                >
                  <option value="dateEnregistrement">Date d'enregistrement</option>
                  <option value="dateReception">Date de réception</option>
                  <option value="numero">Numéro</option>
                  <option value="objet">Objet</option>
                  <option value="expediteur">Expéditeur</option>
                  <option value="priorite">Priorité</option>
                  <option value="statut">Statut</option>
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <FontAwesomeIcon icon={faChevronDown} className="text-gray-400 w-3 h-3" />
                </div>
              </div>

              {/* Boutons d'ordre de tri */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => setSortOrder('desc')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    sortOrder === 'desc'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Tri décroissant"
                >
                  <FontAwesomeIcon icon={faSortDown} />
                  <span className="hidden sm:inline">Décroissant</span>
                </button>
                <button
                  onClick={() => setSortOrder('asc')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    sortOrder === 'asc'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Tri croissant"
                >
                  <FontAwesomeIcon icon={faSortUp} />
                  <span className="hidden sm:inline">Croissant</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Indicateur d'état actuel */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500 w-4 h-4" />
            <span>
              Affichage <span className="font-semibold text-gray-800">{groupByOptions.find(o => o.value === groupBy)?.label || 'Non groupé'}</span> • 
              Tri par <span className="font-semibold text-gray-800">{sortBy === 'dateEnregistrement' ? 'Date d\'enregistrement' : 
                sortBy === 'dateReception' ? 'Date de réception' : 
                sortBy === 'numero' ? 'Numéro' : 
                sortBy === 'objet' ? 'Objet' : 
                sortBy === 'expediteur' ? 'Expéditeur' : 
                sortBy === 'priorite' ? 'Priorité' : 'Statut'}</span> • 
              Ordre <span className="font-semibold text-gray-800">{sortOrder === 'desc' ? 'décroissant' : 'croissant'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Drawer des filtres */}
      {showFiltersDrawer && (
        <ModalPortal>
          <div className="fixed inset-0 z-[50000]">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
            <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-slideInRight z-[50010]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <FontAwesomeIcon icon={faFilter} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Filtres avancés</h2>
                  <p className="text-xs text-gray-500">Affinez votre recherche</p>
                </div>
              </div>
              <button onClick={() => setShowFiltersDrawer(false)} className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2"><FontAwesomeIcon icon={faSearch} className="mr-2 text-gray-400" />Recherche</label>
                <input type="text" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Numéro, objet, expéditeur..." className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Statut</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(StatutCourrier).map(statut => (
                    <button key={statut} onClick={() => setFilters({ ...filters, statut: filters.statut === statut ? '' : statut })} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${filters.statut === statut ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      {statut === 'ENREGISTRE' ? 'Enregistré' :
                       statut === 'EN_ATTENTE_DG' ? 'En attente DG' :
                       statut === 'ORIENTE_DG' ? 'Orienté DG' :
                       statut === 'ORIENTE_DIRECTEUR' ? 'Orienté Directeur' :
                       statut === 'EN_TRAITEMENT' ? 'En traitement' :
                       statut === 'ASSIGNE' ? 'Assigné' :
                       statut === 'TRAITE' ? 'Traité' :
                       statut === 'ARCHIVE' ? 'Archivé' : statut}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sens</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setFilters({ ...filters, sens: filters.sens === SensCourrier.ENTRANT ? '' : SensCourrier.ENTRANT })} className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${filters.sens === SensCourrier.ENTRANT ? 'bg-indigo-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    Entrant
                  </button>
                  <button onClick={() => setFilters({ ...filters, sens: filters.sens === SensCourrier.SORTANT ? '' : SensCourrier.SORTANT })} className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${filters.sens === SensCourrier.SORTANT ? 'bg-indigo-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    Sortant
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setFilters({ ...filters, type: filters.type === TypeCourrier.EXTERNE ? '' : TypeCourrier.EXTERNE })} className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${filters.type === TypeCourrier.EXTERNE ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    <FontAwesomeIcon icon={faEnvelope} /> Externe
                  </button>
                  <button onClick={() => setFilters({ ...filters, type: filters.type === TypeCourrier.INTERNE ? '' : TypeCourrier.INTERNE })} className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${filters.type === TypeCourrier.INTERNE ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    <FontAwesomeIcon icon={faEnvelopeOpen} /> Interne
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Priorité</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(Priorite).map(priorite => (
                    <button key={priorite} onClick={() => setFilters({ ...filters, priorite: filters.priorite === priorite ? '' : priorite })} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${filters.priorite === priorite ? (priorite === Priorite.URGENTE ? 'bg-red-500 text-white' : priorite === Priorite.HAUTE ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white') : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      {priorite}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2"><FontAwesomeIcon icon={faFolder} className="mr-2 text-gray-400" />Catégorie</label>
                <select
                  value={filters.categorie}
                  onChange={(e) => setFilters({ ...filters, categorie: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value="">Toutes les catégories</option>
                  {courrierFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              {(checkPermission(Permission.FILTRER_PAR_DIRECTION) || checkPermission(Permission.FILTRER_PAR_SERVICE) || checkPermission(Permission.FILTRER_PAR_SOUS_SERVICE)) && filterLevels.length > 0 && (
              filterLevels.map((level, i) => {
                const parentId = i === 0 ? null : (filterSelectionIds[i - 1] ?? null);
                const options = i === 0
                  ? entiteOrganisationnelleService.getDirectionsForFilters()
                  : parentId
                    ? entiteOrganisationnelleService.getEntitiesByParent(parentId).filter(e => e.type === level.code).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                    : [];
                const selectedId = filterSelectionIds[i] ?? null;
                const selectedNom = selectedId ? entiteOrganisationnelleService.getEntityById(selectedId)?.nom ?? '' : '';
                const icon = level.code === 'direction' ? faBuilding : level.code === 'division' ? faLayerGroup : level.code === 'service' ? faUsers : faFolder;
                return (
                  <div key={level.code}>
                    <label className="block text-sm font-semibold text-gray-700 mb-2"><FontAwesomeIcon icon={icon} className="mr-2 text-gray-400" />{level.libelleSingulier}</label>
                    <SearchableSelect
                      options={options.map(e => ({ value: e.nom, label: e.nom }))}
                      value={selectedNom}
                      onChange={(nom) => {
                        const entity = options.find(e => e.nom === nom);
                        const id = entity?.id ?? null;
                        setFilterSelectionIds(prev => {
                          const next = [...prev];
                          while (next.length <= i) next.push(null);
                          next[i] = id;
                          for (let j = i + 1; j < next.length; j++) next[j] = null;
                          return next;
                        });
                      }}
                      emptyOption={`Tous les ${level.libellePluriel.toLowerCase()}`}
                      searchPlaceholder={`Rechercher un(e) ${level.libelleSingulier.toLowerCase()}...`}
                    />
                  </div>
                );
              })
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2"><FontAwesomeIcon icon={faCalendar} className="mr-2 text-gray-400" />Période</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Du</label>
                    <input type="date" value={filters.dateDebut} onChange={(e) => setFilters({ ...filters, dateDebut: e.target.value })} className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Au</label>
                    <input type="date" value={filters.dateFin} onChange={(e) => setFilters({ ...filters, dateFin: e.target.value })} className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Affichage</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => setFolderViewMode('liste')}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${folderViewMode === 'liste' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    Liste
                  </button>
                  <button
                    onClick={() => setFolderViewMode('arborescence')}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${folderViewMode === 'arborescence' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    Arborescence
                  </button>
                </div>
                <button
                  onClick={() => openFolderModal()}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-100 text-surface-700 border border-surface-200 hover:bg-surface-200 transition-all flex items-center justify-center gap-2"
                >
                  <FontAwesomeIcon icon={faFolder} />
                  Nouveau dossier
                </button>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Organiser par</label>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all mb-3">
                  {groupByOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Trier par</label>
                <select value={sortBy} onChange={(e) => handleSort(e.target.value as typeof sortBy)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all mb-3">
                  <option value="dateEnregistrement">Date d'enregistrement</option>
                  <option value="dateReception">Date de réception</option>
                  <option value="numero">Numéro</option>
                  <option value="objet">Objet</option>
                  <option value="expediteur">Expéditeur</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setSortOrder('desc')} className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${sortOrder === 'desc' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    <FontAwesomeIcon icon={faSortDown} /> Décroissant
                  </button>
                  <button onClick={() => setSortOrder('asc')} className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${sortOrder === 'asc' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    <FontAwesomeIcon icon={faSortUp} /> Croissant
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => {
                  setFilters({ statut: '', type: '', sens: '', search: '', priorite: '', direction: '', service: '', sousService: '', dateDebut: '', dateFin: '', categorie: '', mesAssignations: false, nonClassifies: false });
                  setFilterSelectionIds([]);
                  setGroupBy('none');
                }}
                className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
              >
                Réinitialiser
              </button>
              <button onClick={() => setShowFiltersDrawer(false)} className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-blue-700 transition-all">
                Appliquer
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      

      {/* Tableau liste des courriers — présentation améliorée */}
      <div ref={courrierListRef} className="bg-white rounded-2xl shadow-xl shadow-slate-200/40 border border-slate-200/80 overflow-hidden">
        {folderViewMode === 'liste' && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200/80">
            <span className="text-sm text-slate-600">
              <strong className="text-slate-800">Affichage en liste</strong> — Les catégories ne sont pas visibles. Passez en <strong>Arborescence</strong> pour afficher les catégories et classer vos courriers.
            </span>
            <button
              type="button"
              onClick={() => setFolderViewMode('arborescence')}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-all shadow-sm hover:shadow"
            >
              <FontAwesomeIcon icon={faFolderOpen} className="w-4 h-4" />
              Afficher les catégories
            </button>
          </div>
        )}
        {(user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN) && selectedCourriers.size === 0 && (
          <div className="mx-4 mt-4 mb-3 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50 border-2 border-amber-200/60 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="px-5 py-4 flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <FontAwesomeIcon icon={faArrowRight} className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-bold text-amber-900 mb-2 flex items-center gap-2">
                  <span>Guide d'orientation des courriers</span>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-semibold rounded-full">Info</span>
                </h4>
                <div className="space-y-2 text-sm text-amber-800">
                  <p className="leading-relaxed">
                    <strong className="text-amber-900">📋 Méthode 1 :</strong> Cochez un ou plusieurs courriers pour afficher les boutons d'orientation en haut de la liste.
                  </p>
                  <p className="leading-relaxed">
                    <strong className="text-amber-900">⋮ Méthode 2 :</strong> Cliquez sur les trois points verticaux d'une ligne et choisissez l'option d'orientation.
                  </p>
                  <div className="mt-3 pt-3 border-t border-amber-200/60">
                    <p className="text-xs text-amber-700 leading-relaxed">
                      <FontAwesomeIcon icon={faInfoCircle} className="mr-1.5 text-amber-600" />
                      <strong>Rôles :</strong> Les secrétaires de direction orientent vers leur directeur de direction • Le secrétariat DG oriente vers le Directeur Général
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Popout de chargement pour les opérations CRUD */}
        {(loadingOperations.insert || loadingOperations.delete || loadingOperations.update) && (
          <div className="relative">
            <div className="absolute top-0 left-0 right-0 z-[1000] bg-white border-2 border-blue-200 rounded-xl shadow-2xl shadow-blue-500/20 p-6 m-4 transform transition-all duration-300 animate-slideDown">
              <div className="flex items-center gap-4">
                {/* Icône animée */}
                <div className="relative w-12 h-12 flex-shrink-0">
                  <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-blue-500 flex items-center justify-center">
                    <FontAwesomeIcon 
                      icon={faSpinner} 
                      className="w-5 h-5 text-white animate-spin" 
                    />
                  </div>
                </div>
                
                {/* Contenu */}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-gray-900 mb-1">
                    {loadingOperations.operationName || (
                      <>
                        {loadingOperations.insert && 'Création en cours...'}
                        {loadingOperations.delete && 'Suppression en cours...'}
                        {loadingOperations.update && 'Mise à jour en cours...'}
                      </>
                    )}
                  </p>
                  
                  {/* Barre de progression */}
                  {loadingOperations.progress !== undefined && (
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                        <span>Progression</span>
                        <span className="font-medium">{loadingOperations.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out relative"
                          style={{ width: `${loadingOperations.progress}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-shimmer" />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Message d'état */}
                  <p className="text-sm">
                    {loadingOperations.completed ? (
                      loadingOperations.success ? (
                        <span className="text-green-600 flex items-center gap-2">
                          <FontAwesomeIcon icon={faCheck} className="text-green-500" />
                          Opération terminée avec succès
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-2">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500" />
                          Erreur: {loadingOperations.error || 'Une erreur est survenue'}
                        </span>
                      )
                    ) : (
                      <span className="text-gray-600">Veuillez patienter...</span>
                    )}
                  </p>
                </div>
                
                {/* Bouton de fermeture (optionnel) */}
                {loadingOperations.completed && (
                  <button
                    onClick={() => setLoadingOperations(prev => ({ ...prev, update: false, insert: false, delete: false }))}
                    className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    title="Fermer"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-4 h-4 text-gray-600" />
                  </button>
                )}
              </div>
              
              {/* Animation CSS */}
              <style>{`
                @keyframes slideDown {
                  from {
                    opacity: 0;
                    transform: translateY(-20px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
                
                @keyframes shimmer {
                  0% {
                    transform: translateX(-100%);
                  }
                  100% {
                    transform: translateX(100%);
                  }
                }
                
                .animate-slideDown {
                  animation: slideDown 0.3s ease-out;
                }
                
                .animate-shimmer {
                  animation: shimmer 1.5s infinite;
                }
                
                .skeleton {
                  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                  background-size: 200% 100%;
                  animation: shimmer 1.5s infinite;
                }
              `}</style>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-600 border-b-4 border-blue-400/40 shadow-lg">
                <th className="px-4 py-4 text-left w-12">
                  {/* Checkbox dans colonne Actions */}
                </th>
                <th 
                  className="px-6 py-4 text-left cursor-pointer group transition-all hover:bg-white/10 active:bg-white/20"
                  onClick={() => handleSort('numero')}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all">
                      <FontAwesomeIcon icon={faHashtag} className="text-sm text-white" />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-bold text-white uppercase tracking-wider block">Numéro</span>
                      <span className="text-xs text-blue-100 font-normal">Référence unique</span>
                    </div>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${sortBy === 'numero' ? 'bg-white/30 text-white scale-110' : 'text-blue-200 group-hover:text-white group-hover:bg-white/10'}`}>
                      <FontAwesomeIcon 
                        icon={sortBy === 'numero' ? (sortOrder === 'asc' ? faSortUp : faSortDown) : faSort} 
                        className="text-xs"
                      />
                    </div>
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left cursor-pointer group transition-all hover:bg-white/10 active:bg-white/20"
                  onClick={() => handleSort('expediteur')}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all">
                      <FontAwesomeIcon icon={faUsers} className="text-sm text-white" />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-bold text-white uppercase tracking-wider block">Expéditeur / Destinataire</span>
                      <span className="text-xs text-blue-100 font-normal">Parties concernées</span>
                    </div>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${sortBy === 'expediteur' ? 'bg-white/30 text-white scale-110' : 'text-blue-200 group-hover:text-white group-hover:bg-white/10'}`}>
                      <FontAwesomeIcon 
                        icon={sortBy === 'expediteur' ? (sortOrder === 'asc' ? faSortUp : faSortDown) : faSort} 
                        className="text-xs"
                      />
                    </div>
                  </div>
                </th>
                <th className="px-4 py-4 text-right w-12">
                  <div className="flex items-center justify-end gap-2">
                    <div className="relative group/checkbox">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        ref={(input) => {
                          if (input) input.indeterminate = isIndeterminate;
                        }}
                        className="w-5 h-5 text-blue-600 border-2 border-white/60 rounded-md focus:ring-2 focus:ring-white/50 bg-white/20 cursor-pointer hover:bg-white/30 transition-all"
                        title="Sélectionner tout"
                      />
                      <div className="absolute -bottom-8 right-0 bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover/checkbox:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                        Tout sélectionner
                      </div>
                    </div>
                    <span className="sr-only">Actions</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Barre d'actions groupées pour les courriers — liste et arborescence */}
              {selectedCourriers.size > 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-3 bg-gradient-to-r from-blue-50 via-blue-50 to-cyan-50 border-b-2 border-blue-200/50 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-lg border border-blue-200/50 shadow-sm">
                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-xs font-semibold text-blue-900">
                            {selectedCourriers.size} sélectionné(s)
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isAllSelected) {
                              setSelectedCourriers(new Set());
                            } else {
                              setSelectedCourriers(new Set(filteredCourriers.map(c => c.id)));
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors"
                          title={isAllSelected ? "Tout désélectionner" : `Tout sélectionner (${filteredCourriers.length} résultat${filteredCourriers.length > 1 ? "s" : ""})`}
                        >
                          {isAllSelected ? "Tout désélectionner" : `Tout (${filteredCourriers.length})`}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => {
                            setCourrierBulkActionType('move');
                            setShowCourrierBulkModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          title="Déplacer vers une catégorie"
                        >
                          <FontAwesomeIcon icon={faFolder} className="text-[10px]" />
                          Déplacer
                        </button>
                        <button
                          onClick={() => {
                            setCourrierBulkActionType('statut');
                            setShowCourrierBulkModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          title="Changer le statut"
                        >
                          <FontAwesomeIcon icon={faTasks} className="text-[10px]" />
                          Statut
                        </button>
                        <button
                          onClick={() => {
                            setCourrierBulkActionType('priorite');
                            setShowCourrierBulkModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
                          title="Changer la priorité"
                        >
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-[10px]" />
                          Priorité
                        </button>
                        {/* Orientation des courriers : pour les secrétaires et Directeur Général */}
                        {(user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL) && (
                          <>
                            {(() => {
                              const isSecretaryDG = isSecretaireDG(user);
                              
                              console.log('Actions groupées - Utilisateur:', {
                                nom: user?.nom,
                                role: user?.role,
                                direction: user?.direction,
                                isSecretaryDG
                              });
                              
                              if (isSecretaryDG) {
                                // Secrétaire DG uniquement : bouton "Vers DG" (le DG ne s'oriente pas vers lui-même)
                                console.log('Affichage bouton "Vers DG"');
                                return (
                                  <button
                                    onClick={() => {
                                      setCourrierBulkActionType('orienter-dg');
                                      setShowCourrierBulkModal(true);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                                    title="Orienter les courriers vers le Directeur Général"
                                  >
                                    <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                                    Vers DG
                                  </button>
                                );
                              } else if (user?.role === Role.SECRETAIRE) {
                                // Secrétaire de direction : bouton "Vers directeur"
                                console.log('📝 Affichage bouton "Vers directeur" pour secrétaire de direction');
                                return (
                                  <button
                                    onClick={() => {
                                      setCourrierBulkActionType('orienter-directeur');
                                      setShowCourrierBulkModal(true);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                                    title={`Orienter les courriers vers le directeur de ${user?.direction}`}
                                  >
                                    <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                                    Vers directeur
                                  </button>
                                );
                              } else if (user?.role === Role.SUPER_ADMIN) {
                                // Super admin : les deux options
                                return (
                                  <>
                                    <button
                                      onClick={() => {
                                        setCourrierBulkActionType('orienter-dg');
                                        setShowCourrierBulkModal(true);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                                      title="Orienter les courriers vers le Directeur Général"
                                    >
                                      <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                                      Vers DG
                                    </button>
                                    <button
                                      onClick={() => {
                                        setCourrierBulkActionType('orienter-direction');
                                        setCourrierBulkOrienterDirectionNom(null);
                                        setShowCourrierBulkModal(true);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                                      title="Orienter les courriers vers une direction"
                                    >
                                      <FontAwesomeIcon icon={faBuilding} className="text-[10px]" />
                                      Vers direction
                                    </button>
                                  </>
                                );
                              } else {
                                // DG ou Directeur : aucun bouton d'orientation (ils ne s'orientent pas eux-mêmes)
                                return null;
                              }
                            })()}
                          </>
                        )}
                        {/* Suppression : uniquement pour les rôles avec permission SUPPRIMER_COURRIER */}
                        {checkPermission(Permission.SUPPRIMER_COURRIER) && (
                        <button
                          onClick={async () => {
                            const confirmed = await showConfirm(
                              `Êtes-vous sûr de vouloir supprimer ${selectedCourriers.size} courrier(s) ? Cette action est irréversible.`,
                              'warning',
                              'Confirmation de suppression'
                            );
                            if (confirmed) {
                              setLoadingOperations(prev => ({ ...prev, delete: true, operationName: `Suppression de ${selectedCourriers.size} courrier(s)...` }));
                              let successCount = 0;
                              let errorCount = 0;
                              const count = selectedCourriers.size;
                              const idsToDelete = Array.from(selectedCourriers);
                              
                              // Supprimer tous les courriers en parallèle pour plus d'efficacité
                              console.log(`Début de la suppression groupée de ${count} courrier(s)...`);
                              const deletePromises = idsToDelete.map(async (id) => {
                                try {
                                  console.log(`Suppression du courrier ${id}...`);
                                  await courrierService.deleteCourrier(id);
                                  console.log(`Courrier ${id} supprimé avec succès`);
                                  return { id, success: true };
                                } catch (error: any) {
                                  console.error(`Erreur lors de la suppression du courrier ${id}:`, {
                                    error,
                                    errorCode: error?.code,
                                    errorMessage: error?.message,
                                    errorName: error?.name
                                  });
                                  return { id, success: false, error: error?.message || 'Erreur inconnue' };
                                }
                              });
                              
                              const results = await Promise.all(deletePromises);
                              results.forEach(result => {
                                if (result.success) {
                                  successCount++;
                                } else {
                                  errorCount++;
                                  console.error(`Échec de suppression pour le courrier ${result.id}:`, result.error);
                                }
                              });
                              
                              console.log(`Résultats de la suppression: ${successCount} succès, ${errorCount} erreurs`);
                              
                              // Retirer les courriers supprimés du mapping des catégories
                              if (successCount > 0 && user?.id) {
                                const deletedIds = results.filter(r => r.success).map(r => r.id);
                                setCategorieCourrierMap(prev => {
                                  const next = { ...prev };
                                  deletedIds.forEach(id => {
                                    if (next[id]) {
                                      delete next[id];
                                    }
                                  });
                                  // Sauvegarder le mapping mis à jour via l'API
                                  categorieCourrierService.saveCategoryMap(user.id, next).catch(err => {
                                    console.error('Erreur lors de la sauvegarde du mapping:', err);
                                  });
                                  return next;
                                });
                              }
                              
                              // Attendre un court délai pour que l'API traite les suppressions
                              await new Promise(resolve => setTimeout(resolve, 500));
                              
                              // Recharger les courriers depuis l'API pour s'assurer que la suppression est bien synchronisée
                              console.log('Rechargement des courriers depuis l\'API...');
                              try {
                                await loadCourriers();
                                console.log('Courriers rechargés depuis l\'API');
                              } catch (reloadError) {
                                console.error('Erreur lors du rechargement:', reloadError);
                                // Forcer un rechargement même en cas d'erreur
                                await loadCourriers();
                              }
                              
                              // Retirer les courriers supprimés de la sélection
                              setSelectedCourriers(new Set());
                              
                              setLoadingOperations(prev => ({ ...prev, delete: false, operationName: undefined }));

                              if (errorCount === 0) {
                                showAlert(`${successCount} courrier(s) supprimé(s) avec succès`, 'success');
                              } else {
                                showAlert(`${successCount} courrier(s) supprimé(s), ${errorCount} erreur(s)`, 'warning');
                              }
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          title="Supprimer les courriers sélectionnés"
                        >
                          <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                          Supprimer
                        </button>
                        )}
                        <button
                          onClick={() => setSelectedCourriers(new Set())}
                          className="px-3 py-2 text-xs font-medium text-surface-700 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {/* Message "Aucun courrier" uniquement en mode liste (en arborescence on affiche catégories + non classés) */}
              {currentCourriers.length === 0 && folderViewMode === 'liste' && (
                <tr>
                  <td colSpan={4} className="px-6 py-12">
                    <div className="flex flex-col items-center justify-center text-center gap-6 rounded-3xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50/50 via-white to-slate-50/30 py-16 px-8 max-w-lg mx-auto shadow-sm hover:shadow-md transition-all duration-300">
                      <div className="relative">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shadow-lg shadow-slate-500/20">
                          <FontAwesomeIcon icon={faEnvelopeOpen} className="w-10 h-10 text-white" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center shadow-md">
                          <FontAwesomeIcon icon={faFilter} className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-bold bg-gradient-to-r from-slate-600 to-slate-700 bg-clip-text text-transparent">
                          Aucun courrier à afficher
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed max-w-sm">
                          Aucun courrier ne correspond à vos critères de recherche. Essayez d'ajuster vos filtres ou créez un nouveau courrier.
                        </p>
                      </div>
                      <div className="flex gap-3 mt-2">
                        <button
                          onClick={() => {
                            setFilters({
                              sens: '',
                              statut: '',
                              type: '',
                              search: '',
                              priorite: '',
                              direction: '',
                              service: '',
                              sousService: '',
                              dateDebut: '',
                              dateFin: '',
                              categorie: '',
                              mesAssignations: false,
                              nonClassifies: false,
                            });
                          }}
                          className="px-5 py-2.5 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 hover:border-slate-400 transition-all duration-300 flex items-center gap-2"
                        >
                          <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                          Réinitialiser les filtres
                        </button>
                        <button
                          onClick={() => navigate('/enregistrer')}
                          className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 hover:scale-105 transition-all duration-300 flex items-center gap-2"
                        >
                          <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                          Nouveau courrier
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {folderViewMode === 'arborescence' && (
                <React.Fragment key="arborescence">
                  {/* Barre d'actions groupées - au-dessus de la liste */}
                  {selectedFolderIds.size > 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 bg-gradient-to-r from-blue-50 via-blue-50 to-cyan-50 border-b-2 border-blue-200/50 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-lg border border-blue-200/50 shadow-sm">
                              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                              <span className="text-xs font-semibold text-blue-900">
                                {selectedFolderIds.size} catégorie(s) sélectionnée(s)
                              </span>
                            </div>
                            <button
                              onClick={handleSelectAllFolders}
                              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors"
                              title={selectedFolderIds.size === courrierFolders.length ? "Tout désélectionner" : "Tout sélectionner"}
                            >
                              {selectedFolderIds.size === courrierFolders.length ? "Tout désélectionner" : "Tout sélectionner"}
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={() => {
                                setBulkActionType('move');
                                setShowBulkActionsModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                              title="Déplacer les catégories sélectionnées"
                            >
                              <FontAwesomeIcon icon={faFolder} className="text-[10px]" />
                              Déplacer
                            </button>
                            <button
                              onClick={() => {
                                setBulkActionType('rename');
                                setShowBulkActionsModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                              title="Renommer les catégories sélectionnées"
                            >
                              <FontAwesomeIcon icon={faEdit} className="text-[10px]" />
                              Renommer
                            </button>
                            <button
                              onClick={handleDeleteSelectedFolders}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                              title="Supprimer les catégories sélectionnées"
                            >
                              <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                              Supprimer
                            </button>
                            <button
                              onClick={() => setSelectedFolderIds(new Set())}
                              className="px-3 py-2 text-xs font-medium text-surface-700 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-colors"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {renderFolderRows(null, 0)}
                  {/* Bouton "Voir plus" pour les dossiers racines */}
                  {folderViewMode === 'arborescence' && 
                   courrierFolders.length > rootVisibleLimit && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => {
                              setRootVisibleLimit(prev => prev + folderItemsPerPage);
                            }}
                            disabled={loadingMoreFolders}
                            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {loadingMoreFolders ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Chargement...</span>
                              </>
                            ) : (
                              <>
                                <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                                <span>Voir plus de dossiers ({courrierFolders.length - rootVisibleLimit} restants)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {courrierFolders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12">
                        <div className="flex flex-col items-center justify-center text-center gap-6 rounded-3xl border-2 border-dashed border-blue-200 bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30 py-16 px-8 max-w-lg mx-auto shadow-sm hover:shadow-md transition-all duration-300">
                          <div className="relative">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse">
                              <FontAwesomeIcon icon={faFolder} className="w-10 h-10 text-white" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-md">
                              <FontAwesomeIcon icon={faPlus} className="w-3 h-3 text-white" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                              Aucune catégorie pour le moment
                            </p>
                            <p className="text-sm text-slate-600 leading-relaxed max-w-sm">
                              Organisez vos courriers en créant des catégories thématiques pour une meilleure gestion
                            </p>
                          </div>
                          <button
                            onClick={() => setShowFolderModal(true)}
                            className="mt-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transition-all duration-300 flex items-center gap-2"
                          >
                            <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                            Créer ma première catégorie
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filteredCourriers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12">
                        <div className="flex flex-col items-center justify-center text-center gap-6 rounded-3xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50/50 via-white to-slate-50/30 py-16 px-8 max-w-lg mx-auto shadow-sm hover:shadow-md transition-all duration-300">
                          <div className="relative">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shadow-lg shadow-slate-500/20">
                              <FontAwesomeIcon icon={faEnvelopeOpen} className="w-10 h-10 text-white" />
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center shadow-md">
                              <FontAwesomeIcon icon={faFilter} className="w-4 h-4 text-white" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xl font-bold bg-gradient-to-r from-slate-600 to-slate-700 bg-clip-text text-transparent">
                              Aucun courrier à afficher
                            </p>
                            <p className="text-sm text-slate-600 leading-relaxed max-w-sm">
                              Aucun courrier ne correspond à vos critères de recherche. Essayez d'ajuster vos filtres ou créez un nouveau courrier.
                            </p>
                          </div>
                          <div className="flex gap-3 mt-2">
                            <button
                              onClick={() => {
                                setFilters({
                                  sens: '',
                                  statut: '',
                                  type: '',
                                  search: '',
                                  priorite: '',
                                  direction: '',
                                  service: '',
                                  sousService: '',
                                  dateDebut: '',
                                  dateFin: '',
                                  categorie: '',
                                  mesAssignations: false,
                                  nonClassifies: false,
                                });
                              }}
                              className="px-5 py-2.5 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 hover:border-slate-400 transition-all duration-300 flex items-center gap-2"
                            >
                              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                              Réinitialiser les filtres
                            </button>
                            <button
                              onClick={() => navigate('/enregistrer')}
                              className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 hover:scale-105 transition-all duration-300 flex items-center gap-2"
                            >
                              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                              Nouveau courrier
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className="bg-surface-50/70">
                    <td colSpan={4} className="px-6 py-2">
                      <div
                        className={`flex items-center justify-between rounded-lg border transition-colors ${
                          draggedOverFolderId === ROOT_FOLDER_KEY ? 'bg-blue-50 border-blue-300' : 'bg-white border-surface-200'
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (draggedCourrierId) setDraggedOverFolderId(ROOT_FOLDER_KEY);
                        }}
                        onDragLeave={() => setDraggedOverFolderId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedCourrierId) {
                            assignCourrierToFolder(draggedCourrierId, null);
                            setDraggedCourrierId(null);
                            setDraggedOverFolderId(null);
                            showAlert('Courrier déplacé à la racine', 'success');
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 px-3 py-2 flex-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFolderExpand(ROOT_FOLDER_KEY);
                            }}
                            className="w-6 h-6 rounded-lg text-surface-500 hover:text-surface-700 hover:bg-surface-100 flex items-center justify-center"
                            title={expandedFolderIds.has(ROOT_FOLDER_KEY) ? 'Réduire' : 'Développer'}
                          >
                            <FontAwesomeIcon
                              icon={expandedFolderIds.has(ROOT_FOLDER_KEY) ? faChevronDown : faChevronRightIcon}
                              className="text-xs"
                            />
                          </button>
                          <FontAwesomeIcon
                            icon={expandedFolderIds.has(ROOT_FOLDER_KEY) ? faFolderOpen : faFolder}
                            className="text-blue-600"
                          />
                          <span className="text-sm font-semibold text-surface-700">Courriers non classés</span>
                          <span className="text-xs text-surface-500 bg-surface-100 px-2 py-0.5 rounded-full">
                            {rootCourriers.length} courrier{rootCourriers.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-xs text-surface-400 px-3">Déposez ici pour retirer de la catégorie</div>
                      </div>
                    </td>
                  </tr>
                  {expandedFolderIds.has(ROOT_FOLDER_KEY) &&
                    rootCourriers.slice(0, uncategorizedVisibleCount).map((courrier, index) => renderCourrierRow(courrier, index, 0))}
                  {expandedFolderIds.has(ROOT_FOLDER_KEY) && rootCourriers.length > uncategorizedVisibleCount && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => setUncategorizedVisibleCount(prev => prev + itemsPerPage)}
                            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center gap-2"
                          >
                            <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                            <span>Voir plus de courriers non classés ({rootCourriers.length - uncategorizedVisibleCount} restants)</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )}
              {currentCourriers.length > 0 && folderViewMode === 'liste' && groupedCourriers.map(group => {
                const isCollapsed = groupBy !== 'none' && collapsedGroups.has(group.key);
                return (
                  <React.Fragment key={group.key}>
                    {groupBy !== 'none' && (
                      <tr className="bg-slate-50 border-y border-slate-100">
                        <td colSpan={4} className="px-6 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => toggleGroupCollapse(group.key)}
                                className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 flex items-center justify-center transition-all shadow-sm"
                                title={isCollapsed ? 'Déplier le groupe' : 'Replier le groupe'}
                              >
                                <FontAwesomeIcon icon={isCollapsed ? faChevronRightIcon : faChevronDown} className="text-xs" />
                              </button>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">{group.label}</span>
                                <span className="text-xs font-medium text-slate-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                                  {group.items.length} courrier{group.items.length > 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs font-medium text-slate-500">{activeGroupLabel}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {!isCollapsed && group.items.map((courrier, index) => (
                      <React.Fragment key={courrier.id}>
                  <tr 
                    className={`group transition-colors duration-150 cursor-pointer ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                    } ${
                      selectedCourriers.has(courrier.id) 
                        ? 'bg-blue-50 border-l-4 border-l-blue-500 hover:bg-blue-50/90' 
                        : 'border-l-4 border-l-transparent hover:bg-blue-50/50'
                    }`}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => {
                      setSelectedCourrierForResume(courrier);
                      setShowResumeModal(true);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        open: true,
                        x: e.clientX,
                        y: e.clientY,
                        courrier
                      });
                    }}
                  >
                  <td className="px-4 py-4 whitespace-nowrap">
                    {/* Checkbox déplacée à droite dans Actions */}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                          {(() => {
                            const mainFile = getMainFile(courrier);
                            if (mainFile) {
                              const extension = mainFile.split('.').pop()?.toLowerCase();
                              return (
                                <FontAwesomeIcon 
                                  icon={getFileIcon(extension, mainFile)} 
                                  className={`text-lg ${getFileIconColor(extension, mainFile)}`}
                                  title={`Document: ${mainFile}`}
                                />
                              );
                            }
                            return (
                              <FontAwesomeIcon 
                                icon={faPaperclip}
                                className="text-slate-300 text-lg"
                                title="Aucun document attaché"
                              />
                            );
                          })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{courrier.numero}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(courrier.id);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-all flex-shrink-0"
                              title={expandedCourriers.has(courrier.id) ? "Masquer les fichiers" : "Visualiser les fichiers"}
                            >
                              <FontAwesomeIcon 
                                icon={expandedCourriers.has(courrier.id) ? faFolderOpen : faFolder} 
                                className="text-xs"
                              />
                              <span>{expandedCourriers.has(courrier.id) ? "Masquer" : "Visualiser"}</span>
                              {(() => {
                                // Priorité 1: filesCounts (chargé en arrière-plan au démarrage)
                                const count = filesCounts.get(courrier.id);
                                if (count && (count.nbFichiers > 0 || count.nbCategories > 0)) {
                                  const total = count.nbFichiers + count.nbCategories;
                                  return (
                                    <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">
                                      {total}
                                    </span>
                                  );
                                }
                                // Priorité 2: dossiersFichiers
                                const df = dossiersFichiers.get(courrier.id);
                                if (df && df.length > 0) {
                                  return (
                                    <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">
                                      {df.length}
                                    </span>
                                  );
                                }
                                // Priorité 3: categorieFichiers
                                if (courrier.categorieFichiers && courrier.categorieFichiers.length > 0) {
                                  return (
                                    <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">
                                      {courrier.categorieFichiers.length}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </button>
                          </div>
                          {/* Objet du courrier */}
                          <p className="mt-1 text-sm text-slate-700 line-clamp-2" title={getCourrierObjet(courrier)}>
                            {getCourrierObjet(courrier)}
                          </p>
                          {/* Date de réception sous l'objet (champ dynamique si présent, sinon core) */}
                          {(() => {
                            let dateStr = '—';
                            let timeStr = '';
                            let dr: any = getDynamicReceptionDateValue(courrier);
                            // Fallback core si pas de champ dynamique
                            if (!dr) {
                              dr = (courrier as any).dateReception;
                            }
                            if (typeof dr === 'string') {
                              // Essayer de capturer aussi l'heure si présente
                              const match = dr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
                              if (match) {
                                // Formater sans décalage de fuseau (JJ/MM/AAAA) + heure si fournie
                                dateStr = `${match[3]}/${match[2]}/${match[1]}`;
                                if (match[4] && match[5]) {
                                  timeStr = `${match[4]}:${match[5]}`;
                                }
                              } else {
                                try {
                                  const d = new Date(dr);
                                  if (!isNaN(d.getTime())) {
                                    dateStr = d.toLocaleDateString('fr-FR');
                                    timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                                  }
                                } catch {}
                              }
                            } else if (dr instanceof Date) {
                              if (!isNaN(dr.getTime())) {
                                dateStr = dr.toLocaleDateString('fr-FR');
                                timeStr = dr.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                              }
                            }
                            if (dateStr !== '—' && !timeStr) {
                              // Si on n'a pas d'heure explicite, afficher 00:00 par défaut
                              timeStr = '00:00';
                            }
                            const dateTitle = dateStr === '—'
                              ? 'Date de réception indisponible'
                              : `Date de réception: ${dateStr} à ${timeStr}`;
                            return (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                                  title={dateTitle}
                                >
                                  <FontAwesomeIcon icon={faCalendar} className="w-3 h-3 text-slate-400" />
                                  {dateStr}
                                </span>
                                {dateStr !== '—' && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                                    title={`Heure de réception: ${timeStr}`}
                                  >
                                    <FontAwesomeIcon icon={faClock} className="w-3 h-3 text-slate-400" />
                                    {timeStr}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="mt-2 flex flex-wrap items-center gap-2 min-w-0">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg uppercase tracking-wide shadow-sm border max-w-[160px] ${getStatutColor(courrier.statut)}`}
                              title={`Statut: ${getStatutLabel(courrier.statut)}`}
                            >
                              <FontAwesomeIcon icon={faInfoCircle} className="w-3.5 h-3.5" />
                              <span className="truncate">{getStatutLabel(courrier.statut)}</span>
                            </span>
                            {(() => {
                              const dynamicPriority = getDynamicPriorityValue(courrier);
                              const mapped = mapToPriorite(dynamicPriority);
                              const label = dynamicPriority !== undefined && dynamicPriority !== null && `${dynamicPriority}`.trim() !== ''
                                ? getPrioriteLabel(mapToPriorite(dynamicPriority) || courrier.priorite)
                                : getPrioriteLabel(courrier.priorite);
                              // Fallback couleur sur la priorité core si le mapping dynamique échoue
                              const fallbackMapped = mapToPriorite(courrier.priorite);
                              const colorClass = mapped
                                ? getPrioriteColor(mapped)
                                : (fallbackMapped ? getPrioriteColor(fallbackMapped) : getPrioriteColor(courrier.priorite));
                              return (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg uppercase tracking-wide shadow-sm border max-w-[160px] ${colorClass}`}
                                  title={`Priorité: ${label}`}
                                >
                                  <FontAwesomeIcon icon={faExclamationTriangle} className="w-3.5 h-3.5" />
                                  <span className="truncate">{label}</span>
                                </span>
                              );
                            })()}
                            {courrier.sens && (
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg uppercase tracking-wide shadow-sm border max-w-[160px] ${
                                  courrier.sens === SensCourrier.ENTRANT
                                    ? 'bg-gradient-to-r from-blue-100 to-indigo-100 text-indigo-700 border-indigo-200'
                                    : 'bg-gradient-to-r from-purple-100 to-violet-100 text-violet-700 border-violet-200'
                                }`}
                                title={`Sens: ${getSensLabel(courrier.sens)}`}
                              >
                                <FontAwesomeIcon icon={courrier.sens === SensCourrier.ENTRANT ? faArrowDown : faArrowUp} className="w-3.5 h-3.5" />
                                <span className="truncate">{getSensLabel(courrier.sens)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  {/* Expéditeur / Destinataire */}
                  <td className="px-6 py-4">
                    <div className="max-w-[280px] space-y-2" title={`Expéditeur: ${courrier.expediteur || '—'} — Destinataire: ${courrier.destinataire || '—'}`}>
                      <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-100">
                        <div className="flex-shrink-0 w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center">
                          <FontAwesomeIcon icon={faUser} className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Expéditeur</div>
                          <div className="text-xs font-medium text-slate-700 truncate">{courrier.expediteur || '—'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-1.5 border border-purple-100">
                        <div className="flex-shrink-0 w-6 h-6 rounded-md bg-purple-500 flex items-center justify-center">
                          <FontAwesomeIcon icon={faUserCheck} className="w-3 h-3 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide">Destinataire</div>
                          <div className="text-xs font-medium text-slate-700 truncate">{courrier.destinataire || '—'}</div>
                        </div>
                      </div>
                    </div>
                  </td>
                  {/* Colonne actions - clics ne doivent pas ouvrir le modal résumé */}
                  <td className="px-4 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          key={`${courrier.id}-${selectedCourriers.has(courrier.id)}`}
                          checked={selectedCourriers.has(courrier.id)}
                          onChange={(e) => handleSelectCourrier(courrier.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-blue-600 border-2 border-slate-300 rounded focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                          aria-label={`Sélectionner le courrier ${courrier.numero}`}
                        />
                      </div>
                      <button
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          setContextMenu({
                            open: true,
                            x: rect.left + rect.width,
                            y: rect.top + rect.height,
                            courrier
                          });
                        }}
                        aria-label="Menu actions"
                        title="Actions"
                      >
                        <FontAwesomeIcon icon={faEllipsisV} className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedCourriers.has(courrier.id) && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 bg-slate-50 border-b border-slate-100">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 flex-wrap gap-2">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="text-sm font-bold text-slate-800">Documents et catégories</span>
                            {(() => {
                              const n = getSelectedCountForCourrier(courrier.id);
                              return n > 0 ? (
                                <span className="text-xs text-blue-600 font-medium">
                                  {n} élément{n > 1 ? 's' : ''} sélectionné{n > 1 ? 's' : ''}
                                </span>
                              ) : null;
                            })()}
                            {copiedItems.length > 0 && (
                              <span className="text-xs text-green-600 font-medium">
                                {copiedItems.length} élément{copiedItems.length > 1 ? 's' : ''} copié{copiedItems.length > 1 ? 's' : ''} — Cliquez sur « Coller » dans une catégorie
                              </span>
                            )}
                            {(() => {
                              const dfCourrier = dossiersFichiers.get(courrier.id) || [];
                              const n = getSelectedCountForCourrier(courrier.id);
                              if (dfCourrier.length === 0) return null;
                              const allSelected = n === dfCourrier.length;
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllItemsForCourrier(courrier.id, !allSelected)}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {allSelected ? 'Tout désélectionner' : `Tout sélectionner (${dfCourrier.length})`}
                                </button>
                              );
                            })()}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {getSelectedCountForCourrier(courrier.id) > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCopyItems(courrier.id)}
                                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                                >
                                  <FontAwesomeIcon icon={faCopy} />
                                  Copier ({getSelectedCountForCourrier(courrier.id)})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSelectedItems(courrier.id)}
                                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                  Supprimer ({getSelectedCountForCourrier(courrier.id)})
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => openAddFileModal(courrier.id)}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                            >
                              <FontAwesomeIcon icon={faPlus} />
                              Ajouter des fichiers
                            </button>
                            <button
                              type="button"
                              onClick={() => openScanModalForCourrier(courrier.id)}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
                              title="Scanner un document et l’ajouter à ce courrier"
                            >
                              <FontAwesomeIcon icon={faPrint} />
                              Scanner
                            </button>
                            <button
                              type="button"
                              onClick={() => openDossierModal(courrier.id)}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                            >
                              <FontAwesomeIcon icon={faFolder} />
                              Nouveau dossier
                            </button>
                          </div>
                        </div>
                        {(() => {
                          const df = dossiersFichiers.get(courrier.id) || [];
                          const isDraggedOver = draggedOverCourrier === courrier.id;
                          const isLoadingFichiers = loadingFichiersCourrierId === courrier.id;
                          
                          // Récupérer les accusés de réception depuis localStorage (pour courriers sortants uniquement)
                          const isSortant = getCourrierSens(courrier) === SensCourrier.SORTANT;
                          const accuseStorageKey = `accuses_reception_${courrier.id}`;
                          const storedAccuses = isSortant ? JSON.parse(localStorage.getItem(accuseStorageKey) || '[]') : [];
                          
                          return (
                            <div
                              className={`min-h-[200px] p-4 rounded-lg border-2 border-dashed transition-colors ${
                                isDraggedOver 
                                  ? 'bg-blue-100 border-blue-400' 
                                  : 'bg-white border-gray-300'
                              }`}
                              onDrop={(e) => handleFileDrop(e, courrier.id)}
                              onDragOver={(e) => handleDragOver(e, undefined, courrier.id)}
                              onDragLeave={handleDragLeave}
                            >
                              {isLoadingFichiers && (
                                <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                                  <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xl" />
                                  <span>Chargement des fichiers…</span>
                                </div>
                              )}
                              {!isLoadingFichiers && (
                              <>
                              {/* Section Accusés de réception (courriers sortants uniquement) */}
                              {isSortant && storedAccuses.length > 0 && (
                                <div className="mb-4 pb-4 border-b-2 border-green-200">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <FontAwesomeIcon icon={faClipboardCheck} className="text-green-600" />
                                      <h4 className="text-sm font-bold text-green-700">Accusés de réception ({storedAccuses.length})</h4>
                                      <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">localStorage</span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        if (confirm(`Supprimer tous les accusés de réception (${storedAccuses.length}) ?`)) {
                                          localStorage.removeItem(accuseStorageKey);
                                          // Forcer le re-render
                                          setDossiersFichiers(prev => new Map(prev));
                                        }
                                      }}
                                      className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-all"
                                      title="Supprimer tous les accusés de réception"
                                    >
                                      <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {storedAccuses.map((accuse: { name: string; data: string; type: string; size: number; date: string }, index: number) => (
                                      <div
                                        key={index}
                                        className="relative group bg-white rounded-lg border-2 border-green-200 overflow-hidden hover:border-green-400 transition-all"
                                      >
                                        <div
                                          className="cursor-pointer"
                                          onClick={() => {
                                            // Ouvrir l'image dans une nouvelle fenêtre
                                            const newWindow = window.open();
                                            if (newWindow) {
                                              newWindow.document.write(`<img src="${accuse.data}" style="max-width:100%; height:auto;" />`);
                                            }
                                          }}
                                        >
                                          <img
                                            src={accuse.data}
                                            alt={accuse.name}
                                            className="w-full h-32 object-cover"
                                          />
                                          <div className="p-2">
                                            <p className="text-xs font-medium text-gray-900 truncate" title={accuse.name}>
                                              {accuse.name}
                                            </p>
                                            <p className="text-xs text-gray-500">{(accuse.size / 1024).toFixed(2)} KB</p>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => {
                                            if (confirm(`Supprimer "${accuse.name}" ?`)) {
                                              const updated = storedAccuses.filter((_: any, i: number) => i !== index);
                                              localStorage.setItem(accuseStorageKey, JSON.stringify(updated));
                                              // Forcer le re-render
                                              setDossiersFichiers(prev => new Map(prev));
                                            }
                                          }}
                                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                                          title="Supprimer"
                                        >
                                          <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {df.length === 0 && storedAccuses.length === 0 ? (
                                <div className="text-center py-8">
                                  <div className="text-sm text-gray-500 italic mb-4">
                                    Glissez-déposez des fichiers ici ou créez une catégorie
                                  </div>
                                  {laravelApiService.isConfigured() && (
                                    <p className="text-xs text-gray-400 mb-3">
                                      Les fichiers importés sont enregistrés sur le serveur Laravel. Si vous venez d’en ajouter, cliquez sur « Réessayer le chargement » pour les afficher.
                                    </p>
                                  )}
                                  <div className="flex gap-2 justify-center flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => openAddFileModal(courrier.id)}
                                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                    >
                                      <FontAwesomeIcon icon={faPlus} />
                                      Ajouter des fichiers
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openScanModalForCourrier(courrier.id)}
                                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                                      title="Scanner un document et l’ajouter à ce courrier"
                                    >
                                      <FontAwesomeIcon icon={faPrint} />
                                      Scanner
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openDossierModal(courrier.id)}
                                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                      <FontAwesomeIcon icon={faFolder} />
                                      Créer un dossier
                                    </button>
                                    {laravelApiService.isConfigured() && (
                                      <button
                                        type="button"
                                        onClick={() => loadDossiersFichiers(courrier.id)}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                      >
                                        <FontAwesomeIcon icon={faSync} />
                                        Réessayer le chargement
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                df.length > 0 && (
                                  <div className="space-y-1">
                                    {renderTree(df, 0, courrier.id)}
                                  </div>
                                )
                              )}
                              </>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                )}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })}
              {/* Animation skeleton pendant le chargement de plus de courriers */}
              {loadingMoreCourriers && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <tr key={`skeleton-${i}`}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="skeleton w-4 h-4 rounded" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="skeleton w-10 h-10 rounded-lg" />
                          <div className="flex-1 space-y-2">
                            <div className="skeleton h-5 w-32 rounded" />
                            <div className="skeleton h-4 w-24 rounded" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="skeleton h-4 w-40 rounded" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="skeleton h-4 w-24 rounded" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
        {filteredCourriers.length === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-surface-100 flex items-center justify-center mx-auto mb-4">
              <FontAwesomeIcon icon={faSearch} className="text-2xl text-surface-400" />
            </div>
            <p className="text-surface-600 font-medium text-lg">Aucun courrier trouvé</p>
            <p className="text-surface-400 text-sm mt-1">Essayez de modifier vos filtres de recherche</p>
          </div>
        )}
        {/* Bouton "voir plus" pour charger plus de courriers */}
        {courriers.length < allCourriers.length && allCourriers.length > 0 && !loadingMoreCourriers && (
          <div className="text-center py-6">
            <button
              onClick={loadMoreCourriers}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all shadow-md hover:shadow-lg"
            >
              <FontAwesomeIcon icon={faChevronDown} />
              Voir plus ({allCourriers.length - courriers.length} courriers restants)
            </button>
          </div>
        )}
      </div>

      {/* Menu contextuel */}
      {contextMenu.open && contextMenu.courrier && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[50000] pointer-events-none"
            aria-hidden="true"
          >
            <div
              className="absolute bg-white border border-surface-200 rounded-xl shadow-xl pointer-events-auto w-56 py-2"
              style={{
                top: Math.max(8, Math.min(contextMenu.y + 4, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300)),
                left: Math.max(8, Math.min(contextMenu.x + 4, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 232)),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2"
                onClick={() => {
                  navigate(`/courriers/${contextMenu.courrier!.id}`);
                  setContextMenu(prev => ({ ...prev, open: false }));
                }}
              >
                <FontAwesomeIcon icon={faEye} className="w-4 h-4 text-surface-500" />
                Ouvrir le courrier
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 text-blue-700"
                onClick={() => {
                  navigate(`/enregistrer?id=${contextMenu.courrier!.id}`);
                  setContextMenu(prev => ({ ...prev, open: false }));
                }}
              >
                <FontAwesomeIcon icon={faEdit} className="w-4 h-4 text-blue-600" />
                Modifier le courrier
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2"
                onClick={() => {
                  toggleExpand(contextMenu.courrier!.id);
                  setContextMenu(prev => ({ ...prev, open: false }));
                }}
              >
                <FontAwesomeIcon icon={faFolderOpen} className="w-4 h-4 text-surface-500" />
                Afficher/masquer fichiers
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(contextMenu.courrier!.numero || '');
                  } catch {}
                  setContextMenu(prev => ({ ...prev, open: false }));
                }}
              >
                <FontAwesomeIcon icon={faCopy} className="w-4 h-4 text-surface-500" />
                Copier le numéro
              </button>
              {(user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN) && (
                <>
                  {/* Détection du type de secrétaire */}
                  {(() => {
                    const isSecretaryDG = isSecretaireDG(user);
                    
                    if (isSecretaryDG) {
                      // Secrétaire DG : uniquement vers le DG
                      return (
                        <button
                          disabled={contextMenu.courrier ? (courrierIdsAssignedToDG.has(String(contextMenu.courrier.id)) || contextMenuCourrierOrientedToDG || contextMenu.courrier.statut !== StatutCourrier.ENREGISTRE) : false}
                          title={contextMenu.courrier ? (
                            courrierIdsAssignedToDG.has(String(contextMenu.courrier.id)) || contextMenuCourrierOrientedToDG
                              ? 'Déjà orienté vers le DG'
                              : contextMenu.courrier.statut !== StatutCourrier.ENREGISTRE
                                ? 'Seuls les courriers enregistrés peuvent être orientés'
                                : undefined
                          ) : undefined}
                          className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 border-t border-surface-100 mt-1 pt-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-50 text-amber-800 hover:bg-amber-50 disabled:hover:bg-surface-50"
                          onClick={async () => {
                            const c = contextMenu.courrier!;
                            // Vérifier si déjà orienté vers le DG
                            if (courrierIdsAssignedToDG.has(String(c.id)) || contextMenuCourrierOrientedToDG) return;
                            // Vérifier le statut du courrier
                            if (c.statut !== StatutCourrier.ENREGISTRE) {
                              showAlert('Seuls les courriers enregistrés peuvent être orientés.', 'warning');
                              return;
                            }
                            setContextMenu(prev => ({ ...prev, open: false }));
                            
                            const dg = adminService.getDirecteurGeneral();
                            if (!dg) {
                              showAlert('Aucun Directeur Général trouvé. Vérifiez qu\'un utilisateur a le rôle "Directeur Général" et qu\'il est actif.', 'error');
                              return;
                            }
                            
                            try {
                              await courrierService.createAssignation({
                                courrierId: c.id,
                                assigneA: dg.id,
                                assignePar: user.id,
                                statut: 'EN_ATTENTE',
                                instructions: 'Orientation secrétariat DG vers le Directeur Général'
                              });
                              await courrierService.updateCourrier(c.id, { statut: StatutCourrier.ORIENTE_DG }).catch(() => {});
                              setCourrierIdsAssignedToDG(prev => new Set(prev).add(String(c.id)));
                              
                              // Vérifier la complétion de la tâche pour le secrétaire (orientation effectuée)
                              const completionCheck = taskCompletionService.checkTaskCompletion(user, {
                                orientationDone: true
                              });
                              if (completionCheck.isComplete) {
                                // Notifier la complétion de la tâche en temps réel
                                realTimeTaskSyncService.notifyTaskCompleted(
                                  c.id,
                                  c.numero || '',
                                  user.id,
                                  user.role,
                                  'Orientation vers le DG',
                                  completionCheck.reason
                                );
                                showAlert(`Courrier ${c.numero} orienté vers le DG.\n\n${completionCheck.reason}`, 'success');
                              } else {
                                showAlert(`Courrier ${c.numero} orienté vers le DG.`, 'success');
                              }
                              loadCourriers();
                            } catch (_) {
                              showAlert('Erreur lors de l\'orientation.', 'error');
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 text-amber-600" />
                          {contextMenu.courrier && (courrierIdsAssignedToDG.has(String(contextMenu.courrier.id)) || contextMenuCourrierOrientedToDG) ? 'Déjà orienté vers le DG' : 'Orienter vers le DG'}
                        </button>
                      );
                    } else {
                      // Secrétaire de direction : uniquement vers le directeur de sa direction
                      return (
                        <button
                          disabled={contextMenu.courrier ? (courrierIdsAssignedToDirectors.has(String(contextMenu.courrier.id)) || contextMenuCourrierOrientedToDirector || contextMenu.courrier.statut !== StatutCourrier.ENREGISTRE) : false}
                          title={contextMenu.courrier ? (
                            courrierIdsAssignedToDirectors.has(String(contextMenu.courrier.id)) || contextMenuCourrierOrientedToDirector
                              ? 'Déjà orienté vers le directeur'
                              : contextMenu.courrier.statut !== StatutCourrier.ENREGISTRE
                                ? 'Seuls les courriers enregistrés peuvent être orientés'
                                : undefined
                          ) : undefined}
                          className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 border-t border-surface-100 mt-1 pt-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-50 text-amber-800 hover:bg-amber-50 disabled:hover:bg-surface-50"
                          onClick={async () => {
                            const c = contextMenu.courrier!;
                            // Vérifier si déjà orienté vers le directeur
                            if (courrierIdsAssignedToDirectors.has(String(c.id)) || contextMenuCourrierOrientedToDirector) return;
                            // Vérifier le statut du courrier
                            if (c.statut !== StatutCourrier.ENREGISTRE) {
                              showAlert('Seuls les courriers enregistrés peuvent être orientés.', 'warning');
                              return;
                            }
                            setContextMenu(prev => ({ ...prev, open: false }));
                            
                            let director = getAppropriateDirector(user);
                            if (!director && laravelApiService.isConfigured()) {
                              await adminService.refreshUsersFromApi();
                              director = getAppropriateDirector(user);
                            }
                            
                            if (!director) {
                              const directorName = `Directeur de ${user?.direction}`;
                              const roleRequis = 'Directeur';
                              const directionRequise = user?.direction;
                              showAlert(`Aucun ${directorName} trouvé. Vérifiez qu'un utilisateur a le rôle "${roleRequis}" et que sa direction est "${directionRequise}" et qu'il est actif.`, 'error');
                              return;
                            }
                            
                            try {
                              await courrierService.createAssignation({
                                courrierId: c.id,
                                assigneA: director.id,
                                assignePar: user.id,
                                statut: 'EN_ATTENTE',
                                instructions: `Orientation secrétariat${user?.direction ? ` ${user.direction}` : ''} vers le Directeur ${director.nom}`
                              });
                              await courrierService.updateCourrier(c.id, { statut: StatutCourrier.ORIENTE_DIRECTEUR }).catch(() => {});
                              setCourrierIdsAssignedToDirectors(prev => new Set(prev).add(String(c.id)));
                              
                              // Vérifier la complétion de la tâche pour le secrétaire (orientation effectuée)
                              const completionCheck = taskCompletionService.checkTaskCompletion(user, {
                                orientationDone: true
                              });
                              if (completionCheck.isComplete) {
                                // Notifier la complétion de la tâche en temps réel
                                realTimeTaskSyncService.notifyTaskCompleted(
                                  c.id,
                                  c.numero || '',
                                  user.id,
                                  user.role,
                                  `Orientation vers le directeur de ${director.direction}`,
                                  completionCheck.reason
                                );
                                showAlert(`Courrier ${c.numero} orienté vers le directeur de ${director.direction}.\n\n${completionCheck.reason}`, 'success');
                              } else {
                                showAlert(`Courrier ${c.numero} orienté vers le directeur de ${director.direction}.`, 'success');
                              }
                              loadCourriers();
                            } catch (_) {
                              showAlert('Erreur lors de l\'orientation.', 'error');
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 text-amber-600" />
                          {contextMenu.courrier && (courrierIdsAssignedToDirectors.has(String(contextMenu.courrier.id)) || contextMenuCourrierOrientedToDirector) ? 'Déjà orienté vers le directeur' : 'Orienter vers le directeur'}
                        </button>
                      );
                    }
                  })()}
                </>
              )}
              {getCourrierSens(contextMenu.courrier!) === SensCourrier.SORTANT && (
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2 border-t border-surface-100 mt-1 pt-2"
                  onClick={() => {
                    setAccuseModalCourrier(contextMenu.courrier);
                    setShowAccuseModal(true);
                    setContextMenu(prev => ({ ...prev, open: false }));
                  }}
                >
                  <FontAwesomeIcon icon={faClipboardCheck} className="w-4 h-4 text-green-600" />
                  <span className="text-green-700 font-medium">Joindre accusés de réception</span>
                </button>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal pour joindre des accusés de réception */}
      {showAccuseModal && accuseModalCourrier && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[50000] flex items-center justify-center p-4" onClick={() => setShowAccuseModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border-2 border-blue-200" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 py-4 border-b-2 border-blue-200 bg-gradient-to-r from-green-600 to-emerald-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <FontAwesomeIcon icon={faClipboardCheck} className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg">Accusés de réception</h3>
                      <p className="text-green-100 text-xs">Courrier {accuseModalCourrier.numero}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowAccuseModal(false);
                      setAccuseModalCourrier(null);
                      setAccuseFiles([]);
                    }}
                    className="w-10 h-10 rounded-xl text-white hover:bg-white/20 flex items-center justify-center transition-all"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Contenu */}
              <div className="p-6 space-y-6">
                <div className="bg-blue-50/50 rounded-xl p-4 border-2 border-blue-200">
                  <div className="flex items-start gap-3">
                    <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-900 mb-1">Information</p>
                      <p className="text-xs text-blue-700">
                        Les accusés de réception seront automatiquement organisés dans une catégorie dédiée pour ce courrier sortant.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Zone d'upload */}
                <div className="border-2 border-dashed border-green-300 rounded-xl p-8 text-center bg-gradient-to-br from-green-50/50 to-emerald-50/30">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                    <FontAwesomeIcon icon={faClipboardCheck} className="text-white text-2xl" />
                  </div>
                  <p className="text-gray-700 font-medium mb-2">Glissez-déposez les accusés de réception ici</p>
                  <p className="text-sm text-gray-500 mb-4">ou</p>
                  <label className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 cursor-pointer font-semibold shadow-lg shadow-green-500/30 transition-all">
                    <FontAwesomeIcon icon={faUpload} />
                    Parcourir les fichiers
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.gif,.webp"
                      onChange={(e) => {
                        if (e.target.files) {
                          setAccuseFiles(Array.from(e.target.files));
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Liste des fichiers sélectionnés */}
                {accuseFiles.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-gray-900">Fichiers sélectionnés ({accuseFiles.length})</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {accuseFiles.map((file, index) => {
                        const isImage = file.type.startsWith('image/');
                        return (
                          <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border-2 border-green-200">
                            <div className="flex items-center gap-3">
                              {isImage ? (
                                <FontAwesomeIcon icon={faFileImage} className="text-green-600" />
                              ) : (
                                <FontAwesomeIcon icon={faFilePdf} className="text-green-600" />
                              )}
                              <div>
                                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                <p className="text-xs text-gray-500">
                                  {(file.size / 1024).toFixed(2)} KB
                                  {isImage && <span className="ml-2 text-green-600 font-semibold">(Stocké dans localStorage)</span>}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setAccuseFiles(prev => prev.filter((_, i) => i !== index));
                              }}
                              className="w-8 h-8 rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center transition-all"
                            >
                              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t-2 border-blue-200 bg-gray-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowAccuseModal(false);
                    setAccuseModalCourrier(null);
                    setAccuseFiles([]);
                  }}
                  className="px-5 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    if (!accuseModalCourrier || accuseFiles.length === 0 || !user) return;
                    
                    setIsAddingAccuses(true);
                    try {
                      // Tous les fichiers (images et non-images) sont envoyés via l'API (createFichier) dans le dossier "Accusés de réception"
                      let accuseDossierId: string | undefined;
                      const existingCategories = dossiersFichiers.get(accuseModalCourrier.id) || [];
                      const accuseDossier = existingCategories.find(d =>
                        d.type === 'categorie' && d.nom === 'Accusés de réception'
                      );

                      if (accuseDossier) {
                        accuseDossierId = accuseDossier.id;
                      } else {
                        const newDossier = await categorieFichierService.createCategorie(
                          accuseModalCourrier.id,
                          'Accusés de réception',
                          undefined,
                          user.id
                        );
                        accuseDossierId = newDossier.id;
                      }

                      for (const file of accuseFiles) {
                        await categorieFichierService.createFichier(
                          accuseModalCourrier.id,
                          file.name,
                          file,
                          accuseDossierId,
                          user.id,
                          file.size,
                          true // estAccuseReception
                        );
                      }

                      const updatedFiles = await categorieFichierService.getCategoriesFichiersByCourrier(accuseModalCourrier.id);
                      setDossiersFichiers(prev => new Map(prev).set(accuseModalCourrier.id, updatedFiles));

                      setShowAccuseModal(false);
                      setAccuseModalCourrier(null);
                      setAccuseFiles([]);
                      
                      await showAlert(`${accuseFiles.length} fichier(s) (dont images) ajouté(s) via l'API avec succès`, 'success');
                    } catch (error: any) {
                      await showAlert(`Erreur lors de l'ajout des accusés de réception: ${error.message}`, 'error');
                    } finally {
                      setIsAddingAccuses(false);
                    }
                  }}
                  disabled={accuseFiles.length === 0 || isAddingAccuses}
                  className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed font-semibold shadow-lg shadow-green-500/30 transition-all inline-flex items-center justify-center gap-2 min-w-[160px]"
                >
                  {isAddingAccuses ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      Chargement…
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faUpload} className="mr-2" />
                      Joindre {accuseFiles.length} fichier{accuseFiles.length > 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Bouton "Voir plus" avec animation skeleton */}
      {filteredCourriers.length > 0 && (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-surface-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-surface-600">
              Affichage de <span className="font-bold text-surface-900">{Math.min(visibleCount, filteredCourriers.length)}</span> sur{' '}
              <span className="font-bold text-blue-600">{filteredCourriers.length}</span> courrier(s)
            </div>
            {hasMoreCourriers && (
              <div className="text-xs text-surface-500 bg-surface-100 px-3 py-1 rounded-full">
                {filteredCourriers.length - visibleCount} restant(s)
              </div>
            )}
          </div>
          
          {hasMoreCourriers && (
            <>
              <div ref={loadMoreSentinelRef} className="h-4 w-full" aria-hidden="true" />
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
              {loadingMore ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  Chargement...
                </>
              ) : (
                <>
                  Voir plus ({filteredCourriers.length - visibleCount} courrier(s))
                  <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                </>
              )}
            </button>
            </>
          )}
          
          {/* Skeleton pendant le chargement progressif */}
          {loadingMore && (
            <div className="space-y-3 mt-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="skeleton w-4 h-4 rounded mt-1 flex-shrink-0" />
                    <div className="skeleton w-10 h-10 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2.5 min-w-0">
                      <div className="skeleton h-5 w-44 rounded" />
                      <div className="skeleton h-4 w-full rounded" />
                      <div className="skeleton h-4 w-3/4 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}



      {/* Modal de création / édition de catégorie (courriers) */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]" onClick={() => closeFolderModal()}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {folderEditingId ? 'Modifier la catégorie' : 'Créer une catégorie'}
              </h3>
              <button
                onClick={closeFolderModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du dossier
                </label>
                <input
                  type="text"
                  value={folderModalName}
                  onChange={(e) => setFolderModalName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveFolder();
                    }
                  }}
                  placeholder="Entrez le nom du dossier"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dossier parent (pour sous-dossier)
                </label>
                <select
                  value={folderModalParentId || ''}
                  onChange={(e) => setFolderModalParentId(e.target.value || undefined)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Racine</option>
                  {courrierFolders
                    .filter(folder => folder.id !== folderEditingId)
                    .map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
              <button
                onClick={closeFolderModal}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveFolder}
                disabled={!folderModalName.trim()}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 transition-all"
              >
                {folderEditingId ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'actions groupées sur les catégories */}
      {showBulkActionsModal && selectedFolderIds.size > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[50000] animate-fadeIn" onClick={() => {
          setShowBulkActionsModal(false);
          setBulkActionType(null);
        }}>
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/20 max-w-md w-full mx-4 transform transition-all animate-slideIn border border-surface-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-surface-200 bg-gradient-to-r from-blue-50 via-white to-cyan-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <FontAwesomeIcon icon={bulkActionType === 'move' ? faFolder : faEdit} className="text-white text-sm" />
                </div>
                <h3 className="text-xl font-bold text-surface-900 tracking-tight">
                  {bulkActionType === 'move' ? 'Déplacer les catégories' : 'Renommer les catégories'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowBulkActionsModal(false);
                  setBulkActionType(null);
                }}
                className="w-8 h-8 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-all duration-200 flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-semibold text-blue-900">
                    {selectedFolderIds.size} catégorie(s) sélectionnée(s)
                  </span>
                </div>
              </div>
              
              {bulkActionType === 'move' ? (
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2.5">
                    Déplacer vers
                  </label>
                  <select
                    value={bulkMoveTargetFolderId || ''}
                    onChange={(e) => setBulkMoveTargetFolderId(e.target.value || null)}
                    className="w-full px-4 py-3 border-2 border-surface-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white text-surface-700 font-medium transition-all duration-200 hover:border-surface-300 cursor-pointer shadow-sm"
                  >
                    <option value="">Racine (niveau supérieur)</option>
                    {courrierFolders
                      .filter(folder => !selectedFolderIds.has(folder.id))
                      .map(folder => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                  </select>
                  <p className="mt-3 text-xs text-surface-500 leading-relaxed">
                    Les catégories sélectionnées seront déplacées vers la catégorie choisie (ou à la racine si aucune n'est sélectionnée).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-surface-700 mb-2.5">
                      Préfixe (ajouté au début)
                    </label>
                    <input
                      type="text"
                      value={bulkRenamePrefix}
                      onChange={(e) => setBulkRenamePrefix(e.target.value)}
                      placeholder="Ex: [2026] "
                      className="w-full px-4 py-3 border-2 border-surface-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white text-surface-700 placeholder-surface-400 transition-all duration-200 hover:border-surface-300 shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-surface-700 mb-2.5">
                      Suffixe (ajouté à la fin)
                    </label>
                    <input
                      type="text"
                      value={bulkRenameSuffix}
                      onChange={(e) => setBulkRenameSuffix(e.target.value)}
                      placeholder="Ex: - Archive"
                      className="w-full px-4 py-3 border-2 border-surface-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white text-surface-700 placeholder-surface-400 transition-all duration-200 hover:border-surface-300 shadow-sm"
                    />
                  </div>
                  <div className="p-3 bg-surface-50 rounded-xl border border-surface-200">
                    <p className="text-xs text-surface-600 leading-relaxed">
                      <span className="font-semibold">Exemple:</span> Si la catégorie s'appelle "Documents" et que vous ajoutez le préfixe "[2026] " et le suffixe " - Archive", 
                      le nouveau nom sera <span className="font-semibold text-blue-600">"[2026] Documents - Archive"</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-surface-200 bg-surface-50/50">
              <button
                onClick={() => {
                  setShowBulkActionsModal(false);
                  setBulkActionType(null);
                }}
                className="px-5 py-2.5 text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 hover:border-surface-300 font-semibold transition-all duration-200 shadow-sm"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (bulkActionType === 'move') {
                    handleMoveSelectedFolders(bulkMoveTargetFolderId);
                  } else {
                    handleRenameSelectedFolders();
                  }
                }}
                disabled={bulkActionType === 'move' ? false : (!bulkRenamePrefix && !bulkRenameSuffix)}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-surface-300 disabled:to-surface-400 disabled:cursor-not-allowed font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {bulkActionType === 'move' ? 'Déplacer' : 'Renommer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'actions groupées pour les courriers */}
      {showCourrierBulkModal && selectedCourriers.size > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[50000] animate-fadeIn" onClick={() => {
          setShowCourrierBulkModal(false);
          setCourrierBulkActionType(null);
        }}>
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/20 max-w-md w-full mx-4 transform transition-all animate-slideIn border border-surface-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-surface-200 bg-gradient-to-r from-blue-50 via-white to-cyan-50">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
                  courrierBulkActionType === 'move' ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/30' :
                  courrierBulkActionType === 'statut' ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/30' :
                  courrierBulkActionType === 'orienter-dg' ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/30' :
                  courrierBulkActionType === 'orienter-directeur' ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/30' :
                  courrierBulkActionType === 'orienter-direction' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30' :
                  'bg-gradient-to-br from-cyan-500 to-cyan-600 shadow-cyan-500/30'
                }`}>
                  <FontAwesomeIcon 
                    icon={courrierBulkActionType === 'move' ? faFolder : courrierBulkActionType === 'statut' ? faTasks : courrierBulkActionType === 'orienter-dg' || courrierBulkActionType === 'orienter-directeur' || courrierBulkActionType === 'orienter-direction' ? faArrowRight : faExclamationTriangle} 
                    className="text-white text-sm" 
                  />
                </div>
                <h3 className="text-xl font-bold text-surface-900 tracking-tight">
                  {courrierBulkActionType === 'move' && 'Déplacer les courriers'}
                  {courrierBulkActionType === 'statut' && 'Changer le statut'}
                  {courrierBulkActionType === 'priorite' && 'Changer la priorité'}
                  {courrierBulkActionType === 'orienter-dg' && 'Orienter vers le Directeur Général'}
                  {courrierBulkActionType === 'orienter-directeur' && `Orienter vers le directeur de ${user?.direction}`}
                  {courrierBulkActionType === 'orienter-direction' && 'Orienter vers une direction'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowCourrierBulkModal(false);
                  setCourrierBulkActionType(null);
                }}
                className="w-8 h-8 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-all duration-200 flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-semibold text-blue-900">
                    {selectedCourriers.size} courrier(s) sélectionné(s)
                  </span>
                </div>
              </div>
              
              {courrierBulkActionType === 'move' ? (
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2.5">
                    Déplacer vers
                  </label>
                  <select
                    value={courrierBulkMoveTargetFolderId || ''}
                    onChange={(e) => setCourrierBulkMoveTargetFolderId(e.target.value || null)}
                    className="w-full px-4 py-3 border-2 border-surface-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white text-surface-700 font-medium transition-all duration-200 hover:border-surface-300 cursor-pointer shadow-sm"
                  >
                    <option value="">Retirer des catégories</option>
                    {courrierFolders.map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-xs text-surface-500 leading-relaxed">
                    Les courriers sélectionnés seront déplacés vers la catégorie choisie (ou retirés des catégories si aucune n'est sélectionnée).
                  </p>
                </div>
              ) : courrierBulkActionType === 'statut' ? (
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2.5">
                    Nouveau statut
                  </label>
                  <select
                    value={courrierBulkStatut}
                    onChange={(e) => setCourrierBulkStatut(e.target.value as StatutCourrier | '')}
                    className="w-full px-4 py-3 border-2 border-surface-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white text-surface-700 font-medium transition-all duration-200 hover:border-surface-300 cursor-pointer shadow-sm"
                  >
                    <option value="">Sélectionner un statut</option>
                    {Object.values(StatutCourrier).map(statut => (
                      <option key={statut} value={statut}>
                        {statut === 'ENREGISTRE' ? 'Enregistré' :
                         statut === 'EN_ATTENTE_DG' ? 'En attente DG' :
                         statut === 'ORIENTE_DG' ? 'Orienté vers le DG' :
                         statut === 'ORIENTE_DIRECTEUR' ? 'Orienté vers le Directeur' :
                         statut === 'EN_TRAITEMENT' ? 'En traitement' :
                         statut === 'ASSIGNE' ? 'Assigné' :
                         statut === 'TRAITE' ? 'Traité' :
                         statut === 'ARCHIVE' ? 'Archivé' : statut}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-xs text-surface-500 leading-relaxed">
                    Le statut de tous les courriers sélectionnés sera mis à jour.
                  </p>
                </div>
              ) : courrierBulkActionType === 'priorite' ? (
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2.5">
                    Nouvelle priorité
                  </label>
                  <select
                    value={courrierBulkPriorite}
                    onChange={(e) => setCourrierBulkPriorite(e.target.value as Priorite | '')}
                    className="w-full px-4 py-3 border-2 border-surface-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white text-surface-700 font-medium transition-all duration-200 hover:border-surface-300 cursor-pointer shadow-sm"
                  >
                    <option value="">Sélectionner une priorité</option>
                    {Object.values(Priorite).map(priorite => (
                      <option key={priorite} value={priorite}>
                        {priorite}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-xs text-surface-500 leading-relaxed">
                    La priorité de tous les courriers sélectionnés sera mise à jour.
                  </p>
                </div>
              ) : courrierBulkActionType === 'orienter-dg' ? (
                <div>
                  <p className="text-sm text-surface-700">
                    Les courriers sélectionnés seront assignés au Directeur Général avec une orientation secrétariat DG. Une assignation en attente sera créée pour chaque courrier.
                  </p>
                  {(() => {
                    const alreadyCount = Array.from(selectedCourriers).filter(id => courrierIdsAssignedToDG.has(id)).length;
                    return alreadyCount > 0 ? (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        {alreadyCount} courrier(s) déjà orienté(s) vers le DG seront ignorés.
                      </p>
                    ) : null;
                  })()}
                </div>
              ) : courrierBulkActionType === 'orienter-directeur' ? (
                <div>
                  <p className="text-sm text-surface-700">
                    Les courriers sélectionnés seront assignés au directeur de {user?.direction} avec une orientation secrétariat. Une assignation en attente sera créée pour chaque courrier.
                  </p>
                  {(() => {
                    const alreadyCount = Array.from(selectedCourriers).filter(id => courrierIdsAssignedToDirectors.has(id)).length;
                    return alreadyCount > 0 ? (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        {alreadyCount} courrier(s) déjà orienté(s) vers le directeur seront ignorés.
                      </p>
                    ) : null;
                  })()}
                </div>
              ) : courrierBulkActionType === 'orienter-direction' ? (
                <div>
                  <label className="block text-sm font-semibold text-surface-700 mb-2.5">
                    Direction concernée
                  </label>
                  <select
                    value={courrierBulkOrienterDirectionNom || ''}
                    onChange={(e) => setCourrierBulkOrienterDirectionNom(e.target.value || null)}
                    className="w-full px-4 py-3 border-2 border-surface-200 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 bg-white text-surface-700 font-medium transition-all duration-200 hover:border-surface-300 cursor-pointer shadow-sm"
                  >
                    <option value="">Choisir une direction</option>
                    {availableDirections.map((nom) => (
                      <option key={nom} value={nom}>
                        {nom}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-xs text-surface-500 leading-relaxed">
                    Les courriers (notamment internes) seront rattachés à cette direction et le directeur concerné sera assigné en attente si disponible.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-surface-200 bg-surface-50/50">
              <button
                onClick={() => {
                  setShowCourrierBulkModal(false);
                  setCourrierBulkActionType(null);
                }}
                className="px-5 py-2.5 text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 hover:border-surface-300 font-semibold transition-all duration-200 shadow-sm"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (courrierBulkActionType === 'move') {
                    handleMoveSelectedCourriers(courrierBulkMoveTargetFolderId);
                  } else if (courrierBulkActionType === 'statut') {
                    handleChangeSelectedCourriersStatut();
                  } else if (courrierBulkActionType === 'priorite') {
                    handleChangeSelectedCourriersPriorite();
                  } else if (courrierBulkActionType === 'orienter-dg') {
                    handleBulkOrienterVersDG();
                  } else if (courrierBulkActionType === 'orienter-directeur') {
                    handleBulkOrienterVersDirecteur();
                  } else if (courrierBulkActionType === 'orienter-direction') {
                    handleBulkOrienterVersDirection();
                  }
                }}
                disabled={
                  (courrierBulkActionType === 'statut' && !courrierBulkStatut) ||
                  (courrierBulkActionType === 'priorite' && !courrierBulkPriorite) ||
                  (courrierBulkActionType === 'orienter-direction' && !courrierBulkOrienterDirectionNom) ||
                  (courrierBulkActionType === 'orienter-directeur' && selectedCourriers.size > 0 && Array.from(selectedCourriers).every(id => courrierIdsAssignedToDirectors.has(id))) ||
                  (courrierBulkActionType === 'orienter-dg' && selectedCourriers.size > 0 && Array.from(selectedCourriers).every(id => courrierIdsAssignedToDG.has(id))) ||
                  bulkOrienterLoading
                }
                className={`px-6 py-2.5 text-white rounded-xl font-semibold shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:from-surface-300 disabled:to-surface-400 disabled:cursor-not-allowed ${
                  courrierBulkActionType === 'move' 
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40' :
                  courrierBulkActionType === 'statut'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40' :
                  courrierBulkActionType === 'orienter-dg'
                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-amber-500/30' :
                  courrierBulkActionType === 'orienter-directeur'
                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-amber-500/30' :
                  courrierBulkActionType === 'orienter-direction'
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-emerald-500/30' :
                    'bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40'
                }`}
              >
                {bulkOrienterLoading ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin mr-2" />
                    En cours…
                  </>
                ) : courrierBulkActionType === 'move' ? 'Déplacer' : courrierBulkActionType === 'orienter-dg' ? 'Orienter vers DG' : courrierBulkActionType === 'orienter-directeur' ? 'Orienter vers directeur' : courrierBulkActionType === 'orienter-direction' ? 'Orienter' : 'Appliquer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de dossier */}
      {showDossierModal && dossierModalData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]" onClick={() => closeDossierModal()}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {dossierModalData.parentId ? 'Créer un sous-dossier' : 'Créer un dossier'}
              </h3>
              <button
                onClick={closeDossierModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="p-4">
              {dossierModalData.parentId && (
                <div className="mb-4 p-2 bg-blue-50 rounded text-sm text-blue-800">
                  <span className="font-medium">Dossier parent :</span> {dossierModalData.parentName}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du dossier
                </label>
                <input
                  type="text"
                  value={newDossierName}
                  onChange={(e) => setNewDossierName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateDossier();
                    }
                  }}
                  placeholder="Entrez le nom du dossier"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
              <button
                onClick={closeDossierModal}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateDossier}
                disabled={!newDossierName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'ajout de fichiers (portail pour affichage au premier plan) */}
      {showAddFileModal && addFileModalData && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999]"
          onClick={() => {
            if (addFileModalJustDroppedRef.current) {
              addFileModalJustDroppedRef.current = false;
              return;
            }
            closeAddFileModal();
          }}
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
                <p className="text-xs text-gray-500 mt-0.5">Images, PDF, Word, Excel… — enregistrés sur le serveur Laravel</p>
                <p className="text-xs text-slate-500 mt-0.5">Taille max. : {importLimits.maxSizeMo} Mo{importLimits.compressImages ? ' · Compression automatique des images' : ''}</p>
              </div>
              <button
                onClick={closeAddFileModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="p-4">
              {/* Input fichier : dans le modal pour que ref/getElementById le trouve au clic sur Parcourir */}
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
              {/* Phase terminée : résumé et éventuelles erreurs */}
              {uploadProgress?.phase === 'done' && (
                <div className="space-y-4 mb-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={uploadProgress.failed.length === 0 ? faCheckCircle : faExclamationTriangle} className={`text-2xl ${uploadProgress.failed.length === 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {uploadProgress.failed.length === 0
                          ? `${uploadProgress.succeeded} fichier(s) ajouté(s) avec succès`
                          : `${uploadProgress.succeeded} réussi(s), ${uploadProgress.failed.length} en erreur`}
                      </p>
                      {uploadProgress.failed.length > 0 && (
                        <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto text-sm text-red-700">
                          {uploadProgress.failed.map((f, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span><strong>{f.fileName || 'Fichier'}</strong> : {f.error}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={closeAddFileModal} className="px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium">
                      Fermer
                    </button>
                    <button type="button" onClick={resetAddFileModalToIdle} className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-2">
                      <FontAwesomeIcon icon={faPlus} /> Ajouter d'autres fichiers
                    </button>
                  </div>
                </div>
              )}

              {/* Phase envoi en cours */}
              {uploadProgress?.phase === 'uploading' && (
                <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-3 mb-3">
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin text-blue-600 text-xl" />
                    <span className="font-medium text-blue-900">
                      Envoi {uploadProgress.current + 1} / {uploadProgress.total}
                      {uploadProgress.currentFileName && (
                        <span className="block text-sm font-normal text-blue-700 truncate mt-0.5" title={uploadProgress.currentFileName}>{uploadProgress.currentFileName}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress.total ? Math.round(((uploadProgress.current + 1) / uploadProgress.total) * 100) : 0}%` }} />
                  </div>
                </div>
              )}

              {/* Alerte si API Laravel ou token manquant — les fichiers ne pourront pas être enregistrés (masquée pendant upload/done) */}
              {uploadProgress?.phase !== 'uploading' && uploadProgress?.phase !== 'done' && (!laravelApiService.isConfigured() || !(typeof localStorage !== 'undefined' && (localStorage.getItem('laravel_token') || localStorage.getItem('auth_token')))) && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm">
                  <strong>L’ajout de fichiers ne fonctionnera pas</strong> tant que l’API Laravel est démarrée (port 8000) et que vous êtes connecté avec un token Laravel. Déconnectez-vous puis reconnectez-vous si les fichiers ne s’enregistrent pas.
                </div>
              )}

              {/* Zone principale : Parcourir et Glisser-déposer (masquée pendant upload/done) */}
              {uploadProgress?.phase !== 'uploading' && uploadProgress?.phase !== 'done' && (
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
                      {addFileModalDraggingOver ? 'Déposez les fichiers ici' : 'Glissez-déposez vos fichiers ici (Explorer, bureau)'}
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
                      {selectedFiles.map((file, index) => {
                        const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
                        return (
                          <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 min-w-0">
                              <FontAwesomeIcon icon={getFileIcon(ext, file.name)} className={`shrink-0 ${getFileIconColor(ext, file.name)}`} />
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
                        );
                      })}
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
              )}
            </div>
            {uploadProgress?.phase !== 'done' && (
            <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50 sticky bottom-0">
              <button type="button" onClick={closeAddFileModal} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmAddFiles}
                disabled={selectedFiles.length === 0 || isAddingFiles || uploadProgress?.phase === 'uploading'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 min-w-[120px]"
              >
                {isAddingFiles || uploadProgress?.phase === 'uploading' ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                    Envoi en cours…
                  </>
                ) : (
                  <>Ajouter {selectedFiles.length > 0 && `(${selectedFiles.length})`}</>
                )}
              </button>
            </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modal Scan et prévisualisation — Design moderne inspiré de la liste des courriers */}
      {showScanModal && createPortal(
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={() => closeScanModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-modal-title"
        >
          <div
            className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête moderne */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/50 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-6 py-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 rounded-2xl blur-xl opacity-20"></div>
                  <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <FontAwesomeIcon icon={faPrint} className="text-white w-6 h-6" />
                  </div>
                </div>
                <div>
                  <h2 id="scan-modal-title" className="text-xl font-bold text-slate-900 truncate">
                    Scan et traitement de documents
                  </h2>
                  <p className="text-sm text-slate-600 mt-0.5">Numérisation et prévisualisation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => closeScanModal()}
                className="shrink-0 rounded-2xl p-3 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 transition-all duration-200"
                aria-label="Fermer"
              >
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>
            
            {/* Contenu principal en deux colonnes */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-full">
                {/* Colonne de gauche - Prévisualisation */}
                <div className="flex flex-col space-y-4">
                  {/* Carte Prévisualisation */}
                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-lg overflow-hidden">
                    <div className="p-5 flex-shrink-0">
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
                              <button
                                type="button"
                                onClick={() => setShowScanPopout(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 text-sm font-bold transition-all duration-300 shadow-lg transform hover:scale-[1.02] active:scale-[0.98]"
                              >
                                <FontAwesomeIcon icon={faExpand} className="w-4 h-4" />
                                <span>Ouvrir en popout</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => scanModalPreviewUrl && window.open(scanModalPreviewUrl, '_blank', 'noopener,noreferrer')}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-sm border border-slate-200/50 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-medium transition-all duration-200 shadow-sm"
                              >
                                <FontAwesomeIcon icon={faLink} className="w-4 h-4" />
                                <span>Nouvel onglet</span>
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
                                        <span className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                                          <FontAwesomeIcon icon={faFilePdf} className="text-red-500" /> {scanModalPreviewFile.name}
                                        </span>
                                        <a href={scanModalPreviewUrl} target="_blank" rel="noopener noreferrer"
                                          className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                          <FontAwesomeIcon icon={faLink} className="w-3 h-3" /> Ouvrir
                                        </a>
                                      </div>
                                      <iframe
                                        src={scanModalPreviewUrl}
                                        title="Aperçu PDF"
                                        className="flex-1 w-full"
                                        style={{ minHeight: 480, border: 'none' }}
                                      />
                                    </div>
                                  ) : isImage ? (
                                    <div className="flex flex-col">
                                      <div className="flex-shrink-0 flex flex-wrap items-center gap-3 p-4 bg-white/70 backdrop-blur-sm border-b border-slate-200/50 rounded-t-2xl">
                                        <span className="text-sm font-medium text-slate-700">Affichage:</span>
                                        <div className="flex items-center gap-2">
                                          <button type="button" onClick={() => setImagePreviewZoom((z) => Math.max(0.25, z - 0.25))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all duration-200" title="Zoom arrière">
                                            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-4 h-4" />
                                          </button>
                                          <span className="text-sm font-medium text-slate-600 min-w-[3rem] text-center bg-slate-100 px-2 py-1 rounded-lg">{Math.round(imagePreviewZoom * 100)}%</span>
                                          <button type="button" onClick={() => setImagePreviewZoom((z) => Math.min(3, z + 0.25))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all duration-200" title="Zoom avant">
                                            <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-4 h-4" />
                                          </button>
                                        </div>
                                        <button type="button" onClick={() => { setImagePreviewZoom(1); setImagePreviewRotation(0); }} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-all duration-200" title="Réinitialiser">
                                          <FontAwesomeIcon icon={faExpand} className="mr-1.5 w-4 h-4" /> Réinitialiser
                                        </button>
                                        <div className="h-4 w-px bg-slate-300"></div>
                                        <div className="flex items-center gap-2">
                                          <button type="button" onClick={() => setImagePreviewRotation((r) => (r - 90 + 360) % 360 as 0 | 90 | 180 | 270)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all duration-200" title="Pivoter à gauche">
                                            <FontAwesomeIcon icon={faRotateLeft} className="w-4 h-4" />
                                          </button>
                                          <span className="text-sm font-medium text-slate-600 min-w-[2.5rem] text-center bg-slate-100 px-2 py-1 rounded-lg">{imagePreviewRotation}°</span>
                                          <button type="button" onClick={() => setImagePreviewRotation((r) => (r + 90) % 360 as 0 | 90 | 180 | 270)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all duration-200" title="Pivoter à droite">
                                            <FontAwesomeIcon icon={faRotateRight} className="w-4 h-4" />
                                          </button>
                                        </div>
                                        <div className="h-4 w-px bg-slate-300"></div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-slate-700">Ajuster:</span>
                                          {(['contain', 'cover', 'fill'] as const).map((fit) => (
                                            <button key={fit} type="button" onClick={() => setImagePreviewFit(fit)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                                              imagePreviewFit === fit 
                                                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg' 
                                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                            }`} title={fit === 'contain' ? 'Contenir (voir tout)' : fit === 'cover' ? 'Couvrir (remplir)' : 'Étirer'}>
                                              {fit === 'contain' ? 'Contenir' : fit === 'cover' ? 'Couvrir' : 'Étirer'}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50/30 min-h-[400px]">
                                        <div className="bg-white rounded-2xl overflow-hidden relative flex items-center justify-center w-full shadow-xl" style={{ boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', maxWidth: '100%' }}>
                                          <img
                                            key={scanModalPreviewUrl}
                                            src={scanModalPreviewUrl}
                                            alt="Document scanné"
                                            onLoad={(e) => {
                                              const img = e.currentTarget;
                                              if (img.naturalWidth && img.naturalHeight) setImagePreviewSize({ w: img.naturalWidth, h: img.naturalHeight });
                                            }}
                                            className="max-w-full max-h-full w-auto h-auto origin-center transition-transform duration-300 object-contain rounded-2xl"
                                            style={{ objectFit: imagePreviewFit, transform: `scale(${imagePreviewZoom}) rotate(${imagePreviewRotation}deg)`, minHeight: 1 }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center p-8 text-center">
                                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                                        <FontAwesomeIcon icon={faFile} className="text-slate-400 w-8 h-8" />
                                      </div>
                                      <p className="text-sm font-medium text-slate-600">Format non prévisualisable</p>
                                      <p className="text-xs text-slate-500 mt-1">({file.type || 'inconnu'})</p>
                                      {file.size != null && file.size > 0 && (
                                        <p className="text-xs text-slate-500 mt-2 font-medium">
                                          Taille: {file.size < 1024 ? file.size + ' o' : file.size < 1024 * 1024 ? (file.size / 1024).toFixed(2) + ' KB' : (file.size / (1024 * 1024)).toFixed(2) + ' MB'}
                                        </p>
                                      )}
                                      <p className="text-xs text-slate-400 mt-3">Utilisez le bouton ci-dessus pour ouvrir dans un nouvel onglet</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center py-12">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                              <FontAwesomeIcon icon={faPrint} className="text-slate-300 w-8 h-8" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">Aucun document à prévisualiser</p>
                            <p className="text-xs text-slate-400 mt-1">Lancez un scan pour afficher l'aperçu ici</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Colonne de droite - Contrôles et paramètres */}
                <div className="flex flex-col space-y-4">
                  {/* Carte Périphérique de scan */}
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
                        <label htmlFor="scan-modal-scanner" className="block text-sm font-semibold text-slate-700">
                          Scanner disponible
                        </label>
                        {scannersLoading ? (
                          <div className="flex items-center gap-3 rounded-xl border border-slate-200/50 bg-white/70 px-4 py-3 text-sm text-slate-600">
                            <div className="relative">
                              <div className="absolute inset-0 bg-blue-500 rounded-full blur-lg opacity-20 animate-pulse"></div>
                              <div className="relative">
                                <FontAwesomeIcon icon={faSpinner} className="animate-spin w-5 h-5 text-blue-600" />
                              </div>
                            </div>
                            <span>Détection des scanners...</span>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <select
                              id="scan-modal-scanner"
                              value={selectedScanner}
                              onChange={(e) => setSelectedScanner(e.target.value)}
                              className="flex-1 rounded-xl border border-slate-200/50 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white/70 backdrop-blur-sm transition-all duration-200"
                            >
                              <option value="">Choisir un scanner...</option>
                              {scanners.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name || (s.ipAddress ? `Scanner réseau ${s.ipAddress}` : s.model || s.id || 'Scanner')}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={refreshScannersInModal}
                              disabled={scannersLoading}
                              className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-300/50 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-all duration-200 shadow-sm"
                              title="Rafraîchir la liste des scanners"
                            >
                              <FontAwesomeIcon icon={faRotateRight} className={scannersLoading ? 'animate-spin' : ''} />
                              <span>Rafraîchir</span>
                            </button>
                          </div>
                        )}
                        {!scannersLoading && scanners.length === 0 && (
                          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 w-4 h-4" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-amber-900">Aucun scanner détecté</p>
                                <p className="text-xs text-amber-700 mt-1">
                                  Vérifiez le serveur de scan (port 3001) et configurez les scanners dans{' '}
                                  <Link to="/parametres" className="font-medium underline text-amber-800 hover:text-amber-900" onClick={() => closeScanModal()}>
                                    Paramètres &gt; Gestion des scanners
                                  </Link>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Statut du serveur */}
                      <div className="mt-4 flex items-center gap-3">
                        <div className="relative">
                          <div className={`w-2 h-2 rounded-full ${
                            scanBackendStatus === 'checking' ? 'bg-amber-500 animate-pulse' :
                            scanBackendStatus === 'ok' ? 'bg-emerald-500' :
                            'bg-red-500'
                          }`}></div>
                          {scanBackendStatus === 'ok' && (
                            <div className="absolute inset-0 bg-emerald-500 rounded-full blur-lg opacity-30"></div>
                          )}
                        </div>
                        <span className={`text-sm font-medium ${
                          scanBackendStatus === 'checking' ? 'text-amber-600' :
                          scanBackendStatus === 'ok' ? 'text-emerald-600' :
                          'text-red-600'
                        }`}>
                          {scanBackendStatus === 'checking' && 'Vérification du serveur...'}
                          {scanBackendStatus === 'ok' && 'Serveur de scan : Connecté'}
                          {scanBackendStatus === 'error' && 'Serveur de scan : Hors ligne'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Carte Paramètres de scan */}
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
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="font-medium text-slate-700">Format:</span>
                            <span className="text-slate-600">{scanSettings.format ?? 'PDF'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                            <span className="font-medium text-slate-700">Source:</span>
                            <span className="text-slate-600">{scanSettings.scanSource ?? 'vitre'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="font-medium text-slate-700">Page:</span>
                            <span className="text-slate-600">{scanSettings.pageSize ?? 'A4'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            <span className="font-medium text-slate-700">Résolution:</span>
                            <span className="text-slate-600">{scanSettings.resolution ?? 300} dpi</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                            <span className="font-medium text-slate-700">Couleur:</span>
                            <span className="text-slate-600">{scanSettings.color !== false ? 'Oui' : 'N&B'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="font-medium text-slate-700">Orientation:</span>
                            <span className="text-slate-600">
                              {scanSettings.orientation === 'landscape' ? 'paysage' : 
                               scanSettings.orientation === 'portrait' ? 'portrait' : 'auto'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-slate-200/50">
                          <Link 
                            to="/parametres" 
                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                            onClick={() => closeScanModal()}
                          >
                            <FontAwesomeIcon icon={faEdit} className="w-4 h-4" />
                            Modifier dans Paramètres &gt; Scanners
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages d'erreur */}
                  {scanModalError && (
                    <div className={`rounded-2xl border p-4 text-sm backdrop-blur-sm ${
                      scanModalError === 'Scan annulé'
                        ? 'border-slate-300/50 bg-slate-50/70 text-slate-700'
                        : 'border-red-300/50 bg-red-50/70 text-red-800'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          scanModalError === 'Scan annulé' ? 'bg-slate-100' : 'bg-red-100'
                        }`}>
                          <FontAwesomeIcon 
                            icon={scanModalError === 'Scan annulé' ? faInfoCircle : faExclamationTriangle} 
                            className={`w-4 h-4 ${
                              scanModalError === 'Scan annulé' ? 'text-slate-600' : 'text-red-600'
                            }`} 
                          />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">
                            {scanModalError === 'Scan annulé' ? 'Information' : 'Erreur de scan'}
                          </p>
                          <p className="mt-1">{scanModalError}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Pied de page moderne */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-slate-200/50 bg-gradient-to-r from-slate-50/70 to-blue-50/30 px-6 py-5">
              {/* Actions de numérisation */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleScanInModal()}
                  disabled={scanning || !selectedScanner || scanners.length === 0 || scanBackendStatus === 'error' || scannersLoading}
                  className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-3 text-sm font-bold text-white hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {scanning ? (
                    <>
                      <div className="relative">
                        <div className="absolute inset-0 bg-white rounded-full blur-lg opacity-20 animate-pulse"></div>
                        <div className="relative">
                          <FontAwesomeIcon icon={faSpinner} className="animate-spin w-5 h-5" />
                        </div>
                      </div>
                      <span>Numérisation en cours...</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faPrint} className="w-5 h-5" />
                      <span>Scanner un document</span>
                    </>
                  )}
                </button>
                
                {scanning && (
                  <button
                    type="button"
                    onClick={handleCancelScan}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-red-300/50 bg-white/70 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-all duration-200"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                    <span>Annuler</span>
                  </button>
                )}
              </div>
              
              {/* Actions sur le document */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="sr-only">Actions sur le document</span>
                {scanModalPreviewFile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (scanModalPreviewFile) {
                          const url = URL.createObjectURL(scanModalPreviewFile);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = scanModalPreviewFile.name || 'scan.pdf';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:from-emerald-600 hover:to-teal-700 shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                      <span>Télécharger</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (scanModalPreviewFile) {
                          handleAddScannedToFiles();
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:from-blue-600 hover:to-indigo-700 shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                      <span>Ajouter au courrier</span>
                    </button>
                  </>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    Scannez un document pour débloquer les actions
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => closeScanModal()}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-300/50 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-all duration-200"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                  <span>Fermer</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Registre - Génération du registre papier */}
      {showRegistreModal && createPortal(
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => setShowRegistreModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="registre-modal-title"
        >
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-green-50 px-6 py-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center shadow-md">
                    <FontAwesomeIcon icon={faBook} className="text-white w-6 h-6" />
                  </div>
                </div>
                <div>
                  <h2 id="registre-modal-title" className="text-xl font-bold text-slate-900 truncate">
                    Générer le Registre
                  </h2>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {`${filteredCourriersCount} courriers sélectionnés`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegistreModal(false)}
                className="shrink-0 rounded-2xl p-3 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                aria-label="Fermer"
              >
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Colonne gauche : Filtres */}
                <div className="space-y-6">
                  {/* Filtres de courriers */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Filtres</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Filtrer par sens</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={() => handleFilterSens(registreConfig.filterSens === 'ENTRANT' ? 'ALL' : 'ENTRANT')}
                            className={`px-3 py-2.5 rounded-lg text-sm font-medium ${registreConfig.filterSens === 'ENTRANT' ? 'bg-indigo-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            Entrant
                          </button>
                          <button 
                            onClick={() => handleFilterSens(registreConfig.filterSens === 'SORTANT' ? 'ALL' : 'SORTANT')}
                            className={`px-3 py-2.5 rounded-lg text-sm font-medium ${registreConfig.filterSens === 'SORTANT' ? 'bg-indigo-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            Sortant
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Filtrer par type</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={() => handleFilterType(registreConfig.filterType === 'EXTERNE' ? 'ALL' : 'EXTERNE')}
                            className={`px-3 py-2.5 rounded-lg text-sm font-medium ${registreConfig.filterType === 'EXTERNE' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            Externe
                          </button>
                          <button 
                            onClick={() => handleFilterType(registreConfig.filterType === 'INTERNE' ? 'ALL' : 'INTERNE')}
                            className={`px-3 py-2.5 rounded-lg text-sm font-medium ${registreConfig.filterType === 'INTERNE' ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            Interne
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Statut</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => handleFilterStatut(registreConfig.filterStatut === 'EN_ATTENTE_DG' ? 'ALL' : 'EN_ATTENTE_DG')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterStatut === 'EN_ATTENTE_DG' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>En attente</button>
                          <button onClick={() => handleFilterStatut(registreConfig.filterStatut === 'EN_TRAITEMENT' ? 'ALL' : 'EN_TRAITEMENT')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterStatut === 'EN_TRAITEMENT' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>En cours</button>
                          <button onClick={() => handleFilterStatut(registreConfig.filterStatut === 'TRAITE' ? 'ALL' : 'TRAITE')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterStatut === 'TRAITE' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Terminé</button>
                          <button onClick={() => handleFilterStatut(registreConfig.filterStatut === 'ARCHIVE' ? 'ALL' : 'ARCHIVE')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterStatut === 'ARCHIVE' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Annulé</button>
                          <button onClick={() => handleFilterStatut(registreConfig.filterStatut === 'ENREGISTRE' ? 'ALL' : 'ENREGISTRE')} className={`px-3 py-2 rounded-lg text-sm font-medium col-span-2 ${registreConfig.filterStatut === 'ENREGISTRE' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Enregistre</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Priorité</label>
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => handleFilterPriorite(registreConfig.filterPriorite === 'HAUTE' ? 'ALL' : 'HAUTE')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterPriorite === 'HAUTE' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Haute</button>
                          <button onClick={() => handleFilterPriorite(registreConfig.filterPriorite === 'MOYENNE' ? 'ALL' : 'MOYENNE')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterPriorite === 'MOYENNE' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Moyenne</button>
                          <button onClick={() => handleFilterPriorite(registreConfig.filterPriorite === 'BASSE' ? 'ALL' : 'BASSE')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterPriorite === 'BASSE' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Basse</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Recherche</label>
                        <input
                          type="text"
                          value={registreConfig.filterSearch}
                          onChange={handleFilterSearchChange}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                          placeholder="Rechercher..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Date début</label>
                        <input
                          type="date"
                          value={registreConfig.filterDateDebut}
                          onChange={handleFilterDateDebutChange}
                          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Date fin</label>
                        <input
                          type="date"
                          value={registreConfig.filterDateFin}
                          onChange={handleFilterDateFinChange}
                          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="filterMesAssignations"
                          checked={registreConfig.filterMesAssignations}
                          onChange={handleFilterMesAssignationsChange}
                          className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                        />
                        <label htmlFor="filterMesAssignations" className="text-sm text-slate-700 cursor-pointer">
                          Mes assignations
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="filterNonClassifies"
                          checked={registreConfig.filterNonClassifies}
                          onChange={handleFilterNonClassifiesChange}
                          className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                        />
                        <label htmlFor="filterNonClassifies" className="text-sm text-slate-700 cursor-pointer">
                          Non classés
                        </label>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Annotation DG</label>
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => handleFilterAnnotationDG('ALL')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterAnnotationDG === 'ALL' ? 'bg-slate-700 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Tous</button>
                          <button onClick={() => handleFilterAnnotationDG('AVEC_ANNOTATION_DG')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterAnnotationDG === 'AVEC_ANNOTATION_DG' ? 'bg-amber-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Avec annot. DG</button>
                          <button onClick={() => handleFilterAnnotationDG('SANS_ANNOTATION_DG')} className={`px-3 py-2 rounded-lg text-sm font-medium ${registreConfig.filterAnnotationDG === 'SANS_ANNOTATION_DG' ? 'bg-rose-500 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Sans annot. DG</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Filtre hiérarchique</label>
                        <div className="space-y-2">
                          {/* Chemin hiérarchique */}
                          {hierarchicalPath.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap text-sm">
                              <button
                                onClick={() => {
                                  setHierarchicalPath([]);
                                  setSelectedParentEntity(null);
                                  setHierarchicalLevel(0);
                                  setRegistreConfig({ ...registreConfig, filterEntityId: 'ALL' });
                                }}
                                className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
                              >
                                Directions
                              </button>
                              {hierarchicalPath.map((step, index) => (
                                <React.Fragment key={step.id}>
                                  <span className="text-slate-400">/</span>
                                  <button
                                    onClick={() => {
                                      setHierarchicalPath(hierarchicalPath.slice(0, index + 1));
                                      setSelectedParentEntity(step.id);
                                      setHierarchicalLevel(index + 1 as any);
                                      setRegistreConfig({ ...registreConfig, filterEntityId: step.id });
                                    }}
                                    className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
                                  >
                                    {step.nom}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                          
                          {/* Sélecteur d'entités selon le niveau hiérarchique */}
                          <select
                            value={registreConfig.filterEntityId}
                            onChange={(e) => {
                              const selectedId = e.target.value;
                              if (selectedId === 'ALL') {
                                setRegistreConfig({ ...registreConfig, filterEntityId: 'ALL' });
                              } else {
                                const selectedEntity = entiteOrganisationnelleService.getEntityById(selectedId);
                                if (selectedEntity) {
                                  // Vérifier si l'entité a des enfants
                                  const children = entiteOrganisationnelleService.getEntitiesByParent(selectedId);
                                  if (children.length > 0) {
                                    // Ajouter au chemin hiérarchique et descendre d'un niveau
                                    setHierarchicalPath([...hierarchicalPath, { id: selectedEntity.id, nom: selectedEntity.nom, type: selectedEntity.type }]);
                                    setSelectedParentEntity(selectedId);
                                    setHierarchicalLevel((hierarchicalLevel + 1) as any);
                                    setRegistreConfig({ ...registreConfig, filterEntityId: 'ALL' });
                                  } else {
                                    // Aucun enfant, c'est le niveau le plus bas, appliquer le filtre
                                    setRegistreConfig({ ...registreConfig, filterEntityId: selectedId });
                                  }
                                }
                              }
                            }}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                          >
                            <option value="ALL">
                              {hierarchicalPath.length === 0 ? 'Toutes les directions' : 'Tous'}
                            </option>
                            {(hierarchicalPath.length === 0
                              ? entiteOrganisationnelleService.getDirectionsForFilters()
                              : (selectedParentEntity ? entiteOrganisationnelleService.getEntitiesByParent(selectedParentEntity) : [])
                            ).map(entity => (
                              <option key={entity.id} value={entity.id}>
                                {entity.nom}
                                {entiteOrganisationnelleService.getEntitiesByParent(entity.id).length > 0 && ' ▼'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Informations sur les filtres actifs */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Filtres actifs</h3>
                    <div className="space-y-2 text-sm text-slate-600">
                      {filters.sens && filters.sens !== 'ALL' && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          <span>Sens: {filters.sens}</span>
                        </div>
                      )}
                      {filters.type && filters.type !== 'ALL' && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          <span>Type: {filters.type}</span>
                        </div>
                      )}
                      {filters.statut && filters.statut !== 'ALL' && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          <span>Statut: {filters.statut}</span>
                        </div>
                      )}
                      {registreConfig.filterAnnotationDG !== 'ALL' && (
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${registreConfig.filterAnnotationDG === 'AVEC_ANNOTATION_DG' ? 'bg-amber-500' : 'bg-rose-500'}`}></span>
                          <span>{registreConfig.filterAnnotationDG === 'AVEC_ANNOTATION_DG' ? 'Avec annotation DG' : 'Sans annotation DG'}</span>
                        </div>
                      )}
                      {!filters.sens && !filters.type && !filters.statut && registreConfig.filterAnnotationDG === 'ALL' && (
                        <div className="text-slate-500 italic">Aucun filtre actif</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Colonne droite : Autres paramètres */}
                <div className="space-y-6">
                  {/* Configuration du titre */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Titre du registre</label>
                    <input
                      type="text"
                      value={registreConfig.title}
                      onChange={(e) => setRegistreConfig({ ...registreConfig, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                      placeholder="Registre des Courriers"
                    />
                  </div>

                  {/* Configuration du papier */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Taille du papier</label>
                      <select
                        value={registreConfig.paperSize}
                        onChange={(e) => setRegistreConfig({ ...registreConfig, paperSize: e.target.value as 'a4' | 'a3' | 'letter' })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                      >
                        <option value="a4">A4 (210 × 297 mm)</option>
                        <option value="a3">A3 (297 × 420 mm)</option>
                        <option value="letter">Letter (216 × 279 mm)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Orientation</label>
                    <select
                      value={registreConfig.orientation}
                      onChange={(e) => setRegistreConfig({ ...registreConfig, orientation: e.target.value as 'portrait' | 'landscape' })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                    >
                      <option value="portrait">Portrait (vertical)</option>
                      <option value="landscape">Paysage (horizontal)</option>
                    </select>
                  </div>
                </div>

                {/* Configuration du style */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Taille de police</label>
                  <select
                    value={registreConfig.fontSize}
                    onChange={(e) => setRegistreConfig({ ...registreConfig, fontSize: parseInt(e.target.value) as 8 | 9 | 10 | 11 | 12 })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  >
                    <option value="8">8 pt (très petit)</option>
                    <option value="9">9 pt (petit)</option>
                    <option value="10">10 pt (normal)</option>
                    <option value="11">11 pt (moyen)</option>
                    <option value="12">12 pt (grand)</option>
                  </select>
                </div>

                {/* Configuration du positionnement du tableau */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Alignement du tableau</label>
                  <select
                    value={registreConfig.tableAlign}
                    onChange={(e) => setRegistreConfig({ ...registreConfig, tableAlign: e.target.value as 'left' | 'center' | 'right' })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  >
                    <option value="left">Gauche</option>
                    <option value="center">Centre</option>
                    <option value="right">Droite</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Marge du tableau (mm)</label>
                  <input
                    type="number"
                    min="5"
                    max="30"
                    value={registreConfig.tableMargin}
                    onChange={(e) => setRegistreConfig({ ...registreConfig, tableMargin: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Padding des colonnes (mm)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.5"
                    value={registreConfig.columnPadding}
                    onChange={(e) => setRegistreConfig({ ...registreConfig, columnPadding: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  />
                </div>

                {/* Option statistiques */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="includeStats"
                    checked={registreConfig.includeStats}
                    onChange={(e) => setRegistreConfig({ ...registreConfig, includeStats: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="includeStats" className="text-sm text-slate-700 cursor-pointer">
                    Inclure les statistiques
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="showBorders"
                    checked={registreConfig.showBorders}
                    onChange={(e) => setRegistreConfig({ ...registreConfig, showBorders: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="showBorders" className="text-sm text-slate-700 cursor-pointer">
                    Bordures style Word
                  </label>
                </div>

                {/* Configuration des colonnes */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Colonnes du tableau</h3>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
                    {registreConfig.columns.map((col, index) => (
                      <div key={col.key} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`col-${col.key}`}
                          checked={col.visible}
                          onChange={(e) => {
                            const newColumns = [...registreConfig.columns];
                            newColumns[index].visible = e.target.checked;
                            setRegistreConfig({ ...registreConfig, columns: newColumns });
                          }}
                          className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                        />
                        <label htmlFor={`col-${col.key}`} className="text-sm text-slate-700 cursor-pointer">
                          {col.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                </div>
              </div>
            </div>

            {/* Pied de page */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-5">
              <button
                type="button"
                onClick={() => setShowRegistreModal(false)}
                className="px-4 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleGenerateRegistre(true)}
                className="px-4 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100"
              >
                <FontAwesomeIcon icon={faEye} className="mr-2" />
                Aperçu
              </button>
              <button
                type="button"
                onClick={() => handleGenerateRegistre(false)}
                className="px-6 py-2.5 rounded-xl bg-green-500 text-white font-bold hover:bg-green-600 shadow-md"
              >
                <FontAwesomeIcon icon={faPrint} className="mr-2" />
                Générer le registre
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Aperçu du Registre */}
      {showRegistrePreviewModal && registrePreviewUrl && createPortal(
        <div
          className="fixed inset-0 z-[100001] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4"
          onClick={() => {
            URL.revokeObjectURL(registrePreviewUrl);
            setShowRegistrePreviewModal(false);
            setRegistrePreviewUrl(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl w-full max-w-[95vw] h-[95vh] flex flex-col overflow-hidden border border-slate-200/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/50 bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 px-6 py-5">
              <h2 className="text-xl font-bold text-slate-900">Aperçu du Registre</h2>
              <button
                onClick={() => {
                  URL.revokeObjectURL(registrePreviewUrl);
                  setShowRegistrePreviewModal(false);
                  setRegistrePreviewUrl(null);
                }}
                className="shrink-0 rounded-2xl p-3 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"
              >
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <iframe
                src={registrePreviewUrl}
                className="w-full h-full rounded-2xl border border-slate-200"
                title="Aperçu du registre"
              />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200/50 bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4">
              <button
                onClick={() => {
                  URL.revokeObjectURL(registrePreviewUrl);
                  setShowRegistrePreviewModal(false);
                  setRegistrePreviewUrl(null);
                }}
                className="px-4 py-2.5 rounded-xl border-2 border-slate-300/50 bg-white/70 text-slate-700 font-medium hover:bg-slate-100"
              >
                Fermer
              </button>
              <button
                onClick={() => handleGenerateRegistre(false)}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold hover:from-green-600 hover:to-emerald-700 shadow-lg"
              >
                <FontAwesomeIcon icon={faDownload} className="mr-2" />
                Télécharger
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Popout de prévisualisation du document scanné */}
      {showScanPopout && scanModalPreviewUrl && scanModalPreviewFile && createPortal(
        <div className="fixed inset-0 z-[100010] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200/50">
            {/* En-tête du popout */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-200/50 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 rounded-2xl blur-xl opacity-20"></div>
                  <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <FontAwesomeIcon icon={faFile} className="text-white w-5 h-5" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 truncate">
                    {scanModalPreviewFile.name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    Prévisualisation du document scanné
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Bouton de téléchargement */}
                <button
                  type="button"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = scanModalPreviewUrl!;
                    link.download = scanModalPreviewFile.name;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-600 hover:to-teal-700 text-sm font-medium transition-all duration-200 shadow-sm"
                  title="Télécharger le document"
                >
                  <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                  <span>Télécharger</span>
                </button>
                {/* Bouton de fermeture */}
                <button
                  type="button"
                  onClick={() => setShowScanPopout(false)}
                  className="rounded-2xl p-2.5 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 transition-all duration-200"
                  title="Fermer la prévisualisation"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-lg" />
                </button>
              </div>
            </div>
            
            {/* Contenu de la prévisualisation */}
            <div className="flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/30">
              {(() => {
                const file = scanModalPreviewFile;
                const isPdf = file.type === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf'));
                const isImage = /^image\/(jpeg|jpg|png|gif|bmp|webp)$/i.test(file.type) || /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name || '');
                
                return (
                  <div className="h-full flex flex-col">
                    {isPdf ? (
                      <div className="flex-1 flex flex-col p-6">
                        <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-t-2xl flex-shrink-0">
                          <span className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                            <FontAwesomeIcon icon={faFilePdf} className="text-red-500" /> {scanModalPreviewFile.name}
                          </span>
                          <a href={scanModalPreviewUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <FontAwesomeIcon icon={faLink} className="w-3 h-3" /> Ouvrir dans un nouvel onglet
                          </a>
                        </div>
                        <iframe
                          src={scanModalPreviewUrl}
                          title="Aperçu PDF"
                          className="flex-1 w-full rounded-b-2xl"
                          style={{ minHeight: 'calc(95vh - 200px)', border: 'none' }}
                        />
                      </div>
                    ) : isImage ? (
                      <div className="flex-1 flex flex-col">
                        {/* Barre d'outils pour les images */}
                        <div className="flex-shrink-0 flex items-center justify-between p-4 bg-white/70 backdrop-blur-sm border-b border-slate-200/50">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-slate-700">Contrôles:</span>
                            <div className="flex items-center gap-2">
                              <button 
                                type="button" 
                                onClick={() => setImagePreviewZoom((z) => Math.max(0.1, z - 0.25))} 
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all duration-200" 
                                title="Zoom arrière"
                              >
                                <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-4 h-4" />
                              </button>
                              <span className="text-sm font-medium text-slate-600 min-w-[4rem] text-center bg-slate-100 px-2 py-1 rounded-lg">
                                {Math.round(imagePreviewZoom * 100)}%
                              </span>
                              <button 
                                type="button" 
                                onClick={() => setImagePreviewZoom((z) => Math.min(5, z + 0.25))} 
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all duration-200" 
                                title="Zoom avant"
                              >
                                <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-4 h-4" />
                              </button>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => { setImagePreviewZoom(1); setImagePreviewRotation(0); }} 
                              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-all duration-200" 
                              title="Réinitialiser"
                            >
                              <FontAwesomeIcon icon={faExpand} className="mr-1.5 w-4 h-4" /> 
                              Réinitialiser
                            </button>
                            <div className="h-4 w-px bg-slate-300"></div>
                            <div className="flex items-center gap-2">
                              <button 
                                type="button" 
                                onClick={() => setImagePreviewRotation((r) => (r - 90 + 360) % 360 as 0 | 90 | 180 | 270)} 
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all duration-200" 
                                title="Pivoter à gauche"
                              >
                                <FontAwesomeIcon icon={faRotateLeft} className="w-4 h-4" />
                              </button>
                              <span className="text-sm font-medium text-slate-600 min-w-[3rem] text-center bg-slate-100 px-2 py-1 rounded-lg">
                                {imagePreviewRotation}°
                              </span>
                              <button 
                                type="button" 
                                onClick={() => setImagePreviewRotation((r) => (r + 90) % 360 as 0 | 90 | 180 | 270)} 
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all duration-200" 
                                title="Pivoter à droite"
                              >
                                <FontAwesomeIcon icon={faRotateRight} className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="h-4 w-px bg-slate-300"></div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-700">Ajuster:</span>
                              {(['contain', 'cover', 'fill'] as const).map((fit) => (
                                <button 
                                  key={fit} 
                                  type="button" 
                                  onClick={() => setImagePreviewFit(fit)} 
                                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                                    imagePreviewFit === fit 
                                      ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg' 
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`} 
                                  title={fit === 'contain' ? 'Contenir (voir tout)' : fit === 'cover' ? 'Couvrir (remplir)' : 'Étirer'}
                                >
                                  {fit === 'contain' ? 'Contenir' : fit === 'cover' ? 'Couvrir' : 'Étirer'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="text-sm text-slate-500">
                            {file.size && (
                              <span>Taille: {file.size < 1024 ? file.size + ' o' : file.size < 1024 * 1024 ? (file.size / 1024).toFixed(2) + ' KB' : (file.size / (1024 * 1024)).toFixed(2) + ' MB'}</span>
                            )}
                          </div>
                        </div>
                        
                        {/* Zone d'affichage de l'image */}
                        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50/30">
                          <div className="bg-white rounded-2xl overflow-hidden relative flex items-center justify-center shadow-xl" style={{ 
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', 
                            maxHeight: 'calc(95vh - 200px)', 
                            maxWidth: '100%' 
                          }}>
                            <img
                              key={scanModalPreviewUrl}
                              src={scanModalPreviewUrl}
                              alt="Document scanné"
                              className="max-w-full max-h-full w-auto h-auto origin-center transition-transform duration-300 object-contain rounded-2xl"
                              style={{ 
                                objectFit: imagePreviewFit, 
                                transform: `scale(${imagePreviewZoom}) rotate(${imagePreviewRotation}deg)`, 
                                minHeight: 1 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center p-8 text-center">
                        <div className="max-w-md">
                          <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
                            <FontAwesomeIcon icon={faFile} className="text-slate-400 w-10 h-10" />
                          </div>
                          <h4 className="text-lg font-semibold text-slate-800 mb-2">Format non prévisualisable</h4>
                          <p className="text-sm text-slate-600 mb-4">({file.type || 'Type inconnu'})</p>
                          {file.size && (
                            <p className="text-xs text-slate-500 mb-4">
                              Taille: {file.size < 1024 ? file.size + ' o' : file.size < 1024 * 1024 ? (file.size / 1024).toFixed(2) + ' KB' : (file.size / (1024 * 1024)).toFixed(2) + ' MB'}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = scanModalPreviewUrl!;
                              link.download = scanModalPreviewFile.name;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 text-sm font-medium transition-all duration-200 shadow-lg"
                          >
                            <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                            <span>Télécharger le fichier</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            
            {/* Pied de page du popout */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200/50 bg-gradient-to-r from-slate-50/70 to-blue-50/30">
              <div className="text-sm text-slate-600">
                {scanModalPreviewFile.name} • 
                {scanModalPreviewFile.size && (
                  <span className="ml-2">
                    ({scanModalPreviewFile.size < 1024 ? scanModalPreviewFile.size + ' o' : scanModalPreviewFile.size < 1024 * 1024 ? (scanModalPreviewFile.size / 1024).toFixed(2) + ' KB' : (scanModalPreviewFile.size / (1024 * 1024)).toFixed(2) + ' MB'})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = scanModalPreviewUrl!;
                    link.download = scanModalPreviewFile.name;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-600 hover:to-teal-700 text-sm font-medium transition-all duration-200 shadow-sm"
                >
                  <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                  <span>Télécharger</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowScanPopout(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 border border-slate-300/50 text-slate-700 rounded-xl hover:bg-slate-100 text-sm font-medium transition-all duration-200 shadow-sm"
                >
                  <span>Fermer</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de visualisation de fichiers */}
      {showViewFileModal && viewFileData && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[50002]" onClick={() => closeViewFileModal()}>
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] min-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon 
                  icon={getFileIcon(viewFileData.fichier.extension)} 
                  className={`text-2xl ${getFileIconColor(viewFileData.fichier.extension)}`}
                />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{viewFileData.fichier.nom}</h3>
                  <p className="text-sm text-gray-500">
                    {viewFileData.fichier.extension?.toUpperCase()} • 
                    {viewFileData.fichier.taille ? ` ${(viewFileData.fichier.taille / 1024).toFixed(2)} KB` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(['doc', 'docx', 'xls', 'xlsx'].includes(viewFileData.fichier.extension || '') && editMode === 'view') && (
                  <button
                    onClick={() => setEditMode('edit')}
                    className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg"
                    title="Éditer"
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                )}
                {editMode === 'edit' && (
                  <button
                    onClick={() => setEditMode('view')}
                    className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                    title="Retour à la visualisation"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDownloadViewedFile}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                  title="Télécharger"
                >
                  <FontAwesomeIcon icon={faDownload} />
                </button>
                <button
                  type="button"
                  onClick={handleOpenViewedFileInNewTab}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <FontAwesomeIcon icon={faExpand} />
                </button>
                <button
                  onClick={() => {
                    const courrierId = dossiersFichiers.get(viewFileData.fichier.courrierId) ? 
                      viewFileData.fichier.courrierId : 
                      Array.from(dossiersFichiers.keys()).find(id => 
                        dossiersFichiers.get(id)?.some(f => f.id === viewFileData.fichier.id)
                      ) || '';
                    if (courrierId) {
                      handleDeleteFile(viewFileData.fichier.id, courrierId);
                    }
                  }}
                  className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                  title="Supprimer"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
                <button
                  onClick={closeViewFileModal}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-[#d1d5db] min-h-[50vh] flex flex-col">
              {viewFileData.url && !/\/o\?name=/.test(viewFileData.url) && (
                <div className="flex flex-wrap gap-2 justify-center mb-3">
                  <button
                    type="button"
                    onClick={handleOpenViewedFileInNewTab}
                    className="text-sm px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                  >
                    <FontAwesomeIcon icon={faExpand} className="mr-1.5" />
                    Ouvrir dans un nouvel onglet (affichage fiable)
                  </button>
                </div>
              )}
              {(!viewFileData.url || /\/o\?name=/.test(viewFileData.url)) ? (
                <div className="w-full flex-1 min-h-[280px] flex flex-col items-center justify-center gap-4 p-6 bg-white rounded-lg border-2 border-gray-300 shadow-inner">
                  {viewFileData.loadDone !== true ? (
                    <>
                      <span className="text-gray-500">Chargement du fichier...</span>
                      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </>
                  ) : (
                    <>
                      <p className="text-gray-700 text-center max-w-md font-medium">
                        Aperçu non disponible. Utilisez l’un des boutons ci-dessous pour télécharger ou ouvrir le fichier dans un nouvel onglet (le navigateur l’affichera correctement).
                      </p>
                      <div className="flex flex-wrap gap-3 justify-center">
                        <button
                          type="button"
                          onClick={handleDownloadViewedFile}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          <FontAwesomeIcon icon={faDownload} />
                          Télécharger
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenViewedFileInNewTab}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                        >
                          <FontAwesomeIcon icon={faExpand} />
                          Ouvrir dans un nouvel onglet
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : viewFileData.fichier.extension === 'pdf' || viewFileData.fichier.chemin?.endsWith('.pdf') ? (
                <div className="flex flex-col flex-1 min-h-0">
                  <iframe
                    src={viewFileData.url}
                    title={viewFileData.fichier.nom}
                    className="flex-1 w-full rounded-lg"
                    style={{ minHeight: 'calc(90vh - 140px)', border: 'none' }}
                  />
                </div>
              ) : ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(viewFileData.fichier.extension || '') ? (
                <div className="flex flex-col h-full min-h-[60vh]">
                  {/* Barre d'outils : paramètres d'affichage */}
                  <div className="flex-shrink-0 flex flex-wrap items-center gap-3 p-3 bg-white border-b border-gray-200 rounded-t-lg">
                    <span className="text-sm font-medium text-gray-600">Afficher :</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setImagePreviewZoom((z) => Math.max(0.25, z - 0.25))}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                        title="Zoom arrière"
                      >
                        <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-gray-600 min-w-[3rem] text-center">{Math.round(imagePreviewZoom * 100)} %</span>
                      <button
                        type="button"
                        onClick={() => setImagePreviewZoom((z) => Math.min(3, z + 0.25))}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                        title="Zoom avant"
                      >
                        <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setImagePreviewZoom(1); setImagePreviewRotation(0); }}
                      className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
                      title="Réinitialiser"
                    >
                      <FontAwesomeIcon icon={faExpand} className="mr-1.5" /> Réinitialiser
                    </button>
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setImagePreviewRotation((r) => (r - 90 + 360) % 360 as 0 | 90 | 180 | 270)}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                        title="Pivoter à gauche"
                      >
                        <FontAwesomeIcon icon={faRotateLeft} className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-gray-600 min-w-[2.5rem] text-center">{imagePreviewRotation}°</span>
                      <button
                        type="button"
                        onClick={() => setImagePreviewRotation((r) => (r + 90) % 360 as 0 | 90 | 180 | 270)}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                        title="Pivoter à droite"
                      >
                        <FontAwesomeIcon icon={faRotateRight} className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-600">Ajuster :</span>
                      {(['contain', 'cover', 'fill'] as const).map((fit) => (
                        <button
                          key={fit}
                          type="button"
                          onClick={() => setImagePreviewFit(fit)}
                          className={`px-3 py-1.5 rounded-lg text-sm ${imagePreviewFit === fit ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                          title={fit === 'contain' ? 'Contenir (voir tout)' : fit === 'cover' ? 'Couvrir (remplir)' : 'Étirer'}
                        >
                          {fit === 'contain' ? 'Contenir' : fit === 'cover' ? 'Couvrir' : 'Étirer'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Zone de prévisualisation image */}
                  <div className="flex-1 min-h-[50vh] overflow-auto flex items-center justify-center p-4 bg-[#d1d5db]">
                    <div
                      className="bg-white rounded-sm overflow-hidden relative flex items-center justify-center min-h-[300px] w-full"
                      style={{
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 10px 25px -5px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
                        maxHeight: 'min(75vh, 640px)',
                        maxWidth: '100%',
                      }}
                    >
                      <img
                        key={viewFileData.url}
                        src={viewFileData.url}
                        alt={viewFileData.fichier.nom}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            setImagePreviewSize({ w: img.naturalWidth, h: img.naturalHeight });
                          }
                        }}
                        className="max-w-full max-h-full w-auto h-auto origin-center transition-transform duration-150 object-contain"
                        style={{
                          objectFit: imagePreviewFit,
                          transform: `scale(${imagePreviewZoom}) rotate(${imagePreviewRotation}deg)`,
                          minHeight: 1,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : ['doc', 'docx'].includes(viewFileData.fichier.extension || '') ? (
                editMode === 'edit' ? (
                  <WordEditor
                    fileUrl={viewFileData.url}
                    fileName={viewFileData.fichier.nom}
                    onSave={(file) => handleSaveEditedFile(file, viewFileData.fichier)}
                    onCancel={() => setEditMode('view')}
                  />
                ) : (
                  (() => {
                    // Vérifier si l'URL est un blob URL (fichier local)
                    const isBlobUrl = viewFileData.url.startsWith('blob:');
                    if (isBlobUrl) {
                      // Pour les fichiers locaux, proposer l'édition intégrée
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-white">
                  <FontAwesomeIcon 
                    icon={getFileIcon(viewFileData.fichier.extension)} 
                    className={`text-6xl ${getFileIconColor(viewFileData.fichier.extension)} mb-4`}
                  />
                          <p className="text-gray-600 mb-4 text-center">
                            Cliquez sur le bouton "Éditer" pour modifier ce document Word directement dans le navigateur.
                          </p>
                          <div className="flex gap-3">
                            <button
                              onClick={() => setEditMode('edit')}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                            >
                              <FontAwesomeIcon icon={faEdit} />
                              Éditer
                            </button>
                  <a
                    href={viewFileData.url}
                    download={viewFileData.fichier.nom}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                            >
                              <FontAwesomeIcon icon={faDownload} />
                              Télécharger
                            </a>
                          </div>
                        </div>
                      );
                    }
                    // Pour les URLs publiques, utiliser Office Online Viewer
                    return (
                      <div className="w-full h-full flex flex-col">
                        <div className="flex-1 overflow-hidden">
                          <iframe
                            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewFileData.url)}`}
                            className="w-full h-full border-0"
                            title={viewFileData.fichier.nom}
                            style={{ minHeight: '600px' }}
                          />
                        </div>
                        <div className="p-3 bg-white border-t border-gray-200 flex items-center justify-between">
                          <p className="text-sm text-gray-600">
                            Mode aperçu - Cliquez sur "Éditer" pour modifier le document
                          </p>
                          <button
                            onClick={() => setEditMode('edit')}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                            Éditer
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )
              ) : ['xls', 'xlsx'].includes(viewFileData.fichier.extension || '') ? (
                editMode === 'edit' ? (
                  <ExcelEditor
                    fileUrl={viewFileData.url}
                    fileName={viewFileData.fichier.nom}
                    onSave={(file) => handleSaveEditedFile(file, viewFileData.fichier)}
                    onCancel={() => setEditMode('view')}
                  />
                ) : (
                  (() => {
                    const isBlobUrl = viewFileData.url.startsWith('blob:');
                    if (isBlobUrl) {
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-white">
                          <FontAwesomeIcon 
                            icon={getFileIcon(viewFileData.fichier.extension)} 
                            className={`text-6xl ${getFileIconColor(viewFileData.fichier.extension)} mb-4`}
                          />
                          <p className="text-gray-600 mb-4 text-center">
                            Cliquez sur le bouton "Éditer" pour modifier ce fichier Excel directement dans le navigateur.
                          </p>
                          <div className="flex gap-3">
                            <button
                              onClick={() => setEditMode('edit')}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                            >
                              <FontAwesomeIcon icon={faEdit} />
                              Éditer
                            </button>
                            <a
                              href={viewFileData.url}
                              download={viewFileData.fichier.nom}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                            >
                              <FontAwesomeIcon icon={faDownload} />
                              Télécharger
                            </a>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="w-full h-full flex flex-col">
                        <div className="flex-1 overflow-hidden">
                          <iframe
                            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewFileData.url)}`}
                            className="w-full h-full border-0"
                            title={viewFileData.fichier.nom}
                            style={{ minHeight: '600px' }}
                          />
                        </div>
                        <div className="p-3 bg-white border-t border-gray-200 flex items-center justify-between">
                          <p className="text-sm text-gray-600">
                            Mode aperçu - Cliquez sur "Éditer" pour modifier le fichier
                          </p>
                          <button
                            onClick={() => setEditMode('edit')}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                            Éditer
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )
              ) : ['ppt', 'pptx'].includes(viewFileData.fichier.extension || '') ? (
                (() => {
                  const isBlobUrl = viewFileData.url.startsWith('blob:');
                  if (isBlobUrl) {
                    return (
                      <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-white">
                        <FontAwesomeIcon 
                          icon={getFileIcon(viewFileData.fichier.extension)} 
                          className={`text-6xl ${getFileIconColor(viewFileData.fichier.extension)} mb-4`}
                        />
                        <p className="text-gray-600 mb-4 text-center">
                          Pour visualiser ce fichier Office, veuillez le télécharger et l'ouvrir avec l'application appropriée.
                        </p>
                        <div className="flex gap-3">
                          <a
                            href={viewFileData.url}
                            download={viewFileData.fichier.nom}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                          >
                            <FontAwesomeIcon icon={faDownload} />
                            Télécharger
                          </a>
                          <a
                            href={viewFileData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                            Ouvrir
                          </a>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="w-full h-full flex flex-col">
                      <div className="flex-1 overflow-hidden">
                        <iframe
                          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewFileData.url)}`}
                          className="w-full h-full border-0"
                          title={viewFileData.fichier.nom}
                          style={{ minHeight: '600px' }}
                        />
                      </div>
                      <div className="p-3 bg-white border-t border-gray-200 flex items-center justify-between">
                        <p className="text-sm text-gray-600">
                          Mode aperçu - Les modifications ne seront pas sauvegardées automatiquement
                        </p>
                        <a
                          href={viewFileData.url}
                          download={viewFileData.fichier.nom}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
                        >
                          <FontAwesomeIcon icon={faDownload} />
                          Télécharger pour éditer localement
                        </a>
                      </div>
                    </div>
                  );
                })()
              ) : ['txt', 'md', 'json', 'xml', 'csv', 'html', 'css', 'js', 'ts', 'jsx', 'tsx'].includes(viewFileData.fichier.extension || '') ? (
                <div className="w-full h-full flex flex-col bg-white">
                  <div className="flex-1 overflow-auto p-4">
                    <TextFileViewer url={viewFileData.url} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <FontAwesomeIcon 
                    icon={getFileIcon(viewFileData.fichier.extension)} 
                    className={`text-6xl ${getFileIconColor(viewFileData.fichier.extension)} mb-4`}
                  />
                  <p className="text-gray-600 mb-4">Aperçu non disponible pour ce type de fichier</p>
                  <a
                    href={viewFileData.url}
                    download={viewFileData.fichier.nom}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <FontAwesomeIcon icon={faDownload} className="mr-2" />
                    Télécharger
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de résumé du courrier */}
      {showResumeModal && selectedCourrierForResume && (
        <ModalPortal>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100020]"
            onClick={() => {
              setShowResumeModal(false);
              setSelectedCourrierForResume(null);
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden z-[100021]"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between px-6 py-5 border-b bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white">
              <div>
                <p className="text-xs uppercase tracking-wider text-white/70">Résumé du courrier</p>
                <h2 className="text-2xl font-bold tracking-tight">
                  {selectedCourrierForResume.numero}
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowResumeModal(false);
                  setSelectedCourrierForResume(null);
                }}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Uniquement les champs configurés dans le formulaire de paramétrage */}
              {(() => {
                const courrier = selectedCourrierForResume;
                const sens = resolveCourrierSens(courrier);
                const displayFields = formulaireCourrierService.getDisplayFields(sens, courrier.type);

                const getFieldValue = (c: Courrier, fieldName: string): unknown => {
                  // Pour les courriers INTERNE : si destinataire est vide, utiliser expediteur comme fallback pour destinataire
                  if (c.type === TypeCourrier.INTERNE) {
                    if (fieldName === 'destinataire') return c.destinataire || (c.extraFields as Record<string, unknown>)?.[fieldName];
                    if (fieldName === 'expediteur') return c.expediteur || (c.extraFields as Record<string, unknown>)?.[fieldName];
                  }
                  const base = (c as unknown as Record<string, unknown>)[fieldName];
                  if (base !== undefined && base !== null && base !== '') return base;
                  const extra = c.extraFields as Record<string, unknown> | undefined;
                  const fromExtra = extra?.[fieldName];
                  if (fromExtra !== undefined && fromExtra !== null && fromExtra !== '') return fromExtra;
                  // Pour SORTANT+EXTERNE, si destinataire vide, chercher une valeur dans extraFields (champ configuré sous un autre nom)
                  if (fieldName === 'destinataire' && sens === SensCourrier.SORTANT && c.type === TypeCourrier.EXTERNE && extra) {
                    for (const [k, v] of Object.entries(extra)) {
                      if (typeof v === 'string' && v.trim() && (k.toLowerCase().includes('destinataire') || k.toLowerCase().includes('recipient')))
                        return v;
                    }
                  }
                  return fromExtra;
                };

                const formatValue = (value: unknown, fieldType?: string): string => {
                  if (value === null || value === undefined || value === '') return '—';
                  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
                  if (fieldType === 'datetime') {
                    try {
                      return new Date(value as string | number).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      });
                    } catch {
                      return String(value);
                    }
                  }
                  return String(value);
                };

                const getIcon = (iconName?: string) => {
                  if (!iconName) return null;
                  const iconMap: Record<string, any> = {
                    envelope: faEnvelope, 'envelope-open': faEnvelopeOpen, calendar: faCalendar,
                    user: faUser, users: faUsers, building: faBuilding, tag: faTag, file: faFile,
                    'file-alt': faFileAlt, 'info-circle': faInfoCircle, at: faAt, phone: faPhone,
                    link: faLink, 'map-marker-alt': faMapMarkerAlt, globe: faGlobe,
                  };
                  return iconMap[iconName] || null;
                };

                if (displayFields.length === 0) {
                  return (
                    <p className="text-gray-500 text-sm">Aucun champ configuré pour ce type de courrier (paramétrage formulaire).</p>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {displayFields.map((field) => {
                      const value = getFieldValue(courrier, field.name);
                      const formattedValue = formatValue(value, field.type);
                      const IconComponent = getIcon(field.icon);
                      return (
                        <div key={field.id} className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase mb-1">
                            {IconComponent && (
                              <FontAwesomeIcon icon={IconComponent} className="text-gray-400" />
                            )}
                            {field.label}
                          </div>
                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {formattedValue}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="pt-4 border-t">
                <label className="text-sm font-medium text-gray-500">Fichiers et catégories</label>
                <p className="text-gray-900 mt-2">
                  {(() => {
                    // Priorité 1: dossiersFichiers (détail complet si déjà chargé)
                    const df = dossiersFichiers.get(selectedCourrierForResume.id);
                    if (df && df.length > 0) {
                      const nbCategories = df.filter(item => item.type === 'categorie').length;
                      const nbFichiers = df.filter(item => item.type === 'fichier').length;
                      return (
                        <span className="inline-flex items-center gap-3">
                          {nbCategories > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <FontAwesomeIcon icon={faFolder} className="text-yellow-500" />
                              {nbCategories} catégorie{nbCategories > 1 ? 's' : ''}
                            </span>
                          )}
                          {nbFichiers > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <FontAwesomeIcon icon={faFile} className="text-blue-500" />
                              {nbFichiers} fichier{nbFichiers > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      );
                    }
                    // Priorité 2: filesCounts (données rapides chargées au démarrage)
                    const count = filesCounts.get(selectedCourrierForResume.id);
                    if (count && (count.nbFichiers > 0 || count.nbCategories > 0)) {
                      return (
                        <span className="inline-flex items-center gap-3">
                          {count.nbCategories > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <FontAwesomeIcon icon={faFolder} className="text-yellow-500" />
                              {count.nbCategories} catégorie{count.nbCategories > 1 ? 's' : ''}
                            </span>
                          )}
                          {count.nbFichiers > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <FontAwesomeIcon icon={faFile} className="text-blue-500" />
                              {count.nbFichiers} fichier{count.nbFichiers > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      );
                    }
                    // Aucune donnée
                    return 'Aucun document';
                  })()}
                </p>
              </div>
              {/* Schéma des annotations */}
              {workflowsForPreview.length > 0 && (
                <div className="pt-4 border-t border-dashed border-gray-200">
                  {/* Titre au-dessus */}
                  <div className="mb-4">
                    <h3 className="text-base font-bold text-gray-900">Schéma des annotations</h3>
                    <p className="text-xs text-gray-500 mt-1">Visualisation du processus de traitement</p>
                  </div>
                  {/* Contenu SVG en dessous */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto" style={{ maxHeight: '360px' }}>
                    <svg 
                      width="100%" 
                      height={Math.max(300, workflowsForPreview.length * 150)} 
                      className="min-w-full"
                      viewBox={`0 0 ${Math.max(800, workflowsForPreview.length * 300)} ${Math.max(300, workflowsForPreview.length * 150)}`}
                    >
                      {workflowsForPreview
                        .filter(w => {
                          if (!w.estCondition) return true;
                          if (w.estCondition && w.actionSiVrai && w.actionSiFaux) return true;
                          if (w.estCondition && !w.actionSiVrai && !w.actionSiFaux) return true;
                          return false;
                        })
                        .map((etape, index) => {
                          const assignedUser = userService.getUserById(etape.assigneA);
                          const x = index * 250 + 20;
                          const y = 100;
                          const isCondition = etape.estCondition;
                          
                          const actionVrai = etape.actionSiVrai ? workflowsForPreview.find(w => w.id === etape.actionSiVrai) : null;
                          const actionFaux = etape.actionSiFaux ? workflowsForPreview.find(w => w.id === etape.actionSiFaux) : null;
                          const evenementOrigine = etape.declencheur?.etapePrecedenteId 
                            ? workflowsForPreview.find(w => w.id === etape.declencheur?.etapePrecedenteId) 
                            : null;
                          const origineIndex = evenementOrigine 
                            ? workflowsForPreview.filter(w => {
                                if (!w.estCondition) return true;
                                if (w.estCondition && w.actionSiVrai && w.actionSiFaux) return true;
                                if (w.estCondition && !w.actionSiVrai && !w.actionSiFaux) return true;
                                return false;
                              }).findIndex(w => w.id === evenementOrigine.id)
                            : -1;
                          
                          return (
                            <g key={etape.id}>
                              {isCondition ? (
                                <>
                                  {evenementOrigine && origineIndex >= 0 && (
                                    <line
                                      x1={origineIndex * 250 + 20 + 180}
                                      y1={100 + 40}
                                      x2={x}
                                      y2={y + 50}
                                      stroke="#8b5cf6"
                                      strokeWidth="2"
                                      strokeDasharray="5,5"
                                      markerEnd="url(#arrowhead-preview)"
                                    />
                                  )}
                                  <g transform={`translate(${x}, ${y})`}>
                                    <polygon
                                      points="90,10 170,50 90,90 10,50"
                                      className="fill-purple-100 stroke-purple-600 stroke-2"
                                    />
                                    <text
                                      x="90"
                                      y="45"
                                      className="text-sm font-semibold fill-purple-800 text-center"
                                      textAnchor="middle"
                                    >
                                      {(etape.etape || etape.declencheur?.condition || 'Condition').substring(0, 15)}
                                    </text>
                                    <text
                                      x="90"
                                      y="60"
                                      className="text-xs fill-purple-600 text-center"
                                      textAnchor="middle"
                                    >
                                      Condition
                                    </text>
                                  </g>
                                  {actionVrai && (
                                    <>
                                      <line x1={x + 90} y1={y + 100} x2={x + 90} y2={y + 150} stroke="#10b981" strokeWidth="2" />
                                      <text x={x + 95} y={y + 125} className="text-xs fill-green-600 font-semibold">OUI</text>
                                      <line x1={x + 90} y1={y + 150} x2={x + 280} y2={y + 150} stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowhead-preview)" />
                                      <g transform={`translate(${x + 280}, ${y + 120})`}>
                                        <rect x="0" y="0" width="150" height="60" rx="8" className="fill-green-100 stroke-green-600 stroke-2" />
                                        <text x="75" y="30" className="text-xs font-semibold fill-green-800 text-center" textAnchor="middle">
                                          {actionVrai.etape.substring(0, 18)}
                                        </text>
                                        <text x="75" y="45" className="text-xs fill-green-600 text-center" textAnchor="middle">
                                          {actionVrai.statut}
                                        </text>
                                      </g>
                                    </>
                                  )}
                                  {actionFaux && (
                                    <>
                                      <line x1={x + 90} y1={y} x2={x + 90} y2={y - 50} stroke="#ef4444" strokeWidth="2" />
                                      <text x={x + 95} y={y - 25} className="text-xs fill-red-600 font-semibold">NON</text>
                                      <line x1={x + 90} y1={y - 50} x2={x + 280} y2={y - 50} stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrowhead-preview)" />
                                      <g transform={`translate(${x + 280}, ${y - 80})`}>
                                        <rect x="0" y="0" width="150" height="60" rx="8" className="fill-red-100 stroke-red-600 stroke-2" />
                                        <text x="75" y="30" className="text-xs font-semibold fill-red-800 text-center" textAnchor="middle">
                                          {actionFaux.etape.substring(0, 18)}
                                        </text>
                                        <text x="75" y="45" className="text-xs fill-red-600 text-center" textAnchor="middle">
                                          {actionFaux.statut}
                                        </text>
                                      </g>
                                    </>
                                  )}
                                </>
                              ) : (
                                <>
                                  <g transform={`translate(${x}, ${y})`}>
                                    <rect
                                      x="0"
                                      y="0"
                                      width="180"
                                      height="80"
                                      rx="8"
                                      className={`stroke-2 ${
                                        etape.statut === 'TERMINE' ? 'fill-green-100 stroke-green-600' :
                                        etape.statut === 'EN_COURS' ? 'fill-blue-100 stroke-blue-600' :
                                        etape.statut === 'REJETE' ? 'fill-red-100 stroke-red-600' :
                                        'fill-yellow-100 stroke-yellow-600'
                                      }`}
                                    />
                                    {etape.ordre && (
                                      <text x="10" y="20" className="text-xs font-bold fill-current">
                                        #{etape.ordre}
                                      </text>
                                    )}
                                    <text
                                      x="90"
                                      y="35"
                                      className="text-sm font-semibold fill-current text-center"
                                      textAnchor="middle"
                                    >
                                      {etape.etape.length > 20 ? etape.etape.substring(0, 20) + '...' : etape.etape}
                                    </text>
                                    {assignedUser && (
                                      <text
                                        x="90"
                                        y="55"
                                        className="text-xs fill-current opacity-75 text-center"
                                        textAnchor="middle"
                                      >
                                        {assignedUser.nom.length > 25 ? assignedUser.nom.substring(0, 25) + '...' : assignedUser.nom}
                                      </text>
                                    )}
                                    <text
                                      x="90"
                                      y="70"
                                      className="text-xs fill-current opacity-60 text-center"
                                      textAnchor="middle"
                                    >
                                      {etape.statut}
                                    </text>
                                  </g>
                                  {index < workflowsForPreview.filter(w => {
                                    if (!w.estCondition) return true;
                                    if (w.estCondition && w.actionSiVrai && w.actionSiFaux) return true;
                                    if (w.estCondition && !w.actionSiVrai && !w.actionSiFaux) return true;
                                    return false;
                                  }).length - 1 && (
                                    <line
                                      x1={x + 180}
                                      y1={y + 40}
                                      x2={x + 250}
                                      y2={y + 40}
                                      stroke="#6b7280"
                                      strokeWidth="2"
                                      markerEnd="url(#arrowhead-preview)"
                                    />
                                  )}
                                </>
                              )}
                            </g>
                          );
                        })}
                      <defs>
                        <marker
                          id="arrowhead-preview"
                          markerWidth="10"
                          markerHeight="10"
                          refX="9"
                          refY="3"
                          orient="auto"
                        >
                          <polygon points="0 0, 10 3, 0 6" fill="#6b7280" />
                        </marker>
                      </defs>
                    </svg>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-white/95 backdrop-blur sticky bottom-0 z-[10001]">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <FontAwesomeIcon icon={faInfoCircle} className="text-gray-400" />
                <span>Actions sur ce courrier</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={() => {
                    setShowResumeModal(false);
                    setSelectedCourrierForResume(null);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                >
                  Fermer
                </button>
                <Link
                  to={`/courriers/${selectedCourrierForResume.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  onClick={() => {
                    setShowResumeModal(false);
                    setSelectedCourrierForResume(null);
                  }}
                >
                  <FontAwesomeIcon icon={faEye} />
                  <span>Voir le détail</span>
                </Link>
                {/* Bouton pour réinitialiser l'accusé de réception (réservé aux admins) */}
                {(user?.role === Role.SUPER_ADMIN || user?.role === Role.SECRETAIRE) && selectedCourrierForResume.type === TypeCourrier.INTERNE && (
                  <button
                    onClick={async () => {
                      const confirmed = await showConfirm(
                        'Voulez-vous réinitialiser l\'accusé de réception pour ce courrier ? Cela permettra de déclencher à nouveau la notification lors de la prochaine ouverture.',
                        'warning',
                        'Réinitialiser l\'accusé'
                      );
                      if (confirmed) {
                        const accuseSentKey = `accuse_sent_${selectedCourrierForResume.id}`;
                        localStorage.removeItem(accuseSentKey);
                        showAlert('✅ Accusé de réception réinitialisé', 'success');
                        console.log('[DEBUG] Accusé de réception réinitialisé pour:', selectedCourrierForResume.numero);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm"
                    title="Réinitialiser l'accusé de réception"
                  >
                    <FontAwesomeIcon icon={faRotateRight} />
                    <span>Réinitialiser accusé</span>
                  </button>
                )}
                {(user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL) && (
                  <Link
                    to={`/enregistrer?courrierId=${selectedCourrierForResume.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm"
                    onClick={() => {
                      setShowResumeModal(false);
                      setSelectedCourrierForResume(null);
                    }}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                    <span>Modifier</span>
                  </Link>
                )}
                {checkPermission(Permission.SUPPRIMER_COURRIER) && (
                  <button
                    onClick={async () => {
                      const confirmed = await showConfirm(
                        'Êtes-vous sûr de vouloir supprimer ce courrier ?',
                        'warning',
                        'Supprimer'
                      );
                      if (confirmed) {
                        setLoadingOperations(prev => ({ ...prev, delete: true, operationName: 'Suppression du courrier...' }));
                        try {
                          await courrierService.deleteCourrier(selectedCourrierForResume.id);
                          await loadCourriers();
                          showAlert('Supprimé', 'success');
                          setShowResumeModal(false);
                          setSelectedCourrierForResume(null);
                        } catch (error) {
                          showAlert('Erreur lors de la suppression', 'error');
                        } finally {
                          setLoadingOperations(prev => ({ ...prev, delete: false, operationName: undefined }));
                        }
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    <span>Supprimer</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal d'édition supprimé : l'édition se fait maintenant sur la page /enregistrer */}

      {/* Fenêtre de paramétrage d'export */}
      {showExportSettings && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]" onClick={() => setShowExportSettings(false)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Paramètres d'export</h2>
                  <p className="text-sm text-gray-500 mt-1">Configurez les options d'export de la liste des courriers</p>
                </div>
                <button
                  onClick={() => setShowExportSettings(false)}
                  className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xl" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Format</label>
                    <select
                      value={exportSettings.format}
                      onChange={(e) => setExportSettings({ ...exportSettings, format: e.target.value as any })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="auto">Auto</option>
                      <option value="A4">A4</option>
                      <option value="A3">A3</option>
                      <option value="A2">A2</option>
                      <option value="A1">A1</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Orientation</label>
                    <select
                      value={exportSettings.orientation}
                      onChange={(e) => setExportSettings({ ...exportSettings, orientation: e.target.value as any })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Paysage</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Qualité</label>
                    <select
                      value={exportSettings.quality}
                      onChange={(e) => setExportSettings({ ...exportSettings, quality: e.target.value as any })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="low">Basse</option>
                      <option value="medium">Moyenne</option>
                      <option value="high">Haute</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Mode couleur</label>
                    <select
                      value={exportSettings.colorMode}
                      onChange={(e) => setExportSettings({ ...exportSettings, colorMode: e.target.value as any })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="color">Couleur</option>
                      <option value="grayscale">Niveaux de gris</option>
                      <option value="blackwhite">Noir et blanc</option>
                    </select>
                  </div>
                </div>

                {/* En-tête */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-gray-700">En-tête</label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!exportSettings.headerEnabled}
                        onChange={(e) => setExportSettings({ ...exportSettings, headerEnabled: e.target.checked })}
                      />
                      Activer
                    </label>
                  </div>
                  {exportSettings.headerEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Titre</label>
                        <input
                          type="text"
                          value={exportSettings.headerTitle || ''}
                          onChange={(e) => setExportSettings({ ...exportSettings, headerTitle: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Sous-titre</label>
                        <input
                          type="text"
                          value={exportSettings.headerSubtitle || ''}
                          onChange={(e) => setExportSettings({ ...exportSettings, headerSubtitle: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Logo (URL ou dataURL)</label>
                        <input
                          type="text"
                          value={exportSettings.headerLogoUrl || ''}
                          onChange={(e) => setExportSettings({ ...exportSettings, headerLogoUrl: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <div
                          className={`mt-2 border-2 border-dashed rounded-lg p-3 text-xs text-gray-600 cursor-pointer ${modalLogoDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
                          onDragOver={(e) => { e.preventDefault(); setModalLogoDragging(true); }}
                          onDragEnter={(e) => { e.preventDefault(); setModalLogoDragging(true); }}
                          onDragLeave={() => setModalLogoDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setModalLogoDragging(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file && file.type.startsWith('image/')) {
                              const reader = new FileReader();
                              reader.onload = () => setExportSettings({ ...exportSettings, headerLogoUrl: String(reader.result) });
                              reader.readAsDataURL(file);
                            } else {
                              alert('Veuillez déposer une image (PNG/JPEG/WEBP).');
                            }
                          }}
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = () => {
                              const file = input.files?.[0];
                              if (file && file.type.startsWith('image/')) {
                                const reader = new FileReader();
                                reader.onload = () => setExportSettings({ ...exportSettings, headerLogoUrl: String(reader.result) });
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}
                          title="Déposez votre logo ici ou cliquez pour choisir un fichier"
                        >
                          Déposez votre logo ici ou cliquez pour choisir
                        </div>
                        {exportSettings.headerLogoUrl && (
                          <div className="mt-2 flex items-center gap-2">
                            <img src={exportSettings.headerLogoUrl} alt="Logo" className="h-10 object-contain rounded border border-gray-200 bg-white p-1" />
                            <button
                              type="button"
                              onClick={() => setExportSettings({ ...exportSettings, headerLogoUrl: '' })}
                              className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                              title="Retirer le logo"
                            >
                              Retirer
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Alignement</label>
                          <select
                            value={exportSettings.headerAlign || 'left'}
                            onChange={(e) => setExportSettings({ ...exportSettings, headerAlign: e.target.value as any })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="left">Gauche</option>
                            <option value="center">Centre</option>
                            <option value="right">Droite</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Largeur logo (mm)</label>
                          <input
                            type="number"
                            min={8}
                            value={exportSettings.headerLogoWidthMm || 24}
                            onChange={(e) => setExportSettings({ ...exportSettings, headerLogoWidthMm: parseFloat(e.target.value) || 24 })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Filigrane */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-gray-700">Filigrane</label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!exportSettings.watermarkEnabled}
                        onChange={(e) => setExportSettings({ ...exportSettings, watermarkEnabled: e.target.checked })}
                      />
                      Activer
                    </label>
                  </div>
                  {exportSettings.watermarkEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Texte</label>
                        <input
                          type="text"
                          value={exportSettings.watermarkText || ''}
                          onChange={(e) => setExportSettings({ ...exportSettings, watermarkText: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="CONFIDENTIEL, BROUILLON, ..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Image (URL ou dataURL)</label>
                        <input
                          type="text"
                          value={exportSettings.watermarkImageUrl || ''}
                          onChange={(e) => setExportSettings({ ...exportSettings, watermarkImageUrl: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Opacité</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={exportSettings.watermarkOpacity ?? 0.08}
                          onChange={(e) => setExportSettings({ ...exportSettings, watermarkOpacity: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Angle (°)</label>
                        <input
                          type="number"
                          value={exportSettings.watermarkAngle ?? -30}
                          onChange={(e) => setExportSettings({ ...exportSettings, watermarkAngle: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Taille (texte, 0..1)</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          max="1"
                          value={exportSettings.watermarkSize ?? 0.6}
                          onChange={(e) => setExportSettings({ ...exportSettings, watermarkSize: Math.max(0.1, Math.min(1, parseFloat(e.target.value) || 0.6)) })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Couleur de fond</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={exportSettings.backgroundColor}
                      onChange={(e) => setExportSettings({ ...exportSettings, backgroundColor: e.target.value })}
                      className="w-16 h-12 rounded-lg border-2 border-gray-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={exportSettings.backgroundColor}
                      onChange={(e) => setExportSettings({ ...exportSettings, backgroundColor: e.target.value })}
                      className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-white/95 backdrop-blur sticky bottom-0">
                <button
                  onClick={() => setShowExportSettings(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                >
                  Annuler
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => previewPDF(exportSettings)}
                    disabled={generatingPreview || exporting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FontAwesomeIcon icon={faEye} />
                    {generatingPreview ? 'Génération...' : 'Prévisualiser PDF'}
                  </button>
                  <button
                    onClick={() => exportImage(exportSettings)}
                    disabled={exporting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faFileImage} />
                    Image
                  </button>
                  <button
                    onClick={() => exportPDF(exportSettings)}
                    disabled={exporting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faFilePdf} />
                    PDF
                  </button>
                  <button
                    onClick={exportExcel}
                    disabled={exporting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faFileExcel} />
                    Excel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Fenêtre de prévisualisation PDF */}
      {showPDFPreview && pdfPreviewUrl && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[50002]" onClick={() => {
          setShowPDFPreview(false);
          if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
          }
        }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-[95vw] max-h-[95vh] w-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* En-tête */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Prévisualisation PDF</h2>
                <p className="text-sm text-gray-500 mt-1">Aperçu avant impression</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = pdfPreviewUrl;
                    link.download = `courriers_${new Date().toISOString().split('T')[0]}.pdf`;
                    link.click();
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faDownload} />
                  Télécharger
                </button>
                <button
                  onClick={() => {
                    setShowPDFPreview(false);
                    if (pdfPreviewUrl) {
                      URL.revokeObjectURL(pdfPreviewUrl);
                      setPdfPreviewUrl(null);
                    }
                  }}
                  className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xl" />
                </button>
              </div>
            </div>

            {/* Contenu PDF */}
            <div className="flex-1 overflow-auto p-4 bg-gray-100" style={{ minHeight: '600px', maxHeight: 'calc(95vh - 200px)', display: 'flex', flexDirection: 'column' }}>
              <iframe
                key={pdfPreviewUrl || 'loading'}
                src={pdfPreviewUrl || undefined}
                className="w-full border-0 rounded-lg bg-white flex-1"
                style={{ 
                  minHeight: '600px',
                  height: '100%',
                  width: '100%',
                  display: 'block',
                  border: '1px solid #e5e7eb'
                }}
                title="Prévisualisation PDF"
                onLoad={() => {
                  console.log('PDF chargé avec succès');
                }}
                onError={(e) => {
                  console.error('Erreur lors du chargement du PDF:', e);
                }}
              />
            </div>

            {/* Pied de page */}
            <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Format: {exportSettings.format} | Orientation: {exportSettings.orientation === 'portrait' ? 'Portrait' : 'Paysage'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowPDFPreview(false);
                    setShowExportSettings(true);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                >
                  Modifier les paramètres
                </button>
                <button
                  onClick={() => {
                    exportPDF(exportSettings);
                    setShowPDFPreview(false);
                    if (pdfPreviewUrl) {
                      URL.revokeObjectURL(pdfPreviewUrl);
                      setPdfPreviewUrl(null);
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                >
                  Exporter maintenant
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom Dialog - variant 'alert' = OK seul, 'confirm' = Annuler + Confirmer */}
      {ReactDOM.createPortal(
        <CustomDialog
          isOpen={dialog.isOpen}
          message={dialog.message}
          type={dialog.type}
          title={dialog.title}
          confirmText={dialog.confirmText}
          cancelText={dialog.cancelText}
          variant={dialog.variant}
          onConfirm={dialog.onConfirm}
          onCancel={dialog.onCancel}
          onClose={closeDialog}
        />,
        document.body
      )}
    </div>
  );
};

// Composant pour le formulaire d'assignation
const AssignCourrierForm: React.FC<{
  courrier: Courrier;
  user: any;
  onClose: () => void;
  setLoadingOperations: (loading: { [key: string]: boolean }) => void;
}> = ({ courrier, user, onClose, setLoadingOperations }) => {
  const [assignMode, setAssignMode] = useState<'classique' | 'procedure'>('classique');
  const [assignType, setAssignType] = useState<'direction' | 'division' | 'service'>('direction');
  const [selectedDirection, setSelectedDirection] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedProcedure, setSelectedProcedure] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');
  const [instructions, setInstructions] = useState('');
  const [priorite, setPriorite] = useState<Priorite>(courrier.priorite || Priorite.NORMALE);
  const [entities, setEntities] = useState(entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false));
  const [services, setServices] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    entiteOrganisationnelleService.initializeDemoData();
    directionService.initializeDemoData();
    setEntities(entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false));
    // Charger les procédures actives
    const allProcedures = procedureService.getAllProcedures();
    setProcedures(allProcedures.filter(p => p.actif));
  }, []);

  useEffect(() => {
    if (selectedDirection) {
      const selectedEntity = entities.find(e => e.nom === selectedDirection);
      if (selectedEntity) {
        const childEntities = entiteOrganisationnelleService.getEntitiesByParent(selectedEntity.id)
          .filter(e => e.actif !== false);
        setDivisions(entiteOrganisationnelleService.getDivisionsByDirection(selectedEntity.id));
        const servicesDirect = childEntities.filter((e: { type: string }) => e.type === 'service');
        const divs = entiteOrganisationnelleService.getDivisionsByDirection(selectedEntity.id);
        const servicesFromDivs = divs.flatMap((d: { id: string }) => entiteOrganisationnelleService.getServicesByDivision(d.id));
        setServices([...servicesDirect, ...servicesFromDivs]);
      }
    } else {
      setDivisions([]);
      setServices([]);
    }
  }, [selectedDirection, entities]);

  useEffect(() => {
    if (!user) return;
    
    const visibleUsers = userService.getVisibleUsers(user.id);
    
    if (selectedDivision) {
      const filteredUsers = userService.getAssignableUsersByDivision(selectedDivision);
      const finalUsers = visibleUsers.filter(u => filteredUsers.some(fu => fu.id === u.id));
      setAssignableUsers(finalUsers.length > 0 ? finalUsers : visibleUsers);
    } else if (selectedDirection || selectedService) {
      const filteredUsers = userService.getAssignableUsersByDirection(selectedDirection || undefined, selectedService || undefined);
      const finalUsers = visibleUsers.filter(u => filteredUsers.some(fu => fu.id === u.id));
      setAssignableUsers(finalUsers.length > 0 ? finalUsers : visibleUsers);
    } else {
      setAssignableUsers(visibleUsers);
    }
  }, [selectedDirection, selectedDivision, selectedService, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoadingOperations({ update: true });
    
    if (assignMode === 'procedure') {
      if (!selectedProcedure) {
        setLoadingOperations({ update: false });
        window.alert('Veuillez sélectionner une procédure');
        return;
      }

      // Mettre à jour le courrier avec priorité
      courrierService.updateCourrier(courrier.id, {
        priorite
      });

      // Créer une instance de procédure
      try {
        const procedure = procedureService.getProcedureById(selectedProcedure);
        if (!procedure) {
          setLoadingOperations({ update: false });
          window.alert('Procédure non trouvée');
          return;
        }

        // Utiliser les acteurs de la procédure ou ceux sélectionnés
        const acteurs = procedure.acteurs.length > 0 ? procedure.acteurs : 
          (selectedUser ? [selectedUser] : []);

        const instance = procedureService.createProcedureInstance(
          selectedProcedure,
          courrier.id,
          user.id,
          acteurs
        );

        setLoadingOperations({ update: false });
        window.alert(`Courrier assigné à la procédure "${procedure.nom}" avec succès. ${instance.evenements.length} événement(s) créé(s).`);
        onClose();
      } catch (error: any) {
        setLoadingOperations({ update: false });
        window.alert(error.message || 'Erreur lors de l\'assignation à la procédure');
      }
    } else {
      // Assignation classique avec logique améliorée pour le secrétariat
      let targetUser = selectedUser;
      
      // Si l'utilisateur est le secrétariat et n'a pas spécifié d'utilisateur
      if (user.role === Role.SECRETAIRE && !selectedUser) {
        if (assignType === 'direction' && selectedDirection) {
          // Chercher le directeur de la direction
          const directeur = adminService.getAllUsers().find(u => 
            u.role === Role.DIRECTEUR_GENERAL && 
            u.direction === selectedDirection && 
            u.actif
          );
          if (directeur) {
            targetUser = directeur.id;
            window.alert(`Orientation automatique vers le directeur de la direction ${selectedDirection}`);
          }
        } else if (assignType === 'division' && selectedDivision) {
          // Chercher le directeur de la direction pour la division
          const directeur = adminService.getAllUsers().find(u => 
            u.role === Role.DIRECTEUR_GENERAL && 
            (u as any).division === selectedDivision && 
            u.actif
          );
          if (directeur) {
            targetUser = directeur.id;
            window.alert(`Orientation automatique vers le directeur de la division ${selectedDivision}`);
          }
        } else if (assignType === 'service' && selectedService) {
          // Chercher le chef de service, sinon un agent dédié
          const chefService = adminService.getAllUsers().find(u => 
            u.role === Role.CHEF_SERVICE && 
            u.service === selectedService && 
            u.actif
          );
          if (chefService) {
            targetUser = chefService.id;
            window.alert(`Orientation automatique vers le chef du service ${selectedService}`);
          } else {
            // Si pas de chef de service, chercher un agent dédié
            const agent = adminService.getAllUsers().find(u => 
              u.role === Role.AGENT && 
              u.service === selectedService && 
              u.actif
            );
            if (agent) {
              targetUser = agent.id;
              window.alert(`Orientation automatique vers l'agent du service ${selectedService}`);
            }
          }
        }
      }

      if (!targetUser) {
        setLoadingOperations({ update: false });
        window.alert('Veuillez sélectionner un utilisateur ou aucune cible appropriée trouvée');
        return;
      }

      // Mettre à jour le courrier avec priorité, direction et service
      await courrierService.updateCourrier(courrier.id, {
        priorite,
        direction: selectedDirection || undefined,
        service: selectedService || undefined
      });

      // Créer l'assignation
      try {
        await courrierService.createAssignation({
          courrierId: courrier.id,
          assigneA: targetUser,
          assignePar: user.id,
          dateEcheance: dateEcheance ? new Date(dateEcheance) : undefined,
          instructions: instructions || undefined,
          statut: 'EN_ATTENTE'
        });

        setLoadingOperations({ update: false });
        window.alert('Courrier assigné avec succès');
        onClose();
      } catch (error: any) {
        setLoadingOperations({ update: false });
        window.alert(error.message || 'Erreur lors de la création de l\'assignation');
      }
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      // validations de la cible
      if (assignMode === 'procedure') {
        if (!selectedProcedure) {
          window.alert('Veuillez sélectionner une procédure');
          return;
        }
      } else {
        if ((assignType === 'direction' || assignType === 'division') && !selectedDirection) {
          window.alert('Veuillez sélectionner une direction');
          return;
        }
        if (assignType === 'division' && !selectedDivision) {
          window.alert('Veuillez sélectionner une division');
          return;
        }
        if (assignType === 'service' && !selectedService) {
          window.alert('Veuillez sélectionner un service');
          return;
        }
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      // validations des détails avant validation finale
      if (assignMode === 'classique' && !selectedUser) {
        window.alert('Veuillez sélectionner un utilisateur à assigner');
        return;
      }
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(1);
    }
  };

  // Filtrer les directions/services selon le niveau d'accès
  const getAccessibleDirections = () => {
    if (user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL || user.role === Role.SECRETAIRE) {
      return entities.filter(e => e.type === 'direction');
    }
    if (user.role === Role.DIRECTEUR_GENERAL && user.direction) {
      return entities.filter(e => e.type === 'direction' && e.nom === user.direction);
    }
    return [];
  };

  const getAccessibleDivisions = () => {
    if (user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL || user.role === Role.SECRETAIRE) {
      return divisions;
    }
    if (user.role === Role.DIRECTEUR_GENERAL && user.direction) {
      return divisions.filter((d: { id: string }) => {
        const dirEntity = entities.find(e => e.nom === selectedDirection);
        return dirEntity && entiteOrganisationnelleService.getDivisionsByDirection(dirEntity.id).some((div: { id: string }) => div.id === d.id);
      });
    }
    return divisions;
  };

  const getAccessibleServices = () => {
    if (user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL || user.role === Role.SECRETAIRE) {
      return services;
    }
    if (user.role === Role.DIRECTEUR_GENERAL && user.direction) {
      return services.filter((s: { parentId?: string; nom?: string }) => {
        const parent = entities.find(e => e.id === s.parentId);
        const divParent = divisions.find((d: { id: string }) => d.id === s.parentId);
        return parent?.nom === user.direction || divParent;
      });
    }
    if (user.role === Role.CHEF_SERVICE && user.service) {
      return services.filter((s: { nom: string }) => s.nom === user.service);
    }
    return [];
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {/* Stepper */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            1
          </div>
          <span className={`text-sm font-medium ${step === 1 ? 'text-blue-600' : 'text-gray-500'}`}>
            Sélection de la cible
          </span>
          <div className="flex-1 h-px bg-gray-200 mx-2" />
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            2
          </div>
          <span className={`text-sm font-medium ${step === 2 ? 'text-blue-600' : 'text-gray-500'}`}>
            Détails
          </span>
          <div className="flex-1 h-px bg-gray-200 mx-2" />
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${step === 3 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            3
          </div>
          <span className={`text-sm font-medium ${step === 3 ? 'text-blue-600' : 'text-gray-500'}`}>
            Validation
          </span>
        </div>
      </div>

      {/* Étape 1 : choix du mode et de la cible */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Choix du mode d'assignation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mode d'assignation</label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="classique"
                  checked={assignMode === 'classique'}
                  onChange={() => {
                    setAssignMode('classique');
                    setSelectedProcedure('');
                    setStep(1);
                  }}
                  className="mr-2"
                />
                <span>Assignation classique</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="procedure"
                  checked={assignMode === 'procedure'}
                  onChange={() => {
                    setAssignMode('procedure');
                    setSelectedDirection('');
                    setSelectedService('');
                    setSelectedUser('');
                    setStep(1);
                  }}
                  className="mr-2"
                />
                <FontAwesomeIcon icon={faUserCheck} className="mr-2" />
                <span>Assigner à une procédure</span>
              </label>
            </div>
          </div>

          {assignMode === 'procedure' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Procédure *
                </label>
                <select
                  value={selectedProcedure}
                  onChange={(e) => setSelectedProcedure(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Sélectionner une procédure</option>
                  {procedures.map(proc => (
                    <option key={proc.id} value={proc.id}>
                      {proc.nom} ({proc.dureeTotale}h, {proc.evenements.length} événement(s))
                    </option>
                  ))}
                </select>
                {selectedProcedure && (() => {
                  const proc = procedures.find(p => p.id === selectedProcedure);
                  return proc ? (
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm">
                      <p className="font-semibold text-blue-900">{proc.nom}</p>
                      {proc.description && (
                        <p className="text-blue-700 mt-1">{proc.description}</p>
                      )}
                      <div className="mt-2 flex gap-4 text-blue-600">
                        <span><FontAwesomeIcon icon={faCalendar} className="mr-1" />{proc.evenements.length} événement(s)</span>
                        <span><FontAwesomeIcon icon={faClock} className="mr-1" />{proc.dureeTotale}h</span>
                        <span><FontAwesomeIcon icon={faUsers} className="mr-1" />{proc.acteurs.length} acteur(s)</span>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
              {procedures.length === 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
                  Aucune procédure disponible. Créez d'abord une procédure dans la page "Gestion des procédures".
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type d'assignation</label>
                <div className="flex gap-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="direction"
                      checked={assignType === 'direction'}
                      onChange={() => {
                        setAssignType('direction');
                        setSelectedDirection('');
                        setSelectedDivision('');
                        setSelectedService('');
                        setSelectedUser('');
                      }}
                      className="mr-2"
                    />
                    <FontAwesomeIcon icon={faBuilding} className="mr-2" />
                    Direction
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="division"
                      checked={assignType === 'division'}
                      onChange={() => {
                        setAssignType('division');
                        setSelectedDirection('');
                        setSelectedDivision('');
                        setSelectedService('');
                        setSelectedUser('');
                      }}
                      className="mr-2"
                    />
                    <FontAwesomeIcon icon={faLayerGroup} className="mr-2" />
                    Division
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value="service"
                      checked={assignType === 'service'}
                      onChange={() => {
                        setAssignType('service');
                        setSelectedDirection('');
                        setSelectedDivision('');
                        setSelectedService('');
                        setSelectedUser('');
                      }}
                      className="mr-2"
                    />
                    <FontAwesomeIcon icon={faUsers} className="mr-2" />
                    Service
                  </label>
                </div>
              </div>

              {assignType === 'direction' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Direction *
                  </label>
                  <select
                    value={selectedDirection}
                    onChange={(e) => {
                      setSelectedDirection(e.target.value);
                      setSelectedService('');
                      setSelectedUser('');
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Sélectionner une direction</option>
                    {getAccessibleDirections().map((dir) => (
                      <option key={dir.id} value={dir.nom}>
                        {dir.nom}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {assignType === 'division' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Direction *
                    </label>
                    <select
                      value={selectedDirection}
                      onChange={(e) => {
                        setSelectedDirection(e.target.value);
                        setSelectedDivision('');
                        setSelectedService('');
                        setSelectedUser('');
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Sélectionner une direction</option>
                      {getAccessibleDirections().map((dir) => (
                        <option key={dir.id} value={dir.nom}>
                          {dir.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Division *
                    </label>
                    <select
                      value={selectedDivision}
                      onChange={(e) => {
                        setSelectedDivision(e.target.value);
                        setSelectedUser('');
                      }}
                      disabled={!selectedDirection}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      required
                    >
                      <option value="">Sélectionner une division</option>
                      {getAccessibleDivisions().map((division) => (
                        <option key={division.id} value={division.id}>
                          {division.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {assignType === 'service' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Direction (optionnel)
                    </label>
                    <select
                      value={selectedDirection}
                      onChange={(e) => {
                        setSelectedDirection(e.target.value);
                        setSelectedService('');
                        setSelectedUser('');
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Toutes les directions</option>
                      {getAccessibleDirections().map((dir) => (
                        <option key={dir.id} value={dir.nom}>
                          {dir.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Service *
                    </label>
                    <select
                      value={selectedService}
                      onChange={(e) => {
                        setSelectedService(e.target.value);
                        setSelectedUser('');
                      }}
                      disabled={!selectedDirection && assignType === 'service'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      required
                    >
                      <option value="">Sélectionner un service</option>
                      {getAccessibleServices().map((service) => (
                        <option key={service.id || service.nom} value={service.nom}>
                          {service.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Étape 2 : détails (priorité, assigné, dates, instructions) */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Priorité *
            </label>
            <select
              value={priorite}
              onChange={(e) => setPriorite(e.target.value as Priorite)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value={Priorite.BASSE}>Basse</option>
              <option value={Priorite.NORMALE}>Normale</option>
              <option value={Priorite.HAUTE}>Haute</option>
              <option value={Priorite.URGENTE}>Urgente</option>
            </select>
          </div>

          {assignMode === 'classique' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assigné à *
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Sélectionner un utilisateur</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nom} ({u.email}) - {u.role}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date d'échéance
              </label>
              <input
                type="date"
                value={dateEcheance}
                onChange={(e) => setDateEcheance(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Instructions
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows={3}
                placeholder="Instructions pour le traitement du courrier..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Étape 3 : validation finale avec récapitulatif */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50 text-sm text-gray-700">
            <p className="font-semibold text-gray-900 mb-2">Récapitulatif de l'assignation</p>
            <ul className="space-y-1">
              <li>
                <span className="text-gray-500">Courrier :</span>{' '}
                <span className="font-medium">{courrier.numero}</span> - {(courrier.objet || '').replace(new RegExp('<[^>]*>', 'g'), '')}
              </li>
              <li>
                <span className="text-gray-500">Mode :</span>{' '}
                <span className="font-medium">{assignMode === 'procedure' ? 'Procédure' : 'Classique'}</span>
              </li>
              {assignMode === 'procedure' && selectedProcedure && (
                <li>
                  <span className="text-gray-500">Procédure :</span>{' '}
                  <span className="font-medium">{procedures.find(p => p.id === selectedProcedure)?.nom}</span>
                </li>
              )}
              {assignMode === 'classique' && (
                <>
                  <li>
                    <span className="text-gray-500">Type d'assignation :</span>{' '}
                    <span className="font-medium">
                      {assignType === 'direction' && 'Direction'}
                      {assignType === 'division' && 'Division'}
                      {assignType === 'service' && 'Service'}
                    </span>
                  </li>
                  {selectedDirection && (
                    <li>
                      <span className="text-gray-500">Direction :</span>{' '}
                      <span className="font-medium">{selectedDirection}</span>
                    </li>
                  )}
                  {selectedDivision && (
                    <li>
                      <span className="text-gray-500">Division :</span>{' '}
                      <span className="font-medium">
                        {getAccessibleDivisions().find(d => d.id === selectedDivision)?.nom || selectedDivision}
                      </span>
                    </li>
                  )}
                  {selectedService && (
                    <li>
                      <span className="text-gray-500">Service :</span>{' '}
                      <span className="font-medium">{selectedService}</span>
                    </li>
                  )}
                  {selectedUser && (
                    <li>
                      <span className="text-gray-500">Assigné à :</span>{' '}
                      <span className="font-medium">
                        {assignableUsers.find(u => u.id === selectedUser)?.nom || selectedUser}
                      </span>
                    </li>
                  )}
                </>
              )}
              <li>
                <span className="text-gray-500">Priorité :</span>{' '}
                <span className="font-medium">{priorite}</span>
              </li>
              {dateEcheance && (
                <li>
                  <span className="text-gray-500">Échéance :</span>{' '}
                  <span className="font-medium">{dateEcheance}</span>
                </li>
              )}
              {instructions && (
                <li>
                  <span className="text-gray-500">Instructions :</span>{' '}
                  <span className="font-medium">{instructions}</span>
                </li>
              )}
            </ul>
          </div>
          <p className="text-xs text-gray-500">
            Vérifiez les informations ci-dessus puis cliquez sur <span className="font-semibold">« Valider l'assignation »</span> pour confirmer.
          </p>
        </div>
      )}

      {/* Actions de navigation */}
      <div className="flex items-center justify-between gap-2 pt-4 border-t mt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
        >
          Annuler
        </button>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={handlePrevStep}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              Précédent
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              onClick={handleNextStep}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Suivant
            </button>
          )}
          {step === 3 && (
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              Valider l'assignation
            </button>
          )}
        </div>
      </div>
    </form>
  );
};

export default ListeCourriers;

