<?php
namespace App\Http\Controllers\Api;

use App\Models\User;
use Google\Auth\AccessToken;
use GuzzleHttp\Client;
use Google\Auth\HttpHandler\HttpHandlerFactory;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

class GoogleAuthController extends AuthController
{
    protected function verifyCredential(string $credential, string $clientId): array|false
    {
        $verifier = new AccessToken(HttpHandlerFactory::build(new Client(['timeout' => 10, 'connect_timeout' => 5])));
        return $verifier->verify($credential, ['audience' => $clientId]);
    }

    protected function findUser(string $email): ?User
    {
        return User::whereRaw('LOWER(email) = ?', [$email])->first();
    }

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['credential' => 'required|string|max:12000']);
        $clientId = config('google.client_id');
        if (!$clientId) return response()->json(['message' => 'La connexion Google n’est pas configurée.'], 503);
        if ($request->header('Origin') !== config('google.frontend_origin')) {
            return response()->json(['message' => 'Origine de connexion non autorisée.'], 403);
        }
        try {
            $claims = $this->verifyCredential($data['credential'], $clientId);
        } catch (\UnexpectedValueException|\DomainException|\InvalidArgumentException $error) {
            return response()->json(['message' => 'Connexion Google invalide ou expirée.'], 401);
        } catch (\Throwable $error) {
            return response()->json(['message' => 'La vérification Google est momentanément indisponible.'], 503);
        }
        if (!$claims || !in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
            || empty($claims['sub']) || empty($claims['email']) || ($claims['email_verified'] ?? false) !== true
            || ($claims['exp'] ?? 0) <= time()) {
            return response()->json(['message' => 'Connexion Google invalide ou expirée.'], 401);
        }
        // Google is authoritative for Gmail and verified Workspace addresses only.
        $email = strtolower($claims['email']);
        if (!str_ends_with($email, '@gmail.com') && empty($claims['hd'])) {
            return response()->json(['message' => 'Pour cette adresse, utilisez votre mot de passe professionnel.'], 403);
        }
        $user = $this->findUser($email);
        if (!$user || !$user->actif) return response()->json(['message' => 'Ce compte Google ne dispose pas d’un accès actif. Contactez votre administrateur.'], 403);
        if ($user->two_factor_confirmed_at) {
            $challenge = bin2hex(random_bytes(32));
            Cache::put("two-factor-login:{$challenge}", $user->id, now()->addMinutes(5));
            return response()->json(['twoFactorRequired' => true, 'challenge' => $challenge]);
        }
        return $this->authenticatedResponse($user);
    }
}
