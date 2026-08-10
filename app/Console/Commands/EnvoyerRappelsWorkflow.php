<?php

namespace App\Console\Commands;

use App\Models\Notification;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Commande planifiée : déclencher les rappels workflow arrivés à échéance.
 *
 * Les rappels sont des notifications de type 'rappel' avec metadata.scheduledAt
 * indiquant la date à partir de laquelle elles doivent être visibles/actives.
 * Cette commande remet leur created_at à maintenant pour qu'elles remontent
 * dans la liste des notifications non lues de l'utilisateur concerné.
 *
 * Planification : toutes les heures (voir Kernel.php)
 */
class EnvoyerRappelsWorkflow extends Command
{
    protected $signature   = 'workflow:envoyer-rappels';
    protected $description = 'Déclenche les rappels de retour workflow arrivés à échéance';

    public function handle(): int
    {
        $now = Carbon::now();

        // Chercher toutes les notifications rappel dont scheduledAt est dépassé
        // et qui n'ont pas encore été "déclenchées" (sent = false dans metadata)
        $rappels = Notification::where('type', 'rappel')
            ->where('read', false)
            ->get()
            ->filter(function (Notification $n) use ($now) {
                $meta = $n->metadata ?? [];
                if (empty($meta['scheduledAt'])) return false;
                if (!empty($meta['sent'])) return false;
                return Carbon::parse($meta['scheduledAt'])->lte($now);
            });

        $count = 0;
        foreach ($rappels as $rappel) {
            // Marquer comme envoyé dans metadata et remettre created_at à maintenant
            // pour qu'elle remonte en tête de liste
            $meta          = $rappel->metadata ?? [];
            $meta['sent']  = true;
            $meta['sentAt'] = $now->toIso8601String();

            $rappel->update([
                'metadata'   => $meta,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $count++;
        }

        $this->info("Rappels workflow déclenchés : {$count}");
        return Command::SUCCESS;
    }
}
