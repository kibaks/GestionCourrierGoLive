<?php

namespace App\Services;

use App\Models\Config;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class TwilioService
{
    public function send(string $to, string $message): void
    {
        $settings = Config::getValue('general', []);
        $sms = $settings['sms'] ?? [];

        $sid = $sms['sid'] ?? config('services.twilio.sid');
        $token = $sms['token'] ?? config('services.twilio.token');
        $from = $sms['from'] ?? config('services.twilio.from');

        if (($sms['provider'] ?? 'none') !== 'twilio' || !$sid || !$token || !$from) {
            throw new RuntimeException('Service SMS non configuré.');
        }

        $response = Http::asForm()->withBasicAuth($sid, $token)
            ->post("https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json", [
                'To' => $to,
                'From' => $from,
                'Body' => $message,
            ]);
        if (!$response->successful()) throw new RuntimeException('Envoi SMS indisponible.');
    }
}
