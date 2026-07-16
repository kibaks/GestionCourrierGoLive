import { Role, Utilisateur, WorkflowEtape, Annotation } from '../types';

/**
 * Résultat de l'évaluation de la complétion d'une tâche
 */
export interface TaskCompletionResult {
  isComplete: boolean;
  reason: string;
  completedAt?: Date;
}

/**
 * Configuration des règles de complétion par rôle
 */
interface RoleCompletionConfig {
  /** Rôles concernés par la règle */
  roles: Role[];
  /** 
   * Type d'action qui termine la tâche
   * - 'ANNOTATION_OR_STEP': Au moins une annotation ou étape créée
   * - 'STEP_COMPLETED': Les étapes assignées doivent être terminées
   * - 'ORIENTATION_DONE': L'orientation doit être effectuée
   */
  completionType: 'ANNOTATION_OR_STEP' | 'STEP_COMPLETED' | 'ORIENTATION_DONE';
  /** Description de la règle */
  description: string;
}

/**
 * Configurations des règles de complétion par rôle
 */
const ROLE_COMPLETION_CONFIGS: RoleCompletionConfig[] = [
  {
    roles: [Role.DIRECTEUR_GENERAL],
    completionType: 'ANNOTATION_OR_STEP',
    description: 'Pour le DG, la tâche est terminée quand au moins une annotation ou étape est créée'
  },
  {
    roles: [Role.DIRECTEUR],
    completionType: 'ANNOTATION_OR_STEP',
    description: 'Pour le Directeur, la tâche est terminée quand au moins une annotation ou étape est créée'
  },
  {
    roles: [Role.CHEF_SERVICE],
    completionType: 'ANNOTATION_OR_STEP',
    description: 'Pour le Chef de Service/Division/Bureau, la tâche est terminée quand au moins une annotation ou étape est créée'
  },
  {
    roles: [Role.SECRETAIRE],
    completionType: 'ORIENTATION_DONE',
    description: 'Pour les secrétaires, la tâche est terminée quand l\'orientation a été effectuée'
  },
  {
    roles: [Role.AGENT],
    completionType: 'STEP_COMPLETED',
    description: 'Pour les agents, la tâche est terminée quand les étapes assignées sont terminées'
  }
];

class TaskCompletionService {
  /**
   * Vérifie si une tâche est terminée selon le rôle de l'utilisateur
   * 
   * @param user - L'utilisateur qui effectue l'action
   * @param context - Le contexte de l'action (annotations, étapes, orientation)
   * @returns Le résultat de l'évaluation
   */
  checkTaskCompletion(
    user: Utilisateur,
    context: {
      /** Annotations créées par l'utilisateur */
      annotations?: Annotation[];
      /** Étapes de workflow créées par l'utilisateur */
      createdSteps?: WorkflowEtape[];
      /** Étapes assignées à l'utilisateur */
      assignedSteps?: WorkflowEtape[];
      /** L'orientation a-t-elle été effectuée */
      orientationDone?: boolean;
      /** L'action est-elle liée à une orientation */
      isOrientationRelated?: boolean;
    }
  ): TaskCompletionResult {
    const config = this.getCompletionConfig(user.role);
    
    if (!config) {
      // Par défaut, pour les rôles non configurés, utiliser STEP_COMPLETED
      return this.checkStepCompleted(context.assignedSteps);
    }

    switch (config.completionType) {
      case 'ANNOTATION_OR_STEP':
        // Pour DG/Directeur/Chef: tâche terminée si au moins une annotation ou étape créée
        // ET que c'est lié à l'orientation
        if (context.isOrientationRelated !== false) {
          return this.checkAnnotationOrStepCreated(
            context.annotations,
            context.createdSteps,
            config.description
          );
        }
        // Si pas lié à l'orientation, utiliser la règle standard
        return this.checkStepCompleted(context.assignedSteps);
        
      case 'ORIENTATION_DONE':
        // Pour SEC: tâche terminée si orientation effectuée
        return this.checkOrientationDone(context.orientationDone, config.description);
        
      case 'STEP_COMPLETED':
        // Pour AGENT et autres: tâche terminée si étapes assignées terminées
        return this.checkStepCompleted(context.assignedSteps);
        
      default:
        return {
          isComplete: false,
          reason: 'Règle de complétion non reconnue'
        };
    }
  }

  /**
   * Vérifie si au moins une annotation ou étape a été créée
   */
  private checkAnnotationOrStepCreated(
    annotations?: Annotation[],
    createdSteps?: WorkflowEtape[],
    description?: string
  ): TaskCompletionResult {
    const hasAnnotations = annotations && annotations.length > 0;
    const hasCreatedSteps = createdSteps && createdSteps.length > 0;
    
    if (hasAnnotations || hasCreatedSteps) {
      const lastAnnotation = annotations?.[annotations.length - 1];
      const lastStep = createdSteps?.[createdSteps.length - 1];
      const completedAt = lastAnnotation?.dateCreation || 
                         lastStep?.createdAt || 
                         new Date();
      
      return {
        isComplete: true,
        reason: description || 'Tâche terminée : annotation ou étape créée',
        completedAt
      };
    }
    
    return {
      isComplete: false,
      reason: 'En attente : aucune annotation ou étape créée'
    };
  }

  /**
   * Vérifie si l'orientation a été effectuée
   */
  private checkOrientationDone(
    orientationDone?: boolean,
    description?: string
  ): TaskCompletionResult {
    if (orientationDone) {
      return {
        isComplete: true,
        reason: description || 'Tâche terminée : orientation effectuée',
        completedAt: new Date()
      };
    }
    
    return {
      isComplete: false,
      reason: 'En attente : orientation non effectuée'
    };
  }

  /**
   * Vérifie si toutes les étapes assignées sont terminées
   */
  private checkStepCompleted(assignedSteps?: WorkflowEtape[]): TaskCompletionResult {
    if (!assignedSteps || assignedSteps.length === 0) {
      return {
        isComplete: false,
        reason: 'En attente : aucune étape assignée'
      };
    }

    const incompleteSteps = assignedSteps.filter(
      step => step.statut !== 'TERMINE' && step.statut !== 'REJETE'
    );

    if (incompleteSteps.length === 0) {
      // Trouver la date de complétion la plus récente
      const completedAt = assignedSteps
        .filter(step => step.statut === 'TERMINE' && step.dateFin)
        .map(step => step.dateFin!)
        .sort((a, b) => b.getTime() - a.getTime())[0] || new Date();

      return {
        isComplete: true,
        reason: 'Tâche terminée : toutes les étapes assignées sont terminées',
        completedAt
      };
    }

    return {
      isComplete: false,
      reason: `En attente : ${incompleteSteps.length} étape(s) non terminée(s)`
    };
  }

  /**
   * Récupère la configuration de complétion pour un rôle
   */
  private getCompletionConfig(role: Role): RoleCompletionConfig | undefined {
    return ROLE_COMPLETION_CONFIGS.find(config => config.roles.includes(role));
  }

  /**
   * Détermine si une action est liée à l'orientation
   * 
   * @param actionType - Type d'action
   * @param stepName - Nom de l'étape (si applicable)
   * @returns true si l'action est liée à l'orientation
   */
  isOrientationRelated(actionType: string, stepName?: string): boolean {
    const orientationKeywords = [
      'orientation',
      'orienter',
      'orienté',
      'dispatch',
      'distribution',
      'router',
      'acheminer',
      'assignment',
      'assignation'
    ];

    const checkText = `${actionType} ${stepName || ''}`.toLowerCase();
    
    return orientationKeywords.some(keyword => checkText.includes(keyword));
  }

  /**
   * Détermine si un rôle est un rôle de management (DG, Directeur, Chef)
   */
  isManagementRole(role: Role): boolean {
    return [
      Role.DIRECTEUR_GENERAL,
      Role.DIRECTEUR,
      Role.CHEF_SERVICE
    ].includes(role);
  }

  /**
   * Détermine si un rôle doit terminer les tâches par création d'annotation/étape
   */
  completesByAnnotationOrStep(role: Role): boolean {
    const config = this.getCompletionConfig(role);
    return config?.completionType === 'ANNOTATION_OR_STEP' || false;
  }

  /**
   * Détermine si un rôle doit terminer les tâches par complétion d'étapes assignées
   */
  completesByStepCompletion(role: Role): boolean {
    const config = this.getCompletionConfig(role);
    return config?.completionType === 'STEP_COMPLETED' || false;
  }

  /**
   * Détermine si un rôle doit terminer les tâches par orientation
   */
  completesByOrientation(role: Role): boolean {
    const config = this.getCompletionConfig(role);
    return config?.completionType === 'ORIENTATION_DONE' || false;
  }
}

export const taskCompletionService = new TaskCompletionService();
