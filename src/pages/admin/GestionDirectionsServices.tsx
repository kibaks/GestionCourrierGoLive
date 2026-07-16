import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { entiteOrganisationnelleService } from '../../services/entiteOrganisationnelleService';
import { entiteTypeService } from '../../services/entiteTypeService';
import { adminService } from '../../services/adminService';
import { laravelApiService } from '../../services/laravelApiService';
import { EntiteOrganisationnelle, EntiteTypeDefinition, TypeEntiteOrganisationnelle, Utilisateur } from '../../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faTrash, 
  faPlus, 
  faEdit, 
  faTimes, 
  faBuilding, 
  faUsers, 
  faSitemap, 
  faLayerGroup, 
  faFolder, 
  faBox, 
  faEllipsisV, 
  faChevronLeft, 
  faChevronRight, 
  faSearch, 
  faFilter,
  faCheck,
  faArrowRight,
  faToggleOn,
  faToggleOff,
  faCheckCircle,
  faInfoCircle,
  faSortNumericDown,
  faUser,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';
import GestionTypesEntites from './GestionTypesEntites';

// Portail admin pour que les modals couvrent tout l'écran
const AdminPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

type ActiveTab = 'all' | TypeEntiteOrganisationnelle | 'types-entites';

// Étapes du formulaire
const formSteps = [
  { id: 1, title: 'Informations', description: 'Nom et type', icon: faBuilding },
  { id: 2, title: 'Hiérarchie', description: 'Entité parente', icon: faSitemap },
  { id: 3, title: 'Confirmation', description: 'Vérification', icon: faCheck }
];

const GestionDirectionsServices: React.FC = () => {
  const [entities, setEntities] = useState<EntiteOrganisationnelle[]>([]);
  const [entiteTypes, setEntiteTypes] = useState<EntiteTypeDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [showTabsDrawer, setShowTabsDrawer] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntiteOrganisationnelle | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    nom: '',
    type: 'direction' as TypeEntiteOrganisationnelle,
    description: '',
    parentId: '',
    ordre: 0,
    responsableId: '' as string
  });
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [selectedEntityForResume, setSelectedEntityForResume] = useState<EntiteOrganisationnelle | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<TypeEntiteOrganisationnelle | ''>('');
  const [filterStatut, setFilterStatut] = useState<'all' | 'actif' | 'inactif'>('all');
  const [allUsers, setAllUsers] = useState<Utilisateur[]>([]);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [selectedUsersForEntity, setSelectedUsersForEntity] = useState<Set<string>>(new Set());
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      if (laravelApiService.isConfigured()) {
        await entiteOrganisationnelleService.refreshFromApi();
        await entiteTypeService.syncFromApi();
        await adminService.refreshUsersFromApi();
      } else {
        entiteOrganisationnelleService.initializeDemoData();
      }
      setEntities(entiteOrganisationnelleService.getAllEntities());
      const typesActifs = entiteTypeService
        .getAll()
        .filter(t => t.actif)
        .sort((a, b) => a.ordre - b.ordre);
      setEntiteTypes(typesActifs);
      const allUsersData = adminService.getAllUsers();
      console.log('📊 Utilisateurs chargés:', allUsersData.length, 'total,', allUsersData.filter(u => u.actif).length, 'actifs');
      setAllUsers(allUsersData);
    } finally {
      setLoading(false);
    }
  };

  // Obtenir les utilisateurs d'une entité
  const getUsersForEntity = (entity: EntiteOrganisationnelle): Utilisateur[] => {
    let users: Utilisateur[] = [];
    
    if (entity.type === 'direction') {
      // Pour une direction : utilisateurs avec cette direction (avec ou sans service)
      users = allUsers.filter(u => u.actif && u.direction === entity.nom);
    } else if (entity.type === 'service') {
      // Pour un service : utilisateurs avec cette direction ET ce service
      const parentEntity = entities.find(e => e.id === entity.parentId);
      if (parentEntity) {
        users = allUsers.filter(u => 
          u.actif && 
          u.direction === parentEntity.nom && 
          u.service === entity.nom
        );
      }
    } else {
      // Pour les autres types (sous-service, division, bureau, cellule) : utilisateurs avec entiteId
      users = allUsers.filter(u => u.actif && u.entiteId === entity.id);
    }
    
    // Dédupliquer par ID pour éviter les doublons
    const uniqueUsers = Array.from(new Map(users.map(u => [u.id, u])).values());
    return uniqueUsers;
  };

  const resetForm = () => {
    setFormData({ nom: '', type: 'direction', description: '', parentId: '', ordre: 0, responsableId: '' });
    setEditingEntity(null);
    setShowForm(false);
    setCurrentStep(1);
  };

  const handleSubmit = () => {
    if (!formData.nom.trim()) {
      alert('Le nom est requis');
      return;
    }

    if (formData.type !== 'direction' && !formData.parentId) {
      alert('Veuillez sélectionner une entité parente');
      return;
    }

    try {
      const entityData: Omit<EntiteOrganisationnelle, 'id'> = {
        nom: formData.nom,
        type: formData.type,
        description: formData.description || undefined,
        parentId: formData.type === 'direction' ? undefined : formData.parentId,
        ordre: formData.ordre || 0,
        actif: true,
        responsableId: formData.responsableId || undefined
      };

      if (editingEntity) {
        entiteOrganisationnelleService.updateEntity(editingEntity.id, entityData);
      } else {
        entiteOrganisationnelleService.createEntity(entityData);
      }
      resetForm();
      loadData();
    } catch (error: any) {
      alert(error.message || 'Erreur lors de la sauvegarde');
    }
  };

  const handleEdit = (entity: EntiteOrganisationnelle) => {
    setEditingEntity(entity);
    setFormData({
      nom: entity.nom,
      type: entity.type,
      description: entity.description || '',
      parentId: entity.parentId || '',
      ordre: entity.ordre || 0,
      responsableId: entity.responsableId || ''
    });
    setCurrentStep(1);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette entité ? Toutes les entités enfants seront également supprimées.')) {
      try {
        entiteOrganisationnelleService.deleteEntity(id);
        loadData();
        setSelectedEntities(new Set());
      } catch (error: any) {
        alert(error.message || 'Erreur lors de la suppression');
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedEntities.size === paginatedEntities.length) {
      setSelectedEntities(new Set());
    } else {
      setSelectedEntities(new Set(paginatedEntities.map(e => e.id)));
    }
  };

  const handleSelectEntity = (entityId: string) => {
    const newSelected = new Set(selectedEntities);
    if (newSelected.has(entityId)) {
      newSelected.delete(entityId);
    } else {
      newSelected.add(entityId);
    }
    setSelectedEntities(newSelected);
  };

  const handleToggleActive = (id: string, currentActive: boolean) => {
    if (currentActive) {
      entiteOrganisationnelleService.deactivateEntity(id);
    } else {
      entiteOrganisationnelleService.activateEntity(id);
    }
    loadData();
  };

  // Navigation des étapes
  const canGoToNextStep = () => {
    switch (currentStep) {
      case 1:
        return formData.nom.trim() !== '' && formData.type !== undefined;
      case 2:
        return formData.type === 'direction' || formData.parentId !== '';
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

  // Filtrage
  const getFilteredEntities = () => {
    let filtered: EntiteOrganisationnelle[] = [];

    if (activeTab === 'all' || activeTab === 'types-entites') {
      filtered = entities.filter(e => e.actif !== false);
    } else {
      filtered = entities.filter(e => e.type === activeTab && e.actif !== false);
    }

    if (searchTerm) {
      filtered = filtered.filter(e =>
        e.nom.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType && activeTab === 'all') {
      filtered = filtered.filter(e => e.type === filterType);
    }

    if (filterStatut !== 'all') {
      filtered = filtered.filter(e =>
        (filterStatut === 'actif' && e.actif !== false) ||
        (filterStatut === 'inactif' && e.actif === false)
      );
    }

    return filtered;
  };

  const filteredEntities = getFilteredEntities();
  const totalPages = Math.ceil(filteredEntities.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEntities = filteredEntities.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  useEffect(() => {
    setCurrentPage(1);
    setSelectedEntities(new Set());
  }, [activeTab, searchTerm, filterType, filterStatut]);

  const getAvailableParents = (type: TypeEntiteOrganisationnelle): EntiteOrganisationnelle[] => {
    switch (type) {
      case 'direction':
        return [];
      case 'service':
        return entities.filter(e => e.type === 'direction' && e.actif !== false);
      case 'sous-service':
        return entities.filter(e => e.type === 'service' && e.actif !== false);
      default:
        return entities.filter(e => e.actif !== false && e.id !== editingEntity?.id);
    }
  };

  const getTypeIcon = (type: TypeEntiteOrganisationnelle) => {
    switch (type) {
      case 'direction': return faBuilding;
      case 'service': return faUsers;
      case 'sous-service': return faSitemap;
      case 'division': return faLayerGroup;
      case 'bureau': return faFolder;
      case 'cellule': return faBox;
      default: return faBuilding;
    }
  };

  const getTypeGradient = (type: TypeEntiteOrganisationnelle) => {
    switch (type) {
      case 'direction': return 'from-blue-500 to-cyan-500';
      case 'service': return 'from-emerald-500 to-teal-500';
      case 'sous-service': return 'from-violet-500 to-purple-500';
      case 'division': return 'from-amber-500 to-orange-500';
      case 'bureau': return 'from-rose-500 to-pink-500';
      case 'cellule': return 'from-indigo-500 to-blue-500';
      default: return 'from-slate-500 to-gray-500';
    }
  };

  const getTypeLabel = (type: TypeEntiteOrganisationnelle) => {
    const def = entiteTypes.find(t => t.code === type);
    if (def) return def.libelleSingulier;
    const labelsFallback: Record<TypeEntiteOrganisationnelle, string> = {
      'direction_generale': 'Direction Générale',
      'direction': 'Direction',
      'service': 'Service',
      'sous-service': 'Sous-service',
      'division': 'Division',
      'bureau': 'Bureau',
      'cellule': 'Cellule'
    };
    return labelsFallback[type] || type;
  };

  const getChildren = (entityId: string) => {
    return entities.filter(e => e.parentId === entityId && e.actif !== false)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  };

  const getParentName = (parentId: string | undefined) => {
    if (!parentId) return null;
    const parent = entities.find(e => e.id === parentId);
    return parent?.nom || null;
  };

  // Stats
  const activeEntities = entities.filter(e => e.actif !== false).length;
  const inactiveEntities = entities.filter(e => e.actif === false).length;

  const renderHierarchy = (entity: EntiteOrganisationnelle, level: number = 0) => {
    const children = getChildren(entity.id);
    const Icon = getTypeIcon(entity.type);
    const gradient = getTypeGradient(entity.type);
    
    return (
      <div key={entity.id} className={`${level > 0 ? 'ml-8 mt-3' : ''}`}>
        <div className={`flex items-start justify-between p-4 rounded-2xl border-2 transition-all hover:shadow-md ${
          level === 0 ? 'border-blue-200 bg-blue-50/50' : 
          level === 1 ? 'border-emerald-200 bg-emerald-50/50' : 
          'border-violet-200 bg-violet-50/50'
        }`}>
          <div className="flex items-center flex-1 gap-4">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
              <FontAwesomeIcon icon={Icon} className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h4 className="font-bold text-surface-900">{entity.nom}</h4>
                <span className="text-xs px-2.5 py-1 rounded-lg bg-surface-100 text-surface-600 font-semibold">
                  {getTypeLabel(entity.type)}
                </span>
                {entity.actif === false && (
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-red-100 text-red-700 font-semibold">
                    Inactif
                  </span>
                )}
              </div>
              {entity.description && (
                <p className="text-sm text-surface-500 mt-1">{entity.description}</p>
              )}
              {entity.responsableId && (() => {
                const chef = allUsers.find(u => u.id === entity.responsableId);
                return chef ? (
                  <p className="text-xs text-surface-600 mt-1 flex items-center gap-1">
                    <FontAwesomeIcon icon={faUser} className="w-3 h-3 text-amber-600" />
                    <span className="font-medium">Chef :</span> {chef.nom}
                  </p>
                ) : null;
              })()}
              {/* Utilisateurs */}
              {(() => {
                const entityUsers = getUsersForEntity(entity);
                return entityUsers.length > 0 ? (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs text-surface-600">
                      <FontAwesomeIcon icon={faUsers} className="w-3 h-3 text-emerald-600" />
                      <span className="font-semibold">{entityUsers.length}</span>
                      <span>utilisateur{entityUsers.length > 1 ? 's' : ''}</span>
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {entityUsers.slice(0, 4).map((user, index) => (
                        <span
                          key={`user-${user.id}-${index}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-surface-200 text-surface-700 rounded-lg text-xs font-medium shadow-sm"
                          title={user.email}
                        >
                          {user.nom}
                        </span>
                      ))}
                      {entityUsers.length > 4 && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-surface-100 text-surface-500 rounded-lg text-xs font-medium">
                          +{entityUsers.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleToggleActive(entity.id, entity.actif !== false)}
              className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-colors ${
                entity.actif !== false 
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {entity.actif !== false ? 'Désactiver' : 'Réactiver'}
            </button>
            <button
              onClick={() => handleEdit(entity)}
              className="w-9 h-9 rounded-lg text-surface-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center"
            >
              <FontAwesomeIcon icon={faEdit} />
            </button>
            <button
              onClick={() => handleDelete(entity.id)}
              className="w-9 h-9 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        </div>
        {children.length > 0 && (
          <div className="mt-3 space-y-3 border-l-2 border-surface-200 pl-4 ml-6">
            {children.map(child => renderHierarchy(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const getCurrentTabLabel = () => {
    if (activeTab === 'all') return 'Toutes les entités';
    if (activeTab === 'types-entites') return 'Types d\'entités (configuration)';
    const def = entiteTypes.find(t => t.code === activeTab);
    return def?.libellePluriel || getTypeLabel(activeTab as TypeEntiteOrganisationnelle);
  };

  // Rendu du formulaire par étape
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br ${getTypeGradient(formData.type)} text-white mb-4 shadow-lg`}>
                <FontAwesomeIcon icon={getTypeIcon(formData.type)} className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-surface-900">Informations de l'entité</h3>
              <p className="text-surface-500 mt-2">Définissez le nom et le type</p>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-surface-500" />
                  </div>
                  Nom <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Ex: Direction des Ressources Humaines"
                  className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-surface-900 placeholder:text-surface-400 font-medium"
                />
              </div>
              
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 text-surface-500" />
                  </div>
                  Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {entiteTypes.map((typeDef) => {
                    const isSelected = formData.type === typeDef.code;
                    const gradient = getTypeGradient(typeDef.code);
                    return (
                      <button
                        key={typeDef.id}
                        type="button"
                        onClick={() => setFormData({ 
                          ...formData, 
                          type: typeDef.code,
                          parentId: typeDef.code === 'direction' ? '' : formData.parentId
                        })}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50 shadow-lg'
                            : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-2`}>
                          <FontAwesomeIcon icon={getTypeIcon(typeDef.code)} className="w-4 h-4 text-white" />
                        </div>
                        <div className={`font-semibold text-sm ${isSelected ? 'text-primary-700' : 'text-surface-900'}`}>
                          {typeDef.libelleSingulier}
                        </div>
                      </button>
                    );
                  })}
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
                  placeholder="Description des missions et attributions..."
                  className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-surface-900 placeholder:text-surface-400 font-medium resize-none"
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
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 text-white mb-4 shadow-lg">
                <FontAwesomeIcon icon={faSitemap} className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-surface-900">Hiérarchie</h3>
              <p className="text-surface-500 mt-2">Définissez le rattachement et l'ordre</p>
            </div>
            
            <div className="space-y-5">
              {formData.type !== 'direction' && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faSitemap} className="w-4 h-4 text-surface-500" />
                    </div>
                    Entité parente <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.parentId}
                    onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                    className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-surface-900 font-medium cursor-pointer"
                  >
                    <option value="">Sélectionner une entité parente</option>
                    {getAvailableParents(formData.type).map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.nom} ({getTypeLabel(parent.type)})
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm text-surface-500 flex items-center gap-2">
                    <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                    L'entité parente disponible dépend du type choisi
                  </p>
                </div>
              )}

              {formData.type === 'direction' && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                      <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900">Entité de premier niveau</p>
                      <p className="text-sm text-blue-700">Les directions n'ont pas d'entité parente</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faSortNumericDown} className="w-4 h-4 text-surface-500" />
                  </div>
                  Ordre d'affichage
                </label>
                <input
                  type="number"
                  value={formData.ordre}
                  onChange={(e) => setFormData({ ...formData, ordre: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-surface-900 font-medium"
                  min="0"
                />
                <p className="mt-2 text-sm text-surface-500">
                  Utilisé pour trier les entités du même niveau (plus petit = premier)
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-surface-500" />
                  </div>
                  Chef / Responsable
                </label>
                <select
                  value={formData.responsableId}
                  onChange={(e) => setFormData({ ...formData, responsableId: e.target.value })}
                  className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-surface-900 font-medium"
                >
                  <option value="">Aucun</option>
                  {allUsers.filter(u => u.actif).map((u) => (
                    <option key={u.id} value={u.id}>{u.nom} {u.email ? `(${u.email})` : ''}</option>
                  ))}
                </select>
                <p className="mt-2 text-sm text-surface-500">
                  Responsable affiché dans l&apos;organigramme (chef de division, chef de bureau, etc.)
                </p>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 text-white mb-4 shadow-lg">
                <FontAwesomeIcon icon={faCheck} className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-surface-900">Confirmation</h3>
              <p className="text-surface-500 mt-2">Vérifiez les informations</p>
            </div>
            
            <div className="bg-gradient-to-br from-surface-50 to-white rounded-2xl p-6 border border-surface-200 space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-surface-100">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faBuilding} className="w-4 h-4" />
                  Nom
                </span>
                <span className="font-semibold text-surface-900">{formData.nom}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-surface-100">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4" />
                  Type
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r ${getTypeGradient(formData.type)} text-white`}>
                  {getTypeLabel(formData.type)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-surface-100">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faSitemap} className="w-4 h-4" />
                  Parent
                </span>
                <span className="font-medium text-surface-900">
                  {getParentName(formData.parentId) || 'Entité racine'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-surface-100">
                <span className="text-surface-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faSortNumericDown} className="w-4 h-4" />
                  Ordre
                </span>
                <span className="font-medium text-surface-900">{formData.ordre}</span>
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
              {formData.responsableId && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-surface-500 flex items-center gap-2">
                    <FontAwesomeIcon icon={faUser} className="w-4 h-4" />
                    Chef / Responsable
                  </span>
                  <span className="font-medium text-surface-900">
                    {allUsers.find(u => u.id === formData.responsableId)?.nom || formData.responsableId}
                  </span>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-surface-900 flex items-center gap-3">
            <FontAwesomeIcon icon={faSitemap} className="w-5 h-5 text-emerald-500" />
            {getCurrentTabLabel()}
          </h2>
          <p className="text-surface-500 mt-1">Organisez la structure de votre organisation</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-emerald-700">{activeEntities} actives</span>
          </div>
          <button
            type="button"
            onClick={() => setShowTabsDrawer(true)}
            className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 hover:border-surface-300 transition-all"
          >
            <FontAwesomeIcon icon={faLayerGroup} className="mr-2 w-4 h-4" />
            Choisir la vue
          </button>
        </div>
      </div>

      {activeTab === 'types-entites' ? (
        <div className="mt-4">
          <GestionTypesEntites />
        </div>
      ) : (
        <>
          {/* Actions */}
          <div className="flex items-center justify-end mb-6">
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all font-semibold text-sm shadow-lg shadow-emerald-500/25"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
              Nouvelle entité
            </button>
          </div>

          {/* Modal de formulaire (portail pour overlay pleine page) */}
          {showForm && (
            <AdminPortal>
              <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 border border-surface-200 max-h-[90vh] flex flex-col animate-slideIn">
                {/* Header */}
                <div className={`flex-shrink-0 px-5 py-3 border-b border-surface-100 bg-gradient-to-r ${getTypeGradient(formData.type)} rounded-t-3xl`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <FontAwesomeIcon icon={editingEntity ? faEdit : getTypeIcon(formData.type)} className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {editingEntity ? 'Modifier l\'entité' : 'Nouvelle entité'}
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
                  
                  {/* Steps */}
                  <div className="flex items-center justify-between">
                    {formSteps.map((step, index) => (
                      <React.Fragment key={step.id}>
                        <div className="flex flex-col items-center">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                            currentStep >= step.id 
                              ? 'bg-white text-emerald-600 shadow-lg' 
                              : 'bg-white/20 text-white/70'
                          }`}>
                            {currentStep > step.id ? (
                              <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                            ) : (
                              <FontAwesomeIcon icon={step.icon} className="w-4 h-4" />
                            )}
                          </div>
                          <span className={`text-[10px] mt-1 font-semibold ${currentStep >= step.id ? 'text-white' : 'text-white/60'}`}>
                            {step.title}
                          </span>
                        </div>
                        {index < formSteps.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${currentStep > step.id ? 'bg-white' : 'bg-white/20'}`} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                
                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8">
                  {renderStepContent()}
                </div>
                
                {/* Footer */}
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
                      {editingEntity ? 'Enregistrer' : 'Créer l\'entité'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            </AdminPortal>
          )}

          {/* Filtres (pour vue tableau) */}
          {(activeTab === 'direction' || activeTab === 'service' || activeTab === 'sous-service' || activeTab === 'division' || activeTab === 'bureau' || activeTab === 'cellule') && (
            <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl border border-surface-200 mb-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <div className="relative">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-surface-400" />
                    <input
                      type="text"
                      placeholder="Rechercher par nom..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
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
                </div>

                <div>
                  <select
                    value={filterStatut}
                    onChange={(e) => setFilterStatut(e.target.value as 'all' | 'actif' | 'inactif')}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium cursor-pointer"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="actif">Actifs uniquement</option>
                    <option value="inactif">Inactifs uniquement</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-bold">
                    {filteredEntities.length}
                  </span>
                  <span className="text-sm text-surface-600">
                    entité{filteredEntities.length > 1 ? 's' : ''} trouvée{filteredEntities.length > 1 ? 's' : ''}
                  </span>
                </div>
                {(searchTerm || filterStatut !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterStatut('all');
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sélection multiple */}
          {selectedEntities.size > 0 && (
            <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-slideInUp">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                    <FontAwesomeIcon icon={faCheck} className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-semibold text-emerald-800">
                    {selectedEntities.size} entité{selectedEntities.size > 1 ? 's' : ''} sélectionnée{selectedEntities.size > 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedEntities(new Set())}
                  className="px-4 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                >
                  Tout désélectionner
                </button>
              </div>
            </div>
          )}

          {/* Contenu */}
          <div className="space-y-4 relative min-h-[320px]">
            {loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm rounded-2xl">
                <FontAwesomeIcon icon={faSpinner} className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
                <p className="text-sm font-medium text-surface-600">Chargement des entités…</p>
              </div>
            )}
            {activeTab === 'all' ? (
              // Vue hiérarchique
              entities
                .filter(e => e.type === 'direction' && e.actif !== false)
                .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
                .map(direction => renderHierarchy(direction, 0))
            ) : (
              // Vue tableau
              <>
                <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-surface-100 text-sm">
                      <thead className="bg-surface-50">
                        <tr>
                          <th className="px-5 py-4 text-left w-12">
                            <input
                              type="checkbox"
                              checked={selectedEntities.size === paginatedEntities.length && paginatedEntities.length > 0}
                              onChange={handleSelectAll}
                              className="w-5 h-5 rounded-lg border-2 border-surface-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </th>
                          <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Entité</th>
                          <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider hidden md:table-cell">Parent</th>
                          <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Utilisateurs</th>
                          <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider w-20 hidden lg:table-cell">Ordre</th>
                          <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider w-28">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-surface-100">
                        {paginatedEntities.length > 0 ? (
                          paginatedEntities
                            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
                            .map((entity, index) => {
                              const Icon = getTypeIcon(entity.type);
                              const gradient = getTypeGradient(entity.type);
                              return (
                                <tr 
                                  key={entity.id}
                                  className={`hover:bg-emerald-50/60 active:bg-emerald-100 transition-all duration-200 cursor-pointer ${selectedEntities.has(entity.id) ? 'bg-emerald-50' : ''}`}
                                  style={{ animationDelay: `${index * 30}ms` }}
                                  onClick={() => {
                                    setSelectedEntityForResume(entity);
                                    setShowResumeModal(true);
                                  }}
                                >
                                  <td className="px-5 py-4">
                                    <input
                                      type="checkbox"
                                      checked={selectedEntities.has(entity.id)}
                                      onChange={() => handleSelectEntity(entity.id)}
                                      className="w-5 h-5 rounded-lg border-2 border-surface-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-5 py-4">
                                    <div className="flex items-center gap-4">
                                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
                                        <FontAwesomeIcon icon={Icon} className="w-4 h-4 text-white" />
                                      </div>
                                      <div>
                                        <span className="font-semibold text-surface-900">{entity.nom}</span>
                                        <p className="text-xs text-surface-500 mt-0.5">{getTypeLabel(entity.type)}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-4 hidden md:table-cell">
                                    {entity.parentId ? (
                                      <span className="text-sm text-surface-600">{getParentName(entity.parentId)}</span>
                                    ) : (
                                      <span className="text-sm text-surface-400 italic">—</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-4">
                                    {(() => {
                                      const entityUsers = getUsersForEntity(entity);
                                      return entityUsers.length > 0 ? (
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                              {entityUsers.length}
                                            </span>
                                            <span className="text-xs text-surface-600">utilisateur{entityUsers.length > 1 ? 's' : ''}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {entityUsers.slice(0, 3).map((user, index) => (
                                              <span
                                                key={`table-user-${user.id}-${index}`}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-100 text-surface-700 rounded-lg text-xs font-medium"
                                                title={user.email}
                                              >
                                                <FontAwesomeIcon icon={faUsers} className="w-3 h-3" />
                                                {user.nom}
                                              </span>
                                            ))}
                                            {entityUsers.length > 3 && (
                                              <span className="inline-flex items-center px-2 py-0.5 bg-surface-100 text-surface-500 rounded-lg text-xs font-medium">
                                                +{entityUsers.length - 3}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-xs text-surface-400 italic">Aucun utilisateur</span>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-5 py-4 text-sm text-surface-600 font-mono hidden lg:table-cell">
                                    {entity.ordre || 0}
                                  </td>
                                  <td className="px-5 py-4">
                                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl ${
                                      entity.actif !== false 
                                        ? 'bg-green-100 text-green-700 border border-green-200' 
                                        : 'bg-surface-100 text-surface-600 border border-surface-200'
                                    }`}>
                                      <span className={`w-2 h-2 rounded-full ${entity.actif !== false ? 'bg-green-500 animate-pulse' : 'bg-surface-400'}`} />
                                      {entity.actif !== false ? 'Actif' : 'Inactif'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-6 py-16 text-center">
                              <div className="flex flex-col items-center">
                                <div className="w-20 h-20 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
                                  <FontAwesomeIcon icon={faSitemap} className="w-8 h-8 text-surface-400" />
                                </div>
                                <p className="text-surface-500 font-medium">Aucune entité trouvée</p>
                                <p className="text-surface-400 text-sm mt-1">Modifiez vos filtres ou créez une nouvelle entité</p>
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
                      Affichage de <span className="font-semibold text-surface-900">{startIndex + 1}</span> à <span className="font-semibold text-surface-900">{Math.min(endIndex, filteredEntities.length)}</span> sur <span className="font-semibold text-surface-900">{filteredEntities.length}</span>
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
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page, index) => {
                          if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                            return (
                              <button
                                key={`page-${page}`}
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
                            return <span key={`ellipsis-${page}-${index}`} className="px-2 text-surface-400">...</span>;
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
              </>
            )}

            {entities.filter(e => e.type === 'direction' && e.actif !== false).length === 0 && activeTab === 'all' && (
              <div className="text-center py-16 bg-white rounded-2xl border border-surface-200">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-4 opacity-50">
                  <FontAwesomeIcon icon={faSitemap} className="w-8 h-8 text-white" />
                </div>
                <p className="text-surface-500 font-medium">Aucune entité configurée</p>
                <p className="text-surface-400 text-sm mt-1">Commencez par créer une direction</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de résumé */}
      {showResumeModal && selectedEntityForResume && (
        <AdminPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]" onClick={() => {
            setShowResumeModal(false);
            setSelectedEntityForResume(null);
          }}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-white">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Détails de l'entité</h2>
                  <p className="text-sm text-gray-500 mt-1">Informations complètes</p>
                </div>
                <button
                  onClick={() => {
                    setShowResumeModal(false);
                    setSelectedEntityForResume(null);
                  }}
                  className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xl" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${getTypeGradient(selectedEntityForResume.type)} flex items-center justify-center shadow-lg`}>
                    <FontAwesomeIcon icon={getTypeIcon(selectedEntityForResume.type)} className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selectedEntityForResume.nom}</h3>
                    <p className="text-gray-600 mt-1">{getTypeLabel(selectedEntityForResume.type)}</p>
                    <span className={`inline-flex items-center gap-2 mt-2 px-3 py-1.5 text-xs font-bold rounded-xl ${
                      selectedEntityForResume.actif !== false 
                        ? 'bg-green-100 text-green-700 border border-green-200' 
                        : 'bg-surface-100 text-surface-600 border border-surface-200'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${selectedEntityForResume.actif !== false ? 'bg-green-500 animate-pulse' : 'bg-surface-400'}`} />
                      {selectedEntityForResume.actif !== false ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</label>
                    <p className="text-gray-900 mt-2 font-medium">{getTypeLabel(selectedEntityForResume.type)}</p>
                  </div>
                  {selectedEntityForResume.parentId && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Entité parente</label>
                      <p className="text-gray-900 mt-2 font-medium">{getParentName(selectedEntityForResume.parentId)}</p>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ordre</label>
                    <p className="text-gray-900 mt-2 font-medium">{selectedEntityForResume.ordre || 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Utilisateurs</label>
                    <p className="text-gray-900 mt-2 font-medium">
                      {getUsersForEntity(selectedEntityForResume).length} utilisateur{getUsersForEntity(selectedEntityForResume).length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {selectedEntityForResume.description && (
                    <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</label>
                      <p className="text-gray-900 mt-2 font-medium">{selectedEntityForResume.description}</p>
                    </div>
                  )}
            </div>
            
                {/* Section Utilisateurs */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                        <FontAwesomeIcon icon={faUsers} className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-gray-900">Utilisateurs</h4>
                        <p className="text-sm text-gray-600">
                          {getUsersForEntity(selectedEntityForResume).length} utilisateur{getUsersForEntity(selectedEntityForResume).length > 1 ? 's' : ''} associé{getUsersForEntity(selectedEntityForResume).length > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
            <button
              onClick={() => {
                        setSelectedUsersForEntity(new Set(getUsersForEntity(selectedEntityForResume).map(u => u.id)));
                        setUserSearchTerm('');
                        setShowUsersModal(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                      <span>Gérer</span>
            </button>
                  </div>
                  
                  {getUsersForEntity(selectedEntityForResume).length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {getUsersForEntity(selectedEntityForResume).map((user, index) => (
                        <div key={`modal-user-${user.id}-${index}`} className="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-100">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <FontAwesomeIcon icon={faUser} className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{user.nom}</p>
                              <p className="text-xs text-gray-500">{user.email} • {user.role}</p>
                            </div>
                          </div>
            <button
              onClick={async () => {
                              if (window.confirm(`Retirer ${user.nom} de cette entité ?`)) {
                                if (selectedEntityForResume.type === 'direction') {
                                  await adminService.updateUser(user.id, { direction: undefined, entiteId: undefined });
                                } else if (selectedEntityForResume.type === 'service') {
                                  await adminService.updateUser(user.id, { service: undefined, entiteId: undefined });
                                } else {
                                  await adminService.updateUser(user.id, { entiteId: undefined });
                                }
                                await loadData();
                                setShowResumeModal(false);
                                const updatedEntities = entiteOrganisationnelleService.getAllEntities();
                                const updatedUsers = adminService.getAllUsers();
                                setEntities(updatedEntities);
                                setAllUsers(updatedUsers);
                                setTimeout(() => {
                                  const updatedEntity = updatedEntities.find(e => e.id === selectedEntityForResume.id);
                                  if (updatedEntity) {
                                    setSelectedEntityForResume(updatedEntity);
                                    setShowResumeModal(true);
                                  }
                                }, 100);
                              }
                            }}
                            className="text-red-600 hover:text-red-700 p-2"
                            title="Retirer"
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
              </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-white rounded-lg border border-blue-100">
                      <FontAwesomeIcon icon={faUsers} className="w-12 h-12 text-blue-200 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Aucun utilisateur associé</p>
                      <button
                        onClick={() => {
                          setSelectedUsersForEntity(new Set());
                          setUserSearchTerm('');
                          setShowUsersModal(true);
                        }}
                        className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Ajouter des utilisateurs
            </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-white/95 backdrop-blur sticky bottom-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <FontAwesomeIcon icon={faInfoCircle} className="text-gray-400" />
                  <span>Actions sur cette entité</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => {
                      setShowResumeModal(false);
                      setSelectedEntityForResume(null);
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={() => {
                      handleEdit(selectedEntityForResume);
                      setShowResumeModal(false);
                      setSelectedEntityForResume(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <FontAwesomeIcon icon={faEdit} />
                    <span>Modifier</span>
                  </button>
                  <button
                    onClick={() => {
                      handleToggleActive(selectedEntityForResume.id, selectedEntityForResume.actif !== false);
                      setShowResumeModal(false);
                      setSelectedEntityForResume(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm"
                  >
                    <FontAwesomeIcon icon={selectedEntityForResume.actif !== false ? faToggleOff : faToggleOn} />
                    <span>{selectedEntityForResume.actif !== false ? 'Désactiver' : 'Activer'}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Êtes-vous sûr de vouloir supprimer l'entité ${selectedEntityForResume.nom} ? Toutes les entités enfants seront également supprimées.`)) {
                        handleDelete(selectedEntityForResume.id);
                        setShowResumeModal(false);
                        setSelectedEntityForResume(null);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    <span>Supprimer</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </AdminPortal>
      )}

      {/* Modal de gestion des utilisateurs */}
      {showUsersModal && selectedEntityForResume && (
        <AdminPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50001]" onClick={() => {
            setShowUsersModal(false);
            setSelectedUsersForEntity(new Set());
          }}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Gérer les utilisateurs</h2>
                  <p className="text-sm text-gray-500 mt-1">{selectedEntityForResume.nom} ({getTypeLabel(selectedEntityForResume.type)})</p>
                </div>
            <button
              onClick={() => {
                    setShowUsersModal(false);
                    setSelectedUsersForEntity(new Set());
                    setUserSearchTerm('');
                  }}
                  className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xl" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-600">
                      {allUsers.filter(u => u.actif).length} utilisateur{allUsers.filter(u => u.actif).length > 1 ? 's' : ''} disponible{allUsers.filter(u => u.actif).length > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="relative">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Rechercher un utilisateur..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {(() => {
                    const filteredUsers = allUsers.filter(u => {
                      if (!u.actif) return false;
                      if (!userSearchTerm) return true;
                      const search = userSearchTerm.toLowerCase();
                      return u.nom.toLowerCase().includes(search) || 
                             u.email.toLowerCase().includes(search) ||
                             u.role.toLowerCase().includes(search);
                    });
                    
                    if (filteredUsers.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <FontAwesomeIcon icon={faUsers} className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500">Aucun utilisateur trouvé</p>
                        </div>
                      );
                    }
                    
                    return filteredUsers.map((user, index) => {
                      const isSelected = selectedUsersForEntity.has(user.id);
                      const isInEntity = getUsersForEntity(selectedEntityForResume).some(u => u.id === user.id);
                      return (
                        <div
                          key={`filtered-user-${user.id}-${index}`}
                          className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                            isSelected || isInEntity
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-200 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected || isInEntity}
                              onChange={(e) => {
                                const newSelected = new Set(selectedUsersForEntity);
                                if (e.target.checked) {
                                  newSelected.add(user.id);
                                } else {
                                  newSelected.delete(user.id);
                                }
                                setSelectedUsersForEntity(newSelected);
                              }}
                              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <FontAwesomeIcon icon={faUser} className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{user.nom}</p>
                              <p className="text-xs text-gray-500">{user.email} • {user.role}</p>
                            </div>
                          </div>
                          {isInEntity && (
                            <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded">
                              Déjà associé
                            </span>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                {userSearchTerm && (
                  <div className="mt-4 text-sm text-gray-500 text-center">
                    {allUsers.filter(u => {
                      if (!u.actif) return false;
                      const search = userSearchTerm.toLowerCase();
                      return u.nom.toLowerCase().includes(search) || 
                             u.email.toLowerCase().includes(search) ||
                             u.role.toLowerCase().includes(search);
                    }).length} résultat{allUsers.filter(u => {
                      if (!u.actif) return false;
                      const search = userSearchTerm.toLowerCase();
                      return u.nom.toLowerCase().includes(search) || 
                             u.email.toLowerCase().includes(search) ||
                             u.role.toLowerCase().includes(search);
                    }).length > 1 ? 's' : ''} trouvé{allUsers.filter(u => {
                      if (!u.actif) return false;
                      const search = userSearchTerm.toLowerCase();
                      return u.nom.toLowerCase().includes(search) || 
                             u.email.toLowerCase().includes(search) ||
                             u.role.toLowerCase().includes(search);
                    }).length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-white/95 backdrop-blur sticky bottom-0">
                <div className="text-sm text-gray-600">
                  {(() => {
                    const currentUsers = getUsersForEntity(selectedEntityForResume);
                    const totalSelected = new Set([...Array.from(selectedUsersForEntity), ...currentUsers.map(u => u.id)]);
                    return `${totalSelected.size} utilisateur${totalSelected.size > 1 ? 's' : ''} ${selectedUsersForEntity.size > 0 ? 'sélectionné' : 'associé'}${totalSelected.size > 1 ? 's' : ''}`;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowUsersModal(false);
                      setSelectedUsersForEntity(new Set());
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={async () => {
                      for (const userId of selectedUsersForEntity) {
                        const user = allUsers.find(u => u.id === userId);
                        if (user) {
                          if (selectedEntityForResume.type === 'direction') {
                            await adminService.updateUser(userId, { direction: selectedEntityForResume.nom, entiteId: undefined });
                          } else if (selectedEntityForResume.type === 'service') {
                            const parentEntity = entities.find(e => e.id === selectedEntityForResume.parentId);
                            if (parentEntity) {
                              await adminService.updateUser(userId, { 
                                direction: parentEntity.nom, 
                                service: selectedEntityForResume.nom,
                                entiteId: undefined
                              });
                            }
                          } else {
                            await adminService.updateUser(userId, { entiteId: selectedEntityForResume.id });
                          }
                        }
                      }
                      const currentUsers = getUsersForEntity(selectedEntityForResume);
                      for (const user of currentUsers) {
                        if (!selectedUsersForEntity.has(user.id)) {
                          if (selectedEntityForResume.type === 'direction') {
                            await adminService.updateUser(user.id, { direction: undefined, entiteId: undefined });
                          } else if (selectedEntityForResume.type === 'service') {
                            await adminService.updateUser(user.id, { service: undefined, entiteId: undefined });
                          } else {
                            await adminService.updateUser(user.id, { entiteId: undefined });
                          }
                        }
                      }
                      await loadData();
                      setShowUsersModal(false);
                      setSelectedUsersForEntity(new Set());
                      setUserSearchTerm('');
                      // Recharger le modal de résumé avec les données mises à jour
                      const updatedEntities = entiteOrganisationnelleService.getAllEntities();
                      const updatedUsers = adminService.getAllUsers();
                      setEntities(updatedEntities);
                      setAllUsers(updatedUsers);
                      setTimeout(() => {
                        const updatedEntity = updatedEntities.find(e => e.id === selectedEntityForResume.id);
                        if (updatedEntity) {
                          setSelectedEntityForResume(updatedEntity);
                          setShowResumeModal(true);
                        }
                      }, 100);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    <FontAwesomeIcon icon={faSave} className="mr-2" />
                    Enregistrer
            </button>
          </div>
              </div>
            </div>
          </div>
        </AdminPortal>
      )}

      {/* Drawer de sélection des vues */}
      {showTabsDrawer && (
        <AdminPortal>
          <div className="fixed inset-0 z-[50000] flex justify-end">
            <div className="absolute inset-0 bg-surface-900/60 backdrop-blur-sm" onClick={() => setShowTabsDrawer(false)} />
            <div className="relative h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-slideInRight">
            <div className="flex items-center justify-between px-6 py-5 border-b border-surface-100 bg-gradient-to-r from-surface-50 to-white">
              <div>
                <h3 className="text-lg font-bold text-surface-900">Choisir une vue</h3>
                <p className="text-sm text-surface-500 mt-0.5">
                  Filtrez par type d'entité
                </p>
              </div>
              <button
                onClick={() => setShowTabsDrawer(false)}
                className="w-10 h-10 rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button
                onClick={() => { setActiveTab('all'); setShowTabsDrawer(false); }}
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all ${
                  activeTab === 'all'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                    : 'text-surface-700 hover:bg-surface-50 border border-surface-200'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeTab === 'all' ? 'bg-white/20' : 'bg-emerald-100'}`}>
                  <FontAwesomeIcon icon={faSitemap} className={`w-5 h-5 ${activeTab === 'all' ? 'text-white' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <span className="font-semibold block">Toutes les entités</span>
                  <span className={`text-xs ${activeTab === 'all' ? 'text-white/70' : 'text-surface-500'}`}>Vue hiérarchique complète</span>
                </div>
              </button>

              <div className="pt-4">
                <p className="px-2 mb-2 text-xs font-bold text-surface-500 uppercase tracking-wider">Types d'entités</p>
                <div className="space-y-2">
                  {entiteTypes.map((typeDef) => {
                    const gradient = getTypeGradient(typeDef.code);
                    const isActive = activeTab === typeDef.code;
                    return (
                      <button
                        key={typeDef.id}
                        onClick={() => { setActiveTab(typeDef.code); setShowTabsDrawer(false); }}
                        className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all ${
                          isActive
                            ? `bg-gradient-to-r ${gradient} text-white shadow-lg`
                            : 'text-surface-700 hover:bg-surface-50 border border-surface-200'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isActive ? 'bg-white/20' : `bg-gradient-to-br ${gradient}`}`}>
                          <FontAwesomeIcon icon={getTypeIcon(typeDef.code)} className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white'}`} />
                        </div>
                        <div>
                          <span className="font-semibold block">{typeDef.libellePluriel}</span>
                          <span className={`text-xs ${isActive ? 'text-white/70' : 'text-surface-500'}`}>
                            {entities.filter(e => e.type === typeDef.code && e.actif !== false).length} éléments
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-surface-100">
                <p className="px-2 mb-2 text-xs font-bold text-surface-500 uppercase tracking-wider">Configuration</p>
                <button
                  onClick={() => { setActiveTab('types-entites'); setShowTabsDrawer(false); }}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all ${
                    activeTab === 'types-entites'
                      ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                      : 'text-surface-700 hover:bg-surface-50 border border-surface-200'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeTab === 'types-entites' ? 'bg-white/20' : 'bg-violet-100'}`}>
                    <FontAwesomeIcon icon={faLayerGroup} className={`w-5 h-5 ${activeTab === 'types-entites' ? 'text-white' : 'text-violet-600'}`} />
                  </div>
                  <div>
                    <span className="font-semibold block">Types d'entités</span>
                    <span className={`text-xs ${activeTab === 'types-entites' ? 'text-white/70' : 'text-surface-500'}`}>Configuration avancée</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
          </div>
        </AdminPortal>
      )}
    </div>
  );
};

export default GestionDirectionsServices;
