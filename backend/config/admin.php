<?php

return [
    'password' => env('ADMIN_PASSWORD'),
    'password_hash' => env('ADMIN_PASSWORD_HASH'),

    // How long an admin session stays valid (minutes).
    'token_ttl_minutes' => (int) env('ADMIN_TOKEN_TTL_MINUTES', 480),

    'superadmin_employee_no' => env('SUPERADMIN_EMPLOYEE_NO', 'SUPERADMIN'),
    'superadmin_passcode' => env('SUPERADMIN_PASSCODE'),
];
