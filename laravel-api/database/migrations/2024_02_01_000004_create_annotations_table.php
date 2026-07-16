<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('annotations')) {
            return;
        }
        Schema::create('annotations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('courrier_id');
            $table->uuid('created_by'); // auteur
            $table->text('contenu');
            $table->string('type', 32); // MINUTE, NOTE, COMMENTAIRE
            $table->uuid('workflow_etape_id')->nullable();
            $table->json('fichiers')->nullable(); // URLs ou chemins
            $table->timestamps();

            $table->index('courrier_id');
            $table->index(['courrier_id', 'created_at']);
            $table->foreign('courrier_id')->references('id')->on('courriers')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('annotations');
    }
};
