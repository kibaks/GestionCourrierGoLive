<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['app' => 'Gestion Courrier API', 'docs' => '/api/health']);
});
