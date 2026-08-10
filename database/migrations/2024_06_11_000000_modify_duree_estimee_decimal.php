<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workflow_etapes', function (Blueprint $table) {
            // Modifier duree_estimee pour accepter des décimales (ex: 2.5 heures)
            $table->decimal('duree_estimee', 5, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('workflow_etapes', function (Blueprint $table) {
            $table->unsignedSmallInteger('duree_estimee')->nullable()->change();
        });
    }
};
