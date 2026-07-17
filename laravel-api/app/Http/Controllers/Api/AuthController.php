<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\PermissionService;
use App\Services\TotpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Tymon\JWTAuth\Facades\JWTAuth;
use Tymon\JWTAuth\Exceptions\JWTException;

/**
 * Authentification JWT (alignée Firebase : email/password + données utilisateur).
 * Routes : POST login, POST register, GET me (avec token Bearer).
 */
class AuthController extends Controller
{
    /**
     * Connexion : email + password → token JWT.
     * POST /api/auth/login
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $validated['email'])->first();
        if (!$user || !Hash::check($validated['password'], $user->password)) {
            return response()->json(['message' => 'Identifiants invalides'], 401);
        }
        if (!$user->actif) return response()->json(['message' => 'Compte désactivé'], 403);

        if ($user->two_factor_confirmed_at) {
            $challenge = bin2hex(random_bytes(32));
            Cache::put("two-factor-login:{$challenge}", $user->id, now()->addMinutes(5));
            return response()->json(['twoFactorRequired' => true, 'challenge' => $challenge]);
        }

        return $this->authenticatedResponse($user);
    }

    public function completeTwoFactorLogin(Request $request, TotpService $totp): JsonResponse
    {
        $validated = $request->validate(['challenge' => 'required|string', 'code' => 'required|string|max:32']);
        $userId = Cache::pull("two-factor-login:{$validated['challenge']}");
        $user = $userId ? User::find($userId) : null;
        if (!$user || !$user->actif) return response()->json(['message' => 'Validation expirée ou invalide.'], 401);

        $valid = false;
        try { $valid = $totp->verify(decrypt($user->two_factor_secret), $validated['code']); } catch (\Throwable) { $valid = false; }
        if (!$valid) {
            $hashes = [];
            try { $hashes = json_decode(decrypt($user->two_factor_recovery_codes), true) ?: []; } catch (\Throwable) {}
            foreach ($hashes as $index => $hash) {
                if (Hash::check(strtoupper($validated['code']), $hash)) {
                    unset($hashes[$index]);
                    $user->two_factor_recovery_codes = encrypt(json_encode(array_values($hashes)));
                    $user->save();
                    $valid = true;
                    break;
                }
            }
        }
        if (!$valid) return response()->json(['message' => 'Code de sécurité invalide.'], 422);
        return $this->authenticatedResponse($user);
    }

    /**
     * Inscription (création de compte).
     * POST /api/auth/register
     */
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => ['required', 'confirmed', Password::defaults()],
            'role' => 'nullable|in:SUPER_ADMIN,DIRECTEUR_GENERAL,SECRETAIRE,DIRECTEUR,CHEF_SERVICE,AGENT',
            'direction' => 'nullable|string|max:255',
            'service' => 'nullable|string|max:255',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'] ?? 'AGENT',
            'direction' => $validated['direction'] ?? null,
            'service' => $validated['service'] ?? null,
            'actif' => true,
        ]);

        $token = JWTAuth::fromUser($user);

        return response()->json([
            'message' => 'Utilisateur créé',
            'token' => $token,
            'token_type' => 'bearer',
            'expires_in' => config('jwt.ttl') ? config('jwt.ttl') * 60 : 3600,
            'user' => $this->userToArray($user),
        ], 201);
    }

    /**
     * Utilisateur connecté (nécessite Bearer token).
     * GET /api/auth/me
     */
    public function me(): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }
        return response()->json(['data' => $this->userToArray($user)]);
    }

    /**
     * Permissions de l'utilisateur connecté (pour le front).
     * GET /api/auth/permissions
     */
    public function permissions(): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }
        $permissionService = app(PermissionService::class);
        $list = $permissionService->getPermissionsForUser($user);
        return response()->json(['data' => $list]);
    }

    /**
     * Rafraîchir le token.
     * POST /api/auth/refresh
     */
    public function refresh(): JsonResponse
    {
        try {
            $token = JWTAuth::refresh(JWTAuth::getToken());
            return response()->json([
                'token' => $token,
                'token_type' => 'bearer',
                'expires_in' => config('jwt.ttl') ? config('jwt.ttl') * 60 : 3600,
            ]);
        } catch (JWTException $e) {
            return response()->json(['message' => 'Token invalide ou expiré'], 401);
        }
    }

    /**
     * Déconnexion (invalider le token côté serveur si blacklist activée).
     * POST /api/auth/logout
     */
    public function logout(): JsonResponse
    {
        try {
            JWTAuth::invalidate(JWTAuth::getToken());
        } catch (JWTException $e) {
            // Ignorer si token déjà invalide
        }
        return response()->json(['message' => 'Déconnexion réussie']);
    }

    private function authenticatedResponse(User $user): JsonResponse
    {
        $token = JWTAuth::fromUser($user);
        return response()->json([
            'token' => $token,
            'token_type' => 'bearer',
            'expires_in' => config('jwt.ttl') ? config('jwt.ttl') * 60 : 3600,
            'user' => $this->userToArray($user),
        ]);
    }

    private function userToArray(User $user): array
    {
        $permissionService = app(PermissionService::class);
        $permissions = $permissionService->getPermissionsForUser($user);
        
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
            'permissions' => $permissions,
        ];
    }
}
