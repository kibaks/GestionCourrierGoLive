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

    'allowed_origins' => array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', env('FRONTEND_URL', 'http://localhost:5173'))))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Pas de cookies cross-site (auth par Bearer), donc pas besoin de credentials
    'supports_credentials' => false,

];
