<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('courrier_folder_maps')) {
            return;
        }
        Schema::create('courrier_folder_maps', function (Blueprint $table) {
            $table->string('user_id', 128)->primary();
            $table->json('map')->nullable(); // { courrier_id => folder_id }
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('courrier_folder_maps');
    }
};
