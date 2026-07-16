import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { courrierService } from '../services/courrierService';
import { categorieFichierService } from '../services/categorieFichierService';
import { formulaireCourrierService } from '../services/formulaireCourrierService';
import { archivageService } from '../services/archivageService';
import { laravelApiService } from '../services/laravelApiService';
import { userService } from '../services/userService';
import { Courrier, StatutCourrier, TypeCourrier, Role, SensCourrier, Priorite, Assignation } from '../types';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  Filler
} from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDatabase, 
  faHardDrive, 
  faExclamationTriangle, 
  faCheckCircle,
  faEllipsisV,
  faEye,
  faEdit,
  faTrash,
  faChevronLeft,
  faChevronRight,
  faSearch,
  faFilter,
  faTimes,
  faInbox,
  faClock,
  faUserCheck,
  faUserTie,
  faFileAlt,
  faArrowRight,
  faPlus,
  faSyncAlt,
  faTasks,
  faChartLine,
  faCalendarAlt,
  faPaperclip,
  faFilePdf,
  faFileWord,
  faFileExcel,
  faFileImage,
  faFileArchive,
  faFolderOpen,
  faEnvelope,
  faEnvelopeOpenText,
  faArrowDown,
  faArrowUp
} from '@fortawesome/free-solid-svg-icons';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

const centerTextDoughnutPlugin = {
  id: 'centerTextDoughnut' as const,
  afterDraw(chart: any) {
    if (chart.config.type !== 'pie' || !chart.chartArea) return;
    const ds = chart.data.datasets?.[0];
    if (!ds?.data?.length) return;
    const total = (ds.data as number[]).reduce((a: number, b: number) => a + b, 0);
    const { left, right, top, bottom } = chart.chartArea;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const ctx = chart.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(String(total), cx, cy - 6);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('total courriers', cx, cy + 16);
    ctx.restore();
  }
};
ChartJS.register(centerTextDoughnutPlugin);

interface StorageInfo {
  totalSize: number;
  usedSize: number;
  availableSize: number;
  usagePercent: number;
  items: Array<{ type: string; extension: string; count: number; size: number; percentage: number }>;
}

const Dashboard: React.FC = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    enAttente: 0,
    enTraitement: 0,
    assignes: 0,
    traites: 0,
    enregistres: 0,
    archives: 0,
    orientesDirecteurs: 0,
    urgent: 0,
    internes: 0,
    externes: 0,
    entrants: 0,
    sortants: 0
  });
  const [recentCourriers, setRecentCourriers] = useState<Courrier[]>([]);
  const [mesTaches, setMesTaches] = useState(0);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [evolutionRange, setEvolutionRange] = useState<'year' | 'month' | 'week' | 'day'>('week');
  const [evolutionChartType, setEvolutionChartType] = useState<'bar' | 'line'>('line');
  
  // Cache pour optimiser les requêtes
  const cacheRef = useRef<Map<string, any>>(new Map());

  // Fonction pour vérifier si l'action requise a déjà été effectuée (avec cache)
  const checkActionCompleted = useCallback(async (courrierId: string, userRole: string): Promise<{completed: boolean, action: string, currentStatus: string}> => {
    const cacheKey = `action-${courrierId}-${userRole}`;
    const cached = cacheRef.current.get(cacheKey);
    
    // Cache valide pendant 30 secondes
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }
    
    try {
      const courrier = await courrierService.getCourrierById(courrierId);
      
      if (!courrier) {
        const result = {
          completed: false,
          action: 'Inconnue',
          currentStatus: 'COURRIER_NON_TROUVE'
        };
        cacheRef.current.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
      
      let result;
      switch (userRole) {
        case Role.SECRETAIRE:
          const hasDirection = courrier.direction && courrier.direction !== '';
          const isOriented = courrier.statut.includes('ORIENTE') || 
                             courrier.statut.includes('ASSIGNE') || 
                             hasDirection;
          
          let actionType = 'Orientation';
          if (hasDirection) {
            actionType = 'Orientation vers Direction';
          }
          
          result = {
            completed: !!isOriented,
            action: actionType,
            currentStatus: courrier.statut as string
          };
          break;
          
        default:
          result = {
            completed: false,
            action: 'Inconnue',
            currentStatus: courrier.statut as string
          };
      }
      
      cacheRef.current.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Erreur vérification statut courrier:', error);
      const result = {
        completed: false,
        action: 'Inconnue',
        currentStatus: StatutCourrier.ENREGISTRE
      };
      cacheRef.current.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  }, []);

  // Fonction pour charger les rappels selon l'organigramme (optimisée)
  const getRappelsVisiblesByAccessLevel = useCallback(async (currentUser: any): Promise<Assignation[]> => {
    const cacheKey = `assignations-${currentUser.id}-${currentUser.role}`;
    const cached = cacheRef.current.get(cacheKey);
    
    // Cache valide pendant 15 secondes
    if (cached && Date.now() - cached.timestamp < 15000) {
      return cached.data;
    }
    
    let allAssignations: Assignation[] = [];

    switch (currentUser.role) {
      case Role.SECRETAIRE:
        console.log(`📋 [Secrétaire] Dashboard: Chargement des assignations selon l'organigramme`);
        try {
          // Charger les assignations personnelles d'abord
          const userAssignations = await courrierService.loadAssignationsByUser(currentUser.id);
          allAssignations = [...userAssignations];
          
          // Charger les assignations des autres utilisateurs de la même direction (limité)
          if (currentUser.direction) {
            console.log(`📋 [Secrétaire] Dashboard: Chargement pour la direction: ${currentUser.direction}`);
            
            const allUsers = userService.getAllUsers();
            const usersInSameDirection = allUsers.filter(u => 
              u.id !== currentUser.id && 
              u.direction === currentUser.direction
            );
            
            // Limiter à 3 utilisateurs maximum pour éviter la surcharge
            const limitedUsers = usersInSameDirection.slice(0, 3);
            
            const assignationPromises = limitedUsers.map(async (user) => {
              try {
                const userAssignations = await courrierService.loadAssignationsByUser(user.id);
                return userAssignations;
              } catch (error) {
                console.warn(`⚠️ Erreur chargement assignations pour ${user.nom}:`, error);
                return [];
              }
            });
            
            const allOtherAssignations = await Promise.all(assignationPromises);
            allOtherAssignations.forEach(assignations => {
              allAssignations.push(...assignations);
            });
          }
        } catch (error) {
          console.warn('Erreur chargement assignations Secrétaire:', error);
          allAssignations = [];
        }
        break;
        
      default:
        console.log(`👤 [${currentUser.role}] Dashboard: Chargement personnel uniquement`);
        try {
          allAssignations = await courrierService.loadAssignationsByUser(currentUser.id);
        } catch (error) {
          console.warn('Erreur chargement assignations personnelles:', error);
          allAssignations = [];
        }
        break;
    }
    
    // Filtrer pour éviter les doublons et ne garder que les assignations actives
    const filteredAssignations = allAssignations
      .filter((a: Assignation) => a.statut !== 'TERMINE')
      .filter((assignation, index, self) =>
        index === self.findIndex((a) => a.id === assignation.id)
      );
    
    cacheRef.current.set(cacheKey, { data: filteredAssignations, timestamp: Date.now() });
    return filteredAssignations;
  }, []);
  const [evolutionData, setEvolutionData] = useState<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
  const [allCourriers, setAllCourriers] = useState<Courrier[]>([]);
  const [selectedCourriers, setSelectedCourriers] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<StatutCourrier | ''>('');
  const [filterType, setFilterType] = useState<TypeCourrier | ''>('');
  const [formConfig, setFormConfig] = useState(formulaireCourrierService.getConfig());

  useEffect(() => {
    if (!user) return; // Attendre que l'utilisateur soit chargé
    
    const loadData = async () => {
      try {
        await loadStats();
      } catch (error) {
        console.error('Erreur lors du chargement des données du dashboard:', error);
      }
    };
    
    loadData();
    loadStorageInfo();
    
    // Charger la configuration du formulaire
    const config = formulaireCourrierService.getConfig();
    setFormConfig(config);
    
    // Recharger depuis Firestore en arrière-plan pour avoir la dernière version
    formulaireCourrierService.getConfigAsync().then(updatedConfig => {
      if (JSON.stringify(updatedConfig) !== JSON.stringify(config)) {
        setFormConfig(updatedConfig);
      }
    }).catch(() => {
      // En cas d'erreur, garder la configuration locale
    });
  }, [user]);

  const loadStats = async () => {
    if (!user) return;
    setLoading(true);
    setLoadingTasks(true);

    try {
      // ── Phase 0 : forcer le rechargement depuis l'API pour éviter d'hériter
      // des données d'une session précédente (ex: connexion secrétaire → DG) ──
      if (laravelApiService.isConfigured()) {
        try {
          const { store } = await import('../store/store');
          const { fetchCourriers } = await import('../store/slices/courriersSlice');
          await store.dispatch(fetchCourriers(undefined));
        } catch {
          // En cas d'échec, on continue avec les données en cache
        }
      }

      // ── Phase 1 : courriers + stats (critique, aff. immédiat) ────────────
      const courriers = await courrierService.getAccessibleCourriers(user.id, user);
      const uniqueCourriers = courriers.filter((c, i, self) =>
        i === self.findIndex(x => x.id === c.id)
      );

      const computedStats = {
        total:        uniqueCourriers.length,
        // En attente inclut EN_ATTENTE_DG, ORIENTE_DG, ORIENTE_DIRECTEUR (courriers en attente de traitement)
        enAttente:    uniqueCourriers.filter(c =>
          c.statut === StatutCourrier.EN_ATTENTE_DG ||
          c.statut === StatutCourrier.ORIENTE_DG ||
          c.statut === StatutCourrier.ORIENTE_DIRECTEUR
        ).length,
        orientesDirecteurs: uniqueCourriers.filter(c => c.statut === StatutCourrier.ORIENTE_DIRECTEUR).length,
        enTraitement: uniqueCourriers.filter(c => c.statut === StatutCourrier.EN_TRAITEMENT).length,
        assignes:     uniqueCourriers.filter(c => c.statut === StatutCourrier.ASSIGNE).length,
        traites:      uniqueCourriers.filter(c => c.statut === StatutCourrier.TRAITE).length,
        enregistres:  uniqueCourriers.filter(c => c.statut === StatutCourrier.ENREGISTRE).length,
        archives:     uniqueCourriers.filter(c => c.statut === StatutCourrier.ARCHIVE).length,
        urgent:       uniqueCourriers.filter(c => c.priorite === Priorite.URGENTE || c.priorite === Priorite.HAUTE).length,
        internes:     uniqueCourriers.filter(c => c.type === TypeCourrier.INTERNE).length,
        externes:     uniqueCourriers.filter(c => c.type === TypeCourrier.EXTERNE).length,
        entrants:     uniqueCourriers.filter(c => resolveCourrierSens(c) === SensCourrier.ENTRANT).length,
        sortants:     uniqueCourriers.filter(c => resolveCourrierSens(c) === SensCourrier.SORTANT).length,
      };

      setStats(computedStats);
      setRecentCourriers(uniqueCourriers);
      setAllCourriers(uniqueCourriers);

      // Fin Phase 1 → le skeleton disparaît, le contenu s'affiche
      setLoading(false);

      // ── Phase 2 : tâches/assignations (arrière-plan) ────────────────────
      try {
        const allAssignations = await getRappelsVisiblesByAccessLevel(user);
        const withActions = await Promise.all(
          allAssignations.map(async (a) => {
            try {
              const check = await checkActionCompleted(a.courrierId, user?.role || '');
              return { ...a, actionCompleted: check.completed };
            } catch {
              return { ...a, actionCompleted: false };
            }
          })
        );
        setMesTaches(withActions.filter(a => !a.actionCompleted).length);
      } catch {
        setMesTaches(0);
      } finally {
        setLoadingTasks(false);
      }

    } catch (error) {
      console.error('❌ Dashboard: Erreur stats:', error);
      setStats({ total: 0, enAttente: 0, enTraitement: 0, assignes: 0, traites: 0, enregistres: 0, archives: 0, orientesDirecteurs: 0, urgent: 0, internes: 0, externes: 0, entrants: 0, sortants: 0 });
      setRecentCourriers([]);
      setMesTaches(0);
      setLoadingTasks(false);
    } finally {
      setLoading(false);
    }
  };

  const loadStorageInfo = async () => {
    try {
      if (!laravelApiService.isConfigured()) {
        setStorageInfo(null);
        return;
      }
      
      console.log('🔄 Dashboard: Chargement du stockage...');
      
      // Récupérer les courriers accessibles
      const accessibleCourriers = user 
        ? await courrierService.getAccessibleCourriers(user.id, user)
        : [];
      console.log('📊 Dashboard: Courriers accessibles pour stockage:', accessibleCourriers.length);
      
      // Calculer les stats avec répartition par type
      let totalSize = 0;
      let totalFiles = 0;
      const extensionMap = new Map<string, { count: number; size: number }>();
      
      console.log('📁 Dashboard: Chargement des fichiers pour', accessibleCourriers.length, 'courriers...');
      
      for (const courrier of accessibleCourriers) {
        try {
          const fichiers = await categorieFichierService.getCategoriesFichiersByCourrier(courrier.id);
          if (fichiers.length > 0) {
            console.log(`📄 Courrier ${courrier.id}: ${fichiers.length} fichier(s)`);
          }
          for (const file of fichiers) {
            totalSize += file.taille || 0;
            totalFiles++;
            
            const extension = file.nom?.split('.').pop()?.toLowerCase() || 'autre';
            if (!extensionMap.has(extension)) {
              extensionMap.set(extension, { count: 0, size: 0 });
            }
            const data = extensionMap.get(extension)!;
            data.count++;
            data.size += file.taille || 0;
          }
        } catch (error) {
          console.warn(`⚠️ Erreur chargement fichiers pour courrier ${courrier.id}:`, error);
        }
      }
      
      console.log('📊 Dashboard: Répartition fichiers:', { totalFiles, totalSize, types: Array.from(extensionMap.keys()) });
      
      const quota = 1073741824; // 1GB
      const usagePercent = quota > 0 ? (totalSize / quota) * 100 : 0;

      const items = Array.from(extensionMap.entries())
        .map(([extension, data]) => ({
          type: getFileTypeName(extension),
          extension,
          count: data.count,
          size: data.size,
          percentage: totalSize > 0 ? (data.size / totalSize) * 100 : 0,
        }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 10);

      setStorageInfo({
        totalSize,
        usedSize: totalSize,
        availableSize: Math.max(0, quota - totalSize),
        usagePercent,
        items,
      });
      
      console.log('✅ Dashboard: Stockage chargé avec répartition:', { totalSize, totalFiles, usagePercent, typesCount: items.length });
    } catch (error) {
      console.error('❌ Dashboard: Erreur stockage:', error);
      setStorageInfo(null);
    }
  };

  const getFileTypeName = (extension: string): string => {
    const typeMap: { [key: string]: string } = {
      'pdf': 'PDF',
      'doc': 'Word',
      'docx': 'Word',
      'xls': 'Excel',
      'xlsx': 'Excel',
      'ppt': 'PowerPoint',
      'pptx': 'PowerPoint',
      'jpg': 'Image',
      'jpeg': 'Image',
      'png': 'Image',
      'gif': 'Image',
      'txt': 'Texte',
      'rtf': 'Texte',
      'zip': 'Archive',
      'rar': 'Archive',
      '7z': 'Archive',
      'mp4': 'Vidéo',
      'avi': 'Vidéo',
      'mp3': 'Audio',
      'wav': 'Audio'
    };
    return typeMap[extension.toLowerCase()] || extension.toUpperCase() || 'Autre';
  };

  const getCourrierDate = (courrier: Courrier): Date | null => {
    const value = courrier.dateReception || courrier.dateEnregistrement;
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date;
  };

  const buildEvolutionData = (range: 'year' | 'month' | 'week' | 'day') => {
    const now = new Date();
    // Fin de plage = date du jour (début de journée à 00:00) pour que "aujourd'hui" soit toujours la dernière période
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const labels: string[] = [];
    const data: number[] = [];
    const counts = new Map<string, number>();

    allCourriers.forEach(courrier => {
      const date = getCourrierDate(courrier);
      if (!date) return;
      let key = '';

      if (range === 'year') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (range === 'month' || range === 'week') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}`;
      }

      counts.set(key, (counts.get(key) || 0) + 1);
    });

    if (range === 'year') {
      // 12 mois : du mois il y a 11 mois au mois en cours (inclus)
      for (let i = 11; i >= 0; i--) {
        const date = new Date(todayStart.getFullYear(), todayStart.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        labels.push(date.toLocaleDateString('fr-FR', { month: 'short' }));
        data.push(counts.get(key) || 0);
      }
    } else if (range === 'month') {
      // 30 jours : de (aujourd'hui - 29) à aujourd'hui (inclus)
      for (let i = 29; i >= 0; i--) {
        const date = new Date(todayStart);
        date.setDate(todayStart.getDate() - i);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        labels.push(date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }));
        data.push(counts.get(key) || 0);
      }
    } else if (range === 'week') {
      // 7 jours : de (aujourd'hui - 6) à aujourd'hui (inclus)
      for (let i = 6; i >= 0; i--) {
        const date = new Date(todayStart);
        date.setDate(todayStart.getDate() - i);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        labels.push(date.toLocaleDateString('fr-FR', { weekday: 'short' }));
        data.push(counts.get(key) || 0);
      }
    } else {
      // Jour : aujourd'hui uniquement, 24 créneaux (0h à 23h) — la date en cours est directement considérée
      for (let h = 0; h < 24; h++) {
        const key = `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, '0')}-${String(todayStart.getDate()).padStart(2, '0')} ${String(h).padStart(2, '0')}`;
        labels.push(`${String(h).padStart(2, '0')}h`);
        data.push(counts.get(key) || 0);
      }
    }

    return { labels, data };
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleSelectAll = () => {
    if (selectedCourriers.size === paginatedCourriers.length) {
      setSelectedCourriers(new Set());
    } else {
      setSelectedCourriers(new Set(paginatedCourriers.map(c => c.id)));
    }
  };

  const handleSelectCourrier = (courrierId: string) => {
    const newSelected = new Set(selectedCourriers);
    if (newSelected.has(courrierId)) {
      newSelected.delete(courrierId);
    } else {
      newSelected.add(courrierId);
    }
    setSelectedCourriers(newSelected);
  };

  const handleDeleteCourrier = (courrierId: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce courrier ?')) {
      console.log('Suppression du courrier:', courrierId);
      setOpenDropdown(null);
    }
  };

  const filteredCourriers = recentCourriers.filter(courrier => {
    const matchesSearch = searchTerm === '' || 
      courrier.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      courrier.objet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      courrier.expediteur.toLowerCase().includes(searchTerm.toLowerCase()) ||
      courrier.destinataire.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatut = filterStatut === '' || courrier.statut === filterStatut;
    const matchesType = filterType === '' || courrier.type === filterType;

    return matchesSearch && matchesStatut && matchesType;
  });

  const totalPages = Math.ceil(filteredCourriers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCourriers = filteredCourriers.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatut, filterType]);

  useEffect(() => {
    setEvolutionData(buildEvolutionData(evolutionRange));
  }, [evolutionRange, allCourriers]);

  const getAvailabilityKey = (sens: SensCourrier, type: TypeCourrier) => `${sens}:${type}`;

  const resolveCourrierSens = (courrier: Courrier): SensCourrier =>
    courrier.sens || SensCourrier.ENTRANT;

  // Date de réception dynamique (aligné sur ListeCourriers)
  const getDynamicReceptionDateValue = (courrier: Courrier): any => {
    try {
      const sections = formConfig?.[resolveCourrierSens(courrier)]?.[courrier.type] || [];
      const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const allFields = sections.flatMap(sec => (sec.columns || []).flatMap(col => col.fields || []));
      const candidate = allFields.find(f => {
        const name = normalize(f.name || '');
        const label = normalize(f.label || '');
        const isDateType = (f.type === 'datetime') || name.includes('date') || label.includes('date');
        const isReception = name.includes('reception') || label.includes('reception');
        return isDateType && isReception;
      });
      if (candidate && candidate.name) {
        const val = courrier.extraFields?.[candidate.name];
        if (val) return val;
      }
      const commonKeys = ['dateReception', 'date_reception', 'dateReceptionCourrier', 'date_reception_courrier'];
      for (const key of commonKeys) {
        const v = courrier.extraFields?.[key as keyof typeof courrier.extraFields];
        if (v) return v;
      }
    } catch {}
    return undefined;
  };

  // Fonction pour obtenir toutes les colonnes dynamiques unifiées (sans doublons)
  const getAllTableColumns = (): Array<{ 
    id: string; 
    name: string; 
    label: string; 
    type?: string; 
    icon?: string; 
    order?: number;
    availableIn: Set<string>; // Sens+type pour lesquels ce champ est disponible
  }> => {
    const sensList = [SensCourrier.ENTRANT, SensCourrier.SORTANT];
    const typeList = filterType ? [filterType as TypeCourrier] : [TypeCourrier.EXTERNE, TypeCourrier.INTERNE];
    
    // Map pour éviter les doublons basés sur le nom du champ
    // Si un champ existe dans les deux types avec le même nom, on crée une seule entrée
    const fieldMap = new Map<string, { 
      id: string; 
      name: string; 
      label: string; 
      type?: string; 
      icon?: string; 
      order?: number;
      availableIn: Set<string>;
    }>();
    
    sensList.forEach(sens => {
      typeList.forEach(type => {
        const availabilityKey = getAvailabilityKey(sens, type);
        const fields = getTableFields(sens, type);
        fields.forEach(field => {
          if (!field.name) return;
          if (!fieldMap.has(field.name)) {
            fieldMap.set(field.name, {
              ...field,
              availableIn: new Set([availabilityKey])
            });
            return;
          }
          const existing = fieldMap.get(field.name)!;
          existing.availableIn.add(availabilityKey);
          // Prendre l'ordre le plus petit pour les champs communs
          if ((field.order || 0) < (existing.order || 0)) {
            fieldMap.set(field.name, {
              ...field,
              availableIn: existing.availableIn
            });
          }
        });
      });
    });
    
    // Convertir en tableau et trier par ordre (le filtrage des champs de base se fera à l'affichage)
    return Array.from(fieldMap.values())
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  // Fonction pour obtenir les champs dynamiques pertinents pour le tableau
  const getTableFields = (sens: SensCourrier, type: TypeCourrier) => {
    const config = formConfig?.[sens]?.[type] || [];
    const tableFields: Array<{ id: string; name: string; label: string; type?: string; icon?: string; order?: number }> = [];
    
    // Champs de base à exclure (déjà affichés dans les colonnes principales)
    const CORE_FIELDS = ['type', 'expediteur', 'destinataire', 'objet'];
    
    // Types de champs à exclure par défaut du tableau
    const excludedTypes = ['textarea', 'file'];
    
    // Parcourir les sections et colonnes dans l'ordre pour préserver l'ordre du formulaire
    config.forEach((section, sectionIndex) => {
      section.columns.forEach((column, columnIndex) => {
        column.fields.forEach((field, fieldIndex) => {
          // Vérifier si le champ doit être affiché dans le tableau
          const shouldShowInTable = field.showInTable !== false; // Par défaut true sauf si explicitement false
          const isExcludedType = field.type && excludedTypes.includes(field.type);
          const isCoreField = field.name && CORE_FIELDS.includes(field.name);
          
          // Inclure le champ si :
          // 1. showInTable n'est pas false ET
          // 2. Le type n'est pas dans la liste des types exclus
          // 3. Le champ n'est pas un champ de base (pour éviter les doublons)
          if (shouldShowInTable && !isExcludedType && !isCoreField && field.type) {
            // Calculer un ordre basé sur la position dans le formulaire
            const order = (sectionIndex * 1000) + (columnIndex * 100) + fieldIndex;
            tableFields.push({
              id: field.id,
              name: field.name,
              label: field.label,
              type: field.type,
              icon: field.icon,
              order: order
            });
          }
        });
      });
    });
    
    // Trier par ordre pour respecter l'ordre du formulaire
    return tableFields.sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  // Helper pour obtenir la valeur d'un champ dynamique d'un courrier
  const getFieldValue = (courrier: Courrier, fieldName: string): string => {
    const extraFields = courrier.extraFields || {};
    const value = extraFields[fieldName];
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  // Fonction pour formater la valeur d'un champ
  const formatFieldValue = (value: any, fieldType?: string): string => {
    if (value === null || value === undefined || value === '') return '-';
    
    if (fieldType === 'datetime') {
      try {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return '-';
      }
    }
    
    if (fieldType === 'checkbox') {
      if (Array.isArray(value)) {
        return value.filter(Boolean).join(', ') || '-';
      }
      return value ? 'Oui' : 'Non';
    }
    
    return String(value);
  };

// Fonction pour obtenir la couleur du statut
const getStatutColor = (statut: StatutCourrier) => {
switch (statut) {
case StatutCourrier.TRAITE:
return 'bg-emerald-100 text-emerald-800 border border-emerald-200/50';
case StatutCourrier.ASSIGNE:
return 'bg-violet-100 text-violet-800 border border-violet-200/50';
case StatutCourrier.EN_TRAITEMENT:
return 'bg-blue-100 text-blue-800 border border-blue-200/50';
case StatutCourrier.EN_ATTENTE_DG:
return 'bg-amber-100 text-amber-800 border border-amber-200/50';
case StatutCourrier.ARCHIVE:
return 'bg-slate-100 text-slate-600 border border-slate-200/50';
default:
return 'bg-slate-100 text-slate-700 border border-slate-200/50';
}
};

const getPrioriteColor = (priorite: Priorite) => {
switch (priorite) {
case Priorite.URGENTE:
return 'bg-red-100 text-red-700 border border-red-200/50';
case Priorite.HAUTE:
return 'bg-orange-100 text-orange-700 border border-orange-200/50';
case Priorite.NORMALE:
return 'bg-sky-100 text-sky-700 border border-sky-200/50';
default:
return 'bg-slate-100 text-slate-600 border border-slate-200/50';
}
};

const getTypeColor = (type: TypeCourrier) => {
return type === TypeCourrier.EXTERNE
? 'bg-cyan-100 text-cyan-700 border border-cyan-200/50'
: 'bg-teal-100 text-teal-700 border border-teal-200/50';
};

const formatReceptionDate = (courrier: Courrier) => {
let val: any = getDynamicReceptionDateValue(courrier);
if (!val) val = courrier.dateReception || courrier.dateEnregistrement;
if (!val) return '—';
const d = new Date(val);
if (isNaN(d.getTime())) return '—';
return d.toLocaleString('fr-FR', {
day: '2-digit',
month: '2-digit',
year: 'numeric',
hour: '2-digit',
minute: '2-digit'
});
};

  // Fonction pour obtenir l'icône du fichier
  const getFileIcon = (extension?: string, fichier?: string) => {
    if (!extension && fichier) {
      extension = fichier.split('.').pop()?.toLowerCase();
    }
    
    if (!extension) return faFileAlt;
    
    switch (extension.toLowerCase()) {
      case 'pdf':
        return faFilePdf;
      case 'doc':
      case 'docx':
        return faFileWord;
      case 'xls':
      case 'xlsx':
        return faFileExcel;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'svg':
        return faFileImage;
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return faFileArchive;
      default:
        return faFileAlt;
    }
  };

  // Fonction pour obtenir le fichier principal d'un courrier
  const getMainFile = (courrier: Courrier): string | null => {
    if (courrier.categorieFichiers && courrier.categorieFichiers.length > 0) {
      const fichiers = courrier.categorieFichiers.filter(df => df.type === 'fichier');
      if (fichiers.length > 0) {
        return fichiers[0].nom;
      }
    }
    return null;
  };

  const getAttachmentCounts = (courrier: Courrier) => {
    const items = courrier.categorieFichiers || [];
    const dossierCount = items.filter(df => df.type === 'categorie').length;
    const fileCount = items.filter(df => df.type === 'fichier').length;
    return { dossierCount, fileCount };
  };

  // Fonction pour obtenir l'icône par nom
  const getIconByName = (iconName: string) => {
    const iconMap: { [key: string]: any } = {
      'user': faUserCheck,
      'calendar': faCalendarAlt,
      'file': faFileAlt,
      'clock': faClock,
      'inbox': faInbox,
    };
    return iconMap[iconName] || faFileAlt;
  };

  // ── Skeleton preloader ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-8">
        {/* Header skeleton */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="skeleton w-14 h-14 rounded-2xl" />
            <div>
              <div className="skeleton h-8 w-64 rounded-xl" />
              <div className="skeleton h-4 w-48 rounded-lg mt-2" />
            </div>
          </div>
          <div className="skeleton h-11 w-44 rounded-xl" />
        </div>

        {/* Tasks banner skeleton */}
        <div className="skeleton rounded-2xl h-24" />

        {/* Stat cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm overflow-hidden">
              <div className="flex items-start justify-between mb-4">
                <div className="skeleton w-12 h-12 rounded-xl" />
                <div className="skeleton h-6 w-10 rounded-lg" />
              </div>
              <div className="skeleton h-8 w-14 rounded-lg" />
              <div className="skeleton h-3.5 w-28 rounded-lg mt-2" />
              <div className="skeleton h-1.5 w-full rounded-full mt-3" />
            </div>
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="skeleton h-20 rounded-none" />
              <div className="p-6">
                <div className="skeleton h-52 rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="skeleton h-20 rounded-none" />
          <div className="px-6 py-4 border-b border-slate-100 flex gap-4">
            <div className="skeleton h-10 flex-1 rounded-xl" />
            <div className="skeleton h-10 w-36 rounded-xl" />
            <div className="skeleton h-10 w-32 rounded-xl" />
          </div>
          <div className="divide-y divide-slate-50">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4">
                <div className="skeleton w-4 h-4 rounded" />
                <div className="skeleton w-10 h-10 rounded-lg flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="skeleton h-4 w-32 rounded-lg" />
                  <div className="skeleton h-3 w-56 rounded-lg" />
                  <div className="flex gap-1.5">
                    <div className="skeleton h-4 w-16 rounded" />
                    <div className="skeleton h-4 w-14 rounded" />
                  </div>
                </div>
                <div className="hidden xl:block skeleton w-28 h-4 rounded-lg" />
                <div className="skeleton w-28 h-7 rounded-lg" />
                <div className="hidden lg:block skeleton w-16 h-5 rounded" />
                <div className="skeleton w-9 h-9 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  // ── Fin skeleton ───────────────────────────────────────────────────────────

  const statCards = [
    { label: 'Total Courriers',  value: stats.total,        icon: faInbox,       color: 'from-blue-500 to-blue-600',   bg: 'bg-blue-50',   text: 'text-blue-600',   bar: 'bg-blue-400',  pct: 100 },
    { label: 'En Attente DG',    value: stats.enAttente,    icon: faClock,        color: 'from-amber-400 to-amber-500', bg: 'bg-amber-50',  text: 'text-amber-600',  bar: 'bg-amber-400', pct: stats.total ? Math.round((stats.enAttente / stats.total) * 100) : 0 },
    { label: 'En Traitement',    value: stats.enTraitement, icon: faSyncAlt,      color: 'from-violet-500 to-violet-600', bg: 'bg-violet-50', text: 'text-violet-600', bar: 'bg-violet-400', pct: stats.total ? Math.round((stats.enTraitement / stats.total) * 100) : 0 },
    { label: 'Traités',          value: stats.traites,      icon: faCheckCircle,  color: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-400', pct: stats.total ? Math.round((stats.traites / stats.total) * 100) : 0 },
  ];

  // Carte supplémentaire pour les courriers orientés vers les directeurs (visible uniquement pour DG et SUPER_ADMIN)
  const orientesDirecteursCard = (user?.role === Role.DIRECTEUR_GENERAL || user?.role === Role.SUPER_ADMIN) ? [
    { label: 'Orientés Directeurs', value: stats.orientesDirecteurs, icon: faUserTie, color: 'from-purple-500 to-purple-600', bg: 'bg-purple-50', text: 'text-purple-600', bar: 'bg-purple-400', pct: stats.total ? Math.round((stats.orientesDirecteurs / stats.total) * 100) : 0 },
  ] : [];

  // Cartes pour le type et le sens des courriers
  const typeSensCards = [
    { label: 'Internes', value: stats.internes, icon: faEnvelopeOpenText, color: 'from-teal-500 to-teal-600', bg: 'bg-teal-50', text: 'text-teal-600', bar: 'bg-teal-400', pct: stats.total ? Math.round((stats.internes / stats.total) * 100) : 0 },
    { label: 'Externes', value: stats.externes, icon: faEnvelope, color: 'from-cyan-500 to-cyan-600', bg: 'bg-cyan-50', text: 'text-cyan-600', bar: 'bg-cyan-400', pct: stats.total ? Math.round((stats.externes / stats.total) * 100) : 0 },
    { label: 'Entrants', value: stats.entrants, icon: faArrowDown, color: 'from-indigo-500 to-indigo-600', bg: 'bg-indigo-50', text: 'text-indigo-600', bar: 'bg-indigo-400', pct: stats.total ? Math.round((stats.entrants / stats.total) * 100) : 0 },
    { label: 'Sortants', value: stats.sortants, icon: faArrowUp, color: 'from-violet-500 to-violet-600', bg: 'bg-violet-50', text: 'text-violet-600', bar: 'bg-violet-400', pct: stats.total ? Math.round((stats.sortants / stats.total) * 100) : 0 },
  ];

  const pieData = {
    labels: ['En attente DG', 'En traitement', 'Assignés', 'Traités', 'Enregistrés', 'Archivés'],
    datasets: [
      {
        data: [
          stats.enAttente,
          stats.enTraitement,
          stats.assignes,
          stats.traites,
          stats.enregistres,
          stats.archives
        ],
        backgroundColor: [
          'rgba(147, 197, 253, 0.95)',
          'rgba(96, 165, 250, 0.95)',
          'rgba(59, 130, 246, 0.95)',
          'rgba(37, 99, 235, 0.95)',
          'rgba(148, 163, 184, 0.95)',
          'rgba(100, 116, 139, 0.95)'
        ],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 12,
        hoverBorderWidth: 4
      }
    ]
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 1200
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        padding: 14,
        displayColors: true,
        callbacks: {
          label: (ctx: any) => {
            const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
            const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
          }
        }
      }
    }
  };

  const barData = {
    labels: evolutionData.labels,
    datasets: [
      {
        label: 'Courriers',
        data: evolutionData.data,
        backgroundColor: (context: any) => {
          const { chart } = context;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(59, 130, 246, 0.85)';
          const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          g.addColorStop(0, 'rgba(147, 197, 253, 0.9)');
          g.addColorStop(0.5, 'rgba(96, 165, 250, 0.95)');
          g.addColorStop(1, 'rgba(59, 130, 246, 0.95)');
          return g;
        },
        borderColor: 'rgba(59, 130, 246, 0.6)',
        borderWidth: 1,
        borderRadius: { topLeft: 8, topRight: 8 },
        borderSkipped: false
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000,
      delay: (ctx: { type?: string; dataIndex: number }) =>
        ctx.type === 'data' ? ctx.dataIndex * 45 : 0
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        padding: 12
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.15)', drawBorder: false },
        ticks: { stepSize: 1, color: '#64748b', font: { size: 12 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 11 }, maxRotation: 45 }
      }
    },
    layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } }
  };

  const lineData = {
    labels: evolutionData.labels,
    datasets: [
      {
        label: 'Courriers',
        data: evolutionData.data,
        borderColor: 'rgba(59, 130, 246, 0.9)',
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(59, 130, 246, 0.15)';
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0)');
          gradient.addColorStop(0.4, 'rgba(96, 165, 250, 0.2)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.45)');
          return gradient;
        },
        fill: true,
        tension: 0.35,
        pointBackgroundColor: 'rgba(59, 130, 246, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: 'rgba(37, 99, 235, 1)',
        pointHoverBorderWidth: 3
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    animation: {
      duration: 1000
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (ctx: any) => ` ${ctx.parsed.y} courrier${ctx.parsed.y !== 1 ? 's' : ''}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.12)', drawBorder: false },
        ticks: { stepSize: 1, color: '#64748b', font: { size: 12 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 11 }, maxRotation: 45 }
      }
    },
    layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 flex-shrink-0">
            <FontAwesomeIcon icon={faChartLine} className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Bonjour,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500">{user?.nom}</span>
            </h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <p className="text-slate-500 text-sm">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-100">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                {user?.role?.replace(/_/g, ' ')}
              </span>
              {user?.direction && <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">{user.direction}</span>}
            </div>
          </div>
        </div>
        {hasRole([Role.SECRETAIRE, Role.DIRECTEUR_GENERAL, Role.SUPER_ADMIN]) && (
          <Link to="/enregistrer" className="inline-flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 hover:-translate-y-0.5 transition-all group whitespace-nowrap">
            <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
            <span>Nouveau courrier</span>
            <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>

      {/* Bannière tâches */}
      {user && (hasRole([Role.SECRETAIRE, Role.DIRECTEUR_GENERAL, Role.SUPER_ADMIN, Role.DIRECTEUR])) && (
        <div className={`relative overflow-hidden rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border animate-slideInUp ${
          mesTaches > 0
            ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-amber-200/70 shadow-lg shadow-amber-100/60'
            : 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200/60 shadow-md shadow-emerald-100/40'
        }`} style={{ animationDelay: '240ms', animationFillMode: 'both' }}>
          <div className="absolute right-4 top-0 w-28 h-28 rounded-full opacity-[0.08] -translate-y-1/2 pointer-events-none" style={{ background: mesTaches > 0 ? '#f59e0b' : '#10b981' }} />
          <div className="flex items-center gap-4">
            <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 bg-gradient-to-br ${
              mesTaches > 0 ? 'from-amber-400 to-orange-500 shadow-amber-500/30' : 'from-emerald-400 to-teal-500 shadow-emerald-500/30'
            }`}>
              <FontAwesomeIcon icon={faTasks} className="w-6 h-6 text-white" />
              {mesTaches > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow">{mesTaches > 9 ? '9+' : mesTaches}</span>
              )}
            </div>
            <div>
              {loadingTasks ? (
                <>
                  <div className="skeleton h-5 w-48 rounded-lg" />
                  <div className="skeleton h-3.5 w-32 rounded-lg mt-2" />
                </>
              ) : mesTaches > 0 ? (
                <>
                  <h3 className="font-extrabold text-slate-900">
                    <span className="text-amber-600">{mesTaches}</span> tâche{mesTaches > 1 ? 's' : ''} en attente
                  </h3>
                  <p className="text-sm text-slate-600 mt-0.5">Des courriers nécessitent votre attention</p>
                </>
              ) : (
                <>
                  <h3 className="font-extrabold text-slate-900">Aucune tâche en attente</h3>
                  <p className="text-sm text-slate-600 mt-0.5">Votre file de travail est à jour</p>
                </>
              )}
            </div>
          </div>
          <Link
            to="/rappels"
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all group shadow-sm border ${
              mesTaches > 0
                ? 'bg-white border-amber-200 text-amber-700 hover:bg-amber-50'
                : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <span>Voir les rappels</span>
            <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      )}

      {/* Bloc combiné : Stats statut (Total/Attente/Traitement/Traités/Urgents/Orientés) + Évolution */}
      <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xl shadow-slate-200/40">
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <FontAwesomeIcon icon={faInbox} className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">État des courriers</h2>
              <p className="text-sm text-blue-100 mt-0.5">Vue d'ensemble par statut et évolution — <strong>{stats.total}</strong> courrier{stats.total !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl bg-white/15 p-1 border border-white/25">
            {[
              { id: 'year', label: 'Année' },
              { id: 'month', label: 'Mois' },
              { id: 'week', label: 'Semaine' },
              { id: 'day', label: 'Jour' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setEvolutionRange(item.id as 'year' | 'month' | 'week' | 'day')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  evolutionRange === item.id
                    ? 'bg-white text-slate-800 shadow-md'
                    : 'text-white/90 hover:bg-white/20'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Mini cartes statut à gauche */}
            <div className="flex-shrink-0 w-full lg:w-80">
              <div className="grid grid-cols-2 gap-3">
                {/* Total en grand */}
                <div className="col-span-2 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full" />
                  <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/5 rounded-full" />
                  <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">Total</p>
                  <p className="text-5xl font-extrabold text-white mt-1">{stats.total}</p>
                  <p className="text-blue-200 text-sm mt-1">courrier{stats.total !== 1 ? 's' : ''}</p>
                </div>
                {/* En Attente DG */}
                <div className="rounded-xl p-4 border border-amber-200 bg-amber-50 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-sm">
                      <FontAwesomeIcon icon={faClock} className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-bold text-amber-600">{stats.total ? Math.round((stats.enAttente / stats.total) * 100) : 0}%</span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">{stats.enAttente}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">En attente DG</p>
                </div>
                {/* En Traitement */}
                <div className="rounded-xl p-4 border border-violet-200 bg-violet-50 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-sm">
                      <FontAwesomeIcon icon={faSyncAlt} className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-bold text-violet-600">{stats.total ? Math.round((stats.enTraitement / stats.total) * 100) : 0}%</span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">{stats.enTraitement}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">En traitement</p>
                </div>
                {/* Urgents */}
                <div className="rounded-xl p-4 border border-red-200 bg-red-50 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-sm">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-bold text-red-600">{stats.total ? Math.round((stats.urgent / stats.total) * 100) : 0}%</span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">{stats.urgent}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">Urgents</p>
                </div>
                {/* Traités */}
                <div className="rounded-xl p-4 border border-emerald-200 bg-emerald-50 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
                      <FontAwesomeIcon icon={faCheckCircle} className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-bold text-emerald-600">{stats.total ? Math.round((stats.traites / stats.total) * 100) : 0}%</span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900">{stats.traites}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">Traités</p>
                </div>
                {/* Orientés Directeurs (si visible) */}
                {(user?.role === Role.DIRECTEUR_GENERAL || user?.role === Role.SUPER_ADMIN) && (
                  <div className="rounded-xl p-4 border border-purple-200 bg-purple-50 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm">
                        <FontAwesomeIcon icon={faUserTie} className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-xs font-bold text-purple-600">{stats.total ? Math.round((stats.orientesDirecteurs / stats.total) * 100) : 0}%</span>
                    </div>
                    <p className="text-2xl font-extrabold text-slate-900">{stats.orientesDirecteurs}</p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">Orientés directeurs</p>
                  </div>
                )}
              </div>
            </div>

            {/* Graphique d'évolution à droite */}
            <div className="flex-1 min-w-0">
              <div className="h-80">
                {evolutionData.data.some(d => d > 0) ? (
                  <Bar data={barData} options={barOptions} />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 font-medium text-sm">
                    Aucune donnée disponible
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bloc combiné : Type/Sens (Internes/Externes/Entrants/Sortants) */}
      <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xl shadow-slate-200/40">
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <FontAwesomeIcon icon={faChartLine} className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Répartition par type et sens</h2>
              <p className="text-sm text-blue-100 mt-0.5">Internes, Externes, Entrants, Sortants</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {typeSensCards.map((stat) => (
              <div key={stat.label} className={`rounded-xl p-4 border ${stat.bg.replace('bg-', 'border-').replace('-50', '-200')} shadow-sm`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md`}>
                    <FontAwesomeIcon icon={stat.icon} className="w-5 h-5 text-white" />
                  </div>
                  <span className={`text-sm font-bold ${stat.text}`}>{stat.pct}%</span>
                </div>
                <p className="text-3xl font-extrabold text-slate-900">{stat.value}</p>
                <p className="text-sm font-semibold text-slate-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graphique donut — répartition des statuts */}
      <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xl shadow-slate-200/40">
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700">
          <h2 className="text-lg font-bold text-white tracking-tight">Répartition des statuts</h2>
          <p className="text-sm text-blue-100 mt-0.5">Distribution par état — Total : {stats.total} courrier{stats.total !== 1 ? 's' : ''}</p>
        </div>
        <div className="p-6">
          {stats.total > 0 ? (
            <div className="flex items-center gap-8">
              <div className="w-52 h-52 flex-shrink-0">
                <Pie data={pieData} options={pieOptions} />
              </div>
              <div className="flex-1 space-y-4 min-w-0">
                {[
                  { label: 'En attente DG', value: stats.enAttente, color: 'bg-blue-300', pct: stats.total ? Math.round((stats.enAttente / stats.total) * 100) : 0 },
                  { label: 'En traitement', value: stats.enTraitement, color: 'bg-blue-400', pct: stats.total ? Math.round((stats.enTraitement / stats.total) * 100) : 0 },
                  { label: 'Assignés', value: stats.assignes, color: 'bg-blue-500', pct: stats.total ? Math.round((stats.assignes / stats.total) * 100) : 0 },
                  { label: 'Traités', value: stats.traites, color: 'bg-blue-600', pct: stats.total ? Math.round((stats.traites / stats.total) * 100) : 0 },
                  { label: 'Enregistrés', value: stats.enregistres, color: 'bg-slate-300', pct: stats.total ? Math.round((stats.enregistres / stats.total) * 100) : 0 },
                  { label: 'Archivés', value: stats.archives, color: 'bg-slate-500', pct: stats.total ? Math.round((stats.archives / stats.total) * 100) : 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${item.color} flex-shrink-0 shadow-sm`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-700 truncate">{item.label}</span>
                        <span className="text-sm font-bold text-slate-900 tabular-nums">{item.value} <span className="text-slate-400 font-normal">({item.pct}%)</span></span>
                      </div>
                      <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${item.color} transition-all duration-500`} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-52 text-slate-400 font-medium text-sm">
              Aucune donnée disponible
            </div>
          )}
        </div>
      </div>

      {/* État du stockage — jauge circulaire et répartition */}
      {storageInfo && (
        <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xl shadow-slate-200/40">
          <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <FontAwesomeIcon icon={faDatabase} className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">État du stockage</h2>
                <p className="text-sm text-blue-100 mt-0.5">Espace utilisé et répartition par type</p>
              </div>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${
              storageInfo.usagePercent < 70 
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' 
                : storageInfo.usagePercent < 90 
                ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30' 
                : 'bg-red-500/20 text-red-200 border border-red-400/30'
            }`}>
              {storageInfo.usagePercent < 70 ? (
                <FontAwesomeIcon icon={faCheckCircle} className="w-4 h-4" />
              ) : (
                <FontAwesomeIcon icon={faExclamationTriangle} className="w-4 h-4" />
              )}
              {storageInfo.usagePercent.toFixed(1)}% utilisé
            </div>
          </div>

          <div className="p-6">
            <div className="flex flex-col lg:flex-row gap-8 items-start">
              {/* Jauge circulaire */}
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="relative w-44 h-44">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(241 245 249)" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      strokeWidth="10"
                      strokeLinecap="round"
                      className={
                        storageInfo.usagePercent < 70 
                          ? 'stroke-emerald-500' 
                          : storageInfo.usagePercent < 90 
                          ? 'stroke-amber-500' 
                          : 'stroke-red-500'
                      }
                      strokeDasharray={`${Math.min(storageInfo.usagePercent, 100) * 2.64} 264`}
                      style={{ transition: 'stroke-dasharray 0.6s ease-out' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold text-slate-800 tabular-nums">
                      {storageInfo.usagePercent.toFixed(0)}%
                    </span>
                    <span className="text-xs font-medium text-slate-500 mt-0.5">utilisé</span>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <div className="text-sm font-bold text-slate-800">
                    {formatBytes(storageInfo.usedSize)}
                    <span className="text-slate-400 font-normal"> / {formatBytes(storageInfo.totalSize)}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Espace disponible : {formatBytes(storageInfo.availableSize)}</div>
                </div>
              </div>

              {/* Barre linéaire + répartition par type */}
              <div className="flex-1 min-w-0 w-full">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="text-slate-600 font-semibold">Répartition par type de fichier</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        storageInfo.usagePercent < 70 
                          ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' 
                          : storageInfo.usagePercent < 90 
                          ? 'bg-gradient-to-r from-amber-400 to-amber-600' 
                          : 'bg-gradient-to-r from-red-400 to-red-600'
                      }`}
                      style={{ width: `${Math.min(storageInfo.usagePercent, 100)}%` }}
                    />
                  </div>
                </div>

                {storageInfo.items.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                      {storageInfo.items.slice(0, 5).map((item, index) => {
                        const pct = storageInfo.usedSize > 0 ? (item.size / storageInfo.usedSize) * 100 : 0;
                        const icon = item.extension === 'pdf' ? faFilePdf : item.extension === 'doc' || item.extension === 'docx' ? faFileWord : item.extension === 'xls' || item.extension === 'xlsx' ? faFileExcel : item.extension.match(/jpg|jpeg|png|gif/) ? faFileImage : item.extension.match(/zip|rar|7z/) ? faFileArchive : faFileAlt;
                        const iconColor = item.extension === 'pdf' ? 'text-red-600' : item.extension === 'doc' || item.extension === 'docx' ? 'text-blue-600' : item.extension === 'xls' || item.extension === 'xlsx' ? 'text-emerald-600' : 'text-slate-600';
                        return (
                          <div
                            key={`${item.extension}-${index}`}
                            className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <FontAwesomeIcon icon={icon} className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
                              <span className="text-xs font-bold text-slate-600 uppercase truncate">.{item.extension}</span>
                            </div>
                            <div className="text-xl font-extrabold text-slate-900 tabular-nums">{item.count}</div>
                            <div className="text-xs font-medium text-slate-500 mt-0.5">{formatBytes(item.size)}</div>
                            <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="text-[10px] font-semibold text-slate-400 mt-1">{pct.toFixed(0)}% du total</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Graphique Doughnut — répartition par type de fichier */}
                    {(() => {
                      const FILE_PALETTE = [
                        'rgba(239,68,68,0.85)',
                        'rgba(59,130,246,0.85)',
                        'rgba(16,185,129,0.85)',
                        'rgba(245,158,11,0.85)',
                        'rgba(139,92,246,0.85)',
                        'rgba(20,184,166,0.85)',
                        'rgba(236,72,153,0.85)',
                        'rgba(99,102,241,0.85)',
                        'rgba(234,179,8,0.85)',
                        'rgba(148,163,184,0.85)',
                      ];
                      const topItems = storageInfo.items.slice(0, 8);
                      const fileTypeChartData = {
                        labels: topItems.map(i => `${i.type} (.${i.extension})`),
                        datasets: [{
                          data: topItems.map(i => i.count),
                          backgroundColor: topItems.map((_, idx) => FILE_PALETTE[idx % FILE_PALETTE.length]),
                          borderColor: '#ffffff',
                          borderWidth: 3,
                          hoverOffset: 10,
                          hoverBorderWidth: 4,
                        }],
                      };
                      const fileTypeChartOptions = {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '58%',
                        animation: { animateRotate: true, animateScale: true, duration: 900 },
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            backgroundColor: 'rgba(15,23,42,0.95)',
                            titleColor: '#ffffff',
                            bodyColor: '#e2e8f0',
                            borderColor: 'rgba(255,255,255,0.2)',
                            borderWidth: 1,
                            padding: 12,
                            callbacks: {
                              label: (ctx: any) => {
                                const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
                                const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                                return ` ${ctx.raw} fichier${ctx.raw !== 1 ? 's' : ''} (${pct}%)`;
                              }
                            }
                          }
                        }
                      };
                      const totalFileCount = topItems.reduce((sum, i) => sum + i.count, 0);
                      return (
                        <div className="mt-6 pt-5 border-t border-slate-100">
                          <p className="text-sm font-semibold text-slate-600 mb-4">Graphique par type de fichier</p>
                          <div className="flex flex-col sm:flex-row items-center gap-6">
                            <div className="relative w-44 h-44 flex-shrink-0">
                              <Pie data={fileTypeChartData} options={fileTypeChartOptions} />
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-extrabold text-slate-800 tabular-nums">{totalFileCount}</span>
                                <span className="text-[11px] font-medium text-slate-500 mt-0.5">fichiers</span>
                              </div>
                            </div>
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 w-full">
                              {topItems.map((item, idx) => {
                                const pct = totalFileCount > 0 ? Math.round((item.count / totalFileCount) * 100) : 0;
                                return (
                                  <div key={`chart-legend-${item.extension}-${idx}`} className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: FILE_PALETTE[idx % FILE_PALETTE.length] }} />
                                    <span className="text-xs font-semibold text-slate-700 truncate flex-1">{item.type} <span className="text-slate-400 font-normal uppercase">.{item.extension}</span></span>
                                    <span className="text-xs font-bold text-slate-900 tabular-nums">{item.count} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-sm font-medium">
                    Aucun fichier enregistré pour le moment
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions rapides */}
      {hasRole([Role.SECRETAIRE, Role.DIRECTEUR_GENERAL, Role.SUPER_ADMIN]) && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 text-slate-500" />
            </div>
            <h2 className="text-base font-extrabold text-slate-800 tracking-tight">Actions rapides</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              to="/enregistrer"
              className="group flex items-center gap-4 p-4 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
                <FontAwesomeIcon icon={faFileAlt} className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-800 text-sm">Enregistrer</div>
                <div className="text-xs text-slate-500 mt-0.5">Nouveau courrier</div>
              </div>
              <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 text-blue-400 ml-auto group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/courriers"
              className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-md shadow-slate-500/20 flex-shrink-0">
                <FontAwesomeIcon icon={faInbox} className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-800 text-sm">Liste des courriers</div>
                <div className="text-xs text-slate-500 mt-0.5">Consulter tout</div>
              </div>
              <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 text-slate-400 ml-auto group-hover:translate-x-1 transition-transform" />
            </Link>
            {hasRole(Role.DIRECTEUR_GENERAL) && (
              <Link
                to="/workflow"
                className="group flex items-center gap-4 p-4 rounded-xl border border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 flex-shrink-0">
                  <FontAwesomeIcon icon={faSyncAlt} className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 text-sm">Annotations</div>
                  <div className="text-xs text-slate-500 mt-0.5">Gérer le workflow</div>
                </div>
                <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 text-emerald-400 ml-auto group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Courriers récents — tableau professionnel */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/50 overflow-hidden">
        {/* En-tête du tableau */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <FontAwesomeIcon icon={faInbox} className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Courriers récents</h2>
                <p className="text-sm text-blue-100 mt-0.5">Derniers courriers enregistrés — vue synthétique</p>
              </div>
            </div>
            <Link
              to="/courriers"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-semibold border border-white/25 transition-all group"
            >
              Voir tout
              <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Espace pour séparer le contenu */}
        <div className="h-4"></div>

        {selectedCourriers.size > 0 && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-800">
              {selectedCourriers.size} courrier{selectedCourriers.size > 1 ? 's' : ''} sélectionné{selectedCourriers.size > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setSelectedCourriers(new Set())}
              className="text-sm text-blue-600 hover:text-blue-800 font-semibold"
            >
              Désélectionner tout
            </button>
          </div>
        )}

        {/* Tableau professionnel */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-200">
                <th className="px-4 py-3.5 text-left w-12">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedCourriers.size === paginatedCourriers.length && paginatedCourriers.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                    />
                  </div>
                </th>
                <th className="px-5 py-3.5 text-left">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Numéro & Détails</span>
                </th>
                <th className="px-5 py-3.5 text-left hidden xl:table-cell">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Expéditeur</span>
                </th>
                <th className="px-5 py-3.5 text-left">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Date</span>
                </th>
                <th className="px-5 py-3.5 text-left hidden lg:table-cell">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Type</span>
                </th>
                <th className="px-4 py-3.5 text-center w-14">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Voir</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedCourriers.length > 0 ? (
                paginatedCourriers.map((courrier, index) => (
                  <tr
                    key={courrier.id}
                    className={`group transition-colors duration-150 cursor-pointer ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    } ${
                      selectedCourriers.has(courrier.id)
                        ? 'bg-blue-50/80 hover:bg-blue-50'
                        : 'hover:bg-slate-50'
                    } ${selectedCourriers.has(courrier.id) ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
                    onClick={() => navigate(`/courriers/${courrier.id}`)}
                  >
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedCourriers.has(courrier.id)}
                          onChange={() => handleSelectCourrier(courrier.id)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                          {(() => {
                            const mainFile = getMainFile(courrier);
                            if (mainFile) {
                              const extension = mainFile.split('.').pop()?.toLowerCase();
                              return (
                                <FontAwesomeIcon
                                  icon={getFileIcon(extension, mainFile)}
                                  className={`text-base ${extension === 'pdf' ? 'text-red-600' : extension === 'doc' || extension === 'docx' ? 'text-blue-700' : extension === 'xls' || extension === 'xlsx' ? 'text-green-600' : 'text-slate-600'}`}
                                  title={`Document: ${mainFile}`}
                                />
                              );
                            }
                            return (
                              <FontAwesomeIcon icon={faPaperclip} className="text-slate-300 text-base" title="Aucun document" />
                            );
                          })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 text-sm truncate" title={courrier.numero}>
                            {courrier.numero}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-600 line-clamp-2" title={courrier.objet?.replace(/<[^>]*>/g, '') || ''}>
                            {courrier.objet?.replace(/<[^>]*>/g, '') || ''}
                          </p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide ${getStatutColor(courrier.statut)}`}>
                              {courrier.statut.replace('_', ' ')}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide ${getPrioriteColor(courrier.priorite)}`}>
                              {courrier.priorite}
                            </span>
                            <span className={`xl:hidden inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide ${getTypeColor(courrier.type)}`}>
                              {courrier.type}
                            </span>
                          </div>
                          {(() => {
                            const { dossierCount, fileCount } = getAttachmentCounts(courrier);
                            if (dossierCount === 0 && fileCount === 0) return null;
                            return (
                              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                                {dossierCount > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <FontAwesomeIcon icon={faFolderOpen} className="text-amber-500 w-3 h-3" />
                                    {dossierCount} dossier{dossierCount > 1 ? 's' : ''}
                                  </span>
                                )}
                                {fileCount > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <FontAwesomeIcon icon={faPaperclip} className="text-slate-400 w-3 h-3" />
                                    {fileCount} fichier{fileCount > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden xl:table-cell">
                      <span className="text-sm text-slate-700 truncate block max-w-[180px]" title={resolveCourrierSens(courrier) === SensCourrier.SORTANT && courrier.type === TypeCourrier.EXTERNE ? '—' : (courrier.expediteur || '—')}>
                        {resolveCourrierSens(courrier) === SensCourrier.SORTANT && courrier.type === TypeCourrier.EXTERNE ? '—' : (courrier.expediteur || '—')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                        <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-400 w-3.5 h-3.5" />
                        {formatReceptionDate(courrier)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold rounded uppercase tracking-wide ${getTypeColor(courrier.type)}`}>
                        {courrier.type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/courriers/${courrier.id}`);
                        }}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Voir le courrier"
                      >
                        <FontAwesomeIcon icon={faEye} className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                      <FontAwesomeIcon icon={faInbox} className="w-10 h-10 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">Aucun courrier trouvé</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {searchTerm || filterStatut || filterType ? 'Modifiez les filtres ou la recherche.' : 'Les courriers apparaîtront ici une fois enregistrés.'}
                    </p>
                    <Link
                      to="/courriers"
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors"
                    >
                      Aller aux courriers
                      <FontAwesomeIcon icon={faArrowRight} className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-600 order-2 sm:order-1">
              <span className="font-semibold text-slate-800">{startIndex + 1}</span>
              <span className="text-slate-400 mx-1">–</span>
              <span className="font-semibold text-slate-800">{Math.min(endIndex, filteredCourriers.length)}</span>
              <span className="text-slate-500 ml-1">sur {filteredCourriers.length}</span>
            </p>
            <div className="flex items-center gap-1 order-1 sm:order-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={`p-2.5 rounded-lg transition-colors ${
                  currentPage === 1
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-white hover:shadow-sm border border-slate-200'
                }`}
                title="Page précédente"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => goToPage(page)}
                        className={`min-w-[2.25rem] h-9 rounded-lg text-sm font-semibold transition-all ${
                          currentPage === page
                            ? 'bg-slate-800 text-white shadow-md'
                            : 'text-slate-600 hover:bg-white hover:shadow-sm border border-slate-200'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="px-2 text-slate-400 font-medium">…</span>;
                  }
                  return null;
                })}
              </div>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`p-2.5 rounded-lg transition-colors ${
                  currentPage === totalPages
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-white hover:shadow-sm border border-slate-200'
                }`}
                title="Page suivante"
              >
                <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
