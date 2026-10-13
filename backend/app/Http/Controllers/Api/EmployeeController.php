<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use App\Models\DtrDayMark;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use App\Support\AdminToken;

class EmployeeController extends Controller
{
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));
        $query = Employee::query();
        if ($request->boolean('all')) {
            // Full directory (including inactive) is for the super admin only.
            if (!AdminToken::valid($request)) {
                return response()->json(['message' => 'Super admin login required.'], 401);
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

        return response()->json($query->orderBy('full_name')->limit(500)->get());
    }

    public function update(Request $request, Employee $employee)
    {
        $validated = $request->validate([
            'employee_no' => ['sometimes', 'required', 'string', 'max:50', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('employees', 'employee_no')->ignore($employee->id)],
            'full_name' => ['sometimes', 'required', 'string', 'max:160'],
            'department' => ['nullable', 'string', 'max:120'],
            'position' => ['nullable', 'string', 'max:120'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
        ]);

        $oldNo = $employee->employee_no;

        DB::transaction(function () use ($employee, $validated, $oldNo) {
            $employee->update($validated);
            $newNo = $employee->employee_no;

            // The ID changed: carry the employee's history (punches and OFF marks) over to the new ID.
            if ($newNo !== $oldNo) {
                AttendanceLog::where('employee_id', $employee->id)->update(['employee_no_snapshot' => $newNo]);

                if (Schema::hasTable('dtr_day_marks')) {
                    if (strcasecmp($newNo, $oldNo) !== 0) {
                        DtrDayMark::where('scope', $newNo)->delete(); // leftovers of an ID that is no longer used
                    }
                    DtrDayMark::where('scope', $oldNo)->update(['scope' => $newNo]);
                }
            }
        });

        return response()->json($employee->fresh());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_no' => ['required', 'string', 'max:50', 'regex:/^[A-Za-z0-9._-]+$/', 'unique:employees,employee_no'],
            'full_name' => ['required', 'string', 'max:160'],
            'department' => ['nullable', 'string', 'max:120'],
            'position' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);

        $validated['status'] = $validated['status'] ?? 'active';
        return response()->json(Employee::create($validated), 201);
    }
}
