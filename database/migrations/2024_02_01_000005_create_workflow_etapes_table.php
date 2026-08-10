<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('workflow_etapes')) {
            return;
        }
        Schema::create('workflow_etapes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('courrier_id');
            $table->string('etape');
            $table->uuid('assigne_a');
            $table->string('statut', 32)->default('EN_ATTENTE'); // EN_ATTENTE, EN_COURS, TERMINE, REJETE
            $table->dateTime('date_debut')->nullable();
            $table->dateTime('date_fin')->nullable();
            $table->text('commentaire')->nullable();
            $table->uuid('cree_par');
            $table->unsignedSmallInteger('duree_estimee')->nullable(); // heures
            $table->json('declencheur')->nullable(); // type, etapePrecedenteId, dateDeclenchement
            $table->unsignedInteger('ordre')->nullable();
            $table->boolean('est_condition')->default(false);
            $table->uuid('action_si_vrai')->nullable();
            $table->uuid('action_si_faux')->nullable();
            $table->json('responses')->nullable(); // tableau WorkflowResponse
            $table->timestamps();

            $table->index('courrier_id');
            $table->index('assigne_a');
            $table->foreign('courrier_id')->references('id')->on('courriers')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_etapes');
    }
};
