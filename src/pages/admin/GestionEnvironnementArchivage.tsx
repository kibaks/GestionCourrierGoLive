import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { archivageService } from '../../services/archivageService';
import { archive3DConfigService, Archive3DConfig } from '../../services/archive3DConfigService';
import { LocalArchivage, Armoire, Etagere, BoiteArchive, ParametresArchivage, DenominationArchivage, IconeArchivage } from '../../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faWarehouse,
  faBox,
  faLayerGroup,
  faArchive,
  faPlus,
  faEdit,
  faTrash,
  faTimes,
  faSave,
  faCog,
  faChevronRight,
  faChevronDown,
  faBuilding,
  faHome,
  faStore,
  faIndustry,
  faFolder,
  faCube,
  faInbox,
  faFile,
  faHdd,
  faGripLines,
  faTh,
  faTags,
  faBoxOpen,
  faCheck,
  faChevronLeft,
  faArrowRight,
  faMapMarkerAlt,
  faHashtag,
  faCalendar,
  faCheckCircle,
  faInfoCircle,
  faPalette,
  faRedo,
  faCamera
} from '@fortawesome/free-solid-svg-icons';

// Portail pour que les modals de cette page couvrent tout l'écran,
// sans être limités par le conteneur de la page Paramètres.
const ArchivagePortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';

// Mapping des icônes disponibles
const iconesDisponibles: { id: IconeArchivage; icon: IconDefinition; label: string }[] = [
  { id: 'warehouse', icon: faWarehouse, label: 'Entrepôt' },
  { id: 'building', icon: faBuilding, label: 'Bâtiment' },
  { id: 'home', icon: faHome, label: 'Maison' },
  { id: 'store', icon: faStore, label: 'Magasin' },
  { id: 'industry', icon: faIndustry, label: 'Industrie' },
  { id: 'box', icon: faBox, label: 'Boîte' },
  { id: 'cabinet', icon: faBox, label: 'Meuble' },
  { id: 'archive', icon: faArchive, label: 'Archive' },
  { id: 'folder', icon: faFolder, label: 'Dossier' },
  { id: 'drawer', icon: faInbox, label: 'Tiroir' },
  { id: 'layer', icon: faLayerGroup, label: 'Couches' },
  { id: 'shelf', icon: faGripLines, label: 'Étagère' },
  { id: 'bars', icon: faGripLines, label: 'Barres' },
  { id: 'grip', icon: faTh, label: 'Grille' },
  { id: 'th', icon: faTh, label: 'Tableau' },
  { id: 'cube', icon: faCube, label: 'Cube' },
  { id: 'package', icon: faBoxOpen, label: 'Colis' },
  { id: 'inbox', icon: faInbox, label: 'Boîte réception' },
  { id: 'file', icon: faFile, label: 'Fichier' },
  { id: 'hdd', icon: faHdd, label: 'Disque' }
];

const couleursDisponibles = [
  { id: 'purple', label: 'Violet', class: 'bg-purple-100 text-purple-600', gradient: 'from-purple-500 to-violet-600' },
  { id: 'blue', label: 'Bleu', class: 'bg-blue-100 text-blue-600', gradient: 'from-blue-500 to-cyan-500' },
  { id: 'green', label: 'Vert', class: 'bg-green-100 text-green-600', gradient: 'from-green-500 to-emerald-500' },
  { id: 'amber', label: 'Ambre', class: 'bg-amber-100 text-amber-600', gradient: 'from-amber-500 to-orange-500' },
  { id: 'red', label: 'Rouge', class: 'bg-red-100 text-red-600', gradient: 'from-red-500 to-rose-500' },
  { id: 'pink', label: 'Rose', class: 'bg-pink-100 text-pink-600', gradient: 'from-pink-500 to-rose-500' },
  { id: 'indigo', label: 'Indigo', class: 'bg-indigo-100 text-indigo-600', gradient: 'from-indigo-500 to-purple-500' },
  { id: 'teal', label: 'Sarcelle', class: 'bg-teal-100 text-teal-600', gradient: 'from-teal-500 to-cyan-500' },
  { id: 'orange', label: 'Orange', class: 'bg-orange-100 text-orange-600', gradient: 'from-orange-500 to-red-500' },
  { id: 'cyan', label: 'Cyan', class: 'bg-cyan-100 text-cyan-600', gradient: 'from-cyan-500 to-blue-500' }
];

const getIcone = (iconeId: IconeArchivage): IconDefinition => {
  return iconesDisponibles.find(i => i.id === iconeId)?.icon || faBox;
};

const getGradient = (couleur: string): string => {
  return couleursDisponibles.find(c => c.id === couleur)?.gradient || 'from-gray-500 to-slate-500';
};

const safeNum = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? (value as number) : fallback;

const BoolToggle: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => {
  return (
    <div className={`flex items-center justify-between p-4 bg-surface-50 border-2 border-surface-200 rounded-xl ${disabled ? 'opacity-60' : 'hover:border-primary-300 transition-colors'}`}>
      <span className="text-sm font-semibold text-surface-700">{label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${value ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-surface-700 border-surface-300'}`}
          onClick={() => onChange(true)}
          disabled={disabled}
        >
          Activé
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${!value ? 'bg-surface-200 text-surface-800 border-surface-400' : 'bg-white text-surface-700 border-surface-300'}`}
          onClick={() => onChange(false)}
          disabled={disabled}
        >
          Désactivé
        </button>
      </div>
    </div>
  );
};

const GestionEnvironnementArchivage: React.FC = () => {
  const [locaux, setLocaux] = useState<LocalArchivage[]>([]);
  const [armoires, setArmoires] = useState<Armoire[]>([]);
  const [etageres, setEtageres] = useState<Etagere[]>([]);
  const [boites, setBoites] = useState<BoiteArchive[]>([]);
  const [parametres, setParametres] = useState<ParametresArchivage | null>(null);
  const [activeTab, setActiveTab] = useState<'locaux' | 'armoires' | 'boites' | 'denominations' | 'parametres' | 'vue3d'>('locaux');
  const [config3D, setConfig3D] = useState<Archive3DConfig>(archive3DConfigService.getConfig());
  const [showParamDrawer, setShowParamDrawer] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [expandedLocaux, setExpandedLocaux] = useState<Set<string>>(new Set());
  const [editingDenom, setEditingDenom] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [panoramicImageFile, setPanoramicImageFile] = useState<File | null>(null);
  const [panoramicImagePreview, setPanoramicImagePreview] = useState<string | null>(null);
  const [isDraggingPanoramic, setIsDraggingPanoramic] = useState(false);

  // S'assurer que les nouvelles clés de config 3D sont présentes même si un ancien cache est chargé
  useEffect(() => {
    setConfig3D(prev => ({ ...archive3DConfigService.getConfig(), ...prev }));
  }, []);

  // Formulaires
  const [localForm, setLocalForm] = useState({
    nom: '', code: '', adresse: '', batiment: '', etage: '', description: '', capacite: 20, actif: true, photoPanoramique: ''
  });
  const [armoireForm, setArmoireForm] = useState({
    localId: '', nom: '', code: '', nombreEtageres: 6, position: '', description: '', actif: true
  });
  const [boiteForm, setBoiteForm] = useState({
    etagereId: '', numero: '', typeContenu: '', annee: new Date().getFullYear(), description: '', estPleine: false, actif: true
  });
  const [denomForm, setDenomForm] = useState({
    nomSingulier: '',
    nomPluriel: '',
    icone: 'box' as IconeArchivage,
    couleur: 'blue',
    description: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLocaux(archivageService.getAllLocaux());
    setArmoires(archivageService.getAllArmoires());
    setEtageres(archivageService.getAllEtageres());
    setBoites(archivageService.getAllBoites());
    // Charger les paramètres en asynchrone pour récupérer Firestore et refléter les mises à jour
    const params = await archivageService.getParametresAsync();
    setParametres(params);
  };

  const getDenom = (niveau: 1 | 2 | 3 | 4): DenominationArchivage => {
    return archivageService.getDenomination(niveau);
  };

  const resetForms = () => {
    setLocalForm({ nom: '', code: '', adresse: '', batiment: '', etage: '', description: '', capacite: 20, actif: true, photoPanoramique: '' });
    setArmoireForm({ localId: '', nom: '', code: '', nombreEtageres: 6, position: '', description: '', actif: true });
    setBoiteForm({ etagereId: '', numero: '', typeContenu: '', annee: new Date().getFullYear(), description: '', estPleine: false, actif: true });
    setEditingItem(null);
    setShowForm(false);
    setEditingDenom(null);
    setCurrentStep(1);
    setPanoramicImageFile(null);
    setPanoramicImagePreview(null);
  };

  // Fonctions pour gérer le drag and drop de l'image panoramique
  const handlePanoramicDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPanoramic(true);
  };

  const handlePanoramicDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPanoramic(false);
  };

  // Fonction pour redimensionner une image panoramique
  const resizePanoramicImage = (file: File, maxWidth: number = 4096, quality: number = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Si c'est une vidéo, retourner directement
      if (file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            resolve(event.target.result as string);
          } else {
            reject(new Error('Erreur lors de la lecture de la vidéo'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      // Pour les images, redimensionner
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Calculer les nouvelles dimensions en conservant le ratio 2:1 (panoramique équirectangulaire)
          let newWidth = img.width;
          let newHeight = img.height;

          // Si l'image est plus large que maxWidth, la redimensionner
          if (newWidth > maxWidth) {
            newWidth = maxWidth;
            // Pour une image panoramique équirectangulaire, le ratio est 2:1
            newHeight = Math.round(newWidth / 2);
          } else {
            // S'assurer que le ratio est proche de 2:1 (panoramique)
            const currentRatio = newWidth / newHeight;
            if (currentRatio < 1.8 || currentRatio > 2.2) {
              // Ajuster pour un ratio 2:1
              newHeight = Math.round(newWidth / 2);
            }
          }

          // Créer un canvas pour redimensionner
          const canvas = document.createElement('canvas');
          canvas.width = newWidth;
          canvas.height = newHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Impossible de créer le contexte canvas'));
            return;
          }

          // Dessiner l'image redimensionnée
          ctx.drawImage(img, 0, 0, newWidth, newHeight);

          // Convertir en base64 avec compression
          const resizedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(resizedDataUrl);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePanoramicDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPanoramic(false);

    const files = Array.from(e.dataTransfer.files);
    const mediaFile = files.find(file => 
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    
    if (mediaFile) {
      setPanoramicImageFile(mediaFile);
      try {
        // Redimensionner l'image si c'est une image, sinon utiliser directement
        const processedDataUrl = await resizePanoramicImage(mediaFile);
        setPanoramicImagePreview(processedDataUrl);
        setLocalForm({ ...localForm, photoPanoramique: processedDataUrl });
      } catch (error) {
        console.error('Erreur lors du traitement de l\'image panoramique:', error);
        // En cas d'erreur, utiliser le fichier original
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setPanoramicImagePreview(event.target.result as string);
            setLocalForm({ ...localForm, photoPanoramique: event.target.result as string });
          }
        };
        reader.readAsDataURL(mediaFile);
      }
    }
  };

  const handlePanoramicFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const mediaFile = files[0];
      if (mediaFile.type.startsWith('image/') || mediaFile.type.startsWith('video/')) {
        setPanoramicImageFile(mediaFile);
        try {
          // Redimensionner l'image si c'est une image, sinon utiliser directement
          const processedDataUrl = await resizePanoramicImage(mediaFile);
          setPanoramicImagePreview(processedDataUrl);
          setLocalForm({ ...localForm, photoPanoramique: processedDataUrl });
        } catch (error) {
          console.error('Erreur lors du traitement de l\'image panoramique:', error);
          // En cas d'erreur, utiliser le fichier original
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setPanoramicImagePreview(event.target.result as string);
              setLocalForm({ ...localForm, photoPanoramique: event.target.result as string });
            }
          };
          reader.readAsDataURL(mediaFile);
        }
      }
    }
  };

  const handleRemovePanoramicImage = () => {
    setPanoramicImageFile(null);
    setPanoramicImagePreview(null);
    setLocalForm({ ...localForm, photoPanoramique: '' });
  };

  // Handlers pour les locaux
  const handleSaveLocal = () => {
    if (!localForm.nom || !localForm.code) {
      alert('Nom et code requis');
      return;
    }
    
    // Vérifier que l'image panoramique est bien présente
    const photoPanoramique = panoramicImagePreview || localForm.photoPanoramique;
    const formData = {
      ...localForm,
      photoPanoramique: photoPanoramique || ''
    };
    
    // Log pour déboguer
    console.log('Sauvegarde du local:', {
      nom: formData.nom,
      code: formData.code,
      hasPhotoPanoramique: !!formData.photoPanoramique,
      photoPanoramiqueLength: formData.photoPanoramique?.length || 0,
      photoPanoramiquePreview: formData.photoPanoramique?.substring(0, 50) + '...'
    });
    
    if (editingItem) {
      archivageService.updateLocal(editingItem.id, formData);
    } else {
      archivageService.createLocal(formData);
    }
    resetForms();
    loadData();
  };

  const handleEditLocal = (local: LocalArchivage) => {
    console.log('Édition du local:', {
      id: local.id,
      nom: local.nom,
      hasPhotoPanoramique: !!local.photoPanoramique,
      photoPanoramiqueLength: local.photoPanoramique?.length || 0
    });
    
    setEditingItem(local);
    setLocalForm({
      nom: local.nom,
      code: local.code,
      adresse: local.adresse || '',
      batiment: local.batiment || '',
      etage: local.etage || '',
      description: local.description || '',
      capacite: local.capacite || 20,
      actif: local.actif,
      photoPanoramique: local.photoPanoramique || ''
    });
    // Charger l'aperçu si une URL existe
    if (local.photoPanoramique) {
      console.log('Chargement de l\'aperçu panoramique:', {
        length: local.photoPanoramique.length,
        isBase64: local.photoPanoramique.startsWith('data:'),
        preview: local.photoPanoramique.substring(0, 50) + '...'
      });
      setPanoramicImagePreview(local.photoPanoramique);
      setPanoramicImageFile(null);
    } else {
      setPanoramicImagePreview(null);
      setPanoramicImageFile(null);
    }
    setActiveTab('locaux');
    setCurrentStep(1);
    setShowForm(true);
  };

  const handleDeleteLocal = (id: string) => {
    if (window.confirm(`Supprimer ce ${getDenom(1).nomSingulier.toLowerCase()} et tout son contenu ?`)) {
      archivageService.deleteLocal(id);
      loadData();
    }
  };

  // Handlers pour les armoires
  const handleSaveArmoire = async () => {
    if (!armoireForm.nom || !armoireForm.code || !armoireForm.localId) {
      alert('Nom, code et local requis');
      return;
    }
    if (editingItem) {
      await archivageService.updateArmoire(editingItem.id, armoireForm);
    } else {
      const newArmoire = archivageService.createArmoire(armoireForm);
      for (let i = 1; i <= armoireForm.nombreEtageres; i++) {
        archivageService.createEtagere({
          armoireId: newArmoire.id,
          numero: i,
          nom: `${getDenom(3).nomSingulier} ${i}`,
          capaciteBoites: 10,
          actif: true
        });
      }
    }
    resetForms();
    await loadData();
  };

  const handleEditArmoire = (armoire: Armoire) => {
    setEditingItem(armoire);
    setArmoireForm({
      localId: armoire.localId,
      nom: armoire.nom,
      code: armoire.code,
      nombreEtageres: armoire.nombreEtageres,
      position: armoire.position || '',
      description: armoire.description || '',
      actif: armoire.actif
    });
    setActiveTab('armoires');
    setCurrentStep(1);
    setShowForm(true);
  };

  const handleDeleteArmoire = (id: string) => {
    if (window.confirm(`Supprimer cette ${getDenom(2).nomSingulier.toLowerCase()} et tout son contenu ?`)) {
      archivageService.deleteArmoire(id);
      loadData();
    }
  };

  // Handlers pour les boîtes
  const handleSaveBoite = () => {
    if (!boiteForm.numero || !boiteForm.etagereId) {
      alert('Numéro et étagère requis');
      return;
    }
    if (editingItem) {
      archivageService.updateBoite(editingItem.id, boiteForm);
    } else {
      archivageService.createBoite({
        ...boiteForm,
        code: `BOX-${boiteForm.annee}-${boiteForm.numero}`
      });
    }
    resetForms();
    loadData();
  };

  const handleDeleteBoite = (id: string) => {
    if (window.confirm(`Supprimer cette ${getDenom(4).nomSingulier.toLowerCase()} ?`)) {
      archivageService.deleteBoite(id);
      loadData();
    }
  };

  // Handler pour les dénominations
  const handleEditDenom = (niveau: 1 | 2 | 3 | 4) => {
    const denom = getDenom(niveau);
    setDenomForm({
      nomSingulier: denom.nomSingulier,
      nomPluriel: denom.nomPluriel,
      icone: denom.icone,
      couleur: denom.couleur,
      description: denom.description || ''
    });
    setCurrentStep(1);
    setEditingDenom(niveau);
  };

  const handleSaveDenom = async () => {
    if (!editingDenom || !denomForm.nomSingulier || !denomForm.nomPluriel) {
      alert('Noms singulier et pluriel requis');
      return;
    }
    await archivageService.updateDenomination(editingDenom as 1 | 2 | 3 | 4, {
      nomSingulier: denomForm.nomSingulier,
      nomPluriel: denomForm.nomPluriel,
      icone: denomForm.icone,
      couleur: denomForm.couleur,
      description: denomForm.description
    });
    setEditingDenom(null);
    setCurrentStep(1);
    loadData();
  };

  // Handler pour les paramètres
  const handleSaveParametres = async () => {
    if (parametres) {
      const updated = await archivageService.updateParametres(parametres);
      setParametres(updated);
      alert('Paramètres enregistrés');
    }
  };

  const toggleLocal = (id: string) => {
    const newExpanded = new Set(expandedLocaux);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedLocaux(newExpanded);
  };

  const stats = archivageService.getStatistiques();
  const denom1 = getDenom(1);
  const denom2 = getDenom(2);
  const denom3 = getDenom(3);
  const denom4 = getDenom(4);

  // Steps pour le formulaire de dénomination
  const denomSteps = [
    { id: 1, title: 'Libellés', icon: faTags },
    { id: 2, title: 'Apparence', icon: faPalette },
    { id: 3, title: 'Confirmation', icon: faCheck }
  ];

  const canGoToNextStep = () => {
    if (activeTab === 'locaux') {
      return currentStep === 1 ? localForm.nom && localForm.code : true;
    }
    if (activeTab === 'armoires') {
      return currentStep === 1 ? armoireForm.nom && armoireForm.code && armoireForm.localId : true;
    }
    if (activeTab === 'boites') {
      return currentStep === 1 ? boiteForm.numero && boiteForm.etagereId : true;
    }
    return denomForm.nomSingulier && denomForm.nomPluriel;
  };

  const nextStep = () => {
    if (canGoToNextStep()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Rendu du formulaire Local
  const renderLocalForm = () => (
    <div className="space-y-6">
            <div className="flex justify-end">
              <a
                href="/archives"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 rounded-lg shadow-sm text-sm font-semibold text-surface-700 hover:bg-surface-50 transition-colors"
              >
                <FontAwesomeIcon icon={faCube} className="text-surface-600" />
                Ouvrir la vue 3D
              </a>
            </div>
      <div className="text-center mb-8">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br ${getGradient(denom1.couleur)} text-white mb-4 shadow-lg`}>
          <FontAwesomeIcon icon={getIcone(denom1.icone)} className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-surface-900">
          {editingItem ? `Modifier le ${denom1.nomSingulier.toLowerCase()}` : `Nouveau ${denom1.nomSingulier.toLowerCase()}`}
        </h3>
        <p className="text-surface-500 mt-2">Renseignez les informations du lieu d'archivage</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
            <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-surface-400" />
            Nom <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder={`Nom du ${denom1.nomSingulier.toLowerCase()}`}
            value={localForm.nom}
            onChange={(e) => setLocalForm({ ...localForm, nom: e.target.value })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
            <FontAwesomeIcon icon={faHashtag} className="w-4 h-4 text-surface-400" />
            Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Ex: LOC-01"
            value={localForm.code}
            onChange={(e) => setLocalForm({ ...localForm, code: e.target.value.toUpperCase() })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-mono font-medium"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
          <FontAwesomeIcon icon={faMapMarkerAlt} className="w-4 h-4 text-surface-400" />
          Adresse
        </label>
        <input
          type="text"
          placeholder="Adresse complète"
          value={localForm.adresse}
          onChange={(e) => setLocalForm({ ...localForm, adresse: e.target.value })}
          className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-semibold text-surface-700 mb-2 block">Bâtiment</label>
          <input
            type="text"
            placeholder="Bâtiment A"
            value={localForm.batiment}
            onChange={(e) => setLocalForm({ ...localForm, batiment: e.target.value })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-surface-700 mb-2 block">Étage</label>
          <input
            type="text"
            placeholder="RDC, 1er..."
            value={localForm.etage}
            onChange={(e) => setLocalForm({ ...localForm, etage: e.target.value })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-surface-700 mb-2 block">Capacité</label>
          <input
            type="number"
            placeholder="20"
            value={localForm.capacite}
            onChange={(e) => setLocalForm({ ...localForm, capacite: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
          <FontAwesomeIcon icon={faCamera} className="w-4 h-4 text-surface-400" />
          Image panoramique
        </label>
        
        {/* Zone de drag and drop */}
        <div
          onDragOver={handlePanoramicDragOver}
          onDragLeave={handlePanoramicDragLeave}
          onDrop={handlePanoramicDrop}
          className={`relative border-2 border-dashed rounded-xl p-6 transition-all ${
            isDraggingPanoramic
              ? 'border-primary-500 bg-primary-50'
              : panoramicImagePreview || localForm.photoPanoramique
              ? 'border-green-500 bg-green-50'
              : 'border-surface-300 bg-surface-50 hover:border-surface-400'
          }`}
        >
          {panoramicImagePreview || localForm.photoPanoramique ? (
            <div className="space-y-3">
              <div className="relative">
                {(panoramicImagePreview || localForm.photoPanoramique)?.includes('video') || 
                 (panoramicImageFile && panoramicImageFile.type.startsWith('video/')) ? (
                  <video
                    src={panoramicImagePreview || localForm.photoPanoramique}
                    className="w-full h-48 object-cover rounded-lg"
                    controls
                    muted
                    loop
                  />
                ) : (
                  <img
                    src={panoramicImagePreview || localForm.photoPanoramique}
                    alt="Aperçu panoramique"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                )}
                <button
                  type="button"
                  onClick={handleRemovePanoramicImage}
                  className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  title="Supprimer le média"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                </button>
              </div>
              <div className="text-center">
                <p className="text-sm text-surface-600 font-medium">
                  {panoramicImageFile?.type.startsWith('video/') ? 'Vidéo' : 'Image'} panoramique chargée
                </p>
                {panoramicImageFile && (
                  <p className="text-xs text-surface-500 mt-1">{panoramicImageFile.name}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-surface-200 flex items-center justify-center">
                  <FontAwesomeIcon icon={faCamera} className="w-8 h-8 text-surface-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-700 mb-1">
                    Glissez-déposez une image ou vidéo panoramique ici
                  </p>
                  <p className="text-xs text-surface-500 mb-3">
                    ou cliquez pour sélectionner un fichier
                  </p>
                  <label className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer transition-colors">
                    <FontAwesomeIcon icon={faCamera} className="w-4 h-4 mr-2" />
                    Sélectionner un média
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handlePanoramicFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
                 <p className="text-xs text-surface-400 mt-2">
                   Format recommandé : Image panoramique 360° (équirectangulaire, ratio 2:1)
                 </p>
                 <p className="text-xs text-primary-600 mt-1 font-medium">
                   ℹ️ L'image sera automatiquement redimensionnée à 4096x2048px si nécessaire
                 </p>
              </div>
            </div>
          )}
        </div>
        
        {/* Champ URL alternatif */}
        <div className="mt-3">
          <label className="text-xs text-surface-500 mb-1 block">Ou entrez une URL :</label>
          <input
            type="text"
            placeholder="https://pannellum.org/images/alma.jpg"
            value={localForm.photoPanoramique}
            onChange={(e) => {
              const url = e.target.value;
              setLocalForm({ ...localForm, photoPanoramique: url });
              if (url && !panoramicImageFile) {
                // Si c'est une URL (commence par http) et qu'il n'y a pas de fichier, utiliser l'URL comme aperçu
                if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
                  setPanoramicImagePreview(url);
                } else {
                  setPanoramicImagePreview(null);
                }
              } else if (!url) {
                setPanoramicImagePreview(null);
              }
            }}
            className="w-full px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm"
          />
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-semibold text-blue-900 mb-2">💡 Images panoramiques de test disponibles :</p>
            <div className="space-y-1 text-xs text-blue-800">
              <div className="flex items-center gap-2">
                <span className="font-medium">Bibliothèque :</span>
                <code className="bg-white px-2 py-1 rounded text-blue-600 cursor-pointer hover:bg-blue-100" onClick={() => {
                  const url = 'https://pannellum.org/images/alma.jpg';
                  setLocalForm({ ...localForm, photoPanoramique: url });
                  setPanoramicImagePreview(url);
                }}>https://pannellum.org/images/alma.jpg</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Salle :</span>
                <code className="bg-white px-2 py-1 rounded text-blue-600 cursor-pointer hover:bg-blue-100" onClick={() => {
                  const url = 'https://pannellum.org/images/grand-canyon.jpg';
                  setLocalForm({ ...localForm, photoPanoramique: url });
                  setPanoramicImagePreview(url);
                }}>https://pannellum.org/images/grand-canyon.jpg</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Bureau :</span>
                <code className="bg-white px-2 py-1 rounded text-blue-600 cursor-pointer hover:bg-blue-100" onClick={() => {
                  const url = 'https://pannellum.org/images/office.jpg';
                  setLocalForm({ ...localForm, photoPanoramique: url });
                  setPanoramicImagePreview(url);
                }}>https://pannellum.org/images/office.jpg</code>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              Cliquez sur une URL pour l'utiliser directement
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Rendu du formulaire Armoire
  const renderArmoireForm = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br ${getGradient(denom2.couleur)} text-white mb-4 shadow-lg`}>
          <FontAwesomeIcon icon={getIcone(denom2.icone)} className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-surface-900">
          {editingItem ? `Modifier ${denom2.nomSingulier.toLowerCase()}` : `Nouvelle ${denom2.nomSingulier.toLowerCase()}`}
        </h3>
        <p className="text-surface-500 mt-2">Configurez le rangement</p>
      </div>
      
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
          <FontAwesomeIcon icon={getIcone(denom1.icone)} className="w-4 h-4 text-surface-400" />
          {denom1.nomSingulier} <span className="text-red-500">*</span>
        </label>
        <select
          value={armoireForm.localId}
          onChange={(e) => setArmoireForm({ ...armoireForm, localId: e.target.value })}
          className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium cursor-pointer"
        >
          <option value="">Sélectionner un {denom1.nomSingulier.toLowerCase()}</option>
          {locaux.filter(l => l.actif).map((local) => (
            <option key={local.id} value={local.id}>{local.nom} ({local.code})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-surface-700 mb-2 block">Nom <span className="text-red-500">*</span></label>
          <input
            type="text"
            placeholder={`Nom de la ${denom2.nomSingulier.toLowerCase()}`}
            value={armoireForm.nom}
            onChange={(e) => setArmoireForm({ ...armoireForm, nom: e.target.value })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-surface-700 mb-2 block">Code <span className="text-red-500">*</span></label>
          <input
            type="text"
            placeholder="Ex: ARM-01"
            value={armoireForm.code}
            onChange={(e) => setArmoireForm({ ...armoireForm, code: e.target.value.toUpperCase() })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-mono font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-surface-700 mb-2 block">Nombre de {denom3.nomPluriel.toLowerCase()}</label>
          <input
            type="number"
            value={armoireForm.nombreEtageres}
            onChange={(e) => setArmoireForm({ ...armoireForm, nombreEtageres: parseInt(e.target.value) || 6 })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
            min="1"
            max="20"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-surface-700 mb-2 block">Position</label>
          <input
            type="text"
            placeholder="Ex: Rangée A"
            value={armoireForm.position}
            onChange={(e) => setArmoireForm({ ...armoireForm, position: e.target.value })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
          />
        </div>
      </div>
    </div>
  );

  // Rendu du formulaire Boîte
  const renderBoiteForm = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br ${getGradient(denom4.couleur)} text-white mb-4 shadow-lg`}>
          <FontAwesomeIcon icon={getIcone(denom4.icone)} className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-surface-900">
          {editingItem ? `Modifier ${denom4.nomSingulier.toLowerCase()}` : `Nouvelle ${denom4.nomSingulier.toLowerCase()}`}
        </h3>
        <p className="text-surface-500 mt-2">Créez un conteneur d'archives</p>
      </div>
      
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
          <FontAwesomeIcon icon={getIcone(denom3.icone)} className="w-4 h-4 text-surface-400" />
          {denom3.nomSingulier} <span className="text-red-500">*</span>
        </label>
        <select
          value={boiteForm.etagereId}
          onChange={(e) => setBoiteForm({ ...boiteForm, etagereId: e.target.value })}
          className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium cursor-pointer"
        >
          <option value="">Sélectionner une {denom3.nomSingulier.toLowerCase()}</option>
          {locaux.filter(l => l.actif).map((local) => (
            <optgroup key={local.id} label={local.nom}>
              {armoires.filter(a => a.localId === local.id && a.actif).map((armoire) => (
                etageres.filter(e => e.armoireId === armoire.id && e.actif).map((etagere) => (
                  <option key={etagere.id} value={etagere.id}>{armoire.nom} - {etagere.nom}</option>
                ))
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-surface-700 mb-2 block">Numéro <span className="text-red-500">*</span></label>
          <input
            type="text"
            placeholder="Ex: 001"
            value={boiteForm.numero}
            onChange={(e) => setBoiteForm({ ...boiteForm, numero: e.target.value })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-2">
            <FontAwesomeIcon icon={faCalendar} className="w-4 h-4 text-surface-400" />
            Année
          </label>
          <input
            type="number"
            value={boiteForm.annee}
            onChange={(e) => setBoiteForm({ ...boiteForm, annee: parseInt(e.target.value) || new Date().getFullYear() })}
            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-surface-700 mb-2 block">Type de contenu</label>
        <input
          type="text"
          placeholder="Ex: Courriers entrants"
          value={boiteForm.typeContenu}
          onChange={(e) => setBoiteForm({ ...boiteForm, typeContenu: e.target.value })}
          className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
        />
      </div>

      <label className="flex items-center gap-4 p-4 bg-surface-50 border-2 border-surface-200 rounded-xl cursor-pointer hover:border-primary-300 transition-colors">
        <input
          type="checkbox"
          checked={boiteForm.estPleine}
          onChange={(e) => setBoiteForm({ ...boiteForm, estPleine: e.target.checked })}
          className="sr-only peer"
        />
        <div className="relative w-14 h-8 bg-surface-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md peer-checked:bg-amber-500" />
        <span className="text-sm font-semibold text-surface-700">{denom4.nomSingulier} pleine</span>
      </label>
    </div>
  );

  return (
    <div className="p-6">
      {/* Header avec Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-surface-900 flex items-center gap-3">
            <FontAwesomeIcon icon={faWarehouse} className="w-5 h-5 text-rose-500" />
            Environnement d'archivage
          </h2>
          <p className="text-surface-500 mt-1">Gérez votre infrastructure de stockage physique</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { denom: denom1, count: stats.totalLocaux },
          { denom: denom2, count: stats.totalArmoires },
          { denom: denom3, count: stats.totalEtageres },
          { denom: denom4, count: stats.totalBoites }
        ].map(({ denom, count }, idx) => (
          <div key={idx} className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-surface-200 shadow-sm hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${getGradient(denom.couleur)} flex items-center justify-center shadow-lg`}>
                <FontAwesomeIcon icon={getIcone(denom.icone)} className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-surface-900">{count}</p>
                <p className="text-sm text-surface-500 font-medium">{denom.nomPluriel}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'locaux' as const, label: denom1.nomPluriel, icon: getIcone(denom1.icone), gradient: getGradient(denom1.couleur) },
          { id: 'armoires' as const, label: denom2.nomPluriel, icon: getIcone(denom2.icone), gradient: getGradient(denom2.couleur) },
          { id: 'boites' as const, label: denom4.nomPluriel, icon: getIcone(denom4.icone), gradient: getGradient(denom4.couleur) },
          { id: 'denominations' as const, label: 'Dénominations', icon: faTags, gradient: 'from-violet-500 to-purple-500' },
          { id: 'parametres' as const, label: 'Paramètres', icon: faCog, gradient: 'from-slate-500 to-gray-600' },
          { id: 'vue3d' as const, label: 'Vue 3D', icon: faCube, gradient: 'from-cyan-500 to-blue-500' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              resetForms();
              setShowParamDrawer(tab.id === 'parametres');
            }}
            className={`px-5 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
              activeTab === tab.id
                ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg`
                : 'bg-white text-surface-600 hover:bg-surface-50 border border-surface-200'
            }`}
          >
            <FontAwesomeIcon icon={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bouton Ajouter */}
      {['locaux', 'armoires', 'boites'].includes(activeTab) && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => { resetForms(); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-xl hover:from-primary-600 hover:to-secondary-600 transition-all font-semibold text-sm shadow-lg"
          >
            <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
            Ajouter
          </button>
        </div>
      )}

      {/* Modal de formulaire (via portail pour overlay pleine page) */}
      {showForm && ['locaux', 'armoires', 'boites'].includes(activeTab) && (
        <ArchivagePortal>
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-4 border border-surface-200 max-h-[90vh] flex flex-col animate-slideIn">
            <div className={`flex-shrink-0 px-5 py-3 border-b border-surface-100 bg-gradient-to-r ${
              activeTab === 'locaux' ? getGradient(denom1.couleur) :
              activeTab === 'armoires' ? getGradient(denom2.couleur) :
              getGradient(denom4.couleur)
            } rounded-t-3xl`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <FontAwesomeIcon 
                      icon={activeTab === 'locaux' ? getIcone(denom1.icone) : activeTab === 'armoires' ? getIcone(denom2.icone) : getIcone(denom4.icone)} 
                      className="w-4 h-4 text-white" 
                    />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {editingItem ? 'Modifier' : 'Créer'} {
                        activeTab === 'locaux' ? denom1.nomSingulier.toLowerCase() :
                        activeTab === 'armoires' ? denom2.nomSingulier.toLowerCase() :
                        denom4.nomSingulier.toLowerCase()
                      }
                    </h3>
                  </div>
                </div>
                <button
                  onClick={resetForms}
                  className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors flex items-center justify-center"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'locaux' && renderLocalForm()}
              {activeTab === 'armoires' && renderArmoireForm()}
              {activeTab === 'boites' && renderBoiteForm()}
            </div>
            
              <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-surface-100 bg-surface-50 rounded-b-3xl">
                <button
                  onClick={resetForms}
                  className="px-5 py-2.5 text-sm font-semibold text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={activeTab === 'locaux' ? handleSaveLocal : activeTab === 'armoires' ? handleSaveArmoire : handleSaveBoite}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-secondary-500 rounded-xl hover:from-primary-600 hover:to-secondary-600 transition-all shadow-lg flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </ArchivagePortal>
      )}

      {/* Contenu: Locaux */}
      {activeTab === 'locaux' && !showForm && (
        <div className="space-y-4">
          {locaux.filter(l => l.actif).map((local) => (
            <div key={local.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden hover:shadow-lg transition-shadow">
              <div 
                className="flex items-center justify-between p-5 cursor-pointer hover:bg-surface-50 transition-colors" 
                onClick={() => toggleLocal(local.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon 
                      icon={expandedLocaux.has(local.id) ? faChevronDown : faChevronRight} 
                      className="w-4 h-4 text-surface-400 transition-transform"
                    />
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${getGradient(denom1.couleur)} flex items-center justify-center shadow-lg`}>
                      <FontAwesomeIcon icon={getIcone(denom1.icone)} className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-surface-900 text-lg">{local.nom}</h3>
                    <p className="text-sm text-surface-500">{local.code} • {local.batiment}, {local.etage}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                  <span className="px-3 py-1.5 bg-surface-100 text-surface-600 rounded-lg text-sm font-semibold">
                    {armoires.filter(a => a.localId === local.id && a.actif).length} {denom2.nomPluriel.toLowerCase()}
                  </span>
                  <button onClick={() => handleEditLocal(local)} className="w-10 h-10 rounded-xl text-surface-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex items-center justify-center">
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button onClick={() => handleDeleteLocal(local.id)} className="w-10 h-10 rounded-xl text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
              {expandedLocaux.has(local.id) && (
                <div className="border-t border-surface-100 p-5 bg-surface-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {armoires.filter(a => a.localId === local.id && a.actif).map((armoire) => (
                      <div key={armoire.id} className="bg-white rounded-xl p-4 border border-surface-200 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGradient(denom2.couleur)} flex items-center justify-center`}>
                              <FontAwesomeIcon icon={getIcone(denom2.icone)} className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <span className="font-semibold text-surface-800">{armoire.nom}</span>
                              <p className="text-xs text-surface-500">{armoire.code}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleEditArmoire(armoire)} className="p-2 text-surface-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors">
                              <FontAwesomeIcon icon={faEdit} className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteArmoire(armoire.id)} className="p-2 text-surface-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                              <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {armoire.position && <p className="text-xs text-surface-500 mb-2">{armoire.position}</p>}
                        <div className="text-xs text-surface-600 bg-surface-50 rounded-lg px-3 py-2">
                          {etageres.filter(e => e.armoireId === armoire.id && e.actif).length} {denom3.nomPluriel.toLowerCase()}
                        </div>
                      </div>
                    ))}
                    {armoires.filter(a => a.localId === local.id && a.actif).length === 0 && (
                      <div className="col-span-full text-center py-8 text-surface-400">
                        <FontAwesomeIcon icon={getIcone(denom2.icone)} className="w-8 h-8 mb-2 opacity-50" />
                        <p>Aucune {denom2.nomSingulier.toLowerCase()}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {locaux.filter(l => l.actif).length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border border-surface-200">
              <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${getGradient(denom1.couleur)} flex items-center justify-center mx-auto mb-4 opacity-50`}>
                <FontAwesomeIcon icon={getIcone(denom1.icone)} className="w-8 h-8 text-white" />
              </div>
              <p className="text-surface-500 font-medium">Aucun {denom1.nomSingulier.toLowerCase()} configuré</p>
              <p className="text-surface-400 text-sm mt-1">Commencez par créer un lieu d'archivage</p>
            </div>
          )}
        </div>
      )}

      {/* Contenu: Armoires */}
      {activeTab === 'armoires' && !showForm && (
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-surface-100">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">{denom2.nomSingulier}</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">{denom1.nomSingulier}</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Position</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">{denom3.nomPluriel}</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {armoires.filter(a => a.actif).map((armoire) => {
                const local = locaux.find(l => l.id === armoire.localId);
                return (
                  <tr key={armoire.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGradient(denom2.couleur)} flex items-center justify-center`}>
                          <FontAwesomeIcon icon={getIcone(denom2.icone)} className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <span className="font-semibold text-surface-900">{armoire.nom}</span>
                          <p className="text-xs text-surface-500 font-mono">{armoire.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-surface-600 font-medium">{local?.nom || '—'}</td>
                    <td className="px-5 py-4 text-sm text-surface-600">{armoire.position || '—'}</td>
                    <td className="px-5 py-4">
                      <span className="px-3 py-1.5 bg-surface-100 text-surface-700 rounded-lg text-sm font-semibold">
                        {etageres.filter(e => e.armoireId === armoire.id && e.actif).length}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEditArmoire(armoire)} className="w-9 h-9 rounded-lg text-surface-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex items-center justify-center">
                          <FontAwesomeIcon icon={faEdit} className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteArmoire(armoire.id)} className="w-9 h-9 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center">
                          <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {armoires.filter(a => a.actif).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getGradient(denom2.couleur)} flex items-center justify-center mx-auto mb-4 opacity-50`}>
                      <FontAwesomeIcon icon={getIcone(denom2.icone)} className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-surface-500 font-medium">Aucune {denom2.nomSingulier.toLowerCase()}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Contenu: Boîtes */}
      {activeTab === 'boites' && !showForm && (
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
          <table className="min-w-full divide-y divide-surface-100">
            <thead className="bg-surface-50">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">{denom4.nomSingulier}</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Localisation</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Année</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Type</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider">Statut</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-surface-500 uppercase tracking-wider w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {boites.filter(b => b.actif).map((boite) => {
                const etagere = etageres.find(e => e.id === boite.etagereId);
                const armoire = armoires.find(a => a.id === etagere?.armoireId);
                const local = locaux.find(l => l.id === armoire?.localId);
                return (
                  <tr key={boite.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGradient(denom4.couleur)} flex items-center justify-center`}>
                          <FontAwesomeIcon icon={getIcone(denom4.icone)} className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-semibold text-surface-900">{boite.numero}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-surface-600">{local?.nom} / {armoire?.nom} / {etagere?.nom}</td>
                    <td className="px-5 py-4 text-sm text-surface-600 font-mono">{boite.annee || '—'}</td>
                    <td className="px-5 py-4 text-sm text-surface-600">{boite.typeContenu || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl ${
                        boite.estPleine 
                          ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                          : 'bg-green-100 text-green-700 border border-green-200'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${boite.estPleine ? 'bg-amber-500' : 'bg-green-500'}`} />
                        {boite.estPleine ? 'Pleine' : 'Disponible'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button onClick={() => handleDeleteBoite(boite.id)} className="w-9 h-9 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center">
                        <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {boites.filter(b => b.actif).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getGradient(denom4.couleur)} flex items-center justify-center mx-auto mb-4 opacity-50`}>
                      <FontAwesomeIcon icon={getIcone(denom4.icone)} className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-surface-500 font-medium">Aucune {denom4.nomSingulier.toLowerCase()}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Contenu: Dénominations */}
      {activeTab === 'denominations' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faInfoCircle} className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-amber-900">Personnalisez les dénominations</h4>
                <p className="text-sm text-amber-700 mt-1">
                  Adaptez les noms des niveaux d'archivage à votre contexte. Par exemple, "Armoire" peut devenir "Rayonnage", "Classeur" ou "Étagère métallique".
                </p>
              </div>
            </div>
          </div>

          {[1, 2, 3, 4].map((niveau) => {
            const denom = getDenom(niveau as 1 | 2 | 3 | 4);
            const isEditing = editingDenom === niveau;
            
            return (
              <div key={niveau} className={`bg-white rounded-2xl border ${isEditing ? 'border-primary-300 ring-2 ring-primary-100' : 'border-surface-200'} overflow-hidden shadow-sm transition-all`}>
                {isEditing ? (
                  <div className="p-6">
                    {/* Header modal édition */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getGradient(denom.couleur)} flex items-center justify-center`}>
                          <FontAwesomeIcon icon={getIcone(denom.icone)} className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-surface-900">Modifier le niveau {niveau}</h3>
                          <p className="text-sm text-surface-500">Personnalisez cette dénomination</p>
                        </div>
                      </div>
                      <button onClick={() => { setEditingDenom(null); setCurrentStep(1); }} className="w-10 h-10 rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors flex items-center justify-center">
                        <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Steps */}
                    <div className="flex items-center justify-between mb-8 px-4">
                      {denomSteps.map((step, index) => (
                        <React.Fragment key={step.id}>
                          <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                              currentStep >= step.id 
                                ? 'bg-gradient-to-br from-primary-500 to-secondary-500 text-white shadow-lg' 
                                : 'bg-surface-100 text-surface-400'
                            }`}>
                              {currentStep > step.id ? (
                                <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                              ) : (
                                <FontAwesomeIcon icon={step.icon} className="w-4 h-4" />
                              )}
                            </div>
                            <span className={`text-xs mt-2 font-medium ${currentStep >= step.id ? 'text-surface-900' : 'text-surface-400'}`}>
                              {step.title}
                            </span>
                          </div>
                          {index < denomSteps.length - 1 && (
                            <div className={`flex-1 h-1 mx-3 rounded-full transition-colors ${currentStep > step.id ? 'bg-primary-500' : 'bg-surface-200'}`} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    
                    {/* Step 1: Libellés */}
                    {currentStep === 1 && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-surface-700 mb-2">Nom singulier <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={denomForm.nomSingulier}
                              onChange={(e) => setDenomForm({ ...denomForm, nomSingulier: e.target.value })}
                              className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                              placeholder="Ex: Armoire"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-surface-700 mb-2">Nom pluriel <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={denomForm.nomPluriel}
                              onChange={(e) => setDenomForm({ ...denomForm, nomPluriel: e.target.value })}
                              className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                              placeholder="Ex: Armoires"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-2">Description</label>
                          <input
                            type="text"
                            value={denomForm.description}
                            onChange={(e) => setDenomForm({ ...denomForm, description: e.target.value })}
                            className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                            placeholder="Ex: Meuble de rangement métallique"
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Step 2: Apparence */}
                    {currentStep === 2 && (
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-3">Icône</label>
                          <div className="grid grid-cols-5 gap-2">
                            {iconesDisponibles.map((icone) => (
                              <button
                                key={icone.id}
                                onClick={() => setDenomForm({ ...denomForm, icone: icone.id })}
                                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                                  denomForm.icone === icone.id
                                    ? 'border-primary-500 bg-primary-50 shadow-lg'
                                    : 'border-surface-200 hover:border-surface-300'
                                }`}
                                title={icone.label}
                              >
                                <FontAwesomeIcon icon={icone.icon} className="w-5 h-5" />
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-3">Couleur</label>
                          <div className="flex flex-wrap gap-2">
                            {couleursDisponibles.map((couleur) => (
                              <button
                                key={couleur.id}
                                onClick={() => setDenomForm({ ...denomForm, couleur: couleur.id })}
                                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${couleur.gradient} transition-all flex items-center justify-center ${
                                  denomForm.couleur === couleur.id
                                    ? 'ring-4 ring-offset-2 ring-primary-500 scale-110'
                                    : 'hover:scale-105'
                                }`}
                                title={couleur.label}
                              >
                                <FontAwesomeIcon icon={getIcone(denomForm.icone)} className="w-5 h-5 text-white" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Step 3: Confirmation */}
                    {currentStep === 3 && (
                      <div className="space-y-4">
                        <div className="bg-surface-50 rounded-xl p-5 space-y-3">
                          <div className="flex items-center justify-between py-2 border-b border-surface-200">
                            <span className="text-surface-500">Singulier</span>
                            <span className="font-semibold text-surface-900">{denomForm.nomSingulier}</span>
                          </div>
                          <div className="flex items-center justify-between py-2 border-b border-surface-200">
                            <span className="text-surface-500">Pluriel</span>
                            <span className="font-semibold text-surface-900">{denomForm.nomPluriel}</span>
                          </div>
                          <div className="flex items-center justify-between py-2 border-b border-surface-200">
                            <span className="text-surface-500">Description</span>
                            <span className="font-medium text-surface-900">{denomForm.description || '—'}</span>
                          </div>
                          <div className="flex items-center justify-between py-2">
                            <span className="text-surface-500">Apparence</span>
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGradient(denomForm.couleur)} flex items-center justify-center`}>
                              <FontAwesomeIcon icon={getIcone(denomForm.icone)} className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Navigation */}
                    <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-surface-100">
                      <button
                        onClick={() => currentStep === 1 ? setEditingDenom(null) : prevStep()}
                        className="px-5 py-2.5 text-sm font-semibold text-surface-700 bg-white border-2 border-surface-200 rounded-xl hover:bg-surface-50 transition-colors flex items-center gap-2"
                      >
                        <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
                        {currentStep === 1 ? 'Annuler' : 'Précédent'}
                      </button>
                      {currentStep < denomSteps.length ? (
                        <button
                          onClick={nextStep}
                          disabled={!canGoToNextStep()}
                          className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-secondary-500 rounded-xl hover:from-primary-600 hover:to-secondary-600 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          Suivant
                          <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
                        </button>
                      ) : (
                        <button
                          onClick={handleSaveDenom}
                          className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all flex items-center gap-2"
                        >
                          <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                          Enregistrer
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-5 hover:bg-surface-50 transition-colors">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center text-xl font-bold text-surface-400">
                        {niveau}
                      </div>
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${getGradient(denom.couleur)} flex items-center justify-center shadow-lg`}>
                        <FontAwesomeIcon icon={getIcone(denom.icone)} className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-surface-900 text-lg">{denom.nomSingulier} / {denom.nomPluriel}</h3>
                        <p className="text-sm text-surface-500">{denom.description || 'Aucune description'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleEditDenom(niveau as 1 | 2 | 3 | 4)}
                      className="px-5 py-2.5 text-primary-600 hover:bg-primary-50 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faEdit} className="w-4 h-4" />
                      Modifier
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Contenu: Configuration Vue 3D */}
      {activeTab === 'vue3d' && (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-surface-100 bg-gradient-to-r from-surface-50 to-white">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                <FontAwesomeIcon icon={faCube} className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-surface-900 text-lg">Configuration de la vue 3D</h3>
                <p className="text-sm text-surface-500">Personnalisez l'apparence de la modélisation 3D</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Couleurs */}
            <div className="space-y-4">
              <h4 className="font-semibold text-surface-900">Couleurs</h4>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur des armoires
                </label>
                <input
                  type="color"
                  value={config3D.armoireColor}
                  onChange={(e) => setConfig3D({ ...config3D, armoireColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur des étagères
                </label>
                <input
                  type="color"
                  value={config3D.etagereColor}
                  onChange={(e) => setConfig3D({ ...config3D, etagereColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur boîte pleine
                </label>
                <input
                  type="color"
                  value={config3D.boitePleineColor}
                  onChange={(e) => setConfig3D({ ...config3D, boitePleineColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur boîte vide
                </label>
                <input
                  type="color"
                  value={config3D.boiteVideColor}
                  onChange={(e) => setConfig3D({ ...config3D, boiteVideColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur des murs
                </label>
                <input
                  type="color"
                  value={config3D.wallColor}
                  onChange={(e) => setConfig3D({ ...config3D, wallColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur du sol
                </label>
                <input
                  type="color"
                  value={config3D.floorColor}
                  onChange={(e) => setConfig3D({ ...config3D, floorColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur du plafond
                </label>
                <input
                  type="color"
                  value={config3D.ceilingColor}
                  onChange={(e) => setConfig3D({ ...config3D, ceilingColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur du quadrillage (plan)
                </label>
                <input
                  type="color"
                  value={config3D.planGridColor}
                  onChange={(e) => setConfig3D({ ...config3D, planGridColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Couleur de la porte du local
                </label>
                <input
                  type="color"
                  value={config3D.roomDoorColor}
                  onChange={(e) => setConfig3D({ ...config3D, roomDoorColor: e.target.value })}
                  className="w-full h-12 rounded-lg border-2 border-surface-200 cursor-pointer"
                />
              </div>
            </div>
            
            {/* Visibilité */}
            <div className="space-y-3">
              <h4 className="font-semibold text-surface-900">Visibilité</h4>
              
              <BoolToggle
                label="Afficher les portes"
                value={config3D.showPortes}
                onChange={(v) => setConfig3D({ ...config3D, showPortes: v })}
              />

              <BoolToggle
                label="Portes ouvertes"
                value={config3D.porteOuverte}
                onChange={(v) => setConfig3D({ ...config3D, porteOuverte: v })}
                disabled={!config3D.showPortes}
              />

              <BoolToggle
                label="Afficher les catégories"
                value={config3D.showDossiers}
                onChange={(v) => setConfig3D({ ...config3D, showDossiers: v })}
              />

              <BoolToggle
                label="Afficher les étiquettes"
                value={config3D.showEtiquettes}
                onChange={(v) => setConfig3D({ ...config3D, showEtiquettes: v })}
              />

              <BoolToggle
                label="Afficher le mur avant"
                value={config3D.showFrontWall}
                onChange={(v) => setConfig3D({ ...config3D, showFrontWall: v })}
              />

              <BoolToggle
                label="Quadrillage au sol"
                value={config3D.planGridEnabled}
                onChange={(v) => setConfig3D({ ...config3D, planGridEnabled: v })}
              />
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-surface-900">Transparence & plan</h4>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Transparence du mur avant: {safeNum(config3D.frontWallOpacity, 0.45).toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={safeNum(config3D.frontWallOpacity, 0.45)}
                  onChange={(e) => setConfig3D({ ...config3D, frontWallOpacity: parseFloat(e.target.value) })}
                  className="w-full"
                  disabled={!config3D.showFrontWall}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Espacement du quadrillage (m)
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={safeNum(config3D.planGridSpacing, 1)}
                  onChange={(e) => setConfig3D({ ...config3D, planGridSpacing: parseFloat(e.target.value) || 0.1 })}
                  className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                />
              </div>
            </div>
            
            {/* Tailles */}
            <div className="space-y-4">
              <h4 className="font-semibold text-surface-900">Tailles</h4>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Épaisseur des étagères: {safeNum(config3D.etagereThickness, 0.025).toFixed(3)}
                </label>
                <input
                  type="range"
                  min="0.01"
                  max="0.05"
                  step="0.005"
                  value={safeNum(config3D.etagereThickness, 0.025)}
                  onChange={(e) => setConfig3D({ ...config3D, etagereThickness: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Épaisseur des portes: {safeNum(config3D.armoireDoorThickness, 0.025).toFixed(3)}
                </label>
                <input
                  type="range"
                  min="0.01"
                  max="0.05"
                  step="0.005"
                  value={safeNum(config3D.armoireDoorThickness, 0.025)}
                  onChange={(e) => setConfig3D({ ...config3D, armoireDoorThickness: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Boîtes par rangée: {config3D.boitesPerRow}
                </label>
                <input
                  type="range"
                  min="3"
                  max="8"
                  step="1"
                  value={safeNum(config3D.boitesPerRow, 5)}
                  onChange={(e) => setConfig3D({ ...config3D, boitesPerRow: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>

            {/* Dimensions architecturales */}
            <div className="space-y-4">
              <h4 className="font-semibold text-surface-900">Dimensions architecturales (m)</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Largeur du local</label>
                  <input
                    type="number"
                    min="3"
                    step="0.1"
                  value={safeNum(config3D.roomWidth, 8)}
                    onChange={(e) => setConfig3D({ ...config3D, roomWidth: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Longueur du local</label>
                  <input
                    type="number"
                    min="3"
                    step="0.1"
                  value={safeNum(config3D.roomDepth, 5)}
                    onChange={(e) => setConfig3D({ ...config3D, roomDepth: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Hauteur sous plafond</label>
                  <input
                    type="number"
                    min="2"
                    step="0.1"
                  value={safeNum(config3D.roomHeight, 3)}
                    onChange={(e) => setConfig3D({ ...config3D, roomHeight: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Épaisseur des murs</label>
                  <input
                    type="number"
                    min="0.05"
                    step="0.01"
                  value={safeNum(config3D.wallThickness, 0.2)}
                    onChange={(e) => setConfig3D({ ...config3D, wallThickness: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Armoires par rangée</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    step="1"
                  value={safeNum(config3D.armoiresPerRow, 3)}
                    onChange={(e) => setConfig3D({ ...config3D, armoiresPerRow: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Espacement entre armoires</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.1"
                  value={safeNum(config3D.armoireSpacing, 1.5)}
                    onChange={(e) => setConfig3D({ ...config3D, armoireSpacing: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Positionnement */}
            <div className="space-y-4">
              <h4 className="font-semibold text-surface-900">Positionnement</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Décalage des armoires sur X (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={safeNum(config3D.armoireBaseXOffset, 0)}
                    onChange={(e) => setConfig3D({ ...config3D, armoireBaseXOffset: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Distance des armoires au mur arrière (m)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={safeNum(config3D.armoireBackOffset, 0.8)}
                    onChange={(e) => setConfig3D({ ...config3D, armoireBackOffset: parseFloat(e.target.value) || 0.8 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Décalage armoires avant / arrière (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={safeNum(config3D.armoireOffsetZ, 0)}
                    onChange={(e) => setConfig3D({ ...config3D, armoireOffsetZ: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                  <p className="text-xs text-surface-500 mt-1">Valeur positive pour avancer vers l'avant, négative pour reculer.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <h5 className="text-sm font-semibold text-surface-800 mb-2">Porte</h5>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Décalage porte (gauche / droite) X (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={safeNum(config3D.roomDoorOffset, 0)}
                    onChange={(e) => setConfig3D({ ...config3D, roomDoorOffset: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Décalage porte vertical Y (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={safeNum(config3D.roomDoorOffsetY, 0)}
                    onChange={(e) => setConfig3D({ ...config3D, roomDoorOffsetY: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Décalage porte profondeur Z (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={safeNum(config3D.roomDoorOffsetZ, 0)}
                    onChange={(e) => setConfig3D({ ...config3D, roomDoorOffsetZ: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                  />
                  <p className="text-xs text-surface-500 mt-1">Utiliser des valeurs positives pour avancer la porte, négatives pour la reculer.</p>
                </div>
              </div>
            </div>

            {/* Porte du local */}
            <div className="space-y-4">
              <h4 className="font-semibold text-surface-900">Porte du local</h4>

              <BoolToggle
                label="Afficher la porte"
                value={config3D.roomDoorEnabled}
                onChange={(v) => setConfig3D({ ...config3D, roomDoorEnabled: v })}
              />

              <BoolToggle
                label="Porte ouverte"
                value={config3D.roomDoorOpen}
                onChange={(v) => setConfig3D({ ...config3D, roomDoorOpen: v })}
                disabled={!config3D.roomDoorEnabled}
              />

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Largeur porte (m)</label>
                  <input
                    type="number"
                    min="0.6"
                    step="0.1"
                  value={safeNum(config3D.roomDoorWidth, 1)}
                    onChange={(e) => setConfig3D({ ...config3D, roomDoorWidth: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                    disabled={!config3D.roomDoorEnabled}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Hauteur porte (m)</label>
                  <input
                    type="number"
                    min="1.8"
                    step="0.1"
                  value={safeNum(config3D.roomDoorHeight, 2.1)}
                    onChange={(e) => setConfig3D({ ...config3D, roomDoorHeight: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                    disabled={!config3D.roomDoorEnabled}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Décalage sur le mur (m)</label>
                  <input
                    type="number"
                    step="0.1"
                  value={safeNum(config3D.roomDoorOffset, 0)}
                    onChange={(e) => setConfig3D({ ...config3D, roomDoorOffset: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                    disabled={!config3D.roomDoorEnabled}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Ouverture (degrés)</label>
                  <input
                    type="number"
                    min="0"
                    max="150"
                    step="5"
                  value={safeNum(config3D.roomDoorOpenAngle, 60)}
                    onChange={(e) => setConfig3D({ ...config3D, roomDoorOpenAngle: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                    disabled={!config3D.roomDoorEnabled}
                  />
                </div>
              </div>
            </div>
            
            {/* Éclairage */}
            <div className="space-y-4">
              <h4 className="font-semibold text-surface-900">Éclairage</h4>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Intensité lumière ambiante: {safeNum(config3D.ambientLightIntensity, 0.5).toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={safeNum(config3D.ambientLightIntensity, 0.5)}
                  onChange={(e) => setConfig3D({ ...config3D, ambientLightIntensity: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Intensité lumière directionnelle: {safeNum(config3D.directionalLightIntensity, 1).toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={safeNum(config3D.directionalLightIntensity, 1)}
                  onChange={(e) => setConfig3D({ ...config3D, directionalLightIntensity: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="pt-4 flex gap-3">
              <button
                onClick={async () => {
                  await archive3DConfigService.saveConfig(config3D);
                  alert('Configuration 3D enregistrée !');
                }}
                className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all shadow-lg flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                Enregistrer
              </button>
              <button
                onClick={async () => {
                  await archive3DConfigService.resetConfig();
                  setConfig3D(archive3DConfigService.getConfig());
                  alert('Configuration réinitialisée !');
                }}
                className="px-6 py-3 text-sm font-semibold text-surface-700 bg-surface-100 border-2 border-surface-200 rounded-xl hover:bg-surface-200 transition-all flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faRedo} className="w-4 h-4" />
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenu: Paramètres */}
      {activeTab === 'parametres' && parametres && (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-surface-100 bg-gradient-to-r from-surface-50 to-white">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-500 to-gray-600 flex items-center justify-center">
                <FontAwesomeIcon icon={faCog} className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-surface-900 text-lg">Paramètres d'archivage</h3>
                <p className="text-sm text-surface-500">Configurez les règles de gestion</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-6 max-w-lg">
            <div>
              <label className="block text-sm font-semibold text-surface-700 mb-2">
                Durée de conservation par défaut (années)
              </label>
              <input
                type="number"
                value={parametres.dureeConservationDefaut}
                onChange={(e) => setParametres({ ...parametres, dureeConservationDefaut: parseInt(e.target.value) || 10 })}
                className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                min="1"
                max="100"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-surface-700 mb-2">
                Alerte destruction (jours avant)
              </label>
              <input
                type="number"
                value={parametres.alerteDestructionJoursAvant}
                onChange={(e) => setParametres({ ...parametres, alerteDestructionJoursAvant: parseInt(e.target.value) || 30 })}
                className="w-full px-4 py-3 bg-surface-50 border-2 border-surface-200 rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                min="1"
              />
            </div>
            
            <label className="flex items-center gap-4 p-4 bg-surface-50 border-2 border-surface-200 rounded-xl cursor-pointer hover:border-primary-300 transition-colors">
              <input
                type="checkbox"
                id="alerteBoitePleine"
                checked={parametres.alerteBoitePleine}
                onChange={(e) => setParametres({ ...parametres, alerteBoitePleine: e.target.checked })}
                className="sr-only peer"
              />
              <div className="relative w-14 h-8 bg-surface-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-md peer-checked:bg-primary-500" />
              <span className="text-sm font-semibold text-surface-700">
                Alerte quand une {getDenom(4).nomSingulier.toLowerCase()} est pleine
              </span>
            </label>
            
            <div className="pt-4">
              <button
                onClick={handleSaveParametres}
                className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-secondary-500 rounded-xl hover:from-primary-600 hover:to-secondary-600 transition-all shadow-lg flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                Enregistrer les paramètres
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionEnvironnementArchivage;

