<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DtrDayMark;
use App\Support\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DtrMarkController extends Controller
{
    public function index(Request $request)
    {
        $validated = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $marks = DtrDayMark::whereBetween('mark_date', [$validated['from'], $validated['to']])
            ->get(['scope', 'mark_date', 'type'])
            ->map(fn ($m) => [
                'scope' => $m->scope,
                'date' => $m->mark_date->format('Y-m-d'),
                'type' => $m->type,
            ]);

        return response()->json($marks->values());
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'marks' => ['required', 'array', 'min:1', 'max:200'],
            'marks.*.scope' => ['required', 'string', 'max:50', 'regex:/^(\*|[A-Za-z0-9._-]+)$/'],
            'marks.*.date' => ['required', 'date_format:Y-m-d'],
            'marks.*.type' => ['nullable', Rule::in(DtrDayMark::TYPES)],
        ]);

        $audit = [];

        DB::transaction(function () use ($validated, &$audit) {
            foreach ($validated['marks'] as $m) {
                if (($m['type'] ?? null) === 'OFF' && $m['scope'] === '*') {
                    continue;
                }

                $existing = DtrDayMark::where('scope', $m['scope'])->whereDate('mark_date', $m['date'])->first();

                if (empty($m['type'])) {
                    if ($existing) {
                        $existing->delete();
                        $audit[] = ['dtr.mark_removed', $m, $existing->type, null];
                    }
                } elseif (!$existing || $existing->type !== $m['type']) {
                    DtrDayMark::updateOrCreate(
                        ['scope' => $m['scope'], 'mark_date' => $m['date']],
                        ['type' => $m['type']]
                    );
                    $audit[] = ['dtr.mark_set', $m, $existing?->type, $m['type']];
                }
            }
        });

        foreach ($audit as [$action, $m, $old, $new]) {
            $who = $m['scope'] === '*' ? 'all employees' : $m['scope'];
            $summary = $action === 'dtr.mark_set'
                ? "Marked {$m['date']} as {$new} for {$who}."
                : "Removed the {$old} mark on {$m['date']} for {$who}.";

            AuditLog::record($action, $summary, [
                'target' => ['type' => 'dtr', 'label' => "{$who} · {$m['date']}"],
                'changes' => [['field' => 'mark', 'old' => $old, 'new' => $new]],
            ]);
        }

        return response()->json(['message' => 'Saved.']);
    }
}
