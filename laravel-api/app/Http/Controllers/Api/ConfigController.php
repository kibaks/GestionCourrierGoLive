<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Config;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Paramétrage : config par clé (formulaire, export, scanners, scanner_backend_url, etc.).
 * GET /api/config/{key} — lecture (authentifié).
 * PUT /api/config/{key} — écriture (SUPER_ADMIN sauf pour certaines clés).
 */
class ConfigController extends Controller
{
    private const ALLOWED_KEYS = ['formulaire', 'export', 'scanners', 'scanner_backend_url', 'archive3d', 'courrier_fichier', 'cachet_accuse'];

    /**
     * GET /api/config/{key}
     */
    public function show(string $key): JsonResponse
    {
        $this->authorize('voir-roles');
        if (!in_array($key, self::ALLOWED_KEYS, true)) {
            return response()->json(['message' => 'Clé de config non autorisée'], 400);
        }
        $default = $this->getDefaultForKey($key);
        $value = Config::getValue($key, $default);
        return response()->json(['data' => $value, 'key' => $key]);
    }

    /**
     * PUT /api/config/{key}
     */
    public function update(Request $request, string $key): JsonResponse
    {
        $this->authorize('modifier-permissions');
        if (!in_array($key, self::ALLOWED_KEYS, true)) {
            return response()->json(['message' => 'Clé de config non autorisée'], 400);
        }
        $value = $request->input('data', $request->all());
        if ($request->has('data')) {
            $value = $request->input('data');
        } else {
            $value = $request->all();
        }
        Config::setValue($key, $value);
        return response()->json(['data' => Config::getValue($key), 'key' => $key]);
    }

    private function getDefaultForKey(string $key): mixed
    {
        return match ($key) {
            'formulaire' => [
                'ENTRANT' => ['EXTERNE' => [], 'INTERNE' => []],
                'SORTANT' => ['EXTERNE' => [], 'INTERNE' => []],
            ],
            'export' => [
                'format' => 'A4',
                'orientation' => 'landscape',
                'scale' => 2,
                'quality' => 'high',
                'backgroundColor' => '#ffffff',
                'includeHeaders' => true,
                'includeFilters' => false,
                'colorMode' => 'color',
                'margins' => ['top' => 20, 'right' => 20, 'bottom' => 20, 'left' => 20],
                'columns' => [],
            ],
            'scanners' => [],
            'scanner_backend_url' => '',
            'archive3d' => [],
            'courrier_fichier' => [
                'maxSizeMo' => 100,
                'compressImages' => true,
            ],
            'cachet_accuse' => [
                'organisation' => '',
                'forme' => 'rectangle',
                'couleurEncre' => '#1a73e8',
                'couleurFond' => 'transparent',
                'inclinaison' => -3,
                'positionX' => 10,
                'positionY' => 10,
                'largeur' => 180,
                'hauteur' => 100,
                'bordureDouble' => true,
                'afficherQR' => false,
            ],
            default => null,
        };
    }
}
