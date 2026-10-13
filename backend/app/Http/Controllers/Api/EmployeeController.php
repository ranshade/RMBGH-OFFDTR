<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Http\Request;
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
            'full_name' => ['sometimes', 'required', 'string', 'max:160'],
            'department' => ['nullable', 'string', 'max:120'],
            'position' => ['nullable', 'string', 'max:120'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
        ]);
        $employee->update($validated);
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
