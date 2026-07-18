<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class TwilioService
{
    public function send(string $to, string $message): void
    {
        $sid = config('services.twilio.sid');
        $token = config('services.twilio.token');
        $from = config('services.twilio.from');
        if (!$sid || !$token || !$from) throw new RuntimeException('Service SMS non configuré.');

        $response = Http::asForm()->withBasicAuth($sid, $token)
            ->post("https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json", [
                'To' => $to,
                'From' => $from,
                'Body' => $message,
            ]);
        if (!$response->successful()) throw new RuntimeException('Envoi SMS indisponible.');
    }
}
