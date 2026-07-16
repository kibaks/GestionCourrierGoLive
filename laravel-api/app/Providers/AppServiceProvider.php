<?php

namespace App\Providers;

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
        //
    }
}
