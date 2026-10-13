<?php

return [
    // Super admin password. Prefer ADMIN_PASSWORD_HASH (bcrypt) over plain ADMIN_PASSWORD.
    // Generate a hash with: php artisan tinker --execute="echo Hash::make('your-password');"
    'password' => env('ADMIN_PASSWORD'),
    'password_hash' => env('ADMIN_PASSWORD_HASH'),

    // How long an admin session stays valid (minutes).
    'token_ttl_minutes' => (int) env('ADMIN_TOKEN_TTL_MINUTES', 480),
];
