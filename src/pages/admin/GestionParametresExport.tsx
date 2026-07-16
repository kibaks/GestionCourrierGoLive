import React, { useState, useEffect } from 'react';
import { exportSettingsService, ExportSettings, ExportColumn } from '../../services/exportSettingsService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFilePdf, 
  faFileExcel, 
  faFileImage, 
  faSave, 
  faUndo, 
  faCheckCircle,
  faInfoCircle,
  faColumns,
  faChevronUp,
  faChevronDown,
  faGripVertical
} from '@fortawesome/free-solid-svg-icons';

const GestionParametresExport: React.FC = () => {
  const [settings, setSettings] = useState<ExportSettings>(exportSettingsService.getDefaultSettings());
  const [saved, setSaved] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);

  useEffect(() => {
    const defaultSettings = exportSettingsService.getDefaultSettings();
    // S'assurer que les colonnes sont initialisées
    if (!defaultSettings.columns || defaultSettings.columns.length === 0) {
      defaultSettings.columns = [
        { key: 'numero', label: 'Numéro', enabled: true, width: 0.12 },
        { key: 'statut', label: 'Statut', enabled: true, width: 0.12 },
        { key: 'priorite', label: 'Priorité', enabled: true, width: 0.12 },
        { key: 'type', label: 'Type', enabled: true, width: 0.12 },
        { key: 'objet', label: 'Objet', enabled: true, width: 0.20 },
        { key: 'expediteur', label: 'Expéditeur', enabled: true, width: 0.15 },
        { key: 'destinataire', label: 'Destinataire', enabled: true, width: 0.15 },
        { key: 'dateEnregistrement', label: 'Date', enabled: true, width: 0.12 }
      ];
    }
    setSettings(defaultSettings);
  }, []);

  const handleSave = () => {
    exportSettingsService.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    if (window.confirm('Êtes-vous sûr de vouloir réinitialiser les paramètres d\'export aux valeurs par défaut ?')) {
      const defaults = exportSettingsService.resetToDefaults();
      setSettings(defaults);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* En-tête avec actions */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Configuration des exports</h3>
          <p className="text-sm text-gray-500 mt-1">
            Définissez les paramètres par défaut pour les exports PDF, Excel et Image
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
          >
            <FontAwesomeIcon icon={faUndo} />
            Réinitialiser
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <FontAwesomeIcon icon={faSave} />
            Enregistrer
          </button>
        </div>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <FontAwesomeIcon icon={faCheckCircle} className="text-green-600" />
          <span className="text-green-800 font-medium">Paramètres enregistrés avec succès !</span>
        </div>
      )}

      {/* Informations */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <FontAwesomeIcon icon={faInfoCircle} className="text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Ces paramètres s'appliquent à :</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Export PDF de l'organigramme</li>
              <li>Export Image de l'organigramme</li>
              <li>Export Excel de l'organigramme</li>
              <li>Export PDF de la liste des courriers</li>
              <li>Export Image de la liste des courriers</li>
              <li>Export Excel de la liste des courriers</li>
            </ul>
            <p className="mt-2 text-blue-600">
              Vous pouvez toujours modifier ces paramètres lors de chaque export si nécessaire.
            </p>
          </div>
        </div>
      </div>

      {/* Paramètres */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Format et orientation */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faFilePdf} className="text-gray-400" />
            Format et orientation
          </h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Format de page</label>
              <select
                value={settings.format}
                onChange={(e) => setSettings({ ...settings, format: e.target.value as any })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="auto">Auto (selon contenu)</option>
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="A2">A2</option>
                <option value="A1">A1</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Orientation</label>
              <select
                value={settings.orientation}
                onChange={(e) => setSettings({ ...settings, orientation: e.target.value as any })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Paysage</option>
              </select>
            </div>
          </div>
        </div>

        {/* Qualité et mode couleur */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faFileImage} className="text-gray-400" />
            Qualité et couleur
          </h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Qualité</label>
              <select
                value={settings.quality}
                onChange={(e) => setSettings({ ...settings, quality: e.target.value as any })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="low">Basse (rapide)</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute (lente)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mode couleur</label>
              <select
                value={settings.colorMode}
                onChange={(e) => setSettings({ ...settings, colorMode: e.target.value as any })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="color">Couleur</option>
                <option value="grayscale">Niveaux de gris</option>
                <option value="blackwhite">Noir et blanc</option>
              </select>
            </div>
          </div>
        </div>

        {/* Couleur de fond */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faFileExcel} className="text-gray-400" />
            Apparence
          </h4>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Couleur de fond</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.backgroundColor}
                onChange={(e) => setSettings({ ...settings, backgroundColor: e.target.value })}
                className="w-16 h-12 rounded-lg border-2 border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={settings.backgroundColor}
                onChange={(e) => setSettings({ ...settings, backgroundColor: e.target.value })}
                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="#ffffff"
              />
            </div>
          </div>

          {/* En-tête */}
          <div className="mt-4 space-y-3">
            <h5 className="text-sm font-semibold text-gray-700">En-tête</h5>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                checked={!!settings.headerEnabled}
                onChange={(e) => setSettings({ ...settings, headerEnabled: e.target.checked })}
              />
              <span className="text-sm text-gray-700">Activer l'en-tête</span>
            </label>
            {settings.headerEnabled && (
              <div className="grid grid-cols-1 gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Titre</label>
                    <input
                      type="text"
                      value={settings.headerTitle || ''}
                      onChange={(e) => setSettings({ ...settings, headerTitle: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Casse du titre</label>
                    <select
                      value={settings.headerTitleCase || 'normal'}
                      onChange={(e) => setSettings({ ...settings, headerTitleCase: e.target.value as any })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="normal">Normal</option>
                      <option value="uppercase">Majuscules</option>
                      <option value="lowercase">Minuscules</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sous-titre</label>
                    <input
                      type="text"
                      value={settings.headerSubtitle || ''}
                      onChange={(e) => setSettings({ ...settings, headerSubtitle: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Logo (URL ou dataURL)</label>
                    <input
                      type="text"
                      value={settings.headerLogoUrl || ''}
                      onChange={(e) => setSettings({ ...settings, headerLogoUrl: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="https://... ou data:image/png;base64,..."
                    />
                    {/* Zone de glisser-déposer */}
                    <div
                      className={`mt-2 border-2 border-dashed rounded-lg p-3 text-xs text-gray-600 cursor-pointer ${logoDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
                      onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                      onDragEnter={(e) => { e.preventDefault(); setLogoDragging(true); }}
                      onDragLeave={() => setLogoDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setLogoDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setSettings({ ...settings, headerLogoUrl: String(reader.result) });
                          };
                          reader.readAsDataURL(file);
                        } else {
                          alert('Veuillez déposer une image (PNG/JPEG/SVG).');
                        }
                      }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = () => {
                          const file = input.files?.[0];
                          if (file && file.type.startsWith('image/')) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              setSettings({ ...settings, headerLogoUrl: String(reader.result) });
                            };
                            reader.readAsDataURL(file);
                          }
                        };
                        input.click();
                      }}
                      title="Déposez votre logo ici ou cliquez pour choisir un fichier"
                    >
                      Déposez votre logo ici ou cliquez pour choisir
                    </div>
                    {/* Aperçu */}
                    {settings.headerLogoUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={settings.headerLogoUrl} alt="Logo" className="h-10 object-contain rounded border border-gray-200 bg-white p-1" />
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, headerLogoUrl: '' })}
                          className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                          title="Retirer le logo"
                        >
                          Retirer
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Largeur logo (mm)</label>
                    <input
                      type="number"
                      value={settings.headerLogoWidthMm || 24}
                      min={8}
                      onChange={(e) => setSettings({ ...settings, headerLogoWidthMm: parseFloat(e.target.value) || 24 })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Alignement</label>
                    <select
                      value={settings.headerAlign || 'left'}
                      onChange={(e) => setSettings({ ...settings, headerAlign: e.target.value as any })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="left">Gauche</option>
                      <option value="center">Centre</option>
                      <option value="right">Droite</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filigrane */}
          <div className="mt-4 space-y-3">
            <h5 className="text-sm font-semibold text-gray-700">Filigrane</h5>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                checked={!!settings.watermarkEnabled}
                onChange={(e) => setSettings({ ...settings, watermarkEnabled: e.target.checked })}
              />
              <span className="text-sm text-gray-700">Activer le filigrane</span>
            </label>
            {settings.watermarkEnabled && (
              <div className="grid grid-cols-1 gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Texte</label>
                    <input
                      type="text"
                      value={settings.watermarkText || ''}
                      onChange={(e) => setSettings({ ...settings, watermarkText: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="CONFIDENTIEL, BROUILLON, ..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Image (URL ou dataURL)</label>
                    <input
                      type="text"
                      value={settings.watermarkImageUrl || ''}
                      onChange={(e) => setSettings({ ...settings, watermarkImageUrl: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="https://... ou data:image/png;base64,..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Opacité</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={settings.watermarkOpacity ?? 0.08}
                      onChange={(e) => setSettings({ ...settings, watermarkOpacity: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Angle (°)</label>
                    <input
                      type="number"
                      value={settings.watermarkAngle ?? -30}
                      onChange={(e) => setSettings({ ...settings, watermarkAngle: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Taille (texte, 0..1)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="1"
                      value={settings.watermarkSize ?? 0.6}
                      onChange={(e) => setSettings({ ...settings, watermarkSize: Math.max(0.1, Math.min(1, parseFloat(e.target.value) || 0.6)) })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Marges */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Marges (mm)</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Haut</label>
              <input
                type="number"
                value={settings.margins.top}
                onChange={(e) => setSettings({
                  ...settings,
                  margins: { ...settings.margins, top: parseInt(e.target.value) || 0 }
                })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Droite</label>
              <input
                type="number"
                value={settings.margins.right}
                onChange={(e) => setSettings({
                  ...settings,
                  margins: { ...settings.margins, right: parseInt(e.target.value) || 0 }
                })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bas</label>
              <input
                type="number"
                value={settings.margins.bottom}
                onChange={(e) => setSettings({
                  ...settings,
                  margins: { ...settings.margins, bottom: parseInt(e.target.value) || 0 }
                })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Gauche</label>
              <input
                type="number"
                value={settings.margins.left}
                onChange={(e) => setSettings({
                  ...settings,
                  margins: { ...settings.margins, left: parseInt(e.target.value) || 0 }
                })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                min="0"
              />
            </div>
          </div>
        </div>

        {/* Sélection des colonnes */}
        <div className="space-y-4 lg:col-span-2">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faColumns} className="text-gray-400" />
            Colonnes à afficher
          </h4>
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-sm text-gray-600 mb-4">
              Sélectionnez les colonnes à inclure dans les exports PDF, Excel et Image. Vous pouvez réorganiser l'ordre en déplaçant les colonnes.
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(settings.columns || []).map((column, index) => (
                <div
                  key={column.key}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                >
                  <FontAwesomeIcon icon={faGripVertical} className="text-gray-400 cursor-move" />
                  <input
                    type="checkbox"
                    checked={column.enabled}
                    onChange={(e) => {
                      const newColumns = [...(settings.columns || [])];
                      newColumns[index].enabled = e.target.checked;
                      setSettings({ ...settings, columns: newColumns });
                    }}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-700">{column.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (index > 0) {
                          const newColumns = [...(settings.columns || [])];
                          [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
                          setSettings({ ...settings, columns: newColumns });
                        }
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      disabled={index === 0}
                    >
                      <FontAwesomeIcon icon={faChevronUp} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (index < (settings.columns || []).length - 1) {
                          const newColumns = [...(settings.columns || [])];
                          [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
                          setSettings({ ...settings, columns: newColumns });
                        }
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      disabled={index === (settings.columns || []).length - 1}
                    >
                      <FontAwesomeIcon icon={faChevronDown} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  const newColumns = (settings.columns || []).map(col => ({ ...col, enabled: true }));
                  setSettings({ ...settings, columns: newColumns });
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Tout sélectionner
              </button>
              <span className="mx-2 text-gray-300">|</span>
              <button
                type="button"
                onClick={() => {
                  const newColumns = (settings.columns || []).map(col => ({ ...col, enabled: false }));
                  setSettings({ ...settings, columns: newColumns });
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Tout désélectionner
              </button>
            </div>
          </div>
        </div>

        {/* Options supplémentaires */}
        <div className="space-y-4 lg:col-span-2">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Options</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={settings.includeHeaders}
                onChange={(e) => setSettings({ ...settings, includeHeaders: e.target.checked })}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Inclure les en-têtes</span>
                <p className="text-xs text-gray-500">Afficher les en-têtes de colonnes dans les exports</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={settings.includeFilters}
                onChange={(e) => setSettings({ ...settings, includeFilters: e.target.checked })}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Inclure les filtres actifs</span>
                <p className="text-xs text-gray-500">Afficher les filtres appliqués dans les exports</p>
              </div>
            </label>
          </div>
        </div>

        {/* Formatage des dates */}
        <div className="space-y-4 lg:col-span-2">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Formatage des dates</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Format de date</label>
              <select
                value={settings.dateFormat || 'DD/MM/YYYY'}
                onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value as any })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY (23/04/2026)</option>
                <option value="DD/MM/YY">DD/MM/YY (23/04/26)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (2026-04-23)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (04/23/2026)</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
            {settings.dateFormat === 'custom' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Format personnalisé</label>
                <input
                  type="text"
                  value={settings.customDateFormat || 'dd/MM/yyyy'}
                  onChange={(e) => setSettings({ ...settings, customDateFormat: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="dd/MM/yyyy HH:mm"
                />
                <p className="text-xs text-gray-500 mt-1">Format utilisé pour les dates personnalisées</p>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Ce format s'applique au cahier registre et aux exports de courriers.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GestionParametresExport;

