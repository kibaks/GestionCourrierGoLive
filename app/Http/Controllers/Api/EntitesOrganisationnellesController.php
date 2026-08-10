<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EntiteOrganisationnelle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

/**
 * Paramétrage : entités organisationnelles / directions-services (GestionDirectionsServices).
 * Lecture : authentifié. Écriture : SUPER_ADMIN.
 */
class EntitesOrganisationnellesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('voir-departements');
        $type = $request->input('type');
        $parentId = $request->input('parentId');
        $cacheKey = 'entites_org' . ($type ? '_' . $type : '') . ($parentId ? '_' . $parentId : '');

        $data = Cache::remember($cacheKey, 300, function () use ($type, $parentId) {
            $query = EntiteOrganisationnelle::query()->orderBy('ordre')->orderBy('nom');
            if ($type) $query->where('type', $type);
            if ($parentId) $query->where('parent_id', $parentId);
            return $query->get()->map(fn (EntiteOrganisationnelle $e) => $e->toArray())->values()->all();
        });

        return response()->json(['data' => $data]);
    }

    public function show(string $id): JsonResponse
    {
        $this->authorize('voir-departements');
        $item = EntiteOrganisationnelle::findOrFail($id);
        return response()->json(['data' => $item->toArray()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-departement');
        $validated = $request->validate([
            'nom' => 'required|string|max:255',
            'type' => 'required|string|in:direction_generale,direction,division,service,sous-service,bureau,cellule',
            'description' => 'nullable|string',
            'parentId' => 'nullable|uuid',
            'ordre' => 'nullable|integer|min:0',
            'actif' => 'nullable|boolean',
            'responsableId' => 'nullable|uuid',
        ]);
        $item = EntiteOrganisationnelle::create([
            'nom' => $validated['nom'],
            'type' => $validated['type'],
            'description' => $validated['description'] ?? null,
            'parent_id' => $validated['parentId'] ?? null,
            'ordre' => $validated['ordre'] ?? 0,
            'actif' => $validated['actif'] ?? true,
            'responsable_id' => $validated['responsableId'] ?? null,
        ]);
        $this->clearEntitesCache();
        return response()->json(['data' => $item->toArray()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize('modifier-departement');
        $item = EntiteOrganisationnelle::findOrFail($id);
        $validated = $request->validate([
            'nom' => 'sometimes|string|max:255',
            'type' => 'sometimes|string|in:direction_generale,direction,division,service,sous-service,bureau,cellule',
            'description' => 'nullable|string',
            'parentId' => 'nullable|uuid',
            'ordre' => 'nullable|integer|min:0',
            'actif' => 'nullable|boolean',
            'responsableId' => 'nullable|uuid',
        ]);
        $item->update([
            'nom' => $validated['nom'] ?? $item->nom,
            'type' => $validated['type'] ?? $item->type,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $item->description,
            'parent_id' => array_key_exists('parentId', $validated) ? $validated['parentId'] : $item->parent_id,
            'ordre' => array_key_exists('ordre', $validated) ? (int) $validated['ordre'] : $item->ordre,
            'actif' => array_key_exists('actif', $validated) ? (bool) $validated['actif'] : $item->actif,
            'responsable_id' => array_key_exists('responsableId', $validated) ? $validated['responsableId'] : $item->responsable_id,
        ]);
        $this->clearEntitesCache();
        return response()->json(['data' => $item->fresh()->toArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->authorize('supprimer-departement');
        $item = EntiteOrganisationnelle::findOrFail($id);
        // Supprimer récursivement les enfants pour garder la cohérence
        $this->deleteWithChildren($item);
        $this->clearEntitesCache();
        return response()->json(null, 204);
    }

    private function clearEntitesCache(): void
    {
        // Invalider tous les caches liés aux entités organisationnelles
        $keys = ['entites_org'];
        foreach (EntiteOrganisationnelle::pluck('type')->unique() as $t) {
            $keys[] = 'entites_org_' . $t;
        }
        foreach ($keys as $k) Cache::forget($k);
    }

    private function deleteWithChildren(EntiteOrganisationnelle $entity): void
    {
        foreach ($entity->children()->get() as $child) {
            $this->deleteWithChildren($child);
        }
        $entity->delete();
    }
}
