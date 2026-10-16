<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'category', 'action', 'severity', 'actor_type', 'actor_name', 'actor_id',
        'target_type', 'target_label', 'summary', 'changes', 'ip', 'station_code', 'record_uuid',
    ];

    protected $casts = [
        'changes' => 'array',
        'created_at' => 'datetime',
    ];

    public function toEntry(): array
    {
        return [
            'id' => $this->id,
            'created_at' => $this->created_at->toIso8601String(),
            'category' => $this->category,
            'action' => $this->action,
            'severity' => $this->severity,
            'actor' => array_filter([
                'type' => $this->actor_type,
                'name' => $this->actor_name,
                'id' => $this->actor_id,
            ], fn ($v) => $v !== null),
            'target' => $this->target_type
                ? ['type' => $this->target_type, 'label' => (string) $this->target_label]
                : null,
            'summary' => $this->summary,
            'changes' => $this->changes,
            'ip' => $this->ip,
            'station_code' => $this->station_code,
            'uuid' => $this->record_uuid,
        ];
    }
}
