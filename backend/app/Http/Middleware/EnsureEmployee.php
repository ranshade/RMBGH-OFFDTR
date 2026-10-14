<?php

namespace App\Http\Middleware;

use App\Support\EmployeeToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEmployee
{
    public function handle(Request $request, Closure $next): Response
    {
        $employee = EmployeeToken::employee($request);
        if (!$employee) {
            return response()->json(['message' => 'Please sign in with your employee ID and password.'], 401);
        }

        $request->attributes->set('employee', $employee);
        return $next($request);
    }
}
