<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('attendance_logs', function (Blueprint $table) {
            $table->id();
            $table->uuid('record_uuid')->unique();
            $table->foreignId('employee_id')->constrained()->restrictOnDelete();
            $table->string('employee_no_snapshot', 50)->index();
            $table->date('attendance_date')->index();
            $table->enum('event_type', ['AM_IN', 'AM_OUT', 'PM_IN', 'PM_OUT'])->index();
            $table->dateTime('recorded_at')->index();
            $table->string('photo_path', 255);
            $table->string('station_code', 50)->default('LOCAL-01')->index();
            $table->string('status', 30)->default('recorded');
            $table->timestamps();

            $table->index(['employee_id', 'attendance_date', 'event_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_logs');
    }
};
