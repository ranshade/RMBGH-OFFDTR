<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\AdminToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class AdminAuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate(['password' => ['required', 'string', 'max:200']]);

        $credentials = array_filter([
            'admin' => [config('admin.password_hash'), config('admin.password')],
            'hr' => [config('admin.hr_password_hash'), config('admin.hr_password')],
        ], fn ($pair) => $pair[0] || $pair[1]);

        if (!$credentials) {
            return response()->json(['message' => 'Super admin password is not configured. Set ADMIN_PASSWORD in the backend .env file.'], 503);
        }

        $throttleKey = 'admin-login:' . $request->ip();
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return response()->json(['message' => "Too many attempts. Try again in {$seconds} seconds."], 429);
        }

        $input = (string) $request->input('password');

        // Check every configured password so response time doesn't reveal which role exists.
        $role = null;
        foreach ($credentials as $name => [$hash, $plain]) {
            $matches = $hash ? Hash::check($input, $hash) : hash_equals((string) $plain, $input);
            if ($matches && $role === null) {
                $role = $name;
            }
        }

        if ($role === null) {
            RateLimiter::hit($throttleKey, 60);
            return response()->json(['message' => 'Incorrect password.'], 422);
        }

        RateLimiter::clear($throttleKey);
        return response()->json(['token' => AdminToken::issue($role), 'role' => $role]);
    }

    public function check(Request $request)
    {
        return response()->json(['ok' => true, 'role' => AdminToken::role($request)]);
    }

    public function logout(Request $request)
    {
        AdminToken::revoke($request);
        return response()->json(['ok' => true]);
    }
}
