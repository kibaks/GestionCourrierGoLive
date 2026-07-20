import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight, faCheckCircle, faExclamationTriangle, faFileAlt, faKey, faLock } from '@fortawesome/free-solid-svg-icons';
import AuthSplitLayout from '../components/AuthSplitLayout';
import { laravelApiService } from '../services/laravelApiService';

const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try { await laravelApiService.resetPassword(email, token, password, confirmation); setMessage('Mot de passe modifié. Vous pouvez vous connecter.'); }
    catch { setError('Le lien est invalide, expiré ou le mot de passe ne respecte pas les règles demandées.'); }
  };

  return <AuthSplitLayout>
    <div className="mb-8 text-center lg:hidden"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 text-white shadow-lg shadow-primary-500/30"><FontAwesomeIcon icon={faFileAlt} className="h-8 w-8" /></div><h1 className="text-2xl font-bold text-surface-900">GestionCourriers</h1></div>
    <div className="mb-8"><p className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700"><FontAwesomeIcon icon={faKey} />Lien sécurisé</p><h2 className="mb-2 text-3xl font-bold text-surface-900">Nouveau mot de passe</h2><p className="text-surface-500">Choisissez un mot de passe fort pour sécuriser votre compte.</p></div>
    {message ? <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white"><FontAwesomeIcon icon={faCheckCircle} /></div><h3 className="mt-3 font-bold text-emerald-950">Mot de passe modifié</h3><p className="mt-1 text-sm leading-relaxed text-emerald-800">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p></div> : <form onSubmit={submit} className="space-y-5"><div><label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-surface-700">Nouveau mot de passe</label><div className="relative"><FontAwesomeIcon icon={faLock} className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-surface-400" /><input id="new-password" type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="new-password" placeholder="••••••••" className="w-full rounded-xl border-2 border-surface-200 bg-white py-3.5 pl-12 pr-4 text-surface-900 outline-none transition focus:border-primary-500" /></div></div><div><label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-surface-700">Confirmer le mot de passe</label><div className="relative"><FontAwesomeIcon icon={faLock} className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-surface-400" /><input id="confirm-password" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required autoComplete="new-password" placeholder="••••••••" className="w-full rounded-xl border-2 border-surface-200 bg-white py-3.5 pl-12 pr-4 text-surface-900 outline-none transition focus:border-primary-500" /></div></div>{error && <div className="flex items-start gap-3 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-800"><FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5 text-red-500" /><span>{error}</span></div>}<button className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 py-4 font-semibold text-white shadow-lg shadow-primary-500/25 transition hover:from-primary-600 hover:to-primary-700">Mettre à jour<FontAwesomeIcon icon={faArrowRight} /></button></form>}
    <Link to="/login" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-primary-600 transition hover:text-primary-700"><FontAwesomeIcon icon={faArrowLeft} />Retour à la connexion</Link>
  </AuthSplitLayout>;
};

export default ResetPassword;
