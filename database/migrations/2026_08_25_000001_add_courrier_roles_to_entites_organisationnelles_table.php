<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Module Organigramme (ARMP) : rôles de chaque entité dans le traitement du courrier.
 * Valeurs : RECEPTION, ENREGISTREMENT, DIFFUSION, TRAITEMENT, REPONSE, SIGNATURE, EXPEDITION, ARCHIVAGE
 * Exemple : ["RECEPTION","ENREGISTREMENT","DIFFUSION","ARCHIVAGE"] pour le Bureau Courrier et Archives.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('entites_organisationnelles') && !Schema::hasColumn('entites_organisationnelles', 'courrier_roles')) {
            Schema::table('entites_organisationnelles', function (Blueprint $table) {
                $table->json('courrier_roles')->nullable()->after('description');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('entites_organisationnelles') && Schema::hasColumn('entites_organisationnelles', 'courrier_roles')) {
            Schema::table('entites_organisationnelles', function (Blueprint $table) {
                $table->dropColumn('courrier_roles');
            });
        }
    }
};
