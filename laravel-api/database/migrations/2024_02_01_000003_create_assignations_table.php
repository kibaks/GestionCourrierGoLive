<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Assignations (aligné Firebase) pour filtrage des courriers accessibles.
     */
    public function up(): void
    {
        if (Schema::hasTable('assignations')) {
            return;
        }
        Schema::create('assignations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('courrier_id');
            $table->uuid('assigne_a'); // user id
            $table->uuid('assigne_par'); // user id
            $table->dateTime('date_assignation');
            $table->dateTime('date_echeance')->nullable();
            $table->string('statut', 32)->default('EN_ATTENTE'); // EN_ATTENTE, EN_COURS, TERMINE
            $table->text('instructions')->nullable();
            $table->timestamps();

            $table->index('courrier_id');
            $table->index('assigne_a');
            $table->index(['assigne_a', 'date_assignation']);
            $table->foreign('courrier_id')->references('id')->on('courriers')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assignations');
    }
};
