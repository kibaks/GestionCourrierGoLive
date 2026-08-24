<?php

namespace Database\Seeders;

use App\Models\EntiteOrganisationnelle;
use Illuminate\Database\Seeder;

/**
 * Rôles de chaque entité dans le traitement du courrier (module Organigramme — ARMP).
 * Idempotent : recalcule la colonne courrier_roles pour toutes les entités.
 *
 * Règles (structure ARMP) :
 * - Direction Générale (Cabinet)      : DIFFUSION, SIGNATURE, EXPEDITION
 * - Bureau Courrier et Archives        : RECEPTION, ENREGISTREMENT, DIFFUSION, ARCHIVAGE (guichet courrier)
 * - *Archiv* (ex. Classement et Archives) : ARCHIVAGE
 * - Directions                         : TRAITEMENT, REPONSE
 * - Divisions / services / sous-services / bureaux : TRAITEMENT
 * - Conseil d'Administration           : aucun (organe externe)
 */
class EntitesCourrierRolesSeeder extends Seeder
{
    public function run(): void
    {
        $updated = 0;

        EntiteOrganisationnelle::all()->each(function (EntiteOrganisationnelle $e) use (&$updated) {
            $nom = mb_strtolower((string) $e->nom);
            $roles = [];

            if ($e->type === 'direction_generale') {
                if (str_contains($nom, 'direction générale')) {
                    $roles = ['DIFFUSION', 'SIGNATURE', 'EXPEDITION'];
                }
            } elseif (str_contains($nom, 'courrier')) {
                $roles = ['RECEPTION', 'ENREGISTREMENT', 'DIFFUSION', 'ARCHIVAGE'];
            } elseif (str_contains($nom, 'archiv')) {
                $roles = ['ARCHIVAGE'];
            } elseif ($e->type === 'direction') {
                $roles = ['TRAITEMENT', 'REPONSE'];
            } else {
                $roles = ['TRAITEMENT'];
            }

            $current = $e->courrier_roles ?? null;
            $next = $roles !== [] ? $roles : null;
            if (json_encode($current) !== json_encode($next)) {
                $e->update(['courrier_roles' => $next]);
                $updated++;
            }
        });

        $this->command->info("EntitesCourrierRolesSeeder : {$updated} entité(s) mise(s) à jour.");
    }
}
