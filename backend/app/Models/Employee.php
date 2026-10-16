<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Employee extends Model
{
    protected $fillable = [
        'employee_no', 'full_name', 'email', 'department', 'position', 'status', 'password',
    ];

    protected $hidden = ['password', 'email'];

    public static function hiddenEmployeeNumbers(): array
    {
        return array_values(array_filter([
            config('admin.superadmin_employee_no'),
            config('admin.hr_employee_no'),
        ]));
    }

    public function scopeInDirectory(Builder $query): Builder
    {
        return $query->whereNotIn('employee_no', self::hiddenEmployeeNumbers());
    }

    public function getHasPasswordAttribute(): bool
    {
        return !empty($this->attributes['password']);
    }

    public function attendanceLogs(): HasMany
    {
        return $this->hasMany(AttendanceLog::class);
    }
}
