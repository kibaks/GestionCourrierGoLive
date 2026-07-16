import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { procedureService } from '../services/procedureService';
import { courrierService } from '../services/courrierService';
import { userService } from '../services/userService';
import { organigrammeService } from '../services/organigrammeService';
import { ProcedureInstance, ProcedureActionInstance, ProcedureEventInstance, Role, WorkflowActivity, Utilisateur } from '../types';
import SearchableSelect from '../components/SearchableSelect';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCalendar,
  faClock,
  faCheckCircle,
  faExclamationTriangle,
  faInfoCircle,
  faUser,
  faFile,
  faChevronLeft,
  faChevronRight,
  faFilter,
  faList,
  faCalendarWeek,
  faCalendarDay,
  faCalendarAlt,
  faArrowRight,
  faInbox
} from '@fortawesome/free-solid-svg-icons';

const Planning: React.FC = () => {
  const { user, hasRole } = useAuth();
  const [instances, setInstances] = useState<ProcedureInstance[]>([]);
  const [filteredInstances, setFilteredInstances] = useState<ProcedureInstance[]>([]);
  const [workflowActivities, setWorkflowActivities] = useState<WorkflowActivity[]>([]);
  const [filteredWorkflowActivities, setFilteredWorkflowActivities] = useState<WorkflowActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'agenda'>('agenda');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [activityType] = useState<'all' | 'procedures' | 'workflows'>('all');
  const [selectedActivity, setSelectedActivity] = useState<WorkflowActivity | null>(null);

  const startOfDay = (d: Date | string | number) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const endOfDay = (d: Date | string | number) => {
    const date = new Date(d);
    date.setHours(23, 59, 59, 999);
    return date;
  };

  const isSameDay = (a: Date | string | number, b: Date | string | number) => {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear()
      && da.getMonth() === db.getMonth()
      && da.getDate() === db.getDate();
  };

  const visibleUsers = useMemo((): Utilisateur[] => {
    if (!user) return [];
    try {
      return organigrammeService.getUsersFromOrganigramme(user);
    } catch {
      return userService.getVisibleUsers(user.id);
    }
  }, [user]);

  const getCountdownInfo = (item: ProcedureActionInstance | WorkflowActivity) => {
    const deadline = 'dateFinPrevue' in item ? new Date(item.dateFinPrevue) : null;
    if (!deadline) return null;
    const now = new Date();
    const diffMs = deadline.getTime() - now.getTime();
    const overdue = diffMs < 0;
    const absMs = Math.abs(diffMs);
    const days = Math.floor(absMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absMs / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((absMs / (1000 * 60)) % 60);
    const textParts = [];
    if (days) textParts.push(`${days}j`);
    if (hours || days) textParts.push(`${hours}h`);
    else textParts.push(`${minutes}m`);
    const label = overdue ? `En retard de ${textParts.join(' ')}` : `Reste ${textParts.join(' ')}`;
    // urgent si moins de 24h restant ou déjà en retard
    const urgent = overdue || diffMs <= 24 * 60 * 60 * 1000;
    return { label, overdue, urgent };
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        loadInstances();
        await loadWorkflowActivities();
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyFilters();
  }, [instances, selectedUserId, workflowActivities, activityType]);

  const loadInstances = () => {
    let allInstances = procedureService.getAllProcedureInstances();
    
    if (user) {
      if (hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL) || hasRole(Role.SECRETAIRE)) {
        // Voir toutes les instances
      } else {
        allInstances = procedureService.getProcedureInstancesByUser(user.id);
      }
    }
    
    setInstances(allInstances);
  };

  const loadWorkflowActivities = async () => {
    try {
      // Utiliser la version asynchrone si disponible
      const activities = await (courrierService as any).getWorkflowActivitiesAsync?.() || courrierService.getWorkflowActivities();
      
      let filtered = activities;
      if (user) {
        const isSuper = hasRole(Role.SUPER_ADMIN) || hasRole(Role.DIRECTEUR_GENERAL) || hasRole(Role.SECRETAIRE);
        const isOrgManager = hasRole(Role.DIRECTEUR) || hasRole(Role.CHEF_SERVICE);

        if (!isSuper) {
          if (isOrgManager) {
            filtered = activities.filter((a: WorkflowActivity) => {
              const assignee = userService.getUserById(a.assigneA);
              if (!assignee) return false;
              if (user.direction && assignee.direction && assignee.direction !== user.direction) return false;
              if (user.service && assignee.service && assignee.service !== user.service) return false;
              return true;
            });
          } else {
            // Agent : seulement ses propres activités
            filtered = activities.filter((a: WorkflowActivity) => a.assigneA === user.id);
          }
        }
      }

      const sorted = [...filtered].sort((a, b) =>
        new Date(a.dateDebutPrevue).getTime() - new Date(b.dateDebutPrevue).getTime()
      );
      setWorkflowActivities(sorted);
    } catch (error) {
      console.error('Erreur lors du chargement des activités de workflow:', error);
      setWorkflowActivities([]);
    }
  };

  const applyFilters = () => {
    let filtered = [...instances];
    let filteredWorkflows = [...workflowActivities];
    
    if (selectedUserId) {
      filtered = filtered.filter(instance => 
        instance.acteurs.includes(selectedUserId) ||
        instance.evenements.some(e => e.actions.some(a => a.acteurId === selectedUserId))
      );
      filteredWorkflows = filteredWorkflows.filter(activity => activity.assigneA === selectedUserId);
    }
    
    setFilteredInstances(filtered);
    setFilteredWorkflowActivities(filteredWorkflows);
  };

  const getActionsForDate = (date: Date): (ProcedureActionInstance | WorkflowActivity)[] => {
    const actions: (ProcedureActionInstance | WorkflowActivity)[] = [];
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    
    if (activityType === 'all' || activityType === 'procedures') {
      filteredInstances.forEach(instance => {
        instance.evenements.forEach(event => {
          event.actions.forEach(action => {
            const actionDate = new Date(action.dateFinPrevue);
            if (isSameDay(actionDate, dayStart)) {
              actions.push(action);
            }
          });
        });
      });
    }
    
    if (activityType === 'all' || activityType === 'workflows') {
      filteredWorkflowActivities.forEach(activity => {
        const dateDebut = startOfDay(activity.dateDebutPrevue);
        const dateFin = endOfDay(activity.dateFinPrevue);
        if (dayStart >= dateDebut && dayStart <= dateFin) {
          actions.push(activity);
        }
      });
    }
    
    return actions.sort((a, b) => {
      const dateA = 'dateDebutPrevue' in a 
        ? (a as WorkflowActivity).dateDebutPrevue 
        : (a as ProcedureActionInstance).dateFinPrevue;
      const dateB = 'dateDebutPrevue' in b 
        ? (b as WorkflowActivity).dateDebutPrevue 
        : (b as ProcedureActionInstance).dateFinPrevue;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
  };

  const getDaysInView = (): Date[] => {
    const days: Date[] = [];
    const start = new Date(currentDate);
    
    if (viewMode === 'day') {
      days.push(new Date(start));
    } else if (viewMode === 'week' || viewMode === 'agenda') {
      const dayOfWeek = start.getDay();
      const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      start.setDate(diff);
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        days.push(date);
      }
    } else {
      start.setDate(1);
      const dayOfWeek = start.getDay();
      const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      start.setDate(diff);
      
      for (let i = 0; i < 35; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        days.push(date);
      }
    }
    
    return days;
  };

  const getActionStatusColor = (statut: string) => {
    switch (statut) {
      case 'TERMINE':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'EN_COURS':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'BLOQUE':
      case 'REJETE':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-amber-100 text-amber-700 border-amber-200';
    }
  };

  const getActionStatusIcon = (statut: string) => {
    switch (statut) {
      case 'TERMINE':
        return faCheckCircle;
      case 'EN_COURS':
        return faClock;
      case 'REJETE':
        return faExclamationTriangle;
      default:
        return faInfoCircle;
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week' || viewMode === 'agenda') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  const getActionDetails = (action: ProcedureActionInstance | WorkflowActivity, instance?: ProcedureInstance) => {
    if ('courrierId' in action) {
      const workflowActivity = action as WorkflowActivity;
      const courrier = courrierService.getCourrierById(workflowActivity.courrierId);
      const assignedUser = userService.getUserById(workflowActivity.assigneA);
      return {
        type: 'workflow',
        courrier,
        workflowActivity,
        assignedUser,
        label: workflowActivity.etape,
        description: `Courrier: ${workflowActivity.courrierNumero} - ${workflowActivity.courrierObjet}`
      };
    }
    
    if (!instance) return null;
    const procedure = procedureService.getProcedureById(instance.procedureId);
    if (!procedure) return null;
    
    const event = procedure.evenements.find(e => 
      instance.evenements.some(ie => ie.eventId === e.id && ie.actions.some(ia => ia.id === (action as ProcedureActionInstance).id))
    );
    if (!event) return null;
    
    const originalAction = event.actions.find(a => 
      instance.evenements.some(e => e.actions.some(ia => ia.actionId === a.id && ia.id === (action as ProcedureActionInstance).id))
    );
    
    return { 
      type: 'procedure',
      procedure, 
      event, 
      originalAction 
    };
  };

  const days = getDaysInView();
  const allActivities = filteredWorkflowActivities
    .filter(activity => {
      const activityDate = new Date(activity.dateDebutPrevue);
      const weekStart = startOfDay(days[0]);
      const weekEnd = endOfDay(days[6] || days[days.length - 1]);
      return activityDate >= weekStart && activityDate <= weekEnd;
    })
    .sort((a, b) => new Date(a.dateDebutPrevue).getTime() - new Date(b.dateDebutPrevue).getTime());

  return (
    <div className="space-y-8">
      {/* En-tête professionnel */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-800 to-blue-900 px-8 py-8 shadow-xl border border-slate-700/50">
        <div className="absolute inset-0 bg-mesh opacity-40" aria-hidden />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center shadow-lg border border-white/20">
              <FontAwesomeIcon icon={faCalendarAlt} className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Planning des activités
              </h1>
              <p className="mt-1 text-slate-300 text-sm sm:text-base">
                Visualisez et gérez les activités sur un calendrier
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres et vues */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Filtres et affichage</h2>
        </div>
        <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[240px]">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <FontAwesomeIcon icon={faFilter} className="text-slate-400 text-[10px]" />
                Utilisateur
              </label>
              <SearchableSelect
                options={visibleUsers.map(u => ({
                  value: u.id,
                  label: `${u.nom}${u.email ? ` — ${u.email}` : ''} (${u.role?.replace('_', ' ') || ''})`,
                  avatarUrl: u.photoUrl,
                  avatarLabel: u.nom?.charAt(0)?.toUpperCase() || '?'
                }))}
                value={selectedUserId}
                onChange={setSelectedUserId}
                emptyOption="Tous les utilisateurs"
                searchPlaceholder="Rechercher par nom ou email..."
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Vue</label>
            <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
              {[
                { id: 'agenda', icon: faList, label: 'Agenda' },
                { id: 'day', icon: faCalendarDay, label: 'Jour' },
                { id: 'week', icon: faCalendarWeek, label: 'Semaine' },
                { id: 'month', icon: faCalendar, label: 'Mois' },
              ].map((view) => (
                <button
                  key={view.id}
                  onClick={() => setViewMode(view.id as any)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                    viewMode === view.id 
                      ? 'bg-white text-blue-600 shadow-md border border-slate-200' 
                      : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                  }`}
                >
                  <FontAwesomeIcon icon={view.icon} className="w-4 h-4" />
                  <span className="hidden sm:inline">{view.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation de date */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => navigateDate('prev')}
          className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          aria-label="Période précédente"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="w-5 h-5" />
        </button>
        <div className="text-center min-w-0 flex-1 px-4">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
            {viewMode === 'day' 
              ? currentDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : viewMode === 'week' || viewMode === 'agenda'
              ? `Semaine du ${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${days[6]?.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) || ''}`
              : currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
            }
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDate('next')}
            className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            aria-label="Période suivante"
          >
            <FontAwesomeIcon icon={faChevronRight} className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold text-sm shadow-md shadow-blue-500/25 hover:from-blue-600 hover:to-blue-700 transition-all"
          >
            Aujourd'hui
          </button>
        </div>
      </div>

      {/* Vue Agenda */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden">
        {viewMode === 'agenda' && (
          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin" />
                <p className="text-sm text-slate-500">Chargement du planning en cours...</p>
              </div>
            ) : allActivities.length === 0 ? (
              <div className="text-center py-20 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5 shadow-inner">
                  <FontAwesomeIcon icon={faInbox} className="w-9 h-9 text-slate-400" />
                </div>
                <p className="text-lg font-semibold text-slate-600">Aucune activité pour cette période</p>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Modifiez les filtres ou la période pour afficher les étapes de workflow.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {allActivities.map((activity) => {
                  const details = getActionDetails(activity);
                  if (!details || details.type !== 'workflow') return null;
                  
                  const dateDebut = new Date(activity.dateDebutPrevue);
                  const dateFin = new Date(activity.dateFinPrevue);
                  const isSelected = selectedActivity?.id === activity.id;
                  const assignee = details.assignedUser;
                  const initial = assignee?.nom?.charAt(0)?.toUpperCase() || '?';
                  
                  return (
                    <div
                      key={activity.id}
                      onClick={() => setSelectedActivity(isSelected ? null : activity)}
                      className={`rounded-2xl border-2 p-5 cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-blue-400 bg-blue-50/80 shadow-lg shadow-blue-500/10' 
                          : 'border-slate-200 hover:border-blue-200 hover:shadow-md bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-20 text-center py-2 px-3 rounded-xl bg-slate-100 border border-slate-200">
                          <div className="text-base font-bold text-slate-900">
                            {dateDebut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 font-medium">
                            {dateDebut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        
                        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border ${getActionStatusColor(activity.statut)}`}>
                          <FontAwesomeIcon icon={getActionStatusIcon(activity.statut)} className="w-5 h-5" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-slate-900 text-lg mb-1">
                                {activity.etape}
                              </h3>
                              <div className="text-sm text-slate-600 mb-2 flex items-center gap-2 flex-wrap">
                                <FontAwesomeIcon icon={faFile} className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                <span className="font-medium">Courrier {activity.courrierNumero}:</span>
                                <span className="truncate">{activity.courrierObjet}</span>
                              </div>
                              {assignee && (
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                  <span className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
                                    {assignee.photoUrl ? (
                                      <img src={assignee.photoUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      initial
                                    )}
                                  </span>
                                  <span className="font-medium text-slate-700">{assignee.nom}</span>
                                </div>
                              )}
                              {['EN_ATTENTE', 'EN_COURS'].includes(activity.statut) && (
                                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                                  <FontAwesomeIcon icon={faClock} className="w-3.5 h-3.5" />
                                  <span>{getCountdownInfo(activity)?.label || 'En attente'}</span>
                                  {getCountdownInfo(activity)?.urgent && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10px]">
                                      Urgent
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${getActionStatusColor(activity.statut)}`}>
                              {activity.statut.replace('_', ' ')}
                            </span>
                          </div>
                          
                          {isSelected && (
                            <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm animate-fade-in">
                              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                                <span className="font-semibold text-slate-500 text-xs uppercase tracking-wide">Date de début</span>
                                <div className="text-slate-800 mt-0.5">
                                  {dateDebut.toLocaleString('fr-FR', { 
                                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                  })}
                                </div>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                                <span className="font-semibold text-slate-500 text-xs uppercase tracking-wide">Date de fin</span>
                                <div className="text-slate-800 mt-0.5">
                                  {dateFin.toLocaleString('fr-FR', { 
                                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                  })}
                                </div>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                                <span className="font-semibold text-slate-500 text-xs uppercase tracking-wide">Durée estimée</span>
                                <div className="text-slate-800 mt-0.5">{activity.dureeEstimee ? `${activity.dureeEstimee}h` : 'Non spécifiée'}</div>
                              </div>
                              {activity.ordre != null && (
                                <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                                  <span className="font-semibold text-slate-500 text-xs uppercase tracking-wide">Ordre</span>
                                  <div className="text-slate-800 mt-0.5">{activity.ordre}</div>
                                </div>
                              )}
                              {details.courrier && (
                                <div className="sm:col-span-2">
                                  <Link
                                    to={`/courriers/${details.courrier.id}`}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition-colors shadow-md shadow-blue-500/20"
                                  >
                                    Voir le courrier
                                    <FontAwesomeIcon icon={faArrowRight} className="w-3.5 h-3.5" />
                                  </Link>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Vue Mois */}
        {viewMode === 'month' && !loading && (
          <div className="p-6">
            <div className="grid grid-cols-7 gap-2 mb-3">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                <div key={day} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 border-b border-slate-100">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map((day, idx) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = day.toDateString() === new Date().toDateString();
                const dayActions = getActionsForDate(day);
                
                return (
                  <div
                    key={idx}
                    className={`min-h-[100px] p-2.5 rounded-xl border transition-all ${
                      !isCurrentMonth ? 'bg-slate-50/80 border-slate-100' : 
                      isToday ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className={`text-sm font-bold mb-2 ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayActions.slice(0, 2).map((action, actionIdx) => {
                        const details = getActionDetails(action);
                        if (!details) return null;
                        
                        return (
                          <div
                            key={actionIdx}
                            className={`p-1.5 rounded-lg text-xs font-medium truncate border ${getActionStatusColor(action.statut)}`}
                          >
                            {details.type === 'workflow' ? details.label : ''}
                          </div>
                        );
                      })}
                      {dayActions.length > 2 && (
                        <div className="text-xs text-slate-500 font-medium pt-0.5">
                          +{dayActions.length - 2} autres
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Vue Semaine */}
        {viewMode === 'week' && !loading && (
          <div className="overflow-x-auto">
            <div className="min-w-[800px] p-6">
              <div className="grid grid-cols-7 gap-2 mb-4">
                {days.map(day => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <div key={day.toDateString()} className={`text-center py-2 px-3 rounded-xl ${isToday ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 border border-slate-100'}`}>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{day.toLocaleDateString('fr-FR', { weekday: 'short' })}</div>
                      <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-blue-600' : 'text-slate-900'}`}>
                        {day.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {days.map(day => {
                  const dayActions = getActionsForDate(day);
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <div key={day.toDateString()} className={`min-h-[200px] p-3 rounded-xl space-y-2 border ${isToday ? 'bg-blue-50/30 border-blue-200' : 'bg-slate-50/80 border-slate-100'}`}>
                      {dayActions.map((action, idx) => {
                        const details = getActionDetails(action);
                        if (!details || details.type !== 'workflow') return null;
                        
                        return (
                          <div key={idx} className={`p-2.5 rounded-xl text-xs border ${getActionStatusColor(action.statut)}`}>
                            <div className="font-semibold truncate">{details.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Vue Jour */}
        {viewMode === 'day' && !loading && (
          <div className="p-6">
            <div className="text-center mb-8 py-4 rounded-2xl bg-gradient-to-r from-slate-50 to-blue-50/50 border border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">
                {currentDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
            </div>
            <div className="space-y-4">
              {getActionsForDate(currentDate).map((action, idx) => {
                const details = getActionDetails(action);
                if (!details || details.type !== 'workflow') return null;
                
                const countdown = ['EN_ATTENTE', 'EN_COURS'].includes(action.statut) ? getCountdownInfo(action) : null;
                return (
                  <div key={idx} className={`p-5 rounded-2xl border-2 ${getActionStatusColor(action.statut)}`}>
                    <div className="flex items-center gap-4">
                      <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${getActionStatusColor(action.statut)}`}>
                        <FontAwesomeIcon icon={getActionStatusIcon(action.statut)} className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900">{details.label}</div>
                        <div className="text-sm text-slate-600 mt-0.5">{details.description}</div>
                        {countdown && (
                          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                            <FontAwesomeIcon icon={faClock} className="w-3.5 h-3.5" />
                            <span>{countdown.label}</span>
                            {countdown.urgent && (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10px]">
                                Urgent
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {getActionsForDate(currentDate).length === 0 && (
                <div className="text-center py-16 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                  <FontAwesomeIcon icon={faCalendarDay} className="w-12 h-12 text-slate-300 mb-4" />
                  <p className="text-slate-600 font-medium">Aucune activité prévue pour ce jour</p>
                  <p className="text-sm text-slate-500 mt-1">Modifiez la date ou les filtres pour afficher des activités.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Planning;
