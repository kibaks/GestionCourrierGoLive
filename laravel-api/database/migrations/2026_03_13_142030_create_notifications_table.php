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
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('userId'); // Utilisateur destinataire
            $table->string('type'); // assignation, rappel, echeance, workflow, courrier, system
            $table->string('title');
            $table->text('message');
            $table->string('priority')->default('normal'); // normal, high, urgent
            $table->boolean('read')->default(false);
            $table->timestamp('readAt')->nullable();
            $table->string('relatedId')->nullable(); // ID de l'élément lié (courrier, assignation, etc.)
            $table->string('relatedType')->nullable(); // Type de l'élément lié
            $table->string('actionUrl')->nullable(); // URL pour l'action
            $table->json('metadata')->nullable(); // Données supplémentaires
            $table->timestamps(); // Crée created_at et updated_at automatiquement
            
            $table->index('userId');
            $table->index(['userId', 'read']);
            $table->index(['userId', 'type']);
            $table->index('created_at'); // Utiliser created_at au lieu de createdAt
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
