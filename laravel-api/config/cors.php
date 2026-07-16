<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    | À copier dans api-laravel/config/cors.php pour autoriser le front React (Vite).
    |
    */

    // Appliquer CORS aussi sur les URLs de fichiers publics (/storage/...)
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'storage/*'],

    'allowed_methods' => ['*'],

    // En dev, on ouvre à tous les fronts (pas de cookies, auth par Bearer token)
    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Pas de cookies cross-site (auth par Bearer), donc pas besoin de credentials
    'supports_credentials' => false,

];
