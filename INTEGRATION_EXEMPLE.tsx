// Exemple d'intégration dans ListeCourriers.tsx
// À ajouter dans les imports :
import ListeCourrierStatsCards from '../components/ListeCourrierStatsCards';
import StatsViewToggle from '../components/StatsViewToggle';

// À ajouter dans les states du composant :
const [statsView, setStatsView] = useState<'cards' | 'charts' | 'none'>('charts');

// Remplacement de la section statistiques actuelle par :
{/* Sélecteur de vue des statistiques */}
<div className="flex items-center justify-between mb-4">
  <h2 className="text-lg font-bold text-slate-900">Statistiques</h2>
  <StatsViewToggle view={statsView} onChange={setStatsView} />
</div>

{/* Affichage conditionnel des statistiques */}
{statsView === 'charts' && (
  <ListeCourrierStats 
    stats={{
      total: stats.total,
      byStatut: stats.byStatut,
      byType: stats.byType,
      bySens: stats.bySens,
      byPriorite: stats.byPriorite,
      urgent: stats.urgent,
      enAttente: stats.enAttente,
      orientesDirecteurs: stats.orientesDirecteurs,
      entrants: stats.bySensType.entrant,
      sortants: stats.bySensType.sortant
    }}
  />
)}

{statsView === 'cards' && (
  <ListeCourrierStatsCards 
    stats={{
      total: stats.total,
      byStatut: stats.byStatut,
      byType: stats.byType,
      bySens: stats.bySens,
      byPriorite: stats.byPriorite,
      urgent: stats.urgent,
      enAttente: stats.enAttente,
      orientesDirecteurs: stats.orientesDirecteurs,
      entrants: stats.bySensType.entrant,
      sortants: stats.bySensType.sortant
    }}
  />
)}

{statsView === 'none' && (
  <div className="text-center py-8 text-slate-500">
    <FontAwesomeIcon icon={faEyeSlash} className="w-12 h-12 mb-3 text-slate-300" />
    <p>Statistiques masquées</p>
    <p className="text-sm mt-1">Utilisez le sélecteur ci-dessus pour les afficher</p>
  </div>
)}