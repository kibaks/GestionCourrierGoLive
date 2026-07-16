<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courrier_folders', function (Blueprint $table) {
            if (!Schema::hasColumn('courrier_folders', 'visibility')) {
                $table->string('visibility', 32)->default('private')->after('color');
            }
            if (!Schema::hasColumn('courrier_folders', 'direction')) {
                $table->string('direction', 255)->nullable()->after('visibility');
            }
            if (!Schema::hasColumn('courrier_folders', 'service')) {
                $table->string('service', 255)->nullable()->after('direction');
            }
        });

        // Rétro-compatibilité : mettre à jour les dossiers existants
        $folders = \App\Models\CourrierFolder::all();
        foreach ($folders as $folder) {
            $creator = \App\Models\User::where('id', $folder->user_id)->first();
            if (!$creator) continue;
            $vis = 'private';
            if ($creator->isSuperAdmin() || $creator->isDirecteurGeneral() || $creator->isSecretaire()) {
                $vis = 'dg';
            } elseif ($creator->isDirecteur()) {
                $vis = 'direction';
            } elseif ($creator->isChefService()) {
                $vis = 'service';
            }
            $folder->visibility = $vis;
            $folder->direction = $creator->direction;
            $folder->service = $creator->service;
            $folder->save();
        }
    }

    public function down(): void
    {
        Schema::table('courrier_folders', function (Blueprint $table) {
            $table->dropColumn(['visibility', 'direction', 'service']);
        });
    }
};
