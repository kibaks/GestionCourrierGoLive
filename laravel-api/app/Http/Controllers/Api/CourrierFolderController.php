<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CourrierFolder;
use App\Models\CourrierFolderMap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Dossiers de classement (courrier_folders) + mapping courrier -> dossier (courrier_folder_maps).
 * Priorité MySQL : données persistées côté serveur pour ne pas disparaître hors ligne.
 */
class CourrierFolderController extends Controller
{
    /**
     * Liste des dossiers de l'utilisateur connecté.
     * GET /api/folders?user_id=xxx (user_id ignoré ; on utilise Auth::id())
     */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();
        $userId = $user?->id;

        if ($userId === null || $userId === '') {
            return response()->json(['data' => []]);
        }
        try {
            $cacheKey = "folders_{$userId}";

            $list = Cache::remember($cacheKey, 120, function () use ($user, $userId) {
                // Chaque niveau organisationnel ne voit que les dossiers de SON niveau
                // DG ne voit pas les dossiers des directions, et vice-versa
                $query = CourrierFolder::where(function ($q) use ($user, $userId) {
                    // 1. Ses propres dossiers (toujours visibles)
                    $q->where('user_id', (string) $userId);

                    $isDG = $user->isSuperAdmin() || $user->isDirecteurGeneral() || ($user->isSecretaire() && !$user->direction);
                    if ($isDG) {
                        $q->orWhere(function ($q2) {
                            $q2->where('visibility', 'dg')->whereNull('direction');
                        });
                    }
                    if (($user->isDirecteur() || ($user->isSecretaire() && $user->direction)) && $user->direction) {
                        // 3. Niveau Direction : dossiers de SA direction uniquement
                        $q->orWhere(function ($q2) use ($user) {
                            $q2->where('visibility', 'direction')
                               ->where('direction', $user->direction);
                        });
                    }
                    if ($user->isChefService() && $user->service) {
                        // 4. Niveau Service : dossiers de SON service uniquement
                        $q->orWhere(function ($q2) use ($user) {
                            $q2->where('visibility', 'service')
                               ->where('service', $user->service);
                        });
                        // Un chef de service voit aussi les dossiers de sa direction
                        if ($user->direction) {
                            $q->orWhere(function ($q2) use ($user) {
                                $q2->where('visibility', 'direction')
                                   ->where('direction', $user->direction);
                            });
                        }
                    }
                    if ($user->isAgent()) {
                        // 5. Agent : dossiers de son service + de sa direction (sous-entité)
                        if ($user->service) {
                            $q->orWhere(function ($q2) use ($user) {
                                $q2->where('visibility', 'service')
                                   ->where('service', $user->service);
                            });
                        }
                        if ($user->direction) {
                            $q->orWhere(function ($q2) use ($user) {
                                $q2->where('visibility', 'direction')
                                   ->where('direction', $user->direction);
                            });
                        }
                    }
                });
                $folders = $query->orderBy('created_at')->get();
                return $folders->map(fn (CourrierFolder $f) => $f->toArray())->values()->all();
            });

            return response()->json(['data' => $list]);
        } catch (Throwable $e) {
            Log::error('CourrierFolderController::index', [
                'user_id' => $userId,
                'message' => $e->getMessage(),
            ]);
            return response()->json(['data' => []]);
        }
    }

    /**
     * Créer un dossier.
     * POST /api/folders
     */
    public function store(Request $request): JsonResponse
    {
        $user = Auth::user();
        $userId = $user?->id;
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'parentId' => 'nullable|uuid',
            'color' => 'nullable|string|max:32',
            'visibility' => 'nullable|string|in:dg,direction,service,private',
        ]);
        $parentId = $validated['parentId'] ?? null;
        // Accepter un parentId même si créé par un autre user (dossier partagé visible)
        if ($parentId && !CourrierFolder::where('id', $parentId)->exists()) {
            $parentId = null;
        }

        // Déterminer la visibilité par défaut selon le rôle
        $visibility = $validated['visibility'] ?? null;
        if (!$visibility) {
            if ($user->isSuperAdmin() || $user->isDirecteurGeneral() || ($user->isSecretaire() && !$user->direction)) {
                $visibility = 'dg';
            } elseif ($user->isDirecteur() || ($user->isSecretaire() && $user->direction)) {
                $visibility = 'direction';
            } elseif ($user->isChefService()) {
                $visibility = 'service';
            } else {
                $visibility = 'private';
            }
        }

        $folder = CourrierFolder::create([
            'name' => $validated['name'],
            'parent_id' => $parentId,
            'user_id' => $userId,
            'color' => $validated['color'] ?? null,
            'visibility' => $visibility,
            'direction' => $user->direction,
            'service' => $user->service,
        ]);
        $this->clearFolderCache($userId);
        return response()->json(['data' => $folder->toArray()], 201);
    }

    /**
     * Mettre à jour un dossier.
     * PUT /api/folders/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $userId = Auth::id();
        if ($userId === null) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }
        $folder = CourrierFolder::where('id', $id)->where('user_id', $userId)->first();
        if (!$folder) {
            return response()->json(['message' => 'Dossier non trouvé'], 404);
        }
        $validated = $request->validate([
            'name' => 'sometimes|nullable|string|max:255',
            'parentId' => 'nullable|uuid',
            'color' => 'sometimes|nullable|string|max:32',
            'visibility' => 'sometimes|nullable|string|in:dg,direction,service,private',
        ]);
        $parentId = array_key_exists('parentId', $validated) ? $validated['parentId'] : $folder->parent_id;
        if ($parentId !== null && !CourrierFolder::where('id', $parentId)->where('user_id', $userId)->exists()) {
            $parentId = null;
        }
        if (array_key_exists('name', $validated)) {
            $folder->name = $validated['name'] ?? $folder->name;
        }
        if (array_key_exists('parentId', $validated)) {
            $folder->parent_id = $parentId;
        }
        if (array_key_exists('color', $validated)) {
            $folder->color = $validated['color'];
        }
        if (array_key_exists('visibility', $validated)) {
            $folder->visibility = $validated['visibility'];
        }
        $folder->save();
        $this->clearFolderCache($userId);
        return response()->json(['data' => $folder->fresh()->toArray()]);
    }

    /**
     * Supprimer plusieurs dossiers. Même logique que courrier_fichiers : suppression en cascade.
     * Pour chaque id, on supprime récursivement les enfants (parent_id = id) puis le dossier.
     * DELETE /api/folders (body: ids[])
     */
    public function destroy(Request $request): JsonResponse
    {
        $ids = $request->validate(['ids' => 'required|array', 'ids.*' => 'uuid'])['ids'];
        $userId = Auth::id();
        
        // Collecter tous les IDs de dossiers à supprimer (incluant les descendants)
        $allFolderIds = [];
        foreach ($ids as $id) {
            $this->collectFolderAndDescendants($id, $userId, $allFolderIds);
        }
        
        // Supprimer les dossiers
        foreach ($ids as $id) {
            $this->deleteFolderAndDescendants($id, $userId);
        }
        
        // Nettoyer le mapping : mettre à null les entrées qui pointent vers les dossiers supprimés
        if (!empty($allFolderIds)) {
            CourrierFolderMap::where('user_id', $userId)
                ->whereJsonContains('map', $allFolderIds)
                ->get()
                ->each(function ($row) use ($allFolderIds) {
                    $map = $row->map ?? [];
                    $updated = false;
                    
                    foreach ($map as $courrierId => $folderId) {
                        if ($folderId !== null && in_array($folderId, $allFolderIds)) {
                            $map[$courrierId] = null;
                            $updated = true;
                        }
                    }
                    
                    if ($updated) {
                        $row->map = $map;
                        $row->save();
                    }
                });
        }
        
        Log::info('[Dossiers] Dossiers supprimés', [
            'userId' => $userId,
            'ids' => $ids,
            'allFolderIds' => $allFolderIds
        ]);
        $this->clearFolderCache($userId);
        $this->clearMapCache($userId);
        return response()->json(null, 204);
    }

    /** Collecte un dossier et tous ses descendants (récursif). */
    private function collectFolderAndDescendants(string $folderId, ?string $userId, array &$collected): void
    {
        if ($userId === null) {
            return;
        }
        
        $user = Auth::user();
        
        $collected[] = $folderId;
        
        // Pour le SUPER_ADMIN, DIRECTEUR_GENERAL et SECRETAIRE : collecter tous les dossiers sans filtrer par user_id
        if ($user->isSuperAdmin() || $user->isDirecteurGeneral() || $user->isSecretaire()) {
            $children = CourrierFolder::where('parent_id', $folderId)->get();
        } else {
            // Utilisateurs standards : collecter seulement leurs propres dossiers
            $children = CourrierFolder::where('parent_id', $folderId)->where('user_id', $userId)->get();
        }
        
        foreach ($children as $child) {
            $this->collectFolderAndDescendants($child->id, $userId, $collected);
        }
    }

    /** Supprime un dossier et tous ses descendants (récursif). */
    private function deleteFolderAndDescendants(string $folderId, ?string $userId): void
    {
        if ($userId === null) {
            return;
        }
        
        $user = Auth::user();
        
        // Pour le SUPER_ADMIN, DIRECTEUR_GENERAL et SECRETAIRE : supprimer tous les dossiers sans filtrer par user_id
        if ($user->isSuperAdmin() || $user->isDirecteurGeneral() || $user->isSecretaire()) {
            $children = CourrierFolder::where('parent_id', $folderId)->get();
            foreach ($children as $child) {
                $this->deleteFolderAndDescendants($child->id, $userId);
            }
            CourrierFolder::where('id', $folderId)->delete();
        } else {
            // Utilisateurs standards : supprimer seulement leurs propres dossiers
            $children = CourrierFolder::where('parent_id', $folderId)->where('user_id', $userId)->get();
            foreach ($children as $child) {
                $this->deleteFolderAndDescendants($child->id, $userId);
            }
            CourrierFolder::where('id', $folderId)->where('user_id', $userId)->delete();
        }
    }

    /**
     * Récupérer le mapping courrier -> dossier pour l'utilisateur connecté.
     * GET /api/folder-map (user_id optionnel ; on utilise toujours Auth::id() pour éviter décalage string/int)
     */
    public function getMap(Request $request): JsonResponse
    {
        $user = Auth::user();
        $userId = $user?->id;
        if ($userId === null) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }
        try {
            $isAdmin = $user->isSuperAdmin() || $user->isDirecteurGeneral() || $user->isSecretaire();
            $cacheKey = $isAdmin ? 'folder_map_all' : "folder_map_{$userId}";

            $map = Cache::remember($cacheKey, 120, function () use ($isAdmin, $userId) {
                if ($isAdmin) {
                    // Optimisé : charger uniquement les user_id des admins pour limiter la requête
                    $map = [];
                    $allMaps = CourrierFolderMap::pluck('map', 'user_id');
                    foreach ($allMaps as $rowMap) {
                        if (!is_array($rowMap)) continue;
                        foreach ($rowMap as $courrierId => $folderId) {
                            $cid = (string) $courrierId;
                            if (!array_key_exists($cid, $map)) {
                                $map[$cid] = $folderId === null ? null : (string) $folderId;
                            }
                        }
                    }
                } else {
                    $row = CourrierFolderMap::where('user_id', (string) $userId)->first();
                    $map = $row ? ($row->map ?? []) : [];
                }
                // Normaliser les clés en string
                return $map ? array_combine(
                    array_map('strval', array_keys($map)),
                    array_map(function ($v) {
                        return $v === null ? null : (string) $v;
                    }, $map)
                ) : [];
            });

            return response()->json(['data' => ['map' => $map]]);
        } catch (Throwable $e) {
            Log::error('CourrierFolderController::getMap', ['message' => $e->getMessage()]);
            return response()->json(['data' => ['map' => []]]);
        }
    }

    /**
     * Sauvegarder le mapping courrier -> dossier.
     * PUT /api/folder-map (body: map = { courrierId: folderId | null })
     */
    public function saveMap(Request $request): JsonResponse
    {
        $userId = Auth::id();
        if ($userId === null) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }
        // map peut être vide : on ne doit pas lever d'erreur 422 dans ce cas
        $validated = $request->validate(['map' => 'nullable|array']);
        $newMap = $validated['map'] ?? [];
        // Clés et valeurs en string pour cohérence avec le front (courrier.id / folder.id)
        $newMap = array_combine(
            array_map('strval', array_keys($newMap)),
            array_map(fn ($v) => $v === null ? null : (string) $v, $newMap)
        );

        // MERGE avec le mapping existant (au lieu de tout écraser)
        $existing = CourrierFolderMap::find((string) $userId);
        $existingMap = $existing ? ($existing->map ?? []) : [];
        $merged = array_merge($existingMap, $newMap);

        CourrierFolderMap::updateOrCreate(
            ['user_id' => (string) $userId],
            ['map' => $merged]
        );

        $this->clearMapCache($userId);

        Log::info('[Dossiers] saveMap', [
            'userId' => $userId,
            'added' => count($newMap),
            'total' => count($merged),
        ]);

        return response()->json(['data' => ['map' => $merged]]);
    }

    private function clearFolderCache(?string $userId): void
    {
        Cache::forget('folders_all');
        if ($userId) Cache::forget("folders_{$userId}");
    }

    private function clearMapCache(?string $userId): void
    {
        Cache::forget('folder_map_all');
        if ($userId) Cache::forget("folder_map_{$userId}");
    }
}
