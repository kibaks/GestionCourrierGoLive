<?php
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
set_exception_handler(function (Throwable $e) { fwrite(STDERR, (string)$e); exit(1); });
if (!str_ends_with(config('database.connections.mysql.database'), '_test')) throw new RuntimeException('Test database required');
use Illuminate\Support\Facades\DB;
$id='a1111111-1111-4111-8111-111111111111';
if (($argv[1] ?? '') === 'prepare') {
    DB::table('courriers')->insert(['id'=>$id,'numero'=>'EXT-2026-0876','type'=>'EXTERNE','date_reception'=>'2026-10-01',
        'date_enregistrement'=>'2026-10-01 12:00:00','expediteur'=>'Historique','destinataire'=>'Historique','objet'=>'Migration historique',
        'priorite'=>'NORMALE','statut'=>'ENREGISTRE','enregistre_par'=>'historique','created_at'=>now(),'updated_at'=>now()]);
    echo "Historical fixture prepared\n";
} else {
    $c=DB::table('courriers')->where('id',$id)->first();
    if ($c->numero !== 'EXT-2026-0876' || $c->numero_organisationnel !== null) throw new RuntimeException('Historical reference modified');
    if (!DB::table('numbering_issues')->where('courrier_id',$id)->where('kind','system')->where('number','EXT-2026-0876')->exists()) throw new RuntimeException('Missing historical ledger entry');
    echo "PASS migration preserves old references and backfills issue ledger\n";
}
