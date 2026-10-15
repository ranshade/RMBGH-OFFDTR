<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use App\Models\DtrDayMark;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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
            $query->whereBetween('attendance_date', [$validated['from'], $validated['to']]);
        } elseif (!empty($validated['date'])) {
            $query->whereDate('attendance_date', $validated['date']);
        }
        if (!empty($validated['employee_no'])) {
            $query->where('employee_no_snapshot', $validated['employee_no']);
        }

        return response()->json($query->limit($ranged ? 20000 : 500)->get());
    }

    public function mine(Request $request)
    {
        $validated = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $employee = $request->attributes->get('employee');

        if (abs(Carbon::parse($validated['from'])->diffInDays(Carbon::parse($validated['to']))) > 45) {
            return response()->json(['message' => 'Date range is too long.'], 422);
        }

        $logs = AttendanceLog::where('employee_id', $employee->id)
            ->whereBetween('attendance_date', [$validated['from'], $validated['to']])
            ->orderBy('recorded_at')
            ->orderBy('id')
            ->get(['event_type', 'recorded_at', 'attendance_date']);

        try {
            $marks = DtrDayMark::whereIn('scope', [$employee->employee_no, '*'])
                ->whereBetween('mark_date', [$validated['from'], $validated['to']])
                ->get(['scope', 'mark_date', 'type'])
                ->map(fn ($m) => [
                    'scope' => $m->scope,
                    'date' => $m->mark_date->format('Y-m-d'),
                    'type' => $m->type,
                ])
                ->values();
        } catch (\Throwable $e) {
            $marks = collect(); 
        }

        return response()->json([
            'employee' => ['employee_no' => $employee->employee_no, 'full_name' => $employee->full_name],
            'logs' => $logs,
            'marks' => $marks,
        ]);
    }

    public function update(Request $request, string $uuid)
    {
        $validated = $request->validate([
            'recorded_at' => ['required', 'date'],
            'event_type' => ['nullable', Rule::in(['TIME IN', 'TIME OUT'])],
            'employee_no' => ['nullable', 'string', 'max:50'],
        ]);

        $log = AttendanceLog::where('record_uuid', $uuid)->firstOrFail();

        $owner = [];
        if (!empty($validated['employee_no']) && $validated['employee_no'] !== $log->employee_no_snapshot) {
            $employee = Employee::where('employee_no', $validated['employee_no'])->first();
            if (!$employee) {
                return response()->json(['message' => 'Employee ID not found.'], 422);
            }
            $owner = ['employee_id' => $employee->id, 'employee_no_snapshot' => $employee->employee_no];
        }
        $recordedAt = Carbon::parse($validated['recorded_at'], config('app.timezone'))->setTimezone(config('app.timezone'));

        if ($recordedAt->isFuture()) {
            return response()->json(['message' => 'The time cannot be in the future.'], 422);
        }

        $log->update($owner + [
            'recorded_at' => $recordedAt,
            'attendance_date' => $recordedAt->toDateString(),
            'event_type' => $validated['event_type'] ?? $log->event_type,
            'status' => 'edited',
        ]);

        return response()->json($log->fresh()->load('employee:id,employee_no,full_name'));
    }

    public function storeManual(Request $request)
    {
        $validated = $request->validate([
            'employee_no' => ['required', 'string', 'max:50'],
            'event_type' => ['required', Rule::in(['TIME IN', 'TIME OUT'])],
            'recorded_at' => ['required', 'date'],
        ]);

        $employee = Employee::where('employee_no', $validated['employee_no'])->first();
        if (!$employee) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        $recordedAt = Carbon::parse($validated['recorded_at'], config('app.timezone'))->setTimezone(config('app.timezone'));
        if ($recordedAt->isFuture()) {
            return response()->json(['message' => 'The time cannot be in the future.'], 422);
        }

        $log = AttendanceLog::create([
            'record_uuid' => (string) Str::uuid(),
            'employee_id' => $employee->id,
            'employee_no_snapshot' => $employee->employee_no,
            'attendance_date' => $recordedAt->toDateString(),
            'event_type' => $validated['event_type'],
            'recorded_at' => $recordedAt,
            'photo_path' => null,
            'station_code' => 'MANUAL',
            'status' => 'manual',
        ]);

        return response()->json($log->load('employee:id,employee_no,full_name'), 201);
    }

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
            'password' => ['required', 'string', 'max:100'],
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

        $throttleKey = 'attendance-punch:' . $request->ip() . '|' . strtolower($employee->employee_no);
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return response()->json(['message' => "Too many wrong passcodes. Try again in {$seconds} seconds."], 429);
        }

        if (empty($employee->password)) {
            return response()->json(['message' => 'No passcode has been set for you yet. Please ask the admin.'], 422);
        }

        if (!Hash::check($validated['password'], $employee->password)) {
            RateLimiter::hit($throttleKey, 60);
            return response()->json(['message' => 'Incorrect passcode.'], 422);
        }

        RateLimiter::clear($throttleKey);

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
                $lockedEmployee = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();

                $latest = AttendanceLog::where('employee_id', $lockedEmployee->id)
                    ->orderByDesc('recorded_at')
                    ->orderByDesc('id')
                    ->lockForUpdate()
                    ->first();

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
                    return 'TIME IN'; 
                }
            }
            return 'TIME OUT';
        }

        if (in_array($normalized, ['TIME OUT', 'TIME_OUT', 'AM_OUT', 'PM_OUT'], true)) {
            return 'TIME IN';
        }

        return 'TIME IN';
    }
}
