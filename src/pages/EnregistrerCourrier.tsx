import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import ReactDOM from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { courrierService } from '../services/courrierService';
import { categorieCourrierService } from '../services/categorieCourrierService';
import { laravelApiService } from '../services/laravelApiService';
import { directionService } from '../services/directionService';
import { entiteOrganisationnelleService } from '../services/entiteOrganisationnelleService';
import { entiteTypeService } from '../services/entiteTypeService';
import { scannerService, checkScannerBackendHealth, Scanner, DEFAULT_SCAN_SETTINGS, type ScanSettings, type ScanPageSize } from '../services/scannerService';
import { userSettingsService } from '../services/userSettingsService';
import jsPDF from 'jspdf';
import { testCourrierService } from '../services/testCourrierService';
import { TypeCourrier, Priorite, CategorieFichier, SensCourrier, CategorieCourrier, Role, Permission, Courrier } from '../types';
import { categorieFichierService } from '../services/categorieFichierService';
import { formulaireCourrierService, ExtraFieldConfig, ExtraFieldsBySensAndType, FormStructure, urgencyOptionLabelToPriorite, prioriteToUrgencyOptionLabel } from '../services/formulaireCourrierService';
import { optimizedUploadService } from '../services/optimizedUploadService';
// import { notificationService } from '../services/notificationService'; // Désactivé - Firestore
import { adminService } from '../services/adminService';
import { MaterialDateTimeField } from '../components/MaterialDateTimeField';
import { Slider } from '@mui/material';
import CustomDialog, { DialogOptions } from '../components/CustomDialog';
import SearchableSelect from '../components/SearchableSelect';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCheckCircle, faFilePdf, faSpinner, faFileAlt, faExclamationTriangle,
  faTextWidth, faAlignLeft, faCalendar, faAt, faHashtag, faPhone, faList,
  faCheckSquare, faToggleOn, faFileUpload, faLink, faUser, faBuilding,
  faFile, faClock, faMapMarkerAlt, faGlobe, faTag, faInfoCircle,
  faQuestionCircle, faExclamationCircle, faStar, faHeart, faFlag,
  faBookmark, faBell, faCog, faKey, faLock, faUnlock, faSearch,
  faFilter, faHome, faCar, faPlane, faTrain, faShip, faBicycle,
  faMotorcycle, faBus, faTaxi, faTruck, faMoneyBill, faCreditCard,
  faWallet, faChartLine, faTable, faVideo, faMusic, faFilm,
  faGamepad, faShield, faGem, faCrown, faTrophy, faMedal,
  faAward, faCertificate, faGraduationCap, faBook, faNewspaper,
  faDownload, faUpload, faShare, faPaperclip, faFolder, faFolderOpen,
  faDatabase, faServer, faWifi, faBatteryFull, faPlug, faLightbulb,
  faFire, faWater, faRecycle, faArchive, faBox, faBoxOpen, faGift,
  faShoppingCart, faStore, faBriefcase, faSuitcase, faCoins,
  faDollarSign, faEuroSign, faPoundSign, faYenSign, faRubleSign,
  faEnvelope, faEnvelopeOpen, faUsers, faChevronRight, faChevronLeft,
  faPrint, faImage, faCheck, faTimes, faPlus, faTrash, faFileWord,
  faFileExcel, faFileImage, faChevronDown, faCopy, faPaste, faSquare,
  faEye, faLayerGroup, faEdit, faArrowRight, faArrowLeft, faExternalLinkAlt,
  faSave, faFolderPlus, faUserCircle, faAddressCard, faIdCard,
  faStickyNote, faClipboard, faSignature, faStamp, faPaperPlane,
  faInbox, faSignOutAlt, faReply, faReplyAll, faForward, faShareAlt,
  faCloud, faCloudUploadAlt, faCloudDownloadAlt, faSync, faSyncAlt,
  faHistory, faRedo, faUndo, faEraser, faHighlighter, faMarker,
  faThumbtack, faScissors, faCut,
  faClipboardCheck, faClipboardList, faTasks, faListAlt,
  faListOl, faListUl, faIndent, faOutdent, faAlignCenter,
  faAlignJustify, faAlignRight, faBold, faItalic, faUnderline,
  faStrikethrough, faSuperscript, faSubscript, faQuoteLeft,
  faQuoteRight, faCode, faTerminal, faKeyboard, faDesktop,
  faMobile, faTablet, faLaptop, faTv, faCamera, faVideoSlash,
  faMicrophone, faMicrophoneSlash, faVolumeUp, faVolumeDown,
  faVolumeMute, faPlay, faPause, faStop, faStepForward,
  faStepBackward, faFastForward, faFastBackward, faCompress,
  faExpand, faExpandArrowsAlt, faCompressArrowsAlt, faArrowsAlt,
  faArrowsAltH, faArrowsAltV, faExchangeAlt,
  faRandom, faRetweet, faShuffle, faRedoAlt, faUndoAlt,
  faProjectDiagram, faCodeBranch
} from '@fortawesome/free-solid-svg-icons';

// Fonction pour vérifier si l'utilisateur a une permission spécifique
const hasPermission = (permission: Permission): boolean => {
  const { user } = useAuth();
  if (!user) return false;
  
  // Super admin et DG ont toutes les permissions
  if (user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL) {
    return true;
  }
  
  // Vérifier les permissions de l'utilisateur
  const userFromList = adminService.getUserById(user.id);
  if (!userFromList) return false;
  
  // Vérifier si l'utilisateur a la permission
  return userFromList.permissions?.includes(permission) || false;
};

// Champs de base à exclure des champs dynamiques (pour éviter les doublons)
const CORE_FIELDS = ['type', 'expediteur', 'destinataire', 'objet'];

const DRAFT_STORAGE_KEY = 'gestioncourrier_enregistrer_draft';
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

const getSectionsFor = (
  config: ExtraFieldsBySensAndType,
  sens: SensCourrier,
  type: TypeCourrier
): FormStructure => config?.[sens]?.[type] || [];

const normDir = (d?: string) => (d || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const isDirectionGenerale = (dir?: string): boolean => {
  const n = normDir(dir);
  return !n || n.includes('general') || n.includes('generale') || n === 'dg';
};

/**
 * Détermine les valeurs par défaut expéditeur/destinataire selon le rôle de l'utilisateur
 * et le sens du courrier (règles ARMP RDC).
 */
const getDefaultSenderRecipient = (
  user: { role?: string; direction?: string } | null | undefined,
  sens: SensCourrier
): { expediteur: string; destinataire: string } => {
  const result = { expediteur: '', destinataire: '' };
  if (!user) return result;

  const userDirection = user.direction || '';
  const isSecDG = user.role === Role.SECRETAIRE && isDirectionGenerale(userDirection);

  if (isSecDG) {
    // Secrétaire du DG
    if (sens === SensCourrier.ENTRANT) {
      result.destinataire = 'Direction Générale';
    } else {
      result.expediteur = 'Direction Générale';
    }
  } else if (user.role === Role.SECRETAIRE) {
    // Secrétaire d'une direction X
    if (sens === SensCourrier.ENTRANT) {
      result.destinataire = userDirection;
    } else {
      result.expediteur = userDirection;
    }
  } else if (user.role === Role.DIRECTEUR) {
    // Directeur d'une direction X
    if (sens === SensCourrier.ENTRANT) {
      result.destinataire = 'Direction Générale';
    } else {
      result.expediteur = userDirection;
      result.destinataire = 'Direction Générale';
    }
  } else if (user.role === Role.DIRECTEUR_GENERAL) {
    if (sens === SensCourrier.ENTRANT) {
      result.destinataire = userDirection || 'Direction Générale';
    } else {
      result.expediteur = userDirection || 'Direction Générale';
    }
  } else if (user.direction) {
    // Autres rôles avec direction
    if (sens === SensCourrier.ENTRANT) {
      result.destinataire = userDirection;
    } else {
      result.expediteur = userDirection;
    }
  }

  return result;
};

// --- HELPERS HORS COMPOSANT ---

const inputBaseClass = 'w-full px-2.5 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all text-sm';

const getColSpanClass = (width: number): string => {
  const colMap: Record<number, string> = { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6', 7: 'col-span-7', 8: 'col-span-8', 9: 'col-span-9', 10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12' };
  return colMap[width] || 'col-span-6';
};

// --- COMPOSANT APERÇU PDF ---

const PdfPreviewCanvas: React.FC<{ url: string; fillContainer?: boolean; showPageLabel?: boolean }> = ({ url, fillContainer = false, showPageLabel = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [numPages, setNumPages] = useState<number>(1);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const renderPdf = async () => {
      try {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setNumPages(doc.numPages);
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport, canvas }).promise;
        }
      } catch (e: any) {
        if (!cancelled) setError("Erreur de chargement du PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    renderPdf();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center bg-gray-100 p-4 rounded">
      {loading && <FontAwesomeIcon icon={faSpinner} spin size="2x" />}
      {error && <p className="text-red-500">{error}</p>}
      <canvas ref={canvasRef} className="max-w-full shadow-lg" />
      {!loading && !error && showPageLabel && <p className="mt-2 text-xs text-gray-500">Page 1 / {numPages}</p>}
    </div>
  );
};

// --- COMPOSANT PRINCIPAL ---

const EnregistrerCourrier: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreateSortant = user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL;
  // Secrétaire DG = Secrétaire sans direction assignée OU direction = 'Direction Générale'
  const isSecretaireDG = user?.role === Role.SECRETAIRE &&
    (!user?.direction || user?.direction === 'Direction Générale');
  const canCreateExterne = isSecretaireDG || user?.role === Role.SUPER_ADMIN;
  
  // Mode édition : récupérer l'ID du courrier depuis l'URL
  const courrierId = searchParams.get('id');
  const isEditMode = Boolean(courrierId);
  
  // États principaux
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingCourrier, setLoadingCourrier] = useState(false);
  const [courrierEnEdition, setCourrierEnEdition] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [directions, setDirections] = useState(directionService.getAllDirections());
  const [services, setServices] = useState(directionService.getAllServices());
  const [entities, setEntities] = useState(entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false));
  const [courrierFolders, setCategorieCourriers] = useState<CategorieCourrier[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>('');
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [showScanPopout, setShowScanPopout] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filesStructure, setFilesStructure] = useState<Map<string, CategorieFichier>>(new Map());
  const [dossiersTemp, setDossiersTemp] = useState<Map<string, { name: string; parentId?: string; items: Map<string, CategorieFichier> }>>(new Map());
  
  // États pour le modal de scan
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanModalPreviewFile, setScanModalPreviewFile] = useState<File | null>(null);
  const [scanModalPreviewUrl, setScanModalPreviewUrl] = useState<string | null>(null);
  const [scanModalPreviewId, setScanModalPreviewId] = useState<string | null>(null);
  const [scanModalError, setScanModalError] = useState<string | null>(null);
  const [scanBackendStatus, setScanBackendStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [scannersLoading, setScannersLoading] = useState(false);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const [imagePreviewZoom, setImagePreviewZoom] = useState(1);
  const [imagePreviewRotation, setImagePreviewRotation] = useState<0 | 90 | 180 | 270>(0);
  const [imagePreviewFit, setImagePreviewFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [isDragging, setIsDragging] = useState(false);
  
  // Cascade entités organisationnelles (INTERNE)
  const [entiteEmetteur, setEntiteEmetteur] = useState<Record<string, string>>({});
  const [entiteDestinataire, setEntiteDestinataire] = useState<Record<string, string>>({});
  const [areEntitiesLocked, setAreEntitiesLocked] = useState<boolean>(false);
  
  // Fichiers existants du courrier en mode édition
  const [existingFiles, setExistingFiles] = useState<CategorieFichier[]>([]);

  // Configuration des champs de formulaire
  const [extraFieldsConfig, setExtraFieldsConfig] = useState<ExtraFieldsBySensAndType>(
    () => formulaireCourrierService.getConfig()
  );
  
  // Dialog
  const [dialog, setDialog] = useState<DialogOptions & { isOpen: boolean }>({
    isOpen: false,
    message: '',
    type: 'info',
    title: '',
    confirmText: 'OK',
    cancelText: 'Annuler',
    onConfirm: undefined,
    onCancel: undefined
  });

  // Types d'entités actifs pour la cascade Organisation interne
  const filterLevels = entiteTypeService.getActiveTypesForFilters();
  
  type CourrierFormData = {
    sens: SensCourrier;
    type: TypeCourrier;
    dateReception: string;
    expediteur: string;
    destinataire: string;
    objet: string;
    direction?: string;
    service?: string;
    sousService?: string;
    contenuCourrier?: string;
    tailleDocumentScanne?: string;
    // Champs spécifiques pour courrier INTERNE
    serviceEmetteur?: string;
    serviceDestinataire?: string;
    // Champs spécifiques pour courrier EXTERNE
    referenceExterne?: string;
    referenceInterne?: string;
    // Options de workflow et notifications
    creerWorkflow?: boolean;
    notifierDG?: boolean;
    notifierResponsable?: boolean;
    instructionsWorkflow?: string;
    prioriteWorkflow?: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';
    [key: string]: any;
  };

  const [formData, setFormData] = useState<CourrierFormData>(() => {
    const urlSens = searchParams.get('sens') as SensCourrier | null;
    const urlType = searchParams.get('type') as TypeCourrier | null;
    const initSens = urlSens && Object.values(SensCourrier).includes(urlSens) ? urlSens : SensCourrier.ENTRANT;
    const initType = urlType && Object.values(TypeCourrier).includes(urlType) ? urlType : TypeCourrier.INTERNE;
    const defaults = getDefaultSenderRecipient(user, initSens);
    return {
      sens: initSens,
      type: initType,
      dateReception: dayjs().format('YYYY-MM-DDTHH:mm'),
      expediteur: defaults.expediteur,
      destinataire: defaults.destinataire,
      objet: '',
      direction: '',
      service: '',
      sousService: '',
      contenuCourrier: '',
      urgence: 3,
      creerWorkflow: false,
      notifierDG: true,
      notifierResponsable: true,
      instructionsWorkflow: '',
      prioriteWorkflow: 'NORMALE'
    };
  });
  
  // Étapes du formulaire
  const steps = [
    { id: 1, title: 'Type', description: 'Type et classement' },
    { id: 2, title: 'Informations', description: 'Détails du courrier' },
    { id: 3, title: 'Fichiers', description: 'Documents et pièces jointes' },
    { id: 4, title: 'Confirmation', description: 'Vérification finale' }
  ];
  
  const progressPercent = Math.round((currentStep / steps.length) * 100);

  // Appliquer les valeurs par défaut expéditeur/destinataire selon le rôle et le sens
  useEffect(() => {
    if (isEditMode) return;
    const defaults = getDefaultSenderRecipient(user, formData.sens);
    setFormData(prev => ({
      ...prev,
      expediteur: prev.expediteur || defaults.expediteur,
      destinataire: prev.destinataire || defaults.destinataire,
    }));
  }, [user?.role, user?.direction, formData.sens, isEditMode]);

  // Synchroniser sens/type avec les params URL quand l'utilisateur navigue dans le menu
  useEffect(() => {
    if (isEditMode) return;
    const urlSens = searchParams.get('sens') as SensCourrier | null;
    const urlType = searchParams.get('type') as TypeCourrier | null;
    setFormData(prev => ({
      ...prev,
      ...(urlSens && Object.values(SensCourrier).includes(urlSens) ? { sens: urlSens } : {}),
      ...(urlType && Object.values(TypeCourrier).includes(urlType) ? { type: urlType } : {})
    }));
  }, [searchParams.toString(), isEditMode]);

  // Synchroniser les params URL quand l'utilisateur change sens/type dans le formulaire (pour le menu actif du sidebar)
  useEffect(() => {
    if (isEditMode) return;
    const currentSens = searchParams.get('sens');
    const currentType = searchParams.get('type');
    if (currentSens !== formData.sens || currentType !== formData.type) {
      setSearchParams({ sens: formData.sens, type: formData.type }, { replace: true });
    }
  }, [formData.sens, formData.type, isEditMode]);

  // Charger la configuration du formulaire
  const [formConfig, setFormConfig] = useState<ExtraFieldsBySensAndType | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    const loadFormConfig = async () => {
      try {
        // Affichage immédiat avec la config en cache (ou défaut si cache vide)
        const syncConfig = formulaireCourrierService.getConfig();
        setFormConfig(syncConfig);
        // Puis charger depuis l'API pour avoir la config à jour (normalizeApiConfig applique withDefault)
        const asyncConfig = await formulaireCourrierService.getConfigAsync();
        setFormConfig(asyncConfig);
      } catch (error) {
        console.error('Erreur chargement configuration formulaire:', error);
        setFormConfig(formulaireCourrierService.getConfig());
      } finally {
        setLoadingConfig(false);
      }
    };
    void loadFormConfig();
  }, []);

  // Charger les données du courrier en mode édition
  useEffect(() => {
    const loadCourrierData = async () => {
      if (!courrierId || !isEditMode) return;
      
      setLoadingCourrier(true);
      try {
        console.log('🔍 Chargement du courrier ID:', courrierId);
        
        // Essayer de récupérer depuis le store Redux d'abord
        let courrier = courrierService.getCourrierById(courrierId);
        
        // Si pas trouvé dans le store, charger depuis l'API
        if (!courrier) {
          console.log('⚠️ Courrier non trouvé dans le store, chargement depuis l\'API...');
          await courrierService.loadCourriers(user?.id);
          courrier = courrierService.getCourrierById(courrierId);
        }
        
        if (!courrier) {
          console.error('❌ Courrier introuvable même après chargement API');
          showAlert('Le courrier que vous essayez de modifier n\'existe pas ou a été supprimé.', 'error', 'Courrier introuvable');
          navigate('/courriers');
          return;
        }
        
        console.log('✅ Courrier trouvé:', courrier);

        // Pré-remplir le formulaire avec les données du courrier
        // Conserver l'heure si elle est présente
        const rawDate: unknown = courrier.dateReception;
        let dateReceptionStr: string;
        if (rawDate instanceof Date) {
          dateReceptionStr = dayjs(rawDate).format('YYYY-MM-DDTHH:mm');
        } else if (typeof rawDate === 'string' && rawDate.includes('T')) {
          dateReceptionStr = rawDate.slice(0, 16);
        } else if (typeof rawDate === 'string') {
          dateReceptionStr = `${rawDate}T00:00`;
        } else {
          dateReceptionStr = dayjs().format('YYYY-MM-DDTHH:mm');
        }
        
        // Charger extraFields d'abord
        const extraFields = courrier.extraFields ? (typeof courrier.extraFields === 'string' ? JSON.parse(courrier.extraFields) : courrier.extraFields) : {};
        
        // Convertir Priorite → urgence (1-5) SEULEMENT si urgence n'existe pas déjà
        const prioriteToUrgence = (p: Priorite): number => {
          if (p === Priorite.BASSE) return 2;
          if (p === Priorite.NORMALE) return 3;
          if (p === Priorite.HAUTE) return 4;
          if (p === Priorite.URGENTE) return 5;
          return 3;
        };

        const newFormData = {
          sens: courrier.sens || SensCourrier.ENTRANT,
          type: courrier.type || TypeCourrier.INTERNE,
          dateReception: dateReceptionStr,
          expediteur: courrier.expediteur || '',
          destinataire: courrier.destinataire || '',
          objet: courrier.objet || '',
          direction: courrier.direction || '',
          service: courrier.service || '',
          sousService: (courrier as any).sousService || '',
          contenuCourrier: (courrier as any).contenuCourrier || '',
          priorite: courrier.priorite || Priorite.NORMALE,
          creerWorkflow: false,
          notifierDG: true,
          notifierResponsable: true,
          instructionsWorkflow: '',
          prioriteWorkflow: 'NORMALE',
          ...extraFields,
          // Appliquer la conversion uniquement si urgence n'est pas déjà dans extraFields
          urgence: extraFields.urgence !== undefined ? extraFields.urgence : prioriteToUrgence(courrier.priorite || Priorite.NORMALE)
        };
        
        console.log('📝 FormData pré-rempli:', {
          direction: newFormData.direction,
          service: newFormData.service,
          sousService: newFormData.sousService,
          objet: newFormData.objet
        });
        
        setFormData(newFormData);

        // Charger la catégorie si présent
        if ((courrier as any).dossierId) {
          setSelectedFolderId((courrier as any).dossierId);
        }

        // Stocker le courrier en édition
        setCourrierEnEdition(courrier);

        // Charger les entités organisationnelles pour les courriers internes
        if (courrier.type === TypeCourrier.INTERNE) {
          console.log('🔍 Courrier INTERNE détecté - Chargement des entités organisationnelles');
          console.log('📦 Courrier complet:', courrier);
          
          let entiteEmetteurChargee = false;
          let entiteDestinataireChargee = false;
          
          // Méthode 1: Depuis extraFieldsJson (string JSON)
          if (courrier.extraFields && (typeof courrier.extraFields === 'string' || typeof courrier.extraFields === 'object')) {
            try {
              const extraFields = typeof courrier.extraFields === 'string' ? JSON.parse(courrier.extraFields) : courrier.extraFields;
              console.log('📦 extraFields parsé depuis extraFieldsJson:', extraFields);
              
              // Chercher entiteEmetteurJson
              if (extraFields.entiteEmetteurJson) {
                const emetteurData = typeof extraFields.entiteEmetteurJson === 'string' 
                  ? JSON.parse(extraFields.entiteEmetteurJson) 
                  : extraFields.entiteEmetteurJson;
                if (emetteurData && Object.keys(emetteurData).length > 0) {
                  setEntiteEmetteur(emetteurData);
                  entiteEmetteurChargee = true;
                  console.log('✅ Entité émetteur chargée depuis extraFieldsJson:', emetteurData);
                }
              }
              
              // Chercher entiteDestinataireJson
              if (extraFields.entiteDestinataireJson) {
                const destinataireData = typeof extraFields.entiteDestinataireJson === 'string'
                  ? JSON.parse(extraFields.entiteDestinataireJson)
                  : extraFields.entiteDestinataireJson;
                if (destinataireData && Object.keys(destinataireData).length > 0) {
                  setEntiteDestinataire(destinataireData);
                  entiteDestinataireChargee = true;
                  console.log('✅ Entité destinataire chargée depuis extraFieldsJson:', destinataireData);
                }
              }
            } catch (error) {
              console.error('❌ Erreur parsing extraFieldsJson:', error);
            }
          }
          
          // Méthode 2: Depuis extraFields (objet direct)
          if (!entiteEmetteurChargee || !entiteDestinataireChargee) {
            if (courrier.extraFields && typeof courrier.extraFields === 'object') {
              console.log('🔄 Tentative avec extraFields (objet):', courrier.extraFields);
              
              if (!entiteEmetteurChargee && courrier.extraFields.entiteEmetteurJson) {
                const emetteurData = typeof courrier.extraFields.entiteEmetteurJson === 'string' 
                  ? JSON.parse(courrier.extraFields.entiteEmetteurJson) 
                  : courrier.extraFields.entiteEmetteurJson;
                if (emetteurData && Object.keys(emetteurData).length > 0) {
                  setEntiteEmetteur(emetteurData);
                  entiteEmetteurChargee = true;
                  console.log('✅ Entité émetteur chargée depuis extraFields:', emetteurData);
                }
              }
              
              if (!entiteDestinataireChargee && courrier.extraFields.entiteDestinataireJson) {
                const destinataireData = typeof courrier.extraFields.entiteDestinataireJson === 'string'
                  ? JSON.parse(courrier.extraFields.entiteDestinataireJson)
                  : courrier.extraFields.entiteDestinataireJson;
                if (destinataireData && Object.keys(destinataireData).length > 0) {
                  setEntiteDestinataire(destinataireData);
                  entiteDestinataireChargee = true;
                  console.log('✅ Entité destinataire chargée depuis extraFields:', destinataireData);
                }
              }
            }
          }
          
          // Méthode 3: Reconstruction depuis expediteur/destinataire si nécessaire
          if (!entiteEmetteurChargee && courrier.sens === SensCourrier.ENTRANT && courrier.expediteur) {
            console.log('🔄 Tentative de reconstruction entité émetteur depuis expediteur:', courrier.expediteur);
            // Chercher l'entité correspondante par nom
            const entiteMatch = entities.find(e => e.nom === courrier.expediteur);
            if (entiteMatch) {
              const reconstructedData: Record<string, string> = {};
              reconstructedData[entiteMatch.type] = entiteMatch.id;
              setEntiteEmetteur(reconstructedData);
              console.log('✅ Entité émetteur reconstruite:', reconstructedData, 'Type:', entiteMatch.type);
            } else {
              console.warn('⚠️ Aucune entité trouvée avec le nom:', courrier.expediteur);
            }
          }
          
          if (!entiteDestinataireChargee && courrier.sens === SensCourrier.SORTANT && courrier.destinataire) {
            console.log('🔄 Tentative de reconstruction entité destinataire depuis destinataire:', courrier.destinataire);
            // Chercher l'entité correspondante par nom
            const entiteMatch = entities.find(e => e.nom === courrier.destinataire);
            if (entiteMatch) {
              const reconstructedData: Record<string, string> = {};
              reconstructedData[entiteMatch.type] = entiteMatch.id;
              setEntiteDestinataire(reconstructedData);
              console.log('✅ Entité destinataire reconstruite:', reconstructedData, 'Type:', entiteMatch.type);
            } else {
              console.warn('⚠️ Aucune entité trouvée avec le nom:', courrier.destinataire);
            }
          }
          
          if (!entiteEmetteurChargee && !entiteDestinataireChargee) {
            console.warn('⚠️ Aucune entité organisationnelle n\'a pu être chargée');
          }
        }

        // Charger les fichiers attachés du courrier
        try {
          console.log('📁 Chargement des fichiers du courrier...');
          const fichiers = await categorieFichierService.getCategoriesFichiersByCourrier(courrierId);
          console.log('✅ Fichiers chargés:', fichiers.length, 'fichier(s)');
          
          if (fichiers.length > 0) {
            setExistingFiles(fichiers);
            console.log('📎 Fichiers existants:', fichiers.map(f => f.nom).join(', '));
          }
        } catch (error) {
          console.error('❌ Erreur lors du chargement des fichiers:', error);
        }
        
        console.log('✅ Courrier chargé pour édition:', courrier.numero);
        
        // Log final pour vérifier l'état des entités après chargement
        setTimeout(() => {
          console.log('🔍 État final des entités organisationnelles:');
          console.log('  - entiteEmetteur:', entiteEmetteur);
          console.log('  - entiteDestinataire:', entiteDestinataire);
        }, 100);
      } catch (error) {
        console.error('Erreur lors du chargement du courrier:', error);
        showAlert('Impossible de charger les données du courrier. Veuillez réessayer.', 'error', 'Erreur de chargement');
      } finally {
        setLoadingCourrier(false);
      }
    };

    loadCourrierData();
  }, [courrierFolders, user?.id]);

  // Obtenir les champs par défaut pour les courriers si aucun n'est configuré
  const getDefaultFields = () => {
    return [
      {
        id: 'default-section',
        columns: [
          {
            id: 'default-column',
            fields: [
              {
                id: 'dateReception',
                name: 'dateReception',
                label: 'Date de Réception',
                type: 'date',
                required: true,
                placeholder: 'Sélectionnez la date de réception du courrier'
              },
              {
                id: 'objet',
                name: 'objet',
                label: 'Objet du Courrier',
                type: 'text',
                required: true,
                placeholder: formData.type === TypeCourrier.INTERNE 
                  ? 'Saisissez l\'objet du courrier interne' 
                  : 'Saisissez l\'objet du courrier externe'
              },
              ...(formData.type === TypeCourrier.INTERNE ? [
                {
                  id: 'urgence',
                  name: 'urgence',
                  label: 'Niveau d\'Urgence',
                  type: 'number',
                  required: false,
                  placeholder: 'Définissez le niveau d\'urgence (1-5)'
                },
                {
                  id: 'contenu',
                  name: 'contenu',
                  label: 'Contenu du Courrier',
                  type: 'textarea',
                  required: false,
                  placeholder: 'Rédigez le contenu détaillé du courrier interne'
                }
              ] : []),
            ]
          }
        ]
      }
    ];
  };

  // Champs dynamiques sous forme d'état React — mis à jour dès que formConfig/sens/type changent
  const [allFields, setAllFields] = useState<FormStructure>([]);
  useEffect(() => {
    const config = formConfig ?? formulaireCourrierService.getConfig();
    const sections = config[formData.sens]?.[formData.type] || [];
    console.log('[DEBUG allFields]', {
      sens: formData.sens,
      type: formData.type,
      formConfigLoaded: !!formConfig,
      configKeys: config ? Object.keys(config) : [],
      configEntrantKeys: config?.[formData.sens] ? Object.keys(config[formData.sens]) : [],
      sectionsCount: sections.length,
      sections,
    });
    setAllFields(sections);
  }, [formConfig, formData.sens, formData.type]);

  // S'assurer que la date de réception est toujours initialisée avec l'heure actuelle
  useEffect(() => {
    if (!formData.dateReception) {
      setFormData(prev => ({
        ...prev,
        dateReception: dayjs().format('YYYY-MM-DDTHH:mm')
      }));
    }
  }, []);

  // Fonction pour suggérer l'assignation automatique basée sur le type de courrier
  const getSuggestedAssignment = useCallback(() => {
    if (!formData.direction && !formData.service) return null;
    
    // Règles d'assignation automatique (sans Firestore)
    const users = adminService.getAllUsers().filter(u => u.actif !== false);
    
    // Pour les courriers urgents, assigner au DG
    if (formData.prioriteWorkflow === 'URGENTE') {
      // Désactivé - Utiliser le service localStorage par défaut
      const dgUsers = users.filter(u => u.role === Role.DIRECTEUR_GENERAL);
      if (dgUsers.length > 0) return { userId: dgUsers[0].id, reason: 'Priorité urgente - Assignation au Directeur Général' };
    }
    
    // Pour les courriers externes entrants, assigner au directeur de la direction
    if (formData.sens === SensCourrier.ENTRANT && formData.type === TypeCourrier.EXTERNE && formData.direction) {
      const directeur = users.find(u => 
        u.role === Role.DIRECTEUR && 
        u.direction === formData.direction
      );
      if (directeur) return { userId: directeur.id, reason: `Courrier externe entrant - Assignation au Directeur de ${formData.direction}` };
    }
    
    // Pour les courriers internes, assigner au chef de service
    if (formData.type === TypeCourrier.INTERNE && formData.service) {
      const chefService = users.find(u => 
        u.role === Role.CHEF_SERVICE && 
        u.service === formData.service
      );
      if (chefService) return { userId: chefService.id, reason: `Courrier interne - Assignation au Chef de Service ${formData.service}` };
    }
    
    // Assignation par défaut au directeur de la direction
    if (formData.direction) {
      const directeur = users.find(u => 
        u.role === Role.DIRECTEUR && 
        u.direction === formData.direction
      );
      if (directeur) return { userId: directeur.id, reason: `Assignation par défaut au Directeur de ${formData.direction}` };
    }
    
    return null;
  }, [formData.sens, formData.type, formData.direction, formData.service, formData.prioriteWorkflow]);

  // Mettre à jour automatiquement l'assignation si un workflow est créé
  useEffect(() => {
    if (formData.creerWorkflow) {
      const suggestion = getSuggestedAssignment();
      if (suggestion) {
        // On pourrait ajouter un champ pour l'assignation suggérée
        console.log('Assignation suggérée:', suggestion);
      }
    }
  }, [formData.creerWorkflow, getSuggestedAssignment]);
  
  // Fonction pour créer une notification — sauvegarde localStorage d'abord, sync API en arrière-plan
  const createNotification = async (notification: {
    userId: string;
    type: string;
    title: string;
    message: string;
    relatedId?: string;
    relatedType?: string;
    priority?: string;
  }) => {
    try {
      const { notificationService } = await import('../services/notificationService');
      await notificationService.createNotification({
        userId: notification.userId,
        type: notification.type as any,
        title: notification.title,
        message: notification.message,
        relatedId: notification.relatedId,
        relatedType: notification.relatedType,
        priority: (notification.priority as any) || 'normal',
      });
    } catch (error) {
      console.warn('Erreur lors de la création de la notification:', error);
    }
  };
  
  // Gérer les valeurs des champs supplémentaires avec gestion spéciale pour la date
  const handleExtraFieldChange = (fieldId: string, value: any, preserveHtml: boolean = false) => {
    setFormData(prev => {
      let cleanValue = value;
      // Nettoyer le HTML sauf pour les champs riches (ReactQuill) où il doit être conservé
      if (!preserveHtml && typeof value === 'string' && value.includes('<')) {
        const stripped = value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        cleanValue = stripped || value; // garder HTML si texte non vide après nettoyage
      }
      const updated = { ...prev, [fieldId]: cleanValue };
      if (fieldId === 'dateReception' && (!value || value === '')) {
        updated.dateReception = dayjs().format('YYYY-MM-DDTHH:mm');
      }
      return updated;
    });
  };

  // --- Helpers cascade entités organisationnelles ---
  const getEntitiesForLevel = (typeCode: string, parentId?: string) => {
    return entities.filter(e =>
      e.type === typeCode &&
      e.actif !== false &&
      (parentId ? e.parentId === parentId : true)
    );
  };

  // Retourne l'ID du parent sélectionné au niveau précédent dans la cascade
  const getParentIdForLevel = (levelIndex: number, cascade: Record<string, string>): string | undefined => {
    if (levelIndex === 0) return undefined;
    const parentType = filterLevels[levelIndex - 1];
    return parentType ? cascade[parentType.code] : undefined;
  };

  // Nom de l'entité la plus profonde sélectionnée dans une cascade
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

  const handleEntiteEmetteurChange = (typeCode: string, entityId: string, levelIndex: number) => {
    const newCascade: Record<string, string> = {};
    // Conserver les sélections des niveaux précédents
    for (let i = 0; i < levelIndex; i++) {
      const code = filterLevels[i].code;
      if (entiteEmetteur[code]) newCascade[code] = entiteEmetteur[code];
    }
    if (entityId) newCascade[typeCode] = entityId;
    setEntiteEmetteur(newCascade);
    // Mettre à jour l'expéditeur dans formData
    const entity = entities.find(e => e.id === entityId);
    setFormData(prev => ({ ...prev, expediteur: entity?.nom || getDeepestEntityName(newCascade) }));
  };

  const handleEntiteDestinataireChange = (typeCode: string, entityId: string, levelIndex: number) => {
    const newCascade: Record<string, string> = {};
    for (let i = 0; i < levelIndex; i++) {
      const code = filterLevels[i].code;
      if (entiteDestinataire[code]) newCascade[code] = entiteDestinataire[code];
    }
    if (entityId) newCascade[typeCode] = entityId;
    setEntiteDestinataire(newCascade);
    const entity = entities.find(e => e.id === entityId);
    setFormData(prev => ({ ...prev, destinataire: entity?.nom || getDeepestEntityName(newCascade) }));
  };
  
  // Fonctions utilitaires
  const showAlert = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', title?: string) => {
    setDialog({
      isOpen: true,
      message,
      type,
      title: title || (type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : type === 'warning' ? 'Attention' : 'Information'),
      confirmText: 'OK',
      cancelText: '',
      onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })),
      onCancel: undefined
    });
  };
  
  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };
  
  const saveDraft = () => {
    try {
      const payload = {
        formData,
        currentStep,
        selectedFolderId,
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      showAlert('Brouillon sauvegardé', 'success');
    } catch {
      // localStorage full ou indisponible
    }
  };
  
  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const canGoToNextStep = () => {
    if (currentStep === 1) {
      // Vérifier sens et type uniquement - les entités organisationnelles sont optionnelles
      const hasSensAndType = formData.sens && formData.type;
      return hasSensAndType;
    }
    if (currentStep === 2) {
      // Vérifier les champs paramétrés obligatoires ou par défaut
      const stepFields = allFields;
      const requiredFields = stepFields.flatMap((section: any) => 
        section.columns?.flatMap((column: any) => 
          column.fields?.filter((field: any) => field.required) || []
        ) || []
      );
      
      // Vérifier que tous les champs obligatoires sont remplis
      const allRequiredFilled = requiredFields.every((field: any) => {
        const value = formData[field.name];
        return value !== undefined && value !== null && value !== '';
      });
      
      // Pour les courriers INTERNES, vérifier que l'entité appropriée est renseignée selon le sens
      return allRequiredFilled;
    }
    if (currentStep === 3) {
      // En mode édition, permettre de passer si des fichiers existants sont présents
      // OU si de nouveaux fichiers ont été ajoutés
      return selectedFiles.length > 0 || documentFile || (isEditMode && existingFiles.length > 0);
    }
    return true;
  };

  // === Fonctions du modal de scan ===
  const openScanModal = useCallback(() => {
    setScanModalError(null);
    setShowScanModal(true);
  }, []);

  const closeScanModal = useCallback(() => {
    if (scanModalPreviewUrl) URL.revokeObjectURL(scanModalPreviewUrl);
    if (scanModalPreviewId && laravelApiService.isConfigured()) {
      laravelApiService.deleteScanPreview(scanModalPreviewId).catch(() => {});
    }
    setScanModalPreviewUrl(null);
    setScanModalPreviewFile(null);
    setScanModalPreviewId(null);
    setScanModalError(null);
    setScanBackendStatus('idle');
    setShowScanModal(false);
  }, [scanModalPreviewUrl, scanModalPreviewId]);

  const refreshScannersInModal = useCallback(async () => {
    setScannersLoading(true);
    try {
      const [prefer, approach, savedScan] = await Promise.all([
        userSettingsService.getSettings<boolean>('scanner_prefer_system_driver', false),
        userSettingsService.getSettings<string>('scanner_detection_approach', 'auto'),
        userSettingsService.getSettings<ScanSettings>('scan_settings', DEFAULT_SCAN_SETTINGS),
      ]);
      setScanSettings(prev => ({ ...DEFAULT_SCAN_SETTINGS, ...prev, ...savedScan }));
      const detected = await scannerService.detectScanners(!!prefer, (approach === 'auto' || !approach ? undefined : approach as 'sane' | 'network' | 'system'));
      setScanners(detected);
      if (detected.length > 0 && !selectedScanner) setSelectedScanner(detected[0].id);
    } catch (e) {''
      console.error('Erreur détection scanners:', e);
    } finally {
      setScannersLoading(false);
    }
  }, [selectedScanner]);

  const handleScanInModal = async () => {
    setScanModalError(null);
    if (scanBackendStatus === 'error') {
      setScanModalError('Le serveur de scan ne répond pas. Démarrez-le (dossier server, node server.js, port 3001) puis fermez et rouvrez ce modal.');
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

  const handleConfirmScan = useCallback(() => {
    if (scanModalPreviewFile) {
      setSelectedFiles(prev => [...prev, scanModalPreviewFile]);
      showAlert('Document scanné ajouté avec succès', 'success');
      closeScanModal();
    }
  }, [scanModalPreviewFile, closeScanModal]);

  // Charger les scanners à l'ouverture du modal
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
    refreshScannersInModal();
  }, [showScanModal, refreshScannersInModal, selectedScanner]);

  // === Gestionnaires drag & drop ===
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
      showAlert(`${files.length} fichier(s) ajouté(s)`, 'success');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
      showAlert(`${files.length} fichier(s) ajouté(s)`, 'success');
    }
  };
  
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // Guard : seul le Secrétaire DG (et SUPER_ADMIN) peut créer un courrier EXTERNE
    if (formData.type === TypeCourrier.EXTERNE && !canCreateExterne) {
      alert('Vous n\'êtes pas autorisé à créer un courrier externe. Cette action est réservée au Secrétaire de la Direction Générale.');
      return;
    }
    setLoading(true);
    try {
      let courrierId: string;
      
      // Résoudre les vrais noms de champs depuis la config (peut différer de 'expediteur'/'urgence')
      const allCfgFieldsSubmit = allFields.flatMap((s: any) => s.columns?.flatMap((c: any) => c.fields || []) || []);
      const normLabel = (s: string | null | undefined) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s']/g, '');
      const urgFieldSubmit = allCfgFieldsSubmit.find((f: any) => (f.name || '').toLowerCase().includes('urgenc') || normLabel(f.label).includes('urgenc'));
      const expFieldSubmit = allCfgFieldsSubmit.find((f: any) =>
        f.name === 'expediteur' || (f.name || '').toLowerCase().includes('expediteur') ||
        (f.name || '').toLowerCase().includes('emetteur') || (f.name || '').toLowerCase().includes('sender') ||
        normLabel(f.label).includes('expediteur'));
      const destFieldSubmit = allCfgFieldsSubmit.find((f: any) =>
        f.name === 'destinataire' || (f.name || '').toLowerCase().includes('destinataire') ||
        (f.name || '').toLowerCase().includes('recipient') || (f.name || '').toLowerCase().includes('recepteur') ||
        normLabel(f.label).includes('destinataire'));
      const resolvedUrgence = Number(formData[urgFieldSubmit?.name ?? 'urgence'] ?? formData.urgence ?? 3);
      const resolvedExpediteur = String(formData[expFieldSubmit?.name ?? 'expediteur'] ?? formData.expediteur ?? '').trim()
        || (formData.type === TypeCourrier.INTERNE && Object.keys(entiteEmetteur).length > 0 ? getDeepestEntityName(entiteEmetteur) : '');
      const resolvedDestinataire = String(formData[destFieldSubmit?.name ?? 'destinataire'] ?? formData.destinataire ?? '').trim()
        || (formData.type === TypeCourrier.INTERNE && Object.keys(entiteDestinataire).length > 0 ? getDeepestEntityName(entiteDestinataire) : '');
      const resolvedPriorite: Priorite = resolvedUrgence <= 2 ? Priorite.BASSE
        : resolvedUrgence === 4 ? Priorite.HAUTE
        : resolvedUrgence >= 5 ? Priorite.URGENTE
        : Priorite.NORMALE;
      console.log('🎯 Résolution champs:', { urgField: urgFieldSubmit?.name, expField: expFieldSubmit?.name, resolvedUrgence, resolvedExpediteur, resolvedPriorite });

      // Construire extraFields depuis les champs du formulaire (hors colonnes directes API)
      const directColumns = new Set(['sens', 'type', 'dateReception', 'expediteur', 'destinataire', 'objet',
        'direction', 'service', 'sousService', 'priorite', 'statut', 'enregistrePar', 'numero', 'id',
        'files', 'folderId', 'createdAt', 'updatedAt', 'dateModification', 'modifiePar',
        'creerWorkflow', 'notifierDG', 'notifierResponsable', 'instructionsWorkflow', 'prioriteWorkflow', 'contenuCourrier']);
      const extraFieldsResolved: Record<string, any> = {};
      allFields.forEach((section: any) => {
        section.columns?.forEach((col: any) => {
          col.fields?.forEach((f: any) => {
            if (!directColumns.has(f.name) && formData[f.name] !== undefined) {
              extraFieldsResolved[f.name] = formData[f.name];
            }
          });
        });
      });

      // Champs UI uniquement — ne doivent jamais être envoyés à l'API Laravel
      const UI_ONLY_FIELDS = new Set(['files', 'folderId', 'creerWorkflow', 'notifierDG', 'notifierResponsable', 'instructionsWorkflow', 'prioriteWorkflow', 'contenuCourrier']);
      const formDataForApi: Record<string, any> = {};
      for (const [k, v] of Object.entries(formData as Record<string, any>)) {
        // Exclure champs UI-only et tout objet File / FileList
        if (UI_ONLY_FIELDS.has(k)) continue;
        if (v instanceof File || v instanceof FileList) continue;
        if (Array.isArray(v) && v.length > 0 && v[0] instanceof File) continue;
        formDataForApi[k] = v;
      }

      if (isEditMode && courrierEnEdition) {
        // MODE ÉDITION : Mettre à jour le courrier existant
        console.log('🔄 Mode édition - Mise à jour du courrier:', courrierEnEdition.id);
        
        const updates = {
          ...formDataForApi,
          expediteur: resolvedExpediteur || formData.expediteur,
          destinataire: resolvedDestinataire || formData.destinataire,
          extraFields: { ...((formData.extraFields as Record<string, any>) || {}), ...extraFieldsResolved },
          modifiePar: user?.id || 'system',
          dateModification: new Date().toISOString(),
          priorite: resolvedPriorite
        };
        
        console.log('📝 Updates à envoyer:', { priorite: updates.priorite, urgence: resolvedUrgence, extraFields: updates.extraFields });
        
        await courrierService.updateCourrier(courrierEnEdition.id, updates as unknown as Partial<Courrier>);
        courrierId = courrierEnEdition.id;

        if (user?.id) {
          // saveFolderMap sauvegarde en localStorage EN PREMIER puis sync API
          console.log('[Catégorie] Mapping sauvegardé (édition):', courrierId, '→', selectedFolderId);
          categorieCourrierService.saveCategoryMap(user.id, { [courrierId]: selectedFolderId || null })
            .catch(folderErr => console.warn('Classement catégorie (édition) non bloquant:', folderErr));
        }
      } else {
        // MODE CRÉATION : Créer un nouveau courrier
        console.log('➕ Mode création - Nouveau courrier');

        const courrierData: any = {
          ...formDataForApi,
          expediteur: resolvedExpediteur || formData.expediteur,
          destinataire: resolvedDestinataire || formData.destinataire,
          extraFields: extraFieldsResolved,
          priorite: resolvedPriorite,
          createdAt: new Date().toISOString(),
          enregistrePar: user?.id || 'system'
        };
        
        const createdCourrier = await courrierService.createCourrier(courrierData);
        courrierId = createdCourrier.id;

        if (user?.id) {
          // saveFolderMap sauvegarde en localStorage EN PREMIER puis sync API
          console.log('[Catégorie] Mapping sauvegardé (création):', courrierId, '→', selectedFolderId);
          categorieCourrierService.saveCategoryMap(user.id, { [courrierId]: selectedFolderId || null })
            .catch(folderErr => console.warn('Classement catégorie (création) non bloquant:', folderErr));
        }
      }

      // Uploader les nouveaux fichiers en ARRIÈRE-PLAN (non-bloquant)
      // Le courrier est déjà sauvegardé — l'upload ne doit pas ralentir ni bloquer la navigation
      if (laravelApiService.isConfigured() && selectedFiles.length > 0) {
        const validation = optimizedUploadService.validateFiles(selectedFiles, 100);
        if (!validation.valid) {
          showAlert(validation.error!, 'warning');
          // On continue quand même — le courrier est déjà créé
        } else {
          const uploadCreePar = user?.id || 'system';
          const uploadCourrierIdCopy = courrierId;
          const uploadFilesCopy = [...selectedFiles];
          // Délai 15s : laisse Phase1+Phase2+Phase0 se terminer avant que PHP traite l'upload
          setTimeout(() => {
            optimizedUploadService.uploadFiles(uploadCourrierIdCopy, uploadFilesCopy, {
              maxConcurrent: 1,       // séquentiel — évite la saturation PHP
              maxRetries: 1,          // 1 seul retry — pas de spam serveur
              timeout: 45000,         // 45s par fichier (php artisan serve mono-thread)
              compressImages: true,
              enableHeartbeat: false, // inutile avec keepalive:true
              creePar: uploadCreePar,
            }).then(results => {
              const failCount = results.filter(r => !r.success).length;
              if (failCount > 0) {
                console.warn(`⚠️ ${failCount} fichier(s) non uploadé(s) pour ${uploadCourrierIdCopy}. Réessayez depuis la page détail.`);
              } else {
                console.log(`✅ ${results.length} fichier(s) uploadé(s) en arrière-plan pour ${uploadCourrierIdCopy}`);
              }
            }).catch(err => {
              console.error('❌ Erreur upload arrière-plan:', err);
            });
          }, 3000);
        }
      }
      
      // Créer le workflow si demandé (avec API Laravel) - uniquement en mode création
      if (!isEditMode && formData.creerWorkflow && formData.instructionsWorkflow) {
        try {
          // Obtenir l'assignation suggérée
          const suggestedAssignment = getSuggestedAssignment();
          const assigneA = suggestedAssignment?.userId || 
                           (user?.role === Role.DIRECTEUR_GENERAL ? user.id : adminService.getAllUsers().find(u => u.role === Role.DIRECTEUR_GENERAL)?.id);
          
          // Utiliser l'API Laravel si configurée, sinon localStorage (non-bloquant)
          if (laravelApiService.isConfigured()) {
            laravelApiService.createWorkflowEtape({
              courrierId: courrierId,
              etape: 'Validation initiale',
              assigneA: assigneA || 'dg',
              statut: 'EN_ATTENTE',
              commentaire: formData.instructionsWorkflow,
              ordre: 1
            }).then(() => {
              console.log('Workflow créé via API Laravel:', courrierId);
            }).catch(err => {
              console.warn('⚠️ Création workflow en arrière-plan échouée:', err);
            });
          } else {
            // Fallback localStorage
            if (courrierService.createWorkflowEtape) {
              courrierService.createWorkflowEtape({
                courrierId: courrierId,
                etape: 'Validation initiale',
                assigneA: assigneA || 'dg',
                statut: 'EN_ATTENTE',
                commentaire: formData.instructionsWorkflow,
                creePar: user?.id ?? '',
                ordre: 1
              });
            }
            console.log('Workflow créé via localStorage:', courrierId);
          }
          
          // Notifier le DG (via API Laravel) - NON-BLOQUANT
          if (formData.notifierDG) {
            const dgUsers = adminService.getAllUsers().filter(u => u.role === Role.DIRECTEUR_GENERAL);
            if (dgUsers.length > 0) {
              const courrierInfo = isEditMode && courrierEnEdition ? courrierEnEdition : { numero: 'N/A', objet: formData.objet };
              createNotification({
                userId: dgUsers[0].id,
                type: 'workflow',
                title: 'Nouveau courrier nécessitant une validation',
                message: `Le courrier ${courrierInfo.numero} - ${courrierInfo.objet} nécessite votre validation pour le workflow.`,
                relatedId: courrierId,
                relatedType: 'courrier',
                priority: formData.prioriteWorkflow === 'URGENTE' ? 'urgent' : 
                         formData.prioriteWorkflow === 'HAUTE' ? 'high' : 'normal'
              }).catch(err => console.warn('Notification DG non envoyée:', err));
            }
          }
          
          // Notifier le responsable de la direction/service (via API Laravel) - NON-BLOQUANT
          if (formData.notifierResponsable && (formData.direction || formData.service)) {
            const responsables = adminService.getAllUsers().filter(u => 
              (u.role === Role.DIRECTEUR || u.role === Role.CHEF_SERVICE) &&
              u.actif !== false &&
              u.id !== user?.id && // Exclure l'utilisateur courant
              ((formData.direction && u.direction === formData.direction) ||
               (formData.service && u.service === formData.service))
            );
            
            for (const responsable of responsables) {
              const courrierInfo = isEditMode && courrierEnEdition ? courrierEnEdition : { numero: 'N/A' };
              createNotification({
                userId: responsable.id,
                type: 'courrier',
                title: 'Nouveau courrier enregistré',
                message: `Un nouveau courrier ${courrierInfo.numero} a été enregistré dans votre direction.`,
                relatedId: courrierId,
                relatedType: 'courrier',
                priority: 'normal'
              }).catch(err => console.warn('Notification responsable non envoyée:', err));
            }
          }
        } catch (workflowError) {
          console.warn('Erreur lors de la création du workflow:', workflowError);
        }
      }
      
      showAlert(
        isEditMode
          ? 'Courrier mis à jour avec succès'
          : selectedFolderId
            ? `Courrier enregistré et classé dans « ${courrierFolders.find(f => f.id === selectedFolderId)?.name ?? selectedFolderId} »`
            : 'Courrier enregistré avec succès',
        'success'
      );
      setTimeout(() => navigate('/courriers'), 300);
    } catch (error) {
      showAlert(
        error instanceof Error ? error.message : (isEditMode ? 'Erreur lors de la mise à jour' : 'Erreur lors de l\'enregistrement'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  };
  
  // Effets
  useEffect(() => {
    const loadEntities = async () => {
      try {
        if (laravelApiService.isConfigured()) {
          await Promise.all([
            adminService.refreshUsersFromApi().catch(() => {}),
            entiteOrganisationnelleService.refreshFromApi().catch(() => {}),
            entiteTypeService.syncFromApi().catch(() => {}),
            formulaireCourrierService.getConfigAsync().catch(() => {}),
          ]);
        } else {
          directionService.initializeDemoData();
          entiteOrganisationnelleService.initializeDemoData();
        }
      } finally {
        setDirections(directionService.getAllDirections());
        setServices(directionService.getAllServices());
        const loadedEntities = entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false);
        setEntities(loadedEntities);
        
        // Pré-sélectionner les entités de l'utilisateur courant (si aucune entité n'est déjà définie)
        if (user) {
          console.log('🔍 Pré-sélection des entités pour l\'utilisateur:', user.nom, { direction: user.direction, service: user.service, entiteId: user.entiteId });
          
          // Vérifier si les entités sont déjà définies (mode édition avec données existantes)
          const hasExistingEmetteur = Object.keys(entiteEmetteur).length > 0;
          const hasExistingDestinataire = Object.keys(entiteDestinataire).length > 0;
          
          // Chercher l'entité correspondant à la direction de l'utilisateur
          if (user.direction) {
            const userDirectionEntity = loadedEntities.find(e => 
              e.type === 'direction' && 
              (e.nom === user.direction || e.id === user.direction)
            );
            if (userDirectionEntity && !hasExistingEmetteur && !hasExistingDestinataire) {
              console.log('✅ Entité direction trouvée:', userDirectionEntity.nom);
              // Pour les courriers internes, définir selon le sens
              setEntiteEmetteur({ direction: userDirectionEntity.id });
              setEntiteDestinataire({ direction: userDirectionEntity.id });
              setAreEntitiesLocked(true);
            }
          }
          
          // Chercher l'entité correspondant au service de l'utilisateur
          if (user.service) {
            const userServiceEntity = loadedEntities.find(e => 
              e.type === 'service' && 
              (e.nom === user.service || e.id === user.service)
            );
            if (userServiceEntity && !hasExistingEmetteur && !hasExistingDestinataire) {
              console.log('✅ Entité service trouvée:', userServiceEntity.nom);
              // Trouver la division parente (si existe)
              const parentDivision = loadedEntities.find(e => 
                e.id === userServiceEntity.parentId && e.type === 'division'
              );
              // Trouver la direction parente
              let parentDirection = null;
              if (parentDivision) {
                parentDirection = loadedEntities.find(e => 
                  e.id === parentDivision.parentId && e.type === 'direction'
                );
              } else {
                // Service directement sous une direction
                parentDirection = loadedEntities.find(e => 
                  e.id === userServiceEntity.parentId && e.type === 'direction'
                );
              }
              const cascade: Record<string, string> = { service: userServiceEntity.id };
              if (parentDivision) {
                cascade.division = parentDivision.id;
              }
              if (parentDirection) {
                cascade.direction = parentDirection.id;
              }
              setEntiteEmetteur(cascade);
              setEntiteDestinataire(cascade);
              setAreEntitiesLocked(true);
            }
          }
          
          // Si l'utilisateur a un entiteId direct (prioritaire si aucune entité existante)
          if (user.entiteId && !hasExistingEmetteur && !hasExistingDestinataire) {
            const userEntity = loadedEntities.find(e => e.id === user.entiteId);
            if (userEntity) {
              console.log('✅ Entité utilisateur trouvée:', userEntity.nom, 'Type:', userEntity.type);
              const cascade: Record<string, string> = { [userEntity.type]: userEntity.id };
              // Chercher les parents pour compléter la cascade
              let currentParentId = userEntity.parentId;
              while (currentParentId) {
                const parent = loadedEntities.find(e => e.id === currentParentId);
                if (parent) {
                  cascade[parent.type] = parent.id;
                  currentParentId = parent.parentId;
                } else {
                  break;
                }
              }
              setEntiteEmetteur(cascade);
              setEntiteDestinataire(cascade);
              setAreEntitiesLocked(true);
            }
          }
        }
      }
    };
    void loadEntities();
  }, []);
  
  useEffect(() => {
    formulaireCourrierService.getConfigAsync().then((config) => {
      setExtraFieldsConfig(config);
    }).catch(() => {
      setExtraFieldsConfig(formulaireCourrierService.getConfig());
    });
  }, []);
  
  useEffect(() => {
    if (!user?.id) return;
    const loadFolderData = async () => {
      try {
        const { folders } = await categorieCourrierService.getCategoriesAndMapForUser(user.id);
        const deletedIds = categorieCourrierService.loadDeletedIds(user.id);
        setCategorieCourriers(folders.filter(folder => !deletedIds.has(folder.id)));
      } catch (error) {
        console.warn('Erreur chargement des dossiers:', error);
        setCategorieCourriers([]);
      }
    };
    void loadFolderData();
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-surface-100">
      {/* Header professionnel */}
      <div className="bg-white border-b border-surface-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
                isEditMode 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600' 
                  : 'bg-gradient-to-r from-primary-500 to-primary-600'
              }`}>
                <FontAwesomeIcon icon={isEditMode ? faEdit : faEnvelope} className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-surface-900">
                  {isEditMode ? 'Modification de Courrier' : 'Enregistrement de Courrier'}
                </h1>
                <p className="text-sm text-surface-600">
                  {isEditMode ? 'Modifier les informations du courrier existant' : 'Gestion professionnelle des correspondances'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isEditMode && (
                <button
                  type="button"
                  onClick={() => navigate(`/enregistrer-liste?sens=${formData.sens}&type=${formData.type}`)}
                  className="px-4 py-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
                  title="Saisir plusieurs courriers en tableau"
                >
                  <FontAwesomeIcon icon={faListAlt} />
                  Saisie en liste
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/courriers')}
                className="px-4 py-2 text-surface-600 hover:text-surface-900 hover:bg-surface-100 rounded-xl transition-colors flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                Retour
              </button>
            </div>
          </div>
          
          {/* Bandeau d'information du courrier en édition */}
          {isEditMode && courrierEnEdition && (
            <div className="mt-4 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50 border-2 border-amber-200/60 shadow-sm">
              <div className="px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                    <FontAwesomeIcon icon={faInfoCircle} className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-base font-bold text-amber-900">Courrier en cours d'édition</h3>
                      <span className="px-2.5 py-0.5 bg-amber-200 text-amber-800 text-xs font-semibold rounded-full">
                        {courrierEnEdition.numero}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-700 font-semibold">Objet :</span>
                        <span className="text-amber-800 truncate">{courrierEnEdition.objet?.replace(/<[^>]*>/g, '') || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-700 font-semibold">Type :</span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-bold rounded">
                            {courrierEnEdition.type === 'INTERNE' ? '🏢 Interne' : '🌍 Externe'}
                          </span>
                          <span className="px-2 py-0.5 bg-orange-200 text-orange-800 text-xs font-bold rounded">
                            {courrierEnEdition.sens === 'ENTRANT' ? '📥 Entrant' : '📤 Sortant'}
                          </span>
                        </div>
                      </div>
                      {courrierEnEdition.expediteur && (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-700 font-semibold">Expéditeur :</span>
                          <span className="text-amber-800 truncate">{courrierEnEdition.expediteur}</span>
                        </div>
                      )}
                      {courrierEnEdition.destinataire && (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-700 font-semibold">Destinataire :</span>
                          <span className="text-amber-800 truncate">{courrierEnEdition.destinataire}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Barre de progression professionnelle */}
        <div className="bg-white rounded-2xl shadow-card border border-surface-200 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-surface-700">Étape</span>
                <span className="text-2xl font-bold text-primary-600">{currentStep}</span>
                <span className="text-sm font-semibold text-surface-700">sur {steps.length}</span>
              </div>
              <div className="h-8 w-px bg-surface-300"></div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-sm font-medium text-surface-600">En cours</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => saveDraft()}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 font-medium transition-all shadow-md flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faSave} />
              Sauvegarder
            </button>
          </div>

          {/* Indicateurs d'étapes améliorés */}
          <div className="relative">
            <div className="flex items-center justify-between mb-8">
              {steps.map((step, index) => (
                <div key={step.id} className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-300 shadow-lg ${
                      currentStep > step.id
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white scale-105'
                        : currentStep === step.id
                        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white ring-4 ring-primary-100 scale-110 shadow-primary-200'
                        : 'bg-surface-200 text-surface-500'
                    }`}
                  >
                    {currentStep > step.id ? (
                      <FontAwesomeIcon icon={faCheck} className="w-6 h-6" />
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </div>
                  <div className="mt-3 text-center max-w-[100px]">
                    <div className={`text-sm font-bold mb-1 ${
                      currentStep >= step.id ? 'text-surface-900' : 'text-surface-500'
                    }`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-surface-600 leading-tight">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Ligne de connexion */}
            <div className="absolute top-8 left-0 right-0 h-1 bg-surface-200 -z-10"></div>
            <div 
              className="absolute top-8 left-0 h-1 bg-gradient-to-r from-green-500 to-primary-600 transition-all duration-500 -z-10"
              style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
            ></div>
          </div>

          {/* Pourcentage de progression */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-surface-700">Progression globale</span>
              <span className="text-2xl font-bold text-primary-600">{progressPercent}%</span>
            </div>
            <div className="w-full bg-surface-200 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500 shadow-inner"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="h-full bg-white bg-opacity-30 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

      {/* Contenu du formulaire professionnel */}
        <div className="bg-white rounded-2xl shadow-card border border-surface-200 overflow-hidden">
          {/* Étape 1: Type et classement */}
          {currentStep === 1 && (
            <div className="p-8">
              <div className="flex items-center gap-4 pb-6 border-b border-surface-200">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 flex items-center justify-center shadow-lg">
                  <FontAwesomeIcon icon={faEnvelope} className="text-white text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-surface-900">Type et Classement</h2>
                  <p className="text-sm text-surface-600">Définissez la nature et le sens du courrier</p>
                </div>
              </div>

              {/* Cartes de sélection interactives */}
              <div className="space-y-8 mt-8">
                {/* Sélection du sens du courrier */}
                <div className="space-y-4">
                  <label className="flex items-center gap-3 text-lg font-bold text-surface-800 uppercase tracking-wide">
                    <div className="w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                      <FontAwesomeIcon icon={faExchangeAlt} className="text-white" />
                    </div>
                    Sens du Courrier
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      onClick={() => setFormData(prev => ({ ...prev, sens: SensCourrier.ENTRANT }))}
                      className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                        formData.sens === SensCourrier.ENTRANT
                          ? 'bg-gradient-to-r from-primary-50 to-primary-100 border-primary-500 shadow-md scale-102'
                          : 'bg-white border-surface-200 hover:border-primary-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                          formData.sens === SensCourrier.ENTRANT
                            ? 'bg-gradient-to-r from-primary-500 to-primary-600 shadow-md'
                            : 'bg-surface-200'
                        }`}>
                          <FontAwesomeIcon icon={faInbox} className={`text-lg ${
                            formData.sens === SensCourrier.ENTRANT ? 'text-white' : 'text-surface-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-base font-bold mb-1 ${
                            formData.sens === SensCourrier.ENTRANT ? 'text-primary-900' : 'text-surface-800'
                          }`}>Courrier Entrant</h3>
                          <p className={`text-xs leading-relaxed line-clamp-2 ${
                            formData.sens === SensCourrier.ENTRANT ? 'text-primary-700' : 'text-surface-600'
                          }`}>
                            Reçu de sources externes ou internes, nécessite un traitement
                          </p>
                        </div>
                        {formData.sens === SensCourrier.ENTRANT && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center">
                            <FontAwesomeIcon icon={faCheck} className="text-white text-xs" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      onClick={() => setFormData(prev => ({ ...prev, sens: SensCourrier.SORTANT }))}
                      className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                        formData.sens === SensCourrier.SORTANT
                          ? 'bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-500 shadow-md scale-102'
                          : 'bg-white border-surface-200 hover:border-emerald-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                          formData.sens === SensCourrier.SORTANT
                            ? 'bg-gradient-to-r from-emerald-600 to-green-600 shadow-md'
                            : 'bg-surface-200'
                        }`}>
                          <FontAwesomeIcon icon={faSignOutAlt} className={`text-lg ${
                            formData.sens === SensCourrier.SORTANT ? 'text-white' : 'text-surface-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-base font-bold mb-1 ${
                            formData.sens === SensCourrier.SORTANT ? 'text-emerald-900' : 'text-surface-800'
                          }`}>Courrier Sortant</h3>
                          <p className={`text-xs leading-relaxed line-clamp-2 ${
                            formData.sens === SensCourrier.SORTANT ? 'text-emerald-700' : 'text-surface-600'
                          }`}>
                            Envoyé vers des destinataires externes ou internes, nécessite validation
                          </p>
                        </div>
                        {formData.sens === SensCourrier.SORTANT && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center">
                            <FontAwesomeIcon icon={faCheck} className="text-white text-xs" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sélection du type de courrier */}
                <div className="space-y-4">
                  <label className="flex items-center gap-3 text-lg font-bold text-surface-800 uppercase tracking-wide">
                    <div className="w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                      <FontAwesomeIcon icon={faTag} className="text-white" />
                    </div>
                    Type de Courrier
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      onClick={() => setFormData(prev => ({ ...prev, type: TypeCourrier.INTERNE }))}
                      className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                        formData.type === TypeCourrier.INTERNE
                          ? 'bg-gradient-to-r from-primary-50 to-primary-100 border-primary-500 shadow-md scale-102'
                          : 'bg-white border-surface-200 hover:border-primary-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                          formData.type === TypeCourrier.INTERNE
                            ? 'bg-gradient-to-r from-primary-500 to-primary-600 shadow-md'
                            : 'bg-surface-200'
                        }`}>
                          <FontAwesomeIcon icon={faBuilding} className={`text-lg ${
                            formData.type === TypeCourrier.INTERNE ? 'text-white' : 'text-surface-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-base font-bold mb-1 ${
                            formData.type === TypeCourrier.INTERNE ? 'text-primary-900' : 'text-surface-800'
                          }`}>Courrier Interne</h3>
                          <p className={`text-xs leading-relaxed line-clamp-2 ${
                            formData.type === TypeCourrier.INTERNE ? 'text-primary-700' : 'text-surface-600'
                          }`}>
                            Communication entre services et départements
                          </p>
                        </div>
                        {formData.type === TypeCourrier.INTERNE && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center">
                            <FontAwesomeIcon icon={faCheck} className="text-white text-xs" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Option Courrier Externe - désactivée pour les secrétaires */}
                    <div
                      onClick={() => canCreateExterne && setFormData(prev => ({ ...prev, type: TypeCourrier.EXTERNE }))}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
                        !canCreateExterne 
                          ? 'bg-surface-100 border-surface-200 cursor-not-allowed opacity-60'
                          : formData.type === TypeCourrier.EXTERNE
                            ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-500 shadow-md scale-102 cursor-pointer'
                            : 'bg-white border-surface-200 hover:border-amber-300 hover:shadow-sm cursor-pointer'
                      }`}
                      title={!canCreateExterne ? 'Réservé au Secrétaire de la Direction Générale' : ''}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                          formData.type === TypeCourrier.EXTERNE
                            ? 'bg-gradient-to-r from-amber-600 to-orange-600 shadow-md'
                            : 'bg-surface-200'
                        }`}>
                          <FontAwesomeIcon icon={faGlobe} className={`text-lg ${
                            formData.type === TypeCourrier.EXTERNE ? 'text-white' : 'text-surface-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-base font-bold mb-1 ${
                            formData.type === TypeCourrier.EXTERNE ? 'text-amber-900' : 'text-surface-800'
                          }`}>Courrier Externe</h3>
                          <p className={`text-xs leading-relaxed line-clamp-2 ${
                            formData.type === TypeCourrier.EXTERNE ? 'text-amber-700' : 'text-surface-600'
                          }`}>
                            Correspondance avec entités extérieures
                          </p>
                        </div>
                        {formData.type === TypeCourrier.EXTERNE && canCreateExterne && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-amber-600 rounded-full flex items-center justify-center">
                            <FontAwesomeIcon icon={faCheck} className="text-white text-xs" />
                          </div>
                        )}
                        {!canCreateExterne && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-surface-400 rounded-full flex items-center justify-center" title="Accès réservé">
                            <FontAwesomeIcon icon={faLock} className="text-white text-xs" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Étape 2: Informations du courrier */}
          {currentStep === 2 && (
            <div className="p-8">
              <div className="flex items-center gap-4 pb-6 border-b border-surface-200">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 flex items-center justify-center shadow-lg">
                  <FontAwesomeIcon icon={faFileAlt} className="text-white text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-surface-900">Informations du Courrier</h2>
                  <p className="text-sm text-surface-600">
                    {formData.type === TypeCourrier.INTERNE 
                      ? 'Renseignez les détails du courrier interne' 
                      : 'Renseignez les détails du courrier externe'
                    }
                  </p>
                </div>
              </div>

              {/* ===== CHAMPS DYNAMIQUES UNIQUEMENT ===== */}
              <div className="mt-8 space-y-6">
                <div>
                  <div className="flex flex-col space-y-6">
                    <div className="flex items-center gap-3 pb-4 border-b border-surface-200">
                  <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
                    <FontAwesomeIcon icon={faCog} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-surface-900">
                      {`Champs du Courrier — ${formData.sens === SensCourrier.ENTRANT ? 'Entrant' : 'Sortant'} ${formData.type === TypeCourrier.INTERNE ? 'Interne' : 'Externe'}`}
                    </h3>
                    <p className="text-sm text-surface-600">
                      {allFields.flatMap((s: any) => s.columns?.flatMap((c: any) => c.fields) || []).length} champ(s) à renseigner
                      {loadingConfig && (
                        <span className="ml-2 text-amber-600 font-medium">
                          (Chargement...)
                        </span>
                      )}
                      {!loadingConfig && allFields.length === 0 && (
                        <span className="ml-2 text-rose-600 font-medium">
                          — Aucun champ configuré pour cette combinaison. Veuillez paramétrer le formulaire.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-6">
                    {allFields.map((section: any) => (
                      <div key={section.id} className="space-y-4">
                        {/* Afficher le titre de section si existant et différent de 'Infos' */}
                        {section.label && section.label !== 'Infos' && (
                          <h4 className="text-lg font-bold text-surface-900 border-b border-surface-200 pb-2">
                            {section.label}
                          </h4>
                        )}
                        
                        <div className={`grid gap-4 ${(section.columns?.length ?? 0) > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                          {section.columns?.map((column: any) => (
                            <div key={column.id} className="space-y-4">
                              {column.fields?.map((field: any) => (
                                <div key={field.id} className="space-y-3">
                                  <label className="flex items-center gap-2 text-sm font-bold text-surface-700 uppercase tracking-wide">
                                    <FontAwesomeIcon icon={faTag} className="text-indigo-500" />
                                    {field.label}
                                    {field.required && (
                                      <span className="text-red-500 text-xs ml-1">*</span>
                                    )}
                                  </label>
                                  
                                  {/* Champ de type DATE ou DATETIME avec Material Design */}
                                  {(field.type === 'date' || field.type === 'datetime') && (
                                  <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow col-span-full">
                                    {/* Utiliser MaterialDateTimeField pour le style Material Design */}
                                    <MaterialDateTimeField
                                      value={formData[field.name] || null}
                                      onChange={(newValue) => handleExtraFieldChange(field.name, newValue)}
                                      label={field.label}
                                      required={field.required}
                                    />
                                    
                                    <div className="mt-3 text-xs text-surface-600 flex items-center gap-2 bg-surface-50 p-2 rounded-lg">
                                      <FontAwesomeIcon icon={faCalendar} className="text-indigo-500" />
                                      {field.placeholder || `Sélectionnez la date de ${(field.label || '').toLowerCase()}`}
                                    </div>
                                    {field.required && !formData[field.name] && (
                                      <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                        <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                        Champ obligatoire - Veuillez sélectionner une date
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* Champ de type URGENCY avec Slider Material Design */}
                                {((field.name || '').toLowerCase().includes('urgenc') || (field.label || '').toLowerCase().includes('urgenc')) && (
                                  <div className="bg-white rounded-2xl border-2 border-surface-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="mb-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium text-surface-700 flex items-center gap-2">
                                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500" />
                                          {field.label}
                                        </span>
                                        <span className="text-sm font-bold text-primary-600 bg-primary-50 px-3 py-1 rounded-full">
                                          {formData[field.name] || 3}/5
                                        </span>
                                      </div>
                                      <Slider
                                        value={formData[field.name] || 3}
                                        onChange={(e, value) => handleExtraFieldChange(field.name, value)}
                                        min={1}
                                        max={5}
                                        step={1}
                                        marks={[
                                          { value: 1, label: 'Très faible' },
                                          { value: 2, label: 'Faible' },
                                          { value: 3, label: 'Moyenne' },
                                          { value: 4, label: 'Élevée' },
                                          { value: 5, label: 'Urgente' }
                                        ]}
                                        valueLabelDisplay="auto"
                                        sx={{
                                          '& .MuiSlider-thumb': {
                                            backgroundColor: '#3b82f6',
                                            width: 20,
                                            height: 20,
                                            '&:hover': {
                                              boxShadow: '0 0 0 8px rgba(59, 130, 246, 0.1)',
                                            },
                                          },
                                          '& .MuiSlider-track': {
                                            backgroundColor: '#3b82f6',
                                            height: 6,
                                          },
                                          '& .MuiSlider-rail': {
                                            backgroundColor: '#e2e8f0',
                                            height: 6,
                                          },
                                          '& .MuiSlider-mark': {
                                            backgroundColor: '#94a3b8',
                                            width: 8,
                                            height: 8,
                                            '&.MuiSlider-markActive': {
                                              backgroundColor: '#3b82f6',
                                              width: 10,
                                              height: 10,
                                            },
                                          },
                                          '& .MuiSlider-markLabel': {
                                            fontSize: '0.75rem',
                                            color: '#64748b',
                                            '&.MuiSlider-markLabelActive': {
                                              color: '#3b82f6',
                                              fontWeight: 'bold',
                                            },
                                          },
                                        }}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-surface-600 bg-amber-50 p-3 rounded-lg">
                                      <FontAwesomeIcon icon={faInfoCircle} className="text-amber-500" />
                                      <span>Définissez le niveau d'urgence du courrier (1 = Très faible, 5 = Urgent)</span>
                                    </div>
                                    {field.required && (
                                      <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                        <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                        Champ obligatoire
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* Autres types de champs */}
                                {!(field.type === 'date' || field.type === 'datetime') && 
                                 !((field.name || '').toLowerCase().includes('urgenc') || (field.label || '').toLowerCase().includes('urgenc')) && (
                                  <div>
                                    {field.type === 'text' && (
                                        <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <FontAwesomeIcon icon={faTextWidth} className="text-surface-400" />
                                          </div>
                                          <input
                                            type="text"
                                            value={formData[field.name] || ''}
                                            onChange={(e) => handleExtraFieldChange(field.name, e.target.value)}
                                            placeholder={field.placeholder || `Saisissez ${(field.label || '').toLowerCase()}`}
                                            className={`w-full pl-12 pr-4 py-3 border-2 border-surface-200 rounded-xl focus:border-primary-500 focus:outline-none transition-all ${
                                              field.required && !formData[field.name] ? 'border-red-300 bg-red-50' : 'bg-white'
                                            }`}
                                            required={field.required}
                                          />
                                        </div>
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {field.type === 'textarea' && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow col-span-full">
                                        <ReactQuill
                                          value={formData[field.name] || ''}
                                          onChange={(content) => handleExtraFieldChange(field.name, content, true)}
                                          placeholder={field.placeholder || `Rédigez ${(field.label || '').toLowerCase()}`}
                                          theme="snow"
                                          className="bg-white rounded-xl"
                                          modules={{
                                            toolbar: [
                                              [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                                              ['bold', 'italic', 'underline', 'strike'],
                                              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                              ['link'],
                                              ['clean']
                                            ]
                                          }}
                                          formats={[
                                            'header',
                                            'bold', 'italic', 'underline', 'strike',
                                            'list', 'bullet',
                                            'link'
                                          ]}
                                        />
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {field.type === 'number' && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <FontAwesomeIcon icon={faHashtag} className="text-surface-400" />
                                          </div>
                                          <input
                                            type="number"
                                            value={formData[field.name] || ''}
                                            onChange={(e) => handleExtraFieldChange(field.name, parseInt(e.target.value) || 0)}
                                            placeholder={field.placeholder || `Saisissez ${(field.label || '').toLowerCase()}`}
                                            className="w-full pl-12 pr-4 py-3 border-2 border-surface-200 rounded-xl focus:border-primary-500 focus:outline-none bg-white"
                                            required={field.required}
                                          />
                                        </div>
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {field.type === 'select' && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <SearchableSelect
                                          value={formData[field.name] || ''}
                                          onChange={(value) => handleExtraFieldChange(field.name, value)}
                                          placeholder={field.placeholder || `Sélectionnez ${(field.label || '').toLowerCase()}`}
                                          options={(field.options || []).map((o: any) => typeof o === 'string' ? { value: o, label: o } : o)}
                                        />
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {field.type === 'checkbox' && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={formData[field.name] || false}
                                            onChange={(e) => handleExtraFieldChange(field.name, e.target.checked)}
                                            className="w-5 h-5 text-primary-600 border-2 border-surface-300 rounded focus:ring-primary-500 focus:border-primary-500"
                                          />
                                          <span className="text-sm text-surface-700">{field.label}</span>
                                        </label>
                                      </div>
                                    )}
                                    {field.type === 'radio' && (field.options?.length ?? 0) >= 1 && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        {field.options!.length === 2 ? (
                                          <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={formData[field.name] === field.options![1]}
                                              onChange={(e) => handleExtraFieldChange(field.name, e.target.checked ? field.options![1] : field.options![0])}
                                              className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-surface-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            <span className="ml-3 text-sm font-medium text-surface-700">
                                              {formData[field.name] || field.options![0]}
                                            </span>
                                          </label>
                                        ) : (
                                          <div className="flex flex-wrap gap-3">
                                            {field.options!.map((opt: string) => (
                                              <label
                                                key={opt}
                                                className={`flex items-center gap-2 text-sm cursor-pointer px-4 py-2 rounded-full border-2 transition-all ${
                                                  formData[field.name] === opt
                                                    ? 'bg-primary-100 border-primary-500 text-primary-700 font-medium'
                                                    : 'bg-surface-50 border-surface-200 text-surface-600 hover:border-primary-300'
                                                }`}
                                              >
                                                <input
                                                  type="radio"
                                                  name={`radio-${field.id}`}
                                                  value={opt}
                                                  checked={formData[field.name] === opt}
                                                  onChange={() => handleExtraFieldChange(field.name, opt)}
                                                  className="sr-only"
                                                />
                                                {formData[field.name] === opt && (
                                                  <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-primary-600" />
                                                )}
                                                <span>{opt}</span>
                                              </label>
                                            ))}
                                          </div>
                                        )}
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {field.type === 'file' && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="border-2 border-dashed border-surface-300 rounded-xl p-6 text-center hover:border-primary-400 transition-colors">
                                          <FontAwesomeIcon icon={faFileUpload} className="text-4xl text-surface-400 mb-3" />
                                          <p className="text-sm text-surface-600 mb-2">
                                            {field.placeholder || `Glissez-déposez ${(field.label || '').toLowerCase()} ou cliquez pour parcourir`}
                                          </p>
                                          <input
                                            type="file"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                handleExtraFieldChange(field.name, file);
                                              }
                                            }}
                                            className="hidden"
                                            id={`file-${field.id}`}
                                          />
                                          <label
                                            htmlFor={`file-${field.id}`}
                                            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 cursor-pointer transition-colors"
                                          >
                                            <FontAwesomeIcon icon={faFolderOpen} className="mr-2" />
                                            Parcourir
                                          </label>
                                        </div>
                                        {formData[field.name] && (
                                          <div className="mt-3 text-xs text-surface-600 bg-surface-50 p-2 rounded-lg">
                                            Fichier sélectionné: {(formData[field.name] as File)?.name}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {field.type === 'url' && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow col-span-full">
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <FontAwesomeIcon icon={faLink} className="text-surface-400" />
                                          </div>
                                          <input
                                            type="url"
                                            value={formData[field.name] || ''}
                                            onChange={(e) => handleExtraFieldChange(field.name, e.target.value)}
                                            placeholder={field.placeholder || `Saisissez l'URL ${(field.label || '').toLowerCase()}`}
                                            className="w-full pl-12 pr-4 py-3 border-2 border-surface-200 rounded-xl focus:border-primary-500 focus:outline-none bg-white"
                                            required={field.required}
                                          />
                                        </div>
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {field.type === 'email' && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <FontAwesomeIcon icon={faAt} className="text-surface-400" />
                                          </div>
                                          <input
                                            type="email"
                                            value={formData[field.name] || ''}
                                            onChange={(e) => handleExtraFieldChange(field.name, e.target.value)}
                                            placeholder={field.placeholder || `Saisissez l'email`}
                                            className={`w-full pl-12 pr-4 py-3 border-2 border-surface-200 rounded-xl focus:border-primary-500 focus:outline-none transition-all ${field.required && !formData[field.name] ? 'border-red-300 bg-red-50' : 'bg-white'}`}
                                            required={field.required}
                                          />
                                        </div>
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {field.type === 'phone' && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <FontAwesomeIcon icon={faPhone} className="text-surface-400" />
                                          </div>
                                          <input
                                            type="tel"
                                            value={formData[field.name] || ''}
                                            onChange={(e) => handleExtraFieldChange(field.name, e.target.value)}
                                            placeholder={field.placeholder || `Saisissez le numéro de téléphone`}
                                            className={`w-full pl-12 pr-4 py-3 border-2 border-surface-200 rounded-xl focus:border-primary-500 focus:outline-none transition-all ${field.required && !formData[field.name] ? 'border-red-300 bg-red-50' : 'bg-white'}`}
                                            required={field.required}
                                          />
                                        </div>
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {(field.type === 'slider' || field.type === 'urgency') && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <Slider
                                          value={Number(formData[field.name]) || field.min || 0}
                                          onChange={(_e, value) => handleExtraFieldChange(field.name, value)}
                                          min={field.min ?? 0}
                                          max={field.max ?? 100}
                                          step={field.step ?? 1}
                                          valueLabelDisplay="auto"
                                          sx={{ '& .MuiSlider-track': { backgroundColor: '#3b82f6' }, '& .MuiSlider-thumb': { backgroundColor: '#3b82f6' } }}
                                        />
                                        <div className="flex justify-between text-xs text-surface-500 mt-1">
                                          <span>{field.min ?? 0}</span>
                                          <span>{field.max ?? 100}</span>
                                        </div>
                                      </div>
                                    )}
                                    {/* Fallback : type non reconnu ou radio sans options → champ texte simple */}
                                    {(
                                      !['text','textarea','number','select','checkbox','radio','file','url','email','phone','slider','urgency','date','datetime'].includes(field.type)
                                      || (field.type === 'radio' && (field.options?.length ?? 0) === 0)
                                    ) && (
                                      <div className="bg-white rounded-2xl border-2 border-surface-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <input
                                          type="text"
                                          value={formData[field.name] || ''}
                                          onChange={(e) => handleExtraFieldChange(field.name, e.target.value)}
                                          placeholder={field.placeholder || `Saisissez ${(field.label || '').toLowerCase()}`}
                                          className={`w-full px-4 py-3 border-2 border-surface-200 rounded-xl focus:border-primary-500 focus:outline-none transition-all ${field.required && !formData[field.name] ? 'border-red-300 bg-red-50' : 'bg-white'}`}
                                          required={field.required}
                                        />
                                        {field.required && !formData[field.name] && (
                                          <p className="text-xs text-red-500 flex items-center gap-1 mt-2 bg-red-50 p-2 rounded-lg">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="w-3 h-3" />
                                            Champ obligatoire
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ===== ENTITÉS ORGANISATIONNELLES (COURRIER INTERNE) ===== */}
              {formData.type === TypeCourrier.INTERNE && filterLevels.length > 0 && (
                <div className="mt-8 pt-6 border-t-2 border-surface-200">
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-r ${
                      formData.sens === SensCourrier.ENTRANT
                        ? 'from-blue-500 to-indigo-600'
                        : 'from-emerald-500 to-teal-600'
                    }`}>
                      <FontAwesomeIcon icon={faBuilding} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-surface-900">Organisation Interne</h3>
                      <p className="text-sm text-surface-600">
                        {formData.sens === SensCourrier.ENTRANT
                          ? 'Sélectionnez le service / département expéditeur'
                          : 'Sélectionnez le service / département destinataire'}
                      </p>
                    </div>
                  </div>

                  {/* ENTRANT → Entité Émettrice */}
                  {formData.sens === SensCourrier.ENTRANT && (
                    <div className="bg-blue-50 rounded-2xl border-2 border-blue-200 p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                          <FontAwesomeIcon icon={faBuilding} className="text-white text-xs" />
                        </div>
                        <div>
                          <h4 className="font-bold text-blue-900 text-sm">Entité Émettrice</h4>
                          <p className="text-xs text-blue-600">Service / département expéditeur</p>
                        </div>
                        {areEntitiesLocked && (
                          <span className="ml-auto text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-lg flex items-center gap-1">
                            <FontAwesomeIcon icon={faLock} className="w-3 h-3" />
                            Verrouillé
                          </span>
                        )}
                      </div>
                      <div className="space-y-3">
                        {filterLevels.map((level, idx) => {
                          const parentId = getParentIdForLevel(idx, entiteEmetteur);
                          const options = getEntitiesForLevel(level.code, parentId);
                          const isVisible = idx === 0 || !!getParentIdForLevel(idx, entiteEmetteur);
                          if (!isVisible) return null;
                          return (
                            <div key={level.code} className="space-y-1">
                              <label className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                                {level.libelleSingulier}
                              </label>
                              <select
                                value={entiteEmetteur[level.code] || ''}
                                onChange={(e) => handleEntiteEmetteurChange(level.code, e.target.value, idx)}
                                disabled={areEntitiesLocked}
                                className="w-full px-3 py-2.5 border-2 border-blue-200 rounded-xl focus:border-blue-500 focus:outline-none bg-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                <option value="">— Sélectionner —</option>
                                {options.map(e => (
                                  <option key={e.id} value={e.id}>{e.nom}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                      {formData.expediteur && (
                        <p className="mt-3 text-xs text-blue-800 bg-white/70 px-3 py-2 rounded-lg flex items-center gap-2 font-medium">
                          <FontAwesomeIcon icon={faCheck} className="text-blue-500" />
                          {formData.expediteur}
                        </p>
                      )}
                    </div>
                  )}

                  {/* SORTANT → Entité Destinataire */}
                  {formData.sens === SensCourrier.SORTANT && (
                    <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-200 p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                          <FontAwesomeIcon icon={faBuilding} className="text-white text-xs" />
                        </div>
                        <div>
                          <h4 className="font-bold text-emerald-900 text-sm">Entité Destinataire</h4>
                          <p className="text-xs text-emerald-600">Service / département destinataire</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {filterLevels.map((level, idx) => {
                          const parentId = getParentIdForLevel(idx, entiteDestinataire);
                          const options = getEntitiesForLevel(level.code, parentId);
                          const isVisible = idx === 0 || !!getParentIdForLevel(idx, entiteDestinataire);
                          if (!isVisible) return null;
                          return (
                            <div key={level.code} className="space-y-1">
                              <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                                {level.libelleSingulier}
                              </label>
                              <select
                                value={entiteDestinataire[level.code] || ''}
                                onChange={(e) => handleEntiteDestinataireChange(level.code, e.target.value, idx)}
                                className="w-full px-3 py-2.5 border-2 border-emerald-200 rounded-xl focus:border-emerald-500 focus:outline-none bg-white text-sm"
                              >
                                <option value="">— Sélectionner —</option>
                                {options.map(e => (
                                  <option key={e.id} value={e.id}>{e.nom}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                      {formData.destinataire && (
                        <p className="mt-3 text-xs text-emerald-800 bg-white/70 px-3 py-2 rounded-lg flex items-center gap-2 font-medium">
                          <FontAwesomeIcon icon={faCheck} className="text-emerald-500" />
                          {formData.destinataire}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

        {/* Étape 3: Fichiers et documents */}
          {currentStep === 3 && (
            <div className="p-8">
              <div className="flex items-center gap-4 pb-6 border-b border-slate-200">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg">
                  <FontAwesomeIcon icon={faCloudUploadAlt} className="text-white text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Documents et Pièces Jointes</h2>
                  <p className="text-sm text-slate-600">Ajoutez les fichiers associés au courrier</p>
                </div>
              </div>

              {/* === CATÉGORIE === */}
              <div className="mt-6 mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
                    <FontAwesomeIcon icon={faFolder} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Catégorie</h3>
                    <p className="text-xs text-slate-500">Rattachez ce courrier à une catégorie de la liste des courriers</p>
                  </div>
                </div>
                <select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-400 focus:outline-none bg-white text-slate-800 font-medium"
                >
                  <option value="">— Aucune catégorie (non classé) —</option>
                  {courrierFolders.map(folder => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
                {selectedFolderId && (
                  <p className="text-xs text-amber-700 mt-2 flex items-center gap-2">
                    <FontAwesomeIcon icon={faFolderOpen} className="text-amber-500" />
                    Classé dans : <span className="font-bold">{courrierFolders.find(f => f.id === selectedFolderId)?.name}</span>
                  </p>
                )}
              </div>

              {/* === DOSSIERS DE FICHIERS (organisation interne) === */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
                      <FontAwesomeIcon icon={faFolderPlus} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Organisation des fichiers</h3>
                      <p className="text-xs text-slate-500">Créez des sous-dossiers pour organiser les pièces jointes</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nom = prompt('Nom du sous-dossier :');
                      if (!nom?.trim()) return;
                      const id = `folder-${Date.now()}`;
                      setDossiersTemp(prev => new Map(prev).set(id, { name: nom.trim(), items: new Map() }));
                    }}
                    className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    Nouveau dossier
                  </button>
                </div>
                {dossiersTemp.size > 0 && (
                  <div className="space-y-2">
                    {Array.from(dossiersTemp.entries()).map(([id, dossier]) => (
                      <div key={id} className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                        <div className="flex items-center gap-3">
                          <FontAwesomeIcon icon={faFolder} className="text-indigo-500" />
                          <span className="font-medium text-slate-800">{dossier.name}</span>
                          <span className="text-xs text-slate-500">{dossier.items.size} fichier(s)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDossiersTemp(prev => { const m = new Map(prev); m.delete(id); return m; })}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Supprimer ce dossier"
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zone de drag & drop */}
              <div 
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-3 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer group ${
                  isDragging 
                    ? 'border-emerald-500 bg-emerald-100 scale-[1.02]' 
                    : 'border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 hover:border-emerald-500 hover:bg-emerald-50'
                }`}
              >
                <input
                  type="file"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                  id="file-upload-input"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                />
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                  <FontAwesomeIcon icon={faCloudUploadAlt} className="text-white text-3xl" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">
                  {isDragging ? 'Déposez vos fichiers ici' : 'Glissez-déposez vos fichiers'}
                </h3>
                <p className="text-slate-600 mb-6">ou cliquez pour parcourir votre ordinateur</p>
                <label
                  htmlFor="file-upload-input"
                  className="inline-flex px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 font-bold transition-all shadow-lg items-center gap-3 cursor-pointer"
                >
                  <FontAwesomeIcon icon={faFolderPlus} />
                  Parcourir les fichiers
                </label>
                <p className="text-xs text-slate-500 mt-4">Formats acceptés: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG (Max 10MB)</p>
              </div>

              {/* Fichiers existants (mode édition) */}
              {isEditMode && existingFiles.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <FontAwesomeIcon icon={faFolderOpen} className="text-blue-600" />
                    Fichiers existants ({existingFiles.length})
                  </h3>
                  <div className="space-y-3">
                    {existingFiles.map((fichier) => (
                      <div key={fichier.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl group hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                            <FontAwesomeIcon icon={faFile} className="text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{fichier.nom}</p>
                            <p className="text-sm text-slate-600">
                              {fichier.taille ? `${(fichier.taille / 1024 / 1024).toFixed(2)} MB` : 'Taille inconnue'} • {fichier.extension || 'Type inconnu'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const url = await categorieFichierService.getFileDisplayUrl(fichier);
                                if (url) {
                                  window.open(url, '_blank');
                                } else {
                                  showAlert('Impossible de visualiser ce fichier', 'error');
                                }
                              } catch (error) {
                                console.error('Erreur visualisation fichier:', error);
                                showAlert('Erreur lors de la visualisation du fichier', 'error');
                              }
                            }}
                            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                            title="Visualiser le fichier"
                          >
                            <FontAwesomeIcon icon={faEye} />
                            Visualiser
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Êtes-vous sûr de vouloir supprimer le fichier "${fichier.nom}" ?`)) {
                                setExistingFiles(prev => prev.filter(f => f.id !== fichier.id));
                                showAlert(`Fichier "${fichier.nom}" retiré de la liste`, 'success');
                              }
                            }}
                            className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                            title="Retirer le fichier"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                            Retirer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fichiers sélectionnés */}
              {selectedFiles.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <FontAwesomeIcon icon={faFolderOpen} className="text-emerald-600" />
                    Nouveaux fichiers ({selectedFiles.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl group hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl flex items-center justify-center">
                            <FontAwesomeIcon icon={faFile} className="text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{file.name}</p>
                            <p className="text-sm text-slate-600">
                              {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || 'Type inconnu'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                          onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          Supprimer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Scanner */}
              <div className="mt-8">
                <button
                  type="button"
                  onClick={openScanModal}
                  className="w-full p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all flex items-center gap-3"
                >
                  <FontAwesomeIcon icon={faCamera} className="text-blue-600" />
                  <div className="text-left">
                    <p className="font-semibold text-blue-900">Scanner un document</p>
                    <p className="text-xs text-blue-700">Numériser un document avec votre scanner</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Étape 4: Confirmation */}
          {currentStep === 4 && (
            <div className="p-8">
              <div className="flex items-center gap-4 pb-6 border-b border-slate-200">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 flex items-center justify-center shadow-lg">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-white text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Confirmation et Validation</h2>
                  <p className="text-sm text-slate-600">Vérifiez toutes les informations avant enregistrement</p>
                </div>
              </div>

              {/* Alertes de confirmation */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-6 flex items-start gap-4 mb-8">
                <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FontAwesomeIcon icon={faInfoCircle} className="text-white text-xl" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-green-900 mb-2">Prêt pour l'enregistrement</h3>
                  <p className="text-green-700">Toutes les informations ont été vérifiées. Le courrier sera enregistré avec ces données.</p>
                </div>
              </div>

              {/* Résumé détaillé */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                    <FontAwesomeIcon icon={faClipboardList} className="text-white" />
                  </div>
                  Résumé Complet du Courrier
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <FontAwesomeIcon icon={faExchangeAlt} className="text-blue-600 text-xl" />
                      <h4 className="font-bold text-slate-900">Type et Sens</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Sens:</span>
                        <span className="font-bold text-slate-900">{formData.sens === 'ENTRANT' ? '📥 Entrant' : '📤 Sortant'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Type:</span>
                        <span className="font-bold text-slate-900">{formData.type === 'INTERNE' ? '🏢 Interne' : '🌍 Externe'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <FontAwesomeIcon icon={faCalendar} className="text-purple-600 text-xl" />
                      <h4 className="font-bold text-slate-900">Date et Objet</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Date:</span>
                        <span className="font-bold text-slate-900">{formData.dateReception}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Objet:</span>
                        <span className="font-bold text-slate-900 truncate">
                          {formData.objet ? formData.objet.replace(/<[^>]*>/g, '') : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {(() => {
                    const allCfgFields = allFields.flatMap((s: any) => s.columns?.flatMap((c: any) => c.fields || []) || []);
                    const urgField = allCfgFields.find((f: any) => (f.name || '').toLowerCase().includes('urgenc') || (f.label || '').toLowerCase().includes('urgenc'));
                    const normLbl = (s: string | null | undefined) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s']/g, '');
                    const expField = allCfgFields.find((f: any) =>
                      f.name === 'expediteur' || (f.name || '').toLowerCase().includes('expediteur') ||
                      (f.name || '').toLowerCase().includes('emetteur') || (f.name || '').toLowerCase().includes('sender') ||
                      normLbl(f.label).includes('expediteur'));
                    const destField = allCfgFields.find((f: any) =>
                      f.name === 'destinataire' || (f.name || '').toLowerCase().includes('destinataire') ||
                      (f.name || '').toLowerCase().includes('recipient') || normLbl(f.label).includes('destinataire'));
                    const urgVal = Number(formData[urgField?.name ?? 'urgence'] ?? formData.urgence ?? 3);
                    const expVal = String(formData[expField?.name ?? 'expediteur'] ?? formData.expediteur ?? '').trim()
                      || (formData.type === TypeCourrier.INTERNE ? getDeepestEntityName(entiteEmetteur) : '') || '—';
                    const destVal = String(formData[destField?.name ?? 'destinataire'] ?? formData.destinataire ?? '').trim()
                      || (formData.type === TypeCourrier.INTERNE ? getDeepestEntityName(entiteDestinataire) : '') || '—';
                    return (
                      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                          <FontAwesomeIcon icon={faUsers} className="text-emerald-600 text-xl" />
                          <h4 className="font-bold text-slate-900">Participants</h4>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Expéditeur:</span>
                            <span className="font-bold text-slate-900 truncate">{expVal}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Destinataire:</span>
                            <span className="font-bold text-slate-900 truncate">{destVal}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Urgence:</span>
                            <span className={`font-bold truncate ${
                              urgVal >= 5 ? 'text-red-600' : urgVal === 4 ? 'text-orange-500' : urgVal <= 2 ? 'text-slate-500' : 'text-slate-900'
                            }`}>
                              {urgVal <= 2 ? 'Basse' : urgVal === 4 ? 'Haute' : urgVal >= 5 ? 'Urgente' : 'Normale'}{' '}({urgVal}/5)
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  
                  <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <FontAwesomeIcon icon={faFolderOpen} className="text-amber-600 text-xl" />
                      <h4 className="font-bold text-slate-900">Documents</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Fichiers:</span>
                        <span className="font-bold text-slate-900">
                          {isEditMode 
                            ? `${existingFiles.length + selectedFiles.length} fichier(s) (${existingFiles.length} existant(s), ${selectedFiles.length} nouveau(x))`
                            : `${selectedFiles.length} fichier(s)`
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Dossier de classement:</span>
                        <span className="font-bold text-amber-700 truncate">
                          {selectedFolderId
                            ? (courrierFolders.find(f => f.id === selectedFolderId)?.name ?? '—')
                            : <span className="text-slate-400 font-normal italic">Non classé</span>
                          }
                        </span>
                      </div>
                      {dossiersTemp.size > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Sous-dossiers fichiers:</span>
                          <span className="font-bold text-indigo-700">{dossiersTemp.size} dossier(s)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Boutons de navigation professionnels */}
          <div className="bg-slate-50 border-t border-slate-200 p-6">
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={currentStep === 1 ? () => navigate('/courriers') : prevStep}
                className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-all flex items-center gap-3 font-bold"
              >
                <FontAwesomeIcon icon={faChevronLeft} />
                {currentStep === 1 ? 'Annuler' : 'Précédent'}
              </button>
              
              {currentStep < steps.length ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canGoToNextStep()}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 font-bold shadow-lg transition-all"
                >
                  Suivant
                  <FontAwesomeIcon icon={faChevronRight} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={loading || !canGoToNextStep()}
                  className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 font-bold shadow-lg transition-all"
                >
                  {loading ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      Enregistrement en cours...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faCheckCircle} />
                      {isEditMode ? 'Mettre à jour le Courrier' : 'Enregistrer le Courrier'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Dialog personnalisé */}
        <CustomDialog
          isOpen={dialog.isOpen}
          message={dialog.message}
          type={dialog.type}
          title={dialog.title}
          confirmText={dialog.confirmText}
          cancelText={dialog.cancelText}
          onConfirm={dialog.onConfirm}
          onCancel={dialog.onCancel}
          onClose={closeDialog}
        />

        {/* Modal de scan - Interface moderne */}
        {showScanModal && createPortal(
          <div
            className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={closeScanModal}
          >
            <div
              className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* En-tête moderne */}
              <div className="flex items-center justify-between gap-4 bg-white px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
                    <FontAwesomeIcon icon={faPrint} className="text-white text-lg" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Scan et traitement de documents</h2>
                    <p className="text-xs text-slate-500">Numérisation et prévisualisation</p>
                  </div>
                </div>
                <button
                  onClick={closeScanModal}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-slate-600" />
                </button>
              </div>

              {/* Contenu principal */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Section gauche - Prévisualisation */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faEye} className="text-blue-600 text-sm" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Prévisualisation du document</h3>
                        <p className="text-xs text-slate-500">Aperçu du fichier scanné</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 min-h-[380px] flex flex-col overflow-hidden">
                      {scanModalPreviewUrl && scanModalPreviewFile ? (() => {
                        const f = scanModalPreviewFile;
                        const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
                        const isImg = /^image\/(jpeg|jpg|png|gif|bmp|webp)$/i.test(f.type) || /\.(jpe?g|png|gif|bmp|webp)$/i.test(f.name);
                        if (isPdf) return (
                          <div className="flex flex-col w-full h-full min-h-[380px]">
                            <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-200 flex-shrink-0">
                              <span className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                                <FontAwesomeIcon icon={faFilePdf} className="text-red-500" /> {f.name}
                              </span>
                              <a href={scanModalPreviewUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                <FontAwesomeIcon icon={faExternalLinkAlt} /> Ouvrir
                              </a>
                            </div>
                            <iframe
                              src={scanModalPreviewUrl}
                              title="Aperçu PDF"
                              className="flex-1 w-full rounded-b-xl"
                              style={{ minHeight: 340, border: 'none' }}
                            />
                          </div>
                        );
                        if (isImg) return (
                          <img
                            src={scanModalPreviewUrl}
                            alt="Document scanné"
                            className="w-full max-h-[380px] rounded-xl object-contain p-2"
                          />
                        );
                        return (
                          <div className="flex flex-col items-center justify-center p-8 text-center w-full">
                            <FontAwesomeIcon icon={faFile} className="text-slate-300 text-5xl mb-3" />
                            <p className="text-sm text-slate-600 font-medium">{f.name}</p>
                            <p className="text-xs text-slate-400 mt-1">{f.type || 'Type inconnu'}</p>
                            <a href={scanModalPreviewUrl} target="_blank" rel="noopener noreferrer"
                              className="mt-3 text-xs text-blue-600 hover:underline">
                              Ouvrir dans un nouvel onglet
                            </a>
                          </div>
                        );
                      })() : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                          <FontAwesomeIcon icon={faPrint} className="text-slate-300 text-6xl mb-3" />
                          <p className="text-sm text-slate-500 font-medium">Aucun document à prévisualiser</p>
                          <p className="text-xs text-slate-400 mt-1">Lancez un scan pour afficher l'aperçu ici</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section droite - Contrôles */}
                  <div className="space-y-4">
                    {/* Périphérique de scan */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faPrint} className="text-blue-600 text-sm" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">Périphérique de scan</h3>
                          <p className="text-xs text-slate-500">Sélectionnez votre scanner</p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Scanner disponible</label>
                          <select
                            value={selectedScanner}
                            onChange={(e) => setSelectedScanner(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                          >
                            <option value="">Choisir un scanner...</option>
                            {scanners.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={refreshScannersInModal}
                            disabled={scannersLoading}
                            className="mt-2 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <FontAwesomeIcon icon={faSync} className={scannersLoading ? 'animate-spin' : ''} />
                            Rafraîchir
                          </button>
                        </div>

                        {scanners.length === 0 && !scannersLoading && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 text-sm mt-0.5" />
                              <div>
                                <p className="text-xs font-semibold text-amber-900">Aucun scanner détecté</p>
                                <p className="text-xs text-amber-700 mt-1">
                                  Vérifiez le serveur de scan (port 3001) et configurez les scanners dans <span className="font-semibold">Paramètres → Gestion des scanners</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {scanBackendStatus === 'error' && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <FontAwesomeIcon icon={faTimes} className="text-red-600 text-sm mt-0.5" />
                              <div>
                                <p className="text-xs font-semibold text-red-900">Serveur de scan : Hors ligne</p>
                                <p className="text-xs text-red-700 mt-1">
                                  Le serveur ne répond pas. Démarrez-le puis rafraîchissez la liste.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {scanModalError && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs text-amber-800">{scanModalError}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Paramètres de numérisation */}
                    <div className="bg-white rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faCog} className="text-purple-600 text-sm" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">Paramètres de numérisation</h3>
                          <p className="text-xs text-slate-500">Configuration actuelle</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-xs font-semibold text-slate-600">Format:</span>
                          </div>
                          <p className="text-sm font-bold text-slate-900">{scanSettings.format || 'PDF'}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs font-semibold text-slate-600">Source:</span>
                          </div>
                          <p className="text-sm font-bold text-slate-900">{scanSettings.scanSource === 'vitre' ? 'vitre' : 'bac'}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                            <span className="text-xs font-semibold text-slate-600">Page:</span>
                          </div>
                          <p className="text-sm font-bold text-slate-900">{scanSettings.pageSize || 'A4'}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            <span className="text-xs font-semibold text-slate-600">Résolution:</span>
                          </div>
                          <p className="text-sm font-bold text-slate-900">{scanSettings.resolution || 300} dpi</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pied de page */}
              <div className="bg-white border-t border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleScanInModal}
                    disabled={scanning || !selectedScanner || scanBackendStatus === 'error'}
                    className="px-6 py-2.5 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition-all"
                  >
                    {scanning ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                        Scan en cours...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faPrint} />
                        Scanner un document
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    {scanModalPreviewFile && !scanning && (
                      <button
                        onClick={handleConfirmScan}
                        className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 text-sm transition-all"
                      >
                        Ajouter ce document
                      </button>
                    )}
                    
                    {scanning && (
                      <button
                        onClick={handleCancelScan}
                        className="px-4 py-2.5 border border-red-300 text-red-600 rounded-xl hover:bg-red-50 text-sm font-medium"
                      >
                        Annuler
                      </button>
                    )}

                    <button
                      onClick={closeScanModal}
                      className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-all"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3 text-center">
                  Scannez un document pour débloquer les actions
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};

export default EnregistrerCourrier;