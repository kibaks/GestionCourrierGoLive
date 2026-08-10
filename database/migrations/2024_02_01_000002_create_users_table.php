<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Utilisateurs avec rôles et permissions (aligné Firebase / Firestore).
     */
    public function up(): void
    {
        if (Schema::hasTable('users')) {
            return;
        }
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('role', 32)->default('AGENT'); // SUPER_ADMIN, DIRECTEUR_GENERAL, SECRETAIRE, DIRECTEUR, CHEF_SERVICE, AGENT
            $table->string('direction')->nullable();
            $table->string('service')->nullable();
            $table->boolean('actif')->default(true);
            $table->rememberToken();
            $table->timestamps();

            $table->index('role');
            $table->index(['direction', 'service']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
