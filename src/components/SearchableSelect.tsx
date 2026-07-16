import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faSearch } from '@fortawesome/free-solid-svg-icons';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** URL de la photo de profil (affichée à gauche du libellé) */
  avatarUrl?: string;
  /** Initiale(s) affichée(s) dans un cercle si pas de avatarUrl (ex. "JD" pour John Doe) */
  avatarLabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyOption?: string;
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Sélectionner...',
  emptyOption,
  disabled = false,
  className = '',
  searchPlaceholder = 'Rechercher...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const selectedOption = value ? options.find((o) => o.value === value) : null;
  const selectedLabel = value
    ? (emptyOption && value === '' ? emptyOption : selectedOption?.label ?? value)
    : emptyOption ?? placeholder;

  const filteredOptions = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  // Calculer la position du dropdown quand il s'ouvre
  const updateDropdownPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      top: rect.bottom + 4,
      width: rect.width,
      zIndex: 99999,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
    }
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [isOpen, updateDropdownPosition]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const dropdownContent = isOpen ? (
    <div ref={dropdownRef} style={dropdownStyle} className="rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="p-2 border-b border-slate-100 bg-slate-50/80">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {emptyOption !== undefined && (
          <button
            type="button"
            onClick={() => handleSelect('')}
            className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2 ${
              value === '' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {emptyOption}
          </button>
        )}
        {filteredOptions.length === 0 ? (
          <div className="px-4 py-4 text-sm text-slate-500 text-center">Aucun résultat</div>
        ) : (
          filteredOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-3 ${
                value === opt.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {(opt.avatarUrl || opt.avatarLabel) && (
                <span className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold">
                  {opt.avatarUrl ? (
                    <img src={opt.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    opt.avatarLabel || opt.label.charAt(0)?.toUpperCase() || '?'
                  )}
                </span>
              )}
              <span className="truncate">{opt.label}</span>
            </button>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 pl-4 pr-10 py-3 border rounded-xl text-sm text-left transition-all ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {selectedOption && (selectedOption.avatarUrl || selectedOption.avatarLabel) && (
            <span className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
              {selectedOption.avatarUrl ? (
                <img src={selectedOption.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                selectedOption.avatarLabel || selectedOption.label.charAt(0)?.toUpperCase() || '?'
              )}
            </span>
          )}
          <span className="truncate">{selectedLabel}</span>
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
};

export default SearchableSelect;
