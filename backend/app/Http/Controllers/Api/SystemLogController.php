<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemLog;
use Carbon\Carbon;
use Illuminate\Http\Request;

class SystemLogController extends Controller
{
    private const MAX_ROWS = 5000;

    public function index(Request $request)
    {
        $validated = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $timezone = config('app.timezone');
        $from = Carbon::createFromFormat('Y-m-d', $validated['from'], $timezone)->startOfDay();
        $to = Carbon::createFromFormat('Y-m-d', $validated['to'], $timezone)->endOfDay();

        $rows = SystemLog::whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::MAX_ROWS)
            ->get();

        return response()->json($rows->map->toEntry()->values());
    }
}
