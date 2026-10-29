<?php

namespace App\Services;

use App\Models\Config;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class TwilioService
{
    public function send(string $to, string $message): void
    {
        $settings = CommunicationSettings::get();
        $sms = $settings['sms'] ?? [];

        $sid = $sms['sid'] ?? config('services.twilio.sid');
        $token = CommunicationSettings::secret($sms['token'] ?? '');
        $from = $sms['from'] ?? config('services.twilio.from');

        if (($sms['mode'] ?? 'live') !== 'live' || empty($sms['enabled']) || ($sms['provider'] ?? 'none') !== 'twilio' || !$sid || !$token || !$from) {
            throw new RuntimeException('Service SMS non configuré.');
        }

        $response = Http::timeout(15)->asForm()->withBasicAuth($sid, $token)
            ->post("https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json", [
                'To' => $to,
                'From' => $from,
                'Body' => $message,
            ]);
        if (!$response->successful()) throw new RuntimeException('Envoi SMS indisponible.');
    }

    public function sendWhatsapp(string $to, string $title, string $message): void
    {
        $settings = CommunicationSettings::get();
        $sms = $settings['sms'];
        $wa = $settings['whatsapp'];
        if (($sms['mode'] ?? 'live') !== 'live' || empty($wa['enabled']) || !$sms['sid'] || !$sms['token'] || !$wa['from'] || !$wa['contentSid']) throw new RuntimeException('Service WhatsApp non configuré.');
        $response = Http::timeout(15)->asForm()->withBasicAuth($sms['sid'], CommunicationSettings::secret($sms['token']))
            ->post("https://api.twilio.com/2010-04-01/Accounts/{$sms['sid']}/Messages.json", [
                'To' => 'whatsapp:' . $to, 'From' => 'whatsapp:' . $wa['from'],
                'ContentSid' => $wa['contentSid'],
                'ContentVariables' => json_encode(['1' => mb_substr($title, 0, 200), '2' => mb_substr(preg_replace('/\s+/u', ' ', $message), 0, 800)], JSON_UNESCAPED_UNICODE),
            ]);
        if (!$response->successful()) throw new RuntimeException('Envoi WhatsApp indisponible.');
    }
}
