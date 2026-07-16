import { courrierService } from './courrierService';
import { adminService } from './adminService';
import { directionService } from './directionService';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';
import { TypeCourrier, Priorite, StatutCourrier, Role } from '../types';

export const initializeTestData = () => {
  // Vérifier si les données ont été supprimées intentionnellement
  const manuallyDeleted = localStorage.getItem('courriers_deleted_manually');
  if (manuallyDeleted === 'true') {
    console.log('⚠️ Les courriers ont été supprimés intentionnellement. Pas de recréation automatique.');
    return; // Ne pas recréer les données si elles ont été supprimées manuellement
  }
  
  // Vérifier si les données de test existent déjà
  const existingCourriers = courrierService.getAllCourriers();
  if (existingCourriers.length > 0) {
    return; // Les données existent déjà
  }

  // Créer des utilisateurs de test si nécessaire
  const users = adminService.getAllUsers();
  const secretaire = users.find(u => u.email === 'secretaire@example.com') || users[1];
  const dg = users.find(u => u.email === 'dg@example.com') || users[2];

  // Initialiser les directions et services
  directionService.initializeDemoData();
  entiteOrganisationnelleService.initializeDemoData();
  const directions = directionService.getAllDirections();
  const services = directionService.getAllServices();
  const entities = entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false);
  const directionEntities = entities.filter(e => e.type === 'direction_generale' || e.type === 'direction');
  const serviceEntities = entities.filter(e => e.type === 'service' || e.type === 'sous-service');

  // Générer des dates variées (dernières 2 semaines)
  const today = new Date();
  const dates = Array.from({ length: 15 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (14 - i));
    return date;
  });

  // Génération automatique des courriers désactivée - utiliser le bouton dans la liste des courriers
  // Les courriers de test ne sont plus créés automatiquement
  return; // Sortir de la fonction sans créer de courriers
  
  /* Code désactivé - création automatique des courriers
  const testCourriers = [
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[0],
      expediteur: 'Ministère de l\'Économie et des Finances',
      destinataire: 'Direction Générale',
      objet: 'Demande de subvention pour projet d\'infrastructure routière',
      priorite: Priorite.HAUTE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[0]?.nom || directions[0]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[0]?.id)?.nom || services[0]?.nom,
      statut: StatutCourrier.EN_ATTENTE_DG
    },
    {
      type: TypeCourrier.INTERNE,
      dateReception: dates[1],
      expediteur: 'Direction Financière',
      destinataire: 'Service Comptabilité',
      objet: 'Rapport mensuel de gestion financière - Janvier 2024',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[1]?.nom || directions[1]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[1]?.id)?.nom || services[1]?.nom,
      statut: StatutCourrier.ASSIGNE
    },
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[2],
      expediteur: 'Fournisseur ABC Technologies',
      destinataire: 'Direction Technique',
      objet: 'Devis pour équipement informatique et serveurs',
      priorite: Priorite.URGENTE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[2]?.nom || directions[2]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[2]?.id)?.nom || services[2]?.nom,
      statut: StatutCourrier.EN_TRAITEMENT
    },
    {
      type: TypeCourrier.INTERNE,
      dateReception: dates[3],
      expediteur: 'Direction Commerciale',
      destinataire: 'Service Marketing',
      objet: 'Plan de communication trimestriel Q1 2024',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[3]?.nom || directions[3]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[3]?.id)?.nom || services[3]?.nom,
      statut: StatutCourrier.ASSIGNE
    },
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[4],
      expediteur: 'Client XYZ Corporation',
      destinataire: 'Direction Commerciale',
      objet: 'Réclamation concernant le service client et délais de livraison',
      priorite: Priorite.HAUTE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[3]?.nom || directions[3]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[3]?.id)?.nom || services[3]?.nom,
      statut: StatutCourrier.ENREGISTRE
    },
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[5],
      expediteur: 'Banque Nationale',
      destinataire: 'Direction Financière',
      objet: 'Avis de prélèvement automatique - Février 2024',
      priorite: Priorite.BASSE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[1]?.nom || directions[1]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[1]?.id)?.nom || services[1]?.nom,
      statut: StatutCourrier.TRAITE
    },
    {
      type: TypeCourrier.INTERNE,
      dateReception: dates[6],
      expediteur: 'Direction Administrative',
      destinataire: 'Service RH',
      objet: 'Demande d\'autorisation de congé - Agent Martin',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[0]?.nom || directions[0]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[0]?.id)?.nom || services[0]?.nom,
      statut: StatutCourrier.ASSIGNE
    },
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[7],
      expediteur: 'Partenaire International',
      destinataire: 'Direction Générale',
      objet: 'Invitation à la conférence annuelle des partenaires',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[0]?.nom || directions[0]?.nom,
      service: undefined,
      statut: StatutCourrier.ENREGISTRE
    },
    {
      type: TypeCourrier.INTERNE,
      dateReception: dates[8],
      expediteur: 'Direction Technique',
      destinataire: 'Division Informatique',
      objet: 'Demande d\'intervention pour maintenance système',
      priorite: Priorite.URGENTE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[2]?.nom || directions[2]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[2]?.id)?.nom || services[2]?.nom,
      statut: StatutCourrier.EN_TRAITEMENT
    },
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[9],
      expediteur: 'Organisme de Certification',
      destinataire: 'Direction Administrative',
      objet: 'Notification de renouvellement de certification ISO 9001',
      priorite: Priorite.HAUTE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[0]?.nom || directions[0]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[0]?.id)?.nom || services[0]?.nom,
      statut: StatutCourrier.EN_ATTENTE_DG
    },
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[10],
      expediteur: 'Assurance ABC',
      destinataire: 'Direction Financière',
      objet: 'Renouvellement de police d\'assurance - Exercice 2024',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[1]?.nom || directions[1]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[1]?.id)?.nom || services[1]?.nom,
      statut: StatutCourrier.TRAITE
    },
    {
      type: TypeCourrier.INTERNE,
      dateReception: dates[11],
      expediteur: 'Service Juridique',
      destinataire: 'Direction Générale',
      objet: 'Avis juridique - Nouveau contrat de service public',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[0]?.nom || directions[0]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[0]?.id && s.nom.includes('Juridique'))?.nom || services[1]?.nom,
      statut: StatutCourrier.EN_ATTENTE_DG
    },
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[12],
      expediteur: 'Fournisseur de Matériel',
      destinataire: 'Direction Technique',
      objet: 'Facture n°2024-045 - Matériel de maintenance',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[2]?.nom || directions[2]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[2]?.id)?.nom || services[2]?.nom,
      statut: StatutCourrier.TRAITE
    },
    {
      type: TypeCourrier.INTERNE,
      dateReception: dates[13],
      expediteur: 'Service Marketing',
      destinataire: 'Direction Commerciale',
      objet: 'Proposition de campagne publicitaire printemps 2024',
      priorite: Priorite.NORMALE,
      enregistrePar: secretaire?.id || '1',
      direction: directionEntities[3]?.nom || directions[3]?.nom,
      service: serviceEntities.find(s => s.parentId === directionEntities[3]?.id && s.nom.includes('Marketing'))?.nom || services[3]?.nom,
      statut: StatutCourrier.ASSIGNE
    },
    {
      type: TypeCourrier.EXTERNE,
      dateReception: dates[14],
      expediteur: 'Organisation Mondiale du Commerce',
      destinataire: 'Direction Générale',
      objet: 'Invitation à la conférence annuelle 2024 - Paris',
      priorite: Priorite.BASSE,
      enregistrePar: secretaire?.id || '1',
      direction: undefined,
      service: undefined,
      statut: StatutCourrier.ENREGISTRE
    }
  ];

  // Génération automatique des courriers désactivée - utiliser le bouton dans la liste des courriers
  // Créer les courriers
  // let createdCount = 0;
  // testCourriers.forEach(courrierData => {
  //   try {
  //     // Utiliser la méthode createCourrier qui génère automatiquement l'ID et le numéro
  //     const courrier = courrierService.createCourrier({
  //       type: courrierData.type,
  //       dateReception: courrierData.dateReception,
  //       expediteur: courrierData.expediteur,
  //       destinataire: courrierData.destinataire,
  //       objet: courrierData.objet,
  //       priorite: courrierData.priorite,
  //       enregistrePar: courrierData.enregistrePar,
  //       direction: courrierData.direction,
  //       service: courrierData.service
  //     });
  //     
  //     // Mettre à jour le statut si nécessaire
  //     if (courrierData.statut) {
  //       courrierService.updateCourrier(courrier.id, { statut: courrierData.statut });
  //     }
  //     createdCount++;
  //   } catch (error) {
  //     console.error('Erreur lors de la création du courrier de test:', error);
  //   }
  // });

  // console.log(`✅ ${createdCount} courrier(s) de test créé(s) avec succès`);
  */
};

