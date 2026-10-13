<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class AdminToken
{
    private static function key(string $token): string
    {
        return 'admin_token:' . hash('sha256', $token);
    }

    public static function issue(): string
    {
        $token = Str::random(64);
        Cache::put(self::key($token), true, now()->addMinutes(config('admin.token_ttl_minutes')));
        return $token;
    }

    public static function valid(Request $request): bool
    {
        $token = $request->bearerToken();
        return $token !== null && $token !== '' && Cache::has(self::key($token));
    }

    public static function revoke(Request $request): void
    {
        if ($token = $request->bearerToken()) {
            Cache::forget(self::key($token));
        }
    }
}
