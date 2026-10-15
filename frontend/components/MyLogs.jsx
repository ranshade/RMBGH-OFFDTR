import { useEffect, useMemo, useState } from 'react';
import { API } from '../lib';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input, Label } from './ui/input';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { card, eyebrow, footNote, pageDesc, pageTitle, segment, segmentCurrent, th, tr } from './ui/theme';
import { IconChevronLeft, IconChevronRight, IconPrinter, IconSearch } from './ui/icons';
import { buildDtr, currentEnd, isOutEvent, periodFromEnd, shiftEnd, showsBreak, ymd } from '../dtr';
import { Sheet, loadSettings } from './DtrPrint';

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtLong = (d) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const hm = (mins) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

/* Public page: an employee looks up their own punches by ID (read-only, no photos). */
export default function MyLogs() {
  const [idInput, setIdInput] = useState('');
  const [empNo, setEmpNo] = useState('');
  const [end, setEnd] = useState(currentEnd);
  const [data, setData] = useState(null); // { employee, logs }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(loadSettings);

  const { from, to } = useMemo(() => periodFromEnd(end), [end]);
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const isLatest = end.y === currentEnd().y && end.m === currentEnd().m;

  useEffect(() => {
    if (!empNo) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // One extra day on each side so overnight shifts at the cut-off edges are paired correctly.
        const r = await fetch(`${API}/attendance/my?employee_no=${encodeURIComponent(empNo)}&from=${ymd(addDays(from, -1))}&to=${ymd(addDays(to, 1))}`, { headers: { Accept: 'application/json' } });
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) { setData(null); setError(r.status === 429 ? 'Too many requests. Please wait a minute.' : d.message || 'Unable to load logs.'); return; }
        setData(d);
        setError('');
      } catch {
        if (!cancelled) { setData(null); setError('Cannot reach the server. Please try again.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [empNo, fromStr, toStr]);

  function submit(e) {
    e.preventDefault();
    const v = idInput.trim();
    if (v) { setData(null); setError(''); setEmpNo(v); }
  }

  // Pair each TIME IN with the next TIME OUT (listed under the date of the TIME IN).
  const rows = useMemo(() => {
    if (!data) return [];
    const punches = data.logs.map((l) => ({ out: isOutEvent(l.event_type), at: new Date(l.recorded_at) }));
    const sessions = [];
    let open = null;
    punches.forEach((p) => {
      if (!p.out) { if (open) sessions.push(open); open = { inP: p, outP: null }; }
      else if (open) { open.outP = p; sessions.push(open); open = null; }
      else sessions.push({ inP: null, outP: p });
    });
    if (open) sessions.push(open);
    return sessions
      .map((x) => ({ ...x, day: ymd((x.inP || x.outP).at) }))
      .filter((x) => x.day >= fromStr && x.day <= toStr);
  }, [data, fromStr, toStr]);

  // Same Civil Service Form No. 48 as the admin prints (night shifts: IN under PM, OUT under AM of the next day).
  const dtrEmp = useMemo(() => {
    if (!data) return null;
    const no = data.employee.employee_no;
    const logs = data.logs.map((l, i) => ({ ...l, id: i, employee_no_snapshot: no }));
    const marks = new Map((data.marks || []).map((m) => [`${m.scope}|${m.date}`, m.type]));
    return buildDtr({ logs, employees: [{ employee_no: no, full_name: data.employee.full_name, status: 'active' }], from, to, marks, fillBreak: showsBreak(settings.official) })[0];
  }, [data, fromStr, toStr, settings.official]);

  const minutes = (x) => (x.inP && x.outP ? Math.round((x.outP.at - x.inP.at) / 60000) : null);
  const total = rows.reduce((n, x) => n + (minutes(x) || 0), 0);

  return (
    <main className="mx-auto w-full max-w-9xl space-y-6 px-4 py-8 print:p-0 sm:px-6">
      <div className="space-y-5 print:hidden">
      <div>
        <p className={eyebrow}>Employee</p>
        <h2 className={pageTitle}>My Logs</h2>
        <p className={pageDesc}>Enter your employee ID to see your own time in and time out.</p>
      </div>

      <Card className={card}>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1 space-y-2">
              <Label htmlFor="my-id">Employee ID</Label>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="my-id" className="pl-9" value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="Type your employee ID" autoComplete="off" autoFocus />
              </div>
            </div>
            <Button type="submit" disabled={!idInput.trim() || loading}>{loading ? 'Loading…' : 'View logs'}</Button>
          </form>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}

      {data && (
        <Card className={card}>
          <CardHeader row>
            <div className="space-y-1.5">
              <CardTitle className="text-lg font-semibold text-slate-900">{data.employee.full_name}</CardTitle>
              <CardDescription>{data.employee.employee_no} · {fmtLong(from)} – {fmtLong(to)}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="my-hours" className="whitespace-nowrap">Official hours</Label>
                <Input id="my-hours" className="w-44" value={settings.official} onChange={(e) => setSettings((s) => ({ ...s, official: e.target.value }))} />
              </div>
              <Button variant="outline" onClick={() => window.print()} disabled={!dtrEmp}><IconPrinter /> Print DTR</Button>
            <div className={segment}>
              <Button variant="ghost" size="icon" className="rounded-r-none" onClick={() => setEnd((e) => shiftEnd(e, -1))} aria-label="Previous cut-off"><IconChevronLeft /></Button>
              <button onClick={() => setEnd(currentEnd())} disabled={isLatest} className={segmentCurrent}>Current</button>
              <Button variant="ghost" size="icon" className="rounded-l-none" disabled={isLatest} onClick={() => setEnd((e) => shiftEnd(e, 1))} aria-label="Next cut-off"><IconChevronRight /></Button>
            </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={`${th} pl-6`}>Date</TableHead>
                    <TableHead className={th}>Time in</TableHead>
                    <TableHead className={th}>Time out</TableHead>
                    <TableHead className={`${th} pr-6`}>Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((x) => (
                    <TableRow key={`${x.day}-${(x.inP || x.outP).at.getTime()}`} className={tr}>
                      <TableCell className="pl-6">{fmtDay(x.day)}</TableCell>
                      <TableCell className="tabular-nums">{x.inP ? fmtTime(x.inP.at) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="tabular-nums">
                        {x.outP ? (
                          <span className="inline-flex items-center gap-2">
                            {fmtTime(x.outP.at)}
                            {x.inP && ymd(x.outP.at) !== x.day && <Badge variant="secondary" className="px-1.5 text-[10px]">+1 day</Badge>}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="pr-6 tabular-nums">{minutes(x) != null ? hm(minutes(x)) : <span className="text-muted-foreground">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">{loading ? 'Loading…' : 'No records for this cut-off.'}</p>}
            </div>
            {rows.length > 0 && <p className={footNote}>Total hours (complete shifts): <b className="font-semibold text-slate-700">{hm(total)}</b>. A missing time in or out is shown as —.</p>}
          </CardContent>
        </Card>
      )}
      </div>

      {/* Printed form only (hidden on screen) */}
      {dtrEmp && (
        <div className="dtr-stage hidden print:block">
          <Sheet emp={dtrEmp} settings={settings} />
        </div>
      )}
    </main>
  );
}
