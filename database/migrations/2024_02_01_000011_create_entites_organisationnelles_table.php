<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('entites_organisationnelles')) {
            return;
        }
        Schema::create('entites_organisationnelles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('nom');
            $table->string('type', 32); // direction_generale, direction, division, service, sous-service, bureau, cellule
            $table->text('description')->nullable();
            $table->uuid('parent_id')->nullable();
            $table->unsignedInteger('ordre')->default(0);
            $table->boolean('actif')->default(true);
            $table->timestamps();
            $table->index('type');
            $table->index('parent_id');
            $table->index(['type', 'parent_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entites_organisationnelles');
    }
};
