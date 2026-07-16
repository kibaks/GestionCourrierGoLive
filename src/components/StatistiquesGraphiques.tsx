import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { courrierService } from '../services/courrierService';
import { Courrier, TypeCourrier, SensCourrier, StatutCourrier, Priorite } from '../types';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Pie, Doughnut, Bar } from 'react-chartjs-2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartPie,
  faEnvelope,
  faEnvelopeOpenText,
  faArrowDown,
  faArrowUp,
  faArrowRight,
  faInbox,
  faChartBar,
  faSync
} from '@fortawesome/free-solid-svg-icons';

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface StatistiquesData {
  total: number;
  internes: number;
  externes: number;
  entrants: number;
  sortants: number;
  internesEntrants: number;
  internesSortants: number;
  externesEntrants: number;
  externesSortants: number;
  parStatut: { [key: string]: number };
  parPriorite: { [key: string]: number };
}

interface StatistiquesGraphiquesProps {
  className?: string;
}

const StatistiquesGraphiques: React.FC<StatistiquesGraphiquesProps> = ({ className = '' }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatistiquesData>({
    total: 0,
    internes: 0,
    externes: 0,
    entrants: 0,
    sortants: 0,
    internesEntrants: 0,
    internesSortants: 0,
    externesEntrants: 0,
    externesSortants: 0,
    parStatut: {},
    parPriorite: {}
  });

  useEffect(() => {
    const loadStatistiques = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const courriers = await courrierService.getAccessibleCourriers(user.id, user);
        
        const statistiques: StatistiquesData = {
          total: courriers.length,
          internes: courriers.filter(c => c.type === TypeCourrier.INTERNE).length,
          externes: courriers.filter(c => c.type === TypeCourrier.EXTERNE).length,
          entrants: courriers.filter(c => (c.sens || SensCourrier.ENTRANT) === SensCourrier.ENTRANT).length,
          sortants: courriers.filter(c => (c.sens || SensCourrier.ENTRANT) === SensCourrier.SORTANT).length,
          internesEntrants: courriers.filter(c => 
            c.type === TypeCourrier.INTERNE && 
            (c.sens || SensCourrier.ENTRANT) === SensCourrier.ENTRANT
          ).length,
          internesSortants: courriers.filter(c => 
            c.type === TypeCourrier.INTERNE && 
            (c.sens || SensCourrier.ENTRANT) === SensCourrier.SORTANT
          ).length,
          externesEntrants: courriers.filter(c => 
            c.type === TypeCourrier.EXTERNE && 
            (c.sens || SensCourrier.ENTRANT) === SensCourrier.ENTRANT
          ).length,
          externesSortants: courriers.filter(c => 
            c.type === TypeCourrier.EXTERNE && 
            (c.sens || SensCourrier.ENTRANT) === SensCourrier.SORTANT
          ).length,
          parStatut: {},
          parPriorite: {}
        };

        // Calculer les statistiques par statut
        Object.values(StatutCourrier).forEach(statut => {
          statistiques.parStatut[statut] = courriers.filter(c => c.statut === statut).length;
        });

        // Calculer les statistiques par priorité
        Object.values(Priorite).forEach(priorite => {
          statistiques.parPriorite[priorite] = courriers.filter(c => c.priorite === priorite).length;
        });

        setStats(statistiques);
      } catch (error) {
        console.error('Erreur lors du chargement des statistiques:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStatistiques();
  }, [user]);

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false  // On gère la légende manuellement pour plus de contrôle
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        padding: 14,
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
      animateScale: true,
      duration: 800  // Animation plus rapide
    },
    elements: {
      arc: {
        hoverOffset: 6
      }
    }
  };

  const doughnutOptions = {
    ...pieOptions,
    cutout: '50%'
  };

  if (loading) {
    return (
      <div className={`${className} space-y-6`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="animate-pulse">
              <div className="h-6 bg-slate-200 rounded-lg w-1/3 mb-4" />
              <div className="h-64 bg-slate-200 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${className} space-y-6`}>
      {/* Cartes de résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faInbox} className="text-xl" />
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-blue-100 text-sm">Total</div>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-5 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faEnvelopeOpenText} className="text-xl" />
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.internes}</div>
              <div className="text-teal-100 text-sm">Internes</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 p-5 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faEnvelope} className="text-xl" />
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.externes}</div>
              <div className="text-cyan-100 text-sm">Externes</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-5 rounded-xl shadow-lg text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faArrowDown} className="text-xl" />
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.entrants}</div>
              <div className="text-indigo-100 text-sm">Entrants</div>
            </div>
          </div>
        </div>
      </div>

      {/* Graphiques principaux */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graphique Type (Internes/Externes) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-r from-teal-600 to-cyan-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <FontAwesomeIcon icon={faEnvelope} className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Répartition par Type</h3>
                <p className="text-sm text-teal-100 mt-0.5">Courriers Internes vs Externes</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {stats.total > 0 ? (
              <div className="h-64">
                <Pie 
                  data={{
                    labels: ['Courriers Internes', 'Courriers Externes'],
                    datasets: [{
                      data: [stats.internes, stats.externes],
                      backgroundColor: [
                        'rgba(20, 184, 166, 0.9)',
                        'rgba(6, 182, 212, 0.9)'
                      ],
                      borderColor: '#ffffff',
                      borderWidth: 3,
                      hoverOffset: 8,
                      hoverBorderWidth: 4
                    }]
                  }}
                  options={pieOptions}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-400 font-medium">
                Aucune donnée disponible
              </div>
            )}
          </div>
        </div>

        {/* Graphique Sens (Entrants/Sortants) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-violet-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <FontAwesomeIcon icon={faArrowRight} className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Répartition par Sens</h3>
                <p className="text-sm text-indigo-100 mt-0.5">Courriers Entrants vs Sortants</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {stats.total > 0 ? (
              <div className="h-64">
                <Pie 
                  data={{
                    labels: ['Courriers Entrants', 'Courriers Sortants'],
                    datasets: [{
                      data: [stats.entrants, stats.sortants],
                      backgroundColor: [
                        'rgba(99, 102, 241, 0.9)',
                        'rgba(139, 92, 246, 0.9)'
                      ],
                      borderColor: '#ffffff',
                      borderWidth: 3,
                      hoverOffset: 8,
                      hoverBorderWidth: 4
                    }]
                  }}
                  options={pieOptions}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-400 font-medium">
                Aucune donnée disponible
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Graphique combiné Type × Sens */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-purple-600 to-pink-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <FontAwesomeIcon icon={faChartPie} className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Répartition Type × Sens</h3>
              <p className="text-sm text-purple-100 mt-0.5">Vue croisée détaillée des courriers</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {stats.total > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <div className="w-full lg:w-80 h-80 flex-shrink-0">
                <Doughnut 
                  data={{
                    labels: [
                      'Internes Entrants', 
                      'Internes Sortants', 
                      'Externes Entrants', 
                      'Externes Sortants'
                    ],
                    datasets: [{
                      data: [
                        stats.internesEntrants,
                        stats.internesSortants,
                        stats.externesEntrants,
                        stats.externesSortants
                      ],
                      backgroundColor: [
                        'rgba(34, 197, 94, 0.9)',
                        'rgba(59, 130, 246, 0.9)',
                        'rgba(251, 146, 60, 0.9)',
                        'rgba(168, 85, 247, 0.9)'
                      ],
                      borderColor: '#ffffff',
                      borderWidth: 3,
                      hoverOffset: 12,
                      hoverBorderWidth: 4
                    }]
                  }}
                  options={doughnutOptions}
                />
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-emerald-800">Internes Entrants</span>
                  </div>
                  <div className="text-3xl font-bold text-emerald-900">{stats.internesEntrants}</div>
                  <div className="text-sm text-emerald-600 mt-1">
                    {stats.total ? ((stats.internesEntrants / stats.total) * 100).toFixed(1) : 0}%
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full bg-blue-500" />
                    <span className="font-semibold text-blue-800">Internes Sortants</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-900">{stats.internesSortants}</div>
                  <div className="text-sm text-blue-600 mt-1">
                    {stats.total ? ((stats.internesSortants / stats.total) * 100).toFixed(1) : 0}%
                  </div>
                </div>
                <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full bg-orange-500" />
                    <span className="font-semibold text-orange-800">Externes Entrants</span>
                  </div>
                  <div className="text-3xl font-bold text-orange-900">{stats.externesEntrants}</div>
                  <div className="text-sm text-orange-600 mt-1">
                    {stats.total ? ((stats.externesEntrants / stats.total) * 100).toFixed(1) : 0}%
                  </div>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full bg-purple-500" />
                    <span className="font-semibold text-purple-800">Externes Sortants</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-900">{stats.externesSortants}</div>
                  <div className="text-sm text-purple-600 mt-1">
                    {stats.total ? ((stats.externesSortants / stats.total) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-80 text-slate-400 font-medium">
              Aucune donnée disponible
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatistiquesGraphiques;