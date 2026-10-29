<?php
use Illuminate\Database\Migrations\Migration;use Illuminate\Database\Schema\Blueprint;use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up():void{Schema::create('courrier_registre',function(Blueprint $table){$table->uuid('courrier_id')->primary();$table->json('data');$table->timestamp('updated_at');$table->foreign('courrier_id')->references('id')->on('courriers')->cascadeOnDelete();});}
 public function down():void{Schema::dropIfExists('courrier_registre');}
};
