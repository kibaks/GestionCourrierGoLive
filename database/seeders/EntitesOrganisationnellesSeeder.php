<?php

namespace Database\Seeders;

use App\Models\EntiteOrganisationnelle;
use Illuminate\Database\Seeder;

/**
 * Structure ARMP (Autorité de Régulation des Marchés Publics - RDC).
 * Hiérarchie : direction_generale → direction → division → service / sous-service ; les bureaux sont rattachés directement aux divisions.
 * L'organigramme frontend prend pour racines les directions uniquement (sans la direction générale).
 * N'exécute l'insertion que si la table est vide.
 */
class EntitesOrganisationnellesSeeder extends Seeder
{
    /** Liste des bureaux par défaut (rattachés aux divisions). Utilisée pour insertion initiale et complément à chaque seed. */
    private static function getBureauxParDefaut(): array
    {
        return [
            ['nom' => 'Bureau Courrier et Archives', 'description' => 'Courrier et archives', 'division_nom' => 'Division des Services Généraux', 'ordre' => 1],
            ['nom' => 'Bureau Achats et Marchés', 'description' => 'Achats et marchés', 'division_nom' => 'Division des Services Généraux', 'ordre' => 2],
            ['nom' => 'Bureau Moyens généraux', 'description' => 'Moyens généraux', 'division_nom' => 'Division des Services Généraux', 'ordre' => 3],
            ['nom' => 'Bureau Sourcing et Recrutement', 'description' => 'Sourcing et recrutement', 'division_nom' => 'Division des Ressources Humaines', 'ordre' => 1],
            ['nom' => 'Bureau Carrières et Paie', 'description' => 'Carrières et paie', 'division_nom' => 'Division des Ressources Humaines', 'ordre' => 2],
            ['nom' => 'Bureau Comptabilité', 'description' => 'Comptabilité', 'division_nom' => 'Division Finance et Comptabilité', 'ordre' => 1],
            ['nom' => 'Bureau Trésorerie', 'description' => 'Trésorerie', 'division_nom' => 'Division Finance et Comptabilité', 'ordre' => 2],
            ['nom' => 'Bureau Contrôle budgétaire', 'description' => 'Contrôle budgétaire', 'division_nom' => 'Division Finance et Comptabilité', 'ordre' => 3],
            ['nom' => 'Bureau Facturation Client', 'description' => 'Facturation client', 'division_nom' => 'Division Facturation et Recouvrement', 'ordre' => 1],
            ['nom' => 'Bureau Recouvrement', 'description' => 'Recouvrement', 'division_nom' => 'Division Facturation et Recouvrement', 'ordre' => 2],
            ['nom' => 'Bureau Formation Interne', 'description' => 'Formation interne', 'division_nom' => 'Division de la Formation', 'ordre' => 1],
            ['nom' => 'Bureau Formation des Acteurs', 'description' => 'Formation des acteurs', 'division_nom' => 'Division de la Formation', 'ordre' => 2],
            ['nom' => 'Bureau Administration Provinces Est', 'description' => 'Administration provinces Est', 'division_nom' => 'Division Administration des Provinces', 'ordre' => 1],
            ['nom' => 'Bureau Administration Provinces Ouest', 'description' => 'Administration provinces Ouest', 'division_nom' => 'Division Administration des Provinces', 'ordre' => 2],
            ['nom' => 'Bureau Audit et Contrôle', 'description' => 'Audit et contrôle', 'division_nom' => 'Division Audit interne', 'ordre' => 1],
            ['nom' => 'Bureau Secrétariat CGPMP', 'description' => 'Secrétariat CGPMP', 'division_nom' => 'Secrétariat Permanent CGPMP', 'ordre' => 1],
            ['nom' => 'Bureau Enquêtes', 'description' => 'Enquêtes et régulation', 'division_nom' => 'Division Audits et Enquêtes', 'ordre' => 1],
            ['nom' => 'Bureau Appuis Techniques', 'description' => 'Appuis techniques', 'division_nom' => 'Division des Appuis Techniques', 'ordre' => 1],
        ];
    }

    public function run(): void
    {
        if (EntiteOrganisationnelle::count() > 0) {
            // Si des services / sous-services / bureaux ont été désactivés dans le paramétrage,
            // on les réactive pour restaurer l'organigramme complet.
            EntiteOrganisationnelle::whereIn('type', ['service', 'sous-service', 'bureau'])
                ->update(['actif' => true]);
            $this->command->info('Services, sous-services et bureaux existants réactivés.');

            // Rattacher les bureaux existants aux divisions : si le parent d'un bureau est un service, on remplace par la division (parent du service)
            $bureauxSousService = EntiteOrganisationnelle::where('type', 'bureau')
                ->whereNotNull('parent_id')
                ->get();
            $migres = 0;
            foreach ($bureauxSousService as $bureau) {
                $parent = EntiteOrganisationnelle::find($bureau->parent_id);
                if ($parent && $parent->type === 'service' && $parent->parent_id) {
                    $bureau->update(['parent_id' => $parent->parent_id]);
                    $migres++;
                }
            }
            if ($migres > 0) {
                $this->command->info("{$migres} bureau(x) rattaché(s) à leur division.");
            }

            // Insérer ou compléter les bureaux par défaut (rattachés aux divisions). Crée les manquants à chaque exécution.
            $bureauxParDefaut = self::getBureauxParDefaut();
            $inseres = 0;
            foreach ($bureauxParDefaut as $row) {
                $parent = EntiteOrganisationnelle::where('type', 'division')
                    ->where('nom', $row['division_nom'])
                    ->first();

                if (!$parent) {
                    $this->command->warn("Division introuvable pour le bureau {$row['nom']} ({$row['division_nom']}). Bureau ignoré.");
                    continue;
                }

                $exists = EntiteOrganisationnelle::where('type', 'bureau')
                    ->where('nom', $row['nom'])
                    ->where('parent_id', $parent->id)
                    ->exists();

                if ($exists) {
                    continue;
                }

                EntiteOrganisationnelle::create([
                    'nom' => $row['nom'],
                    'type' => 'bureau',
                    'description' => $row['description'],
                    'parent_id' => $parent->id,
                    'ordre' => $row['ordre'],
                    'actif' => true,
                ]);
                $inseres++;
            }
            if ($inseres > 0) {
                $this->command->info("{$inseres} nouveau(x) bureau(x) créé(s) par le seed.");
            }

            return;
        }

        $idMap = []; // id logique ('1', '2', ...) => uuid créé

        $rows = [
            // Niveau 1 : Direction générale (pour hiérarchie en base uniquement, pas affichée dans l'organigramme)
            ['id' => '2', 'nom' => 'Conseil d\'Administration', 'type' => 'direction_generale', 'description' => 'Organe externe - Président du CA, Administrateurs, Représentant de la Tutelle', 'parent_id' => null, 'ordre' => 0],
            ['id' => '1', 'nom' => 'Direction Générale', 'type' => 'direction_generale', 'description' => 'Autorité de Régulation des Marchés Publics (ARMP) - RDC', 'parent_id' => null, 'ordre' => 1],
            // Niveau 2 : Directions (racines de l'organigramme affiché)
            ['id' => '3', 'nom' => 'Commissaires aux Comptes', 'type' => 'direction', 'description' => 'Commissariat aux comptes', 'parent_id' => '1', 'ordre' => 1],
            ['id' => '4', 'nom' => 'Comité de Règlement des Différends', 'type' => 'direction', 'description' => 'CRD - Règlement des différends', 'parent_id' => '1', 'ordre' => 2],
            ['id' => '5', 'nom' => 'Services Rattachés à la Direction Générale', 'type' => 'direction', 'description' => 'Coordonnateur des Services Rattachés au DG', 'parent_id' => '1', 'ordre' => 3],
            ['id' => '6', 'nom' => 'Direction de la Régulation', 'type' => 'direction', 'description' => 'Régulation des marchés publics', 'parent_id' => '1', 'ordre' => 4],
            ['id' => '7', 'nom' => 'Direction des Statistiques et de la Communication', 'type' => 'direction', 'description' => 'Statistiques et communication', 'parent_id' => '1', 'ordre' => 5],
            ['id' => '8', 'nom' => 'Direction Administrative et Financière', 'type' => 'direction', 'description' => 'Administration et finances', 'parent_id' => '1', 'ordre' => 6],
            ['id' => '9', 'nom' => 'Direction de la Formation et des Appuis Techniques', 'type' => 'direction', 'description' => 'Formation et appuis techniques', 'parent_id' => '1', 'ordre' => 7],
            ['id' => '10', 'nom' => 'Direction de Partenariat Public-Privé', 'type' => 'direction', 'description' => 'Partenariat public-privé', 'parent_id' => '1', 'ordre' => 8],
            // Niveau 3 : Divisions
            ['id' => '11', 'nom' => 'Division Administration des Provinces', 'type' => 'division', 'description' => 'Administration des provinces', 'parent_id' => '5', 'ordre' => 1],
            ['id' => '12', 'nom' => 'Division Audit interne', 'type' => 'division', 'description' => 'Audit interne', 'parent_id' => '5', 'ordre' => 2],
            ['id' => '13', 'nom' => 'Secrétariat Permanent CGPMP', 'type' => 'division', 'description' => 'Secrétariat permanent des CGPMP', 'parent_id' => '5', 'ordre' => 3],
            ['id' => '14', 'nom' => 'Division Audits et Enquêtes', 'type' => 'division', 'description' => 'Audits et enquêtes', 'parent_id' => '6', 'ordre' => 1],
            ['id' => '15', 'nom' => 'Division des Services Généraux', 'type' => 'division', 'description' => 'Services généraux', 'parent_id' => '8', 'ordre' => 1],
            ['id' => '16', 'nom' => 'Division des Ressources Humaines', 'type' => 'division', 'description' => 'Ressources humaines', 'parent_id' => '8', 'ordre' => 2],
            ['id' => '17', 'nom' => 'Division Finance et Comptabilité', 'type' => 'division', 'description' => 'Finance et comptabilité', 'parent_id' => '8', 'ordre' => 3],
            ['id' => '18', 'nom' => 'Division Facturation et Recouvrement', 'type' => 'division', 'description' => 'Facturation et recouvrement', 'parent_id' => '8', 'ordre' => 4],
            ['id' => '19', 'nom' => 'Division de la Formation', 'type' => 'division', 'description' => 'Formation des acteurs', 'parent_id' => '9', 'ordre' => 1],
            ['id' => '20', 'nom' => 'Division des Appuis Techniques', 'type' => 'division', 'description' => 'Appuis techniques', 'parent_id' => '9', 'ordre' => 2],
            // Niveau 4 : Services
            ['id' => '21', 'nom' => 'Service Administration Provinces Est', 'type' => 'service', 'description' => 'Couverture provinces de l\'Est', 'parent_id' => '11', 'ordre' => 1],
            ['id' => '22', 'nom' => 'Service Administration Provinces Ouest', 'type' => 'service', 'description' => 'Couverture provinces de l\'Ouest', 'parent_id' => '11', 'ordre' => 2],
            ['id' => '23', 'nom' => 'Service Audit et Contrôle', 'type' => 'service', 'description' => 'Audit et contrôle interne', 'parent_id' => '12', 'ordre' => 1],
            ['id' => '24', 'nom' => 'Service Secrétariat CGPMP', 'type' => 'service', 'description' => 'Secrétariat permanent', 'parent_id' => '13', 'ordre' => 1],
            ['id' => '25', 'nom' => 'Service Enquêtes Régulation', 'type' => 'service', 'description' => 'Enquêtes et audits régulation', 'parent_id' => '14', 'ordre' => 1],
            ['id' => '26', 'nom' => 'Service Logistique et Moyens généraux', 'type' => 'service', 'description' => 'Logistique', 'parent_id' => '15', 'ordre' => 1],
            ['id' => '27', 'nom' => 'Service Recrutement et Carrières', 'type' => 'service', 'description' => 'Recrutement et carrières', 'parent_id' => '16', 'ordre' => 1],
            ['id' => '28', 'nom' => 'Service Formation et Développement', 'type' => 'service', 'description' => 'Formation RH', 'parent_id' => '16', 'ordre' => 2],
            ['id' => '29', 'nom' => 'Service Comptabilité Générale', 'type' => 'service', 'description' => 'Comptabilité générale', 'parent_id' => '17', 'ordre' => 1],
            ['id' => '30', 'nom' => 'Service Comptabilité Analytique', 'type' => 'service', 'description' => 'Comptabilité analytique', 'parent_id' => '17', 'ordre' => 2],
            ['id' => '31', 'nom' => 'Service Facturation', 'type' => 'service', 'description' => 'Facturation', 'parent_id' => '18', 'ordre' => 1],
            ['id' => '32', 'nom' => 'Service Recouvrement', 'type' => 'service', 'description' => 'Recouvrement', 'parent_id' => '18', 'ordre' => 2],
            ['id' => '33', 'nom' => 'Service Formation des Acteurs', 'type' => 'service', 'description' => 'Formation des acteurs des marchés publics', 'parent_id' => '19', 'ordre' => 1],
            ['id' => '34', 'nom' => 'Service Appuis et Accompagnement', 'type' => 'service', 'description' => 'Appuis techniques', 'parent_id' => '20', 'ordre' => 1],
            // Niveau 5 : Sous-services
            ['id' => '35', 'nom' => 'Sous-service Classement et Archives', 'type' => 'sous-service', 'description' => 'Classement et indexation', 'parent_id' => '21', 'ordre' => 1],
            ['id' => '36', 'nom' => 'Sous-service Contentieux', 'type' => 'sous-service', 'description' => 'Gestion des contentieux', 'parent_id' => '25', 'ordre' => 1],
            ['id' => '37', 'nom' => 'Sous-service Conformité', 'type' => 'sous-service', 'description' => 'Conformité réglementaire', 'parent_id' => '25', 'ordre' => 2],
            ['id' => '38', 'nom' => 'Sous-service Paie', 'type' => 'sous-service', 'description' => 'Gestion de la paie', 'parent_id' => '27', 'ordre' => 1],
            ['id' => '39', 'nom' => 'Sous-service Avantages sociaux', 'type' => 'sous-service', 'description' => 'Avantages sociaux', 'parent_id' => '27', 'ordre' => 2],
            ['id' => '40', 'nom' => 'Sous-service Clôture et Consolidation', 'type' => 'sous-service', 'description' => 'Clôture et consolidation', 'parent_id' => '29', 'ordre' => 1],
            ['id' => '41', 'nom' => 'Sous-service Suivi Budget', 'type' => 'sous-service', 'description' => 'Suivi et contrôle budgétaire', 'parent_id' => '30', 'ordre' => 1],
            ['id' => '42', 'nom' => 'Sous-service Recouvrement Créances', 'type' => 'sous-service', 'description' => 'Recouvrement des créances', 'parent_id' => '32', 'ordre' => 1],
            ['id' => '43', 'nom' => 'Sous-service Formation Continue', 'type' => 'sous-service', 'description' => 'Formation continue', 'parent_id' => '33', 'ordre' => 1],
            // Niveau 6 : Bureaux (rattachés directement aux divisions)
            ['id' => '44', 'nom' => 'Bureau Courrier et Archives', 'type' => 'bureau', 'description' => 'Courrier et archives', 'parent_id' => '15', 'ordre' => 1],
            ['id' => '45', 'nom' => 'Bureau Achats et Marchés', 'type' => 'bureau', 'description' => 'Achats et marchés', 'parent_id' => '15', 'ordre' => 2],
            ['id' => '51', 'nom' => 'Bureau Moyens généraux', 'type' => 'bureau', 'description' => 'Moyens généraux', 'parent_id' => '15', 'ordre' => 3],
            ['id' => '46', 'nom' => 'Bureau Sourcing et Recrutement', 'type' => 'bureau', 'description' => 'Sourcing et recrutement', 'parent_id' => '16', 'ordre' => 1],
            ['id' => '52', 'nom' => 'Bureau Carrières et Paie', 'type' => 'bureau', 'description' => 'Carrières et paie', 'parent_id' => '16', 'ordre' => 2],
            ['id' => '47', 'nom' => 'Bureau Comptabilité', 'type' => 'bureau', 'description' => 'Comptabilité', 'parent_id' => '17', 'ordre' => 1],
            ['id' => '48', 'nom' => 'Bureau Trésorerie', 'type' => 'bureau', 'description' => 'Trésorerie', 'parent_id' => '17', 'ordre' => 2],
            ['id' => '53', 'nom' => 'Bureau Contrôle budgétaire', 'type' => 'bureau', 'description' => 'Contrôle budgétaire', 'parent_id' => '17', 'ordre' => 3],
            ['id' => '49', 'nom' => 'Bureau Facturation Client', 'type' => 'bureau', 'description' => 'Facturation client', 'parent_id' => '18', 'ordre' => 1],
            ['id' => '54', 'nom' => 'Bureau Recouvrement', 'type' => 'bureau', 'description' => 'Recouvrement', 'parent_id' => '18', 'ordre' => 2],
            ['id' => '50', 'nom' => 'Bureau Formation Interne', 'type' => 'bureau', 'description' => 'Formation interne', 'parent_id' => '19', 'ordre' => 1],
            ['id' => '55', 'nom' => 'Bureau Formation des Acteurs', 'type' => 'bureau', 'description' => 'Formation des acteurs', 'parent_id' => '19', 'ordre' => 2],
            ['id' => '56', 'nom' => 'Bureau Administration Provinces Est', 'type' => 'bureau', 'description' => 'Administration provinces Est', 'parent_id' => '11', 'ordre' => 1],
            ['id' => '57', 'nom' => 'Bureau Administration Provinces Ouest', 'type' => 'bureau', 'description' => 'Administration provinces Ouest', 'parent_id' => '11', 'ordre' => 2],
            ['id' => '58', 'nom' => 'Bureau Audit et Contrôle', 'type' => 'bureau', 'description' => 'Audit et contrôle', 'parent_id' => '12', 'ordre' => 1],
            ['id' => '59', 'nom' => 'Bureau Secrétariat CGPMP', 'type' => 'bureau', 'description' => 'Secrétariat CGPMP', 'parent_id' => '13', 'ordre' => 1],
            ['id' => '60', 'nom' => 'Bureau Enquêtes', 'type' => 'bureau', 'description' => 'Enquêtes et régulation', 'parent_id' => '14', 'ordre' => 1],
            ['id' => '61', 'nom' => 'Bureau Appuis Techniques', 'type' => 'bureau', 'description' => 'Appuis techniques', 'parent_id' => '20', 'ordre' => 1],
        ];

        foreach ($rows as $row) {
            $parentId = isset($row['parent_id'], $idMap[$row['parent_id']])
                ? $idMap[$row['parent_id']]
                : null;
            $e = EntiteOrganisationnelle::create([
                'nom' => $row['nom'],
                'type' => $row['type'],
                'description' => $row['description'],
                'parent_id' => $parentId,
                'ordre' => $row['ordre'],
                'actif' => true,
            ]);
            $idMap[$row['id']] = $e->id;
        }

        $this->command->info('Entités organisationnelles ARMP créées : ' . count($rows) . ' enregistrements (direction → division → service → sous-service → bureau).');
    }
}
