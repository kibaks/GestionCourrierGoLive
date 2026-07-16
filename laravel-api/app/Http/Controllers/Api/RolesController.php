<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RoleDefinition;
use App\Services\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Paramétrage : rôles (GestionRoles).
 * Contrôlé par les permissions VOIR_ROLES, CREER_ROLE, MODIFIER_ROLE, SUPPRIMER_ROLE.
 */
class RolesController extends Controller
{
    public function __construct(
        private PermissionService $permissionService
    ) {}

    public function index(): JsonResponse
    {
        $items = RoleDefinition::orderBy('code')->get();
        return response()->json(['data' => $items->map(fn (RoleDefinition $r) => $r->toArray())]);
    }

    public function show(string $id): JsonResponse
    {
        $item = RoleDefinition::findOrFail($id);
        return response()->json(['data' => $item->toArray()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('creer-role');
        $validated = $request->validate([
            'nom' => 'required|string|max:255',
            'code' => 'required|string|max:32|unique:roles,code',
            'description' => 'nullable|string',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string',
        ]);
        $item = RoleDefinition::create($validated);
        return response()->json(['data' => $item->toArray()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $this->authorize('modifier-role');
        $item = RoleDefinition::findOrFail($id);
        $validated = $request->validate([
            'nom' => 'sometimes|string|max:255',
            'code' => 'sometimes|string|max:32|unique:roles,code,' . $id,
            'description' => 'nullable|string',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string',
        ]);
        $item->update($validated);
        $this->permissionService->clearRoleCache($item->code);
        return response()->json(['data' => $item->fresh()->toArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->authorize('supprimer-role');
        $item = RoleDefinition::findOrFail($id);
        $code = $item->code;
        $item->delete();
        $this->permissionService->clearRoleCache($code);
        return response()->json(null, 204);
    }
}
