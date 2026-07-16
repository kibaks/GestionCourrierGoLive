<?php

namespace Database\Seeders;

use App\Models\Courrier;
use App\Models\CourrierFolder;
use App\Models\CourrierFolderMap;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Crée les catégories du site officiel ARMP RDC (onglet Documentation et publications)
 * et classe les courriers existants dans ces catégories.
 */
class CourrierCategorizationSeeder extends Seeder
{
    /**
     * Catégories officielles du site ARMP RDC (armp-rdc.cd), onglet publications.
     */
    private const CATEGORIES = [
        ['name' => 'Décision d\'approbation', 'color' => '#1d4ed8'],
        ['name' => 'Décisions du CRD', 'color' => '#1e40af'],
        ['name' => 'Documentation', 'color' => '#059669'],
        ['name' => 'Documents standards', 'color' => '#047857'],
        ['name' => 'Edits provinciaux', 'color' => '#7c2d12'],
        ['name' => 'Formations des Acteurs', 'color' => '#c2410c'],
        ['name' => 'Lois', 'color' => '#b91c1c'],
        ['name' => 'Plans de passation des marchés', 'color' => '#0e7490'],
        ['name' => 'PPM des provinces', 'color' => '#0891b2'],
        ['name' => 'PPM niveau central', 'color' => '#2563eb'],
        ['name' => 'Publications', 'color' => '#7c3aed'],
        ['name' => 'Rapports annuels ARMP', 'color' => '#4338ca'],
        ['name' => 'Rapports et procès verbaux des marchés publics', 'color' => '#9333ea'],
        ['name' => 'Règlements', 'color' => '#374151'],
    ];

    public function run(): void
    {
        $admin = User::where('role', 'SUPER_ADMIN')->first()
            ?? User::where('role', 'DIRECTEUR_GENERAL')->first()
            ?? User::where('email', 'admin@example.com')->first();

        if (!$admin) {
            $this->command->warn('Aucun utilisateur admin trouvé. Exécutez d\'abord DatabaseSeeder.');
            return;
        }

        $totalCourriers = Courrier::count();
        if ($totalCourriers === 0) {
            $this->command->warn('Aucun courrier trouvé. Exécutez d\'abord CourrierSeeder.');
            return;
        }

        $this->command->info("Catégorisation de {$totalCourriers} courriers selon les catégories du site ARMP RDC...");

        // Supprimer les anciennes catégories générées par ce seeder pour l'admin
        $oldFolderIds = CourrierFolder::where('user_id', $admin->id)
            ->where('visibility', 'dg')
            ->pluck('id')
            ->all();

        if (!empty($oldFolderIds)) {
            CourrierFolder::whereIn('id', $oldFolderIds)->delete();
            $this->command->info('Anciennes catégories supprimées : ' . count($oldFolderIds));
        }

        // Créer les 14 catégories (visibilité DG, attachées à l'admin)
        $folders = [];
        foreach (self::CATEGORIES as $category) {
            $folder = CourrierFolder::create([
                'id' => (string) Str::uuid(),
                'name' => $category['name'],
                'parent_id' => null,
                'user_id' => $admin->id,
                'color' => $category['color'],
                'visibility' => 'dg',
                'direction' => $admin->direction,
                'service' => $admin->service,
            ]);
            $folders[] = $folder;
        }

        $folderCount = count($folders);

        // Index par nom pour faciliter la recherche
        $folderByName = [];
        foreach ($folders as $idx => $folder) {
            $folderByName[$folder->name] = $idx;
        }

        // Construire le mapping courrier -> folder
        $map = [];
        Courrier::select('id', 'type', 'sens', 'objet')->chunk(200, function ($courriers) use ($folders, $folderCount, $folderByName, &$map) {
            foreach ($courriers as $courrier) {
                $objetLower = mb_strtolower((string) $courrier->objet);
                $index = null;

                // Répartition par mots-clés dans l'objet
                if (str_contains($objetLower, 'approbation') || str_contains($objetLower, 'approuv')) {
                    $index = $folderByName["Décision d'approbation"] ?? 0;
                } elseif (str_contains($objetLower, 'crd') || str_contains($objetLower, 'conseil de régulation') || str_contains($objetLower, 'discipline')) {
                    $index = $folderByName['Décisions du CRD'] ?? 1;
                } elseif (str_contains($objetLower, 'loi') || str_contains($objetLower, 'décret') || str_contains($objetLower, 'ordonnance')) {
                    $index = $folderByName['Lois'] ?? 6;
                } elseif (str_contains($objetLower, 'règlement') || str_contains($objetLower, 'modalité') || str_contains($objetLower, 'instruction')) {
                    $index = $folderByName['Règlements'] ?? 13;
                } elseif (str_contains($objetLower, 'formation') || str_contains($objetLower, 'atelier') || str_contains($objetLower, 'renforcement') || str_contains($objetLower, 'capacité')) {
                    $index = $folderByName['Formations des Acteurs'] ?? 5;
                } elseif (str_contains($objetLower, 'rapport annuel') || str_contains($objetLower, 'annuel')) {
                    $index = $folderByName['Rapports annuels ARMP'] ?? 11;
                } elseif (str_contains($objetLower, 'rapport') || str_contains($objetLower, 'procès-verbal') || str_contains($objetLower, 'pv') || str_contains($objetLower, 'marché public')) {
                    $index = $folderByName['Rapports et procès verbaux des marchés publics'] ?? 12;
                } elseif (str_contains($objetLower, 'document standard') || str_contains($objetLower, 'cctp') || str_contains($objetLower, 'rc') || str_contains($objetLower, 'dce') || str_contains($objetLower, 'dossier')) {
                    $index = $folderByName['Documents standards'] ?? 3;
                } elseif (str_contains($objetLower, 'édit') || str_contains($objetLower, 'provincial') || str_contains($objetLower, 'gouverneur')) {
                    $index = $folderByName['Edits provinciaux'] ?? 4;
                } elseif (str_contains($objetLower, 'ppm des provinces') || str_contains($objetLower, 'province')) {
                    $index = $folderByName['PPM des provinces'] ?? 8;
                } elseif (str_contains($objetLower, 'ppm niveau central') || str_contains($objetLower, 'central') || str_contains($objetLower, 'ministère') || str_contains($objetLower, 'primature')) {
                    $index = $folderByName['PPM niveau central'] ?? 9;
                } elseif (str_contains($objetLower, 'plan de passation') || str_contains($objetLower, 'ppm') || str_contains($objetLower, 'programme') || str_contains($objetLower, 'passation')) {
                    $index = $folderByName['Plans de passation des marchés'] ?? 7;
                } elseif (str_contains($objetLower, 'publication') || str_contains($objetLower, 'communiqué') || str_contains($objetLower, 'annonce')) {
                    $index = $folderByName['Publications'] ?? 10;
                } elseif (str_contains($objetLower, 'documentation') || str_contains($objetLower, 'note') || str_contains($objetLower, 'guide')) {
                    $index = $folderByName['Documentation'] ?? 2;
                }

                // Fallback : répartition équilibrée selon sens/type
                if ($index === null) {
                    if ($courrier->sens === 'ENTRANT' && $courrier->type === 'EXTERNE') $index = 0;
                    elseif ($courrier->sens === 'ENTRANT' && $courrier->type === 'INTERNE') $index = 1;
                    elseif ($courrier->sens === 'SORTANT' && $courrier->type === 'EXTERNE') $index = 2;
                    else $index = 3;
                }

                // Légère variation aléatoire pour diversifier
                if (rand(1, 100) <= 10) {
                    $index = rand(0, $folderCount - 1);
                }

                $map[(string) $courrier->id] = $folders[$index]->id;
            }
        });

        // Sauvegarder le mapping pour l'admin (visible par tous les admins via folder_map_all)
        CourrierFolderMap::updateOrCreate(
            ['user_id' => (string) $admin->id],
            ['map' => $map]
        );

        // Vider les caches liés aux dossiers/mapping
        Cache::forget('folder_map_all');
        Cache::forget('folders_all');
        Cache::forget("folders_{$admin->id}");
        Cache::forget("folder_map_{$admin->id}");

        $this->command->info('Catégories créées : ' . $folderCount);
        $this->command->info("Courriers catégorisés : " . count($map));
    }
}
