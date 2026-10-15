<?php

return [
    'min_gap_minutes' => (int) env('ATTENDANCE_MIN_GAP_MINUTES', 10),

    'max_shift_hours' => (int) env('ATTENDANCE_MAX_SHIFT_HOURS', 16),
];
