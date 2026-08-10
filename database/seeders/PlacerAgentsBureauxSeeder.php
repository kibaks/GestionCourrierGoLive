<?php

namespace Database\Seeders;

use App\Models\EntiteOrganisationnelle;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Affecte les agents (et chefs de service) sans entite_id à un bureau.
 * Répartit les utilisateurs de manière équilibrée entre les bureaux actifs.
 */
class PlacerAgentsBureauxSeeder extends Seeder
{
    public function run(): void
    {
        $bureaux = EntiteOrganisationnelle::where('type', 'bureau')->where('actif', true)->orderBy('ordre')->get();
        if ($bureaux->isEmpty()) {
            $this->command->warn('Aucun bureau actif en base. Exécutez d\'abord EntitesOrganisationnellesSeeder.');
            return;
        }

        $users = User::whereNull('entite_id')
            ->whereIn('role', ['AGENT', 'CHEF_SERVICE'])
            ->where('actif', true)
            ->get();

        if ($users->isEmpty()) {
            $this->command->info('Aucun agent sans affectation (entite_id déjà renseigné pour tous).');
            return;
        }

        $bureauxIds = $bureaux->pluck('id')->toArray();
        $count = count($bureauxIds);
        $updated = 0;

        foreach ($users as $index => $user) {
            $bureauId = $bureauxIds[$index % $count];
            $bureau = $bureaux->firstWhere('id', $bureauId);
            if (!$bureau) {
                continue;
            }

            $directionNom = null;
            $serviceNom = null;
            $this->resolveDirectionEtService($bureau->id, $directionNom, $serviceNom);

            $user->entite_id = $bureauId;
            if ($directionNom !== null) {
                $user->direction = $directionNom;
            }
            if ($serviceNom !== null) {
                $user->service = $serviceNom;
            }
            $user->save();
            $updated++;
        }

        $this->command->info("{$updated} agent(s) affecté(s) à un bureau.");
    }

    private function resolveDirectionEtService(string $entityId, ?string &$directionNom, ?string &$serviceNom): void
    {
        $directionNom = null;
        $serviceNom = null;
        $currentId = $entityId;
        $maxDepth = 10;
        $depth = 0;

        while ($currentId && $depth < $maxDepth) {
            $entity = EntiteOrganisationnelle::find($currentId);
            if (!$entity) {
                break;
            }
            if ($entity->type === 'direction') {
                $directionNom = $entity->nom;
            }
            if (in_array($entity->type, ['service', 'division'], true)) {
                $serviceNom = $entity->nom;
            }
            $currentId = $entity->parent_id;
            $depth++;
        }
    }
}
