import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatutCourrier, Priorite, TypeCourrier, SensCourrier } from '../types';
import { exportSettingsService, ExportSettings } from '../services/exportSettingsService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPrint, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

interface PrintPayload {
  courriers: any[];
  exportSettings?: ExportSettings;
  format?: 'A4' | 'A3' | 'A2' | 'A1' | 'auto';
  orientation?: 'portrait' | 'landscape';
}

const colorForStatut = (statut: string): string => {
  switch (statut) {
    case StatutCourrier.TRAITE: return '#10b981';
    case StatutCourrier.EN_TRAITEMENT: return '#3b82f6';
    case StatutCourrier.ASSIGNE: return '#8b5cf6';
    case StatutCourrier.EN_ATTENTE_DG: return '#f59e0b';
    case StatutCourrier.ENREGISTRE: return '#6b7280';
    default: return '#ef4444';
  }
};

const colorForPriorite = (priorite: string): string => {
  switch (priorite) {
    case Priorite.URGENTE: return '#ef4444';
    case Priorite.HAUTE: return '#f59e0b';
    case Priorite.NORMALE: return '#3b82f6';
    default: return '#6b7280';
  }
};

const colorForType = (type: string): string => {
  return type === TypeCourrier.EXTERNE ? '#06b6d4' : '#10b981';
};

const alignToFlex = (align?: 'left' | 'center' | 'right'): string => {
  if (align === 'center') return 'center';
  if (align === 'right') return 'flex-end';
  return 'flex-start';
};

const safeToString = (value: any): string => {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return value.toLocaleString('fr-FR');
  return String(value);
};

const applyTitleCase = (text: string, mode?: 'normal' | 'uppercase' | 'lowercase') => {
  if (!text) return '';
  if (mode === 'uppercase') return text.toUpperCase();
  if (mode === 'lowercase') return text.toLowerCase();
  return text;
};

// Convertir un logo distant en dataURL pour éviter les problèmes CORS/print
const resolveDataUrl = async (url?: string): Promise<string | undefined> => {
  if (!url) return undefined;
  if (url.startsWith('data:image/')) return url;
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    const reader = new FileReader();
    const data = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return data;
  } catch (e) {
    console.warn('Impossible de convertir le logo en dataURL', e);
    return url; // on tente quand même avec l’URL brute
  }
};

const ImpressionCourriers: React.FC = () => {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const [resolvedLogo, setResolvedLogo] = useState<string | undefined>(undefined);

  const handleAnnulerImpression = () => {
    navigate('/courriers', { replace: true });
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('print:courriers');
      if (raw) {
        setPayload(JSON.parse(raw));
      }
    } catch {
      setPayload(null);
    }
  }, []);

  const settings = useMemo<ExportSettings>(() => {
    return payload?.exportSettings || exportSettingsService.getDefaultSettings();
  }, [payload]);

  useEffect(() => {
    let active = true;
    (async () => {
      const logo = await resolveDataUrl(settings.headerLogoUrl);
      if (active) setResolvedLogo(logo);
    })();
    return () => { active = false; };
  }, [settings.headerLogoUrl]);

  const pageSize = useMemo(() => {
    const pxPerMm = 3.779528;
    const formatDims: Record<string, { w: number; h: number }> = {
      A4: { w: 210, h: 297 },
      A3: { w: 297, h: 420 },
      A2: { w: 420, h: 594 },
      A1: { w: 594, h: 841 }
    };
    const f = payload?.format && payload.format !== 'auto' ? payload.format : settings.format;
    const dims = formatDims[f || 'A4'];
    const w = (payload?.orientation || settings.orientation) === 'landscape' ? dims.h : dims.w;
    const h = (payload?.orientation || settings.orientation) === 'landscape' ? dims.w : dims.h;
    return { widthPx: Math.ceil(w * pxPerMm), heightPx: Math.ceil(h * pxPerMm) };
  }, [payload, settings]);

  if (!payload || !Array.isArray(payload.courriers)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 max-w-md text-center">
          <p className="text-slate-700 font-medium">Aucune donnée d'impression.</p>
          <p className="text-slate-500 text-sm mt-2">Veuillez relancer depuis la liste des courriers.</p>
          <button
            type="button"
            onClick={() => navigate('/courriers', { replace: true })}
            className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
            Retour à la liste des courriers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#f9fafb',
        minHeight: '100vh',
        padding: 16
      }}
    >
      <style>
        {`
        @page {
          size: ${payload.orientation || settings.orientation} ${payload.format || settings.format};
          margin: ${settings.margins.top}mm ${settings.margins.right}mm ${settings.margins.bottom}mm ${settings.margins.left}mm;
        }
        @media print {
          .print-controls { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { 
            width: auto !important; 
            min-height: auto !important; 
            border: none !important; 
            box-shadow: none !important; 
            padding: 0 !important;
          }
        }
        * { box-sizing: border-box; }
        body { font-size: 11pt; line-height: 1.35; }
        .page {
          /* valeurs d'écran, sur papier elles sont neutralisées par @media print */
          width: ${pageSize.widthPx}px;
          min-height: ${pageSize.heightPx}px;
          margin: 0 auto;
          background: #ffffff;
          padding: 0;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .courrier-card {
          break-inside: avoid; 
          page-break-inside: avoid;
          -webkit-column-break-inside: avoid;
          -webkit-region-break-inside: avoid;
        }
        h3, .field-value {
          overflow-wrap: anywhere;
          word-break: break-word;
          hyphens: auto;
          white-space: pre-wrap;
        }
      `}
      </style>

      <div className="print-controls sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-white border-b border-slate-200 shadow-sm px-4 py-3 mb-4 rounded-xl mx-4 mt-4">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <span>Aperçu avant impression</span>
          {payload?.courriers?.length != null && (
            <span className="text-slate-500 text-sm">— {payload.courriers.length} courrier(s)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAnnulerImpression}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
            Annuler l'impression
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <FontAwesomeIcon icon={faPrint} className="w-4 h-4" />
            Imprimer
          </button>
          <button
            type="button"
            onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/courriers'); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
            Fermer
          </button>
        </div>
      </div>

      <div className="page">
        <div style={{ padding: 24, borderBottom: '2px solid #111827', marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: settings.headerAlign === 'center' ? 'center' : settings.headerAlign === 'right' ? 'flex-end' : 'flex-start',
              gap: 10
            }}
          >
            {resolvedLogo || settings.headerLogoUrl ? (
              <img
                src={resolvedLogo || settings.headerLogoUrl}
                alt="Logo"
                style={{
                  width: 'auto',
                  height: 'auto',
                  maxWidth: `${(settings.headerLogoWidthMm || 24)}mm`,
                  maxHeight: `${(settings.headerLogoWidthMm || 24) * 1.5}mm`,
                  objectFit: 'contain',
                  flexShrink: 0,
                  display: 'block'
                }}
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <div style={{ flex: 1, textAlign: settings.headerAlign === 'center' ? 'center' : 'left' }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#111827', textAlign: settings.headerAlign === 'right' ? 'right' : settings.headerAlign === 'center' ? 'center' : 'left' }}>
                {applyTitleCase((settings.headerTitle || '').trim() || 'Fiche d’enregistrement', settings.headerTitleCase)}
              </h1>
              {(settings.headerSubtitle || '').trim() ? (
                <p style={{ margin: '6px 0', color: '#6b7280', textAlign: settings.headerAlign === 'right' ? 'right' : settings.headerAlign === 'center' ? 'center' : 'left' }}>{applyTitleCase(settings.headerSubtitle || '', settings.headerTitleCase)}</p>
              ) : null}
              <p style={{ margin: 0, color: '#6b7280', fontSize: 12 }}>
                Généré le {new Date().toLocaleString('fr-FR')} • Total: {payload.courriers.length} courrier(s)
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
          {payload.courriers.map((courrier: any) => {
            const statutColor = colorForStatut(courrier.statut);
            const prioriteColor = colorForPriorite(courrier.priorite);
            const typeColor = colorForType(courrier.type);
            return (
              <div key={courrier.id} style={{ border: '2px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8, marginBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                    <div style={{ width: 40, height: 40, background: '#f3f4f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      📄
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>#{safeToString(courrier.numero)}</span>
                        <span style={{ padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'white', background: statutColor }}>
                          {safeToString(courrier.statut)}
                        </span>
                        <span style={{ padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'white', background: prioriteColor }}>
                          {safeToString(courrier.priorite)}
                        </span>
                        <span style={{ padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'white', background: typeColor }}>
                          {safeToString(courrier.type)}
                        </span>
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#374151', margin: '0 0 10px 0' }}>
                        {safeToString((courrier.objet || '').replace(/<[^>]*>/g, ''))}
                      </h3>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, fontSize: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!((courrier as any).sens === SensCourrier.SORTANT && courrier.type === TypeCourrier.EXTERNE) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,160px) 1fr', gap: '8px 12px', alignItems: 'start' }}>
                        <span style={{ fontWeight: 600, color: '#4b5563' }}>Expéditeur:</span>
                        <span style={{ color: '#111827', overflowWrap: 'anywhere' }}>{safeToString(courrier.expediteur)}</span>
                      </div>
                    )}
                    {courrier.destinataire ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,160px) 1fr', gap: '8px 12px', alignItems: 'start' }}>
                        <span style={{ fontWeight: 600, color: '#4b5563' }}>Destinataire:</span>
                        <span style={{ color: '#111827', overflowWrap: 'anywhere' }}>{safeToString(courrier.destinataire)}</span>
                      </div>
                    ) : null}
                    {courrier.dateEnregistrement ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,160px) 1fr', gap: '8px 12px', alignItems: 'start' }}>
                        <span style={{ fontWeight: 600, color: '#4b5563' }}>Date d'enregistrement:</span>
                        <span style={{ color: '#111827', overflowWrap: 'anywhere' }}>
                          {new Date(courrier.dateEnregistrement).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {courrier.extraFields && typeof courrier.extraFields === 'object' ? (
                      Object.entries(courrier.extraFields).map(([k, v]) => (
                        <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,160px) 1fr', gap: '8px 12px', alignItems: 'start' }}>
                          <span style={{ fontWeight: 600, color: '#4b5563' }}>{k}:</span>
                          <span style={{ color: '#111827', overflowWrap: 'anywhere' }}>{safeToString(v)}</span>
                        </div>
                      ))
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ImpressionCourriers;

