import React, { useMemo, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { archivageService } from '../services/archivageService';
import { courrierService } from '../services/courrierService';
import { archive3DConfigService } from '../services/archive3DConfigService';
import { laravelApiService } from '../services/laravelApiService';
import { Archive, Courrier, StatutCourrier, BoiteArchive, LocalArchivage, Armoire, Etagere, SensCourrier, TypeCourrier, Role } from '../types';
import Archive3DView from '../components/Archive3DView';
import PanoramaViewer from '../components/PanoramaViewer';
import ScanDocumentModal from '../components/ScanDocumentModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArchive,
  faBox,
  faSearch,
  faFilter,
  faEye,
  faSignOutAlt,
  faUndo,
  faMapMarkerAlt,
  faCalendar,
  faUser,
  faFileAlt,
  faHistory,
  faTimes,
  faChevronRight,
  faChevronLeft,
  faPlus,
  faWarehouse,
  faClipboardList,
  faCheck,
  faInfoCircle,
  faChevronDown,
  faFolder,
  faFolderOpen,
  faCube,
  faList,
  faRedo,
  faLayerGroup,
  faCamera,
  faUpload,
  faStreetView,
  faCog
} from '@fortawesome/free-solid-svg-icons';

// Portail pour que le modal d'archivage couvre tout l'écran (au niveau de <body>)
const ArchivePortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

const Archives: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [archives, setArchives] = useState<Archive[]>([]);
  const [courriersTraites, setCourriersTraites] = useState<Courrier[]>([]);
  const [allCourriers, setAllCourriers] = useState<Courrier[]>([]);
  const [stats, setStats] = useState(() => archivageService.getStatistiques());
  const [locaux, setLocaux] = useState<LocalArchivage[]>([]);
  const [armoires, setArmoires] = useState<Armoire[]>([]);
  const [etageres, setEtageres] = useState<Etagere[]>([]);
  const [boites, setBoites] = useState<BoiteArchive[]>([]);
  const [config3D] = useState(() => archive3DConfigService.getConfig());
  const [activeTab, setActiveTab] = useState<'archives' | 'a-archiver' | 'statistiques'>('archives');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [filterDirection, setFilterDirection] = useState<string>('');
  const [selectedArchive, setSelectedArchive] = useState<Archive | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCourrier, setSelectedCourrier] = useState<Courrier | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [archiveForm, setArchiveForm] = useState({
    boiteId: '',
    motif: '',
    observations: '',
    dureeConservation: 10
  });
  const [expandedLocaux, setExpandedLocaux] = useState<Set<string>>(new Set());
  const [expandedArmoires, setExpandedArmoires] = useState<Set<string>>(new Set());
  const [expandedEtageres, setExpandedEtageres] = useState<Set<string>>(new Set());
  const [view3DMode, setView3DMode] = useState<'list' | '3d' | 'panorama'>('list');
  const [showPanorama, setShowPanorama] = useState(false);
  const [selectedLocal3D, setSelectedLocal3D] = useState<string | null>(null);
  const [selectedArmoire3D, setSelectedArmoire3D] = useState<string | null>(null);
  const [selectedEtagere3D, setSelectedEtagere3D] = useState<string | null>(null);
  const [selectedBoite3D, setSelectedBoite3D] = useState<string | null>(null);
  const [selectedCourrier3D, setSelectedCourrier3D] = useState<string | null>(null);
  const [cameraAngle, setCameraAngle] = useState({ x: -20, y: 45 });
  const [isDragging3D, setIsDragging3D] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [sortOrder, setSortOrder] = useState<'date' | 'numero' | 'objet'>('date');
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const threeViewRef = React.useRef<HTMLDivElement | null>(null);
  const [pendingDeepLink, setPendingDeepLink] = useState<{ boiteId?: string; courrierId?: string } | null>(null);

  const handle3DMouseDown = (e: React.MouseEvent) => {
    setIsDragging3D(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handle3DMouseMove = (e: React.MouseEvent) => {
    if (!isDragging3D) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    setCameraAngle({
      x: Math.max(-60, Math.min(20, cameraAngle.x - deltaY * 0.5)),
      y: cameraAngle.y + deltaX * 0.5
    });
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handle3DMouseUp = () => {
    setIsDragging3D(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sur changement d'URL (params), stocker les ids et forcer l'onglet + mode 3D
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const boiteId = params.get('boiteId') || undefined;
    const courrierId = params.get('courrierId') || undefined;
    if (boiteId || courrierId) {
      setPendingDeepLink({ boiteId, courrierId });
      setDeepLinkHandled(false);
      setActiveTab('archives');
      setView3DMode('3d');
      setShowPanorama(false);
    }
  }, [location.search]);

  // Recharger les données quand on sélectionne un local (au cas où il y aurait eu des modifications)
  useEffect(() => {
    if (selectedLocal3D) {
      const updatedLocaux = archivageService.getAllLocaux();
      setLocaux(updatedLocaux);
    }
  }, [selectedLocal3D]);

  const loadData = async () => {
    const allArchives = await archivageService.getAllArchives();
    setArchives(allArchives);
    setLocaux(archivageService.getAllLocaux());
    setArmoires(archivageService.getAllArmoires());
    setEtageres(archivageService.getAllEtageres());
    setBoites(archivageService.getAllBoites());
    setStats(archivageService.getStatistiques());

    // Liste des courriers à archiver : statut TRAITE et pas encore archivés
    const loadedCourriers = await courrierService.getAllCourriers();
    setAllCourriers(loadedCourriers);
    const archivesCourrierIds = new Set(allArchives.map(a => a.courrierId).filter(Boolean) as string[]);
    setCourriersTraites(loadedCourriers.filter(c =>
      c.statut === StatutCourrier.TRAITE && !archivesCourrierIds.has(c.id)
    ));
  };

  // Deep link: préselection via query params ?courrierId&boiteId
  useEffect(() => {
    if (deepLinkHandled) return;
    if (!pendingDeepLink) return;
    if (locaux.length === 0 || armoires.length === 0 || etageres.length === 0 || boites.length === 0) return;

    const { boiteId, courrierId } = pendingDeepLink;

    if (boiteId) {
      const boite = boites.find(b => b.id === boiteId);
      if (boite) {
        const etagere = etageres.find(e => e.id === boite.etagereId);
        const armoire = etagere ? armoires.find(a => a.id === etagere.armoireId) : null;
        const local = armoire ? locaux.find(l => l.id === armoire.localId) : null;
        if (local) {
          setSelectedLocal3D(local.id);
          setExpandedLocaux(new Set([local.id]));
        }
        if (armoire) {
          setSelectedArmoire3D(armoire.id);
          setExpandedArmoires(new Set([armoire.id]));
        }
        if (etagere) {
          setSelectedEtagere3D(etagere.id);
          setExpandedEtageres(new Set([etagere.id]));
        }
        setSelectedBoite3D(boite.id);
      }
    }

    if (courrierId) {
      setSelectedCourrier3D(courrierId);
    }

    // Si un local a une pano, proposer le mode panorama, sinon vue 3D
    const localForPano = boites.find(b => b.id === boiteId);
    const etagereForPano = localForPano ? etageres.find(e => e.id === localForPano.etagereId) : null;
    const armoireForPano = etagereForPano ? armoires.find(a => a.id === etagereForPano.armoireId) : null;
    const local = armoireForPano ? locaux.find(l => l.id === armoireForPano.localId) : null;
    if (local?.photoPanoramique) {
      setView3DMode('panorama');
      setShowPanorama(true);
    } else {
      setView3DMode('3d');
      setShowPanorama(false);
    }

    // Aller sur l'onglet archives et scroller vers la vue
    setActiveTab('archives');
    setDeepLinkHandled(true);
    setTimeout(() => {
      if (threeViewRef.current) {
        threeViewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, [deepLinkHandled, pendingDeepLink, locaux, armoires, etageres, boites]);

  // En mode "visite virtuelle", s'assurer qu'un local panoramique est sélectionné sans déclencher de setState pendant le rendu.
  useEffect(() => {
    if (!showPanorama) return;
    if (selectedLocal3D) return;
    const localWithPanorama = locaux.find(l => l.actif && !!l.photoPanoramique);
    if (localWithPanorama) setSelectedLocal3D(localWithPanorama.id);
  }, [showPanorama, selectedLocal3D, locaux]);

  const courriersById = useMemo(() => {
    const map = new Map<string, Courrier>();
    for (const c of allCourriers) map.set(c.id, c);
    return map;
  }, [allCourriers]);

  // Vérifie si l'utilisateur connecté est le secrétaire de la Direction Générale
  const isSecretaireDG = useMemo(() => {
    if (!user || user.role !== Role.SECRETAIRE) return false;
    const dir = (user.direction || '').toLowerCase();
    return !dir || dir.includes('général') || dir.includes('general') || dir.includes('dg');
  }, [user]);

  const canVoirToutesLesArchives = useMemo(() => {
    return user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL || isSecretaireDG;
  }, [user, isSecretaireDG]);

  // Direction/entité de l'utilisateur connecté
  const userDirection = user?.direction || '';

  // Filtrage des archives
  const filteredArchives = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return archives.filter((archive) => {
      const courrier = archive.courrierId ? courriersById.get(archive.courrierId) : undefined;
      const doc = archive.document;
      const matchesSearch =
        q === '' ||
        archive.numeroClassement.toLowerCase().includes(q) ||
        (archive.direction || '').toLowerCase().includes(q) ||
        (courrier?.numero || '').toLowerCase().includes(q) ||
        (courrier?.objet || '').toLowerCase().includes(q) ||
        (doc?.titre || '').toLowerCase().includes(q) ||
        (archive.motif || '').toLowerCase().includes(q);
      const matchesStatut = filterStatut === '' || archive.statut === filterStatut;
      const matchesDirection = filterDirection === '' ||
        archive.direction === filterDirection ||
        archive.entiteId === filterDirection;
      return matchesSearch && matchesStatut && matchesDirection;
    });
  }, [archives, courriersById, searchTerm, filterStatut, filterDirection]);

  // Regroupement par direction/entité
  const archivesByDirection = useMemo(() => {
    const groups = new Map<string, Archive[]>();
    for (const archive of filteredArchives) {
      const key = archive.direction || archive.entiteId || 'Sans direction';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(archive);
    }
    return groups;
  }, [filteredArchives]);

  // Directions uniques disponibles (pour le filtre)
  const availableDirections = useMemo(() => {
    const dirs = new Set<string>();
    for (const archive of archives) {
      if (archive.direction) dirs.add(archive.direction);
    }
    return Array.from(dirs).sort();
  }, [archives]);

  const formSteps = [
    { id: 1, title: 'Courrier', description: 'Informations', icon: faFileAlt },
    { id: 2, title: 'Localisation', description: 'Boîte d\'archive', icon: faMapMarkerAlt },
    { id: 3, title: 'Détails', description: 'Motif et durée', icon: faInfoCircle },
    { id: 4, title: 'Confirmation', description: 'Vérification', icon: faCheck }
  ];

  const canGoToNextStep = () => {
    switch (currentStep) {
      case 1:
        return true; // Toujours possible de passer à l'étape suivante
      case 2:
        return archiveForm.boiteId.trim() !== '';
      case 3:
        return true; // Les champs sont optionnels
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (currentStep < formSteps.length && canGoToNextStep()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const resetArchiveForm = () => {
    setArchiveForm({
      boiteId: '',
      motif: '',
      observations: '',
      dureeConservation: 10
    });
    setCurrentStep(1);
    setShowArchiveModal(false);
    setSelectedCourrier(null);
  };

  const handleArchiver = async () => {
    if (!selectedCourrier || !archiveForm.boiteId || !user) return;

    await archivageService.archiverCourrier(
      selectedCourrier.id,
      archiveForm.boiteId,
      user.id,
      {
        motif: archiveForm.motif,
        observations: archiveForm.observations,
        dureeConservation: archiveForm.dureeConservation
      }
    );

    resetArchiveForm();
    await loadData();
  };

  const handleConsulter = async (archive: Archive) => {
    if (!user) return;
    await archivageService.consulterArchive(archive.id, user.id, 'Consultation');
    await loadData();
  };

  const handleSortir = async (archive: Archive, motif: string) => {
    if (!user) return;
    await archivageService.sortirArchive(archive.id, user.id, motif);
    await loadData();
  };

  const handleRetourner = async (archive: Archive) => {
    if (!user) return;
    await archivageService.retournerArchive(archive.id, user.id, 'Retour après sortie');
    await loadData();
  };

  /**
   * Création directe d'une archive sans courrier (document).
   */
  const [showDirectArchiveModal, setShowDirectArchiveModal] = useState(false);
  const [directArchiveForm, setDirectArchiveForm] = useState<{
    titre: string;
    type: string;
    fichier: string;
    fichierFile?: File;
    direction: string;
    entiteId: string;
    boiteId: string;
    motif: string;
    observations: string;
    dureeConservation: number;
  }>({
    titre: '',
    type: 'DOCUMENT',
    fichier: '',
    direction: user?.direction || '',
    entiteId: user?.entiteId || '',
    boiteId: '',
    motif: '',
    observations: '',
    dureeConservation: 10
  });

  const [showDirectArchiveScanModal, setShowDirectArchiveScanModal] = useState(false);

  const handleDirectArchiveScanComplete = (file: File) => {
    setDirectArchiveForm(prev => ({ ...prev, fichierFile: file, fichier: '' }));
  };

  const openDirectArchiveModal = () => {
    setDirectArchiveForm({
      titre: '',
      type: 'DOCUMENT',
      fichier: '',
      direction: user?.direction || '',
      entiteId: user?.entiteId || '',
      boiteId: '',
      motif: '',
      observations: '',
      dureeConservation: 10
    });
    setShowDirectArchiveModal(true);
  };

  const handleArchiverDocumentDirect = async () => {
    if (!user || !directArchiveForm.titre || !directArchiveForm.direction) return;

    await archivageService.archiverDocument(
      {
        titre: directArchiveForm.titre,
        type: directArchiveForm.type,
        fichier: directArchiveForm.fichier || undefined,
      },
      directArchiveForm.direction,
      user.id,
      {
        entiteId: directArchiveForm.entiteId || undefined,
        boiteId: directArchiveForm.boiteId || undefined,
        motif: directArchiveForm.motif,
        observations: directArchiveForm.observations,
        dureeConservation: directArchiveForm.dureeConservation,
        fichier: directArchiveForm.fichierFile
      }
    );

    setShowDirectArchiveModal(false);
    await loadData();
  };

  const getLocalisation = (archive: Archive) => {
    const loc = archivageService.getLocalisationComplete(archive.id);
    if (!loc) return 'Non localisé';
    return `${loc.local?.nom || '?'} > ${loc.armoire?.nom || '?'} > ${loc.etagere?.nom || '?'} > ${loc.boite?.numero || '?'}`;
  };

  const getStatutBadge = (statut: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      'ARCHIVE': { bg: 'bg-green-100', text: 'text-green-700', label: 'Archivé' },
      'CONSULTE': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Consulté' },
      'SORTI': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Sorti' },
      'DETRUIT': { bg: 'bg-red-100', text: 'text-red-700', label: 'Détruit' }
    };
    const badge = badges[statut] || badges['ARCHIVE'];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* En-tête charte : bandeau gradient (aligné Planning / DetailCourrier) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 via-amber-600 to-orange-700 px-6 sm:px-8 py-6 sm:py-8 shadow-xl border border-amber-700/40">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.12)_0%,_transparent_50%)]" aria-hidden />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-lg border border-white/20">
              <FontAwesomeIcon icon={faArchive} className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Archives
              </h1>
              <p className="mt-1 text-amber-100 text-sm sm:text-base">
                Gestion des documents archivés et environnement physique
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Statistiques — design type Workflow, centrées */}
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vue d'ensemble</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-4xl">
          <div className="group rounded-2xl border border-emerald-200/80 bg-white p-5 shadow-sm hover:shadow-lg hover:border-emerald-300/80 transition-all duration-200 ring-1 ring-emerald-50 hover:ring-emerald-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                <FontAwesomeIcon icon={faArchive} className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-tight">{stats.totalArchives}</div>
                <div className="text-sm font-medium text-emerald-600/90 mt-0.5">Archives totales</div>
              </div>
            </div>
          </div>
          <div className="group rounded-2xl border border-amber-200/80 bg-white p-5 shadow-sm hover:shadow-lg hover:border-amber-300/80 transition-all duration-200 ring-1 ring-amber-50 hover:ring-amber-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-100 transition-colors">
                <FontAwesomeIcon icon={faSignOutAlt} className="w-6 h-6 text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-amber-700 tabular-nums leading-tight">{stats.archivesParStatut.sorti}</div>
                <div className="text-sm font-medium text-amber-600/90 mt-0.5">En sortie</div>
              </div>
            </div>
          </div>
          <div className="group rounded-2xl border border-blue-200/80 bg-white p-5 shadow-sm hover:shadow-lg hover:border-blue-300/80 transition-all duration-200 ring-1 ring-blue-50 hover:ring-blue-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                <FontAwesomeIcon icon={faBox} className="w-6 h-6 text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-blue-700 tabular-nums leading-tight">{stats.totalBoites}</div>
                <div className="text-sm font-medium text-blue-600/90 mt-0.5">Boîtes</div>
              </div>
            </div>
          </div>
          <div className="group rounded-2xl border border-violet-200/80 bg-white p-5 shadow-sm hover:shadow-lg hover:border-violet-300/80 transition-all duration-200 ring-1 ring-violet-50 hover:ring-violet-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-100 transition-colors">
                <FontAwesomeIcon icon={faWarehouse} className="w-6 h-6 text-violet-600" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-violet-700 tabular-nums leading-tight">{stats.totalLocaux}</div>
                <div className="text-sm font-medium text-violet-600/90 mt-0.5">Locaux</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Onglets — design moderne */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <nav className="flex flex-wrap gap-0 p-2 sm:p-3">
            <button
              onClick={() => setActiveTab('archives')}
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'archives'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <FontAwesomeIcon icon={faArchive} className="text-base" />
              Documents archivés
              <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${activeTab === 'archives' ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>{archives.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('a-archiver')}
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'a-archiver'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <FontAwesomeIcon icon={faClipboardList} className="text-base" />
              À archiver
              <span className={`px-2 py-0.5 text-xs rounded-full font-bold ${activeTab === 'a-archiver' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>{courriersTraites.length}</span>
            </button>
            <button
              onClick={openDirectArchiveModal}
              className="ml-auto px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center gap-2"
              title="Archiver un document directement"
            >
              <FontAwesomeIcon icon={faPlus} className="text-sm" />
              Archiver un document
            </button>
            <button
              onClick={() => setActiveTab('statistiques')}
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'statistiques'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <FontAwesomeIcon icon={faWarehouse} className="text-base" />
              Environnement physique
            </button>
          </nav>
        </div>

        {/* Contenu des onglets */}
        <div className="p-6 sm:p-8">
          {activeTab === 'archives' && (
            <>
              {/* Barre de recherche + filtres */}
              <div className="flex flex-wrap items-center gap-4 mb-8">
                <div className="flex-1 min-w-[220px]">
                  <div className="relative">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                    <input
                      type="text"
                      placeholder="Rechercher par numéro, objet, direction..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 bg-slate-50/50 hover:bg-white transition-colors text-slate-800 placeholder-slate-400"
                    />
                  </div>
                </div>
                <select
                  value={filterStatut}
                  onChange={(e) => setFilterStatut(e.target.value)}
                  className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 bg-white text-slate-700 font-medium cursor-pointer min-w-[180px]"
                >
                  <option value="">Tous les statuts</option>
                  <option value="ARCHIVE">Archivé</option>
                  <option value="CONSULTE">Consulté</option>
                  <option value="SORTI">Sorti</option>
                </select>
                {canVoirToutesLesArchives && availableDirections.length > 0 && (
                  <select
                    value={filterDirection}
                    onChange={(e) => setFilterDirection(e.target.value)}
                    className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 bg-white text-slate-700 font-medium cursor-pointer min-w-[200px]"
                  >
                    <option value="">Toutes les directions</option>
                    {availableDirections.map(dir => (
                      <option key={dir} value={dir}>{dir}</option>
                    ))}
                  </select>
                )}
              </div>

              {!canVoirToutesLesArchives && userDirection && (
                <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
                  <FontAwesomeIcon icon={faFilter} className="mr-2" />
                  Vous visualisez les archives de votre direction : <strong>{userDirection}</strong>
                </div>
              )}

              {/* Liste des archives — cartes modernes, regroupées par direction */}
              <div className="space-y-8">
                {filteredArchives.length > 0 ? (
                  Array.from(archivesByDirection.entries()).map(([direction, groupArchives]) => (
                    <div key={direction} className="space-y-3">
                      <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faFolder} className="text-amber-600" />
                        </div>
                        <h3 className="text-base font-bold text-slate-800">{direction}</h3>
                        <span className="ml-auto text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                          {groupArchives.length} archive{groupArchives.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {groupArchives.map((archive) => {
                          const courrier = archive.courrierId ? courrierService.getCourrierById(archive.courrierId) : undefined;
                          const titre = archive.document?.titre || courrier?.objet || 'Document archivé';
                          return (
                            <div
                              key={archive.id}
                              className="flex flex-wrap items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200"
                            >
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0 border border-amber-200/60">
                                  <FontAwesomeIcon icon={archive.document ? faFileAlt : faArchive} className="w-6 h-6 text-amber-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="font-bold text-slate-900">{archive.numeroClassement}</span>
                                    {getStatutBadge(archive.statut)}
                                    {archive.document && (
                                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700">
                                        Document direct
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-600 truncate mb-2" title={titre}>
                                    {titre}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                                    <span className="flex items-center gap-1.5">
                                      <FontAwesomeIcon icon={faCalendar} className="w-3.5 h-3.5 text-amber-500" />
                                      {new Date(archive.dateArchivage).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                    {archive.boiteId && (
                                      <span className="flex items-center gap-1.5 truncate max-w-[280px]" title={getLocalisation(archive)}>
                                        <FontAwesomeIcon icon={faMapMarkerAlt} className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                        {getLocalisation(archive)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => { setSelectedArchive(archive); setShowDetailModal(true); }}
                                  className="p-3 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                                  title="Voir détails"
                                >
                                  <FontAwesomeIcon icon={faEye} className="text-lg" />
                                </button>
                                {archive.statut === 'ARCHIVE' && (
                                  <button
                                    onClick={() => handleSortir(archive, 'Sortie pour consultation')}
                                    className="p-3 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-colors"
                                    title="Sortir"
                                  >
                                    <FontAwesomeIcon icon={faSignOutAlt} className="text-lg" />
                                  </button>
                                )}
                                {archive.statut === 'SORTI' && (
                                  <button
                                    onClick={() => handleRetourner(archive)}
                                    className="p-3 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                                    title="Retourner"
                                  >
                                    <FontAwesomeIcon icon={faUndo} className="text-lg" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5 shadow-inner">
                      <FontAwesomeIcon icon={faArchive} className="w-10 h-10 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-semibold">Aucune archive trouvée</p>
                    <p className="text-sm text-slate-500 mt-1">Modifiez les critères de recherche ou les filtres</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'a-archiver' && (
            <div className="space-y-4">
              {courriersTraites.length > 0 ? (
                courriersTraites.map((courrier) => (
                  <div
                    key={courrier.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-amber-200/80 transition-all duration-200"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center flex-shrink-0 border border-emerald-200/60">
                        <FontAwesomeIcon icon={faFileAlt} className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-slate-900">{courrier.numero}</span>
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200/80">Traité</span>
                        </div>
                        <p className="text-sm text-slate-600 truncate mb-2">{courrier.objet?.replace(/<[^>]*>/g, '') || ''}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(courrier.dateReception).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} — {(courrier as Courrier & { sens?: SensCourrier }).sens === SensCourrier.SORTANT && courrier.type === TypeCourrier.EXTERNE ? '—' : courrier.expediteur}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { 
                        setSelectedCourrier(courrier); 
                        setCurrentStep(1);
                        setBoites(archivageService.getAllBoites());
                        setLocaux(archivageService.getAllLocaux());
                        setArmoires(archivageService.getAllArmoires());
                        setEtageres(archivageService.getAllEtageres());
                        setShowArchiveModal(true); 
                      }}
                      className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-semibold shadow-md shadow-amber-500/25 hover:from-amber-600 hover:to-amber-700 transition-all flex items-center gap-2 border border-amber-600/20"
                    >
                      <FontAwesomeIcon icon={faArchive} className="text-base" />
                      Archiver
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                  <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5 shadow-inner">
                    <FontAwesomeIcon icon={faClipboardList} className="w-10 h-10 text-slate-400" />
                  </div>
                  <p className="text-slate-600 font-semibold">Aucun courrier à archiver</p>
                  <p className="text-sm text-slate-500 mt-1">Les courriers traités apparaîtront ici</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'statistiques' && (
            <div className="space-y-6">
              {/* Toggle vue liste / 3D / Panoramique */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h3 className="text-xl font-bold text-slate-900">Emplacement physique</h3>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1.5">
                  <button
                    onClick={() => {
                      setView3DMode('list');
                      setShowPanorama(false);
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                      view3DMode === 'list'
                        ? 'bg-white shadow text-amber-600 border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <FontAwesomeIcon icon={faList} />
                    Liste
                  </button>
                  <button
                    onClick={() => {
                      setView3DMode('3d');
                      setShowPanorama(false);
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                      view3DMode === '3d' && !showPanorama
                        ? 'bg-white shadow text-amber-600 border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <FontAwesomeIcon icon={faCube} />
                    3D
                  </button>
                  <button
                    onClick={() => {
                      setView3DMode('3d');
                      setShowPanorama((prev) => !prev);
                      if (!selectedLocal3D) {
                        const localWithPanorama = locaux.find(l => l.actif && l.photoPanoramique);
                        if (localWithPanorama) {
                          setSelectedLocal3D(localWithPanorama.id);
                        }
                      }
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                      view3DMode === '3d' && showPanorama
                        ? 'bg-white shadow text-amber-600 border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    disabled={
                      !locaux.some(l => l.actif && l.photoPanoramique)
                    }
                    title={
                      !locaux.some(l => l.actif && l.photoPanoramique)
                        ? 'Aucun local avec média panoramique disponible'
                        : 'Afficher la visite virtuelle (image ou vidéo 360°)'
                    }
                  >
                    <FontAwesomeIcon icon={faStreetView} />
                    Panoramique
                  </button>
                </div>
              </div>

              {view3DMode === 'list' ? (
                /* Vue liste — design aligné charte */
                <div className="space-y-8">
                  {locaux.filter(l => l.actif).map((local) => (
                    <div key={local.id} className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center border border-violet-200/60 shadow-inner">
                          <FontAwesomeIcon icon={faWarehouse} className="w-7 h-7 text-violet-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">{local.nom}</h3>
                          <p className="text-sm text-slate-500 mt-0.5">{local.code} — {local.batiment}, {local.etage}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {armoires.filter(a => a.localId === local.id && a.actif).map((armoire) => (
                          <div key={armoire.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-200/80 transition-all duration-200">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                <FontAwesomeIcon icon={faBox} className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <span className="font-semibold text-slate-800">{armoire.nom}</span>
                                <span className="text-xs text-slate-500 ml-1">({armoire.code})</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {etageres.filter(e => e.armoireId === armoire.id && e.actif).map((etagere) => {
                                const boitesEtagere = boites.filter(b => b.etagereId === etagere.id && b.actif);
                                return (
                                  <div key={etagere.id} className="flex items-center justify-between text-sm rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2.5">
                                    <span className="font-medium text-slate-700">{etagere.nom}</span>
                                    <span className="text-xs font-semibold text-slate-500 tabular-nums">
                                      {boitesEtagere.length}/{etagere.capaciteBoites} boîtes
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {locaux.filter(l => l.actif).length === 0 && (
                    <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                      <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5 shadow-inner">
                        <FontAwesomeIcon icon={faWarehouse} className="w-10 h-10 text-slate-400" />
                      </div>
                      <p className="text-slate-600 font-semibold">Aucun local d'archivage</p>
                      <p className="text-sm text-slate-500 mt-1">Configurez les locaux dans les paramètres</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Vue 3D */
                <div className="space-y-6">
                  {/* Masquer les filtres en mode panoramique */}
                  {!showPanorama && (
                    <>
                      {/* Sélecteur de local */}
                      {locaux.filter(l => l.actif).length > 1 && (
                        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm">
                          <label className="text-sm font-semibold text-slate-700 mb-2 block">Sélectionner un local</label>
                          <select
                            value={selectedLocal3D || ''}
                            onChange={(e) => setSelectedLocal3D(e.target.value || null)}
                            className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-slate-900 font-medium cursor-pointer"
                          >
                            <option value="">Tous les locaux</option>
                            {locaux.filter(l => l.actif).map((local) => (
                              <option key={local.id} value={local.id}>{local.nom}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Contrôles de sélection */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-stretch">
                    {/* Sélection d'armoire */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm h-full flex flex-col">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        <FontAwesomeIcon icon={faWarehouse} className="w-4 h-4 mr-2 text-violet-600" />
                        Sélectionner une armoire
                      </label>
                      <select
                        value={selectedArmoire3D || ''}
                        onChange={(e) => {
                          setSelectedArmoire3D(e.target.value || null);
                          setSelectedEtagere3D(null);
                          setSelectedBoite3D(null);
                        }}
                        className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-slate-900 font-medium cursor-pointer"
                      >
                        <option value="">Toutes les armoires</option>
                        {armoires
                          .filter(a => a.actif && (!selectedLocal3D || a.localId === selectedLocal3D))
                          .map((armoire) => (
                            <option key={armoire.id} value={armoire.id}>
                              {armoire.nom}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Sélection d'étagère */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm h-full flex flex-col">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 mr-2 text-blue-600" />
                        Sélectionner une étagère
                      </label>
                      <select
                        value={selectedEtagere3D || ''}
                        onChange={(e) => {
                          setSelectedEtagere3D(e.target.value || null);
                          setSelectedBoite3D(null);
                        }}
                        className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-slate-900 font-medium cursor-pointer"
                      >
                        <option value="">Toutes les étagères</option>
                        {etageres
                          .filter(e => e.actif && 
                            (!selectedLocal3D || armoires.find(a => a.id === e.armoireId && a.localId === selectedLocal3D)) &&
                            (!selectedArmoire3D || e.armoireId === selectedArmoire3D))
                          .map((etagere) => {
                            const armoire = armoires.find(a => a.id === etagere.armoireId);
                            return (
                              <option key={etagere.id} value={etagere.id}>
                                {etagere.nom} — {armoire?.nom || 'N/A'}
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    {/* Sélection de boîte */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm h-full flex flex-col">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        <FontAwesomeIcon icon={faBox} className="w-4 h-4 mr-2 text-amber-600" />
                        Sélectionner une boîte
                      </label>
                      <select
                        value={selectedBoite3D || ''}
                        onChange={(e) => setSelectedBoite3D(e.target.value || null)}
                        disabled={!selectedEtagere3D}
                        className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-slate-900 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Toutes les boîtes</option>
                        {boites
                          .filter(b => b.actif && (!selectedEtagere3D || b.etagereId === selectedEtagere3D))
                          .map((boite) => (
                            <option key={boite.id} value={boite.id}>
                              {boite.numero} — {boite.typeContenu || 'N/A'} {boite.estPleine ? '(Pleine)' : '(Vide)'}
                            </option>
                          ))}
                      </select>
                    </div>

                        {/* Contrôles 3D */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm h-full flex flex-col justify-between">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm text-slate-600 font-semibold">Rotation</span>
                            <button
                              onClick={() => setCameraAngle({ ...cameraAngle, y: cameraAngle.y - 15 })}
                              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 hover:text-slate-800"
                              title="Rotation"
                            >
                              <FontAwesomeIcon icon={faRedo} className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setCameraAngle({ x: -20, y: 45 })}
                              className="px-3 py-2.5 text-sm rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 font-medium"
                            >
                              Réinitialiser
                            </button>
                          </div>
                          <div className="text-xs text-slate-500">
                            Utilisez la souris pour faire pivoter la vue
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Bouton de bascule entre vue 3D et visite virtuelle */}
                  {(() => {
                    const selectedLocal = selectedLocal3D ? locaux.find(l => l.id === selectedLocal3D) : null;
                    const hasPanorama = !!selectedLocal?.photoPanoramique;

                    if (selectedLocal3D && hasPanorama) {
                      return (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setShowPanorama(!showPanorama)}
                            className={`px-5 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
                              showPanorama
                                ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-500/25'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-amber-200/80'
                            }`}
                          >
                            <FontAwesomeIcon icon={showPanorama ? faCube : faStreetView} className="w-4 h-4" />
                            {showPanorama ? 'Vue 3D' : 'Visite virtuelle'}
                          </button>
                        </div>
                      );
                    }

                    if (showPanorama && !hasPanorama) {
                      return (
                        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-5 shadow-sm">
                          <div className="flex items-center gap-3 text-amber-800">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                              <FontAwesomeIcon icon={faInfoCircle} className="w-5 h-5" />
                            </div>
                            <p className="font-medium">Sélectionnez un local avec une image ou vidéo panoramique 360° pour activer la visite virtuelle</p>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })()}

                  {/* Bouton d'accès rapide paramétrage 3D */}
                  <div className="flex justify-end mb-3">
                    <Link
                      to="/parametres#vue3d"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-amber-200/80 transition-colors"
                    >
                      <FontAwesomeIcon icon={faCog} className="text-slate-600" />
                      Paramétrer la vue 3D
                    </Link>
                  </div>

              {/* Visualisation 3D ou Visite virtuelle */}
              <div ref={threeViewRef} />
                  {showPanorama && selectedLocal3D ? (() => {
                    const selectedLocal = locaux.find(l => l.id === selectedLocal3D);
                    
                    if (!selectedLocal?.photoPanoramique) {
                      return (
                        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
                          <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                            <FontAwesomeIcon icon={faCamera} className="w-10 h-10 text-slate-400" />
                          </div>
                          <p className="text-slate-600 font-semibold">Aucun média panoramique disponible</p>
                          <p className="text-sm text-slate-500 mt-2">
                            Ajoutez une image ou vidéo panoramique 360° dans les paramètres du local
                          </p>
                        </div>
                      );
                    }

                    return (
                      <PanoramaViewer
                        imageUrl={selectedLocal.photoPanoramique}
                        onClose={() => setShowPanorama(false)}
                        hotspots={[
                          // Exemple de hotspots - peut être étendu avec des données réelles
                          {
                            position: { yaw: 0, pitch: 0 },
                            label: 'Entrée principale',
                            onClick: () => console.log('Hotspot cliqué')
                          }
                        ]}
                      />
                    );
                  })() : (
                    (() => {
                      const locauxToShow = selectedLocal3D
                        ? locaux.filter(l => l.id === selectedLocal3D && l.actif)
                        : locaux.filter(l => l.actif);

                      if (locauxToShow.length === 0) {
                        return (
                          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                              <FontAwesomeIcon icon={faWarehouse} className="w-10 h-10 text-slate-400" />
                            </div>
                            <p className="text-slate-600 font-semibold">Aucun local disponible</p>
                          </div>
                        );
                      }

                      return (
                        <Archive3DView
                          locaux={locauxToShow}
                          armoires={armoires.filter(a => a.actif)}
                          etageres={etageres.filter(e => e.actif)}
                          boites={boites.filter(b => b.actif)}
                          archives={archives}
                          selectedLocalId={selectedLocal3D}
                          selectedArmoireId={selectedArmoire3D}
                          selectedEtagereId={selectedEtagere3D}
                          selectedBoiteId={selectedBoite3D}
                          selectedCourrierId={selectedCourrier3D}
                          config={config3D}
                          onSelectArmoire={(armoire) => setSelectedArmoire3D(armoire.id)}
                          onSelectEtagere={(etagere) => setSelectedEtagere3D(etagere.id)}
                          onSelectBoite={(boite) => setSelectedBoite3D(boite.id)}
                          onSelectCourrier={(courrier) => setSelectedCourrier3D(courrier.id)}
                        />
                      );
                    })()
                  )}
                  
                  {/* Légende */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm">
                    <h4 className="font-bold text-slate-900 mb-4">Légende</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5 border border-slate-100">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 border-2 border-violet-700/50 shadow-sm flex-shrink-0"></div>
                        <span className="text-sm font-medium text-slate-700">Local</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5 border border-slate-100">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 border-2 border-blue-700/50 shadow-sm flex-shrink-0"></div>
                        <span className="text-sm font-medium text-slate-700">Armoire</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5 border border-slate-100">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 border-2 border-emerald-700/50 shadow-sm flex-shrink-0"></div>
                        <span className="text-sm font-medium text-slate-700">Étagère</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5 border border-slate-100">
                        <div className="w-8 h-6 rounded-lg bg-gradient-to-br from-amber-300 to-orange-400 border-2 border-amber-600/50 shadow-sm flex-shrink-0"></div>
                        <span className="text-sm font-medium text-slate-700">Boîte</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal d'archivage */}
      {showArchiveModal && selectedCourrier && (
        <ArchivePortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-4 border border-surface-200 max-h-[90vh] flex flex-col animate-slideIn">
            {/* Header avec indicateur d'étapes */}
            <div className="flex-shrink-0 px-5 py-3 border-b border-surface-100 bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-3xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <FontAwesomeIcon icon={faArchive} className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Archiver le courrier</h3>
                    <p className="text-white/70 text-xs mt-0.5">
                      Étape {currentStep} sur {formSteps.length}
                    </p>
                  </div>
                </div>
                <button
                  onClick={resetArchiveForm}
                  className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors flex items-center justify-center"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                </button>
              </div>
              
              {/* Indicateur d'étapes */}
              <div className="flex items-center justify-between">
                {formSteps.map((step, index) => (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center">
                      <div className={`
                        w-9 h-9 rounded-xl flex items-center justify-center transition-all
                        ${currentStep >= step.id 
                          ? 'bg-white text-amber-600 shadow-lg' 
                          : 'bg-white/20 text-white/70'}
                      `}>
                        {currentStep > step.id ? (
                          <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                        ) : (
                          <FontAwesomeIcon icon={step.icon} className="w-4 h-4" />
                        )}
                      </div>
                      <span className={`text-[10px] mt-1 font-semibold ${
                        currentStep >= step.id ? 'text-white' : 'text-white/60'
                      }`}>
                        {step.title}
                      </span>
                    </div>
                    {index < formSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${
                        currentStep > step.id ? 'bg-white' : 'bg-white/20'
                      }`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Corps du formulaire */}
            <div className="flex-1 overflow-y-auto p-8">
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 shadow-lg shadow-amber-500/25">
                      <FontAwesomeIcon icon={faFileAlt} className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-surface-900">Informations du courrier</h3>
                    <p className="text-surface-500 mt-2">Vérifiez les informations avant archivage</p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 border-2 border-amber-200">
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-surface-500 uppercase mb-1 block">Numéro</label>
                        <p className="text-lg font-bold text-surface-900">{selectedCourrier.numero}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-surface-500 uppercase mb-1 block">Objet</label>
                        <p className="text-base font-semibold text-surface-800">{selectedCourrier.objet?.replace(/<[^>]*>/g, '') || ''}</p>
                      </div>
                      {selectedCourrier.dateReception && (
                        <div>
                          <label className="text-xs font-medium text-surface-500 uppercase mb-1 block">Date de réception</label>
                          <p className="text-sm text-surface-700">
                            {new Date(selectedCourrier.dateReception).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 shadow-lg shadow-amber-500/25">
                      <FontAwesomeIcon icon={faMapMarkerAlt} className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-surface-900">Localisation</h3>
                    <p className="text-surface-500 mt-2">Sélectionnez la boîte d'archive</p>
                  </div>
                  
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faBox} className="w-4 h-4 text-surface-500" />
                      </div>
                      Boîte d'archive
                      <span className="text-red-500">*</span>
                    </label>
                    
                    {/* Arborescence de localisation */}
                    <div className="bg-surface-50 border-2 border-surface-200 rounded-xl p-4 max-h-96 overflow-y-auto">
                      {locaux.filter(l => l.actif).length > 0 ? (
                        locaux.filter(l => l.actif).map((local) => {
                          const localArmoires = armoires.filter(a => a.localId === local.id && a.actif);
                          const isLocalExpanded = expandedLocaux.has(local.id);
                          
                          return (
                            <div key={local.id} className="mb-2">
                              {/* Local */}
                              <div
                                className="flex items-center gap-2 text-sm p-2 rounded transition-colors hover:bg-white cursor-pointer"
                                onClick={() => {
                                  setExpandedLocaux(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(local.id)) {
                                      newSet.delete(local.id);
                                    } else {
                                      newSet.add(local.id);
                                    }
                                    return newSet;
                                  });
                                }}
                              >
                                <button
                                  className="text-surface-500 hover:text-surface-700 w-4"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FontAwesomeIcon icon={isLocalExpanded ? faChevronDown : faChevronRight} className="text-xs" />
                                </button>
                                <FontAwesomeIcon icon={isLocalExpanded ? faFolderOpen : faFolder} className="text-amber-600 text-base" />
                                <span className="text-surface-700 font-medium flex-1">{local.nom}</span>
                                <span className="text-xs text-surface-500">({localArmoires.length} armoire{localArmoires.length > 1 ? 's' : ''})</span>
                              </div>
                              
                              {/* Armoires */}
                              {isLocalExpanded && localArmoires.map((armoire) => {
                                const armoireEtageres = etageres.filter(e => e.armoireId === armoire.id && e.actif);
                                const isArmoireExpanded = expandedArmoires.has(armoire.id);
                                
                                return (
                                  <div key={armoire.id} className="ml-6 mb-1">
                                    <div
                                      className="flex items-center gap-2 text-sm p-2 rounded transition-colors hover:bg-white cursor-pointer"
                                      onClick={() => {
                                        setExpandedArmoires(prev => {
                                          const newSet = new Set(prev);
                                          if (newSet.has(armoire.id)) {
                                            newSet.delete(armoire.id);
                                          } else {
                                            newSet.add(armoire.id);
                                          }
                                          return newSet;
                                        });
                                      }}
                                    >
                                      <button
                                        className="text-surface-500 hover:text-surface-700 w-4"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <FontAwesomeIcon icon={isArmoireExpanded ? faChevronDown : faChevronRight} className="text-xs" />
                                      </button>
                                      <FontAwesomeIcon icon={isArmoireExpanded ? faFolderOpen : faFolder} className="text-blue-600 text-base" />
                                      <span className="text-surface-700 font-medium flex-1">{armoire.nom}</span>
                                      <span className="text-xs text-surface-500">({armoireEtageres.length} étagère{armoireEtageres.length > 1 ? 's' : ''})</span>
                                    </div>
                                    
                                    {/* Étagères */}
                                    {isArmoireExpanded && armoireEtageres.map((etagere) => {
                                const etagereBoites = boites.filter(b => b.etagereId === etagere.id && b.actif);
                                      const isEtagereExpanded = expandedEtageres.has(etagere.id);
                                      
                                      return (
                                        <div key={etagere.id} className="ml-6 mb-1">
                                          <div
                                            className="flex items-center gap-2 text-sm p-2 rounded transition-colors hover:bg-white cursor-pointer"
                                            onClick={() => {
                                              setExpandedEtageres(prev => {
                                                const newSet = new Set(prev);
                                                if (newSet.has(etagere.id)) {
                                                  newSet.delete(etagere.id);
                                                } else {
                                                  newSet.add(etagere.id);
                                                }
                                                return newSet;
                                              });
                                            }}
                                          >
                                            <button
                                              className="text-surface-500 hover:text-surface-700 w-4"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <FontAwesomeIcon icon={isEtagereExpanded ? faChevronDown : faChevronRight} className="text-xs" />
                                            </button>
                                            <FontAwesomeIcon icon={isEtagereExpanded ? faFolderOpen : faFolder} className="text-green-600 text-base" />
                                            <span className="text-surface-700 font-medium flex-1">{etagere.nom}</span>
                                            <span className="text-xs text-surface-500">({etagereBoites.length} boîte{etagereBoites.length > 1 ? 's' : ''})</span>
                                          </div>
                                          
                                          {/* Boîtes */}
                                          {isEtagereExpanded && etagereBoites.map((boite) => {
                                            const isSelected = archiveForm.boiteId === boite.id;
                                            
                                            return (
                                              <div
                                                key={boite.id}
                                                className={`ml-6 mb-1 p-2 rounded transition-colors cursor-pointer ${
                                                  isSelected
                                                    ? 'bg-amber-100 border-2 border-amber-500'
                                                    : 'hover:bg-white border-2 border-transparent'
                                                }`}
                                                onClick={() => {
                                                  setArchiveForm({ ...archiveForm, boiteId: boite.id });
                                                }}
                                              >
                                                <div className="flex items-center gap-2 text-sm">
                                                  <FontAwesomeIcon icon={faBox} className={`text-base ${isSelected ? 'text-amber-600' : 'text-surface-500'}`} />
                                                  <span className={`font-medium flex-1 ${isSelected ? 'text-amber-900' : 'text-surface-700'}`}>
                                                    {boite.numero}
                                                  </span>
                                                  {isSelected && (
                                                    <FontAwesomeIcon icon={faCheck} className="text-amber-600" />
                                                  )}
                                                </div>
                                                {boite.typeContenu && (
                                                  <p className="text-xs text-surface-500 mt-1 ml-6">{boite.typeContenu}</p>
                                                )}
                                              </div>
                                            );
                                          })}
                                          
                                          {isEtagereExpanded && etagereBoites.length === 0 && (
                                            <div className="ml-6 text-xs text-surface-400 italic p-2">
                                              Aucune boîte disponible
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-8 text-surface-500">
                          <FontAwesomeIcon icon={faWarehouse} className="text-4xl mb-2 opacity-50" />
                          <p>Aucun local d'archivage disponible</p>
                          <p className="text-xs mt-1">Créez des locaux dans les paramètres d'archivage</p>
                        </div>
                      )}
                    </div>
                    
                    {archiveForm.boiteId && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm font-semibold text-amber-900">
                          Boîte sélectionnée: {boites.find(b => b.id === archiveForm.boiteId)?.numero}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 shadow-lg shadow-amber-500/25">
                      <FontAwesomeIcon icon={faInfoCircle} className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-surface-900">Détails d'archivage</h3>
                    <p className="text-surface-500 mt-2">Renseignez les informations complémentaires</p>
                  </div>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faClipboardList} className="w-4 h-4 text-surface-500" />
                        </div>
                        Motif d'archivage
                      </label>
                      <input
                        type="text"
                        value={archiveForm.motif}
                        onChange={(e) => setArchiveForm({ ...archiveForm, motif: e.target.value })}
                        placeholder="Ex: Traitement terminé"
                        className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-surface-900 placeholder:text-surface-400"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faCalendar} className="w-4 h-4 text-surface-500" />
                        </div>
                        Durée de conservation (années)
                      </label>
                      <input
                        type="number"
                        value={archiveForm.dureeConservation}
                        onChange={(e) => setArchiveForm({ ...archiveForm, dureeConservation: parseInt(e.target.value) || 10 })}
                        className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-surface-900"
                        min="1"
                        max="100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 shadow-lg shadow-amber-500/25">
                      <FontAwesomeIcon icon={faCheck} className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-surface-900">Confirmation</h3>
                    <p className="text-surface-500 mt-2">Vérifiez les informations avant de confirmer</p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-surface-50 rounded-xl p-4 border border-surface-200">
                      <label className="text-xs font-medium text-surface-500 uppercase mb-2 block">Observations</label>
                      <textarea
                        value={archiveForm.observations}
                        onChange={(e) => setArchiveForm({ ...archiveForm, observations: e.target.value })}
                        className="w-full px-4 py-3 bg-white border-2 border-surface-200 rounded-lg focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-sm resize-none text-surface-900 placeholder:text-surface-400"
                        rows={4}
                        placeholder="Notes supplémentaires..."
                      />
                    </div>
                    
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 border-2 border-amber-200">
                      <h4 className="font-semibold text-surface-900 mb-4">Récapitulatif</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-surface-600">Courrier:</span>
                          <span className="font-semibold text-surface-900">{selectedCourrier.numero}</span>
                        </div>
                        
                        {/* Arborescence de localisation en prévisualisation */}
                        {archiveForm.boiteId && (() => {
                          const selectedBoite = boites.find(b => b.id === archiveForm.boiteId);
                          if (!selectedBoite) return null;
                          
                          const selectedEtagere = etageres.find(e => e.id === selectedBoite.etagereId);
                          const selectedArmoire = armoires.find(a => a.id === selectedEtagere?.armoireId);
                          const selectedLocal = locaux.find(l => l.id === selectedArmoire?.localId);
                          
                          return (
                            <div className="bg-white rounded-lg p-4 border border-amber-200">
                              <label className="text-xs font-medium text-surface-500 uppercase mb-3 block">Localisation</label>
                              <div className="space-y-2">
                                {/* Local */}
                                {selectedLocal && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <FontAwesomeIcon icon={faFolderOpen} className="text-amber-600 text-base" />
                                    <span className="font-semibold text-surface-900">{selectedLocal.nom}</span>
                                  </div>
                                )}
                                
                                {/* Armoire */}
                                {selectedArmoire && (
                                  <div className="flex items-center gap-2 text-sm ml-6">
                                    <FontAwesomeIcon icon={faChevronRight} className="text-surface-400 text-xs" />
                                    <FontAwesomeIcon icon={faFolderOpen} className="text-blue-600 text-base" />
                                    <span className="font-medium text-surface-800">{selectedArmoire.nom}</span>
                                  </div>
                                )}
                                
                                {/* Étagère */}
                                {selectedEtagere && (
                                  <div className="flex items-center gap-2 text-sm ml-12">
                                    <FontAwesomeIcon icon={faChevronRight} className="text-surface-400 text-xs" />
                                    <FontAwesomeIcon icon={faFolderOpen} className="text-green-600 text-base" />
                                    <span className="font-medium text-surface-800">{selectedEtagere.nom}</span>
                                  </div>
                                )}
                                
                                {/* Boîte sélectionnée */}
                                <div className="flex items-center gap-2 text-sm ml-[4.5rem] bg-amber-100 p-2 rounded border border-amber-300">
                                  <FontAwesomeIcon icon={faChevronRight} className="text-surface-400 text-xs" />
                                  <FontAwesomeIcon icon={faBox} className="text-amber-600 text-base" />
                                  <span className="font-bold text-amber-900">{selectedBoite.numero}</span>
                                  <FontAwesomeIcon icon={faCheck} className="text-amber-600 ml-auto" />
                                </div>
                                
                                {selectedBoite.typeContenu && (
                                  <div className="ml-[4.5rem] text-xs text-surface-500 italic">
                                    Type: {selectedBoite.typeContenu}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {archiveForm.motif && (
                          <div className="flex justify-between">
                            <span className="text-surface-600">Motif:</span>
                            <span className="font-semibold text-surface-900">{archiveForm.motif}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-surface-600">Durée:</span>
                          <span className="font-semibold text-surface-900">{archiveForm.dureeConservation} an(s)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer avec navigation */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-surface-100 flex justify-between items-center bg-surface-50 rounded-b-3xl">
              <button
                onClick={prevStep}
                disabled={currentStep === 1}
                className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                  currentStep === 1
                    ? 'text-surface-400 bg-surface-100 cursor-not-allowed'
                    : 'text-surface-700 bg-white border-2 border-surface-200 hover:bg-surface-50'
                }`}
              >
                <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
                Précédent
              </button>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={resetArchiveForm}
                  className="px-5 py-2.5 text-sm font-semibold text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 transition-colors"
                >
                  Annuler
                </button>
                {currentStep === formSteps.length ? (
                  <button
                    onClick={handleArchiver}
                    disabled={!archiveForm.boiteId}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                      archiveForm.boiteId
                        ? 'text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25'
                        : 'text-surface-400 bg-surface-100 cursor-not-allowed'
                    }`}
                  >
                    <FontAwesomeIcon icon={faArchive} className="w-4 h-4" />
                    Archiver
                  </button>
                ) : (
                  <button
                    onClick={nextStep}
                    disabled={!canGoToNextStep()}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                      canGoToNextStep()
                        ? 'text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25'
                        : 'text-surface-400 bg-surface-100 cursor-not-allowed'
                    }`}
                  >
                    Suivant
                    <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        </ArchivePortal>
      )}

      {/* Modal d'archivage direct d'un document */}
      {showDirectArchiveModal && (
        <ArchivePortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 border border-surface-200 max-h-[90vh] flex flex-col animate-slideIn">
              <div className="flex-shrink-0 px-6 py-4 border-b border-surface-100 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-t-3xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <FontAwesomeIcon icon={faFileAlt} className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Archiver un document</h3>
                    <p className="text-white/70 text-xs">Enregistrement direct sans courrier</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDirectArchiveModal(false)}
                  className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors flex items-center justify-center"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white mb-4 shadow-lg shadow-emerald-500/25">
                    <FontAwesomeIcon icon={faFileAlt} className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-surface-900">Informations du document</h3>
                  <p className="text-surface-500 mt-2">Renseignez les champs pour classer le document</p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="text-sm font-semibold text-surface-700 mb-2 block">
                      Titre du document <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={directArchiveForm.titre}
                      onChange={(e) => setDirectArchiveForm({ ...directArchiveForm, titre: e.target.value })}
                      placeholder="Ex: Procès-verbal de réunion"
                      className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900 placeholder:text-surface-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-sm font-semibold text-surface-700 mb-2 block">Type</label>
                      <select
                        value={directArchiveForm.type}
                        onChange={(e) => setDirectArchiveForm({ ...directArchiveForm, type: e.target.value })}
                        className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900"
                      >
                        <option value="DOCUMENT">Document</option>
                        <option value="PV">Procès-verbal</option>
                        <option value="CONTRAT">Contrat</option>
                        <option value="RAPPORT">Rapport</option>
                        <option value="NOTE">Note de service</option>
                        <option value="AUTRE">Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-surface-700 mb-2 block">
                        Direction / Entité <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={directArchiveForm.direction}
                        onChange={(e) => setDirectArchiveForm({ ...directArchiveForm, direction: e.target.value })}
                        placeholder="Direction..."
                        className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900 placeholder:text-surface-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-surface-700 mb-2 block">Document / Fichier</label>
                    <div className="flex flex-col gap-3">
                      {directArchiveForm.fichierFile ? (
                        <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <FontAwesomeIcon icon={faFileAlt} className="text-emerald-600" />
                            <span className="text-sm text-emerald-900 truncate">{directArchiveForm.fichierFile.name}</span>
                            <span className="text-xs text-emerald-700">({(directArchiveForm.fichierFile.size / 1024).toFixed(1)} Ko)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDirectArchiveForm({ ...directArchiveForm, fichierFile: undefined })}
                            className="text-sm text-red-600 hover:text-red-700 font-medium"
                          >
                            Retirer
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={directArchiveForm.fichier}
                            onChange={(e) => setDirectArchiveForm({ ...directArchiveForm, fichier: e.target.value })}
                            placeholder="URL du document (optionnel)"
                            className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900 placeholder:text-surface-400"
                          />
                          <div className="flex flex-wrap gap-3">
                            <label className="flex-1 min-w-[140px] cursor-pointer px-4 py-3 bg-surface-50 border-2 border-dashed border-surface-300 rounded-xl hover:bg-surface-100 hover:border-emerald-400 transition-all flex items-center justify-center gap-2 text-sm font-medium text-surface-700">
                              <FontAwesomeIcon icon={faUpload} />
                              Charger un fichier
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setDirectArchiveForm({ ...directArchiveForm, fichierFile: file, fichier: '' });
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowDirectArchiveScanModal(true)}
                              className="flex-1 min-w-[140px] px-4 py-3 bg-surface-50 border-2 border-dashed border-surface-300 rounded-xl hover:bg-surface-100 hover:border-emerald-400 transition-all flex items-center justify-center gap-2 text-sm font-medium text-surface-700"
                            >
                              <FontAwesomeIcon icon={faCamera} />
                              Scanner un document
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-surface-700 mb-2 block">Boîte d'archive</label>
                    <select
                      value={directArchiveForm.boiteId}
                      onChange={(e) => setDirectArchiveForm({ ...directArchiveForm, boiteId: e.target.value })}
                      className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900"
                    >
                      <option value="">-- Sélectionner une boîte (optionnel) --</option>
                      {boites.filter(b => b.actif).map((boite) => {
                        const etagere = etageres.find(e => e.id === boite.etagereId);
                        const armoire = etagere ? armoires.find(a => a.id === etagere.armoireId) : undefined;
                        const local = armoire ? locaux.find(l => l.id === armoire.localId) : undefined;
                        return (
                          <option key={boite.id} value={boite.id}>
                            {local?.nom || '?'} / {armoire?.nom || '?'} / {etagere?.nom || '?'} / {boite.numero}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-sm font-semibold text-surface-700 mb-2 block">Motif</label>
                      <input
                        type="text"
                        value={directArchiveForm.motif}
                        onChange={(e) => setDirectArchiveForm({ ...directArchiveForm, motif: e.target.value })}
                        placeholder="Motif d'archivage"
                        className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900 placeholder:text-surface-400"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-surface-700 mb-2 block">Durée de conservation (ans)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={directArchiveForm.dureeConservation}
                        onChange={(e) => setDirectArchiveForm({ ...directArchiveForm, dureeConservation: parseInt(e.target.value) || 10 })}
                        className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-surface-700 mb-2 block">Observations</label>
                    <textarea
                      value={directArchiveForm.observations}
                      onChange={(e) => setDirectArchiveForm({ ...directArchiveForm, observations: e.target.value })}
                      rows={3}
                      placeholder="Notes complémentaires..."
                      className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900 placeholder:text-surface-400 resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 px-6 py-4 border-t border-surface-100 flex justify-end items-center gap-3 bg-surface-50 rounded-b-3xl">
                <button
                  onClick={() => setShowDirectArchiveModal(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleArchiverDocumentDirect}
                  disabled={!directArchiveForm.titre || !directArchiveForm.direction}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    directArchiveForm.titre && directArchiveForm.direction
                      ? 'text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/25'
                      : 'text-surface-400 bg-surface-100 cursor-not-allowed'
                  }`}
                >
                  <FontAwesomeIcon icon={faArchive} className="w-4 h-4" />
                  Archiver le document
                </button>
              </div>
            </div>
          </div>
        </ArchivePortal>
      )}

      <ScanDocumentModal
        isOpen={showDirectArchiveScanModal}
        onClose={() => setShowDirectArchiveScanModal(false)}
        onScanComplete={handleDirectArchiveScanComplete}
      />

      {/* Modal de détails */}
      {showDetailModal && selectedArchive && (
        <ArchivePortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 bg-gradient-to-r from-amber-500 to-orange-600 rounded-t-2xl">
              <h3 className="text-lg font-semibold text-white">Détails de l'archive</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-white/80 hover:text-white">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-surface-50 rounded-lg p-4">
                  <p className="text-xs text-surface-500 mb-1">Numéro de classement</p>
                  <p className="font-semibold text-surface-900">{selectedArchive.numeroClassement}</p>
                </div>
                <div className="bg-surface-50 rounded-lg p-4">
                  <p className="text-xs text-surface-500 mb-1">Statut</p>
                  {getStatutBadge(selectedArchive.statut)}
                </div>
                <div className="bg-surface-50 rounded-lg p-4">
                  <p className="text-xs text-surface-500 mb-1">Date d'archivage</p>
                  <p className="font-medium text-surface-900">
                    {new Date(selectedArchive.dateArchivage).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div className="bg-surface-50 rounded-lg p-4">
                  <p className="text-xs text-surface-500 mb-1">Date de destruction prévue</p>
                  <p className="font-medium text-surface-900">
                    {selectedArchive.dateDestruction
                      ? new Date(selectedArchive.dateDestruction).toLocaleDateString('fr-FR')
                      : 'Non définie'}
                  </p>
                </div>
                <div className="bg-surface-50 rounded-lg p-4">
                  <p className="text-xs text-surface-500 mb-1">Direction / Entité</p>
                  <p className="font-medium text-surface-900">
                    {selectedArchive.direction || selectedArchive.entiteId || 'Non renseignée'}
                  </p>
                </div>
                <div className="bg-surface-50 rounded-lg p-4">
                  <p className="text-xs text-surface-500 mb-1">Durée de conservation</p>
                  <p className="font-medium text-surface-900">{selectedArchive.dureeConservation} ans</p>
                </div>
              </div>

              {selectedArchive.document && (
                <div className="bg-surface-50 rounded-lg p-4 mb-6">
                  <p className="text-xs text-surface-500 mb-1">Document archivé</p>
                  <p className="font-semibold text-surface-900">{selectedArchive.document.titre}</p>
                  {selectedArchive.document.fichier && (
                    <p className="text-xs text-surface-500 mt-1 truncate">{selectedArchive.document.fichier}</p>
                  )}
                </div>
              )}

              {selectedArchive.boiteId && (
                <div className="bg-surface-50 rounded-lg p-4 mb-6">
                  <p className="text-xs text-surface-500 mb-1">Localisation</p>
                  <p className="font-medium text-surface-900 flex items-center gap-2">
                    <FontAwesomeIcon icon={faMapMarkerAlt} className="text-primary-500" />
                    {getLocalisation(selectedArchive)}
                  </p>
                </div>
              )}

              {/* Historique */}
              <div>
                <h4 className="font-semibold text-surface-900 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faHistory} className="text-surface-500" />
                  Historique
                </h4>
                <div className="space-y-2">
                  {selectedArchive.historique?.map((h, index) => (
                    <div key={h.id || index} className="flex items-start gap-3 p-3 bg-surface-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <FontAwesomeIcon icon={faUser} className="w-3 h-3 text-primary-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-900">{h.action}</p>
                        <p className="text-xs text-surface-500">
                          {new Date(h.date).toLocaleString('fr-FR')}
                        </p>
                        {h.motif && <p className="text-xs text-surface-600 mt-1">{h.motif}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-surface-200 bg-surface-50 rounded-b-2xl">
              {selectedArchive?.boiteId && (
                <button
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (selectedArchive.courrierId) params.set('courrierId', selectedArchive.courrierId);
                    params.set('boiteId', selectedArchive.boiteId!);
                    // Forcer l'onglet environnement physique et la vue 3D
                    setActiveTab('archives');
                    setView3DMode('3d');
                    setShowPanorama(false);
                    setDeepLinkHandled(false);
                    navigate(`/archives?${params.toString()}`);
                    setShowDetailModal(false);
                  }}
                  className="px-4 py-2 mr-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                  title="Localiser dans la vue 3D"
                >
                  <FontAwesomeIcon icon={faCube} className="mr-2" />
                  Localiser en 3D
                </button>
              )}
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-surface-200 text-surface-700 rounded-lg hover:bg-surface-300 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
          </div>
        </ArchivePortal>
      )}
    </div>
  );
};

export default Archives;

