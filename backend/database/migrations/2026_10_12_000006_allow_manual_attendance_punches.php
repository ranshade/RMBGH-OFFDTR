<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Punches added by an admin (forgotten time in / time out) have no kiosk photo.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('attendance_logs', function (Blueprint $table) {
            $table->string('photo_path', 255)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Left nullable on purpose: reverting would fail once manual punches exist.
    }
};
