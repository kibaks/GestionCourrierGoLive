import React, { useState } from 'react';
import { firebaseMigrationService } from '../../services/firebaseMigrationService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDatabase, faCheckCircle, faTimesCircle, faSpinner, faArrowRight } from '@fortawesome/free-solid-svg-icons';

const MigrationFirebase: React.FC = () => {
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<{
    courriers: { status: 'pending' | 'success' | 'error'; count?: number };
    archivage: { status: 'pending' | 'success' | 'error'; count?: number };
    formulaire: { status: 'pending' | 'success' | 'error' };
    utilisateurs: { status: 'pending' | 'success' | 'error'; count?: number };
    entites: { status: 'pending' | 'success' | 'error'; count?: number };
  }>({
    courriers: { status: 'pending' },
    archivage: { status: 'pending' },
    formulaire: { status: 'pending' },
    utilisateurs: { status: 'pending' },
    entites: { status: 'pending' },
  });
  const [error, setError] = useState<string | null>(null);

  const handleMigrateAll = async () => {
    setMigrating(true);
    setError(null);
    setProgress({
      courriers: { status: 'pending' },
      archivage: { status: 'pending' },
      formulaire: { status: 'pending' },
      utilisateurs: { status: 'pending' },
      entites: { status: 'pending' },
    });

    try {
      // Migrer les courriers
      try {
        const count = await firebaseMigrationService.migrateCourriers();
        setProgress(prev => ({ ...prev, courriers: { status: 'success', count } }));
      } catch (err) {
        setProgress(prev => ({ ...prev, courriers: { status: 'error' } }));
        throw err;
      }

      // Migrer l'archivage
      try {
        const count = await firebaseMigrationService.migrateArchivage();
        setProgress(prev => ({ ...prev, archivage: { status: 'success', count } }));
      } catch (err) {
        setProgress(prev => ({ ...prev, archivage: { status: 'error' } }));
        console.error('Erreur migration archivage:', err);
      }

      // Migrer la configuration du formulaire
      try {
        await firebaseMigrationService.migrateFormulaireConfig();
        setProgress(prev => ({ ...prev, formulaire: { status: 'success' } }));
      } catch (err) {
        setProgress(prev => ({ ...prev, formulaire: { status: 'error' } }));
        console.error('Erreur migration formulaire:', err);
      }

      // Migrer les utilisateurs
      try {
        const count = await firebaseMigrationService.migrateUtilisateurs();
        setProgress(prev => ({ ...prev, utilisateurs: { status: 'success', count } }));
      } catch (err) {
        setProgress(prev => ({ ...prev, utilisateurs: { status: 'error' } }));
        console.error('Erreur migration utilisateurs:', err);
      }

      // Migrer les entités
      try {
        const count = await firebaseMigrationService.migrateEntites();
        setProgress(prev => ({ ...prev, entites: { status: 'success', count } }));
      } catch (err) {
        setProgress(prev => ({ ...prev, entites: { status: 'error' } }));
        console.error('Erreur migration entités:', err);
      }

      console.log('✅ Migration complète terminée avec succès!');
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la migration');
      console.error('❌ Erreur lors de la migration:', err);
    } finally {
      setMigrating(false);
    }
  };

  const handleMigrateItem = async (item: 'courriers' | 'archivage' | 'formulaire' | 'utilisateurs' | 'entites') => {
    setMigrating(true);
    setError(null);

    try {
      switch (item) {
        case 'courriers':
          const countC = await firebaseMigrationService.migrateCourriers();
          setProgress(prev => ({ ...prev, courriers: { status: 'success', count: countC } }));
          break;
        case 'archivage':
          const countA = await firebaseMigrationService.migrateArchivage();
          setProgress(prev => ({ ...prev, archivage: { status: 'success', count: countA } }));
          break;
        case 'formulaire':
          await firebaseMigrationService.migrateFormulaireConfig();
          setProgress(prev => ({ ...prev, formulaire: { status: 'success' } }));
          break;
        case 'utilisateurs':
          const countU = await firebaseMigrationService.migrateUtilisateurs();
          setProgress(prev => ({ ...prev, utilisateurs: { status: 'success', count: countU } }));
          break;
        case 'entites':
          const countE = await firebaseMigrationService.migrateEntites();
          setProgress(prev => ({ ...prev, entites: { status: 'success', count: countE } }));
          break;
      }
    } catch (err: any) {
      setError(err.message || `Erreur lors de la migration de ${item}`);
      setProgress(prev => ({ ...prev, [item]: { status: 'error' } }));
    } finally {
      setMigrating(false);
    }
  };

  const getStatusIcon = (status: 'pending' | 'success' | 'error') => {
    switch (status) {
      case 'success':
        return <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-green-500" />;
      case 'error':
        return <FontAwesomeIcon icon={faTimesCircle} className="w-5 h-5 text-red-500" />;
      default:
        return <FontAwesomeIcon icon={faSpinner} className="w-5 h-5 text-gray-400 animate-spin" />;
    }
  };

  const getStatusColor = (status: 'pending' | 'success' | 'error') => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-surface-100 shadow-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
            <FontAwesomeIcon icon={faDatabase} className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Migration vers Firebase</h1>
            <p className="text-surface-500">Migrez vos données de localStorage vers Firebase</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700 font-medium">Erreur : {error}</p>
          </div>
        )}

        <div className="mb-6">
          <button
            onClick={handleMigrateAll}
            disabled={migrating}
            className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {migrating ? (
              <>
                <FontAwesomeIcon icon={faSpinner} className="w-5 h-5 animate-spin" />
                <span>Migration en cours...</span>
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faDatabase} className="w-5 h-5" />
                <span>Migrer toutes les données</span>
                <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-surface-900 mb-4">Migration par catégorie</h3>
          
          {/* Courriers */}
          <div className={`p-4 rounded-xl border-2 transition-all ${getStatusColor(progress.courriers.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(progress.courriers.status)}
                <div>
                  <h4 className="font-semibold text-surface-900">Courriers</h4>
                  {progress.courriers.count !== undefined && (
                    <p className="text-sm text-surface-600">{progress.courriers.count} courrier(s) migré(s)</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleMigrateItem('courriers')}
                disabled={migrating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Migrer
              </button>
            </div>
          </div>

          {/* Archivage */}
          <div className={`p-4 rounded-xl border-2 transition-all ${getStatusColor(progress.archivage.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(progress.archivage.status)}
                <div>
                  <h4 className="font-semibold text-surface-900">Archivage</h4>
                  {progress.archivage.count !== undefined && (
                    <p className="text-sm text-surface-600">{progress.archivage.count} local(aux) migré(s)</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleMigrateItem('archivage')}
                disabled={migrating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Migrer
              </button>
            </div>
          </div>

          {/* Formulaire */}
          <div className={`p-4 rounded-xl border-2 transition-all ${getStatusColor(progress.formulaire.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(progress.formulaire.status)}
                <div>
                  <h4 className="font-semibold text-surface-900">Configuration du formulaire</h4>
                  <p className="text-sm text-surface-600">Structure et champs personnalisés</p>
                </div>
              </div>
              <button
                onClick={() => handleMigrateItem('formulaire')}
                disabled={migrating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Migrer
              </button>
            </div>
          </div>

          {/* Utilisateurs */}
          <div className={`p-4 rounded-xl border-2 transition-all ${getStatusColor(progress.utilisateurs.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(progress.utilisateurs.status)}
                <div>
                  <h4 className="font-semibold text-surface-900">Utilisateurs</h4>
                  {progress.utilisateurs.count !== undefined && (
                    <p className="text-sm text-surface-600">{progress.utilisateurs.count} utilisateur(s) migré(s)</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleMigrateItem('utilisateurs')}
                disabled={migrating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Migrer
              </button>
            </div>
          </div>

          {/* Entités */}
          <div className={`p-4 rounded-xl border-2 transition-all ${getStatusColor(progress.entites.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(progress.entites.status)}
                <div>
                  <h4 className="font-semibold text-surface-900">Entités organisationnelles</h4>
                  {progress.entites.count !== undefined && (
                    <p className="text-sm text-surface-600">{progress.entites.count} entité(s) migrée(s)</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleMigrateItem('entites')}
                disabled={migrating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Migrer
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <h4 className="font-semibold text-blue-900 mb-2">ℹ️ Informations importantes</h4>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>La migration ne supprime pas les données de localStorage</li>
            <li>Vous pouvez migrer plusieurs fois sans risque (les données seront mises à jour)</li>
            <li>Assurez-vous que Firebase est correctement configuré avant de migrer</li>
            <li>Les données migrées seront disponibles dans Firebase Firestore</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MigrationFirebase;

