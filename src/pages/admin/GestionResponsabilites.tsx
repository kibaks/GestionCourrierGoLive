import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { responsabiliteService, Responsabilite, ResponsabiliteDefinition } from '../../services/responsabiliteService';
import { adminService } from '../../services/adminService';
import { laravelApiService } from '../../services/laravelApiService';
import { directionService } from '../../services/directionService';
import { Role, Utilisateur } from '../../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faTrash, 
  faPlus, 
  faEdit, 
  faCheck, 
  faTimes, 
  faEllipsisV, 
  faChevronLeft, 
  faChevronRight, 
  faSearch, 
  faFilter,
  faTasks,
  faShieldAlt,
  faBuilding,
  faUsers,
  faLayerGroup,
  faGlobe,
  faUser,
  faArrowRight,
  faCheckCircle,
  faClipboardList,
  faFileAlt
} from '@fortawesome/free-solid-svg-icons';

// Portail pour que le modal de responsabilités couvre tout l'écran (au niveau de <body>)
const ResponsabilitesPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

const GestionResponsabilites: React.FC = () => {
  const [definitions, setDefinitions] = useState<ResponsabiliteDefinition[]>([]);
  const [responsabilites, setResponsabilites] = useState<Responsabilite[]>([]);
  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | ''>('');
  const [selectedDirection, setSelectedDirection] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');
  const [editingDef, setEditingDef] = useState<ResponsabiliteDefinition | null>(null);
  const [showDefForm, setShowDefForm] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [newDef, setNewDef] = useState<Omit<ResponsabiliteDefinition, 'id'>>({
    code: '',
    libelle: '',
    description: '',
    niveau: 'global'
  });
  const [selectedDefinitions, setSelectedDefinitions] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNiveau, setFilterNiveau] = useState<'all' | 'global' | 'direction' | 'service' | 'utilisateur'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (laravelApiService.isConfigured()) {
      await adminService.refreshUsersFromApi();
    }
    setDefinitions(responsabiliteService.getDefinitions());
    setResponsabilites(responsabiliteService.getAllResponsabilites());
    setUsers(adminService.getAllUsers());
  };

  const handleSaveDefinition = () => {
    if (!newDef.code || !newDef.libelle) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (editingDef) {
      const updated = definitions.map(d => 
        d.id === editingDef.id ? { ...editingDef, ...newDef } : d
      );
      localStorage.setItem('responsabiliteDefinitions', JSON.stringify(updated));
      setDefinitions(updated);
      setEditingDef(null);
    } else {
      responsabiliteService.createDefinition(newDef);
      loadData();
    }

    setNewDef({ code: '', libelle: '', description: '', niveau: 'global' });
    setShowDefForm(false);
    setCurrentStep(1);
  };

  const formSteps = [
    { id: 1, title: 'Informations', description: 'Code et libellé', icon: faClipboardList },
    { id: 2, title: 'Description', description: 'Détails', icon: faFileAlt },
    { id: 3, title: 'Niveau', description: 'Application', icon: faLayerGroup }
  ];

  const canGoToNextStep = () => {
    switch (currentStep) {
      case 1:
        return newDef.code.trim() !== '' && newDef.libelle.trim() !== '';
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

  const resetForm = () => {
    setNewDef({ code: '', libelle: '', description: '', niveau: 'global' });
    setEditingDef(null);
    setShowDefForm(false);
    setCurrentStep(1);
  };

  const handleSaveResponsabilite = (role: Role, directionId?: string, serviceId?: string) => {
    const selectedCodes = definitions
      .filter(d => {
        if (d.niveau === 'global') return true;
        if (d.niveau === 'direction' && directionId) return true;
        if (d.niveau === 'service' && serviceId) return true;
        if (d.niveau === 'utilisateur') return true;
        return false;
      })
      .map(d => d.code);

    responsabiliteService.saveResponsabilite({
      role,
      directionId,
      serviceId,
      responsabilites: selectedCodes
    });

    loadData();
  };

  const getResponsabilitesForRole = (role: Role, directionId?: string, serviceId?: string): string[] => {
    const resp = responsabilites.find(r => 
      r.role === role &&
      r.directionId === directionId &&
      r.serviceId === serviceId
    );
    return resp?.responsabilites || [];
  };

  const handleSelectAll = () => {
    if (selectedDefinitions.size === paginatedDefinitions.length) {
      setSelectedDefinitions(new Set());
    } else {
      setSelectedDefinitions(new Set(paginatedDefinitions.map(d => d.id)));
    }
  };

  const handleSelectDefinition = (defId: string) => {
    const newSelected = new Set(selectedDefinitions);
    if (newSelected.has(defId)) {
      newSelected.delete(defId);
    } else {
      newSelected.add(defId);
    }
    setSelectedDefinitions(newSelected);
  };

  const handleDeleteDefinition = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette définition ?')) {
      const updated = definitions.filter(d => d.id !== id);
      localStorage.setItem('responsabiliteDefinitions', JSON.stringify(updated));
      loadData();
      setSelectedDefinitions(new Set());
    }
  };

  const filteredDefinitions = definitions.filter(def => {
    const matchesSearch = searchTerm === '' || 
      def.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      def.libelle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (def.description && def.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesNiveau = filterNiveau === 'all' || def.niveau === filterNiveau;

    return matchesSearch && matchesNiveau;
  });

  const totalPages = Math.ceil(filteredDefinitions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDefinitions = filteredDefinitions.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterNiveau]);

  const getNiveauConfig = (niveau: string) => {
    switch (niveau) {
      case 'global':
        return { icon: faGlobe, color: 'blue', label: 'Global' };
      case 'direction':
        return { icon: faBuilding, color: 'emerald', label: 'Direction' };
      case 'service':
        return { icon: faUsers, color: 'amber', label: 'Service' };
      case 'utilisateur':
        return { icon: faUser, color: 'violet', label: 'Utilisateur' };
      default:
        return { icon: faLayerGroup, color: 'slate', label: niveau };
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; text: string; border: string; light: string }> = {
      blue: { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200', light: 'bg-blue-50' },
      emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50' },
      amber: { bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200', light: 'bg-amber-50' },
      violet: { bg: 'bg-violet-500', text: 'text-violet-600', border: 'border-violet-200', light: 'bg-violet-50' },
      slate: { bg: 'bg-slate-500', text: 'text-slate-600', border: 'border-slate-200', light: 'bg-slate-50' }
    };
    return colors[color] || colors.slate;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-surface-900 flex items-center gap-3">
            <FontAwesomeIcon icon={faTasks} className="w-5 h-5 text-amber-500" />
            Gestion des responsabilités
          </h2>
          <p className="text-surface-500 mt-1">Définir et assigner les responsabilités par rôle</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowDefForm(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-semibold text-sm shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/30"
        >
          <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
          Nouvelle responsabilité
        </button>
      </div>

      {/* Formulaire de définition - Modal (portail + overlay pleine page) avec étapes */}
      {showDefForm && (
        <ResponsabilitesPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl mx-4 border border-surface-200 max-h-[90vh] flex flex-col animate-slideIn">
              {/* Header avec indicateur d'étapes */}
              <div className="flex-shrink-0 px-5 py-3 border-b border-surface-100 bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-3xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <FontAwesomeIcon icon={editingDef ? faEdit : faClipboardList} className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {editingDef ? 'Modifier' : 'Créer'} une responsabilité
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
                            ? 'bg-white text-amber-600 shadow-lg' 
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

              {/* Corps du formulaire */}
              <div className="flex-1 overflow-y-auto p-8">
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 shadow-lg shadow-amber-500/25">
                        <FontAwesomeIcon icon={faClipboardList} className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-surface-900">Informations de base</h3>
                      <p className="text-surface-500 mt-2">Définissez le code et le libellé de la responsabilité</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                            <FontAwesomeIcon icon={faClipboardList} className="w-4 h-4 text-surface-500" />
                          </div>
                          Code
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newDef.code}
                          onChange={(e) => setNewDef({ ...newDef, code: e.target.value.toUpperCase() })}
                          placeholder="GESTION_COURRIERS"
                          className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono text-sm text-surface-900 placeholder:text-surface-400"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                            <FontAwesomeIcon icon={faFileAlt} className="w-4 h-4 text-surface-500" />
                          </div>
                          Libellé
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newDef.libelle}
                          onChange={(e) => setNewDef({ ...newDef, libelle: e.target.value })}
                          placeholder="Gestion des courriers"
                          className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-sm text-surface-900 placeholder:text-surface-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 shadow-lg shadow-amber-500/25">
                        <FontAwesomeIcon icon={faFileAlt} className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-surface-900">Description</h3>
                      <p className="text-surface-500 mt-2">Ajoutez une description détaillée de la responsabilité</p>
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faFileAlt} className="w-4 h-4 text-surface-500" />
                        </div>
                        Description
                      </label>
                      <textarea
                        value={newDef.description}
                        onChange={(e) => setNewDef({ ...newDef, description: e.target.value })}
                        className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-sm resize-none text-surface-900 placeholder:text-surface-400"
                        rows={6}
                        placeholder="Décrivez cette responsabilité en détail..."
                      />
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 shadow-lg shadow-amber-500/25">
                        <FontAwesomeIcon icon={faLayerGroup} className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-surface-900">Niveau d'application</h3>
                      <p className="text-surface-500 mt-2">Sélectionnez le niveau d'application de cette responsabilité</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {['global', 'direction', 'service', 'utilisateur'].map((niveau) => {
                        const config = getNiveauConfig(niveau);
                        const colorClasses = getColorClasses(config.color);
                        const isSelected = newDef.niveau === niveau;
                        
                        return (
                          <button
                            key={niveau}
                            type="button"
                            onClick={() => setNewDef({ ...newDef, niveau: niveau as any })}
                            className={`p-5 rounded-xl border-2 text-left transition-all ${
                              isSelected
                                ? `${colorClasses.border} ${colorClasses.light} shadow-lg`
                                : 'border-surface-200 hover:border-surface-300 hover:shadow-md'
                            }`}
                          >
                            <div className={`w-12 h-12 rounded-lg ${colorClasses.bg} flex items-center justify-center mb-3`}>
                              <FontAwesomeIcon icon={config.icon} className="w-5 h-5 text-white" />
                            </div>
                            <div className={`font-semibold text-base ${isSelected ? colorClasses.text : 'text-surface-900'}`}>
                              {config.label}
                            </div>
                            <p className="text-xs text-surface-500 mt-1">
                              {niveau === 'global' && 'Application à tous les niveaux'}
                              {niveau === 'direction' && 'Application au niveau direction'}
                              {niveau === 'service' && 'Application au niveau service'}
                              {niveau === 'utilisateur' && 'Application au niveau utilisateur'}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            
              {/* Footer avec navigation */}
              <div className="flex-shrink-0 px-6 py-4 border-t border-surface-100 flex justify-between items-center bg-surface-50 rounded-b-3xl">
                <button
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    currentStep === 1
                      ? 'text-surface-400 bg-surface-100 cursor-not-allowed'
                      : 'text-surface-700 bg-white border-2 border-surface-200 hover:bg-surface-50'
                  }`}
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
                  Précédent
                </button>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={resetForm}
                    className="px-5 py-2.5 text-sm font-semibold text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 transition-colors"
                  >
                    Annuler
                  </button>
                  {currentStep === formSteps.length ? (
                    <button
                      onClick={handleSaveDefinition}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/25 flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                      Enregistrer
                    </button>
                  ) : (
                    <button
                      onClick={nextStep}
                      disabled={!canGoToNextStep()}
                      className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                        canGoToNextStep()
                          ? 'text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25'
                          : 'text-surface-400 bg-surface-100 cursor-not-allowed'
                      }`}
                    >
                      Suivant
                      <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ResponsabilitesPortal>
      )}

      {/* Liste des définitions */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-surface-100 bg-gradient-to-r from-surface-50 to-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <FontAwesomeIcon icon={faClipboardList} className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-surface-900">Définitions de responsabilités</h3>
          </div>

          {/* Filtres */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Rechercher par code, libellé..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-sm font-medium"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 w-6 h-6 rounded-lg bg-surface-200 text-surface-500 hover:bg-surface-300 flex items-center justify-center"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="relative">
              <FontAwesomeIcon icon={faFilter} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-surface-400" />
              <select
                value={filterNiveau}
                onChange={(e) => setFilterNiveau(e.target.value as any)}
                className="w-full pl-12 pr-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 appearance-none transition-all text-sm font-medium cursor-pointer"
              >
                <option value="all">Tous les niveaux</option>
                <option value="global">Global</option>
                <option value="direction">Direction</option>
                <option value="service">Service</option>
                <option value="utilisateur">Utilisateur</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 text-amber-700 text-sm font-bold">
                {filteredDefinitions.length}
              </span>
              <span className="text-sm text-surface-600">
                définition{filteredDefinitions.length > 1 ? 's' : ''} trouvée{filteredDefinitions.length > 1 ? 's' : ''}
              </span>
            </div>
            {(searchTerm || filterNiveau !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterNiveau('all');
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                Réinitialiser
              </button>
            )}
          </div>
        </div>
        
        {selectedDefinitions.size > 0 && (
          <div className="p-4 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
                  <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-white" />
                </div>
                <span className="font-semibold text-amber-800">
                  {selectedDefinitions.size} définition{selectedDefinitions.size > 1 ? 's' : ''} sélectionnée{selectedDefinitions.size > 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setSelectedDefinitions(new Set())}
                className="text-sm font-medium text-amber-600 hover:text-amber-700"
              >
                Tout désélectionner
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-5 py-4 text-left w-12">
                  <input
                    type="checkbox"
                    checked={selectedDefinitions.size === paginatedDefinitions.length && paginatedDefinitions.length > 0}
                    onChange={handleSelectAll}
                    className="w-5 h-5 rounded-lg border-2 border-surface-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Code</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Libellé</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Niveau</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedDefinitions.length > 0 ? (
                paginatedDefinitions.map(def => {
                  const config = getNiveauConfig(def.niveau);
                  const colorClasses = getColorClasses(config.color);
                  
                  return (
                    <tr 
                      key={def.id}
                      className={`hover:bg-surface-50 transition-colors ${selectedDefinitions.has(def.id) ? 'bg-amber-50' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedDefinitions.has(def.id)}
                          onChange={() => handleSelectDefinition(def.id)}
                          className="w-5 h-5 rounded-lg border-2 border-surface-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-3 py-1.5 bg-surface-100 text-surface-800 rounded-lg text-xs font-mono font-semibold">
                          {def.code}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-surface-900">{def.libelle}</span>
                        {def.description && (
                          <p className="text-xs text-surface-500 mt-0.5 line-clamp-1">{def.description}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold ${colorClasses.light} ${colorClasses.text} border ${colorClasses.border}`}>
                          <FontAwesomeIcon icon={config.icon} className="w-3 h-3" />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdown(openDropdown === def.id ? null : def.id);
                          }}
                          className="w-10 h-10 rounded-xl text-surface-500 hover:text-surface-700 hover:bg-surface-100 flex items-center justify-center transition-colors"
                        >
                          <FontAwesomeIcon icon={faEllipsisV} />
                        </button>
                        {openDropdown === def.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
                            <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-surface-200 z-50 py-2 animate-fadeIn">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  setEditingDef(def);
                                  setNewDef({ code: def.code, libelle: def.libelle, description: def.description || '', niveau: def.niveau });
                                  setCurrentStep(1);
                                  setShowDefForm(true);
                                  setOpenDropdown(null);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
                              >
                                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                  <FontAwesomeIcon icon={faEdit} className="w-3.5 h-3.5 text-amber-600" />
                                </div>
                                Modifier
                              </button>
                              <div className="h-px bg-surface-100 my-1 mx-3" />
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteDefinition(def.id);
                                  setOpenDropdown(null);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                                  <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5 text-red-600" />
                                </div>
                                Supprimer
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-20 h-20 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
                        <FontAwesomeIcon icon={faClipboardList} className="w-8 h-8 text-surface-400" />
                      </div>
                      <p className="text-surface-500 font-medium">Aucune définition trouvée</p>
                      <p className="text-surface-400 text-sm mt-1">Créez une nouvelle responsabilité pour commencer</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-surface-100">
            <div className="text-sm text-surface-600">
              Affichage de <span className="font-semibold">{startIndex + 1}</span> à <span className="font-semibold">{Math.min(endIndex, filteredDefinitions.length)}</span> sur <span className="font-semibold">{filteredDefinitions.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  currentPage === 1
                    ? 'bg-surface-100 text-surface-400 cursor-not-allowed'
                    : 'bg-white text-surface-700 hover:bg-surface-100 border border-surface-200'
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
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25'
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
                    : 'bg-white text-surface-700 hover:bg-surface-100 border border-surface-200'
                }`}
              >
                <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assignation par rôle */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-surface-100 bg-gradient-to-r from-surface-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-surface-900">Assignation par rôle</h3>
              <p className="text-sm text-surface-500">Attribuez les responsabilités aux différents rôles</p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
                <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4 text-surface-400" />
                Rôle
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as Role | '')}
                className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-sm font-medium cursor-pointer"
              >
                <option value="">Sélectionner un rôle</option>
                {Object.values(Role).map(role => (
                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
                <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-surface-400" />
                Direction (optionnel)
              </label>
              <select
                value={selectedDirection}
                onChange={(e) => setSelectedDirection(e.target.value)}
                className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-sm font-medium cursor-pointer"
              >
                <option value="">Toutes</option>
                {directionService.getAllDirections().map(dir => (
                  <option key={dir.id} value={dir.id}>{dir.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
                <FontAwesomeIcon icon={faUsers} className="w-4 h-4 text-surface-400" />
                Service (optionnel)
              </label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selectedDirection}
              >
                <option value="">Tous</option>
                {selectedDirection && directionService.getServicesByDirection(selectedDirection).map(serv => (
                  <option key={serv.id} value={serv.id}>{serv.nom}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedRole && (
            <div className="mt-6">
              <h4 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                <FontAwesomeIcon icon={faCheckCircle} className="w-4 h-4 text-violet-500" />
                Responsabilités assignées
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto p-1">
                {definitions
                  .filter(d => {
                    if (d.niveau === 'global') return true;
                    if (d.niveau === 'direction' && selectedDirection) return true;
                    if (d.niveau === 'service' && selectedService) return true;
                    if (d.niveau === 'utilisateur') return true;
                    return false;
                  })
                  .map(def => {
                    const assigned = getResponsabilitesForRole(
                      selectedRole,
                      selectedDirection || undefined,
                      selectedService || undefined
                    ).includes(def.code);

                    const config = getNiveauConfig(def.niveau);
                    const colorClasses = getColorClasses(config.color);

                    return (
                      <label 
                        key={def.id} 
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          assigned 
                            ? `${colorClasses.light} ${colorClasses.border}` 
                            : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                          assigned ? `${colorClasses.bg}` : 'border-2 border-surface-300'
                        }`}>
                          {assigned && <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          checked={assigned}
                          onChange={(e) => {
                            const current = getResponsabilitesForRole(
                              selectedRole,
                              selectedDirection || undefined,
                              selectedService || undefined
                            );
                            const updated = e.target.checked
                              ? [...current, def.code]
                              : current.filter(c => c !== def.code);
                            
                            responsabiliteService.saveResponsabilite({
                              role: selectedRole,
                              directionId: selectedDirection || undefined,
                              serviceId: selectedService || undefined,
                              responsabilites: updated
                            });
                            loadData();
                          }}
                          className="sr-only"
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`font-semibold text-sm ${assigned ? colorClasses.text : 'text-surface-900'}`}>
                            {def.libelle}
                          </div>
                          <div className="text-xs text-surface-500 font-mono mt-0.5">{def.code}</div>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${colorClasses.light} ${colorClasses.text}`}>
                          <FontAwesomeIcon icon={config.icon} className="w-2.5 h-2.5" />
                          {config.label}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GestionResponsabilites;
