import React, { Suspense, lazy, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Provider } from 'react-redux'
import { store } from './store/store'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Role } from './types'
import { GlobalLoadingProvider } from './context/GlobalLoadingContext'
import { NetworkStatusProvider } from './context/NetworkStatusContext'
import { SyncStatusProvider } from './context/SyncStatusContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import ListeCourriers from './pages/ListeCourriers'
import DetailCourrier from './pages/DetailCourrier'
import EnregistrerCourrier from './pages/EnregistrerCourrier'
import EnregistrerCourrierListe from './pages/EnregistrerCourrierListe'
import RegistreCourriers from './pages/RegistreCourriers'
import Workflow from './pages/Workflow'
import Planning from './pages/Planning'
import Notifications from './pages/Notifications'
import Profil from './pages/Profil'
import Parametres from './pages/Parametres'
import Archives from './pages/Archives'
import ImpressionCourriers from './pages/ImpressionCourriers'
import { initializeTestData } from './services/testDataService'
import { initializeExtendedData } from './services/initializeExtendedData'
import { initializeFirebaseDemoData } from './services/initializeFirebaseData'
import { userSettingsService } from './services/userSettingsService'
import './index.css'
import Preloader from './components/Preloader'
import LockScreen from './components/LockScreen'
import Rappels from './pages/Rappels'
import NotificationsModule from './pages/NotificationsModule'
import GestionCategoriesCourriers from './pages/GestionCategoriesCourriers'
import StatistiquesCategoriesCourriers from './pages/StatistiquesCategoriesCourriers'
import StatistiquesAvancees from './pages/StatistiquesAvancees'
import CahierRegistre from './pages/CahierRegistre'
import './utils/testNotifications' // Importer le test de notifications

// Lazy loading pour l'organigramme
const Organigramme = lazy(() => import('./pages/Organigramme'))

// Génération automatique des courriers désactivée - utiliser le bouton dans la liste des courriers
// Initialiser les données de test au démarrage (création de courriers désactivée)
// initializeTestData() // Désactivé - ne crée plus de courriers automatiquement
// Initialiser les données étendues (directions, services, utilisateurs supplémentaires)
initializeExtendedData() // Cette fonction ne crée pas de courriers, seulement des entités et utilisateurs
// Initialisation automatique des données Firebase désactivée - utiliser le bouton dans la liste des courriers
// initializeFirebaseDemoData().catch(error => {
//   console.error('Erreur lors de l\'initialisation des données Firebase:', error)
// })

// Migrer automatiquement les paramètres localStorage vers Firestore au démarrage
// Cette migration s'exécute une seule fois et en arrière-plan
const migrationKey = 'settings_migration_completed';
if (!localStorage.getItem(migrationKey)) {
  userSettingsService.migrateAllSettings()
    .then(() => {
      localStorage.setItem(migrationKey, 'true');
      console.log('✅ Migration des paramètres vers Firestore terminée');
    })
    .catch((error) => {
      console.error('❌ Erreur lors de la migration des paramètres:', error);
    });
}

function AppContent() {
  // Attendre que la session soit restaurée avant de rediriger vers /login (évite déconnexion au rechargement)
  const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, authReady, locked } = useAuth();
    if (!authReady) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50" role="status" aria-live="polite">
          <div className="text-center px-6 max-w-sm">
            <div className="inline-block w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" aria-hidden="true" />
            <p className="text-slate-600 font-medium">Chargement de la session…</p>
            <p className="text-slate-500 text-sm mt-2">Si rien ne change, l’interface s’affichera automatiquement sous 12 secondes.</p>
          </div>
        </div>
      );
    }
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    return (
      <>
        {children}
        {locked && <LockScreen />}
      </>
    );
  };

  const DashboardOrRedirect: React.FC = () => {
    return <Dashboard />;
  };

  return (
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
          <Route path="/reinitialiser-mot-de-passe" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardOrRedirect />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardOrRedirect />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/courriers"
            element={
              <ProtectedRoute>
                <Layout>
                  <ListeCourriers />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/courriers/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <DetailCourrier />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/enregistrer"
            element={
              <ProtectedRoute>
                <Layout>
                  <EnregistrerCourrier />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/enregistrer-liste"
            element={
              <ProtectedRoute>
                <Layout>
                  <EnregistrerCourrierListe />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/registre"
            element={
              <ProtectedRoute>
                <Layout>
                  <RegistreCourriers />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/organigramme"
            element={
              <ProtectedRoute>
                <Layout>
                  <Suspense fallback={
                    <div className="flex items-center justify-center min-h-screen">
                      <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                        <p className="text-gray-600">Chargement de l'organigramme...</p>
                      </div>
                    </div>
                  }>
                    <Organigramme />
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflow"
            element={
              <ProtectedRoute>
                <Layout>
                  <Workflow />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rappels"
            element={
              <ProtectedRoute>
                <Layout>
                  <Rappels />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications-module"
            element={
              <ProtectedRoute>
                <Layout>
                  <NotificationsModule />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/planning"
            element={
              <ProtectedRoute>
                <Layout>
                  <Planning />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Layout>
                  <Notifications />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profil"
            element={
              <ProtectedRoute>
                <Layout>
                  <Profil />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/parametres"
            element={
              <ProtectedRoute>
                <Layout>
                  <Parametres />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/cachet-accuse"
            element={
              <ProtectedRoute>
                <Layout>
                  <Parametres />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/archives"
            element={
              <ProtectedRoute>
                <Layout>
                  <Archives />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/impression/courriers"
            element={
              <ProtectedRoute>
                <Layout>
                  <ImpressionCourriers />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/gestion-categories"
            element={
              <ProtectedRoute>
                <Layout>
                  <GestionCategoriesCourriers />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/statistiques-categories"
            element={
              <ProtectedRoute>
                <Layout>
                  <StatistiquesCategoriesCourriers />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/statistiques-avancees"
            element={
              <ProtectedRoute>
                <Layout>
                  <StatistiquesAvancees />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cahier-registre"
            element={
              <ProtectedRoute>
                <Layout>
                  <CahierRegistre />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
  );
}

function App() {
  const [showPreloader, setShowPreloader] = useState(true);

  useEffect(() => {
    const hide = () => setShowPreloader(false);
    const timerFast = setTimeout(hide, 1200);
    const timerMax = setTimeout(hide, 3000); // au plus 3s même si "load" ne se déclenche pas
    window.addEventListener('load', hide);
    return () => {
      clearTimeout(timerFast);
      clearTimeout(timerMax);
      window.removeEventListener('load', hide);
    };
  }, []);

  return (
    <Provider store={store}>
      <GlobalLoadingProvider>
        <NetworkStatusProvider>
          <SyncStatusProvider>
          <AuthProvider>
            {showPreloader && <Preloader />}
            <AppContent />
          </AuthProvider>
          </SyncStatusProvider>
        </NetworkStatusProvider>
      </GlobalLoadingProvider>
    </Provider>
  );
}

// Single root instance (évite les doublons en hot-reload)
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

type RootWithStore = {
  __appRoot?: ReturnType<typeof ReactDOM.createRoot>;
};

const elementWithRoot = rootElement as HTMLElement & RootWithStore;
const root = elementWithRoot.__appRoot || ReactDOM.createRoot(rootElement);
elementWithRoot.__appRoot = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);