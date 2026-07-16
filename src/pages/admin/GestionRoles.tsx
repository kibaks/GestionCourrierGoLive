import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { adminService } from '../../services/adminService';
import { laravelApiService } from '../../services/laravelApiService';
import { RoleDefinition, Role, Permission } from '../../types';
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
  faShieldAlt,
  faCheck,
  faLock,
  faEye,
  faUserShield,
  faKey,
  faCrown,
  faFileAlt,
  faUsers,
  faSitemap,
  faArrowRight,
  faStar,
  faCheckCircle,
  faInfoCircle,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';

// Portail pour rendre le modal au niveau de <body>, afin que l'overlay couvre tout l'écran
const RolesPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

const GestionRoles: React.FC = () => {
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [formData, setFormData] = useState({
    nom: '',
    code: Role.AGENT,
    description: '',
    permissions: [] as Permission[]
  });
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [selectedRoleForResume, setSelectedRoleForResume] = useState<RoleDefinition | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCode, setFilterCode] = useState<Role | ''>('');
  const [detailsRole, setDetailsRole] = useState<RoleDefinition | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (laravelApiService.isConfigured()) {
          await adminService.refreshRolesFromApi();
        }
        loadRoles();
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const loadRoles = () => {
    const allRoles = adminService.getAllRoles();
    setRoles(allRoles);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await adminService.updateRole(editingRole.id, formData);
      } else {
        await adminService.createRole(formData);
      }
      resetForm();
      loadRoles();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement du rôle.');
    }
  };

  const resetForm = () => {
    setFormData({
      nom: '',
      code: Role.AGENT,
      description: '',
      permissions: []
    });
    setEditingRole(null);
    setShowForm(false);
    setCurrentStep(1);
  };

  const handleEdit = (role: RoleDefinition) => {
    setEditingRole(role);
    setFormData({
      nom: role.nom,
      code: role.code,
      description: role.description || '',
      permissions: role.permissions
    });
    setCurrentStep(1);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce rôle ?')) return;
    try {
      await adminService.deleteRole(id);
      loadRoles();
      setSelectedRoles(new Set());
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erreur lors de la suppression du rôle.');
    }
  };

  const handleSelectAll = () => {
    if (selectedRoles.size === paginatedRoles.length) {
      setSelectedRoles(new Set());
    } else {
      setSelectedRoles(new Set(paginatedRoles.map(r => r.id)));
    }
  };

  const handleSelectRole = (roleId: string) => {
    const newSelected = new Set(selectedRoles);
    if (newSelected.has(roleId)) {
      newSelected.delete(roleId);
    } else {
      newSelected.add(roleId);
    }
    setSelectedRoles(newSelected);
  };

  const filteredRoles = roles.filter(role => {
    const matchesSearch = searchTerm === '' || 
      role.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCode = filterCode === '' || role.code === filterCode;

    return matchesSearch && matchesCode;
  });

  const totalPages = Math.ceil(filteredRoles.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRoles = filteredRoles.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCode]);

  const togglePermission = (permission: Permission) => {
    setFormData({
      ...formData,
      permissions: formData.permissions.includes(permission)
        ? formData.permissions.filter(p => p !== permission)
        : [...formData.permissions, permission]
    });
  };

  const permissionGroups = {
    'Gestion des courriers': {
      icon: faFileAlt,
      color: 'blue',
      permissions: [
        Permission.VOIR_COURRIERS,
        Permission.CREER_COURRIER,
        Permission.MODIFIER_COURRIER,
        Permission.SUPPRIMER_COURRIER,
        Permission.ASSIGNER_COURRIER
      ]
    },
    'Gestion des workflows': {
      icon: faSitemap,
      color: 'violet',
      permissions: [
        Permission.CREER_WORKFLOW,
        Permission.MODIFIER_WORKFLOW
      ]
    },
    'Gestion des utilisateurs': {
      icon: faUsers,
      color: 'emerald',
      permissions: [
        Permission.VOIR_UTILISATEURS,
        Permission.CREER_UTILISATEUR,
        Permission.MODIFIER_UTILISATEUR,
        Permission.SUPPRIMER_UTILISATEUR
      ]
    },
    'Gestion des rôles': {
      icon: faUserShield,
      color: 'amber',
      permissions: [
        Permission.VOIR_ROLES,
        Permission.CREER_ROLE,
        Permission.MODIFIER_ROLE,
        Permission.SUPPRIMER_ROLE
      ]
    },
    'Gestion des départements': {
      icon: faSitemap,
      color: 'rose',
      permissions: [
        Permission.VOIR_DEPARTEMENTS,
        Permission.CREER_DEPARTEMENT,
        Permission.MODIFIER_DEPARTEMENT,
        Permission.SUPPRIMER_DEPARTEMENT
      ]
    },
    'Gestion des permissions': {
      icon: faKey,
      color: 'cyan',
      permissions: [
        Permission.VOIR_PERMISSIONS,
        Permission.MODIFIER_PERMISSIONS
      ]
    }
  };

  const permissionLabels: Record<Permission, string> = {
    [Permission.VOIR_COURRIERS]: 'Voir les courriers',
    [Permission.ALL_COURRIERS_VIEW]: 'Voir tous les courriers',
    [Permission.CREER_COURRIER]: 'Créer un courrier',
    [Permission.MODIFIER_COURRIER]: 'Modifier un courrier',
    [Permission.SUPPRIMER_COURRIER]: 'Supprimer un courrier',
    [Permission.ASSIGNER_COURRIER]: 'Assigner un courrier',
    [Permission.CREER_COURRIER_SORTANT_EXTERNE]: 'Créer courrier sortant externe',
    [Permission.VIEW_RAPPELS]: 'Voir les rappels',
    [Permission.CREER_WORKFLOW]: 'Créer un workflow',
    [Permission.MODIFIER_WORKFLOW]: 'Modifier un workflow',
    [Permission.VOIR_UTILISATEURS]: 'Voir les utilisateurs',
    [Permission.CREER_UTILISATEUR]: 'Créer un utilisateur',
    [Permission.MODIFIER_UTILISATEUR]: 'Modifier un utilisateur',
    [Permission.SUPPRIMER_UTILISATEUR]: 'Supprimer un utilisateur',
    [Permission.VOIR_ROLES]: 'Voir les rôles',
    [Permission.CREER_ROLE]: 'Créer un rôle',
    [Permission.MODIFIER_ROLE]: 'Modifier un rôle',
    [Permission.SUPPRIMER_ROLE]: 'Supprimer un rôle',
    [Permission.VOIR_DEPARTEMENTS]: 'Voir les départements',
    [Permission.CREER_DEPARTEMENT]: 'Créer un département',
    [Permission.MODIFIER_DEPARTEMENT]: 'Modifier un département',
    [Permission.SUPPRIMER_DEPARTEMENT]: 'Supprimer un département',
    [Permission.VOIR_PERMISSIONS]: 'Voir les permissions',
    [Permission.MODIFIER_PERMISSIONS]: 'Modifier les permissions',
    [Permission.FILTRER_PAR_DIRECTION]: 'Filtrer par direction',
    [Permission.FILTRER_PAR_SERVICE]: 'Filtrer par service',
    [Permission.FILTRER_PAR_SOUS_SERVICE]: 'Filtrer par sous-service'
  };

  const formSteps = [
    { id: 1, title: 'Informations', description: 'Nom et description', icon: faShieldAlt },
    { id: 2, title: 'Permissions', description: 'Droits d\'accès', icon: faKey },
    { id: 3, title: 'Confirmation', description: 'Vérification', icon: faCheck }
  ];

  const canGoToNextStep = () => {
    switch (currentStep) {
      case 1:
        return formData.nom.trim() !== '' && !!formData.code;
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

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; text: string; border: string; light: string }> = {
      blue: { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200', light: 'bg-blue-50' },
      violet: { bg: 'bg-violet-500', text: 'text-violet-600', border: 'border-violet-200', light: 'bg-violet-50' },
      emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50' },
      amber: { bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200', light: 'bg-amber-50' },
      rose: { bg: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-200', light: 'bg-rose-50' },
      cyan: { bg: 'bg-cyan-500', text: 'text-cyan-600', border: 'border-cyan-200', light: 'bg-cyan-50' }
    };
    return colors[color] || colors.blue;
  };

  const getRoleGradient = (code: Role) => {
    switch (code) {
      case Role.SUPER_ADMIN:
        return 'from-purple-500 to-violet-600';
      case Role.DIRECTEUR_GENERAL:
        return 'from-blue-500 to-cyan-500';
      case Role.DIRECTEUR:
        return 'from-emerald-500 to-teal-500';
      case Role.CHEF_SERVICE:
        return 'from-amber-500 to-orange-500';
      default:
        return 'from-slate-400 to-gray-500';
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-surface-900 flex items-center gap-3">
            <FontAwesomeIcon icon={faShieldAlt} className="w-5 h-5 text-violet-500" />
            Gestion des Rôles & Permissions
          </h2>
          <p className="text-surface-500 mt-1">Configurez les droits d'accès pour chaque rôle</p>
        </div>
        
        {/* Stats rapides */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 border border-violet-200 rounded-xl">
            <FontAwesomeIcon icon={faCrown} className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold text-violet-700">{roles.length} rôles</span>
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
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl hover:from-violet-600 hover:to-purple-600 transition-all font-semibold text-sm shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30"
        >
          <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
          Nouveau rôle
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
                placeholder="Rechercher par nom ou code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-sm font-medium"
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
                value={filterCode}
                onChange={(e) => setFilterCode(e.target.value as Role | '')}
                className="w-full pl-12 pr-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 appearance-none transition-all text-sm font-medium cursor-pointer"
              >
                <option value="">Tous les codes</option>
                {Object.values(Role).map(role => (
                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 text-violet-700 text-sm font-bold">
              {filteredRoles.length}
            </span>
            <span className="text-sm text-surface-600">
              rôle{filteredRoles.length > 1 ? 's' : ''} trouvé{filteredRoles.length > 1 ? 's' : ''}
            </span>
          </div>
          {(searchTerm || filterCode) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterCode('');
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Modal de création/modification (portail + overlay pleine page) */}
      {showForm && (
        <RolesPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl mx-4 border border-surface-200 max-h-[90vh] flex flex-col animate-slideIn">
            {/* Header avec indicateur d'étapes */}
            <div className="flex-shrink-0 px-5 py-3 border-b border-surface-100 bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500 rounded-t-3xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <FontAwesomeIcon icon={editingRole ? faEdit : faShieldAlt} className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingRole ? 'Modifier le rôle' : 'Nouveau rôle'}
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
                          ? 'bg-white text-violet-600 shadow-lg' 
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
              <form onSubmit={handleSubmit}>
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 text-white mb-4 shadow-lg shadow-violet-500/25">
                        <FontAwesomeIcon icon={faShieldAlt} className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-surface-900">Informations du rôle</h3>
                      <p className="text-surface-500 mt-2">Définissez le nom et la description du rôle</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                            <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4 text-surface-500" />
                          </div>
                          Nom du rôle
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.nom}
                          onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                          placeholder="Ex: Administrateur"
                          className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-surface-900 placeholder:text-surface-400 font-medium"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                            <FontAwesomeIcon icon={faKey} className="w-4 h-4 text-surface-500" />
                          </div>
                          Code
                          <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value as Role })}
                          className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-surface-900 font-medium cursor-pointer"
                        >
                          {Object.values(Role).map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                          <FontAwesomeIcon icon={faFileAlt} className="w-4 h-4 text-surface-500" />
                        </div>
                        Description
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-3.5 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-surface-900 font-medium resize-none"
                        rows={3}
                        placeholder="Décrivez les responsabilités de ce rôle..."
                      />
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 shadow-lg shadow-amber-500/25">
                        <FontAwesomeIcon icon={faKey} className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-bold text-surface-900">Permissions</h3>
                      <p className="text-surface-500 mt-2">Sélectionnez les droits pour ce rôle</p>
                    </div>
                    
                    <div className="space-y-4">
                      {Object.entries(permissionGroups).map(([group, data]) => {
                        const colorClasses = getColorClasses(data.color);
                        const allSelected = data.permissions.every(p => formData.permissions.includes(p));
                        const someSelected = data.permissions.some(p => formData.permissions.includes(p));
                        
                        return (
                          <div key={group} className={`rounded-2xl border-2 ${someSelected ? colorClasses.border : 'border-surface-200'} overflow-hidden transition-colors`}>
                            <div className={`px-5 py-4 ${someSelected ? colorClasses.light : 'bg-surface-50'} flex items-center justify-between`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl ${colorClasses.bg} flex items-center justify-center`}>
                                  <FontAwesomeIcon icon={data.icon} className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                  <h4 className="font-semibold text-surface-900">{group}</h4>
                                  <p className="text-xs text-surface-500">{data.permissions.length} permissions</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (allSelected) {
                                    setFormData({
                                      ...formData,
                                      permissions: formData.permissions.filter(p => !data.permissions.includes(p))
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      permissions: [...new Set([...formData.permissions, ...data.permissions])]
                                    });
                                  }
                                }}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                  allSelected 
                                    ? `${colorClasses.bg} text-white shadow-lg` 
                                    : 'bg-white border-2 border-surface-200 text-surface-700 hover:border-surface-300'
                                }`}
                              >
                                {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                              </button>
                            </div>
                            <div className="p-4 bg-white">
                              <div className="grid grid-cols-2 gap-2">
                                {data.permissions.map((permission) => {
                                  const isChecked = formData.permissions.includes(permission);
                                  return (
                                    <label 
                                      key={permission} 
                                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                                        isChecked 
                                          ? `${colorClasses.light} ${colorClasses.border} border-2` 
                                          : 'hover:bg-surface-50 border-2 border-transparent'
                                      }`}
                                    >
                                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                                        isChecked ? `${colorClasses.bg}` : 'border-2 border-surface-300'
                                      }`}>
                                        {isChecked && <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-white" />}
                                      </div>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => togglePermission(permission)}
                                        className="sr-only"
                                      />
                                      <span className={`text-sm font-medium ${isChecked ? colorClasses.text : 'text-surface-700'}`}>
                                        {permissionLabels[permission] || permission}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
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
                        <span className="text-surface-500">Nom</span>
                        <span className="font-semibold text-surface-900">{formData.nom || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b border-surface-100">
                        <span className="text-surface-500">Code</span>
                        <span className={`px-3 py-1.5 rounded-lg text-sm font-mono font-semibold bg-gradient-to-r ${getRoleGradient(formData.code)} text-white`}>
                          {formData.code}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b border-surface-100">
                        <span className="text-surface-500">Description</span>
                        <span className="font-medium text-surface-900 text-right max-w-xs">
                          {formData.description || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <span className="text-surface-500">Permissions</span>
                        <span className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-sm font-bold">
                          {formData.permissions.length} sélectionnée{formData.permissions.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 flex items-center justify-between gap-4 px-8 py-5 border-t border-surface-100 bg-surface-50 rounded-b-3xl">
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
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-500 rounded-xl hover:from-violet-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/25 flex items-center gap-2"
                >
                  Suivant
                  <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="submit"
                  onClick={handleSubmit}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg shadow-green-500/25 flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                  {editingRole ? 'Modifier le rôle' : 'Créer le rôle'}
                </button>
              )}
            </div>
          </div>
        </div>
        </RolesPortal>
      )}

      {/* Sélection multiple */}
      {selectedRoles.size > 0 && (
        <div className="mb-4 p-4 bg-violet-50 border border-violet-200 rounded-2xl animate-slideInUp">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center">
                <FontAwesomeIcon icon={faCheck} className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-violet-800">
                {selectedRoles.size} rôle{selectedRoles.size > 1 ? 's' : ''} sélectionné{selectedRoles.size > 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={() => setSelectedRoles(new Set())}
              className="px-4 py-2 text-sm font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-100 rounded-lg transition-colors"
            >
              Tout désélectionner
            </button>
          </div>
        </div>
      )}

      {/* Table des rôles */}
      <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm relative min-h-[320px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-50/90 backdrop-blur-sm">
            <FontAwesomeIcon icon={faSpinner} className="w-10 h-10 text-violet-600 animate-spin mb-3" />
            <p className="text-sm font-medium text-surface-600">Chargement des rôles…</p>
          </div>
        )}
        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full divide-y divide-surface-100 text-sm">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-5 py-4 text-left w-12">
                  <input
                    type="checkbox"
                    checked={selectedRoles.size === paginatedRoles.length && paginatedRoles.length > 0}
                    onChange={handleSelectAll}
                    className="w-5 h-5 rounded-lg border-2 border-surface-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Nom</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Code</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider hidden md:table-cell">Description</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Permissions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-surface-100">
              {paginatedRoles.length > 0 ? (
                paginatedRoles.map((role, index) => (
                  <tr 
                    key={role.id} 
                    className={`hover:bg-violet-50/60 active:bg-violet-100 transition-all duration-200 cursor-pointer ${selectedRoles.has(role.id) ? 'bg-violet-50' : ''}`}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => {
                      setSelectedRoleForResume(role);
                      setShowResumeModal(true);
                    }}
                  >
                    <td className="px-5 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedRoles.has(role.id)}
                        onChange={() => handleSelectRole(role.id)}
                        className="w-5 h-5 rounded-lg border-2 border-surface-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getRoleGradient(role.code)} flex items-center justify-center shadow-lg`}>
                          <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-semibold text-surface-900">{role.nom}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="px-3 py-1.5 rounded-lg bg-surface-100 text-surface-800 text-xs font-mono font-semibold">
                        {role.code}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-surface-500 hidden md:table-cell">
                      <span className="line-clamp-1">{role.description || '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-xs font-bold">
                        <FontAwesomeIcon icon={faKey} className="w-3 h-3" />
                        {role.permissions.length}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-20 h-20 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
                        <FontAwesomeIcon icon={faShieldAlt} className="w-8 h-8 text-surface-400" />
                      </div>
                      <p className="text-surface-500 font-medium">Aucun rôle trouvé</p>
                      <p className="text-surface-400 text-sm mt-1">Créez un nouveau rôle pour commencer</p>
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
            Affichage de <span className="font-semibold text-surface-900">{startIndex + 1}</span> à <span className="font-semibold text-surface-900">{Math.min(endIndex, filteredRoles.length)}</span> sur <span className="font-semibold text-surface-900">{filteredRoles.length}</span> rôle{filteredRoles.length > 1 ? 's' : ''}
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
                          ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/25'
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

      {/* Modal de résumé */}
      {showResumeModal && selectedRoleForResume && (
        <RolesPortal>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[50000]" onClick={() => {
            setShowResumeModal(false);
            setSelectedRoleForResume(null);
          }}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-violet-50 to-white">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Détails du rôle</h2>
                  <p className="text-sm text-gray-500 mt-1">Informations complètes</p>
                </div>
                <button
            onClick={() => {
                    setShowResumeModal(false);
                    setSelectedRoleForResume(null);
            }}
                  className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xl" />
                </button>
            </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${getRoleGradient(selectedRoleForResume.code)} flex items-center justify-center shadow-lg`}>
                    <FontAwesomeIcon icon={faShieldAlt} className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selectedRoleForResume.nom}</h3>
                    <p className="text-gray-600 mt-1 font-mono">{selectedRoleForResume.code}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</label>
                    <p className="text-gray-900 mt-2 font-medium font-mono">{selectedRoleForResume.code}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Permissions</label>
                    <p className="text-gray-900 mt-2 font-medium">{selectedRoleForResume.permissions.length} permission{selectedRoleForResume.permissions.length > 1 ? 's' : ''}</p>
                  </div>
                  {selectedRoleForResume.description && (
                    <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</label>
                      <p className="text-gray-900 mt-2 font-medium">{selectedRoleForResume.description}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-white/95 backdrop-blur sticky bottom-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <FontAwesomeIcon icon={faInfoCircle} className="text-gray-400" />
                  <span>Actions sur ce rôle</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
                    onClick={() => {
                      setShowResumeModal(false);
                      setSelectedRoleForResume(null);
              }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                  >
                    Fermer
            </button>
            <button
                    onClick={() => {
                      setDetailsRole(selectedRoleForResume);
                      setShowResumeModal(false);
                      setSelectedRoleForResume(null);
              }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm"
                  >
                    <FontAwesomeIcon icon={faEye} />
                    <span>Voir les permissions</span>
            </button>
            <button
                    onClick={() => {
                      handleEdit(selectedRoleForResume);
                      setShowResumeModal(false);
                      setSelectedRoleForResume(null);
              }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <FontAwesomeIcon icon={faEdit} />
                    <span>Modifier</span>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Êtes-vous sûr de vouloir supprimer le rôle ${selectedRoleForResume.nom} ?`)) {
                        handleDelete(selectedRoleForResume.id);
                        setShowResumeModal(false);
                        setSelectedRoleForResume(null);
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
        </RolesPortal>
      )}

      {/* Modal détails du rôle */}
      {detailsRole && (
        <RolesPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm" onClick={() => setDetailsRole(null)}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col border border-surface-200 animate-slideIn" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-surface-100 flex items-center justify-between bg-gradient-to-r from-surface-50 to-white rounded-t-3xl">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getRoleGradient(detailsRole.code)} flex items-center justify-center shadow-lg`}>
                  <FontAwesomeIcon icon={faShieldAlt} className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-surface-900">{detailsRole.nom}</h3>
                  <p className="text-sm text-surface-500 font-mono">{detailsRole.code}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailsRole(null)}
                className="w-10 h-10 rounded-xl bg-surface-100 text-surface-500 hover:bg-surface-200 flex items-center justify-center transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            {detailsRole.description && (
              <div className="px-6 py-4 border-b border-surface-100 bg-surface-50">
                <p className="text-sm text-surface-600">{detailsRole.description}</p>
              </div>
            )}
            
            <div className="px-6 py-4 flex-1 overflow-y-auto">
              <h4 className="text-sm font-bold text-surface-700 mb-4 flex items-center gap-2">
                <FontAwesomeIcon icon={faKey} className="w-4 h-4 text-violet-500" />
                Permissions associées ({detailsRole.permissions.length})
              </h4>
              {detailsRole.permissions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
                    <FontAwesomeIcon icon={faLock} className="w-6 h-6 text-surface-400" />
                  </div>
                  <p className="text-sm text-surface-500">Aucune permission associée</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(permissionGroups).map(([groupLabel, data]) => {
                    const groupPerms = data.permissions.filter((p) =>
                      detailsRole.permissions.includes(p)
                    );
                    if (groupPerms.length === 0) return null;
                    const colorClasses = getColorClasses(data.color);
                    return (
                      <div key={groupLabel} className={`rounded-xl ${colorClasses.light} border ${colorClasses.border} p-4`}>
                        <h5 className={`text-xs font-bold uppercase mb-3 ${colorClasses.text} flex items-center gap-2`}>
                          <FontAwesomeIcon icon={data.icon} className="w-3.5 h-3.5" />
                          {groupLabel}
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {groupPerms.map((perm) => (
                            <span
                              key={perm}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg text-xs font-medium text-surface-700 border border-surface-200"
                            >
                              <FontAwesomeIcon icon={faCheckCircle} className={`w-3 h-3 ${colorClasses.text}`} />
                              {permissionLabels[perm] || perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-surface-100 flex justify-end bg-surface-50 rounded-b-3xl">
              <button
                onClick={() => setDetailsRole(null)}
                className="px-5 py-2.5 rounded-xl border-2 border-surface-200 text-surface-700 hover:bg-surface-100 text-sm font-semibold transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
        </RolesPortal>
      )}
    </div>
  );
};

export default GestionRoles;
