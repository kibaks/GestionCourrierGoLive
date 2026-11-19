<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class MetaWhatsappService
{
    public function send(string $to, string $title, string $message): void
    {
        $wa = CommunicationSettings::get()['whatsapp'];
        if (empty($wa['enabled']) || $wa['provider'] !== 'meta' || !$wa['accessToken'] || !$wa['phoneNumberId'] || !$wa['templateName']) {
            throw new RuntimeException('Service WhatsApp Meta non configuré.');
        }
        if (!preg_match('/^\+[1-9][0-9]{7,14}$/', $to)) throw new RuntimeException('Numéro WhatsApp invalide.');
        $response = Http::timeout(15)->withToken(CommunicationSettings::secret($wa['accessToken']))
            ->post("https://graph.facebook.com/{$wa['apiVersion']}/{$wa['phoneNumberId']}/messages", [
                'messaging_product' => 'whatsapp',
                'to' => ltrim($to, '+'),
                'type' => 'template',
                'template' => [
                    'name' => $wa['templateName'],
                    'language' => ['code' => $wa['language']],
                    'components' => [[
                        'type' => 'body',
                        'parameters' => [
                            ['type' => 'text', 'text' => mb_substr(preg_replace('/\s+/u', ' ', $title), 0, 200)],
                            ['type' => 'text', 'text' => mb_substr(preg_replace('/\s+/u', ' ', $message), 0, 800)],
                        ],
                    ]],
                ],
            ]);
        // Acceptance by Meta is not a delivery/read receipt. Never retry an ambiguous send automatically.
        if (!$response->successful() || !$response->json('messages.0.id')) throw new RuntimeException('Meta n’a pas confirmé la prise en charge du message WhatsApp.');
    }
}
