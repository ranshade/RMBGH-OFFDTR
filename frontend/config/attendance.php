<?php

return [
    // Block another punch from the same employee within this many minutes (stops accidental double taps).
    'min_gap_minutes' => (int) env('ATTENDANCE_MIN_GAP_MINUTES', 10),

    // Longest shift we expect (8h and 12h shifts, plus overtime). If an employee's last punch was a
    // TIME IN older than this, the time-out was missed, so the next punch starts a NEW shift (TIME IN).
    'max_shift_hours' => (int) env('ATTENDANCE_MAX_SHIFT_HOURS', 16),
];
