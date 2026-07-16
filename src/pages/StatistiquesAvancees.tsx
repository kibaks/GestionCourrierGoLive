import React from 'react';
import { useAuth } from '../context/AuthContext';
import StatistiquesGraphiques from '../components/StatistiquesGraphiques';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faDownload,
  faPrint,
  faSync,
  faCalendarAlt
} from '@fortawesome/free-solid-svg-icons';

const StatistiquesAvancees: React.FC = () => {
  const { user } = useAuth();

  const handleExport = () => {
    // Logique d'export (CSV, Excel, PDF, etc.)
    console.log('Export des statistiques');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 flex-shrink-0">
                <FontAwesomeIcon icon={faChartLine} className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Statistiques Avancées
                </h1>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <p className="text-slate-500 text-sm">
                    Analyse détaillée des courriers par type et sens
                  </p>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-100">
                    <FontAwesomeIcon icon={faCalendarAlt} className="w-3 h-3" />
                    {new Date().toLocaleDateString('fr-FR')}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 rounded-xl border border-slate-200 font-semibold shadow-sm hover:bg-slate-50 hover:shadow-md transition-all"
                title="Actualiser les données"
              >
                <FontAwesomeIcon icon={faSync} className="w-4 h-4" />
                Actualiser
              </button>
              
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 rounded-xl border border-slate-200 font-semibold shadow-sm hover:bg-slate-50 hover:shadow-md transition-all"
                title="Imprimer le rapport"
              >
                <FontAwesomeIcon icon={faPrint} className="w-4 h-4" />
                Imprimer
              </button>
              
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-500/30 hover:from-emerald-700 hover:to-teal-700 hover:-translate-y-0.5 transition-all"
                title="Exporter les données"
              >
                <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                Exporter
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <FontAwesomeIcon icon={faChartLine} className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">À propos de ces statistiques</h2>
              <p className="text-slate-600 leading-relaxed">
                Cette page présente une analyse détaillée de vos courriers avec des graphiques circulaires 
                interactifs. Vous pouvez visualiser la répartition par <strong>type</strong> (internes/externes), 
                par <strong>sens</strong> (entrants/sortants), ainsi qu'une vue croisée combinant ces deux dimensions.
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-500" />
                  <span className="text-slate-700">
                    <strong>Courriers Internes :</strong> Communications internes à l'organisation
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-500" />
                  <span className="text-slate-700">
                    <strong>Courriers Externes :</strong> Communications avec des tiers externes
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-slate-700">
                    <strong>Courriers Entrants :</strong> Documents reçus par l'organisation
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                  <span className="text-slate-700">
                    <strong>Courriers Sortants :</strong> Documents envoyés par l'organisation
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Composant de statistiques avec graphiques */}
        <StatistiquesGraphiques />

        {/* Footer informatif */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            Données mises à jour en temps réel • 
            <span className="mx-2">•</span>
            Accessible selon vos permissions utilisateur
          </p>
          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-slate-400">
            <span>Utilisateur : {user?.nom}</span>
            <span>•</span>
            <span>Rôle : {user?.role?.replace(/_/g, ' ')}</span>
            {user?.direction && (
              <>
                <span>•</span>
                <span>Direction : {user.direction}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatistiquesAvancees;