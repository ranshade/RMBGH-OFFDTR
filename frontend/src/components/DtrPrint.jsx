import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { adminFetch } from '../lib';
import { Button } from './ui/button';
import { Input, Label } from './ui/input';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Dialog } from './ui/dialog';
import { IconArrowLeft, IconChevronLeft, IconChevronRight, IconLock, IconPrinter } from './ui/icons';
import { buildDtr, currentEnd, officialRange, periodFromEnd, shiftEnd, showsBreak, ymd } from '../dtr';

const SETTINGS_KEY = 'dtr_settings';
const ALL = '*';
const DEFAULTS = {
  official: '8:00 AM - 5:00 PM',
  grace: '15', // minutes
  regularDays: '',
  saturdays: '',
  head: 'DAVE ANTHONY A. VERGARA, MD',
  headTitle: 'CITY GOVERNMENT DEPARTMENT HEAD III',
};
const CERTIFICATION =
  'I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.';

const loadSettings = () => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return DEFAULTS; }
};
const pad = (n) => String(n).padStart(2, '0');
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtLong = (d) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

function initialEnd() {
  const m = /^(\d{4})-(\d{2})$/.exec(new URLSearchParams(window.location.search).get('end') || '');
  return m && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], m: +m[2] } : currentEnd();
}

/* ------------------------------------------------------------------ one half of the form */
const clock = (v) => (v ? v.replace(/^(\d):/, '0$1:') : '');
const dayLabel = (n) => String(n).padStart(2, '0');

function Field({ label, value }) {
  return (
    <div className="dtr-field">
      <span>{label}</span>
      {value
        ? <b className="dtr-field-text"><i>{value}</i></b>
        : <b className="dtr-field-line">&nbsp;</b>}
    </div>
  );
}

function Panel({ emp, panel, settings, onPick }) {
  return (
    <div className="dtr-panel">
      <div className="dtr-formno">Civil Service Form No. 48</div>
      <div className="dtr-title">DAILY TIME RECORD</div>
      <div className="dtr-name"><span>{emp.name || '\u00a0'}</span></div>
      <div className="dtr-namelabel">NAME</div>

      <Field label="For the month of" value={panel.label} />
      <Field label="Official Hours:" value={settings.official} />
      <Field label="For Arrival & Departure Days:" value={settings.regularDays} />
      <Field label="Saturdays:" value={settings.saturdays} />

      <table className="dtr-table">
        <thead>
          <tr>
            <th rowSpan={3}>Days</th>
            <th colSpan={6} className="dtr-blank-head" />
          </tr>
          <tr>
            <th colSpan={2}>Morning</th>
            <th colSpan={2}>Afternoon</th>
            <th colSpan={2}>Overtime</th>
          </tr>
          <tr>
            <th>Arrived</th><th>Departure</th><th>Arrived</th><th>Departure</th><th>Hours</th><th>minutes</th>
          </tr>
        </thead>
        <tbody>
          {panel.rows.map((r) => (
            <tr key={r.day} className={r.inRange && onPick ? 'dtr-edit' : ''}>
              <td className="dtr-day">
                {r.inRange && onPick
                  ? <button type="button" title="Mark OFF / Holiday / Suspended" onClick={() => onPick(emp, r)}>{dayLabel(r.day)}</button>
                  : dayLabel(r.day)}
              </td>
              {!r.inRange && <><td /><td /><td /><td /></>}
              {r.inRange && r.full === 'OFF' && ['a', 'b', 'c', 'd'].map((k) => <td key={k}>OFF</td>)}
              {r.inRange && (r.full === 'HOLIDAY' || r.full === 'SUSPENDED') && <td colSpan={4} className="dtr-merged">{r.full}</td>}
              {r.inRange && !r.full && ['mA', 'mD', 'aA', 'aD'].map((k) => <td key={k}>{clock(r.cells[k])}</td>)}
              <td /><td />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dtr-cert">{CERTIFICATION}</p>
    </div>
  );
}

function SignBlock({ name, caption, note }) {
  return (
    <div className="dtr-sign-block">
      <div className="dtr-sign-space" />
      <div className="dtr-sign-name">{name || '\u00a0'}</div>
      <div className="dtr-sign-caption">{caption}</div>
      {note && <div className="dtr-sign-note">{note}</div>}
    </div>
  );
}

function Sheet({ emp, settings, onPick }) {
  return (
    <section className="dtr-sheet">
      <div className="dtr-panels">
        {emp.panels.map((p) => <Panel key={p.label} emp={emp} panel={p} settings={settings} onPick={onPick} />)}
      </div>
      <div className="dtr-sign">
        <SignBlock name={emp.name} caption="SIGNATURE" note="Verified as to the prescribed office hours." />
        <div className="dtr-sign-gap" />
        <SignBlock name={settings.head} caption={settings.headTitle} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ page */
export { Sheet, DEFAULTS, loadSettings };
export default function DtrPrint({ onLock, signOut }) {
  const [end, setEnd] = useState(initialEnd);
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [marks, setMarks] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(loadSettings);
  const [sel, setSel] = useState(''); // '' = nothing, ALL = bulk, otherwise an employee_no
  const [showEmpty, setShowEmpty] = useState(false);
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState(null); // { emp, row }
  const [busy, setBusy] = useState(false);

  const { from, to } = useMemo(() => periodFromEnd(end), [end]);
  const fromStr = ymd(from);
  const toStr = ymd(to);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

  useEffect(() => {
    window.history.replaceState(null, '', `/?view=dtr&end=${end.y}-${pad(end.m)}`);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // One extra day on each side so the morning time-out of a night shift is never cut off.
        const [a, e, m] = await Promise.all([
          adminFetch(`/attendance?from=${ymd(addDays(from, -1))}&to=${ymd(addDays(to, 1))}`),
          adminFetch('/employees?all=1'),
          adminFetch(`/dtr/marks?from=${fromStr}&to=${toStr}`),
        ]);
        if ([a, e, m].some((r) => r.status === 401)) return onLock('Your session expired. Please sign in again.');
        if (!a.ok || !e.ok) throw new Error();
        const [logRows, empRows, markRows] = await Promise.all([a.json(), e.json(), m.ok ? m.json() : []]);
        if (cancelled) return;
        setLogs(logRows);
        setEmployees(empRows);
        setMarks(new Map(markRows.map((x) => [`${x.scope}|${x.date}`, x.type])));
        setError(m.ok ? '' : 'Could not load OFF / Holiday marks. Run "php artisan migrate" on the backend.');
      } catch {
        if (!cancelled) setError('Unable to load data. Check that Laravel and MySQL are running.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromStr, toStr]);

  const all = useMemo(
    () => buildDtr({ logs, employees, from, to, marks, fillBreak: showsBreak(settings.official), officialStart: officialRange(settings.official)?.start ?? null, grace: Number(settings.grace) || 0 }),
    [logs, employees, marks, fromStr, toStr, settings.official, settings.grace],
  );
  const hasMarks = (e) => e.panels.some((p) => p.rows.some((r) => r.mark === 'OFF'));
  const withRecords = all.filter((e) => e.punchDays > 0 || hasMarks(e));
  // Bulk: everyone with punches (or OFF marks) in this cut-off; optionally also those without any record.
  const shown = sel === ALL ? (showEmpty ? all : withRecords) : all.filter((e) => e.no === sel);

  // Search by employee ID (or name); exact ID matches come first.
  const q = query.trim().toLowerCase();
  const matches = q
    ? all
        .filter((e) => e.no.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
        .sort((a, b) => Number(b.no.toLowerCase() === q) - Number(a.no.toLowerCase() === q))
        .slice(0, 8)
    : [];
  const choose = (e) => { setSel(e.no); setQuery(''); };
  const onSearchKey = (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const hit = all.find((e) => e.no.toLowerCase() === q) || (matches.length === 1 ? matches[0] : null);
    if (hit) choose(hit);
  };

  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));
  const isLatest = end.y === currentEnd().y && end.m === currentEnd().m;

  async function saveMarks(list) {
    setBusy(true);
    try {
      const r = await adminFetch('/dtr/marks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks: list }),
      });
      if (r.status === 401) { onLock('Your session expired. Please sign in again.'); return false; }
      if (!r.ok) throw new Error();
      setMarks((prev) => {
        const next = new Map(prev);
        list.forEach((m) => { const k = `${m.scope}|${m.date}`; if (m.type) next.set(k, m.type); else next.delete(k); });
        return next;
      });
      return true;
    } catch {
      toast.error('Unable to save. Make sure the backend is updated and migrated.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function apply(list) {
    if (await saveMarks(list)) setPick(null);
  }

  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const punchDates = (emp) => new Set(emp.panels.flatMap((p) => p.rows.filter((r) => r.hasPunch).map((r) => r.date)));

  const weekendsOff = (emp) => {
    const worked = punchDates(emp);
    return days
      .filter((d) => (d.getDay() === 0 || d.getDay() === 6) && !worked.has(ymd(d)))
      .map((d) => ({ scope: emp.no, date: ymd(d), type: 'OFF' }));
  };
  const clearOff = (emp) =>
    days.filter((d) => marks.get(`${emp.no}|${ymd(d)}`) === 'OFF').map((d) => ({ scope: emp.no, date: ymd(d), type: null }));

  const pEmp = pick?.emp;
  const pDate = pick?.row.date;
  const empMark = pick ? marks.get(`${pEmp.no}|${pDate}`) : null;
  const globalMark = pick ? marks.get(`*|${pDate}`) : null;
  const markScope = pick?.scope || 'all'; // who a Holiday / Suspended mark applies to
  const markTarget = markScope === 'all' ? '*' : pEmp?.no;

  return (
    <main className="mx-auto w-full max-w-9xl space-y-5 px-4 py-6 print:p-0 sm:px-6">
      <div className="space-y-5 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Admin</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">Print DTR</h2>
            <p className="mt-1 text-sm text-muted-foreground">Civil Service Form No. 48 · cut-off {fmtLong(from)} → {fmtLong(to)}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge>Super admin</Badge>
            <Button variant="outline" onClick={() => { window.location.href = '/?view=logs'; }}><IconArrowLeft /> Logs</Button>
            <Button variant="outline" onClick={signOut}><IconLock /> Lock</Button>
          </div>
        </div>

        <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Cut-off</Label>
            <div className="inline-flex items-center rounded-lg border bg-card shadow-sm">
              <Button variant="ghost" size="icon" className="rounded-r-none" onClick={() => setEnd((e) => shiftEnd(e, -1))} aria-label="Previous cut-off"><IconChevronLeft /></Button>
              <button onClick={() => setEnd(currentEnd())} disabled={isLatest} className="h-9 border-x px-3 text-sm font-medium hover:bg-accent disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent">Current</button>
              <Button variant="ghost" size="icon" className="rounded-l-none" disabled={isLatest} onClick={() => setEnd((e) => shiftEnd(e, 1))} aria-label="Next cut-off"><IconChevronRight /></Button>
            </div>
          </div>
          <div className="relative space-y-2">
            <Label htmlFor="dtr-emp">Employee ID</Label>
            <Input id="dtr-emp" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} placeholder="Type employee ID, then Enter" autoComplete="off" autoFocus />
            {q && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border bg-card shadow-lg">
                {matches.length ? matches.map((e) => (
                  <button key={e.no} type="button" onClick={() => choose(e)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
                    <span className="font-medium">{e.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{e.no}</span>
                  </button>
                )) : <p className="px-3 py-2 text-sm text-muted-foreground">No employee found.</p>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
              <button type="button" onClick={() => { setSel(ALL); setQuery(''); }} className={`font-medium hover:underline ${sel === ALL ? 'text-foreground' : 'text-primary'}`}>
                Print all employees with records ({withRecords.length})
              </button>
              {sel && <span className="text-muted-foreground">Showing: {sel === ALL ? 'all employees' : all.find((e) => e.no === sel)?.name || sel}</span>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dtr-hours">Official hours</Label>
            <Input id="dtr-hours" value={settings.official} onChange={set('official')} placeholder="8:00 AM - 5:00 PM" />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => window.print()} disabled={!shown.length}><IconPrinter /> Print {shown.length > 1 ? `${shown.length} DTRs` : 'DTR'}</Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dtr-grace">Grace period (minutes)</Label>
            <Input id="dtr-grace" type="number" min="0" max="60" value={settings.grace} onChange={set('grace')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dtr-reg">Regular days (optional)</Label>
            <Input id="dtr-reg" value={settings.regularDays} onChange={set('regularDays')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dtr-sat">Saturdays (optional)</Label>
            <Input id="dtr-sat" value={settings.saturdays} onChange={set('saturdays')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dtr-head">Department head</Label>
            <Input id="dtr-head" value={settings.head} onChange={set('head')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dtr-title">Title</Label>
            <Input id="dtr-title" value={settings.headTitle} onChange={set('headTitle')} />
          </div>
          {sel === ALL && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
              Include employees with no records in this cut-off
            </label>
          )}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            8-hour official hours (e.g. 8:00 AM - 5:00 PM) print 12:00 NN / 1:00 PM in between. 12-hour official hours (e.g. 7:00 AM - 7:00 PM) print only the real time in and time out. A time in within the grace period after the official start prints as the official start (8:14 AM with an 8:00 AM start prints as 8:00 AM); early arrivals print as punched.
          </p>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}
        <p className="text-sm text-muted-foreground">
          Tip: click a day number on the form to mark it OFF, Holiday or Suspended. Each punch is printed on its own date by clock time (before 12:00 NN = Morning, after = Afternoon), so night shifts show Time In under PM and Time Out under AM of the next day.
        </p>
      </div>

      <div className="dtr-stage">
        {loading && <p className="py-12 text-center text-sm text-muted-foreground print:hidden">Loading…</p>}
        {!loading && !shown.length && <p className="py-12 text-center text-sm text-muted-foreground print:hidden">Search an employee ID above, or choose all employees, to show the DTR.</p>}
        {shown.map((emp) => <Sheet key={emp.no} emp={emp} settings={settings} onPick={(e, row) => setPick({ emp: e, row })} />)}
      </div>

      <Dialog
        open={!!pick}
        onClose={() => setPick(null)}
        className="max-w-3xl"
        title={pEmp ? `${pEmp.name} · ${pDate ? new Date(`${pDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : ''}` : 'Day'}
        description="Choose what to print on this day when there is no punch."
      >
        {pick && (() => {
          const tiles = [
            { type: 'OFF', sub: 'This employee only', target: pEmp.no, active: empMark === 'OFF' },
            { type: 'HOLIDAY', sub: markScope === 'all' ? 'Everyone' : 'This employee only', target: markTarget, active: marks.get(`${markTarget}|${pDate}`) === 'HOLIDAY' },
            { type: 'SUSPENDED', sub: markScope === 'all' ? 'Everyone' : 'This employee only', target: markTarget, active: marks.get(`${markTarget}|${pDate}`) === 'SUSPENDED' },
          ];
          return (
            <div className="space-y-5">
              {(empMark || globalMark) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
                  <p className="text-sm font-medium text-amber-900">Already marked on this day. Wrong? Remove it.</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {globalMark && (
                      <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-white py-1 pl-3 pr-1">
                        <span className="text-sm"><b>{globalMark}</b> · everyone</span>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => apply([{ scope: '*', date: pDate, type: null }])}>Remove</Button>
                      </div>
                    )}
                    {empMark && (
                      <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-white py-1 pl-3 pr-1">
                        <span className="text-sm"><b>{empMark}</b> · this employee</span>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => apply([{ scope: pEmp.no, date: pDate, type: null }])}>Remove</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">What should this day show?</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Holiday / Suspended for</span>
                    <div className="inline-flex rounded-md border bg-muted/40 p-0.5 font-medium" role="group" aria-label="Applies to">
                      {[['all', 'Everyone'], ['one', 'This employee']].map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setPick((x) => ({ ...x, scope: k }))} className={`rounded px-2.5 py-1 transition-colors ${markScope === k ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:text-foreground'}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {tiles.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      disabled={busy}
                      onClick={() => apply([{ scope: t.target, date: pDate, type: t.active ? null : t.type }])}
                      className={`rounded-lg border p-4 text-left transition-colors disabled:opacity-60 ${t.active ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent'}`}
                    >
                      <span className="block text-base font-semibold tracking-tight">{t.type}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t.sub}</span>
                      <span className={`mt-2 block text-xs font-medium ${t.active ? 'text-primary' : 'text-transparent'}`} aria-hidden={!t.active}>Selected · tap again to remove</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Staff who work on that day still print their real times instead of the label.</p>
                {pick.row.hasPunch && (empMark || globalMark) && (
                  <p className="text-xs font-medium text-amber-700">This employee has punches on this day, so their times are printed{empMark === 'OFF' ? ' and the empty spaces show OFF' : ' instead of the label'}.</p>
                )}
              </section>

              <section className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div>
                  <p className="text-sm font-medium">Quick actions for {pEmp.name}</p>
                  <p className="text-xs text-muted-foreground">Whole cut-off. Days with punches are skipped.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => apply(weekendsOff(pEmp))}>Weekends OFF</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { const l = clearOff(pEmp); if (l.length) apply(l); else setPick(null); }}>Clear all OFF</Button>
                </div>
              </section>
            </div>
          );
        })()}
      </Dialog>
    </main>
  );
}