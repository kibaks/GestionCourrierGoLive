<?php

namespace Database\Seeders;

use App\Models\EntiteOrganisationnelle;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Désigne un chef de division pour chaque division sans responsable,
 * en choisissant parmi les agents rattachés aux bureaux/services de la division.
 *
 * - Si possible, prend un utilisateur ayant déjà le rôle CHEF_SERVICE.
 * - Sinon, promeut un AGENT en CHEF_SERVICE pour cette division.
 * - Met à jour entites_organisationnelles.responsable_id avec l'id du chef choisi.
 */
class PlacerChefsDivisionSeeder extends Seeder
{
    public function run(): void
    {
        $divisions = EntiteOrganisationnelle::where('type', 'division')
            ->where('actif', true)
            ->get();

        if ($divisions->isEmpty()) {
            $this->command?->info('Aucune division active trouvée.');
            return;
        }

        $updated = 0;

        foreach ($divisions as $division) {
            // Ne pas écraser un responsable déjà défini manuellement
            if ($division->responsable_id) {
                continue;
            }

            // Récupérer les IDs descendants (services, sous-services, bureaux) de cette division
            $descendantIds = $this->getDescendantEntityIdsForDivision($division);
            if (empty($descendantIds)) {
                continue;
            }

            // Chercher les utilisateurs rattachés à ces entités
            $users = User::whereIn('entite_id', $descendantIds)
                ->where('actif', true)
                ->get();

            if ($users->isEmpty()) {
                continue;
            }

            // Priorité : déjà CHEF_SERVICE, puis DIRECTEUR, sinon n'importe quel agent
            $chef = $users->firstWhere('role', 'CHEF_SERVICE')
                ?? $users->firstWhere('role', 'DIRECTEUR')
                ?? $users->first();

            // Promouvoir en CHEF_SERVICE si nécessaire
            if ($chef->role !== 'CHEF_SERVICE') {
                $chef->role = 'CHEF_SERVICE';
                $chef->save();
            }

            $division->responsable_id = $chef->id;
            $division->save();
            $updated++;
        }

        $this->command?->info("{$updated} chef(s) de division désigné(s) à partir des agents de bureaux/services.");
    }

    /**
     * Retourne les IDs des entités descendantes d'une division :
     * - la division elle-même
     * - les services dont parent_id = division
     * - les sous-services enfants de ces services
     * - les bureaux dont parent_id = division
     */
    protected function getDescendantEntityIdsForDivision(EntiteOrganisationnelle $division): array
    {
        $ids = [$division->id];

        $services = EntiteOrganisationnelle::where('parent_id', $division->id)
            ->where('actif', true)
            ->where('type', 'service')
            ->pluck('id')
            ->all();

        if (!empty($services)) {
            $ids = array_merge($ids, $services);

            $sousServices = EntiteOrganisationnelle::whereIn('parent_id', $services)
                ->where('actif', true)
                ->where('type', 'sous-service')
                ->pluck('id')
                ->all();

            if (!empty($sousServices)) {
                $ids = array_merge($ids, $sousServices);
            }
        }

        // Bureaux rattachés directement à la division
        $bureaux = EntiteOrganisationnelle::where('parent_id', $division->id)
            ->where('actif', true)
            ->where('type', 'bureau')
            ->pluck('id')
            ->all();

        if (!empty($bureaux)) {
            $ids = array_merge($ids, $bureaux);
        }

        return array_values(array_unique($ids));
    }
}

