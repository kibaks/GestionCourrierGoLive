<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('name');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('job_title')->nullable()->after('service');
            $table->string('professional_phone', 32)->nullable()->after('job_title');
            $table->string('personal_phone', 32)->nullable()->after('professional_phone');
            $table->text('bio')->nullable()->after('personal_phone');
            $table->string('address')->nullable()->after('bio');
            $table->string('city')->nullable()->after('address');
            $table->string('country', 100)->nullable()->after('city');
            $table->string('cover_url')->nullable()->after('photo_url');
            $table->json('profile_visibility')->nullable()->after('cover_url');
            $table->json('notification_preferences')->nullable()->after('profile_visibility');
            $table->string('sms_phone', 32)->nullable()->after('notification_preferences');
            $table->timestamp('sms_verified_at')->nullable()->after('sms_phone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['first_name', 'last_name', 'job_title', 'professional_phone', 'personal_phone', 'bio', 'address', 'city', 'country', 'cover_url', 'profile_visibility', 'notification_preferences', 'sms_phone', 'sms_verified_at']);
        });
    }
};
