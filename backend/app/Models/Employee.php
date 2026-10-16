<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Employee extends Model
{
    protected $fillable = [
        'employee_no', 'full_name', 'email', 'department', 'position', 'status', 'password',
    ];

    protected $hidden = ['password', 'email'];

    public function getHasPasswordAttribute(): bool
    {
        return !empty($this->attributes['password']);
    }

    public function attendanceLogs(): HasMany
    {
        return $this->hasMany(AttendanceLog::class);
    }
}
