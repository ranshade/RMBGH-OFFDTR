<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AttendanceReportController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\DtrMarkController;
use App\Http\Controllers\Api\AdminAuthController;
use App\Http\Controllers\Api\EmployeeAuthController;

Route::get('/health', [HealthController::class, 'show']);
Route::get('/employees', [EmployeeController::class, 'index']);
Route::post('/employees', [EmployeeController::class, 'store'])->middleware('staff');
Route::put('/employees/{employee}', [EmployeeController::class, 'update'])->middleware('staff');
Route::post('/admin/login', [AdminAuthController::class, 'login']);
Route::get('/admin/check', [AdminAuthController::class, 'check'])->middleware('staff');
Route::post('/admin/logout', [AdminAuthController::class, 'logout'])->middleware('staff');
Route::get('/departments', [DepartmentController::class, 'index']);
Route::post('/departments', [DepartmentController::class, 'store'])->middleware('admin');
Route::put('/departments/{department}', [DepartmentController::class, 'update'])->middleware('admin');
Route::delete('/departments/{department}', [DepartmentController::class, 'destroy'])->middleware('admin');
Route::get('/attendance', [AttendanceController::class, 'index'])->middleware('staff');
Route::get('/attendance/{uuid}/photo', [AttendanceController::class, 'photo'])->middleware('staff')->whereUuid('uuid');
Route::get('/attendance/next', [AttendanceController::class, 'nextEvent']);
Route::post('/employee/login', [EmployeeAuthController::class, 'login']);
Route::post('/employee/logout', [EmployeeAuthController::class, 'logout'])->middleware('employee');
Route::get('/attendance/my', [AttendanceController::class, 'mine'])->middleware(['employee', 'throttle:60,1']);
Route::post('/attendance', [AttendanceController::class, 'store']);
Route::post('/attendance/manual', [AttendanceController::class, 'storeManual'])->middleware('staff');
Route::put('/attendance/{uuid}', [AttendanceController::class, 'update'])->middleware('staff')->whereUuid('uuid');
Route::get('/reports/attendance.csv', [AttendanceReportController::class, 'csv'])->middleware('staff');
Route::get('/dtr/marks', [DtrMarkController::class, 'index'])->middleware('staff');
Route::put('/dtr/marks', [DtrMarkController::class, 'update'])->middleware('staff');
