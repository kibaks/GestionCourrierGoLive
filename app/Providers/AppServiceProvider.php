<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Garantir le chargement de la classe de base Controller (évite "Class Controller not found" sur certains environnements Windows)
        $controllerFile = app_path('Http/Controllers/Controller.php');
        if (is_file($controllerFile)) {
            require_once $controllerFile;
        }
    }

    public function boot(): void
    {
        ResetPassword::createUrlUsing(function ($user, string $token): string {
            $frontendUrl = rtrim(env('FRONTEND_URL', config('app.url')), '/');
            return $frontendUrl . '/reinitialiser-mot-de-passe?token=' . urlencode($token) . '&email=' . urlencode($user->email);
        });
    }
}
