import { Utilisateur, Role } from '../types';
import { organigrammeService, OrganigrammeNode } from './organigrammeService';
import { adminService } from './adminService';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';
import { laravelApiService } from './laravelApiService';

// Service de gestion des utilisateurs
class UserService {
  // Utiliser adminService comme source unique de vérité pour les utilisateurs
  getAllUsers(): Utilisateur[] {
    // Utiliser adminService qui est la source principale
    const adminUsers = adminService.getAllUsers();
    
    // Si adminService n'a pas d'utilisateurs, initialiser avec les données de démo
    if (adminUsers.length === 0) {
      this.initializeDemoUsers();
      return adminService.getAllUsers();
    }
    
    return adminUsers;
  }

  // Initialiser les données de démonstration dans adminService
  initializeDemoUsers() {
    // En mode API Laravel, on ne crée jamais les utilisateurs de démo côté front
    if (laravelApiService.isConfigured()) {
      return;
    }

    const existingUsers = adminService.getAllUsers();
    // Forcer la recréation pour corriger les utilisateurs sans direction
    // if (existingUsers.length > 0) return; // Déjà initialisé

    // Créer les utilisateurs via adminService
    adminService.createUser({
      nom: 'Marie Dupont',
      email: 'secretaire@example.com',
      role: Role.SECRETAIRE,
      direction: 'Direction Générale',
      actif: true
    });
    
    adminService.createUser({
      nom: 'Q Normand',
      email: 'qnormand@example.com',
      role: Role.SECRETAIRE,
      direction: 'Direction Administrative et Financière',
      actif: true
    });
    
    adminService.createUser({
      nom: 'Jean Martin',
      email: 'dg@example.com',
      role: Role.DIRECTEUR_GENERAL,
      actif: true
    });
    
    adminService.createUser({
      nom: 'Sophie Bernard',
      email: 'directeur@example.com',
      role: Role.DIRECTEUR,
      direction: 'Direction Administrative',
      actif: true
    });
    
    adminService.createUser({
      nom: 'Pierre Durand',
      email: 'chef@example.com',
      role: Role.CHEF_SERVICE,
      direction: 'Direction Administrative',
      service: 'Service RH',
      actif: true
    });
    
    adminService.createUser({
      nom: 'Lucie Moreau',
      email: 'agent1@example.com',
      role: Role.AGENT,
      direction: 'Direction Administrative',
      service: 'Service RH',
      actif: true
    });
    
    adminService.createUser({
      nom: 'Thomas Lefebvre',
      email: 'directeur.fin@example.com',
      role: Role.DIRECTEUR,
      direction: 'Direction Financière',
      actif: true
    });
    
    adminService.createUser({
      nom: 'Emma Petit',
      email: 'chef.compta@example.com',
      role: Role.CHEF_SERVICE,
      direction: 'Direction Financière',
      service: 'Service Comptabilité',
      actif: true
    });
    
    adminService.createUser({
      nom: 'Antoine Rousseau',
      email: 'agent2@example.com',
      role: Role.AGENT,
      direction: 'Direction Financière',
      service: 'Service Comptabilité',
      actif: true
    });
  }

  getUserById(id: string): Utilisateur | undefined {
    // Utiliser adminService pour récupérer l'utilisateur
    return adminService.getUserById(id) || this.getAllUsers().find(u => u.id === id);
  }

  getUsersByRole(role: Role): Utilisateur[] {
    return this.getAllUsers().filter(u => u.role === role && u.actif);
  }

  getUsersByDirection(direction: string): Utilisateur[] {
    return this.getAllUsers().filter(u => u.direction === direction && u.actif);
  }

  getUsersByService(service: string): Utilisateur[] {
    return this.getAllUsers().filter(u => u.service === service && u.actif);
  }

  // Obtenir les utilisateurs qui peuvent être assignés (pas les secrétaires)
  getAssignableUsers(): Utilisateur[] {
    return this.getAllUsers().filter(u => 
      u.actif && 
      u.role !== Role.SECRETAIRE
    );
  }

  // Obtenir les utilisateurs assignables pour une direction / division / service
  getAssignableUsersByDirection(direction?: string, service?: string, divisionId?: string): Utilisateur[] {
    let users = this.getAssignableUsers();
    
    if (divisionId) {
      const entityIds = entiteOrganisationnelleService.getDescendantEntityIds(divisionId);
      users = users.filter(u => u.entiteId && entityIds.includes(u.entiteId));
      if (users.length === 0) {
        const hierarchy = entiteOrganisationnelleService.getEntityHierarchy(divisionId);
        const directionEntity = hierarchy.find((e: { type: string }) => e.type === 'direction');
        const dirNom = directionEntity?.nom;
        if (dirNom) users = this.getAssignableUsers().filter(u => u.direction === dirNom);
      }
    } else if (service) {
      users = users.filter(u => u.service === service);
    } else if (direction) {
      users = users.filter(u => u.direction === direction);
    }
    
    return users;
  }

  /** Utilisateurs assignables appartenant à une division (entiteId = division ou entité sous la division). */
  getAssignableUsersByDivision(divisionId: string): Utilisateur[] {
    return this.getAssignableUsersByDirection(undefined, undefined, divisionId);
  }

  // Obtenir les subalternes d'un utilisateur selon l'organigramme (utilisateurs qu'il peut voir/assigner)
  // Cette fonction est utilisée pour déterminer la hiérarchie, mais getVisibleUsers est la fonction principale
  getSubordinates(userId: string): Utilisateur[] {
    // Utiliser getVisibleUsers qui contient la logique complète
    return this.getVisibleUsers(userId);
  }

  // Obtenir les utilisateurs visibles par un utilisateur (pour l'affichage)
  // Retourne tous les utilisateurs selon le niveau d'accès dans l'organigramme
  getVisibleUsers(userId: string): Utilisateur[] {
    const currentUser = this.getUserById(userId);
    if (!currentUser || !currentUser.actif) {
      console.warn('⚠️ getVisibleUsers: Utilisateur non trouvé ou inactif', userId);
      return [];
    }

    console.log('🔍 getVisibleUsers pour:', {
      nom: currentUser.nom,
      role: currentUser.role,
      direction: currentUser.direction,
      service: currentUser.service,
      id: currentUser.id
    });

    // Récupérer TOUS les utilisateurs de la base (pour debug)
    const allUsersInDb: Utilisateur[] = this.getAllUsers();
    console.log('📊 Total utilisateurs dans la base:', allUsersInDb.length);
    console.log('📊 Répartition par rôle:', {
      SUPER_ADMIN: allUsersInDb.filter(u => u.role === Role.SUPER_ADMIN).length,
      DIRECTEUR_GENERAL: allUsersInDb.filter(u => u.role === Role.DIRECTEUR_GENERAL).length,
      DIRECTEUR: allUsersInDb.filter(u => u.role === Role.DIRECTEUR).length,
      CHEF_SERVICE: allUsersInDb.filter(u => u.role === Role.CHEF_SERVICE).length,
      AGENT: allUsersInDb.filter(u => u.role === Role.AGENT).length,
      SECRETAIRE: allUsersInDb.filter(u => u.role === Role.SECRETAIRE).length
    });

    // Récupérer tous les utilisateurs actifs (sauf SECRETAIRE pour l'assignation)
    // Le SUPER_ADMIN voit tous les utilisateurs (y compris les autres SUPER_ADMIN)
    // Le DG voit tous les utilisateurs sauf les SUPER_ADMIN
    const allUsersWithoutSecretary = allUsersInDb.filter(u => 
      u.actif && 
      u.role !== Role.SECRETAIRE &&
      u.id !== userId
    );

    // Pour le DG, exclure aussi les SUPER_ADMIN
    const allUsersForDG = allUsersInDb.filter(u => 
      u.actif && 
      u.role !== Role.SUPER_ADMIN &&
      u.role !== Role.SECRETAIRE &&
      u.id !== userId
    );

    console.log('📊 Utilisateurs filtres (actifs, pas SEC, pas soi-même):', allUsersWithoutSecretary.length);
    console.log('📊 Utilisateurs pour DG (actifs, pas SA/SEC, pas soi-même):', allUsersForDG.length);
    console.log('📊 Exemples d\'utilisateurs:', allUsersWithoutSecretary.slice(0, 5).map(u => ({
      nom: u.nom,
      role: u.role,
      direction: u.direction,
      service: u.service
    })));

    // 1. SUPER_ADMIN : voit tous les utilisateurs (y compris les autres SUPER_ADMIN, mais pas les SECRETAIRE)
    if (currentUser.role === Role.SUPER_ADMIN) {
      console.log('✅ SUPER_ADMIN - Retourne tous les utilisateurs (y compris autres SUPER_ADMIN):', allUsersWithoutSecretary.length);
      return allUsersWithoutSecretary;
    }

    // 2. DIRECTEUR_GENERAL : voit TOUS les employés (toutes les directions, sauf SUPER_ADMIN)
    if (currentUser.role === Role.DIRECTEUR_GENERAL) {
      console.log('✅ DIRECTEUR_GENERAL - Retourne tous les employés (sauf SUPER_ADMIN):', allUsersForDG.length);
      console.log('📋 Liste des utilisateurs pour DG:', allUsersForDG.map(u => `${u.nom} (${u.role}) - ${u.direction || 'N/A'}`));
      return allUsersForDG;
    }

    // 3. DIRECTEUR : voit tous les employés de sa direction (DIRECTEUR, CHEF_SERVICE, AGENT)
    // + tous les DIRECTEUR de sa direction (pairs au même niveau)
    if (currentUser.role === Role.DIRECTEUR && currentUser.direction) {
      // Tous les employés de la direction (subalternes)
      const directionUsers = allUsersInDb.filter((u: Utilisateur) => 
        u.direction === currentUser.direction
      );
      // Tous les DIRECTEUR de la même direction (pairs au même niveau)
      const sameLevelUsers = allUsersInDb.filter((u: Utilisateur) => 
        u.role === Role.DIRECTEUR && 
        u.direction === currentUser.direction &&
        u.id !== userId
      );
      // Combiner et dédupliquer
      const allDirectionUsers = Array.from(
        new Map([...directionUsers, ...sameLevelUsers].map((u: Utilisateur) => [u.id, u])).values()
      );
      console.log(`✅ DIRECTEUR (${currentUser.direction}) - Employés de la direction:`, allDirectionUsers.length);
      console.log(`   - Subalternes: ${directionUsers.length}, Pairs (DIRECTEUR): ${sameLevelUsers.length}`);
      console.log('📋 Utilisateurs de la direction:', allDirectionUsers.map((u: Utilisateur) => `${u.nom} (${u.role}) - ${u.service || 'N/A'}`));
      if (allDirectionUsers.length === 0) {
        console.warn('⚠️ Aucun utilisateur trouvé pour la direction:', currentUser.direction);
        console.warn('⚠️ Directions disponibles:', [...new Set(allUsersInDb.map((u: Utilisateur) => u.direction).filter(Boolean))]);
      }
      return allDirectionUsers;
    }

    // 4. CHEF_SERVICE : voit tous les employés de son service (CHEF_SERVICE, AGENT)
    // + tous les CHEF_SERVICE de son service (pairs au même niveau)
    if (currentUser.role === Role.CHEF_SERVICE && currentUser.service && currentUser.direction) {
      // Tous les employés du service (subalternes)
      const serviceUsers = allUsersInDb.filter((u: Utilisateur) => 
        u.service === currentUser.service && 
        u.direction === currentUser.direction
      );
      // Tous les CHEF_SERVICE du même service (pairs au même niveau)
      const sameLevelUsers = allUsersInDb.filter((u: Utilisateur) => 
        u.role === Role.CHEF_SERVICE && 
        u.service === currentUser.service &&
        u.direction === currentUser.direction &&
        u.id !== userId
      );
      // Combiner et dédupliquer
      const allServiceUsers = Array.from(
        new Map([...serviceUsers, ...sameLevelUsers].map((u: Utilisateur) => [u.id, u])).values()
      );
      console.log(`✅ CHEF_SERVICE (${currentUser.service}) - Employés du service:`, allServiceUsers.length);
      console.log(`   - Subalternes: ${serviceUsers.length}, Pairs (CHEF_SERVICE): ${sameLevelUsers.length}`);
      if (allServiceUsers.length === 0) {
        console.warn('⚠️ Aucun utilisateur trouvé pour le service:', currentUser.service, 'dans la direction:', currentUser.direction);
      }
      return allServiceUsers;
    }

    // 5. AGENT : voit tous les employés de son service (CHEF_SERVICE, AGENT)
    // + tous les AGENT de son service (pairs au même niveau)
    if (currentUser.role === Role.AGENT && currentUser.service && currentUser.direction) {
      // Tous les employés du service (CHEF_SERVICE et autres AGENT)
      const serviceUsers = allUsersInDb.filter((u: Utilisateur) => 
        u.service === currentUser.service && 
        u.direction === currentUser.direction
      );
      // Tous les AGENT du même service (pairs au même niveau)
      const sameLevelUsers = allUsersInDb.filter((u: Utilisateur) => 
        u.role === Role.AGENT && 
        u.service === currentUser.service &&
        u.direction === currentUser.direction &&
        u.id !== userId
      );
      // Combiner et dédupliquer
      const allServiceUsers = Array.from(
        new Map([...serviceUsers, ...sameLevelUsers].map((u: Utilisateur) => [u.id, u])).values()
      );
      console.log(`✅ AGENT (${currentUser.service}) - Employés du service:`, allServiceUsers.length);
      console.log(`   - Autres employés: ${serviceUsers.length}, Pairs (AGENT): ${sameLevelUsers.length}`);
      return allServiceUsers;
    }

    // 6. SECRETAIRE : doit voir au moins le DG (pour l'orientation des courriers) et les directeurs
    if (currentUser.role === Role.SECRETAIRE) {
      const dg = adminService.getDirecteurGeneral();
      const allSaufSuperAdmin = allUsersInDb.filter(u => u.actif !== false && u.role !== Role.SUPER_ADMIN);
      const avecDg = dg && !allSaufSuperAdmin.some(u => u.id === dg.id)
        ? [dg, ...allSaufSuperAdmin]
        : allSaufSuperAdmin;
      console.log('✅ SECRETAIRE - Voit le DG et tous les utilisateurs (sauf Super Admin):', avecDg.length);
      return avecDg;
    }

    // Par défaut, retourner une liste vide avec un warning détaillé
    console.warn('⚠️ Rôle non reconnu ou informations manquantes:', {
      role: currentUser.role,
      direction: currentUser.direction,
      service: currentUser.service
    });
    return [];
  }
}

export const userService = new UserService();

