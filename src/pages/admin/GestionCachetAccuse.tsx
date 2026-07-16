import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStamp, faSave, faRotateLeft, faEye } from '@fortawesome/free-solid-svg-icons';
import { cachetAccuseService, CachetAccuseConfig } from '../../services/cachetAccuseService';

const defaultConfig: CachetAccuseConfig = {
  organisation: '',
  forme: 'rectangle',
  couleurEncre: '#1a73e8',
  couleurFond: 'transparent',
  inclinaison: -3,
  positionX: 10,
  positionY: 10,
  largeur: 180,
  hauteur: 100,
  bordureDouble: true,
  afficherQR: false,
};

/** Dessine le tampon sur un canvas pour l'aperçu. */
function drawPreviewStamp(
  ctx: CanvasRenderingContext2D,
  config: CachetAccuseConfig,
  canvasWidth: number,
  canvasHeight: number
) {
  const mmToPx = (mm: number) => (mm / 210) * canvasWidth;
  const x = mmToPx(config.positionX);
  const y = mmToPx(config.positionY);
  const w = mmToPx(config.largeur);
  const h = mmToPx(config.hauteur);

  ctx.save();
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((config.inclinaison * Math.PI) / 180);
  ctx.translate(-cx, -cy);

  if (config.couleurFond && config.couleurFond !== 'transparent') {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = config.couleurFond;
    if (config.forme === 'rond') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = config.couleurEncre;
  ctx.lineWidth = Math.max(2, mmToPx(1) / 4);
  if (config.bordureDouble) {
    const pad = ctx.lineWidth * 2;
    if (config.forme === 'rond') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2 - pad, h / 2 - pad, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
      ctx.strokeRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    }
  } else {
    if (config.forme === 'rond') {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
  }

  ctx.fillStyle = config.couleurEncre;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleSize = Math.max(10, h * 0.12);
  const lineSize = Math.max(8, h * 0.09);
  const paddingX = w * 0.05;
  const paddingY = h * 0.08;

  ctx.font = `bold ${titleSize}px Arial, sans-serif`;
  ctx.fillText('ACCUSÉ DE RÉCEPTION', cx, y + paddingY);

  ctx.textAlign = 'left';
  ctx.font = `bold ${lineSize}px Arial, sans-serif`;
  const labelX = x + paddingX;
  const valueX = x + w * 0.45;
  let lineY = y + paddingY + titleSize + h * 0.08;
  const lineGap = lineSize * 1.4;

  const drawLine = (label: string, value: string) => {
    ctx.font = `bold ${lineSize}px Arial, sans-serif`;
    ctx.fillText(label, labelX, lineY);
    ctx.font = `${lineSize}px Arial, sans-serif`;
    ctx.fillText(value, valueX, lineY);
    lineY += lineGap;
  };

  if (config.organisation) {
    drawLine('ORGANISME :', config.organisation);
  }
  drawLine('LE :', '03/06/2026');
  drawLine('SOUS N° :', 'AR-2026-001');
  drawLine('ANNEXES :', '2');
  drawLine('PAR :', 'J. Dupont');

  ctx.restore();
}

const GestionCachetAccuse: React.FC = () => {
  const [config, setConfig] = useState<CachetAccuseConfig>({ ...defaultConfig });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    cachetAccuseService.getConfig().then((cfg) => {
      setConfig({ ...defaultConfig, ...cfg });
      setLoading(false);
    });
  }, []);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 794;
    canvas.height = 1123;

    // Fond page A4 blanche
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Lignes guide discrètes
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.5, 0);
    ctx.lineTo(canvas.width * 0.5, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, canvas.height * 0.5);
    ctx.lineTo(canvas.width, canvas.height * 0.5);
    ctx.stroke();

    // Tampon
    drawPreviewStamp(ctx, config, canvas.width, canvas.height);
  }, [config]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const updateField = <K extends keyof CachetAccuseConfig>(field: K, value: CachetAccuseConfig[K]) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await cachetAccuseService.saveConfig(config);
      setMessage({ type: 'success', text: 'Configuration du cachet enregistrée avec succès.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Erreur lors de la sauvegarde.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({ ...defaultConfig });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FontAwesomeIcon icon={faStamp} className="text-blue-600 text-2xl" />
        <h1 className="text-2xl font-bold text-gray-800">Cachet accusé de réception</h1>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panneau de configuration */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Paramètres du cachet</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nom de l'organisation</label>
              <input
                type="text"
                value={config.organisation}
                onChange={(e) => updateField('organisation', e.target.value)}
                placeholder="Ex: Direction Générale"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Forme</label>
                <select
                  value={config.forme}
                  onChange={(e) => updateField('forme', e.target.value as 'rectangle' | 'rond')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="rectangle">Rectangle</option>
                  <option value="rond">Rond</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Inclinaison (°)</label>
                <input
                  type="number"
                  value={config.inclinaison}
                  onChange={(e) => updateField('inclinaison', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Couleur d'encre</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.couleurEncre}
                    onChange={(e) => updateField('couleurEncre', e.target.value)}
                    className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <span className="text-sm text-gray-500">{config.couleurEncre}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Couleur de fond</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.couleurFond === 'transparent' ? '#ffffff' : config.couleurFond}
                    onChange={(e) => updateField('couleurFond', e.target.value)}
                    className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <label className="flex items-center gap-1 text-sm text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.couleurFond === 'transparent'}
                      onChange={(e) => updateField('couleurFond', e.target.checked ? 'transparent' : '#e3f2fd')}
                      className="rounded"
                    />
                    Transparent
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Position X (mm)</label>
                <input
                  type="number"
                  value={config.positionX}
                  onChange={(e) => updateField('positionX', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Position Y (mm)</label>
                <input
                  type="number"
                  value={config.positionY}
                  onChange={(e) => updateField('positionY', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Largeur (mm)</label>
                <input
                  type="number"
                  value={config.largeur}
                  onChange={(e) => updateField('largeur', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Hauteur (mm)</label>
                <input
                  type="number"
                  value={config.hauteur}
                  onChange={(e) => updateField('hauteur', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.bordureDouble}
                  onChange={(e) => updateField('bordureDouble', e.target.checked)}
                  className="rounded w-4 h-4"
                />
                Bordure double
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.afficherQR}
                  onChange={(e) => updateField('afficherQR', e.target.checked)}
                  className="rounded w-4 h-4"
                />
                Afficher QR code
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <FontAwesomeIcon icon={faSave} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              Réinitialiser
            </button>
          </div>
        </div>

        {/* Aperçu */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FontAwesomeIcon icon={faEye} className="text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-700">Aperçu</h2>
          </div>
          <div className="flex justify-center bg-gray-50 rounded-lg p-4 border border-gray-200 overflow-auto">
            <canvas
              ref={canvasRef}
              style={{ maxWidth: '100%', height: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            L'aperçu représente une page A4. Le cachet sera apposé sur la 1ère page du document lors de la génération de l'accusé de réception.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GestionCachetAccuse;
