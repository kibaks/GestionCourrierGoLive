import React, { useState, useEffect } from 'react';
import {
  generalSettingsService,
  DEFAULT_GENERAL_SETTINGS,
  GeneralSettings,
  MailSettings,
  SmsSettings,
  PageOrientation,
  TimeFormat,
  DateFormat,
  AppLanguage,
} from '../../services/generalSettingsService';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave,
  faUndo,
  faCheckCircle,
  faInfoCircle,
  faBuilding,
  faClock,
  faGlobe,
  faCalendarAlt,
  faLanguage,
  faEnvelope,
  faCommentSms,
} from '@fortawesome/free-solid-svg-icons';

const COMMON_TIMEZONES = [
  'Europe/Paris',
  'Europe/Brussels',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Madrid',
  'Africa/Casablanca',
  'Africa/Dakar',
  'America/New_York',
  'America/Los_Angeles',
  'America/Montreal',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'UTC',
];

const GestionParametresGeneraux: React.FC = () => {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    generalSettingsService
      .getSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur de chargement');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateMail = <K extends keyof MailSettings>(key: K, value: MailSettings[K]) => {
    setSettings((prev) => ({ ...prev, mail: { ...prev.mail, [key]: value } }));
  };

  const updateSms = <K extends keyof SmsSettings>(key: K, value: SmsSettings[K]) => {
    setSettings((prev) => ({ ...prev, sms: { ...prev.sms, [key]: value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await generalSettingsService.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Réinitialiser les paramètres généraux aux valeurs par défaut ?')) return;
    setSaving(true);
    setError(null);
    try {
      const defaults = await generalSettingsService.resetToDefaults();
      setSettings(defaults);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la réinitialisation');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Chargement des paramètres…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Paramètres généraux</h3>
          <p className="text-sm text-gray-500 mt-1">
            Configuration globale de l'application (entreprise, fuseau horaire, formats, etc.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faUndo} />
            Réinitialiser
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faSave} />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <FontAwesomeIcon icon={faCheckCircle} className="text-green-600" />
          <span className="text-green-800 font-medium">Paramètres enregistrés avec succès !</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <FontAwesomeIcon icon={faInfoCircle} className="text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Ces paramètres s'appliquent à :</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>L'entête des exports PDF, Excel et image</li>
              <li>L'orientation par défaut des documents</li>
              <li>L'affichage des dates et heures dans l'application</li>
              <li>Le serveur d'envoi d'e-mails et le serveur SMS</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identité */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faBuilding} className="text-gray-400" />
            Identité
          </h4>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entreprise</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => updateSetting('companyName', e.target.value)}
                placeholder="Ex. : Ministère de l'Économie"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Utilisé dans l'entête des exports.</p>
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faCalendarAlt} className="text-gray-400" />
            Documents
          </h4>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orientation par défaut</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="defaultPageOrientation"
                    checked={settings.defaultPageOrientation === 'portrait'}
                    onChange={() => updateSetting('defaultPageOrientation', 'portrait' as PageOrientation)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Portrait
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="defaultPageOrientation"
                    checked={settings.defaultPageOrientation === 'landscape'}
                    onChange={() => updateSetting('defaultPageOrientation', 'landscape' as PageOrientation)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Paysage
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">Orientation par défaut des exports et impressions, indépendamment du format de page.</p>
            </div>
          </div>
        </div>

        {/* Date et heure */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faClock} className="text-gray-400" />
            Date et heure
          </h4>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fuseau horaire</label>
              <select
                value={settings.timezone}
                onChange={(e) => updateSetting('timezone', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Format de l'heure</label>
              <select
                value={settings.timeFormat}
                onChange={(e) => updateSetting('timeFormat', e.target.value as TimeFormat)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="24h">24 heures (14:30)</option>
                <option value="12h">12 heures (2:30 PM)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Format de la date</label>
              <select
                value={settings.dateFormat}
                onChange={(e) => updateSetting('dateFormat', e.target.value as DateFormat)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="DD/MM/YYYY">JJ/MM/AAAA (31/12/2024)</option>
                <option value="MM/DD/YYYY">MM/JJ/AAAA (12/31/2024)</option>
                <option value="YYYY-MM-DD">AAAA-MM-JJ (2024-12-31)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Langue */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faLanguage} className="text-gray-400" />
            Langue
          </h4>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Langue de l'interface</label>
              <select
                value={settings.language}
                onChange={(e) => updateSetting('language', e.target.value as AppLanguage)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Serveur d'envoi d'e-mails */}
        <div className="space-y-4 lg:col-span-2">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faEnvelope} className="text-gray-400" />
            Serveur d'envoi d'e-mails (SMTP)
          </h4>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <input
                id="mail-enabled"
                type="checkbox"
                checked={settings.mail.enabled}
                onChange={(e) => updateMail('enabled', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="mail-enabled" className="text-sm font-medium text-gray-700">Activer l'envoi d'e-mails</label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Serveur SMTP</label>
                <input
                  type="text"
                  value={settings.mail.host}
                  onChange={(e) => updateMail('host', e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={settings.mail.port}
                  onChange={(e) => updateMail('port', parseInt(e.target.value || '0', 10))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Chiffrement</label>
                <select
                  value={settings.mail.encryption}
                  onChange={(e) => updateMail('encryption', e.target.value as MailSettings['encryption'])}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="tls">TLS</option>
                  <option value="ssl">SSL</option>
                  <option value="">Aucun</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Driver</label>
                <select
                  value={settings.mail.driver}
                  onChange={(e) => updateMail('driver', e.target.value as MailSettings['driver'])}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="smtp">SMTP</option>
                  <option value="sendmail">Sendmail</option>
                  <option value="log">Log (tests)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom d'utilisateur SMTP</label>
                <input
                  type="text"
                  value={settings.mail.username}
                  onChange={(e) => updateMail('username', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Mot de passe SMTP</label>
                <input
                  type="password"
                  value={settings.mail.password}
                  onChange={(e) => updateMail('password', e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Adresse d'envoi</label>
                <input
                  type="email"
                  value={settings.mail.fromAddress}
                  onChange={(e) => updateMail('fromAddress', e.target.value)}
                  placeholder="noreply@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom d'affichage</label>
                <input
                  type="text"
                  value={settings.mail.fromName}
                  onChange={(e) => updateMail('fromName', e.target.value)}
                  placeholder="Gestion Courriers"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Serveur d'envoi de SMS */}
        <div className="space-y-4 lg:col-span-2">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faCommentSms} className="text-gray-400" />
            Serveur d'envoi de SMS
          </h4>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur SMS</label>
              <select
                value={settings.sms.provider}
                onChange={(e) => updateSms('provider', e.target.value as SmsSettings['provider'])}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="none">Désactivé</option>
                <option value="twilio">Twilio</option>
              </select>
            </div>
            {settings.sms.provider === 'twilio' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Account SID</label>
                  <input
                    type="text"
                    value={settings.sms.sid}
                    onChange={(e) => updateSms('sid', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Auth Token</label>
                  <input
                    type="password"
                    value={settings.sms.token}
                    onChange={(e) => updateSms('token', e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Numéro d'envoi</label>
                  <input
                    type="text"
                    value={settings.sms.from}
                    onChange={(e) => updateSms('from', e.target.value)}
                    placeholder="+1234567890"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs text-gray-500">
          <FontAwesomeIcon icon={faGlobe} className="mr-1" />
          Les paramètres sont enregistrés sur le serveur Laravel en ligne et copiés en cache local. Ils s'appliquent immédiatement après sauvegarde.
        </p>
      </div>
    </div>
  );
};

export default GestionParametresGeneraux;
