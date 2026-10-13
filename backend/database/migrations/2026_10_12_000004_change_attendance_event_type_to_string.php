<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The kiosk records "TIME IN" / "TIME OUT", but event_type was created as an ENUM of
 * AM_IN / AM_OUT / PM_IN / PM_OUT, so every save failed ("Data truncated for column 'event_type'").
 * Switch it to a plain string. Existing rows (including legacy AM_/PM_ values) are kept as-is.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('attendance_logs', function (Blueprint $table) {
            $table->string('event_type', 20)->change();
        });
    }

    public function down(): void
    {
        // Intentionally left as a string column: reverting to the old ENUM would break TIME IN / TIME OUT rows.
    }
};
