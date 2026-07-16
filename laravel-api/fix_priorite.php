<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$db = \Illuminate\Support\Facades\DB::class;

$all = \Illuminate\Support\Facades\DB::table('courriers')->select('id', 'numero', 'priorite', 'extra_fields')->get();

$updated = 0;
$skipped = 0;

foreach ($all as $c) {
    $fields = json_decode($c->extra_fields, true);
    $niveau = intval($fields['niveau'] ?? 0);

    // Mapper le niveau vers la priorité
    if ($niveau <= 0) {
        $priorite = 'BASSE';
    } elseif ($niveau === 1) {
        $priorite = 'NORMALE';
    } elseif ($niveau === 2) {
        $priorite = 'HAUTE';
    } else {
        // niveau >= 3
        $priorite = 'URGENTE';
    }

    // Mettre à jour seulement si différent
    if ($c->priorite !== $priorite) {
        \Illuminate\Support\Facades\DB::table('courriers')
            ->where('id', $c->id)
            ->update(['priorite' => $priorite]);
        echo "✅ " . $c->numero . " : " . $c->priorite . " → " . $priorite . " (niveau=" . $niveau . ")" . PHP_EOL;
        $updated++;
    } else {
        $skipped++;
    }
}

echo PHP_EOL . "=== Résumé ===" . PHP_EOL;
echo "Mis à jour : $updated courriers" . PHP_EOL;
echo "Inchangés  : $skipped courriers" . PHP_EOL;

// Vérification finale
echo PHP_EOL . "=== Répartition finale ===" . PHP_EOL;
$stats = \Illuminate\Support\Facades\DB::table('courriers')
    ->select('priorite', \Illuminate\Support\Facades\DB::raw('count(*) as total'))
    ->groupBy('priorite')
    ->get();
foreach ($stats as $s) {
    echo "  " . $s->priorite . " : " . $s->total . PHP_EOL;
}