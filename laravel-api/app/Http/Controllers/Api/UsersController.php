<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

/**
 * Gestion des utilisateurs (admin) — aligné Firebase / GestionUtilisateurs.
 * Contrôlé par les permissions VOIR_UTILISATEURS, CREER_UTILISATEUR, etc.
 */
class UsersController extends Controller
{
    /**
     * Liste des utilisateurs.
     * GET /api/users
     */
    public function index(): JsonResponse
    {
        $this->authorize('voir-utilisateurs');
        $data = Cache::remember('users_all', 300, function () {
            return User::orderBy('name')->get()->map(fn (User $u) => $this->userToArray($u))->values()->all();
        });
        return response()->json(['data' => $data]);
    }

    /**
     * Détail d'un utilisateur.
     * GET /api/users/{id}
     */
    public function show(string $id): JsonResponse
    {
        $this->authorize('voir-utilisateurs');
        $user = User::findOrFail($id);
        return response()->json(['data' => $this->userToArray($user)]);
    }

    /**
     * Créer un utilisateur (admin).
     * POST /api/users
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-utilisateur');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => ['required', Password::defaults()],
            'role' => 'required|in:SUPER_ADMIN,DIRECTEUR_GENERAL,SECRETAIRE,DIRECTEUR,CHEF_SERVICE,AGENT',
            'direction' => 'nullable|string|max:255',
            'service' => 'nullable|string|max:255',
            'entiteId' => 'nullable|uuid',
            'actif' => 'nullable|boolean',
        ]);

        if ($validated['role'] === 'DIRECTEUR_GENERAL' && User::where('role', 'DIRECTEUR_GENERAL')->exists()) {
            return response()->json([
                'message' => 'Un seul Directeur général est autorisé. Un utilisateur possède déjà ce rôle.',
                'errors' => ['role' => ['Un seul Directeur général est autorisé.']],
            ], 422);
        }

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'direction' => $validated['direction'] ?? null,
            'service' => $validated['service'] ?? null,
            'entite_id' => $validated['entiteId'] ?? null,
            'actif' => $validated['actif'] ?? true,
        ]);

        Cache::forget('users_all');
        return response()->json(['data' => $this->userToArray($user)], 201);
    }

    /**
     * Mettre à jour un utilisateur.
     * PUT /api/users/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize('modifier-utilisateur');

        $user = User::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => 'sometimes|string|email|max:255|unique:users,email,' . $id,
            'password' => ['nullable', Password::defaults()],
            'role' => 'sometimes|in:SUPER_ADMIN,DIRECTEUR_GENERAL,SECRETAIRE,DIRECTEUR,CHEF_SERVICE,AGENT',
            'direction' => 'nullable|string|max:255',
            'service' => 'nullable|string|max:255',
            'entiteId' => 'nullable|uuid',
            'actif' => 'nullable|boolean',
        ]);

        if (isset($validated['name'])) $user->name = $validated['name'];
        if (isset($validated['email'])) $user->email = $validated['email'];
        if (!empty($validated['password'])) $user->password = Hash::make($validated['password']);
        if (isset($validated['role'])) {
            if ($validated['role'] === 'DIRECTEUR_GENERAL') {
                $otherDg = User::where('role', 'DIRECTEUR_GENERAL')->where('id', '!=', $id)->first();
                if ($otherDg) {
                    return response()->json([
                        'message' => 'Un seul Directeur général est autorisé. Un autre utilisateur possède déjà ce rôle.',
                        'errors' => ['role' => ['Un seul Directeur général est autorisé.']],
                    ], 422);
                }
            }
            $user->role = $validated['role'];
        }
        if (array_key_exists('direction', $validated)) $user->direction = $validated['direction'];
        if (array_key_exists('service', $validated)) $user->service = $validated['service'];
        if (array_key_exists('entiteId', $validated)) $user->entite_id = $validated['entiteId'];
        if (array_key_exists('actif', $validated)) $user->actif = (bool) $validated['actif'];
        $user->save();

        Cache::forget('users_all');
        return response()->json(['data' => $this->userToArray($user->fresh())]);
    }

    /**
     * Supprimer un utilisateur.
     * DELETE /api/users/{id}
     */
    public function destroy(string $id): JsonResponse
    {
        $this->authorize('supprimer-utilisateur');
        $user = User::findOrFail($id);
        $user->delete();
        Cache::forget('users_all');
        return response()->json(null, 204);
    }

    private function userToArray(User $user): array
    {
        return [
            'id' => $user->id,
            'nom' => $user->name,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'direction' => $user->direction,
            'service' => $user->service,
            'entiteId' => $user->entite_id,
            'actif' => $user->actif,
            'photoUrl' => $user->photo_url,
            'twoFactorEnabled' => $user->two_factor_confirmed_at !== null,
            'dateCreation' => $user->created_at?->format('c'),
            'dateModification' => $user->updated_at?->format('c'),
        ];
    }
}
