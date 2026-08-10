<?php

use Illuminate\Support\Str;

return [

    'default' => env('CACHE_DRIVER', 'file'),

    'stores' => [

        'default' => [
            'driver' => 'file',
            'path' => storage_path('framework/cache/data'),
        ],

        'array' => [
            'driver' => 'array',
        ],

        'file' => [
            'driver' => 'file',
            'path' => storage_path('framework/cache/data'),
        ],

        'database' => [
            'driver' => 'database',
            'table' => 'cache',
            'connection' => null,
        ],

    ],

    'prefix' => env('CACHE_PREFIX', Str::slug(env('APP_NAME', 'laravel'), '_').'_cache_'),

    'limiter' => env('RATE_LIMITER', 'default'),

];
