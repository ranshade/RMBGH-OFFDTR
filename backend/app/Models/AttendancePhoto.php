<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendancePhoto extends Model
{
    protected $fillable = ['attendance_log_id', 'mime_type', 'data'];

    protected $hidden = ['data'];

    public function attendanceLog(): BelongsTo
    {
        return $this->belongsTo(AttendanceLog::class);
    }
}