<?php

return [
    'password' => env('ADMIN_PASSWORD'),
    'password_hash' => env('ADMIN_PASSWORD_HASH'),

    'token_ttl_minutes' => (int) env('ADMIN_TOKEN_TTL_MINUTES', 480),

    'superadmin_employee_no' => env('SUPERADMIN_EMPLOYEE_NO', 'SUPERADMIN'),
    'superadmin_passcode' => env('SUPERADMIN_PASSCODE'),

    'hr_password' => env('HR_ADMIN_PASSWORD'),
    'hr_password_hash' => env('HR_ADMIN_PASSWORD_HASH'),

    'hr_employee_no' => env('HR_EMPLOYEE_NO', 'HR'),
    'hr_passcode' => env('HR_PASSCODE'),
];
