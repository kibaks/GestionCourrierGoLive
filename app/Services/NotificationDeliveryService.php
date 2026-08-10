<?php

namespace App\Services;

use App\Models\Config;
use App\Models\Notification;
use Illuminate\Support\Facades\Mail;

class NotificationDeliveryService
{
    public function deliver(Notification $notification): void
    {
        $user = $notification->user;
        if (!$user) return;
        $preferences = $user->notification_preferences ?? [];
        $channels = $preferences[$notification->type] ?? ['app' => true, 'email' => false, 'sms' => false];
        $body = "{$notification->title}\n\n{$notification->message}";

        if (($channels['email'] ?? false) || $notification->priority === 'urgent') {
            try {
                $this->applyMailSettings();
                Mail::raw($body, function ($mail) use ($user, $notification) {
                    $mail->to($user->email)->subject($notification->title);
                });
            } catch (\Throwable $exception) {
                report($exception);
            }
        }

        if (($channels['sms'] ?? false) && $notification->priority === 'urgent' && $user->sms_verified_at && $user->sms_phone) {
            try {
                app(TwilioService::class)->send($user->sms_phone, mb_strimwidth($notification->title . ': ' . $notification->message, 0, 150, '…'));
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
    }

    /**
     * Applique les paramètres de serveur mail stockés dans la config 'general'
     * à la configuration runtime de Laravel.
     */
    private function applyMailSettings(): void
    {
        $general = Config::getValue('general', []);
        $mail = $general['mail'] ?? [];
        if (empty($mail['enabled'])) return;

        $driver = $mail['driver'] ?? 'smtp';
        config(['mail.default' => $driver]);

        if ($driver === 'smtp') {
            config([
                'mail.mailers.smtp.host' => $mail['host'] ?? config('mail.mailers.smtp.host'),
                'mail.mailers.smtp.port' => $mail['port'] ?? config('mail.mailers.smtp.port'),
                'mail.mailers.smtp.encryption' => $mail['encryption'] ?? config('mail.mailers.smtp.encryption'),
                'mail.mailers.smtp.username' => $mail['username'] ?? config('mail.mailers.smtp.username'),
                'mail.mailers.smtp.password' => $mail['password'] ?? config('mail.mailers.smtp.password'),
            ]);
        }

        $fromAddress = $mail['fromAddress'] ?? config('mail.from.address');
        $fromName = $mail['fromName'] ?? config('mail.from.name');
        config([
            'mail.from.address' => $fromAddress,
            'mail.from.name' => $fromName,
        ]);
    }
}
