import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import ExcelJS from 'exceljs';
import { adminService } from '../../services/adminService';
import { userService } from '../../services/userService';
import { laravelApiService } from '../../services/laravelApiService';
import { entiteOrganisationnelleService } from '../../services/entiteOrganisationnelleService';
import { useAuth } from '../../context/AuthContext';
import { Utilisateur, Role, EntiteOrganisationnelle } from '../../types';
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
  faUser,
  faBriefcase,
  faCheck,
  faEnvelope,
  faBuilding,
  faUsers,
  faShieldAlt,
  faFileExport,
  faUserPlus,
  faCircleCheck,
  faCircleXmark,
  faStar,
  faArrowRight,
  faUserGear,
  faToggleOn,
  faToggleOff,
  faInfoCircle,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';

// Portail pour que le modal couvre tout l'écran (au niveau de <body>)
const UsersPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

// Définition des étapes du formulaire
const formSteps = [
  { id: 1, title: 'Identité', description: 'Informations personnelles', icon: faUser },
  { id: 2, title: 'Affectation', description: 'Rôle et département', icon: faBriefcase },
  { id: 3, title: 'Confirmation', description: 'Vérification finale', icon: faCheck }
];

const GestionUtilisateurs: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Utilisateur | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<{
    nom: string;
    email: string;
    role: Role;
    direction: string;
    service: string;
    entiteId?: string;
    actif: boolean;
  }>({
    nom: '',
    email: '',
    role: Role.AGENT,
    direction: '',
    service: '',
    entiteId: undefined,
    actif: true
  });
  const [entities, setEntities] = useState<EntiteOrganisationnelle[]>([]);
  const [selectedDirectionId, setSelectedDirectionId] = useState<string>('');
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [selectedUserForResume, setSelectedUserForResume] = useState<Utilisateur | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<Role | ''>('');
  const [filterStatut, setFilterStatut] = useState<'all' | 'actif' | 'inactif'>('all');
  const [filterDirection, setFilterDirection] = useState('');
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCount, setGenerateCount] = useState(300);
  const [loading, setLoading] = useState(true);
  const [showBulkRoleModal, setShowBulkRoleModal] = useState(false);
  const [bulkNewRole, setBulkNewRole] = useState<Role | ''>('');
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [user]);

  const loadUsers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (laravelApiService.isConfigured()) {
        await Promise.all([
          adminService.refreshUsersFromApi(),
          entiteOrganisationnelleService.refreshFromApi()
        ]);
      } else {
        entiteOrganisationnelleService.initializeDemoData();
      }
      setEntities(entiteOrganisationnelleService.getAllEntities().filter(e => e.actif !== false));
      // SUPER_ADMIN et DIRECTEUR_GENERAL voient tous les utilisateurs (sauf les SUPER_ADMIN pour le DG)
      if (user.role === Role.SUPER_ADMIN) {
        const allUsers = adminService.getAllUsers().filter(u => u.role !== Role.SUPER_ADMIN);
        setUsers(allUsers);
      } else if (user.role === Role.DIRECTEUR_GENERAL) {
        const allUsers = adminService.getAllUsers().filter(u => u.role !== Role.SUPER_ADMIN);
        setUsers(allUsers);
      } else {
        const visibleUsers = userService.getVisibleUsers(user.id);
        setUsers(visibleUsers);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportIdentifiants = async () => {
    try {
      setExporting(true);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Identifiants Utilisateurs');

      worksheet.columns = [
        { header: 'Nom complet', key: 'nom', width: 30 },
        { header: 'Email (identifiant)', key: 'email', width: 35 },
        { header: 'Rôle', key: 'role', width: 20 },
        { header: 'Direction', key: 'direction', width: 25 },
        { header: 'Service', key: 'service', width: 25 },
        { header: 'Statut', key: 'statut', width: 15 },
        { header: 'Date de création', key: 'dateCreation', width: 22 }
      ];

      users.forEach((u) => {
        worksheet.addRow({
          nom: u.nom,
          email: u.email,
          role: u.role.replace('_', ' '),
          direction: u.direction || '',
          service: u.service || '',
          statut: u.actif ? 'Actif' : 'Inactif',
          dateCreation: u.dateCreation
            ? new Date(u.dateCreation).toLocaleString()
            : ''
        });
      });

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'identifiants-utilisateurs.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors de l\'export des identifiants utilisateurs :', error);
      alert('Erreur lors de la génération du fichier des identifiants.');
    } finally {
      setExporting(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (editingUser) {
        await adminService.updateUser(editingUser.id, formData);
      } else {
        await adminService.createUser(formData);
      }
      resetForm();
      await loadUsers();
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la sauvegarde');
    }
  };

  const resetForm = () => {
    setFormData({
      nom: '',
      email: '',
      role: Role.AGENT,
      direction: '',
      service: '',
      entiteId: undefined,
      actif: true
    });
    setSelectedDirectionId('');
    setSelectedDivisionId('');
    setEditingUser(null);
    setShowForm(false);
    setCurrentStep(1);
  };

  const handleEdit = (user: Utilisateur) => {
    setEditingUser(user);
    const nextForm = {
      nom: user.nom,
      email: user.email,
      role: user.role,
      direction: user.direction || '',
      service: user.service || '',
      entiteId: user.entiteId,
      actif: user.actif
    };
    setFormData(nextForm);
    if (user.entiteId) {
      const hierarchy = entiteOrganisationnelleService.getEntityHierarchy(user.entiteId);
      const dir = hierarchy.find((e) => e.type === 'direction');
      const div = hierarchy.find((e) => e.type === 'division');
      setSelectedDirectionId(dir?.id ?? '');
      setSelectedDivisionId(div?.id ?? '');
    } else {
      setSelectedDirectionId('');
      setSelectedDivisionId('');
    }
    setCurrentStep(1);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
      try {
        await adminService.deleteUser(id);
        await loadUsers();
        setSelectedUsers(new Set());
      } catch (e) {
        alert((e as Error)?.message || 'Erreur lors de la suppression');
      }
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const userToUpdate = users.find(u => u.id === id);
    if (userToUpdate) {
      try {
        await adminService.updateUser(id, { ...userToUpdate, actif: !currentStatus });
        await loadUsers();
      } catch (e) {
        alert((e as Error)?.message || 'Erreur lors de la mise à jour');
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === paginatedUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(paginatedUsers.map(u => u.id)));
    }
  };

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const selectedUsersList = users.filter(u => selectedUsers.has(u.id));

  const handleBulkChangeRole = async () => {
    if (selectedUsers.size === 0 || !bulkNewRole) return;
    setBulkActionLoading(true);
    try {
      let done = 0;
      for (const u of selectedUsersList) {
        try {
          await adminService.updateUser(u.id, { role: bulkNewRole });
          done++;
        } catch (_) { /* ignorer erreur par utilisateur */ }
      }
      setSelectedUsers(new Set());
      setShowBulkRoleModal(false);
      setBulkNewRole('');
      await loadUsers();
      alert(`${done} utilisateur(s) mis à jour avec le rôle ${bulkNewRole.replace('_', ' ')}.`);
    } catch (e) {
      alert((e as Error)?.message || 'Erreur lors de la mise à jour des rôles.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkSetActif = async (actif: boolean) => {
    if (selectedUsers.size === 0) return;
    const toUpdate = selectedUsersList.filter(u => u.actif !== actif && u.role !== Role.SUPER_ADMIN && u.id !== user?.id);
    if (toUpdate.length === 0) {
      alert(actif ? 'Aucun utilisateur inactif dans la sélection.' : 'Aucun utilisateur actif à désactiver (ou sélection protégée).');
      return;
    }
    if (!window.confirm(`${actif ? 'Activer' : 'Désactiver'} ${toUpdate.length} utilisateur(s) ?`)) return;
    setBulkActionLoading(true);
    try {
      let done = 0;
      for (const u of toUpdate) {
        try {
          await adminService.updateUser(u.id, { actif });
          done++;
        } catch (_) {}
      }
      setSelectedUsers(new Set());
      await loadUsers();
      alert(`${done} utilisateur(s) ${actif ? 'activé(s)' : 'désactivé(s)'}.`);
    } catch (e) {
      alert((e as Error)?.message || 'Erreur.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const canGoToNextStep = () => {
    switch (currentStep) {
      case 1:
        return formData.nom.trim() !== '' && formData.email.trim() !== '' && formData.email.includes('@');
      case 2:
        return formData.role !== undefined;
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

  // Filtrage et recherche
  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.direction && user.direction.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.service && user.service.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesRole = filterRole === '' || user.role === filterRole;
    const matchesStatut = filterStatut === 'all' || 
      (filterStatut === 'actif' && user.actif) ||
      (filterStatut === 'inactif' && !user.actif);
    const matchesDirection = filterDirection === '' || user.direction === filterDirection;

    return matchesSearch && matchesRole && matchesStatut && matchesDirection;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterRole, filterStatut, filterDirection]);

  const uniqueDirections = Array.from(new Set(users.map(u => u.direction).filter(Boolean))) as string[];

  // Stats rapides
  const activeUsers = users.filter(u => u.actif).length;
  const inactiveUsers = users.filter(u => !u.actif).length;

  // Couleurs pour les rôles
  /** Un seul Directeur général autorisé : on masque le rôle DG en création si un DG existe, et en édition sauf pour l'utilisateur DG actuel. */
  const existingDG = users.find(u => u.role === Role.DIRECTEUR_GENERAL);
  const canChooseDirecteurGeneral = !existingDG || (editingUser?.id === existingDG.id);

  const getRoleColor = (role: Role) => {
    switch (role) {
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

  const getRoleBadgeStyle = (role: Role) => {
    switch (role) {
      case Role.SUPER_ADMIN:
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case Role.DIRECTEUR_GENERAL:
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case Role.DIRECTEUR:
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case Role.CHEF_SERVICE:
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white mb-4 shadow-lg shadow-blue-500/25">
                <FontAwesomeIcon icon={faUser} className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Informations personnelles</h3>
              <p className="text-slate-500 mt-2">Entrez les informations d'identification de l'utilisateur</p>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-slate-500" />
                  </div>
                  Nom complet
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Ex: Jean Dupont"
                  className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-900 placeholder:text-slate-400 font-medium"
                />
              </div>
              
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4 text-slate-500" />
                  </div>
                  Adresse email
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Ex: jean.dupont@entreprise.com"
                  className={`w-full px-4 py-3.5 bg-slate-50 border-2 rounded-xl focus:ring-4 transition-all text-slate-900 placeholder:text-slate-400 font-medium ${
                    formData.email && !formData.email.includes('@') 
                      ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' 
                      : 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500'
                  }`}
                />
                {formData.email && !formData.email.includes('@') && (
                  <p className="mt-2 text-sm text-red-500 flex items-center gap-2">
                    <FontAwesomeIcon icon={faCircleXmark} className="w-4 h-4" />
                    Veuillez entrer une adresse email valide
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white mb-4 shadow-lg shadow-emerald-500/25">
                <FontAwesomeIcon icon={faBriefcase} className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Affectation et rôle</h3>
              <p className="text-slate-500 mt-2">Définissez le rôle et le département de l'utilisateur</p>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4 text-slate-500" />
                  </div>
                  Rôle
                  <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(Role)
                    .filter((role) => role !== Role.DIRECTEUR_GENERAL || canChooseDirecteurGeneral)
                    .map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setFormData({ ...formData, role })}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        formData.role === role
                          ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-500/10'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getRoleColor(role)} flex items-center justify-center mb-2`}>
                        <FontAwesomeIcon icon={faUserGear} className="w-4 h-4 text-white" />
                      </div>
                      <div className="font-semibold text-slate-900 text-sm">{role.replace('_', ' ')}</div>
                    </button>
                  ))}
                </div>
                {!canChooseDirecteurGeneral && (
                  <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
                    <FontAwesomeIcon icon={faInfoCircle} className="text-slate-400" />
                    Un seul Directeur général est autorisé. Un utilisateur possède déjà ce rôle.
                  </p>
                )}
              </div>
              
              <div className="space-y-4">
                {/* Direction texte libre (facultatif) */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-slate-500" />
                    </div>
                    Direction (texte libre)
                  </label>
                  <input
                    type="text"
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                    placeholder="Ex: Direction Administrative et Financière"
                    className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  />
                </div>

                {/* Service texte libre (facultatif) */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                      <FontAwesomeIcon icon={faUsers} className="w-4 h-4 text-slate-500" />
                    </div>
                    Service (texte libre)
                  </label>
                  <input
                    type="text"
                    value={formData.service}
                    onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                    placeholder="Ex: Service Comptabilité Générale"
                    className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  />
                </div>

                {/* Cascade Direction -> Division -> Bureau (ou entité feuille) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-slate-500" />
                      </div>
                      Direction (organigramme)
                    </label>
                    <select
                      value={selectedDirectionId}
                      onChange={(e) => {
                        const dirId = e.target.value;
                        setSelectedDirectionId(dirId);
                        setSelectedDivisionId('');
                        setFormData((prev) => ({
                          ...prev,
                          entiteId: undefined,
                          direction:
                            entiteOrganisationnelleService.getEntityById(dirId)?.nom || prev.direction
                        }));
                      }}
                      className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                    >
                      <option value="">Aucune</option>
                      {entiteOrganisationnelleService
                        .getDirectionsForFilters()
                        .filter((e) => e.actif !== false)
                        .map((dir) => (
                          <option key={dir.id} value={dir.id}>
                            {dir.nom}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faUsers} className="w-4 h-4 text-slate-500" />
                      </div>
                      Division
                    </label>
                    <select
                      value={selectedDivisionId}
                      onChange={(e) => {
                        const divId = e.target.value;
                        setSelectedDivisionId(divId);
                        setFormData((prev) => ({
                          ...prev,
                          entiteId: undefined
                        }));
                      }}
                      disabled={!selectedDirectionId}
                      className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium disabled:bg-slate-100"
                    >
                      <option value="">Aucune</option>
                      {selectedDirectionId &&
                        entiteOrganisationnelleService
                          .getDivisionsByDirection(selectedDirectionId)
                          .filter((e) => e.actif !== false)
                          .map((div) => (
                            <option key={div.id} value={div.id}>
                              {div.nom}
                            </option>
                          ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <FontAwesomeIcon icon={faBriefcase} className="w-4 h-4 text-slate-500" />
                      </div>
                      Bureau / entité détaillée
                    </label>
                    <select
                      value={formData.entiteId || ''}
                      onChange={(e) => {
                        const entiteId = e.target.value || undefined;
                        if (!entiteId) {
                          setFormData((prev) => ({ ...prev, entiteId: undefined }));
                          return;
                        }
                        const hierarchy = entiteOrganisationnelleService.getEntityHierarchy(entiteId);
                        let direction = '';
                        let service = '';
                        hierarchy.forEach((entite) => {
                          if (entite.type === 'direction') {
                            direction = entite.nom;
                          }
                          if (entite.type === 'service') {
                            service = entite.nom;
                          }
                        });
                        setFormData((prev) => ({
                          ...prev,
                          entiteId,
                          direction: direction || prev.direction,
                          service: service || prev.service
                        }));
                      }}
                      disabled={!selectedDivisionId}
                      className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium disabled:bg-slate-100"
                    >
                      <option value="">Aucun</option>
                      {selectedDivisionId &&
                        (() => {
                          const descendantIds =
                            entiteOrganisationnelleService.getDescendantEntityIds(
                              selectedDivisionId
                            );
                          return entities
                            .filter(
                              (e) =>
                                e.actif !== false &&
                                descendantIds.includes(e.id) &&
                                (e.type === 'bureau' ||
                                  e.type === 'service' ||
                                  e.type === 'sous-service')
                            )
                            .map((entite) => {
                              const hierarchy =
                                entiteOrganisationnelleService.getEntityHierarchy(entite.id);
                              const label = hierarchy.map((e) => e.nom).join(' → ');
                              return (
                                <option key={entite.id} value={entite.id}>
                                  {label}
                                </option>
                              );
                            });
                        })()}
                    </select>
                  </div>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Choisissez d&apos;abord une direction, puis une division, puis un bureau (ou
                  service / sous-service) pour aligner précisément l&apos;utilisateur dans
                  l&apos;organigramme.
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
              <h3 className="text-xl font-bold text-slate-900">Confirmation</h3>
              <p className="text-slate-500 mt-2">Vérifiez les informations avant de valider</p>
            </div>
            
            {/* Résumé */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-6 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faUser} className="w-4 h-4" />
                  Nom
                </span>
                <span className="font-semibold text-slate-900">{formData.nom}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4" />
                  Email
                </span>
                <span className="font-semibold text-slate-900">{formData.email}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4" />
                  Rôle
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${getRoleBadgeStyle(formData.role)}`}>
                  {formData.role.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faBuilding} className="w-4 h-4" />
                  Direction
                </span>
                <span className="font-semibold text-slate-900">{formData.direction || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-500 flex items-center gap-2">
                  <FontAwesomeIcon icon={faUsers} className="w-4 h-4" />
                  Service
                </span>
                <span className="font-semibold text-slate-900">{formData.service || '—'}</span>
              </div>
              {formData.entiteId && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-slate-500 flex items-center gap-2">
                    <FontAwesomeIcon icon={faBriefcase} className="w-4 h-4" />
                    Entité organisationnelle
                  </span>
                  <span className="font-semibold text-slate-900">
                    {entiteOrganisationnelleService
                      .getEntityHierarchy(formData.entiteId)
                      .map((e) => e.nom)
                      .join(' → ')}
                  </span>
                </div>
              )}
            </div>
            
            {/* Toggle Actif */}
            <div className="flex items-center justify-between p-5 bg-white border-2 border-slate-200 rounded-2xl hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  formData.actif 
                    ? 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/25' 
                    : 'bg-slate-200'
                }`}>
                  <FontAwesomeIcon 
                    icon={formData.actif ? faCircleCheck : faCircleXmark} 
                    className={`w-5 h-5 ${formData.actif ? 'text-white' : 'text-slate-500'}`} 
                  />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Activer le compte</p>
                  <p className="text-sm text-slate-500">L'utilisateur pourra se connecter immédiatement</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.actif}
                  onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-14 h-8 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md peer-checked:bg-green-500"></div>
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête — charte Paramètres/Dashboard */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-xl shadow-blue-500/25 ring-4 ring-white">
            <FontAwesomeIcon icon={faUsers} className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Gestion des utilisateurs
            </h2>
            <p className="text-slate-500 mt-0.5 text-sm">
              Comptes, rôles et accès — vue centralisée
            </p>
          </div>
        </div>
        {/* Stats compactes */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200/80 rounded-xl">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-emerald-700 tabular-nums">{activeUsers} actifs</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="text-sm font-semibold text-slate-600 tabular-nums">{inactiveUsers} inactifs</span>
          </div>
          <span className="text-sm text-slate-400 font-medium hidden sm:inline">
            {filteredUsers.length} affiché{filteredUsers.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Actions principales — charte bleu primaire */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-blue-800 hover:shadow-xl hover:shadow-blue-500/30 transition-all border border-blue-500/20"
        >
          <FontAwesomeIcon icon={faUserPlus} className="w-4 h-4" />
          Nouvel utilisateur
        </button>
        <button
          onClick={handleExportIdentifiants}
          disabled={users.length === 0 || exporting}
          className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" /> : <FontAwesomeIcon icon={faFileExport} className="w-4 h-4" />}
          {exporting ? 'Export…' : 'Exporter'}
        </button>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-emerald-200 text-emerald-700 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 transition-all font-semibold text-sm"
        >
          <FontAwesomeIcon icon={faUsers} className="w-4 h-4" />
          Générer des utilisateurs
        </button>
      </div>

      {/* Barre de recherche et filtres — style Dashboard */}
      <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-lg shadow-slate-200/30">
        <div className="px-5 py-4 bg-slate-50/80 border-b border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <div className="relative">
                <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  type="text"
                  placeholder="Nom, email, direction, service…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-sm"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <FontAwesomeIcon icon={faFilter} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as Role | '')}
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-sm cursor-pointer appearance-none"
              >
                <option value="">Tous les rôles</option>
                {Object.values(Role).map(role => (
                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value as 'all' | 'actif' | 'inactif')}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-sm cursor-pointer"
            >
              <option value="all">Tous les statuts</option>
              <option value="actif">Actifs</option>
              <option value="inactif">Inactifs</option>
            </select>
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-sm cursor-pointer"
            >
              <option value="">Toutes les directions</option>
              {uniqueDirections.map(dir => (
                <option key={dir} value={dir}>{dir}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-slate-600 font-medium">
              {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''} trouvé{filteredUsers.length > 1 ? 's' : ''}
            </p>
            {(searchTerm || filterRole || filterStatut !== 'all' || filterDirection) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterRole('');
                  setFilterStatut('all');
                  setFilterDirection('');
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1.5"
              >
                <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal création / modification — charte bleue */}
      {showForm && (
        <UsersPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200/80 max-h-[90vh] flex flex-col animate-slideIn overflow-hidden">
            {/* Header avec étapes — charte */}
            <div className="flex-shrink-0 px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <FontAwesomeIcon icon={editingUser ? faEdit : faUserPlus} className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
                    </h3>
                    <p className="text-white/70 text-xs mt-0.5">
                      Étape {currentStep} sur {formSteps.length}
                    </p>
                  </div>
                </div>
                <button
                  onClick={resetForm}
                  className="w-10 h-10 rounded-xl bg-white/15 text-white hover:bg-white/25 transition-colors flex items-center justify-center"
                  title="Fermer"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                </button>
              </div>
              {/* Indicateur d'étapes */}
              <div className="flex items-center justify-between mt-4">
                {formSteps.map((step, index) => (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                        currentStep >= step.id ? 'bg-white text-blue-600 shadow-md' : 'bg-white/20 text-white/80'
                      }`}>
                        {currentStep > step.id ? (
                          <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                        ) : (
                          <FontAwesomeIcon icon={step.icon} className="w-4 h-4" />
                        )}
                      </div>
                      <span className={`text-[10px] mt-1 font-semibold ${currentStep >= step.id ? 'text-white' : 'text-white/70'}`}>
                        {step.title}
                      </span>
                    </div>
                    {index < formSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 rounded-full ${currentStep > step.id ? 'bg-white' : 'bg-white/20'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              {renderStepContent()}
            </div>
            <div className="flex-shrink-0 flex justify-between gap-4 px-6 sm:px-8 py-5 border-t border-slate-200 bg-slate-50/80">
              <button
                type="button"
                onClick={currentStep === 1 ? resetForm : prevStep}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 shadow-sm"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="w-3.5 h-3.5" />
                {currentStep === 1 ? 'Annuler' : 'Précédent'}
              </button>
              {currentStep < formSteps.length ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canGoToNextStep()}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2 border border-blue-500/20"
                >
                  Suivant
                  <FontAwesomeIcon icon={faArrowRight} className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2 border border-emerald-500/20"
                >
                  <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                  {editingUser ? 'Enregistrer' : 'Créer'}
                </button>
              )}
            </div>
          </div>
        </div>
        </UsersPortal>
      )}

      {/* Table des utilisateurs — style Dashboard */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/40 overflow-hidden relative min-h-[320px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-sm">
            <FontAwesomeIcon icon={faSpinner} className="w-10 h-10 text-blue-600 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-600">Chargement des utilisateurs…</p>
          </div>
        )}
        {selectedUsers.size > 0 && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-blue-800">
              {selectedUsers.size} utilisateur{selectedUsers.size > 1 ? 's' : ''} sélectionné{selectedUsers.size > 1 ? 's' : ''}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setBulkNewRole(''); setShowBulkRoleModal(true); }}
                disabled={bulkActionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                title="Changer le rôle des utilisateurs sélectionnés"
              >
                <FontAwesomeIcon icon={faShieldAlt} className="text-[10px]" />
                Changer le rôle
              </button>
              <button
                onClick={() => handleBulkSetActif(true)}
                disabled={bulkActionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                title="Activer la sélection"
              >
                <FontAwesomeIcon icon={faToggleOn} className="text-[10px]" />
                Activer
              </button>
              <button
                onClick={() => handleBulkSetActif(false)}
                disabled={bulkActionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                title="Désactiver la sélection"
              >
                <FontAwesomeIcon icon={faToggleOff} className="text-[10px]" />
                Désactiver
              </button>
              <button onClick={() => setSelectedUsers(new Set())} className="text-sm text-blue-600 hover:text-blue-800 font-semibold px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors">
                Désélectionner tout
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-200">
                <th className="px-4 py-3.5 text-left w-12">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedUsers.size === paginatedUsers.length && paginatedUsers.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                    />
                  </div>
                </th>
                <th className="px-5 py-3.5 text-left">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Utilisateur</span>
                </th>
                <th className="px-5 py-3.5 text-left hidden lg:table-cell">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Affectation</span>
                </th>
                <th className="px-4 py-3.5 text-left w-28">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Statut</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedUsers.length > 0 ? (
                paginatedUsers.map((user, index) => (
                  <tr
                    key={user.id}
                    className={`group transition-colors duration-150 cursor-pointer ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    } ${
                      selectedUsers.has(user.id)
                        ? 'bg-blue-50/80 hover:bg-blue-50'
                        : 'hover:bg-slate-50'
                    } ${selectedUsers.has(user.id) ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
                    onClick={() => {
                      setSelectedUserForResume(user);
                      setShowResumeModal(true);
                    }}
                  >
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(user.id)}
                          onChange={() => handleSelectUser(user.id)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getRoleColor(user.role)} flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0`}>
                          {user.nom.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 text-sm truncate">{user.nom}</div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide ${getRoleBadgeStyle(user.role)}`}>
                              {user.role.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      {user.direction || user.service ? (
                        <div className="min-w-0">
                          {user.direction && (
                            <div className="flex items-center gap-2 text-sm text-slate-800">
                              <span className="truncate font-medium">{user.direction}</span>
                            </div>
                          )}
                          {user.service && (
                            <div className="text-xs text-slate-500 mt-0.5 truncate">{user.service}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-2 px-2.5 py-1 text-xs font-bold rounded-lg ${
                        user.actif
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.actif ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {user.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                      <FontAwesomeIcon icon={faUsers} className="w-10 h-10 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">Aucun utilisateur trouvé</p>
                    <p className="text-sm text-slate-500 mt-1">
                      Modifiez les filtres ou créez un nouvel utilisateur.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination — charte Dashboard */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-600 order-2 sm:order-1">
              <span className="font-semibold text-slate-800">{startIndex + 1}</span>
              <span className="text-slate-400 mx-1">–</span>
              <span className="font-semibold text-slate-800">{Math.min(endIndex, filteredUsers.length)}</span>
              <span className="text-slate-500 ml-1">sur {filteredUsers.length}</span>
            </p>
            <div className="flex items-center gap-1 order-1 sm:order-2">
              <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className={`p-2.5 rounded-lg transition-colors ${currentPage === 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-white hover:shadow-sm border border-slate-200'}`} title="Page précédente">
                <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                    return (
                      <button key={page} onClick={() => goToPage(page)} className={`min-w-[2.25rem] h-9 rounded-lg text-sm font-semibold transition-all ${currentPage === page ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-white hover:shadow-sm border border-slate-200'}`}>
                        {page}
                      </button>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="px-2 text-slate-400 font-medium">…</span>;
                  }
                  return null;
                })}
              </div>
              <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className={`p-2.5 rounded-lg transition-colors ${currentPage === totalPages ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-white hover:shadow-sm border border-slate-200'}`} title="Page suivante">
                <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal action groupée : changer le rôle */}
      {showBulkRoleModal && (
        <UsersPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4" onClick={() => { setShowBulkRoleModal(false); setBulkNewRole(''); }}>
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faShieldAlt} className="text-blue-600" />
                Changer le rôle
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                {selectedUsers.size} utilisateur(s) sélectionné(s). Choisissez le nouveau rôle à appliquer.
              </p>
              <select
                value={bulkNewRole}
                onChange={(e) => setBulkNewRole((e.target.value || '') as Role | '')}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800 font-medium"
              >
                <option value="">Sélectionner un rôle</option>
                {Object.values(Role)
                  .filter(r => r !== Role.SUPER_ADMIN && (r !== Role.DIRECTEUR_GENERAL || !existingDG))
                  .map(role => (
                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                ))}
              </select>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => { setShowBulkRoleModal(false); setBulkNewRole(''); }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium">
                  Annuler
                </button>
                <button
                  onClick={handleBulkChangeRole}
                  disabled={!bulkNewRole || bulkActionLoading}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {bulkActionLoading ? <><FontAwesomeIcon icon={faSpinner} className="animate-spin" /> Application…</> : 'Appliquer'}
                </button>
              </div>
            </div>
          </div>
        </UsersPortal>
      )}

      {/* Modal Détails utilisateur — charte */}
      {showResumeModal && selectedUserForResume && (
        <UsersPortal>
          <div
            className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4"
            onClick={() => { setShowResumeModal(false); setSelectedUserForResume(null); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200/80 max-h-[90vh] overflow-hidden flex flex-col animate-slideIn" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUser} className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">Détails de l'utilisateur</h2>
                    <p className="text-sm text-blue-100 mt-0.5">Informations et actions</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowResumeModal(false); setSelectedUserForResume(null); }}
                  className="w-10 h-10 rounded-xl text-white/80 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors"
                  title="Fermer"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getRoleColor(selectedUserForResume.role)} flex items-center justify-center text-white font-bold text-xl shadow-lg flex-shrink-0`}>
                    {selectedUserForResume.nom.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-slate-900">{selectedUserForResume.nom}</h3>
                    <p className="text-slate-600 text-sm mt-0.5">{selectedUserForResume.email}</p>
                    <span className={`inline-flex items-center mt-2 px-2.5 py-1 text-xs font-bold rounded-lg border ${getRoleBadgeStyle(selectedUserForResume.role)}`}>
                      {selectedUserForResume.role.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Direction</span>
                    <p className="text-slate-900 mt-2 font-semibold text-sm">{selectedUserForResume.direction || '—'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Service</span>
                    <p className="text-slate-900 mt-2 font-semibold text-sm">{selectedUserForResume.service || '—'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Statut</span>
                    <span className={`inline-flex items-center gap-2 mt-2 px-2.5 py-1 text-xs font-bold rounded-lg ${
                      selectedUserForResume.actif ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedUserForResume.actif ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {selectedUserForResume.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Créé le</span>
                    <p className="text-slate-900 mt-2 font-semibold text-sm">
                      {selectedUserForResume.dateCreation
                        ? new Date(selectedUserForResume.dateCreation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50/80">
                <button onClick={() => { setShowResumeModal(false); setSelectedUserForResume(null); }} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm">
                  Fermer
                </button>
                <button onClick={() => { handleEdit(selectedUserForResume); setShowResumeModal(false); setSelectedUserForResume(null); }} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl hover:from-blue-700 shadow-lg shadow-blue-500/25 border border-blue-500/20">
                  <FontAwesomeIcon icon={faEdit} className="w-3.5 h-3.5" />
                  Modifier
                </button>
                <button onClick={() => { handleToggleActive(selectedUserForResume.id, selectedUserForResume.actif); setShowResumeModal(false); setSelectedUserForResume(null); }} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-amber-200 rounded-xl hover:bg-amber-50 text-amber-700">
                  <FontAwesomeIcon icon={selectedUserForResume.actif ? faToggleOff : faToggleOn} className="w-3.5 h-3.5" />
                  {selectedUserForResume.actif ? 'Désactiver' : 'Activer'}
                </button>
                <button onClick={() => { if (window.confirm(`Supprimer l'utilisateur ${selectedUserForResume.nom} ?`)) { handleDelete(selectedUserForResume.id); setShowResumeModal(false); setSelectedUserForResume(null); } }} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 border border-red-500/20">
                  <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </UsersPortal>
      )}

      {/* Modal Génération — charte */}
      {showGenerateModal && (
        <UsersPortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4" onClick={() => { if (!generating) setShowGenerateModal(false); }}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200/80 overflow-hidden animate-slideIn" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUsers} className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">Générer des utilisateurs</h2>
                    <p className="text-sm text-emerald-100 mt-0.5">Répartition sur les entités</p>
                  </div>
                </div>
                <button onClick={() => { if (!generating) setShowGenerateModal(false); }} disabled={generating} className="w-10 h-10 rounded-xl text-white/80 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors disabled:opacity-50" title="Fermer">
                  <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre d'utilisateurs</label>
                  <input type="number" min={1} max={1000} value={generateCount} onChange={(e) => setGenerateCount(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))} disabled={generating} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 disabled:opacity-50 shadow-sm" />
                  <p className="text-xs text-slate-500 mt-2">Répartition automatique sur directions, services, divisions, bureaux et cellules.</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <FontAwesomeIcon icon={faInfoCircle} className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">Répartition :</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-700 text-xs">
                        <li>20% DIRECTEUR</li>
                        <li>30% CHEF_SERVICE</li>
                        <li>50% AGENT</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50/80">
                <button onClick={() => { if (!generating) setShowGenerateModal(false); }} disabled={generating} className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm disabled:opacity-50">
                  Annuler
                </button>
                <button onClick={async () => { setGenerating(true); try { const result = await adminService.generateTestUsers(generateCount); alert(`✅ ${result.created} utilisateurs créés${result.errors > 0 ? `\n⚠️ ${result.errors} erreurs` : ''}`); loadUsers(); setShowGenerateModal(false); setGenerateCount(300); } catch (e) { console.error(e); alert('Erreur lors de la génération'); } finally { setGenerating(false); } }} disabled={generating} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-xl hover:from-emerald-700 shadow-lg shadow-emerald-500/25 border border-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                  {generating ? <><FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" /> Génération…</> : <><FontAwesomeIcon icon={faUserPlus} className="w-3.5 h-3.5" /> Générer {generateCount}</>}
                </button>
              </div>
            </div>
          </div>
        </UsersPortal>
      )}
    </div>
  );
};

export default GestionUtilisateurs;
