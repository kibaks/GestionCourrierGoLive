<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Crée un utilisateur CHEF_DIVISION pour chaque division et un utilisateur
 * CHEF_BUREAU pour chaque bureau existant dans entites_organisationnelles.
 *
 * Idempotent : identifié par email (updateOrCreate), peut être relancé sans
 * créer de doublons.
 *
 * Mot de passe commun aligné sur la convention du reste de la base
 * (DatabaseSeeder / UtilisateursCongolaIsSeeder) : voir DEFAULT_PASSWORD.
 */
class ChefsDivisionEtBureauSeeder extends Seeder
{
    private const DEFAULT_PASSWORD = 'password';

    /** @var array<int, array{entiteId:string, role:string, nom:string, email:string, direction:string}> */
    private const CHEFS = [
        // ───────────────────────── CHEF_DIVISION ─────────────────────────
        ['entiteId' => 'a245afc2-b88c-4c12-b83d-940be35edb08', 'role' => 'CHEF_DIVISION', 'nom' => 'Jean-Pierre Kabongo', 'email' => 'jeanpierrekabongo@armp-rdc.cd', 'direction' => 'Services Rattachés à la Direction Générale'],
        ['entiteId' => 'a245afc2-bc1e-4574-8562-8e9a5fb8ba25', 'role' => 'CHEF_DIVISION', 'nom' => 'Marie Ilunga', 'email' => 'marieilunga@armp-rdc.cd', 'direction' => 'Services Rattachés à la Direction Générale'],
        ['entiteId' => 'a245afc2-c5f0-418a-a367-8c6cfe90bdc7', 'role' => 'CHEF_DIVISION', 'nom' => 'Joseph Kalonji', 'email' => 'josephkalonji@armp-rdc.cd', 'direction' => 'Direction de la Régulation'],
        ['entiteId' => 'a245afc2-d80a-4ba0-bd80-12a8444693cd', 'role' => 'CHEF_DIVISION', 'nom' => 'Grace Mwamba', 'email' => 'gracemwamba@armp-rdc.cd', 'direction' => 'Direction de la Formation et des Appuis Techniques'],
        ['entiteId' => 'a245afc2-dbf4-4cfd-a52f-c4846a6e40ba', 'role' => 'CHEF_DIVISION', 'nom' => 'Patrick Ngoyi', 'email' => 'patrickngoyi@armp-rdc.cd', 'direction' => 'Direction de la Formation et des Appuis Techniques'],
        ['entiteId' => 'a245afc2-ce61-4f69-841c-aae3523a9c4e', 'role' => 'CHEF_DIVISION', 'nom' => 'Christine Kabeya', 'email' => 'christinekabeya@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc2-caca-492c-b4b2-aa7e752f7ebb', 'role' => 'CHEF_DIVISION', 'nom' => 'Emmanuel Tshimanga', 'email' => 'emmanueltshimanga@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc2-d530-4637-8fb4-bd2a92273952', 'role' => 'CHEF_DIVISION', 'nom' => 'Béatrice Mutombo', 'email' => 'beatricemutombo@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc2-d1c1-41c3-ae71-fb7129a2601b', 'role' => 'CHEF_DIVISION', 'nom' => 'Augustin Kasongo', 'email' => 'augustinkasongo@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc2-c0a4-4923-860d-0ca6470fd26d', 'role' => 'CHEF_DIVISION', 'nom' => 'Espérance Mukendi', 'email' => 'esperancemukendi@armp-rdc.cd', 'direction' => 'Services Rattachés à la Direction Générale'],

        // ───────────────────────── CHEF_BUREAU ─────────────────────────
        ['entiteId' => 'a245afc3-578f-4873-843e-56c0147c650b', 'role' => 'CHEF_BUREAU', 'nom' => 'Didier Kanyinda', 'email' => 'didierkanyinda@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-b663-477b-a447-9ac9506f5051', 'role' => 'CHEF_BUREAU', 'nom' => 'Chantal Bilonda', 'email' => 'chantalbilonda@armp-rdc.cd', 'direction' => 'Services Rattachés à la Direction Générale'],
        ['entiteId' => 'a245afc3-ba5f-406e-8f38-63e2324f3bdb', 'role' => 'CHEF_BUREAU', 'nom' => 'Bernard Nzuzi', 'email' => 'bernardnzuzi@armp-rdc.cd', 'direction' => 'Services Rattachés à la Direction Générale'],
        ['entiteId' => 'a245afc3-ca5a-4967-be91-67fadc321239', 'role' => 'CHEF_BUREAU', 'nom' => 'Véronique Kalala', 'email' => 'veroniquekalala@armp-rdc.cd', 'direction' => 'Direction de la Formation et des Appuis Techniques'],
        ['entiteId' => 'a245afc3-be7d-4230-94c9-21f10d61954e', 'role' => 'CHEF_BUREAU', 'nom' => 'Fabrice Bope', 'email' => 'fabricebope@armp-rdc.cd', 'direction' => 'Services Rattachés à la Direction Générale'],
        ['entiteId' => 'a245afc3-6735-420d-be95-da411c5262e9', 'role' => 'CHEF_BUREAU', 'nom' => 'Nadège Kamanga', 'email' => 'nadegekamanga@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-6eb0-4b3b-a2da-f165cc9d5a40', 'role' => 'CHEF_BUREAU', 'nom' => 'Guy Ntumba', 'email' => 'guyntumba@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-7a32-4f19-a502-5c19754bfd37', 'role' => 'CHEF_BUREAU', 'nom' => 'Rachel Kanku', 'email' => 'rachelkanku@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-542d-45e9-92f8-23305cb5e896', 'role' => 'CHEF_BUREAU', 'nom' => 'Pascal Muteba', 'email' => 'pascalmuteba@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-c6e0-46c5-b887-bb56b894188d', 'role' => 'CHEF_BUREAU', 'nom' => 'Josephine Mbombo', 'email' => 'josephinembombo@armp-rdc.cd', 'direction' => 'Direction de la Régulation'],
        ['entiteId' => 'a245afc3-8484-44d3-a3b4-599b50b7fc1a', 'role' => 'CHEF_BUREAU', 'nom' => 'Aimé Kazadi', 'email' => 'aimekazadi@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-b1e2-4eb8-b1ad-e1ae436e1c5e', 'role' => 'CHEF_BUREAU', 'nom' => 'Solange Ngalula', 'email' => 'solangengalula@armp-rdc.cd', 'direction' => 'Direction de la Formation et des Appuis Techniques'],
        ['entiteId' => 'a245afc3-ac75-4d5b-af81-e96551ac375c', 'role' => 'CHEF_BUREAU', 'nom' => 'Blaise Lukusa', 'email' => 'blaiselukusa@armp-rdc.cd', 'direction' => 'Direction de la Formation et des Appuis Techniques'],
        ['entiteId' => 'a245afc3-5e9b-48cd-9934-d22a582dd120', 'role' => 'CHEF_BUREAU', 'nom' => 'Odette Mfumu', 'email' => 'odettemfumu@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-9a8e-4c45-ad3d-87c4eae3542f', 'role' => 'CHEF_BUREAU', 'nom' => 'Théo Kalubi', 'email' => 'theokalubi@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-c164-4bfc-b0ec-23d3c8006f32', 'role' => 'CHEF_BUREAU', 'nom' => 'Justine Mbuyi', 'email' => 'justinembuyi@armp-rdc.cd', 'direction' => 'Services Rattachés à la Direction Générale'],
        ['entiteId' => 'a245afc3-63c7-47da-90c6-a2f442a0e1ef', 'role' => 'CHEF_BUREAU', 'nom' => 'Serge Kalengayi', 'email' => 'sergekalengayi@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
        ['entiteId' => 'a245afc3-743c-4bd2-b25a-32f3bfbd2629', 'role' => 'CHEF_BUREAU', 'nom' => 'Clarisse Tshibangu', 'email' => 'clarissetshibangu@armp-rdc.cd', 'direction' => 'Direction Administrative et Financière'],
    ];

    public function run(): void
    {
        $created = 0;
        $updated = 0;

        foreach (self::CHEFS as $chef) {
            $user = User::where('email', $chef['email'])->first();

            if ($user) {
                $user->update([
                    'name' => $chef['nom'],
                    'role' => $chef['role'],
                    'direction' => $chef['direction'],
                    'entite_id' => $chef['entiteId'],
                    'actif' => true,
                ]);
                $updated++;
                continue;
            }

            User::create([
                'id' => (string) Str::uuid(),
                'name' => $chef['nom'],
                'email' => $chef['email'],
                'password' => self::DEFAULT_PASSWORD,
                'role' => $chef['role'],
                'direction' => $chef['direction'],
                'entite_id' => $chef['entiteId'],
                'actif' => true,
            ]);
            $created++;
        }

        Cache::forget('users_all');

        $this->command->info("Chefs de division/bureau : {$created} créé(s), {$updated} mis à jour. Mot de passe temporaire : " . self::DEFAULT_PASSWORD);
    }
}
