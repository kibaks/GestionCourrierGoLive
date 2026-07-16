<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Config;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Configuration du formulaire courrier (aligné Firebase config/formulaire).
 * Lecture : tout utilisateur authentifié (JWT). Écriture : modifier-permissions (SUPER_ADMIN / DIRECTEUR_GENERAL).
 */
class ConfigFormulaireController extends Controller
{
    private const KEY = 'formulaire';

    /**
     * GET /api/config/formulaire — tout utilisateur connecté peut lire.
     */
    public function show(): JsonResponse
    {
        $value = Config::getValue(self::KEY, [
            'ENTRANT' => ['EXTERNE' => [], 'INTERNE' => []],
            'SORTANT' => ['EXTERNE' => [], 'INTERNE' => []],
        ]);
        return response()->json(['data' => $value]);
    }

    /**
     * PUT /api/config/formulaire
     */
    public function update(Request $request): JsonResponse
    {
        $this->authorize('modifier-permissions');
        $validated = $request->validate([
            'data' => 'required|array',
            'data.ENTRANT' => 'nullable|array',
            'data.SORTANT' => 'nullable|array',
        ]);
        Config::setValue(self::KEY, $validated['data']);
        return response()->json(['data' => Config::getValue(self::KEY)]);
    }
}
