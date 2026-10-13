<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'app' => config('app.name'),
        'message' => 'Offline Hospital Attendance API is running.',
        'api_health' => '/api/health',
    ]);
});
