<?php

namespace App\Console\Commands;

use App\Models\Courrier;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Attribue tous les courriers au super admin (enregistre_par = premier utilisateur SUPER_ADMIN).
 * Utile après import ou migration pour que tous les courriers soient "reliés" au super admin.
 */
class LinkCourriersToSuperAdmin extends Command
{
    protected $signature = 'courriers:link-to-super-admin
                            {--dry-run : Afficher les changements sans modifier la base}';

    protected $description = 'Attribue tous les courriers au super admin (enregistre_par)';

    public function handle(): int
    {
        $superAdmin = User::where('role', 'SUPER_ADMIN')->first();

        if (!$superAdmin) {
            $this->error('Aucun utilisateur avec le rôle SUPER_ADMIN trouvé.');
            $this->info('Créez un super admin (ex. php artisan db:seed ou Tinker).');
            return self::FAILURE;
        }

        $this->info("Super admin trouvé : {$superAdmin->name} ({$superAdmin->email}), id = {$superAdmin->id}");

        $query = Courrier::query();
        $total = $query->count();

        if ($total === 0) {
            $this->warn('Aucun courrier en base.');
            return self::SUCCESS;
        }

        $dryRun = $this->option('dry-run');

        if ($dryRun) {
            $this->info("[DRY-RUN] {$total} courrier(s) seraient mis à jour avec enregistre_par = {$superAdmin->id}");
            return self::SUCCESS;
        }

        $updated = Courrier::query()->update(['enregistre_par' => $superAdmin->id]);

        $this->info("{$updated} courrier(s) relié(s) au super admin.");
        return self::SUCCESS;
    }
}
