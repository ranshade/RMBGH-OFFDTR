<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Support\EmployeeToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class EmployeeAuthController extends Controller
{
    public function login(Request $request)
    {
        $validated = $request->validate([
            'employee_no' => ['required', 'string', 'max:50'],
            'password' => ['required', 'string', 'max:200'],
        ]);

        $throttleKey = 'employee-login:' . $request->ip() . '|' . strtolower($validated['employee_no']);
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return response()->json(['message' => "Too many attempts. Try again in {$seconds} seconds."], 429);
        }

        $employee = Employee::where('employee_no', $validated['employee_no'])->where('status', 'active')->first();

        if ($employee && empty($employee->password)) {
            return response()->json(['message' => 'No password has been set for you yet. Please ask the admin.'], 422);
        }

        // Always run a hash check so a wrong ID and a wrong password take the same time.
        $ok = Hash::check($validated['password'], $employee->password ?? Hash::make('not-a-real-password'));
        if (!$employee || !$ok) {
            RateLimiter::hit($throttleKey, 60);
            return response()->json(['message' => 'Incorrect employee ID or password.'], 422);
        }

        RateLimiter::clear($throttleKey);

        return response()->json([
            'token' => EmployeeToken::issue($employee),
            'employee' => ['employee_no' => $employee->employee_no, 'full_name' => $employee->full_name],
        ]);
    }

    public function logout(Request $request)
    {
        EmployeeToken::revoke($request);
        return response()->json(['ok' => true]);
    }
}
