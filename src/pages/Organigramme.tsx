import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { organigrammeService, OrganigrammeNode, getResponsabiliteLabel } from '../services/organigrammeService';
import { directionService } from '../services/directionService';
import { courrierService } from '../services/courrierService';
import { store } from '../store/store';
import { fetchCourriers } from '../store/slices/courriersSlice';
import { Role, Direction, StatutCourrier, Utilisateur } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBuilding, 
  faUsers, 
  faUser, 
  faSearch,
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faSitemap,
  faFilePdf,
  faExpand,
  faCompress,
  faMinus,
  faSearchPlus,
  faSearchMinus,
  faUndo,
  faRedo,
  faCopy,
  faPaste,
  faMousePointer,
  faHandPaper,
  faImage,
  faPalette,
  faLayerGroup,
  faEye,
  faEyeSlash,
  faTimes,
  faCheck,
  faGripVertical,
  faChevronRight,
  faChevronDown,
  faCrown,
  faUserTie,
  faUserShield,
  faLink,
  faUnlink,
  faMagic,
  faDownload,
  faUpload,
  faCog,
  faHome,
  faCircle,
  faBriefcase,
  faFolder,
  faUserCog,
  faFileExcel,
  faPrint,
  faFilter,
  faTasks,
  faCheckCircle,
  faInbox
} from '@fortawesome/free-solid-svg-icons';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';
import { exportSettingsService, ExportSettings } from '../services/exportSettingsService';
import { adminService } from '../services/adminService';
import { entiteOrganisationnelleService } from '../services/entiteOrganisationnelleService';
import { entiteTypeService } from '../services/entiteTypeService';
import { laravelApiService } from '../services/laravelApiService';
import SearchableSelect from '../components/SearchableSelect';

// Stats dossiers par utilisateur (en cours, traité, autres) pour badges organigramme
interface UserDossierStats {
  enCours: number;
  traite: number;
  autres: number;
}

// Types
interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed?: boolean;
}

interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

interface HistoryEntry {
  positions: Map<string, NodePosition>;
  organigramme: OrganigrammeNode[];
}

// Couleurs par type de nœud (charte bleu, pas de violet)
const nodeColors: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  'direction': { bg: 'from-blue-500 to-blue-600', border: 'border-blue-300', text: 'text-white', accent: 'bg-blue-400' },
  'service': { bg: 'from-emerald-500 to-emerald-600', border: 'border-emerald-300', text: 'text-white', accent: 'bg-emerald-400' },
  'utilisateur': { bg: 'from-primary-500 to-primary-600', border: 'border-primary-300', text: 'text-white', accent: 'bg-primary-400' },
  'fonction': { bg: 'from-amber-500 to-amber-600', border: 'border-amber-300', text: 'text-white', accent: 'bg-amber-400' },
  'sous-fonction': { bg: 'from-rose-500 to-rose-600', border: 'border-rose-300', text: 'text-white', accent: 'bg-rose-400' },
};

const STATS_TYPE_ICONS: Record<string, { icon: typeof faBuilding; bg: string; text: string }> = {
  direction: { icon: faBuilding, bg: 'bg-blue-50 group-hover:bg-blue-100', text: 'text-blue-700' },
  division: { icon: faLayerGroup, bg: 'bg-amber-50 group-hover:bg-amber-100', text: 'text-amber-700' },
  service: { icon: faUsers, bg: 'bg-emerald-50 group-hover:bg-emerald-100', text: 'text-emerald-700' },
  'sous-service': { icon: faFolder, bg: 'bg-violet-50 group-hover:bg-violet-100', text: 'text-violet-700' },
  bureau: { icon: faBriefcase, bg: 'bg-rose-50 group-hover:bg-rose-100', text: 'text-rose-700' },
  cellule: { icon: faCircle, bg: 'bg-indigo-50 group-hover:bg-indigo-100', text: 'text-indigo-700' },
};

function getStatsIconAndColor(code: string): { icon: typeof faBuilding; bg: string; text: string } {
  return STATS_TYPE_ICONS[code] ?? { icon: faSitemap, bg: 'bg-slate-50 group-hover:bg-slate-100', text: 'text-slate-700' };
}

const Organigramme: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // États principaux
  const [organigramme, setOrganigramme] = useState<OrganigrammeNode[]>([]);
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [loading, setLoading] = useState(true);
  const [userDossierStats, setUserDossierStats] = useState<Map<string, UserDossierStats>>(new Map());
  
  // États d'interaction
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'select' | 'pan' | 'add'>('select');
  
  // États de l'interface
  const [showProperties, setShowProperties] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [showExportSettings, setShowExportSettings] = useState(false);
  
  // États pour les courriers
  const [showCourriersModal, setShowCourriersModal] = useState(false);
  const [selectedUserForCourriers, setSelectedUserForCourriers] = useState<string | null>(null);
  const [selectedStatType, setSelectedStatType] = useState<'enCours' | 'traite' | 'autres'>('enCours');
  const [userCourriers, setUserCourriers] = useState<any[]>([]);
  const [loadingCourriers, setLoadingCourriers] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() => {
    const defaults = exportSettingsService.getDefaultSettings();
    return {
      ...defaults,
      includeMinimap: false,
      includeProperties: false
    };
  });
  const [exporting, setExporting] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);


  // Filtres organigramme dynamiques : comme dans la liste des courriers, recalculés à chaque rendu (types actifs uniquement)
  const filterLevels = entiteTypeService.getActiveTypesForFilters();
  const [filterSelectionIds, setFilterSelectionIds] = useState<(string | null)[]>([]);
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [typesReady, setTypesReady] = useState(false);

  // Déterminer si l'utilisateur est un directeur pour verrouiller la direction
  const isDirecteur = user?.role === Role.DIRECTEUR;
  const isDirecteurGeneral = user?.role === Role.DIRECTEUR_GENERAL;
  const isChefService = user?.role === Role.CHEF_SERVICE;

  // Initialiser les filtres selon la portée de l'utilisateur
  useEffect(() => {
    if (!user || user.role === Role.SUPER_ADMIN) return;
    
    // Pour les directeurs : verrouiller la direction uniquement
    if ((isDirecteur || isDirecteurGeneral) && user.direction) {
      const directions = entiteOrganisationnelleService.getDirectionsForFilters();
      const userDirection = directions.find(d => d.nom === user.direction);
      if (userDirection) {
        // Forme fonctionnelle pour toujours lire la valeur courante (évite stale closure)
        setFilterSelectionIds(prev => {
          const areFiltersEmpty = prev.every(id => id === null || id === undefined);
          if (!areFiltersEmpty) return prev; // Ne pas écraser les sélections existantes
          const next: (string | null)[] = [...prev];
          next[0] = userDirection.id;
          return next;
        });
      }
    }
    
    // Pour les chefs de division : verrouiller la direction ET la division
    // Charger uniquement les entités inférieures (services, sous-services, etc.)
    if (isChefService && user.direction && user.service) {
      const directions = entiteOrganisationnelleService.getDirectionsForFilters();
      const userDirection = directions.find(d => d.nom === user.direction);
      if (userDirection) {
        // Chercher la division de l'utilisateur par nom
        const divisions = entiteOrganisationnelleService.getEntitiesByType('division');
        const userDivision = divisions.find(d => d.nom === user.service);
        
        if (userDivision) {
          setFilterSelectionIds(prev => {
            const areFiltersEmpty = prev.every(id => id === null || id === undefined);
            if (!areFiltersEmpty) return prev; // Ne pas écraser les sélections existantes
            const next: (string | null)[] = [...prev];
            next[0] = userDirection.id; // Verrouiller la direction
            next[1] = userDivision.id;   // Verrouiller la division
            // Les niveaux suivants (services, sous-services) restent null pour permettre la navigation
            // dans les entités inférieures
            return next;
          });
        }
      }
    }
  }, [user, isDirecteur, isDirecteurGeneral, isChefService]);

  // Synchroniser les types à l'ouverture du tiroir filtres (pour avoir les libellés à jour)
  useEffect(() => {
    if (!showFiltersDrawer) return;
    let cancelled = false;
    (async () => {
      if (laravelApiService.isConfigured()) {
        await entiteTypeService.syncFromApi();
      }
      if (!cancelled) setTypesReady(true);
    })();
    return () => { cancelled = true; };
  }, [showFiltersDrawer]);

  const hasFilter = useMemo(
    () => filterSelectionIds.some((id) => id != null),
    [filterSelectionIds]
  );

  // Organigramme filtré selon la sélection (direction, division, service, sous-service, etc.)
  const filteredOrganigramme = useMemo(() => {
    if (!hasFilter) {
      return organigramme;
    }
    
    // Rassembler les IDs de filtre sélectionnés dans un Set pour lookup rapide
    const selectedIds = new Set<string>();
    const selectedTypes = new Set<string>();
    filterSelectionIds.forEach((id, index) => {
      if (id) {
        selectedIds.add(id);
        const level = filterLevels[index];
        if (level) selectedTypes.add(level.code);
      }
    });

    // Trouver le nœud correspondant au filtre le plus profond sélectionné
    // Ce nœud devient la racine de l'organigramme affiché
    const findSelectedNode = (nodes: OrganigrammeNode[]): OrganigrammeNode | null => {
      for (const node of nodes) {
        const nodeEntityId = node.id.replace(/^(dir-|ent-)/, '');
        if (selectedIds.has(nodeEntityId) && selectedTypes.has(node.type)) {
          return node;
        }
        if (node.children) {
          const found = findSelectedNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    const root = findSelectedNode(organigramme);
    if (!root) return organigramme;

    // L'entité sélectionnée est la racine, avec tous ses descendants
    return [root];
  }, [organigramme, filterLevels, filterSelectionIds, hasFilter]);

  // Stats basées sur les types d'entités actifs + nombre d'agents et de chefs de division
  const stats = useMemo(() => {
    const activeTypes = entiteTypeService.getActiveTypesForFilters();
    const countByType: Record<string, number> = {};
    activeTypes.forEach(t => { countByType[t.code] = 0; });
    let users = 0;
    let agents = 0;
    let chefsDivision = 0;
    const walk = (nodes: OrganigrammeNode[]) => {
      nodes.forEach(n => {
        if (n.type === 'utilisateur') {
          users += 1;
          const data = n.data as Utilisateur | undefined;
          if (data?.role === Role.AGENT) {
            agents += 1;
          }
          // Chef de division = utilisateur affiché directement sous un nœud de division
          if (n.parentEntityType === 'division') {
            chefsDivision += 1;
          }
        } else if (n.type in countByType) {
          countByType[n.type] += 1;
        }
        if (n.children) walk(n.children);
      });
    };
    walk(filteredOrganigramme);
    const typeCounts = activeTypes.map(t => ({
      code: t.code,
      libellePluriel: t.libellePluriel,
      count: countByType[t.code] ?? 0,
    }));
    return { typeCounts, users, agents, chefsDivision, total: nodePositions.size };
  }, [filteredOrganigramme, nodePositions.size]);
  
  // Historique pour undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Chargement initial
  useEffect(() => {
    loadOrganigramme();
  }, [user]);

  // Charger les stats dossiers par utilisateur (en cours, traité, autres) pour les badges
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      try {
        await dispatch(fetchCourriers(user.id) as any);
        if (cancelled) return;
        const courriers = store.getState().courriers.items;
        const assignations = await courrierService.getAllAssignations();
        const map = new Map<string, UserDossierStats>();
        const enCoursStatuts = [StatutCourrier.EN_TRAITEMENT, StatutCourrier.ASSIGNE, StatutCourrier.EN_ATTENTE_DG];
        const traiteStatuts = [StatutCourrier.TRAITE, StatutCourrier.ARCHIVE];
        for (const a of assignations) {
          const userId = a.assigneA;
          if (!userId) continue;
          const courrier = courriers.find((c) => c.id === a.courrierId);
          const statut = courrier?.statut;
          if (!map.has(userId)) map.set(userId, { enCours: 0, traite: 0, autres: 0 });
          const s = map.get(userId)!;
          if (statut && enCoursStatuts.includes(statut)) s.enCours += 1;
          else if (statut && traiteStatuts.includes(statut)) s.traite += 1;
          else s.autres += 1;
        }
        if (!cancelled) setUserDossierStats(map);
      } catch (e) {
        console.warn('Chargement stats catégories organigramme:', e);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id, dispatch]);

  // Recalculer les positions quand un filtre change
  useEffect(() => {
    if (filteredOrganigramme.length === 0) return;
    const positions = calculateInitialPositions(filteredOrganigramme);
    setNodePositions(positions);
    setTimeout(() => centerView(positions), 50);
  }, [filterSelectionIds, filteredOrganigramme.length]);

  const loadOrganigramme = async () => {
    setLoading(true);
    try {
      if (laravelApiService.isConfigured()) {
        try {
          await Promise.all([
            entiteTypeService.syncFromApi(),
            entiteOrganisationnelleService.refreshFromApi(),
            adminService.refreshUsersFromApi()
          ]);
        } catch (apiError: any) {
          // Vérifier si c'est une erreur 401 (token expiré)
          if (apiError?.status === 401 || apiError?.message?.includes('401') || apiError?.response?.status === 401) {
            console.warn('🔐 Token expiré, redirection vers la connexion...');
            // Forcer la déconnexion et redirection
            localStorage.removeItem('token');
            localStorage.removeItem('laravel_token');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            navigate('/login');
            return;
          }
          // Pour les autres erreurs, relancer avec les données démo
          console.warn('⚠️ Erreur API, utilisation des données démo:', apiError);
          throw apiError;
        }
        // Vérifier que les données sont bien chargées
        const entities = entiteOrganisationnelleService.getAllEntities();
        const users = adminService.getAllUsers();
        console.log('📊 Données chargées:', {
          entitiesCount: entities.length,
          entitiesSample: entities.slice(0, 3).map(e => ({ id: e.id, type: e.type, nom: e.nom.substring(0, 20) })),
          usersCount: users.length,
          chefsCount: users.filter(u => u.role === Role.CHEF_SERVICE).length
        });
        // Resynchroniser le filtre direction avec les vrais IDs (UUIDs) après chargement API.
        // Le useEffect initial peut avoir stocké un ID démo si le cache était vide au premier rendu.
        if (user && (user.role === Role.DIRECTEUR || user.role === Role.DIRECTEUR_GENERAL) && user.direction) {
          const directions = entiteOrganisationnelleService.getDirectionsForFilters();
          const userDirection = directions.find(d => d.nom === user.direction);
          if (userDirection) {
            setFilterSelectionIds(prev => {
              const next: (string | null)[] = prev.length > 0 ? [...prev] : [null];
              next[0] = userDirection.id;
              return next;
            });
          }
        }
      }
      directionService.initializeDemoData();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      let org = organigrammeService.buildOrganigramme();
      
      // Pour les chefs de division, charger l'organigramme à partir de leur division
      if (user && user.role === Role.CHEF_SERVICE && user.service) {
        console.log('🎯 Chargement organigramme pour chef de division:', user.service);
        org = organigrammeService.buildOrganigrammeFromUserDivision(user);
      }
      
      // Log de diagnostic pour l'organigramme construit
      console.log('🏗️ Organigramme construit:', {
        rootNodes: org.length,
        firstRootChildren: org[0]?.children?.length || 0,
        sampleNodes: org[0]?.children?.slice(0, 3).map(n => ({ id: n.id, type: n.type, label: n.label.substring(0, 20) }))
      });
      
      // Charger les positions personnalisées
      const savedPositions = localStorage.getItem('organigramme_positions');
      const savedCollapsed = localStorage.getItem('organigramme_collapsed');
      
      if (org.length === 0) {
        org = createDemoOrganigramme();
      }
      
      const filtered = organigrammeService.filterByAccess(org, user);
      console.log('🔍 Organigramme filtré pour chef de division:', {
        avantFiltre: org.length,
        apresFiltre: filtered.length,
        orgIds: org.map(o => o.id),
        filteredIds: filtered.map(f => f.id),
        userRole: user?.role,
        userId: user?.id,
        userService: user?.service,
        userDirection: user?.direction
      });
      
      if (filtered.length === 0) {
        console.error('❌ ERREUR: L organigramme filtré est vide!', {
          orgOriginal: org.map(o => ({ id: o.id, label: o.label, type: o.type, childrenCount: o.children?.length || 0 })),
          user: { id: user?.id, role: user?.role, service: user?.service, direction: user?.direction }
        });
      }
      
      setOrganigramme(filtered);
      
      // Calculer les positions initiales
      const positions = calculateInitialPositions(filtered);
      
      console.log('📍 Positions calculées pour chef de division:', {
        nombreTotalPositions: positions.size,
        positionsIds: Array.from(positions.keys()),
        premierNoeud: filtered[0] ? {
          id: filtered[0].id,
          aPosition: positions.has(filtered[0].id),
          enfants: filtered[0].children?.map(c => ({
            id: c.id,
            aPosition: positions.has(c.id)
          }))
        } : null
      });
      
      if (savedPositions) {
        try {
          const parsed = JSON.parse(savedPositions);
          Object.entries(parsed).forEach(([id, pos]: [string, any]) => {
            if (positions.has(id)) {
              positions.set(id, { ...positions.get(id)!, ...pos });
            }
          });
        } catch (e) {
          console.error('Erreur chargement positions:', e);
        }
      }
      
      if (savedCollapsed) {
        try {
          setCollapsedNodes(new Set(JSON.parse(savedCollapsed)));
        } catch (e) {
          console.error('Erreur chargement collapsed:', e);
        }
      }
      
      setNodePositions(positions);
      saveToHistory(positions, filtered);
      
      // Centrer la vue
      setTimeout(() => centerView(positions), 100);
      
    } catch (error) {
      console.error('Erreur chargement organigramme:', error);
    } finally {
      setLoading(false);
    }
  };

  const createDemoOrganigramme = (): OrganigrammeNode[] => {
    return [{
      id: 'dg-root',
      type: 'direction',
      label: 'Direction Générale',
      level: 0,
      data: { id: 'dg', nom: 'Direction Générale', description: 'Sommet de l\'organigramme' } as Direction,
      children: [
        { id: 'user-dg', type: 'utilisateur', label: 'Directeur Général', role: Role.DIRECTEUR_GENERAL, level: 1 },
        {
          id: 'dir-admin',
          type: 'direction',
          label: 'Direction Administrative',
          level: 1,
          children: [
            { id: 'serv-rh', type: 'service', label: 'Service RH', level: 2 },
            { id: 'serv-compta', type: 'service', label: 'Service Comptabilité', level: 2 }
          ]
        },
        {
          id: 'dir-tech',
          type: 'direction',
          label: 'Direction Technique',
          level: 1,
          children: [
            { id: 'serv-info', type: 'service', label: 'Service Informatique', level: 2 },
            { id: 'serv-maint', type: 'service', label: 'Service Maintenance', level: 2 }
          ]
        },
        {
          id: 'dir-com',
          type: 'direction',
          label: 'Direction Commerciale',
          level: 1,
          children: [
            { id: 'serv-vente', type: 'service', label: 'Service Ventes', level: 2 },
            { id: 'serv-market', type: 'service', label: 'Service Marketing', level: 2 }
          ]
        }
      ]
    }];
  };

  const calculateInitialPositions = (nodes: OrganigrammeNode[]): Map<string, NodePosition> => {
    const positions = new Map<string, NodePosition>();
    const NODE_WIDTH = 220;
    const NODE_HEIGHT = 80;
    const H_GAP = 40;
    const V_GAP = 100;
    
    console.log('🔢 calculateInitialPositions appelé avec:', {
      nombreNoeuds: nodes.length,
      noeudIds: nodes.map(n => n.id),
      premierNoeud: nodes[0] ? {
        id: nodes[0].id,
        type: nodes[0].type,
        childrenCount: nodes[0].children?.length || 0
      } : null
    });
    
    const processNode = (
      node: OrganigrammeNode, 
      x: number, 
      y: number, 
      availableWidth: number
    ): { width: number; positions: NodePosition[] } => {
      const result: NodePosition[] = [];
      
      // Validation des coordonnées
      if (isNaN(x) || isNaN(y) || isNaN(availableWidth)) {
        console.warn('⚠️ Coordonnées invalides pour le nœud:', node.id, { x, y, availableWidth });
        x = Math.max(0, x || 0);
        y = Math.max(0, y || 0);
        availableWidth = Math.max(NODE_WIDTH, availableWidth || NODE_WIDTH);
      }
      
      const children = node.children?.filter(c => c.type !== 'utilisateur') || [];
      const users = node.children?.filter(c => c.type === 'utilisateur') || [];
      const responsableId = (node.data as { responsableId?: string })?.responsableId;
      const hasChefInBlock = node.type === 'direction' || node.type === 'service' ||
        (['division', 'sous-service', 'bureau', 'cellule'].includes(node.type) && !!responsableId);
      const usersInBlock = hasChefInBlock
        ? users.filter(u => {
            if (node.type === 'direction') return u.role === Role.DIRECTEUR;
            if (node.type === 'service') return u.role === Role.CHEF_SERVICE;
            if (responsableId) {
              const uid = u.id.startsWith('user-') ? u.id.slice(5) : (u.data as { id?: string })?.id;
              return uid === responsableId;
            }
            return false;
          })
        : [];
      const usersBelow = hasChefInBlock ? users.filter(u => !usersInBlock.includes(u)) : users;
      // Un seul responsable maximum dans le bloc : hauteur fixe
      const extraHeightForUsers = usersInBlock.length > 0 ? 8 + 32 : 0;
      
      if (children.length === 0) {
        const pos: NodePosition = {
          id: node.id,
          x: x + (availableWidth - NODE_WIDTH) / 2,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT + extraHeightForUsers + (usersBelow.length > 0 ? 30 : 0)
        };
        positions.set(node.id, pos);
        
        // Positionner les utilisateurs sous le nœud uniquement s'ils ne sont pas dans le bloc (pas direction/service)
        usersBelow.forEach((u, i) => {
          const userPos: NodePosition = {
            id: u.id,
            x: pos.x + (NODE_WIDTH - 180) / 2,
            y: pos.y + pos.height + 20 + (i * 50),
            width: 180,
            height: 45
          };
          positions.set(u.id, userPos);
        });
        
        return { width: NODE_WIDTH, positions: result };
      }
      
      // Calculer les largeurs des enfants
      let totalChildrenWidth = 0;
      const childWidths: number[] = [];
      
      children.forEach((child) => {
        const childSubtreeWidth = Math.max(NODE_WIDTH, countDescendants(child) * (NODE_WIDTH + H_GAP));
        childWidths.push(childSubtreeWidth);
        totalChildrenWidth += childSubtreeWidth;
      });
      
      totalChildrenWidth += (children.length - 1) * H_GAP;
      
      // Position du nœud parent
      const nodeX = x + (Math.max(availableWidth, totalChildrenWidth) - NODE_WIDTH) / 2;
      const pos: NodePosition = {
        id: node.id,
        x: nodeX,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT + extraHeightForUsers + (usersBelow.length > 0 ? 30 : 0)
      };
      positions.set(node.id, pos);
      
      // Positionner les utilisateurs sous le nœud uniquement s'ils ne sont pas dans le bloc
      usersBelow.forEach((u, i) => {
        const userPos: NodePosition = {
          id: u.id,
          x: pos.x + (NODE_WIDTH - 180) / 2,
          y: pos.y + pos.height + 20 + (i * 50),
          width: 180,
          height: 45
        };
        positions.set(u.id, userPos);
      });
      
      // Positionner les enfants (structure uniquement ; les users sont dans le bloc)
      const childYOffset = usersBelow.length * 50;
      let childX = x + (Math.max(availableWidth, totalChildrenWidth) - totalChildrenWidth) / 2;
      const childY = y + NODE_HEIGHT + V_GAP + extraHeightForUsers + childYOffset;
      
      children.forEach((child, i) => {
        processNode(child, childX, childY, childWidths[i]);
        childX += childWidths[i] + H_GAP;
      });
      
      return { width: Math.max(NODE_WIDTH, totalChildrenWidth), positions: result };
    };
    
    const countDescendants = (node: OrganigrammeNode): number => {
      const children = node.children?.filter(c => c.type !== 'utilisateur') || [];
      if (children.length === 0) return 1;
      return children.reduce((sum, child) => sum + countDescendants(child), 0);
    };
    
    // Calculer la largeur totale
    let totalWidth = 0;
    nodes.forEach(node => {
      totalWidth += Math.max(NODE_WIDTH, countDescendants(node) * (NODE_WIDTH + H_GAP));
    });
    totalWidth += (nodes.length - 1) * H_GAP;
    
    // Traiter les nœuds racines
    let startX = 100;
    nodes.forEach(node => {
      const nodeWidth = Math.max(NODE_WIDTH, countDescendants(node) * (NODE_WIDTH + H_GAP));
      processNode(node, startX, 100, nodeWidth);
      startX += nodeWidth + H_GAP;
    });
    
    // Validation finale des positions
    console.log('🔍 Validation finale des positions:', {
      nombreTotalPositions: positions.size,
      positionsInvalides: Array.from(positions.entries()).filter(([id, pos]) => 
        isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.width) || isNaN(pos.height)
      ).map(([id, pos]) => ({ id, x: pos.x, y: pos.y, width: pos.width, height: pos.height }))
    });
    
    // Corriger les positions invalides
    positions.forEach((pos, id) => {
      if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.width) || isNaN(pos.height)) {
        console.warn('🔧 Correction position invalide pour:', id, pos);
        positions.set(id, {
          id: pos.id,
          x: Math.max(0, pos.x || 100),
          y: Math.max(0, pos.y || 100),
          width: Math.max(NODE_WIDTH, pos.width || NODE_WIDTH),
          height: Math.max(NODE_HEIGHT, pos.height || NODE_HEIGHT)
        });
      }
    });
    
    return positions;
  };

  const centerView = (positions: Map<string, NodePosition>) => {
    if (!containerRef.current || positions.size === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    });
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    
    const scaleX = (containerWidth - 100) / contentWidth;
    const scaleY = (containerHeight - 100) / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    
    const centerX = (containerWidth - contentWidth * scale) / 2 - minX * scale;
    const centerY = (containerHeight - contentHeight * scale) / 2 - minY * scale + 50;
    
    setTransform({ x: centerX, y: centerY, scale });
  };

  // Gestion de l'historique
  const saveToHistory = (positions: Map<string, NodePosition>, org: OrganigrammeNode[]) => {
    const entry: HistoryEntry = {
      positions: new Map(positions),
      organigramme: JSON.parse(JSON.stringify(org))
    };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(entry);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const entry = history[historyIndex - 1];
      setNodePositions(new Map(entry.positions));
      setOrganigramme(entry.organigramme);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const entry = history[historyIndex + 1];
      setNodePositions(new Map(entry.positions));
      setOrganigramme(entry.organigramme);
      setHistoryIndex(historyIndex + 1);
    }
  };

  // Sauvegarde automatique
  const savePositions = useCallback(() => {
    const posObj: Record<string, NodePosition> = {};
    nodePositions.forEach((pos, id) => {
      posObj[id] = pos;
    });
    localStorage.setItem('organigramme_positions', JSON.stringify(posObj));
    localStorage.setItem('organigramme_collapsed', JSON.stringify(Array.from(collapsedNodes)));
  }, [nodePositions, collapsedNodes]);

  useEffect(() => {
    if (!loading) {
      savePositions();
    }
  }, [nodePositions, collapsedNodes, loading, savePositions]);

  // Gestion du drag
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (tool !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    
    const pos = nodePositions.get(nodeId);
    if (!pos) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = (e.clientX - rect.left - transform.x) / transform.scale;
    const mouseY = (e.clientY - rect.top - transform.y) / transform.scale;
    
    setDraggingNode(nodeId);
    setDragOffset({ x: mouseX - pos.x, y: mouseY - pos.y });
    setSelectedNode(nodeId);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    if (draggingNode) {
      const mouseX = (e.clientX - rect.left - transform.x) / transform.scale;
      const mouseY = (e.clientY - rect.top - transform.y) / transform.scale;
      
      const newPositions = new Map(nodePositions);
      const pos = newPositions.get(draggingNode);
      if (pos) {
        newPositions.set(draggingNode, {
          ...pos,
          x: mouseX - dragOffset.x,
          y: mouseY - dragOffset.y
        });
        setNodePositions(newPositions);
      }
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setTransform(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleCanvasMouseUp = () => {
    if (draggingNode) {
      saveToHistory(nodePositions, organigramme);
    }
    setDraggingNode(null);
    setIsPanning(false);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || tool === 'pan') {
      setSelectedNode(null);
      if (e.button === 0 || tool === 'pan') {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
      }
    }
  };

  // Gestion du zoom
  const handleWheel = (e: React.WheelEvent) => {
    // Vérifier si l'événement peut être prévenu
    if (e.cancelable) {
      e.preventDefault();
    }
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(transform.scale * delta, 0.1), 3);
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setTransform(prev => ({
      scale: newScale,
      x: mouseX - (mouseX - prev.x) * (newScale / prev.scale),
      y: mouseY - (mouseY - prev.y) * (newScale / prev.scale)
    }));
  };

  const zoomIn = () => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }));
  const zoomOut = () => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));
  const resetZoom = () => centerView(nodePositions);

  // Fonction pour charger les courriers d'un utilisateur selon le type de stat
  const loadUserCourriers = async (userId: string, statType: 'enCours' | 'traite' | 'autres') => {
    setLoadingCourriers(true);
    setSelectedUserForCourriers(userId);
    setSelectedStatType(statType);
    
    try {
      // Récupérer les courriers depuis l'API
      const response = await fetch(`/api/users/${userId}/courriers?statut=${statType}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const courriers = await response.json();
        setUserCourriers(courriers);
        setShowCourriersModal(true);
      } else {
        console.error('Erreur lors du chargement des courriers:', response.statusText);
        setUserCourriers([]);
        setShowCourriersModal(true);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des courriers:', error);
      setUserCourriers([]);
      setShowCourriersModal(true);
    } finally {
      setLoadingCourriers(false);
    }
  };

  // Édition du texte
  const handleDoubleClick = (nodeId: string, currentLabel: string) => {
    setEditingNode(nodeId);
    setEditingText(currentLabel);
  };

  const saveNodeEdit = () => {
    if (!editingNode || !editingText.trim()) {
      setEditingNode(null);
      return;
    }
    
    const updateNode = (nodes: OrganigrammeNode[]): OrganigrammeNode[] => {
      return nodes.map(node => {
        if (node.id === editingNode) {
          return { ...node, label: editingText.trim() };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };
    
    const updated = updateNode(organigramme);
    setOrganigramme(updated);
    saveToHistory(nodePositions, updated);
    setEditingNode(null);
  };

  // Toggle collapse
  const toggleCollapse = (nodeId: string) => {
    const newCollapsed = new Set(collapsedNodes);
    if (newCollapsed.has(nodeId)) {
      newCollapsed.delete(nodeId);
    } else {
      newCollapsed.add(nodeId);
    }
    setCollapsedNodes(newCollapsed);
  };

  // Ajouter un nœud
  const addChildNode = (parentId: string) => {
    const newNodeId = `node-${Date.now()}`;
    
    const addNode = (nodes: OrganigrammeNode[]): OrganigrammeNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          const newNode: OrganigrammeNode = {
            id: newNodeId,
            type: 'fonction',
            label: 'Nouvelle fonction',
            level: node.level + 1,
            isCustom: true
          };
          return {
            ...node,
            children: [...(node.children || []), newNode]
          };
        }
        if (node.children) {
          return { ...node, children: addNode(node.children) };
        }
        return node;
      });
    };
    
    const updated = addNode(organigramme);
    setOrganigramme(updated);
    
    // Ajouter la position du nouveau nœud
    const parentPos = nodePositions.get(parentId);
    if (parentPos) {
      const newPositions = new Map(nodePositions);
      newPositions.set(newNodeId, {
        id: newNodeId,
        x: parentPos.x + 50,
        y: parentPos.y + 150,
        width: 200,
        height: 70
      });
      setNodePositions(newPositions);
      saveToHistory(newPositions, updated);
    }
  };

  // Supprimer un nœud
  const deleteNode = (nodeId: string) => {
    const removeNode = (nodes: OrganigrammeNode[]): OrganigrammeNode[] => {
      return nodes.filter(node => node.id !== nodeId).map(node => {
        if (node.children) {
          return { ...node, children: removeNode(node.children) };
        }
        return node;
      });
    };
    
    const updated = removeNode(organigramme);
    setOrganigramme(updated);
    
    const newPositions = new Map(nodePositions);
    newPositions.delete(nodeId);
    setNodePositions(newPositions);
    saveToHistory(newPositions, updated);
    setSelectedNode(null);
  };

  // Fonction pour obtenir les dimensions du format
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

  // Export PDF avec paramètres
  const exportPDF = async (settings?: ExportSettings) => {
    if (!canvasRef.current) return;
    
    const baseParams = settings || exportSettings;
    // Créer une copie et s'assurer que margins existe
    const params: ExportSettings = {
      ...baseParams,
      margins: baseParams.margins || { top: 20, right: 20, bottom: 20, left: 20 }
    };
    setExporting(true);
    
    try {
      const scaleMap = { low: 1, medium: 2, high: 3 };
      const scale = scaleMap[params.quality] || params.scale;
      
      const canvas = await html2canvas(canvasRef.current, {
        scale,
        backgroundColor: params.backgroundColor,
        logging: false
      });
      
      // Vérifier que le canvas a des dimensions valides
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
        throw new Error('Le canvas n\'a pas de dimensions valides');
      }
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      
      let pdf: jsPDF;
      const validScale = scale > 0 ? scale : 1;
      
      if (params.format === 'auto') {
        const autoWidth = Math.max(50, Math.min(841, canvas.width / validScale * 0.264583)); // Min 50mm, max A1 width
        const autoHeight = Math.max(50, Math.min(1189, canvas.height / validScale * 0.264583)); // Min 50mm, max A1 height
        
        if (!isFinite(autoWidth) || !isFinite(autoHeight) || autoWidth <= 0 || autoHeight <= 0) {
          throw new Error('Dimensions automatiques invalides');
        }
        
        pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [autoWidth, autoHeight]
        });
        
        const marginLeft = Math.max(0, Math.min(params.margins.left, autoWidth / 2));
        const marginTop = Math.max(0, Math.min(params.margins.top, autoHeight / 2));
        const marginRight = Math.max(0, Math.min(params.margins.right, autoWidth / 2));
        const marginBottom = Math.max(0, Math.min(params.margins.bottom, autoHeight / 2));
        const imgWidth = Math.max(1, autoWidth - marginLeft - marginRight);
        const imgHeight = Math.max(1, autoHeight - marginTop - marginBottom);
        
        pdf.addImage(imgData, 'PNG', marginLeft, marginTop, imgWidth, imgHeight);
      } else {
        const dims = getFormatDimensions(params.format, params.orientation);
        
        // Valider les dimensions
        if (dims.width <= 0 || dims.height <= 0 || !isFinite(dims.width) || !isFinite(dims.height)) {
          throw new Error('Dimensions de page invalides');
        }
        
        pdf = new jsPDF({
          orientation: params.orientation,
          unit: 'mm',
          format: [dims.width, dims.height]
        });
        
        // Calculer les dimensions de l'image pour qu'elle s'adapte à la page
        const marginLeft = Math.max(0, Math.min(params.margins.left, dims.width / 2));
        const marginRight = Math.max(0, Math.min(params.margins.right, dims.width / 2));
        const marginTop = Math.max(0, Math.min(params.margins.top, dims.height / 2));
        const marginBottom = Math.max(0, Math.min(params.margins.bottom, dims.height / 2));
        const maxWidth = Math.max(1, dims.width - marginLeft - marginRight);
        const maxHeight = Math.max(1, dims.height - marginTop - marginBottom);
        
        const imgWidth = canvas.width / validScale * 0.264583;
        const imgHeight = canvas.height / validScale * 0.264583;
        
        // Valider les dimensions de l'image
        if (imgWidth <= 0 || imgHeight <= 0 || !isFinite(imgWidth) || !isFinite(imgHeight)) {
          throw new Error('Dimensions d\'image invalides');
        }
        
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        const finalWidth = Math.max(1, imgWidth * ratio);
        const finalHeight = Math.max(1, imgHeight * ratio);
        
        // Valider les dimensions finales
        if (!isFinite(finalWidth) || !isFinite(finalHeight)) {
          throw new Error('Dimensions finales invalides');
        }
        
        pdf.addImage(imgData, 'PNG', marginLeft, marginTop, finalWidth, finalHeight);
      }
      
      pdf.save(`organigramme_${new Date().toISOString().split('T')[0]}.pdf`);
      setShowExportSettings(false);
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert('Erreur lors de l\'export PDF: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setExporting(false);
    }
  };

  // Prévisualisation PDF
  const previewPDF = async (settings?: ExportSettings) => {
    if (!canvasRef.current) return;
    
    const baseParams = settings || exportSettings;
    // Créer une copie et s'assurer que margins existe
    const params: ExportSettings = {
      ...baseParams,
      margins: baseParams.margins || { top: 20, right: 20, bottom: 20, left: 20 }
    };
    setGeneratingPreview(true);
    
    try {
      const scaleMap = { low: 1, medium: 2, high: 3 };
      const scale = scaleMap[params.quality] || params.scale;
      
      const canvas = await html2canvas(canvasRef.current, {
        scale,
        backgroundColor: params.backgroundColor,
        logging: false
      });
      
      // Vérifier que le canvas a des dimensions valides
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
        throw new Error('Le canvas n\'a pas de dimensions valides');
      }
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      
      let pdf: jsPDF;
      const validScale = scale > 0 ? scale : 1;
      
      if (params.format === 'auto') {
        const autoWidth = Math.max(50, Math.min(841, canvas.width / validScale * 0.264583)); // Min 50mm, max A1 width
        const autoHeight = Math.max(50, Math.min(1189, canvas.height / validScale * 0.264583)); // Min 50mm, max A1 height
        
        if (!isFinite(autoWidth) || !isFinite(autoHeight) || autoWidth <= 0 || autoHeight <= 0) {
          throw new Error('Dimensions automatiques invalides');
        }
        
        pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [autoWidth, autoHeight]
        });
        
        const marginLeft = Math.max(0, Math.min(params.margins.left, autoWidth / 2));
        const marginTop = Math.max(0, Math.min(params.margins.top, autoHeight / 2));
        const marginRight = Math.max(0, Math.min(params.margins.right, autoWidth / 2));
        const marginBottom = Math.max(0, Math.min(params.margins.bottom, autoHeight / 2));
        const imgWidth = Math.max(1, autoWidth - marginLeft - marginRight);
        const imgHeight = Math.max(1, autoHeight - marginTop - marginBottom);
        
        pdf.addImage(imgData, 'PNG', marginLeft, marginTop, imgWidth, imgHeight);
      } else {
        const dims = getFormatDimensions(params.format, params.orientation);
        
        // Valider les dimensions
        if (dims.width <= 0 || dims.height <= 0 || !isFinite(dims.width) || !isFinite(dims.height)) {
          throw new Error('Dimensions de page invalides');
        }
        
        pdf = new jsPDF({
          orientation: params.orientation,
          unit: 'mm',
          format: [dims.width, dims.height]
        });
        
        const marginLeft = Math.max(0, Math.min(params.margins.left, dims.width / 2));
        const marginRight = Math.max(0, Math.min(params.margins.right, dims.width / 2));
        const marginTop = Math.max(0, Math.min(params.margins.top, dims.height / 2));
        const marginBottom = Math.max(0, Math.min(params.margins.bottom, dims.height / 2));
        const maxWidth = Math.max(1, dims.width - marginLeft - marginRight);
        const maxHeight = Math.max(1, dims.height - marginTop - marginBottom);
        const imgWidth = canvas.width / validScale * 0.264583;
        const imgHeight = canvas.height / validScale * 0.264583;
        
        // Valider les dimensions de l'image
        if (imgWidth <= 0 || imgHeight <= 0 || !isFinite(imgWidth) || !isFinite(imgHeight)) {
          throw new Error('Dimensions d\'image invalides');
        }
        
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        const finalWidth = Math.max(1, imgWidth * ratio);
        const finalHeight = Math.max(1, imgHeight * ratio);
        
        // Valider les dimensions finales
        if (!isFinite(finalWidth) || !isFinite(finalHeight)) {
          throw new Error('Dimensions finales invalides');
        }
        
        pdf.addImage(imgData, 'PNG', marginLeft, marginTop, finalWidth, finalHeight);
      }
      
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

  // Export Image avec paramètres
  const exportImage = async (settings?: ExportSettings) => {
    if (!canvasRef.current) return;
    
    const baseParams = settings || exportSettings;
    // Créer une copie et s'assurer que margins existe
    const params: ExportSettings = {
      ...baseParams,
      margins: baseParams.margins || { top: 20, right: 20, bottom: 20, left: 20 }
    };
    setExporting(true);
    
    try {
      const scaleMap = { low: 1, medium: 2, high: 3 };
      const scale = scaleMap[params.quality] || params.scale;
      
      const canvas = await html2canvas(canvasRef.current, {
        scale,
        backgroundColor: params.backgroundColor,
        logging: false
      });
      
      let dataUrl = canvas.toDataURL('image/png', 1.0);
      
      // Appliquer le mode couleur si nécessaire
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
      link.download = `organigramme_${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
      setShowExportSettings(false);
    } catch (error) {
      console.error('Erreur export image:', error);
      alert('Erreur lors de l\'export image');
    } finally {
      setExporting(false);
    }
  };

  // Export Excel
  const exportExcel = async () => {
    setExporting(true);
    
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Organigramme');
      
      // En-têtes
      worksheet.columns = [
        { header: 'Niveau', key: 'level', width: 10 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Nom', key: 'label', width: 40 },
        { header: 'Rôle', key: 'role', width: 20 },
        { header: 'Direction', key: 'direction', width: 30 },
        { header: 'Service', key: 'service', width: 30 }
      ];
      
      // Fonction récursive pour extraire les données
      const extractData = (nodes: OrganigrammeNode[], level: number = 0, parentDirection: string = '', parentService: string = '') => {
        nodes.forEach(node => {
          let direction = parentDirection;
          let service = parentService;
          
          // Déterminer la direction et le service selon le type de nœud
          if (node.type === 'direction') {
            direction = node.label;
            service = '';
          } else if (node.type === 'service') {
            service = node.label;
          }
          
          // Pour les utilisateurs, essayer d'extraire depuis les données
          if (node.type === 'utilisateur' && node.data) {
            const userData = node.data as any;
            direction = userData?.direction || parentDirection;
            service = userData?.service || parentService;
          }
          
          worksheet.addRow({
            level: level,
            type: node.type,
            label: node.label,
            role: getResponsabiliteLabel(node.role, node.parentEntityType),
            direction: direction,
            service: service
          });
          
          if (node.children && node.children.length > 0) {
            extractData(node.children, level + 1, direction, service);
          }
        });
      };
      
      extractData(organigramme);
      
      // Style de l'en-tête
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      
      // Appliquer des couleurs selon le type
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        
        const type = row.getCell(2).value as string;
        let color = 'FFFFFFFF';
        
        if (type === 'direction') color = 'FFE3F2FD';
        else if (type === 'service') color = 'FFE8F5E9';
        else if (type === 'utilisateur') color = 'FFF3E5F5';
        
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color }
        };
      });
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const link = document.createElement('a');
      link.download = `organigramme_${new Date().toISOString().split('T')[0]}.xlsx`;
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

  // Fullscreen
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  // Auto-arrange
  const autoArrange = () => {
    const newPositions = calculateInitialPositions(organigramme);
    setNodePositions(newPositions);
    saveToHistory(newPositions, organigramme);
    centerView(newPositions);
  };

  // Collecter toutes les connexions
  const collectConnections = useCallback((nodes: OrganigrammeNode[], parentId?: string): Array<{ fromId: string; toId: string; toType: string }> => {
    const connections: Array<{ fromId: string; toId: string; toType: string }> = [];
    
    nodes.forEach(node => {
      if (parentId && !collapsedNodes.has(parentId)) {
        connections.push({ fromId: parentId, toId: node.id, toType: node.type });
      }
      
      if (node.children && !collapsedNodes.has(node.id)) {
        connections.push(...collectConnections(node.children, node.id));
      }
    });
    
    return connections;
  }, [collapsedNodes]);

  // Rendu des connexions
  const renderConnections = () => {
    const connections = collectConnections(filteredOrganigramme);
    
    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
          </marker>
        </defs>
        
        {connections.map(({ fromId, toId, toType }) => {
          const fromPos = nodePositions.get(fromId);
          const toPos = nodePositions.get(toId);
          
          if (!fromPos || !toPos) return null;
          
          const startX = fromPos.x + fromPos.width / 2;
          const startY = fromPos.y + fromPos.height;
          const endX = toPos.x + toPos.width / 2;
          const endY = toPos.y;
          
          const midY = (startY + endY) / 2;
          
          return (
            <g key={`${fromId}-${toId}`}>
              {/* Ombre de la ligne */}
              <path
                d={`M ${startX} ${startY}
                    C ${startX} ${midY},
                      ${endX} ${midY},
                      ${endX} ${endY}`}
                fill="none"
                stroke="rgba(0,0,0,0.1)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* Ligne principale */}
              <path
                d={`M ${startX} ${startY}
                    C ${startX} ${midY},
                      ${endX} ${midY},
                      ${endX} ${endY}`}
                fill="none"
                stroke="url(#connectionGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={toType === 'utilisateur' ? '8,4' : 'none'}
                className="transition-all duration-300"
              />
              {/* Point de départ */}
              <circle
                cx={startX}
                cy={startY}
                r="4"
                fill="#6366f1"
                className="transition-all duration-300"
              />
              {/* Point d'arrivée */}
              <circle
                cx={endX}
                cy={endY}
                r="4"
                fill="#3b82f6"
                className="transition-all duration-300"
              />
            </g>
          );
        })}
      </svg>
    );
  };

  // Rendu d'un nœud
  const renderNode = (node: OrganigrammeNode): React.ReactNode => {
    const pos = nodePositions.get(node.id);
    if (!pos) {
      console.warn('⚠️ Aucune position trouvée pour le nœud:', node.id);
      return null;
    }
    
    // Validation des positions pour éviter les NaN
    if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.width) || isNaN(pos.height)) {
      console.warn('⚠️ Position invalide (NaN) pour le nœud:', node.id, pos);
      return null;
    }
    
    const isCollapsed = collapsedNodes.has(node.id);
    const isSelected = selectedNode === node.id;
    const isEditing = editingNode === node.id;
    const isDragging = draggingNode === node.id;
    const colors = nodeColors[node.type] || nodeColors['fonction'];
    const hasChildren = node.children && node.children.length > 0;
    const matchesSearch = searchQuery.trim().length > 0 && node.label.toLowerCase().includes(searchQuery.toLowerCase());
    
    const responsableId = (node.data as { responsableId?: string })?.responsableId;
    const hasChefInBlock = node.type === 'direction' || node.type === 'service' ||
      (['division', 'sous-service', 'bureau', 'cellule'].includes(node.type) && !!responsableId);
    // Enfants visibles : ne pas rendre en dessous le responsable (il est dans le bloc)
    const visibleChildren = isCollapsed
      ? []
      : hasChefInBlock
        ? (node.children || []).filter(c => {
            if (c.type !== 'utilisateur') return true;
            if (node.type === 'direction') return c.role !== Role.DIRECTEUR;
            if (node.type === 'service') return c.role !== Role.CHEF_SERVICE;
            if (responsableId) {
              const uid = c.id.startsWith('user-') ? c.id.slice(5) : (c.data as { id?: string })?.id;
              return uid !== responsableId;
            }
            return true;
          })
        : (node.children || []);
    // Responsable affiché dans le bloc : par rôle (direction/service) ou par responsableId (division, bureau, etc.)
    const childUsersInBlock = hasChefInBlock
      ? (node.children || [])
          .filter((c): c is OrganigrammeNode => c.type === 'utilisateur')
          .filter(u => {
            if (node.type === 'direction') return u.role === Role.DIRECTEUR;
            if (node.type === 'service') return u.role === Role.CHEF_SERVICE;
            if (responsableId) {
              const uid = u.id.startsWith('user-') ? u.id.slice(5) : (u.data as { id?: string })?.id;
              return uid === responsableId;
            }
            return false;
          })
      : [];
    
    return (
      <React.Fragment key={node.id}>
        {/* Nœud */}
        <div
          className={`absolute select-none transition-all duration-200 rounded-2xl ${
            isDragging ? 'z-50' : 'z-10'
          } ${
            isSelected
              ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-50 shadow-lg'
              : matchesSearch
                ? 'ring-2 ring-amber-400/80 ring-offset-2 ring-offset-slate-50'
                : ''
          }`}
          style={{
            left: Math.max(0, (pos.x || 0) || 0),
            top: Math.max(0, (pos.y || 0) || 0),
            width: Math.max(220, (pos.width || 220) || 220),
            cursor: tool === 'select' ? (isDragging ? 'grabbing' : 'grab') : 'default'
          }}
          onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
          onDoubleClick={() => handleDoubleClick(node.id, node.label)}
        >
          {/* Utilisateur : photo à gauche, nom + rôle + badges dossiers */}
          {node.type === 'utilisateur' ? (
            <div className="flex flex-col gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white shadow-lg shadow-slate-200/50 border border-slate-200/90 transform transition-all duration-200 hover:shadow-xl hover:border-slate-300/80 w-full min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveNodeEdit();
                      if (e.key === 'Escape') setEditingNode(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 px-2 py-1 rounded bg-neutral-100 border border-neutral-200 text-neutral-800 text-sm"
                    autoFocus
                  />
                  <button onClick={(e) => { e.stopPropagation(); saveNodeEdit(); }} className="p-1 rounded hover:bg-neutral-100 text-primary-600">
                    <FontAwesomeIcon icon={faCheck} className="text-sm" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    {(node.data && 'photoUrl' in node.data && node.data.photoUrl) ? (
                      <img
                        src={(node.data as { photoUrl?: string }).photoUrl}
                        alt={node.label}
                        className="w-10 h-10 rounded-full object-cover border border-neutral-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {node.label.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 text-sm truncate">{node.label}</p>
                      {(node.role || node.parentEntityType) && (
                        <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <FontAwesomeIcon icon={faBriefcase} className="flex-shrink-0 text-[10px] text-blue-500" />
                          {getResponsabiliteLabel(node.role, node.parentEntityType)}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Badges dossiers : en cours, traité, autres */}
                  {(() => {
                    const userId = node.id.startsWith('user-') ? node.id.slice(5) : (node.data as { id?: string })?.id;
                    const stats = userId ? userDossierStats.get(userId) : undefined;
                    const isChefDivision = node.role === Role.CHEF_SERVICE;
                    
                    // Pour les chefs de division, toujours afficher les stats (même à zéro)
                    // Pour les autres, n'afficher que s'il y a des stats
                    if (!stats || (!isChefDivision && stats.enCours === 0 && stats.traite === 0 && stats.autres === 0)) return null;
                    
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100">
                        {stats.enCours > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            {stats.enCours} en cours
                          </div>
                        )}
                        {stats.traite > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                            {stats.traite} traité{stats.traite > 1 ? 's' : ''}
                          </div>
                        )}
                        {stats.autres > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 text-slate-600 text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            {stats.autres} autre{stats.autres > 1 ? 's' : ''}
                          </div>
                        )}
                        {/* Pour les chefs de division, afficher "Aucun dossier" si tout est à zéro */}
                        {isChefDivision && stats.enCours === 0 && stats.traite === 0 && stats.autres === 0 && (
                          <div className="px-2 py-1 rounded-full bg-slate-50 text-slate-500 text-xs font-medium">
                            Aucun dossier
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          ) : (
            <>
              {/* Direction / Service / Fonction : icône + nom + responsable dans le même bloc */}
              <div
                key={`node-${node.id}-${node.type}`}
                className={`
                flex flex-col gap-2 px-3.5 py-2.5 rounded-2xl shadow-lg border border-white/30
                bg-gradient-to-br ${colors.bg} ${colors.text}
                transform transition-all duration-200 w-full min-w-0
                ${isDragging ? 'scale-[1.02] shadow-2xl ring-2 ring-white/50' : 'hover:shadow-xl hover:border-white/40'}
              `}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-white/25 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <FontAwesomeIcon
                      icon={
                        node.type === 'direction' ? faBuilding :
                        node.type === 'division' ? faLayerGroup :
                        node.type === 'service' ? faFolder :
                        node.type === 'sous-service' ? faFolder : faBriefcase
                      }
                      className="text-white text-base"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveNodeEdit();
                            if (e.key === 'Escape') setEditingNode(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 px-2 py-1 rounded bg-white/20 text-white placeholder-white/50 outline-none border border-white/30 text-sm"
                          autoFocus
                        />
                        <button onClick={(e) => { e.stopPropagation(); saveNodeEdit(); }} className="p-1 rounded hover:bg-white/20">
                          <FontAwesomeIcon icon={faCheck} className="text-white text-xs" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="font-semibold text-sm truncate">{node.label}</p>
                        {(node.role || node.parentEntityType) && (
                          <p className="text-xs text-white/80 truncate flex items-center gap-1">
                            <FontAwesomeIcon icon={faCrown} className="flex-shrink-0 text-[10px]" />
                            {getResponsabiliteLabel(node.role, node.parentEntityType)}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {hasChildren && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 transition-colors flex-shrink-0"
                    >
                      <FontAwesomeIcon icon={isCollapsed ? faChevronRight : faChevronDown} className="text-white text-xs" />
                    </button>
                  )}
                  {hasChildren && isCollapsed && (
                    <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {node.children?.length}
                    </span>
                  )}
                </div>
                {/* Responsable du service/direction : avatar + nom + badges dossiers (si non replié) */}
                {!isCollapsed && childUsersInBlock.length > 0 && (() => {
                  const responsable = childUsersInBlock[0];
                  const respUserId = responsable.id.startsWith('user-') ? responsable.id.slice(5) : (responsable.data as { id?: string })?.id;
                  const respStats = respUserId ? userDossierStats.get(respUserId) : undefined;
                  const hasRespStats = respStats && (respStats.enCours > 0 || respStats.traite > 0 || respStats.autres > 0);
                  const chefLabel =
                    node.type === 'direction'
                      ? 'Directeur'
                      : node.type === 'division'
                      ? 'Chef de division'
                      : node.type === 'service'
                      ? 'Chef de service'
                      : node.type === 'sous-service'
                      ? 'Chef de sous-service'
                      : node.type === 'bureau'
                      ? 'Chef de bureau'
                      : entiteTypeService
                          .getLibelleSingulier(node.type as any)
                          .replace(/^./, c => c.toUpperCase());
                  return (
                    <div className="flex flex-col gap-1.5 pt-2 mt-0.5 border-t border-white/25 min-w-0">
                      <p className="text-[10px] font-semibold text-white/90 uppercase tracking-wide">{chefLabel}</p>
                      <div className="flex items-center gap-2.5 min-w-0">
                        {(responsable.data && 'photoUrl' in responsable.data && (responsable.data as { photoUrl?: string }).photoUrl) ? (
                          <img
                            src={(responsable.data as { photoUrl?: string }).photoUrl}
                            alt={responsable.label}
                            className="w-9 h-9 rounded-xl object-cover border-2 border-white/50 flex-shrink-0 shadow-md"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-white/30 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 border border-white/40 shadow-inner">
                            {responsable.label.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{responsable.label}</p>
                          {(responsable.role || responsable.parentEntityType) && (
                            <p className="text-[10px] text-white/80 truncate flex items-center gap-1 mt-0.5">
                              <FontAwesomeIcon icon={faBriefcase} className="flex-shrink-0 text-[9px]" />
                              {getResponsabiliteLabel(responsable.role, responsable.parentEntityType)}
                            </p>
                          )}
                        </div>
                      </div>
                      {hasRespStats && respStats && (
                        <div className="flex flex-wrap items-center gap-1">
                          {respStats.enCours > 0 && (
                            <span 
                              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-medium bg-white/25 text-white border border-white/40 animate-pulse cursor-pointer hover:bg-white/35 transition-colors" 
                              title="En cours - Cliquer pour voir les courriers"
                              onClick={(e) => {
                                e.stopPropagation();
                                const userId = responsable.id.startsWith('user-') ? responsable.id.slice(5) : (responsable.data as { id?: string })?.id;
                                if (userId) loadUserCourriers(userId, 'enCours');
                              }}
                            >
                              <FontAwesomeIcon icon={faTasks} className="text-[8px]" />
                              <span>{respStats.enCours}</span>
                            </span>
                          )}
                          {respStats.traite > 0 && (
                            <span 
                              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-medium bg-white/25 text-white border border-white/40 cursor-pointer hover:bg-white/35 transition-colors" 
                              title="Traités - Cliquer pour voir les courriers"
                              onClick={(e) => {
                                e.stopPropagation();
                                const userId = responsable.id.startsWith('user-') ? responsable.id.slice(5) : (responsable.data as { id?: string })?.id;
                                if (userId) loadUserCourriers(userId, 'traite');
                              }}
                            >
                              <FontAwesomeIcon icon={faCheckCircle} className="text-[8px]" />
                              <span>{respStats.traite}</span>
                            </span>
                          )}
                          {respStats.autres > 0 && (
                            <span 
                              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-medium bg-white/25 text-white border border-white/40 cursor-pointer hover:bg-white/35 transition-colors" 
                              title="Autres - Cliquer pour voir les courriers"
                              onClick={(e) => {
                                e.stopPropagation();
                                const userId = responsable.id.startsWith('user-') ? responsable.id.slice(5) : (responsable.data as { id?: string })?.id;
                                if (userId) loadUserCourriers(userId, 'autres');
                              }}
                            >
                              <FontAwesomeIcon icon={faInbox} className="text-[8px]" />
                              <span>{respStats.autres}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
          
          {/* Boutons d'action (visibles quand sélectionné) */}
          {isSelected && !isEditing && (
            <div className="absolute -bottom-11 left-1/2 transform -translate-x-1/2 flex items-center gap-1 bg-white rounded-xl shadow-xl border border-slate-200/80 p-1.5 z-50">
              <button
                onClick={(e) => { e.stopPropagation(); addChildNode(node.id); }}
                className="p-2 rounded hover:bg-primary-50 text-primary-600 transition-colors"
                title="Ajouter un enfant"
              >
                <FontAwesomeIcon icon={faPlus} className="text-sm" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDoubleClick(node.id, node.label); }}
                className="p-2 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                title="Modifier"
              >
                <FontAwesomeIcon icon={faEdit} className="text-sm" />
              </button>
              {node.isCustom && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                  className="p-2 rounded hover:bg-red-50 text-red-600 transition-colors"
                  title="Supprimer"
                >
                  <FontAwesomeIcon icon={faTrash} className="text-sm" />
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Rendu récursif des enfants */}
        {visibleChildren.map(child => renderNode(child))}
      </React.Fragment>
    );
  };

  // Trouver un nœud
  const findNode = (nodes: OrganigrammeNode[], id: string): OrganigrammeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedNodeData = selectedNode ? findNode(filteredOrganigramme, selectedNode) : null;

  // Rendu minimap
  const renderMinimap = () => {
    if (!showMinimap) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodePositions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    });
    
    const contentWidth = maxX - minX || 1;
    const contentHeight = maxY - minY || 1;
    const scale = Math.min(180 / contentWidth, 120 / contentHeight);
    
    return (
      <div className="absolute bottom-5 right-5 w-52 h-36 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden z-40">
        <div className="absolute top-0 left-0 right-0 h-7 bg-slate-100/80 border-b border-slate-200/80 flex items-center px-2.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Vue d'ensemble</span>
        </div>
        <div className="relative w-full h-full pt-9 pb-2 px-2">
          {Array.from(nodePositions.entries()).map(([id, pos]) => {
            const node = findNode(filteredOrganigramme, id);
            if (!node) return null;
            const colors = nodeColors[node.type] || nodeColors['fonction'];
            
            return (
              <div
                key={id}
                className={`absolute rounded-lg bg-gradient-to-br ${colors.bg} opacity-90 shadow-sm`}
                style={{
                  left: (pos.x - minX) * scale + 8,
                  top: (pos.y - minY) * scale + 4,
                  width: Math.max(pos.width * scale, 4),
                  height: Math.max(pos.height * scale, 3)
                }}
              />
            );
          })}
          
          {/* Viewport indicator */}
          {containerRef.current && (
            <div
              className="absolute border-2 border-blue-500 rounded-lg bg-blue-500/15 shadow-sm"
              style={{
                left: (-transform.x / transform.scale - minX) * scale + 8,
                top: (-transform.y / transform.scale - minY) * scale + 4,
                width: (containerRef.current.clientWidth / transform.scale) * scale,
                height: (containerRef.current.clientHeight / transform.scale) * scale
              }}
            />
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-neutral-600 font-medium">Chargement de l'organigramme...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`flex h-[calc(100vh-4rem)] max-h-[900px] w-full max-w-[1800px] mx-auto rounded-2xl overflow-hidden shadow-xl border border-slate-200/80 bg-slate-50/95 ${isFullscreen ? 'fixed inset-0 z-50 h-screen max-h-screen w-screen rounded-none border-0 shadow-none' : ''}`}
    >
      {/* Zone principale : barre horizontale + canvas */}
      <div className="flex-1 flex flex-col overflow-hidden w-full min-w-0">
        {/* Barre : filtres + recherche sur une ligne, stats, outils */}
        <div className="px-5 py-4 bg-white border-b border-slate-200/80 flex flex-col gap-4 flex-shrink-0">
          {/* Ligne 1 : Filtres (drawer) + Recherche sur la même ligne */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowFiltersDrawer(true)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                hasFilter
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25 hover:bg-blue-600'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/80'
              }`}
              title="Filtrer l'organigramme"
            >
              <FontAwesomeIcon icon={faFilter} className="text-sm" />
              Filtres
              {hasFilter && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-white/20 text-xs font-semibold flex items-center justify-center">
                  {filterSelectionIds.filter(Boolean).length}
                </span>
              )}
            </button>
            <div className="flex-1 min-w-0" />
            <div className="relative flex-shrink-0">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <input
                type="text"
                placeholder="Rechercher un nom..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all w-52"
              />
            </div>
          </div>
          {/* Stats : une carte par type d'entité actif + utilisateurs + total */}
          <div className="flex flex-wrap items-center justify-center gap-4 py-3 px-4 rounded-xl bg-gradient-to-b from-slate-50/50 to-white border border-slate-100">
            <div className="flex flex-wrap items-center justify-center gap-4 max-w-3xl">
              {stats.typeCounts.map((tc, idx) => {
                const iconAndColor = getStatsIconAndColor(tc.code);
                return (
                  <div key={tc.code} className="group rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${iconAndColor.bg}`}>
                      <FontAwesomeIcon icon={iconAndColor.icon} className={iconAndColor.text} />
                    </div>
                    <div>
                      <div className={`text-2xl font-bold tabular-nums leading-tight ${iconAndColor.text}`}>{tc.count}</div>
                      <div className={`text-xs font-medium ${iconAndColor.text} opacity-90`}>{tc.libellePluriel}</div>
                    </div>
                  </div>
                );
              })}
              {/* Nombre de chefs de division */}
              <div className="group rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50 group-hover:bg-amber-100 transition-colors">
                  <FontAwesomeIcon icon={faLayerGroup} className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums leading-tight text-amber-700">{stats.chefsDivision}</div>
                  <div className="text-xs font-medium text-amber-700 opacity-90">Chefs de division</div>
                </div>
              </div>
              {/* Nombre d'agents */}
              <div className="group rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                  <FontAwesomeIcon icon={faUsers} className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums leading-tight text-emerald-700">{stats.agents}</div>
                  <div className="text-xs font-medium text-emerald-700 opacity-90">Agents</div>
                </div>
              </div>
              <div className="group rounded-2xl border border-slate-200/90 bg-white px-5 py-3 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-200/80 transition-colors">
                  <FontAwesomeIcon icon={faUser} className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums leading-tight">{stats.users}</div>
                  <div className="text-xs font-medium text-slate-500">Utilisateurs</div>
                </div>
              </div>
              <div className="group rounded-2xl border border-primary-200/80 bg-white px-5 py-3 shadow-sm hover:shadow-md hover:border-primary-300/80 transition-all duration-200 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 transition-colors">
                  <FontAwesomeIcon icon={faSitemap} className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary-700 tabular-nums leading-tight">{stats.total}</div>
                  <div className="text-xs font-medium text-primary-600/90">Nœuds affichés</div>
                </div>
              </div>
            </div>
          </div>
          {/* Ligne 3 : Outils */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1">
              <div className="flex rounded-xl bg-slate-100/80 p-1 gap-0.5">
                <button
                  onClick={() => setTool('select')}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${tool === 'select' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  title="Sélectionner"
                >
                  <FontAwesomeIcon icon={faMousePointer} className="mr-1.5" /> Sélection
                </button>
                <button
                  onClick={() => setTool('pan')}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${tool === 'pan' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  title="Déplacer la vue"
                >
                  <FontAwesomeIcon icon={faHandPaper} className="mr-1.5" /> Déplacer
                </button>
              </div>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              <button onClick={undo} disabled={historyIndex <= 0} className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 transition-colors" title="Annuler"><FontAwesomeIcon icon={faUndo} /></button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 transition-colors" title="Rétablir"><FontAwesomeIcon icon={faRedo} /></button>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              <div className="flex items-center gap-0.5 rounded-xl bg-slate-100/80 p-1">
                <button onClick={zoomOut} className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors" title="Zoom -"><FontAwesomeIcon icon={faSearchMinus} className="text-xs" /></button>
                <span className="px-2.5 py-1 text-xs font-semibold text-slate-600 min-w-[3rem] text-center">{Math.round(transform.scale * 100)}%</span>
                <button onClick={zoomIn} className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors" title="Zoom +"><FontAwesomeIcon icon={faSearchPlus} className="text-xs" /></button>
              </div>
              <button onClick={resetZoom} className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Réinitialiser vue"><FontAwesomeIcon icon={faHome} /></button>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              <button onClick={autoArrange} className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Réorganiser"><FontAwesomeIcon icon={faMagic} /></button>
              <button onClick={() => exportImage()} className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Exporter image"><FontAwesomeIcon icon={faImage} /></button>
              <button onClick={() => exportPDF()} className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Exporter PDF"><FontAwesomeIcon icon={faFilePdf} /></button>
              <button onClick={toggleFullscreen} className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Plein écran"><FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} /></button>
              <button onClick={() => setShowMinimap(!showMinimap)} className={`p-2.5 rounded-xl transition-colors ${showMinimap ? 'text-blue-600 bg-blue-50' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`} title="Mini-carte"><FontAwesomeIcon icon={faLayerGroup} /></button>
              <button onClick={() => setShowProperties(!showProperties)} className={`p-2.5 rounded-xl transition-colors ${showProperties ? 'text-blue-600 bg-blue-50' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`} title="Propriétés"><FontAwesomeIcon icon={faCog} /></button>
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">Double-clic éditer · Glisser déplacer · Molette zoom</span>
          </div>
        </div>
        
        {/* Canvas */}
        <div className="flex-1 flex overflow-hidden">
          <div 
          ref={canvasRef}
          className="flex-1 relative overflow-hidden"
          style={{ cursor: tool === 'pan' ? 'grab' : isPanning ? 'grabbing' : 'default' }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}
        >
          {/* Grille de fond légère */}
          <div 
            className="absolute inset-0 opacity-[0.4]"
            style={{
              backgroundImage: `
                linear-gradient(to right, #cbd5e1 0.5px, transparent 0.5px),
                linear-gradient(to bottom, #cbd5e1 0.5px, transparent 0.5px)
              `,
              backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
              backgroundPosition: `${transform.x % (24 * transform.scale)}px ${transform.y % (24 * transform.scale)}px`
            }}
          />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-slate-50/80 via-white/50 to-blue-50/30" />
          
          {/* Conteneur transformé */}
          <div
            className="absolute"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: '0 0',
              minWidth: '3600px',
              minHeight: '2400px'
            }}
          >
            {/* Rendu des connexions */}
            {renderConnections()}
            
            {/* Rendu des nœuds (organigramme filtré) */}
            {(() => {
              console.log('🎨 Rendu des nœuds - filteredOrganigramme:', {
                nombreNoeuds: filteredOrganigramme.length,
                noeudIds: filteredOrganigramme.map(n => n.id),
                nodePositionsSize: nodePositions.size,
                nodePositionsIds: Array.from(nodePositions.keys()),
                premierNoeud: filteredOrganigramme[0] ? {
                  id: filteredOrganigramme[0].id,
                  aPosition: nodePositions.has(filteredOrganigramme[0].id),
                  position: nodePositions.get(filteredOrganigramme[0].id)
                } : null
              });
              
              // Si aucun nœud ou aucune position, afficher un message de diagnostic
              if (filteredOrganigramme.length === 0) {
                return (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-slate-200">
                      <h3 className="text-lg font-semibold text-slate-800 mb-2">Aucun nœud à afficher</h3>
                      <p className="text-sm text-slate-600">L'organigramme filtré est vide.</p>
                    </div>
                  </div>
                );
              }
              
              // Rendu avec positions calculées
              const nodesWithPositions = filteredOrganigramme.filter(node => nodePositions.has(node.id));
              const nodesWithoutPositions = filteredOrganigramme.filter(node => !nodePositions.has(node.id));
              
              console.log('📊 Nœuds avec/sans positions:', {
                avecPositions: nodesWithPositions.length,
                sansPositions: nodesWithoutPositions.length,
                idsSansPositions: nodesWithoutPositions.map(n => n.id)
              });
              
              // Afficher les nœuds avec positions normalement
              const normalNodes = nodesWithPositions.map(node => renderNode(node));
              
              // Afficher les nœuds sans positions avec des positions par défaut
              const fallbackNodes = nodesWithoutPositions.map(node => {
                const fallbackPos = {
                  id: node.id,
                  x: 100 + (parseInt(node.id.slice(-8), 16) % 500), // Position pseudo-aléatoire basée sur l'ID
                  y: 100 + (parseInt(node.id.slice(-4), 16) % 300),
                  width: 220,
                  height: 80
                };
                
                console.log('🔧 Position par défaut pour:', node.id, fallbackPos);
                
                return (
                  <div key={node.id} className="absolute select-none rounded-2xl bg-white shadow-lg border border-slate-200 p-4"
                    style={{
                      left: fallbackPos.x,
                      top: fallbackPos.y,
                      width: fallbackPos.width,
                      height: fallbackPos.height
                    }}>
                    <div className="text-sm font-semibold text-slate-800">{node.label}</div>
                    <div className="text-xs text-slate-500">{node.type}</div>
                  </div>
                );
              });
              
              return [...normalNodes, ...fallbackNodes];
            })()}
          </div>
          
          {/* Mini-map */}
          {renderMinimap()}
          </div>
        </div>
      </div>

      {/* Drawer des filtres : Direction → Service → Sous-service (cascade) */}
      {showFiltersDrawer && createPortal(
        <div className="fixed inset-0 z-[50000] flex justify-end pointer-events-none">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto"
            onClick={() => setShowFiltersDrawer(false)}
          />
          <div className="relative h-full w-full max-w-sm bg-white shadow-2xl flex flex-col pointer-events-auto animate-slide-in-right border-l border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-br from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-md shadow-blue-500/25">
                  <FontAwesomeIcon icon={faFilter} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg">Filtrer l'organigramme</h3>
              </div>
              <button
                onClick={() => setShowFiltersDrawer(false)}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
                title="Fermer"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto space-y-6">
              <p className="text-sm text-slate-500 leading-relaxed">
                Choisissez un niveau pour affiner l&apos;organigramme. Les libellés et niveaux proviennent des types d&apos;entités actifs (Admin → Types d&apos;entités).
              </p>
              {filterLevels.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                  Aucun type d&apos;entité actif. Activez au moins un type (Direction, Division, etc.) dans Admin → Types d&apos;entités.
                </p>
              ) : null}
              {filterLevels.map((level, i) => {
                const parentId = i === 0 ? null : (filterSelectionIds[i - 1] ?? null);
                const options =
                  i === 0
                    ? entiteOrganisationnelleService.getDirectionsForFilters()
                    : i === 1 && level.code === 'division'
                      ? entiteOrganisationnelleService.getEntitiesByType('division').sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                      : parentId
                        ? entiteOrganisationnelleService
                            .getEntitiesByParent(parentId)
                            .filter((e) => e.type === level.code)
                            .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                        : [];
                const value = (filterSelectionIds[i] ?? '') as string;
                const parentLabel =
                  i === 0 ? '' : filterLevels[i - 1]?.libelleSingulier ?? 'niveau';
                
                // Verrouiller la direction pour les directeurs, directeurs généraux et chefs de division (mais pas pour les SUPER ADMIN)
                // Verrouiller la division pour les chefs de division (CHEF_SERVICE)
                // Permettre la navigation dans les niveaux inférieurs (services, sous-services, etc.)
                const isDirectionLevel = i === 0 && level.code === 'direction';
                const isDivisionLevel = i === 1 && level.code === 'division';
                const isLocked = 
                  (isDirectionLevel && (isDirecteur || isDirecteurGeneral || isChefService) && user.role !== Role.SUPER_ADMIN) ||
                  (isDivisionLevel && isChefService && user.role !== Role.SUPER_ADMIN);
                // Les niveaux inférieurs (i >= 2) ne sont jamais verrouillés pour permettre la navigation
                
                return (
                  <div key={level.code}>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      {level.libelleSingulier}
                      {isLocked && <span className="ml-1 text-blue-600 font-normal">(verrouillé)</span>}
                    </label>
                    <SearchableSelect
                      options={options.map((e) => ({ value: e.id, label: e.nom }))}
                      value={value}
                      onChange={(v) => {
                        if (isLocked) return; // Ne pas permettre la modification si verrouillé
                        const next = filterLevels.map((_, idx) =>
                          idx < i ? (filterSelectionIds[idx] ?? null) : idx === i ? (v || null) : null
                        );
                        setFilterSelectionIds(next);
                      }}
                      disabled={isLocked}
                      emptyOption={
                        i === 0
                          ? `Toutes les ${level.libellePluriel.toLowerCase()}`
                          : parentId
                            ? `Tous les ${level.libellePluriel.toLowerCase()}`
                            : `Sélectionnez d'abord un ${parentLabel.toLowerCase()}`
                      }
                      searchPlaceholder={`Rechercher un ${level.libelleSingulier.toLowerCase()}...`}
                    />
                  </div>
                );
              })}
              <div className="pt-5 border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => {
                    // Préserver les filtres verrouillés selon le rôle de l'utilisateur
                    if (!user || user.role === Role.SUPER_ADMIN) {
                      // SUPER_ADMIN ou utilisateur non connecté : réinitialiser complètement
                      setFilterSelectionIds(filterLevels.map(() => null));
                    } else {
                      const newFilterIds: (string | null)[] = filterLevels.map(() => null);
                      
                      // Directeurs : préserver leur direction
                      if ((isDirecteur || isDirecteurGeneral) && user.direction) {
                        const directions = entiteOrganisationnelleService.getDirectionsForFilters();
                        const userDirection = directions.find(d => d.nom === user.direction);
                        if (userDirection) {
                          newFilterIds[0] = userDirection.id;
                        }
                      }
                      
                      // Chefs de division : préserver leur direction ET leur division
                      // Permettre la navigation dans les entités inférieures
                      if (isChefService && user.direction && user.service) {
                        const directions = entiteOrganisationnelleService.getDirectionsForFilters();
                        const userDirection = directions.find(d => d.nom === user.direction);
                        if (userDirection) {
                          newFilterIds[0] = userDirection.id; // Verrouiller la direction
                          
                          // Chercher et verrouiller la division par nom
                          const divisions = entiteOrganisationnelleService.getEntitiesByType('division');
                          const userDivision = divisions.find(d => d.nom === user.service);
                          if (userDivision) {
                            newFilterIds[1] = userDivision.id; // Verrouiller la division
                            // Les niveaux suivants restent null pour permettre la navigation
                            // dans les services, sous-services, bureaux, etc. sous cette division
                          }
                        }
                      }
                      
                      setFilterSelectionIds(newFilterIds);
                    }
                    setShowFiltersDrawer(false);
                  }}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors"
                >
                  Réinitialiser
                </button>
                <button
                  onClick={() => setShowFiltersDrawer(false)}
                  className="flex-1 px-4 py-3 rounded-xl bg-blue-500 text-white hover:bg-blue-600 text-sm font-semibold shadow-md shadow-blue-500/25 transition-all"
                >
                  Appliquer
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Drawer des propriétés */}
      {showProperties && createPortal(
        <div className="fixed inset-0 z-[50000] flex justify-end pointer-events-none">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto"
            onClick={() => setShowProperties(false)}
          />
          {/* Drawer */}
          <div className="relative h-full w-full max-w-md bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out pointer-events-auto">
            {/* Header */}
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-gradient-to-r from-primary-50 to-white">
              <h3 className="font-semibold text-neutral-800">Propriétés</h3>
              <button
                onClick={() => setShowProperties(false)}
                className="w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 flex items-center justify-center transition-colors"
                title="Fermer"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedNodeData ? (
                <div className="space-y-4">
                  {/* Type */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">Type</label>
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-br ${nodeColors[selectedNodeData.type]?.bg || 'from-gray-500 to-gray-600'}`}>
                      <FontAwesomeIcon 
                        icon={
                          selectedNodeData.type === 'direction' ? faBuilding :
                          selectedNodeData.type === 'service' ? faFolder :
                          selectedNodeData.type === 'utilisateur' ? faUser :
                          faBriefcase
                        } 
                        className="text-white" 
                      />
                      <span className="text-white font-medium capitalize">{selectedNodeData.type}</span>
                    </div>
                  </div>
                  
                  {/* Nom */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">Nom</label>
                    <p className="text-neutral-800 font-medium">{selectedNodeData.label}</p>
                  </div>
                  
                  {/* Niveau */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">Niveau</label>
                    <p className="text-neutral-800">{selectedNodeData.level}</p>
                  </div>
                  
                  {/* Rôle */}
                  {(selectedNodeData.role || selectedNodeData.parentEntityType) && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">Responsabilité</label>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-sm">
                        <FontAwesomeIcon icon={faCrown} className="text-xs" />
                        {getResponsabiliteLabel(selectedNodeData.role, selectedNodeData.parentEntityType)}
                      </span>
                    </div>
                  )}
                  
                  {/* Enfants */}
                  {selectedNodeData.children && selectedNodeData.children.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">Enfants</label>
                      <p className="text-neutral-800">{selectedNodeData.children.length} élément(s)</p>
                    </div>
                  )}
                  
                  {/* Position */}
                  {nodePositions.get(selectedNodeData.id) && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">Position</label>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-neutral-100 rounded px-2 py-1">
                          <span className="text-neutral-500">X:</span> {Math.round(nodePositions.get(selectedNodeData.id)!.x)}
                        </div>
                        <div className="bg-neutral-100 rounded px-2 py-1">
                          <span className="text-neutral-500">Y:</span> {Math.round(nodePositions.get(selectedNodeData.id)!.y)}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Actions */}
                  <div className="pt-4 border-t border-neutral-100 space-y-2">
                    <button
                      onClick={() => addChildNode(selectedNodeData.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                    >
                      <FontAwesomeIcon icon={faPlus} />
                      Ajouter un enfant
                    </button>
                    
                    {selectedNodeData.isCustom && (
                      <button
                        onClick={() => deleteNode(selectedNodeData.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-neutral-400">
                  <FontAwesomeIcon icon={faMousePointer} className="text-4xl mb-3" />
                  <p className="text-sm">Sélectionnez un élément pour voir ses propriétés</p>
                </div>
              )}
            </div>
            
            {/* Légende */}
            <div className="p-4 border-t border-neutral-100">
              <h4 className="text-xs font-medium text-neutral-500 uppercase mb-3">Légende</h4>
              <div className="space-y-2">
                {Object.entries(nodeColors).map(([type, colors]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded bg-gradient-to-br ${colors.bg}`}></div>
                    <span className="text-sm text-neutral-600 capitalize">{type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Fenêtre de paramétrage d'export */}
      {showExportSettings && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]" onClick={() => setShowExportSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Paramètres d'export</h2>
                <p className="text-sm text-gray-500 mt-1">Configurez les options d'export de l'organigramme</p>
              </div>
              <button
                onClick={() => setShowExportSettings(false)}
                className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="text-xl" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Format et orientation */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Format</label>
                  <select
                    value={exportSettings.format}
                    onChange={(e) => setExportSettings({ ...exportSettings, format: e.target.value as any })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="auto">Auto (selon contenu)</option>
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

              {/* Qualité et échelle */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Qualité</label>
                  <select
                    value={exportSettings.quality}
                    onChange={(e) => setExportSettings({ ...exportSettings, quality: e.target.value as any })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="low">Basse (rapide)</option>
                    <option value="medium">Moyenne</option>
                    <option value="high">Haute (lente)</option>
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

              {/* Couleur de fond */}
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
                    placeholder="#f8fafc"
                  />
                </div>
              </div>

              {/* Marges */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Marges (mm)</label>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Haut</label>
                    <input
                      type="number"
                      value={exportSettings.margins.top}
                      onChange={(e) => setExportSettings({
                        ...exportSettings,
                        margins: { ...exportSettings.margins, top: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Droite</label>
                    <input
                      type="number"
                      value={exportSettings.margins.right}
                      onChange={(e) => setExportSettings({
                        ...exportSettings,
                        margins: { ...exportSettings.margins, right: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Bas</label>
                    <input
                      type="number"
                      value={exportSettings.margins.bottom}
                      onChange={(e) => setExportSettings({
                        ...exportSettings,
                        margins: { ...exportSettings.margins, bottom: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Gauche</label>
                    <input
                      type="number"
                      value={exportSettings.margins.left}
                      onChange={(e) => setExportSettings({
                        ...exportSettings,
                        margins: { ...exportSettings.margins, left: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="0"
                    />
                  </div>
                </div>
              </div>

              {/* Options supplémentaires */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Options</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={exportSettings.includeMinimap}
                      onChange={(e) => setExportSettings({ ...exportSettings, includeMinimap: e.target.checked })}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Inclure la mini-carte</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={exportSettings.includeProperties}
                      onChange={(e) => setExportSettings({ ...exportSettings, includeProperties: e.target.checked })}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Inclure le panneau des propriétés</span>
                  </label>
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
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faImage} />
                  Exporter Image
                </button>
                <button
                  onClick={() => exportPDF(exportSettings)}
                  disabled={exporting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faFilePdf} />
                  Exporter PDF
                </button>
                <button
                  onClick={exportExcel}
                  disabled={exporting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faFileExcel} />
                  Exporter Excel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Fenêtre de prévisualisation PDF */}
      {showPDFPreview && pdfPreviewUrl && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[50001]" onClick={() => {
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
                    link.download = `organigramme_${new Date().toISOString().split('T')[0]}.pdf`;
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
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full min-h-[600px] border-0 rounded-lg"
                title="Prévisualisation PDF"
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

      {/* Modale pour afficher les courriers */}
      {showCourriersModal && createPortal(
        <div className="fixed inset-0 z-[50000] flex items-center justify-center pointer-events-none">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto"
            onClick={() => setShowCourriersModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] mx-4 pointer-events-auto flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Courriers {selectedStatType === 'enCours' ? 'En cours' : selectedStatType === 'traite' ? 'Traités' : 'Autres'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {selectedUserForCourriers && `Utilisateur: ${selectedUserForCourriers}`}
                </p>
              </div>
              <button
                onClick={() => setShowCourriersModal(false)}
                className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="text-xl" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {loadingCourriers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-slate-600">Chargement des courriers...</span>
                </div>
              ) : userCourriers.length === 0 ? (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faInbox} className="text-4xl text-slate-300 mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">Aucun courrier trouvé</h3>
                  <p className="text-slate-500">Aucun courrier ne correspond à ce statut pour cet utilisateur.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userCourriers.map((courrier) => (
                    <div key={courrier.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200 hover:border-slate-300 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-900">{courrier.objet?.replace(/<[^>]*>/g, '') || 'Sans objet'}</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            Référence: {courrier.reference || 'N/A'}
                          </p>
                          <p className="text-sm text-slate-500 mt-1">
                            Date: {courrier.date ? new Date(courrier.date).toLocaleDateString('fr-FR') : 'N/A'}
                          </p>
                          {courrier.expediteur && (
                            <p className="text-sm text-slate-500 mt-1">
                              Expéditeur: {courrier.expediteur}
                            </p>
                          )}
                        </div>
                        <div className="ml-4 flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            selectedStatType === 'enCours' ? 'bg-amber-100 text-amber-800' :
                            selectedStatType === 'traite' ? 'bg-green-100 text-green-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {selectedStatType === 'enCours' ? 'En cours' : 
                             selectedStatType === 'traite' ? 'Traité' : 'Autre'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Organigramme;
