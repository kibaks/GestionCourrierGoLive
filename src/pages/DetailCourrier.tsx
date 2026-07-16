import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { courrierService } from '../services/courrierService';
import { userService } from '../services/userService';
import { directionService } from '../services/directionService';
import { entiteOrganisationnelleService } from '../services/entiteOrganisationnelleService';
import { entiteTypeService } from '../services/entiteTypeService';
import { adminService } from '../services/adminService';
import { Courrier, Assignation, WorkflowEtape, WorkflowDecision, Role, Priorite, Utilisateur, CategorieFichier, TypeCourrier, SensCourrier, TypeEntiteOrganisationnelle, Annotation, StatutCourrier } from '../types';
import { categorieFichierService } from '../services/categorieFichierService';
import { laravelApiService } from '../services/laravelApiService';
import { formulaireCourrierService, FormStructure } from '../services/formulaireCourrierService';
import { taskCompletionService } from '../services/taskCompletionService';
import { realTimeTaskSyncService } from '../services/realTimeTaskSyncService';
import { generateAccusePdf } from '../services/accuseReceptionService';
import { notificationService } from '../services/notificationService';
import {
  isSecretaireDG,
  getOrientationTargets,
  getDefaultOrientationTarget,
  getHierarchicalSuperior,
  type OrientationTarget
} from '../services/orientationService';
import { simpleNotificationService } from '../services/simpleNotificationService';
import { store } from '../store/store';
import { fetchCourriers } from '../store/slices/courriersSlice';
import SearchableSelect from '../components/SearchableSelect';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Déclaration pour le gestionnaire de statut global
declare global {
  interface Window {
    courrierStatusManager?: {
      markAsOpened: (courrierId: string) => Promise<void>;
      markAsAnnotated: (courrierId: string) => Promise<void>;
      markAsInTreatment: (courrierId: string) => Promise<void>;
      markAsCompleted: (courrierId: string) => Promise<void>;
      updateStatus: (courrierId: string, action: 'OUVERTURE' | 'ANNOTATION' | 'TRAITEMENT' | 'TERMINE') => Promise<void>;
    };
  }
}
import { 
  faBuilding, 
  faUsers, 
  faLayerGroup,
  faFolder,
  faFolderOpen,
  faFolderPlus,
  faFile,
  faFileAlt,
  faFilePdf,
  faFileWord,
  faFileExcel,
  faFilePowerpoint,
  faFileImage,
  faSearch,
  faPlus,
  faTimes,
  faEdit,
  faTrash,
  faDownload,
  faEye,
  faExternalLinkAlt,
  faList,
  faCheckDouble,
  faDiagramProject,
  faUserCheck,
  faClock,
  faXmark,
  faCheckCircle,
  faPlay,
  faTimesCircle,
  faCheck,
  faHourglassHalf,
  faArrowRight,
  faExclamationTriangle,
  faCircleCheck,
  faCodeBranch,
  faQuestion,
  faUpload,
  faCompass,
  faRoute,
  faChevronRight,
  faChevronDown,
  faEnvelope,
  faEnvelopeOpen,
  faInfoCircle,
  faUser,
  faLock,
  faCalendar,
  faTag,
  faAt,
  faPhone,
  faLink,
  faMapMarkerAlt,
  faGlobe,
  faExpand,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faRotateLeft,
  faRotateRight,
  faSpinner,
  faFlag,
  faBolt,
  faSave,
  faCalendarAlt
} from '@fortawesome/free-solid-svg-icons';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import WordEditor from '../components/WordEditor';
import ExcelEditor from '../components/ExcelEditor';
import CustomDialog, { DialogOptions } from '../components/CustomDialog';
import { MaterialDateTimeField } from '../components/MaterialDateTimeField';

// Couleurs des statuts workflow (aligné Workflow.tsx)
const workflowStatusColors: Record<string, { bg: string; badge: string; icon: typeof faClock }> = {
  EN_ATTENTE: { bg: 'from-amber-400 to-amber-500', badge: 'bg-amber-100 text-amber-700', icon: faClock },
  EN_COURS: { bg: 'from-blue-500 to-blue-600', badge: 'bg-blue-100 text-blue-700', icon: faPlay },
  TERMINE: { bg: 'from-emerald-500 to-emerald-600', badge: 'bg-emerald-100 text-emerald-700', icon: faCheckCircle },
  REJETE: { bg: 'from-red-500 to-red-600', badge: 'bg-red-100 text-red-700', icon: faTimesCircle }
};

/** Formate une durée en heures en "X j Y h" ou "X h" ou "X min" */
function formatDureeHeures(heures: number): string {
  if (heures < 1/60) return '< 1 min';
  if (heures < 1) return `${Math.round(heures * 60)} min`;
  if (heures < 24) return `${Math.round(heures * 10) / 10} h`;
  const j = Math.floor(heures / 24);
  const h = Math.round((heures % 24) * 10) / 10;
  return h > 0 ? `${j} j ${h} h` : `${j} j`;
}

/** Pour une étape EN_COURS avec dateDebut + dureeEstimee : reste en ms (positif = dans le temps, négatif = retard) */
function getTempsRestantMs(etape: WorkflowEtape): number | null {
  if (etape.statut !== 'EN_COURS' || !etape.dateDebut || etape.dureeEstimee == null) return null;
  const debut = new Date(etape.dateDebut).getTime();
  const finPrevue = debut + etape.dureeEstimee * 60 * 60 * 1000;
  return finPrevue - Date.now();
}

/** Retourne "Dans le temps" | "En retard" pour une étape EN_COURS (ou null) */
function getDelaiLabel(etape: WorkflowEtape): 'Dans le temps' | 'En retard' | null {
  const restant = getTempsRestantMs(etape);
  if (restant === null) return null;
  return restant >= 0 ? 'Dans le temps' : 'En retard';
}

/** Libellé lisible du rôle */
function getRoleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    [Role.SUPER_ADMIN]: 'Super admin',
    [Role.SECRETAIRE]: 'Secrétaire',
    [Role.DIRECTEUR_GENERAL]: 'Directeur général',
    [Role.DIRECTEUR]: 'Directeur',
    [Role.CHEF_SERVICE]: 'Chef de service',
    [Role.AGENT]: 'Agent'
  };
  return labels[role] ?? role;
}

/** Direction, service ou sous-service de l'agent assigné (pour affichage) */
function getAgentEntiteLabel(u: Utilisateur): string | null {
  if (u.entiteId) {
    const entity = entiteOrganisationnelleService.getEntityById(u.entiteId);
    if (entity) {
      if (entity.type === 'sous-service') return `Sous-service : ${entity.nom}`;
      if (entity.type === 'service') return `Service : ${entity.nom}`;
      if (entity.type === 'direction_generale' || entity.type === 'direction') return `Direction : ${entity.nom}`;
      return entity.nom;
    }
  }
  if (u.direction && u.service) return `Direction : ${u.direction} — Service : ${u.service}`;
  if (u.service) return `Service : ${u.service}`;
  if (u.direction) return `Direction : ${u.direction}`;
  return null;
}

const DetailCourrier: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  
  // États pour le courrier et les données associées
  const [courrier, setCourrier] = useState<Courrier | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowEtape[]>([]);
  const [assignations, setAssignations] = useState<Assignation[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [dossiersFichiers, setDossiersFichiers] = useState<CategorieFichier[]>([]);
  const [expandedDossiers, setExpandedDossiers] = useState<Set<string>>(new Set());
  const [showViewFileModal, setShowViewFileModal] = useState(false);
  const [viewFileData, setViewFileData] = useState<{ fichier: CategorieFichier; url: string; loadDone?: boolean } | null>(null);
  const [imagePreviewSize, setImagePreviewSize] = useState<{ w: number; h: number } | null>(null);
  const [imagePreviewZoom, setImagePreviewZoom] = useState(1);
  const [imagePreviewRotation, setImagePreviewRotation] = useState<0 | 90 | 180 | 270>(0);
  const [imagePreviewFit, setImagePreviewFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [drawerFilterSelectionIds, setDrawerFilterSelectionIds] = useState<(string | null)[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [showCurrentAnimation, setShowCurrentAnimation] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingCourrier, setLoadingCourrier] = useState(true);
  const [tasksTimeline, setTasksTimeline] = useState<any[]>([]);
  const [drawerFilterEntityType, setDrawerFilterEntityType] = useState('ALL');
  const [drawerFilterEntityId, setDrawerFilterEntityId] = useState('ALL');
  const [services, setServices] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState<'view' | 'edit' | false>(false);
  const [listCourriers, setListCourriers] = useState<any[]>([]);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [extraFieldsConfig, setExtraFieldsConfig] = useState<any>(null);
  const [accuseGeneratedInSession, setAccuseGeneratedInSession] = useState(false);
  const [accuseGeneratedForAssignations, setAccuseGeneratedForAssignations] = useState<Set<string>>(new Set());
  const [isCourrierOrientedToDG, setIsCourrierOrientedToDG] = useState(false);
  const [isCourrierOrientedToDirector, setIsCourrierOrientedToDirector] = useState(false);
  const [orientationTargets, setOrientationTargets] = useState<OrientationTarget[]>([]);
  const [selectedOrientationTargetId, setSelectedOrientationTargetId] = useState<string>('');
  const [orienting, setOrienting] = useState(false);
  const [showInlineAnnotation, setShowInlineAnnotation] = useState(false);
  const [newAnnotationContent, setNewAnnotationContent] = useState('');
  const [newAnnotationType, setNewAnnotationType] = useState<'MINUTE' | 'NOTE' | 'COMMENTAIRE'>('COMMENTAIRE');
  const [annotationSubmitting, setAnnotationSubmitting] = useState(false);
  const [annotationResponseDecision, setAnnotationResponseDecision] = useState<WorkflowDecision | undefined>(undefined);

  // ── États modal "Retour d'étape" ──────────────────────────────────────
  const [retourEtape, setRetourEtape] = useState<WorkflowEtape | null>(null);
  const [retourMessage, setRetourMessage] = useState('');
  const [retourDecision, setRetourDecision] = useState<WorkflowDecision | undefined>(undefined);
  const [retourFichier, setRetourFichier] = useState<File | null>(null);
  const [retourSubmitting, setRetourSubmitting] = useState(false);

  // ── États pour la création inline de workflow (pattern liste) ────────
  const [wfRows, setWfRows] = useState<any[]>([]);
  const [wfSaving, setWfSaving] = useState(false);
  const [wfAssignFilterIds, setWfAssignFilterIds] = useState<(string | null)[]>([]);

  // Verrouillage des filtres selon le rôle de l'utilisateur
  const wfIsDirecteur = user?.role === Role.DIRECTEUR;
  const wfIsDirecteurGeneral = user?.role === Role.DIRECTEUR_GENERAL;
  const wfIsChefService = user?.role === Role.CHEF_SERVICE;
  const wfIsSuperAdmin = user?.role === Role.SUPER_ADMIN;

  const wfShouldLockFilterLevel = (levelIndex: number, levelCode: string): boolean => {
    if (wfIsSuperAdmin) return false;
    if (wfIsDirecteurGeneral) return false;
    if (wfIsDirecteur) {
      // Le directeur a sa direction verrouillée
      return levelCode === 'direction';
    }
    if (wfIsChefService) {
      // Le chef de service/bureau a sa direction et division verrouillées
      return levelCode === 'direction' || levelCode === 'division' || levelCode === 'service';
    }
    return false;
  };

  const wfHandleFilterChange = (id: string, index: number, isLocked: boolean) => {
    if (isLocked) return;
    setWfAssignFilterIds(prev => {
      const next = [...prev];
      while (next.length <= index) next.push(null);
      next[index] = id || null;
      for (let j = index + 1; j < next.length; j++) next[j] = null;
      return next;
    });
  };

  // Initialiser les filtres selon la portée de l'utilisateur
  useEffect(() => {
    if (!user || wfIsSuperAdmin) return;
    const levels = entiteTypeService.getActiveTypesForFilters();
    if ((wfIsDirecteur || wfIsDirecteurGeneral) && user.direction) {
      const directions = entiteOrganisationnelleService.getDirectionsForFilters();
      const userDir = directions.find(d => d.nom === user.direction);
      if (userDir) {
        setWfAssignFilterIds(prev => {
          const next = [...prev];
          if (!next[0]) next[0] = userDir.id;
          return next;
        });
      }
    }
    if (wfIsChefService && user.entiteId) {
      const entite = entiteOrganisationnelleService.getEntityById(user.entiteId);
      if (entite) {
        // Trouver la direction parente et la division parente
        const ancestors = entiteOrganisationnelleService.getEntityHierarchy(entite.id);
        const dirAncestor = ancestors.find(a => a.type === 'direction');
        const divAncestor = ancestors.find(a => a.type === 'division' || a.type === 'service');
        setWfAssignFilterIds(prev => {
          const next = [...prev];
          if (dirAncestor && !next[0]) next[0] = dirAncestor.id;
          const dirIdx = levels.findIndex(l => l.code === 'direction');
          const divIdx = levels.findIndex(l => l.code === 'division' || l.code === 'service');
          if (divAncestor && divIdx >= 0) { while (next.length <= divIdx) next.push(null); next[divIdx] = divAncestor.id; }
          // Pré-remplir le niveau de l'entité de l'utilisateur
          const entiteIdx = levels.findIndex(l => l.code === entite.type);
          if (entiteIdx >= 0) { while (next.length <= entiteIdx) next.push(null); next[entiteIdx] = entite.id; }
          return next;
        });
      }
    }
  }, [user, wfIsDirecteur, wfIsDirecteurGeneral, wfIsChefService, wfIsSuperAdmin]);

  // Utilisateurs assignables filtrés par entités organisationnelles
  const wfFilteredAssignableUsers = React.useMemo(() => {
    let result = adminService.getAllUsers().filter(u => u.actif !== false);
    const lastSelectedId = [...wfAssignFilterIds].reverse().find(id => !!id) || null;

    // Pour les directeurs, toujours filtrer selon leur direction
    if (!lastSelectedId && (wfIsDirecteur || wfIsDirecteurGeneral) && user?.direction) {
      const directions = entiteOrganisationnelleService.getDirectionsForFilters();
      const userDir = directions.find(d => d.nom === user.direction);
      if (userDir) {
        const allowedIds = new Set(entiteOrganisationnelleService.getDescendantEntityIds(userDir.id));
        result = result.filter(u => {
          if (u.entiteId && allowedIds.has(u.entiteId)) return true;
          if (!u.entiteId) {
            const rootName = userDir.nom?.trim().toLowerCase() || '';
            if (u.service?.trim().toLowerCase() === rootName) return true;
            if (u.direction?.trim().toLowerCase() === rootName) return true;
          }
          return false;
        });
      }
    }

    if (lastSelectedId) {
      const rootEntity = entiteOrganisationnelleService.getEntityById(lastSelectedId);
      if (rootEntity) {
        const allowedIds = new Set(entiteOrganisationnelleService.getDescendantEntityIds(rootEntity.id));
        result = result.filter(u => {
          if (u.entiteId && allowedIds.has(u.entiteId)) return true;
          if (!u.entiteId) {
            const rootName = rootEntity.nom?.trim().toLowerCase() || '';
            if (u.service?.trim().toLowerCase() === rootName) return true;
            if (u.direction?.trim().toLowerCase() === rootName) return true;
          }
          return false;
        });

        // Filtrage par rôle selon le type d'entité (sauf pour directeurs et DG)
        if (!wfIsDirecteur && !wfIsDirecteurGeneral && !wfIsSuperAdmin) {
          const rolesParType: Record<string, Role[]> = {
            direction_generale: [Role.DIRECTEUR_GENERAL, Role.SECRETAIRE, Role.DIRECTEUR, Role.CHEF_SERVICE, Role.AGENT],
            direction: [Role.DIRECTEUR, Role.SECRETAIRE, Role.CHEF_SERVICE, Role.AGENT],
            division: [Role.CHEF_SERVICE, Role.AGENT],
            service: [Role.CHEF_SERVICE, Role.AGENT],
            'sous-service': [Role.CHEF_SERVICE, Role.AGENT],
            bureau: [Role.CHEF_SERVICE, Role.AGENT],
          };
          const rolesCibles = rolesParType[rootEntity.type as keyof typeof rolesParType];
          if (rolesCibles?.length) result = result.filter(u => rolesCibles.includes(u.role));
        }
      }
    }
    return result;
  }, [wfAssignFilterIds, user, wfIsDirecteur, wfIsDirecteurGeneral, wfIsSuperAdmin]);

  // État pour le dialog personnalisé
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

  // Fonctions pour gérer le dialog
  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  const showAlert = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', title?: string) => {
    setDialog({
      isOpen: true,
      message,
      type,
      title: title || (type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : type === 'warning' ? 'Attention' : 'Information'),
      confirmText: 'OK',
      cancelText: '',
      onConfirm: () => closeDialog(),
      onCancel: undefined
    });
  };

  const showConfirm = (
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'warning',
    title?: string
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        message,
        type,
        title: title || 'Confirmation',
        confirmText: 'Confirmer',
        cancelText: 'Annuler',
        onConfirm: () => {
          closeDialog();
          resolve(true);
        },
        onCancel: () => {
          closeDialog();
          resolve(false);
        }
      });
    });
  };

  /**
   * Détermine si l'utilisateur connecté peut terminer une assignation,
   * et fournit un message d'aide selon son rôle.
   */
  const getAssignationTerminationStatus = (_assignation: Assignation): {
    canTerminate: boolean;
    hint: string;
    buttonLabel: string;
  } => {
    if (!user) return { canTerminate: false, hint: '', buttonLabel: 'Terminer' };
    const role = user.role;

    if (role === Role.SECRETAIRE) {
      // Vérification 1 : états UI mis à jour par les useEffects
      const orientedByState = isCourrierOrientedToDG || isCourrierOrientedToDirector;
      // Vérification 2 : le secrétaire a créé au moins une assignation vers quelqu'un d'autre
      const orientedByAssignation = assignations.some(
        a => String(a.assignePar) === String(user.id) && String(a.assigneA) !== String(user.id)
      );
      // Vérification 3 : statut du courrier indique une orientation déjà faite
      const orientedByStatut = !!courrier && ['DG', 'DIRECTION', 'ORIENTE', 'ORIENTE_DG', 'ORIENTE_DIRECTEUR', 'ASSIGNE', 'EN_COURS_TRAITEMENT', 'EN_TRAITEMENT', 'TRAITE'].includes(courrier.statut);
      const oriented = orientedByState || orientedByAssignation || orientedByStatut;
      return {
        canTerminate: oriented,
        hint: oriented ? 'Courrier orienté ✓' : 'Orientez d\'abord le courrier vers le DG ou un Directeur',
        buttonLabel: 'Terminer'
      };
    }

    if (role === Role.DIRECTEUR_GENERAL) {
      const hasCreatedSteps = workflows.some(w => w.creePar === user.id);
      return {
        canTerminate: hasCreatedSteps,
        hint: hasCreatedSteps
          ? 'Étapes de workflow créées ✓'
          : 'Créez au moins une étape de workflow pour les agents',
        buttonLabel: 'Terminer'
      };
    }

    if (role === Role.DIRECTEUR || role === Role.CHEF_SERVICE) {
      const hasCreatedSteps = workflows.some(w => w.creePar === user.id);
      const hasAnnotations = annotations.some(
        a => (a as any).auteur === user.id || (a as any).creePar === user.id
      );
      const ok = hasCreatedSteps || hasAnnotations;
      return {
        canTerminate: ok,
        hint: ok
          ? 'Tâches assignées / annotation créée ✓'
          : 'Créez des étapes de workflow ou ajoutez une annotation',
        buttonLabel: 'Terminer'
      };
    }

    if (role === Role.AGENT) {
      const mySteps = workflows.filter(w => w.assigneA === user.id);
      const allDone = mySteps.length === 0 || mySteps.every(w => w.statut === 'TERMINE');
      const remaining = mySteps.filter(w => w.statut !== 'TERMINE').length;
      return {
        canTerminate: allDone,
        hint: allDone
          ? (mySteps.length === 0 ? 'Aucune étape assignée' : 'Toutes vos étapes sont terminées ✓')
          : `Terminez d'abord vos ${remaining} étape(s) assignée(s)`,
        buttonLabel: 'Terminer'
      };
    }

    // SUPER_ADMIN et autres rôles : toujours autorisé
    return { canTerminate: true, hint: '', buttonLabel: 'Terminer' };
  };

  const loadWorkflows = async (): Promise<WorkflowEtape[]> => {
    if (!id) return [];
    try {
      const workflowsData = await (courrierService as any).getWorkflowsByCourrierAsync?.(id);
      const result = Array.isArray(workflowsData) ? workflowsData : courrierService.getWorkflowsByCourrier(id);
      setWorkflows(result);
      return result;
    } catch (error) {
      console.error('Erreur lors du rechargement des workflows:', error);
      const result = courrierService.getWorkflowsByCourrier(id);
      setWorkflows(result);
      return result;
    }
  };

  // ── Hiérarchie : trouver le supérieur direct d'un utilisateur ──────────
  const getSuperiorId = (userId: string, etapeCreePar: string): string | null => {
    const u = userService.getUserById(userId);
    if (!u) return null;
    const hierarchy = [Role.AGENT, Role.CHEF_SERVICE, Role.DIRECTEUR, Role.DIRECTEUR_GENERAL];
    const myIdx = hierarchy.indexOf(u.role as Role);
    if (myIdx < 0 || myIdx >= hierarchy.length - 1) return etapeCreePar;
    const superiorRole = hierarchy[myIdx + 1];
    const allUsers = userService.getAllUsers ? userService.getAllUsers() : [];
    const candidate = allUsers.find(s =>
      s.role === superiorRole &&
      (s.direction === u.direction || !u.direction) &&
      s.id !== userId
    );
    return candidate?.id ?? etapeCreePar;
  };

  // ── Vérifier depuis le backend si toutes les étapes sont terminées → TRAITE ──
  const checkAndMarkCourrierTraite = async () => {
    if (!id) return;
    try {
      // 1. Recharger les workflows depuis le backend (statuts réels)
      const freshWorkflows = await laravelApiService.getWorkflowEtapesByCourrier(id);
      const actionSteps = freshWorkflows.filter((w: any) => !w.estCondition);
      console.debug('[checkTraite] courrierId:', id, '— nb étapes:', actionSteps.length);
      console.debug('[checkTraite] étapes:', actionSteps.map((s: any) => ({ etape: s.etape, statut: s.statut })));
      if (actionSteps.length === 0) return;

      const allDone = actionSteps.every((w: any) => w.statut === 'TERMINE' || w.statut === 'REJETE');
      console.debug('[checkTraite] allDone:', allDone);

      if (!allDone) return;

      // 2. Vérifier le statut actuel du courrier depuis le backend
      const freshCourrier = await laravelApiService.getCourrierById(id);
      console.debug('[checkTraite] statut courrier frais:', freshCourrier?.statut);
      if (!freshCourrier || freshCourrier.statut === StatutCourrier.ARCHIVE || freshCourrier.statut === StatutCourrier.TRAITE) return;

      // 3. Mettre à jour via l'endpoint dédié
      console.debug('[checkTraite] → PATCH statut TRAITE pour courrier', id);
      await laravelApiService.updateCourrierStatut(id, StatutCourrier.TRAITE);
      showAlert('Toutes les étapes sont terminées — courrier marqué comme traité ✓', 'success');
      await loadCourrier();
    } catch (e: any) {
      console.error('[checkTraite] Erreur:', e?.message ?? e);
      showAlert('Impossible de marquer le courrier comme traité : ' + (e?.message ?? 'erreur inconnue'), 'error');
    }
  };

  // ── Soumettre un retour d'étape ──────────────────────────────────────
  const handleSubmitRetour = async () => {
    if (!retourEtape || !retourMessage.trim() || !user) return;
    setRetourSubmitting(true);
    try {
      await laravelApiService.addWorkflowResponse(retourEtape.id, {
        message: retourMessage.trim(),
        decision: retourDecision,
        auteurId: user.id,
        auteurNom: user.nom,
      });

      // Recharger l'étape pour avoir les responses à jour
      const refreshed = await (courrierService as any).getWorkflowsByCourrierAsync?.(id);
      const updatedEtapes: WorkflowEtape[] = Array.isArray(refreshed) ? refreshed : workflows;
      setWorkflows(updatedEtapes);
      const updatedEtape = updatedEtapes.find(e => e.id === retourEtape.id) ?? retourEtape;
      setRetourEtape(updatedEtape);

      const isCreator = String(retourEtape.creePar) === String(user.id);
      const superiorId = getSuperiorId(user.id, String(retourEtape.creePar));
      const courrierNum = courrier?.numero ?? retourEtape.courrierId;
      const etapeLabel = retourEtape.etape;

      if (isCreator && retourDecision === 'AVIS_FAVORABLE') {
        // ── Créateur valide : terminer l'étape + notifier l'assigné ─────
        await courrierService.updateWorkflowEtapeAsync(retourEtape.id, { statut: 'TERMINE', dateFin: new Date() });
        await checkAndMarkCourrierTraite();
        // Notifier l'assigné de la validation
        notificationService.createNotification({
          userId: retourEtape.assigneA,
          type: 'workflow',
          title: '✅ Étape validée',
          message: `Votre retour sur "${etapeLabel}" (${courrierNum}) a été validé — étape terminée.`,
          relatedId: retourEtape.courrierId,
          relatedType: 'courrier',
          priority: 'normal',
          actionUrl: `/courriers/${retourEtape.courrierId}`,
        }).catch(() => {});
        showAlert('Étape validée et marquée comme terminée', 'success');
        setRetourEtape(null);

      } else if (retourDecision === 'A_REVOIR') {
        // ── À revoir : notifier l'assigné de corriger + rappel 48h ──────
        notificationService.createNotification({
          userId: retourEtape.assigneA,
          type: 'workflow',
          title: '↩ Retour à corriger',
          message: `Votre retour sur "${etapeLabel}" (${courrierNum}) doit être revu. Message : ${retourMessage.trim().slice(0, 120)}${retourMessage.trim().length > 120 ? '…' : ''}`,
          relatedId: retourEtape.courrierId,
          relatedType: 'courrier',
          priority: 'high',
          actionUrl: `/courriers/${retourEtape.courrierId}`,
        }).catch(() => {});
        // Rappel automatique après 48h si toujours pas de correction
        const rappel48h = new Date(Date.now() + 48 * 60 * 60 * 1000);
        notificationService.createNotification({
          userId: retourEtape.assigneA,
          type: 'rappel',
          title: '⏰ Rappel : retour en attente',
          message: `Rappel : votre retour sur "${etapeLabel}" (${courrierNum}) est en attente de correction depuis 48h.`,
          relatedId: retourEtape.courrierId,
          relatedType: 'courrier',
          priority: 'high',
          actionUrl: `/courriers/${retourEtape.courrierId}`,
          metadata: { scheduledAt: rappel48h.toISOString(), type: 'rappel_retour' },
        }).catch(() => {});
        showAlert('Retour enregistré — l\'assigné sera notifié et relancé si nécessaire', 'success');

      } else {
        // ── Retour soumis par l'assigné : si AVIS_FAVORABLE, terminer l'étape ──────
        if (retourDecision === 'AVIS_FAVORABLE') {
          await courrierService.updateWorkflowEtapeAsync(retourEtape.id, { statut: 'TERMINE', dateFin: new Date() });
        }
        // Notifier supérieur + rappel 24h si pas de validation
        if (superiorId && superiorId !== user.id) {
          notificationService.createNotification({
            userId: superiorId,
            type: 'workflow',
            title: '📋 Retour en attente de validation',
            message: `${user.nom} a soumis son retour sur "${etapeLabel}" (${courrierNum}). Veuillez valider ou demander une correction.`,
            relatedId: retourEtape.courrierId,
            relatedType: 'courrier',
            priority: 'normal',
            actionUrl: `/courriers/${retourEtape.courrierId}`,
          }).catch(() => {});
          // Rappel automatique au supérieur après 24h si pas de validation
          const rappel24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
          notificationService.createNotification({
            userId: superiorId,
            type: 'rappel',
            title: '⏰ Rappel : retour en attente de validation',
            message: `Rappel : le retour de ${user.nom} sur "${etapeLabel}" (${courrierNum}) attend votre validation depuis 24h.`,
            relatedId: retourEtape.courrierId,
            relatedType: 'courrier',
            priority: 'high',
            actionUrl: `/courriers/${retourEtape.courrierId}`,
            metadata: { scheduledAt: rappel24h.toISOString(), type: 'rappel_validation' },
          }).catch(() => {});
        }
        // Confirmer à l'auteur du retour
        notificationService.createNotification({
          userId: user.id,
          type: 'workflow',
          title: '📤 Retour soumis',
          message: `Votre retour sur "${etapeLabel}" (${courrierNum}) a été soumis. Votre supérieur sera relancé si nécessaire.`,
          relatedId: retourEtape.courrierId,
          relatedType: 'courrier',
          priority: 'low',
          actionUrl: `/courriers/${retourEtape.courrierId}`,
        }).catch(() => {});
        showAlert('Retour soumis — votre supérieur sera notifié et relancé si nécessaire', 'success');
      }

      // ── Vérifier dans tous les cas si toutes les étapes sont terminées ──
      await checkAndMarkCourrierTraite();

      setRetourMessage('');
      setRetourDecision(undefined);
      setRetourFichier(null);
    } catch (e) {
      showAlert('Erreur lors de la soumission du retour', 'error');
    } finally {
      setRetourSubmitting(false);
    }
  };

  // Synchroniser types d'entités et entités organisationnelles depuis l'API
  useEffect(() => {
    const loadOrgData = async () => {
      if (laravelApiService.isConfigured()) {
        await entiteTypeService.syncFromApi();
        await entiteOrganisationnelleService.refreshFromApi();
      } else {
        directionService.initializeDemoData();
        entiteOrganisationnelleService.initializeDemoData();
      }
      setServices(directionService.getAllServices());
      setEntities(entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false));
    };
    void loadOrgData();
  }, []);

  /** Niveaux de filtre dynamiques pour le tiroir : types d'entités actifs uniquement (recalculés à chaque rendu pour libellés à jour après sync) */
  const drawerFilterLevels = entiteTypeService.getActiveTypesForFilters();
  const drawerFilterLevelCodes = drawerFilterLevels.map(t => t.code).join(',');

  /** Synchroniser les filtres du tiroir à partir des sélections par niveau */
  useEffect(() => {
    let direction = '';
    let service = '';
    let sousService = '';
    const levels = entiteTypeService.getActiveTypesForFilters();
    for (let i = 0; i < drawerFilterSelectionIds.length; i++) {
      const id = drawerFilterSelectionIds[i];
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
      setDrawerFilterEntityType('direction');
      const dirEntity = entiteOrganisationnelleService.getAllEntities().find(e => e.nom === direction);
      setDrawerFilterEntityId(dirEntity?.id || 'ALL');
    } else if (service) {
      setDrawerFilterEntityType('service');
      const srvEntity = entiteOrganisationnelleService.getAllEntities().find(e => e.nom === service);
      setDrawerFilterEntityId(srvEntity?.id || 'ALL');
    } else if (sousService) {
      setDrawerFilterEntityType('sous-service');
      const ssEntity = entiteOrganisationnelleService.getAllEntities().find(e => e.nom === sousService);
      setDrawerFilterEntityId(ssEntity?.id || 'ALL');
    } else {
      setDrawerFilterEntityType('ALL');
      setDrawerFilterEntityId('ALL');
    }
  }, [drawerFilterSelectionIds, drawerFilterLevelCodes]);

  // Détecter si le courrier est déjà orienté vers le DG (identique à ListeCourriers)
  useEffect(() => {
    if (!id) { setIsCourrierOrientedToDG(false); return; }
    const dgUser = adminService.getDirecteurGeneral();
    if (!dgUser) { setIsCourrierOrientedToDG(false); return; }
    courrierService.getAssignationsByCourrier(id).then(assignations => {
      const oriented = assignations.some(a => String(a.assigneA) === String(dgUser.id));
      setIsCourrierOrientedToDG(oriented);
    }).catch(() => setIsCourrierOrientedToDG(false));
  }, [id, assignations.length]);

  // Détecter si le courrier est déjà orienté vers un directeur (identique à ListeCourriers)
  useEffect(() => {
    if (!id || !user || user.role !== Role.SECRETAIRE || !user.direction || user.direction === 'Direction Générale') {
      setIsCourrierOrientedToDirector(false);
      return;
    }
    const director = getAppropriateDirector(user);
    if (!director) { setIsCourrierOrientedToDirector(false); return; }
    courrierService.getAssignationsByCourrier(id).then(assignations => {
      const oriented = assignations.some(a => String(a.assigneA) === String(director.id));
      setIsCourrierOrientedToDirector(oriented);
    }).catch(() => setIsCourrierOrientedToDirector(false));
  }, [id, user?.id, user?.direction, assignations.length]);

  // Initialiser le sélecteur d'orientation avec les cibles disponibles
  useEffect(() => {
    if (!user) {
      setOrientationTargets([]);
      setSelectedOrientationTargetId('');
      return;
    }
    const targets = getOrientationTargets(user);
    setOrientationTargets(targets);

    // Si une cible est déjà sélectionnée et existe toujours, la garder
    if (selectedOrientationTargetId && targets.some(t => t.value === selectedOrientationTargetId)) {
      return;
    }

    // Sinon proposer la cible par défaut (DG pour sec DG, Directeur pour sec direction)
    const defaultTarget = getDefaultOrientationTarget(user);
    if (defaultTarget && targets.some(t => t.value === defaultTarget.id)) {
      setSelectedOrientationTargetId(defaultTarget.id);
    } else if (targets.length > 0) {
      setSelectedOrientationTargetId(targets[0].value);
    } else {
      setSelectedOrientationTargetId('');
    }
  }, [user?.id, user?.direction, user?.role, assignations.length]);

  useEffect(() => {
    if (courrier) {
      const sens = (courrier as Courrier & { sens?: SensCourrier }).sens ?? SensCourrier.ENTRANT;
      const config = formulaireCourrierService.getConfig();
      const fieldsForType = config[sens]?.[courrier.type] || [];
      setExtraFieldsConfig(fieldsForType);

      formulaireCourrierService.getConfigAsync().then(updatedConfig => {
        const updatedFieldsForType = updatedConfig[sens]?.[courrier.type] || [];
        if (JSON.stringify(updatedFieldsForType) !== JSON.stringify(fieldsForType)) {
          setExtraFieldsConfig(updatedFieldsForType);
        }
      }).catch(() => {
        setExtraFieldsConfig(formulaireCourrierService.getConfig()[sens]?.[courrier.type] || []);
      });
    }
  }, [courrier]);

  const loadCourrier = async () => {
    if (!id || !user) {
      setLoadingCourrier(false);
      return;
    }

    setLoadingCourrier(true);

    let courrierData = courrierService.getCourrierById(id);
    
    // Si le courrier n'est pas trouvé localement (store Redux vide après refresh), charger depuis l'API
    if (!courrierData && laravelApiService.isConfigured()) {
      try {
        console.log('[DetailCourrier] Courrier non trouvé localement, chargement depuis API...');
        await store.dispatch(fetchCourriers(undefined));
        // Réessayer de trouver le courrier après le chargement
        courrierData = courrierService.getCourrierById(id);
      } catch (e) {
        console.error('[DetailCourrier] Erreur lors du chargement des courriers depuis API:', e);
      }
    }

    // Dernier recours : charger le courrier individuel directement par ID (cas d'un accès depuis notification)
    if (!courrierData && laravelApiService.isConfigured()) {
      try {
        console.log('[DetailCourrier] Tentative chargement individuel du courrier:', id);
        courrierData = await laravelApiService.getCourrierById(id) ?? undefined;
      } catch (e) {
        console.error('[DetailCourrier] Erreur chargement individuel:', e);
      }
    }
    
    // Vérifier l'accès APRÈS avoir chargé le courrier (évite les faux refus après refresh)
    // SUPER_ADMIN, DG et SECRETAIRE ont accès à tous les courriers (aligné avec le backend CourrierAccessService)
    if (courrierData && user.role !== Role.SUPER_ADMIN && user.role !== Role.DIRECTEUR_GENERAL && user.role !== Role.SECRETAIRE) {
      // L'expéditeur (enregistrePar) a toujours accès à son propre courrier
      const isExpéditeur = courrierData.enregistrePar === user.id;
      // Un utilisateur ayant une notification liée à ce courrier a toujours accès
      const notifLocales = simpleNotificationService.getByUserId(user.id, { limit: 200 });
      const hasNotifForCourrier = notifLocales.some(n => n.relatedId === id);

      if (!isExpéditeur && !hasNotifForCourrier) {
        const accessibles = await courrierService.getAccessibleCourriers(user.id, user);
        const isAccessible = accessibles.some(c => String(c.id) === String(id));
        if (!isAccessible) {
          setLoadingCourrier(false);
          navigate('/courriers');
          return;
        }
      }
    }
    
    if (courrierData) {
      setCourrier({ ...courrierData });
      // Charger les assignations de manière asynchrone
      let assignationsData: Assignation[] = [];
      try {
        assignationsData = await courrierService.getAssignationsByCourrier(id);
        // Nettoyer le mot "undefined" présent dans les instructions des anciennes assignations
        assignationsData = assignationsData.map(a =>
          a.instructions && a.instructions.includes('undefined')
            ? { ...a, instructions: a.instructions.replace(/\s*undefined\s*/g, ' ').replace(/\s{2,}/g, ' ').trim() }
            : a
        );
        setAssignations(assignationsData);
      } catch (error) {
        console.error('Erreur lors du chargement des assignations:', error);
        setAssignations([]);
      }
      // Charger les étapes workflow depuis Firestore (créées dans l'onglet Annotations/Workflow)
      let workflowsLoaded: WorkflowEtape[] = [];
      try {
        const workflowsData = await (courrierService as any).getWorkflowsByCourrierAsync?.(id);
        workflowsLoaded = Array.isArray(workflowsData) ? workflowsData : courrierService.getWorkflowsByCourrier(id);
        setWorkflows(workflowsLoaded);
      } catch (error) {
        console.error('Erreur lors du chargement des étapes workflow:', error);
        // Utiliser les données locales en cas d'erreur API
        try {
          const localWorkflows = courrierService.getWorkflowsByCourrier(id);
          workflowsLoaded = localWorkflows;
          setWorkflows(localWorkflows);
          console.log('🔄 [DetailCourrier] Utilisation des données workflow locales suite à l\'erreur API');
        } catch (localError) {
          console.error('Erreur même avec les données locales:', localError);
          setWorkflows([]); // Tableau vide en dernier recours
        }
      }
      // Charger les annotations
      let annotationsData: Annotation[] = [];
      try {
        annotationsData = await courrierService.getAnnotationsByCourrier(id);
        setAnnotations(annotationsData);
      } catch (error) {
        console.error('Erreur lors du chargement des annotations:', error);
        setAnnotations([]);
      }

      // Si le courrier est orienté/en attente/assigné et a des annotations ou des étapes workflow existantes, le passer en traitement
      const statutsOrientation = [StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ORIENTE_DG, StatutCourrier.ORIENTE_DIRECTEUR, StatutCourrier.ASSIGNE];
      const hasActivity = annotationsData.length > 0 || workflowsLoaded.length > 0;

      // Terminer automatiquement les assignations dont l'assigné a réellement produit une annotation ou une étape
      if (hasActivity) {
        // Résoudre un identifiant utilisateur en clé stable (email si trouvé, sinon l'ID)
        const resolveUserKey = (uid: unknown): string => {
          const idStr = String(uid ?? '');
          if (!idStr) return '';
          const u = userService.getUserById(idStr);
          return u?.email ? String(u.email).toLowerCase() : idStr;
        };
        const auteursActivite = new Set<string>();
        annotationsData.forEach(a => { const k = resolveUserKey(a.auteur); if (k) auteursActivite.add(k); });
        workflowsLoaded.forEach(w => { const k = resolveUserKey((w as any).creePar); if (k) auteursActivite.add(k); });
        console.log('🔎 [DetailCourrier] Auteurs activité:', Array.from(auteursActivite), '| Assignés:', assignationsData.map(a => `${a.assigneA}→${resolveUserKey(a.assigneA)} (${a.statut})`));
        const assignationsATerminer = assignationsData.filter(a =>
          (a.statut === 'EN_ATTENTE' || a.statut === 'EN_COURS') &&
          auteursActivite.has(resolveUserKey(a.assigneA))
        );
        if (assignationsATerminer.length > 0) {
          try {
            await Promise.all(
              assignationsATerminer.map(a => courrierService.updateAssignation(a.id, { statut: 'TERMINE' }))
            );
            console.log(`✅ [DetailCourrier] ${assignationsATerminer.length} assignation(s) terminée(s) automatiquement (l'assigné a déjà agi)`);
            // Mettre à jour l'état local immédiatement
            const idsTermines = new Set(assignationsATerminer.map(a => a.id));
            assignationsData = assignationsData.map(a =>
              idsTermines.has(a.id) ? { ...a, statut: 'TERMINE' as any } : a
            );
            setAssignations(assignationsData);
          } catch (e) {
            console.error('Erreur lors de la terminaison automatique des assignations:', e);
          }
        }
      }

      if (statutsOrientation.includes(courrierData.statut) && hasActivity) {
        try {
          await courrierService.updateCourrier(courrierData.id, { statut: StatutCourrier.EN_TRAITEMENT });
          console.log('✅ [DetailCourrier] Courrier avec annotations existantes mis en traitement');
          // Recharger le courrier pour mettre à jour l'affichage (forcer le statut si le cache est en retard)
          const updatedCourrier = courrierService.getCourrierById(courrierData.id);
          setCourrier({ ...(updatedCourrier || courrierData), statut: StatutCourrier.EN_TRAITEMENT });
        } catch (e) {
          console.error('Erreur lors du changement de statut du courrier:', e);
        }
      }

      // Charger les fichiers avec attente et gestion d'erreur
      try {
        await loadDossiersFichiers(id);
      } catch (err) {
        console.error('[DetailCourrier] Erreur lors du chargement des fichiers:', err);
      }
    } else {
      console.warn('[DetailCourrier] Courrier non trouvé après tentative de chargement');
    }
    setLoadingCourrier(false);
  };

  const loadDossiersFichiers = async (courrierId: string | undefined) => {
    if (!courrierId) return;
    const df = await categorieFichierService.getCategoriesFichiersByCourrier(courrierId);
    setDossiersFichiers(df);
  };

  // Charger le courrier au montage et quand l'ID change
  useEffect(() => {
    if (id) {
      loadCourrier();
    }
  }, [id]);

  // Fonction pour détecter les actions automatiques basées sur le statut
  const detectActionsFromStatus = (statut: string, courrier: Courrier): Array<{
    type: string;
    title: string;
    description: string;
    date?: Date;
  }> => {
    const actions: Array<{
      type: string;
      title: string;
      description: string;
      date?: Date;
    }> = [];

    // Détecter les actions selon le statut
    if (statut === 'ORIENTE_DG') {
      actions.push({
        type: 'orientation',
        title: 'Orientation vers le DG',
        description: 'Le courrier a été orienté vers le Directeur Général',
        date: courrier.dateReception
      });
    } else if (statut === 'ORIENTE_DIRECTEUR') {
      actions.push({
        type: 'orientation',
        title: 'Orientation vers le Directeur',
        description: 'Le courrier a été orienté vers un Directeur',
        date: courrier.dateReception
      });
    } else if (statut.includes('ORIENTE') || statut.includes('ASSIGNE')) {
      actions.push({
        type: 'orientation',
        title: 'Orientation automatique détectée',
        description: 'Le courrier a été orienté vers une direction',
        date: courrier.dateReception
      });
    }

    if (statut.includes('OUVERT')) {
      actions.push({
        type: 'ouverture',
        title: 'Ouverture automatique détectée',
        description: 'Le courrier a été ouvert par un utilisateur',
        date: courrier.dateReception
      });
    }

    if (statut.includes('ANNOTATION')) {
      actions.push({
        type: 'annotation',
        title: 'Annotation automatique détectée',
        description: 'Une annotation a été ajoutée au courrier',
        date: courrier.dateReception
      });
    }

    if (statut.includes('EN_COURS_TRAITEMENT') || statut === 'EN_TRAITEMENT') {
      actions.push({
        type: 'traitement',
        title: 'Traitement automatique détecté',
        description: 'Le courrier est en cours de traitement',
        date: courrier.dateReception
      });
    }

    if (statut === 'TRAITE' || statut === 'CLOTURE' || statut === 'ARCHIVE') {
      actions.push({
        type: 'finalisation',
        title: 'Finalisation automatique détectée',
        description: 'Le courrier a été traité et finalisé',
        date: courrier.dateReception
      });
    }

    console.log(`🔍 [Timeline] Actions détectées pour statut "${statut}":`, actions);
    return actions;
  };

  // Fonction pour charger la timeline des tâches
  const loadTasksTimeline = async (workflowsOverride?: WorkflowEtape[]) => {
    if (!id || !courrier) return;
    
    setLoadingTasks(true);
    try {
      const timeline: any[] = [];
      const workflowsToUse = workflowsOverride || workflows;

      // Le courrier est considéré orienté si une assignation existe vers quelqu'un d'autre que le secrétaire
      const statutsOrientes = ['ORIENTE_DG', 'ORIENTE_DIRECTEUR', 'ASSIGNE', 'EN_TRAITEMENT', 'TRAITE', 'ARCHIVE'];
      const courrierEstOriente = statutsOrientes.includes(courrier.statut);

      // ── 1. Enregistrement ──────────────────────────────────────────────────
      const createdByUser = userService.getUserById((courrier as any).createdBy || (courrier as any).creePar);
      timeline.push({
        id: 'enregistrement-courrier',
        type: 'enregistrement',
        date: (courrier as any).dateCreation || new Date(),
        title: 'Enregistrement',
        description: `Courrier ${courrier.numero} enregistré`,
        status: 'TERMINE',
        user: createdByUser,
      });

      // ── 1b. Orientation attendue (courrier enregistré mais pas encore orienté) ─
      if (courrier.statut === StatutCourrier.ENREGISTRE) {
        const expectedTarget = getAppropriateDirector(user) || adminService.getDirecteurGeneral();
        timeline.push({
          id: 'orientation-attendue',
          type: 'assignation',
          date: new Date(),
          title: 'Orientation en attente',
          description: expectedTarget
            ? `Action attendue : orienter le courrier vers ${expectedTarget.nom}`
            : 'Action attendue : orienter le courrier vers le DG ou un Directeur',
          status: 'EN_ATTENTE',
          user: expectedTarget,
        });
      }

      // ── 2. Assignations (orientations) — auto-terminer si courrier orienté ─
      assignations.forEach((assignation) => {
        const assignedUser = userService.getUserById(assignation.assigneA);
        const assignedByUser = userService.getUserById(assignation.assignePar);
        if (!assignedUser || !assignedByUser) return;

        // Auto-terminer : si le courrier est orienté et que l'assignation est celle
        // du secrétaire vers le DG/Directeur, elle est considérée TERMINE
        const effectiveStatut =
          courrierEstOriente && assignation.statut !== 'TERMINE'
            ? 'TERMINE'
            : assignation.statut;

        timeline.push({
          id: `assign-${assignation.id}`,
          type: 'assignation',
          date: assignation.dateAssignation,
          title: `Orienté vers ${assignedUser.nom}`,
          description: assignation.instructions?.replace(/undefined/g, '').trim() || '',
          status: effectiveStatut,
          user: assignedUser,
          assignedBy: assignedByUser,
        });
      });

      // ── 3. Étapes workflow ─────────────────────────────────────────────────
      workflowsToUse
        .filter(e => e && e.id && !e.estCondition)
        .forEach((etape) => {
          const assignedUser = etape.assigneA ? userService.getUserById(etape.assigneA) : null;
          const creatorUser = etape.creePar ? userService.getUserById(etape.creePar) : null;
          timeline.push({
            id: `workflow-${etape.id}`,
            type: 'workflow',
            date: etape.dateDebut || etape.createdAt || new Date(),
            title: etape.etape || 'Étape sans titre',
            description: etape.commentaire || (creatorUser ? `Par ${creatorUser.nom}` : ''),
            status: etape.statut,
            user: assignedUser,
            creator: creatorUser,
          });
        });

      // ── 4. Annotations ────────────────────────────────────────────────────
      annotations
        .filter(a => a && a.id)
        .forEach((annotation) => {
          const authorUser = userService.getUserById(annotation.auteur);
          timeline.push({
            id: `annotation-${annotation.id}`,
            type: 'annotation',
            date: annotation.dateCreation || new Date(),
            title: `Annotation${annotation.type ? ` — ${annotation.type}` : ''}`,
            description: annotation.contenu || '',
            status: 'TERMINE',
            user: authorUser,
          });
        });

      // ── Tri chronologique ─────────────────────────────────────────────────
      timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setTasksTimeline(timeline);
    } catch (error) {
      console.error('Erreur lors du chargement de la timeline:', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  const getFileIcon = (extension?: string) => {
    if (!extension) return faFileAlt;
    switch (extension.toLowerCase()) {
      case 'pdf': return faFilePdf;
      case 'doc':
      case 'docx': return faFileWord;
      case 'xls':
      case 'xlsx': return faFileExcel;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return faFileImage;
      default: return faFileAlt;
    }
  };

  const getFileIconColor = (extension?: string) => {
    if (!extension) return 'text-gray-600';
    switch (extension.toLowerCase()) {
      case 'pdf': return 'text-red-600';
      case 'doc':
      case 'docx': return 'text-blue-600';
      case 'xls':
      case 'xlsx': return 'text-green-600';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  };

  const openViewFileModal = async (fichier: CategorieFichier) => {
    setViewFileData({ fichier, url: '', loadDone: false });
    setImagePreviewSize(null);
    setImagePreviewZoom(1);
    setImagePreviewRotation(0);
    setImagePreviewFit('contain');
    setEditMode(false);
    setShowViewFileModal(true);
    try {
      const url = await categorieFichierService.getFileDisplayUrl(fichier);
      setViewFileData(prev => (prev ? { ...prev, url: url || '', loadDone: true } : prev));
    } catch {
      setViewFileData(prev => (prev ? { ...prev, url: '', loadDone: true } : prev));
    }

    // AR automatique : si l'utilisateur actuel est destinataire d'une orientation,
    // générer un accusé de réception en arrière-plan et notifier l'orienteur.
    tryAutoGenerateAccuseReception().catch(() => {});
  };

  const handleDownloadFile = async (fichier: CategorieFichier) => {
    try {
      const blob = await laravelApiService.fetchFichierBlob(fichier.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fichier.nom;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showAlert('Impossible de télécharger : ' + msg, 'error', 'Téléchargement');
    }
  };

  const handleDownloadViewedFile = async () => {
    if (!viewFileData?.fichier) return;
    if (viewFileData.url?.startsWith('blob:')) {
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
      showAlert('Impossible de telecharger : ' + msg, 'error', 'Telechargement');
    }
  };

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
      showAlert("Impossible d'ouvrir : " + msg, 'error', 'Ouvrir');
    }
  };

  const closeViewFileModal = () => {
    setShowViewFileModal(false);
    setViewFileData(null);
    setImagePreviewSize(null);
    setImagePreviewZoom(1);
    setImagePreviewRotation(0);
    setImagePreviewFit('contain');
    setEditMode(false);
  };

  const handleDeleteFile = async (fichierId: string) => {
    if (!id) return;
    const confirmed = await showConfirm(
      'Êtes-vous sûr de vouloir supprimer ce fichier ?',
      'warning',
      'Confirmation de suppression'
    );
    if (confirmed) {
      categorieFichierService.deleteCategorieFichier(fichierId);
      loadDossiersFichiers(id);
      if (viewFileData?.fichier.id === fichierId) {
        closeViewFileModal();
      }
      showAlert('Fichier supprimé avec succès', 'success');
    }
  };

  // Fonction utilitaire pour trouver le directeur approprié (identique à ListeCourriers)
  const getAppropriateDirector = (u: Utilisateur | null) => {
    if (!u) return null;
    const isDG = Boolean(
      u.role === Role.SECRETAIRE && (
        u.direction === 'Direction Générale' ||
        u.direction === 'Direction Generale' ||
        u.direction?.toLowerCase().includes('général') ||
        (u.email === 'secretaire@example.com' && u.nom === 'Marie Dupont')
      )
    );
    if (isDG) return adminService.getDirecteurGeneral();
    if (u.role === Role.SECRETAIRE && u.direction && u.direction !== 'Direction Générale') {
      return adminService.getAllUsers().find(x =>
        x.role === Role.DIRECTEUR && x.direction === u.direction && x.actif
      ) ?? null;
    }
    return adminService.getDirecteurGeneral();
  };

  // Orienter le courrier vers la cible sélectionnée (DG, Directeur, Chef de service, Agent)
  // overrideTargetId : permet d'orienter directement vers une cible sans passer par le state
  const handleOrientCourrier = async (overrideTargetId?: string) => {
    if (!id || !user || !courrier) return;

    if (courrier.statut !== StatutCourrier.ENREGISTRE) {
      showAlert('Seuls les courriers enregistrés peuvent être orientés.', 'warning');
      return;
    }

    const effectiveTargetId = overrideTargetId || selectedOrientationTargetId;
    if (!effectiveTargetId) {
      showAlert('Veuillez sélectionner un destinataire pour l\'orientation.', 'warning');
      return;
    }

    const target = orientationTargets.find(t => t.value === effectiveTargetId);
    if (!target) {
      showAlert('Destinataire introuvable.', 'error');
      return;
    }

    const alreadyOriented = assignations.some(a =>
      String(a.assigneA) === String(target.user.id) &&
      String(a.assignePar) === String(user.id)
    );
    if (alreadyOriented) {
      showAlert(`Ce courrier est déjà orienté vers ${target.user.nom}.`, 'info');
      return;
    }

    setOrienting(true);
    try {
      let statutCourrier: StatutCourrier | undefined;
      if (target.user.role === Role.DIRECTEUR_GENERAL) statutCourrier = StatutCourrier.ORIENTE_DG;
      else if (target.user.role === Role.DIRECTEUR) statutCourrier = StatutCourrier.ORIENTE_DIRECTEUR;
      else statutCourrier = StatutCourrier.ASSIGNE;

      await courrierService.createAssignation({
        courrierId: id,
        assigneA: target.user.id,
        assignePar: user.id,
        statut: 'EN_ATTENTE',
        instructions: `Orientation par le secrétariat vers ${target.label}`
      });
      if (statutCourrier) {
        await courrierService.updateCourrier(id, { statut: statutCourrier }).catch(() => {});
      }

      // Rafraîchir les assignations et les états d'orientation
      const updated = await courrierService.getAssignationsByCourrier(id);
      setAssignations(updated);
      const dgUser = adminService.getDirecteurGeneral();
      if (dgUser) setIsCourrierOrientedToDG(updated.some(a => String(a.assigneA) === String(dgUser.id)));
      const director = getAppropriateDirector(user);
      if (director) setIsCourrierOrientedToDirector(updated.some(a => String(a.assigneA) === String(director.id)));

      // Complétion de tâche pour le secrétaire
      const completionCheck = taskCompletionService.checkTaskCompletion(user, { orientationDone: true });
      if (completionCheck.isComplete) {
        const orientationEntry = {
          id: `orientation-${Date.now()}`,
          type: 'orientation',
          date: new Date(),
          title: 'Orientation effectuée',
          description: `Courrier orienté vers ${target.label}`,
          status: 'TERMINE',
          user: user,
          assignedBy: user,
          isLoading: false,
          priority: 'high',
          actionRequise: 'Orientation complétée'
        };
        setTasksTimeline(prev => [...prev, orientationEntry]);
        realTimeTaskSyncService.notifyTaskCompleted(
          id,
          courrier.numero || '',
          user.id,
          user.role,
          `Orientation vers ${target.label}`,
          completionCheck.reason
        );
        showAlert(`Courrier ${courrier.numero} orienté vers ${target.label}.\n\n${completionCheck.reason}`, 'success');
      } else {
        showAlert(`Courrier ${courrier.numero} orienté vers ${target.label}.`, 'success');
      }
    } catch (err: any) {
      console.error('Erreur orientation:', err);
      showAlert(err?.message || 'Erreur lors de l\'orientation.', 'error');
    } finally {
      setOrienting(false);
    }
  };

  // Fonction pour annoter un fichier
  const handleAnnotateFile = async (fichierId: string) => {
    if (!id || !user) return;
    
    try {
      const file = dossiersFichiers.find(f => f.id === fichierId);
      if (!file) {
        showAlert('Fichier non trouvé', 'error');
        return;
      }

      // Créer une copie annotée du fichier
      const annotatedFileName = `annoté_${file.nom}`;
      const annotatedContent = `Fichier annoté\n\nOriginal: ${file.nom}\nDate d'annotation: ${new Date().toLocaleString('fr-FR')}\nAnnoté par: ${user.nom} (${user.role})\n\n[Contenu de l'annotation à ajouter]`;
      
      const blob = new Blob([annotatedContent], { type: 'text/plain;charset=utf-8' });
      const annotatedFile = new File([blob], annotatedFileName, { type: 'text/plain' });

      // Créer le fichier annoté dans le même dossier
      await categorieFichierService.createFichier(id!, annotatedFile.name, annotatedFile, file.parentId, user.id, annotatedFile.size, false);
      
      // Mettre à jour l'affichage
      await loadDossiersFichiers(id);
      showAlert('Fichier annoté avec succès', 'success');
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de l\'annotation du fichier', 'error');
    }
  };

  const commitInlineAnnotation = async () => {
    const trimmed = newAnnotationContent.trim();
    if (!trimmed || !user?.id || !courrier?.id || annotationSubmitting) return;
    setAnnotationSubmitting(true);
    try {
      const created = await courrierService.createAnnotation({
        courrierId: courrier.id,
        auteur: user.id,
        contenu: trimmed,
        type: newAnnotationType,
      });
      setAnnotations(prev => [...prev, created]);
      if (window.courrierStatusManager?.markAsAnnotated) {
        window.courrierStatusManager.markAsAnnotated(courrier.id).catch(() => {});
      }
      const isManagement = taskCompletionService.completesByAnnotationOrStep(user.role);
      if (isManagement) {
        realTimeTaskSyncService.notifyTaskCompleted(courrier.id, courrier.numero || '', user.id, user.role, 'annotation_created', 'Annotation créée');
      }

      // ── Mises à jour OPTIMISTES : l'UI réagit instantanément, les appels API
      //    partent en arrière-plan (pas de rechargement complet bloquant) ──────────
      const bgTasks: Promise<unknown>[] = [];

      // Si le courrier est en attente DG ou orienté, le passer en traitement quand une annotation est créée
      const doitPasserEnTraitement =
        courrier.statut === StatutCourrier.EN_ATTENTE_DG ||
        courrier.statut === StatutCourrier.ORIENTE_DG ||
        courrier.statut === StatutCourrier.ORIENTE_DIRECTEUR ||
        courrier.statut === StatutCourrier.ASSIGNE;
      if (doitPasserEnTraitement) {
        // Mise à jour locale immédiate
        setCourrier(prev => prev ? { ...prev, statut: StatutCourrier.EN_TRAITEMENT } : prev);
        bgTasks.push(
          courrierService.updateCourrier(courrier.id, { statut: StatutCourrier.EN_TRAITEMENT })
            .catch(e => console.error('Erreur lors du changement de statut du courrier:', e))
        );
      }

      // Si le DG a une assignation active, la terminer automatiquement
      if (user.role === Role.DIRECTEUR_GENERAL) {
        const dgAssignation = assignations.find(
          a => String(a.assigneA) === String(user.id) && a.statut !== 'TERMINE'
        );
        if (dgAssignation) {
          // Mise à jour locale immédiate
          setAssignations(prev => prev.map(a =>
            a.id === dgAssignation.id ? { ...a, statut: 'TERMINE' as any } : a
          ));
          bgTasks.push(
            courrierService.updateAssignation(dgAssignation.id, { statut: 'TERMINE' })
              .catch(e => console.error('Erreur lors de la terminaison automatique de l\'assignation:', e))
          );
        }
      }

      // Fermer le formulaire et confirmer immédiatement (UI instantanée)
      setShowInlineAnnotation(false);
      setNewAnnotationContent('');
      setAnnotationResponseDecision(undefined);
      showAlert('Annotation ajoutée avec succès', 'success');

      // Rafraîchir la timeline en arrière-plan une fois les écritures terminées
      Promise.allSettled(bgTasks).then(() => {
        loadTasksTimeline().catch(() => {});
      });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de l\'ajout de l\'annotation', 'error');
    } finally {
      setAnnotationSubmitting(false);
    }
  };

  // ── Fonctions pour la création inline de workflow (pattern liste) ─────
  const canCreateWfStep = user && (user.role === Role.DIRECTEUR_GENERAL || user.role === Role.DIRECTEUR || user.role === Role.CHEF_SERVICE);

  const addWfRow = () => {
    const newRow = {
      id: `wf-new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      etape: '',
      assigneA: '',
      commentaire: '',
      dureeEstimee: '',
      declencheurType: 'IMMEDIAT' as const,
      etapePrecedenteId: '',
      dateDeclenchement: '',
      estCondition: false,
      condition: '',
      actionSiVrai: '',
      actionSiFaux: '',
      saved: false,
      saving: false,
    };
    setWfRows(prev => [...prev, newRow]);
  };

  const removeWfRow = (rowId: string) => {
    setWfRows(prev => prev.filter(r => r.id !== rowId));
  };

  const updateWfRow = (rowId: string, field: string, value: any) => {
    setWfRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value, saved: false } : r));
  };

  const saveWfRow = async (rowId: string) => {
    const row = wfRows.find(r => r.id === rowId);
    if (!row || !courrier || !user) return;

    // Validation
    if (row.estCondition) {
      if (!row.condition.trim()) { showAlert('Texte de condition manquant', 'error'); return; }
      if (!row.actionSiVrai) { showAlert('Action "Si OUI" manquante', 'error'); return; }
      if (!row.actionSiFaux) { showAlert('Action "Si NON" manquante', 'error'); return; }
    } else {
      if (!row.etape.trim()) { showAlert('Nom de l\'étape manquant', 'error'); return; }
      if (!row.assigneA) { showAlert('Utilisateur non assigné', 'error'); return; }
    }

    setWfRows(prev => prev.map(r => r.id === rowId ? { ...r, saving: true } : r));
    try {
      const ordre = workflows.length + wfRows.filter(r => r.saved || r.id === rowId).length;
      let declencheur;
      if (row.declencheurType === 'APRES_ETAPE' && row.etapePrecedenteId) {
        declencheur = { type: 'APRES_ETAPE' as const, etapePrecedenteId: row.etapePrecedenteId };
      } else if (row.declencheurType === 'DATE' && row.dateDeclenchement) {
        declencheur = { type: 'DATE' as const, dateDeclenchement: new Date(row.dateDeclenchement) };
      }
      const dureeEstimee = row.dureeEstimee ? parseFloat(row.dureeEstimee) : undefined;

      let created: WorkflowEtape;
      if (row.estCondition) {
        const declencheurCondition = row.etapePrecedenteId
          ? { type: 'APRES_ETAPE' as const, etapePrecedenteId: row.etapePrecedenteId }
          : undefined;
        created = await (courrierService as any).createWorkflowEtapeAsync({
          courrierId: courrier.id,
          etape: row.condition.trim(),
          statut: 'EN_ATTENTE',
          commentaire: row.commentaire?.trim() || undefined,
          creePar: user.id,
          estCondition: true,
          actionSiVrai: row.actionSiVrai,
          actionSiFaux: row.actionSiFaux,
          declencheur: declencheurCondition,
          ordre
        });
      } else {
        created = await (courrierService as any).createWorkflowEtapeAsync({
          courrierId: courrier.id,
          etape: row.etape.trim(),
          assigneA: row.assigneA,
          statut: 'EN_ATTENTE',
          commentaire: row.commentaire?.trim() || undefined,
          creePar: user.id,
          dureeEstimee,
          declencheur,
          ordre
        });
      }

      // ── Mises à jour OPTIMISTES : l'UI réagit instantanément, les appels API
      //    partent en arrière-plan (pas de rechargement complet bloquant) ──────────
      const bgTasks: Promise<unknown>[] = [];

      // Mettre à jour la liste des workflows localement immédiatement
      setWorkflows(prev => [...prev, created]);

      // Notifier immédiatement
      realTimeTaskSyncService.notifyWorkflowCreated(
        courrier.id, courrier.numero || '', user.id, user.role,
        row.estCondition ? row.condition : row.etape
      );

      // Si le courrier est en attente DG ou orienté, le passer en traitement (optimiste)
      const doitPasserEnTraitement =
        courrier.statut === StatutCourrier.EN_ATTENTE_DG ||
        courrier.statut === StatutCourrier.ORIENTE_DG ||
        courrier.statut === StatutCourrier.ORIENTE_DIRECTEUR ||
        courrier.statut === StatutCourrier.ASSIGNE;
      if (doitPasserEnTraitement) {
        setCourrier(prev => prev ? { ...prev, statut: StatutCourrier.EN_TRAITEMENT } : prev);
        bgTasks.push(
          courrierService.updateCourrier(courrier.id, { statut: StatutCourrier.EN_TRAITEMENT })
            .catch(e => console.error('Erreur lors du changement de statut:', e))
        );
      }

      // Si le DG a une assignation active, la terminer automatiquement (optimiste)
      if (user.role === Role.DIRECTEUR_GENERAL) {
        const dgAssignation = assignations.find(
          a => String(a.assigneA) === String(user.id) && a.statut !== 'TERMINE'
        );
        if (dgAssignation) {
          setAssignations(prev => prev.map(a =>
            a.id === dgAssignation.id ? { ...a, statut: 'TERMINE' as any } : a
          ));
          bgTasks.push(
            courrierService.updateAssignation(dgAssignation.id, { statut: 'TERMINE' })
              .catch(e => console.error('Erreur terminaison assignation:', e))
          );
        }
      }

      // Confirmer immédiatement (UI instantanée)
      setWfRows(prev => prev.map(r => r.id === rowId ? { ...r, saved: true, saving: false } : r));
      showAlert('Étape créée avec succès', 'success');

      // Rafraîchir les données en arrière-plan une fois les écritures terminées
      Promise.allSettled(bgTasks).then(() => {
        loadWorkflows().catch(() => {});
        loadTasksTimeline().catch(() => {});
      });
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de la création', 'error');
      setWfRows(prev => prev.map(r => r.id === rowId ? { ...r, saving: false } : r));
    }
  };

  const saveAllWfRows = async () => {
    const unsaved = wfRows.filter(r => !r.saved);
    if (unsaved.length === 0) return;
    setWfSaving(true);
    for (const row of unsaved) {
      await saveWfRow(row.id);
    }
    setWfSaving(false);
  };

  const clearWfRows = () => {
    setWfRows([]);
  };

  // Fonction pour générer un accusé à partir des fichiers chargés
  const generateAccuseFromMainDocument = async (): Promise<void> => {
    if (!id || !user || !courrier) return;
    
    try {
      // Créer le dossier "Accusés de réception" si nécessaire
      let parentId: string | undefined = currentDossierAccusesId;
      if (!parentId) {
        const newDossier = await categorieFichierService.createCategorie(id, 'Accusés de réception', undefined, user.id);
        parentId = newDossier.id;
      }

      // Passer tous les fichiers — le service sélectionne et intègre tous les fichiers rendables
      const allFiles = dossiersFichiers;
      const mainDocument = getMainDocumentForAccuse();
      const accuseFile = await generateAccusePdf(courrier, mainDocument || ({} as any), user, allFiles);

      // Créer un blob URL local pour affichage immédiat (contourne l'appel API)
      const blobUrl = URL.createObjectURL(accuseFile);

      // Enregistrer l'accusé
      const savedFile = await categorieFichierService.createFichier(id, accuseFile.name, accuseFile, parentId, user.id, accuseFile.size, true);
      
      // Mettre à jour l'affichage
      await loadDossiersFichiers(id);
      setAccuseGeneratedInSession(true);

      // Notifier l'expéditeur
      await notifyExpediteurAccuseReception(courrier);

      // Ouvrir la modale avec le blob URL local (pas besoin d'appel API supplémentaire)
      setImagePreviewSize(null);
      setImagePreviewZoom(1);
      setImagePreviewRotation(0);
      setImagePreviewFit('contain');
      setEditMode(false);
      setViewFileData({ fichier: { ...savedFile, extension: 'pdf' }, url: blobUrl, loadDone: true });
      setShowViewFileModal(true);
      
      console.log('📄 [DetailCourrier] Accusé généré à partir de tous les fichiers chargés');
    } catch (err: any) {
      console.error('Erreur lors de la génération de l\'accusé:', err);
      throw err;
    }
  };

  // Notifier l'expéditeur que l'AR est disponible
  const notifyExpediteurAccuseReception = async (c: Courrier) => {
    try {
      // Notifier l'utilisateur qui a enregistré le courrier
      if (c.enregistrePar && c.enregistrePar !== user?.id) {
        await notificationService.createNotification({
          userId: c.enregistrePar,
          type: 'courrier',
          title: 'Accusé de réception disponible',
          message: `Votre courrier "${c.numero}" a été reçu par le destinataire. L'accusé de réception est disponible.`,
          relatedId: c.id,
          relatedType: 'courrier',
          priority: 'normal',
          actionUrl: `/courriers/${c.id}`,
          metadata: {
            courrierNumero: c.numero,
            expediteur: c.expediteur,
            destinataire: c.destinataire,
            type: 'accuse_reception_disponible',
            dateGeneration: new Date().toISOString()
          }
        });
      }
    } catch (e) {
      console.warn('Erreur notification expéditeur AR:', e);
    }
  };

  // Notifier l'utilisateur qui a orienté le courrier qu'un AR a été généré
  const notifyOrientationAccuseReception = async (c: Courrier, assignation: Assignation) => {
    try {
      if (!assignation.assignePar || assignation.assignePar === user?.id) return;
      const orienteur = adminService.getUserById(assignation.assignePar);
      await notificationService.createNotification({
        userId: assignation.assignePar,
        type: 'courrier',
        title: 'Accusé de réception généré',
        message: `Le courrier "${c.numero}" a été ouvert par ${user?.nom || 'le destinataire'}. L'accusé de réception a été généré automatiquement.`,
        relatedId: c.id,
        relatedType: 'courrier',
        priority: 'normal',
        actionUrl: `/courriers/${c.id}`,
        metadata: {
          courrierNumero: c.numero,
          type: 'accuse_reception_orientation',
          dateGeneration: new Date().toISOString(),
          destinataireId: user?.id,
          destinataireNom: user?.nom,
          assignationId: assignation.id
        }
      });
    } catch (e) {
      console.warn('Erreur notification orienteur AR:', e);
    }
  };

  // Génère automatiquement un AR quand le destinataire d'une orientation ouvre un fichier
  const tryAutoGenerateAccuseReception = async () => {
    if (!id || !user || !courrier) return;

    // Identifier les assignations en attente ou en cours où l'utilisateur actuel est le destinataire
    const pendingAssignations = assignations.filter(a =>
      String(a.assigneA) === String(user.id) &&
      (a.statut === 'EN_ATTENTE' || a.statut === 'EN_COURS')
    );
    if (pendingAssignations.length === 0) return;

    for (const assignation of pendingAssignations) {
      const key = `${assignation.id || ''}-${assignation.assigneA}-${assignation.assignePar}`;
      if (accuseGeneratedForAssignations.has(key)) continue;

      try {
        // Créer le dossier "Accusés de réception" si nécessaire
        let parentId: string | undefined = currentDossierAccusesId;
        if (!parentId) {
          const newDossier = await categorieFichierService.createCategorie(id, 'Accusés de réception', undefined, user.id);
          parentId = newDossier.id;
        }

        const allFiles = dossiersFichiers;
        const mainDocument = getMainDocumentForAccuse();
        const accuseFile = await generateAccusePdf(courrier, mainDocument || ({} as any), user, allFiles);
        await categorieFichierService.createFichier(id, accuseFile.name, accuseFile, parentId, user.id, accuseFile.size, true);
        await loadDossiersFichiers(id);
        setAccuseGeneratedInSession(true);
        setAccuseGeneratedForAssignations(prev => new Set([...prev, key]));

        // Notifier celui qui a fait l'orientation
        await notifyOrientationAccuseReception(courrier, assignation);
      } catch (e) {
        console.warn('Échec génération AR automatique:', e);
      }
    }

    // Cas spécifique : courrier interne entre secrétaires
    if (
      courrier.type === TypeCourrier.INTERNE &&
      user.role === Role.SECRETAIRE &&
      courrier.enregistrePar &&
      courrier.enregistrePar !== user.id
    ) {
      const internalKey = `internal-${courrier.id}-${user.id}`;
      if (!accuseGeneratedForAssignations.has(internalKey)) {
        try {
          let parentId: string | undefined = currentDossierAccusesId;
          if (!parentId) {
            const newDossier = await categorieFichierService.createCategorie(id, 'Accusés de réception', undefined, user.id);
            parentId = newDossier.id;
          }
          const allFiles = dossiersFichiers;
          const mainDocument = getMainDocumentForAccuse();
          const accuseFile = await generateAccusePdf(courrier, mainDocument || ({} as any), user, allFiles);
          await categorieFichierService.createFichier(id, accuseFile.name, accuseFile, parentId, user.id, accuseFile.size, true);
          await loadDossiersFichiers(id);
          setAccuseGeneratedInSession(true);
          setAccuseGeneratedForAssignations(prev => new Set([...prev, internalKey]));

          await notificationService.createNotification({
            userId: courrier.enregistrePar,
            type: 'courrier',
            title: 'Accusé de réception généré (courrier interne)',
            message: `Le courrier interne "${courrier.numero}" a été ouvert par ${user.nom || 'un secrétaire'}. L'accusé de réception a été généré automatiquement.`,
            relatedId: courrier.id,
            relatedType: 'courrier',
            priority: 'normal',
            actionUrl: `/courriers/${courrier.id}`,
            metadata: {
              courrierNumero: courrier.numero,
              type: 'accuse_reception_interne',
              dateGeneration: new Date().toISOString(),
              destinataireId: user.id,
              destinataireNom: user.nom
            }
          });
        } catch (e) {
          console.warn('Échec AR automatique courrier interne:', e);
        }
      }
    }
  };

  // Fonction pour obtenir une description du type de fichier
  const getFileTypeDescription = (extension?: string): string => {
    if (!extension) return 'Type inconnu';
    
    const ext = extension.toLowerCase();
    switch (ext) {
      case 'pdf': return 'Document PDF';
      case 'doc':
      case 'docx': return 'Document Microsoft Word';
      case 'xls':
      case 'xlsx': return 'Classeur Microsoft Excel';
      case 'ppt':
      case 'pptx': return 'Présentation Microsoft PowerPoint';
      case 'txt': return 'Fichier texte';
      case 'jpg':
      case 'jpeg': return 'Image JPEG';
      case 'png': return 'Image PNG';
      case 'gif': return 'Image GIF';
      case 'bmp': return 'Image Bitmap';
      case 'webp': return 'Image WebP';
      default: return `Fichier ${ext.toUpperCase()}`;
    }
  };

  // Fonction pour vérifier si un fichier principal est chargé/scanné
  const hasMainDocument = (): boolean => {
    return dossiersFichiers.some(item => 
      item.type === 'fichier' && 
      !item.estAccuseReception && 
      !item.nom.startsWith('annoté_') &&
      !item.nom.startsWith('traité_') &&
      !item.nom.startsWith('final_')
    );
  };

  // Fonction pour récupérer le fichier principal selon le type (priorité aux documents importants)
  const getMainDocumentForAccuse = (): CategorieFichier | null => {
    const mainFiles = dossiersFichiers.filter(item => 
      item.type === 'fichier' && 
      !item.estAccuseReception && 
      !item.nom.startsWith('annoté_') &&
      !item.nom.startsWith('traité_') &&
      !item.nom.startsWith('final_')
    );

    if (mainFiles.length === 0) return null;

    // Priorité selon le type de fichier
    const typePriority = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    
    // Chercher d'abord les fichiers PDF
    let pdfFile = mainFiles.find(f => f.extension?.toLowerCase() === 'pdf');
    if (pdfFile) return pdfFile;

    // Chercher les fichiers Word
    let wordFile = mainFiles.find(f => 
      f.extension?.toLowerCase() === 'doc' || f.extension?.toLowerCase() === 'docx'
    );
    if (wordFile) return wordFile;

    // Chercher les fichiers Excel
    let excelFile = mainFiles.find(f => 
      f.extension?.toLowerCase() === 'xls' || f.extension?.toLowerCase() === 'xlsx'
    );
    if (excelFile) return excelFile;

    // Chercher les fichiers PowerPoint
    let pptFile = mainFiles.find(f => 
      f.extension?.toLowerCase() === 'ppt' || f.extension?.toLowerCase() === 'pptx'
    );
    if (pptFile) return pptFile;

    // Si aucun des types prioritaires, prendre le premier fichier image
    let imageFile = mainFiles.find(f => 
      ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(f.extension?.toLowerCase() || '')
    );
    if (imageFile) return imageFile;

    // En dernier recours, prendre le premier fichier disponible
    return mainFiles[0];
  };

  // Accusés de réception : fichiers marqués ou dans le dossier "Accusés de réception"
  const currentDossierAccusesId = dossiersFichiers.find(
    d => d.type === 'categorie' && d.nom === 'Accusés de réception'
  )?.id;
  const currentAccusésDeReception = dossiersFichiers.filter(
    d => d.type === 'fichier' && (d.estAccuseReception === true || d.parentId === currentDossierAccusesId)
  );

  const accuseFileInputRef = React.useRef<HTMLInputElement>(null);
  const handleJoindreAccuseReception = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !user || !e.target.files?.length) return;
    const file = e.target.files[0];
    e.target.value = '';
    try {
      let parentId: string | undefined = currentDossierAccusesId;
      if (!parentId) {
        const newDossier = await categorieFichierService.createCategorie(id, 'Accusés de réception', undefined, user.id);
        parentId = newDossier.id;
      }
      await categorieFichierService.createFichier(id, file.name, file, parentId, user.id, file.size, true);
      await loadDossiersFichiers(id);
      showAlert('Accusé de réception joint avec succès', 'success');
    } catch (err: any) {
      showAlert(err?.message || 'Erreur lors de l\'ajout de l\'accusé de réception', 'error');
    }
  };

  // Vérifie si l'utilisateur courant est le destinataire du courrier
  // NB: la logique doit rester cohérente avec le matching des notifications
  // dans courrierServiceFirebase (comparaison souple par inclusion) afin que
  // les secrétaires/directeurs de la direction destinataire soient bien reconnus.
  const isCurrentUserDestinataire = (): boolean => {
    if (!courrier || !user) return false;

    // DG a accès universel
    if (user.role === Role.DIRECTEUR_GENERAL) return true;

    const userNom = (user.nom || '').toLowerCase().trim();
    const userDir = (user.direction || '').toLowerCase().trim();
    const userSrv = (user.service || '').toLowerCase().trim();
    const destNom = (courrier.destinataire || '').toLowerCase().trim();
    const courDir = (courrier.direction || '').toLowerCase().trim();
    const courSrv = (courrier.service || '').toLowerCase().trim();

    // Comparaison souple : égalité OU inclusion dans un sens ou l'autre
    const softMatch = (a: string, b: string): boolean =>
      !!a && !!b && (a === b || a.includes(b) || b.includes(a));

    // Vérification par nom (personne nommément destinataire)
    if (softMatch(userNom, destNom)) return true;

    // Vérification par direction du courrier (champ structuré)
    if (softMatch(courDir, userDir)) return true;

    // Vérification par service du courrier (champ structuré)
    if (softMatch(courSrv, userSrv)) return true;

    // Vérification par le champ destinataire (texte libre) contre la direction/service de l'utilisateur
    // Cas typique : courrier adressé à "Direction Administrative et Financière" → secrétaire de cette direction
    if (softMatch(destNom, userDir)) return true;
    if (softMatch(destNom, userSrv)) return true;

    return false;
  };

  // Génération automatique d'un accusé de réception quand le DESTINATAIRE ouvre le courrier
  useEffect(() => {
    const autoGenerateAccuse = async () => {
      if (!courrier || !user || !id) return;

      // Règle métier : les accusés de réception ne concernent QUE les courriers internes
      // (communication entre la Direction Générale et les directions spécifiques).
      // Aucun accusé n'est généré pour les courriers externes (monde extérieur).
      if (courrier.type !== TypeCourrier.INTERNE) return;

      // Ne rien faire si un accusé existe déjà OU si déjà généré dans cette session
      if (currentAccusésDeReception.length > 0 || accuseGeneratedInSession) return;

      // Seul le destinataire (ou DG) déclenche l'AR
      if (!isCurrentUserDestinataire()) return;

      // Vérifier si un fichier principal est chargé/scanné
      if (!hasMainDocument()) return;

      try {
        await generateAccuseFromMainDocument();
        await loadDossiersFichiers(id);
        showAlert('Accusé de réception généré avec succès.', 'success');
      } catch (err: any) {
        console.error('Erreur auto accusé de réception:', err);
        showAlert('Erreur lors de la génération de l\'accusé de réception.', 'error');
      }
    };

    autoGenerateAccuse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courrier, user, id, dossiersFichiers.length, currentDossierAccusesId, currentAccusésDeReception.length, accuseGeneratedInSession]);

  // Charger la timeline des tâches quand les données sont prêtes
  useEffect(() => {
    if (courrier) {
      loadTasksTimeline();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courrier, id, workflows, assignations, annotations, dossiersFichiers]);

  // Souscrire aux événements de synchronisation temps réel (une seule fois)
  useEffect(() => {
    if (!id) return;

    const unsubscribe = realTimeTaskSyncService.subscribe((event) => {
      // Ne recharger que si l'événement concerne ce courrier
      if (event.courrierId === id) {
        // Recharger les annotations, workflows et la timeline
        // Recharger les annotations
        courrierService.getAnnotationsByCourrier(id).then(annotationsData => {
          setAnnotations(annotationsData);
        }).catch(() => {
          setAnnotations([]);
        });

        // Recharger les workflows (étapes)
        (courrierService as any).getWorkflowsByCourrierAsync(id).then((workflowsData: WorkflowEtape[]) => {
          setWorkflows(workflowsData);
        }).catch(() => {
          setWorkflows([]);
        });
      }
    });

    // Démarrer la surveillance temps réel
    realTimeTaskSyncService.startMonitoring();

    // Rafraîchissement périodique des annotations et workflows (toutes les 30 secondes)
    const refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        // Recharger les workflows (étapes)
        (courrierService as any).getWorkflowsByCourrierAsync(id).then((workflowsData: WorkflowEtape[]) => {
          setWorkflows(prev => {
            // Ne mettre à jour que si les données ont changé
            if (JSON.stringify(prev) !== JSON.stringify(workflowsData)) {
              return workflowsData;
            }
            return prev;
          });
        }).catch(() => {});
      }
    }, 30000);

    return () => {
      unsubscribe();
      realTimeTaskSyncService.stopMonitoring();
      clearInterval(refreshInterval);
    };
  }, [id]); // Seulement id pour éviter les re-renders cycliques

  // Fonction pour rendre l'arborescence des fichiers
  const renderTree = (): React.ReactNode => {
    if (!id) return null;
    
    const allItems = dossiersFichiers;
    
    // Séparer les éléments racine (sans parentId)
    const rootItems = allItems.filter(item => !item.parentId);
    
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
      const isExpanded = expandedDossiers.has(`folder-${item.id}`);
      const itemChildren = childrenMap.get(item.id) || [];
      const hasChildren = itemChildren.length > 0;
      
      if (item.type === 'categorie') {
        return (
          <div key={item.id} className="py-0.5 group">
            <div
              className="flex items-center gap-2 text-sm p-2 rounded-lg transition-colors hover:bg-slate-100/80"
              style={{ paddingLeft: `${currentLevel * 24}px` }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const key = `folder-${item.id}`;
                  setExpandedDossiers(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(key)) {
                      newSet.delete(key);
                    } else {
                      newSet.add(key);
                    }
                    return newSet;
                  });
                  if (!isExpanded) {
                    loadDossiersFichiers(id!);
                  }
                }}
                className="text-slate-500 hover:text-slate-700 w-4"
                title={isExpanded ? "Réduire" : "Développer"}
              >
                <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} className="text-xs" />
              </button>
              <FontAwesomeIcon icon={isExpanded ? faFolderOpen : faFolder} className="text-amber-500 text-base" />
              <span className="text-slate-700 font-medium flex-1">{item.nom}</span>
            </div>
            {hasChildren && isExpanded && (
              <div>
                {itemChildren.map(child => renderItem(child, currentLevel + 1))}
              </div>
            )}
          </div>
        );
      } else {
        // C'est un fichier
        const isAccuse = item.estAccuseReception === true || item.parentId === currentDossierAccusesId;
        return (
          <div key={item.id} className="py-0.5 group" style={{ paddingLeft: `${currentLevel * 24}px` }}>
            <div className="flex items-center gap-2 text-sm hover:bg-slate-100/80 p-2 rounded-lg transition-colors">
              <FontAwesomeIcon
                icon={getFileIcon(item.extension)}
                className={`text-base ${getFileIconColor(item.extension)}`}
              />
              <span className="text-slate-700 flex-1 truncate">{item.nom}</span>
              {isAccuse && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0" title="Accusé de réception">
                  <FontAwesomeIcon icon={faCheckDouble} className="w-3 h-3" />
                  AR
                </span>
              )}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => openViewFileModal(item)}
                  className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                  title="Visualiser/Éditer"
                >
                  <FontAwesomeIcon icon={faEye} className="text-xs" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadFile(item)}
                  className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                  title="Télécharger"
                >
                  <FontAwesomeIcon icon={faDownload} className="text-xs" />
                </button>
                {!isAccuse && (
                  <button
                    onClick={() => handleAnnotateFile(item.id)}
                    className="p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg"
                    title="Annoter le fichier"
                  >
                    <FontAwesomeIcon icon={faEdit} className="text-xs" />
                  </button>
                )}
                {(hasRole(Role.SECRETAIRE) || hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL)) && (
                  <button
                    onClick={() => handleDeleteFile(item.id)}
                    className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                    title="Supprimer"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-xs" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      }
    };
    
    // Rendre tous les éléments racine
    return rootItems.map(item => renderItem(item, 0));
  };

  const getPrioriteColor = (priorite: Priorite) => {
    switch (priorite) {
      case Priorite.URGENTE:
        return 'bg-red-100 text-red-800 border-red-300';
      case Priorite.HAUTE:
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case Priorite.NORMALE:
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
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

  // Skeleton de chargement pour le détail courrier
  const DetailCourrierSkeleton = () => (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 px-6 sm:px-8 py-6 sm:py-8 shadow-xl border border-slate-700/50">
        <div className="animate-pulse">
          <div className="flex flex-col gap-5">
            {/* Breadcrumb skeleton */}
            <div className="flex items-center gap-2">
              <div className="h-4 w-24 rounded bg-slate-600/50" />
              <div className="h-3 w-3 rounded bg-slate-600/30" />
              <div className="h-4 w-32 rounded bg-slate-500/50" />
            </div>
            {/* Main header content */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-600/40 flex-shrink-0" />
                <div className="space-y-3 min-w-0">
                  <div className="h-8 w-48 rounded-lg bg-slate-600/50" />
                  <div className="h-4 w-64 rounded bg-slate-600/30" />
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="h-6 w-24 rounded-lg bg-slate-600/40" />
                    <div className="h-6 w-20 rounded-lg bg-slate-600/40" />
                    <div className="h-6 w-28 rounded-lg bg-slate-600/40" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-10 w-24 rounded-xl bg-slate-600/40" />
                <div className="h-10 w-28 rounded-xl bg-slate-600/40" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info card skeleton */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0" />
            <div className="space-y-2">
              <div className="h-6 w-40 rounded bg-slate-200" />
              <div className="h-3 w-56 rounded bg-slate-100" />
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-slate-200" />
                  <div className="h-3 w-20 rounded bg-slate-200" />
                </div>
                <div className="h-4 w-full rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Files card skeleton */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0" />
            <div className="space-y-2">
              <div className="h-6 w-36 rounded bg-slate-200" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 animate-pulse space-y-3">
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-4 w-1/2 rounded bg-slate-100" />
          </div>
        </div>
      </div>

      {/* Workflow card skeleton */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0" />
              <div className="space-y-2">
                <div className="h-6 w-24 rounded bg-slate-200" />
                <div className="h-3 w-16 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-10 w-32 rounded-xl bg-slate-200 animate-pulse" />
          </div>
        </div>
        <div className="p-6">
          <div className="flex justify-center py-8 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-200" />
              <div className="w-24 h-1 bg-slate-200" />
              <div className="w-16 h-16 rounded-full bg-slate-200" />
              <div className="w-24 h-1 bg-slate-200" />
              <div className="w-16 h-16 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (loadingCourrier) {
    return <DetailCourrierSkeleton />;
  }

  if (!courrier) {
    return (
      <div className="text-center py-16 px-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <FontAwesomeIcon icon={faExclamationTriangle} className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">Ce courrier n'est plus disponible</h3>
        <p className="text-sm text-slate-500 mb-1">
          Le courrier associé à cette notification a été supprimé ou n'a pas été synchronisé.
        </p>
        <p className="text-xs text-slate-400 mb-6">ID : {id}</p>
        <button
          onClick={() => navigate('/courriers')}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
        >
          Retour à la liste des courriers
        </button>
      </div>
    );
  }

  const getStatutBadge = (statut: string) => {
    const map: Record<string, string> = {
      ENREGISTRE: 'bg-slate-100 text-slate-700 border-slate-200',
      EN_ATTENTE_DG: 'bg-amber-100 text-amber-800 border-amber-200',
      EN_TRAITEMENT: 'bg-blue-100 text-blue-800 border-blue-200',
      ASSIGNE: 'bg-violet-100 text-violet-800 border-violet-200',
      TRAITE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      ARCHIVE: 'bg-slate-100 text-slate-600 border-slate-200'
    };
    return map[statut] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-6">
      {/* En-tête dans la charte : bandeau gradient (aligné Planning / Dashboard) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-800 to-blue-900 px-6 sm:px-8 py-6 sm:py-8 shadow-xl border border-slate-700/50">
        <div className="absolute inset-0 bg-mesh opacity-40" aria-hidden />
        <div className="relative flex flex-col gap-5">
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/courriers" className="text-slate-300 hover:text-white font-medium transition-colors">
              Liste des courriers
            </Link>
            <FontAwesomeIcon icon={faChevronRight} className="text-slate-500 text-xs" />
            <span className="text-white font-semibold">Courrier {courrier.numero}</span>
          </nav>
          {/* Direction / Service / Sous-service concernés */}
          {(courrier.direction || courrier.service || (courrier.extraFields as Record<string, string>)?.['sousService']) && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white/10 backdrop-blur border border-white/20">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 mr-1">Entité concernée</span>
              {courrier.direction && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 text-slate-200 text-sm font-medium">
                  <FontAwesomeIcon icon={faBuilding} className="text-amber-300" />
                  {courrier.direction}
                </span>
              )}
              {courrier.service && (
                <>
                  {courrier.direction && <FontAwesomeIcon icon={faChevronRight} className="text-slate-500 text-xs" />}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 text-slate-200 text-sm font-medium">
                    <FontAwesomeIcon icon={faUsers} className="text-blue-300" />
                    {courrier.service}
                  </span>
                </>
              )}
              {(courrier.extraFields as Record<string, string>)?.['sousService'] && (
                <>
                  {(courrier.direction || courrier.service) && <FontAwesomeIcon icon={faChevronRight} className="text-slate-500 text-xs" />}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 text-slate-200 text-sm font-medium">
                    <FontAwesomeIcon icon={faFolder} className="text-emerald-300" />
                    {(courrier.extraFields as Record<string, string>)['sousService']}
                  </span>
                </>
              )}
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center shadow-lg border border-white/20 flex-shrink-0">
                <FontAwesomeIcon icon={courrier.type === TypeCourrier.EXTERNE ? faEnvelope : faEnvelopeOpen} className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  Courrier {courrier.numero}
                </h1>
                <p className="mt-1 text-slate-300 text-sm sm:text-base line-clamp-2">
                  {courrier.objet?.replace(/<[^>]*>/g, '') || 'Détail du courrier'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/15 border border-white/20 text-slate-200">
                    {courrier.sens === SensCourrier.SORTANT ? 'Courrier sortant' : 'Courrier entrant'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/15 border border-white/20 text-slate-200">
                    {getPrioriteLabel(courrier.priorite)}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/15 border border-white/20 text-slate-200">
                    {courrier.statut === StatutCourrier.ENREGISTRE ? 'Enregistré' :
                     courrier.statut === StatutCourrier.EN_ATTENTE_DG ? 'En attente DG' :
                     courrier.statut === StatutCourrier.ORIENTE_DG ? 'Orienté vers le DG' :
                     courrier.statut === StatutCourrier.ORIENTE_DIRECTEUR ? 'Orienté vers le Directeur' :
                     courrier.statut === StatutCourrier.EN_TRAITEMENT ? 'En traitement' :
                     courrier.statut === StatutCourrier.ASSIGNE ? 'Assigné' :
                     courrier.statut === StatutCourrier.TRAITE ? 'Traité' :
                     courrier.statut === StatutCourrier.ARCHIVE ? 'Archivé' :
                     String(courrier.statut).replace(/_/g, ' ')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/15 border border-white/20 text-slate-200">
                    <FontAwesomeIcon icon={courrier.type === TypeCourrier.EXTERNE ? faEnvelope : faEnvelopeOpen} className="opacity-80" />
                    {courrier.type}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Bouton de modification pour les secrétaires et admins */}
              {(hasRole(Role.SECRETAIRE) || hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL)) && (
                <button
                  type="button"
                  onClick={() => navigate(`/enregistrer?id=${id}`)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-white text-sm font-semibold hover:from-amber-500/30 hover:to-orange-500/30 transition-all backdrop-blur shadow-lg shadow-amber-500/20"
                  title="Modifier le courrier"
                >
                  <FontAwesomeIcon icon={faEdit} />
                  Modifier
                </button>
              )}
              
              {/* Bouton d'orientation rapide dans le header — ouvre la carte d'orientation ci-dessous */}
              {(user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL) && orientationTargets.length > 0 && (
                <button
                  type="button"
                  disabled={courrier?.statut !== StatutCourrier.ENREGISTRE}
                  onClick={() => {
                    if (courrier?.statut !== StatutCourrier.ENREGISTRE) {
                      showAlert('Seuls les courriers enregistrés peuvent être orientés.', 'warning');
                      return;
                    }
                    document.getElementById('orientation-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-300/40 bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-white text-sm font-semibold hover:from-violet-500/30 hover:to-purple-500/30 transition-all backdrop-blur shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={courrier?.statut !== StatutCourrier.ENREGISTRE ? 'Seuls les courriers enregistrés peuvent être orientés' : 'Orienter le courrier'}
                >
                  <FontAwesomeIcon icon={faCompass} />
                  Orienter
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  try {
                    const courriers = await courrierService.getAccessibleCourriers(user?.id || '', user ? { id: user.id, role: user.role, direction: user.direction, service: user.service } : undefined);
                    setListCourriers(courriers);
                  } catch {
                    setListCourriers([]);
                  }
                  setDrawerSearch('');
                  setDrawerFilterEntityType('ALL');
                  setDrawerFilterEntityId('ALL');
                  setDrawerOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/30 bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all backdrop-blur"
                title="Ouvrir la liste des courriers"
              >
                <FontAwesomeIcon icon={faList} />
                Liste
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Carte Informations du courrier — uniquement champs configurés dans le formulaire */}
      {(() => {
        const rawSens = courrier.sens ?? (courrier.extraFields as Record<string, string>)?.['sens'];
        const sens = rawSens === SensCourrier.SORTANT ? SensCourrier.SORTANT : SensCourrier.ENTRANT;
        const displayFields = formulaireCourrierService.getDisplayFields(sens, courrier.type);

        const getFieldValue = (c: Courrier, fieldName: string): unknown => {
          // Pour les courriers INTERNE : si destinataire est vide, utiliser expediteur comme fallback pour destinataire
          if (courrier.type === TypeCourrier.INTERNE) {
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

        const formatDisplayValue = (value: unknown, fieldType?: string): string => {
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
          const iconMap: Record<string, typeof faEnvelope> = {
            envelope: faEnvelope, 'envelope-open': faEnvelopeOpen, calendar: faCalendar,
            user: faUser, users: faUsers, building: faBuilding, tag: faTag, file: faFile,
            'file-alt': faFileAlt, 'info-circle': faInfoCircle, at: faAt, phone: faPhone,
            link: faLink, 'map-marker-alt': faMapMarkerAlt, globe: faGlobe,
          };
          return iconMap[iconName] || null;
        };

        return (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20">
                <FontAwesomeIcon icon={faInfoCircle} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Informations du courrier</h2>
                <p className="text-sm text-slate-500 mt-0.5">Champs configurés dans le formulaire de paramétrage</p>
              </div>
            </div>
            <div className="p-6">
              {displayFields.length === 0 ? (
                <p className="text-slate-500 text-sm">Aucun champ configuré pour ce type de courrier (paramétrage formulaire).</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayFields.map((field) => {
                    const value = getFieldValue(courrier, field.name);
                    const formatted = formatDisplayValue(value, field.type);
                    const IconComponent = getIcon(field.icon);
                    return (
                      <div key={field.id} className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-2">
                          {IconComponent && <FontAwesomeIcon icon={IconComponent} className="text-slate-400" />}
                          {field.label}
                        </p>
                        <p className="text-slate-800 font-medium text-sm">{formatted}</p>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Carte Orientation — visible pour Secrétaire / Super admin / Directeur Général ──────────────── */}
      {(user?.role === Role.SECRETAIRE || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL) && orientationTargets.length > 0 && (() => {
        const primaryTarget = orientationTargets.find(t => t.value === selectedOrientationTargetId) || orientationTargets[0];
        if (!primaryTarget) return null;

        const roleColorMap: Record<string, { avatar: string; badge: string; btn: string }> = {
          'Directeur Général': { avatar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 border-amber-200', btn: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25' },
          'Directeur':         { avatar: 'bg-blue-600',  badge: 'bg-blue-100 text-blue-700 border-blue-200',   btn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25' },
          'Chef de service':   { avatar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', btn: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25' },
          'Agent':             { avatar: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700 border-violet-200', btn: 'bg-violet-500 hover:bg-violet-600 shadow-violet-500/25' },
        };

        /** Rendu d'une ligne de cible (cible principale ou assigné à une étape) */
        const renderOrientationRow = (
          targetUserId: string,
          targetUser: Utilisateur,
          roleLabel: string,
          contextLabel?: string  // ex: "Étape : Vérification documents"
        ) => {
          const done = assignations.some(
            a => String(a.assigneA) === String(targetUser.id) && String(a.assignePar) === String(user?.id)
          );
          const initials = targetUser.nom
            ? targetUser.nom.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
            : '?';
          const colors = roleColorMap[roleLabel] ?? roleColorMap['Agent'];
          const isOrienting = orienting && selectedOrientationTargetId === targetUserId;
          return (
            <div key={targetUserId + (contextLabel || '')} className={`flex items-center justify-between gap-4 p-4 rounded-xl border-2 transition-all ${done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/60 hover:border-slate-200'}`}>
              {/* Identité */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md ${done ? 'bg-emerald-400' : colors.avatar}`}>
                  {done ? <FontAwesomeIcon icon={faCheckCircle} className="text-xl" /> : initials}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{targetUser.nom}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colors.badge}`}>
                      {roleLabel}
                    </span>
                    {targetUser.direction && (
                      <span className="text-xs text-slate-500 truncate">
                        <FontAwesomeIcon icon={faBuilding} className="mr-1 opacity-50" />
                        {targetUser.direction}{targetUser.service ? ` · ${targetUser.service}` : ''}
                      </span>
                    )}
                    {contextLabel && (
                      <span className="text-[11px] text-violet-600 font-medium truncate">
                        <FontAwesomeIcon icon={faRoute} className="mr-1 opacity-70" />
                        {contextLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Action */}
              <div className="flex-shrink-0">
                {done ? (
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 font-semibold text-sm border border-emerald-200">
                    <FontAwesomeIcon icon={faCheckCircle} /> Orienté
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={orienting || courrier?.statut !== StatutCourrier.ENREGISTRE}
                    title={courrier?.statut !== StatutCourrier.ENREGISTRE ? 'Seuls les courriers enregistrés peuvent être orientés' : undefined}
                    onClick={() => { setSelectedOrientationTargetId(targetUserId); handleOrientCourrier(targetUserId); }}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold text-sm shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed ${colors.btn}`}
                  >
                    {isOrienting
                      ? <><FontAwesomeIcon icon={faSpinner} className="animate-spin" /> En cours...</>
                      : <><FontAwesomeIcon icon={faArrowRight} /> Orienter</>}
                  </button>
                )}
              </div>
            </div>
          );
        };

        // Étapes workflow créées par l'utilisateur connecté, actives et assignées à quelqu'un
        const wfAssignees: { userId: string; user: Utilisateur; etapeLabel: string }[] = [];
        const seenWfUsers = new Set<string>();
        workflows
          .filter(w =>
            !w.estCondition &&
            (w.statut === 'EN_ATTENTE' || w.statut === 'EN_COURS') &&
            w.assigneA &&
            String((w as any).creePar) === String(user?.id)
          )
          .forEach(w => {
            if (!w.assigneA || seenWfUsers.has(w.assigneA)) return;
            const u = userService.getUserById(w.assigneA);
            if (u && u.actif !== false) {
              seenWfUsers.add(w.assigneA);
              wfAssignees.push({ userId: w.assigneA, user: u, etapeLabel: w.etape || 'Étape assignée' });
            }
          });

        // Assignations directes faites par l'utilisateur connecté, encore actives
        const directAssignees: { userId: string; user: Utilisateur }[] = [];
        const seenDirectUsers = new Set<string>();
        assignations
          .filter(a =>
            (a.statut === 'EN_ATTENTE' || a.statut === 'EN_COURS') &&
            String(a.assignePar) === String(user?.id) &&
            String(a.assigneA) !== String(user?.id)
          )
          .forEach(a => {
            if (seenDirectUsers.has(a.assigneA)) return;
            const u = userService.getUserById(a.assigneA);
            if (u && u.actif !== false && !seenWfUsers.has(a.assigneA)) {
              seenDirectUsers.add(a.assigneA);
              directAssignees.push({ userId: a.assigneA, user: u });
            }
          });

        const hasTaskAssignees = wfAssignees.length > 0 || directAssignees.length > 0;

        return (
          <div id="orientation-card" className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shadow-md shadow-violet-500/20">
                <FontAwesomeIcon icon={faCompass} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Orientation du courrier</h2>
                <p className="text-sm text-slate-500 mt-0.5">Transmettre ce courrier aux personnes concernées</p>
              </div>
            </div>
            <div className="p-6 space-y-4">

              {/* ── Cible principale (DG / Directeur selon rôle secrétaire) ── */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faChevronRight} className="text-violet-400" />
                  Destinataire principal
                </p>
                {renderOrientationRow(primaryTarget.user.id, primaryTarget.user, primaryTarget.roleLabel)}
              </div>

              {/* ── Personnes assignées à des étapes / tâches actives ── */}
              {hasTaskAssignees && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faChevronRight} className="text-violet-400" />
                    Assignés à des étapes / tâches en cours
                  </p>
                  <div className="space-y-2">
                    {wfAssignees.map(({ userId, user: u, etapeLabel }) => {
                      const roleLabel = u.role === Role.DIRECTEUR_GENERAL ? 'Directeur Général'
                        : u.role === Role.DIRECTEUR ? 'Directeur'
                        : u.role === Role.CHEF_SERVICE ? 'Chef de service'
                        : 'Agent';
                      return renderOrientationRow(userId, u, roleLabel, etapeLabel);
                    })}
                    {directAssignees.map(({ userId, user: u }) => {
                      const roleLabel = u.role === Role.DIRECTEUR_GENERAL ? 'Directeur Général'
                        : u.role === Role.DIRECTEUR ? 'Directeur'
                        : u.role === Role.CHEF_SERVICE ? 'Chef de service'
                        : 'Agent';
                      return renderOrientationRow(userId, u, roleLabel, 'Assignation directe');
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* Fichiers et dossiers — style aligné aux autres cartes */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-md shadow-amber-500/20">
              <FontAwesomeIcon icon={faFolderOpen} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Fichiers et dossiers</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {dossiersFichiers.length} élément{dossiersFichiers.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <input
            ref={accuseFileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
            onChange={handleJoindreAccuseReception}
          />
          {/* Joindre un accusé de réception uniquement pour les courriers sortants externes */}
          {courrier && courrier.sens === SensCourrier.SORTANT && courrier.type === TypeCourrier.EXTERNE && (hasRole(Role.SECRETAIRE) || hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL)) && (
            <button
              type="button"
              onClick={() => {
                // Vérifier qu'il existe au moins un document principal (non marqué comme accusé de réception)
                const hasMainDocument = dossiersFichiers.some(
                  (item) =>
                    item.type === 'fichier' &&
                    item.estAccuseReception !== true &&
                    item.id !== currentDossierAccusesId
                );
                if (!hasMainDocument) {
                  showAlert(
                    'Aucun document principal n\'est joint à ce courrier.\n\nVeuillez d\'abord joindre le document du courrier (lettre, PDF, etc.) avant d\'ajouter un accusé de réception.',
                    'warning',
                    'Document requis'
                  );
                  return;
                }
                accuseFileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm shadow-md shadow-emerald-500/25 hover:bg-emerald-600 transition-all border border-emerald-500/20"
            >
              <FontAwesomeIcon icon={faCheckDouble} className="w-4 h-4" />
              Joindre un accusé de réception
            </button>
          )}
        </div>
        <div className="p-6 space-y-6">
          {/* Section Accusés de réception */}
          {currentAccusésDeReception.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-2 mb-3">
                <FontAwesomeIcon icon={faCheckDouble} className="w-4 h-4" />
                Accusés de réception ({currentAccusésDeReception.length})
              </h3>
              <ul className="space-y-2">
                {currentAccusésDeReception.map((fichier) => (
                  <li key={fichier.id} className="flex items-center gap-3 p-2 rounded-lg bg-white border border-emerald-100 hover:bg-emerald-50/50 transition-colors">
                    <FontAwesomeIcon icon={getFileIcon(fichier.extension)} className={`text-base ${getFileIconColor(fichier.extension)} flex-shrink-0`} />
                    <span className="text-sm font-medium text-slate-800 truncate flex-1">{fichier.nom}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => openViewFileModal(fichier)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Visualiser">
                        <FontAwesomeIcon icon={faEye} className="text-xs" />
                      </button>
                      <button type="button" onClick={() => handleDownloadFile(fichier)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Télécharger">
                        <FontAwesomeIcon icon={faDownload} className="text-xs" />
                      </button>
                      {(hasRole(Role.SECRETAIRE) || hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL)) && (
                        <button type="button" onClick={() => handleDeleteFile(fichier.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Supprimer">
                          <FontAwesomeIcon icon={faTrash} className="text-xs" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dossiersFichiers.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 max-h-96 overflow-y-auto">
              {renderTree()}
            </div>
          ) : (
            <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
              <FontAwesomeIcon icon={faFolderOpen} className="text-4xl text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Aucun fichier ou dossier</p>
              <p className="text-sm text-slate-400 mt-1">Les pièces jointes et accusés de réception apparaîtront ici</p>
            </div>
          )}
        </div>
      </div>

      {/* Workflow (étapes) — suivi visuel + lien vers la page Workflow — visible dans Detail Courrier */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80">
          <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
                <FontAwesomeIcon icon={faDiagramProject} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Workflow</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {workflows.length} étape{workflows.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {/* Boutons workflow - seulement pour les rôles de direction */}
            {canCreateWfStep ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to={`/workflow?courrier=${courrier.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-500/25 hover:bg-emerald-600 transition-all text-sm"
                >
                  <FontAwesomeIcon icon={faDiagramProject} />
                  Gérer le workflow
                </Link>
                <button
                  type="button"
                  onClick={addWfRow}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-all"
                  title="Ajouter une étape"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Ajouter une étape
                </button>
                {wfRows.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={saveAllWfRows}
                      disabled={wfSaving || wfRows.every(r => r.saved)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all"
                    >
                      {wfSaving ? <FontAwesomeIcon icon={faSpinner} className="animate-spin" /> : <FontAwesomeIcon icon={faSave} />}
                      Tout enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={clearWfRows}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all"
                    >
                      <FontAwesomeIcon icon={faTimes} />
                      Effacer
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-400 font-medium text-sm cursor-not-allowed border border-slate-200">
                <FontAwesomeIcon icon={faLock} className="text-slate-400" />
                <span>Workflow verrouillé</span>
              </div>
            )}
          </div>
          <div className="p-6">
            {workflows.length > 0 ? (
              <>
                {/* Suivi visuel : graphique des étapes (actions + conditions) dans le même flux */}
                {(() => {
                  const sortedActions = [...workflows]
                    .filter(w => !w.estCondition)
                    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
                  const conditions = workflows.filter(w => w.estCondition);
                  const usedConditionIds = new Set<string>();
                  type DisplayNode = { type: 'action' | 'condition'; etape: WorkflowEtape };
                  const displaySequence: DisplayNode[] = [];
                  for (const action of sortedActions) {
                    displaySequence.push({ type: 'action', etape: action });
                    for (const cond of conditions) {
                      if (cond.declencheur?.etapePrecedenteId === action.id) {
                        displaySequence.push({ type: 'condition', etape: cond });
                        usedConditionIds.add(cond.id);
                      }
                    }
                  }
                  for (const cond of conditions) {
                    if (!usedConditionIds.has(cond.id)) {
                      displaySequence.push({ type: 'condition', etape: cond });
                    }
                  }
                  const currentStepIndex = sortedActions.findIndex(s => s.statut === 'EN_COURS' || s.statut === 'EN_ATTENTE');
                  const niveauActuel = currentStepIndex >= 0 && currentStepIndex < sortedActions.length
                    ? sortedActions[currentStepIndex].etape
                    : 'Terminé';
                  const restantes = sortedActions.filter(s => s.statut === 'EN_ATTENTE').length;
                  const indexActuel = currentStepIndex >= 0 ? currentStepIndex + 1 : sortedActions.length;
                  const etapeCourante = currentStepIndex >= 0 && currentStepIndex < sortedActions.length ? sortedActions[currentStepIndex] : null;
                  const delaiCourant = etapeCourante ? getDelaiLabel(etapeCourante) : null;
                  const tempsRestantCourant = etapeCourante ? getTempsRestantMs(etapeCourante) : null;
                  return (
                    <div className="mb-8 max-w-5xl mx-auto">
                      <div className="flex flex-wrap items-center justify-center gap-4 mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Niveau actuel</span>
                          <p className="text-lg font-bold text-slate-800 mt-0.5">{niveauActuel}</p>
                          <p className="text-sm text-slate-500 mt-0.5">Étape {indexActuel} sur {sortedActions.length}</p>
                        </div>
                        <div className="h-10 w-px bg-slate-200 hidden sm:block" />
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Étapes restantes</span>
                          <p className="text-2xl font-bold text-slate-800 tabular-nums mt-0.5">{restantes}</p>
                          <p className="text-sm text-slate-500 mt-0.5">{restantes === 1 ? 'étape à traiter' : 'étapes à traiter'}</p>
                        </div>
                        {(delaiCourant != null || (tempsRestantCourant != null && etapeCourante?.statut === 'EN_COURS')) && (
                          <>
                            <div className="h-10 w-px bg-slate-200 hidden sm:block" />
                            <div>
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Délai</span>
                              <p className="text-lg font-bold mt-0.5 flex items-center gap-2">
                                {delaiCourant === 'Dans le temps' && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-semibold">
                                    <FontAwesomeIcon icon={faCircleCheck} className="text-emerald-600" />
                                    Dans le temps
                                  </span>
                                )}
                                {delaiCourant === 'En retard' && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-100 text-red-700 text-sm font-semibold">
                                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-600" />
                                    En retard
                                  </span>
                                )}
                              </p>
                              {tempsRestantCourant != null && etapeCourante?.statut === 'EN_COURS' && (
                                <p className="text-sm text-slate-500 mt-0.5">
                                  {tempsRestantCourant >= 0
                                    ? `Temps restant : ${formatDureeHeures(tempsRestantCourant / (60 * 60 * 1000))}`
                                    : `Retard : ${formatDureeHeures(-tempsRestantCourant / (60 * 60 * 1000))}`}
                                </p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {/* Diagramme n8n — parcours complet du courrier */}
                      <div className="overflow-x-auto py-6 px-4 bg-slate-50/50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-0 min-w-max py-2 mx-auto">

                          {/* ── Nœud Enregistrement ── */}
                          {(() => {
                            const creePar = userService.getUserById((courrier as any).creePar || (courrier as any).createdBy);
                            return (
                              <React.Fragment key="node-enregistrement">
                                <div className="flex-shrink-0 w-40 rounded-xl overflow-hidden shadow-md border-2 border-emerald-300">
                                  <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2 text-white">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                                        <FontAwesomeIcon icon={faCircleCheck} className="text-white text-[10px]" />
                                      </span>
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">Déclencheur</span>
                                    </div>
                                    <h4 className="font-bold text-xs">Enregistrement</h4>
                                    <p className="text-[10px] text-white/80 mt-0.5">Terminé</p>
                                  </div>
                                  <div className="px-2.5 py-2 bg-white space-y-1">
                                    <p className="text-[11px] font-semibold text-slate-700 truncate">{courrier?.numero}</p>
                                    {creePar && <p className="text-[10px] text-slate-500 truncate"><FontAwesomeIcon icon={faUser} className="mr-1 text-slate-300" />{creePar.nom}</p>}
                                    <p className="text-[10px] text-slate-400">
                                      {courrier && (courrier as any).dateCreation
                                        ? new Date((courrier as any).dateCreation).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                                        : '—'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex-shrink-0 w-8 flex items-center justify-center">
                                  <div className="flex items-center gap-0.5">
                                    <div className="w-4 h-0.5 bg-slate-300" />
                                    <FontAwesomeIcon icon={faArrowRight} className="text-slate-400 text-xs" />
                                  </div>
                                </div>
                              </React.Fragment>
                            );
                          })()}

                          {/* ── Nœuds Orientation (une par assignation) ── */}
                          {assignations.map((a, ai) => {
                            const assignedUser = userService.getUserById(a.assigneA);
                            const assignedBy = userService.getUserById(a.assignePar);
                            const isDone = a.statut === 'TERMINE' ||
                              ['ORIENTE_DG','ORIENTE_DIRECTEUR','ASSIGNE','EN_TRAITEMENT','TRAITE','ARCHIVE'].includes(courrier?.statut ?? '');
                            return (
                              <React.Fragment key={`node-orient-${a.id}`}>
                                <div className={`flex-shrink-0 w-40 rounded-xl overflow-hidden shadow-md border-2 ${isDone ? 'border-violet-300' : 'border-amber-300'}`}>
                                  <div className={`bg-gradient-to-br ${isDone ? 'from-violet-500 to-violet-600' : 'from-amber-400 to-amber-500'} px-3 py-2 text-white`}>
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                                        <FontAwesomeIcon icon={faCompass} className="text-white text-[10px]" />
                                      </span>
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">Orientation</span>
                                    </div>
                                    <h4 className="font-bold text-xs">Orienté</h4>
                                    <p className="text-[10px] text-white/80 mt-0.5">{isDone ? 'Terminé' : 'En attente'}</p>
                                  </div>
                                  <div className="px-2.5 py-2 bg-white space-y-1">
                                    {assignedUser && <p className="text-[11px] font-semibold text-slate-700 truncate"><FontAwesomeIcon icon={faUser} className="mr-1 text-slate-300" />{assignedUser.nom}</p>}
                                    {assignedBy && <p className="text-[10px] text-slate-500 truncate">par {assignedBy.nom}</p>}
                                    <p className="text-[10px] text-slate-400">
                                      {a.dateAssignation ? new Date(a.dateAssignation).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex-shrink-0 w-8 flex items-center justify-center">
                                  <div className="flex items-center gap-0.5">
                                    <div className="w-4 h-0.5 bg-slate-300" />
                                    <FontAwesomeIcon icon={faArrowRight} className="text-slate-400 text-xs" />
                                  </div>
                                </div>
                              </React.Fragment>
                            );
                          })}

                          {/* ── Étapes workflow ── */}
                          {displaySequence.map((node, idx) => {
                            if (node.type === 'condition') {
                              const cond = node.etape;
                              const actionVrai = cond.actionSiVrai ? workflows.find(w => w.id === cond.actionSiVrai) : null;
                              const actionFaux = cond.actionSiFaux ? workflows.find(w => w.id === cond.actionSiFaux) : null;
                              return (
                                <React.Fragment key={cond.id}>
                                  <div className="flex-shrink-0 w-28 flex flex-col items-center self-center">
                                    <div className="relative" style={{ width: '100px', height: '100px' }}>
                                      <svg viewBox="0 0 200 140" className="w-full h-full drop-shadow-md" style={{ filter: 'drop-shadow(0 4px 8px rgba(147, 51, 234, 0.25))' }}>
                                        <defs>
                                          <linearGradient id={`diamondTimeline-${cond.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#a855f7" />
                                            <stop offset="50%" stopColor="#9333ea" />
                                            <stop offset="100%" stopColor="#7c3aed" />
                                          </linearGradient>
                                        </defs>
                                        <polygon points="100,10 190,70 100,130 10,70" fill={`url(#diamondTimeline-${cond.id})`} stroke="#7c3aed" strokeWidth="2" />
                                        <polygon points="100,20 180,70 100,120 20,70" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                                      </svg>
                                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                                        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center mb-0.5">
                                          <FontAwesomeIcon icon={faQuestion} className="text-white text-[10px]" />
                                        </div>
                                        <span className="text-white font-bold text-[10px] text-center leading-tight line-clamp-2">
                                          {(cond.etape || '').length > 15 ? (cond.etape || '').substring(0, 15) + '…' : (cond.etape || 'Condition')}
                                        </span>
                                        <span className="text-white/70 text-[8px] mt-0.5">Condition</span>
                                      </div>
                                      <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 py-0.5 bg-emerald-500 text-white text-[8px] font-bold rounded shadow">OUI ↓</div>
                                      <div className="absolute top-1/2 -right-0.5 -translate-y-1/2 px-1 py-0.5 bg-red-500 text-white text-[8px] font-bold rounded shadow">NON →</div>
                                    </div>
                                    {/* Étapes suivantes dans le même sens (côte à côte) */}
                                    <div className="mt-1 flex flex-row items-center justify-center gap-2 w-full min-w-0">
                                      {actionVrai && <p className="text-[9px] text-emerald-700 text-center line-clamp-1 flex-1 min-w-0 max-w-[80px]" title={actionVrai.etape}>OUI → {actionVrai.etape?.substring(0, 10)}{(actionVrai.etape?.length || 0) > 10 ? '…' : ''}</p>}
                                      {actionFaux && <p className="text-[9px] text-red-700 text-center line-clamp-1 flex-1 min-w-0 max-w-[80px]" title={actionFaux.etape}>NON → {actionFaux.etape?.substring(0, 10)}{(actionFaux.etape?.length || 0) > 10 ? '…' : ''}</p>}
                                    </div>
                                  </div>
                                  {idx < displaySequence.length - 1 && (
                                    <div className="flex-shrink-0 w-6 flex items-center justify-center self-center">
                                      <FontAwesomeIcon icon={faArrowRight} className="text-slate-300 text-sm" />
                                    </div>
                                  )}
                                </React.Fragment>
                              );
                            }
                            const etape = node.etape;
                            const status = workflowStatusColors[etape.statut] || workflowStatusColors['EN_ATTENTE'];
                            const assigneUser = userService.getUserById(etape.assigneA);
                            const actionIndexInSorted = sortedActions.findIndex(s => s.id === etape.id);
                            const isCurrent = etape.statut === 'EN_COURS' || (etape.statut === 'EN_ATTENTE' && sortedActions.findIndex(s => s.statut === 'EN_COURS') < 0 && actionIndexInSorted === sortedActions.findIndex(s => s.statut === 'EN_ATTENTE'));
                            const delai = getDelaiLabel(etape);
                            const tempsRestantMs = getTempsRestantMs(etape);
                            const tempsRestantLabel = etape.statut === 'TERMINE' || etape.statut === 'REJETE'
                              ? (etape.statut === 'TERMINE' ? 'Terminé' : 'Rejeté')
                              : etape.statut === 'EN_COURS' && tempsRestantMs != null
                                ? (tempsRestantMs >= 0 ? `Restant : ${formatDureeHeures(tempsRestantMs / (60 * 60 * 1000))}` : `Retard : ${formatDureeHeures(-tempsRestantMs / (60 * 60 * 1000))}`)
                                : etape.statut === 'EN_ATTENTE' && etape.dureeEstimee != null
                                  ? `Prévu : ${formatDureeHeures(etape.dureeEstimee)}`
                                  : etape.statut === 'EN_ATTENTE'
                                    ? 'Non démarré'
                                    : null;
                            const isLate = delai === 'En retard';
                            const showCurrentAnimation = isCurrent && !isLate;
                            const agentEntite = assigneUser ? getAgentEntiteLabel(assigneUser) : null;
                            const cardBorderClass = isLate
                              ? 'workflow-step-late'
                              : showCurrentAnimation
                                ? 'workflow-step-current'
                                : 'border-2 border-slate-200';
                            const responseCount = (etape.responses ?? []).length;
                            const canSubmitRetour = assigneUser?.id === user?.id || String(etape.creePar) === String(user?.id);
                            return (
                              <React.Fragment key={etape.id}>
                                <div
                                  className={`flex-shrink-0 w-44 rounded-xl overflow-hidden shadow-md transition-all cursor-pointer hover:shadow-lg hover:scale-[1.02] ${cardBorderClass}`}
                                  onClick={() => { setRetourEtape(etape); setRetourMessage(''); setRetourDecision(undefined); setRetourFichier(null); }}
                                  title="Cliquer pour voir / soumettre un retour"
                                >
                                  <div className={`bg-gradient-to-br ${status.bg} px-3 py-2 text-white`}>
                                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                                      <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                                        {etape.ordre ?? actionIndexInSorted + 1}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        {responseCount > 0 && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/25 text-white text-[9px] font-bold">
                                            💬 {responseCount}
                                          </span>
                                        )}
                                        <FontAwesomeIcon icon={status.icon} className="text-white/90 text-xs" />
                                      </div>
                                    </div>
                                    <h4 className="font-semibold text-xs leading-tight line-clamp-2">{etape.etape}</h4>
                                    <p className="text-[10px] text-white/80 mt-0.5">{etape.statut.replace('_', ' ')}</p>
                                  </div>
                                  <div className="px-2.5 py-1.5 bg-white border-t border-slate-100 space-y-1.5">
                                    <div>
                                      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-0">Tâche</p>
                                      <p className="text-[11px] text-slate-800 font-medium line-clamp-2 leading-tight">{etape.etape}</p>
                                    </div>
                                    {etape.commentaire && (
                                      <div>
                                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-0">Fonction</p>
                                        <p className="text-[11px] text-slate-700 line-clamp-2 leading-tight">{etape.commentaire}</p>
                                      </div>
                                    )}
                                    {assigneUser ? (
                                      <>
                                        <p className="text-[11px] text-slate-600 flex items-center gap-1">
                                          <FontAwesomeIcon icon={faUser} className="text-slate-400 text-[10px] flex-shrink-0" />
                                          {assigneUser.nom}
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                          <span className="font-semibold text-slate-600">Rôle :</span> {getRoleLabel(assigneUser.role)}
                                        </p>
                                        {agentEntite && (
                                          <p className="text-[10px] text-slate-500 line-clamp-2">
                                            {agentEntite}
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-[11px] text-slate-400">Non assigné</p>
                                    )}
                                    {tempsRestantLabel && (
                                      <p className="text-[11px] text-slate-600 flex items-center gap-1">
                                        <FontAwesomeIcon icon={faClock} className="text-slate-400 flex-shrink-0 text-[10px]" />
                                        {tempsRestantLabel}
                                      </p>
                                    )}
                                    {delai != null && (
                                      <p className="flex items-center gap-1">
                                        {delai === 'Dans le temps' && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700">
                                            <FontAwesomeIcon icon={faCircleCheck} className="text-emerald-600 text-[9px]" />
                                            Dans le temps
                                          </span>
                                        )}
                                        {delai === 'En retard' && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-600 text-[9px]" />
                                            En retard
                                          </span>
                                        )}
                                      </p>
                                    )}
                                    {/* Boutons action dans le nœud */}
                                    {assigneUser?.id === user?.id && etape.statut !== 'TERMINE' && etape.statut !== 'REJETE' && (
                                      <div className="pt-1 border-t border-slate-100 flex gap-1">
                                        {etape.statut === 'EN_ATTENTE' && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              try {
                                                await courrierService.updateWorkflowEtapeAsync(etape.id, { statut: 'EN_COURS', dateDebut: new Date() });
                                                if (courrier?.id) await courrierService.updateCourrier(courrier.id, { statut: StatutCourrier.EN_TRAITEMENT }).catch(() => {});
                                                showAlert('Tâche démarrée', 'success');
                                                loadWorkflows();
                                              } catch (e) { showAlert('Erreur lors du démarrage', 'error'); }
                                            }}
                                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-semibold hover:bg-blue-700"
                                          >
                                            <FontAwesomeIcon icon={faPlay} /> Démarrer
                                          </button>
                                        )}
                                        {etape.statut === 'EN_COURS' && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              try {
                                                await courrierService.updateWorkflowEtapeAsync(etape.id, { statut: 'TERMINE', dateFin: new Date() });
                                                await checkAndMarkCourrierTraite();
                                                showAlert('Tâche terminée', 'success');
                                              } catch (e) { showAlert('Erreur lors de la terminaison', 'error'); }
                                            }}
                                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700"
                                          >
                                            <FontAwesomeIcon icon={faCheck} /> Terminer
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {idx < displaySequence.length - 1 && (
                                  <div className="flex-shrink-0 w-8 flex items-center justify-center self-start mt-12">
                                    <div className="flex items-center gap-0.5">
                                      <div className="w-4 h-0.5 bg-slate-300" />
                                      <FontAwesomeIcon icon={faArrowRight} className="text-slate-400 text-xs" />
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                {courrier?.statut && [StatutCourrier.ENREGISTRE, StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ORIENTE_DG, StatutCourrier.ORIENTE_DIRECTEUR, StatutCourrier.ASSIGNE, StatutCourrier.EN_TRAITEMENT, StatutCourrier.TRAITE, StatutCourrier.ARCHIVE].includes(courrier.statut) ? (
                  <div className="py-6">
                    <style>{`
                      @keyframes n8n-flow {
                        0% { background-position: 0 0; }
                        100% { background-position: 24px 0; }
                      }
                      @keyframes n8n-pulse {
                        0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5); }
                        50% { box-shadow: 0 0 0 10px rgba(139, 92, 246, 0); }
                      }
                      @keyframes n8n-ping-ring {
                        0% { transform: scale(1); opacity: 0.6; }
                        100% { transform: scale(1.6); opacity: 0; }
                      }
                    `}</style>
                    <p className="text-sm text-slate-500 text-center mb-6">Processus de traitement</p>
                    {(() => {
                      const expectedTarget = getAppropriateDirector(user) || adminService.getDirecteurGeneral();
                      const isOriented = [StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ORIENTE_DG, StatutCourrier.ORIENTE_DIRECTEUR, StatutCourrier.ASSIGNE, StatutCourrier.EN_TRAITEMENT, StatutCourrier.TRAITE, StatutCourrier.ARCHIVE].includes(courrier.statut);
                      const isInTreatment = [StatutCourrier.EN_TRAITEMENT, StatutCourrier.TRAITE, StatutCourrier.ARCHIVE].includes(courrier.statut);
                      const isFinalised = [StatutCourrier.TRAITE, StatutCourrier.ARCHIVE].includes(courrier.statut);

                      const currentStep = courrier.statut === StatutCourrier.ENREGISTRE
                        ? 'orientation'
                        : isFinalised
                          ? 'finalisation'
                          : 'traitement';

                      const nextAction = courrier.statut === StatutCourrier.ENREGISTRE
                        ? (expectedTarget ? `Orienter vers ${expectedTarget.nom}` : 'Orienter vers le DG ou un Directeur')
                        : isInTreatment
                          ? 'Traitement en cours'
                          : 'Créer au moins une annotation';

                      const steps = [
                        { label: 'Enregistrement', done: true, icon: faCheckCircle },
                        { label: 'Orientation', done: isOriented, current: currentStep === 'orientation', icon: faCompass, sub: isOriented ? 'Effectuée' : (expectedTarget ? `vers ${expectedTarget.nom}` : 'vers le DG ou un Directeur') },
                        { label: 'Traitement', done: isFinalised, current: currentStep === 'traitement', icon: faClock, sub: isInTreatment ? 'En cours' : 'En attente' },
                        { label: 'Finalisation', done: isFinalised, current: currentStep === 'finalisation', icon: faFlag, sub: isFinalised ? 'Terminé' : 'À venir' }
                      ];
                      return (
                        <>
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            {steps.map((step, idx) => (
                              <React.Fragment key={step.label}>
                                <div className={`flex flex-col items-center gap-2 px-3 py-2 rounded-xl border min-w-[110px] ${step.current ? 'bg-violet-50 border-violet-300 shadow-md shadow-violet-200' : step.done ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                  <div className="relative flex items-center justify-center">
                                    {step.current && (
                                      <div
                                        className="absolute inset-0 rounded-full bg-violet-400"
                                        style={{ animation: 'n8n-ping-ring 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}
                                      />
                                    )}
                                    <div
                                      className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ${step.done ? 'bg-emerald-500' : step.current ? 'bg-violet-500' : 'bg-slate-300'}`}
                                      style={step.current ? { animation: 'n8n-pulse 2s infinite' } : undefined}
                                    >
                                      <FontAwesomeIcon icon={step.icon} className="text-white text-sm" />
                                    </div>
                                  </div>
                                  <div className="text-center">
                                    <p className={`text-xs font-semibold ${step.current ? 'text-violet-700' : step.done ? 'text-emerald-700' : 'text-slate-500'}`}>{step.label}</p>
                                    {step.sub && <p className="text-[10px] text-slate-500 mt-0.5 max-w-[100px] truncate" title={step.sub}>{step.sub}</p>}
                                  </div>
                                </div>
                                {idx < steps.length - 1 && (
                                  <div
                                    className="w-6 h-0.5 flex-shrink-0 rounded-full"
                                    style={{
                                      background: idx < (currentStep === 'orientation' ? 1 : currentStep === 'traitement' ? 2 : 3)
                                        ? 'repeating-linear-gradient(90deg, #a78bfa 0, #a78bfa 6px, transparent 6px, transparent 12px)'
                                        : '#cbd5e1',
                                      backgroundSize: '12px 100%',
                                      animation: idx < (currentStep === 'orientation' ? 1 : currentStep === 'traitement' ? 2 : 3) ? 'n8n-flow 0.6s linear infinite' : undefined
                                    }}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                          <p className="text-xs text-violet-700 font-medium text-center mt-6 bg-violet-50 inline-block px-3 py-1 rounded-full mx-auto block w-fit">
                            Action suivante attendue : {nextAction}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FontAwesomeIcon icon={faDiagramProject} className="text-4xl text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">Aucune étape de workflow</p>
                    {canCreateWfStep && (
                      <button
                        type="button"
                        onClick={addWfRow}
                        className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-all"
                      >
                        <FontAwesomeIcon icon={faPlus} />
                        Créer une étape
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Lignes inline de création de workflow ─────────────────────── */}
            {wfRows.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                    <FontAwesomeIcon icon={faPlus} className="text-white text-[10px]" />
                  </div>
                  <span className="text-sm font-bold text-slate-700">Nouvelles étapes</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    {wfRows.filter(r => !r.saved).length} en attente
                  </span>
                </div>
                {wfRows.map((row) => (
                  <div key={row.id} className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${
                    row.saved ? 'border-emerald-200' : row.saving ? 'border-amber-300' : row.estCondition ? 'border-purple-200' : 'border-indigo-200'
                  }`}>
                    {/* Card header coloré */}
                    <div className={`px-4 py-2.5 flex items-center justify-between ${
                      row.saved ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                      : row.saving ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                      : row.estCondition ? 'bg-gradient-to-r from-purple-500 to-violet-600'
                      : 'bg-gradient-to-r from-indigo-500 to-blue-600'
                    }`}>
                      {/* Toggle type */}
                      {!row.saved && (
                        <div className="flex items-center gap-1 p-0.5 bg-white/20 rounded-lg">
                          <button type="button" onClick={() => updateWfRow(row.id, 'estCondition', false)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${!row.estCondition ? 'bg-white text-indigo-600 shadow' : 'text-white/80 hover:text-white'}`}>
                            <FontAwesomeIcon icon={faFlag} className="mr-1" />Action
                          </button>
                          <button type="button" onClick={() => updateWfRow(row.id, 'estCondition', true)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${row.estCondition ? 'bg-white text-purple-600 shadow' : 'text-white/80 hover:text-white'}`}>
                            <FontAwesomeIcon icon={faCodeBranch} className="mr-1" />Condition
                          </button>
                        </div>
                      )}
                      {row.saved && (
                        <span className="inline-flex items-center gap-1.5 text-white font-semibold text-sm">
                          <FontAwesomeIcon icon={faCheckCircle} />
                          {row.estCondition ? row.condition : row.etape}
                        </span>
                      )}
                      {!row.saved && (
                        <button type="button" onClick={() => removeWfRow(row.id)}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white transition-all" title="Supprimer">
                          <FontAwesomeIcon icon={faTimes} className="text-xs" />
                        </button>
                      )}
                    </div>
                    <div className="p-4 bg-white space-y-3">
                      {/* Nom / Condition */}
                      {!row.saved && (
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">
                            {row.estCondition ? 'Texte de la condition' : "Nom de l'étape"} <span className="text-red-400">*</span>
                          </label>
                          {row.estCondition ? (
                            <input type="text" value={row.condition} onChange={e => updateWfRow(row.id, 'condition', e.target.value)}
                              placeholder="Ex : Document validé par le directeur ?"
                              className="w-full px-3 py-2 text-sm bg-purple-50 border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-300 focus:border-purple-400 transition-all" />
                          ) : (
                            <input type="text" value={row.etape} onChange={e => updateWfRow(row.id, 'etape', e.target.value)}
                              placeholder="Ex : Vérification par le chef de service"
                              className="w-full px-3 py-2 text-sm bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all" />
                          )}
                        </div>
                      )}

                      {/* Branchements Si OUI / Si NON */}
                      {row.estCondition && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                            <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                              <FontAwesomeIcon icon={faCheck} className="text-emerald-600" /> Si OUI →
                            </label>
                            <select value={row.actionSiVrai} onChange={e => updateWfRow(row.id, 'actionSiVrai', e.target.value)} disabled={row.saved}
                              className="w-full px-2 py-1.5 text-xs bg-white border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-300 disabled:opacity-60">
                              <option value="">— Sélectionner —</option>
                              {workflows.filter(w => !w.estCondition).map(w => <option key={w.id} value={w.id}>{w.etape}</option>)}
                              {wfRows.filter(r => !r.estCondition && r.id !== row.id && r.etape).map(r => <option key={r.id} value={r.id}>{r.etape}</option>)}
                            </select>
                          </div>
                          <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                            <label className="text-[10px] font-bold text-red-700 uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                              <FontAwesomeIcon icon={faTimes} className="text-red-500" /> Si NON →
                            </label>
                            <select value={row.actionSiFaux} onChange={e => updateWfRow(row.id, 'actionSiFaux', e.target.value)} disabled={row.saved}
                              className="w-full px-2 py-1.5 text-xs bg-white border border-red-200 rounded-lg focus:ring-2 focus:ring-red-300 disabled:opacity-60">
                              <option value="">— Sélectionner —</option>
                              {workflows.filter(w => !w.estCondition).map(w => <option key={w.id} value={w.id}>{w.etape}</option>)}
                              {wfRows.filter(r => !r.estCondition && r.id !== row.id && r.etape).map(r => <option key={r.id} value={r.id}>{r.etape}</option>)}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Ligne 3 : Filtres organisation + Agent + Déclencheur + Durée (actions simples) */}
                      {!row.estCondition && (
                        <div className="space-y-2">
                          {/* Filtres par entités */}
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <FontAwesomeIcon icon={faBuilding} className="text-slate-400 text-xs" />
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Filtrer par organisation</span>
                            </div>
                            {entiteTypeService.getActiveTypesForFilters().map((level, i) => {
                              const parentId = i === 0 ? null : wfAssignFilterIds[i - 1] ?? null;
                              const options = i === 0
                                ? entiteOrganisationnelleService.getDirectionsForFilters()
                                : parentId
                                  ? entiteOrganisationnelleService.getEntitiesByParent(parentId).filter(e => e.type === level.code).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                                  : [];
                              const selectedId = wfAssignFilterIds[i] ?? null;
                              const isLocked = wfShouldLockFilterLevel(i, level.code);
                              return (
                                <div key={level.code}>
                                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                                    {level.libelleSingulier}
                                    {isLocked && <span className="ml-1 text-blue-500 font-normal italic">(verrouillé)</span>}
                                  </label>
                                  <SearchableSelect
                                    options={options.map(e => ({ value: e.id, label: e.nom }))}
                                    value={selectedId ?? ''}
                                    onChange={(id) => wfHandleFilterChange(id, i, isLocked)}
                                    disabled={isLocked}
                                    emptyOption={isLocked ? `${level.libelleSingulier} verrouillé(e)` : `Tous les ${level.libellePluriel.toLowerCase()}`}
                                    searchPlaceholder={`Rechercher un(e) ${level.libelleSingulier.toLowerCase()}...`}
                                    className={isLocked ? 'opacity-75' : ''}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          {/* Agent assigné */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                              <FontAwesomeIcon icon={faUser} className="text-slate-400" /> Agent assigné
                            </label>
                            <SearchableSelect
                              options={wfFilteredAssignableUsers.map(u => ({
                                value: u.id,
                                label: `${u.nom} (${u.email || ''}) — ${u.role?.replace('_', ' ') || ''}`,
                                avatarUrl: u.photoUrl,
                                avatarLabel: u.nom?.charAt(0)?.toUpperCase() || '?',
                              }))}
                              value={row.assigneA}
                              onChange={v => updateWfRow(row.id, 'assigneA', v)}
                              emptyOption={wfFilteredAssignableUsers.length === 0 ? 'Aucun agent pour ces filtres' : 'Sélectionner un agent…'}
                              searchPlaceholder="Rechercher par nom ou email..."
                            />
                          </div>
                          {/* Déclencheur + Durée */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                                <FontAwesomeIcon icon={faBolt} className="text-slate-400" /> Déclenchement
                              </label>
                              <select value={row.declencheurType} onChange={e => updateWfRow(row.id, 'declencheurType', e.target.value)} disabled={row.saved}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-300 disabled:opacity-60">
                                <option value="IMMEDIAT">⚡ Immédiat</option>
                                <option value="APRES_ETAPE">🔗 Après une étape</option>
                                <option value="DATE">📅 À une date</option>
                              </select>
                              {row.declencheurType === 'APRES_ETAPE' && (
                                <select value={row.etapePrecedenteId} onChange={e => updateWfRow(row.id, 'etapePrecedenteId', e.target.value)} disabled={row.saved}
                                  className="w-full mt-1.5 px-3 py-2 text-xs bg-blue-50 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-300 disabled:opacity-60">
                                  <option value="">— Étape précédente —</option>
                                  {workflows.map(w => <option key={w.id} value={w.id}>{w.etape}</option>)}
                                </select>
                              )}
                              {row.declencheurType === 'DATE' && (
                                <input type="datetime-local" value={row.dateDeclenchement} onChange={e => updateWfRow(row.id, 'dateDeclenchement', e.target.value)} disabled={row.saved}
                                  className="w-full mt-1.5 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-300 disabled:opacity-60" />
                              )}
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                                <FontAwesomeIcon icon={faHourglassHalf} className="text-slate-400" /> Durée estimée (h)
                              </label>
                              <input type="number" value={row.dureeEstimee} onChange={e => updateWfRow(row.id, 'dureeEstimee', e.target.value)}
                                placeholder="Ex : 2.5" min={0} step={0.5} disabled={row.saved}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-300 disabled:opacity-60" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Étape précédente pour conditions */}
                      {row.estCondition && (
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Déclencher après (optionnel)</label>
                          <select value={row.etapePrecedenteId} onChange={e => updateWfRow(row.id, 'etapePrecedenteId', e.target.value)} disabled={row.saved}
                            className="w-full px-3 py-2 text-xs bg-violet-50 border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-300 disabled:opacity-60">
                            <option value="">— Sélectionner une étape (optionnel) —</option>
                            {workflows.map(w => <option key={w.id} value={w.id}>{w.estCondition ? `[Condition] ${w.etape}` : w.etape}</option>)}
                          </select>
                        </div>
                      )}

                      {/* Bouton Enregistrer */}
                      {!row.saved && (
                        <div className="flex items-center justify-end pt-1 border-t border-slate-100 mt-1">
                          <button type="button" onClick={() => saveWfRow(row.id)} disabled={row.saving}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm disabled:opacity-60">
                            {row.saving
                              ? <><FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Enregistrement…</>
                              : <><FontAwesomeIcon icon={faSave} /> Enregistrer l'étape</>}
                          </button>
                        </div>
                      )}
                      {row.saved && (
                        <div className="flex items-center justify-end pt-1 border-t border-emerald-100 mt-1">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                            <FontAwesomeIcon icon={faCheckCircle} /> Étape enregistrée
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {/* Bouton ajouter une autre étape */}
                <button
                  type="button"
                  onClick={addWfRow}
                  className="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 text-sm font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center">
                    <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
                  </div>
                  Ajouter une autre étape
                </button>
              </div>
            )}
          </div>
        </div>

      {/* Assignations */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shadow-md shadow-violet-500/20">
              <FontAwesomeIcon icon={faUserCheck} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Assignations</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {assignations.length} assignation{assignations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {assignations.length > 0 ? (
            <div className="space-y-2">
              {assignations.map((assignation) => {
                const assignedUser = userService.getUserById(assignation.assigneA);
                const assignedByUser = userService.getUserById(assignation.assignePar);
                // Même logique que la timeline : courrier orienté → assignation considérée terminée
                const statutsOrientes = ['ORIENTE_DG', 'ORIENTE_DIRECTEUR', 'ASSIGNE', 'EN_TRAITEMENT', 'TRAITE', 'ARCHIVE'];
                const effectiveStatut = (statutsOrientes.includes(courrier?.statut ?? '') && assignation.statut !== 'TERMINE')
                  ? 'TERMINE'
                  : assignation.statut;
                const isDone = effectiveStatut === 'TERMINE';
                const initials = assignedUser?.nom
                  ? assignedUser.nom.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                  : '?';
                const avatarColor = isDone ? 'bg-emerald-400' : effectiveStatut === 'EN_COURS' ? 'bg-blue-500' : 'bg-violet-500';
                return (
                  <div
                    key={assignation.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                      isDone ? 'border-slate-100 bg-white' : effectiveStatut === 'EN_COURS' ? 'border-blue-100 bg-blue-50/50' : 'border-amber-100 bg-amber-50/50'
                    }`}
                  >
                    {/* Identité */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm ${avatarColor}`}>
                        {isDone ? <FontAwesomeIcon icon={faCheck} /> : initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{assignedUser?.nom ?? assignation.assigneA}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          {assignedUser?.direction && (
                            <span className="text-xs text-slate-500 truncate">
                              <FontAwesomeIcon icon={faBuilding} className="mr-1 opacity-50" />
                              {assignedUser.direction}{assignedUser.service ? ` · ${assignedUser.service}` : ''}
                            </span>
                          )}
                          {assignedByUser && (
                            <span className="text-xs text-slate-400 truncate">par {assignedByUser.nom}</span>
                          )}
                        </div>
                        {assignation.instructions && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{assignation.instructions}</p>
                        )}
                      </div>
                    </div>
                    {/* Statut + action */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {assignation.dateEcheance && !isDone && (
                        <span className="text-[11px] text-slate-400 whitespace-nowrap hidden sm:inline">
                          <FontAwesomeIcon icon={faClock} className="mr-1" />
                          {new Date(assignation.dateEcheance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        isDone                          ? 'bg-emerald-100 text-emerald-700' :
                        effectiveStatut === 'EN_COURS' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        <FontAwesomeIcon icon={isDone ? faCheck : effectiveStatut === 'EN_COURS' ? faClock : faHourglassHalf} className="text-[9px]" />
                        {isDone ? 'Terminée' : effectiveStatut === 'EN_COURS' ? 'En cours' : 'En attente'}
                      </span>
                      {assignation.assigneA === user?.id && !isDone && (() => {
                        const { canTerminate, hint, buttonLabel } = getAssignationTerminationStatus(assignation);
                        return effectiveStatut === 'EN_COURS' ? (
                          <button
                            type="button"
                            disabled={!canTerminate}
                            title={!canTerminate ? hint : undefined}
                            onClick={async () => {
                              if (!canTerminate) return;
                              try {
                                await courrierService.updateAssignation(assignation.id, { statut: 'TERMINE' });
                                showAlert('Tâche marquée comme terminée', 'success');
                                await loadCourrier();
                              } catch (e) { showAlert('Erreur lors de la finalisation', 'error'); }
                            }}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              canTerminate ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <FontAwesomeIcon icon={faCheck} /> {buttonLabel}
                          </button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <FontAwesomeIcon icon={faUserCheck} className="text-4xl text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Aucune assignation</p>
              <p className="text-sm text-slate-400 mt-1">Aucune assignation pour ce courrier</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline des tâches */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <FontAwesomeIcon icon={faClock} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Timeline des tâches</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Historique chronologique des actions et rappels
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {loadingTasks ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
              <span className="ml-3 text-slate-600">Chargement de la timeline...</span>
            </div>
          ) : tasksTimeline.length === 0 ? (
            <div className="text-center py-12">
              <FontAwesomeIcon icon={faClock} className="text-4xl text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Aucune tâche trouvée</p>
              <p className="text-sm text-slate-400 mt-1">Ce courrier n'a pas encore de tâches associées</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-slate-200" />
              <div className="space-y-3">
                {tasksTimeline.map((task) => {
                  const isDone = task.status === 'TERMINE';
                  const dotColor =
                    task.type === 'enregistrement' ? 'bg-emerald-500' :
                    task.type === 'assignation'    ? (isDone ? 'bg-emerald-500' : 'bg-violet-500') :
                    task.type === 'workflow'       ? (isDone ? 'bg-emerald-500' : task.status === 'EN_COURS' ? 'bg-blue-500' : 'bg-amber-400') :
                    task.type === 'annotation'     ? 'bg-orange-400' : 'bg-slate-400';
                  return (
                    <div key={task.id} className="relative flex items-start gap-3 pl-1">
                      <div className={`relative z-10 flex-shrink-0 mt-3 w-4 h-4 rounded-full border-2 border-white shadow-sm ${dotColor}`} />
                      <div className={`flex-1 min-w-0 rounded-xl border px-4 py-3 ${isDone ? 'border-slate-100 bg-white' : 'border-amber-100 bg-amber-50'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {task.type === 'enregistrement' && <FontAwesomeIcon icon={faCircleCheck} className="text-emerald-500 flex-shrink-0 text-sm" />}
                            {task.type === 'assignation'    && <FontAwesomeIcon icon={faCompass}    className={`flex-shrink-0 text-sm ${isDone ? 'text-emerald-500' : 'text-violet-500'}`} />}
                            {task.type === 'workflow'       && <FontAwesomeIcon icon={faCodeBranch} className={`flex-shrink-0 text-sm ${isDone ? 'text-emerald-500' : 'text-blue-500'}`} />}
                            {task.type === 'annotation'     && <FontAwesomeIcon icon={faEdit}       className="text-orange-400 flex-shrink-0 text-sm" />}
                            <span className="font-semibold text-slate-800 text-sm truncate">{task.title}</span>
                            {task.user && <span className="text-xs text-slate-500 truncate hidden sm:inline">— {task.user.nom}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              isDone                      ? 'bg-emerald-100 text-emerald-700' :
                              task.status === 'EN_COURS' ? 'bg-blue-100 text-blue-700' :
                              task.status === 'REJETE'   ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              <FontAwesomeIcon icon={isDone ? faCheck : task.status === 'EN_COURS' ? faClock : faHourglassHalf} className="text-[9px]" />
                              {isDone ? 'Terminé' : task.status === 'EN_COURS' ? 'En cours' : task.status === 'REJETE' ? 'Rejeté' : 'En attente'}
                            </span>
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">
                              {new Date(task.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                        </div>
                        {task.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{task.description}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de visualisation des fichiers — en avant-plan */}
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
                {(hasRole(Role.SECRETAIRE) || hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL)) && (
                  <button
                    onClick={() => handleDeleteFile(viewFileData.fichier.id)}
                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                    title="Supprimer"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                )}
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
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </>
                  ) : (
                    <>
                      <p className="text-gray-700 text-center max-w-md font-medium">
                        Aperçu non disponible. Utilisez l'un des boutons ci-dessous pour télécharger ou ouvrir le fichier dans un nouvel onglet.
                      </p>
                      <div className="flex flex-wrap gap-3 justify-center">
                        <button
                          type="button"
                          onClick={handleDownloadViewedFile}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                  <div className="flex-shrink-0 flex flex-wrap items-center gap-3 p-3 bg-white border-b border-gray-200 rounded-t-lg">
                    <span className="text-sm font-medium text-gray-600">Afficher :</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setImagePreviewZoom(z => Math.max(0.25, z - 0.25))} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700" title="Zoom arrière">
                        <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-gray-600 min-w-[3rem] text-center">{Math.round(imagePreviewZoom * 100)} %</span>
                      <button type="button" onClick={() => setImagePreviewZoom(z => Math.min(3, z + 0.25))} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700" title="Zoom avant">
                        <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-4 h-4" />
                      </button>
                    </div>
                    <button type="button" onClick={() => { setImagePreviewZoom(1); setImagePreviewRotation(0); }} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm" title="Réinitialiser">
                      <FontAwesomeIcon icon={faExpand} className="mr-1.5" /> Réinitialiser
                    </button>
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setImagePreviewRotation(r => (r - 90 + 360) % 360 as 0 | 90 | 180 | 270)} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700" title="Pivoter à gauche">
                        <FontAwesomeIcon icon={faRotateLeft} className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-gray-600 min-w-[2.5rem] text-center">{imagePreviewRotation}°</span>
                      <button type="button" onClick={() => setImagePreviewRotation(r => (r + 90) % 360 as 0 | 90 | 180 | 270)} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700" title="Pivoter à droite">
                        <FontAwesomeIcon icon={faRotateRight} className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-600">Ajuster :</span>
                      {(['contain', 'cover', 'fill'] as const).map(fit => (
                        <button key={fit} type="button" onClick={() => setImagePreviewFit(fit)}
                          className={`px-3 py-1.5 rounded-lg text-sm ${ imagePreviewFit === fit ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700' }`}
                          title={fit === 'contain' ? 'Contenir (voir tout)' : fit === 'cover' ? 'Couvrir (remplir)' : 'Étirer'}
                        >
                          {fit === 'contain' ? 'Contenir' : fit === 'cover' ? 'Couvrir' : 'Étirer'}
                        </button>
                      ))}
                    </div>
                    {imagePreviewSize && <span className="ml-auto text-xs text-gray-400">{imagePreviewSize.w} × {imagePreviewSize.h} px</span>}
                  </div>
                  <div className="flex-1 min-h-[50vh] overflow-auto flex items-center justify-center p-4 bg-[#d1d5db]">
                    <div className="bg-white rounded-sm overflow-hidden relative flex items-center justify-center min-h-[300px] w-full"
                      style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 10px 25px -5px rgba(0,0,0,0.12)', maxHeight: 'min(75vh, 640px)', maxWidth: '100%' }}
                    >
                      <img
                        key={viewFileData.url}
                        src={viewFileData.url}
                        alt={viewFileData.fichier.nom}
                        onLoad={e => { const img = e.currentTarget; if (img.naturalWidth) setImagePreviewSize({ w: img.naturalWidth, h: img.naturalHeight }); }}
                        className="max-w-full max-h-full w-auto h-auto origin-center transition-transform duration-150 object-contain"
                        style={{ objectFit: imagePreviewFit, transform: `scale(${imagePreviewZoom}) rotate(${imagePreviewRotation}deg)`, minHeight: 1 }}
                      />
                    </div>
                  </div>
                </div>
              ) : ['doc', 'docx'].includes(viewFileData.fichier.extension || '') ? (
                editMode === 'edit' ? (
                  <WordEditor
                    fileUrl={viewFileData.url}
                    fileName={viewFileData.fichier.nom}
                    onSave={() => { showAlert('Fichier modifié avec succès', 'success'); setEditMode('view'); }}
                    onCancel={() => setEditMode('view')}
                  />
                ) : (
                  (() => {
                    const isBlobUrl = viewFileData.url.startsWith('blob:');
                    if (isBlobUrl) {
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-white">
                          <FontAwesomeIcon icon={getFileIcon(viewFileData.fichier.extension)} className={`text-6xl ${getFileIconColor(viewFileData.fichier.extension)} mb-4`} />
                          <p className="text-gray-600 mb-4 text-center">Cliquez sur "Éditer" pour modifier ce document Word directement dans le navigateur.</p>
                          <div className="flex gap-3">
                            <button onClick={() => setEditMode('edit')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
                              <FontAwesomeIcon icon={faEdit} /> Éditer
                            </button>
                            <a href={viewFileData.url} download={viewFileData.fichier.nom} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                              <FontAwesomeIcon icon={faDownload} /> Télécharger
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
                          <p className="text-sm text-gray-600">Mode aperçu — cliquez sur "Éditer" pour modifier</p>
                          <button onClick={() => setEditMode('edit')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2">
                            <FontAwesomeIcon icon={faEdit} /> Éditer
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
                    onSave={() => { showAlert('Fichier modifié avec succès', 'success'); setEditMode('view'); }}
                    onCancel={() => setEditMode('view')}
                  />
                ) : (
                  (() => {
                    const isBlobUrl = viewFileData.url.startsWith('blob:');
                    if (isBlobUrl) {
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-white">
                          <FontAwesomeIcon icon={getFileIcon(viewFileData.fichier.extension)} className={`text-6xl ${getFileIconColor(viewFileData.fichier.extension)} mb-4`} />
                          <p className="text-gray-600 mb-4 text-center">Cliquez sur "Éditer" pour modifier ce fichier Excel directement dans le navigateur.</p>
                          <div className="flex gap-3">
                            <button onClick={() => setEditMode('edit')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
                              <FontAwesomeIcon icon={faEdit} /> Éditer
                            </button>
                            <a href={viewFileData.url} download={viewFileData.fichier.nom} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                              <FontAwesomeIcon icon={faDownload} /> Télécharger
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
                          <p className="text-sm text-gray-600">Mode aperçu — cliquez sur "Éditer" pour modifier</p>
                          <button onClick={() => setEditMode('edit')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2">
                            <FontAwesomeIcon icon={faEdit} /> Éditer
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )
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
        </div>
      , document.body)}

      {/* Overlay du drawer */}
      {drawerOpen && (
        <>
        <div className="fixed inset-0 z-[50000]" onClick={() => setDrawerOpen(false)} />
          <div
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200 z-[50001]"
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
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Fermer"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="p-3 border-b border-slate-200 shrink-0 space-y-3">
              <input
                type="search"
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                placeholder="Rechercher un courrier..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 text-sm"
              />
              {/* Filtres Direction / Service / Sous-service */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filtres</span>
                  {drawerFilterSelectionIds.some(Boolean) && (
                    <button
                      type="button"
                      onClick={() => { setDrawerFilterSelectionIds([]); setDrawerFilterEntityType('ALL'); setDrawerFilterEntityId('ALL'); }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
                {drawerFilterLevels.map((level, i) => {
                  const parentId = i === 0 ? null : (drawerFilterSelectionIds[i - 1] ?? null);
                  const options = i === 0
                    ? entiteOrganisationnelleService.getDirectionsForFilters()
                    : parentId
                      ? entiteOrganisationnelleService.getEntitiesByParent(parentId).filter(e => e.type === level.code).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                      : [];
                  const selectedId = drawerFilterSelectionIds[i] ?? null;
                  const selectedNom = selectedId ? entiteOrganisationnelleService.getEntityById(selectedId)?.nom ?? '' : '';
                  const icon = level.code === 'direction' ? faBuilding : level.code === 'division' ? faLayerGroup : level.code === 'service' ? faUsers : faFolder;
                  return (
                    <div key={level.code}>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{level.libelleSingulier}</label>
                      <SearchableSelect
                        options={options.map(e => ({ value: e.nom, label: e.nom }))}
                        value={selectedNom}
                        onChange={(nom) => {
                          const entity = options.find(e => e.nom === nom);
                          const id = entity?.id ?? null;
                          setDrawerFilterSelectionIds(prev => {
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
                })}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {(() => {
                const q = drawerSearch.trim().toLowerCase();
                let filtered = q
                  ? listCourriers.filter(
                      (c) =>
                        c.numero.toLowerCase().includes(q) ||
                        (c.objet || '').toLowerCase().includes(q) ||
                        (c.expediteur || '').toLowerCase().includes(q) ||
                        (c.destinataire || '').toLowerCase().includes(q) ||
                        (c.direction || '').toLowerCase().includes(q) ||
                        (c.service || '').toLowerCase().includes(q)
                    )
                  : listCourriers;
                if (drawerFilterEntityType !== 'ALL' && drawerFilterEntityId !== 'ALL') {
                  const entityType = drawerFilterEntityType;
                  const entityId = drawerFilterEntityId;
                  filtered = filtered.filter(c => {
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
                const sorted = [...filtered].sort(
                  (a, b) => new Date(b.dateEnregistrement).getTime() - new Date(a.dateEnregistrement).getTime()
                );
                if (sorted.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <FontAwesomeIcon icon={faFileAlt} className="text-4xl text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">
                        {listCourriers.length === 0 ? 'Aucun courrier chargé' : 'Aucun résultat'}
                      </p>
                      <p className="text-sm text-slate-400 mt-1">
                        {listCourriers.length === 0 ? 'Ouvrez la liste depuis la page Courriers' : 'Modifiez la recherche'}
                      </p>
                    </div>
                  );
                }
                return (
                  <ul className="space-y-2">
                    {sorted.map((c) => {
                      const isCurrent = c.id === id;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              navigate(`/courriers/${c.id}`);
                              setDrawerOpen(false);
                            }}
                            className={`w-full text-left p-3 rounded-xl border transition-all ${
                              isCurrent
                                ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500/30'
                                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-semibold text-slate-800 truncate">{c.numero}</span>
                              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-lg border ${getStatutBadge(c.statut)}`}>
                                {c.statut.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 line-clamp-2">{c.objet || '—'}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {new Date(c.dateEnregistrement).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {(c.direction || c.service) && (
                                <span className="ml-2">
                                  • {[c.direction, c.service].filter(Boolean).join(' / ')}
                                </span>
                              )}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── Modal Retour d'étape ────────────────────────────────────────── */}
      {retourEtape && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[50010] p-4"
          onClick={() => setRetourEtape(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`bg-gradient-to-r ${workflowStatusColors[retourEtape.statut]?.bg ?? 'from-slate-600 to-slate-700'} px-5 py-4 flex items-center justify-between`}>
              <div>
                <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wider">Retour d'étape</p>
                <h2 className="text-white font-bold text-base leading-tight mt-0.5">{retourEtape.etape}</h2>
                {(() => {
                  const assigneUser = userService.getUserById(retourEtape.assigneA);
                  const creeParUser = userService.getUserById(retourEtape.creePar);
                  return (
                    <p className="text-white/70 text-xs mt-1">
                      {assigneUser ? `Assigné à ${assigneUser.nom}` : ''}
                      {creeParUser ? ` · Créé par ${creeParUser.nom}` : ''}
                    </p>
                  );
                })()}
              </div>
              <button onClick={() => setRetourEtape(null)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
                <FontAwesomeIcon icon={faXmark} className="text-lg" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Historique des retours */}
              {(retourEtape.responses ?? []).length > 0 && (
                <div className="px-5 pt-4 pb-2 space-y-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Historique des retours</p>
                  {(retourEtape.responses ?? [])
                    .slice()
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    .map((r) => {
                      const auteurUser = userService.getUserById(r.auteurId);
                      const isMe = String(r.auteurId) === String(user?.id);
                      const decisionCfg = r.decision === 'AVIS_FAVORABLE'
                        ? { cls: 'bg-emerald-100 text-emerald-700', label: 'Favorable' }
                        : r.decision === 'A_REVOIR'
                          ? { cls: 'bg-amber-100 text-amber-700', label: 'À revoir' }
                          : r.decision === 'INFO'
                            ? { cls: 'bg-blue-100 text-blue-700', label: 'Info' }
                            : null;
                      return (
                        <div key={r.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isMe ? 'bg-blue-500' : 'bg-slate-400'}`}>
                            {(auteurUser?.nom ?? r.auteurNom ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div className={`flex-1 max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                            <div className={`rounded-xl px-3 py-2 text-sm ${isMe ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50 border border-slate-100'}`}>
                              <p className="font-semibold text-slate-700 text-xs mb-1">{auteurUser?.nom ?? r.auteurNom ?? r.auteurId}</p>
                              <p className="text-slate-700 whitespace-pre-wrap">{r.message}</p>
                              {decisionCfg && (
                                <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${decisionCfg.cls}`}>
                                  {r.decision === 'AVIS_FAVORABLE' ? '✓' : r.decision === 'A_REVOIR' ? '↩' : 'ℹ'} {decisionCfg.label}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 px-1">
                              {new Date(r.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Formulaire selon rôle — visible uniquement pour l'assigné ou un supérieur hiérarchique */}
              {retourEtape.statut !== 'TERMINE' && (() => {
                const hierarchie = [Role.AGENT, Role.CHEF_SERVICE, Role.DIRECTEUR, Role.DIRECTEUR_GENERAL, Role.SUPER_ADMIN];
                const assigneUser = userService.getUserById(retourEtape.assigneA);
                const isAssigne = String(retourEtape.assigneA) === String(user?.id);
                const isCreateur = String(retourEtape.creePar) === String(user?.id);
                // Supérieur = rôle plus haut dans la hiérarchie ET même direction
                const myRoleIdx = hierarchie.indexOf(user?.role as Role);
                const assigneRoleIdx = hierarchie.indexOf(assigneUser?.role as Role);
                const isSuperior = myRoleIdx > assigneRoleIdx &&
                  (user?.direction === assigneUser?.direction || user?.role === Role.SUPER_ADMIN || user?.role === Role.DIRECTEUR_GENERAL);
                const canSubmit = isAssigne || isCreateur || isSuperior;
                if (!canSubmit) return (
                  <div className="px-5 py-6 text-center border-t border-slate-100">
                    <FontAwesomeIcon icon={faLock} className="text-3xl text-slate-300 mb-2" />
                    <p className="text-sm font-medium text-slate-500">Accès restreint</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Seul {assigneUser ? assigneUser.nom : 'l\'assigné'} ou son supérieur peut soumettre un retour.
                    </p>
                  </div>
                );
                return (
                <div className="px-5 py-4 border-t border-slate-100 space-y-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {user?.role === Role.DIRECTEUR || user?.role === Role.DIRECTEUR_GENERAL ? 'Rapport de validation' :
                     user?.role === Role.CHEF_SERVICE ? 'Rapport de synthèse' :
                     'Confirmer l\'exécution'}
                  </p>

                  {/* Décision */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Décision</label>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { value: 'AVIS_FAVORABLE' as WorkflowDecision, label: 'Favorable', cls: 'border-emerald-300 text-emerald-700 bg-emerald-50', active: 'bg-emerald-500 text-white border-emerald-500' },
                        { value: 'A_REVOIR' as WorkflowDecision, label: 'À revoir', cls: 'border-amber-300 text-amber-700 bg-amber-50', active: 'bg-amber-500 text-white border-amber-500' },
                        { value: 'INFO' as WorkflowDecision, label: 'Information', cls: 'border-blue-300 text-blue-700 bg-blue-50', active: 'bg-blue-500 text-white border-blue-500' },
                      ]).map(d => (
                        <button key={d.value} type="button"
                          onClick={() => setRetourDecision(retourDecision === d.value ? undefined : d.value)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${retourDecision === d.value ? d.active : d.cls}`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                      {user?.role === Role.DIRECTEUR || user?.role === Role.DIRECTEUR_GENERAL
                        ? 'Rapport / observations'
                        : user?.role === Role.CHEF_SERVICE
                          ? 'Synthèse du travail effectué'
                          : 'Confirmer l\'exécution de la tâche'}
                      <span className="text-red-400 ml-0.5">*</span>
                    </label>
                    <textarea
                      rows={user?.role === Role.AGENT ? 2 : 4}
                      value={retourMessage}
                      onChange={e => setRetourMessage(e.target.value)}
                      disabled={retourSubmitting}
                      placeholder={
                        user?.role === Role.AGENT
                          ? 'Confirmez brièvement l\'exécution de votre tâche…'
                          : user?.role === Role.CHEF_SERVICE
                            ? 'Rédigez votre synthèse des travaux effectués par votre équipe…'
                            : 'Rédigez votre rapport de validation ou vos observations…'
                      }
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-300 resize-none bg-slate-50 placeholder-slate-400"
                    />
                  </div>

                  {/* Upload fichier (Directeur / DG seulement) */}
                  {(user?.role === Role.DIRECTEUR || user?.role === Role.DIRECTEUR_GENERAL || user?.role === Role.SUPER_ADMIN) && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Pièce jointe (optionnel)</label>
                      <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed cursor-pointer transition-all text-sm ${retourFichier ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}`}>
                        <FontAwesomeIcon icon={faUpload} className="text-xs" />
                        {retourFichier ? retourFichier.name : 'Joindre un document (PDF, Word…)'}
                        <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg"
                          onChange={e => setRetourFichier(e.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                  )}

                  {/* Bouton soumettre */}
                  <button
                    type="button"
                    onClick={handleSubmitRetour}
                    disabled={!retourMessage.trim() || retourSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {retourSubmitting
                      ? <><FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Envoi en cours…</>
                      : <><FontAwesomeIcon icon={faCheck} /> Soumettre le retour</>}
                  </button>
                </div>
                );
              })()}

              {retourEtape.statut === 'TERMINE' && (retourEtape.responses ?? []).length === 0 && (
                <div className="px-5 py-8 text-center text-slate-400">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-4xl text-emerald-400 mb-2" />
                  <p className="text-sm font-medium text-slate-600">Étape terminée</p>
                  <p className="text-xs mt-1">Aucun retour enregistré pour cette étape.</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CustomDialog */}
      {dialog.isOpen && (
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
      )}
    </div>
  );
};

export default DetailCourrier;

