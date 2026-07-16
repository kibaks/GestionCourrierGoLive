import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { courrierService } from '../services/courrierService';
import { formulaireCourrierService } from '../services/formulaireCourrierService';
import { entiteOrganisationnelleService } from '../services/entiteOrganisationnelleService';
import { adminService } from '../services/adminService';
import { exportSettingsService } from '../services/exportSettingsService';
import { Courrier, SensCourrier, TypeCourrier, StatutCourrier, Priorite, Role } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faTimes, faEye, faPrint, faFilter, faArrowLeft, faBuilding, faQrcode, faTable, faPalette, faColumns, faFileAlt } from '@fortawesome/free-solid-svg-icons';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

interface RegistreConfig {
  // En-tête
  title: string;
  subtitle: string;
  organisationName: string;
  organisationAddress: string;
  showHeader: boolean;
  // QR Code
  includeQrCode: boolean;
  qrBaseUrl: string;
  // Tableau
  includeStats: boolean;
  showBorders: boolean;
  showRowNumbers: boolean;
  paperSize: 'a4' | 'a3' | 'letter';
  orientation: 'portrait' | 'landscape';
  fontSize: 8 | 9 | 10 | 11 | 12;
  tableAlign: 'left' | 'center' | 'right';
  tableMargin: number;
  columnPadding: number;
  columns: Array<{ key: string; label: string; width: number; visible: boolean }>;
  // Filtres
  filterSens: 'ALL' | 'ENTRANT' | 'SORTANT';
  filterType: 'ALL' | 'INTERNE' | 'EXTERNE';
  filterStatut: 'ALL' | 'ENREGISTRE' | 'EN_ATTENTE_DG' | 'ORIENTE_DG' | 'ORIENTE_DIRECTEUR' | 'EN_TRAITEMENT' | 'ASSIGNE' | 'TRAITE' | 'ARCHIVE';
  filterPriorite: 'ALL' | 'HAUTE' | 'MOYENNE' | 'BASSE';
  filterSearch: string;
  filterDateDebut: string;
  filterDateFin: string;
  filterMesAssignations: boolean;
  filterNonClassifies: boolean;
  filterAnnotationDG: 'ALL' | 'AVEC_ANNOTATION_DG' | 'SANS_ANNOTATION_DG';
  filterEntityId: string;
}

const CahierRegistre: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courriers, setCourriers] = useState<Courrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hierarchicalPath, setHierarchicalPath] = useState<Array<{ id: string; nom: string; type: string }>>([]);
  const [selectedParentEntity, setSelectedParentEntity] = useState<string | null>(null);
  const [hierarchicalLevel, setHierarchicalLevel] = useState<number>(0);
  const [mesAssignations, setMesAssignations] = useState<Set<string>>(new Set());

  // Déterminer si "Mes assignations" doit être activé par défaut (DG et Directeurs)
  const shouldEnableMesAssignationsByDefault = user?.role === Role.DIRECTEUR_GENERAL || user?.role === Role.DIRECTEUR;

  const [registreConfig, setRegistreConfig] = useState<RegistreConfig>({
    title: 'Cahier Registre des Courriers',
    subtitle: '',
    organisationName: '',
    organisationAddress: '',
    showHeader: true,
    includeQrCode: false,
    qrBaseUrl: window.location.origin + '/courriers/',
    includeStats: true,
    showBorders: true,
    showRowNumbers: true,
    paperSize: 'a4',
    orientation: 'landscape',
    fontSize: 9,
    tableAlign: 'center',
    tableMargin: 10,
    columnPadding: 2,
    columns: [
      { key: 'numero', label: 'N° Courrier', width: 28, visible: true },
      { key: 'dateReception', label: 'Date', width: 22, visible: true },
      { key: 'expediteur', label: 'Expéditeur', width: 38, visible: true },
      { key: 'destinataire', label: 'Destinataire', width: 38, visible: true },
      { key: 'objet', label: 'Objet', width: 60, visible: true },
      { key: 'statut', label: 'Statut', width: 28, visible: true },
      { key: 'priorite', label: 'Priorité', width: 22, visible: true },
    ],
    filterSens: 'ALL',
    filterType: 'ALL',
    filterStatut: 'ALL',
    filterPriorite: 'ALL',
    filterSearch: '',
    filterDateDebut: '',
    filterDateFin: '',
    filterMesAssignations: false,
    filterNonClassifies: false,
    filterAnnotationDG: 'ALL',
    filterEntityId: 'ALL',
  });

  // Charger les courriers
  useEffect(() => {
    loadCourriers();
  }, []);

  const loadCourriers = async () => {
    try {
      setLoading(true);
      // Utiliser getAccessibleCourriers pour respecter les permissions par rôle (comme dans ListeCourriers)
      const data = user ? await courrierService.getAccessibleCourriers(user.id, user) : [];
      setCourriers(data);

      // Charger les assignations de l'utilisateur
      if (user) {
        const assignations = await courrierService.getAssignationsByUser(user.id);
        setMesAssignations(new Set(assignations.map(a => a.courrierId)));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des courriers:', error);
    } finally {
      setLoading(false);
    }
  };

  // Adapter les colonnes selon le sens et le type filtrés
  const adaptColumnsToFilters = useCallback((filterSens: string, filterType: string) => {
    const sens = filterSens && filterSens !== 'ALL' ? filterSens as SensCourrier : SensCourrier.ENTRANT;
    const type = filterType && filterType !== 'ALL' ? filterType as TypeCourrier : TypeCourrier.EXTERNE;
    
    const displayFields = formulaireCourrierService.getDisplayFields(sens, type);
    
    setRegistreConfig(prev => {
      const existingColumnsMap = new Map(prev.columns.map(col => [col.key, col]));
      const newColumns: Array<{ key: string; label: string; width: number; visible: boolean }> = [];
      displayFields.forEach(field => {
        const existingCol = existingColumnsMap.get(field.name);
        newColumns.push({
          key: field.name,
          label: field.label,
          width: 35,
          visible: existingCol?.visible ?? true,
        });
      });
      return { ...prev, columns: newColumns };
    });
  }, []);

  useEffect(() => {
    adaptColumnsToFilters(registreConfig.filterSens, registreConfig.filterType);
  }, [registreConfig.filterSens, registreConfig.filterType, adaptColumnsToFilters]);

  // Handlers pour les filtres
  const handleFilterSens = (sens: 'ALL' | 'ENTRANT' | 'SORTANT') => {
    setRegistreConfig(prev => ({ ...prev, filterSens: sens }));
  };

  const handleFilterType = (type: 'ALL' | 'INTERNE' | 'EXTERNE') => {
    setRegistreConfig(prev => ({ ...prev, filterType: type }));
  };

  const handleFilterStatut = (statut: string) => {
    setRegistreConfig(prev => ({ ...prev, filterStatut: statut as any }));
  };

  const handleFilterPriorite = (priorite: string) => {
    setRegistreConfig(prev => ({ ...prev, filterPriorite: priorite as any }));
  };

  const handleFilterAnnotationDG = (annotationDG: string) => {
    setRegistreConfig(prev => ({ ...prev, filterAnnotationDG: annotationDG as any }));
  };

  const handleFilterSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterSearch: e.target.value }));
  };

  const handleFilterDateDebutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterDateDebut: e.target.value }));
  };

  const handleFilterDateFinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterDateFin: e.target.value }));
  };

  const handleFilterMesAssignationsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterMesAssignations: e.target.checked }));
  };

  const handleFilterNonClassifiesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegistreConfig(prev => ({ ...prev, filterNonClassifies: e.target.checked }));
  };

  // Utilitaire : valeur d'une cellule
  const getCellValue = (c: Courrier, key: string, dgAnnotationMap: Map<string, string>): string => {
    if (key === 'numero') return c.numero || '-';
    if (key === 'dateReception') return exportSettingsService.formatDate(c.dateReception);
    if (key === 'statut') return c.statut || '-';
    if (key === 'priorite') return c.priorite || '-';
    if (key === 'annotationDG') {
      const v = dgAnnotationMap.get(c.id);
      return v ? (v.length > 35 ? v.substring(0, 32) + '...' : v) : '-';
    }
    if (c.extraFields && key in c.extraFields) return String(c.extraFields[key] || '-');
    return String((c as any)[key] || '-');
  };

  // Fonction pour générer le registre PDF — style tableau Word
  const handleGenerateRegistre = async (preview = false) => {
    try {
      // ── Filtrage ──
      let filteredCourriers = courriers;
      if (registreConfig.filterSens !== 'ALL') filteredCourriers = filteredCourriers.filter(c => c.sens === registreConfig.filterSens);
      if (registreConfig.filterType !== 'ALL') filteredCourriers = filteredCourriers.filter(c => c.type === registreConfig.filterType);
      if (registreConfig.filterStatut !== 'ALL') filteredCourriers = filteredCourriers.filter(c => c.statut === registreConfig.filterStatut);
      if (registreConfig.filterPriorite !== 'ALL') filteredCourriers = filteredCourriers.filter(c => c.priorite === registreConfig.filterPriorite);
      if (registreConfig.filterDateDebut) filteredCourriers = filteredCourriers.filter(c => new Date(c.dateReception) >= new Date(registreConfig.filterDateDebut));
      if (registreConfig.filterDateFin) filteredCourriers = filteredCourriers.filter(c => new Date(c.dateReception) <= new Date(registreConfig.filterDateFin));
      if (registreConfig.filterSearch) {
        const q = registreConfig.filterSearch.toLowerCase();
        filteredCourriers = filteredCourriers.filter(c =>
          (c.numero || '').toLowerCase().includes(q) ||
          (c.objet || '').toLowerCase().includes(q) ||
          (c.expediteur || '').toLowerCase().includes(q) ||
          (c.destinataire || '').toLowerCase().includes(q)
        );
      }
      if (registreConfig.filterMesAssignations) filteredCourriers = filteredCourriers.filter(c => mesAssignations.has(c.id));
      if (registreConfig.filterNonClassifies) filteredCourriers = filteredCourriers.filter(c => !c.categorieId);

      // ── Annotations DG ──
      const dgAnnotationMap = new Map<string, string>();
      if (registreConfig.filterAnnotationDG !== 'ALL' || registreConfig.columns.some(col => col.key === 'annotationDG' && col.visible)) {
        const dgUser = adminService.getDirecteurGeneral();
        if (dgUser) {
          const dgIds = new Set<string>();
          for (const c of filteredCourriers) {
            try {
              const anns = await courrierService.getAnnotationsByCourrier(c.id);
              const a = anns.find(x => x.auteur === dgUser.id);
              if (a) { dgIds.add(c.id); dgAnnotationMap.set(c.id, a.contenu); }
            } catch { /* silencieux */ }
          }
          if (registreConfig.filterAnnotationDG === 'AVEC_ANNOTATION_DG') filteredCourriers = filteredCourriers.filter(c => dgIds.has(c.id));
          else if (registreConfig.filterAnnotationDG === 'SANS_ANNOTATION_DG') filteredCourriers = filteredCourriers.filter(c => !dgIds.has(c.id));
        }
      }

      // ── QR codes pré-générés ──
      const qrDataUrls = new Map<string, string>();
      if (registreConfig.includeQrCode) {
        for (const c of filteredCourriers) {
          try {
            const url = `${registreConfig.qrBaseUrl}${c.id}`;
            const dataUrl = await QRCode.toDataURL(url, { width: 48, margin: 1, errorCorrectionLevel: 'M' });
            qrDataUrls.set(c.id, dataUrl);
          } catch { /* silencieux */ }
        }
      }

      // ── Init PDF ──
      const jsPdfOrientation = registreConfig.orientation === 'landscape' ? 'l' : 'p';
      const doc = new jsPDF(jsPdfOrientation, 'mm', registreConfig.paperSize);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;

      // ── Couleurs style Word ──
      const wordHeaderBg: [number, number, number] = [31, 78, 121];   // bleu Word
      const wordHeaderText: [number, number, number] = [255, 255, 255];
      const wordBorder: [number, number, number] = [180, 198, 231];   // bleu clair
      const wordRowAlt: [number, number, number] = [222, 235, 247];   // bleu très pâle
      const wordRowWhite: [number, number, number] = [255, 255, 255];
      const wordText: [number, number, number] = [31, 31, 31];
      const footerColor: [number, number, number] = [128, 128, 128];

      // ── QR column width ──
      const qrColW = registreConfig.includeQrCode ? 14 : 0;
      const rowNumColW = registreConfig.showRowNumbers ? 10 : 0;

      // ── Colonnes visibles ──
      let visibleColumns = registreConfig.columns.filter(col => col.visible);
      const colKeys = visibleColumns.map(c => c.key);
      const colLabels = visibleColumns.map(c => c.label);

      // ── Calculer largeurs des colonnes de données ──
      doc.setFontSize(registreConfig.fontSize);
      const totalQrNum = qrColW + rowNumColW;
      const dataAvailW = pageWidth - 2 * margin - totalQrNum;
      const configWidths = visibleColumns.map(col => col.width);
      const configTotal = configWidths.reduce((a, b) => a + b, 0);
      const colWidths = configWidths.map(w => (w / configTotal) * dataAvailW);
      const tableWidth = colWidths.reduce((a, b) => a + b, 0) + totalQrNum;

      let startX = margin;
      if (registreConfig.tableAlign === 'center') startX = (pageWidth - tableWidth) / 2;
      else if (registreConfig.tableAlign === 'right') startX = pageWidth - tableWidth - margin;

      // ── Hauteurs ──
      const rowH = registreConfig.includeQrCode ? 16 : 7;
      const headerRowH = 9;

      // ── Fonction dessiner en-tête de tableau ──
      const drawTableHeader = (y: number) => {
        let x = startX;
        doc.setFillColor(...wordHeaderBg);
        doc.setDrawColor(...wordBorder);
        doc.setLineWidth(0.3);

        if (registreConfig.showRowNumbers) {
          doc.rect(x, y, rowNumColW, headerRowH, 'FD');
          doc.setFontSize(registreConfig.fontSize - 1);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...wordHeaderText);
          doc.text('#', x + rowNumColW / 2, y + headerRowH / 2 + 1.5, { align: 'center' });
          x += rowNumColW;
        }
        colLabels.forEach((label, i) => {
          doc.setFillColor(...wordHeaderBg);
          doc.rect(x, y, colWidths[i], headerRowH, 'FD');
          doc.setFontSize(registreConfig.fontSize - 1);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...wordHeaderText);
          const maxChars = Math.floor(colWidths[i] / 1.8);
          const txt = label.length > maxChars ? label.substring(0, maxChars - 1) + '.' : label;
          doc.text(txt, x + 2, y + headerRowH / 2 + 1.5);
          x += colWidths[i];
        });
        if (registreConfig.includeQrCode) {
          doc.setFillColor(...wordHeaderBg);
          doc.rect(x, y, qrColW, headerRowH, 'FD');
          doc.setFontSize(registreConfig.fontSize - 1);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...wordHeaderText);
          doc.text('QR', x + qrColW / 2, y + headerRowH / 2 + 1.5, { align: 'center' });
        }
        doc.setTextColor(...wordText);
      };

      // ── Fonction dessiner ligne de données ──
      const drawDataRow = (c: Courrier, rowIndex: number, y: number, globalIndex: number) => {
        const isAlt = rowIndex % 2 === 1;
        const bgColor = isAlt ? wordRowAlt : wordRowWhite;
        let x = startX;

        if (registreConfig.showRowNumbers) {
          doc.setFillColor(...bgColor);
          doc.setDrawColor(...wordBorder);
          doc.setLineWidth(0.2);
          doc.rect(x, y, rowNumColW, rowH, 'FD');
          doc.setFontSize(registreConfig.fontSize - 1);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 100, 100);
          doc.text(String(globalIndex + 1), x + rowNumColW / 2, y + rowH / 2 + 1.5, { align: 'center' });
          x += rowNumColW;
        }

        colKeys.forEach((key, i) => {
          doc.setFillColor(...bgColor);
          doc.setDrawColor(...wordBorder);
          doc.setLineWidth(0.2);
          doc.rect(x, y, colWidths[i], rowH, 'FD');
          doc.setFontSize(registreConfig.fontSize);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...wordText);
          const raw = getCellValue(c, key, dgAnnotationMap);
          const maxChars = Math.floor(colWidths[i] / (registreConfig.fontSize * 0.22));
          const txt = raw.length > maxChars ? raw.substring(0, maxChars - 1) + '…' : raw;
          // centrage vertical
          const textY = registreConfig.includeQrCode ? y + rowH / 2 + 1.5 : y + rowH / 2 + 1.5;
          doc.text(txt, x + 2, textY);
          x += colWidths[i];
        });

        if (registreConfig.includeQrCode) {
          doc.setFillColor(...bgColor);
          doc.setDrawColor(...wordBorder);
          doc.setLineWidth(0.2);
          doc.rect(x, y, qrColW, rowH, 'FD');
          const qrData = qrDataUrls.get(c.id);
          if (qrData) {
            try {
              doc.addImage(qrData, 'PNG', x + 1, y + 1, qrColW - 2, rowH - 2);
            } catch { /* silencieux */ }
          }
        }
      };

      // ── Dessiner en-tête du document (page 1 seulement) ──
      let yCursor = margin;

      if (registreConfig.showHeader) {
        // Cadre d'en-tête
        doc.setDrawColor(...wordBorder);
        doc.setLineWidth(0.5);
        doc.rect(margin, yCursor, pageWidth - 2 * margin, registreConfig.organisationName ? 28 : 22);

        // Nom organisation
        if (registreConfig.organisationName) {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(31, 78, 121);
          doc.text(registreConfig.organisationName, pageWidth / 2, yCursor + 8, { align: 'center' });
          if (registreConfig.organisationAddress) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80, 80, 80);
            doc.text(registreConfig.organisationAddress, pageWidth / 2, yCursor + 13, { align: 'center' });
          }
        }

        // Titre principal
        const titleY = registreConfig.organisationName ? yCursor + 19 : yCursor + 9;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 78, 121);
        doc.text(registreConfig.title, pageWidth / 2, titleY, { align: 'center' });

        // Sous-titre
        if (registreConfig.subtitle) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(80, 80, 80);
          doc.text(registreConfig.subtitle, pageWidth / 2, titleY + 5, { align: 'center' });
        }

        yCursor += registreConfig.organisationName ? 32 : 26;

        // Barre d'infos (période, total)
        doc.setFillColor(240, 246, 255);
        doc.setDrawColor(...wordBorder);
        doc.setLineWidth(0.3);
        doc.rect(margin, yCursor, pageWidth - 2 * margin, 8, 'FD');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(31, 78, 121);
        const periodLabel = registreConfig.filterDateDebut && registreConfig.filterDateFin
          ? `Période : ${new Date(registreConfig.filterDateDebut).toLocaleDateString('fr-FR')} → ${new Date(registreConfig.filterDateFin).toLocaleDateString('fr-FR')}   |   `
          : '';
        doc.text(
          `${periodLabel}Total : ${filteredCourriers.length} courrier(s)   |   Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
          pageWidth / 2, yCursor + 5, { align: 'center' }
        );
        yCursor += 11;
      }

      // ── Statistiques ──
      if (registreConfig.includeStats) {
        const entrants = filteredCourriers.filter(c => c.sens === SensCourrier.ENTRANT).length;
        const sortants = filteredCourriers.filter(c => c.sens === SensCourrier.SORTANT).length;
        doc.setFillColor(248, 251, 255);
        doc.setDrawColor(...wordBorder);
        doc.setLineWidth(0.3);
        doc.rect(margin, yCursor, pageWidth - 2 * margin, 7, 'FD');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 78, 121);
        doc.text(`Entrants : ${entrants}`, margin + 5, yCursor + 4.5);
        doc.setTextColor(139, 69, 19);
        doc.text(`Sortants : ${sortants}`, margin + 45, yCursor + 4.5);
        yCursor += 10;
      }

      // ── Premier en-tête de tableau ──
      drawTableHeader(yCursor);
      yCursor += headerRowH;

      // ── Lignes de données ──
      let pageIndex = 0;
      const totalPages = Math.ceil(filteredCourriers.length / Math.max(1, Math.floor((pageHeight - yCursor - 20) / rowH)));

      const drawFooter = (pg: number) => {
        doc.setFontSize(7);
        doc.setTextColor(...footerColor);
        doc.setDrawColor(...wordBorder);
        doc.setLineWidth(0.2);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        doc.text(`${registreConfig.title}`, margin, pageHeight - 8);
        doc.text(`Page ${pg + 1}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
        doc.text(`Total : ${filteredCourriers.length} courrier(s)`, pageWidth - margin, pageHeight - 8, { align: 'right' });
      };

      filteredCourriers.forEach((c, idx) => {
        if (yCursor + rowH > pageHeight - 16) {
          drawFooter(pageIndex);
          doc.addPage();
          pageIndex++;
          yCursor = margin;
          drawTableHeader(yCursor);
          yCursor += headerRowH;
        }
        drawDataRow(c, idx, yCursor, idx);
        yCursor += rowH;
      });

      // Fermer le tableau (bordure basse)
      doc.setDrawColor(...wordBorder);
      doc.setLineWidth(0.3);
      doc.line(startX, yCursor, startX + tableWidth, yCursor);

      drawFooter(pageIndex);

      // ── Export ──
      if (preview) {
        const blobUrl = URL.createObjectURL(doc.output('blob'));
        setPreviewUrl(blobUrl);
        setShowPreviewModal(true);
      } else {
        doc.save(`registre-courriers-${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (e) {
      console.error('[Registre PDF] Erreur:', e);
      alert(`Erreur lors de la génération du registre : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const [activeTab, setActiveTab] = useState<'entete' | 'mise-en-page' | 'filtres' | 'colonnes'>('entete');

  // ── Computed: filtered count preview ──
  const previewCount = courriers.filter(c =>
    (registreConfig.filterSens === 'ALL' || c.sens === registreConfig.filterSens) &&
    (registreConfig.filterType === 'ALL' || c.type === registreConfig.filterType) &&
    (registreConfig.filterStatut === 'ALL' || c.statut === registreConfig.filterStatut)
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Chargement…</span>
        </div>
      </div>
    );
  }

  // ─── Shared styles ───
  const fieldCls = 'w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors';
  const selectCls = fieldCls;

  const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">{children}</p>
  );

  const Divider = () => <hr className="border-slate-100 my-5" />;

  const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-3 rounded text-xs font-medium transition-colors border ${
        active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800'
      }`}
    >{children}</button>
  );

  const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }> = ({ checked, onChange, label, description }) => (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-slate-900' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      <div>
        <p className="text-sm font-medium text-slate-800 leading-tight">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
    </label>
  );

  const navItems: Array<{ id: typeof activeTab; icon: any; label: string }> = [
    { id: 'entete',      icon: faBuilding, label: 'En-tête' },
    { id: 'mise-en-page', icon: faTable,   label: 'Mise en page' },
    { id: 'filtres',     icon: faFilter,   label: 'Filtres' },
    { id: 'colonnes',    icon: faColumns,  label: 'Colonnes' },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/courriers')}
            className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="text-sm" />
          </button>
          <div className="w-px h-4 bg-slate-200" />
          <FontAwesomeIcon icon={faBook} className="text-slate-400 text-sm" />
          <h1 className="text-sm font-semibold text-slate-800">Cahier Registre</h1>
          <span className="ml-1 text-xs text-slate-400 font-normal">{courriers.length} courriers</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGenerateRegistre(true)}
            className="h-8 px-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <FontAwesomeIcon icon={faEye} className="text-slate-400" />
            Aperçu
          </button>
          <button
            onClick={() => handleGenerateRegistre(false)}
            className="h-8 px-4 flex items-center gap-2 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors"
          >
            <FontAwesomeIcon icon={faPrint} />
            Générer le PDF
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left nav ── */}
        <nav className="w-52 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col py-4 gap-0.5 px-2">
          {navItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-3 h-9 px-3 rounded-md text-sm font-medium transition-colors w-full text-left ${
                activeTab === item.id
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <FontAwesomeIcon icon={item.icon} className={`w-3.5 h-3.5 flex-shrink-0 ${activeTab === item.id ? 'text-slate-700' : 'text-slate-400'}`} />
              {item.label}
            </button>
          ))}

          <div className="mt-auto pt-4 px-1 border-t border-slate-100 mx-1">
            <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Courriers sélectionnés</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{previewCount}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">sur {courriers.length} total</p>
            </div>
          </div>
        </nav>

        {/* ── Content panel ── */}
        <main className="flex-1 overflow-y-auto px-8 py-7">

          {/* ─── EN-TÊTE ─── */}
          {activeTab === 'entete' && (
            <div className="max-w-xl space-y-0">
              <h2 className="text-base font-semibold text-slate-900 mb-5">En-tête du document</h2>

              <Toggle
                checked={registreConfig.showHeader}
                onChange={v => setRegistreConfig(p => ({ ...p, showHeader: v }))}
                label="Afficher un en-tête"
                description="Ajoute une section d'en-tête avec le nom, titre et sous-titre"
              />

              {registreConfig.showHeader && (
                <>
                  <Divider />
                  <div className="space-y-4">
                    <div>
                      <SectionLabel>Organisation</SectionLabel>
                      <input
                        className={fieldCls}
                        value={registreConfig.organisationName}
                        onChange={e => setRegistreConfig(p => ({ ...p, organisationName: e.target.value }))}
                        placeholder="Ex : Ministère de l'Intérieur"
                      />
                    </div>
                    <div>
                      <SectionLabel>Adresse ou localité</SectionLabel>
                      <input
                        className={fieldCls}
                        value={registreConfig.organisationAddress}
                        onChange={e => setRegistreConfig(p => ({ ...p, organisationAddress: e.target.value }))}
                        placeholder="Ex : Dakar, Sénégal"
                      />
                    </div>
                    <div>
                      <SectionLabel>Titre du registre</SectionLabel>
                      <input
                        className={fieldCls}
                        value={registreConfig.title}
                        onChange={e => setRegistreConfig(p => ({ ...p, title: e.target.value }))}
                        placeholder="Cahier Registre des Courriers"
                      />
                    </div>
                    <div>
                      <SectionLabel>Sous-titre <span className="normal-case font-normal">(optionnel)</span></SectionLabel>
                      <input
                        className={fieldCls}
                        value={registreConfig.subtitle}
                        onChange={e => setRegistreConfig(p => ({ ...p, subtitle: e.target.value }))}
                        placeholder="Ex : Exercice 2025 — Direction Générale"
                      />
                    </div>
                  </div>
                </>
              )}

              <Divider />

              <div className="space-y-4">
                <Toggle
                  checked={registreConfig.includeQrCode}
                  onChange={v => setRegistreConfig(p => ({ ...p, includeQrCode: v }))}
                  label="QR code par ligne"
                  description="Génère un code QR pointant vers chaque courrier"
                />
                {registreConfig.includeQrCode && (
                  <div>
                    <SectionLabel>URL de base</SectionLabel>
                    <input
                      className={fieldCls}
                      value={registreConfig.qrBaseUrl}
                      onChange={e => setRegistreConfig(p => ({ ...p, qrBaseUrl: e.target.value }))}
                      placeholder="https://monapp.com/courriers/"
                    />
                    <p className="text-xs text-slate-400 mt-1.5">L'identifiant du courrier est automatiquement ajouté en fin d'URL.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── MISE EN PAGE ─── */}
          {activeTab === 'mise-en-page' && (
            <div className="max-w-xl space-y-0">
              <h2 className="text-base font-semibold text-slate-900 mb-5">Mise en page du PDF</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SectionLabel>Format</SectionLabel>
                  <select className={selectCls} value={registreConfig.paperSize}
                    onChange={e => setRegistreConfig(p => ({ ...p, paperSize: e.target.value as any }))}>
                    <option value="a4">A4 — 210 × 297 mm</option>
                    <option value="a3">A3 — 297 × 420 mm</option>
                    <option value="letter">Letter — 216 × 279 mm</option>
                  </select>
                </div>
                <div>
                  <SectionLabel>Orientation</SectionLabel>
                  <select className={selectCls} value={registreConfig.orientation}
                    onChange={e => setRegistreConfig(p => ({ ...p, orientation: e.target.value as any }))}>
                    <option value="landscape">Paysage</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </div>
              </div>

              <Divider />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SectionLabel>Taille de police</SectionLabel>
                  <select className={selectCls} value={registreConfig.fontSize}
                    onChange={e => setRegistreConfig(p => ({ ...p, fontSize: parseInt(e.target.value) as any }))}>
                    <option value="8">8 pt — très compact</option>
                    <option value="9">9 pt — compact</option>
                    <option value="10">10 pt — normal</option>
                    <option value="11">11 pt — lisible</option>
                    <option value="12">12 pt — aéré</option>
                  </select>
                </div>
                <div>
                  <SectionLabel>Alignement du tableau</SectionLabel>
                  <select className={selectCls} value={registreConfig.tableAlign}
                    onChange={e => setRegistreConfig(p => ({ ...p, tableAlign: e.target.value as any }))}>
                    <option value="left">Aligné à gauche</option>
                    <option value="center">Centré</option>
                    <option value="right">Aligné à droite</option>
                  </select>
                </div>
              </div>

              <Divider />

              <div className="space-y-3.5">
                <SectionLabel>Options du tableau</SectionLabel>
                <Toggle checked={registreConfig.showRowNumbers} onChange={v => setRegistreConfig(p => ({ ...p, showRowNumbers: v }))}
                  label="Numéros de ligne" description="Ajoute une colonne # au début du tableau" />
                <Toggle checked={registreConfig.showBorders} onChange={v => setRegistreConfig(p => ({ ...p, showBorders: v }))}
                  label="Bordures visibles" description="Affiche les bordures de cellules du tableau" />
                <Toggle checked={registreConfig.includeStats} onChange={v => setRegistreConfig(p => ({ ...p, includeStats: v }))}
                  label="Résumé statistique" description="Ajoute une ligne entrants / sortants avant le tableau" />
              </div>

              <Divider />

              {/* Preview miniature */}
              <div>
                <SectionLabel>Aperçu du style</SectionLabel>
                <div className="mt-1 rounded-md border border-slate-200 overflow-hidden text-[10px] bg-white shadow-sm">
                  <div className="flex bg-[#1f4e79] text-white font-semibold">
                    {registreConfig.showRowNumbers && <div className="w-7 px-2 py-1.5 border-r border-[#b4c6e7] text-center shrink-0">#</div>}
                    <div className="flex-1 px-2 py-1.5 border-r border-[#b4c6e7]">N° Courrier</div>
                    <div className="flex-1 px-2 py-1.5 border-r border-[#b4c6e7]">Expéditeur</div>
                    <div className="flex-2 px-2 py-1.5">Objet</div>
                  </div>
                  {(['C-2025-001|Dir. RH|Demande de congé annuel', 'C-2025-002|Ministère|Note de service N°12']).map((row, i) => {
                    const [ref, exp, obj] = row.split('|');
                    return (
                      <div key={i} className={`flex border-t border-[#b4c6e7] ${i % 2 === 1 ? 'bg-[#deeaf7]' : 'bg-white'}`}>
                        {registreConfig.showRowNumbers && <div className="w-7 px-2 py-1.5 border-r border-[#b4c6e7] text-center text-slate-400 shrink-0">{i + 1}</div>}
                        <div className="flex-1 px-2 py-1.5 border-r border-[#b4c6e7] font-mono text-slate-700">{ref}</div>
                        <div className="flex-1 px-2 py-1.5 border-r border-[#b4c6e7] text-slate-700">{exp}</div>
                        <div className="flex-2 px-2 py-1.5 text-slate-700">{obj}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── FILTRES ─── */}
          {activeTab === 'filtres' && (
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-slate-900 mb-5">Filtres de sélection</h2>

              <div className="space-y-6">
                {/* Sens */}
                <div>
                  <SectionLabel>Sens du courrier</SectionLabel>
                  <div className="flex gap-1.5">
                    <Chip active={registreConfig.filterSens === 'ALL'} onClick={() => handleFilterSens('ALL')}>Tous</Chip>
                    <Chip active={registreConfig.filterSens === 'ENTRANT'} onClick={() => handleFilterSens('ENTRANT')}>Entrant</Chip>
                    <Chip active={registreConfig.filterSens === 'SORTANT'} onClick={() => handleFilterSens('SORTANT')}>Sortant</Chip>
                  </div>
                </div>

                {/* Type */}
                <div>
                  <SectionLabel>Type</SectionLabel>
                  <div className="flex gap-1.5">
                    <Chip active={registreConfig.filterType === 'ALL'} onClick={() => handleFilterType('ALL')}>Tous</Chip>
                    <Chip active={registreConfig.filterType === 'EXTERNE'} onClick={() => handleFilterType('EXTERNE')}>Externe</Chip>
                    <Chip active={registreConfig.filterType === 'INTERNE'} onClick={() => handleFilterType('INTERNE')}>Interne</Chip>
                  </div>
                </div>

                {/* Statut */}
                <div>
                  <SectionLabel>Statut</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={registreConfig.filterStatut === 'ALL'} onClick={() => handleFilterStatut('ALL')}>Tous</Chip>
                    <Chip active={registreConfig.filterStatut === 'EN_ATTENTE_DG'} onClick={() => handleFilterStatut('EN_ATTENTE_DG')}>En attente</Chip>
                    <Chip active={registreConfig.filterStatut === 'ORIENTE_DG'} onClick={() => handleFilterStatut('ORIENTE_DG')}>Orienté DG</Chip>
                    <Chip active={registreConfig.filterStatut === 'EN_TRAITEMENT'} onClick={() => handleFilterStatut('EN_TRAITEMENT')}>En cours</Chip>
                    <Chip active={registreConfig.filterStatut === 'ASSIGNE'} onClick={() => handleFilterStatut('ASSIGNE')}>Assigné</Chip>
                    <Chip active={registreConfig.filterStatut === 'TRAITE'} onClick={() => handleFilterStatut('TRAITE')}>Traité</Chip>
                    <Chip active={registreConfig.filterStatut === 'ARCHIVE'} onClick={() => handleFilterStatut('ARCHIVE')}>Archivé</Chip>
                  </div>
                </div>

                <Divider />

                {/* Période */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <SectionLabel>Date début</SectionLabel>
                    <input type="date" className={fieldCls} value={registreConfig.filterDateDebut} onChange={handleFilterDateDebutChange} />
                  </div>
                  <div>
                    <SectionLabel>Date fin</SectionLabel>
                    <input type="date" className={fieldCls} value={registreConfig.filterDateFin} onChange={handleFilterDateFinChange} />
                  </div>
                </div>

                {/* Recherche */}
                <div>
                  <SectionLabel>Recherche textuelle</SectionLabel>
                  <input
                    type="text"
                    className={fieldCls}
                    value={registreConfig.filterSearch}
                    onChange={handleFilterSearchChange}
                    placeholder="Numéro, objet, expéditeur, destinataire…"
                  />
                </div>

                <Divider />

                <div className="space-y-3">
                  <Toggle
                    checked={registreConfig.filterMesAssignations}
                    onChange={v => setRegistreConfig(p => ({ ...p, filterMesAssignations: v }))}
                    label="Mes assignations uniquement"
                    description="N'inclut que les courriers qui vous sont assignés"
                  />
                  <Toggle
                    checked={registreConfig.filterNonClassifies}
                    onChange={v => setRegistreConfig(p => ({ ...p, filterNonClassifies: v }))}
                    label="Non classés uniquement"
                    description="N'inclut que les courriers sans catégorie"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── COLONNES ─── */}
          {activeTab === 'colonnes' && (
            <div className="max-w-lg">
              <h2 className="text-base font-semibold text-slate-900 mb-1">Colonnes du tableau</h2>
              <p className="text-sm text-slate-400 mb-5">Sélectionnez les colonnes à inclure et ajustez leur largeur relative.</p>

              <div className="border border-slate-200 rounded-md overflow-hidden bg-white divide-y divide-slate-100">
                {/* Header row */}
                <div className="flex items-center px-4 py-2 bg-slate-50">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex-1">Colonne</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-24 text-right">Largeur</span>
                </div>
                {registreConfig.columns.map((col, index) => (
                  <div key={col.key} className={`flex items-center gap-3 px-4 py-3 transition-colors ${col.visible ? 'bg-white' : 'bg-slate-50'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        const cols = [...registreConfig.columns];
                        cols[index] = { ...cols[index], visible: !col.visible };
                        setRegistreConfig(p => ({ ...p, columns: cols }));
                      }}
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        col.visible ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'
                      }`}
                    >
                      {col.visible && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span className={`flex-1 text-sm ${col.visible ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{col.label}</span>
                    <div className="flex items-center gap-2 w-24 justify-end">
                      <input
                        type="number"
                        min={10}
                        max={120}
                        value={col.width}
                        disabled={!col.visible}
                        onChange={e => {
                          const cols = [...registreConfig.columns];
                          cols[index] = { ...cols[index], width: Number(e.target.value) };
                          setRegistreConfig(p => ({ ...p, columns: cols }));
                        }}
                        className="w-14 h-7 px-2 rounded border border-slate-200 text-xs text-right text-slate-700 disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                      <span className="text-[10px] text-slate-400">px</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── Modal Aperçu PDF ── */}
      {showPreviewModal && previewUrl && (
        <div
          className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => { URL.revokeObjectURL(previewUrl); setShowPreviewModal(false); setPreviewUrl(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-[96vw] h-[92vh] flex flex-col overflow-hidden border border-slate-200/80"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <FontAwesomeIcon icon={faFileAlt} className="text-slate-400 text-sm" />
                <span className="text-sm font-semibold text-slate-800">Aperçu — Cahier Registre</span>
                <span className="text-xs text-slate-400 font-normal">· {previewCount} courrier{previewCount > 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleGenerateRegistre(false)}
                  className="h-8 px-4 flex items-center gap-2 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors"
                >
                  <FontAwesomeIcon icon={faPrint} />
                  Télécharger le PDF
                </button>
                <button
                  onClick={() => { URL.revokeObjectURL(previewUrl); setShowPreviewModal(false); setPreviewUrl(null); }}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-sm" />
                </button>
              </div>
            </div>
            {/* PDF viewer */}
            <div className="flex-1 min-h-0 bg-slate-100 p-3">
              <iframe
                src={previewUrl}
                className="w-full h-full rounded-lg border border-slate-200"
                title="Aperçu du registre PDF"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CahierRegistre;
