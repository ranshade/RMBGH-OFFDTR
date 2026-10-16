<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use App\Support\AuditLog;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttendanceReportController extends Controller
{
    public function csv(Request $request): StreamedResponse
    {
        $validated = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        AuditLog::record('report.exported', "Exported attendance CSV from {$validated['from']} to {$validated['to']}.", [
            'target' => ['type' => 'report', 'label' => "{$validated['from']} to {$validated['to']}"],
        ]);

        $filename = 'attendance-' . $validated['from'] . '-to-' . $validated['to'] . '.csv';

        return response()->streamDownload(function () use ($validated) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['Record UUID', 'Employee No', 'Employee Name', 'Attendance Date', 'Event', 'Recorded At', 'Station', 'Status']);

            AttendanceLog::with('employee:id,employee_no,full_name')
                ->whereBetween('attendance_date', [$validated['from'], $validated['to']])
                ->orderBy('recorded_at')
                ->chunk(500, function ($logs) use ($out) {
                    foreach ($logs as $log) {
                        fputcsv($out, [
                            $log->record_uuid,
                            $log->employee_no_snapshot,
                            $this->csvSafe(optional($log->employee)->full_name),
                            optional($log->attendance_date)->format('Y-m-d'),
                            $log->event_type,
                            optional($log->recorded_at)->format('Y-m-d H:i:s'),
                            $this->csvSafe($log->station_code),
                            $log->status,
                        ]);
                    }
                });
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function csvSafe(?string $value): ?string
    {
        if ($value !== null && preg_match('/^[=+\-@\t\r]/', $value)) {
            return "'" . $value;
        }

        return $value;
    }
}
