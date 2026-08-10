<?php

return [
    'default' => env('FILESYSTEM_DISK', 'local'),
    'disks' => [
        'local' => [
            'driver' => 'local',
            'root' => storage_path('app'),
            'throw' => false,
        ],
        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
        ],

        // Fichiers des courriers : stockage PUBLIC sous storage/app/public/courriers/{courrierId}/fichiers/
        'courrier_fichiers' => [
            'driver' => 'local',
            'root' => storage_path('app/public/courriers'),
            'url' => env('APP_URL') . '/storage/courriers',
            'visibility' => 'public',
            'throw' => false,
        ],
    ],
];
