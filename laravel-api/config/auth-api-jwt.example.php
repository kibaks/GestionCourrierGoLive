<?php

/**
 * À intégrer dans config/auth.php : garde API JWT pour tymon/jwt-auth.
 * Dans la clé 'guards', ajouter :
 *
 * 'api' => [
 *     'driver' => 'jwt',
 *     'provider' => 'users',
 *     'hash' => false,
 * ],
 *
 * Et s'assurer que 'users' existe dans 'providers' avec le modèle App\Models\User.
 */

return [
    'guards' => [
        'api' => [
            'driver' => 'jwt',
            'provider' => 'users',
            'hash' => false,
        ],
    ],
    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => App\Models\User::class,
        ],
    ],
];
