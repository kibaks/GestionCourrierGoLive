<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TotpService;
use App\Services\TwilioService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
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
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'firstName' => 'nullable|string|max:100',
            'lastName' => 'nullable|string|max:100',
            'jobTitle' => 'nullable|string|max:150',
            'professionalPhone' => 'nullable|string|max:32',
            'personalPhone' => 'nullable|string|max:32',
            'bio' => 'nullable|string|max:1000',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'country' => 'nullable|string|max:100',
            'profileVisibility' => 'nullable|array',
            'notificationPreferences' => 'nullable|array',
        ]);
        $user->name = $validated['name'];
        $user->first_name = $validated['firstName'] ?? null;
        $user->last_name = $validated['lastName'] ?? null;
        $user->job_title = $validated['jobTitle'] ?? null;
        $user->professional_phone = $validated['professionalPhone'] ?? null;
        $user->personal_phone = $validated['personalPhone'] ?? null;
        $user->bio = $validated['bio'] ?? null;
        $user->address = $validated['address'] ?? null;
        $user->city = $validated['city'] ?? null;
        $user->country = $validated['country'] ?? null;
        if (array_key_exists('profileVisibility', $validated)) $user->profile_visibility = $validated['profileVisibility'];
        if (array_key_exists('notificationPreferences', $validated)) $user->notification_preferences = $validated['notificationPreferences'];
        $user->save();
        return response()->json(['data' => $this->userToArray($user->fresh())]);
    }

    public function cover(Request $request): JsonResponse
    {
        $request->validate(['cover' => 'required|image|mimes:jpg,jpeg,png,webp|max:4096']);
        $user = Auth::user();
        if ($user->cover_url) Storage::disk('public')->delete(str_replace('/storage/', '', parse_url($user->cover_url, PHP_URL_PATH) ?? ''));
        $path = $request->file('cover')->store('covers', 'public');
        $user->cover_url = Storage::disk('public')->url($path);
        $user->save();
        return response()->json(['data' => $this->userToArray($user->fresh())]);
    }

    public function requestEmailChange(Request $request): JsonResponse
    {
        $validated = $request->validate(['current_password' => 'required|string', 'email' => 'required|email|max:255|unique:users,email']);
        $user = Auth::user();
        if (!Hash::check($validated['current_password'], $user->password)) return response()->json(['message' => 'Mot de passe actuel incorrect.'], 422);
        $token = bin2hex(random_bytes(32));
        Cache::put("email-change:{$token}", ['userId' => $user->id, 'email' => $validated['email']], now()->addMinutes(30));
        $url = rtrim(env('FRONTEND_URL', config('app.url')), '/') . '/confirmer-email?token=' . urlencode($token);
        Mail::raw("Confirmez votre nouvelle adresse e-mail : {$url}", function ($mail) use ($validated) { $mail->to($validated['email'])->subject('Confirmation de votre adresse e-mail'); });
        return response()->json(['message' => 'Un lien de confirmation a été envoyé à la nouvelle adresse.']);
    }

    public function confirmEmailChange(Request $request): JsonResponse
    {
        $request->validate(['token' => 'required|string']);
        $payload = Cache::pull("email-change:{$request->token}");
        $user = $payload ? User::find($payload['userId']) : null;
        if (!$user) return response()->json(['message' => 'Lien invalide ou expiré.'], 422);
        $user->email = $payload['email'];
        $user->email_verified_at = now();
        $user->save();
        return response()->json(['message' => 'Adresse e-mail confirmée. Connectez-vous avec votre nouvelle adresse.']);
    }

    public function requestSmsVerification(Request $request, TwilioService $twilio): JsonResponse
    {
        $validated = $request->validate(['phone' => 'required|string|max:32']);
        $user = Auth::user();
        $code = (string) random_int(100000, 999999);
        $user->sms_phone = $validated['phone'];
        $user->sms_verified_at = null;
        $user->save();
        Cache::put("sms-verification:{$user->id}", $code, now()->addMinutes(10));
        $twilio->send($validated['phone'], "Votre code de vérification est : {$code}");
        return response()->json(['message' => 'Code envoyé par SMS.']);
    }

    public function confirmSmsVerification(Request $request): JsonResponse
    {
        $request->validate(['code' => 'required|digits:6']);
        $user = Auth::user();
        if (!hash_equals((string) Cache::pull("sms-verification:{$user->id}"), $request->code)) return response()->json(['message' => 'Code SMS invalide ou expiré.'], 422);
        $user->sms_verified_at = now();
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
        return ['id' => $user->id, 'nom' => $user->name, 'email' => $user->email, 'role' => $user->role, 'direction' => $user->direction, 'service' => $user->service, 'entiteId' => $user->entite_id, 'actif' => $user->actif, 'photoUrl' => $user->photo_url, 'coverUrl' => $user->cover_url, 'firstName' => $user->first_name, 'lastName' => $user->last_name, 'jobTitle' => $user->job_title, 'professionalPhone' => $user->professional_phone, 'personalPhone' => $user->personal_phone, 'bio' => $user->bio, 'address' => $user->address, 'city' => $user->city, 'country' => $user->country, 'profileVisibility' => $user->profile_visibility ?? [], 'notificationPreferences' => $user->notification_preferences ?? [], 'smsPhone' => $user->sms_phone, 'smsVerified' => $user->sms_verified_at !== null, 'emailVerified' => $user->email_verified_at !== null, 'twoFactorEnabled' => $user->two_factor_confirmed_at !== null];
    }
}
