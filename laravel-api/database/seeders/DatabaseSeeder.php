<?php

namespace Database\Seeders;

use App\Models\EntiteOrganisationnelle;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Crée les entités organisationnelles ARMP-RDC, puis les utilisateurs de démo
 * avec des noms congolais authentiques + ~500 utilisateurs répartis par Direction.
 * Mot de passe commun : "password".
 */
class DatabaseSeeder extends Seeder
{
    private const DEMO_PASSWORD = 'password';

    /** Rôles utilisés pour la création en masse.
     * DIRECTEUR exclu : 1 seul directeur par direction, déjà créé par UtilisateursCongolaIsSeeder.
     * DIRECTEUR_GENERAL exclu : unicité garantie par UnSeulDirecteurGeneralSeeder.
     */
    private const ROLES_BULK = [
        'SECRETAIRE',
        'CHEF_SERVICE',
        'AGENT',
    ];

    /**
     * Prénoms masculins 100 % congolais (RDC).
     * Lingala/Mongo : Moise, Fiston, Tresor, Bienvenu, Gloire, Héritier, Espoir, Béni,
     *                 Merveille, Dieudonné, Prince, Joie (mixte), Mwilu, Kabwika, Ngonde.
     * Swahili       : Amani, Baraka, Zawadi (mixte), Bahati (mixte), Rafiki, Bwana, Jabali.
     * Luba/Tshiluba : Kabongo, Ilunga, Mukendi, Kasongo, Mbuyi, Kabuya, Ntumba.
     * Noms bibliques très congolais : Joël, Samuel, Josué, Séraphin, Anaclet, Timothée.
     */
    private static function prenomsMasculins(): array
    {
        return [
            'Moise', 'Fiston', 'Tresor', 'Bienvenu', 'Gloire', 'Héritier', 'Espoir', 'Béni',
            'Merveille', 'Dieudonné', 'Prince', 'Joël', 'Samuel', 'Josué', 'Séraphin',
            'Anaclet', 'Timothée', 'Désiré', 'Irenée', 'Kabwika', 'Ngonde', 'Mwilu',
            'Amani', 'Baraka', 'Bahati', 'Rafiki', 'Jabali', 'Bwana',
            'Kabongo', 'Ilunga', 'Mukendi', 'Kasongo', 'Mbuyi', 'Kabuya', 'Ntumba',
            'Tshisekedi', 'Ngalula', 'Makiadi', 'Ngandu', 'Batubenga', 'Lumbala',
            'Musangu', 'Kabangu', 'Kalonji', 'Mfuamba', 'Kapenda', 'Dibwe',
            'Nkashama', 'Mabika', 'Nsimba', 'Luyeye', 'Bolemba', 'Botuli',
            'Mombele', 'Ekanga', 'Lisanga', 'Bolamba', 'Etsomi', 'Mbandaka',
            'Ndolo', 'Losele', 'Epulu', 'Lomami', 'Kwilu', 'Sankuru',
            'Mitumba', 'Bisimwa', 'Mashako', 'Kongolo', 'Shabani', 'Mwangu',
            'Kyungu', 'Kiluba', 'Muteba', 'Tshombe', 'Lumpungu', 'Kibwe',
        ];
    }

    /**
     * Prénoms féminins 100 % congolais (RDC).
     * Noms à sens très courants en RDC : Joie, Grâce, Patience, Espérance, Gloire, Merveille,
     *   Providence, Bénédiction, Nguya, Kukua, Ngonde.
     * Swahili féminin : Zawadi, Furaha, Amani, Neema, Riziki, Bahati.
     * Luba/Tshiluba   : Scholastique, Ngalula, Ntumba, Nkashama, Tshimanga.
     * Bibliques RDC   : Immaculée, Perpétue, Médiatrice, Scholastique, Dorcas.
     */
    private static function prenomsFeminins(): array
    {
        return [
            'Joie', 'Grâce', 'Patience', 'Espérance', 'Gloire', 'Merveille', 'Bénédiction',
            'Providence', 'Nguya', 'Kukua', 'Ngonde', 'Mwilu',
            'Zawadi', 'Furaha', 'Amani', 'Neema', 'Riziki', 'Bahati',
            'Scholastique', 'Ngalula', 'Ntumba', 'Nkashama', 'Tshimanga',
            'Immaculée', 'Perpétue', 'Médiatrice', 'Dorcas', 'Béni',
            'Kabwika', 'Ngonde', 'Mabika', 'Luyeye', 'Nsimba', 'Ekanga',
            'Lisanga', 'Bolemba', 'Bisimwa', 'Baraka', 'Mashako', 'Kongolo',
            'Losele', 'Sankuru', 'Mitumba', 'Dibwe', 'Musangu', 'Kabangu',
        ];
    }

    /**
     * Noms de famille congolais (RDC) — Bantou, Luba, Kongo, Mongo, Swahili.
     */
    private static function nomsDeFamille(): array
    {
        return [
            'Kabila', 'Mukendi', 'Kasongo', 'Mbuyi', 'Kalombo', 'Tshimanga', 'Ilunga',
            'Mutombo', 'Ngalula', 'Kabongo', 'Tshisekedi', 'Mwamba', 'Kayumba', 'Lukusa',
            'Ntumba', 'Kabuya', 'Ngoy', 'Malumba', 'Dibwe', 'Nkashama',
            'Makiadi', 'Ngandu', 'Batubenga', 'Lumbala', 'Musangu', 'Kabangu',
            'Kalonji', 'Mfuamba', 'Kapenda', 'Nzuzi', 'Kiala', 'Matondo',
            'Mabika', 'Nsimba', 'Luyeye', 'Bolemba', 'Botuli', 'Lobho',
            'Mombele', 'Ekanga', 'Lisanga', 'Bolamba', 'Etsomi', 'Mbandaka',
            'Ndolo', 'Losele', 'Epulu', 'Lomami', 'Kwilu', 'Sankuru',
            'Mitumba', 'Bisimwa', 'Baraka', 'Mashako', 'Bwana', 'Kongolo',
            'Shabani', 'Mwangu', 'Kyungu', 'Kiluba', 'Muteba', 'Tshombe',
            'Lumpungu', 'Katanga', 'Lubamba', 'Kibwe', 'Pande', 'Ngoie',
        ];
    }

    /** Génère un nom complet congolais aléatoirement (genre mixte). */
    private static function nomCongolais(): string
    {
        $masculin = (bool) random_int(0, 1);
        $prenoms = $masculin ? self::prenomsMasculins() : self::prenomsFeminins();
        $noms    = self::nomsDeFamille();
        $prenom  = $prenoms[array_rand($prenoms)];
        $nom     = $noms[array_rand($noms)];
        return "{$prenom} {$nom}";
    }

    public function run(): void
    {
        // Rôles et permissions
        $this->call(RolesSeeder::class);
        // Types d'entités et organigramme ARMP-RDC
        $this->call(EntiteTypeDefinitionSeeder::class);
        $this->call(EntitesOrganisationnellesSeeder::class);

        $directions  = EntiteOrganisationnelle::where('type', 'direction')->where('actif', true)->orderBy('ordre')->get();
        $divisions   = EntiteOrganisationnelle::where('type', 'division')->where('actif', true)->orderBy('ordre')->get();
        $services    = EntiteOrganisationnelle::where('type', 'service')->where('actif', true)->orderBy('ordre')->get();
        $sousServices = EntiteOrganisationnelle::where('type', 'sous-service')->where('actif', true)->orderBy('ordre')->get();
        $bureaux     = EntiteOrganisationnelle::where('type', 'bureau')->where('actif', true)->orderBy('ordre')->get();

        $entitesPourRepartition = $divisions->merge($sousServices)->merge($bureaux)->values();

        if ($directions->isEmpty()) {
            $this->command->warn('Aucune direction en base. Vérifiez EntitesOrganisationnellesSeeder.');
        }

        // ── Utilisateurs nommés par Direction (seeder dédié) ────────────────────
        $this->call(UtilisateursCongolaIsSeeder::class);

        // ── Compte Super Admin (accès technique, sans direction) ────────────────
        User::updateOrCreate(
            ['email' => 'admin@armp-rdc.cd'],
            [
                'name'      => 'Super Admin',
                'password'  => Hash::make(self::DEMO_PASSWORD),
                'role'      => 'SUPER_ADMIN',
                'direction' => null,
                'service'   => null,
                'entite_id' => null,
                'actif'     => true,
            ]
        );

        // ── Création en masse (~500 utilisateurs) avec noms congolais ───────────
        $existingCount = User::count();
        $toCreate = 500 - $existingCount;

        if ($toCreate <= 0) {
            $this->command->info("Déjà {$existingCount} utilisateurs ou plus.");
            $this->call(PlacerAgentsBureauxSeeder::class);
            $this->call(PlacerChefsDivisionSeeder::class);
            $this->call(CourrierSeeder::class);
            return;
        }

        $this->command->info("Création de {$toCreate} utilisateurs congolais répartis dans les entités ARMP-RDC...");

        $hashedPassword = Hash::make(self::DEMO_PASSWORD);
        $chunkSize = 50;
        $chunk = [];
        $now = now();
        $usedEmails = [];

        for ($i = 0; $i < $toCreate; $i++) {
            // Pondération : majorité d'agents — DIRECTEUR exclu (1 seul par direction via UtilisateursCongolaIsSeeder)
            $roleWeighted = array_merge(
                array_fill(0, 1, 'SECRETAIRE'),
                array_fill(0, 3, 'CHEF_SERVICE'),
                array_fill(0, 10, 'AGENT')
            );
            $role = $roleWeighted[array_rand($roleWeighted)];
            $direction = null;
            $service   = null;
            $entiteId  = null;

            if (in_array($role, ['CHEF_SERVICE', 'AGENT', 'SECRETAIRE'], true)) {
                $dir = $directions->random();
                $direction = $dir->nom;
                if (in_array($role, ['CHEF_SERVICE', 'AGENT'], true)) {
                    $divisionIds = $divisions->where('parent_id', $dir->id)->pluck('id');
                    $servs = $services->whereIn('parent_id', $divisionIds);
                    if ($servs->isNotEmpty()) {
                        $service = $servs->random()->nom;
                    }
                }
                if ($entitesPourRepartition->isNotEmpty() && in_array($role, ['AGENT', 'CHEF_SERVICE'], true) && (bool) random_int(0, 2)) {
                    $entiteId = $entitesPourRepartition->random()->id;
                }
            }

            // Générer un email unique basé sur le nom congolais
            $fullName = self::nomCongolais();
            $slug = Str::slug(str_replace(' ', '.', strtolower($fullName)));
            $base = $slug . '@armp-rdc.cd';
            $email = $base;
            $suffix = 1;
            while (in_array($email, $usedEmails, true) || User::where('email', $email)->exists()) {
                $email = $slug . $suffix . '@armp-rdc.cd';
                $suffix++;
            }
            $usedEmails[] = $email;

            $chunk[] = [
                'id'         => (string) Str::uuid(),
                'name'       => $fullName,
                'email'      => $email,
                'password'   => $hashedPassword,
                'role'       => $role,
                'direction'  => $direction,
                'service'    => $service,
                'entite_id'  => $entiteId,
                'actif'      => true,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($chunk) >= $chunkSize) {
                User::insert($chunk);
                $this->command->info('  ' . min($i + 1, $toCreate) . " / {$toCreate} créés.");
                $chunk = [];
            }
        }

        if (count($chunk) > 0) {
            User::insert($chunk);
        }

        $this->command->info('Total utilisateurs : ' . User::count());

        // Un seul Directeur Général autorisé
        $this->call(UnSeulDirecteurGeneralSeeder::class);
        // Affecter les agents sans entite_id à un bureau (répartition équilibrée)
        $this->call(PlacerAgentsBureauxSeeder::class);
        // Désigner un chef de division parmi les agents de chaque division
        $this->call(PlacerChefsDivisionSeeder::class);

        $this->call(CourrierSeeder::class);
        $this->call(CourrierCategorizationSeeder::class);
    }
}
