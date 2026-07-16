// Types pour la gestion des courriers

export enum TypeCourrier {
  INTERNE = 'INTERNE',
  EXTERNE = 'EXTERNE'
}

export enum StatutCourrier {
  ENREGISTRE = 'ENREGISTRE',
  EN_ATTENTE_DG = 'EN_ATTENTE_DG',
  ORIENTE_DG = 'ORIENTE_DG',
  ORIENTE_DIRECTEUR = 'ORIENTE_DIRECTEUR',
  EN_TRAITEMENT = 'EN_TRAITEMENT',
  ASSIGNE = 'ASSIGNE',
  TRAITE = 'TRAITE',
  ARCHIVE = 'ARCHIVE'
}

export enum Priorite {
  BASSE = 'BASSE',
  NORMALE = 'NORMALE',
  HAUTE = 'HAUTE',
  URGENTE = 'URGENTE'
}

export enum SensCourrier {
  ENTRANT = 'ENTRANT',
  SORTANT = 'SORTANT'
}

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SECRETAIRE = 'SECRETAIRE',
  DIRECTEUR_GENERAL = 'DIRECTEUR_GENERAL',
  DIRECTEUR = 'DIRECTEUR',
  CHEF_SERVICE = 'CHEF_SERVICE',
  AGENT = 'AGENT'
}

export enum Permission {
  // Gestion des courriers
  VOIR_COURRIERS = 'VOIR_COURRIERS',
  ALL_COURRIERS_VIEW = 'ALL_COURRIERS_VIEW',
  CREER_COURRIER = 'CREER_COURRIER',
  MODIFIER_COURRIER = 'MODIFIER_COURRIER',
  SUPPRIMER_COURRIER = 'SUPPRIMER_COURRIER',
  ASSIGNER_COURRIER = 'ASSIGNER_COURRIER',
  CREER_COURRIER_SORTANT_EXTERNE = 'CREER_COURRIER_SORTANT_EXTERNE',
  VIEW_RAPPELS = 'VIEW_RAPPELS',
  // Gestion des workflows
  CREER_WORKFLOW = 'CREER_WORKFLOW',
  MODIFIER_WORKFLOW = 'MODIFIER_WORKFLOW',
  
  // Gestion des utilisateurs
  VOIR_UTILISATEURS = 'VOIR_UTILISATEURS',
  CREER_UTILISATEUR = 'CREER_UTILISATEUR',
  MODIFIER_UTILISATEUR = 'MODIFIER_UTILISATEUR',
  SUPPRIMER_UTILISATEUR = 'SUPPRIMER_UTILISATEUR',
  
  // Gestion des rôles
  VOIR_ROLES = 'VOIR_ROLES',
  CREER_ROLE = 'CREER_ROLE',
  MODIFIER_ROLE = 'MODIFIER_ROLE',
  SUPPRIMER_ROLE = 'SUPPRIMER_ROLE',
  
  // Gestion des départements
  VOIR_DEPARTEMENTS = 'VOIR_DEPARTEMENTS',
  CREER_DEPARTEMENT = 'CREER_DEPARTEMENT',
  MODIFIER_DEPARTEMENT = 'MODIFIER_DEPARTEMENT',
  SUPPRIMER_DEPARTEMENT = 'SUPPRIMER_DEPARTEMENT',
  
  // Gestion des permissions
  VOIR_PERMISSIONS = 'VOIR_PERMISSIONS',
  MODIFIER_PERMISSIONS = 'MODIFIER_PERMISSIONS',
  
  // Filtres par entités organisationnelles
  FILTRER_PAR_DIRECTION = 'FILTRER_PAR_DIRECTION',
  FILTRER_PAR_SERVICE = 'FILTRER_PAR_SERVICE',
  FILTRER_PAR_SOUS_SERVICE = 'FILTRER_PAR_SOUS_SERVICE',
}

export interface Utilisateur {
  id: string;
  nom: string;
  email: string;
  role: Role;
  direction?: string;
  service?: string;
  entiteId?: string; // ID de l'entité organisationnelle (sous-service, division, bureau, cellule, etc.)
  actif: boolean;
  photoUrl?: string;
  dateCreation: Date;
  dateModification: Date;
  creePar?: string;
  permissions?: Permission[];
}

export interface RoleDefinition {
  id: string;
  nom: string;
  code: Role;
  description?: string;
  permissions: Permission[];
  dateCreation: Date;
  dateModification: Date;
}

export interface Departement {
  id: string;
  nom: string;
  code?: string;
  description?: string;
  responsableId?: string;
  parentId?: string; // Pour les hiérarchies
  actif: boolean;
  dateCreation: Date;
  dateModification: Date;
}

// Types d'entités organisationnelles (ordre hiérarchique : Direction générale → Direction → Division → Service → …)
export type TypeEntiteOrganisationnelle =
  | 'direction_generale'  // Niveau 1 : sommet (ex. Direction Générale, organes externes)
  | 'direction'           // Niveau 2 : directions sous la Direction générale
  | 'division'           // Niveau 3 : divisions sous une direction
  | 'service'            // Niveau 4 : services sous une division
  | 'sous-service'       // Niveau 5
  | 'bureau'             // Niveau 6
  | 'cellule';           // Niveau 7

/** Ordre d’affichage et de validation hiérarchique des types */
export const ENTITE_TYPE_ORDER: Record<TypeEntiteOrganisationnelle, number> = {
  direction_generale: 1,
  direction: 2,
  division: 3,
  service: 4,
  'sous-service': 5,
  bureau: 6,
  cellule: 7,
};

export interface EntiteOrganisationnelle {
  id: string;
  nom: string;
  type: TypeEntiteOrganisationnelle;
  description?: string;
  parentId?: string; // ID de l'entité parente (direction, service, etc.)
  ordre?: number; // Ordre d'affichage
  actif?: boolean; // Si l'entité est active
  /** ID de l'utilisateur chef/responsable (ex. chef de division, chef de bureau) */
  responsableId?: string;
}

// Configuration des types d'entités (dénominations administratives)
export interface EntiteTypeDefinition {
  id: string;
  code: TypeEntiteOrganisationnelle;
  libelleSingulier: string; // ex: "Direction"
  libellePluriel: string;   // ex: "Directions"
  description?: string;
  icone?: string; // nom d'icône FontAwesome ou clé interne (ex: "building")
  ordre: number;
  actif: boolean;
}

// Interfaces de compatibilité pour la rétrocompatibilité
export interface Direction {
  id: string;
  nom: string;
  description?: string;
}

export interface Service {
  id: string;
  nom: string;
  directionId: string;
  serviceId?: string;
  description?: string;
  /** ID du responsable/chef (pour affichage organigramme) */
  responsableId?: string;
}

export interface CategorieFichier {
  id: string;
  nom: string;
  type: 'categorie' | 'fichier';
  courrierId: string;
  parentId?: string; // ID de la catégorie parente (null pour la racine)
  chemin?: string; // Chemin du fichier ou URL
  extension?: string; // Extension du fichier (ex: pdf, docx, xlsx)
  taille?: number; // Taille en octets
  /** Si true, le fichier est un accusé de réception joint au courrier */
  estAccuseReception?: boolean;
  dateCreation: Date;
  dateModification: Date;
  creePar: string; // ID de l'utilisateur
}

export interface CategorieCourrier {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  userId?: string;
  color?: string | null;
}

export interface Courrier {
  id: string;
  numero: string;
  type: TypeCourrier;
  /** Entrant ou sortant — utilisé pour l'affichage et le formulaire. */
  sens?: SensCourrier;
  dateReception: Date;
  dateEnregistrement: Date;
  expediteur: string;
  destinataire: string;
  objet: string;
  priorite: Priorite;
  statut: StatutCourrier;
  enregistrePar: string; // ID du secrétaire
  fichier?: string; // URL ou chemin du fichier (déprécié, utiliser categorieFichiers)
  categorieFichiers?: CategorieFichier[]; // Structure hiérarchique de catégories et fichiers
  direction?: string;
  service?: string;
  workflow?: WorkflowEtape[];
  annotations?: Annotation[];
  assignations?: Assignation[];
  extraFields?: Record<string, any>; // Champs dynamiques configurés dans le paramétrage
  /** ID de la catégorie (CategorieCourrier) dans laquelle ce courrier est rangé */
  categorieId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowEtape {
  id: string;
  courrierId: string;
  etape: string;
  assigneA: string; // ID utilisateur
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'REJETE';
  dateDebut?: Date;
  dateFin?: Date;
  commentaire?: string;
  creePar: string; // ID du DG
  createdAt: Date;
  dureeEstimee?: number; // Durée estimée en heures
  declencheur?: {
    type: 'IMMEDIAT' | 'APRES_ETAPE' | 'CONDITION' | 'DATE';
    etapePrecedenteId?: string; // Pour APRES_ETAPE
    condition?: string; // Pour CONDITION
    dateDeclenchement?: Date; // Pour DATE
  };
  ordre?: number; // Ordre d'exécution des étapes
  // Pour les conditions : références aux actions si vrai et si faux
  actionSiVrai?: string; // ID de l'étape à exécuter si condition vraie
  actionSiFaux?: string; // ID de l'étape à exécuter si condition fausse
  estCondition?: boolean; // Indique si cette étape est une condition
  responses?: WorkflowResponse[];
}

export type WorkflowDecision = 'AVIS_FAVORABLE' | 'A_REVOIR' | 'INFO';

export interface WorkflowResponse {
  id: string;
  auteurId: string;
  auteurNom?: string;
  message: string;
  decision?: WorkflowDecision;
  createdAt: Date;
}

export interface Annotation {
  id: string;
  courrierId: string;
  auteur: string; // ID utilisateur
  contenu: string;
  type: 'MINUTE' | 'NOTE' | 'COMMENTAIRE';
  dateCreation: Date;
  fichiers?: string[]; // URLs des fichiers joints
  /** Si renseigné, l'annotation est rattachée à une étape de workflow et affichée comme contenu de cette étape */
  workflowEtapeId?: string;
}

export interface Assignation {
  id: string;
  courrierId: string;
  assigneA: string; // ID utilisateur
  assignePar: string; // ID utilisateur
  dateAssignation: Date;
  dateEcheance?: Date;
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE';
  instructions?: string;
  rappels?: Rappel[];
}

export interface Rappel {
  id: string;
  assignationId: string;
  courrierId: string;
  dateRappel: Date;
  envoye: boolean;
  // Peut être absent ou explicitement null dans Firestore
  message?: string | null;
  createdAt: Date;
}

// Types pour les procédures
export interface ProcedureAction {
  id: string;
  nom: string;
  description?: string;
  dureeEstimee: number; // en heures
  ordre: number;
  acteurId?: string; // ID de l'utilisateur responsable
  instructions?: string;
  type: 'AUTOMATIQUE' | 'MANUEL' | 'VALIDATION';
}

export interface ProcedureEvent {
  id: string;
  nom: string;
  description?: string;
  dateDebut: Date;
  dateFin: Date;
  actions: ProcedureAction[];
  ordre: number;
}

export interface Procedure {
  id: string;
  nom: string;
  description?: string;
  acteurs: string[]; // IDs des utilisateurs assignés à la procédure
  evenements: ProcedureEvent[];
  dureeTotale: number; // en heures, calculée à partir des actions
  dateCreation: Date;
  dateModification: Date;
  creePar: string; // ID de l'utilisateur créateur
  actif: boolean;
}

export interface ProcedureInstance {
  id: string;
  procedureId: string;
  courrierId: string;
  dateDebut: Date;
  dateFinPrevue: Date;
  dateFinReelle?: Date;
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'ANNULE';
  acteurs: string[]; // IDs des utilisateurs assignés
  evenements: ProcedureEventInstance[];
  creePar: string;
  createdAt: Date;
}

export interface ProcedureEventInstance {
  id: string;
  eventId: string;
  dateDebut: Date;
  dateFinPrevue: Date;
  dateFinReelle?: Date;
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE';
  actions: ProcedureActionInstance[];
}

export interface ProcedureActionInstance {
  id: string;
  actionId: string;
  dateDebut?: Date;
  dateFinPrevue: Date;
  dateFinReelle?: Date;
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'BLOQUE';
  acteurId?: string;
  commentaires?: string;
}

// Interface pour les activités de workflow dans le planning
export interface WorkflowActivity {
  id: string;
  workflowEtapeId: string;
  courrierId: string;
  courrierNumero: string;
  courrierObjet: string;
  etape: string;
  assigneA: string;
  dateDebutPrevue: Date;
  dateFinPrevue: Date;
  dateDebutReelle?: Date;
  dateFinReelle?: Date;
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'REJETE';
  dureeEstimee?: number;
  ordre?: number;
}

// ==========================================
// TYPES POUR LE MODULE D'ARCHIVAGE
// ==========================================

// Environnement physique d'archivage
export interface LocalArchivage {
  id: string;
  nom: string;
  code: string;
  adresse?: string;
  batiment?: string;
  etage?: string;
  description?: string;
  capacite?: number; // Nombre d'armoires max
  responsableId?: string;
  actif: boolean;
  photoPanoramique?: string; // URL de la photo panoramique 360°
  dateCreation: Date;
  dateModification: Date;
}

export interface Armoire {
  id: string;
  localId: string;
  nom: string;
  code: string;
  nombreEtageres: number;
  description?: string;
  position?: string; // Ex: "Rangée A", "Mur Nord"
  actif: boolean;
  dateCreation: Date;
  dateModification: Date;
}

export interface Etagere {
  id: string;
  armoireId: string;
  numero: number;
  nom?: string;
  capaciteBoites: number;
  description?: string;
  actif: boolean;
  dateCreation: Date;
  dateModification: Date;
}

export interface BoiteArchive {
  id: string;
  etagereId: string;
  numero: string;
  code: string; // Code-barres ou QR code
  annee?: number;
  typeContenu?: string; // Ex: "Courriers entrants", "Factures"
  dateDebut?: Date;
  dateFin?: Date;
  description?: string;
  estPleine: boolean;
  actif: boolean;
  dateCreation: Date;
  dateModification: Date;
}

// Archive d'un document/courrier
export interface Archive {
  id: string;
  courrierId: string;
  boiteId: string;
  numeroClassement: string;
  dateArchivage: Date;
  archivePar: string; // ID utilisateur
  motif?: string;
  observations?: string;
  dureeConservation?: number; // En années
  dateDestruction?: Date;
  statut: 'ARCHIVE' | 'CONSULTE' | 'SORTI' | 'DETRUIT';
  // Historique des consultations/sorties
  historique?: ArchiveHistorique[];
  dateCreation: Date;
  dateModification: Date;
}

export interface ArchiveHistorique {
  id: string;
  archiveId: string;
  action: 'ARCHIVAGE' | 'CONSULTATION' | 'SORTIE' | 'RETOUR' | 'DESTRUCTION';
  date: Date;
  utilisateurId: string;
  motif?: string;
  observations?: string;
}

// Configuration des dénominations d'archivage
export type IconeArchivage = 
  | 'warehouse' | 'building' | 'home' | 'store' | 'industry' 
  | 'box' | 'cabinet' | 'archive' | 'folder' | 'drawer'
  | 'layer' | 'shelf' | 'bars' | 'grip' | 'th'
  | 'cube' | 'package' | 'inbox' | 'file' | 'hdd';

export interface DenominationArchivage {
  id: string;
  niveau: 1 | 2 | 3 | 4; // 1=Local, 2=Armoire, 3=Étagère, 4=Boîte
  nomSingulier: string;
  nomPluriel: string;
  icone: IconeArchivage;
  couleur: string; // Classe Tailwind (ex: "purple", "blue", "green", "amber")
  description?: string;
  actif: boolean;
  dateModification: Date;
}

// Paramètres d'archivage
export interface ParametresArchivage {
  id: string;
  dureeConservationDefaut: number; // En années
  formatNumeroClassement: string; // Ex: "ARCH-{ANNEE}-{NUMERO}"
  alerteBoitePleine: boolean;
  alerteDestructionJoursAvant: number;
  denominations: DenominationArchivage[];
  actif: boolean;
  dateModification: Date;
}
