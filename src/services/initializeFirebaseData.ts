/**
 * Service pour initialiser des données de démonstration dans Firebase
 * Crée quelques courriers avec des fichiers et dossiers
 */

import { courrierService } from './courrierService';
import { categorieFichierService } from './categorieFichierService';
import { adminService } from './adminService';
import { directionService } from './directionService';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';
import { TypeCourrier, Priorite, StatutCourrier } from '../types';

/**
 * Créer un fichier texte de démonstration
 */
function createDemoTextFile(content: string, fileName: string): File {
  const blob = new Blob([content], { type: 'text/plain' });
  return new File([blob], fileName, { type: 'text/plain' });
}

/**
 * Créer un fichier PDF de démonstration (simulé avec du texte)
 */
function createDemoPDFFile(content: string, fileName: string): File {
  // Pour la démo, on crée un fichier texte qui simule un PDF
  // En production, vous devriez utiliser une vraie bibliothèque PDF
  const blob = new Blob([content], { type: 'application/pdf' });
  return new File([blob], fileName, { type: 'application/pdf' });
}

/**
 * Initialiser des courriers de démonstration avec fichiers et dossiers
 * @param force - Si true, génère même s'il y a des courriers existants
 */
export async function initializeFirebaseDemoData(force: boolean = false): Promise<void> {
  console.log('🚀 Initialisation des données de démonstration Firebase...');

  // IMPORTANT: Cette fonction ne doit être appelée QUE manuellement via le bouton
  // Elle ne doit JAMAIS être appelée automatiquement au chargement de la page

  // Vérifier la configuration Firebase
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId || projectId === 'your-project-id') {
    throw new Error('Configuration Firebase non valide. Vérifiez vos variables d\'environnement dans le fichier .env');
  }

  // Vérifier si l'initialisation a déjà échoué (pour éviter les boucles infinies)
  const initFailed = sessionStorage.getItem('firebase_init_failed');
  if (initFailed === 'true' && !force) {
    const shouldContinue = window.confirm(
      '⚠️ L\'initialisation a échoué précédemment.\n\n' +
      'Cela peut être dû à des problèmes de permissions Firebase Storage.\n\n' +
      'Voulez-vous quand même essayer de générer les courriers ?'
    );
    if (!shouldContinue) {
      console.warn('⚠️ Génération annulée par l\'utilisateur.');
      throw new Error('Génération annulée par l\'utilisateur');
    }
    // Réinitialiser le flag si l'utilisateur veut continuer
    sessionStorage.removeItem('firebase_init_failed');
  }

  // Vérifier si les données existent déjà - vérification stricte (sauf si force = true)
  if (!force) {
    try {
      // Vérifier d'abord dans le store Redux (Firestore)
      const { fetchCourriers } = await import('../store/slices/courriersSlice');
      const { store } = await import('../store/store');
      await store.dispatch(fetchCourriers());
      const state = store.getState();
      const firestoreCourriers = state.courriers.items;
      if (firestoreCourriers && firestoreCourriers.length > 0) {
        console.log(`✅ ${firestoreCourriers.length} courrier(s) existent déjà dans Firestore.`);
        const shouldContinue = window.confirm(
          `Des courriers existent déjà dans Firestore (${firestoreCourriers.length}).\n\n` +
          'Voulez-vous quand même générer de nouveaux courriers de démonstration ?\n\n' +
          'ATTENTION: Cela créera des courriers supplémentaires.'
        );
        if (!shouldContinue) {
          console.log('❌ Génération annulée par l\'utilisateur.');
          throw new Error('Génération annulée par l\'utilisateur');
        }
      }
      
      // Vérifier aussi dans le service local
      const existingCourriers = courrierService.getAllCourriers();
      if (existingCourriers && existingCourriers.length > 0) {
        console.log(`✅ ${existingCourriers.length} courrier(s) existent déjà localement.`);
        const shouldContinue = window.confirm(
          `Des courriers existent déjà localement (${existingCourriers.length}).\n\n` +
          'Voulez-vous quand même générer de nouveaux courriers de démonstration ?\n\n' +
          'ATTENTION: Cela créera des courriers supplémentaires.'
        );
        if (!shouldContinue) {
          console.log('❌ Génération annulée par l\'utilisateur.');
          throw new Error('Génération annulée par l\'utilisateur');
        }
      }
    } catch (error) {
      console.warn('⚠️ Erreur lors de la vérification des courriers existants:', error);
      // Demander confirmation avant de continuer si la vérification échoue
      const shouldContinue = window.confirm(
        'Impossible de vérifier les courriers existants.\n\n' +
        'Voulez-vous continuer la génération ?\n\n' +
        'ATTENTION: Cela pourrait créer des doublons si des courriers existent déjà.'
      );
      if (!shouldContinue) {
        console.log('❌ Génération annulée par l\'utilisateur.');
        return;
      }
    }
  }

  try {
    // Initialiser les services nécessaires
    directionService.initializeDemoData();
    entiteOrganisationnelleService.initializeDemoData();
    
    // Récupérer les utilisateurs
    const users = adminService.getAllUsers();
    const secretaire = users.find(u => u.email === 'secretaire@example.com') || users[0];
    const dg = users.find(u => u.email === 'dg@example.com') || users[1];

    if (!secretaire) {
      console.error('❌ Utilisateur secrétaire non trouvé');
      return;
    }

    // Récupérer les entités ARMP réelles depuis le service
    const entities = entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false);

    // Entités ARMP de référence (correspondant à getArmpEntities())
    // Direction Générale (id: '1')
    const directionGenerale = entities.find(e => e.id === '1') || entities.find(e => e.type === 'direction_generale');
    // Direction Administrative et Financière (id: '8')
    const dirAdminFinanciere = entities.find(e => e.id === '8') || entities.find(e => e.type === 'direction' && e.nom.toLowerCase().includes('admin'));
    // Direction de la Régulation (id: '6')
    const dirRegulation = entities.find(e => e.id === '6') || entities.find(e => e.type === 'direction' && e.nom.toLowerCase().includes('r\u00e9gulation'));
    // Direction de la Formation et des Appuis Techniques (id: '9')
    const dirFormation = entities.find(e => e.id === '9') || entities.find(e => e.type === 'direction' && e.nom.toLowerCase().includes('formation'));
    // Direction des Statistiques et de la Communication (id: '7')
    const dirStats = entities.find(e => e.id === '7') || entities.find(e => e.type === 'direction' && e.nom.toLowerCase().includes('stat'));
    // Services rattachés à la DG (id: '5')
    const servicesRattaches = entities.find(e => e.id === '5') || entities.find(e => e.type === 'direction' && e.nom.toLowerCase().includes('rattach'));
    // Division des Ressources Humaines (id: '16')
    const divRH = entities.find(e => e.id === '16') || entities.find(e => e.type === 'division' && e.nom.toLowerCase().includes('ressources humaines'));
    // Division Finance et Comptabilité (id: '17')
    const divFinance = entities.find(e => e.id === '17') || entities.find(e => e.type === 'division' && e.nom.toLowerCase().includes('finance'));
    // Division des Services Généraux (id: '15')
    const divServicesGen = entities.find(e => e.id === '15') || entities.find(e => e.type === 'division' && e.nom.toLowerCase().includes('g\u00e9n\u00e9raux'));
    // Service Comptabilité Générale (id: '29')
    const svcComptabilite = entities.find(e => e.id === '29') || entities.find(e => e.type === 'service' && e.nom.toLowerCase().includes('comptabilit\u00e9 g\u00e9n'));
    // Service Recrutement et Carrières (id: '27')
    const svcRecrutement = entities.find(e => e.id === '27') || entities.find(e => e.type === 'service' && e.nom.toLowerCase().includes('recrutement'));
    // Service Logistique et Moyens généraux (id: '26')
    const svcLogistique = entities.find(e => e.id === '26') || entities.find(e => e.type === 'service' && e.nom.toLowerCase().includes('logistique'));
    // Service Formation des Acteurs (id: '33')
    const svcFormationActeurs = entities.find(e => e.id === '33') || entities.find(e => e.type === 'service' && e.nom.toLowerCase().includes('formation des acteurs'));
    // Division Audits et Enquêtes (id: '14')
    const divAudits = entities.find(e => e.id === '14') || entities.find(e => e.type === 'division' && e.nom.toLowerCase().includes('audit'));

    // Générer des dates variées
    const today = new Date();
    const dates = Array.from({ length: 5 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (4 - i));
      return date;
    });

    // Courrier 1: Externe entrant — Ministère → Direction Générale ARMP
    console.log('📝 Création du courrier 1...');
    const courrier1 = await courrierService.createCourrier({
      type: TypeCourrier.EXTERNE,
      dateReception: dates[0],
      expediteur: 'Ministère du Budget et des Finances',
      destinataire: directionGenerale?.nom || 'Direction Générale',
      objet: 'Transmission du budget prévisionnel annuel — exercice 2025',
      priorite: Priorite.HAUTE,
      enregistrePar: secretaire.id,
      direction: directionGenerale?.nom || 'Direction Générale',
      service: dirAdminFinanciere?.nom,
      extraFields: {
        dateReceptionCourrier: dates[0].toISOString(),
        referenceExterne: 'MBF-2025-0042',
        montant: '850000000',
        exercice: '2025'
      }
    });
    await courrierService.updateCourrier(courrier1.id, { statut: StatutCourrier.EN_ATTENTE_DG });

    // Créer des dossiers pour le courrier 1
    const dossier1_1 = await categorieFichierService.createCategorie(
      courrier1.id,
      'Documents budgétaires',
      undefined,
      secretaire.id
    );
    const dossier1_2 = await categorieFichierService.createCategorie(
      courrier1.id,
      'Annexes et tableaux',
      undefined,
      secretaire.id
    );
    const sousDossier1_1 = await categorieFichierService.createCategorie(
      courrier1.id,
      'Tableaux de bord',
      dossier1_1.id,
      secretaire.id
    );

    const fichier1_1 = createDemoTextFile(
      'Budget prévisionnel 2025\n\nDirection Administrative et Financière — ARMP\nMontant global: 850 000 000 CDF\nPersonnel: 420 000 000 CDF\nFonctionnement: 280 000 000 CDF\nInvestissements: 150 000 000 CDF',
      'budget_previsionnel_2025.txt'
    );
    await categorieFichierService.createFichier(
      courrier1.id, fichier1_1.name, fichier1_1, dossier1_1.id, secretaire.id, fichier1_1.size
    );

    const fichier1_2 = createDemoPDFFile(
      'Tableaux de bord budgétaires\n\nExercice 2025\nRépartition par direction\nIndicateurs de performance',
      'tableaux_bord_budget.pdf'
    );
    await categorieFichierService.createFichier(
      courrier1.id, fichier1_2.name, fichier1_2, sousDossier1_1.id, secretaire.id, fichier1_2.size
    );

    const fichier1_3 = createDemoTextFile(
      'Notes explicatives budget\n\nHypothèses retenues\nÉvolution par rapport à 2024\nMesures d\'économie prévues',
      'notes_explicatives_budget.txt'
    );
    await categorieFichierService.createFichier(
      courrier1.id, fichier1_3.name, fichier1_3, dossier1_2.id, secretaire.id, fichier1_3.size
    );

    console.log('✅ Courrier 1 créé avec dossiers et fichiers');

    // Courrier 2: Interne — Division Finance → Division RH (toutes deux sous DAF)
    console.log('📝 Création du courrier 2...');
    const courrier2 = await courrierService.createCourrier({
      type: TypeCourrier.INTERNE,
      dateReception: dates[1],
      expediteur: divFinance?.nom || 'Division Finance et Comptabilité',
      destinataire: svcRecrutement?.nom || 'Service Recrutement et Carrières',
      objet: 'Rapport trimestriel de situation financière — T1 2025',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire.id,
      direction: dirAdminFinanciere?.nom || 'Direction Administrative et Financière',
      service: svcComptabilite?.nom || 'Service Comptabilité Générale',
      extraFields: {
        dateEmission: dates[1].toISOString(),
        referenceInterne: 'DAF-INT-2025-012',
        periode: 'T1 2025'
      }
    });
    await courrierService.updateCourrier(courrier2.id, { statut: StatutCourrier.ASSIGNE });

    const dossier2_1 = await categorieFichierService.createCategorie(
      courrier2.id, 'Rapports financiers', undefined, secretaire.id
    );

    const fichier2_1 = createDemoPDFFile(
      'Rapport financier T1 2025\n\nDirection Administrative et Financière — ARMP\nRevenus: 212 500 000 CDF\nDépenses: 178 300 000 CDF\nSolde: 34 200 000 CDF',
      'rapport_financier_T1_2025.pdf'
    );
    await categorieFichierService.createFichier(
      courrier2.id, fichier2_1.name, fichier2_1, dossier2_1.id, secretaire.id, fichier2_1.size
    );

    const fichier2_2 = createDemoTextFile(
      'Annexes rapport T1\n\n- Détail des dépenses par ligne\n- Évolution comparée T1 2024 / T1 2025\n- Taux d\'exécution budgétaire: 84%',
      'annexes_rapport_T1.txt'
    );
    await categorieFichierService.createFichier(
      courrier2.id, fichier2_2.name, fichier2_2, dossier2_1.id, secretaire.id, fichier2_2.size
    );

    console.log('✅ Courrier 2 créé avec dossiers et fichiers');

    // Courrier 3: Externe urgent — Entité externe → Direction de la Régulation
    console.log('📝 Création du courrier 3...');
    const courrier3 = await courrierService.createCourrier({
      type: TypeCourrier.EXTERNE,
      dateReception: dates[2],
      expediteur: 'Banque Mondiale — Bureau de Kinshasa',
      destinataire: dirRegulation?.nom || 'Direction de la Régulation',
      objet: 'Rapport d\'audit indépendant sur les marchés publics — RDC 2024',
      priorite: Priorite.URGENTE,
      enregistrePar: secretaire.id,
      direction: dirRegulation?.nom || 'Direction de la Régulation',
      service: divAudits?.nom || 'Division Audits et Enquêtes',
      extraFields: {
        dateReceptionCourrier: dates[2].toISOString(),
        referenceExterne: 'BM-KIN-2025-0087',
        delaiReponse: '30 jours',
        langue: 'Français / Anglais'
      }
    });
    await courrierService.updateCourrier(courrier3.id, { statut: StatutCourrier.EN_TRAITEMENT });

    const fichier3_1 = createDemoPDFFile(
      'Rapport d\'audit — Marchés publics RDC 2024\n\nBanque Mondiale\nConformité: 72%\nRecommandations: 18 points\nPriorité haute: 5 points',
      'rapport_audit_marches_publics_2024.pdf'
    );
    await categorieFichierService.createFichier(
      courrier3.id, fichier3_1.name, fichier3_1, undefined, secretaire.id, fichier3_1.size
    );

    const fichier3_2 = createDemoTextFile(
      'Recommandations détaillées\n\n1. Renforcement des contrôles a priori\n2. Digitalisation des procédures de passation\n3. Formation renforcée des acteurs\n4. Publication systématique des résultats',
      'recommandations_audit.txt'
    );
    await categorieFichierService.createFichier(
      courrier3.id, fichier3_2.name, fichier3_2, undefined, secretaire.id, fichier3_2.size
    );

    console.log('✅ Courrier 3 créé avec fichiers');

    // Courrier 4: Interne — Division RH → Service Logistique (gestion du personnel)
    console.log('📝 Création du courrier 4...');
    const courrier4 = await courrierService.createCourrier({
      type: TypeCourrier.INTERNE,
      dateReception: dates[3],
      expediteur: divRH?.nom || 'Division des Ressources Humaines',
      destinataire: svcLogistique?.nom || 'Service Logistique et Moyens généraux',
      objet: 'Demande d\'autorisation de mission — Formation des acteurs des marchés publics',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire.id,
      direction: dirAdminFinanciere?.nom || 'Direction Administrative et Financière',
      service: svcRecrutement?.nom || 'Service Recrutement et Carrières',
      extraFields: {
        dateEmission: dates[3].toISOString(),
        referenceInterne: 'RH-INT-2025-031',
        nombreAgents: '8',
        destination: 'Lubumbashi',
        duree: '5 jours'
      }
    });
    await courrierService.updateCourrier(courrier4.id, { statut: StatutCourrier.EN_ATTENTE_DG });

    const dossier4_1 = await categorieFichierService.createCategorie(
      courrier4.id, 'Dossier de mission', undefined, secretaire.id
    );
    const sousDossier4_1 = await categorieFichierService.createCategorie(
      courrier4.id, 'Ordre de mission', dossier4_1.id, secretaire.id
    );
    const sousDossier4_2 = await categorieFichierService.createCategorie(
      courrier4.id, 'Justificatifs de frais', dossier4_1.id, secretaire.id
    );

    const fichier4_1 = createDemoTextFile(
      'Ordre de mission — ARMP\n\nAgents désignés: 8 agents de la Division RH\nDestination: Lubumbashi (Haut-Katanga)\nPériode: 5 jours ouvrables\nObjet: Formation des acteurs des marchés publics provinciaux',
      'ordre_de_mission.txt'
    );
    await categorieFichierService.createFichier(
      courrier4.id, fichier4_1.name, fichier4_1, sousDossier4_1.id, secretaire.id, fichier4_1.size
    );

    const fichier4_2 = createDemoPDFFile(
      'Prévision des frais de mission\n\nTransport (vol AR): 1 200 000 CDF\nHébergement (5 nuits x 8): 800 000 CDF\nPer diem: 400 000 CDF\nTotal: 2 400 000 CDF',
      'prevision_frais_mission.pdf'
    );
    await categorieFichierService.createFichier(
      courrier4.id, fichier4_2.name, fichier4_2, sousDossier4_2.id, secretaire.id, fichier4_2.size
    );

    console.log('✅ Courrier 4 créé avec structure de dossiers complexe');

    // Courrier 5: Externe sortant — ARMP → Gouvernement Provincial
    console.log('📝 Création du courrier 5...');
    const courrier5 = await courrierService.createCourrier({
      type: TypeCourrier.EXTERNE,
      dateReception: dates[4],
      expediteur: directionGenerale?.nom || 'Direction Générale',
      destinataire: 'Gouvernorat du Haut-Katanga',
      objet: 'Convocation à la session de formation sur la passation des marchés publics',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire.id,
      direction: dirFormation?.nom || 'Direction de la Formation et des Appuis Techniques',
      service: svcFormationActeurs?.nom || 'Service Formation des Acteurs',
      extraFields: {
        dateReceptionCourrier: dates[4].toISOString(),
        referenceExterne: 'ARMP-FORM-2025-018',
        dateSession: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        lieu: 'Kinshasa — Salle de conférences ARMP'
      }
    });
    await courrierService.updateCourrier(courrier5.id, { statut: StatutCourrier.EN_ATTENTE_DG });

    const fichier5_1 = createDemoPDFFile(
      'Convocation — Session de formation\n\nARMP — Direction de la Formation et des Appuis Techniques\nDestinataire: Gouvernorat du Haut-Katanga\nThème: Passation des marchés publics provinciaux\nDate: Voir programme joint\nLieu: Kinshasa — Salle de conférences ARMP',
      'convocation_formation_marches_publics.pdf'
    );
    await categorieFichierService.createFichier(
      courrier5.id, fichier5_1.name, fichier5_1, undefined, secretaire.id, fichier5_1.size
    );

    console.log('✅ Courrier 5 créé avec fichier');

    console.log('🎉 Initialisation terminée !');
    console.log(`✅ ${5} courriers créés avec fichiers et dossiers`);
    sessionStorage.removeItem('firebase_init_failed');
    
    // Recharger les courriers depuis Firestore pour mettre à jour l'affichage
    try {
      const { fetchCourriers } = await import('../store/slices/courriersSlice');
      const { store } = await import('../store/store');
      await store.dispatch(fetchCourriers());
      console.log('✅ Courriers rechargés depuis Firestore');
    } catch (reloadError) {
      console.warn('⚠️ Erreur lors du rechargement des courriers:', reloadError);
    }
  } catch (error: any) {
    console.error('❌ Erreur lors de l\'initialisation des données:', error);
    console.error('Détails de l\'erreur:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.substring(0, 300) // Limiter la taille du stack
    });
    
    // Marquer l'échec pour éviter les tentatives répétées (sauf si force = true)
    if (!force) {
      sessionStorage.setItem('firebase_init_failed', 'true');
    }
    
    // Créer un message d'erreur plus informatif
    let errorMessage = error?.message || String(error);
    
    // Afficher un message d'aide si c'est une erreur Storage
    if (errorMessage.includes('Storage') || errorMessage.includes('CORS')) {
      console.error('💡 Solution: Déployez les règles Firebase Storage avec:');
      console.error('   firebase deploy --only storage');
      console.error('   Voir CONFIGURATION_STORAGE.md pour plus de détails');
      errorMessage = `Erreur Firebase Storage: ${errorMessage}\n\nSolution: Déployez les règles Firebase Storage.`;
    } else if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
      errorMessage = `Erreur de permissions Firestore: ${errorMessage}\n\nVérifiez que les règles Firestore permettent la création de courriers.`;
    } else if (errorMessage.includes('Configuration Firebase')) {
      errorMessage = `Configuration Firebase invalide: ${errorMessage}\n\nVérifiez vos variables d'environnement dans le fichier .env.`;
    } else if (errorMessage.includes('network') || errorMessage.includes('Network') || errorMessage.includes('unavailable')) {
      errorMessage = `Erreur de connexion: ${errorMessage}\n\nVérifiez votre connexion Internet et réessayez.`;
    }
    
    // Propager l'erreur pour que l'interface puisse l'afficher
    const enrichedError = new Error(errorMessage);
    (enrichedError as any).originalError = error;
    (enrichedError as any).code = error?.code;
    throw enrichedError;
  }
}

