<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ScanPreview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Prévisualisation des documents scannés : stockage temporaire dans l'API
 * pour que la prévisualisation utilise le même mécanisme que la lecture des PDF (récupération depuis l'API).
 *
 * POST /api/scan-preview — upload d'un fichier scanné (multipart), stockage sous storage/app/scan-preview/
 * GET  /api/scan-preview/{previewId} — téléchargement (stream) pour affichage — PROPRIÉTAIRE UNIQUEMENT
 * DELETE /api/scan-preview/{previewId} — suppression (nettoyage) — PROPRIÉTAIRE UNIQUEMENT
 *
 * Sécurité (C5) :
 *  - propriété : seule la personne qui a créé la preview peut la lire/supprimer ;
 *  - whitelist d'extensions (pas de .html/.svg/.js/.php/...) ;
 *  - en-têtes anti-XSS : Content-Type forcé + X-Content-Type-Options: nosniff ;
 *  - expiration : les previews de plus d'1 heure sont purgées (à la création + commande scantemp:purge).
 */
class ScanPreviewController extends Controller
{
    private const DISK = 'local';
    private const PREFIX = 'scan-preview/';
    private const MAX_SIZE_KB = 50 * 1024; // 50 Mo max pour la prévisualisation
    private const TTL_HOURS = 1; // expiration après 1 heure

    /** Extensions acceptées pour une prévisualisation de scan. */
    private const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'webp', 'gif'];

    /** Extensions dangereuses : même si une fuite survient, service en téléchargement, jamais en ligne. */
    private const DANGEROUS_EXTENSIONS = ['html', 'htm', 'svg', 'js', 'mjs', 'php', 'phtml', 'asp', 'aspx', 'exe', 'bat', 'sh', 'cmd', 'jar', 'hta'];

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

        // Sécurité (C5) : whitelist d'extensions stricte.
        $ext = strtolower($file->getClientOriginalExtension() ?: $file->guessExtension() ?: '');
        if ($ext === '' || !in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
            return response()->json([
                'message' => 'Format non autorisé pour la prévisualisation.',
                'errors' => ['file' => ['Formats acceptés : ' . implode(', ', self::ALLOWED_EXTENSIONS) . '.']],
            ], 422);
        }

        // Nettoyage opportuniste des previews expirées (back-up du scheduler).
        $this->purgeExpired();

        $previewId = Str::uuid()->toString() . '.' . $ext;

        Storage::disk(self::DISK)->putFileAs(self::PREFIX, $file, $previewId);
        ScanPreview::create([
            'preview_id' => $previewId,
            'created_by' => (string) Auth::user()->id,
            'file_path' => self::PREFIX . $previewId,
        ]);

        return response()->json([
            'data' => [
                'previewId' => $previewId,
            ],
        ], 201);
    }

    public function show(string $previewId): StreamedResponse|JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }

        $previewId = basename($previewId);
        if (str_contains($previewId, '..') || $previewId === '' || $previewId === '.' ) {
            return response()->json(['message' => 'Identifiant invalide'], 400);
        }

        // Sécurité (C5) : propriété — seul le créateur peut consulter la preview.
        $record = ScanPreview::where('preview_id', $previewId)->first();
        if (!$record) {
            return response()->json(['message' => 'Prévisualisation introuvable ou expirée'], 404);
        }
        if ((string) $record->created_by !== (string) $user->id) {
            Log::warning('ScanPreviewController::show — accès refusé (propriété)', [
                'previewId' => $previewId,
                'owner' => $record->created_by,
                'user' => $user->id,
            ]);
            return response()->json(['message' => 'Accès non autorisé à cette prévisualisation.'], 403);
        }

        $path = self::PREFIX . $previewId;
        if (!Storage::disk(self::DISK)->exists($path)) {
            return response()->json(['message' => 'Prévisualisation introuvable ou expirée'], 404);
        }

        $ext = strtolower(pathinfo($previewId, PATHINFO_EXTENSION));
        $headers = ['X-Content-Type-Options' => 'nosniff'];

        if (in_array($ext, self::DANGEROUS_EXTENSIONS, true)) {
            // Ne jamais servir un contenu potentiellement exécutable en ligne.
            $headers['Content-Type'] = 'application/octet-stream';
            $headers['Content-Disposition'] = 'attachment; filename="' . $previewId . '"';
        } else {
            $mime = Storage::disk(self::DISK)->mimeType($path) ?: 'application/octet-stream';
            // Même en ligne : interdire au navigateur de deviner un autre type.
            if (str_starts_with($mime, 'text/html') || str_starts_with($mime, 'image/svg')) {
                $headers['Content-Type'] = 'application/octet-stream';
                $headers['Content-Disposition'] = 'attachment; filename="' . $previewId . '"';
            } else {
                $headers['Content-Type'] = $mime;
                $headers['Content-Disposition'] = 'inline; filename="' . $previewId . '"';
            }
        }

        return Storage::disk(self::DISK)->response($path, $previewId, $headers);
    }

    public function destroy(string $previewId): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Non authentifié'], 401);
        }

        $previewId = basename($previewId);
        if (str_contains($previewId, '..') || $previewId === '' || $previewId === '.') {
            return response()->json(['message' => 'Identifiant invalide'], 400);
        }

        // Sécurité (C5) : propriété — seul le créateur peut supprimer (sauf le fichier expiré, supprimé par tous).
        $record = ScanPreview::where('preview_id', $previewId)->first();
        if ($record && (string) $record->created_by !== (string) $user->id) {
            return response()->json(['message' => 'Accès non autorisé à cette prévisualisation.'], 403);
        }

        $path = self::PREFIX . $previewId;
        $deleted = false;
        if (Storage::disk(self::DISK)->exists($path)) {
            Storage::disk(self::DISK)->delete($path);
            $deleted = true;
        }
        if ($record) {
            $record->delete();
        }

        return response()->json([
            'message' => $deleted ? 'Prévisualisation supprimée' : 'Prévisualisation introuvable ou déjà supprimée',
        ], 200);
    }

    /**
     * Supprime les previews de plus de TTL_HOURS (fichiers + lignes DB + orphelins).
     */
    private function purgeExpired(): void
    {
        try {
            $cutoff = now()->subHours(self::TTL_HOURS);
            $disk = Storage::disk(self::DISK);

            ScanPreview::where('created_at', '<', $cutoff)->each(function ($record) use ($disk) {
                try {
                    $disk->delete($record->file_path);
                } catch (\Throwable) {
                    // fichier déjà absent
                }
                $record->delete();
            });

            // Fichiers orphelins (sans ligne DB, ex. crash du navigateur) plus anciens que le TTL.
            // NB : files() retourne déjà les chemins COMPLETS (préfixe inclus).
            $cutoffTs = $cutoff->timestamp;
            foreach ($disk->files(self::PREFIX) as $fullPath) {
                if ($disk->lastModified($fullPath) < $cutoffTs) {
                    $disk->delete($fullPath);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('ScanPreviewController::purgeExpired — échec', ['error' => $e->getMessage()]);
        }
    }
}
