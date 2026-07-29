<?php

namespace Tests\Feature;

use App\Models\EntiteOrganisationnelle;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Vérifie que les rôles responsables d'unité (DIRECTEUR, CHEF_DIVISION, CHEF_BUREAU)
 * ne peuvent créer que des courriers internes sortants adressés à leurs unités
 * descendantes ou à la Direction Générale.
 *
 * @see \App\Http\Controllers\Api\CourrierController::validateOrganisationManagerPayload()
 */
class CourrierOrganisationRestrictionTest extends TestCase
{
    use RefreshDatabase;

    private EntiteOrganisationnelle $directionGenerale;
    private EntiteOrganisationnelle $directionA;
    private EntiteOrganisationnelle $divisionA1;
    private EntiteOrganisationnelle $serviceA1a;
    private EntiteOrganisationnelle $bureauA1a1;
    private EntiteOrganisationnelle $celluleA1a1x;

    private EntiteOrganisationnelle $directionB;
    private EntiteOrganisationnelle $divisionB1;
    private EntiteOrganisationnelle $serviceB1a;

    protected function setUp(): void
    {
        parent::setUp();

        // Hiérarchie A : Direction A > Division A1 > Service A1a > Bureau A1a1 > Cellule A1a1x
        $this->directionGenerale = EntiteOrganisationnelle::create([
            'nom' => 'Direction Générale', 'type' => 'direction_generale', 'actif' => true,
        ]);
        $this->directionA = EntiteOrganisationnelle::create([
            'nom' => 'Direction A', 'type' => 'direction', 'parent_id' => $this->directionGenerale->id, 'actif' => true,
        ]);
        $this->divisionA1 = EntiteOrganisationnelle::create([
            'nom' => 'Division A1', 'type' => 'division', 'parent_id' => $this->directionA->id, 'actif' => true,
        ]);
        $this->serviceA1a = EntiteOrganisationnelle::create([
            'nom' => 'Service A1a', 'type' => 'service', 'parent_id' => $this->divisionA1->id, 'actif' => true,
        ]);
        $this->bureauA1a1 = EntiteOrganisationnelle::create([
            'nom' => 'Bureau A1a1', 'type' => 'bureau', 'parent_id' => $this->serviceA1a->id, 'actif' => true,
        ]);
        $this->celluleA1a1x = EntiteOrganisationnelle::create([
            'nom' => 'Cellule A1a1x', 'type' => 'cellule', 'parent_id' => $this->bureauA1a1->id, 'actif' => true,
        ]);

        // Hiérarchie B (indépendante, sert à tester les destinataires non autorisés)
        $this->directionB = EntiteOrganisationnelle::create([
            'nom' => 'Direction B', 'type' => 'direction', 'parent_id' => $this->directionGenerale->id, 'actif' => true,
        ]);
        $this->divisionB1 = EntiteOrganisationnelle::create([
            'nom' => 'Division B1', 'type' => 'division', 'parent_id' => $this->directionB->id, 'actif' => true,
        ]);
        $this->serviceB1a = EntiteOrganisationnelle::create([
            'nom' => 'Service B1a', 'type' => 'service', 'parent_id' => $this->divisionB1->id, 'actif' => true,
        ]);
    }

    private function makeUser(string $role, EntiteOrganisationnelle $entite, ?string $direction = null): User
    {
        return User::create([
            'name' => "Test {$role}",
            'email' => strtolower($role).'-'.uniqid().'@example.test',
            'password' => bcrypt('password'),
            'role' => $role,
            'direction' => $direction,
            'entite_id' => $entite->id,
            'actif' => true,
        ]);
    }

    private function basePayload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'INTERNE',
            'sens' => 'SORTANT',
            'dateReception' => now()->format('Y-m-d'),
            'expediteur' => 'Expéditeur test',
            'destinataire' => 'Destinataire test',
            'objet' => 'Objet test',
        ], $overrides);
    }

    // ─────────────────────────── CHEF_DIVISION ───────────────────────────

    public function test_chef_division_peut_creer_un_courrier_interne_sortant_vers_un_descendant(): void
    {
        $chef = $this->makeUser('CHEF_DIVISION', $this->divisionA1, 'Direction A');

        $payload = $this->basePayload([
            'destinataire' => $this->bureauA1a1->nom,
            'extraFields' => [
                'entiteDestinataireJson' => [
                    'division' => $this->divisionA1->id,
                    'service' => $this->serviceA1a->id,
                    'bureau' => $this->bureauA1a1->id,
                ],
            ],
        ]);

        $response = $this->actingAs($chef, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(201);
        $this->assertDatabaseHas('courriers', ['objet' => 'Objet test']);
    }

    public function test_chef_division_peut_creer_un_courrier_vers_la_direction_generale(): void
    {
        $chef = $this->makeUser('CHEF_DIVISION', $this->divisionA1, 'Direction A');

        $payload = $this->basePayload([
            'destinataire' => $this->directionGenerale->nom,
            'extraFields' => [
                'entiteDestinataireJson' => [
                    'direction_generale' => $this->directionGenerale->id,
                ],
            ],
        ]);

        $response = $this->actingAs($chef, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(201);
    }

    public function test_chef_division_ne_peut_pas_creer_un_courrier_vers_une_unite_non_rattachee(): void
    {
        $chef = $this->makeUser('CHEF_DIVISION', $this->divisionA1, 'Direction A');

        $payload = $this->basePayload([
            'destinataire' => $this->serviceB1a->nom,
            'extraFields' => [
                'entiteDestinataireJson' => [
                    'division' => $this->divisionB1->id,
                    'service' => $this->serviceB1a->id,
                ],
            ],
        ]);

        $response = $this->actingAs($chef, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(403);
        $this->assertDatabaseMissing('courriers', ['objet' => 'Objet test']);
    }

    public function test_chef_division_ne_peut_pas_creer_un_courrier_externe(): void
    {
        $chef = $this->makeUser('CHEF_DIVISION', $this->divisionA1, 'Direction A');

        $payload = $this->basePayload([
            'type' => 'EXTERNE',
            'destinataire' => $this->bureauA1a1->nom,
        ]);

        $response = $this->actingAs($chef, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(403);
    }

    public function test_chef_division_ne_peut_pas_creer_un_courrier_entrant(): void
    {
        $chef = $this->makeUser('CHEF_DIVISION', $this->divisionA1, 'Direction A');

        $payload = $this->basePayload([
            'sens' => 'ENTRANT',
            'destinataire' => $this->bureauA1a1->nom,
        ]);

        $response = $this->actingAs($chef, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(403);
    }

    // ─────────────────────────── CHEF_BUREAU ───────────────────────────

    public function test_chef_bureau_peut_creer_un_courrier_interne_sortant_vers_un_descendant(): void
    {
        $chef = $this->makeUser('CHEF_BUREAU', $this->bureauA1a1, 'Direction A');

        $payload = $this->basePayload([
            'destinataire' => $this->celluleA1a1x->nom,
            'extraFields' => [
                'entiteDestinataireJson' => [
                    'bureau' => $this->bureauA1a1->id,
                    'cellule' => $this->celluleA1a1x->id,
                ],
            ],
        ]);

        $response = $this->actingAs($chef, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(201);
    }

    public function test_chef_bureau_peut_creer_un_courrier_vers_la_direction_generale(): void
    {
        $chef = $this->makeUser('CHEF_BUREAU', $this->bureauA1a1, 'Direction A');

        $payload = $this->basePayload([
            'destinataire' => $this->directionGenerale->nom,
            'extraFields' => [
                'entiteDestinataireJson' => [
                    'direction_generale' => $this->directionGenerale->id,
                ],
            ],
        ]);

        $response = $this->actingAs($chef, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(201);
    }

    public function test_chef_bureau_ne_peut_pas_creer_un_courrier_vers_une_unite_non_rattachee(): void
    {
        $chef = $this->makeUser('CHEF_BUREAU', $this->bureauA1a1, 'Direction A');

        $payload = $this->basePayload([
            'destinataire' => $this->serviceB1a->nom,
            'extraFields' => [
                'entiteDestinataireJson' => [
                    'service' => $this->serviceB1a->id,
                ],
            ],
        ]);

        $response = $this->actingAs($chef, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(403);
    }

    // ─────────────────────────── DIRECTEUR (régression) ───────────────────────────

    public function test_directeur_peut_toujours_creer_un_courrier_interne_sortant_vers_un_descendant(): void
    {
        $directeur = $this->makeUser('DIRECTEUR', $this->directionA, 'Direction A');

        $payload = $this->basePayload([
            'destinataire' => $this->divisionA1->nom,
            'extraFields' => [
                'entiteDestinataireJson' => [
                    'division' => $this->divisionA1->id,
                ],
            ],
        ]);

        $response = $this->actingAs($directeur, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(201);
    }

    public function test_directeur_ne_peut_pas_creer_un_courrier_vers_une_autre_direction(): void
    {
        $directeur = $this->makeUser('DIRECTEUR', $this->directionA, 'Direction A');

        $payload = $this->basePayload([
            'destinataire' => $this->directionB->nom,
            'extraFields' => [
                'entiteDestinataireJson' => [
                    'direction' => $this->directionB->id,
                ],
            ],
        ]);

        $response = $this->actingAs($directeur, 'api')->postJson('/api/courriers', $payload);

        $response->assertStatus(403);
    }
}
