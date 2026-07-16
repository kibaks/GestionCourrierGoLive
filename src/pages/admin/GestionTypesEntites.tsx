import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { entiteTypeService } from '../../services/entiteTypeService';
import { EntiteTypeDefinition, TypeEntiteOrganisationnelle } from '../../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEdit,
  faToggleOn,
  faToggleOff,
  faSearch,
  faFilter,
  faTimes,
  faEllipsisV,
  faBuilding,
  faSitemap,
  faLayerGroup,
  faColumns,
  faBriefcase,
  faCube,
  faInfoCircle,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';

// Portail admin pour que les modals couvrent tout l'écran
const AdminPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

const GestionTypesEntites: React.FC = () => {
  const [types, setTypes] = useState<EntiteTypeDefinition[]>([]);
  const [editing, setEditing] = useState<EntiteTypeDefinition | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    libelleSingulier: '',
    libellePluriel: '',
    description: '',
    icone: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActif, setFilterActif] = useState<'all' | 'actif' | 'inactif'>('all');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [selectedTypeForResume, setSelectedTypeForResume] = useState<EntiteTypeDefinition | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      await entiteTypeService.syncFromApi();
      if (!cancelled) {
        setTypes(entiteTypeService.getAll().sort((a, b) => a.ordre - b.ordre));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const ENTITE_CODES: { value: TypeEntiteOrganisationnelle; label: string }[] = [
    { value: 'direction', label: 'Direction' },
    { value: 'service', label: 'Service' },
    { value: 'sous-service', label: 'Sous-service' },
    { value: 'division', label: 'Division' },
    { value: 'bureau', label: 'Bureau' },
    { value: 'cellule', label: 'Cellule' }
  ];

  const ICON_OPTIONS: { key: string; label: string; icon: any }[] = [
    { key: 'building', label: 'Bâtiment / Direction', icon: faBuilding },
    { key: 'sitemap', label: 'Organigramme / Service', icon: faSitemap },
    { key: 'layer-group', label: 'Sous-niveaux / Groupes', icon: faLayerGroup },
    { key: 'columns', label: 'Division', icon: faColumns },
    { key: 'briefcase', label: 'Bureau / Fonction', icon: faBriefcase },
    { key: 'cube', label: 'Cellule / Unité', icon: faCube }
  ];

  const startEdit = (t: EntiteTypeDefinition) => {
    setEditing(t);
    setIsCreating(false);
    setFormData({
      libelleSingulier: t.libelleSingulier,
      libellePluriel: t.libellePluriel,
      description: t.description || '',
      icone: t.icone || ICON_OPTIONS.find(o => o.key === t.icone)?.key || ''
    });
    setCurrentStep(1);
  };

  const handleSave = async () => {
    if (!editing) return;

    if (isCreating) {
      await entiteTypeService.create({
        code: editing.code,
        libelleSingulier: formData.libelleSingulier,
        libellePluriel: formData.libellePluriel,
        description: formData.description,
        icone: formData.icone || undefined
      });
      setTypes(entiteTypeService.getAll().sort((a, b) => a.ordre - b.ordre));
      setEditing(null);
      setIsCreating(false);
      setCurrentStep(1);
    } else {
      const updated = await entiteTypeService.update(editing.id, {
        libelleSingulier: formData.libelleSingulier,
        libellePluriel: formData.libellePluriel,
        description: formData.description,
        icone: formData.icone || undefined
      });
      if (updated) {
        setTypes(entiteTypeService.getAll().sort((a, b) => a.ordre - b.ordre));
        setEditing(null);
        setCurrentStep(1);
      }
    }
  };

  const handleStartCreate = () => {
    const nextOrdre = types.reduce((max, t) => Math.max(max, t.ordre || 0), 0) + 1;
    const defaultCode: TypeEntiteOrganisationnelle = 'direction';
    setEditing({
      id: '',
      code: defaultCode,
      libelleSingulier: '',
      libellePluriel: '',
      description: '',
      ordre: nextOrdre,
      actif: true,
      icone: undefined
    });
    setFormData({
      libelleSingulier: '',
      libellePluriel: '',
      description: '',
      icone: ''
    });
    setCurrentStep(1);
    setIsCreating(true);
  };

  const toggleActive = async (t: EntiteTypeDefinition) => {
    const updated = await entiteTypeService.update(t.id, { actif: !t.actif });
    if (updated) {
      setTypes(entiteTypeService.getAll().sort((a, b) => a.ordre - b.ordre));
      setSelectedTypes(prev => {
        const next = new Set(prev);
        if (next.has(t.id)) next.delete(t.id);
        return next;
      });
    }
  };

  const bulkSetActive = async (active: boolean) => {
    const all = entiteTypeService.getAll();
    const toUpdate = Array.from(selectedTypes)
      .map((id: string) => ({ id, t: all.find(tt => tt.id === id) }))
      .filter((x): x is { id: string; t: EntiteTypeDefinition } => !!x.t && x.t.actif !== active);
    await Promise.all(toUpdate.map(({ id }) => entiteTypeService.update(id, { actif: active })));
    setTypes(entiteTypeService.getAll().sort((a, b) => a.ordre - b.ordre));
    setSelectedTypes(new Set());
  };

  const formatCode = (code: TypeEntiteOrganisationnelle) =>
    code.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());

  const filteredTypes = types.filter((t) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      term === '' ||
      t.code.toLowerCase().includes(term) ||
      t.libelleSingulier.toLowerCase().includes(term) ||
      t.libellePluriel.toLowerCase().includes(term);

    const matchesActif =
      filterActif === 'all' ||
      (filterActif === 'actif' && t.actif) ||
     (filterActif === 'inactif' && !t.actif);

    return matchesSearch && matchesActif;
  });

  const handleSelectAll = () => {
    if (selectedTypes.size === filteredTypes.length) {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes(new Set(filteredTypes.map(t => t.id)));
    }
  };

  const handleSelectType = (id: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formSteps = [
    { id: 1, title: 'Libellés', description: 'Nommer le type d\'entité' },
    { id: 2, title: 'Icône', description: 'Choisir l\'icône associée' },
    { id: 3, title: 'Résumé', description: 'Vérifier les informations' }
  ];

  const canGoToNextStep = () => {
    if (!editing) return false;
    switch (currentStep) {
      case 1:
        return formData.libelleSingulier.trim() !== '' && formData.libellePluriel.trim() !== '';
      case 2:
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (currentStep < formSteps.length && canGoToNextStep()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Types d&apos;entités administratives</h2>
          <p className="text-sm text-gray-600 mt-1">
            Gérez les dénominations utilisées pour les Directions, Services, Divisions, etc.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            type="button"
            onClick={handleStartCreate}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <span className="text-base leading-none">+</span>
            Nouveau type d&apos;entité
          </button>
        </div>
      </div>

      {/* Filtres & recherche */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Recherche */}
          <div className="sm:col-span-2">
            <div className="relative">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par code ou libellé..."
                className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              )}
            </div>
          </div>

          {/* Filtre actif */}
          <div>
            <div className="relative">
              <FontAwesomeIcon
                icon={faFilter}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <select
                value={filterActif}
                onChange={(e) => setFilterActif(e.target.value as 'all' | 'actif' | 'inactif')}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">Tous les statuts</option>
                <option value="actif">Actifs uniquement</option>
                <option value="inactif">Inactifs uniquement</option>
              </select>
            </div>
          </div>
        </div>

        {/* Compteur */}
        <div className="mt-3 text-xs sm:text-sm text-gray-600 flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
            {filteredTypes.length}
          </span>
          type{filteredTypes.length > 1 ? 's' : ''} trouvé{filteredTypes.length > 1 ? 's' : ''}
          {(searchTerm || filterActif !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterActif('all');
              }}
              className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Sélection multiple */}
      {selectedTypes.size > 0 && (
        <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-xs sm:text-sm">
          <span className="text-blue-800 font-medium">
            {selectedTypes.size} type{selectedTypes.size > 1 ? 's' : ''} sélectionné{selectedTypes.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => bulkSetActive(true)}
              className="px-2 py-1 rounded-md text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200"
            >
              Activer
            </button>
            <button
              type="button"
              onClick={() => bulkSetActive(false)}
              className="px-2 py-1 rounded-md text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200"
            >
              Désactiver
            </button>
            <button
              type="button"
              onClick={() => setSelectedTypes(new Set())}
              className="px-2 py-1 rounded-md text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Tout désélectionner
            </button>
          </div>
        </div>
      )}

      {/* Datatable */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative min-h-[280px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-50/90 backdrop-blur-sm">
            <FontAwesomeIcon icon={faSpinner} className="w-10 h-10 text-amber-600 animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-600">Chargement des types d'entités…</p>
          </div>
        )}
        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={filteredTypes.length > 0 && selectedTypes.size === filteredTypes.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Libellé
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                  Pluriel
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTypes.length > 0 ? (
                filteredTypes.map((t) => (
                  <tr
                    key={t.id}
                    className={`hover:bg-blue-50/60 active:bg-blue-100 transition-all duration-200 cursor-pointer ${selectedTypes.has(t.id) ? 'bg-blue-50' : ''}`}
                    onClick={() => {
                      setSelectedTypeForResume(t);
                      setShowResumeModal(true);
                    }}
                  >
                    <td className="px-4 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={selectedTypes.has(t.id)}
                        onChange={() => handleSelectType(t.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                          <FontAwesomeIcon
                            icon={
                              ICON_OPTIONS.find(o => o.key === t.icone)?.icon || faBuilding
                            }
                            className="w-4 h-4"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-xs font-mono">
                            {t.code}
                          </span>
                          <span className="mt-1 text-xs text-gray-400">{formatCode(t.code)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-gray-900">
                      {t.libelleSingulier}
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-gray-700 hidden md:table-cell">
                      {t.libellePluriel}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-500 hidden md:table-cell">
                      {t.description || '—'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          t.actif
                            ? 'bg-green-50 text-green-700 border border-green-100'
                            : 'bg-gray-100 text-gray-500 border border-gray-200'
                        }`}
                      >
                        <FontAwesomeIcon
                          icon={t.actif ? faToggleOn : faToggleOff}
                          className={t.actif ? 'text-green-500' : 'text-gray-400'}
                        />
                        {t.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm text-gray-500"
                  >
                    Aucun type d&apos;entité trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de résumé */}
      {showResumeModal && selectedTypeForResume && (
        <AdminPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]" onClick={() => {
            setShowResumeModal(false);
            setSelectedTypeForResume(null);
          }}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Détails du type d'entité</h2>
                  <p className="text-sm text-gray-500 mt-1">Informations complètes</p>
                </div>
                <button
                  onClick={() => {
                    setShowResumeModal(false);
                    setSelectedTypeForResume(null);
                  }}
                  className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xl" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                    {(() => {
                      const iconOption = ICON_OPTIONS.find(o => o.key === selectedTypeForResume.icone);
                      return iconOption ? (
                        <FontAwesomeIcon icon={iconOption.icon} className="w-8 h-8 text-white" />
                      ) : (
                        <FontAwesomeIcon icon={faBuilding} className="w-8 h-8 text-white" />
                      );
                    })()}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selectedTypeForResume.libelleSingulier}</h3>
                    <p className="text-gray-600 mt-1">{selectedTypeForResume.libellePluriel}</p>
                    <span className={`inline-flex items-center gap-2 mt-2 px-3 py-1.5 text-xs font-bold rounded-xl ${
                      selectedTypeForResume.actif 
                        ? 'bg-green-100 text-green-700 border border-green-200' 
                        : 'bg-surface-100 text-surface-600 border border-surface-200'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${selectedTypeForResume.actif ? 'bg-green-500 animate-pulse' : 'bg-surface-400'}`} />
                      {selectedTypeForResume.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</label>
                    <p className="text-gray-900 mt-2 font-medium font-mono">{selectedTypeForResume.code}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ordre</label>
                    <p className="text-gray-900 mt-2 font-medium">{selectedTypeForResume.ordre}</p>
                  </div>
                  {selectedTypeForResume.description && (
                    <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</label>
                      <p className="text-gray-900 mt-2 font-medium">{selectedTypeForResume.description}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-white/95 backdrop-blur sticky bottom-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <FontAwesomeIcon icon={faInfoCircle} className="text-gray-400" />
                  <span>Actions sur ce type</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => {
                      setShowResumeModal(false);
                      setSelectedTypeForResume(null);
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={() => {
                      toggleActive(selectedTypeForResume);
                      setShowResumeModal(false);
                      setSelectedTypeForResume(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm"
                  >
                    <FontAwesomeIcon icon={selectedTypeForResume.actif ? faToggleOff : faToggleOn} />
                    <span>{selectedTypeForResume.actif ? 'Désactiver' : 'Activer'}</span>
                  </button>
                  <button
                    onClick={() => {
                      startEdit(selectedTypeForResume);
                      setShowResumeModal(false);
                      setSelectedTypeForResume(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <FontAwesomeIcon icon={faEdit} />
                    <span>Modifier</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </AdminPortal>
      )}

      {/* Modale d'édition en steps (portail pour overlay pleine page) */}
      {editing && (
        <AdminPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-gray-200 max-h-[90vh] flex flex-col">
            {/* Header + steps */}
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {isCreating ? 'Nouveau type d\'entité' : 'Modifier la dénomination'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isCreating ? (
                      'Renseignez les informations du type d\'entité.'
                    ) : (
                      <>
                        Type : <span className="font-mono">{editing.code}</span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setIsCreating(false);
                    setCurrentStep(1);
                  }}
                  className="text-gray-400 hover:text-gray-600 rounded-full p-1.5 hover:bg-gray-100 transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
              {/* Steps */}
              <div className="flex items-center justify-between">
                {formSteps.map((step, index) => (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                          currentStep >= step.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {step.id}
                      </div>
                      <span
                        className={`mt-1 text-[11px] font-medium ${
                          currentStep >= step.id ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                    {index < formSteps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-1 transition-colors ${
                          currentStep > step.id ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Corps du formulaire par step */}
            <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
              {currentStep === 1 && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Code technique
                    </label>
                    <select
                      disabled={!isCreating}
                      value={editing.code}
                      onChange={(e) =>
                        setEditing(prev =>
                          prev
                            ? { ...prev, code: e.target.value as TypeEntiteOrganisationnelle }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      {ENTITE_CODES.map(code => (
                        <option key={code.value} value={code.value}>
                          {code.label} ({code.value})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Libellé (singulier)
                    </label>
                    <input
                      type="text"
                      value={formData.libelleSingulier}
                      onChange={(e) => setFormData({ ...formData, libelleSingulier: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Libellé (pluriel)
                    </label>
                    <input
                      type="text"
                      value={formData.libellePluriel}
                      onChange={(e) => setFormData({ ...formData, libellePluriel: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                    />
                  </div>
                </>
              )}

              {currentStep === 2 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Icône associée
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {ICON_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setFormData({ ...formData, icone: opt.key })}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs gap-1 transition-colors ${
                          formData.icone === opt.key
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-blue-300 text-gray-700'
                        }`}
                      >
                        <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mb-1">
                          <FontAwesomeIcon icon={opt.icon} className="w-4 h-4" />
                        </span>
                        <span className="text-[11px] text-center">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-3 text-xs">
                  <p className="text-gray-600">
                    Vérifiez les informations avant d&apos;enregistrer.
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Code</span>
                      <span className="font-mono text-gray-900">{editing.code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Libellé (singulier)</span>
                      <span className="font-medium text-gray-900">
                        {formData.libelleSingulier || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Libellé (pluriel)</span>
                      <span className="font-medium text-gray-900">
                        {formData.libellePluriel || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Icône</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                          <FontAwesomeIcon
                            icon={
                              ICON_OPTIONS.find(o => o.key === formData.icone)?.icon ||
                              faBuilding
                            }
                            className="w-3 h-3 text-gray-700"
                          />
                        </span>
                        <span className="text-gray-700">
                          {
                            ICON_OPTIONS.find(o => o.key === formData.icone)?.label ||
                            'Par défaut'
                          }
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer steps */}
            <div className="px-5 py-3 border-t border-gray-200 rounded-b-2xl flex justify-between gap-2 bg-gray-50">
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 1) {
                    setEditing(null);
                    setCurrentStep(1);
                  } else {
                    prevStep();
                  }
                }}
                className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {currentStep === 1 ? 'Annuler' : 'Précédent'}
              </button>
              {currentStep < formSteps.length ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canGoToNextStep()}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Suivant
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Enregistrer
                </button>
              )}
            </div>
          </div>
        </div>
        </AdminPortal>
      )}
    </div>
  );
};

export default GestionTypesEntites;


