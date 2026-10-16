<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('system_logs', function (Blueprint $table) {
            $table->id();
            $table->string('category', 20);
            $table->string('action', 50);
            $table->string('severity', 10)->default('info');
            $table->string('actor_type', 20);
            $table->string('actor_name', 120);
            $table->string('actor_id', 50)->nullable();
            $table->string('target_type', 30)->nullable();
            $table->string('target_label', 190)->nullable();
            $table->string('summary', 500);
            $table->json('changes')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('station_code', 50)->nullable();
            $table->string('record_uuid', 36)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('created_at');
            $table->index(['category', 'created_at']);
            $table->index('action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('system_logs');
    }
};
