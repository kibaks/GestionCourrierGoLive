import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faChartLine, faFileAlt, faFileArchive, faShieldAlt, faUsers } from '@fortawesome/free-solid-svg-icons';

type AuthSplitLayoutProps = {
  children: React.ReactNode;
};

const features = [
  { icon: faFileAlt, title: 'Gestion complète', description: 'Suivez tous vos courriers' },
  { icon: faFileArchive, title: 'Archivage', description: 'Classez vos documents physiques' },
  { icon: faShieldAlt, title: 'Sécurité avancée', description: 'Rôles et permissions' },
  { icon: faUsers, title: 'Collaboration', description: 'Travaillez en équipe' },
  { icon: faChartLine, title: 'Statistiques', description: 'Pilotez votre activité' },
  { icon: faBell, title: 'Rappels', description: 'Restez informé' },
];

const AuthSplitLayout: React.FC<AuthSplitLayoutProps> = ({ children }) => (
  <main className="flex min-h-screen overflow-hidden">
    <aside className="relative hidden overflow-hidden lg:flex lg:w-[60%]">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-700" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/5 blur-3xl animate-float" />
        <div className="absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-secondary-400/10 blur-3xl animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-accent-400/10 blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      </div>
      <div className="relative z-10 flex w-full flex-col justify-center px-16 py-12 text-white xl:px-24">
        <div className="mb-10 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm"><FontAwesomeIcon icon={faFileAlt} className="h-8 w-8" /></div>
          <div><h1 className="text-2xl font-bold tracking-tight">GestionCourriers</h1><p className="text-sm text-primary-200">Administration Moderne</p></div>
        </div>
        <h2 className="mb-4 text-3xl font-bold leading-snug xl:text-4xl">Système de Gestion des <span className="bg-gradient-to-r from-accent-300 to-amber-300 bg-clip-text text-transparent">Courriers</span></h2>
        <p className="mb-8 max-w-xl text-base leading-snug text-primary-100 xl:text-lg">Une solution complète et moderne pour la gestion de vos courriers administratifs et l’archivage physique.</p>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">{features.map(({ icon, title, description }) => <div key={title} className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/10"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400/20 to-accent-600/20 transition-transform group-hover:scale-110"><FontAwesomeIcon icon={icon} className="h-5 w-5 text-accent-300" /></div><h3 className="mb-0.5 text-sm font-semibold">{title}</h3><p className="text-xs leading-snug text-primary-200">{description}</p></div>)}</div>
      </div>
    </aside>
    <section className="flex flex-1 items-center justify-center bg-surface-50 px-8 py-12 lg:px-16">
      <div className="w-full max-w-md">{children}</div>
    </section>
  </main>
);

export default AuthSplitLayout;
