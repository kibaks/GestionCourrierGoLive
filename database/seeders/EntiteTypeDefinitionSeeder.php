<?php

namespace Database\Seeders;

use App\Models\EntiteTypeDefinition;
use Illuminate\Database\Seeder;

/**
 * Insère les libellés par défaut des types d'entités (Direction, Service, Sous-service, etc.)
 * uniquement si la table est vide, pour ne pas écraser les personnalisations.
 */
class EntiteTypeDefinitionSeeder extends Seeder
{
    public function run(): void
    {
        // Ordre hiérarchique : Direction générale → Direction → Division → Service → Sous-service → Bureau → Cellule
        $defaults = [
            ['code' => 'direction_generale', 'libelle_singulier' => 'Direction générale', 'libelle_pluriel' => 'Directions générales', 'ordre' => 1, 'description' => 'Sommet de la structure (ex. Direction Générale, organes externes)', 'icone' => 'building'],
            ['code' => 'direction', 'libelle_singulier' => 'Direction', 'libelle_pluriel' => 'Directions', 'ordre' => 2, 'description' => 'Directions rattachées à la Direction générale', 'icone' => 'sitemap'],
            ['code' => 'division', 'libelle_singulier' => 'Division', 'libelle_pluriel' => 'Divisions', 'ordre' => 3, 'description' => 'Divisions sous une direction', 'icone' => 'columns'],
            ['code' => 'service', 'libelle_singulier' => 'Service', 'libelle_pluriel' => 'Services', 'ordre' => 4, 'description' => 'Services sous une division', 'icone' => 'folder'],
            ['code' => 'sous-service', 'libelle_singulier' => 'Sous-service', 'libelle_pluriel' => 'Sous-services', 'ordre' => 5, 'description' => 'Sous-services rattachés à un service', 'icone' => 'layer-group'],
            ['code' => 'bureau', 'libelle_singulier' => 'Bureau', 'libelle_pluriel' => 'Bureaux', 'ordre' => 6, 'description' => null, 'icone' => 'briefcase'],
            ['code' => 'cellule', 'libelle_singulier' => 'Cellule', 'libelle_pluriel' => 'Cellules', 'ordre' => 7, 'description' => null, 'icone' => 'cube'],
        ];

        foreach ($defaults as $row) {
            EntiteTypeDefinition::updateOrCreate(
                ['code' => $row['code']],
                array_merge($row, ['actif' => true])
            );
        }
    }
}
