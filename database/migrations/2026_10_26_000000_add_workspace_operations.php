<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::create('user_drafts', function(Blueprint $t) { $t->uuid('user_id')->primary(); $t->json('payload'); $t->timestamps(); $t->foreign('user_id')->references('id')->on('users')->cascadeOnDelete(); });
        Schema::create('audit_events',function(Blueprint $t){$t->bigIncrements('id');$t->uuid('user_id')->nullable()->index();$t->string('method',8);$t->string('route');$t->uuid('resource_id')->nullable();$t->unsignedSmallInteger('status');$t->string('network_hash',64)->nullable();$t->timestamp('created_at')->index();});
        Schema::create('jobs', function(Blueprint $t) { $t->bigIncrements('id'); $t->string('queue')->index(); $t->longText('payload'); $t->unsignedTinyInteger('attempts'); $t->unsignedInteger('reserved_at')->nullable(); $t->unsignedInteger('available_at'); $t->unsignedInteger('created_at'); });
        Schema::create('communication_deliveries',function(Blueprint $t) { $t->uuid('id')->primary();$t->uuid('notification_id');$t->string('channel',16);$t->string('status',16)->default('queued')->index();$t->string('error')->nullable();$t->timestamps();$t->unique(['notification_id','channel']); });
        Schema::table('courriers',function(Blueprint $t) { $t->index(['statut','date_enregistrement'],'courriers_status_date'); $t->index(['priorite','statut'],'courriers_priority_status'); });
    }
    public function down(): void { Schema::dropIfExists('audit_events');Schema::dropIfExists('communication_deliveries');Schema::dropIfExists('jobs');Schema::dropIfExists('user_drafts');Schema::table('courriers',function(Blueprint $t){$t->dropIndex('courriers_status_date');$t->dropIndex('courriers_priority_status');}); }
};
