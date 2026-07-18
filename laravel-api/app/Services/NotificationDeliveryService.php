<?php

namespace App\Services;

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
}
