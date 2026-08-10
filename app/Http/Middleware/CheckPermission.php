<?php

namespace App\Http\Middleware;

use App\Permissions\Permission;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Vérifie que l'utilisateur connecté a la permission donnée.
 * Usage : middleware('permission:voir-courriers') ou permission:creer-courrier,modifier-courrier (au moins une).
 */
class CheckPermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }

        foreach ($permissions as $gateName) {
            if ($request->user()->can($gateName)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'Action non autorisée. Permission(s) requise(s) : ' . implode(', ', $permissions),
        ], 403);
    }
}
