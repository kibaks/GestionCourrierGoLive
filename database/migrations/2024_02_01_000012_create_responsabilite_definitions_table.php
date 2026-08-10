<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('responsabilite_definitions')) {
            return;
        }
        Schema::create('responsabilite_definitions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code', 64)->unique();
            $table->string('libelle');
            $table->text('description')->nullable();
            $table->string('niveau', 32); // direction, service, utilisateur, global
            $table->timestamps();
            $table->index('niveau');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('responsabilite_definitions');
    }
};
