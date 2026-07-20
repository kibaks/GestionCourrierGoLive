import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight, faCheckCircle, faEnvelope, faFileAlt, faSpinner } from '@fortawesome/free-solid-svg-icons';
import AuthSplitLayout from '../components/AuthSplitLayout';
import { laravelApiService } from '../services/laravelApiService';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await laravelApiService.requestPasswordReset(email);
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return <AuthSplitLayout>
    <div className="mb-8 text-center lg:hidden"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 text-white shadow-lg shadow-primary-500/30"><FontAwesomeIcon icon={faFileAlt} className="h-8 w-8" /></div><h1 className="text-2xl font-bold text-surface-900">GestionCourriers</h1></div>
    <div className="mb-8"><p className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700"><FontAwesomeIcon icon={faEnvelope} />Accès sécurisé</p><h2 className="mb-2 text-3xl font-bold text-surface-900">Mot de passe oublié ?</h2><p className="text-surface-500">Nous vous enverrons un lien sécurisé si cette adresse correspond à un compte.</p></div>
    {submitted ? <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white"><FontAwesomeIcon icon={faCheckCircle} /></div><h3 className="mt-3 font-bold text-emerald-950">Consultez votre messagerie</h3><p className="mt-1 text-sm leading-relaxed text-emerald-800">Suivez le lien reçu pour choisir un nouveau mot de passe.</p></div> : <form onSubmit={submit} className="space-y-5"><div><label htmlFor="reset-email" className="mb-2 block text-sm font-semibold text-surface-700">Adresse e-mail</label><div className="relative"><FontAwesomeIcon icon={faEnvelope} className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-surface-400" /><input id="reset-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" placeholder="vous@exemple.com" className="w-full rounded-xl border-2 border-surface-200 bg-white py-3.5 pl-12 pr-4 text-surface-900 outline-none transition focus:border-primary-500" /></div></div><button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 py-4 font-semibold text-white shadow-lg shadow-primary-500/25 transition hover:from-primary-600 hover:to-primary-700 disabled:cursor-not-allowed disabled:opacity-70">{loading ? <><FontAwesomeIcon icon={faSpinner} className="animate-spin" />Envoi…</> : <>Envoyer le lien<FontAwesomeIcon icon={faArrowRight} /></>}</button></form>}
    <Link to="/login" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-primary-600 transition hover:text-primary-700"><FontAwesomeIcon icon={faArrowLeft} />Retour à la connexion</Link>
  </AuthSplitLayout>;
};

export default ForgotPassword;
