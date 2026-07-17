import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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

  return <main className="min-h-screen bg-surface-100 flex items-center justify-center p-6"><section className="w-full max-w-md bg-white rounded-2xl shadow-card p-8">
    <h1 className="text-2xl font-bold text-surface-900">Réinitialiser le mot de passe</h1>
    <p className="mt-2 text-sm text-surface-500">Nous vous enverrons un lien sécurisé si cette adresse correspond à un compte.</p>
    {submitted ? <p className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-800">Consultez votre messagerie et suivez le lien reçu.</p> : <form onSubmit={submit} className="mt-6 space-y-4">
      <input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" placeholder="vous@exemple.com" className="w-full rounded-xl border-2 border-surface-200 px-4 py-3 focus:border-primary-500 focus:outline-none" />
      <button disabled={loading} className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white disabled:opacity-60">{loading ? 'Envoi…' : 'Envoyer le lien'}</button>
    </form>}
    <Link to="/login" className="mt-6 block text-center text-sm font-medium text-primary-600">Retour à la connexion</Link>
  </section></main>;
};

export default ForgotPassword;
