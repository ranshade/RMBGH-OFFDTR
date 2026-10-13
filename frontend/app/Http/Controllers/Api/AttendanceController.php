<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AttendanceController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'employee_no' => ['nullable', 'string', 'max:50'],
        ]);

        $query = AttendanceLog::with('employee:id,employee_no,full_name')
            ->orderByDesc('recorded_at');

        $ranged = !empty($validated['from']) && !empty($validated['to']);
        if ($ranged) {
            // Cut-off period (e.g. 26th to 25th) - filter by attendance date.
            $query->whereBetween('attendance_date', [$validated['from'], $validated['to']]);
        } elseif (!empty($validated['date'])) {
            $query->whereDate('attendance_date', $validated['date']);
        }
        if (!empty($validated['employee_no'])) {
            $query->where('employee_no_snapshot', $validated['employee_no']);
        }

        return response()->json($query->limit($ranged ? 20000 : 500)->get());
    }

    /**
     * Serve the photo captured for one attendance record (super admin only; files are stored privately).
     */
    public function photo(string $uuid)
    {
        $log = AttendanceLog::where('record_uuid', $uuid)->firstOrFail();

        if (!$log->photo_path || !Storage::disk('local')->exists($log->photo_path)) {
            return response()->json(['message' => 'Photo not found.'], 404);
        }

        return Storage::disk('local')->response($log->photo_path, null, [
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    /**
     * Tell the kiosk which event is expected next for an employee.
     * Legacy AM/PM event values are supported while older records remain in the database.
     */
    public function nextEvent(Request $request)
    {
        $validated = $request->validate([
            'employee_no' => ['required', 'string', 'max:50'],
        ]);

        $employee = Employee::where('employee_no', $validated['employee_no'])
            ->where('status', 'active')
            ->first();

        if (!$employee) {
            return response()->json(['message' => 'Active employee not found.'], 422);
        }

        $latest = AttendanceLog::where('employee_id', $employee->id)
            ->orderByDesc('recorded_at')
            ->orderByDesc('id')
            ->first();

        return response()->json([
            'next_event' => $this->nextEventAfter($latest?->event_type, $latest?->recorded_at, now()),
            'last_event' => $latest?->event_type,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_no' => ['required', 'string', 'max:50'],
            'device_time' => ['nullable', 'date'],
            'station_code' => ['nullable', 'string', 'max:50'],
            'photo' => ['required', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $employee = Employee::where('employee_no', $validated['employee_no'])
            ->where('status', 'active')
            ->first();

        if (!$employee) {
            return response()->json(['message' => 'Active employee not found.'], 422);
        }

        // Use the kiosk's timestamp when provided; store it in the application's configured timezone.
        $recordedAt = isset($validated['device_time'])
            ? Carbon::parse($validated['device_time'])->setTimezone(config('app.timezone'))
            : now();

        $date = $recordedAt->toDateString();
        $uuid = (string) Str::uuid();
        $extension = strtolower($request->file('photo')->extension() ?: 'jpg');
        $path = $request->file('photo')->storeAs(
            'private/attendance/' . $date,
            $uuid . '.' . $extension,
            'local'
        );

        try {
            $result = DB::transaction(function () use ($employee, $date, $recordedAt, $validated, $path, $uuid) {
                // Lock the employee row so two quick requests cannot both choose the same next event.
                $lockedEmployee = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();

                $latest = AttendanceLog::where('employee_id', $lockedEmployee->id)
                    ->orderByDesc('recorded_at')
                    ->orderByDesc('id')
                    ->lockForUpdate()
                    ->first();

                // Prevent accidental repeat punches within the configured gap.
                $gap = (int) config('attendance.min_gap_minutes');
                $recent = $gap > 0
                    ? AttendanceLog::where('employee_id', $lockedEmployee->id)
                        ->where('recorded_at', '>=', $recordedAt->copy()->subMinutes($gap))
                        ->where('recorded_at', '<=', $recordedAt->copy()->addSeconds(5))
                        ->orderByDesc('recorded_at')
                        ->first()
                    : null;

                if ($recent) {
                    $wait = max(1, (int) ceil($gap - $recent->recorded_at->diffInSeconds($recordedAt, false) / 60));
                    return [
                        'conflict' => true,
                        'message' => "Attendance was already recorded at {$recent->recorded_at->format('h:i A')}. Please wait about {$wait} minute(s) before punching again.",
                    ];
                }

                $event = $this->nextEventAfter($latest?->event_type, $latest?->recorded_at, $recordedAt);

                $log = AttendanceLog::create([
                    'record_uuid' => $uuid,
                    'employee_id' => $lockedEmployee->id,
                    'employee_no_snapshot' => $lockedEmployee->employee_no,
                    'attendance_date' => $date,
                    'event_type' => $event,
                    'recorded_at' => $recordedAt,
                    'photo_path' => $path,
                    'station_code' => $validated['station_code'] ?? 'LOCAL-01',
                    'status' => 'recorded',
                ]);

                return ['conflict' => false, 'log' => $log, 'employee' => $lockedEmployee];
            });

            if ($result['conflict']) {
                Storage::disk('local')->delete($path);
                return response()->json(['message' => $result['message']], 409);
            }

            return response()->json([
                'message' => 'Attendance recorded successfully.',
                'record' => $result['log'],
                'employee' => [
                    'employee_no' => $result['employee']->employee_no,
                    'full_name' => $result['employee']->full_name,
                ],
                'next_event' => $this->nextEventAfter($result['log']->event_type, $result['log']->recorded_at, $result['log']->recorded_at),
            ], 201);
        } catch (\Throwable $e) {
            Storage::disk('local')->delete($path);
            throw $e;
        }
    }

    /**
     * Decide the next punch from the employee's last record (not from AM/PM or the clock time),
     * so 8-hour, 12-hour and overnight shifts all work: IN -> OUT -> IN -> ...
     * Exception: if the last punch was a TIME IN that is older than the longest expected shift,
     * the time-out was forgotten, so the next punch starts a new shift (TIME IN).
     */
    private function nextEventAfter(?string $lastEvent, $lastAt = null, $now = null): string
    {
        if (!$lastEvent) {
            return 'TIME IN';
        }

        $normalized = strtoupper(trim($lastEvent));

        if (in_array($normalized, ['TIME IN', 'TIME_IN', 'AM_IN', 'PM_IN'], true)) {
            if ($lastAt && $now) {
                $hours = Carbon::parse($lastAt)->diffInMinutes(Carbon::parse($now), false) / 60;
                if ($hours > (int) config('attendance.max_shift_hours')) {
                    return 'TIME IN'; // missed time-out
                }
            }
            return 'TIME OUT';
        }

        if (in_array($normalized, ['TIME OUT', 'TIME_OUT', 'AM_OUT', 'PM_OUT'], true)) {
            return 'TIME IN';
        }

        // Unknown legacy values are handled conservatively as a new shift's first punch.
        return 'TIME IN';
    }
}
