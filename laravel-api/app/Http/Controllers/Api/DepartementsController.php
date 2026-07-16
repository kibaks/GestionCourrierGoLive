<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Departement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Paramétrage : départements (GestionDepartements).
 * Lecture : authentifié. Écriture : SUPER_ADMIN.
 */
class DepartementsController extends Controller
{
    public function index(): JsonResponse
    {
        $this->authorize('voir-departements');
        $items = Departement::orderBy('nom')->get();
        return response()->json(['data' => $items->map(fn (Departement $d) => $d->toArray())]);
    }

    public function show(string $id): JsonResponse
    {
        $this->authorize('voir-departements');
        $item = Departement::findOrFail($id);
        return response()->json(['data' => $item->toArray()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-departement');
        $validated = $request->validate([
            'nom' => 'required|string|max:255',
            'code' => 'nullable|string|max:64',
            'description' => 'nullable|string',
            'responsableId' => 'nullable|uuid',
            'parentId' => 'nullable|uuid',
            'actif' => 'nullable|boolean',
        ]);
        $item = Departement::create([
            'nom' => $validated['nom'],
            'code' => $validated['code'] ?? null,
            'description' => $validated['description'] ?? null,
            'responsable_id' => $validated['responsableId'] ?? null,
            'parent_id' => $validated['parentId'] ?? null,
            'actif' => $validated['actif'] ?? true,
        ]);
        return response()->json(['data' => $item->toArray()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize('modifier-departement');
        $item = Departement::findOrFail($id);
        $validated = $request->validate([
            'nom' => 'sometimes|string|max:255',
            'code' => 'nullable|string|max:64',
            'description' => 'nullable|string',
            'responsableId' => 'nullable|uuid',
            'parentId' => 'nullable|uuid',
            'actif' => 'nullable|boolean',
        ]);
        $item->update([
            'nom' => $validated['nom'] ?? $item->nom,
            'code' => array_key_exists('code', $validated) ? $validated['code'] : $item->code,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $item->description,
            'responsable_id' => array_key_exists('responsableId', $validated) ? $validated['responsableId'] : $item->responsable_id,
            'parent_id' => array_key_exists('parentId', $validated) ? $validated['parentId'] : $item->parent_id,
            'actif' => array_key_exists('actif', $validated) ? (bool) $validated['actif'] : $item->actif,
        ]);
        return response()->json(['data' => $item->fresh()->toArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->authorize('supprimer-departement');
        $item = Departement::findOrFail($id);
        $item->delete();
        return response()->json(null, 204);
    }
}
