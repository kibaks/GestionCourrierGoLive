<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EntiteTypeDefinition;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

/**
 * Paramétrage : types d'entités (GestionTypesEntites) — Direction, Service, etc.
 * Lecture : authentifié. Écriture : SUPER_ADMIN.
 */
class EntiteTypesController extends Controller
{
    public function index(): JsonResponse
    {
        $data = Cache::remember('entite_types_all', 300, function () {
            return EntiteTypeDefinition::orderBy('ordre')->get()->map(fn (EntiteTypeDefinition $e) => $e->toArray())->values()->all();
        });
        return response()->json(['data' => $data]);
    }

    /** Liste des libellés (tout utilisateur authentifié, pour listes déroulantes). */
    public function labels(): JsonResponse
    {
        return $this->index();
    }

    public function show(string $id): JsonResponse
    {
        $item = EntiteTypeDefinition::findOrFail($id);
        return response()->json(['data' => $item->toArray()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-role');
        $validated = $request->validate([
            'code' => 'required|string|max:32|unique:entite_type_definitions,code',
            'libelleSingulier' => 'required|string|max:255',
            'libellePluriel' => 'required|string|max:255',
            'description' => 'nullable|string',
            'icone' => 'nullable|string|max:64',
            'ordre' => 'nullable|integer|min:0',
            'actif' => 'nullable|boolean',
        ]);
        $item = EntiteTypeDefinition::create([
            'code' => $validated['code'],
            'libelle_singulier' => $validated['libelleSingulier'],
            'libelle_pluriel' => $validated['libellePluriel'],
            'description' => $validated['description'] ?? null,
            'icone' => $validated['icone'] ?? null,
            'ordre' => $validated['ordre'] ?? 0,
            'actif' => $validated['actif'] ?? true,
        ]);
        Cache::forget('entite_types_all');
        return response()->json(['data' => $item->toArray()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize('modifier-role');
        $item = EntiteTypeDefinition::findOrFail($id);
        $validated = $request->validate([
            'code' => 'sometimes|string|max:32|unique:entite_type_definitions,code,' . $id,
            'libelleSingulier' => 'sometimes|string|max:255',
            'libellePluriel' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'icone' => 'nullable|string|max:64',
            'ordre' => 'nullable|integer|min:0',
            'actif' => 'nullable|boolean',
        ]);
        $updates = [
            'code' => array_key_exists('code', $validated) ? $validated['code'] : $item->code,
            'libelle_singulier' => array_key_exists('libelleSingulier', $validated) ? $validated['libelleSingulier'] : $item->libelle_singulier,
            'libelle_pluriel' => array_key_exists('libellePluriel', $validated) ? $validated['libellePluriel'] : $item->libelle_pluriel,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $item->description,
            'icone' => array_key_exists('icone', $validated) ? $validated['icone'] : $item->icone,
            'ordre' => array_key_exists('ordre', $validated) ? (int) $validated['ordre'] : $item->ordre,
        ];
        // actif : utiliser la requête directement pour accepter false (validate peut ne pas inclure la clé selon le client)
        if ($request->has('actif')) {
            $updates['actif'] = $request->boolean('actif');
        } else {
            $updates['actif'] = $item->actif;
        }
        $item->update($updates);
        Cache::forget('entite_types_all');
        return response()->json(['data' => $item->fresh()->toArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->authorize('supprimer-role');
        $item = EntiteTypeDefinition::findOrFail($id);
        $item->delete();
        Cache::forget('entite_types_all');
        return response()->json(null, 204);
    }
}
