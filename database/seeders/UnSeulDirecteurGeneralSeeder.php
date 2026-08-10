<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Garantit qu'il n'y a qu'un seul utilisateur avec le rôle DIRECTEUR_GENERAL en base.
 * Conserve le premier (tri par email), passe les autres en AGENT.
 * Exécutable seul : php artisan db:seed --class=UnSeulDirecteurGeneralSeeder
 */
class UnSeulDirecteurGeneralSeeder extends Seeder
{
    public function run(): void
    {
        $dgUsers = User::where('role', 'DIRECTEUR_GENERAL')->orderBy('email')->get();

        if ($dgUsers->count() <= 1) {
            $this->command->info('Un seul Directeur Général (ou aucun) en base. Aucune modification.');
            return;
        }

        $keep = $dgUsers->first();
        $modified = 0;

        foreach ($dgUsers as $u) {
            if ($u->id !== $keep->id) {
                $u->update(['role' => 'AGENT']);
                $this->command->warn("Rôle DG retiré pour {$u->email} (un seul DG autorisé).");
                $modified++;
            }
        }

        $this->command->info("{$modified} utilisateur(s) passé(s) en AGENT. Un seul DG conservé : {$keep->email}");
    }
}
