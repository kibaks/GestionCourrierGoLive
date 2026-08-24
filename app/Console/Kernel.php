<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    protected function schedule(Schedule $schedule): void
    {
        // Déclencher les rappels de retour workflow arrivés à échéance (toutes les heures)
        $schedule->command('workflow:envoyer-rappels')->hourly();

        // Purger les prévisualisations de scan expirées (C5 — fuite disque), toutes les heures
        $schedule->command('scantemp:purge --hours=1')->hourly();
    }

    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');
    }
}
