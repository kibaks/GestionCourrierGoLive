<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('entite_type_definitions')) {
            return;
        }
        Schema::create('entite_type_definitions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code', 32)->unique(); // direction, service, sous-service, etc.
            $table->string('libelle_singulier');
            $table->string('libelle_pluriel');
            $table->text('description')->nullable();
            $table->string('icone', 64)->nullable();
            $table->unsignedInteger('ordre')->default(0);
            $table->boolean('actif')->default(true);
            $table->timestamps();
            $table->index('ordre');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entite_type_definitions');
    }
};
