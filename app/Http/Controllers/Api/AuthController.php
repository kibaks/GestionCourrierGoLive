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
use Illuminate\Support\Facades\Log;
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
            'role' => 'nullable|in:SUPER_ADMIN,DIRECTEUR_GENERAL,SECRETAIRE,DIRECTEUR,CHEF_DIVISION,CHEF_SERVICE,CHEF_BUREAU,AGENT',
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
     * Rafraîchir le token (M5 — fenêtre glissante 24 h, fix 24/08/2026).
     * POST /api/auth/refresh  (route PUBLIQUE : le token à rafraîchir est souvent
     * expiré, le middleware auth:api le rejetterait avant le contrôleur)
     *
     * Le refresh natif de tymon/jwt-auth est conçu pour rafraîchir des tokens
     * EXPIRÉS (il ne contrôle pas « exp ») : la signature HS256 et la grâce
     * (24 h) sont donc vérifiées ici, AVANT toute re-délivrance.
     *
     * — token valide ou expiré depuis ≤ 24 h → 200 + nouveau token
     *   (élimine la coupure à mi-session : le front renouvelle à chaque 401)
     * — expiré depuis > 24 h, signature invalide, compte inconnu/désactivé
     *   → 401, reconnexion complète requise.
     */
    public function refresh(Request $request): JsonResponse
    {
        $raw = $this->rawBearerToken($request);
        if ($raw === null) {
            return response()->json(['message' => 'Token invalide ou expiré'], 401);
        }

        $payload = $this->decodeAccessTokenIgnoringExpiration($raw);
        if ($payload === null || !isset($payload['sub'], $payload['exp'])) {
            return response()->json(['message' => 'Token invalide ou expiré'], 401);
        }

        // Grace 24 h stricte : au-delà, forcer une reconnexion complète
        // (s'applique aussi au refresh natif, qui ignore l'expiration).
        if (time() > (int) $payload['exp'] + 86400) {
            Log::info('AuthController::refresh — token expiré depuis plus de 24 h, reconnexion requise', ['sub' => $payload['sub']]);
            return response()->json(['message' => 'Token expiré depuis trop longtemps. Reconnectez-vous.'], 401);
        }

        $user = User::find($payload['sub']);
        if (!$user || !$user->actif) {
            return response()->json(['message' => 'Compte introuvable ou désactivé.'], 401);
        }

        try {
            $token = JWTAuth::refresh(JWTAuth::getToken());
        } catch (JWTException $e) {
            // Chute : re-délivrance directe (signature, grâce et compte déjà vérifiés)
            $token = JWTAuth::fromUser($user);
        }

        return response()->json([
            'token' => $token,
            'token_type' => 'bearer',
            'expires_in' => config('jwt.ttl') ? config('jwt.ttl') * 60 : 3600,
        ]);
    }

    /**
     * Token brut : en-tête Authorization (prioritaire) puis corps JSON { token }.
     */
    private function rawBearerToken(Request $request): ?string
    {
        $header = $request->bearerToken();
        if (is_string($header) && $header !== '') {
            return $header;
        }
        $body = $request->input('token');
        if (is_string($body) && $body !== '') {
            return $body;
        }
        return null;
    }

    /**
     * Décode un access token HS256 SANS vérifier l'expiration (la signature est
     * vérifiée). Renvoie le payload ou null si le token n'est pas authentique.
     */
    private function decodeAccessTokenIgnoringExpiration(string $raw): ?array
    {
        $parts = explode('.', $raw);
        if (count($parts) !== 3) {
            return null;
        }
        [$header64, $payload64, $sig64] = $parts;

        $headerJson = base64_decode(strtr($header64, '-_', '+/'), true);
        $header = $headerJson !== false ? json_decode($headerJson, true) : null;
        if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256') {
            return null;
        }

        $secret = (string) config('jwt.secret');
        if ($secret === '') {
            return null;
        }

        // Comparaison brute des signatures (HMAC-SHA256 vs signature base64url du token)
        $expectedSig = hash_hmac('sha256', "$header64.$payload64", $secret, true);
        $actualSig = base64_decode(strtr($sig64, '-_', '+/'), true);
        if ($actualSig === false || !hash_equals($expectedSig, $actualSig)) {
            return null;
        }

        $payloadJson = base64_decode(strtr($payload64, '-_', '+/'), true);
        $payload = $payloadJson !== false ? json_decode($payloadJson, true) : null;
        return is_array($payload) ? $payload : null;
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
