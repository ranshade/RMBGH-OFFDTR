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

    public static function issue(string $role = 'admin'): string
    {
        $token = Str::random(64);
        Cache::put(self::key($token), $role, now()->addMinutes(config('admin.token_ttl_minutes')));
        return $token;
    }

    public static function role(Request $request): ?string
    {
        $token = $request->bearerToken();
        if ($token === null || $token === '') {
            return null;
        }

        $value = Cache::get(self::key($token));

        if ($value === true) {
            return 'admin';
        }

        return is_string($value) ? $value : null;
    }

    public static function valid(Request $request, array $roles = ['admin']): bool
    {
        return in_array(self::role($request), $roles, true);
    }

    public static function revoke(Request $request): void
    {
        if ($token = $request->bearerToken()) {
            Cache::forget(self::key($token));
        }
    }
}
