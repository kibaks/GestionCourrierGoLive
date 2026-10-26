<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('entites_organisationnelles', function (Blueprint $t) {
            $t->string('code', 40)->nullable()->unique();
        });
        Schema::table('courriers', function (Blueprint $t) {
            $t->string('numero_organisationnel', 191)->nullable()->unique();
            $t->uuid('entite_numerotation_id')->nullable()->index();
            $t->json('numerotation_snapshot')->nullable();
        });
        Schema::create('numbering_versions', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->json('settings');
            $t->uuid('created_by')->nullable();
            $t->timestamp('created_at');
        });
        Schema::create('numbering_state', function (Blueprint $t) {
            $t->unsignedInteger('id')->primary();
            $t->unsignedBigInteger('version_id')->nullable();
        });
        DB::table('numbering_state')->insert(['id' => 1, 'version_id' => null]);
        Schema::create('numbering_counters', function (Blueprint $t) {
            $t->string('key', 64)->primary();
            $t->unsignedBigInteger('value')->default(0);
        });
        Schema::create('numbering_issues', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->string('kind', 16);
            $t->string('number', 191);
            $t->uuid('courrier_id');
            $t->uuid('actor_id')->nullable();
            $t->json('snapshot')->nullable();
            $t->timestamp('created_at');
            $t->unique(['kind', 'number']);
            $t->index('courrier_id');
        });
        // Historical references remain unchanged and are never available for reuse.
        DB::table('courriers')->orderBy('id')->chunk(200, function ($rows) {
            foreach ($rows as $row) {
                DB::table('numbering_issues')->insert([
                    'kind' => 'system', 'number' => $row->numero,
                    'courrier_id' => $row->id, 'actor_id' => null,
                    'snapshot' => json_encode(['historical' => true]),
                    'created_at' => $row->created_at ?? now(),
                ]);
            }
        });
    }

    public function down(): void
    {
        // Issued references are audit data; never silently discard them on rollback.
        throw new RuntimeException('Migration de numérotation irréversible automatiquement : restaurer une sauvegarde validée.');
    }
};
