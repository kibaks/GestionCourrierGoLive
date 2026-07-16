import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { categorieCourrierService, CategorieCourrier } from '../services/categorieCourrierService';
import { courrierService } from '../services/courrierService';
import { Courrier, TypeCourrier, SensCourrier } from '../types';
import {
  Chart as ChartJS,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Pie, Doughnut } from 'react-chartjs-2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFolder, 
  faFileAlt, 
  faChartBar, 
  faChartPie, 
  faDownload, 
  faEnvelope,
  faEnvelopeOpenText,
  faArrowDown,
  faArrowUp,
  faArrowRight,
  faInbox
} from '@fortawesome/free-solid-svg-icons';

ChartJS.register(
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface CategoryStats {
  categoryId: string;
  categoryName: string;
  categoryColor?: string | null;
  totalCourriers: number;
  subCategories: CategoryStats[];
}

interface CourrierStats {
  total: number;
  internes: number;
  externes: number;
  entrants: number;
  sortants: number;
  internesEntrants: number;
  internesSortants: number;
  externesEntrants: number;
  externesSortants: number;
}

const StatistiquesCategoriesCourriers: React.FC = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<CategorieCourrier[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [courriers, setCourriers] = useState<Courrier[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string | null>>({});
  const [courrierStats, setCourrierStats] = useState<CourrierStats>({
    total: 0,
    internes: 0,
    externes: 0,
    entrants: 0,
    sortants: 0,
    internesEntrants: 0,
    internesSortants: 0,
    externesEntrants: 0,
    externesSortants: 0
  });
  const [viewMode, setViewMode] = useState<'categories' | 'courriers'>('categories');

  const loadCategories = useCallback(async () => {
    if (!user?.id) return;
    try {
      const folders = await categorieCourrierService.getCategories(user.id);
      setCategories(folders);
      // Charger aussi le mapping courrier -> catégorie
      const map = await categorieCourrierService.getFolderMap(user.id);
      setCategoryMap(map);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  }, [user?.id]);

  const loadCourriers = useCallback(async () => {
    if (!user) return;
    try {
      const accessibleCourriers = await courrierService.getAccessibleCourriers(user.id, user);
      setCourriers(accessibleCourriers);
      
      // Calculer les statistiques des courriers
      const stats = {
        total: accessibleCourriers.length,
        internes: accessibleCourriers.filter(c => c.type === TypeCourrier.INTERNE).length,
        externes: accessibleCourriers.filter(c => c.type === TypeCourrier.EXTERNE).length,
        entrants: accessibleCourriers.filter(c => (c.sens || SensCourrier.ENTRANT) === SensCourrier.ENTRANT).length,
        sortants: accessibleCourriers.filter(c => (c.sens || SensCourrier.ENTRANT) === SensCourrier.SORTANT).length,
        internesEntrants: accessibleCourriers.filter(c => c.type === TypeCourrier.INTERNE && (c.sens || SensCourrier.ENTRANT) === SensCourrier.ENTRANT).length,
        internesSortants: accessibleCourriers.filter(c => c.type === TypeCourrier.INTERNE && (c.sens || SensCourrier.ENTRANT) === SensCourrier.SORTANT).length,
        externesEntrants: accessibleCourriers.filter(c => c.type === TypeCourrier.EXTERNE && (c.sens || SensCourrier.ENTRANT) === SensCourrier.ENTRANT).length,
        externesSortants: accessibleCourriers.filter(c => c.type === TypeCourrier.EXTERNE && (c.sens || SensCourrier.ENTRANT) === SensCourrier.SORTANT).length,
      };
      setCourrierStats(stats);
    } catch (error) {
      console.error('Erreur chargement courriers:', error);
    }
  }, [user]);

  const calculateStats = useCallback(() => {
    if (!courriers.length || !categories.length) return;

    // Utiliser le mapping courrier -> catégorie chargé depuis le service
    // et filtrer seulement les courriers accessibles
    const buildCategoryStats = (parentId: string | null = null): CategoryStats[] => {
      const parentCategories = categories.filter(c => c.parentId === parentId);

      return parentCategories.map(category => {
        const subCategories = buildCategoryStats(category.id);
        const subTotal = subCategories.reduce((sum, sub) => sum + sub.totalCourriers, 0);
        // Compter les courriers directement assignés à cette catégorie
        const directCourriers = courriers.filter(c => categoryMap[c.id] === category.id).length;

        return {
          categoryId: category.id,
          categoryName: category.name,
          categoryColor: category.color,
          totalCourriers: directCourriers + subTotal,
          subCategories,
        };
      });
    };

    setCategoryStats(buildCategoryStats(null));
  }, [categories, courriers, categoryMap]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadCategories(), loadCourriers()]);
      setLoading(false);
    };
    loadData();
  }, [loadCategories, loadCourriers]);

  useEffect(() => {
    if (!loading) {
      calculateStats();
    }
  }, [loading, calculateStats]);

  const getTotalCourriers = (stats: CategoryStats[]): number => {
    return stats.reduce((sum, stat) => sum + stat.totalCourriers, 0);
  };

  // Configuration des graphiques
  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          font: {
            size: 12,
            weight: 'bold' as const
          },
          color: '#374151'
        }
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
      duration: 1000
    }
  };

  const renderCategoryStatsTree = (stats: CategoryStats[], level: number = 0) => {
    if (stats.length === 0 && level === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <FontAwesomeIcon icon={faFolder} className="text-4xl mb-4 text-gray-300" />
          <p className="text-lg font-medium">Aucune statistique disponible</p>
        </div>
      );
    }

    return stats.map(stat => (
      <div key={stat.categoryId} style={{ marginLeft: level * 24 }}>
        <div className="flex items-center gap-4 py-4 px-5 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: stat.categoryColor || '#3b82f6' }}
          >
            <FontAwesomeIcon icon={faFolder} className="text-white text-lg" />
          </div>
          
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-lg">{stat.categoryName}</h3>
            <p className="text-sm text-gray-500">{stat.totalCourriers} courrier(s)</p>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{stat.totalCourriers}</div>
            <div className="text-xs text-gray-500">courriers</div>
          </div>
        </div>
        
        {stat.subCategories.length > 0 && (
          <div className="mt-2">
            {renderCategoryStatsTree(stat.subCategories, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  const renderCategoryStatsList = (stats: CategoryStats[]) => {
    if (stats.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <FontAwesomeIcon icon={faFolder} className="text-4xl mb-4 text-gray-300" />
          <p className="text-lg font-medium">Aucune statistique disponible</p>
        </div>
      );
    }

    const flattenStats = (stats: CategoryStats[]): CategoryStats[] => {
      const result: CategoryStats[] = [];
      stats.forEach(stat => {
        result.push(stat);
        if (stat.subCategories.length > 0) {
          result.push(...flattenStats(stat.subCategories));
        }
      });
      return result;
    };

    const flatStats = flattenStats(stats).sort((a, b) => b.totalCourriers - a.totalCourriers);

    return (
      <div className="space-y-3">
        {flatStats.map(stat => (
          <div key={stat.categoryId} className="flex items-center gap-4 py-4 px-5 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: stat.categoryColor || '#3b82f6' }}
            >
              <FontAwesomeIcon icon={faFolder} className="text-white text-lg" />
            </div>
            
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-lg">{stat.categoryName}</h3>
              {stat.categoryColor && (
                <p className="text-xs text-gray-500">Couleur: {stat.categoryColor}</p>
              )}
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{stat.totalCourriers}</div>
              <div className="text-xs text-gray-500">courriers</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const totalCourriers = getTotalCourriers(categoryStats);
  const totalCategories = categories.length;
  const rootCategories = categories.filter(c => !c.parentId).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Statistiques des catégories</h1>
              <p className="text-gray-600">Vue d'ensemble de la répartition des courriers par catégorie</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setViewMode('categories')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors ${
                  viewMode === 'categories' 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <FontAwesomeIcon icon={faFolder} />
                Catégories
              </button>
              <button
                onClick={() => setViewMode('courriers')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors ${
                  viewMode === 'courriers' 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <FontAwesomeIcon icon={faChartPie} />
                Courriers
              </button>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-xl shadow-lg text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faInbox} className="text-xl" />
                </div>
                <div>
                  <div className="text-3xl font-bold">{courrierStats.total}</div>
                  <div className="text-blue-100 text-sm">Total courriers</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-5 rounded-xl shadow-lg text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faEnvelopeOpenText} className="text-xl" />
                </div>
                <div>
                  <div className="text-3xl font-bold">{courrierStats.internes}</div>
                  <div className="text-teal-100 text-sm">Courriers internes</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 p-5 rounded-xl shadow-lg text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faEnvelope} className="text-xl" />
                </div>
                <div>
                  <div className="text-3xl font-bold">{courrierStats.externes}</div>
                  <div className="text-cyan-100 text-sm">Courriers externes</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-5 rounded-xl shadow-lg text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <FontAwesomeIcon icon={faArrowDown} className="text-xl" />
                </div>
                <div>
                  <div className="text-3xl font-bold">{courrierStats.entrants}</div>
                  <div className="text-indigo-100 text-sm">Courriers entrants</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement des statistiques...</p>
          </div>
        ) : viewMode === 'courriers' ? (
          /* Vue statistiques courriers avec graphiques circulaires */
          <div className="space-y-6">
            {/* Graphiques principaux */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Graphique Type */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
                    <FontAwesomeIcon icon={faEnvelope} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Répartition par Type</h3>
                    <p className="text-sm text-gray-500">Internes vs Externes</p>
                  </div>
                </div>
                {courrierStats.total > 0 ? (
                  <div className="h-64">
                    <Pie 
                      data={{
                        labels: ['Courriers Internes', 'Courriers Externes'],
                        datasets: [{
                          data: [courrierStats.internes, courrierStats.externes],
                          backgroundColor: [
                            'rgba(20, 184, 166, 0.9)',
                            'rgba(6, 182, 212, 0.9)'
                          ],
                          borderColor: '#ffffff',
                          borderWidth: 2,
                          hoverOffset: 4
                        }]
                      }}
                      options={pieOptions}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-400">
                    Aucune donnée disponible
                  </div>
                )}
              </div>

              {/* Graphique Sens */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <FontAwesomeIcon icon={faArrowRight} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Répartition par Sens</h3>
                    <p className="text-sm text-gray-500">Entrants vs Sortants</p>
                  </div>
                </div>
                {courrierStats.total > 0 ? (
                  <div className="h-64">
                    <Pie 
                      data={{
                        labels: ['Courriers Entrants', 'Courriers Sortants'],
                        datasets: [{
                          data: [courrierStats.entrants, courrierStats.sortants],
                          backgroundColor: [
                            'rgba(99, 102, 241, 0.9)',
                            'rgba(139, 92, 246, 0.9)'
                          ],
                          borderColor: '#ffffff',
                          borderWidth: 2,
                          hoverOffset: 4
                        }]
                      }}
                      options={pieOptions}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-400">
                    Aucune donnée disponible
                  </div>
                )}
              </div>
            </div>

            {/* Graphique combiné */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <FontAwesomeIcon icon={faChartPie} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Répartition Type × Sens</h3>
                  <p className="text-sm text-gray-500">Vue croisée des courriers</p>
                </div>
              </div>
              {courrierStats.total > 0 ? (
                <div className="flex justify-center">
                  <div className="w-full max-w-md h-80">
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
                            courrierStats.internesEntrants,
                            courrierStats.internesSortants,
                            courrierStats.externesEntrants,
                            courrierStats.externesSortants
                          ],
                          backgroundColor: [
                            'rgba(34, 197, 94, 0.9)',
                            'rgba(59, 130, 246, 0.9)',
                            'rgba(251, 146, 60, 0.9)',
                            'rgba(168, 85, 247, 0.9)'
                          ],
                          borderColor: '#ffffff',
                          borderWidth: 3,
                          hoverOffset: 8
                        }]
                      }}
                      options={{
                        ...pieOptions,
                        cutout: '40%',
                        plugins: {
                          ...pieOptions.plugins,
                          legend: {
                            ...pieOptions.plugins.legend,
                            position: 'right' as const
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-80 text-gray-400">
                  Aucune donnée disponible
                </div>
              )}
            </div>

            {/* Tableau de détail */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">Détail des statistiques</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Par Type */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Par Type</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-teal-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-teal-500" />
                          <span className="font-medium text-gray-700">Courriers Internes</span>
                        </div>
                        <span className="font-bold text-gray-900">{courrierStats.internes}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-cyan-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-cyan-500" />
                          <span className="font-medium text-gray-700">Courriers Externes</span>
                        </div>
                        <span className="font-bold text-gray-900">{courrierStats.externes}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Par Sens */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Par Sens</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-indigo-500" />
                          <span className="font-medium text-gray-700">Courriers Entrants</span>
                        </div>
                        <span className="font-bold text-gray-900">{courrierStats.entrants}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-violet-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-violet-500" />
                          <span className="font-medium text-gray-700">Courriers Sortants</span>
                        </div>
                        <span className="font-bold text-gray-900">{courrierStats.sortants}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Vue catégories (existante) */
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            {renderCategoryStatsTree(categoryStats)}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatistiquesCategoriesCourriers;
