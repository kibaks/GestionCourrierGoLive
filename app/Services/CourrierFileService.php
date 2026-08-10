<?php

namespace App\Services;

use App\Models\Config;
use App\Models\Courrier;
use App\Models\CourrierFichier;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class CourrierFileService
{
    private const DISK_COURRIER = 'courrier_fichiers';

    /**
     * Inspecte la requête pour tout fichier attaché (UploadedFile, tableau de fichiers, ou base64)
     * et l'enregistre dans storage/app/courriers/{courrierId}/fichiers ainsi que dans la table courrier_fichiers.
     *
     * @return CourrierFichier[] Liste des fichiers créés
     */
    public function handleRequestFiles(Request $request, Courrier $courrier, string $userId): array
    {
        $createdFiles = [];

        // 1. Collecter tous les UploadedFile présents dans la requête
        $uploadedFiles = $this->extractUploadedFiles($request);

        // 2. Récupérer les fichiers scannés (scan-preview) ou fichiers temporaires référencés
        $tempUploadedFiles = $this->extractTempFiles($request);
        $uploadedFiles = array_merge($uploadedFiles, $tempUploadedFiles);

        foreach ($uploadedFiles as $file) {
            if ($file instanceof UploadedFile && $file->isValid()) {
                $saved = $this->saveUploadedFile($file, $courrier->id, $userId);
                if ($saved) {
                    $createdFiles[] = $saved;
                }
            }
        }

        // 3. Traiter les fichiers envoyés en Base64 (ex: JSON body)
        $base64Files = $this->extractBase64Files($request);
        foreach ($base64Files as $b64) {
            $saved = $this->saveBase64File($b64['base64'], $b64['name'], $courrier->id, $userId);
            if ($saved) {
                $createdFiles[] = $saved;
            }
        }

        // 4. Si un/des fichier(s) ont été créés et que $courrier->fichier n'est pas encore défini
        if (!empty($createdFiles) && empty($courrier->fichier)) {
            $firstFile = $createdFiles[0];
            $courrier->fichier = $firstFile->chemin;
            $courrier->save();
        }

        return $createdFiles;
    }

    /**
     * Extrait tous les UploadedFile de la requête (file, fichier, files, fichiers, attachments).
     *
     * @return UploadedFile[]
     */
    private function extractUploadedFiles(Request $request): array
    {
        $files = [];

        $keys = ['file', 'fichier', 'files', 'fichiers', 'attachments', 'document', 'documents'];

        foreach ($keys as $key) {
            if ($request->hasFile($key)) {
                $fileInput = $request->file($key);
                if (is_array($fileInput)) {
                    foreach ($fileInput as $f) {
                        if ($f instanceof UploadedFile) {
                            $files[] = $f;
                        }
                    }
                } elseif ($fileInput instanceof UploadedFile) {
                    $files[] = $fileInput;
                }
            }
        }

        return $files;
    }

    /**
     * Extrait et résout les identifiants de prévisualisation scannée (previewId, scanPreviewId)
     * ou les fichiers temporaires référencés par chaîne de caractères.
     *
     * @return UploadedFile[]
     */
    private function extractTempFiles(Request $request): array
    {
        $tempFiles = [];
        $candidateStrings = [];

        // Identifiants de prévisualisation / scan
        foreach (['previewId', 'scanPreviewId', 'scannedFileId', 'tempFileId'] as $key) {
            if ($request->filled($key)) {
                $candidateStrings[] = $request->input($key);
            }
        }

        // Champ fichier s'il est transmis sous forme de chaîne (chemin / identifiant)
        if (is_string($request->input('fichier')) && !empty($request->input('fichier'))) {
            $candidateStrings[] = $request->input('fichier');
        }

        // Dans extraFields
        $extra = $request->input('extraFields');
        if (is_array($extra)) {
            foreach (['previewId', 'scanPreviewId', 'scannedFile', 'tempFile', 'fichier'] as $key) {
                if (!empty($extra[$key]) && is_string($extra[$key])) {
                    $candidateStrings[] = $extra[$key];
                }
            }
        }

        $processedPaths = [];

        foreach ($candidateStrings as $str) {
            $str = trim((string) $str);
            if ($str === '' || str_starts_with($str, 'data:')) continue;

            $basename = basename(parse_url($str, PHP_URL_PATH) ?? $str);

            $possiblePaths = [
                storage_path('app/scan-preview/' . $basename),
                storage_path('app/scan-preview/' . $str),
                storage_path('app/upload_tmp/' . $basename),
                storage_path('app/upload_tmp/' . $str),
                storage_path('app/' . ltrim($str, '/')),
            ];

            foreach ($possiblePaths as $path) {
                if (File::isFile($path) && !in_array($path, $processedPaths, true)) {
                    $processedPaths[] = $path;
                    $mimeType = File::mimeType($path) ?: 'application/pdf';
                    $tempFiles[] = new UploadedFile(
                        $path,
                        $basename,
                        $mimeType,
                        \UPLOAD_ERR_OK,
                        true
                    );
                    break;
                }
            }
        }

        return $tempFiles;
    }

    /**
     * Extrait les données base64 si présentes.
     */
    private function extractBase64Files(Request $request): array
    {
        $b64List = [];

        // Single fileBase64 / fileName
        if ($request->filled('fileBase64') && $request->filled('fileName')) {
            $b64List[] = [
                'base64' => $request->input('fileBase64'),
                'name' => $request->input('fileName'),
            ];
        }

        // Single fichierBase64 / fichierNom
        if ($request->filled('fichierBase64') && $request->filled('fichierNom')) {
            $b64List[] = [
                'base64' => $request->input('fichierBase64'),
                'name' => $request->input('fichierNom'),
            ];
        }

        // Array of filesBase64
        if ($request->has('filesBase64') && is_array($request->input('filesBase64'))) {
            foreach ($request->input('filesBase64') as $item) {
                if (is_array($item)) {
                    $b64 = $item['fileBase64'] ?? $item['base64'] ?? null;
                    $name = $item['fileName'] ?? $item['name'] ?? 'document.pdf';
                    if ($b64) {
                        $b64List[] = ['base64' => $b64, 'name' => $name];
                    }
                }
            }
        }

        // Check inside extraFields
        $extra = $request->input('extraFields');
        if (is_array($extra)) {
            if (!empty($extra['fileBase64']) && !empty($extra['fileName'])) {
                $b64List[] = ['base64' => $extra['fileBase64'], 'name' => $extra['fileName']];
            }
        }

        return $b64List;
    }

    /**
     * Sauvegarde un UploadedFile et crée l'enregistrement CourrierFichier.
     */
    public function saveUploadedFile(UploadedFile $file, string $courrierId, string $userId): ?CourrierFichier
    {
        $nom = $file->getClientOriginalName() ?: 'sans-nom';
        $extension = $file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'bin';
        $dir = $courrierId . '/fichiers';

        $baseName = pathinfo($nom, PATHINFO_FILENAME);
        $safeBase = $baseName !== '' ? Str::slug(mb_substr($baseName, 0, 100)) : 'fichier';
        $filename = Str::uuid()->toString() . '_' . $safeBase . '.' . $extension;
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
                Log::error('CourrierFileService::saveUploadedFile failed', [
                    'courrierId' => $courrierId,
                    'dir' => $dir,
                    'filename' => $filename,
                ]);
                return null;
            }

            $relativePath = str_replace('\\', '/', $relativePath);
            $fileSize = $file->getSize();

            return CourrierFichier::create([
                'nom' => $nom,
                'type' => 'fichier',
                'courrier_id' => $courrierId,
                'parent_id' => null,
                'chemin' => $relativePath,
                'extension' => $extension,
                'taille' => is_numeric($fileSize) ? (int) $fileSize : 0,
                'est_accuse_reception' => false,
                'cree_par' => $userId,
            ]);
        } catch (Throwable $e) {
            Log::error('CourrierFileService::saveUploadedFile exception', [
                'courrierId' => $courrierId,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Sauvegarde une chaîne base64 et crée l'enregistrement CourrierFichier.
     */
    public function saveBase64File(string $base64Data, string $fileName, string $courrierId, string $userId): ?CourrierFichier
    {
        // Nettoyer prefix data:image/png;base64, si présent
        if (preg_match('/^data:([^;]+);base64,(.*)$/', $base64Data, $matches)) {
            $base64Data = $matches[2];
        }

        $raw = base64_decode($base64Data, true);
        if ($raw === false) {
            Log::warning('CourrierFileService::saveBase64File — base64 invalide');
            return null;
        }

        $tmpDir = storage_path('app/upload_tmp');
        if (!File::isDirectory($tmpDir)) {
            File::makeDirectory($tmpDir, 0755, true);
        }

        $safeName = trim($fileName) !== '' ? $fileName : 'fichier.bin';
        $tmpPath = $tmpDir . '/' . Str::uuid()->toString() . '_' . basename($safeName);

        if (file_put_contents($tmpPath, $raw) === false) {
            Log::error('CourrierFileService::saveBase64File — impossible de créer tmpPath', ['path' => $tmpPath]);
            return null;
        }

        try {
            $mimeType = File::mimeType($tmpPath) ?: 'application/octet-stream';
            $uploadedFile = new UploadedFile($tmpPath, $safeName, $mimeType, \UPLOAD_ERR_OK, true);
            return $this->saveUploadedFile($uploadedFile, $courrierId, $userId);
        } finally {
            @unlink($tmpPath);
        }
    }
}
