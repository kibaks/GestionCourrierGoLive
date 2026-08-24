<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scan_previews', function (Blueprint $table) {
            $table->id();
            $table->string('preview_id', 120)->unique();
            $table->string('created_by', 64)->index();
            $table->string('file_path', 255);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->nullable();
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scan_previews');
    }
};
