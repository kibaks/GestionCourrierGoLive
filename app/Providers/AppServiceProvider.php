<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(\App\Services\CourrierPartyService::class);
        // Garantir le chargement de la classe de base Controller (évite "Class Controller not found" sur certains environnements Windows)
        $controllerFile = app_path('Http/Controllers/Controller.php');
        if (is_file($controllerFile)) {
            require_once $controllerFile;
        }
    }

    public function boot(): void
    {
        \App\Models\Notification::created(function (\App\Models\Notification $notification): void {
            try {
                app(\App\Services\NotificationDeliveryService::class)->deliver($notification);
            } catch (\Throwable $e) {
                // Keep the in-app notification and the courrier operation available if the queue is unavailable.
                report($e);
            }
        });
        ResetPassword::createUrlUsing(function ($user, string $token): string {
            $frontendUrl = rtrim(config('app.frontend_url'), '/');
            return $frontendUrl . '/reinitialiser-mot-de-passe?token=' . urlencode($token) . '&email=' . urlencode($user->email);
        });
    }
}
