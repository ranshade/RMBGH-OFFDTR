<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

class HealthController extends Controller
{
    public function show()
    {
        try {
            DB::select('SELECT 1');
            return response()->json([
                'ok' => true,
                'app' => config('app.name'),
                'database' => 'connected',
                'server_time' => now()->toIso8601String(),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'database' => 'unavailable',
            ], 503);
        }
    }
}
