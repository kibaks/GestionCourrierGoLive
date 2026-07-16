import { MaterialDateTimeField } from '../components/MaterialDateTimeField';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { courrierService } from '../services/courrierService';
import { realTimeTaskSyncService } from '../services/realTimeTaskSyncService';
import { userService } from '../services/userService';
import { organigrammeService } from '../services/organigrammeService';
import { entiteOrganisationnelleService } from '../services/entiteOrganisationnelleService';
import { entiteTypeService } from '../services/entiteTypeService';
import { laravelApiService } from '../services/laravelApiService';
import { adminService } from '../services/adminService';
import { taskCompletionService } from '../services/taskCompletionService';
import { Courrier, WorkflowEtape, Role, Utilisateur, StatutCourrier, Annotation, SensCourrier, TypeEntiteOrganisationnelle, WorkflowDecision } from '../types';
import SearchableSelect from '../components/SearchableSelect';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faEye,
  faArrowRight,
  faCheckCircle,
  faClock,
  faCompass,
  faTimesCircle, 
  faTrash, 
  faSearch, 
  faEdit, 
  faPlus, 
  faMinus, 
  faFilePdf, 
  faFileImage, 
  faExpand, 
  faCompress,
  faPlay,
  faPause,
  faStop,
  faFlag,
  faUser,
  faEnvelope,
  faCodeBranch,
  faChevronRight,
  faChevronDown,
  faTimes,
  faSave,
  faProjectDiagram,
  faListUl,
  faHome,
  faSearchMinus,
  faSearchPlus,
  faMagic,
  faLayerGroup,
  faQuestion,
  faBolt,
  faCalendarAlt,
  faHourglassHalf,
  faRedo,
  faUndo,
  faExclamationTriangle,
  faSpinner,
  faChartPie,
  faBuilding,
  faUsers,
  faFolder,
  faComment,
  faStickyNote,
  faFileLines,
  faList,
  faInfoCircle,
  faLock,
  faCheck
} from '@fortawesome/free-solid-svg-icons';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const BodyPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

// Types
interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

// Couleurs des statuts
const statusColors = {
  'EN_ATTENTE': { bg: 'from-amber-400 to-amber-500', text: 'text-white', badge: 'bg-amber-100 text-amber-700', icon: faClock },
  'EN_COURS': { bg: 'from-blue-500 to-blue-600', text: 'text-white', badge: 'bg-blue-100 text-blue-700', icon: faPlay },
  'TERMINE': { bg: 'from-emerald-500 to-emerald-600', text: 'text-white', badge: 'bg-emerald-100 text-emerald-700', icon: faCheckCircle },
  'REJETE': { bg: 'from-red-500 to-red-600', text: 'text-white', badge: 'bg-red-100 text-red-700', icon: faTimesCircle }
};

const Workflow: React.FC = () => {
  const { user, hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const courrierId = searchParams.get('courrier');
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  
  // États principaux
  const [courriers, setCourriers] = useState<Courrier[]>([]);
  const [filteredCourriers, setFilteredCourriers] = useState<Courrier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('ALL');
  const [filterEntityId, setFilterEntityId] = useState('ALL');
  const [filterSelectionIds, setFilterSelectionIds] = useState<(string | null)[]>([]);
  const [selectedCourrier, setSelectedCourrier] = useState<Courrier | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowEtape[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<Utilisateur[]>([]);
  
  // États du canvas
  const [transform, setTransform] = useState<CanvasTransform>({ x: 50, y: 50, scale: 1 });
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // États de l'interface
  const [viewMode, setViewMode] = useState<'visual' | 'timeline'>('visual');
  const [selectedEtape, setSelectedEtape] = useState<WorkflowEtape | null>(null);
  const [stepAnnotations, setStepAnnotations] = useState<Annotation[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingEtape, setEditingEtape] = useState<WorkflowEtape | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [hasSyncedData, setHasSyncedData] = useState(false);
  const [listDrawerOpen, setListDrawerOpen] = useState(false);
  const [stepPanelSearch, setStepPanelSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<{ type: 'error' | 'success' | null; text: string }>({ type: null, text: '' });
  
  // Formulaire
  const [newEtape, setNewEtape] = useState({
    etape: '',
    assigneA: '',
    commentaire: '',
    dureeEstimee: '',
      declencheurType: 'IMMEDIAT' as 'IMMEDIAT' | 'APRES_ETAPE' | 'DATE' | 'CONDITION',
    etapePrecedenteId: '',
    dateDeclenchement: '',
    ordre: '',
    estCondition: false,
    condition: '',
    actionSiVrai: '',
    actionSiFaux: '',
    evenementOrigine: ''
  });
  const [createStep, setCreateStep] = useState<1 | 2 | 3 | 4>(1);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // États pour la création inline d'étapes
  const [inlineCreateAfterOrdre, setInlineCreateAfterOrdre] = useState<number | null>(null); // null = fermé, -1 = avant la 1ère étape
  const [inlineCreateData, setInlineCreateData] = useState({
    etape: '',
    assigneA: '',
    commentaire: '',
    dureeEstimee: '',
    declencheurType: 'IMMEDIAT' as 'IMMEDIAT' | 'APRES_ETAPE' | 'DATE' | 'CONDITION',
    etapePrecedenteId: '',
    dateDeclenchement: '',
    estCondition: false,
    condition: '',
    actionSiVrai: '',
    actionSiFaux: '',
  });
  const [inlineSubmitting, setInlineSubmitting] = useState(false);

  // États pour la connexion style n8n (drag depuis port de sortie)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null); // id nœud source
  const [connectingMouse, setConnectingMouse] = useState<{ x: number; y: number } | null>(null);

  // Filtres locaux pour l'assignation (par entité : direction / division / service / bureau / cellule)
  const [assignFilterIds, setAssignFilterIds] = useState<(string | null)[]>([]);

  // Déterminer si l'utilisateur est un directeur pour verrouiller la direction
  const isDirecteur = user?.role === Role.DIRECTEUR;
  const isDirecteurGeneral = user?.role === Role.DIRECTEUR_GENERAL;
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;

  // Fonction utilitaire pour déterminer si un niveau de filtre doit être verrouillé
  const shouldLockFilterLevel = (levelIndex: number, levelCode: string) => {
    if (isSuperAdmin) return false;
    if (isDirecteurGeneral) return false;
    if (isDirecteur) {
      // Le directeur a sa direction verrouillée
      return levelCode === 'direction';
    }
    if (user?.role === Role.CHEF_SERVICE) {
      // Le chef de service/bureau a sa direction et division verrouillées
      return levelCode === 'direction' || levelCode === 'division' || levelCode === 'service';
    }
    return false;
  };

  // Fonction utilitaire pour gérer le changement de filtre avec verrouillage
  const handleFilterChange = (id: string, index: number, isLocked: boolean) => {
    if (isLocked) return; // Ne pas permettre la modification si verrouillé
    setAssignFilterIds((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push(null);
      next[index] = id || null;
      for (let j = index + 1; j < next.length; j++) next[j] = null;
      return next;
    });
  };

  // Initialiser les filtres selon la portée de l'utilisateur
  useEffect(() => {
    if (!user || isSuperAdmin) return;
    
    if ((isDirecteur || isDirecteurGeneral) && user.direction) {
      const directions = entiteOrganisationnelleService.getDirectionsForFilters();
      const userDirection = directions.find(d => d.nom === user.direction);
      if (userDirection) {
        // Pré-remplir le filtre de la liste des courriers
        setFilterSelectionIds(prev => {
          const next = [...prev];
          if (!next[0]) next[0] = userDirection.id;
          return next;
        });
        // Pré-remplir le filtre d'assignation dans le modal
        setAssignFilterIds(prev => {
          const next = [...prev];
          if (!next[0]) next[0] = userDirection.id;
          return next;
        });
      }
    }
  }, [user, isDirecteur, isDirecteurGeneral, isSuperAdmin]);

  // Chargement initial
  useEffect(() => {
    // Autoriser tous les utilisateurs connectés à accéder pour répondre à leurs étapes
    if (!user) {
      navigate('/login');
      return;
    }
    loadCourriers();
  }, [user, navigate]);

  useEffect(() => {
    if (!user) {
      setAssignableUsers([]);
      return;
    }
    
      try {
        const visibleUsers = organigrammeService.getUsersFromOrganigramme(user);
        setAssignableUsers(visibleUsers);
      } catch (error) {
          const fallbackUsers = userService.getVisibleUsers(user.id);
          setAssignableUsers(fallbackUsers);
        }
  }, [user]);

  // Sélectionner le courrier depuis l'URL et charger ses étapes (réessayer quand les courriers sont chargés)
  useEffect(() => {
    if (!courrierId) return;
    const loadAndCheckCourrier = async () => {
      // Chercher d'abord dans le state local, puis dans le store Redux
      let courrier = courriers.find(c => c.id === courrierId);
      if (!courrier) {
        courrier = courrierService.getCourrierById(courrierId);
      }
      if (courrier) {
        // Si le courrier est orienté/en attente/assigné et a déjà des annotations ou des étapes, le passer en traitement
        const statutsOrientation = [StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ORIENTE_DG, StatutCourrier.ORIENTE_DIRECTEUR, StatutCourrier.ASSIGNE];
        if (statutsOrientation.includes(courrier.statut)) {
          try {
            const annotations = await courrierService.getAnnotationsByCourrier(courrier.id);
            let etapes: any[] = [];
            try {
              const etapesData = await (courrierService as any).getWorkflowsByCourrierAsync?.(courrier.id);
              etapes = Array.isArray(etapesData) ? etapesData : courrierService.getWorkflowsByCourrier(courrier.id);
            } catch {
              etapes = courrierService.getWorkflowsByCourrier(courrier.id);
            }
            if (annotations.length > 0 || etapes.length > 0) {
              await courrierService.updateCourrier(courrier.id, { statut: StatutCourrier.EN_TRAITEMENT });
              console.log('✅ Courrier avec annotations/étapes existantes mis en traitement');
              const updatedCourrier = courrierService.getCourrierById(courrier.id);
              const courrierEnTraitement = { ...(updatedCourrier || courrier), statut: StatutCourrier.EN_TRAITEMENT };
              setSelectedCourrier(courrierEnTraitement);
              setCourriers(prev => prev.map(c => c.id === courrierEnTraitement.id ? courrierEnTraitement : c));
            } else {
              setSelectedCourrier(courrier);
            }
          } catch (e) {
            console.error('Erreur lors du changement de statut:', e);
            setSelectedCourrier(courrier);
          }
        } else {
          setSelectedCourrier(courrier);
        }
        loadWorkflows(courrier.id).catch(error => {
          console.error('Erreur lors du chargement des workflows:', error);
        });
      }
    };
    loadAndCheckCourrier();
  }, [courrierId, courriers]);

  /** Niveaux de filtre dynamiques : types d'entités actifs uniquement (recalculés à chaque rendu pour libellés à jour après sync) */
  const filterLevels = entiteTypeService.getActiveTypesForFilters();
  const filterLevelCodes = filterLevels.map(t => t.code).join(',');

  /** Synchroniser direction / service / sousService à partir des sélections par niveau */
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
    // Utiliser le type d'entité et l'ID de l'entité pour le filtrage
    if (direction) {
      setFilterEntityType('direction');
      const dirEntity = entiteOrganisationnelleService.getAllEntities().find(e => e.nom === direction);
      setFilterEntityId(dirEntity?.id || 'ALL');
    } else if (service) {
      setFilterEntityType('service');
      const srvEntity = entiteOrganisationnelleService.getAllEntities().find(e => e.nom === service);
      setFilterEntityId(srvEntity?.id || 'ALL');
    } else if (sousService) {
      setFilterEntityType('sous-service');
      const ssEntity = entiteOrganisationnelleService.getAllEntities().find(e => e.nom === sousService);
      setFilterEntityId(ssEntity?.id || 'ALL');
    } else {
      setFilterEntityType('ALL');
      setFilterEntityId('ALL');
    }
  }, [filterSelectionIds, filterLevelCodes]);

  /**
   * Liste des utilisateurs proposés dans "Assigner à" :
   * - filtrés par les filtres locaux du panneau latéral (assignFilterIds)
   * - filtrés sur les utilisateurs actifs uniquement
   * - ET, selon le type d'entité sélectionnée, restreints aux rôles pertinents
   *   (ex. direction → directeur + secrétaire, division/bureau → chefs, etc.).
   * - POUR LES DIRECTEURS : limités à leur portée (leur direction et sous-entités)
   */
  const filteredAssignableUsers = React.useMemo(() => {
    // Toujours partir des utilisateurs actifs
    let result = assignableUsers.filter(u => u.actif !== false);

    // Si aucun filtre de bureau / entité sélectionné, appliquer les restrictions de rôle
    const lastSelectedId = [...assignFilterIds].reverse().find(id => !!id) || null;
    
    // Pour les directeurs, toujours filtrer selon leur direction même si aucun filtre sélectionné
    if (!lastSelectedId && (isDirecteur || isDirecteurGeneral)) {
      if (user?.direction) {
        const directions = entiteOrganisationnelleService.getDirectionsForFilters();
        const userDirection = directions.find(d => d.nom === user.direction);
        if (userDirection) {
          const allowedEntityIds = new Set(entiteOrganisationnelleService.getDescendantEntityIds(userDirection.id));
          result = result.filter(u => {
            // 1) entiteId directement renseigné
            if (u.entiteId && allowedEntityIds.has(u.entiteId)) return true;
            // 2) Rétrocompatibilité : anciens champs direction / service
            if (!u.entiteId) {
              const rootName = userDirection.nom?.trim().toLowerCase() || '';
              if (u.service?.trim().toLowerCase() === rootName) return true;
              if (u.direction?.trim().toLowerCase() === rootName) return true;
            }
            return false;
          });
          // Pour les directeurs, ne pas filtrer par rôle
        }
      }
    }

    // Si un filtre est sélectionné, filtrer selon cette entité
    if (lastSelectedId) {
      const rootEntity = entiteOrganisationnelleService.getEntityById(lastSelectedId);
      if (!rootEntity) {
        return result;
      }

      // Autoriser tous les agents rattachés à cette entité ou à une de ses descendantes
      const allowedEntityIds = new Set(entiteOrganisationnelleService.getDescendantEntityIds(rootEntity.id));

      result = result.filter(u => {
        // 1) Nouveau monde : entiteId directement renseigné sur l'utilisateur
        if (u.entiteId && allowedEntityIds.has(u.entiteId)) {
          return true;
        }

        // 2) Rétrocompatibilité : anciens champs direction / service si aucun entiteId n'est configuré
        if (!u.entiteId) {
          const userDir = u.direction?.trim();
          const userSvc = u.service?.trim();

          // Direction / service : on regarde si l'utilisateur est dans l'arbre sélectionné
          if (userDir || userSvc) {
            // Si l'utilisateur a une entité par son service/direction dans l'organigramme, elle sera couverte par allowedEntityIds
            // Ici on fait un fallback simple : garder les agents dont direction ou service matche le nom de l'entité racine.
            const rootName = rootEntity.nom?.trim().toLowerCase() || '';
            if (userSvc && userSvc.trim().toLowerCase() === rootName) return true;
            if (userDir && userDir.trim().toLowerCase() === rootName) return true;
          }
        }

        return false;
      });

      // Filtrage supplémentaire par rôle en fonction du type d'entité sélectionnée
      // SAUF pour les directeurs qui doivent voir tout le monde de leur direction
      const entityType = rootEntity.type;

      // Pour les directeurs et SUPER ADMIN, ne pas filtrer par rôle - ils voient tout le monde de leur portée
      if (!isDirecteur && !isDirecteurGeneral && user?.role !== Role.SUPER_ADMIN) {
        const rolesParType: Record<string, Role[]> = {
          // Au niveau direction générale, on cible tous les rôles sauf SUPER_ADMIN (sauf lui-même)
          direction_generale: [Role.DIRECTEUR_GENERAL, Role.SECRETAIRE, Role.DIRECTEUR, Role.CHEF_SERVICE, Role.AGENT],
          // Au niveau direction, on cible TOUS les rôles de la direction (directeur, secrétaire, chefs, agents)
          direction: [Role.DIRECTEUR, Role.SECRETAIRE, Role.CHEF_SERVICE, Role.AGENT],
          // Pour les divisions / services / sous-services / bureaux, on cible les rôles pertinents
          division: [Role.CHEF_SERVICE, Role.AGENT],
          service: [Role.CHEF_SERVICE, Role.AGENT],
          'sous-service': [Role.CHEF_SERVICE, Role.AGENT],
          bureau: [Role.CHEF_SERVICE, Role.AGENT],
        };

        const rolesCibles = rolesParType[entityType as keyof typeof rolesParType];

        if (rolesCibles && rolesCibles.length > 0) {
          result = result.filter(u =>
            rolesCibles.includes(u.role)
          );
        }
      }
    }

    return result;
  }, [assignableUsers, assignFilterIds, user, isDirecteur, isDirecteurGeneral]);

  useEffect(() => {
    let result = courriers;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.numero.toLowerCase().includes(query) ||
        c.objet.toLowerCase().includes(query) ||
        c.expediteur.toLowerCase().includes(query)
      );
    }
    if (filterEntityType !== 'ALL' && filterEntityId !== 'ALL') {
      const entityType = filterEntityType;
      const entityId = filterEntityId;
      result = result.filter(c => {
        if (entityType === 'direction') {
          return c.direction === entityId;
        } else if (entityType === 'service') {
          return c.service === entityId;
        } else if (entityType === 'sous-service') {
          return (c.extraFields as Record<string, string>)?.['sousService'] === entityId;
        }
        return false;
      });
    }
    setFilteredCourriers(result);
  }, [searchQuery, courriers, filterEntityType, filterEntityId]);

  const statsAnnotations = React.useMemo(() => {
    const total = filteredCourriers.length;
    const avecWorkflow = filteredCourriers.filter(c => courrierService.getWorkflowsByCourrier(c.id).length > 0).length;
    const allEtapes = filteredCourriers.flatMap(c => courrierService.getWorkflowsByCourrier(c.id));
    const totalEtapes = allEtapes.length;
    const etapesAccomplies = allEtapes.filter(e => e.statut === 'TERMINE').length;
    const now = Date.now();
    const tachesEnRetard = allEtapes.filter(e => {
      if (e.statut !== 'EN_COURS' || !e.dateDebut || e.dureeEstimee == null) return false;
      const finPrevue = new Date(e.dateDebut).getTime() + e.dureeEstimee * 60 * 60 * 1000;
      return finPrevue < now;
    }).length;
    return { total, avecWorkflow, totalEtapes, etapesAccomplies, tachesEnRetard };
  }, [filteredCourriers]);

  // Calculer les positions des nœuds
  useEffect(() => {
    if (workflows.length > 0) {
      calculateNodePositions();
    }
  }, [workflows]);

  const loadCourriers = async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      // Ne synchroniser les référentiels (types, entités, utilisateurs) qu'une seule fois
      if (!hasSyncedData) {
        await entiteTypeService.syncFromApi();
        if (laravelApiService.isConfigured()) {
          await entiteOrganisationnelleService.refreshFromApi();
          await adminService.refreshUsersFromApi();
        } else {
          entiteOrganisationnelleService.initializeDemoData();
        }
        setHasSyncedData(true);
      }
      const accessibles = await courrierService.getAccessibleCourriers(user.id, user);
      // Filtrage selon rôle :
      // - SUPER_ADMIN / DIRECTEUR_GENERAL : voient tout (hors ARCHIVE)
      // - DIRECTEUR / CHEF_SERVICE : courriers de leur organisation (direction/service)
      // - AGENT : courriers avec au moins une étape assignée à l'agent
      const isSuper = user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL;
      const isOrgManager = user.role === Role.DIRECTEUR || user.role === Role.CHEF_SERVICE;

      let filtered = accessibles.filter(c => c.statut !== 'ARCHIVE');

      if (!isSuper) {
        if (isOrgManager) {
          filtered = filtered.filter(c => {
            if (user.direction && c.direction && c.direction !== user.direction) return false;
            if (user.service && c.service && c.service !== user.service) return false;
            return true;
          });
          // Pour les responsables, garder les courriers qui ont au moins une étape dans leur périmètre (direction/service)
          const checks = await Promise.all(
            filtered.map(async (c) => {
              try {
                const wfs = await (courrierService as any).getWorkflowsByCourrierAsync(c.id);
                return wfs.some((w: WorkflowEtape) => {
                  if (!w.assigneA) return true;
                  const assignee = userService.getUserById(w.assigneA);
                  if (!assignee) return false;
                  if (user.direction && assignee.direction && assignee.direction !== user.direction) return false;
                  if (user.service && assignee.service && assignee.service !== user.service) return false;
                  return true;
                });
              } catch {
                const wfs = courrierService.getWorkflowsByCourrier(c.id);
                console.log('🔄 [Workflow] Chargement workflows pour le courrier', c.id, 'via cache');
                return wfs.some(w => w.assigneA === user.id);
              }
            })
          );
          filtered = filtered.filter((_, idx) => checks[idx]);
        } else {
          // Agent : ne garder que les courriers qui ont au moins une étape assignée à l'agent
          const checks = await Promise.all(
            filtered.map(async (c) => {
              try {
                const wfs = await (courrierService as any).getWorkflowsByCourrierAsync(c.id);
                console.log('🔄 [Workflow] Chargement workflows pour le courrier', c.id);
                return wfs.some((w: WorkflowEtape) => w.assigneA === user.id);
              } catch {
                const wfs = courrierService.getWorkflowsByCourrier(c.id);
                console.log('🔄 [Workflow] Chargement workflows pour le courrier', c.id, 'via cache');
                return wfs.some(w => w.assigneA === user.id);
              }
            })
          );
          filtered = filtered.filter((_, idx) => checks[idx]);
        }
      }

      const uniqueCourriers = Array.from(new Map(filtered.map(c => [c.id, c])).values());
      uniqueCourriers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCourriers(uniqueCourriers);
      setFilteredCourriers(uniqueCourriers);
    } catch (err) {
      console.error('Erreur lors du chargement des courriers accessibles:', err);
      setCourriers([]);
      setFilteredCourriers([]);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchWorkflowsFiltered = async (id: string): Promise<WorkflowEtape[]> => {
    if (!user) return [];
    const isSuper = user.role === Role.SUPER_ADMIN || user.role === Role.DIRECTEUR_GENERAL;
    const isOrgManager = user.role === Role.DIRECTEUR || user.role === Role.CHEF_SERVICE;
    const filterByRole = (workflowsData: WorkflowEtape[]) =>
      workflowsData.filter((w: WorkflowEtape) => {
        if (isSuper) return true;
        if (isOrgManager) {
          if (!w.assigneA) return true;
          const assignee = userService.getUserById(w.assigneA);
          if (!assignee) return true;
          if (user.direction && assignee.direction && assignee.direction !== user.direction) return false;
          if (user.service && assignee.service && assignee.service !== user.service) return false;
          return true;
        }
        return w.assigneA === user.id;
      });
    const sortWorkflows = (list: WorkflowEtape[]) =>
      list.sort((a, b) => {
        if (a.ordre !== undefined && b.ordre !== undefined) return a.ordre - b.ordre;
        if (a.ordre !== undefined) return -1;
        if (b.ordre !== undefined) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    const normalizeFromCourrier = (list: WorkflowEtape[]): WorkflowEtape[] =>
      list.map((w) => ({
        ...w,
        createdAt: w.createdAt ? new Date(w.createdAt as any) : new Date(),
        dateDebut: w.dateDebut ? new Date(w.dateDebut as any) : undefined,
        dateFin: w.dateFin ? new Date(w.dateFin as any) : undefined,
        declencheur: w.declencheur ? {
          ...w.declencheur,
          dateDeclenchement: w.declencheur.dateDeclenchement ? new Date(w.declencheur.dateDeclenchement as any) : undefined
        } : undefined
      }));
    try {
      let workflowsData = await (courrierService as any).getWorkflowsByCourrierAsync(id);
      if (!workflowsData || workflowsData.length === 0) {
        const fromCache = courrierService.getWorkflowsByCourrier(id);
        if (fromCache && fromCache.length > 0) workflowsData = fromCache;
      }
      // Dernier recours : étapes sur l'objet courrier (Redux)
      if (!workflowsData || workflowsData.length === 0) {
        const courrier = courrierService.getCourrierById(id);
        if (courrier?.workflow?.length) workflowsData = normalizeFromCourrier(courrier.workflow);
      }
      const filtered = filterByRole(workflowsData || []);
      return sortWorkflows([...filtered]);
    } catch (error) {
      console.error('Erreur lors du chargement des workflows:', error);
      let fallback = courrierService.getWorkflowsByCourrier(id);
      if (!fallback.length) {
        const courrier = courrierService.getCourrierById(id);
        if (courrier?.workflow?.length) fallback = normalizeFromCourrier(courrier.workflow);
      }
      const filtered = filterByRole(fallback || []);
      return sortWorkflows([...filtered]);
    }
  };

  const loadWorkflows = async (id: string) => {
    const sorted = await fetchWorkflowsFiltered(id);
    setWorkflows(sorted);
    if (sorted.length === 0) setSelectedEtape(null);
  };

  // Réinitialiser la recherche du panneau quand on change d'étape
  useEffect(() => {
    setStepPanelSearch('');
  }, [selectedEtape?.id]);

  // Charger les annotations rattachées à l'étape sélectionnée (considérées comme contenu de l'étape)
  useEffect(() => {
    if (!selectedCourrier || !selectedEtape) {
      setStepAnnotations([]);
      return;
    }
    courrierService.getAnnotationsByCourrier(selectedCourrier.id).then((all) => {
      const forStep = all.filter((a) => a.workflowEtapeId === selectedEtape.id);
      setStepAnnotations(forStep.sort((a, b) => new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime()));
    }).catch(() => setStepAnnotations([]));
  }, [selectedCourrier?.id, selectedEtape?.id]);

  const calculateNodePositions = () => {
    const positions = new Map<string, NodePosition>();
    const NODE_WIDTH = 280;
    const NODE_HEIGHT = 120;
    const CONDITION_WIDTH = 200;
    const CONDITION_HEIGHT = 140;
    const H_GAP = 100;
    const V_GAP = 180;
    
    // Séparer les actions et conditions
    const actions = workflows.filter(w => !w.estCondition);
    const conditions = workflows.filter(w => w.estCondition);
    
    let x = 80;
    let y = 150;
    
    // D'abord placer les actions non liées à des conditions
    actions.forEach((etape) => {
      const linkedCondition = conditions.find(c => 
        c.actionSiVrai === etape.id || c.actionSiFaux === etape.id
      );
      
      if (!linkedCondition) {
        positions.set(etape.id, { id: etape.id, x, y, width: NODE_WIDTH, height: NODE_HEIGHT });
        x += NODE_WIDTH + H_GAP;
      }
    });
    
    // Placer les conditions et leurs actions liées
    conditions.forEach((condition) => {
      const condX = x;
      const condY = y;
      
      // Position de la condition (losange)
      positions.set(condition.id, { 
        id: condition.id, 
        x: condX, 
        y: condY, 
        width: CONDITION_WIDTH, 
        height: CONDITION_HEIGHT 
      });
      
      // Action si vrai (en bas, centré sous le losange)
      if (condition.actionSiVrai) {
        const actionVrai = workflows.find(w => w.id === condition.actionSiVrai);
        if (actionVrai) {
          positions.set(actionVrai.id, { 
            id: actionVrai.id, 
            x: condX - 40, // Centré sous le losange
            y: condY + CONDITION_HEIGHT + V_GAP - 50, 
            width: NODE_WIDTH, 
            height: NODE_HEIGHT 
          });
        }
      }
      
      // Action si faux (à droite)
      if (condition.actionSiFaux) {
        const actionFaux = workflows.find(w => w.id === condition.actionSiFaux);
        if (actionFaux) {
          positions.set(actionFaux.id, { 
            id: actionFaux.id, 
            x: condX + CONDITION_WIDTH + H_GAP, 
            y: condY + (CONDITION_HEIGHT - NODE_HEIGHT) / 2, // Aligné verticalement
            width: NODE_WIDTH, 
            height: NODE_HEIGHT 
          });
        }
      }
      
      x += CONDITION_WIDTH + NODE_WIDTH + H_GAP * 2;
    });
    
    setNodePositions(positions);
  };

  // Gestion du drag des nœuds
  // Démarrer une connexion depuis le port de sortie d'un nœud
  const handlePortMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setConnectingFrom(nodeId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setConnectingMouse({
        x: (e.clientX - rect.left - transform.x) / transform.scale,
        y: (e.clientY - rect.top - transform.y) / transform.scale,
      });
    }
  };

  // Terminer une connexion sur un nœud cible
  const handleNodeMouseUp = async (e: React.MouseEvent, targetId: string) => {
    if (!connectingFrom || connectingFrom === targetId) {
      setConnectingFrom(null);
      setConnectingMouse(null);
      return;
    }
    e.stopPropagation();
    const sourceEtape = workflows.find(w => w.id === connectingFrom);
    const targetEtape = workflows.find(w => w.id === targetId);
    if (!sourceEtape || !targetEtape) {
      setConnectingFrom(null);
      setConnectingMouse(null);
      return;
    }
    // Mettre à jour le déclencheur de l'étape cible : APRES_ETAPE = source
    try {
      await courrierService.updateWorkflowEtapeAsync(targetId, {
        declencheur: { type: 'APRES_ETAPE', etapePrecedenteId: connectingFrom }
      });
      setWorkflows(prev => prev.map(w =>
        w.id === targetId
          ? { ...w, declencheur: { type: 'APRES_ETAPE', etapePrecedenteId: connectingFrom } }
          : w
      ));
      setErrorMessage({ type: 'success', text: `Connexion créée : "${sourceEtape.etape}" → "${targetEtape.etape}"` });
      setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000);
    } catch {
      setErrorMessage({ type: 'error', text: 'Impossible de créer la connexion' });
      setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000);
    }
    setConnectingFrom(null);
    setConnectingMouse(null);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const pos = nodePositions.get(nodeId);
    if (!pos) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = (e.clientX - rect.left - transform.x) / transform.scale;
    const mouseY = (e.clientY - rect.top - transform.y) / transform.scale;
    
    setDraggingNode(nodeId);
    setDragOffset({ x: mouseX - pos.x, y: mouseY - pos.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    if (connectingFrom) {
      setConnectingMouse({
        x: (e.clientX - rect.left - transform.x) / transform.scale,
        y: (e.clientY - rect.top - transform.y) / transform.scale,
      });
    }

    if (draggingNode) {
      const mouseX = (e.clientX - rect.left - transform.x) / transform.scale;
      const mouseY = (e.clientY - rect.top - transform.y) / transform.scale;
      
      const newPositions = new Map(nodePositions);
      const pos = newPositions.get(draggingNode);
      if (pos) {
        newPositions.set(draggingNode, { ...pos, x: mouseX - dragOffset.x, y: mouseY - dragOffset.y });
        setNodePositions(newPositions);
      }
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingNode(null);
    setIsPanning(false);
    if (connectingFrom) {
      setConnectingFrom(null);
      setConnectingMouse(null);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedEtape(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Scroll horizontal par défaut, zoom seulement avec Ctrl
    // Ne plus appeler preventDefault ici (listener passif côté navigateur) pour éviter le warning.
    if (!canvasRef.current) return;

    // Zoom si Ctrl enfoncé
    if (e.ctrlKey) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - transform.x) / transform.scale;
      const worldY = (mouseY - transform.y) / transform.scale;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.min(Math.max(transform.scale * factor, 0.3), 2);
      const newX = mouseX - worldX * newScale;
      const newY = mouseY - worldY * newScale;
      setTransform(prev => ({ ...prev, scale: newScale, x: newX, y: newY }));
      return;
    }

    // Pan horizontal : deltaX prioritaire, sinon deltaY converti en déplacement X
    const deltaX = Math.abs(e.deltaX) > 0 ? e.deltaX : e.deltaY;
    setTransform(prev => ({ ...prev, x: prev.x - deltaX }));
  };

  const zoomIn = () => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 2) }));
  const zoomOut = () => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.3) }));
  const resetZoom = () => {
    calculateNodePositions();
    setTransform({ x: 50, y: 50, scale: 1 });
  };

  // Plein écran
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      if (containerRef.current) {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  const handleCreateWorkflow = async () => {
    setCreateSubmitting(true);
    try {
      setErrorMessage({ type: null, text: '' });

      // Validation de base
      if (!selectedCourrier) {
        setErrorMessage({ 
          type: 'error', 
          text: 'Aucun courrier sélectionné.\n\nVeuillez sélectionner un courrier avant de créer une étape.' 
        });
        setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
        return;
      }

      if (!user) {
        setErrorMessage({ 
          type: 'error', 
          text: 'Utilisateur non connecté.\n\nVeuillez vous reconnecter.' 
        });
        setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
        return;
      }

      // Validation pour les conditions
      if (newEtape.estCondition) {
        if (!newEtape.condition || !newEtape.condition.trim()) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Texte de condition manquant.\n\nVeuillez saisir le texte de la condition.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (!newEtape.actionSiVrai) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Action "Si OUI" manquante.\n\nVeuillez sélectionner une action à exécuter si la condition est vraie.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (!newEtape.actionSiFaux) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Action "Si NON" manquante.\n\nVeuillez sélectionner une action à exécuter si la condition est fausse.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        // Vérifier que les actions référencées existent
        const actionVraiExists = workflows.find(w => w.id === newEtape.actionSiVrai);
        const actionFauxExists = workflows.find(w => w.id === newEtape.actionSiFaux);
        if (!actionVraiExists) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Action "Si OUI" invalide.\n\nL\'action sélectionnée n\'existe pas.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (!actionFauxExists) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Action "Si NON" invalide.\n\nL\'action sélectionnée n\'existe pas.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
      } else {
        // Validation pour les actions
        if (!newEtape.etape || !newEtape.etape.trim()) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Nom de l\'étape manquant.\n\nVeuillez saisir un nom pour l\'étape.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (!newEtape.assigneA) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Utilisateur non assigné.\n\nVeuillez sélectionner un utilisateur à assigner à cette étape.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        // Vérifier que l'utilisateur existe
        const assignedUser = userService.getUserById(newEtape.assigneA);
        if (!assignedUser) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Utilisateur invalide.\n\nL\'utilisateur sélectionné n\'existe pas.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
      }

      // Validation et construction du déclencheur
      let declencheur;
      if (newEtape.declencheurType !== 'IMMEDIAT') {
        if (newEtape.declencheurType === 'APRES_ETAPE') {
          if (!newEtape.etapePrecedenteId) {
            setErrorMessage({ 
              type: 'error', 
              text: 'Étape précédente manquante.\n\nVeuillez sélectionner l\'étape précédente pour le déclenchement.' 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
            return;
          }
          // Vérifier que l'étape précédente existe
          const etapePrecedente = workflows.find(w => w.id === newEtape.etapePrecedenteId);
          if (!etapePrecedente) {
            setErrorMessage({ 
              type: 'error', 
              text: 'Étape précédente invalide.\n\nL\'étape sélectionnée n\'existe pas.' 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
            return;
          }
          declencheur = {
            type: newEtape.declencheurType,
            etapePrecedenteId: newEtape.etapePrecedenteId
          };
        } else if (newEtape.declencheurType === 'DATE') {
          if (!newEtape.dateDeclenchement) {
            setErrorMessage({ 
              type: 'error', 
              text: 'Date de déclenchement manquante.\n\nVeuillez sélectionner une date et une heure de déclenchement.' 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
            return;
          }
          const dateDeclenchement = new Date(newEtape.dateDeclenchement);
          if (isNaN(dateDeclenchement.getTime())) {
            setErrorMessage({ 
              type: 'error', 
              text: 'Date de déclenchement invalide.\n\nVeuillez saisir une date valide.' 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
            return;
          }
          declencheur = {
            type: newEtape.declencheurType,
            dateDeclenchement
          };
        }
      }

      // Validation de l'ordre
      let ordre: number;
      if (newEtape.ordre && newEtape.ordre.trim()) {
        const parsedOrdre = parseInt(newEtape.ordre, 10);
        if (isNaN(parsedOrdre) || parsedOrdre < 1) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Ordre invalide.\n\nL\'ordre doit être un nombre entier positif.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        ordre = parsedOrdre;
      } else {
        ordre = workflows.length + 1;
      }

      // Validation de la durée estimée
      let dureeEstimee: number | undefined;
      if (newEtape.dureeEstimee && newEtape.dureeEstimee.trim()) {
        const parsedDuree = parseFloat(newEtape.dureeEstimee);
        if (isNaN(parsedDuree)) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Durée estimée invalide.\n\nLa durée doit être un nombre valide.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (parsedDuree < 0) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Durée estimée invalide.\n\nLa durée ne peut pas être négative.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        dureeEstimee = parsedDuree;
      }

      // Création de l'étape dans Firestore
      let createdWorkflow: WorkflowEtape;
      if (newEtape.estCondition) {
        const declencheurCondition = newEtape.etapePrecedenteId
          ? { type: 'APRES_ETAPE' as const, etapePrecedenteId: newEtape.etapePrecedenteId }
          : undefined;
        createdWorkflow = await (courrierService as any).createWorkflowEtapeAsync({
          courrierId: selectedCourrier.id,
          etape: newEtape.condition.trim(),
          statut: 'EN_ATTENTE',
          commentaire: newEtape.commentaire?.trim() || undefined,
          creePar: user.id,
          estCondition: true,
          actionSiVrai: newEtape.actionSiVrai,
          actionSiFaux: newEtape.actionSiFaux,
          declencheur: declencheurCondition,
          ordre
        });
        console.log('✅ Condition créée dans Firestore:', createdWorkflow);
      } else {
        createdWorkflow = await (courrierService as any).createWorkflowEtapeAsync({
          courrierId: selectedCourrier.id,
          etape: newEtape.etape.trim(),
          assigneA: newEtape.assigneA,
          statut: 'EN_ATTENTE',
          commentaire: newEtape.commentaire?.trim() || undefined,
          creePar: user.id,
          dureeEstimee,
          declencheur,
          ordre
        });
        console.log('✅ Étape créée dans Firestore:', createdWorkflow);
      }

      // ── Mise à jour OPTIMISTE : afficher immédiatement l'étape créée ─────────
      const refreshed = [...workflows, createdWorkflow].sort((a, b) => {
        if (a.ordre !== undefined && b.ordre !== undefined) return a.ordre - b.ordre;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      setWorkflows(refreshed);
      setSelectedEtape(createdWorkflow);

    // NOTIFIER les autres composants (DetailCourrier, etc.) de la création d'étape
      if (user && selectedCourrier) {
        console.log('📢 [Workflow] Envoi notification création étape:', {
          courrierId: selectedCourrier.id,
          etape: newEtape.estCondition ? newEtape.condition : newEtape.etape
        });
        realTimeTaskSyncService.notifyWorkflowCreated(
          selectedCourrier.id,
          selectedCourrier.numero,
          user.id,
          user.role,
          newEtape.estCondition ? newEtape.condition : newEtape.etape
        );
      } else {
        console.warn('⚠️ [Workflow] Impossible de notifier: user ou selectedCourrier manquant', { user: !!user, selectedCourrier: !!selectedCourrier });
      }

      // ── Mises à jour en arrière-plan (non bloquantes) ────────────────────────
      // Si le courrier est orienté ou en attente DG, le passer en traitement (optimiste)
      if (selectedCourrier && (selectedCourrier.statut === StatutCourrier.EN_ATTENTE_DG || selectedCourrier.statut === StatutCourrier.ORIENTE_DG || selectedCourrier.statut === StatutCourrier.ORIENTE_DIRECTEUR || selectedCourrier.statut === StatutCourrier.ASSIGNE)) {
        const courrierEnTraitement = { ...selectedCourrier, statut: StatutCourrier.EN_TRAITEMENT };
        setSelectedCourrier(courrierEnTraitement);
        setCourriers(prev => prev.map(c => c.id === courrierEnTraitement.id ? courrierEnTraitement : c));
        courrierService.updateCourrier(selectedCourrier.id, { statut: StatutCourrier.EN_TRAITEMENT })
          .then(() => console.log('✅ Courrier mis en traitement'))
          .catch(e => console.error('Erreur changement statut:', e));
      }

      // Si le DG a une assignation active, la terminer automatiquement (arrière-plan)
      if (user.role === Role.DIRECTEUR_GENERAL && selectedCourrier) {
        courrierService.getAssignationsByCourrier(selectedCourrier.id).then(assignations => {
          const dgAssignation = assignations.find(
            a => String(a.assigneA) === String(user.id) && a.statut !== 'TERMINE'
          );
          if (dgAssignation) {
            courrierService.updateAssignation(dgAssignation.id, { statut: 'TERMINE' })
              .then(() => console.log('✅ Assignation DG terminée'))
              .catch(e => console.error('Erreur terminaison assignation:', e));
          }
        }).catch(() => {});
      }

      // Afficher le message de succès
      setErrorMessage({ 
        type: 'success', 
        text: `✅ Étape ${newEtape.estCondition ? 'de condition' : ''} créée avec succès !\n\nL'étape a été ajoutée au workflow.` 
      });

      // Vérifier la complétion de la tâche pour les rôles de management (DG, Directeur, Chef)
      // Ces rôles terminent leur tâche quand ils créent une annotation ou une étape liée à l'orientation
      const isManagement = taskCompletionService.isManagementRole(user.role);
      if (isManagement && !newEtape.estCondition) {
        // Créer une annotation MINUTE pour tracer l'action de création d'étape
        try {
          const assignedUser = userService.getUserById(newEtape.assigneA);
          await courrierService.createAnnotation({
            courrierId: selectedCourrier.id,
            auteur: user.id,
            contenu: `Étape "${newEtape.etape}" créée et assignée à ${assignedUser?.nom || 'un utilisateur'}`,
            type: 'MINUTE',
            workflowEtapeId: createdWorkflow.id
          });
          console.log('✅ Annotation MINUTE créée pour la création d\'étape');
        } catch (annErr) {
          console.warn('Création annotation MINUTE (création étape):', annErr);
        }

        // MARQUER AUTOMATIQUEMENT L'ASSIGNATION DE L'UTILISATEUR ASSIGNÉ COMME TERMINÉE
        // Quand un Directeur/DG crée une étape, l'assignation du destinataire doit être marquée comme terminée
        try {
          if (newEtape.assigneA) {
            const assignations = await courrierService.getAssignationsByCourrier(selectedCourrier.id);
            const pendingAssignationsForAssignedUser = assignations.filter(
              a => a.assigneA === newEtape.assigneA && a.statut === 'EN_ATTENTE'
            );
            
            if (pendingAssignationsForAssignedUser.length > 0) {
              console.log(`📝 [Workflow] ${pendingAssignationsForAssignedUser.length} assignation(s) en attente trouvée(s) pour l'utilisateur assigné ${newEtape.assigneA}`);
              
              for (const assignation of pendingAssignationsForAssignedUser) {
                await (courrierService as any).updateAssignation(assignation.id, { statut: 'TERMINE' });
                console.log(`✅ [Workflow] Assignation ${assignation.id} marquée comme TERMINÉE`);
              }
            }
          }
        } catch (assignErr) {
          console.warn('Erreur lors de la mise à jour des assignations:', assignErr);
        }

        const completionCheck = taskCompletionService.checkTaskCompletion(user, {
          createdSteps: [createdWorkflow],
          isOrientationRelated: taskCompletionService.isOrientationRelated('CreateStep', newEtape.etape)
        });
        if (completionCheck.isComplete) {
          // Notifier la complétion de la tâche en temps réel
          realTimeTaskSyncService.notifyTaskCompleted(
            selectedCourrier!.id,
            selectedCourrier!.numero,
            user.id,
            user.role,
            `Création d'étape: ${newEtape.etape}`,
            completionCheck.reason
          );
          setTimeout(() => {
            setErrorMessage({ 
              type: 'success', 
              text: `✅ Étape créée et tâche terminée !\n\n${completionCheck.reason}` 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 4000);
          }, 2500);
        }
      }

      // Réinitialiser le formulaire mais garder le message visible
      setNewEtape({ 
        etape: '', assigneA: '', commentaire: '', dureeEstimee: '',
        declencheurType: 'IMMEDIAT', etapePrecedenteId: '', dateDeclenchement: '',
        ordre: '', estCondition: false, condition: '', actionSiVrai: '', actionSiFaux: '', evenementOrigine: ''
      });

      // Fermer le formulaire après 2 secondes pour que l'utilisateur voie le message
      setTimeout(() => {
        setShowCreateForm(false);
        setErrorMessage({ type: null, text: '' });
      }, 2000);
    } catch (error: any) {
      console.error('❌ Erreur lors de la création de l\'étape:', error);
      const errorText = error?.message || 'Une erreur inattendue est survenue lors de la création de l\'étape.';
      setErrorMessage({ 
        type: 'error', 
        text: `Erreur lors de la création:\n\n${errorText}\n\nVérifiez la console pour plus de détails.` 
      });
      setTimeout(() => setErrorMessage({ type: null, text: '' }), 7000);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleNextCreateStep = () => {
    setErrorMessage({ type: null, text: '' });
    setCreateStep((prev) => (prev < 4 ? ((prev + 1) as 1 | 2 | 3 | 4) : prev));
  };

  const handlePrevCreateStep = () => {
    setErrorMessage({ type: null, text: '' });
    setCreateStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev));
  };

  const resetForm = () => {
    setNewEtape({ 
      etape: '', assigneA: '', commentaire: '', dureeEstimee: '',
      declencheurType: 'IMMEDIAT', etapePrecedenteId: '', dateDeclenchement: '',
      ordre: '', estCondition: false, condition: '', actionSiVrai: '', actionSiFaux: '', evenementOrigine: ''
    });
    setCreateStep(1);
    setShowCreateForm(false);
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateForm(true);
  };

  const openEditDialog = (etape: WorkflowEtape) => {
    handleEditWorkflow(etape);
  };

  // ── Création inline d'étapes ──────────────────────────────────────────
  const canCreateStep = user && (user.role === Role.DIRECTEUR_GENERAL || user.role === Role.DIRECTEUR || user.role === Role.CHEF_SERVICE);

  const startInlineCreate = (afterOrdre: number) => {
    if (!canCreateStep || !selectedCourrier) return;
    setInlineCreateAfterOrdre(afterOrdre);
    setInlineCreateData({
      etape: '', assigneA: '', commentaire: '', dureeEstimee: '',
      declencheurType: afterOrdre >= 0 ? 'APRES_ETAPE' : 'IMMEDIAT',
      etapePrecedenteId: afterOrdre >= 0 ? (workflows.find(w => w.ordre === afterOrdre)?.id || '') : '',
      dateDeclenchement: '',
      estCondition: false, condition: '', actionSiVrai: '', actionSiFaux: '',
    });
  };

  const cancelInlineCreate = () => {
    setInlineCreateAfterOrdre(null);
    setInlineCreateData({
      etape: '', assigneA: '', commentaire: '', dureeEstimee: '',
      declencheurType: 'IMMEDIAT', etapePrecedenteId: '', dateDeclenchement: '',
      estCondition: false, condition: '', actionSiVrai: '', actionSiFaux: '',
    });
  };

  const commitInlineCreate = async () => {
    if (!selectedCourrier || !user) return;
    setInlineSubmitting(true);
    try {
      const d = inlineCreateData;
      // Validation
      if (d.estCondition) {
        if (!d.condition.trim()) { setErrorMessage({ type: 'error', text: 'Texte de condition manquant.' }); setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000); setInlineSubmitting(false); return; }
        if (!d.actionSiVrai) { setErrorMessage({ type: 'error', text: 'Action "Si OUI" manquante.' }); setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000); setInlineSubmitting(false); return; }
        if (!d.actionSiFaux) { setErrorMessage({ type: 'error', text: 'Action "Si NON" manquante.' }); setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000); setInlineSubmitting(false); return; }
      } else {
        if (!d.etape.trim()) { setErrorMessage({ type: 'error', text: 'Nom de l\'étape manquant.' }); setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000); setInlineSubmitting(false); return; }
        if (!d.assigneA) { setErrorMessage({ type: 'error', text: 'Utilisateur non assigné.' }); setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000); setInlineSubmitting(false); return; }
      }

      // Calculer l'ordre d'insertion
      let ordre: number;
      if (inlineCreateAfterOrdre == null || inlineCreateAfterOrdre === -1) {
        ordre = 1;
      } else {
        ordre = inlineCreateAfterOrdre + 1;
      }
      // Décaler les étapes existantes
      const shifted = workflows.map(w => w.ordre !== undefined && w.ordre >= ordre ? { ...w, ordre: w.ordre + 1 } : w);

      // Construire le déclencheur
      let declencheur;
      if (d.declencheurType === 'APRES_ETAPE' && d.etapePrecedenteId) {
        declencheur = { type: 'APRES_ETAPE' as const, etapePrecedenteId: d.etapePrecedenteId };
      } else if (d.declencheurType === 'DATE' && d.dateDeclenchement) {
        declencheur = { type: 'DATE' as const, dateDeclenchement: new Date(d.dateDeclenchement) };
      }

      const dureeEstimee = d.dureeEstimee ? parseFloat(d.dureeEstimee) : undefined;

      let createdWorkflow: WorkflowEtape;
      if (d.estCondition) {
        const declencheurCondition = d.etapePrecedenteId
          ? { type: 'APRES_ETAPE' as const, etapePrecedenteId: d.etapePrecedenteId }
          : undefined;
        createdWorkflow = await (courrierService as any).createWorkflowEtapeAsync({
          courrierId: selectedCourrier.id,
          etape: d.condition.trim(),
          statut: 'EN_ATTENTE',
          commentaire: d.commentaire?.trim() || undefined,
          creePar: user.id,
          estCondition: true,
          actionSiVrai: d.actionSiVrai,
          actionSiFaux: d.actionSiFaux,
          declencheur: declencheurCondition,
          ordre
        });
      } else {
        createdWorkflow = await (courrierService as any).createWorkflowEtapeAsync({
          courrierId: selectedCourrier.id,
          etape: d.etape.trim(),
          assigneA: d.assigneA,
          statut: 'EN_ATTENTE',
          commentaire: d.commentaire?.trim() || undefined,
          creePar: user.id,
          dureeEstimee,
          declencheur,
          ordre
        });
      }

      // ── Mises à jour OPTIMISTES : l'UI réagit instantanément ─────────────────

      // Mettre à jour l'ordre des étapes existantes localement immédiatement
      const updatedWorkflows = [...shifted, createdWorkflow].sort((a, b) => {
        if (a.ordre !== undefined && b.ordre !== undefined) return a.ordre - b.ordre;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      setWorkflows(updatedWorkflows);
      setSelectedEtape(createdWorkflow);

      // Mettre à jour l'ordre des étapes existantes sur le serveur (en arrière-plan)
      shifted.forEach(w => {
        if (w.ordre !== undefined && w.ordre >= ordre) {
          (courrierService as any).updateWorkflowEtapeAsync(w.id, { ordre: w.ordre }).catch(() => {});
        }
      });

      // Notifier immédiatement
      realTimeTaskSyncService.notifyWorkflowCreated(
        selectedCourrier.id, selectedCourrier.numero, user.id, user.role,
        d.estCondition ? d.condition : d.etape
      );

      // Si le courrier est orienté ou en attente DG, le passer en traitement (optimiste)
      if (selectedCourrier.statut === StatutCourrier.EN_ATTENTE_DG || selectedCourrier.statut === StatutCourrier.ORIENTE_DG || selectedCourrier.statut === StatutCourrier.ORIENTE_DIRECTEUR || selectedCourrier.statut === StatutCourrier.ASSIGNE) {
        const courrierEnTraitement = { ...selectedCourrier, statut: StatutCourrier.EN_TRAITEMENT };
        setSelectedCourrier(courrierEnTraitement);
        setCourriers(courriers.map(c => c.id === courrierEnTraitement.id ? courrierEnTraitement : c));
        courrierService.updateCourrier(selectedCourrier.id, { statut: StatutCourrier.EN_TRAITEMENT })
          .catch(e => console.error('Erreur lors du changement de statut:', e));
      }

      // Confirmer immédiatement et fermer le formulaire
      setErrorMessage({ type: 'success', text: `✅ Étape ${d.estCondition ? 'conditionnelle' : ''} créée !` });
      setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000);
      cancelInlineCreate();

      // Recharger les workflows en arrière-plan pour synchroniser (non bloquant)
      fetchWorkflowsFiltered(selectedCourrier.id).catch(() => {});
    } catch (error: any) {
      setErrorMessage({ type: 'error', text: `Erreur : ${error?.message || 'Création échouée'}` });
      setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
    } finally {
      setInlineSubmitting(false);
    }
  };

  const handleUpdateWorkflow = async (id: string, statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'REJETE') => {
    try {
      const workflow = await (courrierService as any).updateWorkflowEtapeAsync(id, {
        statut,
        dateDebut: statut === 'EN_COURS' ? new Date() : undefined,
        dateFin: statut === 'TERMINE' ? new Date() : undefined
      });
      if (workflow && selectedCourrier) {
        const updatedWorkflows = workflows.map((w: WorkflowEtape) => w.id === id ? workflow : w);
        setWorkflows(updatedWorkflows);
        setSelectedEtape(workflow);
        
        // Mettre à jour le statut du courrier selon l'action
        if (statut === 'EN_COURS') {
          await courrierService.updateCourrier(selectedCourrier.id, { statut: StatutCourrier.EN_TRAITEMENT }).catch(() => {});
          const updatedCourrier = courrierService.getCourrierById(selectedCourrier.id);
          if (updatedCourrier) {
            setSelectedCourrier(updatedCourrier);
            setCourriers(courriers.map(c => c.id === updatedCourrier.id ? updatedCourrier : c));
          }
        }
        
        // Vérifier la complétion de la tâche selon le rôle de l'utilisateur
        if (user) {
          // Récupérer les étapes assignées à l'utilisateur courant
          const assignedSteps = updatedWorkflows.filter((w: WorkflowEtape) => w.assigneA === user.id);
          
          const completionCheck = taskCompletionService.checkTaskCompletion(user, {
            assignedSteps,
            // Pour les rôles de management, considérer que c'est lié à l'orientation
            isOrientationRelated: taskCompletionService.isManagementRole(user.role)
          });
          
          if (completionCheck.isComplete) {
            setErrorMessage({ 
              type: 'success', 
              text: `✅ ${completionCheck.reason}\n\nToutes vos étapes assignées sont terminées.` 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          }
        }
        
        // Lorsque toutes les étapes (actions) sont terminées, le courrier est rangé dans la liste des courriers à archiver
        const etapesAction = updatedWorkflows.filter((w: WorkflowEtape) => !w.estCondition);
        const toutesEtapesTerminees = etapesAction.length > 0 && etapesAction.every((w: WorkflowEtape) => w.statut === 'TERMINE');
        if (toutesEtapesTerminees) {
          await courrierService.updateCourrier(selectedCourrier.id, { 
            statut: StatutCourrier.TRAITE 
          });
          const updatedCourrier = courrierService.getCourrierById(selectedCourrier.id);
          if (updatedCourrier) {
            setSelectedCourrier(updatedCourrier);
            setCourriers(courriers.map(c => c.id === updatedCourrier.id ? updatedCourrier : c));
          }
          setErrorMessage({ 
            type: 'success', 
            text: 'Toutes les étapes sont terminées. Le courrier est rangé dans la liste des courriers à archiver (Archives > À archiver).' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 6000);
        }
      }
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour du workflow:', error);
      setErrorMessage({ 
        type: 'error', 
        text: `Erreur lors de la mise à jour:\n\n${error?.message || 'Erreur inconnue'}` 
      });
      setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
    }
  };

  const handleDeleteWorkflow = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (confirm('Êtes-vous sûr de vouloir supprimer cette étape ?')) {
      try {
        await (courrierService as any).deleteWorkflowEtapeAsync(id);
        await loadWorkflows(selectedCourrier!.id);
        setSelectedEtape(null);
        setErrorMessage({ 
          type: 'success', 
          text: '✅ Étape supprimée avec succès de Firestore !' 
        });
        setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000);
      } catch (error: any) {
        console.error('Erreur lors de la suppression:', error);
        setErrorMessage({ 
          type: 'error', 
          text: `Erreur lors de la suppression:\n\n${error?.message || 'Erreur inconnue'}` 
        });
        setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
      }
    }
  };

  const handleEditWorkflow = (etape: WorkflowEtape, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setEditingEtape(etape);
    setNewEtape({
      etape: etape.etape || '',
      assigneA: etape.assigneA || '',
      commentaire: etape.commentaire || '',
      dureeEstimee: etape.dureeEstimee?.toString() || '',
      declencheurType: (etape.declencheur?.type === 'CONDITION' ? 'IMMEDIAT' : etape.declencheur?.type) || 'IMMEDIAT',
      etapePrecedenteId: etape.declencheur?.etapePrecedenteId || '',
      dateDeclenchement: etape.declencheur?.dateDeclenchement ? new Date(etape.declencheur.dateDeclenchement).toISOString().slice(0, 16) : '',
      ordre: etape.ordre?.toString() || '',
      estCondition: etape.estCondition || false,
      condition: etape.estCondition ? etape.etape : '',
      actionSiVrai: etape.actionSiVrai || '',
      actionSiFaux: etape.actionSiFaux || '',
      evenementOrigine: ''
    });
    setShowEditForm(true);
    editDialogRef.current?.showModal();
  };

  const handleSaveEdit = async () => {
    setEditSubmitting(true);
    try {
      if (!editingEtape) {
        setErrorMessage({ 
          type: 'error', 
          text: 'Aucune étape en cours d\'édition.\n\nVeuillez sélectionner une étape à modifier.' 
        });
        setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
        return;
      }

      if (!selectedCourrier) {
        setErrorMessage({ 
          type: 'error', 
          text: 'Aucun courrier sélectionné.\n\nVeuillez sélectionner un courrier.' 
        });
        setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
        return;
      }

      setErrorMessage({ type: null, text: '' });

      // Validation pour les conditions
      if (newEtape.estCondition) {
        if (!newEtape.condition || !newEtape.condition.trim()) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Texte de condition manquant.\n\nVeuillez saisir le texte de la condition.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (newEtape.actionSiVrai && !workflows.find(w => w.id === newEtape.actionSiVrai && w.id !== editingEtape.id)) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Action "Si OUI" invalide.\n\nL\'action sélectionnée n\'existe pas.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (newEtape.actionSiFaux && !workflows.find(w => w.id === newEtape.actionSiFaux && w.id !== editingEtape.id)) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Action "Si NON" invalide.\n\nL\'action sélectionnée n\'existe pas.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
      } else {
        // Validation pour les actions
        if (!newEtape.etape || !newEtape.etape.trim()) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Nom de l\'étape manquant.\n\nVeuillez saisir un nom pour l\'étape.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (!newEtape.assigneA) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Utilisateur non assigné.\n\nVeuillez sélectionner un utilisateur à assigner à cette étape.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        const assignedUser = userService.getUserById(newEtape.assigneA);
        if (!assignedUser) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Utilisateur invalide.\n\nL\'utilisateur sélectionné n\'existe pas.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
      }

      // Validation et construction du déclencheur
      let declencheur;
      if (newEtape.estCondition) {
        // Pour une condition : déclencheur optionnel "après quelle étape"
        declencheur = newEtape.etapePrecedenteId
          ? { type: 'APRES_ETAPE' as const, etapePrecedenteId: newEtape.etapePrecedenteId }
          : undefined;
      } else if (newEtape.declencheurType !== 'IMMEDIAT') {
        if (newEtape.declencheurType === 'APRES_ETAPE') {
          if (!newEtape.etapePrecedenteId) {
            setErrorMessage({ 
              type: 'error', 
              text: 'Étape précédente manquante.\n\nVeuillez sélectionner l\'étape précédente pour le déclenchement.' 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
            return;
          }
          const etapePrecedente = workflows.find(w => w.id === newEtape.etapePrecedenteId && w.id !== editingEtape.id);
          if (!etapePrecedente) {
            setErrorMessage({ 
              type: 'error', 
              text: 'Étape précédente invalide.\n\nL\'étape sélectionnée n\'existe pas.' 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
            return;
          }
          declencheur = {
            type: newEtape.declencheurType,
            etapePrecedenteId: newEtape.etapePrecedenteId
          };
        } else if (newEtape.declencheurType === 'DATE') {
          if (!newEtape.dateDeclenchement) {
            setErrorMessage({ 
              type: 'error', 
              text: 'Date de déclenchement manquante.\n\nVeuillez sélectionner une date et une heure de déclenchement.' 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
            return;
          }
          const dateDeclenchement = new Date(newEtape.dateDeclenchement);
          if (isNaN(dateDeclenchement.getTime())) {
            setErrorMessage({ 
              type: 'error', 
              text: 'Date de déclenchement invalide.\n\nVeuillez saisir une date valide.' 
            });
            setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
            return;
          }
          declencheur = {
            type: newEtape.declencheurType,
            dateDeclenchement
          };
        }
      }

      // Validation de l'ordre
      let ordre: number | undefined;
      if (newEtape.ordre && newEtape.ordre.trim()) {
        const parsedOrdre = parseInt(newEtape.ordre, 10);
        if (isNaN(parsedOrdre) || parsedOrdre < 1) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Ordre invalide.\n\nL\'ordre doit être un nombre entier positif.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        ordre = parsedOrdre;
      }

      // Validation de la durée estimée
      let dureeEstimee: number | undefined;
      if (newEtape.dureeEstimee && newEtape.dureeEstimee.trim()) {
        const parsedDuree = parseFloat(newEtape.dureeEstimee);
        if (isNaN(parsedDuree)) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Durée estimée invalide.\n\nLa durée doit être un nombre valide.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        if (parsedDuree < 0) {
          setErrorMessage({ 
            type: 'error', 
            text: 'Durée estimée invalide.\n\nLa durée ne peut pas être négative.' 
          });
          setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
          return;
        }
        dureeEstimee = parsedDuree;
      }

      const updates: Partial<WorkflowEtape> = {
        etape: newEtape.estCondition ? newEtape.condition.trim() : newEtape.etape.trim(),
        assigneA: newEtape.assigneA,
        commentaire: newEtape.commentaire?.trim() || undefined,
        dureeEstimee,
        declencheur,
        ordre,
        estCondition: newEtape.estCondition,
        actionSiVrai: newEtape.actionSiVrai || undefined,
        actionSiFaux: newEtape.actionSiFaux || undefined
      };

      const updated = await (courrierService as any).updateWorkflowEtapeAsync(editingEtape.id, updates);
      if (updated) {
        setErrorMessage({ 
          type: 'success', 
          text: '✅ Étape modifiée avec succès dans Firestore !' 
        });
        setTimeout(() => setErrorMessage({ type: null, text: '' }), 3000);
        await loadWorkflows(selectedCourrier.id);
        setSelectedEtape(updated);
      } else {
        setErrorMessage({ 
          type: 'error', 
          text: 'Erreur lors de la modification.\n\nL\'étape n\'a pas pu être mise à jour dans Firestore.' 
        });
        setTimeout(() => setErrorMessage({ type: null, text: '' }), 5000);
        return;
      }
      
      resetEditForm();
    } catch (error: any) {
      console.error('❌ Erreur lors de la modification de l\'étape:', error);
      const errorText = error?.message || 'Une erreur inattendue est survenue lors de la modification de l\'étape.';
      setErrorMessage({ 
        type: 'error', 
        text: `Erreur lors de la modification:\n\n${errorText}\n\nVérifiez la console pour plus de détails.` 
      });
      setTimeout(() => setErrorMessage({ type: null, text: '' }), 7000);
    } finally {
      setEditSubmitting(false);
    }
  };

  const resetEditForm = () => {
    setEditingEtape(null);
    setShowEditForm(false);
    setNewEtape({
      etape: '', assigneA: '', commentaire: '', dureeEstimee: '',
      declencheurType: 'IMMEDIAT', etapePrecedenteId: '', dateDeclenchement: '',
      ordre: '', estCondition: false, condition: '', actionSiVrai: '', actionSiFaux: '', evenementOrigine: ''
    });
  };

  const exportToImage = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(canvasRef.current, { scale: 2, backgroundColor: '#f1f5f9' });
      const link = document.createElement('a');
      link.download = `annotations_${selectedCourrier?.numero || 'annotations'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Erreur export:', error);
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(canvasRef.current, { scale: 2, backgroundColor: '#f1f5f9' });
      
      // Convertir les dimensions en mm pour éviter les problèmes avec 'px'
      const widthMm = Math.max(50, Math.min(841, canvas.width * 0.264583)); // Min 50mm, max A1 width
      const heightMm = Math.max(50, Math.min(1189, canvas.height * 0.264583)); // Min 50mm, max A1 height
      
      if (!isFinite(widthMm) || !isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
        throw new Error('Dimensions de canvas invalides');
      }
      
      const pdf = new jsPDF({ 
        orientation: widthMm > heightMm ? 'landscape' : 'portrait', 
        unit: 'mm', 
        format: [widthMm, heightMm] 
      });
      
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm);
      pdf.save(`annotations_${selectedCourrier?.numero || 'annotations'}.pdf`);
    } catch (error) {
      console.error('Erreur export:', error);
      alert('Erreur lors de l\'export PDF: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setExporting(false);
    }
  };

  // Rendu des connexions
  const renderConnections = () => {
    const connections: JSX.Element[] = [];
    
    workflows.forEach((etape, index) => {
      const pos = nodePositions.get(etape.id);
      if (!pos) return;
      
      if (etape.estCondition) {
        const condCenterX = pos.x + 100; // Centre du losange
        const condCenterY = pos.y + 70;
        
        // Connexion vers action si vrai (vers le bas)
        if (etape.actionSiVrai) {
          const targetPos = nodePositions.get(etape.actionSiVrai);
          if (targetPos) {
            const startX = condCenterX;
            const startY = pos.y + 130; // Pointe basse du losange
            const endX = targetPos.x + targetPos.width / 2;
            const endY = targetPos.y;
            
            connections.push(
              <g key={`${etape.id}-vrai`}>
                {/* Ligne ombre */}
                <path
                  d={`M ${startX} ${startY}
                      C ${startX} ${startY + 40},
                        ${endX} ${endY - 40},
                        ${endX} ${endY}`}
                  fill="none"
                  stroke="rgba(16, 185, 129, 0.2)"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                {/* Ligne principale */}
                <path
                  d={`M ${startX} ${startY}
                      C ${startX} ${startY + 40},
                        ${endX} ${endY - 40},
                        ${endX} ${endY}`}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  markerEnd="url(#arrowGreen)"
                />
                {/* Point de départ */}
                <circle cx={startX} cy={startY} r="6" fill="#10b981" />
                <circle cx={startX} cy={startY} r="3" fill="white" />
              </g>
            );
          }
        }
        
        // Connexion vers action si faux (vers la droite)
        if (etape.actionSiFaux) {
          const targetPos = nodePositions.get(etape.actionSiFaux);
          if (targetPos) {
            const startX = pos.x + 190; // Pointe droite du losange
            const startY = condCenterY;
            const endX = targetPos.x;
            const endY = targetPos.y + targetPos.height / 2;
            
            connections.push(
              <g key={`${etape.id}-faux`}>
                {/* Ligne ombre */}
                <path
                  d={`M ${startX} ${startY}
                      C ${startX + 50} ${startY},
                        ${endX - 50} ${endY},
                        ${endX} ${endY}`}
                  fill="none"
                  stroke="rgba(239, 68, 68, 0.2)"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                {/* Ligne principale */}
                <path
                  d={`M ${startX} ${startY}
                      C ${startX + 50} ${startY},
                        ${endX - 50} ${endY},
                        ${endX} ${endY}`}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="3"
                  strokeLinecap="round"
                  markerEnd="url(#arrowRed)"
                />
                {/* Point de départ */}
                <circle cx={startX} cy={startY} r="6" fill="#ef4444" />
                <circle cx={startX} cy={startY} r="3" fill="white" />
              </g>
            );
          }
        }
      } else {
        // Connexion par declencheur.etapePrecedenteId (connexion explicite créée par drag) ou séquentielle
        const explicitNext = workflows.find(w =>
          !w.estCondition &&
          w.declencheur?.type === 'APRES_ETAPE' &&
          w.declencheur?.etapePrecedenteId === etape.id
        );
        const nextEtapeSeq = workflows.find(w =>
          !w.estCondition &&
          w.ordre !== undefined &&
          etape.ordre !== undefined &&
          w.ordre === etape.ordre + 1 &&
          !w.declencheur?.etapePrecedenteId
        );
        const nextEtape = explicitNext || nextEtapeSeq;
        if (nextEtape) {
          const nextPos = nodePositions.get(nextEtape.id);
          if (nextPos) {
            const startX = pos.x + pos.width;
            const startY = pos.y + pos.height / 2;
            const endX = nextPos.x;
            const endY = nextPos.y + nextPos.height / 2;
            
            connections.push(
              <g key={`${etape.id}-next`}>
                {/* Ligne ombre */}
                <path
                  d={`M ${startX} ${startY}
                      C ${startX + 40} ${startY},
                        ${endX - 40} ${endY},
                        ${endX} ${endY}`}
                  fill="none"
                  stroke="rgba(99, 102, 241, 0.15)"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                {/* Ligne principale */}
                <path
                  d={`M ${startX} ${startY}
                      C ${startX + 40} ${startY},
                        ${endX - 40} ${endY},
                        ${endX} ${endY}`}
                  fill="none"
                  stroke="url(#connectionGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  markerEnd="url(#arrowPurple)"
                />
                {/* Point de départ */}
                <circle cx={startX} cy={startY} r="5" fill="#6366f1" />
                <circle cx={startX} cy={startY} r="2" fill="white" />
              </g>
            );
          }
        }
      }
    });
    
    return (
      <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <marker id="arrowPurple" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <path d="M 0 0 L 12 4 L 0 8 L 3 4 Z" fill="#8b5cf6" />
          </marker>
          <marker id="arrowGreen" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <path d="M 0 0 L 12 4 L 0 8 L 3 4 Z" fill="#10b981" />
          </marker>
          <marker id="arrowRed" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <path d="M 0 0 L 12 4 L 0 8 L 3 4 Z" fill="#ef4444" />
          </marker>
          <marker id="arrowConnecting" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <path d="M 0 0 L 12 4 L 0 8 L 3 4 Z" fill="#10b981" />
          </marker>
        </defs>
        {connections}
        {/* Flèche en cours de connexion (style n8n) */}
        {connectingFrom && connectingMouse && (() => {
          const srcPos = nodePositions.get(connectingFrom);
          if (!srcPos) return null;
          const sx = srcPos.x + srcPos.width;
          const sy = srcPos.y + srcPos.height / 2;
          const ex = connectingMouse.x;
          const ey = connectingMouse.y;
          return (
            <g>
              <path
                d={`M ${sx} ${sy} C ${sx + 60} ${sy}, ${ex - 60} ${ey}, ${ex} ${ey}`}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeDasharray="6 3"
                strokeLinecap="round"
                markerEnd="url(#arrowConnecting)"
                style={{ animation: 'dash 0.5s linear infinite' }}
              />
              <circle cx={sx} cy={sy} r="5" fill="#10b981" />
              <circle cx={ex} cy={ey} r="5" fill="#10b981" opacity="0.6" />
            </g>
          );
        })()}
      </svg>
    );
  };

  // Rendu d'un nœud
  const renderNode = (etape: WorkflowEtape) => {
    const pos = nodePositions.get(etape.id);
    if (!pos) return null;
    
    const status = statusColors[etape.statut as keyof typeof statusColors] || statusColors['EN_ATTENTE'];
    const assignedUser = userService.getUserById(etape.assigneA);
    const label = (etape.etape || '').toString();
    const isSelected = selectedEtape?.id === etape.id;
    const isHovered = hoveredNode === etape.id;
    const isCondition = etape.estCondition;
    const showActions = isSelected || isHovered;
    
    return (
      <div
        key={etape.id}
        className={`absolute cursor-pointer transition-all duration-200 group ${
          isSelected ? 'ring-4 ring-primary-400 ring-opacity-50 z-20' : 'z-10'
        } ${draggingNode === etape.id ? 'scale-105 shadow-2xl z-30' : 'hover:scale-102 hover:shadow-xl'}`}
        style={{ left: pos.x, top: pos.y, width: pos.width }}
        onMouseDown={(e) => handleNodeMouseDown(e, etape.id)}
        onMouseUp={(e) => handleNodeMouseUp(e, etape.id)}
        onClick={(e) => { e.stopPropagation(); setSelectedEtape(etape); }}
        onMouseEnter={() => setHoveredNode(etape.id)}
        onMouseLeave={() => setHoveredNode(null)}
      >
        {/* Boutons d'action flottants */}
        <div className={`absolute -top-3 right-0 flex items-center gap-1 transition-all duration-200 ${
          showActions ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}>
          <button
            onClick={(e) => handleEditWorkflow(etape, e)}
            className="w-7 h-7 rounded-full bg-white shadow-lg border border-neutral-200 flex items-center justify-center text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors"
            title="Modifier"
          >
            <FontAwesomeIcon icon={faEdit} className="text-xs" />
          </button>
          <button
            onClick={(e) => handleDeleteWorkflow(etape.id, e)}
            className="w-7 h-7 rounded-full bg-white shadow-lg border border-neutral-200 flex items-center justify-center text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
            title="Supprimer"
          >
            <FontAwesomeIcon icon={faTrash} className="text-xs" />
          </button>
        </div>

        {/* Port de sortie style n8n (cercle vert à droite) — actions seulement */}
        {!isCondition && (
          <>
            <div
              onMouseDown={(e) => handlePortMouseDown(e, etape.id)}
              className={`absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-crosshair z-30 transition-all ${
                connectingFrom === etape.id
                  ? 'bg-emerald-400 scale-125'
                  : 'bg-emerald-500 hover:bg-emerald-400 hover:scale-125'
              } ${showActions || connectingFrom === etape.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              title="Tirer pour connecter"
            >
              <FontAwesomeIcon icon={faArrowRight} className="text-white text-[8px]" />
            </div>
            {/* Bouton + en bas pour créer l'étape suivante */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setInlineCreateData(prev => ({
                  ...prev,
                  etapePrecedenteId: etape.id,
                  declencheurType: 'APRES_ETAPE',
                }));
                setInlineCreateAfterOrdre(etape.ordre ?? workflows.length);
              }}
              className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center cursor-pointer z-30 transition-all hover:bg-indigo-400 hover:scale-125 ${
                showActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              title="Ajouter une étape suivante"
            >
              <FontAwesomeIcon icon={faPlus} className="text-white text-[8px]" />
            </div>
          </>
        )}
        
        {isCondition ? (
          // Nœud condition (vrai losange)
          <div className="relative" style={{ width: '200px', height: '140px' }}>
            <svg 
              viewBox="0 0 200 140" 
              className="w-full h-full drop-shadow-lg"
              style={{ filter: 'drop-shadow(0 10px 15px rgba(147, 51, 234, 0.3))' }}
            >
              <defs>
                <linearGradient id={`diamondGrad-${etape.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="50%" stopColor="#9333ea" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
                <filter id={`shadow-${etape.id}`}>
                  <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.3"/>
                </filter>
              </defs>
              {/* Losange */}
              <polygon 
                points="100,10 190,70 100,130 10,70" 
                fill={`url(#diamondGrad-${etape.id})`}
                stroke={isSelected ? '#6366f1' : '#7c3aed'}
                strokeWidth={isSelected ? '3' : '2'}
                filter={`url(#shadow-${etape.id})`}
              />
              {/* Bordure intérieure */}
              <polygon 
                points="100,20 180,70 100,120 20,70" 
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />
            </svg>
            {/* Contenu au centre */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center mb-2">
                <FontAwesomeIcon icon={faQuestion} className="text-white text-sm" />
              </div>
              <span className="text-white font-bold text-sm text-center leading-tight max-w-[120px]">
                {label.length > 25 ? label.substring(0, 25) + '...' : label || 'Condition'}
              </span>
              <span className="text-white/60 text-xs mt-1">Condition</span>
            </div>
            {/* Indicateurs OUI/NON */}
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full shadow">
              OUI ↓
            </div>
            <div className="absolute top-1/2 -right-2 transform -translate-y-1/2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full shadow">
              NON →
            </div>
          </div>
        ) : (
          // Nœud action
          <div className={`bg-gradient-to-br ${status.bg} rounded-2xl shadow-lg overflow-hidden`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-black/10">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                  {etape.ordre || '?'}
                </span>
                <FontAwesomeIcon icon={status.icon} className="text-white/80" />
              </div>
              <span className="text-xs text-white/80 font-medium">{etape.statut.replace('_', ' ')}</span>
            </div>
            
            {/* Contenu */}
            <div className="px-4 py-3">
              <h4 className="font-semibold text-white text-sm mb-2 leading-tight">
                {label.length > 35 ? label.substring(0, 35) + '...' : (label || 'Étape')}
              </h4>
              
              {assignedUser && (
                <div className="flex items-center gap-2 text-white/80 text-xs">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUser} className="text-white/80 text-xs" />
                  </div>
                  <span>{assignedUser.nom}</span>
                </div>
              )}
              
              {etape.dureeEstimee && (
                <div className="flex items-center gap-1 text-white/60 text-xs mt-1">
                  <FontAwesomeIcon icon={faHourglassHalf} />
                  <span>{etape.dureeEstimee}h estimé</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Formulaire inline de création d'étape ──────────────────────────────
  const renderInlineCreateForm = (compact?: boolean) => {
    const d = inlineCreateData;
    return (
      <div className={`bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200 rounded-2xl shadow-lg ${compact ? 'p-3' : 'p-4'} space-y-3`}>
        {/* Ligne 1 : Type + Nom */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-neutral-100 rounded-lg shrink-0">
            <button type="button" onClick={() => setInlineCreateData({ ...d, estCondition: false })}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${!d.estCondition ? 'bg-white shadow text-indigo-600' : 'text-neutral-500'}`}>
              <FontAwesomeIcon icon={faFlag} className="mr-1" />Action
            </button>
            <button type="button" onClick={() => setInlineCreateData({ ...d, estCondition: true, assigneA: '' })}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${d.estCondition ? 'bg-white shadow text-purple-600' : 'text-neutral-500'}`}>
              <FontAwesomeIcon icon={faCodeBranch} className="mr-1" />Condition
            </button>
          </div>
          <div className="flex-1">
            {d.estCondition ? (
              <input type="text" value={d.condition} onChange={e => setInlineCreateData({ ...d, condition: e.target.value })}
                placeholder="Texte de la condition..." autoFocus
                className="w-full px-3 py-1.5 text-sm bg-purple-50 border border-purple-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100" />
            ) : (
              <input type="text" value={d.etape} onChange={e => setInlineCreateData({ ...d, etape: e.target.value })}
                placeholder="Nom de l'étape..." autoFocus
                className="w-full px-3 py-1.5 text-sm bg-white border border-indigo-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            )}
          </div>
        </div>

        {/* Ligne 2 : Conditionnel - Si OUI / Si NON */}
        {d.estCondition && (
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
              <label className="text-[10px] font-bold text-emerald-700 uppercase mb-1 block">Si OUI →</label>
              <select value={d.actionSiVrai} onChange={e => setInlineCreateData({ ...d, actionSiVrai: e.target.value })}
                className="w-full px-2 py-1 text-xs bg-white border border-emerald-200 rounded-lg">
                <option value="">Sélectionner</option>
                {workflows.filter(w => !w.estCondition).map(w => <option key={w.id} value={w.id}>{w.etape}</option>)}
              </select>
            </div>
            <div className="p-2 bg-red-50 rounded-xl border border-red-200">
              <label className="text-[10px] font-bold text-red-700 uppercase mb-1 block">Si NON →</label>
              <select value={d.actionSiFaux} onChange={e => setInlineCreateData({ ...d, actionSiFaux: e.target.value })}
                className="w-full px-2 py-1 text-xs bg-white border border-red-200 rounded-lg">
                <option value="">Sélectionner</option>
                {workflows.filter(w => !w.estCondition).map(w => <option key={w.id} value={w.id}>{w.etape}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Ligne 3 : Filtres organisation + Agent + Déclencheur + Durée (uniquement pour actions simples) */}
        {!d.estCondition && (
          <div className="space-y-2">
            {/* Filtres par entités (direction, division, bureau, etc.) */}
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Filtrer par organisation</span>
              {filterLevels.map((level, i) => {
                const parentId = i === 0 ? null : assignFilterIds[i - 1] ?? null;
                const opts = i === 0
                  ? entiteOrganisationnelleService.getDirectionsForFilters()
                  : parentId
                    ? entiteOrganisationnelleService.getEntitiesByParent(parentId).filter(e => e.type === level.code).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                    : [];
                const selectedId = assignFilterIds[i] ?? null;
                const isLocked = shouldLockFilterLevel(i, level.code);
                return (
                  <div key={level.code} className="relative z-50">
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                      {level.libelleSingulier}
                      {isLocked && <span className="ml-1 text-blue-600 font-normal">(verrouillé)</span>}
                    </label>
                    <SearchableSelect
                      options={opts.map(e => ({ value: e.id, label: e.nom }))}
                      value={selectedId ?? ''}
                      onChange={(id) => handleFilterChange(id, i, isLocked)}
                      disabled={isLocked}
                      emptyOption={isLocked ? `${level.libelleSingulier} verrouillé(e)` : `Tous les ${level.libellePluriel.toLowerCase()}`}
                      searchPlaceholder={`Rechercher un(e) ${level.libelleSingulier.toLowerCase()}...`}
                      className={isLocked ? 'opacity-75 bg-gray-50' : ''}
                    />
                  </div>
                );
              })}
            </div>
            {/* Agent + Déclencheur + Durée */}
            <div className="flex items-center gap-2 flex-wrap relative z-40">
            <SearchableSelect
              options={filteredAssignableUsers.map(u => ({
                value: u.id,
                label: `${u.nom} (${u.email || ''}) — ${u.role?.replace('_', ' ') || ''}`,
                avatarUrl: u.photoUrl,
                avatarLabel: u.nom?.charAt(0)?.toUpperCase() || '?',
              }))}
              value={d.assigneA}
              onChange={v => setInlineCreateData({ ...d, assigneA: v })}
              emptyOption={filteredAssignableUsers.length === 0 ? 'Aucun agent pour les filtres' : 'Assigner à...'}
              searchPlaceholder="Rechercher par nom ou email..."
              className="min-w-[160px] flex-1"
            />
            <select value={d.declencheurType} onChange={e => setInlineCreateData({ ...d, declencheurType: e.target.value as any })}
              className="px-2 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg">
              <option value="IMMEDIAT">Immédiat</option>
              <option value="APRES_ETAPE">Après étape</option>
              <option value="DATE">Date</option>
            </select>
            {d.declencheurType === 'APRES_ETAPE' && (
              <select value={d.etapePrecedenteId} onChange={e => setInlineCreateData({ ...d, etapePrecedenteId: e.target.value })}
                className="px-2 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg">
                <option value="">Étape précédente</option>
                {workflows.map(w => <option key={w.id} value={w.id}>{w.etape}</option>)}
              </select>
            )}
            {d.declencheurType === 'DATE' && (
              <input type="datetime-local" value={d.dateDeclenchement} onChange={e => setInlineCreateData({ ...d, dateDeclenchement: e.target.value })}
                className="px-2 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg" />
            )}
            <input type="number" value={d.dureeEstimee} onChange={e => setInlineCreateData({ ...d, dureeEstimee: e.target.value })}
              placeholder="Durée (h)" min={0} step={0.5}
              className="w-20 px-2 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg" />
            </div>
          </div>
        )}

        {/* Ligne 4 : Conditionnel - Étape précédente pour déclencheur */}
        {d.estCondition && (
          <div className="flex items-center gap-2">
            <select value={d.etapePrecedenteId} onChange={e => setInlineCreateData({ ...d, etapePrecedenteId: e.target.value })}
              className="flex-1 px-2 py-1.5 text-xs bg-violet-50 border border-violet-200 rounded-lg">
              <option value="">Après étape (optionnel)</option>
              {workflows.map(w => <option key={w.id} value={w.id}>{w.estCondition ? `[Condition] ${w.etape}` : w.etape}</option>)}
            </select>
          </div>
        )}

        {/* Boutons */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={cancelInlineCreate}
            className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200 rounded-lg transition-colors">
            Annuler
          </button>
          <button type="button" onClick={commitInlineCreate} disabled={inlineSubmitting}
            className="px-4 py-1.5 text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm disabled:opacity-70 flex items-center gap-1.5">
            {inlineSubmitting ? <><FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Création…</> : <><FontAwesomeIcon icon={faPlus} /> Créer</>}
          </button>
        </div>
      </div>
    );
  };

  // ── Bouton d'insertion inline (+) ────────────────────────────────
  const renderInsertButton = (afterOrdre: number) => {
    if (!canCreateStep || !selectedCourrier) return null;
    return (
      <div className="flex items-center justify-center my-1 group">
        <button
          type="button"
          onClick={() => startInlineCreate(afterOrdre)}
          className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 hover:text-indigo-700 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm hover:shadow-md"
          title="Insérer une étape ici"
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>
    );
  };

  // Déterminer le destinataire attendu pour l'orientation d'un courrier enregistré
  const getExpectedOrientationTarget = (u: Utilisateur | null): Utilisateur | null => {
    if (!u) return null;
    if (u.role === Role.SECRETAIRE && u.direction && u.direction !== 'Direction Générale') {
      const directeur = adminService.getAllUsers().find(x =>
        x.role === Role.DIRECTEUR && x.direction === u.direction && x.actif
      );
      return directeur ?? adminService.getDirecteurGeneral() ?? null;
    }
    return adminService.getDirecteurGeneral() ?? null;
  };

  // Rendu de la timeline
  const renderTimeline = () => (
    <div className="space-y-1 p-4">
      {/* Bouton + avant la première étape */}
      {workflows.length > 0 && canCreateStep && selectedCourrier && inlineCreateAfterOrdre !== -1 && (
        <div className="flex gap-4">
          <div className="w-10 flex justify-center">
            {renderInsertButton(-1)}
          </div>
          <div className="flex-1" />
        </div>
      )}
      {/* Formulaire inline en position -1 (avant la 1ère étape) */}
      {inlineCreateAfterOrdre === -1 && (
        <div className="flex gap-4">
          <div className="w-10 flex justify-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-lg">
              <FontAwesomeIcon icon={faPlus} className="text-white" />
            </div>
          </div>
          <div className="flex-1">
            {renderInlineCreateForm(true)}
          </div>
        </div>
      )}

      {/* ── Prochaine action attendue pour un courrier enregistré ou orienté ── */}
      {selectedCourrier && [StatutCourrier.ENREGISTRE, StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ORIENTE_DG, StatutCourrier.ORIENTE_DIRECTEUR, StatutCourrier.ASSIGNE, StatutCourrier.EN_TRAITEMENT].includes(selectedCourrier.statut) && (
        <div className="flex gap-4">
          <style>{`
            @keyframes n8n-ping-ring {
              0% { transform: scale(1); opacity: 0.6; }
              100% { transform: scale(1.6); opacity: 0; }
            }
            @keyframes n8n-pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5); }
              50% { box-shadow: 0 0 0 10px rgba(139, 92, 246, 0); }
            }
            @keyframes n8n-flow-vertical {
              0% { background-position: 0 0; }
              100% { background-position: 0 24px; }
            }
          `}</style>
          {(() => {
            const isOrientationNext = selectedCourrier.statut === StatutCourrier.ENREGISTRE;
            const expectedTarget = isOrientationNext ? getExpectedOrientationTarget(user) : null;
            const title = isOrientationNext ? 'Orientation en attente' : 'Traitement en cours';
            const description = isOrientationNext
              ? <>Action attendue : orienter le courrier vers {expectedTarget ? <strong>{expectedTarget.nom}</strong> : 'le DG ou un Directeur'} avant de créer des étapes de workflow.</>
              : <>Le courrier a été orienté. Action attendue : <strong>créer au moins une annotation</strong> et faire traiter le courrier par les agents concernés.</>;
            const icon = isOrientationNext ? faCompass : faClock;
            return (
              <>
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div
                      className="absolute inset-0 rounded-full bg-violet-400"
                      style={{ animation: 'n8n-ping-ring 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}
                    />
                    <div
                      className="relative z-10 w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-violet-500 flex items-center justify-center shadow-lg"
                      style={{ animation: 'n8n-pulse 2s infinite' }}
                    >
                      <FontAwesomeIcon icon={icon} className="text-white" />
                    </div>
                  </div>
                  {workflows.length > 0 && (
                    <div
                      className="w-0.5 flex-1 my-2"
                      style={{
                        background: 'repeating-linear-gradient(180deg, #a78bfa 0, #a78bfa 6px, transparent 6px, transparent 12px)',
                        backgroundSize: '100% 12px',
                        animation: 'n8n-flow-vertical 0.6s linear infinite'
                      }}
                    />
                  )}
                </div>
                <div className="flex-1 bg-white rounded-xl shadow-sm border-2 border-violet-100 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-neutral-800">{title}</h4>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                      EN ATTENTE
                    </span>
                  </div>
                  {expectedTarget && (
                    <div className="flex items-center gap-2 text-neutral-600 text-sm mb-2">
                      <FontAwesomeIcon icon={faUser} className="text-neutral-400" />
                      <span>{expectedTarget.nom}</span>
                      {expectedTarget.role && <span className="text-neutral-400">({expectedTarget.role})</span>}
                    </div>
                  )}
                  <p className="text-xs text-neutral-500">{description}</p>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {workflows.map((etape, index) => {
        const status = statusColors[etape.statut as keyof typeof statusColors] || statusColors['EN_ATTENTE'];
        const assignedUser = userService.getUserById(etape.assigneA);
        const isLast = index === workflows.length - 1;
        const etapeOrdre = etape.ordre ?? (index + 1);
    
    return (
          <React.Fragment key={etape.id}>
            <div className="flex gap-4">
              {/* Ligne de timeline */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${status.bg} flex items-center justify-center shadow-lg`}>
                  <FontAwesomeIcon icon={etape.estCondition ? faCodeBranch : status.icon} className="text-white" />
                </div>
                {!isLast && <div className="w-0.5 flex-1 bg-gradient-to-b from-primary-300 to-primary-100 my-2"></div>}
              </div>
              
              {/* Contenu */}
              <div 
                className={`flex-1 bg-white rounded-xl shadow-sm border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
                  selectedEtape?.id === etape.id ? 'border-primary-400 bg-primary-50' : 'border-transparent'
                }`}
                onClick={() => setSelectedEtape(etape)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {etape.ordre && (
                      <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-xs font-bold">
                        #{etape.ordre}
                      </span>
                    )}
                    {etape.estCondition && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-bold">
                        CONDITION
                      </span>
                    )}
                    <h4 className="font-semibold text-neutral-800">{etape.etape}</h4>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.badge}`}>
                    {etape.statut.replace('_', ' ')}
                  </span>
                </div>
                
                {assignedUser && (
                  <div className="flex items-center gap-2 text-neutral-600 text-sm mb-2">
                    <FontAwesomeIcon icon={faUser} className="text-neutral-400" />
                    <span>{assignedUser.nom}</span>
                    {assignedUser.role && <span className="text-neutral-400">({assignedUser.role})</span>}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
                  {etape.dureeEstimee && (
                    <span className="flex items-center gap-1">
                      <FontAwesomeIcon icon={faHourglassHalf} />
                      {etape.dureeEstimee}h estimé
                    </span>
                  )}
                  {etape.dateDebut && (
                    <span className="flex items-center gap-1">
                      <FontAwesomeIcon icon={faPlay} />
                      {new Date(etape.dateDebut).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                  {etape.dateFin && (
                    <span className="flex items-center gap-1">
                      <FontAwesomeIcon icon={faCheckCircle} />
                      {new Date(etape.dateFin).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bouton + après cette étape (si pas le formulaire inline ouvert) */}
            {canCreateStep && selectedCourrier && inlineCreateAfterOrdre !== etapeOrdre && !isLast && (
              <div className="flex gap-4">
                <div className="w-10 flex justify-center">
                  {renderInsertButton(etapeOrdre)}
                </div>
                <div className="flex-1" />
              </div>
            )}

            {/* Formulaire inline après cette étape */}
            {inlineCreateAfterOrdre === etapeOrdre && (
              <div className="flex gap-4">
                <div className="w-10 flex justify-center">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-lg">
                    <FontAwesomeIcon icon={faPlus} className="text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  {renderInlineCreateForm(true)}
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
      
      {/* Bouton + à la fin (ajouter après la dernière étape) */}
      {workflows.length > 0 && canCreateStep && selectedCourrier && inlineCreateAfterOrdre !== (workflows[workflows.length - 1]?.ordre ?? workflows.length) && (
        <div className="flex gap-4">
          <div className="w-10 flex justify-center">
            <button
              type="button"
              onClick={() => startInlineCreate(workflows[workflows.length - 1]?.ordre ?? workflows.length)}
              className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 hover:text-indigo-700 flex items-center justify-center text-xs font-bold transition-all duration-200 shadow-sm hover:shadow-md"
              title="Ajouter une étape à la fin"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          <div className="flex-1" />
        </div>
      )}
      {/* Formulaire inline à la fin */}
      {inlineCreateAfterOrdre === (workflows[workflows.length - 1]?.ordre ?? workflows.length) && workflows.length > 0 && (
        <div className="flex gap-4">
          <div className="w-10 flex justify-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-lg">
              <FontAwesomeIcon icon={faPlus} className="text-white" />
            </div>
          </div>
          <div className="flex-1">
            {renderInlineCreateForm(true)}
          </div>
        </div>
      )}

      {workflows.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <FontAwesomeIcon icon={faProjectDiagram} className="text-5xl mb-4" />
          <p>Aucune étape définie</p>
          {/* Bouton créer la première étape - seulement pour les rôles de direction */}
          {canCreateStep ? (
            <button
              onClick={() => startInlineCreate(0)}
              className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2" />
              Créer la première étape
            </button>
          ) : (
            <div className="mt-4 px-4 py-2 bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed border border-slate-200 inline-flex items-center gap-2">
              <FontAwesomeIcon icon={faLock} className="text-slate-400" />
              <span>Workflow verrouillé</span>
            </div>
          )}
          {/* Formulaire inline pour la première étape */}
          {inlineCreateAfterOrdre === 0 && workflows.length === 0 && (
            <div className="mt-4">
              {renderInlineCreateForm(true)}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full bg-slate-50/95">
      {/* Drawer liste des courriers (gauche) — overlay + panneau avec stats, recherche, filtres, liste */}
      {listDrawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[50000]"
            aria-hidden
            onClick={() => setListDrawerOpen(false)}
          />
          <div
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200 z-[50001]"
            role="dialog"
            aria-label="Liste des courriers"
          >
            <div className="px-4 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FontAwesomeIcon icon={faList} className="text-slate-500" />
                Liste des courriers
              </h2>
              <button
                type="button"
                onClick={() => setListDrawerOpen(false)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Fermer"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            {/* Recherche */}
            <div className="p-3 border-b border-slate-100 shrink-0">
              <div className="relative">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  type="search"
                  placeholder="Rechercher un courrier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all"
                />
              </div>
            </div>
            {/* Filtres Direction / Service / Sous-service */}
            <div className="p-3 border-b border-slate-100 shrink-0">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filtres</span>
                  {filterSelectionIds.some(Boolean) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterEntityType('ALL');
                        setFilterEntityId('ALL');
                        // Pour les directeurs, préserver leur direction
                        if ((isDirecteur || isDirecteurGeneral) && !isSuperAdmin && user?.direction) {
                          const directions = entiteOrganisationnelleService.getDirectionsForFilters();
                          const userDir = directions.find(d => d.nom === user.direction);
                          setFilterSelectionIds(userDir ? [userDir.id] : []);
                        } else {
                          setFilterSelectionIds([]);
                        }
                      }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
                {filterLevels.map((level, i) => {
                  const parentId = i === 0 ? null : (filterSelectionIds[i - 1] ?? null);
                  const options = i === 0
                    ? entiteOrganisationnelleService.getDirectionsForFilters()
                    : parentId
                      ? entiteOrganisationnelleService.getEntitiesByParent(parentId).filter(e => e.type === level.code).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                      : [];
                  const selectedId = filterSelectionIds[i] ?? null;
                  const selectedNom = selectedId ? entiteOrganisationnelleService.getEntityById(selectedId)?.nom ?? '' : '';
                  const icon = level.code === 'direction' ? faBuilding : level.code === 'division' ? faLayerGroup : level.code === 'service' ? faUsers : faFolder;
                  
                  // Verrouiller la direction pour les directeurs et directeurs généraux dans les filtres principaux (mais pas pour les SUPER ADMIN)
                  const isDirectionLevel = i === 0 && level.code === 'direction';
                  const isLocked = isDirectionLevel && (isDirecteur || isDirecteurGeneral) && user.role !== Role.SUPER_ADMIN;
                  
                  return (
                    <div key={level.code}>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        {level.libelleSingulier}
                        {isLocked && <span className="ml-1 text-blue-600 font-normal">(verrouillé)</span>}
                      </label>
                      <SearchableSelect
                        options={options.map(e => ({ value: e.nom, label: e.nom }))}
                        value={selectedNom}
                        onChange={(nom) => {
                          if (isLocked) return; // Ne pas permettre la modification si verrouillé
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
                        disabled={isLocked}
                        emptyOption={
                          isLocked 
                            ? 'Direction verrouillée selon votre rôle'
                            : `Tous les ${level.libellePluriel.toLowerCase()}`
                        }
                        searchPlaceholder={`Rechercher un(e) ${level.libelleSingulier.toLowerCase()}...`}
                        className={isLocked ? 'opacity-75 bg-gray-50' : ''}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Liste des courriers */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {filteredCourriers.length === 0 ? (
                <div className="text-center py-10 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                  <FontAwesomeIcon icon={faEnvelope} className="text-4xl text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-500">Aucun courrier</p>
                  <p className="text-xs text-slate-400 mt-1">Les courriers accessibles apparaîtront ici</p>
                </div>
              ) : (
                filteredCourriers.map(courrier => {
                  const isSelected = selectedCourrier?.id === courrier.id;
                  const workflowCount = courrierService.getWorkflowsByCourrier(courrier.id).length;
                  return (
                    <button
                      key={courrier.id}
                      type="button"
                      onClick={() => { setSelectedCourrier(courrier); loadWorkflows(courrier.id); setListDrawerOpen(false); }}
                      className={`w-full text-left p-3.5 rounded-xl transition-all border ${
                        isSelected
                          ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`font-semibold text-sm truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {courrier.numero}
                        </span>
                        {workflowCount > 0 && (
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-medium flex-shrink-0 ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {workflowCount} étape{workflowCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs truncate ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                        {courrier.objet?.replace(/<[^>]*>/g, '') || ''}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Zone principale — bouton Liste pour ouvrir le drawer */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-xl shadow-lg border border-slate-200/80">
        {/* Barre Liste des courriers */}
        <div className="shrink-0 px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setListDrawerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 transition-all shadow-sm"
          >
            <FontAwesomeIcon icon={faList} className="text-slate-500" />
            <span className="font-medium text-sm">Liste des courriers</span>
            {selectedCourrier && (
              <span className="text-xs text-slate-500 font-normal truncate max-w-[200px]">
                — {selectedCourrier.numero}
              </span>
            )}
          </button>
          {selectedCourrier && (
            <span className="text-sm text-slate-500 truncate max-w-[280px]" title={selectedCourrier.objet?.replace(/<[^>]*>/g, '') || ''}>
              {selectedCourrier.objet?.replace(/<[^>]*>/g, '') || ''}
            </span>
          )}
        </div>

        {selectedCourrier ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                <h1 className="font-bold text-slate-800 text-xl">{selectedCourrier.numero}</h1>
                <p className="text-sm text-slate-500 mt-1">{selectedCourrier.objet?.replace(/<[^>]*>/g, '') || ''}</p>
              </div>
              
              {/* Actions en dessous */}
              <div className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Tabs */}
                  <div className="flex items-center bg-neutral-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('visual')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'visual' ? 'bg-white shadow text-primary-600' : 'text-neutral-500'
                      }`}
                    >
                      <FontAwesomeIcon icon={faProjectDiagram} className="mr-2" />
                      Visuel
                    </button>
                    <button
                      onClick={() => setViewMode('timeline')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'timeline' ? 'bg-white shadow text-primary-600' : 'text-neutral-500'
                      }`}
                    >
                      <FontAwesomeIcon icon={faListUl} className="mr-2" />
                      Timeline
                    </button>
                  </div>
                  
                  {/* Zoom (mode visuel) */}
                  {viewMode === 'visual' && (
                    <div className="flex items-center gap-1 px-2 border-l border-neutral-200 ml-2">
                      <button onClick={zoomOut} className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100">
                        <FontAwesomeIcon icon={faSearchMinus} />
                      </button>
                      <span className="text-sm text-neutral-600 w-12 text-center">{Math.round(transform.scale * 100)}%</span>
                      <button onClick={zoomIn} className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100">
                        <FontAwesomeIcon icon={faSearchPlus} />
                      </button>
                      <button onClick={resetZoom} className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100">
                        <FontAwesomeIcon icon={faHome} />
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Actions à droite */}
                <div className="flex items-center gap-1">
                  {/* Bouton nouvelle étape - seulement pour les rôles de direction */}
                  {canCreateStep ? (
                    <button
                      onClick={() => startInlineCreate(workflows.length > 0 ? (workflows[workflows.length - 1]?.ordre ?? workflows.length) : 0)}
                      className="px-3 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg text-sm font-medium hover:from-primary-600 hover:to-primary-700 transition-all flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faPlus} />
                      Nouvelle étape
                    </button>
                  ) : (
                    <div className="px-3 py-2 bg-slate-100 text-slate-400 rounded-lg text-sm font-medium cursor-not-allowed border border-slate-200 flex items-center gap-2">
                      <FontAwesomeIcon icon={faLock} className="text-slate-400" />
                      <span>Verrouillé</span>
                    </div>
                  )}
                  <button onClick={exportToImage} disabled={exporting} className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100">
                    <FontAwesomeIcon icon={faFileImage} />
                  </button>
                  <button onClick={exportToPDF} disabled={exporting} className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100">
                    <FontAwesomeIcon icon={faFilePdf} />
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100"
                    title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                  >
                    <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} />
                  </button>
                </div>
              </div>
            </div>

            {/* Alerte prochaine action attendue (courrier enregistré ou orienté) */}
            {selectedCourrier && [StatutCourrier.ENREGISTRE, StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ORIENTE_DG, StatutCourrier.ORIENTE_DIRECTEUR, StatutCourrier.ASSIGNE, StatutCourrier.EN_TRAITEMENT].includes(selectedCourrier.statut) && (
              <div className="mx-6 mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50/80 flex items-start gap-3">
                <style>{`
                  @keyframes n8n-ping-ring {
                    0% { transform: scale(1); opacity: 0.6; }
                    100% { transform: scale(1.6); opacity: 0; }
                  }
                  @keyframes n8n-pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5); }
                    50% { box-shadow: 0 0 0 10px rgba(139, 92, 246, 0); }
                  }
                `}</style>
                {(() => {
                  const isOrientationNext = selectedCourrier.statut === StatutCourrier.ENREGISTRE;
                  const expectedTarget = isOrientationNext ? getExpectedOrientationTarget(user) : null;
                  const title = isOrientationNext ? 'Orientation en attente' : 'Traitement en cours';
                  const description = isOrientationNext
                    ? <>Action attendue : orienter le courrier vers{' '}{expectedTarget ? <strong>{expectedTarget.nom}</strong> : 'le DG ou un Directeur'}{' '}avant de créer des étapes de workflow.</>
                    : <>Le courrier a été orienté. Action attendue : <strong>créer au moins une annotation</strong> et faire traiter le courrier par les agents concernés.</>;
                  return (
                    <>
                      <div className="relative flex-shrink-0">
                        <div
                          className="absolute inset-0 rounded-full bg-violet-400"
                          style={{ animation: 'n8n-ping-ring 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}
                        />
                        <div
                          className="relative z-10 w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center"
                          style={{ animation: 'n8n-pulse 2s infinite' }}
                        >
                          <FontAwesomeIcon icon={isOrientationNext ? faCompass : faClock} className="text-white text-sm" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                        <p className="text-xs text-slate-600 mt-0.5">{description}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Contenu principal */}
            <div ref={containerRef} className={`flex-1 flex overflow-hidden relative ${selectedEtape ? 'pr-[400px]' : ''}`}>
              {viewMode === 'visual' ? (
                // Vue visuelle
                <div
                  ref={canvasRef}
                  className="flex-1 relative overflow-hidden min-h-[500px]"
                  style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  onWheel={handleWheel}
                >
                  {/* Grille */}
                  <div 
                    className="absolute inset-0 opacity-30"
                    style={{
                      backgroundImage: `radial-gradient(circle, #cbd5e1 1px, transparent 1px)`,
                      backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
                      backgroundPosition: `${transform.x % (20 * transform.scale)}px ${transform.y % (20 * transform.scale)}px`
                    }}
                  />
                  
                  {/* Conteneur transformé */}
                  <div
                    className="absolute"
                    style={{
                      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                      transformOrigin: '0 0',
                      minWidth: '2000px',
                      minHeight: '1000px'
                    }}
                  >
                    {renderConnections()}
                    {workflows.map(etape => renderNode(etape))}
                  </div>
                  
                  {workflows.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-neutral-400 max-w-md px-4">
                        {selectedCourrier?.statut === StatutCourrier.ENREGISTRE ? (
                          <>
                            <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
                              <FontAwesomeIcon icon={faCompass} className="text-3xl text-violet-500 opacity-80" />
                            </div>
                            <p className="text-lg font-medium text-slate-700">Orientation en attente</p>
                            {(() => {
                              const expectedTarget = getExpectedOrientationTarget(user);
                              return (
                                <p className="text-sm text-slate-500 mt-2">
                                  Le courrier est enregistré. Action attendue : l'orienter vers{' '}
                                  {expectedTarget ? <strong className="text-slate-700">{expectedTarget.nom}</strong> : 'le DG ou un Directeur'}
                                  {' '}avant de créer des étapes de workflow.
                                </p>
                              );
                            })()}
                          </>
                        ) : [StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ORIENTE_DG, StatutCourrier.ORIENTE_DIRECTEUR, StatutCourrier.ASSIGNE, StatutCourrier.EN_TRAITEMENT].includes(selectedCourrier?.statut as any) ? (
                          <>
                            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                              <FontAwesomeIcon icon={faClock} className="text-3xl text-blue-500 opacity-80" />
                            </div>
                            <p className="text-lg font-medium text-slate-700">Traitement en attente</p>
                            <p className="text-sm text-slate-500 mt-2">
                              Le courrier a été orienté. Action attendue : <strong className="text-slate-700">créer au moins une annotation</strong> pour faire traiter le courrier par les agents concernés.
                            </p>
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faProjectDiagram} className="text-6xl mb-4 opacity-50" />
                            <p className="text-lg">Aucune étape définie</p>
                          </>
                        )}
                        {/* Bouton créer une étape - seulement pour les rôles de direction et si le courrier est orienté */}
                        {canCreateStep && selectedCourrier?.statut !== StatutCourrier.ENREGISTRE ? (
                          <button
                            onClick={() => startInlineCreate(0)}
                            className="mt-4 px-6 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all"
                          >
                            <FontAwesomeIcon icon={faPlus} className="mr-2" />
                            Créer une étape
                          </button>
                        ) : (
                          <div className="mt-4 px-6 py-2 bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed border border-slate-200 inline-flex items-center gap-2">
                            <FontAwesomeIcon icon={faLock} className="text-slate-400" />
                            <span>{selectedCourrier?.statut === StatutCourrier.ENREGISTRE ? 'Workflow en attente d\'orientation' : 'Workflow verrouillé'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Formulaire inline overlay (mode visuel) */}
                  {inlineCreateAfterOrdre !== null && viewMode === 'visual' && selectedCourrier && (
                    <div className="absolute bottom-4 left-4 right-4 z-30 max-w-2xl mx-auto">
                      {renderInlineCreateForm(false)}
                    </div>
                  )}
                </div>
              ) : (
                // Vue timeline
                <div className="flex-1 overflow-y-auto bg-white/50">
                  {renderTimeline()}
              </div>
              )}

              {/* Panneau de détails */}
              {selectedEtape && (
                <div className="fixed top-[80px] right-0 bottom-0 w-[400px] max-w-[95vw] bg-white border-l border-slate-200 shadow-2xl z-[100000] flex flex-col overflow-hidden rounded-l-2xl">
                  {/* En-tête — carte titre */}
                  <div className="p-5 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-primary-50/30">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-lg font-bold text-slate-900">Détails de l'étape</h3>
                      <button onClick={() => setSelectedEtape(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors" aria-label="Fermer">
                        <FontAwesomeIcon icon={faTimes} className="text-sm" />
                      </button>
                    </div>
                    <p className="text-base font-semibold text-slate-800 leading-snug">{selectedEtape.etape}</p>
                  </div>

                  {/* Zone de recherche dans le panneau */}
                  <div className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-100">
                    <div className="relative">
                      <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                      <input
                        type="search"
                        value={stepPanelSearch}
                        onChange={(e) => setStepPanelSearch(e.target.value)}
                        placeholder="Rechercher dans réponses et annotations..."
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-primary-300 focus:border-primary-400 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  {/* Contenu scrollable */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Statut — carte */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Statut</label>
                      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${
                        statusColors[selectedEtape.statut as keyof typeof statusColors]?.badge
                      }`}>
                        <FontAwesomeIcon icon={statusColors[selectedEtape.statut as keyof typeof statusColors]?.icon || faClock} />
                        <span className="font-medium">{selectedEtape.statut.replace('_', ' ')}</span>
                      </div>
                    </div>
                    
                    {/* Assigné à — carte avec photo de profil */}
                    {selectedEtape.assigneA && (() => {
                      const assignee = userService.getUserById(selectedEtape.assigneA);
                      const initial = assignee?.nom?.charAt(0)?.toUpperCase() || '?';
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Assigné à</label>
                          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50/80 border border-slate-100">
                            {assignee?.photoUrl ? (
                              <img src={assignee.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg shadow-md border-2 border-white">
                                {initial}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-800 truncate">{assignee?.nom || 'Inconnu'}</p>
                              {assignee?.email && (
                                <p className="text-xs text-slate-500 truncate">{assignee.email}</p>
                              )}
                              {assignee?.role && (
                                <p className="text-[10px] text-slate-400 mt-0.5">{assignee.role.replace('_', ' ')}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* Durée — carte */}
                    {selectedEtape.dureeEstimee && (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Durée estimée</label>
                        <p className="text-neutral-800 font-medium">{selectedEtape.dureeEstimee} heure(s)</p>
                      </div>
                    )}
                    
                    {/* Commentaire — carte */}
                    {selectedEtape.commentaire && (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Commentaire</label>
                        <p className="text-neutral-600 text-sm italic">"{selectedEtape.commentaire}"</p>
                      </div>
                    )}
                    
                    {/* Historique des réponses / avis */}
                    {selectedEtape.responses && selectedEtape.responses.length > 0 && (() => {
                      const q = stepPanelSearch.trim().toLowerCase();
                      const sorted = selectedEtape.responses.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                      const filtered = q ? sorted.filter(r =>
                        (r.message || '').toLowerCase().includes(q) ||
                        (r.auteurNom || r.auteurId || '').toLowerCase().includes(q) ||
                        (r.decision || '').toLowerCase().includes(q)
                      ) : sorted;
                      if (filtered.length === 0) return null;
                      return (
                      <div>
                        <label className="text-xs font-medium text-neutral-500 uppercase mb-1 block">Historique des réponses</label>
                        <div className="space-y-3">
                          {filtered.map((r) => {
                              const responseAuthor = userService.getUserById(r.auteurId);
                              const initial = responseAuthor?.nom?.charAt(0)?.toUpperCase() || r.auteurNom?.charAt(0)?.toUpperCase() || '?';
                              return (
                              <div key={r.id} className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                                <div className="flex items-center justify-between gap-2 text-sm text-neutral-700">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
                                      {responseAuthor?.photoUrl ? (
                                        <img src={responseAuthor.photoUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        initial
                                      )}
                                    </span>
                                    <span className="font-semibold truncate">{r.auteurNom || r.auteurId}</span>
                                  </div>
                                  <span className="text-neutral-500 text-xs flex-shrink-0">
                                    {new Date(r.createdAt).toLocaleString('fr-FR')}
                                  </span>
                                </div>
                                {r.decision && (
                                  <div className="mt-1 text-xs font-semibold text-neutral-600">
                                    Décision : {r.decision.replace('_', ' ')}
                                  </div>
                                )}
                                <p className="text-sm text-neutral-700 mt-1 whitespace-pre-wrap">{r.message}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })()}

                    {/* Annotations de l'étape (considérées comme contenu de l'étape dans le workflow) */}
                    {stepAnnotations.length > 0 && (() => {
                      const q = stepPanelSearch.trim().toLowerCase();
                      const filtered = q ? stepAnnotations.filter(ann => {
                        const author = userService.getUserById(ann.auteur);
                        return (ann.contenu || '').toLowerCase().includes(q) || (author?.nom || '').toLowerCase().includes(q);
                      }) : stepAnnotations;
                      if (filtered.length === 0) return null;
                      return (
                      <div>
                        <label className="text-xs font-medium text-neutral-500 uppercase mb-1 block">Annotations de l'étape</label>
                        <div className="space-y-3">
                          {filtered.map((ann) => {
                            const author = userService.getUserById(ann.auteur);
                            const typeConfig = {
                              COMMENTAIRE: { badge: 'bg-blue-100 text-blue-700', icon: faComment, label: 'Commentaire' },
                              NOTE: { badge: 'bg-amber-100 text-amber-700', icon: faStickyNote, label: 'Note' },
                              MINUTE: { badge: 'bg-violet-100 text-violet-700', icon: faFileLines, label: 'Minute' },
                            }[ann.type];
                            const annInitial = author?.nom?.charAt(0)?.toUpperCase() ?? '?';
                            return (
                              <div key={ann.id} className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <span className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
                                      {author?.photoUrl ? (
                                        <img src={author.photoUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        annInitial
                                      )}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${typeConfig.badge}`}>
                                      <FontAwesomeIcon icon={typeConfig.icon} className="text-[10px]" />
                                      {typeConfig.label}
                                    </span>
                                  </div>
                                  <span className="text-neutral-500 text-xs">
                                    {new Date(ann.dateCreation).toLocaleString('fr-FR')}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-neutral-600 mt-1">{author?.nom ?? ann.auteur}</p>
                                <div className="text-sm text-neutral-700 mt-1 whitespace-pre-wrap">{ann.contenu}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })()}

                  </div>
                    
                  {/* Options en bas avec taille réduite */}
                  <div className="p-4 border-t border-neutral-100 bg-neutral-50 space-y-2">
                    {selectedEtape.statut === 'EN_ATTENTE' && (
                      <button
                        onClick={() => handleUpdateWorkflow(selectedEtape.id, 'EN_COURS')}
                        className="w-full px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2 transition-colors"
                      >
                        <FontAwesomeIcon icon={faPlay} className="text-xs" />
                        Démarrer
                      </button>
                    )}
                    {selectedEtape.statut === 'EN_COURS' && (
                      <>
                        <button
                          onClick={() => handleUpdateWorkflow(selectedEtape.id, 'TERMINE')}
                          className="w-full px-3 py-1.5 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center justify-center gap-2 transition-colors"
                        >
                          <FontAwesomeIcon icon={faCheckCircle} className="text-xs" />
                          Terminer
                        </button>
                        <button
                          onClick={() => handleUpdateWorkflow(selectedEtape.id, 'REJETE')}
                          className="w-full px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center gap-2 transition-colors"
                        >
                          <FontAwesomeIcon icon={faTimesCircle} className="text-xs" />
                          Rejeter
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteWorkflow(selectedEtape.id)}
                      className="w-full px-3 py-1.5 text-sm bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 flex items-center justify-center gap-2 transition-colors"
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                      Supprimer
                    </button>
                  </div>
                </div>
              )}
                </div>
          </>
        ) : (
          // Aucun courrier sélectionné — état vide professionnel
          <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
            <div className="text-center max-w-md">
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200/30 border border-blue-100/80">
                <FontAwesomeIcon icon={faProjectDiagram} className="text-5xl text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Sélectionnez un courrier</h2>
              <p className="text-slate-500 mb-6 leading-relaxed">
                Choisissez un courrier dans la liste à gauche pour gérer son workflow et ses étapes.
              </p>
              {filteredCourriers.length > 0 ? (
                <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100/80 border border-slate-200/80 text-slate-600 text-sm font-medium">
                  <FontAwesomeIcon icon={faEnvelope} className="text-slate-500" />
                  {filteredCourriers.length} courrier{filteredCourriers.length > 1 ? 's' : ''} disponible{filteredCourriers.length > 1 ? 's' : ''}
                </div>
              ) : (
                <Link
                  to="/courriers"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold shadow-md shadow-blue-500/25 hover:bg-blue-600 transition-all"
                >
                  <FontAwesomeIcon icon={faEnvelope} />
                  Voir les courriers
                </Link>
              )}
            </div>
          </div>
        )}
        </div>

             {/* Dialog création — remplacé par formulaire inline */}

      {/* Dialog édition */}
      {showEditForm && editingEtape && selectedCourrier && (
        <BodyPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full max-h-[90vh]">
            {/* Header avec gradient */}
            <div className="relative bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 px-6 py-5 overflow-hidden">
              <div className="absolute inset-0 opacity-30" style={{backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg">
                    <FontAwesomeIcon icon={faEdit} className="text-white text-lg" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">Modifier l'étape</h3>
                    <p className="text-white/80 text-sm mt-0.5">{editingEtape.etape.substring(0, 35)}{editingEtape.etape.length > 35 ? '...' : ''}</p>
                  </div>
                </div>
                <button onClick={resetEditForm} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" type="button">
                  <FontAwesomeIcon icon={faTimes} className="text-white" />
                </button>
              </div>
              
              {/* Statut badge */}
              <div className="absolute bottom-0 right-6 translate-y-1/2">
                <span className={`px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2 ${
                  editingEtape.statut === 'TERMINE' ? 'bg-emerald-500 text-white' :
                  editingEtape.statut === 'EN_COURS' ? 'bg-blue-500 text-white' :
                  editingEtape.statut === 'REJETE' ? 'bg-red-500 text-white' :
                  'bg-amber-500 text-white'
                }`}>
                  <FontAwesomeIcon icon={statusColors[editingEtape.statut as keyof typeof statusColors]?.icon || faClock} />
                  {editingEtape.statut.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Toggle Type */}
            <div className="px-6 pt-8 pb-4 bg-gradient-to-b from-neutral-50 to-white border-b border-neutral-100">
              <div className="flex items-center gap-3 p-1 bg-neutral-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setNewEtape({ ...newEtape, estCondition: false })}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                    !newEtape.estCondition 
                      ? 'bg-white shadow-md text-blue-600' 
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  <FontAwesomeIcon icon={faFlag} />
                  Action
                </button>
                <button
                  type="button"
                  onClick={() => setNewEtape({ ...newEtape, estCondition: true, assigneA: '' })}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                    newEtape.estCondition 
                      ? 'bg-white shadow-md text-purple-600' 
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  <FontAwesomeIcon icon={faCodeBranch} />
                  Condition
                </button>
              </div>
            </div>

            {/* Messages d'erreur/succès */}
            {errorMessage.type && (
              <div className="px-6 pt-4">
                <div className={`px-5 py-4 rounded-xl flex items-start gap-4 shadow-lg animate-slideInDown border-2 ${
                  errorMessage.type === 'success' 
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 text-green-900' 
                    : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300 text-red-900'
                }`}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    errorMessage.type === 'success' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-red-500 text-white'
                  }`}>
                    <FontAwesomeIcon 
                      icon={errorMessage.type === 'success' ? faCheckCircle : faExclamationTriangle} 
                      className="w-5 h-5" 
                    />
                  </div>
                  <div className="flex-1">
                    <div className={`font-bold text-base mb-1 ${
                      errorMessage.type === 'success' ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {errorMessage.type === 'success' ? 'Succès !' : 'Erreur de validation'}
                    </div>
                    <div 
                      className={`text-sm whitespace-pre-line ${
                        errorMessage.type === 'success' ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {errorMessage.text}
                    </div>
                  </div>
                  <button
                    onClick={() => setErrorMessage({ type: null, text: '' })}
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-opacity-20 transition-colors ${
                      errorMessage.type === 'success' 
                        ? 'text-green-700 hover:bg-green-200' 
                        : 'text-red-700 hover:bg-red-200'
                    }`}
                    aria-label="Fermer"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Contenu */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[45vh]">
              {newEtape.estCondition ? (
                // Formulaire condition
                <div className="space-y-5">
                  <div className="relative">
                    <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                      <span className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faQuestion} className="text-purple-600 text-xs" />
                      </span>
                      Texte de la condition
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newEtape.condition}
                      onChange={(e) => setNewEtape({ ...newEtape, condition: e.target.value })}
                      className="w-full px-4 py-3 bg-purple-50 border-2 border-purple-100 rounded-xl focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all"
                      placeholder="Ex: Le document est-il validé ?"
                    />
                  </div>

                  {/* Exécuter la condition après quelle étape */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                      <span className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faArrowRight} className="text-violet-600 text-xs" />
                      </span>
                      Exécuter la condition après l'étape
                    </label>
                    <select
                      value={newEtape.etapePrecedenteId}
                      onChange={(e) => setNewEtape({ ...newEtape, etapePrecedenteId: e.target.value })}
                      className="w-full px-4 py-3 bg-violet-50 border-2 border-violet-200 rounded-xl focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    >
                      <option value="">Immédiat (aucune étape précise)</option>
                      {workflows.filter(w => w.id !== editingEtape?.id).map(w => (
                        <option key={w.id} value={w.id}>
                          {w.estCondition ? `[Condition] ${(w.etape || '').substring(0, 40)}` : w.etape}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-neutral-500 mt-1.5">
                      Indiquez après quelle étape du workflow cette condition doit être évaluée.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl border-2 border-emerald-100">
                      <label className="flex items-center gap-2 text-sm font-semibold text-emerald-700 mb-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                          <FontAwesomeIcon icon={faCheckCircle} className="text-white text-xs" />
                        </span>
                        Si OUI
                      </label>
                      <select
                        value={newEtape.actionSiVrai}
                        onChange={(e) => setNewEtape({ ...newEtape, actionSiVrai: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white border-2 border-emerald-200 rounded-xl text-sm focus:border-emerald-400"
                      >
                        <option value="">Sélectionner →</option>
                        {workflows.filter(w => !w.estCondition && w.id !== editingEtape.id).map(w => (
                          <option key={w.id} value={w.id}>{w.etape}</option>
                        ))}
                      </select>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl border-2 border-red-100">
                      <label className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-2">
                        <span className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                          <FontAwesomeIcon icon={faTimesCircle} className="text-white text-xs" />
                        </span>
                        Si NON
                      </label>
                      <select
                        value={newEtape.actionSiFaux}
                        onChange={(e) => setNewEtape({ ...newEtape, actionSiFaux: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white border-2 border-red-200 rounded-xl text-sm focus:border-red-400"
                      >
                        <option value="">Sélectionner →</option>
                        {workflows.filter(w => !w.estCondition && w.id !== editingEtape.id).map(w => (
                          <option key={w.id} value={w.id}>{w.etape}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                // Formulaire action
                <div className="space-y-5">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                      <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faFlag} className="text-blue-600 text-xs" />
                      </span>
                      Nom de l'étape
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newEtape.etape}
                      onChange={(e) => setNewEtape({ ...newEtape, etape: e.target.value })}
                      className="w-full px-4 py-3 bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all"
                      placeholder="Ex: Validation du directeur"
                    />
                  </div>

                  {/* Filtres par entités (direction, division, bureau, etc.) */}
                  <div className="space-y-2.5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Filtrer par organisation
                    </span>
                    {filterLevels.map((level, i) => {
                      const parentId = i === 0 ? null : assignFilterIds[i - 1] ?? null;
                      const options =
                        i === 0
                          ? entiteOrganisationnelleService.getDirectionsForFilters()
                          : parentId
                            ? entiteOrganisationnelleService
                                .getEntitiesByParent(parentId)
                                .filter((e) => e.type === level.code)
                                .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                            : [];
                      const selectedId = assignFilterIds[i] ?? null;
                      const isLocked = shouldLockFilterLevel(i, level.code);
                      
                      return (
                        <div key={level.code}>
                          <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
                            {level.libelleSingulier}
                            {isLocked && <span className="ml-1 text-blue-600 font-normal">(verrouillé)</span>}
                          </label>
                          <SearchableSelect
                            options={options.map((e) => ({ value: e.id, label: e.nom }))}
                            value={selectedId ?? ''}
                            onChange={(id) => handleFilterChange(id, i, isLocked)}
                            disabled={isLocked}
                            emptyOption={
                              isLocked 
                                ? 'Direction verrouillée selon votre rôle'
                                : `Tous les ${level.libellePluriel.toLowerCase()}`
                            }
                            searchPlaceholder={`Rechercher un(e) ${level.libelleSingulier.toLowerCase()}...`}
                            className={isLocked ? 'opacity-75 bg-gray-50' : ''}
                          />
                        </div>
                      );
                    })}
                  </div>
                  
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                      <span className="w-6 h-6 rounded-lg bg-cyan-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faUser} className="text-cyan-600 text-xs" />
                      </span>
                      Assigner à
                      <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      options={filteredAssignableUsers.map((u) => ({
                        value: u.id,
                        label: `${u.nom} (${u.email || ''}) — ${u.role?.replace('_', ' ') || ''}`,
                        avatarUrl: u.photoUrl,
                        avatarLabel: u.nom?.charAt(0)?.toUpperCase() || '?',
                      }))}
                      value={newEtape.assigneA}
                      onChange={(v) => setNewEtape({ ...newEtape, assigneA: v })}
                      emptyOption={
                        filteredAssignableUsers.length === 0
                          ? 'Aucun agent pour les filtres sélectionnés'
                          : 'Sélectionner un utilisateur'
                      }
                      searchPlaceholder="Rechercher par nom ou email..."
                    />
                    <p className="text-xs text-neutral-500 mt-1.5">
                      La liste est filtrée selon la direction / division / bureau ci-dessus. 
                      {isDirecteur || isDirecteurGeneral 
                        ? " En tant que directeur, vous voyez tous les agents de votre direction." 
                        : " Les rôles disponibles dépendent du niveau sélectionné."}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faListUl} className="text-amber-600 text-xs" />
                        </span>
                        Ordre
                      </label>
                      <input
                        type="number"
                        value={newEtape.ordre}
                        onChange={(e) => setNewEtape({ ...newEtape, ordre: e.target.value })}
                        className="w-full px-4 py-3 bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all"
                        placeholder="1"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faHourglassHalf} className="text-emerald-600 text-xs" />
                        </span>
                        Durée (h)
                      </label>
                      <input
                        type="number"
                        value={newEtape.dureeEstimee}
                        onChange={(e) => setNewEtape({ ...newEtape, dureeEstimee: e.target.value })}
                        className="w-full px-4 py-3 bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition-all"
                        placeholder="2"
                        min="0"
                        step="0.5"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                      <span className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faBolt} className="text-violet-600 text-xs" />
                      </span>
                      Déclencheur
                    </label>
                    <div className="flex gap-2">
                      {[
                        { value: 'IMMEDIAT', label: 'Immédiat', icon: faBolt },
                        { value: 'APRES_ETAPE', label: 'Après étape', icon: faArrowRight },
                        { value: 'DATE', label: 'Date', icon: faCalendarAlt }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setNewEtape({ ...newEtape, declencheurType: opt.value as any })}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            newEtape.declencheurType === opt.value
                              ? 'bg-violet-100 text-violet-700 border-2 border-violet-300'
                              : 'bg-neutral-100 text-neutral-600 border-2 border-transparent hover:bg-neutral-200'
                          }`}
                        >
                          <FontAwesomeIcon icon={opt.icon} className="text-xs" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {newEtape.declencheurType === 'APRES_ETAPE' && (
                    <div className="animate-slideInUp">
                      <select
                        value={newEtape.etapePrecedenteId}
                        onChange={(e) => setNewEtape({ ...newEtape, etapePrecedenteId: e.target.value })}
                        className="w-full px-4 py-3 bg-violet-50 border-2 border-violet-200 rounded-xl focus:border-violet-400"
                      >
                        <option value="">Sélectionner l'étape précédente</option>
                        {workflows.filter(w => w.id !== editingEtape.id).map(w => (
                          <option key={w.id} value={w.id}>{w.etape}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {newEtape.declencheurType === 'DATE' && (
                    <div className="animate-slideInUp">
                      <MaterialDateTimeField
                        label="Date de déclenchement"
                        value={newEtape.dateDeclenchement || ''}
                        onChange={(val) => setNewEtape({ ...newEtape, dateDeclenchement: val })}
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* Commentaire */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                  <span className="w-6 h-6 rounded-lg bg-neutral-200 flex items-center justify-center">
                    <FontAwesomeIcon icon={faEdit} className="text-neutral-600 text-xs" />
                  </span>
                  Commentaire
                </label>
                <textarea
                  value={newEtape.commentaire}
                  onChange={(e) => setNewEtape({ ...newEtape, commentaire: e.target.value })}
                  className="w-full px-4 py-3 bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:border-neutral-400 transition-all resize-none"
                  rows={2}
                  placeholder="Notes ou instructions..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gradient-to-t from-neutral-100 to-neutral-50 border-t border-neutral-200 flex justify-between">
              <button
                onClick={() => { handleDeleteWorkflow(editingEtape.id); resetEditForm(); }}
                className="px-4 py-2.5 text-red-600 hover:bg-red-50 border-2 border-red-200 rounded-xl font-medium transition-colors flex items-center gap-2"
                type="button"
              >
                <FontAwesomeIcon icon={faTrash} />
                Supprimer
              </button>
              <div className="flex gap-3">
                <button
                  onClick={resetEditForm}
                  className="px-5 py-2.5 text-neutral-600 hover:bg-neutral-200 rounded-xl font-medium transition-colors"
                  type="button"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSubmitting}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
                  type="button"
                >
                  {editSubmitting ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      Enregistrement…
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSave} />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        </BodyPortal>
      )}
    </div>
  );
};

export default Workflow;
