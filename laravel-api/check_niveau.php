<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$all = \Illuminate\Support\Facades\DB::table('courriers')->select('id', 'numero', 'priorite', 'extra_fields')->get();

$niveaux = [];
foreach ($all as $c) {
    $fields = json_decode($c->extra_fields, true);
    $niveau = $fields['niveau'] ?? 'N/A';
    $niveaux[$niveau] = ($niveaux[$niveau] ?? 0) + 1;
}

echo "Répartition par niveau dans extra_fields:" . PHP_EOL;
foreach ($niveaux as $n => $count) {
    echo "  niveau=$n : $count courriers" . PHP_EOL;
}

echo PHP_EOL . "Exemples de courriers avec niveau >= 3:" . PHP_EOL;
$count = 0;
foreach ($all as $c) {
    $fields = json_decode($c->extra_fields, true);
    $niveau = intval($fields['niveau'] ?? 0);
    if ($niveau >= 3) {
        echo $c->numero . ' | priorite=' . $c->priorite . ' | niveau=' . $niveau . PHP_EOL;
        if (++$count >= 10) break;
    }
}