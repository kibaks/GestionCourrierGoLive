<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Config;
use App\Models\Courrier;
use App\Models\CourrierFichier;
use App\Services\CourrierAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class CourrierFichierController extends Controller
{
    /** Disque dédié : root = storage/app/courriers, chemins = {courrierId}/fichiers/{filename} */
    private const DISK_COURRIER = 'courrier_fichiers';
    /** Ancien disque pour rétrocompatibilité (chemins courriers/xxx/fichiers/yyy) */
    private const DISK_LOCAL = 'local';

    /** Quota affiché pour le stockage (1 Go) — utilisé par le tableau de bord. */
    private const STORAGE_QUOTA_BYTES = 1073741824;

    public function __construct(
        private CourrierAccessService $accessService
    ) {}

    /**
     * Limites d'import de fichiers (taille max, compression) — pour tout utilisateur authentifié.
     * GET /api/parametres/import-fichiers
     */
    public function importLimits(): JsonResponse
    {
        $config = Config::getValue('courrier_fichier', ['maxSizeMo' => 100, 'compressImages' => true]);
        return response()->json([
            'data' => [
                'maxSizeMo' => isset($config['maxSizeMo']) && is_numeric($config['maxSizeMo']) ? (int) $config['maxSizeMo'] : 100,
                'compressImages' => (bool) ($config['compressImages'] ?? true),
            ],
        ]);
    }

    /**
     * Statistiques de stockage des fichiers (courriers accessibles à l'utilisateur).
     * GET /api/storage-stats
     */
    public function storageStats(): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }
        $courrierIds = $this->accessService->getAccessibleCourriersQuery($user)->pluck('id');

        $totalFiles = CourrierFichier::where('type', 'fichier')
            ->whereIn('courrier_id', $courrierIds)
            ->count();
        $totalSize = (int) CourrierFichier::where('type', 'fichier')
            ->whereIn('courrier_id', $courrierIds)
            ->sum('taille');

        $byExtension = CourrierFichier::where('type', 'fichier')
            ->whereIn('courrier_id', $courrierIds)
            ->selectRaw("COALESCE(LOWER(TRIM(extension)), 'autre') as ext, count(*) as count, COALESCE(SUM(taille), 0) as size")
            ->groupByRaw("COALESCE(LOWER(TRIM(extension)), 'autre')")
            ->orderByDesc('size')
            ->get()
            ->map(fn ($row) => [
                'extension' => $row->ext,
                'count' => (int) $row->count,
                'size' => (int) $row->size,
            ])
            ->values()
            ->toArray();

        return response()->json([
            'data' => [
                'totalFiles' => $totalFiles,
                'totalSize' => $totalSize,
                'quota' => self::STORAGE_QUOTA_BYTES,
                'byExtension' => $byExtension,
            ],
        ]);
    }

    /**
     * Liste des dossiers/fichiers d'un courrier (accès selon permissions).
     * GET /api/courriers/{courrierId}/fichiers
     * Si le courrier n'existe pas en MySQL (ex: ID Firestore), retourne 200 avec liste vide pour que le front puisse utiliser Firestore/IndexedDB.
     */
    public function index(string $courrierId): JsonResponse
    {
        $courrier = Courrier::find($courrierId);
        if (!$courrier) {
            return response()->json(['data' => []]);
        }
        $user = Auth::user();
        if (!$user || !$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }
        $items = CourrierFichier::where('courrier_id', $courrierId)->orderBy('type')->orderBy('nom')->get();
        return response()->json(['data' => $items->map(fn (CourrierFichier $f) => $f->toArray())]);
    }

    /**
     * Créer un dossier ou importer un fichier.
     * POST /api/courriers/{courrierId}/fichiers
     * - Si "file" présent (multipart) : import du fichier
     * - Sinon body JSON { "nom": "...", "type": "dossier", "parentId": "..." } pour créer un dossier
     */
    public function store(Request $request, $courrierId): JsonResponse
    {
        $courrierIdStr = $courrierId !== null && $courrierId !== '' ? (string) $courrierId : '';
        if ($courrierIdStr === '') {
            return response()->json(['message' => 'Identifiant du courrier manquant.'], 400);
        }
        try {
            $courrierId = $courrierIdStr;

            $courrier = Courrier::find($courrierId);
            if (!$courrier) {
                return response()->json(['message' => 'Courrier introuvable'], 404);
            }
            $user = Auth::user();
            if (!$user || !$this->accessService->canViewCourrier($user, $courrier)) {
                return response()->json(['message' => 'Accès non autorisé'], 403);
            }
            $userId = trim((string) ($request->input('creePar') ?? $user->id ?? ''));
            if ($userId === '') {
                $userId = 'system';
            }

            if ($request->hasFile('file')) {
                return $this->uploadFile($request, $courrierId, $userId);
            }

            // Upload en base64 (contourne l'erreur PHP "unable to create a temporary file" quand upload_tmp_dir est injoignable)
            if ($request->isJson() && $request->has('fileBase64') && $request->has('fileName')) {
                return $this->uploadFileFromBase64($request, $courrierId, $userId);
            }

            $validated = $request->validate([
                'nom' => 'required|string|max:255',
                'type' => 'required|in:dossier,fichier',
                'parentId' => 'nullable|uuid',
            ]);
            $parentId = $this->resolveParentId($validated['parentId'] ?? null, $courrierId);

            $item = CourrierFichier::create([
                'nom' => $validated['nom'],
                'type' => $validated['type'],
                'courrier_id' => $courrierId,
                'parent_id' => $parentId,
                'chemin' => null,
                'extension' => null,
                'taille' => null,
                'est_accuse_reception' => $request->boolean('estAccuseReception', false),
                'cree_par' => $userId,
            ]);

            return response()->json(['data' => $item->toArray()], 201);
        } catch (ValidationException $e) {
            try {
                return response()->json([
                    'message' => 'Validation échouée.',
                    'errors' => $e->errors(),
                ], 422);
            } catch (Throwable $_) {
                return response()->json(['message' => 'Validation échouée.'], 422);
            }
        } catch (Throwable $e) {
            Log::error('CourrierFichierController::store', [
                'courrierId' => $courrierIdStr ?? null,
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            $message = config('app.debug')
                ? 'Ajout fichier/dossier : ' . $e->getMessage()
                : 'Impossible d\'ajouter le fichier ou le dossier.';
            return response()->json(['message' => $message], 500);
        }
    }

    /**
     * Upload d'un fichier envoyé en base64 (JSON). Contourne l'erreur PHP "unable to create a temporary file"
     * en écrivant dans storage/app/upload_tmp au lieu du répertoire temporaire système.
     */
    private function uploadFileFromBase64(Request $request, string $courrierId, string $userId): JsonResponse
    {
        $request->validate([
            'fileBase64' => 'required|string',
            'fileName' => 'required|string|max:255',
            'parentId' => 'nullable|uuid',
            'estAccuseReception' => 'nullable|boolean',
        ]);

        $tmpDir = storage_path('app/upload_tmp');
        if (! File::isDirectory($tmpDir)) {
            File::makeDirectory($tmpDir, 0755, true);
        }

        $raw = base64_decode($request->input('fileBase64'), true);
        if ($raw === false) {
            return response()->json(['message' => 'Contenu fichier base64 invalide.'], 422);
        }

        $fileName = $request->input('fileName');
        $safeName = trim($fileName) !== '' ? $fileName : 'sans-nom';
        $tmpPath = $tmpDir . '/' . Str::uuid()->toString() . '_' . basename($safeName);

        if (file_put_contents($tmpPath, $raw) === false) {
            return response()->json(['message' => 'Impossible d\'écrire le fichier temporaire. Vérifiez les droits sur storage/app/upload_tmp.'], 500);
        }

        $importConfig = Config::getValue('courrier_fichier', ['maxSizeMo' => 100]);
        $maxSizeMo = isset($importConfig['maxSizeMo']) && is_numeric($importConfig['maxSizeMo'])
            ? (int) $importConfig['maxSizeMo']
            : 100;
        $maxSizeBytes = $maxSizeMo * 1024 * 1024;
        if (strlen($raw) > $maxSizeBytes) {
            @unlink($tmpPath);
            return response()->json([
                'message' => 'Validation du fichier échouée.',
                'errors' => ['file' => ["Le fichier ne doit pas dépasser {$maxSizeMo} Mo."]],
                'maxSizeMo' => $maxSizeMo,
            ], 422);
        }

        try {
            $mimeType = File::mimeType($tmpPath) ?: 'application/octet-stream';
            $uploadedFile = new UploadedFile($tmpPath, $safeName, $mimeType, \UPLOAD_ERR_OK, true);
            $response = $this->processAndSaveUploadedFile($request, $uploadedFile, $courrierId, $userId);
            return $response;
        } finally {
            @unlink($tmpPath);
        }
    }

    /**
     * Upload d'un fichier : copie dans le répertoire du serveur (storage/app/courriers/{courrierId}/fichiers/).
     * Crée le répertoire racine et le sous-dossier si besoin, normalise les chemins (slash) et gère les erreurs.
     */
    private function uploadFile(Request $request, string $courrierId, string $userId): JsonResponse
    {
        $parentIdInput = $request->input('parentId');
        if ($parentIdInput === '' || $parentIdInput === null) {
            $request->merge(['parentId' => null]);
        }
        $importConfig = Config::getValue('courrier_fichier', ['maxSizeMo' => 100, 'compressImages' => true]);
        $maxSizeMo = isset($importConfig['maxSizeMo']) && is_numeric($importConfig['maxSizeMo'])
            ? (int) $importConfig['maxSizeMo']
            : 100;
        $maxSizeKb = $maxSizeMo * 1024;

        try {
            $request->validate([
                'file' => ['required', 'file', 'max:' . $maxSizeKb],
                'parentId' => 'nullable|uuid',
                'estAccuseReception' => 'nullable|boolean',
            ], [
                'file.max' => "Le fichier ne doit pas dépasser {$maxSizeMo} Mo. Augmentez la limite dans Paramètres > Import de fichiers si besoin.",
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation du fichier échouée.',
                'errors' => $e->errors(),
                'maxSizeMo' => $maxSizeMo,
            ], 422);
        }

        $file = $request->file('file');
        if (!$file || !$file->isValid()) {
            $err = $file ? $file->getErrorMessage() : 'Aucun fichier reçu.';
            return response()->json(['message' => 'Fichier invalide ou absent. ' . $err], 422);
        }

        return $this->processAndSaveUploadedFile($request, $file, $courrierId, $userId);
    }

    /**
     * Enregistre un fichier déjà reçu (multipart ou créé depuis base64) dans storage et en base.
     */
    private function processAndSaveUploadedFile(Request $request, UploadedFile $file, string $courrierId, string $userId): JsonResponse
    {
        $nom = $file->getClientOriginalName();
        if ($nom === null || trim((string) $nom) === '') {
            $nom = 'sans-nom';
        }
        $nom = is_string($nom) ? $nom : 'sans-nom';
        $extension = $file->getClientOriginalExtension();
        if (!$extension || trim($extension) === '') {
            $extension = $file->guessExtension();
        }
        $extension = $extension ? trim((string) $extension) : null;
        $parentId = $this->resolveParentId($request->input('parentId'), $courrierId);

        $dir = $courrierId . '/fichiers';
        $baseName = pathinfo($nom, PATHINFO_FILENAME);
        $safeBase = $baseName !== '' ? Str::slug(mb_substr($baseName, 0, 100)) : 'fichier';
        $extSuffix = $extension ? '.' . $extension : '.bin';
        $filename = Str::uuid()->toString() . '_' . $safeBase . $extSuffix;
        $relativePath = $dir . '/' . $filename;

        try {
            $rootPath = storage_path('app/courriers');
            if (!File::isDirectory($rootPath)) {
                File::makeDirectory($rootPath, 0755, true);
            }
            $fullDir = $rootPath . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $dir);
            if (!File::isDirectory($fullDir)) {
                File::makeDirectory($fullDir, 0755, true);
            }

            $disk = Storage::disk(self::DISK_COURRIER);
            $stored = $disk->putFileAs($dir, $file, $filename);
            if ($stored === false) {
                Log::error('CourrierFichierController::processAndSaveUploadedFile putFileAs failed', ['courrierId' => $courrierId, 'dir' => $dir, 'filename' => $filename]);
                return response()->json([
                    'message' => 'Impossible d\'enregistrer le fichier sur le serveur. Vérifiez les droits sur storage/app/courriers.',
                ], 500);
            }
            $relativePath = str_replace('\\', '/', $relativePath);

            $fileSize = $file->getSize();
            $taille = is_numeric($fileSize) ? (int) $fileSize : 0;

            $item = CourrierFichier::create([
                'nom' => $nom,
                'type' => 'fichier',
                'courrier_id' => $courrierId,
                'parent_id' => $parentId,
                'chemin' => $relativePath,
                'extension' => $extension,
                'taille' => $taille,
                'est_accuse_reception' => $request->boolean('estAccuseReception', false),
                'cree_par' => $userId,
            ]);

            return response()->json(['data' => $item->toArray()], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation échouée.',
                'errors' => $e->errors(),
            ], 422);
        } catch (Throwable $e) {
            Log::error('CourrierFichierController::processAndSaveUploadedFile', [
                'courrierId' => $courrierId,
                'file' => $nom ?? '?',
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            $message = config('app.debug')
                ? 'Stockage fichier : ' . $e->getMessage()
                : 'Impossible de copier le fichier vers le répertoire du serveur. Vérifiez les droits sur storage/app/courriers.';
            return response()->json(['message' => $message], 500);
        }
    }

    /**
     * Retourne le disque et le chemin à utiliser pour un enregistrement fichier (rétrocompatibilité anciens chemins).
     */
    private function diskAndPath(CourrierFichier $item): array
    {
        $chemin = $item->chemin;
        if (!$chemin || str_starts_with($chemin, 'http')) {
            return [null, null];
        }
        // Ancien format : "courriers/xxx/fichiers/yyy" sur disque local
        if (str_starts_with($chemin, 'courriers/')) {
            return [self::DISK_LOCAL, str_replace('\\', '/', $chemin)];
        }
        return [self::DISK_COURRIER, str_replace('\\', '/', $chemin)];
    }

    /**
     * Détail d'un dossier/fichier.
     * GET /api/fichiers/{id}
     */
    public function show(string $id): JsonResponse
    {
        $item = CourrierFichier::findOrFail($id);
        $courrier = $item->courrier;
        $user = Auth::user();
        if (!$user || !$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }
        return response()->json(['data' => $item->toArray()]);
    }

    /**
     * Téléchargement d'un fichier.
     * GET /api/fichiers/{id}/download
     */
    public function download(string $id): StreamedResponse|Response|JsonResponse
    {
        $item = CourrierFichier::findOrFail($id);
        $courrier = $item->courrier;
        $user = Auth::user();
        if (!$user || !$this->accessService->canViewCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }
        if ($item->type !== 'fichier' || !$item->chemin) {
            return response()->json(['message' => 'Ressource non disponible'], 404);
        }
        if (str_starts_with($item->chemin, 'http')) {
            return response()->redirect($item->chemin);
        }
        [$disk, $path] = $this->diskAndPath($item);
        if (!$disk || !$path || !Storage::disk($disk)->exists($path)) {
            return response()->json(['message' => 'Fichier introuvable sur le serveur'], 404);
        }
        return Storage::disk($disk)->download($path, $item->nom);
    }

    /**
     * Mettre à jour (métadonnées ou déplacement).
     * PUT /api/fichiers/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $item = CourrierFichier::findOrFail($id);
        $courrier = $item->courrier;
        $user = Auth::user();
        if (!$user || !$this->accessService->canUpdateCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }
        $validated = $request->validate([
            'nom' => 'sometimes|string|max:255',
            'parentId' => 'nullable|uuid',
            'estAccuseReception' => 'nullable|boolean',
        ]);

        if (isset($validated['nom'])) {
            $item->nom = $validated['nom'];
        }
        if (array_key_exists('parentId', $validated)) {
            $item->parent_id = $this->resolveParentId($validated['parentId'], $item->courrier_id);
        }
        if (array_key_exists('estAccuseReception', $validated)) {
            $item->est_accuse_reception = (bool) $validated['estAccuseReception'];
        }
        $item->save();

        return response()->json(['data' => $item->fresh()->toArray()]);
    }

    /**
     * Supprimer un dossier ou fichier. Même logique que les dossiers de classement : suppression en cascade.
     * Les descendants sont supprimés récursivement (fichiers physiques sur disque + lignes courrier_fichiers).
     * DELETE /api/fichiers/{id}
     */
    public function destroy(string $id): JsonResponse
    {
        $item = CourrierFichier::findOrFail($id);
        $courrier = $item->courrier;
        $user = Auth::user();
        if (!$user || !$this->accessService->canUpdateCourrier($user, $courrier)) {
            return response()->json(['message' => 'Accès non autorisé'], 403);
        }
        if ($item->type === 'fichier' && $item->chemin && !str_starts_with($item->chemin, 'http')) {
            [$disk, $path] = $this->diskAndPath($item);
            if ($disk && $path && Storage::disk($disk)->exists($path)) {
                Storage::disk($disk)->delete($path);
            }
        }
        $this->deleteDescendants($item);
        $item->delete();
        return response()->json(null, 204);
    }

    /**
     * Résout parent_id : si l'UUID existe en base pour ce courrier, le retourner ; sinon null.
     * Permet la migration Firebase (IDs non encore en MySQL) et évite les erreurs d'upload.
     */
    private function resolveParentId(?string $parentId, string $courrierId): ?string
    {
        if (!$parentId || !Str::isUuid($parentId)) {
            return null;
        }
        $exists = CourrierFichier::where('id', $parentId)->where('courrier_id', $courrierId)->exists();
        return $exists ? $parentId : null;
    }

    private function deleteDescendants(CourrierFichier $parent): void
    {
        $children = CourrierFichier::where('parent_id', $parent->id)->get();
        foreach ($children as $child) {
            if ($child->type === 'fichier' && $child->chemin && !str_starts_with($child->chemin, 'http')) {
                [$disk, $path] = $this->diskAndPath($child);
                if ($disk && $path && Storage::disk($disk)->exists($path)) {
                    Storage::disk($disk)->delete($path);
                }
            }
            $this->deleteDescendants($child);
            $child->delete();
        }
    }
}
