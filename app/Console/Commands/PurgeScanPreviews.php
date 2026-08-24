<?php

namespace App\Console\Commands;

use App\Models\ScanPreview;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Purge des prévisualisations de scan expirées (C5 — fuite disque).
 * Complète le nettoyage opportuniste fait à chaque upload (ScanPreviewController::purgeExpired).
 */
class PurgeScanPreviews extends Command
{
    protected $signature = 'scantemp:purge {--hours=1}';

    protected $description = 'Supprime les previews de scan plus anciennes que --hours (défaut 1 h) : fichiers + métadonnées + orphelins';

    public function handle(): int
    {
        $hours = max(1, (int) $this->option('hours'));
        $cutoff = now()->subHours($hours);
        $disk = Storage::disk('local');
        $prefix = 'scan-preview/';

        $expired = ScanPreview::where('created_at', '<', $cutoff)->get();
        foreach ($expired as $record) {
            try {
                $disk->delete($record->file_path);
            } catch (\Throwable) {
                // fichier déjà absent
            }
            $record->delete();
        }

        $orphans = 0;
        $cutoffTs = $cutoff->timestamp;
        foreach ($disk->files($prefix) as $fullPath) {
            // NB : files() retourne déjà les chemins COMPLETS (préfixe inclus).
            if ($disk->lastModified($fullPath) < $cutoffTs) {
                $disk->delete($fullPath);
                $orphans++;
            }
        }

        $message = "scantemp:purge — {$expired->count()} preview(s) expirée(s), {$orphans} fichier(s) orphelin(s) supprimé(s).";
        Log::info($message);
        $this->info($message);

        return self::SUCCESS;
    }
}
