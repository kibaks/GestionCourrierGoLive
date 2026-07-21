import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';
import { adminService } from '../services/adminService';
import { entiteOrganisationnelleService } from '../services/entiteOrganisationnelleService';
import { responsabiliteService } from '../services/responsabiliteService';
import { courrierService } from '../services/courrierService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faUsers, 
  faLock, 
  faTasks, 
  faSitemap,
  faCog,
  faShieldAlt,
  faExclamationTriangle,
  faChevronRight,
  faWarehouse,
  faStar,
  faCrown,
  faGear,
  faChartLine,
  faUserShield,
  faBuilding,
  faClipboardList,
  faDatabase,
  faLayerGroup,
  faBolt,
  faCheckCircle,
  faHome,
  faSearch,
  faArrowRight,
  faRocket,
  faTrash,
  faFileExport,
  faUpload,
  faTimes,
  faBars,
  faSignature,
  faStamp
} from '@fortawesome/free-solid-svg-icons';
import GestionUtilisateurs from './admin/GestionUtilisateurs';
import GestionRoles from './admin/GestionRoles';
import GestionResponsabilites from './admin/GestionResponsabilites';
import GestionDirectionsServices from './admin/GestionDirectionsServices';
import GestionEnvironnementArchivage from './admin/GestionEnvironnementArchivage';
import GestionTypesEntites from './admin/GestionTypesEntites';
import GestionFormulaireCourrier from './admin/GestionFormulaireCourrier';
import MigrationFirebase from './admin/MigrationFirebase';
import GestionParametresExport from './admin/GestionParametresExport';
import GestionParametresGeneraux from './admin/GestionParametresGeneraux';
import GestionScanners from './admin/GestionScanners';
import GestionSignaturesTampons from './admin/GestionSignaturesTampons';
import GestionCachetAccuse from './admin/GestionCachetAccuse';
import { collection, getDocs, deleteDoc, doc, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';
import { laravelApiService } from '../services/laravelApiService';
import { firebaseMigrationService } from '../services/firebaseMigrationService';
import { indexedDBStorageService } from '../services/indexedDBStorageService';
import { categorieCourrierService } from '../services/categorieCourrierService';
import { store } from '../store/store';
import { setCourriers } from '../store/slices/courriersSlice';
import { initializeArmpCourriersSeed } from '../services/initializeArmpCourriersSeed';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title
);

/** Paramétrage import de fichiers : taille max et compression (API Laravel). */
const ParametresImportFichiers: React.FC = () => {
  const [maxSizeMo, setMaxSizeMo] = useState(100);
  const [compressImages, setCompressImages] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!laravelApiService.isConfigured()) {
      setLoading(false);
      return;
    }
    laravelApiService.getImportFichiersLimits().then((lim) => {
      setMaxSizeMo(lim.maxSizeMo);
      setCompressImages(lim.compressImages);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!laravelApiService.isConfigured()) {
      setMessage({ type: 'error', text: 'API Laravel non configurée.' });
      return;
    }
    const mo = Math.max(1, Math.min(500, Math.round(maxSizeMo)));
    setSaving(true);
    setMessage(null);
    try {
      await laravelApiService.updateImportFichiersConfig({ maxSizeMo: mo, compressImages });
      setMaxSizeMo(mo);
      setMessage({ type: 'success', text: 'Paramètres enregistrés. Les imports utiliseront la nouvelle limite.' });
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement.' });
    } finally {
      setSaving(false);
    }
  };

  if (!laravelApiService.isConfigured()) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Import de fichiers</h2>
        <p className="mt-2 text-slate-500">Configurez <code className="bg-slate-100 px-1 rounded">VITE_LARAVEL_API_URL</code> pour gérer la taille max. et la compression des fichiers importés.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-slate-500">Chargement des paramètres…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Import de fichiers</h2>
      <p className="mt-1 text-sm text-slate-500">Taille maximale des fichiers et compression automatique des images (réduit le poids avant envoi).</p>
      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Taille maximale par fichier (Mo)</label>
          <input
            type="number"
            min={1}
            max={500}
            value={maxSizeMo}
            onChange={(e) => setMaxSizeMo(Number(e.target.value) || 100)}
            className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">Entre 1 et 500 Mo. Vérifiez aussi <code className="bg-slate-100 px-1">upload_max_filesize</code> et <code className="bg-slate-100 px-1">post_max_size</code> dans php.ini (ex. 128M).</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="import-compress-images"
            checked={compressImages}
            onChange={(e) => setCompressImages(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
          <label htmlFor="import-compress-images" className="text-sm font-medium text-slate-700">Compression automatique des images avant envoi</label>
        </div>
        <p className="text-xs text-slate-500">Les images (JPEG, PNG, etc.) seront redimensionnées et compressées pour rester sous la limite et accélérer l’upload.</p>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 font-medium text-sm"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {message && (
            <span className={message.type === 'success' ? 'text-emerald-600 text-sm' : 'text-red-600 text-sm'}>{message.text}</span>
          )}
        </div>
      </div>
    </div>
  );
};

/** Bouton pour synchroniser la config Firestore → Laravel (formulaire). */
const SyncFirestoreToLaravelButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const handleSync = async () => {
    if (!laravelApiService.isConfigured()) {
      setMessage({ type: 'error', text: 'API Laravel non configurée (VITE_LARAVEL_API_URL).' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await firebaseMigrationService.syncFromFirestoreToLaravel();
      setMessage({ type: 'success', text: 'Configuration formulaire synchronisée depuis Firestore vers Laravel.' });
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Erreur lors de la synchronisation.';
      if (/offline|client is offline|failed to get|UNAVAILABLE/i.test(msg)) {
        msg = 'Firestore est hors ligne ou injoignable. Vérifiez votre connexion puis réessayez.';
      }
      setMessage({ type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            Synchronisation...
          </>
        ) : (
          <>Synchroniser la configuration (formulaire)</>
        )}
      </button>
      {message && (
        <p className={`mt-2 text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
};

type TabId =
  | 'dashboard'
  | 'utilisateurs'
  | 'roles'
  | 'responsabilites'
  | 'directions-services'
  | 'environnement-archivage'
  | 'types-entites'
  | 'formulaire-courrier'
  | 'migration-firebase'
  | 'sync-firestore-laravel'
  | 'parametres-export'
  | 'parametres-generaux'
  | 'import-fichiers'
  | 'scanners'
  | 'signatures-tampons'
  | 'cachet-accuse';

const Parametres: React.FC = () => {
  const { hasRole, user } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  useEffect(() => {
    if (location.pathname === '/admin/cachet-accuse') {
      setActiveTab('cachet-accuse');
    }
  }, [location.pathname]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearProgress, setClearProgress] = useState({
    current: 0,
    total: 4,
    message: ''
  });
  const [stats, setStats] = useState({
    utilisateurs: 0,
    utilisateursActifs: 0,
    roles: 0,
    entites: 0,
    responsabilites: 0
  });
  const [hasCourriers, setHasCourriers] = useState(false);
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState({ done: 0, total: 2500, message: '' });

  useEffect(() => {
    loadStats();
    checkCourriers();
  }, []);

  const loadStats = () => {
    const users = adminService.getAllUsers();
    const roles = adminService.getAllRoles();
    const entites = entiteOrganisationnelleService.getAllEntities();
    const responsabilites = responsabiliteService.getDefinitions();

    setStats({
      utilisateurs: users.length,
      utilisateursActifs: users.filter(u => u.actif).length,
      roles: roles.length,
      entites: entites.filter(e => e.actif !== false).length,
      responsabilites: responsabilites.length
    });
  };

  const checkCourriers = () => {
    const courriers = courrierService.getAllCourriers();
    setHasCourriers(courriers.length > 0);
  };

  const handleClearAllCourriers = async () => {
    const confirmMessage = '⚠️ ATTENTION : Cette action est irréversible !\n\n' +
      'Voulez-vous vraiment supprimer TOUTES les données des courriers ?\n\n' +
      'Cela supprimera :\n' +
      '- Tous les courriers\n' +
      '- Tous les workflows\n' +
      '- Toutes les annotations\n' +
      '- Toutes les assignations\n' +
      '- Tous les rappels\n' +
      '- Toutes les catégories et fichiers associés\n' +
      '- Toutes les archives associées';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsClearing(true);
    setClearProgress({ current: 0, total: 5, message: 'Initialisation...' });

    try {
      // Priorité : nettoyage côté API Laravel (MySQL)
      if (laravelApiService.isConfigured()) {
        // Étape 1: Récupérer tous les courriers depuis l'API Laravel
        setClearProgress({ current: 1, total: 5, message: 'Récupération des courriers depuis l\'API Laravel...' });
        const courriers = await laravelApiService.getCourriers();
        const totalItems = courriers.length;

        if (totalItems === 0) {
          setClearProgress({ current: 5, total: 5, message: '✅ Aucun courrier à supprimer!' });
          setIsClearing(false);
          return;
        }

        // Étape 2: Supprimer chaque courrier côté Laravel (DELETE /api/courriers/:id)
        setClearProgress({ current: 2, total: 5, message: `Suppression de ${totalItems} courrier(s) côté Laravel...` });
        for (let i = 0; i < courriers.length; i++) {
          try {
            await laravelApiService.deleteCourrier(String(courriers[i].id));
          } catch (err) {
            console.warn('Erreur suppression courrier', courriers[i].id, err);
          }
          if ((i + 1) % 5 === 0 || i === courriers.length - 1) {
            setClearProgress({ current: 2, total: 5, message: `Suppression Laravel... ${i + 1}/${totalItems}` });
          }
        }

        // Étape 3: Vider le mapping courrier → catégorie (Laravel + localStorage) pour que "classés" retombe à 0
        setClearProgress({ current: 3, total: 4, message: 'Vidage du classement (catégories)...' });
        if (user?.id) {
          try {
            await categorieCourrierService.saveCategoryMap(user.id, {});
          } catch (e) {
            console.warn('Vidage folder-map Laravel:', e);
          }
          try {
            localStorage.removeItem(`courrier_folder_map_${user.id}`);
          } catch (_) {}
        }
        Object.keys(localStorage).filter(k => k.startsWith('courrier_folder_map_')).forEach(k => localStorage.removeItem(k));

        // Étape 4: Nettoyer le cache local (IndexedDB, Redux, localStorage)
        setClearProgress({ current: 4, total: 5, message: 'Nettoyage du cache local...' });
        await indexedDBStorageService.clearCourriers();
        await indexedDBStorageService.clearSyncQueue();
        store.dispatch(setCourriers([]));
        localStorage.removeItem('courriers');
        localStorage.removeItem('rappels');
        localStorage.removeItem('categories_fichiers');
        localStorage.removeItem('archivage_archives');
        localStorage.removeItem('workflows');
        localStorage.removeItem('annotations');
        localStorage.removeItem('assignations');
        localStorage.setItem('courriers_deleted_manually', 'true');

        setClearProgress({ current: 5, total: 5, message: '✅ Nettoyage Laravel terminé avec succès!' });
        console.log('✅ Tous les courriers ont été supprimés côté Laravel et le cache local a été vidé.');
        setTimeout(() => window.location.reload(), 1000);
        return;
      }

      // Fallback : Firestore (si API Laravel non configurée)
      if (!db) {
        setClearProgress({ current: 4, total: 4, message: 'Configurez VITE_LARAVEL_API_URL pour nettoyer les courriers côté Laravel.' });
        setIsClearing(false);
        return;
      }

      // Étape 1: Récupérer tous les courriers depuis Firestore
      setClearProgress({ current: 1, total: 4, message: 'Récupération des courriers depuis Firestore...' });
      const courriersRef = collection(db, 'courriers');
      const courriersSnapshot = await getDocs(courriersRef);
      const allCourrierIds = new Set(courriersSnapshot.docs.map(doc => doc.id));
      const totalItems = allCourrierIds.size;

      if (totalItems === 0) {
        setClearProgress({ current: 4, total: 4, message: '✅ Aucun courrier à supprimer!' });
        setIsClearing(false);
        return;
      }

      // Étape 2: Supprimer en parallèle - workflows, annotations, assignations, fichiers Storage
      setClearProgress({ current: 2, total: 4, message: `Suppression des données associées (${totalItems} courrier(s))...` });
      const deleteRelatedData = async () => {
        const collections = ['workflow_etapes', 'annotations', 'assignations'];
        const batchPromises = collections.map(async (collectionName) => {
          try {
            const ref = collection(db, collectionName);
            const snapshot = await getDocs(ref);
            const docsToDelete = snapshot.docs.filter(doc =>
              allCourrierIds.has(doc.data().courrierId)
            );
            if (docsToDelete.length === 0) return;
            const BATCH_SIZE = 500;
            for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
              const batch = writeBatch(db);
              docsToDelete.slice(i, i + BATCH_SIZE).forEach(doc => {
                batch.delete(doc.ref);
              });
              await batch.commit();
            }
          } catch (error) {
            console.warn(`Erreur lors de la suppression de ${collectionName}:`, error);
          }
        });
        await Promise.allSettled(batchPromises);
      };
      const deleteStorageFiles = async () => {
        const deletePromises: Promise<void>[] = [];
        for (const courrierId of allCourrierIds) {
          deletePromises.push(
            (async () => {
              try {
                const storageRef = ref(storage, `courriers/${courrierId}/fichiers`);
                const filesList = await listAll(storageRef);
                filesList.items.forEach(fileRef => {
                  deletePromises.push(deleteObject(fileRef).catch(() => {}));
                });
              } catch (_) {}
            })()
          );
        }
        await Promise.allSettled(deletePromises);
      };
      await Promise.allSettled([deleteRelatedData(), deleteStorageFiles()]);

      const categoriesFichiersData = localStorage.getItem('categories_fichiers');
      if (categoriesFichiersData) {
        const allCategoriesFichiers: any[] = JSON.parse(categoriesFichiersData);
        const remaining = allCategoriesFichiers.filter(df => !allCourrierIds.has(df.courrierId));
        localStorage.setItem('categories_fichiers', JSON.stringify(remaining));
      }
      const archivesData = localStorage.getItem('archivage_archives');
      if (archivesData) {
        const allArchives: any[] = JSON.parse(archivesData);
        const remaining = allArchives.filter(a => !allCourrierIds.has(a.courrierId));
        localStorage.setItem('archivage_archives', JSON.stringify(remaining));
      }
      localStorage.removeItem('workflows');
      localStorage.removeItem('annotations');
      localStorage.removeItem('assignations');

      setClearProgress({ current: 3, total: 4, message: `Suppression de ${totalItems} courrier(s) dans Firestore...` });
      const BATCH_SIZE = 500;
      const batches: Promise<void>[] = [];
      for (let i = 0; i < courriersSnapshot.docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        courriersSnapshot.docs.slice(i, i + BATCH_SIZE).forEach(doc => {
          batch.delete(doc.ref);
        });
        batches.push(batch.commit());
      }
      await Promise.all(batches);
      localStorage.removeItem('courriers');
      localStorage.removeItem('rappels');
      localStorage.setItem('courriers_deleted_manually', 'true');
      setClearProgress({ current: 4, total: 4, message: '✅ Nettoyage Firestore terminé!' });
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error);
      setClearProgress({ current: 0, total: 4, message: '❌ Erreur lors du nettoyage' });
      setIsClearing(false);
      alert('❌ Une erreur est survenue lors de la suppression. Veuillez consulter la console pour plus de détails.');
    }
  };

  if (!hasRole(Role.SUPER_ADMIN) && !hasRole(Role.DIRECTEUR_GENERAL)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-red-50">
        <div className="max-w-md w-full">
          <div className="relative">
            {/* Cercles décoratifs */}
            <div className="absolute -top-20 -left-20 w-40 h-40 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            
            <div className="relative bg-white/80 backdrop-blur-xl border border-red-100 rounded-3xl p-10 text-center shadow-2xl shadow-red-500/10 animate-slideIn">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-red-500/30 transform rotate-3 hover:rotate-0 transition-transform duration-500">
                <FontAwesomeIcon icon={faExclamationTriangle} className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent mb-4">
                Accès refusé
              </h2>
              <p className="text-surface-600 leading-relaxed text-lg">
                Vous n'avez pas les permissions nécessaires pour accéder à cette zone d'administration.
              </p>
              <div className="mt-8 pt-6 border-t border-red-100">
                <div className="inline-flex items-center gap-3 px-5 py-3 bg-red-50 rounded-xl text-red-700">
                  <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4" />
                  <span className="text-sm font-medium">Contactez votre administrateur</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { 
      id: 'dashboard' as const, 
      label: 'Tableau de bord', 
      icon: faHome, 
      description: 'Vue d\'ensemble',
      gradient: 'from-indigo-500 to-blue-600',
      bgLight: 'bg-indigo-50',
      textColor: 'text-indigo-600',
      borderColor: 'border-indigo-200'
    },
    { 
      id: 'utilisateurs' as const, 
      label: 'Utilisateurs', 
      icon: faUsers, 
      description: 'Gestion des utilisateurs',
      gradient: 'from-blue-500 to-cyan-600',
      bgLight: 'bg-blue-50',
      textColor: 'text-blue-600',
      borderColor: 'border-blue-200'
    },
    { 
      id: 'roles' as const, 
      label: 'Rôles', 
      icon: faUserShield, 
      description: 'Gestion des rôles et permissions',
      gradient: 'from-purple-500 to-pink-600',
      bgLight: 'bg-purple-50',
      textColor: 'text-purple-600',
      borderColor: 'border-purple-200'
    },
    { 
      id: 'responsabilites' as const, 
      label: 'Responsabilités', 
      icon: faTasks, 
      description: 'Définitions des responsabilités',
      gradient: 'from-green-500 to-emerald-600',
      bgLight: 'bg-green-50',
      textColor: 'text-green-600',
      borderColor: 'border-green-200'
    },
    { 
      id: 'directions-services' as const, 
      label: 'Directions & Services', 
      icon: faBuilding, 
      description: 'Organisation structurelle',
      gradient: 'from-orange-500 to-red-600',
      bgLight: 'bg-orange-50',
      textColor: 'text-orange-600',
      borderColor: 'border-orange-200'
    },
    { 
      id: 'environnement-archivage' as const, 
      label: 'Environnement d\'Archivage', 
      icon: faWarehouse, 
      description: 'Configuration de l\'archivage',
      gradient: 'from-teal-500 to-cyan-600',
      bgLight: 'bg-teal-50',
      textColor: 'text-teal-600',
      borderColor: 'border-teal-200'
    },
    { 
      id: 'types-entites' as const, 
      label: 'Types d\'Entités', 
      icon: faLayerGroup, 
      description: 'Types d\'entités organisationnelles',
      gradient: 'from-amber-500 to-yellow-600',
      bgLight: 'bg-amber-50',
      textColor: 'text-amber-600',
      borderColor: 'border-amber-200'
    },
    { 
      id: 'formulaire-courrier' as const, 
      label: 'Formulaire Courrier', 
      icon: faClipboardList, 
      description: 'Configuration du formulaire',
      gradient: 'from-violet-500 to-purple-600',
      bgLight: 'bg-violet-50',
      textColor: 'text-violet-600',
      borderColor: 'border-violet-200'
    },
    { 
      id: 'migration-firebase' as const, 
      label: 'Migration Firebase', 
      icon: faDatabase, 
      description: 'Migration vers Firebase',
      gradient: 'from-slate-500 to-gray-600',
      bgLight: 'bg-slate-50',
      textColor: 'text-slate-600',
      borderColor: 'border-slate-200'
    },
    {
      id: 'sync-firestore-laravel' as const,
      label: 'Sync Firestore → Laravel',
      icon: faArrowRight,
      description: 'Synchroniser Firestore vers MySQL (Laravel API)',
      gradient: 'from-emerald-500 to-teal-600',
      bgLight: 'bg-emerald-50',
      textColor: 'text-emerald-600',
      borderColor: 'border-emerald-200'
    },
    {
      id: 'parametres-export' as const,
      label: 'Paramètres d\'Export',
      icon: faFileExport,
      description: 'Configuration des exports',
      gradient: 'from-rose-500 to-pink-600',
      bgLight: 'bg-rose-50',
      textColor: 'text-rose-600',
      borderColor: 'border-rose-200'
    },
    {
      id: 'parametres-generaux' as const,
      label: 'Paramètres généraux',
      icon: faGear,
      description: 'Configuration globale de l\'application',
      gradient: 'from-slate-500 to-gray-600',
      bgLight: 'bg-slate-50',
      textColor: 'text-slate-600',
      borderColor: 'border-slate-200'
    },
    {
      id: 'import-fichiers' as const,
      label: 'Import de fichiers',
      icon: faUpload,
      description: 'Taille max. et compression des fichiers importés',
      gradient: 'from-cyan-500 to-blue-600',
      bgLight: 'bg-cyan-50',
      textColor: 'text-cyan-600',
      borderColor: 'border-cyan-200'
    },
    {
      id: 'scanners' as const, 
      label: 'Scanners', 
      icon: faDatabase,
      description: 'Gestion des scanners réseau',
      gradient: 'from-indigo-500 to-purple-600',
      bgLight: 'bg-indigo-50',
      textColor: 'text-indigo-600',
      borderColor: 'border-indigo-200'
    },
    {
      id: 'signatures-tampons' as const,
      label: 'Signatures & Tampons',
      icon: faSignature,
      description: 'Gestion des signatures et tampons',
      gradient: 'from-purple-500 to-pink-600',
      bgLight: 'bg-purple-50',
      textColor: 'text-purple-600',
      borderColor: 'border-purple-200'
    },
    {
      id: 'cachet-accuse' as const,
      label: 'Cachet AR',
      icon: faStamp,
      description: 'Cachet accusé de réception',
      gradient: 'from-blue-500 to-indigo-600',
      bgLight: 'bg-blue-50',
      textColor: 'text-blue-600',
      borderColor: 'border-blue-200'
    }
  ];

  const filteredTabs = tabs.filter(tab => 
    tab.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tab.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* En-tête moderne */}
        <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-blue-600 flex items-center justify-center shadow-xl shadow-indigo-500/25 ring-4 ring-white">
              <FontAwesomeIcon icon={faGear} className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Paramètres
              </h1>
              <p className="text-slate-500 mt-0.5 text-sm sm:text-base">
                Configuration et paramètres système
              </p>
            </div>
          </div>
          <button
            onClick={() => setMenuDrawerOpen(true)}
            className="flex items-center justify-center gap-3 px-6 py-3.5 bg-slate-900 text-white rounded-2xl font-semibold hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg hover:shadow-xl"
          >
            <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
            <span>Ouvrir le menu</span>
          </button>
        </div>
        
        {/* Tableau de bord de paramétrage */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* En-tête Vue d'ensemble */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                    <FontAwesomeIcon icon={faChartLine} className="w-5 h-5 text-white" />
                  </span>
                  Vue d'ensemble
                </h2>
                <p className="text-slate-500 mt-1.5 text-sm">Statistiques et configuration système</p>
              </div>
            </div>

            {/* Cartes statistiques — design épuré avec icônes et dégradés */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {[
                { label: 'Utilisateurs', value: stats.utilisateurs, sub: `${stats.utilisateursActifs} actifs`, icon: faUsers, gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-500/10', text: 'text-blue-600', shadow: 'shadow-blue-500/20' },
                { label: 'Rôles', value: stats.roles, sub: '', icon: faUserShield, gradient: 'from-violet-500 to-violet-600', bg: 'bg-violet-500/10', text: 'text-violet-600', shadow: 'shadow-violet-500/20' },
                { label: 'Entités', value: stats.entites, sub: '', icon: faBuilding, gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-500/10', text: 'text-emerald-600', shadow: 'shadow-emerald-500/20' },
                { label: 'Responsabilités', value: stats.responsabilites, sub: '', icon: faTasks, gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-500/10', text: 'text-amber-600', shadow: 'shadow-amber-500/20' },
                { label: 'Courriers en base', value: hasCourriers ? 'Oui' : 'Non', sub: '', icon: faDatabase, gradient: hasCourriers ? 'from-slate-500 to-slate-600' : 'from-slate-400 to-slate-500', bg: hasCourriers ? 'bg-slate-500/10' : 'bg-slate-400/10', text: hasCourriers ? 'text-slate-600' : 'text-slate-500', shadow: 'shadow-slate-500/20' },
              ].map((card) => (
                <div
                  key={card.label}
                  className="relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-lg hover:border-slate-200 transition-all duration-200 overflow-hidden group"
                >
                  <div className={`absolute top-0 right-0 w-20 h-20 rounded-full ${card.bg} -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform`} />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg ${card.shadow} flex-shrink-0`}>
                      <FontAwesomeIcon icon={card.icon} className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">{card.value}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mt-3">{card.label}</p>
                  {card.sub && <p className="text-xs text-slate-500 mt-0.5">{card.sub}</p>}
                </div>
              ))}
            </div>

            {/* Graphiques — répartition utilisateurs + barres synthèse */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Donut Utilisateurs actifs / inactifs */}
              <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xl shadow-slate-200/40">
                <div className="px-6 py-5 bg-gradient-to-r from-indigo-500 to-violet-600">
                  <h3 className="text-lg font-bold text-white tracking-tight">Utilisateurs</h3>
                  <p className="text-sm text-indigo-100 mt-0.5">Actifs / Inactifs</p>
                </div>
                <div className="p-6">
                  <div className="h-64 flex items-center justify-center">
                    <Doughnut
                      data={{
                        labels: ['Actifs', 'Inactifs'],
                        datasets: [{
                          data: [stats.utilisateursActifs, Math.max(0, stats.utilisateurs - stats.utilisateursActifs)],
                          backgroundColor: ['rgba(16, 185, 129, 0.9)', 'rgba(148, 163, 184, 0.8)'],
                          borderColor: '#fff',
                          borderWidth: 3,
                          hoverOffset: 10,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '58%',
                        plugins: {
                          legend: { position: 'bottom' as const },
                          tooltip: {
                            callbacks: {
                              label: (ctx: any) => {
                                const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
                                const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                                return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Barres — Synthèse (Utilisateurs, Rôles, Entités, Responsabilités) */}
              <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xl shadow-slate-200/40">
                <div className="px-6 py-5 bg-gradient-to-r from-blue-500 to-cyan-600">
                  <h3 className="text-lg font-bold text-white tracking-tight">Synthèse</h3>
                  <p className="text-sm text-blue-100 mt-0.5">Répartition des éléments configurés</p>
                </div>
                <div className="p-6">
                  <div className="h-64">
                    <Bar
                      data={{
                        labels: ['Utilisateurs', 'Rôles', 'Entités', 'Responsabilités'],
                        datasets: [{
                          label: 'Nombre',
                          data: [stats.utilisateurs, stats.roles, stats.entites, stats.responsabilites],
                          backgroundColor: [
                            'rgba(59, 130, 246, 0.85)',
                            'rgba(139, 92, 246, 0.85)',
                            'rgba(16, 185, 129, 0.85)',
                            'rgba(245, 158, 11, 0.85)',
                          ],
                          borderColor: ['#2563eb', '#7c3aed', '#059669', '#d97706'],
                          borderWidth: 1,
                          borderRadius: { topLeft: 8, topRight: 8 },
                          borderSkipped: false,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)' },
                        },
                        scales: {
                          y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.15)' }, ticks: { color: '#64748b' } },
                          x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 0 } },
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section seed 2500 courriers ARMP */}
            <div className="bg-white rounded-2xl overflow-hidden border border-indigo-200/60 shadow-xl shadow-indigo-100/30">
              <div className="px-6 py-5 bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border-b border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                    <FontAwesomeIcon icon={faRocket} className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">Seed 2 500 courriers ARMP</h4>
                    <p className="text-sm text-slate-600 mt-0.5">Génère 2 500 courriers catégorisés selon les directions et services ARMP réels</p>
                  </div>
                </div>
              </div>
              <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-600">
                    Courriers internes (entrants/sortants) et externes répartis sur toutes les directions, divisions et services ARMP avec des sujets spécialisés.
                  </p>
                  {isSeeding && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 font-medium truncate mr-2">{seedProgress.message || `Création en cours…`}</span>
                        <span className="text-slate-500 tabular-nums shrink-0">{seedProgress.done}/{seedProgress.total}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((seedProgress.done / seedProgress.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    if (!window.confirm('Lancer le seed de 2 500 courriers ARMP ? Cette opération peut prendre plusieurs minutes.')) return;
                    setIsSeeding(true);
                    setSeedProgress({ done: 0, total: 2500, message: 'Initialisation…' });
                    try {
                      const result = await initializeArmpCourriersSeed(2500, (done, total) => {
                        setSeedProgress({ done, total, message: `${done} courriers créés…` });
                      });
                      setSeedProgress({ done: result.created, total: 2500, message: `✅ ${result.created} courriers créés (${result.errors} erreurs)` });
                      checkCourriers();
                    } catch (e) {
                      setSeedProgress(p => ({ ...p, message: `❌ Erreur : ${e instanceof Error ? e.message : 'inconnue'}` }));
                    } finally {
                      setIsSeeding(false);
                    }
                  }}
                  disabled={isSeeding}
                  className="shrink-0 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 border border-indigo-500/20"
                >
                  {isSeeding ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Génération…</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faRocket} className="w-5 h-5" />
                      <span>Lancer le seed</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Section nettoyage — design soigné */}
            <div className="bg-white rounded-2xl overflow-hidden border border-red-200/60 shadow-xl shadow-red-100/30">
              <div className="px-6 py-5 bg-gradient-to-r from-red-500/10 to-orange-500/10 border-b border-red-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center">
                    <FontAwesomeIcon icon={faTrash} className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">Nettoyer les courriers</h4>
                    <p className="text-sm text-slate-600 mt-0.5">Suppression définitive de tous les courriers et données associées</p>
                  </div>
                </div>
              </div>
              <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-600">
                    Workflows, annotations, assignations, rappels et fichiers seront supprimés. Cette action est irréversible.
                  </p>
                  {isClearing && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 font-medium truncate mr-2">{clearProgress.message}</span>
                        <span className="text-slate-500 tabular-nums shrink-0">{clearProgress.current}/{clearProgress.total}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-red-500 to-red-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${(clearProgress.current / clearProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleClearAllCourriers}
                  disabled={isClearing || !hasCourriers}
                  className="shrink-0 px-6 py-3.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl font-semibold hover:from-red-700 hover:to-red-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-red-500/25 border border-red-500/20"
                >
                  {isClearing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Suppression...</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faTrash} className="w-5 h-5" />
                      <span>Nettoyer les courriers</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

{/* Drawer du menu — moderne avec recherche */}
        {menuDrawerOpen && createPortal(
          <div className="fixed inset-0 z-[50000] flex justify-end">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-fadeIn"
              aria-hidden
              onClick={() => setMenuDrawerOpen(false)}
            />
            <div className="relative h-full w-full max-w-md bg-white flex flex-col shadow-2xl animate-slideInRight border-l border-slate-200/80">
              {/* Header */}
              <div className="shrink-0 px-6 py-5 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                      <FontAwesomeIcon icon={faGear} className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">Menu Paramètres</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Choisir une section</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMenuDrawerOpen(false)}
                    className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
                    title="Fermer"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                  </button>
                </div>
                {/* Recherche */}
                <div className="relative">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Rechercher une section..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Menu Items */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filteredTabs.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    Aucune section ne correspond à votre recherche.
                  </div>
                ) : (
                  filteredTabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const isDisabled = tab.id === 'formulaire-courrier' && hasCourriers;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          if (isDisabled) {
                            alert('⚠️ Le paramétrage du formulaire n\'est accessible que lorsque la base de données des courriers est vide.\n\nVeuillez d\'abord supprimer tous les courriers via la section "Nettoyer les courriers" dans le tableau de bord.');
                            return;
                          }
                          setActiveTab(tab.id);
                          setMenuDrawerOpen(false);
                        }}
                        disabled={isDisabled}
                        className={`w-full px-4 py-3.5 rounded-2xl text-left flex items-center gap-4 transition-all border-2 ${
                          isActive
                            ? `bg-gradient-to-r ${tab.gradient} text-white border-transparent shadow-lg`
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-white/20' : tab.bgLight
                        }`}>
                          <FontAwesomeIcon
                            icon={tab.icon}
                            className={`w-5 h-5 ${isActive ? 'text-white' : tab.textColor}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{tab.label}</div>
                          {tab.description && (
                            <div className={`text-xs mt-0.5 truncate ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                              {tab.description}
                            </div>
                          )}
                        </div>
                        {isActive && (
                          <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 shrink-0 text-white" />
                        )}
                        {!isActive && !isDisabled && (
                          <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4 shrink-0 text-slate-400" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Contenu des onglets dans la page principale */}
        <div className="mt-8">
                  {activeTab === 'utilisateurs' && <GestionUtilisateurs />}
                  {activeTab === 'roles' && <GestionRoles />}
          {activeTab === 'responsabilites' && <GestionResponsabilites />}
                  {activeTab === 'directions-services' && <GestionDirectionsServices />}
          {activeTab === 'environnement-archivage' && <GestionEnvironnementArchivage />}
                  {activeTab === 'types-entites' && <GestionTypesEntites />}
                  {activeTab === 'formulaire-courrier' && !hasCourriers && <GestionFormulaireCourrier />}
                  {activeTab === 'formulaire-courrier' && hasCourriers && (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center mx-auto mb-6">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-4xl text-orange-600" />
                        </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4">
                Base de données non vide
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                          Le paramétrage du formulaire n'est accessible que lorsque la base de données des courriers est vide.
                <br /><br />
                          Veuillez d'abord supprimer tous les courriers via la section <strong>"Nettoyer les courriers"</strong> dans le tableau de bord.
                        </p>
                        <button
                          onClick={() => setActiveTab('dashboard')}
                          className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-blue-700 transition-all shadow-lg"
                        >
                          Retour au tableau de bord
                        </button>
                    </div>
                  )}
          {activeTab === 'migration-firebase' && <MigrationFirebase />}
          {activeTab === 'sync-firestore-laravel' && (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faArrowRight} className="text-emerald-600" />
                Synchronisation Firestore → MySQL (Laravel API)
              </h2>
              <p className="text-slate-600 mb-6">
                Copiez les informations configurées dans Firestore vers la base MySQL utilisée par l&apos;API Laravel.
              </p>
              <div className="space-y-6">
                <div className="border border-emerald-100 rounded-xl p-4 bg-emerald-50/50">
                  <h3 className="font-medium text-slate-800 mb-2">Configuration (formulaire courrier)</h3>
                  <p className="text-sm text-slate-600 mb-3">
                    Importe le document <code className="bg-white px-1 rounded">config/formulaire</code> depuis Firestore vers l&apos;API Laravel (table <code className="bg-white px-1 rounded">config</code>).
                  </p>
                  <SyncFirestoreToLaravelButton />
                </div>
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <h3 className="font-medium text-slate-800 mb-2">Synchronisation complète</h3>
                  <p className="text-sm text-slate-600 mb-2">
                    Pour migrer <strong>toutes</strong> les données (utilisateurs, courriers, entités, assignations, rappels, config formulaire, etc.) depuis Firestore vers MySQL, exécutez en ligne de commande à la racine du projet :
                  </p>
                  <pre className="text-sm bg-slate-800 text-slate-100 p-3 rounded-lg overflow-x-auto">
                    npm run migrate:firebase-mysql
                  </pre>
                  <p className="text-sm text-slate-500 mt-2">
                    Prérequis : <code className="bg-white px-1 rounded">.env</code> avec variables Firebase (<code>VITE_FIREBASE_*</code>) et MySQL (<code>MYSQL_*</code> ou <code>DB_*</code>). Les tables MySQL doivent exister (<code>npm run migrate:mysql</code>). Voir <code>scripts/README-migration-firebase-mysql.md</code>.
                  </p>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'parametres-export' && <GestionParametresExport />}
          {activeTab === 'parametres-generaux' && <GestionParametresGeneraux />}
          {activeTab === 'import-fichiers' && <ParametresImportFichiers />}
          {activeTab === 'scanners' && <GestionScanners />}
          {activeTab === 'signatures-tampons' && <GestionSignaturesTampons />}
          {activeTab === 'cachet-accuse' && <GestionCachetAccuse />}
        </div>
      </div>
    </div>
  );
};

export default Parametres;
