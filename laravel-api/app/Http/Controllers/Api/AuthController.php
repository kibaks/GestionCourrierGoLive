<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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
            'password' => 'required',
        ]);

        $credentials = $request->only('email', 'password');

        try {
            if (!$token = JWTAuth::attempt($credentials)) {
                return response()->json(['message' => 'Identifiants invalides'], 401);
            }
        } catch (JWTException $e) {
            return response()->json(['message' => 'Impossible de créer le token'], 500);
        }

        $user = Auth::user();
        if ($user && !$user->actif) {
            return response()->json(['message' => 'Compte désactivé'], 403);
        }

        return response()->json([
            'token' => $token,
            'token_type' => 'bearer',
            'expires_in' => config('jwt.ttl') ? config('jwt.ttl') * 60 : 3600,
            'user' => $this->userToArray($user),
        ]);
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

    /**
     * Obtenir un JWT à partir de l'email (front connecté via Firebase/Firestore).
     * POST /api/auth/token-by-email
     * Body: { "email": "...", "sync_secret": "..." }
     * Le sync_secret doit correspondre à LARAVEL_SYNC_SECRET dans .env (front : VITE_LARAVEL_SYNC_SECRET).
     * Si l'utilisateur n'existe pas en base, il est créé avec le rôle AGENT.
     */
    public function tokenByEmail(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'sync_secret' => 'required|string',
        ]);

        $secret = config('services.laravel_sync_secret') ?? env('LARAVEL_SYNC_SECRET');
        if (empty($secret) || !hash_equals($secret, $validated['sync_secret'])) {
            return response()->json(['message' => 'Secret invalide'], 401);
        }

        $user = User::where('email', $validated['email'])->first();
        if (!$user) {
            $user = User::create([
                'name' => explode('@', $validated['email'])[0],
                'email' => $validated['email'],
                'password' => Hash::make(uniqid('sync_', true)),
                'role' => 'AGENT',
                'direction' => null,
                'service' => null,
                'actif' => true,
            ]);
        }

        if (!$user->actif) {
            return response()->json(['message' => 'Compte désactivé'], 403);
        }

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
            'permissions' => $permissions,
        ];
    }
}
