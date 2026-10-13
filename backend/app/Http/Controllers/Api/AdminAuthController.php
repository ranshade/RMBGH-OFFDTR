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

        $hash = config('admin.password_hash');
        $plain = config('admin.password');
        if (!$hash && !$plain) {
            return response()->json(['message' => 'Super admin password is not configured. Set ADMIN_PASSWORD in the backend .env file.'], 503);
        }

        $throttleKey = 'admin-login:' . $request->ip();
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return response()->json(['message' => "Too many attempts. Try again in {$seconds} seconds."], 429);
        }

        $input = (string) $request->input('password');
        $ok = $hash ? Hash::check($input, $hash) : hash_equals((string) $plain, $input);

        if (!$ok) {
            RateLimiter::hit($throttleKey, 60);
            return response()->json(['message' => 'Incorrect password.'], 422);
        }

        RateLimiter::clear($throttleKey);
        return response()->json(['token' => AdminToken::issue()]);
    }

    public function check()
    {
        return response()->json(['ok' => true]);
    }

    public function logout(Request $request)
    {
        AdminToken::revoke($request);
        return response()->json(['ok' => true]);
    }
}
