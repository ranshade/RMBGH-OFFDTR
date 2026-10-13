<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Day markers printed on the DTR (Civil Service Form 48):
 *  - OFF                 -> per employee (scope = employee_no)
 *  - HOLIDAY / SUSPENDED -> for everyone   (scope = '*')
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('dtr_day_marks', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 50);          // employee_no, or '*' for all employees
            $table->date('mark_date');
            $table->string('type', 20);           // OFF | HOLIDAY | SUSPENDED
            $table->timestamps();

            $table->unique(['scope', 'mark_date']);
            $table->index('mark_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dtr_day_marks');
    }
};
