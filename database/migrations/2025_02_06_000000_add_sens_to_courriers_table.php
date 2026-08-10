<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('courriers', 'sens')) {
            return;
        }
        Schema::table('courriers', function (Blueprint $table) {
            $table->string('sens', 16)->nullable()->after('type'); // ENTRANT, SORTANT
        });
    }

    public function down(): void
    {
        Schema::table('courriers', function (Blueprint $table) {
            $table->dropColumn('sens');
        });
    }
};
