<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('rappels')) {
            return;
        }
        Schema::create('rappels', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('assignation_id');
            $table->uuid('courrier_id');
            $table->dateTime('date_rappel');
            $table->boolean('envoye')->default(false);
            $table->dateTime('envoye_at')->nullable();
            $table->text('message')->nullable();
            $table->timestamps();

            $table->index('assignation_id');
            $table->index(['envoye', 'date_rappel']);
            $table->foreign('assignation_id')->references('id')->on('assignations')->onDelete('cascade');
            $table->foreign('courrier_id')->references('id')->on('courriers')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rappels');
    }
};
