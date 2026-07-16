<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('courriers')) {
            return;
        }
        Schema::create('courriers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('numero', 64)->unique();
            $table->string('type', 16); // INTERNE, EXTERNE
            $table->date('date_reception');
            $table->dateTime('date_enregistrement');
            $table->string('expediteur');
            $table->string('destinataire');
            $table->string('objet');
            $table->string('priorite', 16)->default('NORMALE'); // BASSE, NORMALE, HAUTE, URGENTE
            $table->string('statut', 32)->default('ENREGISTRE');
            $table->string('enregistre_par'); // ID utilisateur (secrétaire)
            $table->string('direction')->nullable();
            $table->string('service')->nullable();
            $table->string('fichier')->nullable();
            $table->json('extra_fields')->nullable();
            $table->timestamps();

            $table->index('enregistre_par');
            $table->index('date_enregistrement');
            $table->index(['type', 'date_enregistrement']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('courriers');
    }
};
