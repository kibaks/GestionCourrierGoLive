import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { courrierService } from '../services/courrierService';
import { categorieFichierService } from '../services/categorieFichierService';
import { TypeCourrier, SensCourrier, Courrier } from '../types';
import jsPDF from 'jspdf';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

interface RegistreConfig {
  title: string;
  dateFrom: string;
  dateTo: string;
  sens: SensCourrier | 'ALL';
  type: TypeCourrier | 'ALL';
  columns: string[];
}

// Clés de colonnes et libellés par défaut (renommables et persistés)
const COLUMN_KEYS = ['numero', 'dateReception', 'expediteur', 'destinataire', 'objet', 'statut', 'accuse'] as const;
type ColumnKey = typeof COLUMN_KEYS[number];
const DEFAULT_LABELS: Record<ColumnKey, string> = {
  numero: 'N°',
  dateReception: 'Date',
  expediteur: 'Expéditeur',
  destinataire: 'Destinataire',
  objet: 'Objet',
  statut: 'Statut',
  accuse: 'Accusé',
};
const LABELS_STORAGE_KEY = 'registre_courriers_labels';

export default function RegistreCourriers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courriers, setCourriers] = useState<Courrier[]>([]);
  const [accuseMap, setAccuseMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [labels, setLabels] = useState<Record<ColumnKey, string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LABELS_STORAGE_KEY) || '{}');
      return { ...DEFAULT_LABELS, ...saved };
    } catch {
      return { ...DEFAULT_LABELS };
    }
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(labels));
  }, [labels]);
  const [config, setConfig] = useState<RegistreConfig>({
    title: 'Registre des Courriers',
    dateFrom: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    sens: 'ALL',
    type: 'ALL',
    columns: ['numero', 'dateReception', 'expediteur', 'destinataire', 'objet', 'statut'],
  });

  useEffect(() => {
    loadCourriers();
  }, [config.dateFrom, config.dateTo, config.sens, config.type]);

  const loadCourriers = async () => {
    setLoading(true);
    try {
      // Utiliser getAccessibleCourriers pour respecter les permissions par rôle (comme dans ListeCourriers)
      const accessibleCourriers = await courrierService.getAccessibleCourriers(user?.id || '', user || undefined);
      const filtered = accessibleCourriers.filter((c: Courrier) => {
        const date = new Date(c.dateReception);
        const from = new Date(config.dateFrom);
        const to = new Date(config.dateTo);
        const dateMatch = date >= from && date <= to;
        const sensMatch = config.sens === 'ALL' || c.sens === config.sens;
        const typeMatch = config.type === 'ALL' || c.type === config.type;
        return dateMatch && sensMatch && typeMatch;
      });
      setCourriers(filtered);

      // Déterminer la présence d'un accusé de réception pour chaque courrier
      try {
        const entries = await Promise.all(
          filtered.map(async (c: Courrier) => {
            try {
              const fichiers = await categorieFichierService.getCategoriesFichiersByCourrier(c.id);
              const hasAccuse = fichiers.some(f => f.type === 'fichier' && f.estAccuseReception === true);
              return [c.id, hasAccuse] as const;
            } catch {
              return [c.id, false] as const;
            }
          })
        );
        setAccuseMap(Object.fromEntries(entries));
      } catch (e) {
        console.warn('Erreur lors de la détermination des accusés de réception:', e);
      }
    } catch (error) {
      console.error('Erreur chargement courriers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const tableWidth = pageWidth - 2 * margin;
    
    // Titre
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(config.title, pageWidth / 2, 20, { align: 'center' });
    
    // Période
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Période du ${new Date(config.dateFrom).toLocaleDateString('fr-FR')} au ${new Date(config.dateTo).toLocaleDateString('fr-FR')}`,
      pageWidth / 2,
      28,
      { align: 'center' }
    );
    
    // En-têtes de tableau
    const headers = COLUMN_KEYS.map(k => labels[k]);
    const colWidths = [18, 22, 30, 30, 40, 22, 18];
    let y = 40;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    headers.forEach((header, i) => {
      doc.text(header, margin + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y);
    });
    
    // Lignes de données
    doc.setFont('helvetica', 'normal');
    courriers.forEach((c, idx) => {
      y += 7;
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      const row = [
        c.numero || '-',
        new Date(c.dateReception).toLocaleDateString('fr-FR'),
        c.expediteur || '-',
        c.destinataire || '-',
        c.objet || '-',
        c.statut || '-',
        accuseMap[c.id] ? 'Oui' : 'Non',
      ];
      row.forEach((cell, i) => {
        const truncated = String(cell).substring(0, 30);
        doc.text(truncated, margin + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y);
      });
    });
    
    // Pied de page
    doc.setFontSize(8);
    doc.text(`Total: ${courriers.length} courriers`, margin, pageHeight - 10);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    
    doc.save(`registre-courriers-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="min-h-screen bg-surface-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-surface-900">Registre des Courriers</h1>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-surface-200 rounded-lg hover:bg-surface-300"
          >
            Retour
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Configuration du Registre</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Titre</label>
              <input
                type="text"
                value={config.title}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date de début</label>
              <input
                type="date"
                value={config.dateFrom}
                onChange={(e) => setConfig({ ...config, dateFrom: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date de fin</label>
              <input
                type="date"
                value={config.dateTo}
                onChange={(e) => setConfig({ ...config, dateTo: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sens</label>
              <select
                value={config.sens}
                onChange={(e) => setConfig({ ...config, sens: e.target.value as SensCourrier | 'ALL' })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="ALL">Tous</option>
                <option value="ENTRANT">Entrant</option>
                <option value="SORTANT">Sortant</option>
              </select>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <button
              type="button"
              onClick={() => setShowColumnSettings(v => !v)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {showColumnSettings ? 'Masquer' : 'Renommer les colonnes'}
            </button>
            {showColumnSettings && (
              <div className="mt-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {COLUMN_KEYS.map(k => (
                    <div key={k}>
                      <label className="block text-xs font-medium text-surface-500 mb-1">{DEFAULT_LABELS[k]}</label>
                      <input
                        type="text"
                        value={labels[k]}
                        onChange={(e) => setLabels(prev => ({ ...prev, [k]: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        placeholder={DEFAULT_LABELS[k]}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setLabels({ ...DEFAULT_LABELS })}
                  className="mt-3 text-xs text-surface-500 hover:text-surface-700 underline"
                >
                  Réinitialiser les libellés
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {config.title} ({courriers.length} courriers)
              </h2>
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faPrint} />
                Imprimer
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-100">
                    {COLUMN_KEYS.map(k => (
                      <th key={k} className="px-4 py-2 text-left border">{labels[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {courriers.map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-surface-50'}>
                      <td className="px-4 py-2 border">{c.numero}</td>
                      <td className="px-4 py-2 border">{new Date(c.dateReception).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-2 border">{c.expediteur}</td>
                      <td className="px-4 py-2 border">{c.destinataire}</td>
                      <td className="px-4 py-2 border">{c.objet}</td>
                      <td className="px-4 py-2 border">{c.statut}</td>
                      <td className="px-4 py-2 border">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${accuseMap[c.id] ? 'bg-green-100 text-green-700' : 'bg-surface-200 text-surface-600'}`}>
                          {accuseMap[c.id] ? 'Oui' : 'Non'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
