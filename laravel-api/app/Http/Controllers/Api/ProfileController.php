<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TotpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;
use Tymon\JWTAuth\Facades\JWTAuth;

class ProfileController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->userToArray(Auth::user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = Auth::user();
        $validated = $request->validate(['name' => 'required|string|max:255']);
        $user->name = $validated['name'];
        $user->save();
        return response()->json(['data' => $this->userToArray($user->fresh())]);
    }

    public function photo(Request $request): JsonResponse
    {
        $request->validate(['photo' => 'required|image|mimes:jpg,jpeg,png,webp|max:2048']);
        $user = Auth::user();
        if ($user->photo_url) Storage::disk('public')->delete(str_replace('/storage/', '', parse_url($user->photo_url, PHP_URL_PATH) ?? ''));
        $path = $request->file('photo')->store('profiles', 'public');
        $user->photo_url = Storage::disk('public')->url($path);
        $user->save();
        return response()->json(['data' => $this->userToArray($user->fresh())]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => 'required|string',
            'password' => ['required', 'confirmed', Password::defaults()],
        ]);
        $user = Auth::user();
        if (!Hash::check($validated['current_password'], $user->password)) return response()->json(['message' => 'Mot de passe actuel incorrect.'], 422);
        $user->password = Hash::make($validated['password']);
        $user->save();
        JWTAuth::invalidate(JWTAuth::getToken());
        return response()->json(['message' => 'Mot de passe modifié. Reconnectez-vous.']);
    }

    public function beginTwoFactor(TotpService $totp): JsonResponse
    {
        $user = Auth::user();
        $secret = $totp->generateSecret();
        $user->two_factor_secret = encrypt($secret);
        $user->two_factor_confirmed_at = null;
        $user->two_factor_recovery_codes = null;
        $user->save();
        return response()->json(['secret' => $secret, 'otpauthUri' => $totp->provisioningUri(config('app.name'), $user->email, $secret)]);
    }

    public function confirmTwoFactor(Request $request, TotpService $totp): JsonResponse
    {
        $request->validate(['code' => 'required|digits:6']);
        $user = Auth::user();
        $secret = $this->secret($user);
        if (!$secret || !$totp->verify($secret, $request->code)) return response()->json(['message' => 'Code de vérification invalide.'], 422);
        $codes = $totp->recoveryCodes();
        $user->two_factor_confirmed_at = now();
        $user->two_factor_recovery_codes = encrypt(json_encode(array_map(fn ($code) => Hash::make($code), $codes)));
        $user->save();
        return response()->json(['message' => 'Authentification à deux facteurs activée.', 'recoveryCodes' => $codes]);
    }

    public function disableTwoFactor(Request $request): JsonResponse
    {
        $request->validate(['current_password' => 'required|string']);
        $user = Auth::user();
        if (!Hash::check($request->current_password, $user->password)) return response()->json(['message' => 'Mot de passe actuel incorrect.'], 422);
        $user->two_factor_secret = null;
        $user->two_factor_confirmed_at = null;
        $user->two_factor_recovery_codes = null;
        $user->save();
        return response()->json(['message' => 'Authentification à deux facteurs désactivée.']);
    }

    private function secret(User $user): ?string
    {
        try { return $user->two_factor_secret ? decrypt($user->two_factor_secret) : null; } catch (\Throwable) { return null; }
    }

    private function userToArray(User $user): array
    {
        return ['id' => $user->id, 'nom' => $user->name, 'email' => $user->email, 'role' => $user->role, 'direction' => $user->direction, 'service' => $user->service, 'entiteId' => $user->entite_id, 'actif' => $user->actif, 'photoUrl' => $user->photo_url, 'twoFactorEnabled' => $user->two_factor_confirmed_at !== null];
    }
}
