import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { laravelApiService } from '../services/laravelApiService';

const ConfirmEmailChange: React.FC = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('error'); return; }
    laravelApiService.confirmEmailChange(token).then(() => setState('success')).catch(() => setState('error'));
  }, [params]);
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><FontAwesomeIcon icon={faCheckCircle} className={`text-5xl ${state === 'success' ? 'text-emerald-500' : 'text-blue-500'}`} /><h1 className="mt-5 text-2xl font-bold text-slate-950">{state === 'loading' ? 'Confirmation en cours…' : state === 'success' ? 'Adresse e-mail confirmée' : 'Lien invalide ou expiré'}</h1><p className="mt-3 text-slate-600">{state === 'success' ? 'Reconnectez-vous avec votre nouvelle adresse e-mail.' : state === 'loading' ? 'Veuillez patienter.' : 'Demandez un nouveau changement depuis votre profil.'}</p><Link to="/login" className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Aller à la connexion</Link></section></main>;
};

export default ConfirmEmailChange;
