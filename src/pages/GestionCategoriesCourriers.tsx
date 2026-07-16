import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { categorieCourrierService, CategorieCourrier } from '../services/categorieCourrierService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faFolderPlus, faEdit, faTrash, faChevronRight, faChevronDown, faTimes, faSave } from '@fortawesome/free-solid-svg-icons';

const GestionCategoriesCourriers: React.FC = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<CategorieCourrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategorieCourrier | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryParentId, setCategoryParentId] = useState<string | null>(null);
  const [categoryColor, setCategoryColor] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  const showAlert = (message: string, type: 'success' | 'error' | 'warning') => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  const loadCategories = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const folders = await categorieCourrierService.getCategories(user.id);
      setCategories(folders);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
      showAlert('Erreur lors du chargement des catégories', 'error');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const toggleExpand = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const openModal = (category?: CategorieCourrier) => {
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
      setCategoryParentId(category.parentId ?? null);
      setCategoryColor(category.color ?? '');
    } else {
      setEditingCategory(null);
      setCategoryName('');
      setCategoryParentId(null);
      setCategoryColor('');
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCategory(null);
    setCategoryName('');
    setCategoryParentId(null);
    setCategoryColor('');
  };

  const saveCategory = async () => {
    if (!categoryName.trim()) {
      showAlert('Le nom de la catégorie est obligatoire', 'error');
      return;
    }

    if (!user?.id) return;

    try {
      const now = new Date().toISOString();
      if (editingCategory) {
        const updated = {
          ...editingCategory,
          name: categoryName.trim(),
          parentId: categoryParentId,
          color: categoryColor || null,
          updatedAt: now,
        };
        const saved = await categorieCourrierService.saveCategory(updated, user.id);
        setCategories(prev => prev.map(c => c.id === editingCategory.id ? saved : c));
        showAlert('Catégorie mise à jour avec succès', 'success');
      } else {
        const newCategory: CategorieCourrier = {
          id: '',
          name: categoryName.trim(),
          parentId: categoryParentId,
          color: categoryColor || null,
          createdAt: now,
          updatedAt: now,
          userId: user.id,
        };
        const saved = await categorieCourrierService.saveCategory(newCategory, user.id);
        setCategories(prev => [...prev, saved]);
        showAlert('Catégorie créée avec succès', 'success');
      }
      closeModal();
    } catch (error) {
      console.error('Erreur sauvegarde catégorie:', error);
      showAlert('Erreur lors de la sauvegarde de la catégorie', 'error');
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette catégorie et toutes ses sous-catégories ?')) {
      return;
    }

    if (!user?.id) return;

    try {
      const collectIds = (id: string, acc: Set<string>): Set<string> => {
        acc.add(id);
        categories.filter(c => c.parentId === id).forEach(child => collectIds(child.id, acc));
        return acc;
      };
      const idsToDelete = collectIds(categoryId, new Set());

      await categorieCourrierService.deleteCategories([...idsToDelete]);
      setCategories(prev => prev.filter(c => !idsToDelete.has(c.id)));
      showAlert('Catégorie(s) supprimée(s) avec succès', 'success');
    } catch (error) {
      console.error('Erreur suppression catégorie:', error);
      showAlert('Erreur lors de la suppression de la catégorie', 'error');
    }
  };

  const getSubCategories = (parentId: string) => {
    return categories.filter(c => c.parentId === parentId);
  };

  const renderCategoryTree = (parentId: string | null = null, level: number = 0) => {
    const parentCategories = categories.filter(c => c.parentId === parentId);
    
    if (parentCategories.length === 0 && level === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <FontAwesomeIcon icon={faFolder} className="text-4xl mb-4 text-gray-300" />
          <p className="text-lg font-medium">Aucune catégorie</p>
          <p className="text-sm">Créez votre première catégorie pour commencer</p>
        </div>
      );
    }

    return parentCategories.map(category => {
      const subCategories = getSubCategories(category.id);
      const hasSubCategories = subCategories.length > 0;
      const isExpanded = expandedCategories.has(category.id);

      return (
        <div key={category.id} style={{ marginLeft: level * 12 }}>
          <div className="flex items-center gap-3 py-3 px-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow mb-2">
            {hasSubCategories && (
              <button
                onClick={() => toggleExpand(category.id)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} className="text-gray-400 w-4 h-4" />
              </button>
            )}
            {!hasSubCategories && <div className="w-6" />}
            
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: category.color || '#3b82f6' }}
            >
              <FontAwesomeIcon icon={faFolder} className="text-white" />
            </div>
            
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{category.name}</h3>
              {category.color && (
                <span className="text-xs text-gray-500">Couleur: {category.color}</span>
              )}
            </div>
            
            <button
              onClick={() => openModal(category)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Modifier"
            >
              <FontAwesomeIcon icon={faEdit} className="w-4 h-4" />
            </button>
            
            <button
              onClick={() => openModal({} as CategorieCourrier)}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Ajouter une sous-catégorie"
            >
              <FontAwesomeIcon icon={faFolderPlus} className="w-4 h-4" />
            </button>
            
            <button
              onClick={() => deleteCategory(category.id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Supprimer"
            >
              <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
            </button>
          </div>
          
          {isExpanded && hasSubCategories && (
            <div className="mt-2">
              {renderCategoryTree(category.id, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const rootCategories = categories.filter(c => !c.parentId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestion des catégories</h1>
              <p className="text-gray-600">Créez et organisez vos catégories de classement des courriers</p>
            </div>
            <button
              onClick={() => openModal()}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
            >
              <FontAwesomeIcon icon={faFolderPlus} className="w-5 h-5" />
              Nouvelle catégorie
            </button>
          </div>

          {/* Alert */}
          {alert && (
            <div className={`mb-4 px-4 py-3 rounded-xl ${
              alert.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
              alert.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
              'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              {alert.message}
            </div>
          )}

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{categories.length}</div>
              <div className="text-sm text-gray-600">Total catégories</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{rootCategories.length}</div>
              <div className="text-sm text-gray-600">Catégories racines</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{categories.length - rootCategories.length}</div>
              <div className="text-sm text-gray-600">Sous-catégories</div>
            </div>
          </div>
        </div>

        {/* Categories Tree */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement des catégories...</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            {renderCategoryTree(null)}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[50000] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-gray-500 w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nom</label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="Nom de la catégorie"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Catégorie parente</label>
                  <select
                    value={categoryParentId || ''}
                    onChange={(e) => setCategoryParentId(e.target.value || null)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    <option value="">Aucune (catégorie racine)</option>
                    {categories.filter(c => !c.parentId && c.id !== editingCategory?.id).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Couleur (optionnel)</label>
                  <div className="flex gap-3">
                    <input
                      type="color"
                      value={categoryColor}
                      onChange={(e) => setCategoryColor(e.target.value)}
                      className="w-16 h-12 border-2 border-gray-200 rounded-xl cursor-pointer"
                    />
                    <input
                      type="text"
                      value={categoryColor}
                      onChange={(e) => setCategoryColor(e.target.value)}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder="#3b82f6"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={saveCategory}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                  {editingCategory ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GestionCategoriesCourriers;
