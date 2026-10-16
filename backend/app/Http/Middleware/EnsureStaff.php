<?php

namespace App\Http\Middleware;

use App\Support\AdminToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!AdminToken::valid($request, ['admin', 'hr'])) {
            return response()->json(['message' => 'Admin or HR login required.'], 401);
        }
        return $next($request);
    }
}
