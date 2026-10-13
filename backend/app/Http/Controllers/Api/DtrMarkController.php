<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DtrDayMark;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DtrMarkController extends Controller
{
    /** Marks inside a cut-off period. */
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

    /**
     * Set or clear marks in bulk. A null/empty type clears the mark.
     * Body: { marks: [{ scope: "EMP-001" | "*", date: "2026-08-03", type: "OFF" | "HOLIDAY" | "SUSPENDED" | null }] }
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'marks' => ['required', 'array', 'min:1', 'max:200'],
            'marks.*.scope' => ['required', 'string', 'max:50', 'regex:/^(\*|[A-Za-z0-9._-]+)$/'],
            'marks.*.date' => ['required', 'date_format:Y-m-d'],
            'marks.*.type' => ['nullable', Rule::in(DtrDayMark::TYPES)],
        ]);

        DB::transaction(function () use ($validated) {
            foreach ($validated['marks'] as $m) {
                // OFF belongs to one employee; HOLIDAY / SUSPENDED apply to everyone.
                if (($m['type'] ?? null) === 'OFF' && $m['scope'] === '*') {
                    continue;
                }
                if (in_array($m['type'] ?? null, ['HOLIDAY', 'SUSPENDED'], true) && $m['scope'] !== '*') {
                    continue;
                }

                if (empty($m['type'])) {
                    DtrDayMark::where('scope', $m['scope'])->whereDate('mark_date', $m['date'])->delete();
                } else {
                    DtrDayMark::updateOrCreate(
                        ['scope' => $m['scope'], 'mark_date' => $m['date']],
                        ['type' => $m['type']]
                    );
                }
            }
        });

        return response()->json(['message' => 'Saved.']);
    }
}
