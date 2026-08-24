<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * C3 — Idempotence anti-doublons (25/08/2026).
 * client_request_id : identifiant généré par le frontend (UUID:indice de ligne).
 * Si la requête arrive en double (retry réseau, double clic, replay du fallback
 * bulk → unitaire), l'API renvoie le courrier déjà créé au lieu d'en créer un second.
 * NULL autorisé = les vieux clients (sans clientRequestId) ne sont pas affectés.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courriers', function (Blueprint $table) {
            $table->string('client_request_id', 64)->nullable()->after('numero');
            $table->unique('client_request_id');
        });
    }

    public function down(): void
    {
        Schema::table('courriers', function (Blueprint $table) {
            $table->dropUnique(['client_request_id']);
            $table->dropColumn('client_request_id');
        });
    }
};
