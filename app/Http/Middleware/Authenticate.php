<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;

class Authenticate extends Middleware
{
    protected function redirectTo(Request $request): ?string
    {
        // Pour les requêtes API, ne pas rediriger mais retourner null (ce qui donnera une erreur 401)
        if ($request->expectsJson() || $request->is('api/*')) {
            return null;
        }
        
        return route('login');
    }
}
