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
        if (Schema::hasTable('courrier_fichiers')) {
            return;
        }
        Schema::create('courrier_fichiers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('nom');
            $table->string('type', 16); // dossier | fichier
            $table->uuid('courrier_id');
            $table->uuid('parent_id')->nullable();
            $table->string('chemin', 512)->nullable(); // chemin relatif storage (ex: courriers/xxx/fichiers/yyy.pdf)
            $table->string('extension', 32)->nullable();
            $table->unsignedBigInteger('taille')->nullable();
            $table->boolean('est_accuse_reception')->default(false);
            $table->string('cree_par');
            $table->timestamps();

            $table->index('courrier_id');
            $table->index('parent_id');
            $table->foreign('courrier_id')->references('id')->on('courriers')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('courrier_fichiers');
    }
};
