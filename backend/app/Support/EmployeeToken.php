<?php

namespace App\Support;

use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class EmployeeToken
{
    private static function key(string $token): string
    {
        return 'employee_token:' . hash('sha256', $token);
    }

    private static function fingerprint(Employee $employee): string
    {
        return substr(hash('sha256', (string) $employee->password), 0, 16);
    }

    public static function issue(Employee $employee): string
    {
        $token = Str::random(64);
        Cache::put(
            self::key($token),
            ['id' => $employee->id, 'v' => self::fingerprint($employee)],
            now()->addMinutes(config('admin.token_ttl_minutes', 120))
        );
        return $token;
    }

    public static function employee(Request $request): ?Employee
    {
        $token = $request->bearerToken();
        if ($token === null || $token === '') {
            return null;
        }

        $data = Cache::get(self::key($token));
        if (!is_array($data)) {
            return null;
        }

        $employee = Employee::find($data['id'] ?? 0);
        if (!$employee || $employee->status !== 'active' || !hash_equals(self::fingerprint($employee), (string) ($data['v'] ?? ''))) {
            return null;
        }

        return $employee;
    }

    public static function revoke(Request $request): void
    {
        if ($token = $request->bearerToken()) {
            Cache::forget(self::key($token));
        }
    }
}
