import { Utilisateur, Role, RoleDefinition, Permission, Departement } from '../types';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';
import { laravelApiService } from './laravelApiService';

class AdminService {
  private usersKey = 'admin_users';
  private rolesKey = 'admin_roles';
  private departementsKey = 'admin_departements';
  /** Cache utilisateurs lorsque l'API Laravel est configurée (priorité API, pas localStorage). */
  private usersCache: Utilisateur[] = [];
  /** Cache rôles lorsque l'API Laravel est configurée (priorité API, pas localStorage). */
  private rolesCache: RoleDefinition[] = [];

  // Utilisateurs — priorité API Laravel : pas de lecture localStorage quand API configurée
  getAllUsers(): Utilisateur[] {
    if (laravelApiService.isConfigured()) {
      return [...this.usersCache];
    }
    const data = localStorage.getItem(this.usersKey);
    if (!data) return [];
    return JSON.parse(data).map((u: any) => ({
      ...u,
      dateCreation: new Date(u.dateCreation),
      dateModification: new Date(u.dateModification)
    }));
  }

  getUserById(id: string): Utilisateur | undefined {
    return this.getAllUsers().find(u => u.id === id);
  }

  /**
   * Retourne l'unique Directeur Général actif du système (un seul DG).
   * Tri par email pour garantir toujours le même utilisateur s'il y en a plusieurs en base.
   */
  getDirecteurGeneral(): Utilisateur | undefined {
    const all = this.getAllUsers();
    const dgList = all.filter(
      (u) =>
        (u.role === Role.DIRECTEUR_GENERAL || String(u.role || '').toUpperCase() === 'DIRECTEUR_GENERAL') &&
        u.actif !== false
    );
    if (dgList.length === 0) return undefined;
    return dgList.sort((a, b) => (a.email || '').localeCompare(b.email || ''))[0];
  }

  /** Rafraîchit le cache utilisateurs depuis l'API Laravel. À appeler au chargement des pages quand l'API est configurée. */
  async refreshUsersFromApi(): Promise<void> {
    if (!laravelApiService.isConfigured()) return;
    const list = await laravelApiService.getUsers();
    this.usersCache = list;
  }

  async createUser(user: Omit<Utilisateur, 'id' | 'dateCreation' | 'dateModification'>): Promise<Utilisateur> {
    if (laravelApiService.isConfigured()) {
      try {
        const created = await laravelApiService.createUser(user);
        await this.refreshUsersFromApi();
        return created;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Si l'email existe déjà côté Laravel, retourner simplement l'utilisateur existant
        if (/email has already been taken/i.test(message)) {
          await this.refreshUsersFromApi();
          const existing = this.getAllUsers().find(u => u.email === user.email);
          if (existing) {
            return existing;
          }
        }
        throw e;
      }
    }
    const users = this.getAllUsers();
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newUser: Utilisateur = {
      ...user,
      id: uniqueId,
      dateCreation: new Date(),
      dateModification: new Date()
    };
    users.push(newUser);
    localStorage.setItem(this.usersKey, JSON.stringify(users));
    return newUser;
  }

  async updateUser(id: string, updates: Partial<Utilisateur>): Promise<Utilisateur | null> {
    if (laravelApiService.isConfigured()) {
      await laravelApiService.updateUser(id, updates);
      await this.refreshUsersFromApi();
      return this.getUserById(id) ?? null;
    }
    const users = this.getAllUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    users[index] = {
      ...users[index],
      ...updates,
      dateModification: new Date()
    };
    localStorage.setItem(this.usersKey, JSON.stringify(users));
    return users[index];
  }

  async deleteUser(id: string): Promise<boolean> {
    if (laravelApiService.isConfigured()) {
      await laravelApiService.deleteUser(id);
      await this.refreshUsersFromApi();
      return true;
    }
    const users = this.getAllUsers();
    const filtered = users.filter(u => u.id !== id);
    if (filtered.length === users.length) return false;
    localStorage.setItem(this.usersKey, JSON.stringify(filtered));
    return true;
  }

  /**
   * Déprécié quand API configurée : le cache est rempli par refreshUsersFromApi().
   * Conservé pour compatibilité (écrit dans le cache si API configurée).
   */
  syncUsersFromApi(users: Utilisateur[]): void {
    if (laravelApiService.isConfigured()) {
      this.usersCache = users;
      return;
    }
    try {
      localStorage.setItem(this.usersKey, JSON.stringify(users));
    } catch (e) {
      console.error('Erreur lors de la synchronisation des utilisateurs API vers le localStorage:', e);
    }
  }

  // Rôles — priorité API Laravel : lecture depuis le cache rempli par refreshRolesFromApi()
  getAllRoles(): RoleDefinition[] {
    if (laravelApiService.isConfigured()) {
      return [...this.rolesCache];
    }
    const data = localStorage.getItem(this.rolesKey);
    if (!data) {
      const defaultRoles = this.getDefaultRoles();
      localStorage.setItem(this.rolesKey, JSON.stringify(defaultRoles));
      return defaultRoles;
    }
    const storedRoles = JSON.parse(data).map((r: any) => ({
      ...r,
      dateCreation: new Date(r.dateCreation),
      dateModification: new Date(r.dateModification)
    }));
    const defaultRoles = this.getDefaultRoles();
    const storedRoleCodes = storedRoles.map((r: RoleDefinition) => r.code);
    const missingRoles = defaultRoles.filter(r => !storedRoleCodes.includes(r.code));
    if (missingRoles.length > 0) {
      const updatedRoles = [...storedRoles, ...missingRoles];
      localStorage.setItem(this.rolesKey, JSON.stringify(updatedRoles));
      return updatedRoles.map((r: any) => ({
        ...r,
        dateCreation: new Date(r.dateCreation),
        dateModification: new Date(r.dateModification)
      }));
    }
    return storedRoles;
  }

  /** Rafraîchit le cache rôles depuis l'API Laravel. À appeler au chargement des pages admin quand l'API est configurée. */
  async refreshRolesFromApi(): Promise<void> {
    if (!laravelApiService.isConfigured()) return;
    const list = await laravelApiService.getRoles();
    this.rolesCache = list;
  }

  getDefaultRoles(): RoleDefinition[] {
    return [
      {
        id: '1',
        nom: 'Super Administrateur',
        code: Role.SUPER_ADMIN,
        description: 'Accès complet à toutes les fonctionnalités',
        permissions: Object.values(Permission),
        dateCreation: new Date(),
        dateModification: new Date()
      },
      {
        id: '2',
        nom: 'Secrétaire',
        code: Role.SECRETAIRE,
        description: 'Secrétariat de direction / DG avec accès étendu aux courriers et aux rappels (sans gestion des annotations/workflows, pas de courriers externes)',
        permissions: [
          ...Object.values(Permission).filter(
            (p) => p !== Permission.CREER_WORKFLOW && 
                    p !== Permission.MODIFIER_WORKFLOW && 
                    p !== Permission.CREER_COURRIER_SORTANT_EXTERNE
          ),
          // Assurer que VIEW_RAPPELS est bien inclus
          Permission.VIEW_RAPPELS
        ],
        dateCreation: new Date(),
        dateModification: new Date()
      },
      {
        id: '3',
        nom: 'Directeur Général',
        code: Role.DIRECTEUR_GENERAL,
        description: 'Supervision et validation - Accès complet comme le Super Admin',
        permissions: Object.values(Permission),
        dateCreation: new Date(),
        dateModification: new Date()
      },
      {
        id: '4',
        nom: 'Directeur',
        code: Role.DIRECTEUR,
        description: 'Gestion de la direction et supervision des services',
        permissions: [
          Permission.VOIR_COURRIERS,
          Permission.MODIFIER_COURRIER,
          Permission.VOIR_UTILISATEURS,
          Permission.CREER_WORKFLOW,
          Permission.MODIFIER_WORKFLOW,
          Permission.FILTRER_PAR_DIRECTION,
          Permission.FILTRER_PAR_SERVICE,
          Permission.VIEW_RAPPELS,
          Permission.CREER_COURRIER_SORTANT_EXTERNE
        ],
        dateCreation: new Date(),
        dateModification: new Date()
      },
      {
        id: '5',
        nom: 'Chef de Service',
        code: Role.CHEF_SERVICE,
        description: 'Gestion du service et des agents',
        permissions: [
          Permission.VOIR_COURRIERS,
          Permission.MODIFIER_COURRIER,
          Permission.VOIR_UTILISATEURS,
          Permission.FILTRER_PAR_SERVICE,
          Permission.FILTRER_PAR_SOUS_SERVICE
        ],
        dateCreation: new Date(),
        dateModification: new Date()
      },
      {
        id: '6',
        nom: 'Agent',
        code: Role.AGENT,
        description: 'Agent opérationnel - Consultation et traitement des courriers',
        permissions: [
          Permission.VOIR_COURRIERS,
          Permission.MODIFIER_COURRIER
        ],
        dateCreation: new Date(),
        dateModification: new Date()
      }
    ];
  }

  async createRole(role: Omit<RoleDefinition, 'id' | 'dateCreation' | 'dateModification'>): Promise<RoleDefinition> {
    if (laravelApiService.isConfigured()) {
      const created = await laravelApiService.createRole(role);
      await this.refreshRolesFromApi();
      return created;
    }
    const roles = this.getAllRoles();
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newRole: RoleDefinition = {
      ...role,
      id: uniqueId,
      dateCreation: new Date(),
      dateModification: new Date()
    };
    roles.push(newRole);
    localStorage.setItem(this.rolesKey, JSON.stringify(roles));
    return newRole;
  }

  async updateRole(id: string, updates: Partial<RoleDefinition>): Promise<RoleDefinition | null> {
    if (laravelApiService.isConfigured()) {
      await laravelApiService.updateRole(id, updates);
      await this.refreshRolesFromApi();
      return this.getAllRoles().find(r => r.id === id) ?? null;
    }
    const roles = this.getAllRoles();
    const index = roles.findIndex(r => r.id === id);
    if (index === -1) return null;
    roles[index] = {
      ...roles[index],
      ...updates,
      dateModification: new Date()
    };
    localStorage.setItem(this.rolesKey, JSON.stringify(roles));
    return roles[index];
  }

  async deleteRole(id: string): Promise<boolean> {
    if (laravelApiService.isConfigured()) {
      await laravelApiService.deleteRole(id);
      await this.refreshRolesFromApi();
      return true;
    }
    const roles = this.getAllRoles();
    const filtered = roles.filter(r => r.id !== id);
    if (filtered.length === roles.length) return false;
    localStorage.setItem(this.rolesKey, JSON.stringify(filtered));
    return true;
  }

  // Départements
  getAllDepartements(): Departement[] {
    const data = localStorage.getItem(this.departementsKey);
    if (!data) return [];
    return JSON.parse(data).map((d: any) => ({
      ...d,
      dateCreation: new Date(d.dateCreation),
      dateModification: new Date(d.dateModification)
    }));
  }

  createDepartement(departement: Omit<Departement, 'id' | 'dateCreation' | 'dateModification'>): Departement {
    const departements = this.getAllDepartements();
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newDepartement: Departement = {
      ...departement,
      id: uniqueId,
      dateCreation: new Date(),
      dateModification: new Date()
    };
    departements.push(newDepartement);
    localStorage.setItem(this.departementsKey, JSON.stringify(departements));
    return newDepartement;
  }

  updateDepartement(id: string, updates: Partial<Departement>): Departement | null {
    const departements = this.getAllDepartements();
    const index = departements.findIndex(d => d.id === id);
    if (index === -1) return null;
    
    departements[index] = {
      ...departements[index],
      ...updates,
      dateModification: new Date()
    };
    localStorage.setItem(this.departementsKey, JSON.stringify(departements));
    return departements[index];
  }

  deleteDepartement(id: string): boolean {
    const departements = this.getAllDepartements();
    const filtered = departements.filter(d => d.id !== id);
    if (filtered.length === departements.length) return false;
    localStorage.setItem(this.departementsKey, JSON.stringify(filtered));
    return true;
  }

  /**
   * Générer des utilisateurs de test et les répartir sur toutes les entités organisationnelles.
   * Si l'API Laravel est configurée, les comptes sont créés dans la base MySQL (table users).
   * Sinon, fallback sur le stockage local (localStorage).
   */
  async generateTestUsers(count: number = 300): Promise<{ created: number; errors: number }> {
    const entities = entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false);
    
    // Séparer les entités par type (hors Conseil et Direction Générale pour les affectations)
    const directions = entiteOrganisationnelleService.getDirectionsForFilters();
    const services = entities.filter(e => e.type === 'service');
    const sousServices = entities.filter(e => e.type === 'sous-service');
    const divisions = entities.filter(e => e.type === 'division');
    const bureaux = entities.filter(e => e.type === 'bureau');
    const cellules = entities.filter(e => e.type === 'cellule');
    
    const allSubEntities = [...services, ...sousServices, ...divisions, ...bureaux, ...cellules];
    
    // Noms et prénoms pour générer des utilisateurs réalistes
    const prenoms = [
      'Jean', 'Marie', 'Pierre', 'Sophie', 'Thomas', 'Emma', 'Lucas', 'Julie', 'Antoine', 'Camille',
      'Nicolas', 'Laura', 'Julien', 'Sarah', 'Maxime', 'Claire', 'Alexandre', 'Marine', 'David', 'Pauline',
      'Vincent', 'Amélie', 'Romain', 'Céline', 'Sébastien', 'Émilie', 'Guillaume', 'Audrey', 'Fabien', 'Nathalie',
      'Olivier', 'Isabelle', 'Christophe', 'Valérie', 'Jérôme', 'Stéphanie', 'Benoît', 'Caroline', 'François', 'Sylvie',
      'Laurent', 'Patricia', 'Philippe', 'Martine', 'Stéphane', 'Catherine', 'Pascal', 'Monique', 'Thierry', 'Françoise'
    ];
    
    const noms = [
      'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau',
      'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier',
      'Morel', 'Girard', 'André', 'Lefevre', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez',
      'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas',
      'Perrin', 'Morin', 'Mathieu', 'Clement', 'Gauthier', 'Dumont', 'Lopez', 'Fontaine', 'Chevalier', 'Robin'
    ];
    
    let existingUsers: Utilisateur[] = [];
    try {
      if (laravelApiService.isConfigured()) {
        existingUsers = await laravelApiService.getUsers();
      } else {
        existingUsers = this.getAllUsers();
      }
    } catch {
      existingUsers = this.getAllUsers();
    }

    const existingEmails = new Set(existingUsers.map(u => u.email));
    
    let created = 0;
    let errors = 0;
    let userIndex = 0;
    
    // Fonction pour obtenir un nom unique
    const getUniqueName = (): { prenom: string; nom: string; email: string } => {
      let attempts = 0;
      while (attempts < 1000) {
        const prenom = prenoms[Math.floor(Math.random() * prenoms.length)];
        const nom = noms[Math.floor(Math.random() * noms.length)];
        const email = `${prenom.toLowerCase()}.${nom.toLowerCase()}.${userIndex + 1}@example.com`;
        
        if (!existingEmails.has(email)) {
          existingEmails.add(email);
          return { prenom, nom, email };
        }
        attempts++;
      }
      // Si on ne trouve pas, utiliser un timestamp
      const timestamp = Date.now();
      return {
        prenom: `User${userIndex + 1}`,
        nom: `Test${timestamp}`,
        email: `user${userIndex + 1}.test${timestamp}@example.com`
      };
    };
    
    // Répartir les utilisateurs sur toutes les entités
    for (let i = 0; i < count; i++) {
      try {
        const { prenom, nom, email } = getUniqueName();
        userIndex++;
        
        let role: Role;
        let direction: string | undefined;
        let service: string | undefined;
        let entiteId: string | undefined;
        
        // Répartir selon les entités disponibles
        if (directions.length > 0 && i % 10 < 2) {
          // 20% pour les directions (DIRECTEUR)
          const directionEntity = directions[i % directions.length];
          role = Role.DIRECTEUR;
          direction = directionEntity.nom;
          service = undefined;
          entiteId = undefined;
        } else if (services.length > 0 && i % 10 < 5) {
          // 30% pour les services (CHEF_SERVICE)
          const serviceEntity = services[i % services.length];
          const parentEntity = entities.find(e => e.id === serviceEntity.parentId);
          role = Role.CHEF_SERVICE;
          direction = parentEntity?.nom;
          service = serviceEntity.nom;
          entiteId = undefined;
        } else if (allSubEntities.length > 0) {
          // 50% pour les sous-services, divisions, bureaux, cellules (AGENT)
          const entity = allSubEntities[i % allSubEntities.length];
          role = Role.AGENT;
          
          // Trouver la direction et le service parents
          const findParents = (entityId: string): { direction?: string; service?: string } => {
            const currentEntity = entities.find(e => e.id === entityId);
            if (!currentEntity) return {};
            
            if (currentEntity.type === 'direction_generale' || currentEntity.type === 'direction') {
              return { direction: currentEntity.nom };
            } else if (currentEntity.type === 'service') {
              const parent = entities.find(e => e.id === currentEntity.parentId);
              return { direction: parent?.nom, service: currentEntity.nom };
            } else {
              // Pour les sous-services et autres, remonter la hiérarchie
              const parent = entities.find(e => e.id === currentEntity.parentId);
              if (parent) {
                const parents = findParents(parent.id);
                return parents;
              }
            }
            return {};
          };
          
          const parents = findParents(entity.id);
          direction = parents.direction;
          service = parents.service;
          entiteId = entity.id;
        } else {
          // Par défaut, AGENT sans affectation
          role = Role.AGENT;
        }
        
        const baseUser: Omit<Utilisateur, 'id' | 'dateCreation' | 'dateModification'> = {
          nom: `${prenom} ${nom}`,
          email,
          role,
          direction,
          service,
          entiteId,
          actif: true
        };

        if (laravelApiService.isConfigured()) {
          // Création dans la base MySQL via l'API Laravel
          const password = 'Password123!'; // mot de passe de test (exporté ensuite)
          await laravelApiService.createUser({
            nom: baseUser.nom,
            email: baseUser.email,
            password,
            role: baseUser.role,
            direction: baseUser.direction,
            service: baseUser.service,
            actif: baseUser.actif,
          });
        } else {
          // Fallback : stockage local (ancien comportement)
          await this.createUser(baseUser);
        }
        
        created++;
      } catch (error) {
        console.error(`Erreur lors de la création de l'utilisateur ${i + 1}:`, error);
        errors++;
      }
    }
    
    if (laravelApiService.isConfigured()) {
      await this.refreshUsersFromApi();
    }
    console.log(`✅ ${created} utilisateurs créés, ${errors} erreurs`);
    return { created, errors };
  }
}

export const adminService = new AdminService();

