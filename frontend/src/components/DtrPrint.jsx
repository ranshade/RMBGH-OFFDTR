import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { adminFetch } from '../lib';
import { Button } from './ui/button';
import { Input, Label, Select } from './ui/input';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Dialog } from './ui/dialog';
import { IconArrowLeft, IconChevronLeft, IconChevronRight, IconLock, IconPrinter } from './ui/icons';
import { buildDtr, currentEnd, periodFromEnd, shiftEnd, showsBreak, ymd } from '../dtr';

const SETTINGS_KEY = 'dtr_settings';
const DEFAULTS = {
  official: '8:00 AM - 5:00 PM',
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
function Panel({ emp, panel, settings, onPick }) {
  return (
    <div className="dtr-panel">
      <div className="dtr-formno">Civil Service Form No. 48</div>
      <div className="dtr-title">DAILY TIME RECORD</div>
      <div className="dtr-name">{emp.name}</div>
      <div className="dtr-namelabel">NAME</div>
      <div className="dtr-field"><span>For the Month of:</span><b>{panel.label}</b></div>
      <div className="dtr-field"><span>Official Hours:</span><b>{settings.official}</b></div>
      <div className="dtr-field"><span>For Arrival &amp; Departure Regular Days:</span><b>{settings.regularDays}</b></div>
      <div className="dtr-field dtr-right"><span>Saturdays:</span><b>{settings.saturdays}</b></div>

      <table className="dtr-table">
        <colgroup>
          <col style={{ width: '8%' }} />
          <col style={{ width: '17%' }} /><col style={{ width: '17%' }} /><col style={{ width: '17%' }} /><col style={{ width: '17%' }} />
          <col style={{ width: '12%' }} /><col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>Days</th>
            <th colSpan={2}>Morning</th>
            <th colSpan={2}>Afternoon</th>
            <th colSpan={2}>Overtime</th>
          </tr>
          <tr>
            <th>Arrived</th><th>Departure</th><th>Arrived</th><th>Departure</th><th>Hours</th><th>Minutes</th>
          </tr>
        </thead>
        <tbody>
          {panel.rows.map((r) => (
            <tr key={r.day} className={r.inRange && onPick ? 'dtr-edit' : ''}>
              <td className="dtr-day">
                {r.inRange && onPick
                  ? <button type="button" title="Mark OFF / Holiday / Suspended" onClick={() => onPick(emp, r)}>{r.day}</button>
                  : r.day}
              </td>
              {!r.inRange && <><td /><td /><td /><td /></>}
              {r.inRange && r.full === 'OFF' && ['a', 'b', 'c', 'd'].map((k) => <td key={k} className="dtr-off">OFF</td>)}
              {r.inRange && (r.full === 'HOLIDAY' || r.full === 'SUSPENDED') && <td colSpan={4} className="dtr-merged">{r.full}</td>}
              {r.inRange && !r.full && ['mA', 'mD', 'aA', 'aD'].map((k) => (
                <td key={k} className={r.cells[k] === 'OFF' ? 'dtr-off' : ''}>{r.cells[k]}</td>
              ))}
              <td /><td />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dtr-cert">{CERTIFICATION}</p>
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
        <div className="dtr-sign-line" />
        <div className="dtr-sign-label">SIGNATURE</div>
        <div className="dtr-sign-note">Verified as to the prescribed office hours.</div>
        <div className="dtr-head">{settings.head}</div>
        <div className="dtr-head-title">{settings.headTitle}</div>
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
  const [sel, setSel] = useState(''); // selected employee_no
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
    () => buildDtr({ logs, employees, from, to, marks, fillBreak: showsBreak(settings.official) }),
    [logs, employees, marks, fromStr, toStr, settings.official],
  );
  const shown = all.filter((e) => e.no === sel);

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
          </div>
          <div className="space-y-2">
            <Label htmlFor="dtr-hours">Official hours</Label>
            <Input id="dtr-hours" value={settings.official} onChange={set('official')} placeholder="8:00 AM - 5:00 PM" />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => window.print()} disabled={!shown.length}><IconPrinter /> Print DTR</Button>
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
          <p className="text-xs text-muted-foreground sm:col-span-2">
            8-hour official hours (e.g. 8:00 AM - 5:00 PM) print 12:00 NN / 1:00 PM in between. 12-hour official hours (e.g. 7:00 AM - 7:00 PM) print only the real time in and time out.
          </p>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}
        <p className="text-sm text-muted-foreground">
          Tip: click a day number on the form to mark it OFF, Holiday or Suspended. Each punch is printed on its own date by clock time (before 12:00 NN = Morning, after = Afternoon), so night shifts show Time In under PM and Time Out under AM of the next day.
        </p>
      </div>

      <div className="dtr-stage">
        {loading && <p className="py-12 text-center text-sm text-muted-foreground print:hidden">Loading…</p>}
        {!loading && !shown.length && <p className="py-12 text-center text-sm text-muted-foreground print:hidden">Search an employee ID above to show their DTR.</p>}
        {shown.map((emp) => <Sheet key={emp.no} emp={emp} settings={settings} onPick={(e, row) => setPick({ emp: e, row })} />)}
      </div>

      <Dialog open={!!pick} onClose={() => setPick(null)} title={pEmp ? `${pEmp.name} · ${pDate ? new Date(`${pDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : ''}` : 'Day'} description="Choose what to print for this day when there is no punch.">
        {pick && (
          <div className="space-y-2">
            <Button className="w-full justify-start" variant={empMark === 'OFF' ? 'default' : 'outline'} disabled={busy} onClick={() => apply([{ scope: pEmp.no, date: pDate, type: 'OFF' }])}>OFF — this employee only</Button>
            <Button className="w-full justify-start" variant={globalMark === 'HOLIDAY' ? 'default' : 'outline'} disabled={busy} onClick={() => apply([{ scope: '*', date: pDate, type: 'HOLIDAY' }])}>HOLIDAY — all employees</Button>
            <Button className="w-full justify-start" variant={globalMark === 'SUSPENDED' ? 'default' : 'outline'} disabled={busy} onClick={() => apply([{ scope: '*', date: pDate, type: 'SUSPENDED' }])}>SUSPENDED — all employees</Button>
            {empMark && <Button className="w-full justify-start" variant="ghost" disabled={busy} onClick={() => apply([{ scope: pEmp.no, date: pDate, type: null }])}>Clear OFF for this employee</Button>}
            {globalMark && <Button className="w-full justify-start" variant="ghost" disabled={busy} onClick={() => apply([{ scope: '*', date: pDate, type: null }])}>Clear {globalMark.toLowerCase()} for all employees</Button>}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">Bulk for {pEmp.name} (this cut-off). Days with punches are skipped.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => apply(weekendsOff(pEmp))}>Weekends OFF</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { const l = clearOff(pEmp); if (l.length) apply(l); else setPick(null); }}>Clear all OFF</Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </main>
  );
}
