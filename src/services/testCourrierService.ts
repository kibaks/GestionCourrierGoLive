import { courrierService } from './courrierService';
import { TypeCourrier, Priorite, StatutCourrier } from '../types';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';

// Service pour créer des courriers de test avec icônes
class TestCourrierService {
  // Créer quelques courriers de test
  async createTestCourriers() {
    // S'assurer que les entités sont initialisées
    entiteOrganisationnelleService.initializeDemoData();
    
    const entities = entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false);
    const directions = entities.filter(e => e.type === 'direction_generale' || e.type === 'direction');
    const services = entities.filter(e => e.type === 'service' || e.type === 'sous-service');
    
    console.log('📋 Directions disponibles:', directions.map(d => d.nom));
    console.log('📋 Services disponibles:', services.map(s => s.nom));

    // Dates variées pour plus de réalisme
    const today = new Date();
    const dates = [
      new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000), // Il y a 10 jours
      new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),  // Il y a 7 jours
      new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),  // Il y a 5 jours
      new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000),  // Il y a 3 jours
      new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000),  // Hier
      new Date(today),                                        // Aujourd'hui
    ];

    const testCourriers = [
      {
        type: TypeCourrier.EXTERNE,
        dateReception: dates[0],
        expediteur: 'Ministère de l\'Économie et des Finances',
        destinataire: 'Direction Générale',
        objet: 'Demande de subvention pour projet d\'infrastructure routière',
        priorite: Priorite.HAUTE,
        direction: directions[0]?.nom || 'Direction Administrative',
        service: services.find(s => s.parentId === directions[0]?.id)?.nom || undefined
      },
      {
        type: TypeCourrier.INTERNE,
        dateReception: dates[1],
        expediteur: 'Direction Financière',
        destinataire: 'Service Comptabilité',
        objet: 'Rapport mensuel de gestion financière - Janvier 2024',
        priorite: Priorite.NORMALE,
        direction: directions[1]?.nom || 'Direction Financière',
        service: services.find(s => s.parentId === directions[1]?.id)?.nom || undefined
      },
      {
        type: TypeCourrier.EXTERNE,
        dateReception: dates[2],
        expediteur: 'Fournisseur ABC Technologies',
        destinataire: 'Direction Technique',
        objet: 'Devis pour équipement informatique et serveurs',
        priorite: Priorite.URGENTE,
        direction: directions[2]?.nom || 'Direction Technique',
        service: services.find(s => s.parentId === directions[2]?.id)?.nom || undefined
      },
      {
        type: TypeCourrier.INTERNE,
        dateReception: dates[3],
        expediteur: 'Direction Commerciale',
        destinataire: 'Service Marketing',
        objet: 'Plan de communication trimestriel Q1 2024',
        priorite: Priorite.NORMALE,
        direction: directions[3]?.nom || 'Direction Commerciale',
        service: services.find(s => s.parentId === directions[3]?.id)?.nom || undefined
      },
      {
        type: TypeCourrier.EXTERNE,
        dateReception: dates[4],
        expediteur: 'Client XYZ Corporation',
        destinataire: 'Direction Commerciale',
        objet: 'Réclamation concernant le service client et délais de livraison',
        priorite: Priorite.HAUTE,
        direction: directions[3]?.nom || 'Direction Commerciale',
        service: services.find(s => s.parentId === directions[3]?.id)?.nom || undefined
      },
      {
        type: TypeCourrier.EXTERNE,
        dateReception: dates[5],
        expediteur: 'Banque Nationale',
        destinataire: 'Direction Financière',
        objet: 'Avis de prélèvement automatique - Février 2024',
        priorite: Priorite.BASSE,
        direction: directions[1]?.nom || 'Direction Financière',
        service: services.find(s => s.parentId === directions[1]?.id)?.nom || undefined
      },
      {
        type: TypeCourrier.INTERNE,
        dateReception: dates[2],
        expediteur: 'Direction Administrative',
        destinataire: 'Service RH',
        objet: 'Demande d\'autorisation de congé - Agent Martin',
        priorite: Priorite.NORMALE,
        direction: directions[0]?.nom || 'Direction Administrative',
        service: services.find(s => s.parentId === directions[0]?.id)?.nom || undefined
      },
      {
        type: TypeCourrier.EXTERNE,
        dateReception: dates[1],
        expediteur: 'Partenaire International',
        destinataire: 'Direction Générale',
        objet: 'Invitation à la conférence annuelle des partenaires',
        priorite: Priorite.NORMALE,
        direction: directions[0]?.nom || 'Direction Administrative',
        service: undefined
      },
      {
        type: TypeCourrier.INTERNE,
        dateReception: dates[3],
        expediteur: 'Direction Technique',
        destinataire: 'Division Informatique',
        objet: 'Demande d\'intervention pour maintenance système',
        priorite: Priorite.URGENTE,
        direction: directions[2]?.nom || 'Direction Technique',
        service: services.find(s => s.parentId === directions[2]?.id)?.nom || undefined
      },
      {
        type: TypeCourrier.EXTERNE,
        dateReception: dates[0],
        expediteur: 'Organisme de Certification',
        destinataire: 'Direction Administrative',
        objet: 'Notification de renouvellement de certification ISO 9001',
        priorite: Priorite.HAUTE,
        direction: directions[0]?.nom || 'Direction Administrative',
        service: services.find(s => s.parentId === directions[0]?.id)?.nom || undefined
      }
    ];

    const existingCourriers = courrierService.getAllCourriers();
    const filteredCourriers = testCourriers.filter(tc => {
      // Vérifier si un courrier similaire existe déjà
      return !existingCourriers.some(ec => 
        ec.objet === tc.objet && 
        ec.expediteur === tc.expediteur &&
        ec.dateReception.getTime() === tc.dateReception.getTime()
      );
    });
    
    const newCourriers = await Promise.all(
      filteredCourriers.map(async tc => {
        const courrier = await courrierService.createCourrier({
          ...tc,
          enregistrePar: 'system' // ID système pour les courriers de test
        });
        console.log('✅ Courrier de test créé:', courrier.numero, courrier.objet, courrier.direction, courrier.service);
        return courrier;
      })
    );

    console.log(`✅ ${newCourriers.length} courrier(s) de test créé(s) sur ${testCourriers.length} prévus`);
    return newCourriers;
  }

  // Vérifier si des courriers de test existent déjà
  hasTestCourriers(): boolean {
    const courriers = courrierService.getAllCourriers();
    // Vérifier si au moins un courrier de test existe (enregistré par 'system')
    return courriers.some(c => c.enregistrePar === 'system');
  }
}

export const testCourrierService = new TestCourrierService();

