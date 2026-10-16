<?php

namespace App\Support;

use App\Models\SystemLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class AuditLog
{
    private const WARNING_ACTIONS = [
        'auth.login_failed',
        'attendance.manual_added',
        'attendance.edited',
        'employee.deactivated',
    ];

    private const CRITICAL_ACTIONS = ['auth.lockout'];

    public static function record(string $action, string $summary, array $context = []): void
    {
        try {
            $request = $context['request'] ?? request();

            SystemLog::create([
                'category' => Str::before($action, '.'),
                'action' => $action,
                'severity' => self::severityFor($action),
                'actor_type' => $context['actor']['type'] ?? 'admin',
                'actor_name' => Str::limit($context['actor']['name'] ?? self::actorName($request), 120, ''),
                'actor_id' => $context['actor']['id'] ?? AdminToken::role($request),
                'target_type' => $context['target']['type'] ?? null,
                'target_label' => isset($context['target']['label']) ? Str::limit($context['target']['label'], 190, '') : null,
                'summary' => Str::limit($summary, 500, ''),
                'changes' => $context['changes'] ?? null,
                'ip' => $request->ip(),
                'station_code' => $context['station_code'] ?? null,
                'record_uuid' => $context['uuid'] ?? null,
            ]);
        } catch (Throwable $e) {
            Log::warning('Audit entry could not be saved.', ['action' => $action, 'error' => $e->getMessage()]);
        }
    }

    public static function diff(array $old, array $new, array $fields): array
    {
        $changes = [];

        foreach ($fields as $field) {
            if (!array_key_exists($field, $new)) {
                continue;
            }

            $before = $old[$field] ?? null;
            $after = $new[$field];

            if ((string) $before !== (string) $after) {
                $changes[] = ['field' => $field, 'old' => $before, 'new' => $after];
            }
        }

        return $changes;
    }

    private static function severityFor(string $action): string
    {
        if (in_array($action, self::CRITICAL_ACTIONS, true)) {
            return 'critical';
        }

        return in_array($action, self::WARNING_ACTIONS, true) ? 'warning' : 'info';
    }

    private static function actorName(Request $request): string
    {
        return match (AdminToken::role($request)) {
            'admin' => 'Super Admin',
            'hr' => 'HR',
            default => 'Unknown',
        };
    }
}
