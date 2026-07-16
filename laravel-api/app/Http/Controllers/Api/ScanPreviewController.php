<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Prévisualisation des documents scannés : stockage temporaire dans l'API
 * pour que la prévisualisation utilise le même mécanisme que la lecture des PDF (récupération depuis l'API).
 *
 * POST /api/scan-preview — upload d'un fichier scanné (multipart), stockage sous storage/app/scan-preview/
 * GET  /api/scan-preview/{previewId} — téléchargement (stream) pour affichage
 * DELETE /api/scan-preview/{previewId} — suppression (nettoyage)
 */
class ScanPreviewController extends Controller
{
    private const DISK = 'local';
    private const PREFIX = 'scan-preview/';
    private const MAX_SIZE_KB = 50 * 1024; // 50 Mo max pour la prévisualisation

    public function store(Request $request): JsonResponse
    {
        if (!Auth::user()) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }

        $request->validate([
            'file' => ['required', 'file', 'max:' . self::MAX_SIZE_KB],
        ], [
            'file.required' => 'Aucun fichier fourni.',
            'file.max' => 'Le fichier ne doit pas dépasser 50 Mo.',
        ]);

        $file = $request->file('file');
        if (!$file || !$file->isValid()) {
            return response()->json(['message' => 'Fichier invalide ou absent.'], 422);
        }

        $ext = $file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'bin';
        $ext = preg_replace('/[^a-z0-9]/i', '', $ext) ?: 'bin';
        $previewId = Str::uuid()->toString() . '.' . strtolower($ext);

        Storage::disk(self::DISK)->putFileAs(self::PREFIX, $file, $previewId);

        return response()->json([
            'data' => [
                'previewId' => $previewId,
            ],
        ], 201);
    }

    public function show(string $previewId): StreamedResponse|JsonResponse
    {
        if (!Auth::user()) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }

        $previewId = basename($previewId);
        if (str_contains($previewId, '..') || $previewId === '') {
            return response()->json(['message' => 'Identifiant invalide'], 400);
        }

        $path = self::PREFIX . $previewId;
        if (!Storage::disk(self::DISK)->exists($path)) {
            return response()->json(['message' => 'Prévisualisation introuvable ou expirée'], 404);
        }

        $mime = Storage::disk(self::DISK)->mimeType($path) ?: 'application/octet-stream';
        return Storage::disk(self::DISK)->response($path, $previewId, [
            'Content-Type' => $mime,
        ]);
    }

    public function destroy(string $previewId): JsonResponse
    {
        if (!Auth::user()) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }

        $previewId = basename($previewId);
        if (str_contains($previewId, '..') || $previewId === '') {
            return response()->json(['message' => 'Identifiant invalide'], 400);
        }

        $path = self::PREFIX . $previewId;
        if (Storage::disk(self::DISK)->exists($path)) {
            Storage::disk(self::DISK)->delete($path);
        }

        return response()->json(['message' => 'Prévisualisation supprimée'], 200);
    }
}
