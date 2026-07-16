import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSignature,
  faStamp,
  faPlus,
  faTrash,
  faEdit,
  faSave,
  faTimes,
  faUpload,
  faImage,
  faCheckCircle,
  faExclamationTriangle,
  faCog
} from '@fortawesome/free-solid-svg-icons';

interface Signature {
  id: string;
  nom: string;
  imageUrl: string;
  imageData?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Tampon {
  id: string;
  nom: string;
  imageUrl: string;
  imageData?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GestionSignaturesTampons: React.FC = () => {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [tampons, setTampons] = useState<Tampon[]>([]);
  const [activeTab, setActiveTab] = useState<'signatures' | 'tampons'>('signatures');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Signature | Tampon | null>(null);
  const [formData, setFormData] = useState({ nom: '', imageFile: null as File | null });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSignatures();
    loadTampons();
  }, []);

  const loadSignatures = () => {
    const saved = localStorage.getItem('signatures');
    if (saved) {
      setSignatures(JSON.parse(saved));
    }
  };

  const loadTampons = () => {
    const saved = localStorage.getItem('tampons');
    if (saved) {
      setTampons(JSON.parse(saved));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setMessage({ type: 'error', text: 'Veuillez sélectionner une image' });
        return;
      }
      setFormData({ ...formData, imageFile: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!formData.nom.trim()) {
      setMessage({ type: 'error', text: 'Le nom est obligatoire' });
      return;
    }
    if (!formData.imageFile && !editingItem) {
      setMessage({ type: 'error', text: 'Veuillez sélectionner une image' });
      return;
    }

    const reader = new FileReader();
    if (formData.imageFile) {
      reader.onloadend = () => {
        const imageData = reader.result as string;
        saveItem(imageData);
      };
      reader.readAsDataURL(formData.imageFile);
    } else if (editingItem) {
      saveItem((editingItem as any).imageData || '');
    }
  };

  const saveItem = (imageData: string) => {
    if (activeTab === 'signatures') {
      if (editingItem) {
        const updated = signatures.map(s =>
          s.id === editingItem.id
            ? { ...s, nom: formData.nom, imageData, imageUrl: imageData, updatedAt: new Date() }
            : s
        );
        setSignatures(updated);
        localStorage.setItem('signatures', JSON.stringify(updated));
        setMessage({ type: 'success', text: 'Signature modifiée avec succès' });
      } else {
        const newSignature: Signature = {
          id: `sig_${Date.now()}`,
          nom: formData.nom,
          imageUrl: imageData,
          imageData,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const updated = [...signatures, newSignature];
        setSignatures(updated);
        localStorage.setItem('signatures', JSON.stringify(updated));
        setMessage({ type: 'success', text: 'Signature ajoutée avec succès' });
      }
    } else {
      if (editingItem) {
        const updated = tampons.map(t =>
          t.id === editingItem.id
            ? { ...t, nom: formData.nom, imageData, imageUrl: imageData, updatedAt: new Date() }
            : t
        );
        setTampons(updated);
        localStorage.setItem('tampons', JSON.stringify(updated));
        setMessage({ type: 'success', text: 'Tampon modifié avec succès' });
      } else {
        const newTampon: Tampon = {
          id: `tmp_${Date.now()}`,
          nom: formData.nom,
          imageUrl: imageData,
          imageData,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const updated = [...tampons, newTampon];
        setTampons(updated);
        localStorage.setItem('tampons', JSON.stringify(updated));
        setMessage({ type: 'success', text: 'Tampon ajouté avec succès' });
      }
    }
    closeModal();
  };

  const handleDelete = (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) return;

    if (activeTab === 'signatures') {
      const updated = signatures.filter(s => s.id !== id);
      setSignatures(updated);
      localStorage.setItem('signatures', JSON.stringify(updated));
      setMessage({ type: 'success', text: 'Signature supprimée' });
    } else {
      const updated = tampons.filter(t => t.id !== id);
      setTampons(updated);
      localStorage.setItem('tampons', JSON.stringify(updated));
      setMessage({ type: 'success', text: 'Tampon supprimé' });
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({ nom: '', imageFile: null });
    setPreviewUrl(null);
    setShowAddModal(true);
  };

  const openEditModal = (item: Signature | Tampon) => {
    setEditingItem(item);
    setFormData({ nom: item.nom, imageFile: null });
    setPreviewUrl((item as any).imageData || item.imageUrl);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingItem(null);
    setFormData({ nom: '', imageFile: null });
    setPreviewUrl(null);
  };

  const items = activeTab === 'signatures' ? signatures : tampons;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <FontAwesomeIcon icon={activeTab === 'signatures' ? faSignature : faStamp} className="text-indigo-600" />
              Gestion des Signatures et Tampons
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Configurez les signatures et tampons utilisables dans l'application
            </p>
          </div>
          <Link
            to="/admin/cachet-accuse"
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors font-medium"
          >
            <FontAwesomeIcon icon={faCog} />
            Cachet accusé de réception
          </Link>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`p-4 rounded-xl border ${
          message.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <FontAwesomeIcon icon={message.type === 'success' ? faCheckCircle : faExclamationTriangle} className="mr-2" />
          {message.text}
        </div>
      )}

      {/* Onglets */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('signatures')}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'signatures'
                ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FontAwesomeIcon icon={faSignature} className="mr-2" />
            Signatures
          </button>
          <button
            onClick={() => setActiveTab('tampons')}
            className={`flex-1 px-6 py-4 font-semibold transition-all ${
              activeTab === 'tampons'
                ? 'bg-amber-50 text-amber-700 border-b-2 border-amber-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FontAwesomeIcon icon={faStamp} className="mr-2" />
            Tampons
          </button>
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900">
              {activeTab === 'signatures' ? 'Liste des signatures' : 'Liste des tampons'}
            </h3>
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 font-semibold flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faPlus} />
              Ajouter
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl">
              <FontAwesomeIcon 
                icon={activeTab === 'signatures' ? faSignature : faStamp} 
                className="text-slate-300 text-5xl mb-4" 
              />
              <p className="text-slate-600">
                Aucun{activeTab === 'signatures' ? 'e signature' : ' tampon'} configuré{activeTab === 'signatures' ? 'e' : ''}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(item => (
                <div key={item.id} className="bg-slate-50 rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all">
                  <div className="aspect-video bg-white rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                    <img 
                      src={(item as any).imageData || item.imageUrl} 
                      alt={item.nom}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <h4 className="font-semibold text-slate-900 mb-3">{item.nom}</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(item)}
                      className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
                    >
                      <FontAwesomeIcon icon={faEdit} className="mr-1" />
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
                    >
                      <FontAwesomeIcon icon={faTrash} className="mr-1" />
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Ajout/Modification */}
      {showAddModal && (
        <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">
                {editingItem ? 'Modifier' : 'Ajouter'} {activeTab === 'signatures' ? 'une signature' : 'un tampon'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nom</label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  placeholder={`Nom ${activeTab === 'signatures' ? 'de la signature' : 'du tampon'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="block w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all"
                >
                  <FontAwesomeIcon icon={faUpload} className="text-slate-400 text-2xl mb-2" />
                  <p className="text-sm text-slate-600">Cliquez pour sélectionner une image</p>
                </label>
              </div>
              {previewUrl && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Aperçu</p>
                  <div className="bg-white rounded-lg p-4 flex items-center justify-center">
                    <img src={previewUrl} alt="Aperçu" className="max-w-full max-h-48 object-contain" />
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faTimes} className="mr-2" />
                Annuler
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 font-semibold"
              >
                <FontAwesomeIcon icon={faSave} className="mr-2" />
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionSignaturesTampons;
