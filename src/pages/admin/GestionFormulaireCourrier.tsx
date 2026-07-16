import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { SensCourrier, TypeCourrier } from '../../types';
import {
  formulaireCourrierService,
  ExtraFieldConfig,
  ExtraFieldsBySensAndType,
  SectionConfig,
  ColumnConfig,
  FormStructure,
  URGENCY_DEFAULT_OPTIONS,
} from '../../services/formulaireCourrierService';
import { laravelApiService } from '../../services/laravelApiService';
import { MaterialDateTimeField } from '../../components/MaterialDateTimeField';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEnvelope,
  faEnvelopeOpen,
  faSave,
  faGripVertical,
  faTrash,
  faEdit,
  faTextWidth,
  faAlignLeft,
  faCalendar,
  faCheckSquare,
  faList,
  faToggleOn,
  faFileUpload,
  faLink,
  faPhone,
  faAt,
  faHashtag,
  faBars,
  faTimes,
  faPlus,
  faColumns,
  faEye,
  faEyeSlash,
  faUser,
  faBuilding,
  faFile,
  faFileAlt,
  faClock,
  faMapMarkerAlt,
  faGlobe,
  faTag,
  faInfoCircle,
  faQuestionCircle,
  faExclamationCircle,
  faExclamationTriangle,
  faCheckCircle,
  faSync,
  faDownload,
  faStar,
  faHeart,
  faFlag,
  faBookmark,
  faBell,
  faCog,
  faKey,
  faLock,
  faUnlock,
  faSearch,
  faFilter,
  faHome,
  faCar,
  faPlane,
  faTrain,
  faShip,
  faBicycle,
  faMotorcycle,
  faBus,
  faTaxi,
  faTruck,
  faMoneyBill,
  faCreditCard,
  faWallet,
  faChartLine,
  faTable,
  faImage,
  faVideo,
  faMusic,
  faFilm,
  faGamepad,
  faShield,
  faGem,
  faCrown,
  faTrophy,
  faMedal,
  faAward,
  faCertificate,
  faGraduationCap,
  faBook,
  faNewspaper,
  faPrint,
  faUpload,
  faShare,
  faPaperclip,
  faFolder,
  faFolderOpen,
  faDatabase,
  faServer,
  faWifi,
  faBatteryFull,
  faPlug,
  faLightbulb,
  faFire,
  faWater,
  faRecycle,
  faArchive,
  faBox,
  faBoxOpen,
  faGift,
  faShoppingCart,
  faStore,
  faBriefcase,
  faSuitcase,
  faCoins,
  faDollarSign,
  faEuroSign,
  faPoundSign,
  faYenSign,
  faRubleSign,
  faSliders,
} from '@fortawesome/free-solid-svg-icons';

// Types de champs disponibles (comme un page builder / Fluent Form)
const AVAILABLE_FIELDS = [
  { type: 'text', label: 'Texte', icon: faTextWidth, color: 'bg-blue-500' },
  { type: 'textarea', label: 'Zone de texte', icon: faAlignLeft, color: 'bg-green-500' },
  { type: 'number', label: 'Nombre', icon: faHashtag, color: 'bg-orange-500' },
  { type: 'slider', label: 'Curseur (slider)', icon: faSliders, color: 'bg-violet-500' },
  { type: 'date', label: 'Date', icon: faCalendar, color: 'bg-purple-600' },
  { type: 'datetime', label: 'Date et heure', icon: faCalendar, color: 'bg-purple-500' },
  { type: 'email', label: 'Email', icon: faAt, color: 'bg-indigo-500' },
  { type: 'phone', label: 'Téléphone', icon: faPhone, color: 'bg-teal-500' },
  { type: 'select', label: 'Liste déroulante', icon: faList, color: 'bg-pink-500' },
  { type: 'checkbox', label: 'Case à cocher', icon: faCheckSquare, color: 'bg-yellow-500' },
  { type: 'radio', label: 'Bouton radio', icon: faToggleOn, color: 'bg-cyan-500' },
  { type: 'file', label: 'Fichier', icon: faFileUpload, color: 'bg-red-500' },
  { type: 'url', label: 'URL', icon: faLink, color: 'bg-amber-500' },
  { type: 'urgency', label: 'Niveau d\'urgence', icon: faExclamationTriangle, color: 'bg-rose-500' },
];

// Liste d'icônes disponibles pour les labels de champs
const AVAILABLE_ICONS = [
  { name: 'textWidth', icon: faTextWidth, label: 'Texte' },
  { name: 'alignLeft', icon: faAlignLeft, label: 'Alignement' },
  { name: 'calendar', icon: faCalendar, label: 'Date' },
  { name: 'at', icon: faAt, label: 'Email' },
  { name: 'hashtag', icon: faHashtag, label: 'Nombre' },
  { name: 'phone', icon: faPhone, label: 'Téléphone' },
  { name: 'list', icon: faList, label: 'Liste' },
  { name: 'checkSquare', icon: faCheckSquare, label: 'Case' },
  { name: 'toggleOn', icon: faToggleOn, label: 'Radio' },
  { name: 'fileUpload', icon: faFileUpload, label: 'Fichier' },
  { name: 'link', icon: faLink, label: 'Lien' },
  { name: 'user', icon: faUser, label: 'Utilisateur' },
  { name: 'building', icon: faBuilding, label: 'Bâtiment' },
  { name: 'file', icon: faFile, label: 'Fichier' },
  { name: 'fileAlt', icon: faFileAlt, label: 'Document' },
  { name: 'clock', icon: faClock, label: 'Horloge' },
  { name: 'mapMarkerAlt', icon: faMapMarkerAlt, label: 'Localisation' },
  { name: 'globe', icon: faGlobe, label: 'Globe' },
  { name: 'tag', icon: faTag, label: 'Tag' },
  { name: 'infoCircle', icon: faInfoCircle, label: 'Info' },
  { name: 'questionCircle', icon: faQuestionCircle, label: 'Question' },
  { name: 'exclamationCircle', icon: faExclamationCircle, label: 'Attention' },
  { name: 'checkCircle', icon: faCheckCircle, label: 'Validation' },
  { name: 'star', icon: faStar, label: 'Étoile' },
  { name: 'heart', icon: faHeart, label: 'Cœur' },
  { name: 'flag', icon: faFlag, label: 'Drapeau' },
  { name: 'bookmark', icon: faBookmark, label: 'Marque-page' },
  { name: 'bell', icon: faBell, label: 'Notification' },
  { name: 'cog', icon: faCog, label: 'Paramètres' },
  { name: 'key', icon: faKey, label: 'Clé' },
  { name: 'lock', icon: faLock, label: 'Verrouillé' },
  { name: 'unlock', icon: faUnlock, label: 'Déverrouillé' },
  { name: 'search', icon: faSearch, label: 'Recherche' },
  { name: 'filter', icon: faFilter, label: 'Filtre' },
  { name: 'home', icon: faHome, label: 'Maison' },
  { name: 'car', icon: faCar, label: 'Voiture' },
  { name: 'plane', icon: faPlane, label: 'Avion' },
  { name: 'train', icon: faTrain, label: 'Train' },
  { name: 'ship', icon: faShip, label: 'Bateau' },
  { name: 'bicycle', icon: faBicycle, label: 'Vélo' },
  { name: 'motorcycle', icon: faMotorcycle, label: 'Moto' },
  { name: 'bus', icon: faBus, label: 'Bus' },
  { name: 'taxi', icon: faTaxi, label: 'Taxi' },
  { name: 'truck', icon: faTruck, label: 'Camion' },
  { name: 'moneyBill', icon: faMoneyBill, label: 'Argent' },
  { name: 'creditCard', icon: faCreditCard, label: 'Carte' },
  { name: 'wallet', icon: faWallet, label: 'Portefeuille' },
  { name: 'chartLine', icon: faChartLine, label: 'Graphique' },
  { name: 'table', icon: faTable, label: 'Tableau' },
  { name: 'image', icon: faImage, label: 'Image' },
  { name: 'video', icon: faVideo, label: 'Vidéo' },
  { name: 'music', icon: faMusic, label: 'Musique' },
  { name: 'film', icon: faFilm, label: 'Film' },
  { name: 'gamepad', icon: faGamepad, label: 'Jeu' },
  { name: 'shield', icon: faShield, label: 'Bouclier' },
  { name: 'gem', icon: faGem, label: 'Gemme' },
  { name: 'crown', icon: faCrown, label: 'Couronne' },
  { name: 'trophy', icon: faTrophy, label: 'Trophée' },
  { name: 'medal', icon: faMedal, label: 'Médaille' },
  { name: 'award', icon: faAward, label: 'Récompense' },
  { name: 'certificate', icon: faCertificate, label: 'Certificat' },
  { name: 'graduationCap', icon: faGraduationCap, label: 'Diplôme' },
  { name: 'book', icon: faBook, label: 'Livre' },
  { name: 'newspaper', icon: faNewspaper, label: 'Journal' },
  { name: 'print', icon: faPrint, label: 'Imprimer' },
  { name: 'download', icon: faDownload, label: 'Télécharger' },
  { name: 'upload', icon: faUpload, label: 'Envoyer' },
  { name: 'share', icon: faShare, label: 'Partager' },
  { name: 'paperclip', icon: faPaperclip, label: 'Pièce jointe' },
  { name: 'folder', icon: faFolder, label: 'Dossier' },
  { name: 'folderOpen', icon: faFolderOpen, label: 'Dossier ouvert' },
  { name: 'database', icon: faDatabase, label: 'Base de données' },
  { name: 'server', icon: faServer, label: 'Serveur' },
  { name: 'wifi', icon: faWifi, label: 'WiFi' },
  { name: 'batteryFull', icon: faBatteryFull, label: 'Batterie' },
  { name: 'plug', icon: faPlug, label: 'Prise' },
  { name: 'lightbulb', icon: faLightbulb, label: 'Ampoule' },
  { name: 'fire', icon: faFire, label: 'Feu' },
  { name: 'water', icon: faWater, label: 'Eau' },
  { name: 'recycle', icon: faRecycle, label: 'Recyclage' },
  { name: 'archive', icon: faArchive, label: 'Archive' },
  { name: 'box', icon: faBox, label: 'Boîte' },
  { name: 'boxOpen', icon: faBoxOpen, label: 'Boîte ouverte' },
  { name: 'gift', icon: faGift, label: 'Cadeau' },
  { name: 'shoppingCart', icon: faShoppingCart, label: 'Panier' },
  { name: 'store', icon: faStore, label: 'Magasin' },
  { name: 'briefcase', icon: faBriefcase, label: 'Porte-documents' },
  { name: 'suitcase', icon: faSuitcase, label: 'Valise' },
  { name: 'coins', icon: faCoins, label: 'Pièces' },
  { name: 'dollarSign', icon: faDollarSign, label: 'Dollar' },
  { name: 'euroSign', icon: faEuroSign, label: 'Euro' },
  { name: 'poundSign', icon: faPoundSign, label: 'Livre' },
  { name: 'yenSign', icon: faYenSign, label: 'Yen' },
  { name: 'rubleSign', icon: faRubleSign, label: 'Rouble' },
];

// Helper pour obtenir l'icône à partir du nom
const getIconByName = (iconName?: string) => {
  if (!iconName) return null;
  const iconOption = AVAILABLE_ICONS.find(icon => icon.name === iconName);
  return iconOption ? iconOption.icon : null;
};

// Champs de base (non modifiables)
const CORE_FIELDS = [
  { name: 'type', label: 'Type de courrier', required: true },
  { name: 'dateReception', label: 'Date de réception', required: true },
  { name: 'expediteur', label: 'Expéditeur', required: true },
  { name: 'destinataire', label: 'Destinataire', required: true },
  { name: 'objet', label: 'Objet', required: true },
];

// Portal pour le drawer de propriétés (plein écran, au niveau de document.body)
const FormBuilderPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  ReactDOM.createPortal(children, document.body);

// Helper pour obtenir la classe Tailwind col-span correspondante
const getColSpanClass = (width: number): string => {
  const colMap: Record<number, string> = {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
    5: 'col-span-5',
    6: 'col-span-6',
    7: 'col-span-7',
    8: 'col-span-8',
    9: 'col-span-9',
    10: 'col-span-10',
    11: 'col-span-11',
    12: 'col-span-12',
  };
  return colMap[width] || 'col-span-6';
};

const GestionFormulaireCourrier: React.FC = () => {
  const [selectedSens, setSelectedSens] = useState<SensCourrier>(SensCourrier.ENTRANT);
  const [selectedType, setSelectedType] = useState<TypeCourrier>(TypeCourrier.EXTERNE);
  const [config, setConfig] = useState<ExtraFieldsBySensAndType>(formulaireCourrierService.getConfig());
  const [sections, setSections] = useState<FormStructure>([]);
  const [selectedItem, setSelectedItem] = useState<{ type: 'section' | 'column' | 'field'; id: string; sectionId?: string; columnId?: string } | null>(null);
  const [showPropertiesDrawer, setShowPropertiesDrawer] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [draggedOverTarget, setDraggedOverTarget] = useState<{ sectionId?: string; columnId?: string } | null>(null);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [draggedOverFieldId, setDraggedOverFieldId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingFromLaravel, setLoadingFromLaravel] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTarget, setCopyTarget] = useState<{ sens: SensCourrier; type: TypeCourrier } | null>(null);
  const [copying, setCopying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });

  const loadSections = useCallback(() => {
    const configData = formulaireCourrierService.getConfig();
    const sectionsData = configData[selectedSens]?.[selectedType] || [];
    
    // Migration et validation : s'assurer que toutes les sections ont des colonnes
    const validatedSections = sectionsData.map((section: any) => {
      // Si c'est une ancienne structure (champ plat) ou si columns n'existe pas
      if (!section.columns || !Array.isArray(section.columns)) {
        // Créer une section avec une colonne par défaut contenant les champs existants
        return {
          id: section.id || `section_${Date.now()}_${Math.random()}`,
          type: 'section' as const,
          label: section.label || 'Section',
          placeholder: section.placeholder || '',
          columns: [
            {
              id: `col_${Date.now()}_1`,
              width: 12,
              fields: section.fields || (section.type !== 'section' ? [section] : []),
            },
          ],
        };
      }
      // S'assurer que chaque colonne a un id et des fields, et que chaque champ a un id
      return {
        ...section,
        id: section.id || `section_${Date.now()}_${Math.random()}`,
        columns: section.columns.map((col: any, idx: number) => ({
          id: col.id || `col_${Date.now()}_${idx}_${Math.random()}`,
          width: col.width || 6,
          fields: (col.fields || []).map((field: any, fieldIdx: number) => ({
            ...field,
            id: field.id || `field_${Date.now()}_${idx}_${fieldIdx}_${Math.random()}`,
          })),
        })),
      };
    });
    
    setSections(validatedSections);
    setSelectedItem(null);
  }, [selectedSens, selectedType]);

  // Charger la config au montage : API Laravel uniquement si configurée (pas Firebase), sinon localStorage
  useEffect(() => {
    const loadInitial = async () => {
      setLoadError(null);
      const source = laravelApiService.isConfigured() ? 'API Laravel' : 'localStorage';
      if (import.meta.env.DEV) {
        console.log(`Chargement de la configuration formulaire depuis ${source}...`);
      }
      try {
        const configData = await formulaireCourrierService.getConfigAsync();
        setConfig(configData);
        loadSections();
        if (import.meta.env.DEV) {
          console.log(`Configuration formulaire chargée depuis ${source}:`, configData);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`Chargement config formulaire (${source}) échoué:`, msg);
        setLoadError(msg);
        setConfig(formulaireCourrierService.getConfig());
        loadSections();
      }
    };
    loadInitial();
  }, [loadSections]);

  useEffect(() => {
    const configData = formulaireCourrierService.getConfig();
    setConfig(configData);
    loadSections();
  }, [selectedSens, selectedType, loadSections]);

  const handleAddSection = () => {
    const newSection: SectionConfig = {
      id: `section_${Date.now()}`,
      type: 'section',
      label: `Nouvelle section ${sections.length + 1}`,
      placeholder: '',
      columns: [
        { id: `col_${Date.now()}_1`, width: 6, fields: [] },
        { id: `col_${Date.now()}_2`, width: 6, fields: [] },
      ],
    };
    const updatedSections = [...sections, newSection];
    updateSections(updatedSections);
    setSelectedItem({ type: 'section', id: newSection.id });
    setShowPropertiesDrawer(true);
  };

  const handleAddColumn = (sectionId: string) => {
    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        const newColumn: ColumnConfig = {
          id: `col_${Date.now()}`,
          width: 6,
          fields: [],
        };
        // Ajuster les largeurs pour que la somme reste à 12
        const totalWidth = section.columns.reduce((sum, col) => sum + col.width, 0);
        const newTotal = totalWidth + newColumn.width;
        if (newTotal > 12) {
          // Réduire proportionnellement les autres colonnes
          const factor = 12 / newTotal;
          return {
            ...section,
            columns: [
              ...section.columns.map((col) => ({ ...col, width: Math.floor(col.width * factor) })),
              newColumn,
            ],
          };
        }
        return {
          ...section,
          columns: [...section.columns, newColumn],
        };
      }
      return section;
    });
    updateSections(updatedSections);
  };

  const handleAddField = (fieldType: string, sectionId: string, columnId: string) => {
    const newField: ExtraFieldConfig = {
      id: `field_${Date.now()}`,
      name: fieldType === 'urgency' ? 'niveau_urgence' : fieldType === 'slider' ? 'valeur_curseur' : `champ_${Date.now()}`,
      label: `Nouveau ${AVAILABLE_FIELDS.find((f) => f.type === fieldType)?.label || 'champ'}`,
      type: fieldType as any,
      required: false,
      placeholder: '',
      ...(fieldType === 'select' || fieldType === 'radio' || fieldType === 'checkbox'
        ? { options: ['Option 1', 'Option 2'] }
        : {}),
      ...(fieldType === 'urgency' ? { options: [...URGENCY_DEFAULT_OPTIONS] } : {}),
      ...(fieldType === 'slider' ? { min: 0, max: 100, step: 1 } : {}),
    };

    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        return {
          ...section,
          columns: section.columns.map((col) => {
            if (col.id === columnId) {
              return {
                ...col,
                fields: [...col.fields, newField],
              };
            }
            return col;
          }),
        };
      }
      return section;
    });
    updateSections(updatedSections);
    setSelectedItem({ type: 'field', id: newField.id, sectionId, columnId });
    setShowPropertiesDrawer(true);
  };

  const handleFieldDragStart = (e: React.DragEvent, fieldType: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    setDraggedItem(`type:${fieldType}`);
  };

  const handleFieldDrop = (e: React.DragEvent, sectionId: string, columnId: string) => {
    e.preventDefault();
    if (!draggedItem || !draggedItem.startsWith('type:')) return;

    const fieldType = draggedItem.replace('type:', '');
    handleAddField(fieldType, sectionId, columnId);
    setDraggedItem(null);
    setDraggedOverTarget(null);
  };

  const handleFieldDragOver = (e: React.DragEvent, sectionId: string, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDraggedOverTarget({ sectionId, columnId });
  };

  const handleFieldDragEnd = () => {
    setDraggedItem(null);
    setDraggedOverTarget(null);
  };

  // Handlers pour le drag-and-drop des champs existants (réorganisation)
  const handleExistingFieldDragStart = (e: React.DragEvent, fieldId: string, sectionId: string, columnId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ fieldId, sectionId, columnId }));
    setDraggedFieldId(fieldId);
    setIsReordering(true);
    // Empêcher la propagation pour éviter les conflits avec le drag de la colonne
    e.stopPropagation();
  };

  const handleExistingFieldDragOver = (e: React.DragEvent, fieldId: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Permettre à la fois 'move' (échange) et 'copy' (insertion)
    e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
    if (draggedFieldId && draggedFieldId !== fieldId) {
      setDraggedOverFieldId(fieldId);
    }
  };

  const handleExistingFieldDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleExistingFieldDrop = (e: React.DragEvent, targetFieldId: string | null, sectionId: string, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedFieldId || (targetFieldId && draggedFieldId === targetFieldId)) {
      setDraggedFieldId(null);
      setDraggedOverFieldId(null);
      setIsReordering(false);
      return;
    }

    // Récupérer les données du drag
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData) {
      setDraggedFieldId(null);
      setDraggedOverFieldId(null);
      setIsReordering(false);
      return;
    }

    let sourceSectionId: string;
    let sourceColumnId: string;
    try {
      const parsed = JSON.parse(dragData);
      sourceSectionId = parsed.sectionId;
      sourceColumnId = parsed.columnId;
    } catch {
        setDraggedFieldId(null);
        setDraggedOverFieldId(null);
        setIsReordering(false);
        return;
      }

    // Trouver les champs source et cible
    const sourceSection = sections.find((s) => s.id === sourceSectionId);
    const sourceColumn = sourceSection?.columns.find((c) => c.id === sourceColumnId);
    const draggedField = sourceColumn?.fields.find((f) => f.id === draggedFieldId);

    const targetSection = sections.find((s) => s.id === sectionId);
    const targetColumn = targetSection?.columns.find((c) => c.id === columnId);
    const targetField = targetFieldId ? targetColumn?.fields.find((f) => f.id === targetFieldId) : null;

    if (!draggedField) {
      setDraggedFieldId(null);
      setDraggedOverFieldId(null);
      setIsReordering(false);
      return;
    }

    // Si Ctrl/Cmd est pressé, on insère (copie) au lieu de déplacer
    const isInsertMode = e.ctrlKey || e.metaKey;

    // Si les deux champs sont dans la même colonne et qu'il y a un champ cible
    if (sourceSectionId === sectionId && sourceColumnId === columnId && targetFieldId) {
    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        return {
          ...section,
          columns: section.columns.map((col) => {
            if (col.id === columnId) {
              const fields = [...col.fields];
              const draggedIndex = fields.findIndex((f) => f.id === draggedFieldId);
              const targetIndex = fields.findIndex((f) => f.id === targetFieldId);

                if (draggedIndex !== -1 && targetIndex !== -1) {
                  if (isInsertMode) {
                    // Insérer une copie du champ à la position cible
                    const fieldCopy = { ...draggedField, id: `field_${Date.now()}_${Math.random()}` };
                    fields.splice(targetIndex, 0, fieldCopy);
                  } else {
                    // Échanger les deux champs
                    [fields[draggedIndex], fields[targetIndex]] = [fields[targetIndex], fields[draggedIndex]];
                  }
                }

                return { ...col, fields };
              }
              return col;
            }),
          };
        }
        return section;
      });

      updateSections(updatedSections);
      setDraggedFieldId(null);
      setDraggedOverFieldId(null);
      setIsReordering(false);
      return;
    }

    // Si les champs sont dans des colonnes différentes ou si on dépose sur une zone vide
    if (isInsertMode) {
      // Mode insertion : copier le champ à la position cible (sans supprimer l'original)
      const updatedSections = sections.map((section) => {
        if (section.id === sectionId) {
          return {
            ...section,
            columns: section.columns.map((col) => {
              if (col.id === columnId) {
                const fields = [...col.fields];
                const fieldCopy = { ...draggedField, id: `field_${Date.now()}_${Math.random()}` };
                if (targetFieldId) {
                  const targetIndex = fields.findIndex((f) => f.id === targetFieldId);
                  if (targetIndex !== -1) {
                    fields.splice(targetIndex, 0, fieldCopy);
                  } else {
                    fields.push(fieldCopy);
              }
                } else {
                  // Ajouter à la fin si pas de champ cible
                  fields.push(fieldCopy);
                }
                return { ...col, fields };
            }
            return col;
          }),
        };
      }
      return section;
    });

    updateSections(updatedSections);
    } else {
      // Mode déplacement par défaut : déplacer le champ à la nouvelle position
      // Créer une copie profonde du champ pour éviter les problèmes de référence
      const fieldToMove = { ...draggedField };
      
      // Si la source et la destination sont dans la même section, il faut gérer différemment
      if (sourceSectionId === sectionId) {
        // Même section : modifier la section en une seule fois
        const updatedSections = sections.map((section) => {
          if (section.id === sectionId) {
            return {
              ...section,
              columns: section.columns.map((col) => {
                if (col.id === sourceColumnId && col.id === columnId) {
                  // Même colonne : déjà géré plus haut
                  return col;
                } else if (col.id === sourceColumnId) {
                  // Colonne source : retirer le champ
                  return { ...col, fields: col.fields.filter((f) => f.id !== draggedFieldId) };
                } else if (col.id === columnId) {
                  // Colonne destination : ajouter le champ
                  const fields = [...col.fields];
                  if (targetFieldId) {
                    const targetIndex = fields.findIndex((f) => f.id === targetFieldId);
                    if (targetIndex !== -1) {
                      fields.splice(targetIndex, 0, fieldToMove);
                    } else {
                      fields.push(fieldToMove);
                    }
                  } else {
                    fields.push(fieldToMove);
                  }
                  return { ...col, fields };
                }
                return col;
              }),
            };
          }
          return section;
        });
        updateSections(updatedSections);
      } else {
        // Sections différentes : traiter séparément
        const updatedSections = sections.map((section) => {
          if (section.id === sourceSectionId) {
            // Retirer le champ de la colonne source
            return {
              ...section,
              columns: section.columns.map((col) => {
                if (col.id === sourceColumnId) {
                  return { ...col, fields: col.fields.filter((f) => f.id !== draggedFieldId) };
                }
                return col;
              }),
            };
          }
          if (section.id === sectionId) {
            // Insérer le champ à la position cible dans la colonne de destination
            return {
              ...section,
              columns: section.columns.map((col) => {
                if (col.id === columnId) {
                  const fields = [...col.fields];
                  if (targetFieldId) {
                    const targetIndex = fields.findIndex((f) => f.id === targetFieldId);
                    if (targetIndex !== -1) {
                      // Insérer avant le champ cible
                      fields.splice(targetIndex, 0, fieldToMove);
                    } else {
                      // Ajouter à la fin si le champ cible n'est pas trouvé
                      fields.push(fieldToMove);
                    }
                  } else {
                    // Ajouter à la fin si pas de champ cible (drop sur zone vide)
                    fields.push(fieldToMove);
                  }
                  return { ...col, fields };
                }
                return col;
              }),
            };
          }
          return section;
        });
        updateSections(updatedSections);
      }
    }

    setDraggedFieldId(null);
    setDraggedOverFieldId(null);
    setIsReordering(false);
  };

  const handleExistingFieldDragEnd = () => {
    setDraggedFieldId(null);
    setDraggedOverFieldId(null);
    setIsReordering(false);
  };

  const updateSections = async (updatedSections: FormStructure) => {
    setSections(updatedSections);
    try {
      console.log('💾 Mise à jour de la configuration pour le sens/type:', selectedSens, selectedType);
      const newConfig = await formulaireCourrierService.updateConfigForType(selectedSens, selectedType, updatedSections);
      console.log('✅ Configuration mise à jour avec succès:', newConfig);
      setConfig(newConfig);
    } catch (error: any) {
      console.error('❌ Erreur lors de la mise à jour de la configuration:', error);
      // Afficher une alerte pour informer l'utilisateur
      alert(`Erreur lors de la sauvegarde automatique : ${error?.message || 'Une erreur est survenue'}\n\nVeuillez utiliser le bouton "Enregistrer" pour sauvegarder manuellement.`);
    }
  };

  // Copier les champs actuels vers une combinaison sens+type choisie
  const handleCopyTo = async () => {
    if (!copyTarget) return;
    if (sections.length === 0) {
      setSaveMessage({ type: 'error', text: 'Aucun champ à copier. Configurez d\'abord des champs dans cet onglet.' });
      setTimeout(() => setSaveMessage({ type: null, text: '' }), 4000);
      setShowCopyModal(false);
      return;
    }
    setCopying(true);
    try {
      const cloned: FormStructure = JSON.parse(JSON.stringify(sections));
      cloned.forEach(section => {
        section.id = `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        section.columns.forEach(column => {
          column.id = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          column.fields.forEach(field => {
            field.id = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          });
        });
      });
      const newConfig = await formulaireCourrierService.updateConfigForType(copyTarget.sens, copyTarget.type, cloned);
      setConfig(newConfig);
      const targetSensLabel = copyTarget.sens === SensCourrier.ENTRANT ? 'Entrant' : 'Sortant';
      const targetTypeLabel = copyTarget.type === TypeCourrier.EXTERNE ? 'Externe' : 'Interne';
      setSaveMessage({ type: 'success', text: `✅ Champs copiés vers "${targetTypeLabel} (${targetSensLabel})" avec succès.` });
      setTimeout(() => setSaveMessage({ type: null, text: '' }), 4000);
    } catch (error: any) {
      setSaveMessage({ type: 'error', text: `Erreur lors de la copie : ${error?.message || 'Une erreur est survenue.'}` });
      setTimeout(() => setSaveMessage({ type: null, text: '' }), 5000);
    } finally {
      setCopying(false);
      setShowCopyModal(false);
      setCopyTarget(null);
    }
  };

  // Fonction pour importer les champs d'un autre type (ou copier les actuels vers l'autre si l'autre est vide)
  const handleImportFromOtherType = async () => {
    const otherType = selectedType === TypeCourrier.EXTERNE ? TypeCourrier.INTERNE : TypeCourrier.EXTERNE;
    const otherConfig = config[selectedSens]?.[otherType] || [];
    const sensLabel = selectedSens === SensCourrier.ENTRANT ? 'Entrant' : 'Sortant';
    const otherTypeLabel = otherType === TypeCourrier.EXTERNE ? 'Externe' : 'Interne';
    const currentTypeLabel = selectedType === TypeCourrier.EXTERNE ? 'Externe' : 'Interne';

    if (otherConfig.length === 0) {
      // L'autre type (même sens) n'a aucun champ : proposer de copier les champs actuels vers l'autre type
      const currentSections = sections;
      if (currentSections.length === 0) {
        const otherSensLabel = selectedSens === SensCourrier.ENTRANT ? 'Sortant' : 'Entrant';
        alert(
          `Aucun champ configuré pour le type "${otherTypeLabel}" (${sensLabel}).\n\n` +
          `• Soit configurez des champs pour "${currentTypeLabel} (${sensLabel})" ici, puis réessayez pour les copier vers ${otherTypeLabel}.\n` +
          `• Soit si vous avez déjà configuré ${otherSensLabel}, utilisez le bouton "Importer depuis ${otherSensLabel}" pour recopier ici.`
        );
        return;
      }
      const shouldCopyReverse = window.confirm(
        `Aucun champ configuré pour le type ${otherTypeLabel} (${sensLabel}).\n\n` +
        `Voulez-vous copier les champs actuels de "${currentTypeLabel} (${sensLabel})" vers "${otherTypeLabel} (${sensLabel})" ?\n\n` +
        `Cela remplira la configuration de ${otherTypeLabel} avec les mêmes champs.`
      );
      if (!shouldCopyReverse) return;
      try {
        const clonedSections: FormStructure = JSON.parse(JSON.stringify(currentSections));
        clonedSections.forEach(section => {
          section.id = `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          section.columns.forEach(column => {
            column.id = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            column.fields.forEach(field => {
              field.id = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            });
          });
        });
        const newConfig = await formulaireCourrierService.updateConfigForType(selectedSens, otherType, clonedSections);
        setConfig(newConfig);
        alert(`Champs copiés avec succès vers le type "${otherTypeLabel}" (${sensLabel}). Vous pouvez passer à l'onglet "${otherTypeLabel}" pour les modifier.`);
      } catch (error: any) {
        console.error('Erreur lors de la copie vers l\'autre type:', error);
        alert(`Erreur : ${error?.message || 'Une erreur est survenue.'}`);
      }
      return;
    }

    const shouldImport = window.confirm(
      `Voulez-vous importer tous les champs du type "${otherTypeLabel}" (${sensLabel}) vers "${currentTypeLabel}" (${sensLabel}) ?\n\n` +
      `Cela remplacera la configuration actuelle.`
    );

    if (shouldImport) {
      const importedSections: FormStructure = JSON.parse(JSON.stringify(otherConfig));
      importedSections.forEach(section => {
        section.id = `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        section.columns.forEach(column => {
          column.id = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          column.fields.forEach(field => {
            field.id = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          });
        });
      });
      await updateSections(importedSections);
      alert(`Champs importés avec succès depuis le type "${otherTypeLabel}" (${sensLabel}).`);
    }
  };

  // Importer la config du même type (Externe/Interne) mais de l'autre sens (Entrant ↔ Sortant)
  const handleImportFromOtherSens = async () => {
    const otherSens = selectedSens === SensCourrier.ENTRANT ? SensCourrier.SORTANT : SensCourrier.ENTRANT;
    const sourceSections = config[otherSens]?.[selectedType] || [];
    const sensLabel = selectedSens === SensCourrier.ENTRANT ? 'Entrant' : 'Sortant';
    const otherSensLabel = otherSens === SensCourrier.ENTRANT ? 'Entrant' : 'Sortant';
    const typeLabel = selectedType === TypeCourrier.EXTERNE ? 'Externe' : 'Interne';

    if (sourceSections.length === 0) {
      alert(
        `Aucun champ configuré pour "${typeLabel} (${otherSensLabel})".\n\n` +
        `Configurez d'abord des champs pour Entrant ou Sortant dans l'onglet "${typeLabel}", puis utilisez "Importer depuis ${otherSensLabel}" pour les recopier ici.`
      );
      return;
    }

    const shouldImport = window.confirm(
      `Voulez-vous importer les champs de "${typeLabel} (${otherSensLabel})" vers "${typeLabel} (${sensLabel})" ?\n\nCela remplacera la configuration actuelle de cet onglet.`
    );
    if (!shouldImport) return;

    const importedSections: FormStructure = JSON.parse(JSON.stringify(sourceSections));
    importedSections.forEach(section => {
      section.id = `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      section.columns.forEach(column => {
        column.id = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        column.fields.forEach(field => {
          field.id = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        });
      });
    });
    await updateSections(importedSections);
    alert(`Champs importés avec succès depuis ${otherSensLabel} vers ${sensLabel} (${typeLabel}).`);
  };

  const handleSectionChange = (sectionId: string, updates: Partial<SectionConfig>) => {
    const updatedSections = sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s));
    updateSections(updatedSections).catch(console.error);
    if (selectedItem?.id === sectionId) {
      const updated = sections.find((s) => s.id === sectionId);
      if (updated) setSelectedItem({ type: 'section', id: sectionId });
    }
  };

  const handleColumnChange = (sectionId: string, columnId: string, updates: Partial<ColumnConfig>) => {
    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        return {
          ...section,
          columns: section.columns.map((col) => (col.id === columnId ? { ...col, ...updates } : col)),
        };
      }
      return section;
    });
    updateSections(updatedSections).catch(console.error);
  };

  const handleFieldChange = (sectionId: string, columnId: string, fieldId: string, updates: Partial<ExtraFieldConfig>) => {
    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        return {
          ...section,
          columns: section.columns.map((col) => {
            if (col.id === columnId) {
              return {
                ...col,
                fields: col.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
              };
            }
            return col;
          }),
        };
      }
      return section;
    });
    updateSections(updatedSections).catch(console.error);
    if (selectedItem?.id === fieldId) {
      const field = sections
        .find((s) => s.id === sectionId)
        ?.columns.find((c) => c.id === columnId)
        ?.fields.find((f) => f.id === fieldId);
      if (field) setSelectedItem({ type: 'field', id: fieldId, sectionId, columnId });
    }
  };

  const handleDeleteSection = (sectionId: string) => {
    const updatedSections = sections.filter((s) => s.id !== sectionId);
    updateSections(updatedSections);
    if (selectedItem?.id === sectionId) {
      setSelectedItem(null);
      setShowPropertiesDrawer(false);
    }
  };

  const handleDeleteColumn = (sectionId: string, columnId: string) => {
    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        const filteredColumns = section.columns.filter((col) => col.id !== columnId);
        // Redistribuer les largeurs si nécessaire
        if (filteredColumns.length > 0) {
          const totalWidth = filteredColumns.reduce((sum, col) => sum + col.width, 0);
          if (totalWidth < 12) {
            const factor = 12 / totalWidth;
            return {
              ...section,
              columns: filteredColumns.map((col) => ({ ...col, width: Math.floor(col.width * factor) })),
            };
          }
        }
        return { ...section, columns: filteredColumns };
      }
      return section;
    });
    updateSections(updatedSections);
    if (selectedItem?.columnId === columnId) {
      setSelectedItem(null);
      setShowPropertiesDrawer(false);
    }
  };

  const handleDeleteField = (sectionId: string, columnId: string, fieldId: string) => {
    const updatedSections = sections.map((section) => {
      if (section.id === sectionId) {
        return {
          ...section,
          columns: section.columns.map((col) => {
            if (col.id === columnId) {
              return {
                ...col,
                fields: col.fields.filter((f) => f.id !== fieldId),
              };
            }
            return col;
          }),
        };
      }
      return section;
    });
    updateSections(updatedSections);
    if (selectedItem?.id === fieldId) {
      setSelectedItem(null);
      setShowPropertiesDrawer(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage({ type: null, text: '' });
    
    try {
      console.log('💾 Sauvegarde de la configuration...', config);
      
      // Ajouter un timeout de sécurité (30 secondes max)
      const savePromise = formulaireCourrierService.saveConfig(config);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: La sauvegarde a pris trop de temps')), 30000)
      );
      
      await Promise.race([savePromise, timeoutPromise]);
      
      // Mettre à jour le cache local immédiatement
      setConfig(config);
      
      console.log('✅ Configuration sauvegardée avec succès');
      setSaveMessage({ 
        type: 'success', 
        text: '✅ Configuration enregistrée avec succès. Vos modifications ont été sauvegardées.' 
      });
      
      // Masquer le message après 5 secondes (plus long pour une meilleure visibilité)
      setTimeout(() => {
        setSaveMessage({ type: null, text: '' });
      }, 5000);
    } catch (error: any) {
      console.error('❌ Erreur lors de la sauvegarde de la configuration:', error);
      console.error('📋 Erreur originale:', error?.originalError);
      console.error('📋 Code d\'erreur:', error?.code);
      console.error('📋 Détails:', error?.details);
      
      const errorMessage = error?.message || 'Une erreur est survenue';
      
      // Créer un message d'erreur détaillé
      let errorText = errorMessage;
      
      // Ajouter des informations supplémentaires selon le type d'erreur
      if (error?.code === 'permission-denied') {
        errorText = 'Permission refusée.\n\nVérifiez que vous êtes connecté et avez les droits d\'administration.\n\nLes données ont été sauvegardées localement.';
      } else if (error?.code === 'unavailable' || error?.code === 'deadline-exceeded') {
        errorText = 'Connexion au serveur impossible.\n\nVérifiez votre connexion internet et réessayez.\n\nLes données ont été sauvegardées localement.';
      } else if (errorMessage.includes('Timeout')) {
        errorText = 'La sauvegarde a pris trop de temps.\n\nVérifiez votre connexion internet.\n\nLes données ont été sauvegardées localement.';
      } else {
        errorText = `${errorMessage}\n\nLes données ont été sauvegardées localement et seront synchronisées automatiquement.`;
      }
      
      setSaveMessage({ 
        type: 'error', 
        text: errorText
      });
      
      // Masquer le message d'erreur après 7 secondes (plus long pour les erreurs)
      setTimeout(() => {
        setSaveMessage({ type: null, text: '' });
      }, 7000);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadFromLaravel = async () => {
    if (!laravelApiService.isConfigured()) {
      setSaveMessage({ type: 'error', text: 'API Laravel non configurée. Définissez VITE_LARAVEL_API_URL dans .env.' });
      setTimeout(() => setSaveMessage({ type: null, text: '' }), 5000);
      return;
    }
    setLoadingFromLaravel(true);
    setLoadError(null);
    setSaveMessage({ type: null, text: '' });
    try {
      const configData = await formulaireCourrierService.loadFromLaravelOnly();
      setConfig(configData);
      loadSections();
      setSaveMessage({ type: 'success', text: 'Configuration chargée depuis Laravel.' });
      setTimeout(() => setSaveMessage({ type: null, text: '' }), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      setSaveMessage({ type: 'error', text: `Chargement Laravel : ${msg}` });
      setTimeout(() => setSaveMessage({ type: null, text: '' }), 7000);
    } finally {
      setLoadingFromLaravel(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!window.confirm('Cela va remplacer TOUTE la configuration actuelle par la configuration par défaut.\n\nLes champs sortants (annexe + date de signature) seront ajoutés automatiquement.\n\nConfirmer ?')) {
      return;
    }
    setResetting(true);
    try {
      const configData = await formulaireCourrierService.resetToDefaults();
      setConfig(configData);
      loadSections();
      setSaveMessage({ type: 'success', text: '✅ Configuration réinitialisée avec succès. Les champs sortants ont été ajoutés.' });
      setTimeout(() => setSaveMessage({ type: null, text: '' }), 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveMessage({ type: 'error', text: `Réinitialisation : ${msg}` });
      setTimeout(() => setSaveMessage({ type: null, text: '' }), 7000);
    } finally {
      setResetting(false);
    }
  };

  const getSelectedSection = () => {
    if (!selectedItem || selectedItem.type !== 'section') return null;
    return sections.find((s) => s.id === selectedItem.id);
  };

  const getSelectedColumn = () => {
    if (!selectedItem || selectedItem.type !== 'column') return null;
    const section = sections.find((s) => s.id === selectedItem.sectionId);
    // Pour une colonne, l'ID peut être dans id ou columnId
    return section?.columns.find((c) => c.id === (selectedItem.columnId || selectedItem.id));
  };

  const getSelectedField = () => {
    if (!selectedItem || selectedItem.type !== 'field') return null;
    const section = sections.find((s) => s.id === selectedItem.sectionId);
    const column = section?.columns.find((c) => c.id === selectedItem.columnId);
    return column?.fields.find((f) => f.id === selectedItem.id);
  };

  // Labels utilitaires
  const sensLabel = (s: SensCourrier) => s === SensCourrier.ENTRANT ? 'Entrant' : 'Sortant';
  const typeLabel = (t: TypeCourrier) => t === TypeCourrier.EXTERNE ? 'Externe' : 'Interne';

  // Toutes les combinaisons cibles possibles (sauf la combinaison actuelle)
  const copyTargets = [
    { sens: SensCourrier.ENTRANT, type: TypeCourrier.EXTERNE },
    { sens: SensCourrier.ENTRANT, type: TypeCourrier.INTERNE },
    { sens: SensCourrier.SORTANT, type: TypeCourrier.EXTERNE },
    { sens: SensCourrier.SORTANT, type: TypeCourrier.INTERNE },
  ].filter(t => !(t.sens === selectedSens && t.type === selectedType));

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col bg-surface-50">
      {/* Modal Copier vers */}
      {showCopyModal && (
        <FormBuilderPortal>
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 bg-gradient-to-r from-primary-50 to-secondary-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary-100 rounded-xl flex items-center justify-center">
                    <FontAwesomeIcon icon={faShare} className="w-4 h-4 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-surface-900">Copier vers...</h3>
                    <p className="text-xs text-surface-500">
                      Source : <span className="font-semibold text-primary-700">{typeLabel(selectedType)} ({sensLabel(selectedSens)})</span>
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowCopyModal(false); setCopyTarget(null); }} className="text-surface-400 hover:text-surface-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                </button>
              </div>
              {/* Corps */}
              <div className="px-6 py-5">
                <p className="text-sm text-surface-600 mb-4">
                  Sélectionnez la destination vers laquelle copier les <span className="font-semibold">{sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.fields.length, 0), 0)} champ(s)</span> configurés ici.
                  La configuration existante à destination sera <span className="font-semibold text-red-600">remplacée</span>.
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {copyTargets.map(t => {
                    const isSelected = copyTarget?.sens === t.sens && copyTarget?.type === t.type;
                    const existingCount = (config[t.sens]?.[t.type] || []).reduce(
                      (n: number, s: any) => n + s.columns?.reduce((m: number, c: any) => m + (c.fields?.length || 0), 0),
                      0
                    );
                    return (
                      <button
                        key={`${t.sens}-${t.type}`}
                        onClick={() => setCopyTarget(t)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-surface-200 hover:border-primary-300 hover:bg-surface-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            t.type === TypeCourrier.EXTERNE ? 'bg-blue-100' : 'bg-purple-100'
                          }`}>
                            <FontAwesomeIcon
                              icon={t.type === TypeCourrier.EXTERNE ? faEnvelope : faEnvelopeOpen}
                              className={`w-4 h-4 ${t.type === TypeCourrier.EXTERNE ? 'text-blue-600' : 'text-purple-600'}`}
                            />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-surface-900">{typeLabel(t.type)} — {sensLabel(t.sens)}</p>
                            <p className="text-xs text-surface-500">
                              {existingCount > 0 ? `${existingCount} champ(s) existant(s) — sera remplacé` : 'Vide'}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <FontAwesomeIcon icon={faCheckCircle} className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Footer */}
              <div className="px-6 py-4 border-t border-surface-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => { setShowCopyModal(false); setCopyTarget(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-surface-700 hover:bg-surface-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCopyTo}
                  disabled={!copyTarget || copying}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                >
                  <FontAwesomeIcon icon={copying ? faSync : faShare} className={`w-4 h-4 ${copying ? 'animate-spin' : ''}`} />
                  {copying ? 'Copie en cours...' : 'Copier'}
                </button>
              </div>
            </div>
          </div>
        </FormBuilderPortal>
      )}
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-surface-400">Paramètres</p>
            <h2 className="text-xl font-bold text-surface-900">Formulaire courriers</h2>
            <p className="text-sm text-surface-500">Créez et personnalisez votre formulaire avec sections et colonnes</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Sélecteur de sens */}
            <div className="flex gap-2 items-center">
              <div className="flex gap-2 bg-surface-100 rounded-lg p-1">
                <button
                  onClick={() => setSelectedSens(SensCourrier.ENTRANT)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    selectedSens === SensCourrier.ENTRANT
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-surface-600 hover:text-surface-900'
                  }`}
                >
                  Entrant
                </button>
                <button
                  onClick={() => setSelectedSens(SensCourrier.SORTANT)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    selectedSens === SensCourrier.SORTANT
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-surface-600 hover:text-surface-900'
                  }`}
                >
                  Sortant
                </button>
              </div>
            </div>
            {/* Sélecteur de type */}
            <div className="flex gap-2 items-center">
              <div className="flex gap-2 bg-surface-100 rounded-lg p-1">
                <button
                  onClick={() => setSelectedType(TypeCourrier.EXTERNE)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    selectedType === TypeCourrier.EXTERNE
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-surface-600 hover:text-surface-900'
                  }`}
                >
                  <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4" />
                  Externe
                </button>
                <button
                  onClick={() => setSelectedType(TypeCourrier.INTERNE)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    selectedType === TypeCourrier.INTERNE
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-surface-600 hover:text-surface-900'
                  }`}
                >
                  <FontAwesomeIcon icon={faEnvelopeOpen} className="w-4 h-4" />
                  Interne
                </button>
              </div>
              {/* Bouton Copier vers une autre combinaison sens/type */}
              <button
                onClick={() => { setCopyTarget(null); setShowCopyModal(true); }}
                className="px-4 py-2 rounded-md text-sm font-medium bg-primary-100 text-primary-700 hover:bg-primary-200 transition-all flex items-center gap-2"
                title="Copier la configuration actuelle vers un autre sens ou type"
              >
                <FontAwesomeIcon icon={faShare} className="w-4 h-4" />
                Copier vers...
              </button>
            </div>
          </div>
        </div>
        
        {/* Message de sauvegarde - Affiché en dessous du header */}
        {saveMessage.type && (
          <div className="px-6 pb-4">
            <div className={`px-5 py-4 rounded-xl flex items-start gap-4 shadow-lg animate-slideInDown border-2 ${
              saveMessage.type === 'success' 
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 text-green-900' 
                : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300 text-red-900'
            }`}>
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                saveMessage.type === 'success' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-red-500 text-white'
              }`}>
                <FontAwesomeIcon 
                  icon={saveMessage.type === 'success' ? faCheckCircle : faExclamationCircle} 
                  className="w-5 h-5" 
                />
              </div>
              <div className="flex-1">
                <div className={`font-bold text-base mb-1 ${
                  saveMessage.type === 'success' ? 'text-green-900' : 'text-red-900'
                }`}>
                  {saveMessage.type === 'success' ? 'Sauvegarde réussie !' : 'Erreur de sauvegarde'}
                </div>
                <div 
                  className={`text-sm whitespace-pre-line ${
                    saveMessage.type === 'success' ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {saveMessage.text}
                </div>
              </div>
              <button
                onClick={() => setSaveMessage({ type: null, text: '' })}
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-opacity-20 transition-colors ${
                  saveMessage.type === 'success' 
                    ? 'text-green-700 hover:bg-green-200' 
                    : 'text-red-700 hover:bg-red-200'
                }`}
                aria-label="Fermer"
              >
                <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Message d'erreur de chargement Laravel */}
      {loadError && (
        <div className="mx-6 mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
          <FontAwesomeIcon icon={faExclamationTriangle} className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">Chargement depuis Laravel</p>
            <p className="text-sm text-amber-800 mt-0.5">{loadError}</p>
            <p className="text-xs text-amber-700 mt-1">Configuration locale affichée. Utilisez « Charger depuis Laravel » une fois l’API disponible.</p>
          </div>
          <button type="button" onClick={() => setLoadError(null)} className="text-amber-600 hover:text-amber-800 p-1" aria-label="Fermer">×</button>
        </div>
      )}

      {/* Barre d'actions en bas */}
      <div className="bg-white border-t border-surface-200 px-6 py-4 flex items-center justify-end gap-3">
        {laravelApiService.isConfigured() && (
          <button
            type="button"
            onClick={handleLoadFromLaravel}
            disabled={loadingFromLaravel}
            className="px-4 py-2 rounded-lg font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            title="Charger la configuration du formulaire depuis l'API Laravel (MySQL)"
          >
            <FontAwesomeIcon icon={loadingFromLaravel ? faSync : faDownload} className={`w-4 h-4 ${loadingFromLaravel ? 'animate-spin' : ''}`} />
            {loadingFromLaravel ? 'Chargement...' : 'Charger depuis Laravel'}
          </button>
        )}
        <button
          type="button"
          onClick={handleResetToDefaults}
          disabled={resetting}
          className="px-4 py-2 rounded-lg font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          title="Réinitialiser la configuration aux valeurs par défaut (ajoute les champs sortants annexes/signature)"
        >
          <FontAwesomeIcon icon={resetting ? faSync : faSync} className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
          {resetting ? 'Réinitialisation...' : 'Réinitialiser par défaut'}
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
            showPreview
              ? 'bg-primary-500 text-white'
              : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
          }`}
        >
          <FontAwesomeIcon icon={showPreview ? faEyeSlash : faEye} className="w-4 h-4" />
          {showPreview ? 'Masquer' : 'Prévisualiser'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-lg font-medium hover:from-primary-600 hover:to-secondary-600 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg transition-all"
        >
          <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar gauche - Palette de champs */}
        <div className="w-64 bg-white border-r border-surface-200 overflow-y-auto">
          <div className="p-4 border-b border-surface-200">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Champs disponibles</h3>
            <p className="text-xs text-surface-500">Glissez-déposez dans une colonne</p>
          </div>
          <div className="p-3 space-y-2">
            {AVAILABLE_FIELDS.map((field) => {
              const fieldIcon = field.icon;
              return (
                <div key={field.type} className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-3 p-3 flex-1 bg-surface-50 rounded-lg border border-surface-200 cursor-move hover:bg-surface-100 hover:border-primary-300 transition-all group"
                    draggable
                    onDragStart={(e) => handleFieldDragStart(e, field.type)}
                    onDragEnd={handleFieldDragEnd}
                  >
                    <div className={`w-8 h-8 rounded-lg ${field.color} flex items-center justify-center text-white`}>
                      <FontAwesomeIcon icon={fieldIcon} className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-surface-900">{field.label}</p>
                      <p className="text-xs text-surface-500">{field.type}</p>
                    </div>
                    <FontAwesomeIcon icon={faGripVertical} className="w-4 h-4 text-surface-400 group-hover:text-surface-600" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bouton pour ajouter une section */}
          <div className="p-4 border-t border-surface-200">
            <button
              onClick={handleAddSection}
              className="w-full px-4 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-lg font-medium hover:from-primary-600 hover:to-secondary-600 flex items-center justify-center gap-2 shadow-lg"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
              Ajouter une section
            </button>
          </div>

          {/* Champs de base (info) */}
          <div className="p-4 border-t border-surface-200 mt-4">
            <h4 className="text-xs font-semibold text-surface-700 mb-2">Champs de base</h4>
            <div className="space-y-1">
              {CORE_FIELDS.map((field) => (
                <div key={field.name} className="flex items-center gap-2 px-2 py-1.5 bg-emerald-50 rounded text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-surface-700">{field.label}</span>
                  {field.required && <span className="text-red-500 ml-auto">*</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Zone centrale - Construction du formulaire ou Prévisualisation */}
        <div className="flex-1 overflow-y-auto bg-surface-50 p-6">
          <div className="max-w-5xl mx-auto">
            {showPreview ? (
              /* Mode prévisualisation */
              <div className="bg-white rounded-xl border-2 border-surface-200 min-h-[500px] p-8">
                <div className="mb-6 pb-4 border-b border-surface-200">
                  <h3 className="text-lg font-bold text-surface-900 mb-2">Prévisualisation du formulaire</h3>
                  <p className="text-sm text-surface-500">Voici comment votre formulaire apparaîtra aux utilisateurs</p>
                </div>
                <div className="space-y-6">
                  {sections.length === 0 ? (
                    <div className="text-center py-12 text-surface-400">
                      <p className="text-sm">Aucune section configurée. Ajoutez des sections pour voir la prévisualisation.</p>
                    </div>
                  ) : (
                    sections.map((section) => {
                      const sectionStyle = section.style || {};
                      return (
                        <div 
                          key={section.id} 
                          className="space-y-4"
                          style={{
                            backgroundColor: sectionStyle.backgroundColor,
                            borderColor: sectionStyle.borderColor,
                            borderWidth: sectionStyle.borderWidth !== undefined ? `${sectionStyle.borderWidth}px` : undefined,
                            borderStyle: sectionStyle.borderStyle,
                            borderRadius: sectionStyle.borderRadius !== undefined ? `${sectionStyle.borderRadius}px` : undefined,
                            padding: sectionStyle.padding !== undefined ? `${sectionStyle.padding}px` : undefined,
                            margin: sectionStyle.margin !== undefined ? `${sectionStyle.margin}px` : undefined,
                          }}
                        >
                          {/* En-tête de section */}
                          <div className="pt-4 border-t border-dashed border-neutral-200">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-500 mb-1">
                              Section
                            </div>
                            <div className="text-sm font-bold text-neutral-800 flex items-center gap-2">
                              <span className="w-1.5 h-5 bg-sky-500 rounded-full" />
                              {section.label}
                            </div>
                            {section.placeholder && (
                              <p className="mt-1 text-xs text-neutral-500">{section.placeholder}</p>
                            )}
                          </div>

                          {/* Colonnes de la section */}
                          <div className="grid grid-cols-12 gap-4">
                            {section.columns.map((column, colIndex) => {
                              const columnStyle = column.style || {};
                              return (
                                <div
                                  key={column.id}
                                  className="space-y-4"
                                  style={{
                                    gridColumn: `span ${column.width} / span ${column.width}`,
                                    ...(colIndex > 0 ? { borderLeft: '2px dashed rgb(186 230 253)', paddingLeft: '1rem' } : {}),
                                    backgroundColor: columnStyle.backgroundColor,
                                    borderColor: columnStyle.borderColor,
                                    borderWidth: columnStyle.borderWidth !== undefined ? `${columnStyle.borderWidth}px` : undefined,
                                    borderStyle: columnStyle.borderStyle,
                                    borderRadius: columnStyle.borderRadius !== undefined ? `${columnStyle.borderRadius}px` : undefined,
                                    padding: columnStyle.padding !== undefined ? `${columnStyle.padding}px` : undefined,
                                    margin: columnStyle.margin !== undefined ? `${columnStyle.margin}px` : undefined,
                                  }}
                                >
                                  {/* Champs dans la colonne */}
                                  {column.fields.map((field) => (
                                    <div key={field.id}>
                                      <label className="block text-xs font-semibold text-neutral-700 mb-1.5 flex items-center gap-2">
                                        {field.icon && getIconByName(field.icon) && (
                                          <FontAwesomeIcon icon={getIconByName(field.icon)!} className="w-3.5 h-3.5 text-primary-600" />
                                        )}
                                        <span>{field.label}</span>
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                      </label>

                                      {/* Types de champs */}
                                      {field.type === 'textarea' && (
                                        <textarea
                                          rows={3}
                                          className="w-full px-3 py-2.5 bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all resize-none text-sm"
                                          placeholder={field.placeholder}
                                          disabled
                                        />
                                      )}

                                      {(field.type === 'text' ||
                                        field.type === 'email' ||
                                        field.type === 'number' ||
                                        field.type === 'phone' ||
                                        field.type === 'url' ||
                                        !field.type) && (
                                        <input
                                          type={
                                            field.type === 'email'
                                              ? 'email'
                                              : field.type === 'number'
                                              ? 'number'
                                              : field.type === 'phone'
                                              ? 'tel'
                                              : field.type === 'url'
                                              ? 'url'
                                              : 'text'
                                          }
                                          className="w-full px-3 py-2.5 bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all text-sm"
                                          placeholder={field.placeholder}
                                          disabled
                                        />
                                      )}

                                      {(field.type === 'date' || field.type === 'datetime') && (
                                        <div>
                                          <MaterialDateTimeField
                                            label={field.placeholder || field.label}
                                            value={null}
                                            onChange={() => {}}
                                            disabled
                                          />
                                        </div>
                                      )}

                                      {field.type === 'select' && (
                                        <select
                                          className="w-full px-3 py-2.5 bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all text-sm"
                                          disabled
                                        >
                                          <option value="">{field.placeholder || 'Sélectionnez une option'}</option>
                                          {(field.options || []).map((opt) => (
                                            <option key={opt} value={opt}>
                                              {opt}
                                            </option>
                                          ))}
                                        </select>
                                      )}

                                      {field.type === 'checkbox' && (
                                        <div className="mt-1.5 space-y-1.5">
                                          {(field.options || []).map((opt, index) => (
                                            <label key={index} className="flex items-center gap-2 text-xs text-neutral-700">
                                              <input type="checkbox" className="w-4 h-4 text-sky-600 border-neutral-300 rounded" disabled />
                                              <span>{opt}</span>
                                            </label>
                                          ))}
                                        </div>
                                      )}

                                      {field.type === 'radio' && (
                                        <div className="mt-1.5 space-y-1.5">
                                          {(field.options || []).map((opt) => (
                                            <label key={opt} className="flex items-center gap-2 text-xs text-neutral-700">
                                              <input type="radio" className="w-4 h-4 text-sky-600 border-neutral-300" disabled />
                                              <span>{opt}</span>
                                            </label>
                                          ))}
                                        </div>
                                      )}

                                      {field.type === 'slider' && (
                                        <div className="mt-1.5">
                                          <div className="h-2 bg-neutral-200 rounded-full w-full" />
                                          <div className="flex justify-between text-xs text-neutral-500 mt-1">
                                            <span>{field.min ?? 0}</span>
                                            <span>{field.max ?? 100}</span>
                                          </div>
                                        </div>
                                      )}

                                      {field.type === 'urgency' && (
                                        <select
                                          className="w-full px-3 py-2.5 bg-neutral-50 border-2 border-neutral-200 rounded-xl focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all text-sm"
                                          disabled
                                        >
                                          <option value="">{field.placeholder || 'Niveau d\'urgence'}</option>
                                          {(field.options || []).map((opt) => (
                                            <option key={opt} value={opt}>
                                              {opt}
                                            </option>
                                          ))}
                                        </select>
                                      )}

                                      {field.type === 'file' && (
                                        <div className="mt-1.5">
                                          <input
                                            type="file"
                                            className="block w-full text-xs text-neutral-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
                                            disabled
                                          />
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* Mode édition */
              <div className="bg-white rounded-xl border-2 border-dashed border-surface-300 min-h-[500px] p-6">
                {sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[500px] text-center">
                    <div className="w-16 h-16 rounded-full bg-surface-100 flex items-center justify-center mb-4">
                      <FontAwesomeIcon icon={faBars} className="w-8 h-8 text-surface-400" />
                    </div>
                    <p className="text-lg font-semibold text-surface-700 mb-2">Zone de construction</p>
                    <p className="text-sm text-surface-500 mb-4">
                      Cliquez sur &quot;Ajouter une section&quot; pour commencer
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {sections.map((section) => {
                    const isSectionSelected = selectedItem?.type === 'section' && selectedItem.id === section.id;
                    const isDraggedOver = draggedOverTarget?.sectionId === section.id;

                    const sectionStyle = section.style || {};
                    return (
                      <div
                        key={section.id}
                        className={`rounded-lg border-2 transition-all ${
                          isSectionSelected
                            ? 'border-primary-500 bg-primary-50 shadow-md'
                            : 'border-surface-200 bg-white hover:border-primary-300'
                        } ${isDraggedOver ? 'border-blue-400 bg-blue-50' : ''}`}
                        style={{
                          backgroundColor: sectionStyle.backgroundColor,
                          borderColor: sectionStyle.borderColor,
                          borderWidth: sectionStyle.borderWidth !== undefined ? `${sectionStyle.borderWidth}px` : undefined,
                          borderStyle: sectionStyle.borderStyle,
                          borderRadius: sectionStyle.borderRadius !== undefined ? `${sectionStyle.borderRadius}px` : undefined,
                          padding: sectionStyle.padding !== undefined ? `${sectionStyle.padding}px` : undefined,
                          margin: sectionStyle.margin !== undefined ? `${sectionStyle.margin}px` : undefined,
                        }}
                      >
                        {/* En-tête de section */}
                        <div
                          className="p-4 border-b border-surface-200 cursor-pointer"
                          onClick={() => {
                            setSelectedItem({ type: 'section', id: section.id });
                            setShowPropertiesDrawer(true);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center text-white">
                                <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-surface-900">{section.label}</h3>
                                {section.placeholder && (
                                  <p className="text-xs text-surface-500 mt-0.5">{section.placeholder}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddColumn(section.id);
                                }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-primary-600 hover:bg-primary-50"
                                title="Ajouter une colonne"
                              >
                                <FontAwesomeIcon icon={faColumns} className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('Supprimer cette section ?')) {
                                    handleDeleteSection(section.id);
                                  }
                                }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50"
                                title="Supprimer la section"
                              >
                                <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Colonnes de la section */}
                        <div className="p-4">
                          <div className="grid grid-cols-12 gap-4">
                            {(section.columns || []).map((column) => {
                              const isColumnSelected =
                                selectedItem?.type === 'column' &&
                                selectedItem.sectionId === section.id &&
                                selectedItem.columnId === column.id;
                              const isColumnDraggedOver =
                                draggedOverTarget?.sectionId === section.id &&
                                draggedOverTarget?.columnId === column.id;

                              const columnStyle = column.style || {};
                              return (
                                <div
                                  key={column.id}
                                  className={`min-h-[200px] rounded-lg border-2 border-dashed transition-all p-4 ${
                                    isColumnSelected
                                      ? 'border-primary-500 bg-primary-50 shadow-md'
                                      : isColumnDraggedOver
                                      ? 'border-blue-500 bg-blue-50 shadow-md'
                                      : 'border-surface-300 bg-surface-50 hover:border-surface-400'
                                  }`}
                                  style={{
                                    gridColumn: `span ${column.width} / span ${column.width}`,
                                    backgroundColor: columnStyle.backgroundColor,
                                    borderColor: columnStyle.borderColor,
                                    borderWidth: columnStyle.borderWidth !== undefined ? `${columnStyle.borderWidth}px` : undefined,
                                    borderStyle: columnStyle.borderStyle,
                                    borderRadius: columnStyle.borderRadius !== undefined ? `${columnStyle.borderRadius}px` : undefined,
                                    padding: columnStyle.padding !== undefined ? `${columnStyle.padding}px` : undefined,
                                    margin: columnStyle.margin !== undefined ? `${columnStyle.margin}px` : undefined,
                                  }}
                                  onDrop={(e) => {
                                    // Si c'est un champ existant qui est déplacé
                                    if (draggedFieldId) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const dragData = e.dataTransfer.getData('text/plain');
                                      if (dragData) {
                                        try {
                                          const { sectionId: sourceSectionId, columnId: sourceColumnId } = JSON.parse(dragData);
                                          
                                          // Récupérer le champ AVANT toute modification
                                          const sourceSection = sections.find((s) => s.id === sourceSectionId);
                                          const sourceColumn = sourceSection?.columns.find((c) => c.id === sourceColumnId);
                                          const draggedField = sourceColumn?.fields.find((f) => f.id === draggedFieldId);
                                          
                                          if (!draggedField) {
                                            setDraggedFieldId(null);
                                            setDraggedOverFieldId(null);
                                            setIsReordering(false);
                                            return;
                                          }
                                          
                                          const isInsertMode = e.ctrlKey || e.metaKey;
                                          const targetSectionId = section.id;
                                          const targetColumnId = column.id;
                                          
                                          // Créer une copie profonde du champ pour éviter les problèmes de référence
                                          const fieldToAdd = isInsertMode 
                                            ? { ...draggedField, id: `field_${Date.now()}_${Math.random()}` }
                                            : { ...draggedField };
                                          
                                          // Si la source et la destination sont dans la même section, il faut gérer différemment
                                          let updatedSections: FormStructure;
                                          
                                          if (sourceSectionId === targetSectionId) {
                                            // Même section : modifier la section en une seule fois
                                            updatedSections = sections.map((s) => {
                                              if (s.id === targetSectionId) {
                                                return {
                                                  ...s,
                                                  columns: s.columns.map((col) => {
                                                    if (col.id === sourceColumnId && col.id === targetColumnId) {
                                                      // Même colonne : ne rien faire (déjà géré par handleExistingFieldDrop)
                                                      return col;
                                                    } else if (col.id === sourceColumnId && !isInsertMode) {
                                                      // Colonne source : retirer le champ
                                                      return { ...col, fields: col.fields.filter((f) => f.id !== draggedFieldId) };
                                                    } else if (col.id === targetColumnId) {
                                                      // Colonne destination : ajouter le champ
                                                      const existingFields = [...(col.fields || [])];
                                                      return { ...col, fields: [...existingFields, fieldToAdd] };
                                                    }
                                                    return col;
                                                  }),
                                                };
                                              }
                                              return s;
                                            });
                                          } else {
                                            // Sections différentes : traiter séparément
                                            updatedSections = sections.map((s) => {
                                              // Retirer le champ de la source si ce n'est pas un mode copie
                                              if (s.id === sourceSectionId && !isInsertMode) {
                                                return {
                                                  ...s,
                                                  columns: s.columns.map((col) => {
                                                    if (col.id === sourceColumnId) {
                                                      return { ...col, fields: col.fields.filter((f) => f.id !== draggedFieldId) };
                                                    }
                                                    return col;
                                                  }),
                                                };
                                              }
                                              // Ajouter le champ à la colonne cible
                                              if (s.id === targetSectionId) {
                                                return {
                                                  ...s,
                                                  columns: s.columns.map((col) => {
                                                    if (col.id === targetColumnId) {
                                                      // S'assurer qu'on ajoute bien le champ
                                                      const existingFields = [...(col.fields || [])];
                                                      return { ...col, fields: [...existingFields, fieldToAdd] };
                                                    }
                                                    return col;
                                                  }),
                                                };
                                              }
                                              return s;
                                            });
                                          }
                                          
                                          updateSections(updatedSections);
                                          setDraggedFieldId(null);
                                          setDraggedOverFieldId(null);
                                          setIsReordering(false);
                                        } catch (error) {
                                          console.error('Erreur lors du déplacement du champ:', error);
                                          setDraggedFieldId(null);
                                          setDraggedOverFieldId(null);
                                          setIsReordering(false);
                                        }
                                      }
                                    } else {
                                      // Comportement normal pour les nouveaux champs
                                      handleFieldDrop(e, section.id, column.id);
                                    }
                                  }}
                                  onDragOver={(e) => {
                                    if (draggedFieldId) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
                                      setDraggedOverTarget({ sectionId: section.id, columnId: column.id });
                                    } else {
                                      handleFieldDragOver(e, section.id, column.id);
                                    }
                                  }}
                                  onDragLeave={() => {
                                    if (!draggedFieldId) {
                                      setDraggedOverTarget(null);
                                    }
                                  }}
                                >
                                  {/* En-tête de colonne */}
                                  <div
                                    className="flex items-center justify-between mb-3 pb-2 border-b-2 border-surface-200 cursor-pointer hover:border-surface-300 transition-colors"
                                    onClick={() => {
                                      setSelectedItem({ type: 'column', id: column.id, sectionId: section.id, columnId: column.id });
                                      setShowPropertiesDrawer(true);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`w-6 h-6 rounded flex items-center justify-center ${
                                        isColumnSelected ? 'bg-primary-500 text-white' : 'bg-surface-200 text-surface-600'
                                      }`}>
                                        <FontAwesomeIcon icon={faColumns} className="w-3 h-3" />
                                      </div>
                                      <span className="text-xs font-bold text-surface-700">
                                        Colonne {Math.round((column.width / 12) * 100)}%
                                      </span>
                                      <span className="text-[10px] text-surface-500">
                                        ({column.width}/12)
                                      </span>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Supprimer cette colonne ?')) {
                                          handleDeleteColumn(section.id, column.id);
                                        }
                                      }}
                                      className="w-6 h-6 rounded flex items-center justify-center text-red-600 hover:bg-red-50"
                                      title="Supprimer la colonne"
                                    >
                                      <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                                    </button>
                                  </div>

                                  {/* Champs dans la colonne */}
                                  <div 
                                    className="space-y-3"
                                    onDragOver={(e) => {
                                      // Permettre le drop des champs existants sur la zone vide
                                      if (draggedFieldId) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = 'move';
                                      }
                                    }}
                                    onDrop={(e) => {
                                      // Gérer le drop d'un champ existant sur la zone vide
                                      if (draggedFieldId) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const dragData = e.dataTransfer.getData('text/plain');
                                        if (dragData) {
                                          try {
                                            const { sectionId: sourceSectionId, columnId: sourceColumnId } = JSON.parse(dragData);
                                            const sourceSection = sections.find((s) => s.id === sourceSectionId);
                                            const sourceColumn = sourceSection?.columns.find((c) => c.id === sourceColumnId);
                                            const draggedField = sourceColumn?.fields.find((f) => f.id === draggedFieldId);
                                            
                                            if (!draggedField) {
                                              setDraggedFieldId(null);
                                              setDraggedOverFieldId(null);
                                              setIsReordering(false);
                                              return;
                                            }
                                            
                                            const isInsertMode = e.ctrlKey || e.metaKey;
                                            const targetSectionId = section.id;
                                            const targetColumnId = column.id;
                                            
                                            // Créer une copie profonde du champ pour éviter les problèmes de référence
                                            const fieldToAdd = isInsertMode 
                                              ? { ...draggedField, id: `field_${Date.now()}_${Math.random()}` }
                                              : { ...draggedField };
                                            
                                            // Si la source et la destination sont dans la même section, il faut gérer différemment
                                            let updatedSections: FormStructure;
                                            
                                            if (sourceSectionId === targetSectionId) {
                                              // Même section : modifier la section en une seule fois
                                              updatedSections = sections.map((s) => {
                                                if (s.id === targetSectionId) {
                                                  return {
                                                    ...s,
                                                    columns: s.columns.map((col) => {
                                                      if (col.id === sourceColumnId && col.id === targetColumnId) {
                                                        // Même colonne : retirer et ajouter dans la même opération
                                                        const fields = col.fields.filter((f) => f.id !== draggedFieldId);
                                                        return { ...col, fields: [...fields, fieldToAdd] };
                                                      } else if (col.id === sourceColumnId && !isInsertMode) {
                                                        // Colonne source : retirer le champ
                                                        return { ...col, fields: col.fields.filter((f) => f.id !== draggedFieldId) };
                                                      } else if (col.id === targetColumnId) {
                                                        // Colonne destination : ajouter le champ
                                                        const existingFields = [...(col.fields || [])];
                                                        return { ...col, fields: [...existingFields, fieldToAdd] };
                                                      }
                                                      return col;
                                                    }),
                                                  };
                                                }
                                                return s;
                                              });
                                            } else {
                                              // Sections différentes : traiter séparément
                                              updatedSections = sections.map((s) => {
                                                // Retirer le champ de la source si ce n'est pas un mode copie
                                                if (s.id === sourceSectionId && !isInsertMode) {
                                                  return {
                                                    ...s,
                                                    columns: s.columns.map((col) => {
                                                      if (col.id === sourceColumnId) {
                                                        return { ...col, fields: col.fields.filter((f) => f.id !== draggedFieldId) };
                                                      }
                                                      return col;
                                                    }),
                                                  };
                                                }
                                                // Ajouter le champ à la colonne cible
                                                if (s.id === targetSectionId) {
                                                  return {
                                                    ...s,
                                                    columns: s.columns.map((col) => {
                                                      if (col.id === targetColumnId) {
                                                        // S'assurer qu'on ajoute bien le champ avec une copie du tableau
                                                        const existingFields = [...(col.fields || [])];
                                                        return { ...col, fields: [...existingFields, fieldToAdd] };
                                                      }
                                                      return col;
                                                    }),
                                                  };
                                                }
                                                return s;
                                              });
                                            }
                                            
                                            updateSections(updatedSections);
                                            setDraggedFieldId(null);
                                            setDraggedOverFieldId(null);
                                            setIsReordering(false);
                                          } catch {}
                                        }
                                      }
                                    }}
                                  >
                                    {column.fields.length === 0 ? (
                                      <div className="text-center py-12 text-surface-400">
                                        <div className="flex flex-col items-center gap-2">
                                          <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center mb-2">
                                            <FontAwesomeIcon icon={faGripVertical} className="w-5 h-5 text-surface-400" />
                                          </div>
                                          <p className="text-xs font-medium">Zone de dépôt</p>
                                          <p className="text-[10px] text-surface-400">Glissez un champ depuis la palette ou réorganisez</p>
                                        </div>
                                      </div>
                                    ) : (
                                      column.fields.map((field) => {
                                        const fieldConfig = AVAILABLE_FIELDS.find((f) => f.type === field.type);
                                        const isFieldSelected =
                                          selectedItem?.type === 'field' &&
                                          selectedItem.id === field.id &&
                                          selectedItem.sectionId === section.id &&
                                          selectedItem.columnId === column.id;

                                        return (
                                          <div
                                            key={field.id}
                                            draggable
                                            onDragStart={(e) => handleExistingFieldDragStart(e, field.id, section.id, column.id)}
                                            onDragOver={(e) => handleExistingFieldDragOver(e, field.id)}
                                            onDragLeave={handleExistingFieldDragLeave}
                                            onDrop={(e) => handleExistingFieldDrop(e, field.id, section.id, column.id)}
                                            onDragEnd={handleExistingFieldDragEnd}
                                            onClick={() => {
                                              setSelectedItem({
                                                type: 'field',
                                                id: field.id,
                                                sectionId: section.id,
                                                columnId: column.id,
                                              });
                                              setShowPropertiesDrawer(true);
                                            }}
                                            className={`p-3 rounded-lg border-2 transition-all cursor-move ${
                                              isFieldSelected
                                                ? 'border-primary-500 bg-primary-50 shadow-sm'
                                                : draggedFieldId === field.id
                                                ? 'border-blue-500 bg-blue-50 opacity-50'
                                                : draggedOverFieldId === field.id
                                                ? 'border-green-500 bg-green-50'
                                                : 'border-surface-200 bg-white hover:border-primary-300 hover:shadow-sm'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 mb-1.5">
                                              <div className="cursor-move text-surface-400 hover:text-surface-600">
                                                <FontAwesomeIcon icon={faGripVertical} className="w-3 h-3" />
                                              </div>
                                              <div
                                                className={`w-7 h-7 rounded-lg ${fieldConfig?.color || 'bg-gray-500'} flex items-center justify-center text-white shadow-sm`}
                                              >
                                                <FontAwesomeIcon icon={fieldConfig?.icon || faTextWidth} className="w-3.5 h-3.5" />
                                              </div>
                                              <div className="flex-1 flex items-center gap-2">
                                                {field.icon && getIconByName(field.icon) && (
                                                  <FontAwesomeIcon icon={getIconByName(field.icon)!} className="w-3.5 h-3.5 text-primary-600" />
                                                )}
                                                <span className="text-sm font-semibold text-surface-900">{field.label}</span>
                                                {field.required && <span className="text-red-500 text-xs ml-1">*</span>}
                                              </div>
                                            </div>
                                            <div className="text-[10px] text-surface-400 uppercase tracking-wide ml-9">{field.type}</div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drawer des propriétés (via portal, plein écran) */}
      {showPropertiesDrawer && (
        <FormBuilderPortal>
          <div className="fixed inset-0 z-[50003] flex justify-end">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                setShowPropertiesDrawer(false);
                setSelectedItem(null);
              }}
            />
            <div className="relative h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-slideInRight">
              {selectedItem ? (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-bold text-surface-900">
                        {selectedItem.type === 'section'
                          ? 'Propriétés de la section'
                          : selectedItem.type === 'column'
                          ? 'Propriétés de la colonne'
                          : 'Propriétés du champ'}
                      </h3>
                      <button
                        onClick={() => {
                          setShowPropertiesDrawer(false);
                          setSelectedItem(null);
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:bg-surface-100"
                      >
                        <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Debug info */}
                    {process.env.NODE_ENV === 'development' && (
                      <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                        <p>Type: {selectedItem.type}</p>
                        <p>ID: {selectedItem.id}</p>
                        {selectedItem.sectionId && <p>Section ID: {selectedItem.sectionId}</p>}
                        {selectedItem.columnId && <p>Column ID: {selectedItem.columnId}</p>}
                        <p>Section trouvée: {getSelectedSection() ? 'Oui' : 'Non'}</p>
                        <p>Colonne trouvée: {getSelectedColumn() ? 'Oui' : 'Non'}</p>
                        <p>Champ trouvé: {getSelectedField() ? 'Oui' : 'Non'}</p>
                      </div>
                    )}

                    {/* Propriétés de section */}
                    {selectedItem.type === 'section' && getSelectedSection() && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-2">
                            Titre de la section <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={getSelectedSection()!.label}
                            onChange={(e) =>
                              handleSectionChange(selectedItem.id, { label: e.target.value })
                            }
                            className="w-full px-4 py-2.5 border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Titre de la section"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-2">Description</label>
                          <textarea
                            value={getSelectedSection()!.placeholder || ''}
                            onChange={(e) =>
                              handleSectionChange(selectedItem.id, { placeholder: e.target.value })
                            }
                            rows={3}
                            className="w-full px-4 py-2.5 border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Description de la section"
                          />
                        </div>

                        {/* Propriétés de style de la section */}
                        <div className="pt-4 border-t border-surface-200">
                          <h4 className="text-sm font-bold text-surface-900 mb-4">Style de la section</h4>
                          
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Couleur de fond</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={getSelectedSection()!.style?.backgroundColor || '#ffffff'}
                                    onChange={(e) =>
                                      handleSectionChange(selectedItem.id, {
                                        style: {
                                          ...getSelectedSection()!.style,
                                          backgroundColor: e.target.value,
                                        },
                                      })
                                    }
                                    className="w-12 h-10 rounded border border-surface-200 cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    value={getSelectedSection()!.style?.backgroundColor || '#ffffff'}
                                    onChange={(e) =>
                                      handleSectionChange(selectedItem.id, {
                                        style: {
                                          ...getSelectedSection()!.style,
                                          backgroundColor: e.target.value,
                                        },
                                      })
                                    }
                                    className="flex-1 px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="#ffffff"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Couleur bordure</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={getSelectedSection()!.style?.borderColor || '#e5e7eb'}
                                    onChange={(e) =>
                                      handleSectionChange(selectedItem.id, {
                                        style: {
                                          ...getSelectedSection()!.style,
                                          borderColor: e.target.value,
                                        },
                                      })
                                    }
                                    className="w-12 h-10 rounded border border-surface-200 cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    value={getSelectedSection()!.style?.borderColor || '#e5e7eb'}
                                    onChange={(e) =>
                                      handleSectionChange(selectedItem.id, {
                                        style: {
                                          ...getSelectedSection()!.style,
                                          borderColor: e.target.value,
                                        },
                                      })
                                    }
                                    className="flex-1 px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="#e5e7eb"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Épaisseur bordure (px)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  value={getSelectedSection()!.style?.borderWidth || 2}
                                  onChange={(e) =>
                                    handleSectionChange(selectedItem.id, {
                                      style: {
                                        ...getSelectedSection()!.style,
                                        borderWidth: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Style bordure</label>
                                <select
                                  value={getSelectedSection()!.style?.borderStyle || 'solid'}
                                  onChange={(e) =>
                                    handleSectionChange(selectedItem.id, {
                                      style: {
                                        ...getSelectedSection()!.style,
                                        borderStyle: e.target.value as 'solid' | 'dashed' | 'dotted' | 'none',
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                >
                                  <option value="solid">Solide</option>
                                  <option value="dashed">Tirets</option>
                                  <option value="dotted">Pointillés</option>
                                  <option value="none">Aucune</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Rayon (px)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={getSelectedSection()!.style?.borderRadius || 8}
                                  onChange={(e) =>
                                    handleSectionChange(selectedItem.id, {
                                      style: {
                                        ...getSelectedSection()!.style,
                                        borderRadius: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Padding (px)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={getSelectedSection()!.style?.padding || 16}
                                  onChange={(e) =>
                                    handleSectionChange(selectedItem.id, {
                                      style: {
                                        ...getSelectedSection()!.style,
                                        padding: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Margin (px)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={getSelectedSection()!.style?.margin || 0}
                                  onChange={(e) =>
                                    handleSectionChange(selectedItem.id, {
                                      style: {
                                        ...getSelectedSection()!.style,
                                        margin: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Propriétés de colonne */}
                    {selectedItem.type === 'column' && getSelectedColumn() && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-2">Largeur de la colonne</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="1"
                              max="12"
                              value={getSelectedColumn()!.width}
                              onChange={(e) => {
                                const newWidth = parseInt(e.target.value);
                                const section = sections.find((s) => s.id === selectedItem.sectionId);
                                if (!section) return;
                                  
                                const currentColumn = section.columns.find((c) => c.id === selectedItem.columnId);
                                if (!currentColumn) return;
                                  
                                const otherColumns = section.columns.filter((c) => c.id !== selectedItem.columnId);
                                const totalOtherWidth = otherColumns.reduce((sum, col) => sum + col.width, 0);
                                  
                                // La largeur maximale est limitée par l'espace disponible
                                // On doit laisser au moins 1 unité pour chaque autre colonne
                                const minOtherWidth = otherColumns.length;
                                const maxWidth = Math.max(1, 12 - minOtherWidth);
                                const adjustedWidth = Math.max(1, Math.min(newWidth, maxWidth));
                                  
                                // Calculer l'espace restant pour les autres colonnes
                                const remaining = 12 - adjustedWidth;
                                  
                                // Calculer les nouvelles largeurs pour toutes les colonnes
                                const newColumnWidths = section.columns.map((col) => {
                                  if (col.id === selectedItem.columnId) {
                                    return adjustedWidth;
                                  } else {
                                    // Ajuster proportionnellement les autres colonnes
                                    if (totalOtherWidth > 0 && remaining > 0) {
                                      const factor = remaining / totalOtherWidth;
                                      return Math.max(1, Math.round(col.width * factor));
                                    }
                                    // Si pas d'espace, garder au moins 1
                                    return Math.max(1, col.width);
                                  }
                                });
                                  
                                // Vérifier et corriger la somme pour qu'elle soit exactement 12
                                let totalWidth = newColumnWidths.reduce((sum, w) => sum + w, 0);
                                if (totalWidth !== 12) {
                                  const diff = 12 - totalWidth;
                                  // Ajuster la colonne sélectionnée en priorité
                                  const selectedIndex = section.columns.findIndex((c) => c.id === selectedItem.columnId);
                                  if (selectedIndex >= 0) {
                                    newColumnWidths[selectedIndex] = Math.max(1, newColumnWidths[selectedIndex] + diff);
                                  }
                                  
                                  // Vérifier à nouveau
                                  totalWidth = newColumnWidths.reduce((sum, w) => sum + w, 0);
                                  if (totalWidth !== 12) {
                                    // Si toujours pas 12, ajuster la première autre colonne
                                    const finalDiff = 12 - totalWidth;
                                    for (let i = 0; i < newColumnWidths.length; i++) {
                                      if (i !== selectedIndex) {
                                        newColumnWidths[i] = Math.max(1, newColumnWidths[i] + finalDiff);
                                        break;
                                      }
                                    }
                                  }
                                }
                                  
                                // Mettre à jour toutes les colonnes en une seule fois
                                const updatedSections = sections.map((s) => {
                                  if (s.id === section.id) {
                                    return {
                                      ...s,
                                      columns: s.columns.map((col, idx) => ({
                                        ...col,
                                        width: newColumnWidths[idx],
                                      })),
                                    };
                                  }
                                  return s;
                                });
                                  
                                updateSections(updatedSections);
                              }}
                              className="flex-1"
                            />
                            <span className="text-sm font-semibold text-surface-700 w-12 text-right">
                              {Math.round((getSelectedColumn()!.width / 12) * 100)}%
                            </span>
                          </div>
                        </div>

                        {/* Propriétés de style de la colonne */}
                        <div className="pt-4 border-t border-surface-200">
                          <h4 className="text-sm font-bold text-surface-900 mb-4">Style de la colonne</h4>
                          
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Couleur de fond</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={getSelectedColumn()!.style?.backgroundColor || '#f9fafb'}
                                    onChange={(e) =>
                                      handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                        style: {
                                          ...getSelectedColumn()!.style,
                                          backgroundColor: e.target.value,
                                        },
                                      })
                                    }
                                    className="w-12 h-10 rounded border border-surface-200 cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    value={getSelectedColumn()!.style?.backgroundColor || '#f9fafb'}
                                    onChange={(e) =>
                                      handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                        style: {
                                          ...getSelectedColumn()!.style,
                                          backgroundColor: e.target.value,
                                        },
                                      })
                                    }
                                    className="flex-1 px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="#f9fafb"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Couleur bordure</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={getSelectedColumn()!.style?.borderColor || '#d1d5db'}
                                    onChange={(e) =>
                                      handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                        style: {
                                          ...getSelectedColumn()!.style,
                                          borderColor: e.target.value,
                                        },
                                      })
                                    }
                                    className="w-12 h-10 rounded border border-surface-200 cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    value={getSelectedColumn()!.style?.borderColor || '#d1d5db'}
                                    onChange={(e) =>
                                      handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                        style: {
                                          ...getSelectedColumn()!.style,
                                          borderColor: e.target.value,
                                        },
                                      })
                                    }
                                    className="flex-1 px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="#d1d5db"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Épaisseur bordure (px)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  value={getSelectedColumn()!.style?.borderWidth || 2}
                                  onChange={(e) =>
                                    handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                      style: {
                                        ...getSelectedColumn()!.style,
                                        borderWidth: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Style bordure</label>
                                <select
                                  value={getSelectedColumn()!.style?.borderStyle || 'dashed'}
                                  onChange={(e) =>
                                    handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                      style: {
                                        ...getSelectedColumn()!.style,
                                        borderStyle: e.target.value as 'solid' | 'dashed' | 'dotted' | 'none',
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                >
                                  <option value="solid">Solide</option>
                                  <option value="dashed">Tirets</option>
                                  <option value="dotted">Pointillés</option>
                                  <option value="none">Aucune</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Rayon (px)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={getSelectedColumn()!.style?.borderRadius || 8}
                                  onChange={(e) =>
                                    handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                      style: {
                                        ...getSelectedColumn()!.style,
                                        borderRadius: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Padding (px)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={getSelectedColumn()!.style?.padding || 12}
                                  onChange={(e) =>
                                    handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                      style: {
                                        ...getSelectedColumn()!.style,
                                        padding: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-surface-700 mb-2">Margin (px)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={getSelectedColumn()!.style?.margin || 0}
                                  onChange={(e) =>
                                    handleColumnChange(selectedItem.sectionId!, selectedItem.columnId!, {
                                      style: {
                                        ...getSelectedColumn()!.style,
                                        margin: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Propriétés de champ */}
                    {selectedItem.type === 'field' && getSelectedField() && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-2">
                            Libellé <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={getSelectedField()!.label}
                            onChange={(e) =>
                              handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                label: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2.5 border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Libellé du champ"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-2">
                            Identifiant (name) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={getSelectedField()!.name}
                            onChange={(e) =>
                              handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                name: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2.5 border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                            placeholder="nom_du_champ"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-2">Placeholder</label>
                          <input
                            type="text"
                            value={getSelectedField()!.placeholder || ''}
                            onChange={(e) =>
                              handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                placeholder: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2.5 border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Texte d'aide"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-surface-700 mb-2">Icône du label</label>
                          <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto p-2 border border-surface-200 rounded-lg bg-surface-50">
                            <button
                              type="button"
                              onClick={() =>
                                handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                  icon: undefined,
                                })
                              }
                              className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs gap-1 transition-colors ${
                                !getSelectedField()!.icon
                                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                                  : 'border-surface-200 hover:border-primary-300 text-surface-600'
                              }`}
                              title="Aucune icône"
                            >
                              <div className="w-6 h-6 rounded-full bg-surface-200 flex items-center justify-center">
                                <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                              </div>
                              <span className="text-[10px] text-center">Aucune</span>
                            </button>
                            {AVAILABLE_ICONS.map((iconOption) => {
                              const IconComponent = iconOption.icon;
                              return (
                                <button
                                  key={iconOption.name}
                                  type="button"
                                  onClick={() =>
                                    handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                      icon: iconOption.name,
                                    })
                                  }
                                  className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs gap-1 transition-colors ${
                                    getSelectedField()!.icon === iconOption.name
                                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                                      : 'border-surface-200 hover:border-primary-300 text-surface-600'
                                  }`}
                                  title={iconOption.label}
                                >
                                  <div className="w-6 h-6 rounded-full bg-surface-200 flex items-center justify-center">
                                    <FontAwesomeIcon icon={IconComponent} className="w-3 h-3" />
                                  </div>
                                  <span className="text-[10px] text-center truncate w-full">{iconOption.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-surface-50 rounded-lg border border-surface-200">
                          <div>
                            <label className="block text-sm font-semibold text-surface-700 mb-1">Champ obligatoire</label>
                            <p className="text-xs text-surface-500">L'utilisateur doit remplir ce champ</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!getSelectedField()!.required}
                              onChange={(e) =>
                                handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                  required: e.target.checked,
                                })
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-surface-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                          </label>
                        </div>
                        {(getSelectedField()!.type === 'slider') && (
                          <div className="space-y-3 p-4 bg-surface-50 rounded-lg border border-surface-200">
                            <label className="block text-sm font-semibold text-surface-700">Curseur : min, max, pas</label>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-surface-500 mb-1">Min</label>
                                <input
                                  type="number"
                                  value={getSelectedField()!.min ?? 0}
                                  onChange={(e) =>
                                    handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                      min: Number(e.target.value) || 0,
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-surface-500 mb-1">Max</label>
                                <input
                                  type="number"
                                  value={getSelectedField()!.max ?? 100}
                                  onChange={(e) =>
                                    handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                      max: Number(e.target.value) || 100,
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-surface-500 mb-1">Pas</label>
                                <input
                                  type="number"
                                  value={getSelectedField()!.step ?? 1}
                                  onChange={(e) =>
                                    handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                      step: Number(e.target.value) || 1,
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        {(getSelectedField()!.type === 'select' ||
                          getSelectedField()!.type === 'radio' ||
                          getSelectedField()!.type === 'checkbox' ||
                          getSelectedField()!.type === 'urgency') && (
                          <div>
                            <label className="block text-sm font-semibold text-surface-700 mb-2">
                              {getSelectedField()!.type === 'urgency' ? 'Niveaux d\'urgence' : 'Options'}
                            </label>
                            <div className="space-y-2">
                              {(getSelectedField()!.options || []).map((option, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => {
                                      const newOptions = [...(getSelectedField()!.options || [])];
                                      newOptions[index] = e.target.value;
                                      handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                        options: newOptions,
                                      });
                                    }}
                                    className="flex-1 px-3 py-2 border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                                    placeholder={`Option ${index + 1}`}
                                  />
                                  <button
                                    onClick={() => {
                                      const newOptions =
                                        getSelectedField()!.options?.filter((_, i) => i !== index) || [];
                                      handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                        options: newOptions,
                                      });
                                    }}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50"
                                  >
                                    <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => {
                                  const newOptions = [
                                    ...(getSelectedField()!.options || []),
                                    `Option ${(getSelectedField()!.options?.length || 0) + 1}`,
                                  ];
                                  handleFieldChange(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id, {
                                    options: newOptions,
                                  });
                                }}
                                className="w-full px-3 py-2 border-2 border-dashed border-surface-300 rounded-lg text-sm text-surface-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
                              >
                                + Ajouter une option
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="pt-4 border-t border-surface-200">
                          <button
                            onClick={() => {
                              if (confirm('Êtes-vous sûr de vouloir supprimer ce champ ?')) {
                                handleDeleteField(selectedItem.sectionId!, selectedItem.columnId!, selectedItem.id);
                              }
                            }}
                            className="w-full px-4 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center justify-center gap-2 font-medium"
                          >
                            <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Message si aucun type ne correspond */}
                    {selectedItem.type === 'section' && !getSelectedSection() && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">Section non trouvée. ID: {selectedItem.id}</p>
                      </div>
                    )}
                    {selectedItem.type === 'column' && !getSelectedColumn() && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">Colonne non trouvée. Section ID: {selectedItem.sectionId}, Column ID: {selectedItem.columnId}</p>
                      </div>
                    )}
                    {selectedItem.type === 'field' && !getSelectedField() && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">Champ non trouvé. Section ID: {selectedItem.sectionId}, Column ID: {selectedItem.columnId}, Field ID: {selectedItem.id}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-surface-100 flex items-center justify-center mb-4">
                    <FontAwesomeIcon icon={faEdit} className="w-8 h-8 text-surface-400" />
                  </div>
                  <p className="text-sm font-semibold text-surface-700 mb-2">Aucun élément sélectionné</p>
                  <p className="text-xs text-surface-500">Cliquez sur un élément pour modifier ses propriétés</p>
                </div>
              )}
            </div>
          </div>
        </FormBuilderPortal>
      )}
    </div>
  );
};

export default GestionFormulaireCourrier;
