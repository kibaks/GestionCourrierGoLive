 import React from 'react';
import { TypeCourrier, SensCourrier, StatutCourrier, Priorite } from '../types';
import {
  Chart as ChartJS,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEnvelope,
  faEnvelopeOpenText,
  faArrowDown,
  faArrowUp,
  faInbox,
  faChartPie
} from '@fortawesome/free-solid-svg-icons';

ChartJS.register(
  ArcElement,
  Title,
  Tooltip,
  Legend
);

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

interface ListeCourrierStatsProps {
  stats: StatsData;
  className?: string;
}

const ListeCourrierStats: React.FC<ListeCourrierStatsProps> = ({ stats, className = '' }) => {
  // Configuration optimisée pour graphiques donut en ligne unique
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (ctx: any) => {
            const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
            const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
          }
        }
      }
    },
    animation: {
      animateRotate: true,
      duration: 600
    },
    elements: {
      arc: {
        borderWidth: 6,
        hoverBorderWidth: 8,
        hoverOffset: 1,
        backgroundColor: 'transparent'
      }
    }
  };

  // Couleurs de la charte - Teal/Cyan pour Type, Indigo/Violet pour Sens
  const typeData = {
    labels: ['Internes', 'Externes'],
    datasets: [{
      data: [stats.byType[TypeCourrier.INTERNE], stats.byType[TypeCourrier.EXTERNE]],
      backgroundColor: ['transparent', 'transparent'],
      borderColor: [
        '#0d9488', // teal-600
        '#0891b2'  // cyan-600
      ],
      borderWidth: 6,
      hoverBorderWidth: 8,
      hoverOffset: 0
    }]
  };

  const sensData = {
    labels: ['Entrants', 'Sortants'],
    datasets: [{
      data: [stats.bySens[SensCourrier.ENTRANT], stats.bySens[SensCourrier.SORTANT]],
      backgroundColor: ['transparent', 'transparent'],
      borderColor: [
        '#4f46e5', // indigo-600
        '#7c3aed'  // violet-600
      ],
      borderWidth: 6,
      hoverBorderWidth: 8,
      hoverOffset: 0
    }]
  };

  return (
    <div className={`${className}`}>
      {/* Graphiques en ligne unique - Design professionnel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-primary-600 to-primary-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <FontAwesomeIcon icon={faChartPie} className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Vue d'ensemble des courriers</h3>
              <p className="text-sm text-primary-100 mt-0.5">Répartition par type et sens</p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {stats.total > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Type */}
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 flex-shrink-0">
                  <Doughnut data={typeData} options={doughnutOptions} />
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="text-sm font-bold text-slate-900 mb-3">Type de courrier</h4>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-teal-600 flex-shrink-0" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Internes</span>
                      <span className="text-sm font-bold text-slate-900">
                        {stats.byType[TypeCourrier.INTERNE]} 
                        <span className="text-slate-400 font-normal ml-1">
                          ({stats.total ? Math.round((stats.byType[TypeCourrier.INTERNE] / stats.total) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-cyan-600 flex-shrink-0" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Externes</span>
                      <span className="text-sm font-bold text-slate-900">
                        {stats.byType[TypeCourrier.EXTERNE]} 
                        <span className="text-slate-400 font-normal ml-1">
                          ({stats.total ? Math.round((stats.byType[TypeCourrier.EXTERNE] / stats.total) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sens */}
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 flex-shrink-0">
                  <Doughnut data={sensData} options={doughnutOptions} />
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="text-sm font-bold text-slate-900 mb-3">Sens de courrier</h4>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-indigo-600 flex-shrink-0" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Entrants</span>
                      <span className="text-sm font-bold text-slate-900">
                        {stats.bySens[SensCourrier.ENTRANT]} 
                        <span className="text-slate-400 font-normal ml-1">
                          ({stats.total ? Math.round((stats.bySens[SensCourrier.ENTRANT] / stats.total) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-violet-600 flex-shrink-0" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Sortants</span>
                      <span className="text-sm font-bold text-slate-900">
                        {stats.bySens[SensCourrier.SORTANT]} 
                        <span className="text-slate-400 font-normal ml-1">
                          ({stats.total ? Math.round((stats.bySens[SensCourrier.SORTANT] / stats.total) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-slate-400 font-medium text-sm">
              <FontAwesomeIcon icon={faInbox} className="mr-2" />
              Aucune donnée disponible
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ListeCourrierStats;