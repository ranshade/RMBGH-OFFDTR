<?php

namespace App\Http\Middleware;

use App\Support\AdminToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!AdminToken::valid($request)) {
            return response()->json(['message' => 'Super admin login required.'], 401);
        }
        return $next($request);
    }
}
