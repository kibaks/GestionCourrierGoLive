<?php
namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\Address;

class GmailService
{
    public function send(string $to, string $subject, string $body): string
    {
        $mail=CommunicationSettings::get()['mail'];
        if (empty($mail['enabled']) || ($mail['provider'] ?? 'smtp') !== 'gmail' || empty($mail['googleClientId']) || empty($mail['googleClientSecret']) || empty($mail['googleRefreshToken'])) {
            throw new RuntimeException('Gmail n’est pas configuré ou autorisé.');
        }
        // No automatic retry: an ambiguous send must be checked before another attempt.
        $token=Http::timeout(20)->asForm()->post('https://oauth2.googleapis.com/token',[
            'client_id'=>$mail['googleClientId'],
            'client_secret'=>CommunicationSettings::secret($mail['googleClientSecret']),
            'refresh_token'=>CommunicationSettings::secret($mail['googleRefreshToken']),
            'grant_type'=>'refresh_token',
        ]);
        if (!$token->successful() || !is_string($token->json('access_token')) || !$token->json('access_token')) {
            throw new RuntimeException('Autorisation Gmail refusée ou expirée. Reconnectez le compte Google.');
        }
        $message=(new Email())->from(new Address($mail['fromAddress'],$mail['fromName'] ?: 'ARMP RDC'))->to($to)->subject($subject)->text($body);
        $raw=rtrim(strtr(base64_encode($message->toString()),'+/','-_'),'=');
        $response=Http::timeout(20)->withToken($token->json('access_token'))->post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',['raw'=>$raw]);
        if (!$response->successful() || !is_string($response->json('id')) || !$response->json('id')) {
            throw new RuntimeException('Google n’a pas confirmé l’envoi de l’e-mail. Vérifiez avant de réessayer.');
        }
        return $response->json('id');
    }
}
