<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('attendance_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_log_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('mime_type', 50);
            $table->timestamps();
        });

        DB::statement('ALTER TABLE attendance_photos ADD data MEDIUMBLOB NOT NULL AFTER mime_type');
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_photos');
    }
};