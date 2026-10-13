<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DtrDayMark extends Model
{
    public const TYPES = ['OFF', 'HOLIDAY', 'SUSPENDED'];

    protected $fillable = ['scope', 'mark_date', 'type'];

    protected $casts = [
        'mark_date' => 'date:Y-m-d',
    ];
}
