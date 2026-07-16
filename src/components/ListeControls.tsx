import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSort,
  faSortUp,
  faSortDown,
  faCalendarAlt,
  faUser,
  faBuilding,
  faFileAlt,
  faExclamationTriangle,
  faSearch,
  faTimes,
  faPlus,
  faFileImport,
  faFileExport,
  faChevronDown
} from '@fortawesome/free-solid-svg-icons';
import { StatutCourrier, TypeCourrier, SensCourrier, Priorite } from '../types';

export interface SortOption {
  field: string;
  label: string;
  icon: any;
}

export interface GroupOption {
  field: string;
  label: string;
  icon: any;
}

interface ListeControlsProps {
  // Tri
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (field: string, direction: 'asc' | 'desc') => void;
  
  // Groupement
  groupBy: string;
  onGroupChange: (field: string) => void;
  
  // Recherche
  searchTerm: string;
  onSearchChange: (term: string) => void;
  
  // Actions rapides (Nouveau / Importer / Exporter)
  onNewClick?: () => void;
  onImportClick?: () => void;
  onExportClick?: () => void;
  importLabel?: string;
  importing?: boolean;
  
  // Compteurs
  totalResults: number;
  filteredResults: number;
  
  // Actions
  onClearFilters: () => void;
  
  className?: string;
}

const ListeControls: React.FC<ListeControlsProps> = ({
  sortField,
  sortDirection,
  onSortChange,
  groupBy,
  onGroupChange,
  searchTerm,
  onSearchChange,
  totalResults,
  filteredResults,
  onClearFilters,
  onNewClick,
  onImportClick,
  onExportClick,
  importLabel,
  importing,
  className = ''
}) => {
  const sortOptions: SortOption[] = [
    { field: 'dateEnregistrement', label: 'Date d\'enregistrement', icon: faCalendarAlt },
    { field: 'dateReception', label: 'Date de réception', icon: faCalendarAlt },
    { field: 'numero', label: 'Numéro', icon: faFileAlt },
    { field: 'objet', label: 'Objet', icon: faFileAlt },
    { field: 'expediteur', label: 'Expéditeur', icon: faUser },
    { field: 'destinataire', label: 'Destinataire', icon: faUser },
    { field: 'statut', label: 'Statut', icon: faExclamationTriangle },
    { field: 'priorite', label: 'Priorité', icon: faExclamationTriangle }
  ];

  const groupOptions: GroupOption[] = [
    { field: 'none', label: 'Aucun groupement', icon: faFileAlt },
    { field: 'statut', label: 'Par statut', icon: faExclamationTriangle },
    { field: 'type', label: 'Par type', icon: faFileAlt },
    { field: 'sens', label: 'Par sens', icon: faFileAlt },
    { field: 'priorite', label: 'Par priorité', icon: faExclamationTriangle },
    { field: 'direction', label: 'Par direction', icon: faBuilding },
    { field: 'expediteur', label: 'Par expéditeur', icon: faUser }
  ];

  const hasActiveFilters = searchTerm;
  const hasActions = onNewClick || onImportClick || onExportClick;

  const getSortIcon = (field: string) => {
    if (sortField !== field) return faSort;
    return sortDirection === 'asc' ? faSortUp : faSortDown;
  };

  const handleSortClick = (field: string) => {
    if (sortField === field) {
      onSortChange(field, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(field, 'asc');
    }
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {/* Actions rapides : Nouveau / Importer / Exporter */}
      {hasActions && (
        <div className="px-6 pt-4 pb-2 border-b border-slate-100 bg-gradient-to-r from-primary-50 to-primary-100/50">
          <div className="flex items-center gap-2 flex-wrap">
            {onNewClick && (
              <button
                onClick={onNewClick}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
              >
                <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                <span>Nouveau</span>
              </button>
            )}
            {onImportClick && (
              <button
                onClick={onImportClick}
                disabled={importing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faFileImport} className={`w-3 h-3 ${importing ? 'animate-spin' : ''}`} />
                <span>{importLabel || 'Importer'}</span>
              </button>
            )}
            {onExportClick && (
              <button
                onClick={onExportClick}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
              >
                <FontAwesomeIcon icon={faFileExport} className="w-3 h-3" />
                <span>Exporter</span>
              </button>
            )}
          </div>
        </div>
      )}
      {/* En-tête avec contrôles principaux */}
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-primary-50 to-primary-100/50">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            {/* Contrôles d'organisation et tri intégrés */}
            <div className="flex items-center gap-4">
              {/* Organiser par */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Organiser par</label>
                <select
                  value={groupBy}
                  onChange={(e) => onGroupChange(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/25 transition-all min-w-[140px]"
                >
                  {groupOptions.map((option) => (
                    <option key={option.field} value={option.field}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Trier par */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Trier par</label>
                <div className="flex gap-1">
                  <select
                    value={sortField}
                    onChange={(e) => onSortChange(e.target.value, sortDirection)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-l-lg text-sm text-slate-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/25 transition-all min-w-[140px]"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.field} value={option.field}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSortClick(sortField)}
                    className={`px-3 py-1.5 border border-l-0 border-slate-200 rounded-r-lg transition-all hover:bg-slate-50 ${
                      sortDirection === 'desc' ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-white text-slate-500'
                    }`}
                    title={`Tri ${sortDirection === 'asc' ? 'croissant' : 'décroissant'}`}
                  >
                    <FontAwesomeIcon icon={getSortIcon(sortField)} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-white/50 rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              Effacer les filtres
            </button>
          )}
        </div>
      </div>

      {/* Recherche uniquement */}
      <div className="p-4">
        <div className="relative">
          <FontAwesomeIcon 
            icon={faSearch} 
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" 
          />
          <input
            type="text"
            placeholder="Rechercher par numéro, objet, expéditeur..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-12 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ListeControls;