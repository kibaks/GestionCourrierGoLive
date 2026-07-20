import { 
  LocalArchivage, 
  Armoire, 
  Etagere, 
  BoiteArchive, 
  Archive,
  ParametresArchivage,
  DenominationArchivage,
  StatutCourrier
} from '../types';
import { userSettingsService } from './userSettingsService';
import { courrierService } from './courrierService';
import { laravelApiService } from './laravelApiService';

class ArchivageService {
  private locauxKey = 'archivage_locaux';
  private armoiresKey = 'archivage_armoires';
  private etageresKey = 'archivage_etageres';
  private boitesKey = 'archivage_boites';
  private archivesKey = 'archivage_archives';
  private parametresKey = 'archivage_parametres';

  // ==========================================
  // LOCAUX D'ARCHIVAGE
  // ==========================================
  
  getAllLocaux(): LocalArchivage[] {
    const data = localStorage.getItem(this.locauxKey);
    if (!data) return this.getDefaultLocaux();
    return JSON.parse(data).map((l: any) => ({
      ...l,
      dateCreation: new Date(l.dateCreation),
      dateModification: new Date(l.dateModification)
    }));
  }

  getDefaultLocaux(): LocalArchivage[] {
    const locaux: LocalArchivage[] = [
      {
        id: 'local-1',
        nom: 'Archives Centrales',
        code: 'AC-001',
        adresse: 'Bâtiment Principal',
        batiment: 'A',
        etage: 'Sous-sol',
        description: 'Local principal d\'archivage',
        capacite: 20,
        actif: true,
        dateCreation: new Date(),
        dateModification: new Date()
      },
      {
        id: 'local-2',
        nom: 'Archives Secondaires',
        code: 'AS-001',
        adresse: 'Bâtiment Annexe',
        batiment: 'B',
        etage: 'RDC',
        description: 'Local secondaire pour archives récentes',
        capacite: 10,
        actif: true,
        dateCreation: new Date(),
        dateModification: new Date()
      }
    ];
    localStorage.setItem(this.locauxKey, JSON.stringify(locaux));
    return locaux;
  }

  createLocal(local: Omit<LocalArchivage, 'id' | 'dateCreation' | 'dateModification'>): LocalArchivage {
    const locaux = this.getAllLocaux();
    const newLocal: LocalArchivage = {
      ...local,
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      dateCreation: new Date(),
      dateModification: new Date()
    };
    locaux.push(newLocal);
    localStorage.setItem(this.locauxKey, JSON.stringify(locaux));
    return newLocal;
  }

  updateLocal(id: string, updates: Partial<LocalArchivage>): LocalArchivage | null {
    const locaux = this.getAllLocaux();
    const index = locaux.findIndex(l => l.id === id);
    if (index === -1) return null;
    
    locaux[index] = { ...locaux[index], ...updates, dateModification: new Date() };
    localStorage.setItem(this.locauxKey, JSON.stringify(locaux));
    return locaux[index];
  }

  deleteLocal(id: string): boolean {
    const locaux = this.getAllLocaux();
    const filtered = locaux.filter(l => l.id !== id);
    if (filtered.length === locaux.length) return false;
    localStorage.setItem(this.locauxKey, JSON.stringify(filtered));
    return true;
  }

  // ==========================================
  // ARMOIRES
  // ==========================================
  
  getAllArmoires(): Armoire[] {
    const data = localStorage.getItem(this.armoiresKey);
    if (!data) return this.getDefaultArmoires();
    return JSON.parse(data).map((a: any) => ({
      ...a,
      dateCreation: new Date(a.dateCreation),
      dateModification: new Date(a.dateModification)
    }));
  }

  getDefaultArmoires(): Armoire[] {
    const armoires: Armoire[] = [
      {
        id: 'armoire-1',
        localId: 'local-1',
        nom: 'Armoire A1',
        code: 'ARM-A1',
        nombreEtageres: 6,
        position: 'Rangée A - Position 1',
        actif: true,
        dateCreation: new Date(),
        dateModification: new Date()
      },
      {
        id: 'armoire-2',
        localId: 'local-1',
        nom: 'Armoire A2',
        code: 'ARM-A2',
        nombreEtageres: 6,
        position: 'Rangée A - Position 2',
        actif: true,
        dateCreation: new Date(),
        dateModification: new Date()
      }
    ];
    localStorage.setItem(this.armoiresKey, JSON.stringify(armoires));
    return armoires;
  }

  getArmoiresByLocal(localId: string): Armoire[] {
    return this.getAllArmoires().filter(a => a.localId === localId && a.actif);
  }

  createArmoire(armoire: Omit<Armoire, 'id' | 'dateCreation' | 'dateModification'>): Armoire {
    const armoires = this.getAllArmoires();
    const newArmoire: Armoire = {
      ...armoire,
      id: `armoire-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      dateCreation: new Date(),
      dateModification: new Date()
    };
    armoires.push(newArmoire);
    localStorage.setItem(this.armoiresKey, JSON.stringify(armoires));
    return newArmoire;
  }

  updateArmoire(id: string, updates: Partial<Armoire>): Armoire | null {
    const armoires = this.getAllArmoires();
    const index = armoires.findIndex(a => a.id === id);
    if (index === -1) return null;
    
    const previous = armoires[index];
    const previousShelves = previous.nombreEtageres || 0;
    const nextShelves = updates.nombreEtageres ?? previousShelves;

    armoires[index] = { ...previous, ...updates, dateModification: new Date() };
    localStorage.setItem(this.armoiresKey, JSON.stringify(armoires));

    // Ajuster les étagères si le nombre a changé
    if (nextShelves !== previousShelves) {
      const currentEtageres = this.getEtageresByArmoire(id);

      if (nextShelves > previousShelves) {
        // Ajouter les nouvelles étagères manquantes
        for (let i = previousShelves + 1; i <= nextShelves; i++) {
          this.createEtagere({
            armoireId: id,
            numero: i,
            nom: `Étagère ${i}`,
            capaciteBoites: 10,
            actif: true
          });
        }
      } else {
        // Supprimer les étagères en surplus et leurs boîtes/archives associées
        const etageresToRemove = currentEtageres.filter(e => e.numero > nextShelves).map(e => e.id);

        // Filtrer les étagères
        const remainingEtageres = this.getAllEtageres().filter(e => !(e.armoireId === id && e.numero > nextShelves));
        localStorage.setItem(this.etageresKey, JSON.stringify(remainingEtageres));

        // Filtrer les boîtes liées
        if (etageresToRemove.length > 0) {
          const allBoites = this.getAllBoites();
          const boitesToRemove = allBoites.filter(b => etageresToRemove.includes(b.etagereId)).map(b => b.id);
          const remainingBoites = allBoites.filter(b => !boitesToRemove.includes(b.id));
          localStorage.setItem(this.boitesKey, JSON.stringify(remainingBoites));

          // Filtrer les archives liées aux boîtes supprimées
          const remainingArchives = this.getLocalArchives().filter(a => !boitesToRemove.includes(a.boiteId ?? ''));
          localStorage.setItem(this.archivesKey, JSON.stringify(remainingArchives));
        }
      }
    }

    return armoires[index];
  }

  deleteArmoire(id: string): boolean {
    const armoires = this.getAllArmoires();
    const filtered = armoires.filter(a => a.id !== id);
    if (filtered.length === armoires.length) return false;
    localStorage.setItem(this.armoiresKey, JSON.stringify(filtered));
    return true;
  }

  // ==========================================
  // ÉTAGÈRES
  // ==========================================
  
  getAllEtageres(): Etagere[] {
    const data = localStorage.getItem(this.etageresKey);
    if (!data) return this.getDefaultEtageres();
    return JSON.parse(data).map((e: any) => ({
      ...e,
      dateCreation: new Date(e.dateCreation),
      dateModification: new Date(e.dateModification)
    }));
  }

  getDefaultEtageres(): Etagere[] {
    const etageres: Etagere[] = [];
    // Créer 6 étagères pour chaque armoire par défaut
    ['armoire-1', 'armoire-2'].forEach(armoireId => {
      for (let i = 1; i <= 6; i++) {
        etageres.push({
          id: `etagere-${armoireId}-${i}`,
          armoireId,
          numero: i,
          nom: `Étagère ${i}`,
          capaciteBoites: 10,
          actif: true,
          dateCreation: new Date(),
          dateModification: new Date()
        });
      }
    });
    localStorage.setItem(this.etageresKey, JSON.stringify(etageres));
    return etageres;
  }

  getEtageresByArmoire(armoireId: string): Etagere[] {
    return this.getAllEtageres().filter(e => e.armoireId === armoireId && e.actif).sort((a, b) => a.numero - b.numero);
  }

  createEtagere(etagere: Omit<Etagere, 'id' | 'dateCreation' | 'dateModification'>): Etagere {
    const etageres = this.getAllEtageres();
    const newEtagere: Etagere = {
      ...etagere,
      id: `etagere-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      dateCreation: new Date(),
      dateModification: new Date()
    };
    etageres.push(newEtagere);
    localStorage.setItem(this.etageresKey, JSON.stringify(etageres));
    return newEtagere;
  }

  updateEtagere(id: string, updates: Partial<Etagere>): Etagere | null {
    const etageres = this.getAllEtageres();
    const index = etageres.findIndex(e => e.id === id);
    if (index === -1) return null;
    
    etageres[index] = { ...etageres[index], ...updates, dateModification: new Date() };
    localStorage.setItem(this.etageresKey, JSON.stringify(etageres));
    return etageres[index];
  }

  deleteEtagere(id: string): boolean {
    const etageres = this.getAllEtageres();
    const filtered = etageres.filter(e => e.id !== id);
    if (filtered.length === etageres.length) return false;
    localStorage.setItem(this.etageresKey, JSON.stringify(filtered));
    return true;
  }

  // ==========================================
  // BOÎTES D'ARCHIVES
  // ==========================================
  
  getAllBoites(): BoiteArchive[] {
    const data = localStorage.getItem(this.boitesKey);
    if (!data) return [];
    return JSON.parse(data).map((b: any) => ({
      ...b,
      dateDebut: b.dateDebut ? new Date(b.dateDebut) : undefined,
      dateFin: b.dateFin ? new Date(b.dateFin) : undefined,
      dateCreation: new Date(b.dateCreation),
      dateModification: new Date(b.dateModification)
    }));
  }

  getBoitesByEtagere(etagereId: string): BoiteArchive[] {
    return this.getAllBoites().filter(b => b.etagereId === etagereId && b.actif);
  }

  getBoiteById(id: string): BoiteArchive | undefined {
    return this.getAllBoites().find(b => b.id === id);
  }

  createBoite(boite: Omit<BoiteArchive, 'id' | 'dateCreation' | 'dateModification'>): BoiteArchive {
    const boites = this.getAllBoites();
    const annee = boite.annee || new Date().getFullYear();
    const numero = boites.filter(b => b.annee === annee).length + 1;
    
    const newBoite: BoiteArchive = {
      ...boite,
      id: `boite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      code: boite.code || `BOX-${annee}-${String(numero).padStart(4, '0')}`,
      dateCreation: new Date(),
      dateModification: new Date()
    };
    boites.push(newBoite);
    localStorage.setItem(this.boitesKey, JSON.stringify(boites));
    return newBoite;
  }

  updateBoite(id: string, updates: Partial<BoiteArchive>): BoiteArchive | null {
    const boites = this.getAllBoites();
    const index = boites.findIndex(b => b.id === id);
    if (index === -1) return null;
    
    boites[index] = { ...boites[index], ...updates, dateModification: new Date() };
    localStorage.setItem(this.boitesKey, JSON.stringify(boites));
    return boites[index];
  }

  deleteBoite(id: string): boolean {
    const boites = this.getAllBoites();
    const filtered = boites.filter(b => b.id !== id);
    if (filtered.length === boites.length) return false;
    localStorage.setItem(this.boitesKey, JSON.stringify(filtered));
    return true;
  }

  // ==========================================
  // ARCHIVES — API Laravel avec fallback localStorage
  // ==========================================

  private archivesCache: Archive[] | null = null;
  private archivesLastFetch = 0;
  private readonly archivesCacheTtl = 5000; // ms

  private parseArchiveDates(a: any): Archive {
    return {
      ...a,
      dateArchivage: new Date(a.dateArchivage),
      dateDestruction: a.dateDestruction ? new Date(a.dateDestruction) : undefined,
      dateCreation: new Date(a.dateCreation),
      dateModification: new Date(a.dateModification),
      historique: a.historique?.map((h: any) => ({
        ...h,
        date: new Date(h.date)
      }))
    };
  }

  private getLocalArchives(): Archive[] {
    const data = localStorage.getItem(this.archivesKey);
    if (!data) return [];
    try {
      return JSON.parse(data).map((a: any) => this.parseArchiveDates(a));
    } catch {
      return [];
    }
  }

  private setLocalArchives(archives: Archive[]): void {
    localStorage.setItem(this.archivesKey, JSON.stringify(archives));
  }

  /**
   * Récupère toutes les archives visibles pour l'utilisateur connecté.
   * Priorité à l'API Laravel ; fallback localStorage en mode offline.
   */
  async getAllArchives(): Promise<Archive[]> {
    if (laravelApiService.isConfigured()) {
      try {
        const archives = await laravelApiService.getArchives();
        this.archivesCache = archives;
        this.archivesLastFetch = Date.now();
        this.setLocalArchives(archives);
        return archives;
      } catch (error) {
        console.warn('⚠️ [ArchivageService] Erreur chargement API archives, fallback localStorage:', error);
      }
    }
    return this.getLocalArchives();
  }

  /**
   * Version synchrone utilisant le cache local (utile pour les stats rapides).
   */
  getAllArchivesSync(): Archive[] {
    if (this.archivesCache && Date.now() - this.archivesLastFetch < this.archivesCacheTtl) {
      return this.archivesCache;
    }
    // Tenter de rafraîchir en arrière-plan sans bloquer
    void this.getAllArchives();
    return this.getLocalArchives();
  }

  async getArchivesByCourrier(courrierId: string): Promise<Archive | undefined> {
    const archives = await this.getAllArchives();
    return archives.find(a => a.courrierId === courrierId);
  }

  async getArchivesByBoite(boiteId: string): Promise<Archive[]> {
    const archives = await this.getAllArchives();
    return archives.filter(a => a.boiteId === boiteId);
  }

  /**
   * Archive un courrier traité.
   * L'API Laravel génère le numéro de classement et met à jour le statut du courrier.
   */
  async archiverCourrier(
    courrierId: string,
    boiteId: string,
    archivePar: string,
    options?: {
      motif?: string;
      observations?: string;
      dureeConservation?: number;
    }
  ): Promise<Archive> {
    const parametres = this.getParametres();

    if (laravelApiService.isConfigured()) {
      const archive = await laravelApiService.createArchive({
        courrierId,
        boiteId,
        motif: options?.motif,
        observations: options?.observations,
        dureeConservation: options?.dureeConservation ?? parametres.dureeConservationDefaut,
      });
      // Invalider le cache local
      this.archivesCache = null;
      void this.getAllArchives();
      return archive;
    }

    // Fallback localStorage (offline)
    const archives = this.getLocalArchives();
    const annee = new Date().getFullYear();
    const numero = archives.filter(a => a.dateArchivage.getFullYear() === annee).length + 1;
    const numeroClassement = `ARCH-${annee}-${String(numero).padStart(5, '0')}`;
    const dureeConservation = options?.dureeConservation ?? parametres.dureeConservationDefaut;
    const dateDestruction = new Date();
    dateDestruction.setFullYear(dateDestruction.getFullYear() + dureeConservation);

    const newArchive: Archive = {
      id: `archive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      courrierId,
      boiteId,
      numeroClassement,
      dateArchivage: new Date(),
      archivePar,
      motif: options?.motif,
      observations: options?.observations,
      dureeConservation,
      dateDestruction,
      statut: 'ARCHIVE',
      historique: [{
        id: `hist-${Date.now()}`,
        archiveId: '',
        action: 'ARCHIVAGE',
        date: new Date(),
        utilisateurId: archivePar,
        motif: options?.motif,
        observations: 'Archivage initial'
      }],
      dateCreation: new Date(),
      dateModification: new Date()
    };

    newArchive.historique![0].archiveId = newArchive.id;
    archives.push(newArchive);
    this.setLocalArchives(archives);

    // Mettre à jour le statut du courrier côté API si possible
    void courrierService.updateCourrier(courrierId, { statut: StatutCourrier.ARCHIVE }).catch(() => {});

    return newArchive;
  }

  /**
   * Archive directe d'un document sans courrier.
   */
  async archiverDocument(
    document: Archive['document'],
    direction: string,
    archivePar: string,
    options?: {
      boiteId?: string;
      entiteId?: string;
      motif?: string;
      observations?: string;
      dureeConservation?: number;
      fichier?: File;
    }
  ): Promise<Archive> {
    const parametres = this.getParametres();

    if (laravelApiService.isConfigured()) {
      const archive = await laravelApiService.createArchive({
        direction,
        entiteId: options?.entiteId,
        boiteId: options?.boiteId,
        document,
        motif: options?.motif,
        observations: options?.observations,
        dureeConservation: options?.dureeConservation ?? parametres.dureeConservationDefaut,
        fichier: options?.fichier,
      });
      this.archivesCache = null;
      void this.getAllArchives();
      return archive;
    }

    // Fallback localStorage
    const archives = this.getLocalArchives();
    const annee = new Date().getFullYear();
    const numero = archives.filter(a => a.dateArchivage.getFullYear() === annee).length + 1;
    const numeroClassement = `ARCH-${annee}-${String(numero).padStart(5, '0')}`;
    const dureeConservation = options?.dureeConservation ?? parametres.dureeConservationDefaut;
    const dateDestruction = new Date();
    dateDestruction.setFullYear(dateDestruction.getFullYear() + dureeConservation);

    const newArchive: Archive = {
      id: `archive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      direction,
      entiteId: options?.entiteId,
      boiteId: options?.boiteId,
      numeroClassement,
      dateArchivage: new Date(),
      archivePar,
      motif: options?.motif,
      observations: options?.observations,
      dureeConservation,
      dateDestruction,
      statut: 'ARCHIVE',
      document,
      historique: [{
        id: `hist-${Date.now()}`,
        archiveId: '',
        action: 'ARCHIVAGE',
        date: new Date(),
        utilisateurId: archivePar,
        motif: options?.motif,
        observations: 'Archivage direct initial'
      }],
      dateCreation: new Date(),
      dateModification: new Date()
    };

    newArchive.historique![0].archiveId = newArchive.id;
    archives.push(newArchive);
    this.setLocalArchives(archives);

    return newArchive;
  }

  async consulterArchive(archiveId: string, utilisateurId: string, motif?: string): Promise<Archive | null> {
    if (laravelApiService.isConfigured()) {
      try {
        const archive = await laravelApiService.updateArchiveStatut(archiveId, 'CONSULTE', motif);
        this.archivesCache = null;
        void this.getAllArchives();
        return archive;
      } catch (error) {
        console.warn('⚠️ [ArchivageService] consulterArchive API échoué:', error);
      }
    }

    const archives = this.getLocalArchives();
    const index = archives.findIndex(a => a.id === archiveId);
    if (index === -1) return null;
    archives[index].statut = 'CONSULTE';
    archives[index].dateModification = new Date();
    archives[index].historique = archives[index].historique || [];
    archives[index].historique.push({
      id: `hist-${Date.now()}`,
      archiveId,
      action: 'CONSULTATION',
      date: new Date(),
      utilisateurId,
      motif
    });
    this.setLocalArchives(archives);
    return archives[index];
  }

  async sortirArchive(archiveId: string, utilisateurId: string, motif: string): Promise<Archive | null> {
    if (laravelApiService.isConfigured()) {
      try {
        const archive = await laravelApiService.updateArchiveStatut(archiveId, 'SORTI', motif);
        this.archivesCache = null;
        void this.getAllArchives();
        return archive;
      } catch (error) {
        console.warn('⚠️ [ArchivageService] sortirArchive API échoué:', error);
      }
    }

    const archives = this.getLocalArchives();
    const index = archives.findIndex(a => a.id === archiveId);
    if (index === -1) return null;
    archives[index].statut = 'SORTI';
    archives[index].dateModification = new Date();
    archives[index].historique = archives[index].historique || [];
    archives[index].historique.push({
      id: `hist-${Date.now()}`,
      archiveId,
      action: 'SORTIE',
      date: new Date(),
      utilisateurId,
      motif
    });
    this.setLocalArchives(archives);
    return archives[index];
  }

  async retournerArchive(archiveId: string, utilisateurId: string, observations?: string): Promise<Archive | null> {
    if (laravelApiService.isConfigured()) {
      try {
        const archive = await laravelApiService.retourArchive(archiveId);
        this.archivesCache = null;
        void this.getAllArchives();
        return archive;
      } catch (error) {
        console.warn('⚠️ [ArchivageService] retournerArchive API échoué:', error);
      }
    }

    const archives = this.getLocalArchives();
    const index = archives.findIndex(a => a.id === archiveId);
    if (index === -1) return null;
    archives[index].statut = 'ARCHIVE';
    archives[index].dateModification = new Date();
    archives[index].historique = archives[index].historique || [];
    archives[index].historique.push({
      id: `hist-${Date.now()}`,
      archiveId,
      action: 'RETOUR',
      date: new Date(),
      utilisateurId,
      observations
    });
    this.setLocalArchives(archives);
    return archives[index];
  }

  // ==========================================
  // PARAMÈTRES
  // ==========================================
  
  /**
   * Récupère les paramètres (synchrone, depuis le cache)
   */
  getParametres(): ParametresArchivage {
    const cached = userSettingsService.getSettingsSync<ParametresArchivage>(
      this.parametresKey,
      this.getDefaultParametres()
    );
    
    // S'assurer que les dénominations existent (migration des anciens paramètres)
    if (!cached.denominations) {
      cached.denominations = this.getDefaultDenominations();
      // Sauvegarder la mise à jour
      userSettingsService.saveSettings(this.parametresKey, cached).catch(() => undefined);
    }
    
    return cached;
  }

  /**
   * Récupère les paramètres de manière asynchrone (depuis Firestore)
   */
  async getParametresAsync(): Promise<ParametresArchivage> {
    const parametres = await userSettingsService.getSettings<ParametresArchivage>(
      this.parametresKey,
      this.getDefaultParametres()
    );
    
    // S'assurer que les dénominations existent
    if (!parametres.denominations) {
      parametres.denominations = this.getDefaultDenominations();
      await userSettingsService.saveSettings(this.parametresKey, parametres);
    }
    
    return parametres;
  }

  getDefaultParametres(): ParametresArchivage {
    const parametres: ParametresArchivage = {
      id: 'params-1',
      dureeConservationDefaut: 10,
      formatNumeroClassement: 'ARCH-{ANNEE}-{NUMERO}',
      alerteBoitePleine: true,
      alerteDestructionJoursAvant: 30,
      denominations: this.getDefaultDenominations(),
      actif: true,
      dateModification: new Date()
    };
    return parametres;
  }

  getDefaultDenominations(): DenominationArchivage[] {
    return [
      {
        id: 'denom-1',
        niveau: 1,
        nomSingulier: 'Local',
        nomPluriel: 'Locaux',
        icone: 'warehouse',
        couleur: 'purple',
        description: 'Espace physique d\'archivage',
        actif: true,
        dateModification: new Date()
      },
      {
        id: 'denom-2',
        niveau: 2,
        nomSingulier: 'Armoire',
        nomPluriel: 'Armoires',
        icone: 'cabinet',
        couleur: 'blue',
        description: 'Meuble de rangement',
        actif: true,
        dateModification: new Date()
      },
      {
        id: 'denom-3',
        niveau: 3,
        nomSingulier: 'Étagère',
        nomPluriel: 'Étagères',
        icone: 'layer',
        couleur: 'green',
        description: 'Niveau de rangement',
        actif: true,
        dateModification: new Date()
      },
      {
        id: 'denom-4',
        niveau: 4,
        nomSingulier: 'Boîte',
        nomPluriel: 'Boîtes',
        icone: 'archive',
        couleur: 'amber',
        description: 'Conteneur d\'archives',
        actif: true,
        dateModification: new Date()
      }
    ];
  }

  getDenomination(niveau: 1 | 2 | 3 | 4): DenominationArchivage {
    const parametres = this.getParametres();
    const denom = parametres.denominations?.find(d => d.niveau === niveau);
    if (denom) return denom;
    return this.getDefaultDenominations().find(d => d.niveau === niveau)!;
  }

  async updateDenomination(niveau: 1 | 2 | 3 | 4, updates: Partial<DenominationArchivage>): Promise<DenominationArchivage> {
    const parametres = await this.getParametresAsync();
    if (!parametres.denominations) {
      parametres.denominations = this.getDefaultDenominations();
    }
    const index = parametres.denominations.findIndex(d => d.niveau === niveau);
    if (index !== -1) {
      parametres.denominations[index] = {
        ...parametres.denominations[index],
        ...updates,
        dateModification: new Date()
      };
    }
    await userSettingsService.saveSettings(this.parametresKey, parametres);
    return parametres.denominations[index];
  }

  /**
   * Version synchrone pour compatibilité (utilise localStorage + Firestore en arrière-plan)
   */
  updateDenominationSync(niveau: 1 | 2 | 3 | 4, updates: Partial<DenominationArchivage>): DenominationArchivage {
    const parametres = this.getParametres();
    if (!parametres.denominations) {
      parametres.denominations = this.getDefaultDenominations();
    }
    const index = parametres.denominations.findIndex(d => d.niveau === niveau);
    if (index !== -1) {
      parametres.denominations[index] = {
        ...parametres.denominations[index],
        ...updates,
        dateModification: new Date()
      };
    }
    // Sauvegarder dans localStorage immédiatement
    try {
      localStorage.setItem(this.parametresKey, JSON.stringify(parametres));
    } catch (error) {
      console.error('Error saving parametres to localStorage:', error);
    }
    // Sauvegarder dans Firestore en arrière-plan
    userSettingsService.saveSettings(this.parametresKey, parametres).catch(() => undefined);
    return parametres.denominations[index];
  }

  async updateParametres(updates: Partial<ParametresArchivage>): Promise<ParametresArchivage> {
    const parametres = await this.getParametresAsync();
    const updated = { ...parametres, ...updates, dateModification: new Date() };
    await userSettingsService.saveSettings(this.parametresKey, updated);
    return updated;
  }

  /**
   * Version synchrone pour compatibilité
   */
  updateParametresSync(updates: Partial<ParametresArchivage>): ParametresArchivage {
    const parametres = this.getParametres();
    const updated = { ...parametres, ...updates, dateModification: new Date() };
    // Sauvegarder dans localStorage immédiatement
    try {
      localStorage.setItem(this.parametresKey, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving parametres to localStorage:', error);
    }
    // Sauvegarder dans Firestore en arrière-plan
    userSettingsService.saveSettings(this.parametresKey, updated).catch(() => undefined);
    return updated;
  }

  // ==========================================
  // STATISTIQUES
  // ==========================================
  
  getStatistiques() {
    const locaux = this.getAllLocaux();
    const armoires = this.getAllArmoires();
    const etageres = this.getAllEtageres();
    const boites = this.getAllBoites();
    const archives = this.getAllArchivesSync();

    return {
      totalLocaux: locaux.filter(l => l.actif).length,
      totalArmoires: armoires.filter(a => a.actif).length,
      totalEtageres: etageres.filter(e => e.actif).length,
      totalBoites: boites.filter(b => b.actif).length,
      totalArchives: archives.length,
      archivesParStatut: {
        archive: archives.filter(a => a.statut === 'ARCHIVE').length,
        consulte: archives.filter(a => a.statut === 'CONSULTE').length,
        sorti: archives.filter(a => a.statut === 'SORTI').length,
        detruit: archives.filter(a => a.statut === 'DETRUIT').length
      },
      boitesPleines: boites.filter(b => b.estPleine).length,
      archivesADetruire: archives.filter(a =>
        a.dateDestruction && new Date(a.dateDestruction) <= new Date()
      ).length
    };
  }

  // Obtenir la localisation complète d'une archive
  getLocalisationComplete(archiveId: string): {
    local?: LocalArchivage;
    armoire?: Armoire;
    etagere?: Etagere;
    boite?: BoiteArchive;
  } | null {
    const archive = this.getAllArchivesSync().find(a => a.id === archiveId);
    if (!archive) return null;

    const boite = archive.boiteId ? this.getBoiteById(archive.boiteId) : undefined;
    if (!boite) return { boite: undefined };

    const etagere = this.getAllEtageres().find(e => e.id === boite.etagereId);
    if (!etagere) return { boite };

    const armoire = this.getAllArmoires().find(a => a.id === etagere.armoireId);
    if (!armoire) return { boite, etagere };

    const local = this.getAllLocaux().find(l => l.id === armoire.localId);

    return { local, armoire, etagere, boite };
  }
}

export const archivageService = new ArchivageService();

