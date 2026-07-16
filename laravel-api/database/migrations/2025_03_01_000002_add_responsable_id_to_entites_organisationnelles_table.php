<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('entites_organisationnelles', function (Blueprint $table) {
            if (!Schema::hasColumn('entites_organisationnelles', 'responsable_id')) {
                $table->uuid('responsable_id')->nullable()->after('actif');
                $table->foreign('responsable_id')->references('id')->on('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('entites_organisationnelles', function (Blueprint $table) {
            $table->dropForeign(['responsable_id']);
        });
    }
};
