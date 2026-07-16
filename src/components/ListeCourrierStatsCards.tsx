import React from 'react';
import { TypeCourrier, SensCourrier, StatutCourrier } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEnvelope,
  faEnvelopeOpenText,
  faArrowDown,
  faArrowUp,
  faInbox,
  faExclamationTriangle,
  faCheckCircle,
  faClock,
  faArrowRight,
  faArrowLeft
} from '@fortawesome/free-solid-svg-icons';

interface StatsData {
  total: number;
  byStatut: { [key: string]: number };
  byType: { [key in TypeCourrier]: number };
  bySens: { [key in SensCourrier]: number };
  byPriorite: { [key: string]: number };
  urgent: number;
  enAttente: number;
  orientesDirecteurs: number;
  entrants: { [key in TypeCourrier]: number };
  sortants: { [key in TypeCourrier]: number };
}

interface ListeCourrierStatsCardsProps {
  stats: StatsData;
  className?: string;
}

const ListeCourrierStatsCards: React.FC<ListeCourrierStatsCardsProps> = ({ stats, className = '' }) => {
  return (
    <div className={`${className} space-y-6`}>
      {/* Cartes principales - 2x2 layout */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faInbox} className="text-xl" />
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-blue-100 text-sm">Total courriers</div>
            </div>
          </div>
        </div>
        
        {/* Urgents */}
        <div className="bg-gradient-to-br from-red-500 to-red-600 p-5 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-xl" />
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.urgent}</div>
              <div className="text-red-100 text-sm">
                Urgents ({stats.total ? Math.round((stats.urgent / stats.total) * 100) : 0}%)
              </div>
            </div>
          </div>
        </div>

        {/* En attente */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faClock} className="text-xl" />
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.enAttente}</div>
              <div className="text-amber-100 text-sm">
                En attente ({stats.total ? Math.round((stats.enAttente / stats.total) * 100) : 0}%)
              </div>
            </div>
          </div>
        </div>

        {/* Traités */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faCheckCircle} className="text-xl" />
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.byStatut[StatutCourrier.TRAITE] || 0}</div>
              <div className="text-emerald-100 text-sm">
                Traités ({stats.total ? Math.round(((stats.byStatut[StatutCourrier.TRAITE] || 0) / stats.total) * 100) : 0}%)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Répartition Type et Sens - Cartes horizontales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Répartition par Type */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="px-5 py-4 bg-gradient-to-r from-teal-600 to-cyan-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <FontAwesomeIcon icon={faEnvelope} className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Répartition par Type</h3>
                <p className="text-sm text-teal-100 mt-0.5">Internes vs Externes</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              {/* Internes */}
              <div className="flex items-center justify-between p-4 bg-teal-50 rounded-xl border border-teal-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center">
                    <FontAwesomeIcon icon={faEnvelopeOpenText} className="text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-teal-900">{stats.byType[TypeCourrier.INTERNE]}</div>
                    <div className="text-sm text-teal-700">Courriers Internes</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-teal-600">
                    {stats.total ? Math.round((stats.byType[TypeCourrier.INTERNE] / stats.total) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* Externes */}
              <div className="flex items-center justify-between p-4 bg-cyan-50 rounded-xl border border-cyan-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center">
                    <FontAwesomeIcon icon={faEnvelope} className="text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-cyan-900">{stats.byType[TypeCourrier.EXTERNE]}</div>
                    <div className="text-sm text-cyan-700">Courriers Externes</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-cyan-600">
                    {stats.total ? Math.round((stats.byType[TypeCourrier.EXTERNE] / stats.total) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* Barre de progression comparative */}
              <div className="mt-4">
                <div className="flex h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="bg-teal-500 transition-all duration-500"
                    style={{ width: `${stats.total ? (stats.byType[TypeCourrier.INTERNE] / stats.total) * 100 : 0}%` }}
                  />
                  <div 
                    className="bg-cyan-500 transition-all duration-500"
                    style={{ width: `${stats.total ? (stats.byType[TypeCourrier.EXTERNE] / stats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Répartition par Sens */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-violet-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <FontAwesomeIcon icon={faArrowRight} className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Répartition par Sens</h3>
                <p className="text-sm text-indigo-100 mt-0.5">Entrants vs Sortants</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              {/* Entrants */}
              <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
                    <FontAwesomeIcon icon={faArrowDown} className="text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-indigo-900">{stats.bySens[SensCourrier.ENTRANT]}</div>
                    <div className="text-sm text-indigo-700">Courriers Entrants</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-indigo-600">
                    {stats.total ? Math.round((stats.bySens[SensCourrier.ENTRANT] / stats.total) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* Sortants */}
              <div className="flex items-center justify-between p-4 bg-violet-50 rounded-xl border border-violet-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-500 rounded-xl flex items-center justify-center">
                    <FontAwesomeIcon icon={faArrowUp} className="text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-violet-900">{stats.bySens[SensCourrier.SORTANT]}</div>
                    <div className="text-sm text-violet-700">Courriers Sortants</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-violet-600">
                    {stats.total ? Math.round((stats.bySens[SensCourrier.SORTANT] / stats.total) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* Barre de progression comparative */}
              <div className="mt-4">
                <div className="flex h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-500 transition-all duration-500"
                    style={{ width: `${stats.total ? (stats.bySens[SensCourrier.ENTRANT] / stats.total) * 100 : 0}%` }}
                  />
                  <div 
                    className="bg-violet-500 transition-all duration-500"
                    style={{ width: `${stats.total ? (stats.bySens[SensCourrier.SORTANT] / stats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistiques détaillées par statut (optionnel, plus compact) */}
      {(stats.byStatut && Object.values(stats.byStatut).some(count => count > 0)) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-5">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Détails par statut</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(stats.byStatut).map(([statut, count]) => {
              if (count === 0) return null;
              
              let bgColor = 'bg-slate-50';
              let textColor = 'text-slate-700';
              let iconColor = 'bg-slate-500';
              let icon = faInbox;

              if (statut === StatutCourrier.TRAITE) {
                bgColor = 'bg-emerald-50';
                textColor = 'text-emerald-700';
                iconColor = 'bg-emerald-500';
                icon = faCheckCircle;
              } else if (statut === StatutCourrier.EN_ATTENTE_DG) {
                bgColor = 'bg-amber-50';
                textColor = 'text-amber-700';
                iconColor = 'bg-amber-500';
                icon = faClock;
              }

              return (
                <div key={statut} className={`text-center p-3 rounded-xl border border-slate-200 ${bgColor}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2 ${iconColor}`}>
                    <FontAwesomeIcon icon={icon} className="text-white text-sm" />
                  </div>
                  <div className={`text-lg font-bold ${textColor}`}>{count}</div>
                  <div className={`text-xs font-medium ${textColor}`}>
                    {statut.replace('_', ' ')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ListeCourrierStatsCards;