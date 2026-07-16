import { adminService } from './adminService';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';
import { laravelApiService } from './laravelApiService';
import { Role } from '../types';

/**
 * Initialise des données étendues avec plusieurs directions, services et utilisateurs.
 * Tous rattachés à la Direction Générale.
 */
export const initializeExtendedData = async () => {
  // Vérifier si les données étendues existent déjà
  const existingEntities = entiteOrganisationnelleService.getAllEntities();
  // En mode API Laravel, rafraîchir d'abord les utilisateurs pour éviter de recréer ceux déjà en base
  if (laravelApiService.isConfigured()) {
    await adminService.refreshUsersFromApi();
  }
  const existingUsers = adminService.getAllUsers();
  
  // Si on a déjà les utilisateurs ARMP étendus, on considère que les données sont déjà initialisées
  const existingEmails = new Set(existingUsers.map(u => u.email));
  if (existingEmails.has('directeur.daf@armp-rdc.cd')) {
    console.log('✅ Données étendues ARMP déjà initialisées');
    return;
  }

  console.log('🚀 Initialisation des données étendues ARMP...');

  // S'assurer que les entités ARMP de base sont initialisées
  entiteOrganisationnelleService.initializeDemoData();

  // Pas de nouvelles entités à créer — la structure ARMP complète est déjà dans
  // entiteOrganisationnelleService.getArmpEntities() (ids 1–50).
  // On crée uniquement des utilisateurs rattachés aux entités ARMP existantes.

  // Noms des entités ARMP utilisées comme direction/service (correspondant aux ids dans getArmpEntities())
  const DIR_GENERALE            = 'Direction Générale';
  const DIR_REGULATION          = 'Direction de la Régulation';
  const DIR_STATS_COM           = 'Direction des Statistiques et de la Communication';
  const DIR_ADMIN_FIN           = 'Direction Administrative et Financière';
  const DIR_FORMATION           = 'Direction de la Formation et des Appuis Techniques';
  const DIR_PPP                 = 'Direction de Partenariat Public-Privé';
  const DIR_SERVICES_RATTACHES  = 'Services Rattachés à la Direction Générale';
  const SVC_RECRUTEMENT         = 'Service Recrutement et Carrières';
  const SVC_FORMATION_DEV       = 'Service Formation et Développement';
  const SVC_COMPTABILITE        = 'Service Comptabilité Générale';
  const SVC_COMPTA_ANALYTIQUE   = 'Service Comptabilité Analytique';
  const SVC_FACTURATION         = 'Service Facturation';
  const SVC_RECOUVREMENT        = 'Service Recouvrement';
  const SVC_LOGISTIQUE          = 'Service Logistique et Moyens généraux';
  const SVC_FORMATION_ACTEURS   = 'Service Formation des Acteurs';
  const SVC_APPUIS              = 'Service Appuis et Accompagnement';
  const SVC_ENQUETES            = 'Service Enquêtes Régulation';
  const SVC_AUDIT_CONTROLE      = 'Service Audit et Contrôle';

  // Créer des utilisateurs rattachés aux directions et services ARMP réels
  const usersToCreate = [
    // Direction Générale
    { nom: 'Jean-Baptiste Kabongo', email: 'dg@armp-rdc.cd', role: Role.DIRECTEUR_GENERAL, direction: DIR_GENERALE, actif: true },

    // Direction Administrative et Financière
    { nom: 'Marie-Claire Mutombo', email: 'directeur.daf@armp-rdc.cd', role: Role.DIRECTEUR, direction: DIR_ADMIN_FIN, actif: true },
    { nom: 'Paul Lukwebo', email: 'chef.rh@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_ADMIN_FIN, service: SVC_RECRUTEMENT, actif: true },
    { nom: 'Aimée Kabila', email: 'agent.rh@armp-rdc.cd', role: Role.AGENT, direction: DIR_ADMIN_FIN, service: SVC_RECRUTEMENT, actif: true },
    { nom: 'Jacques Nkutu', email: 'chef.formation.rh@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_ADMIN_FIN, service: SVC_FORMATION_DEV, actif: true },
    { nom: 'Hélène Mbuyi', email: 'chef.comptabilite@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_ADMIN_FIN, service: SVC_COMPTABILITE, actif: true },
    { nom: 'Denis Kalala', email: 'agent.comptabilite@armp-rdc.cd', role: Role.AGENT, direction: DIR_ADMIN_FIN, service: SVC_COMPTABILITE, actif: true },
    { nom: 'Sandra Mulamba', email: 'chef.compta.analytique@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_ADMIN_FIN, service: SVC_COMPTA_ANALYTIQUE, actif: true },
    { nom: 'Robert Tshibanda', email: 'chef.facturation@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_ADMIN_FIN, service: SVC_FACTURATION, actif: true },
    { nom: 'Monique Ilunga', email: 'agent.facturation@armp-rdc.cd', role: Role.AGENT, direction: DIR_ADMIN_FIN, service: SVC_FACTURATION, actif: true },
    { nom: 'François Mbaya', email: 'chef.recouvrement@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_ADMIN_FIN, service: SVC_RECOUVREMENT, actif: true },
    { nom: 'Cécile Nzuzi', email: 'chef.logistique@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_ADMIN_FIN, service: SVC_LOGISTIQUE, actif: true },
    { nom: 'André Lufungula', email: 'agent.logistique@armp-rdc.cd', role: Role.AGENT, direction: DIR_ADMIN_FIN, service: SVC_LOGISTIQUE, actif: true },

    // Direction de la Régulation
    { nom: 'Patience Kitenge', email: 'directeur.regulation@armp-rdc.cd', role: Role.DIRECTEUR, direction: DIR_REGULATION, actif: true },
    { nom: 'Serge Mwamba', email: 'chef.enquetes@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_REGULATION, service: SVC_ENQUETES, actif: true },
    { nom: 'Béatrice Nsenga', email: 'agent.enquetes@armp-rdc.cd', role: Role.AGENT, direction: DIR_REGULATION, service: SVC_ENQUETES, actif: true },

    // Direction des Statistiques et de la Communication
    { nom: 'Thierry Bongoma', email: 'directeur.stats@armp-rdc.cd', role: Role.DIRECTEUR, direction: DIR_STATS_COM, actif: true },

    // Direction de la Formation et des Appuis Techniques
    { nom: 'Angélique Tshisekedi', email: 'directeur.formation@armp-rdc.cd', role: Role.DIRECTEUR, direction: DIR_FORMATION, actif: true },
    { nom: 'Gérard Kasongo', email: 'chef.formation.acteurs@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_FORMATION, service: SVC_FORMATION_ACTEURS, actif: true },
    { nom: 'Nadine Lukusa', email: 'agent.formation@armp-rdc.cd', role: Role.AGENT, direction: DIR_FORMATION, service: SVC_FORMATION_ACTEURS, actif: true },
    { nom: 'Olivier Mbombo', email: 'chef.appuis@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_FORMATION, service: SVC_APPUIS, actif: true },

    // Direction de Partenariat Public-Privé
    { nom: 'Christelle Kayembe', email: 'directeur.ppp@armp-rdc.cd', role: Role.DIRECTEUR, direction: DIR_PPP, actif: true },

    // Services Rattachés à la DG
    { nom: 'Victor Mukendi', email: 'chef.audit.interne@armp-rdc.cd', role: Role.CHEF_SERVICE, direction: DIR_SERVICES_RATTACHES, service: SVC_AUDIT_CONTROLE, actif: true },
    { nom: 'Isabelle Ngoy', email: 'agent.audit.interne@armp-rdc.cd', role: Role.AGENT, direction: DIR_SERVICES_RATTACHES, service: SVC_AUDIT_CONTROLE, actif: true },
  ];

  // Créer les utilisateurs qui n'existent pas déjà
  let createdCount = 0;
  
  for (const userData of usersToCreate) {
    if (!existingEmails.has(userData.email)) {
      try {
        await adminService.createUser(userData);
        existingEmails.add(userData.email);
        createdCount++;
      } catch (e) {
        console.warn('⚠️ Impossible de créer l\'utilisateur ARMP', userData.email, e);
      }
    }
  }

  console.log(`✅ ${createdCount} nouveaux utilisateurs créés`);
  console.log('✅ Données étendues initialisées avec succès');
};

