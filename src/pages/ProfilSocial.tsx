import React, { useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faBell, faCamera, faCheckCircle, faEnvelope, faGlobe, faIdBadge, faKey, faLock, faMobileScreen, faPen, faPhone, faShieldHalved, faTimes, faUser } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import { laravelApiService } from '../services/laravelApiService';
import type { Utilisateur } from '../types';
import './ProfilSocial.css';

type Tab = 'about' | 'contact' | 'privacy' | 'notifications' | 'security';
type Preferences = NonNullable<Utilisateur['notificationPreferences']>;

const tabs: Array<[Tab, string, typeof faUser]> = [
  ['about', 'À propos', faUser], ['contact', 'Coordonnées', faIdBadge], ['privacy', 'Confidentialité', faGlobe], ['notifications', 'Notifications', faBell], ['security', 'Sécurité', faShieldHalved],
];
const events = [['assignation', 'Assignations'], ['rappel', 'Rappels'], ['echeance', 'Échéances'], ['workflow', 'Workflow'], ['system', 'Informations système']] as const;
const emptyPreferences = (): Preferences => Object.fromEntries(events.map(([key]) => [key, { app: true, email: false, sms: false }])) as Preferences;

const ProfilSocial: React.FC = () => {
  const { user, updateCurrentUser, logout } = useAuth();
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('about');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [twoFactorUri, setTwoFactorUri] = useState('');
  const [twoFactorQr, setTwoFactorQr] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [smsCode, setSmsCode] = useState('');
  const [phone, setPhone] = useState(user?.smsPhone ?? '');
  const [emailChange, setEmailChange] = useState({ email: '', password: '' });
  const [password, setPassword] = useState({ current: '', next: '', confirmation: '' });
  const [form, setForm] = useState<Partial<Utilisateur>>(() => ({
    nom: user?.nom ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', jobTitle: user?.jobTitle ?? '', professionalPhone: user?.professionalPhone ?? '', personalPhone: user?.personalPhone ?? '', bio: user?.bio ?? '', address: user?.address ?? '', city: user?.city ?? '', country: user?.country ?? '', profileVisibility: user?.profileVisibility ?? { contact: 'moi', bio: 'collegues' }, notificationPreferences: user?.notificationPreferences ?? emptyPreferences(),
  }));

  const initials = useMemo(() => (user?.nom || 'U').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase(), [user]);
  const patch = (next: Utilisateur) => { updateCurrentUser(next); setForm(current => ({ ...current, ...next })); };
  const save = async () => { setSaving(true); try { patch(await laravelApiService.updateProfile(form)); setEditing(false); setNotice('Profil enregistré.'); } catch { setNotice('Impossible d’enregistrer le profil.'); } finally { setSaving(false); } };
  const upload = async (file: File | undefined, kind: 'photo' | 'cover') => { if (!file) return; try { patch(kind === 'photo' ? await laravelApiService.uploadProfilePhoto(file) : await laravelApiService.uploadProfileCover(file)); setNotice(kind === 'photo' ? 'Photo mise à jour.' : 'Couverture mise à jour.'); } catch { setNotice('Image invalide ou trop volumineuse.'); } };
  const requestEmail = async () => { try { await laravelApiService.requestEmailChange(emailChange.email, emailChange.password); setEmailChange({ email: '', password: '' }); setNotice('Un lien de confirmation a été envoyé à la nouvelle adresse.'); } catch { setNotice('Impossible de demander le changement d’e-mail.'); } };
  const requestSms = async () => { try { await laravelApiService.requestSmsVerification(phone); setNotice('Code envoyé par SMS.'); } catch { setNotice('SMS indisponible : vérifiez la configuration Twilio.'); } };
  const confirmSms = async () => { try { patch(await laravelApiService.confirmSmsVerification(smsCode)); setSmsCode(''); setNotice('Numéro de téléphone vérifié.'); } catch { setNotice('Code SMS invalide ou expiré.'); } };
  const changePassword = async () => { try { await laravelApiService.changeProfilePassword(password.current, password.next, password.confirmation); setNotice('Mot de passe modifié. Reconnectez-vous.'); logout(); } catch { setNotice('Impossible de modifier le mot de passe.'); } };
  const startTwoFactor = async () => { try { const setup = await laravelApiService.beginTwoFactor(); setTwoFactorUri(setup.otpauthUri); setTwoFactorQr(await QRCode.toDataURL(setup.otpauthUri, { width: 220, margin: 1 })); } catch { setNotice('Impossible de démarrer le second facteur.'); } };
  const confirmTwoFactor = async () => { try { setRecoveryCodes(await laravelApiService.confirmTwoFactor(twoFactorCode)); if (user) patch({ ...user, twoFactorEnabled: true }); setTwoFactorUri(''); setTwoFactorQr(''); setTwoFactorCode(''); } catch { setNotice('Code de sécurité invalide.'); } };
  const disableTwoFactor = async () => { const current = window.prompt('Saisissez votre mot de passe actuel.'); if (!current) return; try { await laravelApiService.disableTwoFactor(current); if (user) patch({ ...user, twoFactorEnabled: false }); setNotice('Second facteur désactivé.'); } catch { setNotice('Mot de passe incorrect.'); } };
  const preference = (event: string, channel: 'app' | 'email' | 'sms', checked: boolean) => setForm(current => ({ ...current, notificationPreferences: { ...(current.notificationPreferences ?? emptyPreferences()), [event]: { ...(current.notificationPreferences?.[event] ?? {}), [channel]: checked } } }));

  if (!user) return null;
  const inputCls = 'w-full rounded-xl border-2 border-surface-200 bg-white px-4 py-3 text-surface-900 placeholder-surface-400 outline-none transition focus:border-primary-500';
  const field = (label: string, key: keyof Utilisateur, type = 'text') => <label className="block text-sm font-semibold text-surface-700"><span className="mb-2 block">{label}</span><input type={type} value={String(form[key] ?? '')} onChange={e => setForm({ ...form, [key]: e.target.value })} className={inputCls} /></label>;

  return <div className="profile-social mx-auto max-w-6xl space-y-6 pb-10">
    <section className="profile-hero relative overflow-hidden rounded-4xl border border-surface-200 bg-white shadow-card">
      <div className="relative h-52 md:h-64" style={user.coverUrl ? { backgroundImage: `url(${user.coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div className="absolute inset-0 bg-gradient-to-t from-surface-950/60 via-surface-950/10 to-transparent" />
        <button type="button" onClick={() => coverRef.current?.click()} className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-xl bg-white/95 px-3.5 py-2 text-sm font-semibold text-surface-800 shadow-lg backdrop-blur transition hover:bg-white"><FontAwesomeIcon icon={faCamera} />Photo de couverture</button>
        <input ref={coverRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e.target.files?.[0], 'cover')} />
      </div>
      <div className="relative px-5 pb-6 md:px-8">
        <div className="-mt-20 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <div className="relative h-36 w-36 shrink-0 rounded-full border-4 border-white bg-surface-100 shadow-xl ring-1 ring-surface-200">
              {user.photoUrl ? <img src={user.photoUrl} alt={user.nom} className="h-full w-full rounded-full object-cover" /> : <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-primary-500 via-primary-600 to-secondary-700 text-4xl font-bold text-white">{initials}</div>}
              <button type="button" onClick={() => avatarRef.current?.click()} className="absolute bottom-1 right-1 grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-primary-600 text-white shadow-lg transition hover:bg-primary-700"><FontAwesomeIcon icon={faCamera} /></button>
              <input ref={avatarRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e.target.files?.[0], 'photo')} />
            </div>
            <div className="pb-1">
              <h1 className="text-2xl font-bold tracking-tight text-surface-900 md:text-3xl">{user.nom}</h1>
              <p className="mt-0.5 text-surface-500">{user.jobTitle || user.role}{(user.direction || user.service) && <span className="text-surface-400"> · {[user.direction, user.service].filter(Boolean).join(' · ')}</span>}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-primary-700"><FontAwesomeIcon icon={faIdBadge} />{user.role}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${user.emailVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><FontAwesomeIcon icon={faEnvelope} />{user.emailVerified ? 'E-mail vérifié' : 'E-mail non vérifié'}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${user.twoFactorEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-100 text-surface-500'}`}><FontAwesomeIcon icon={faShieldHalved} />{user.twoFactorEnabled ? '2FA actif' : '2FA inactif'}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { setTab('about'); setEditing(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-3 font-semibold text-white shadow-lg shadow-primary-500/25 transition hover:from-primary-600 hover:to-primary-700"><FontAwesomeIcon icon={faPen} />Modifier le profil</button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-surface-200/70 px-3 py-2">{tabs.map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-primary-600 text-white shadow-md shadow-primary-500/25' : 'text-surface-500 hover:bg-surface-100 hover:text-surface-900'}`}><FontAwesomeIcon icon={icon} />{label}</button>)}</nav>
    </section>
    {notice && <div className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800 shadow-sm"><FontAwesomeIcon icon={faCheckCircle} className="mt-0.5 text-primary-500" /><span className="flex-1">{notice}</span><button type="button" onClick={() => setNotice('')} className="text-primary-400 transition hover:text-primary-600"><FontAwesomeIcon icon={faTimes} /></button></div>}
    <section className="rounded-4xl border border-surface-200 bg-white p-5 shadow-card md:p-8">
      {tab === 'about' && <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold text-surface-900">Présentation</h2><p className="text-sm text-surface-500">Vos informations professionnelles visibles dans l’organisation.</p></div>
          <button onClick={() => editing ? save() : setEditing(true)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"><FontAwesomeIcon icon={editing ? faCheckCircle : faPen} />{editing ? (saving ? 'Enregistrement…' : 'Enregistrer') : 'Modifier'}</button>
        </div>
        {editing ? <div className="grid gap-4 md:grid-cols-2">{field('Prénom', 'firstName')}{field('Nom', 'lastName')}{field('Nom affiché', 'nom')}{field('Fonction', 'jobTitle')}<label className="block text-sm font-semibold text-surface-700 md:col-span-2"><span className="mb-2 block">Biographie</span><textarea value={form.bio ?? ''} onChange={e => setForm({ ...form, bio: e.target.value })} rows={4} className={inputCls} /></label></div>
        : <div className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-2xl border border-surface-200 bg-surface-50 p-5 lg:col-span-2"><h3 className="flex items-center gap-2 font-semibold text-surface-900"><FontAwesomeIcon icon={faUser} className="text-primary-500" />À propos de moi</h3><p className="mt-3 whitespace-pre-line leading-relaxed text-surface-600">{user.bio || 'Ajoutez une courte présentation professionnelle pour vous présenter à vos collègues.'}</p></article>
          <article className="space-y-4 rounded-2xl border border-surface-200 p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-surface-400">Fonction</p><p className="mt-1 font-semibold text-surface-900">{user.jobTitle || 'Non renseignée'}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-surface-400">Organisation</p><p className="mt-1 font-semibold text-surface-900">{[user.direction, user.service].filter(Boolean).join(' · ') || 'Non renseignée'}</p></div></article>
        </div>}
      </div>}
      {tab === 'contact' && <div className="space-y-6">
        <div><h2 className="text-xl font-bold text-surface-900">Coordonnées</h2><p className="text-sm text-surface-500">Vos numéros et adresse. Ces informations respectent vos réglages de confidentialité.</p></div>
        <div className="grid gap-4 md:grid-cols-2">{field('Téléphone professionnel', 'professionalPhone', 'tel')}{field('Téléphone personnel', 'personalPhone', 'tel')}{field('Adresse', 'address')}{field('Ville', 'city')}{field('Pays', 'country')}</div>
        <div className="flex justify-end"><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"><FontAwesomeIcon icon={faCheckCircle} />Enregistrer les coordonnées</button></div>
        <div className="rounded-2xl border border-surface-200 bg-surface-50 p-5">
          <h3 className="flex items-center gap-2 font-bold text-surface-900"><FontAwesomeIcon icon={faEnvelope} className="text-primary-500" />Adresse e-mail</h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-surface-500">{user.email}{user.emailVerified ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><FontAwesomeIcon icon={faCheckCircle} />vérifiée</span> : <span className="font-semibold text-amber-600">non vérifiée</span>}</p>
          <p className="mt-3 text-sm text-surface-500">Le changement d’adresse est confirmé par un lien envoyé à la nouvelle adresse.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3"><input value={emailChange.email} onChange={e => setEmailChange({ ...emailChange, email: e.target.value })} placeholder="Nouvelle adresse e-mail" className={inputCls} /><input type="password" value={emailChange.password} onChange={e => setEmailChange({ ...emailChange, password: e.target.value })} placeholder="Mot de passe actuel" className={inputCls} /><button onClick={requestEmail} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary-200 bg-primary-50 px-4 py-3 font-semibold text-primary-700 transition hover:bg-primary-100"><FontAwesomeIcon icon={faArrowRight} />Demander</button></div>
        </div>
      </div>}
      {tab === 'privacy' && <div className="space-y-5">
        <div><h2 className="text-xl font-bold text-surface-900">Confidentialité</h2><p className="text-sm text-surface-500">Contrôlez qui peut voir chaque groupe d’informations.</p></div>
        <div className="space-y-3">{([['bio', 'Biographie', faUser], ['contact', 'Coordonnées personnelles', faIdBadge]] as const).map(([key, label, icon]) => <label key={key} className="flex items-center justify-between gap-4 rounded-2xl border border-surface-200 p-4 transition hover:border-primary-200 hover:bg-surface-50"><span className="flex items-center gap-3 font-semibold text-surface-800"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary-600"><FontAwesomeIcon icon={icon} /></span>{label}</span><select value={form.profileVisibility?.[key] ?? 'moi'} onChange={e => setForm({ ...form, profileVisibility: { ...form.profileVisibility, [key]: e.target.value } })} className="rounded-xl border-2 border-surface-200 bg-white px-3 py-2 font-medium text-surface-700 outline-none focus:border-primary-500"><option value="moi">Moi uniquement</option><option value="collegues">Collègues</option><option value="managers">Managers</option></select></label>)}</div>
        <div className="flex justify-end"><button onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-700"><FontAwesomeIcon icon={faCheckCircle} />Enregistrer</button></div>
      </div>}
      {tab === 'notifications' && <div className="space-y-5">
        <div><h2 className="text-xl font-bold text-surface-900">Préférences de notification</h2><p className="text-sm text-surface-500">Choisissez vos canaux par type d’évènement. Les alertes de sécurité critiques restent toujours envoyées.</p></div>
        <div className="space-y-3">{events.map(([key, label]) => <div key={key} className="rounded-2xl border border-surface-200 p-4 transition hover:border-primary-200"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold text-surface-800">{label}</p><div className="flex flex-wrap gap-x-6 gap-y-3">{([['app', 'Application', faBell], ['email', 'E-mail', faEnvelope], ['sms', 'SMS urgent', faMobileScreen]] as const).map(([channel, clabel, cicon]) => <label key={channel} className="inline-flex items-center gap-2 text-sm font-medium text-surface-600"><FontAwesomeIcon icon={cicon} className="text-surface-400" /><span>{clabel}</span><button type="button" role="switch" aria-checked={Boolean(form.notificationPreferences?.[key]?.[channel])} aria-label={`${label} par ${clabel}`} onClick={() => preference(key, channel, !form.notificationPreferences?.[key]?.[channel])} className={`profile-switch ${form.notificationPreferences?.[key]?.[channel] ? 'profile-switch-on' : ''}`}><span /></button></label>)}</div></div></div>)}</div>
        <div className="flex justify-end"><button onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-700"><FontAwesomeIcon icon={faCheckCircle} />Enregistrer les préférences</button></div>
      </div>}
      {tab === 'security' && <div className="space-y-6">
        <div><h2 className="text-xl font-bold text-surface-900">Sécurité et connexion</h2><p className="text-sm text-surface-500">Protégez votre compte et gérez vos méthodes de connexion.</p></div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-surface-200 p-6"><h3 className="flex items-center gap-2 font-bold text-surface-900"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-50 text-primary-600"><FontAwesomeIcon icon={faKey} /></span>Mot de passe</h3><div className="mt-4 space-y-3">{([['current', 'Mot de passe actuel'], ['next', 'Nouveau mot de passe'], ['confirmation', 'Confirmer le mot de passe']] as const).map(([k, ph]) => <div key={k} className="relative"><FontAwesomeIcon icon={faLock} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" /><input type="password" value={password[k]} onChange={e => setPassword({ ...password, [k]: e.target.value })} placeholder={ph} className="w-full rounded-xl border-2 border-surface-200 bg-white py-3 pl-11 pr-4 outline-none transition focus:border-primary-500" /></div>)}<button onClick={changePassword} className="w-full rounded-xl bg-surface-900 py-3 font-semibold text-white transition hover:bg-surface-800">Modifier le mot de passe</button></div></section>
          <section className="rounded-2xl border border-surface-200 p-6"><h3 className="flex items-center gap-2 font-bold text-surface-900"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><FontAwesomeIcon icon={faShieldHalved} /></span>Double authentification</h3><p className="mt-2 text-sm text-surface-500">Application d’authentification et codes de récupération.</p>{user.twoFactorEnabled ? <div className="mt-4 flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700"><FontAwesomeIcon icon={faCheckCircle} />Activée</span><button onClick={disableTwoFactor} className="rounded-xl border-2 border-red-200 px-4 py-2 font-semibold text-red-600 transition hover:bg-red-50">Désactiver</button></div> : !twoFactorUri ? <button onClick={startTwoFactor} className="mt-4 rounded-xl bg-primary-600 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-700">Configurer</button> : <div className="mt-4 space-y-3">{twoFactorQr && <img src={twoFactorQr} alt="QR TOTP" className="h-44 w-44 rounded-xl border border-surface-200 p-2" />}<input value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="Code à 6 chiffres" className="w-full rounded-xl border-2 border-surface-200 px-4 py-3 text-center tracking-[0.35em] outline-none focus:border-primary-500" /><button onClick={confirmTwoFactor} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-700">Activer</button></div>}{recoveryCodes.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong className="flex items-center gap-2"><FontAwesomeIcon icon={faShieldHalved} />Conservez ces codes de récupération :</strong><div className="mt-2 grid grid-cols-2 gap-1 font-mono text-amber-800">{recoveryCodes.map(code => <span key={code}>{code}</span>)}</div></div>}</section>
          <section className="rounded-2xl border border-surface-200 p-6 lg:col-span-2"><h3 className="flex flex-wrap items-center gap-2 font-bold text-surface-900"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-50 text-primary-600"><FontAwesomeIcon icon={faMobileScreen} /></span>Numéro pour les alertes SMS{user.smsVerified && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"><FontAwesomeIcon icon={faCheckCircle} />Vérifié</span>}</h3><p className="mt-2 text-sm text-surface-500">Les SMS sont utilisés uniquement pour les évènements que vous avez activés.</p><div className="mt-4 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><FontAwesomeIcon icon={faPhone} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400" /><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex. +243..." className="w-full rounded-xl border-2 border-surface-200 py-3 pl-11 pr-4 outline-none focus:border-primary-500" /></div><button onClick={requestSms} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary-200 bg-primary-50 px-4 py-3 font-semibold text-primary-700 transition hover:bg-primary-100"><FontAwesomeIcon icon={faPhone} />Envoyer un code</button></div>{!user.smsVerified && <div className="mt-3 flex flex-col gap-3 md:flex-row"><input value={smsCode} onChange={e => setSmsCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="Code reçu par SMS" className="flex-1 rounded-xl border-2 border-surface-200 px-4 py-3 text-center tracking-[0.3em] outline-none focus:border-primary-500" /><button onClick={confirmSms} className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700">Vérifier le numéro</button></div>}</section>
        </div>
      </div>}
    </section>
  </div>;
};

export default ProfilSocial;
