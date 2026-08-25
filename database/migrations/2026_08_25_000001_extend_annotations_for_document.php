<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P1 — Annotations « sur le document » (style Word/PDF).
 * Étend la table annotations avec la position sur le fichier (page + zone normalisée 0..1000),
 * la nature du tracé, les fils de réponses, le statut et la décision optionnelle.
 * Migration additive : les annotations existantes (position NULL) restent des annotations « libres ».
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('annotations', function (Blueprint $table) {
            $table->string('fichier_id')->nullable()->after('workflow_etape_id');
            $table->string('fichier_nom')->nullable()->after('fichier_id');
            $table->unsignedTinyInteger('page')->nullable()->after('fichier_nom');
            $table->json('position')->nullable()->after('page'); // {x, y, w, h} normalisés 0..1000
            $table->string('kind', 16)->default('COMMENTAIRE')->after('position'); // COMMENTAIRE|TRACE|TEXTE|TAMPOUR|SIGNATURE
            $table->uuid('parent_id')->nullable()->after('kind'); // réponse dans un fil
            $table->string('statut', 16)->default('OUVERT')->after('parent_id'); // OUVERT|RESOLU
            $table->string('decision', 16)->nullable()->after('statut'); // FAVORABLE|A_REVOIR|INFO
            $table->index(['fichier_id', 'page']);
        });
    }

    public function down(): void
    {
        Schema::table('annotations', function (Blueprint $table) {
            $table->dropIndex(['fichier_id', 'page']);
            $table->dropColumn(['fichier_id', 'fichier_nom', 'page', 'position', 'kind', 'parent_id', 'statut', 'decision']);
        });
    }
};
