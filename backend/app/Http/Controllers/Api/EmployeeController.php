<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use App\Models\DtrDayMark;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use App\Support\AdminToken;
use App\Support\AuditLog;

class EmployeeController extends Controller
{
    private const AUDITED_FIELDS = ['employee_no', 'full_name', 'email', 'department', 'position', 'status'];

    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));
        $query = Employee::query()->inDirectory();
        if ($request->boolean('all')) {
            if (!AdminToken::valid($request, ['admin', 'hr'])) {
                return response()->json(['message' => 'Admin or HR login required.'], 401);
            }
        } else {
            $query->where('status', 'active');
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('employee_no', 'like', "%{$search}%")
                  ->orWhere('full_name', 'like', "%{$search}%")
                  ->orWhere('department', 'like', "%{$search}%");
            });
        }

        $rows = $query->orderBy('full_name')->limit(500)->get();
        if ($request->boolean('all')) {
            $rows->each->makeVisible('email')->append('has_password');
        }

        return response()->json($rows);
    }

    public function update(Request $request, Employee $employee)
    {
        if (in_array($employee->employee_no, Employee::hiddenEmployeeNumbers(), true) && !AdminToken::valid($request)) {
            return response()->json(['message' => 'Only the super admin can edit this account.'], 403);
        }

        $validated = $request->validate([
            'employee_no' => ['sometimes', 'required', 'string', 'max:50', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('employees', 'employee_no')->ignore($employee->id)],
            'full_name' => ['sometimes', 'required', 'string', 'max:160'],
            'email' => ['nullable', 'email:rfc', 'max:190'],
            'department' => ['nullable', 'string', 'max:120'],
            'position' => ['nullable', 'string', 'max:120'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'password' => ['nullable', 'digits:3'], 
        ], ['password.digits' => 'The passcode must be exactly 3 digits.']);

        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $oldNo = $employee->employee_no;
        $before = $employee->only(self::AUDITED_FIELDS);
        $passcodeChanged = array_key_exists('password', $validated);

        DB::transaction(function () use ($employee, $validated, $oldNo) {
            $employee->update($validated);
            $newNo = $employee->employee_no;

            if ($newNo !== $oldNo) {
                AttendanceLog::where('employee_id', $employee->id)->update(['employee_no_snapshot' => $newNo]);

                if (Schema::hasTable('dtr_day_marks')) {
                    if (strcasecmp($newNo, $oldNo) !== 0) {
                        DtrDayMark::where('scope', $newNo)->delete(); 
                    }
                    DtrDayMark::where('scope', $oldNo)->update(['scope' => $newNo]);
                }
            }
        });

        $employee = $employee->fresh();
        $this->auditUpdate($employee, $before, $passcodeChanged);

        return response()->json($employee->makeVisible('email')->append('has_password'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_no' => ['required', 'string', 'max:50', 'regex:/^[A-Za-z0-9._-]+$/', 'unique:employees,employee_no'],
            'full_name' => ['required', 'string', 'max:160'],
            'email' => ['nullable', 'email:rfc', 'max:190'],
            'department' => ['nullable', 'string', 'max:120'],
            'position' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'password' => ['nullable', 'digits:3'],
        ], ['password.digits' => 'The passcode must be exactly 3 digits.']);

        $validated['status'] = $validated['status'] ?? 'active';
        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $employee = Employee::create($validated);
        AuditLog::record('employee.created', "Added employee {$employee->full_name} ({$employee->employee_no}).", [
            'target' => $this->targetFor($employee),
        ]);

        return response()->json($employee->makeVisible('email')->append('has_password'), 201);
    }

    private function auditUpdate(Employee $employee, array $before, bool $passcodeChanged): void
    {
        $changes = AuditLog::diff($before, $employee->only(self::AUDITED_FIELDS), self::AUDITED_FIELDS);
        if ($passcodeChanged) {
            $changes[] = ['field' => 'passcode', 'old' => null, 'new' => 'changed'];
        }
        if (!$changes) {
            return;
        }

        $statusChange = collect($changes)->firstWhere('field', 'status');
        $action = match ($statusChange['new'] ?? null) {
            'inactive' => 'employee.deactivated',
            'active' => 'employee.reactivated',
            default => 'employee.updated',
        };
        $verb = ['employee.deactivated' => 'Deactivated', 'employee.reactivated' => 'Reactivated'][$action] ?? 'Updated';

        AuditLog::record($action, "{$verb} employee {$employee->full_name} ({$employee->employee_no}).", [
            'target' => $this->targetFor($employee),
            'changes' => $changes,
        ]);
    }

    private function targetFor(Employee $employee): array
    {
        return ['type' => 'employee', 'label' => "{$employee->full_name} ({$employee->employee_no})"];
    }
}
