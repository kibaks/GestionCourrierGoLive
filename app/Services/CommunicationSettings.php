<?php

namespace App\Services;

use App\Models\Config;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class CommunicationSettings
{
    public static function defaults(): array
    {
        return [
            'mail' => ['enabled' => false, 'driver' => 'smtp', 'host' => 'mail.armp-rdc.cd', 'port' => 465, 'encryption' => 'ssl', 'username' => 'info@armp-rdc.cd', 'password' => '', 'fromAddress' => 'info@armp-rdc.cd', 'fromName' => 'ARMP RDC'],
            'sms' => ['provider' => 'twilio', 'mode' => 'live', 'enabled' => false, 'sid' => '', 'token' => '', 'from' => ''],
            'whatsapp' => ['enabled' => false, 'from' => '', 'contentSid' => ''],
        ];
    }

    public static function get(): array
    {
        $general = Config::getValue('general', []);
        return array_replace_recursive(self::defaults(), array_intersect_key($general, self::defaults()));
    }

    public static function publicValue(array $settings): array
    {
        foreach (['mail' => 'password', 'sms' => 'token'] as $section => $key) {
            $settings[$section]['hasSecret'] = !empty($settings[$section][$key]);
            $settings[$section][$key] = '';
        }
        return $settings;
    }

    public static function secret(?string $value): string
    {
        if (!$value) return '';
        return str_starts_with($value, 'enc:') ? Crypt::decryptString(substr($value, 4)) : $value;
    }

    public static function protect(array $general): array
    {
        foreach (['mail' => 'password', 'sms' => 'token'] as $section => $key) {
            $secret = $general[$section][$key] ?? '';
            if ($secret && !str_starts_with($secret, 'enc:')) $general[$section][$key] = 'enc:' . Crypt::encryptString($secret);
        }
        return $general;
    }

    public static function save(array $input): array
    {
        $validated = Validator::make($input, [
            'mail' => 'required|array', 'mail.enabled' => 'required|boolean', 'mail.host' => 'required|string|max:253|regex:/^[a-zA-Z0-9.-]+$/',
            'mail.port' => 'required|integer|in:465,587', 'mail.encryption' => 'required|in:ssl,tls', 'mail.username' => 'required|string|max:255',
            'mail.password' => 'nullable|string|max:1024', 'mail.fromAddress' => 'required|email|max:255', 'mail.fromName' => 'nullable|string|max:255',
            'sms' => 'required|array', 'sms.mode' => 'sometimes|in:test,live', 'sms.enabled' => 'required|boolean', 'sms.sid' => ['nullable', 'regex:/^AC[0-9a-fA-F]{32}$/'],
            'sms.token' => 'nullable|string|max:1024', 'sms.from' => ['nullable', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'whatsapp' => 'required|array', 'whatsapp.enabled' => 'required|boolean', 'whatsapp.from' => ['nullable', 'regex:/^\+[1-9][0-9]{7,14}$/'],
            'whatsapp.contentSid' => ['nullable', 'regex:/^HX[0-9a-fA-F]{32}$/'],
        ])->validate();
        $settings = array_replace_recursive(self::get(), $validated);
        if (self::get()['sms']['mode'] === 'test' && $settings['sms']['mode'] === 'live' && (empty($validated['sms']['token']) || $settings['sms']['sid'] === self::get()['sms']['sid'])) throw ValidationException::withMessages(['sms.mode' => 'Remplacez le SID et le jeton de test par les identifiants Live.']);
        foreach (['mail' => 'password', 'sms' => 'token'] as $section => $key) {
            if (empty($validated[$section][$key])) $settings[$section][$key] = self::get()[$section][$key];
            elseif (str_starts_with($validated[$section][$key], 'enc:')) throw ValidationException::withMessages([$section => 'Secret invalide.']);
        }
        $settings['mail']['driver'] = 'smtp';
        $settings['sms']['provider'] = 'twilio';
        if ($settings['sms']['mode'] === 'test' && ($settings['sms']['enabled'] || $settings['whatsapp']['enabled'])) throw ValidationException::withMessages(['sms.mode' => 'Les identifiants de test ne permettent pas de livrer des SMS ou WhatsApp. Renseignez les identifiants Live avant activation.']);
        if (($settings['mail']['port'] === 465 && $settings['mail']['encryption'] !== 'ssl') || ($settings['mail']['port'] === 587 && $settings['mail']['encryption'] !== 'tls')) throw ValidationException::withMessages(['mail.port' => 'Utilisez SSL pour 465 ou STARTTLS pour 587.']);
        if ($settings['mail']['enabled'] && !$settings['mail']['password']) throw ValidationException::withMessages(['mail.password' => 'Renseignez le mot de passe du compte mail avant activation.']);
        if (($settings['sms']['enabled'] || $settings['whatsapp']['enabled']) && (!$settings['sms']['sid'] || !$settings['sms']['token'])) throw ValidationException::withMessages(['sms' => 'Renseignez le SID et le jeton Twilio avant activation.']);
        if ($settings['sms']['enabled'] && !$settings['sms']['from']) throw ValidationException::withMessages(['sms.from' => 'Numéro expéditeur SMS requis.']);
        if ($settings['whatsapp']['enabled'] && (!$settings['whatsapp']['from'] || !$settings['whatsapp']['contentSid'])) throw ValidationException::withMessages(['whatsapp' => 'Expéditeur WhatsApp et modèle approuvé requis (variables 1 : titre, 2 : message).']);
        Config::setValue('general', array_replace(Config::getValue('general', []), $settings));
        return self::publicValue(self::get());
    }

    public static function configureMail(): bool
    {
        $mail = self::get()['mail'];
        if (!$mail['enabled'] || !$mail['password']) return false;
        config(['mail.default' => 'smtp', 'mail.mailers.smtp' => [
            'transport' => 'smtp', 'host' => $mail['host'], 'port' => (int) $mail['port'], 'encryption' => $mail['encryption'],
            'username' => $mail['username'], 'password' => self::secret($mail['password']), 'timeout' => 15,
        ], 'mail.from' => ['address' => $mail['fromAddress'], 'name' => $mail['fromName']]]);
        Mail::purge('smtp');
        return true;
    }
}
