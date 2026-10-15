<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class AttendanceLog extends Model
{
    protected $fillable = [
        'record_uuid', 'employee_id', 'employee_no_snapshot', 'attendance_date',
        'event_type', 'recorded_at', 'photo_path', 'station_code', 'status',
    ];

    protected $hidden = ['photo_path'];

    protected $casts = [
        'attendance_date' => 'date:Y-m-d',
        'recorded_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function photo(): HasOne
    {
        return $this->hasOne(AttendancePhoto::class);
    }
}