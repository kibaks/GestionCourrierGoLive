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
        if (Schema::hasTable('archives')) {
            return;
        }
        Schema::create('archives', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('courrier_id')->nullable();
            $table->string('boite_id', 64)->nullable();
            $table->string('entite_id', 64)->nullable();
            $table->string('direction', 255)->nullable();
            $table->string('numero_classement', 64)->unique();
            $table->dateTime('date_archivage');
            $table->string('archive_par');
            $table->text('motif')->nullable();
            $table->text('observations')->nullable();
            $table->unsignedTinyInteger('duree_conservation')->default(10);
            $table->dateTime('date_destruction')->nullable();
            $table->string('statut', 32)->default('ARCHIVE');
            $table->json('historique')->nullable();
            $table->json('document')->nullable();
            $table->timestamps();

            $table->index('courrier_id');
            $table->index('entite_id');
            $table->index('direction');
            $table->index('archive_par');
            $table->index('statut');
            $table->index('date_archivage');

            $table->foreign('courrier_id')->references('id')->on('courriers')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('archives');
    }
};
