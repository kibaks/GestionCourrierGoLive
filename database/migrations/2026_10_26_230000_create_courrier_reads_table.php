<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void { Schema::create('courrier_reads', function(Blueprint $table){
  $table->uuid('courrier_id'); $table->uuid('user_id'); $table->timestamp('read_at');
  $table->primary(['courrier_id','user_id']);
  $table->foreign('courrier_id')->references('id')->on('courriers')->cascadeOnDelete();
  $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
  $table->index('user_id');
 }); }
 public function down(): void { Schema::dropIfExists('courrier_reads'); }
};
