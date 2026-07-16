<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ResponsabiliteDefinition;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Paramétrage : définitions des responsabilités (GestionResponsabilites).
 * Lecture : authentifié. Écriture : SUPER_ADMIN.
 */
class ResponsabilitesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('voir-roles');
        $query = ResponsabiliteDefinition::query()->orderBy('code');
        if ($request->filled('niveau')) {
            $query->where('niveau', $request->input('niveau'));
        }
        $items = $query->get();
        return response()->json(['data' => $items->map(fn (ResponsabiliteDefinition $r) => $r->toArray())]);
    }

    public function show(string $id): JsonResponse
    {
        $this->authorize('voir-roles');
        $item = ResponsabiliteDefinition::findOrFail($id);
        return response()->json(['data' => $item->toArray()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-role');
        $validated = $request->validate([
            'code' => 'required|string|max:64|unique:responsabilite_definitions,code',
            'libelle' => 'required|string|max:255',
            'description' => 'nullable|string',
            'niveau' => 'required|string|in:direction,service,utilisateur,global',
        ]);
        $item = ResponsabiliteDefinition::create($validated);
        return response()->json(['data' => $item->toArray()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize('modifier-role');
        $item = ResponsabiliteDefinition::findOrFail($id);
        $validated = $request->validate([
            'code' => 'sometimes|string|max:64|unique:responsabilite_definitions,code,' . $id,
            'libelle' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'niveau' => 'sometimes|string|in:direction,service,utilisateur,global',
        ]);
        $item->update($validated);
        return response()->json(['data' => $item->fresh()->toArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->authorize('supprimer-role');
        $item = ResponsabiliteDefinition::findOrFail($id);
        $item->delete();
        return response()->json(null, 204);
    }
}
