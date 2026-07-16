import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { adminService } from '../../services/adminService';
import { Departement } from '../../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faEllipsisV, 
  faEdit, 
  faTrash, 
  faChevronLeft, 
  faChevronRight, 
  faSearch, 
  faFilter, 
  faTimes,
  faPlus,
  faBuilding,
  faCheck,
  faInfoCircle,
  faUsers,
  faArrowRight,
  faSave,
  faToggleOn,
  faToggleOff,
  faLayerGroup,
  faSitemap,
  faCheckCircle
} from '@fortawesome/free-solid-svg-icons';

// Portail admin pour que les modals couvrent tout l'écran
const AdminPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

// Définition des étapes du formulaire
const formSteps = [
  { id: 1, title: 'Informations', description: 'Nom et code', icon: faBuilding },
  { id: 2, title: 'Hiérarchie', description: 'Parent et responsable', icon: faSitemap },
  { id: 3, title: 'Confirmation', description: 'Vérification', icon: faCheck }
];

const GestionDepartements: React.FC = () => {
  const [departements, setDepartements] = useState<Departement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingDepartement, setEditingDepartement] = useState<Departement | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    nom: '',
    code: '',
    description: '',
    responsableId: '',
    parentId: '',
    actif: true
  });
  const [selectedDepartements, setSelectedDepartements] = useState<Set<string>>(new Set());
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [selectedDepartementForResume, setSelectedDepartementForResume] = useState<Departement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<'all' | 'actif' | 'inactif'>('all');

  useEffect(() => {
    loadDepartements();
  }, []);

  const loadDepartements = () => {
    const allDepartements = adminService.getAllDepartements();
    setDepartements(allDepartements);
  };

  const handleSubmit = () => {
    if (editingDepartement) {
      adminService.updateDepartement(editingDepartement.id, formData);
    } else {
      adminService.createDepartement(formData);
    }
    
    resetForm();
    loadDepartements();
  };

  const resetForm = () => {
    setFormData({
      nom: '',
      code: '',
      description: '',
      responsableId: '',
      parentId: '',
      actif: true
    });
    setEditingDepartement(null);
    setShowForm(false);
    setCurrentStep(1);
  };

  const handleEdit = (departement: Departement) => {
    setEditingDepartement(departement);
    setFormData({
      nom: departement.nom,
      code: departement.code || '',
      description: departement.description || '',
      responsableId: departement.responsableId || '',
      parentId: departement.parentId || '',
      actif: departement.actif
    });
    setCurrentStep(1);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce département ?')) {
      adminService.deleteDepartement(id);
      loadDepartements();
      setSelectedDepartements(new Set());
    }
  };

  const handleSelectAll = () => {
    if (selectedDepartements.size === paginatedDepartements.length) {
      setSelectedDepartements(new Set());
    } else {
      setSelectedDepartements(new Set(paginatedDepartements.map(d => d.id)));
    }
  };

  const handleSelectDepartement = (departementId: string) => {
    const newSelected = new Set(selectedDepartements);
    if (newSelected.has(departementId)) {
      newSelected.delete(departementId);
    } else {
      newSelected.add(departementId);
    }
    setSelectedDepartements(newSelected);
  };

  // Filtrage et recherche
  const filteredDepartements = departements.filter(departement => {
    // Recherche
    const matchesSearch = searchTerm === '' || 
      departement.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (departement.code && departement.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (departement.description && departement.description.toLowerCase().includes(searchTerm.toLowerCase()));

    // Filtre par statut
    const matchesStatut = filterStatut === 'all' || 
      (filterStatut === 'actif' && departement.actif) ||
      (filterStatut === 'inactif' && !departement.actif);

    return matchesSearch && matchesStatut;
  });

  // Pagination
  const totalPages = Math.ceil(filteredDepartements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDepartements = filteredDepartements.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Réinitialiser la page quand les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatut]);

  // Navigation des étapes
  const canGoToNextStep = () => {
    switch (currentStep) {
      case 1:
        return formData.nom.trim() !== '';
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

  // Stats rapides
  const activeDepts = departements.filter(d => d.actif).length;
  const inactiveDepts = departements.filter(d => !d.actif).length;

  // Obtenir le parent d'un département
  const getParentName = (parentId: string | undefined) => {
    if (!parentId) return null;
    const parent = departements.find(d => d.id === parentId);
    return parent?.nom || null;
  };

  // Rendu du contenu des étapes
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white mb-4 shadow-lg shadow-emerald-500/25">
                <FontAwesomeIcon icon={faBuilding} className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-surface-900">Informations du département</h3>
              <p className="text-surface-500 mt-2">Définissez le nom et le code du département</p>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-surface-500" />
                  </div>
                  Nom du département
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Ex: Direction des Ressources Humaines"
                  className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900 placeholder:text-surface-400 font-medium"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 text-surface-500" />
                    </div>
                    Code
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="Ex: DRH"
                    className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900 placeholder:text-surface-400 font-mono font-medium"
                  />
                </div>
                
                <div className="flex items-end">
                  <label className="flex items-center gap-4 p-4 bg-surface-50 border-2 border-surface-200 rounded-xl cursor-pointer hover:border-emerald-300 transition-colors w-full">
                    <input
                      type="checkbox"
                      checked={formData.actif}
                      onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="relative w-14 h-8 bg-surface-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md peer-checked:bg-emerald-500" />
                    <span className="text-sm font-semibold text-surface-700">Département actif</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4 text-surface-500" />
                  </div>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez les missions et attributions de ce département..."
                  className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-surface-900 placeholder:text-surface-400 font-medium resize-none"
                  rows={3}
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 text-white mb-4 shadow-lg shadow-violet-500/25">
                <FontAwesomeIcon icon={faSitemap} className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-surface-900">Hiérarchie et responsabilité</h3>
              <p className="text-surface-500 mt-2">Définissez le rattachement hiérarchique</p>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faSitemap} className="w-4 h-4 text-surface-500" />
                  </div>
                  Département parent
                </label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-surface-900 font-medium cursor-pointer"
                >
                  <option value="">Aucun (département racine)</option>
                  {departements
                    .filter(d => d.id !== editingDepartement?.id && d.actif)
                    .map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.nom} {dept.code ? `(${dept.code})` : ''}
                      </option>
                    ))
                  }
                </select>
                <p className="mt-2 text-sm text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                  Laissez vide pour créer un département de premier niveau
                </p>
              </div>
              
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUsers} className="w-4 h-4 text-surface-500" />
                  </div>
                  Responsable
                </label>
                <input
                  type="text"
                  value={formData.responsableId}
                  onChange={(e) => setFormData({ ...formData, responsableId: e.target.value })}
                  placeholder="ID de l'utilisateur responsable"
                  className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-surface-900 placeholder:text-surface-400 font-medium"
                />
                <p className="mt-2 text-sm text-surface-500">
                  Identifiant du responsable de ce département (optionnel)
                </p>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 text-white mb-4 shadow-lg shadow-green-500/25">
                <FontAwesomeIcon icon={faCheck} className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-surface-900">Confirmation</h3>
              <p className="text-surface-500 mt-2">Vérifiez les informations avant de valider</p>
            </div>
            
            <div className="bg-gradient-to-br from-surface-50 to-white rounded-2xl p-6 border border-surface-200 space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-surface-100">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faBuilding} className="w-4 h-4" />
                  Nom
                </span>
                <span className="font-semibold text-surface-900">{formData.nom || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-surface-100">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4" />
                  Code
                </span>
                <span className="px-3 py-1.5 bg-surface-100 text-surface-800 rounded-lg text-sm font-mono font-semibold">
                  {formData.code || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-surface-100">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faSitemap} className="w-4 h-4" />
                  Parent
                </span>
                <span className="font-medium text-surface-900">
                  {getParentName(formData.parentId) || 'Département racine'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-surface-100">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                  Description
                </span>
                <span className="font-medium text-surface-900 text-right max-w-xs truncate">
                  {formData.description || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={formData.actif ? faToggleOn : faToggleOff} className="w-4 h-4" />
                  Statut
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  formData.actif 
                    ? 'bg-green-100 text-green-700 border border-green-200' 
                    : 'bg-surface-100 text-surface-600 border border-surface-200'
                }`}>
                  {formData.actif ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      {/* Header avec stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-surface-900 flex items-center gap-3">
            <FontAwesomeIcon icon={faBuilding} className="w-5 h-5 text-emerald-500" />
            Gestion des Départements
          </h2>
          <p className="text-surface-500 mt-1">Organisez la structure hiérarchique de votre organisation</p>
        </div>
        
        {/* Mini stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-emerald-700">{activeDepts} actifs</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-50 border border-surface-200 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-surface-400" />
            <span className="text-sm font-semibold text-surface-600">{inactiveDepts} inactifs</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all font-semibold text-sm shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30"
        >
          <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
          Nouveau département
        </button>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl border border-surface-200 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Rechercher par nom, code, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 w-6 h-6 rounded-lg bg-surface-200 text-surface-500 hover:bg-surface-300 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="relative">
              <FontAwesomeIcon icon={faFilter} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-surface-400" />
              <select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value as 'all' | 'actif' | 'inactif')}
                className="w-full pl-12 pr-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all text-sm font-medium cursor-pointer"
              >
                <option value="all">Tous les statuts</option>
                <option value="actif">Actifs uniquement</option>
                <option value="inactif">Inactifs uniquement</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-bold">
              {filteredDepartements.length}
            </span>
            <span className="text-sm text-surface-600">
              département{filteredDepartements.length > 1 ? 's' : ''} trouvé{filteredDepartements.length > 1 ? 's' : ''}
            </span>
          </div>
          {(searchTerm || filterStatut !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterStatut('all');
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Modal de création/modification (portail pour overlay pleine page) */}
      {showForm && (
        <AdminPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 border border-surface-200 max-h-[90vh] flex flex-col animate-slideIn">
            {/* Header avec indicateur d'étapes */}
            <div className="flex-shrink-0 px-5 py-3 border-b border-surface-100 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 rounded-t-3xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <FontAwesomeIcon icon={editingDepartement ? faEdit : faBuilding} className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingDepartement ? 'Modifier le département' : 'Nouveau département'}
                    </h3>
                    <p className="text-white/70 text-xs mt-0.5">
                      Étape {currentStep} sur {formSteps.length}
                    </p>
                  </div>
                </div>
                <button
                  onClick={resetForm}
                  className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors flex items-center justify-center"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                </button>
              </div>
              
              {/* Indicateur d'étapes */}
              <div className="flex items-center justify-between">
                {formSteps.map((step, index) => (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center">
                      <div className={`
                        w-9 h-9 rounded-xl flex items-center justify-center transition-all
                        ${currentStep >= step.id 
                          ? 'bg-white text-emerald-600 shadow-lg' 
                          : 'bg-white/20 text-white/70'}
                      `}>
                        {currentStep > step.id ? (
                          <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                        ) : (
                          <FontAwesomeIcon icon={step.icon} className="w-4 h-4" />
                        )}
                      </div>
                      <span className={`text-[10px] mt-1 font-semibold ${
                        currentStep >= step.id ? 'text-white' : 'text-white/60'
                      }`}>
                        {step.title}
                      </span>
                    </div>
                    {index < formSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${
                        currentStep > step.id ? 'bg-white' : 'bg-white/20'
                      }`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
            
            {/* Corps de la modal */}
            <div className="flex-1 overflow-y-auto p-8">
              {renderStepContent()}
            </div>
            
            {/* Footer avec boutons de navigation */}
            <div className="flex-shrink-0 flex justify-between gap-4 px-8 py-5 border-t border-surface-100 bg-surface-50 rounded-b-3xl">
              <button
                type="button"
                onClick={currentStep === 1 ? resetForm : prevStep}
                className="px-6 py-3 text-sm font-semibold text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 hover:border-surface-300 transition-all flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
                {currentStep === 1 ? 'Annuler' : 'Précédent'}
              </button>
              
              {currentStep < formSteps.length ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canGoToNextStep()}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2"
                >
                  Suivant
                  <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg shadow-green-500/25 flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                  {editingDepartement ? 'Enregistrer' : 'Créer le département'}
                </button>
              )}
            </div>
          </div>
          </div>
        </AdminPortal>
      )}

      {/* Sélection multiple */}
      {selectedDepartements.size > 0 && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-slideInUp">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                <FontAwesomeIcon icon={faCheck} className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-emerald-800">
                {selectedDepartements.size} département{selectedDepartements.size > 1 ? 's' : ''} sélectionné{selectedDepartements.size > 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={() => setSelectedDepartements(new Set())}
              className="px-4 py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors"
            >
              Tout désélectionner
            </button>
          </div>
        </div>
      )}

      {/* Table des départements */}
      <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-100">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-5 py-4 text-left w-12">
                  <input
                    type="checkbox"
                    checked={selectedDepartements.size === paginatedDepartements.length && paginatedDepartements.length > 0}
                    onChange={handleSelectAll}
                    className="w-5 h-5 rounded-lg border-2 border-surface-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Département</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider hidden md:table-cell">Parent</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider w-28">Statut</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-surface-100">
              {paginatedDepartements.length > 0 ? (
                paginatedDepartements.map((departement, index) => (
                  <tr 
                    key={departement.id} 
                    className={`hover:bg-emerald-50/60 active:bg-emerald-100 transition-all duration-200 cursor-pointer ${selectedDepartements.has(departement.id) ? 'bg-emerald-50' : ''}`}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => {
                      setSelectedDepartementForResume(departement);
                      setShowResumeModal(true);
                    }}
                  >
                    <td className="px-5 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedDepartements.has(departement.id)}
                        onChange={() => handleSelectDepartement(departement.id)}
                        className="w-5 h-5 rounded-lg border-2 border-surface-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                          {departement.nom.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-surface-900 truncate">{departement.nom}</span>
                            {departement.code && (
                              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-surface-100 text-surface-600 border border-surface-200">
                                {departement.code}
                              </span>
                            )}
                          </div>
                          {departement.description && (
                            <p className="text-sm text-surface-500 truncate mt-0.5 max-w-xs">{departement.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      {departement.parentId ? (
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 rounded-full bg-violet-500" />
                          <span className="text-surface-700 font-medium">
                            {getParentName(departement.parentId) || 'Parent inconnu'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-surface-400 italic flex items-center gap-2">
                          <FontAwesomeIcon icon={faCheckCircle} className="w-3 h-3 text-emerald-500" />
                          Racine
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl ${
                        departement.actif 
                          ? 'bg-green-100 text-green-700 border border-green-200' 
                          : 'bg-surface-100 text-surface-600 border border-surface-200'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${departement.actif ? 'bg-green-500 animate-pulse' : 'bg-surface-400'}`} />
                        {departement.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-20 h-20 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
                        <FontAwesomeIcon icon={faBuilding} className="w-8 h-8 text-surface-400" />
                      </div>
                      <p className="text-surface-500 font-medium">Aucun département trouvé</p>
                      <p className="text-surface-400 text-sm mt-1">Modifiez vos filtres ou créez un nouveau département</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 p-4 bg-white rounded-2xl border border-surface-200">
          <div className="text-sm text-surface-600">
            Affichage de <span className="font-semibold text-surface-900">{startIndex + 1}</span> à <span className="font-semibold text-surface-900">{Math.min(endIndex, filteredDepartements.length)}</span> sur <span className="font-semibold text-surface-900">{filteredDepartements.length}</span> département{filteredDepartements.length > 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                currentPage === 1
                  ? 'bg-surface-100 text-surface-400 cursor-not-allowed'
                  : 'bg-white text-surface-700 hover:bg-surface-100 border border-surface-200 shadow-sm'
              }`}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={`w-10 h-10 rounded-xl text-sm font-semibold transition-all ${
                        currentPage === page
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25'
                          : 'bg-white text-surface-700 hover:bg-surface-100 border border-surface-200'
                      }`}
                    >
                      {page}
                    </button>
                  );
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="px-2 text-surface-400">...</span>;
                }
                return null;
              })}
            </div>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                currentPage === totalPages
                  ? 'bg-surface-100 text-surface-400 cursor-not-allowed'
                  : 'bg-white text-surface-700 hover:bg-surface-100 border border-surface-200 shadow-sm'
              }`}
            >
              <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionDepartements;
