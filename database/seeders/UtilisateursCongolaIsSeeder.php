<?php

namespace Database\Seeders;

use App\Models\EntiteOrganisationnelle;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Peuple chaque Direction ARMP-RDC avec des utilisateurs portant des noms
 * congolais authentiques (Lingala, Luba, Kikongo, Swahili, Tshiluba).
 *
 * Structure par Direction :
 *   - 1 DIRECTEUR nommé
 *   - 1 SECRETAIRE nommé
 *   - N CHEF_SERVICE (1 par division/service de la direction)
 *   - N AGENT (2-4 par division/service de la direction)
 *
 * Peut être lancé seul : php artisan db:seed --class=UtilisateursCongolaIsSeeder
 * Mot de passe commun : "password"
 */
class UtilisateursCongolaIsSeeder extends Seeder
{
    private const PASSWORD = 'password';

    /**
     * Utilisateurs nommés à créer explicitement, répartis par Direction ARMP-RDC.
     * Format : ['nom', 'email', 'role', 'direction', 'service']
     *
     * Tous les prénoms et noms sont 100 % congolais (RDC) :
     *   Lingala  : Moise, Fiston, Tresor, Amani, Furaha, Zawadi, Neema, Bahati, Riziki…
     *   Luba     : Ilunga, Mukendi, Kasongo, Mbuyi, Kalombo, Tshimanga, Kabongo…
     *   Kikongo  : Nzuzi, Matondo, Nsimba, Mabika, Luyeye, Bolemba, Ekanga…
     *   Swahili  : Baraka, Bisimwa, Mashako, Kongolo, Shabani, Bwana…
     *   Tshiluba : Tshisekedi, Ntumba, Ngalula, Nkashama, Kabuya, Kabila…
     *   Noms à sens (très courants en RDC) : Dieudonné, Bienvenu, Espoir, Gloire, Héritier,
     *     Patience, Joie, Grâce, Merveille, Providence, Béni, Aimé, Trésor, Séraphin…
     *
     * Couverture : 1 DIRECTEUR + 1-2 SECRETAIRE + 1 CHEF_SERVICE / service + 3-5 AGENT / service
     */
    private static function utilisateursParDirection(): array
    {
        return [

            // ══════════════════════════════════════════════════════════════════
            // DIRECTION GÉNÉRALE
            // ══════════════════════════════════════════════════════════════════
            ['Dieudonné Tshisekedi',   'dg@armp-rdc.cd',                    'DIRECTEUR_GENERAL', null, null],
            ['Scholastique Ntumba',    'secretariat.dg@armp-rdc.cd',        'SECRETAIRE',        null, null],
            ['Nguya Ngalula',          'secretariat2.dg@armp-rdc.cd',       'SECRETAIRE',        null, null],

            // ══════════════════════════════════════════════════════════════════
            // COMMISSAIRES AUX COMPTES
            // ══════════════════════════════════════════════════════════════════
            ['Séraphin Ilunga',        'commissaire1@armp-rdc.cd',          'DIRECTEUR',    'Commissaires aux Comptes', null],
            ['Béni Kasongo',           'commissaire2@armp-rdc.cd',          'AGENT',        'Commissaires aux Comptes', null],
            ['Mwilu Kabila',           'commissaire3@armp-rdc.cd',          'AGENT',        'Commissaires aux Comptes', null],
            ['Nzuzi Matondo',          'commissaire4@armp-rdc.cd',          'AGENT',        'Commissaires aux Comptes', null],

            // ══════════════════════════════════════════════════════════════════
            // COMITÉ DE RÈGLEMENT DES DIFFÉRENDS (CRD)
            // ══════════════════════════════════════════════════════════════════
            ['Moise Ngoy',             'crd.president@armp-rdc.cd',         'DIRECTEUR',    'Comité de Règlement des Différends', null],
            ['Zawadi Mbuyi',           'sec.crd@armp-rdc.cd',               'SECRETAIRE',   'Comité de Règlement des Différends', null],
            ['Tresor Etsomi',          'crd.agent1@armp-rdc.cd',            'AGENT',        'Comité de Règlement des Différends', null],
            ['Patience Tshimanga',     'crd.agent2@armp-rdc.cd',            'AGENT',        'Comité de Règlement des Différends', null],
            ['Gloire Kabuya',          'crd.agent3@armp-rdc.cd',            'AGENT',        'Comité de Règlement des Différends', null],
            ['Héritier Ngandu',        'crd.agent4@armp-rdc.cd',            'AGENT',        'Comité de Règlement des Différends', null],
            ['Merveille Batubenga',    'crd.agent5@armp-rdc.cd',            'AGENT',        'Comité de Règlement des Différends', null],

            // ══════════════════════════════════════════════════════════════════
            // SERVICES RATTACHÉS À LA DIRECTION GÉNÉRALE
            // Divisions : Division Administration des Provinces, Division Audit interne,
            //             Secrétariat Permanent CGPMP
            // Services  : Svc Admin Provinces Est, Svc Admin Provinces Ouest,
            //             Svc Audit et Contrôle, Svc Secrétariat CGPMP
            // ══════════════════════════════════════════════════════════════════
            ['Kabwika Tshombe',        'coord.rattaches@armp-rdc.cd',       'DIRECTEUR',    'Services Rattachés à la Direction Générale', null],
            ['Ngonde Bolemba',         'sec.rattaches@armp-rdc.cd',         'SECRETAIRE',   'Services Rattachés à la Direction Générale', null],
            // Service Audit et Contrôle
            ['Kukua Lukusa',           'chef.audit.int@armp-rdc.cd',        'CHEF_SERVICE', 'Services Rattachés à la Direction Générale', 'Service Audit et Contrôle'],
            ['Fiston Lumpungu',        'agent.audit1@armp-rdc.cd',          'AGENT',        'Services Rattachés à la Direction Générale', 'Service Audit et Contrôle'],
            ['Bisimwa Lubamba',        'agent.audit2@armp-rdc.cd',          'AGENT',        'Services Rattachés à la Direction Générale', 'Service Audit et Contrôle'],
            ['Joie Mwangu',            'agent.audit3@armp-rdc.cd',          'AGENT',        'Services Rattachés à la Direction Générale', 'Service Audit et Contrôle'],
            ['Amani Kayumba',          'agent.audit4@armp-rdc.cd',          'AGENT',        'Services Rattachés à la Direction Générale', 'Service Audit et Contrôle'],
            // Service Administration Provinces Est
            ['Mwamba Kasongo',         'chef.prov.est@armp-rdc.cd',         'CHEF_SERVICE', 'Services Rattachés à la Direction Générale', 'Service Administration Provinces Est'],
            ['Kabuya Kwilu',           'agent.prov.est1@armp-rdc.cd',       'AGENT',        'Services Rattachés à la Direction Générale', 'Service Administration Provinces Est'],
            ['Furaha Sankuru',         'agent.prov.est2@armp-rdc.cd',       'AGENT',        'Services Rattachés à la Direction Générale', 'Service Administration Provinces Est'],
            ['Trésor Bisimwa',         'agent.prov.est3@armp-rdc.cd',       'AGENT',        'Services Rattachés à la Direction Générale', 'Service Administration Provinces Est'],
            ['Kabongo Kongolo',        'agent.prov.est4@armp-rdc.cd',       'AGENT',        'Services Rattachés à la Direction Générale', 'Service Administration Provinces Est'],
            // Service Administration Provinces Ouest
            ['Nkashama Ngoy',          'chef.prov.ouest@armp-rdc.cd',       'CHEF_SERVICE', 'Services Rattachés à la Direction Générale', 'Service Administration Provinces Ouest'],
            ['Epulu Kiala',            'agent.prov.ouest1@armp-rdc.cd',     'AGENT',        'Services Rattachés à la Direction Générale', 'Service Administration Provinces Ouest'],
            ['Nsimba Nzuzi',           'agent.prov.ouest2@armp-rdc.cd',     'AGENT',        'Services Rattachés à la Direction Générale', 'Service Administration Provinces Ouest'],
            ['Mabika Matondo',         'agent.prov.ouest3@armp-rdc.cd',     'AGENT',        'Services Rattachés à la Direction Générale', 'Service Administration Provinces Ouest'],
            ['Neema Luyeye',           'agent.prov.ouest4@armp-rdc.cd',     'AGENT',        'Services Rattachés à la Direction Générale', 'Service Administration Provinces Ouest'],
            // Service Secrétariat CGPMP
            ['Kayumba Losele',         'chef.cgpmp@armp-rdc.cd',            'CHEF_SERVICE', 'Services Rattachés à la Direction Générale', 'Service Secrétariat CGPMP'],
            ['Riziki Etsomi',          'agent.cgpmp1@armp-rdc.cd',          'AGENT',        'Services Rattachés à la Direction Générale', 'Service Secrétariat CGPMP'],
            ['Kabila Mbandaka',        'agent.cgpmp2@armp-rdc.cd',          'AGENT',        'Services Rattachés à la Direction Générale', 'Service Secrétariat CGPMP'],
            ['Tshimanga Bolamba',      'agent.cgpmp3@armp-rdc.cd',          'AGENT',        'Services Rattachés à la Direction Générale', 'Service Secrétariat CGPMP'],

            // ══════════════════════════════════════════════════════════════════
            // DIRECTION DE LA RÉGULATION
            // Division : Division Audits et Enquêtes
            // Service  : Service Enquêtes Régulation
            //            Sous-services : Sous-service Contentieux, Sous-service Conformité
            // ══════════════════════════════════════════════════════════════════
            ['Mukendi Ilunga',         'dir.regulation@armp-rdc.cd',        'DIRECTEUR',    'Direction de la Régulation', null],
            ['Baraka Matondo',         'sec.regulation@armp-rdc.cd',        'SECRETAIRE',   'Direction de la Régulation', null],
            // Service Enquêtes Régulation
            ['Ngoy Kasongo',           'chef.enquetes@armp-rdc.cd',         'CHEF_SERVICE', 'Direction de la Régulation', 'Service Enquêtes Régulation'],
            ['Nkashama Mfuamba',       'agent.reg1@armp-rdc.cd',            'AGENT',        'Direction de la Régulation', 'Service Enquêtes Régulation'],
            ['Kiala Kapenda',          'agent.reg2@armp-rdc.cd',            'AGENT',        'Direction de la Régulation', 'Service Enquêtes Régulation'],
            ['Dibwe Kabangu',          'agent.reg3@armp-rdc.cd',            'AGENT',        'Direction de la Régulation', 'Service Enquêtes Régulation'],
            ['Bahati Ekanga',          'agent.reg4@armp-rdc.cd',            'AGENT',        'Direction de la Régulation', 'Service Enquêtes Régulation'],
            ['Mwilu Tshombe',          'agent.reg5@armp-rdc.cd',            'AGENT',        'Direction de la Régulation', 'Service Enquêtes Régulation'],
            ['Ngonde Kalonji',         'agent.reg6@armp-rdc.cd',            'AGENT',        'Direction de la Régulation', 'Service Enquêtes Régulation'],

            // ══════════════════════════════════════════════════════════════════
            // DIRECTION DES STATISTIQUES ET DE LA COMMUNICATION
            // Pas de division/service dans l'organigramme → rattachement direct
            // ══════════════════════════════════════════════════════════════════
            ['Mbuyi Kalombo',          'dir.stat@armp-rdc.cd',              'DIRECTEUR',    'Direction des Statistiques et de la Communication', null],
            ['Ngalula Bolemba',        'sec.stat@armp-rdc.cd',              'SECRETAIRE',   'Direction des Statistiques et de la Communication', null],
            ['Makiadi Ngandu',         'chef.statistiques@armp-rdc.cd',     'CHEF_SERVICE', 'Direction des Statistiques et de la Communication', null],
            ['Luyeye Bolamba',         'chef.communication@armp-rdc.cd',    'CHEF_SERVICE', 'Direction des Statistiques et de la Communication', null],
            // Agents statistiques
            ['Zawadi Mwamba',          'agent.stat1@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            ['Kabuya Lumbala',         'agent.stat2@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            ['Bisimwa Ngoy',           'agent.stat3@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            ['Kibwe Mombele',          'agent.stat4@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            ['Ntumba Dibwe',           'agent.stat5@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            // Agents communication
            ['Lisanga Ekanga',         'agent.comm1@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            ['Bwana Kongolo',          'agent.comm2@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            ['Ndolo Kyungu',           'agent.comm3@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            ['Mashako Ngoie',          'agent.comm4@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],
            ['Pande Kiluba',           'agent.comm5@armp-rdc.cd',           'AGENT',        'Direction des Statistiques et de la Communication', null],

            // ══════════════════════════════════════════════════════════════════
            // DIRECTION ADMINISTRATIVE ET FINANCIÈRE
            // Divisions : Div Services Généraux, Div RH, Div Finance et Comptabilité,
            //             Div Facturation et Recouvrement
            // Services  : Svc Logistique, Svc Recrutement et Carrières,
            //             Svc Formation et Développement, Svc Comptabilité Générale,
            //             Svc Comptabilité Analytique, Svc Facturation, Svc Recouvrement
            // ══════════════════════════════════════════════════════════════════
            ['Kabongo Mukendi',        'dir.admin@armp-rdc.cd',             'DIRECTEUR',    'Direction Administrative et Financière', null],
            ['Nzuzi Tshimanga',        'sec.admin@armp-rdc.cd',             'SECRETAIRE',   'Direction Administrative et Financière', null],
            // Service Logistique et Moyens généraux
            ['Kabuya Mwamba',          'chef.logistique@armp-rdc.cd',       'CHEF_SERVICE', 'Direction Administrative et Financière', 'Service Logistique et Moyens généraux'],
            ['Furaha Lobho',           'agent.courrier@armp-rdc.cd',        'AGENT',        'Direction Administrative et Financière', 'Service Logistique et Moyens généraux'],
            ['Espoir Lumbala',         'agent.archives@armp-rdc.cd',        'AGENT',        'Direction Administrative et Financière', 'Service Logistique et Moyens généraux'],
            ['Mfuamba Botuli',         'agent.logist1@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Logistique et Moyens généraux'],
            ['Kwilu Batubenga',        'agent.logist2@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Logistique et Moyens généraux'],
            // Service Recrutement et Carrières
            ['Bienvenu Kasongo',       'chef.rh@armp-rdc.cd',               'CHEF_SERVICE', 'Direction Administrative et Financière', 'Service Recrutement et Carrières'],
            ['Mabika Ngalula',         'agent.rh1@armp-rdc.cd',             'AGENT',        'Direction Administrative et Financière', 'Service Recrutement et Carrières'],
            ['Muteba Kalombo',         'agent.rh2@armp-rdc.cd',             'AGENT',        'Direction Administrative et Financière', 'Service Recrutement et Carrières'],
            ['Kabuya Ntumba',          'agent.rh3@armp-rdc.cd',             'AGENT',        'Direction Administrative et Financière', 'Service Recrutement et Carrières'],
            ['Nkashama Ilunga',        'agent.rh4@armp-rdc.cd',             'AGENT',        'Direction Administrative et Financière', 'Service Recrutement et Carrières'],
            // Service Formation et Développement
            ['Musangu Dibwe',          'chef.form.rh@armp-rdc.cd',          'CHEF_SERVICE', 'Direction Administrative et Financière', 'Service Formation et Développement'],
            ['Mwamba Kabongo',         'agent.form.rh1@armp-rdc.cd',        'AGENT',        'Direction Administrative et Financière', 'Service Formation et Développement'],
            ['Kongolo Bisimwa',        'agent.form.rh2@armp-rdc.cd',        'AGENT',        'Direction Administrative et Financière', 'Service Formation et Développement'],
            // Service Comptabilité Générale
            ['Riziki Bisimwa',         'chef.finance@armp-rdc.cd',          'CHEF_SERVICE', 'Direction Administrative et Financière', 'Service Comptabilité Générale'],
            ['Kyungu Kiluba',          'agent.compta1@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Comptabilité Générale'],
            ['Kiluba Kapenda',         'agent.compta2@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Comptabilité Générale'],
            ['Kabila Nzuzi',           'agent.compta3@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Comptabilité Générale'],
            ['Tshombe Mbuyi',          'agent.compta4@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Comptabilité Générale'],
            // Service Comptabilité Analytique
            ['Malumba Joie',           'chef.compta.ana@armp-rdc.cd',       'CHEF_SERVICE', 'Direction Administrative et Financière', 'Service Comptabilité Analytique'],
            ['Luyeye Ngoie',           'agent.compta.ana1@armp-rdc.cd',     'AGENT',        'Direction Administrative et Financière', 'Service Comptabilité Analytique'],
            ['Ngoie Kabangu',          'agent.compta.ana2@armp-rdc.cd',     'AGENT',        'Direction Administrative et Financière', 'Service Comptabilité Analytique'],
            // Service Facturation
            ['Tshisekedi Malumba',     'chef.facturation@armp-rdc.cd',      'CHEF_SERVICE', 'Direction Administrative et Financière', 'Service Facturation'],
            ['Katanga Kibwe',          'agent.fact1@armp-rdc.cd',           'AGENT',        'Direction Administrative et Financière', 'Service Facturation'],
            ['Kibwe Tshombe',          'agent.fact2@armp-rdc.cd',           'AGENT',        'Direction Administrative et Financière', 'Service Facturation'],
            ['Amani Kongolo',          'agent.fact3@armp-rdc.cd',           'AGENT',        'Direction Administrative et Financière', 'Service Facturation'],
            // Service Recouvrement
            ['Ilunga Ngoy',            'chef.recouvrement@armp-rdc.cd',     'CHEF_SERVICE', 'Direction Administrative et Financière', 'Service Recouvrement'],
            ['Pande Ngoie',            'agent.recouv1@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Recouvrement'],
            ['Ngoie Kabila',           'agent.recouv2@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Recouvrement'],
            ['Bahati Mbuyi',           'agent.recouv3@armp-rdc.cd',         'AGENT',        'Direction Administrative et Financière', 'Service Recouvrement'],

            // ══════════════════════════════════════════════════════════════════
            // DIRECTION DE LA FORMATION ET DES APPUIS TECHNIQUES
            // Divisions : Division de la Formation, Division des Appuis Techniques
            // Services  : Service Formation des Acteurs, Service Appuis et Accompagnement
            // ══════════════════════════════════════════════════════════════════
            ['Kalombo Mukendi',        'dir.formation@armp-rdc.cd',         'DIRECTEUR',    'Direction de la Formation et des Appuis Techniques', null],
            ['Nzuzi Kayumba',          'sec.formation@armp-rdc.cd',         'SECRETAIRE',   'Direction de la Formation et des Appuis Techniques', null],
            // Service Formation des Acteurs
            ['Musangu Kabangu',        'chef.formation@armp-rdc.cd',        'CHEF_SERVICE', 'Direction de la Formation et des Appuis Techniques', 'Service Formation des Acteurs'],
            ['Kongolo Baraka',         'agent.form1@armp-rdc.cd',           'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Formation des Acteurs'],
            ['Baraka Mwangu',          'agent.form2@armp-rdc.cd',           'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Formation des Acteurs'],
            ['Mashako Ilunga',         'agent.form3@armp-rdc.cd',           'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Formation des Acteurs'],
            ['Mfuamba Kasongo',        'agent.form4@armp-rdc.cd',           'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Formation des Acteurs'],
            ['Losele Ntumba',          'agent.form5@armp-rdc.cd',           'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Formation des Acteurs'],
            // Service Appuis et Accompagnement
            ['Kabangu Nkashama',       'chef.appuis@armp-rdc.cd',           'CHEF_SERVICE', 'Direction de la Formation et des Appuis Techniques', 'Service Appuis et Accompagnement'],
            ['Mitumba Dibwe',          'agent.appui1@armp-rdc.cd',          'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Appuis et Accompagnement'],
            ['Mwangu Bisimwa',         'agent.appui2@armp-rdc.cd',          'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Appuis et Accompagnement'],
            ['Sankuru Tshimanga',      'agent.appui3@armp-rdc.cd',          'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Appuis et Accompagnement'],
            ['Baraka Kabongo',         'agent.appui4@armp-rdc.cd',          'AGENT',        'Direction de la Formation et des Appuis Techniques', 'Service Appuis et Accompagnement'],

            // ══════════════════════════════════════════════════════════════════
            // DIRECTION DE PARTENARIAT PUBLIC-PRIVÉ
            // Pas de division/service dans l'organigramme → rattachement direct
            // ══════════════════════════════════════════════════════════════════
            ['Mukendi Mwamba',         'dir.ppp@armp-rdc.cd',               'DIRECTEUR',    'Direction de Partenariat Public-Privé', null],
            ['Ntumba Lukusa',          'sec.ppp@armp-rdc.cd',               'SECRETAIRE',   'Direction de Partenariat Public-Privé', null],
            ['Ngalula Kabuya',         'chef.ppp1@armp-rdc.cd',             'CHEF_SERVICE', 'Direction de Partenariat Public-Privé', null],
            ['Lumbala Tshisekedi',     'chef.ppp2@armp-rdc.cd',             'CHEF_SERVICE', 'Direction de Partenariat Public-Privé', null],
            ['Kalonji Shabani',        'agent.ppp1@armp-rdc.cd',            'AGENT',        'Direction de Partenariat Public-Privé', null],
            ['Shabani Nzuzi',          'agent.ppp2@armp-rdc.cd',            'AGENT',        'Direction de Partenariat Public-Privé', null],
            ['Lomami Kibwe',           'agent.ppp3@armp-rdc.cd',            'AGENT',        'Direction de Partenariat Public-Privé', null],
            ['Kyungu Malumba',         'agent.ppp4@armp-rdc.cd',            'AGENT',        'Direction de Partenariat Public-Privé', null],
            ['Tshimanga Bolemba',      'agent.ppp5@armp-rdc.cd',            'AGENT',        'Direction de Partenariat Public-Privé', null],
            ['Nsimba Ekanga',          'agent.ppp6@armp-rdc.cd',            'AGENT',        'Direction de Partenariat Public-Privé', null],
        ];
    }

    public function run(): void
    {
        $hashedPassword = Hash::make(self::PASSWORD);
        $created = 0;
        $skipped = 0;

        foreach (self::utilisateursParDirection() as [$name, $email, $role, $direction, $service]) {
            // Résoudre entite_id depuis le nom du service/direction si possible
            $entiteId = null;
            if ($service) {
                $entite = EntiteOrganisationnelle::where('nom', $service)
                    ->whereIn('type', ['service', 'division', 'sous-service', 'bureau'])
                    ->first();
                $entiteId = $entite?->id;
            }

            $exists = User::where('email', $email)->exists();
            if ($exists) {
                $skipped++;
                continue;
            }

            User::create([
                'id'        => (string) Str::uuid(),
                'name'      => $name,
                'email'     => $email,
                'password'  => $hashedPassword,
                'role'      => $role,
                'direction' => $direction,
                'service'   => $service,
                'entite_id' => $entiteId,
                'actif'     => true,
            ]);
            $created++;
        }

        $this->command->info("UtilisateursCongolaIsSeeder : {$created} créé(s), {$skipped} ignoré(s) (déjà existants).");
        $this->command->info('Total utilisateurs en base : ' . User::count());
    }
}
