import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

  return <main className="min-h-screen bg-surface-100 flex items-center justify-center p-6"><section className="w-full max-w-md bg-white rounded-2xl shadow-card p-8">
    <h1 className="text-2xl font-bold text-surface-900">Nouveau mot de passe</h1>
    {message ? <p className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-800">{message}</p> : <form onSubmit={submit} className="mt-6 space-y-4">
      <input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="new-password" placeholder="Nouveau mot de passe" className="w-full rounded-xl border-2 border-surface-200 px-4 py-3 focus:border-primary-500 focus:outline-none" />
      <input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required autoComplete="new-password" placeholder="Confirmer le mot de passe" className="w-full rounded-xl border-2 border-surface-200 px-4 py-3 focus:border-primary-500 focus:outline-none" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white">Mettre à jour</button>
    </form>}
    <Link to="/login" className="mt-6 block text-center text-sm font-medium text-primary-600">Connexion</Link>
  </section></main>;
};

export default ResetPassword;
