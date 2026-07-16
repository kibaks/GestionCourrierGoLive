import React from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartPie, faThLarge, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

interface StatsViewToggleProps {
  view: 'cards' | 'charts' | 'none';
  onChange: (view: 'cards' | 'charts' | 'none') => void;
  className?: string;
}

const StatsViewToggle: React.FC<StatsViewToggleProps> = ({ view, onChange, className = '' }) => {
  return (
    <div className={`inline-flex items-center bg-slate-100 rounded-xl p-1 ${className}`}>
      <button
        onClick={() => onChange('cards')}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
          view === 'cards'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
        title="Vue cartes"
      >
        <FontAwesomeIcon icon={faThLarge} className="w-4 h-4" />
        <span className="hidden sm:inline">Cartes</span>
      </button>
      <button
        onClick={() => onChange('charts')}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
          view === 'charts'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
        title="Vue graphiques"
      >
        <FontAwesomeIcon icon={faChartPie} className="w-4 h-4" />
        <span className="hidden sm:inline">Graphiques</span>
      </button>
      <button
        onClick={() => onChange('none')}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
          view === 'none'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
        title="Masquer les statistiques"
      >
        <FontAwesomeIcon icon={faEyeSlash} className="w-4 h-4" />
        <span className="hidden sm:inline">Aucune</span>
      </button>
    </div>
  );
};

export default StatsViewToggle;