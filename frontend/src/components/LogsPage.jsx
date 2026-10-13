import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '../lib';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input, Label, Select } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs } from './ui/tabs';
import { Alert } from './ui/alert';
import { toast } from 'sonner';
import { PunchPhoto, PhotoViewer } from './PunchPhoto';
import { Dialog } from './ui/dialog';
import { IconArrowLeft, IconCalendar, IconChevronLeft, IconChevronRight, IconDownload, IconLock, IconPencil, IconPrinter, IconSearch } from './ui/icons';

/* Government DTR cut-off: 26th of the previous month up to the 25th of the period's month. */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// A period is identified by the month in which it ENDS (e.g. Oct 2026 = Sep 26 – Oct 25).
function currentPeriodEnd() {
  const t = new Date();
  return t.getDate() >= 26 ? { y: t.getFullYear(), m: t.getMonth() + 1 } : { y: t.getFullYear(), m: t.getMonth() };
}
const periodRange = ({ y, m }) => ({ from: new Date(y, m - 1, 26), to: new Date(y, m, 25) }); // Date() rolls over months/years
const shift = ({ y, m }, delta) => {
  const d = new Date(y, m + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtLong = (d) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const initials = (n) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const isOut = (ev) => String(ev).toUpperCase().includes('OUT');
const toLocalInput = (iso) => { const d = new Date(iso); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function StatCard({ label, value, hint }) {
  return (
    <Card>
      <CardHeader tight><CardDescription className="font-medium">{label}</CardDescription></CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function LogsPage({ onLock, signOut }) {
  const [end, setEnd] = useState(currentPeriodEnd);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('dtr'); // dtr | punches
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { uuid, title }
  const [edit, setEdit] = useState(null); // { mode: 'edit' | 'add', uuid?, no, name, event, value }
  const [saving, setSaving] = useState(false);

  const { from, to } = useMemo(() => periodRange(end), [end]);
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const latestEnd = currentPeriodEnd();
  const isLatest = end.y === latestEnd.y && end.m === latestEnd.m;

  // Days until the 25th (submission day) for the running period.
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((to - midnight) / 86400000);

  async function load() {
    setLoading(true);
    try {
      // Fetch one extra day on each side so overnight shifts at the cut-off edges can still be paired.
      const r = await adminFetch(`/attendance?from=${ymd(addDays(from, -1))}&to=${ymd(addDays(to, 1))}`);
      if (r.status === 401) return onLock('Your session expired. Please sign in again.');
      if (!r.ok) throw new Error();
      setLogs(await r.json());
      setError('');
    } catch {
      setError('Unable to load attendance logs. Check that Laravel and MySQL are running.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [fromStr, toStr]);

  // CSV needs the admin token, so download it through fetch instead of a plain link.
  async function exportCsv() {
    try {
      const r = await adminFetch(`/reports/attendance.csv?from=${fromStr}&to=${toStr}`);
      if (r.status === 401) return onLock('Your session expired. Please sign in again.');
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${fromStr}-to-${toStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Unable to export CSV.');
    }
  }

  const dayOf = (l) => String(l.attendance_date).slice(0, 10);
  const inPeriod = (day) => day >= fromStr && day <= toStr;

  // Search applies to everything; `logs` also holds the 1-day margins used for pairing.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => `${l.employee?.full_name || ''} ${l.employee_no_snapshot}`.toLowerCase().includes(q));
  }, [logs, search]);

  // Punches that belong to the selected cut-off (for the "All punches" tab and counts).
  const filtered = useMemo(() => searched.filter((l) => inPeriod(dayOf(l))), [searched, fromStr, toStr]);

  // DTR summary: pair each TIME IN with the next TIME OUT, so 8h, 12h and overnight shifts
  // show as one row (listed under the date of the TIME IN) with the hours worked.
  const dtr = useMemo(() => {
    const byEmp = new Map();
    [...searched].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)).forEach((l) => {
      const key = l.employee_no_snapshot;
      if (!byEmp.has(key)) byEmp.set(key, { no: key, name: l.employee?.full_name || key, punches: [] });
      byEmp.get(key).punches.push({ out: isOut(l.event_type), day: dayOf(l), time: fmtTime(l.recorded_at), uuid: l.record_uuid, event: l.event_type, at: l.recorded_at, status: l.status });
    });

    const result = [];
    byEmp.forEach((emp) => {
      const sessions = [];
      let open = null;
      emp.punches.forEach((p) => {
        if (!p.out) {
          if (open) sessions.push(open); // previous shift has no time out
          open = { inP: p, outP: null };
        } else if (open) {
          open.outP = p;
          sessions.push(open);
          open = null;
        } else {
          sessions.push({ inP: null, outP: p }); // time out without a time in
        }
      });
      if (open) sessions.push(open);

      const rows = sessions
        .map((x) => ({ ...x, day: (x.inP || x.outP).day }))
        .filter((x) => inPeriod(x.day));
      if (rows.length) result.push({ no: emp.no, name: emp.name, rows });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [searched, fromStr, toStr]);

  const hoursText = (x) => {
    if (!x.inP || !x.outP) return null;
    const mins = Math.round((new Date(x.outP.at) - new Date(x.inP.at)) / 60000);
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  };

  const openPhoto = (name, p) =>
    setPreview({ uuid: p.uuid, title: `${name} · ${p.event} · ${new Date(p.at).toLocaleString()}` });

  const openEdit = (emp, p) =>
    setEdit({ mode: 'edit', uuid: p.uuid, no: emp.no, name: emp.name, event: isOut(p.event) ? 'TIME OUT' : 'TIME IN', value: toLocalInput(p.at) });
  const openAdd = (emp, event, hintAt) =>
    setEdit({ mode: 'add', no: emp.no, name: emp.name, event, value: hintAt ? toLocalInput(hintAt) : '' });

  async function saveEdit() {
    if (!edit?.value) return undefined;
    setSaving(true);
    try {
      const isEdit = edit.mode === 'edit';
      const r = await adminFetch(isEdit ? `/attendance/${edit.uuid}` : '/attendance/manual', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { recorded_at: edit.value, event_type: edit.event } : { employee_no: edit.no, event_type: edit.event, recorded_at: edit.value }),
      });
      if (r.status === 401) return onLock('Your session expired. Please sign in again.');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.message || 'Unable to save.'); return undefined; }
      toast.success(isEdit ? 'Time updated.' : 'Time added.');
      setEdit(null);
      await load();
    } catch {
      toast.error('Unable to save. Check that Laravel and MySQL are running.');
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  // emp = { no, name }. `missing` / `hintAt` are used for the "Add" button when the punch is absent.
  const renderPunch = (emp, p, otherDay, missing, hintAt) =>
    p ? (
      <div className="flex items-center gap-2">
        {p.status === 'manual'
          ? <Badge variant="secondary" className="px-1.5 text-[10px]">Manual</Badge>
          : <PunchPhoto uuid={p.uuid} label={`${emp.name} ${p.event}`} onOpen={() => openPhoto(emp.name, p)} />}
        <span className="tabular-nums">{p.time}</span>
        {otherDay && p.day !== otherDay && <Badge variant="secondary" className="px-1.5 text-[10px]">+1 day</Badge>}
        {p.status === 'edited' && <Badge variant="warning" className="px-1.5 text-[10px]">Edited</Badge>}
        <button type="button" onClick={() => openEdit(emp, p)} aria-label={`Edit time: ${emp.name}`} title="Edit time" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><IconPencil width={14} height={14} /></button>
      </div>
    ) : (
      <span className="inline-flex items-center gap-2">
        <span className="text-muted-foreground">—</span>
        <button type="button" onClick={() => openAdd(emp, missing, hintAt)} className="text-xs font-medium text-primary hover:underline">Add</button>
      </span>
    );

  const daysRecorded = dtr.reduce((n, e) => n + new Set(e.rows.map((r) => r.day)).size, 0);
  const monthLabel = to.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  let status;
  if (!isLatest) status = <Badge variant="secondary">Closed</Badge>;
  else if (daysLeft <= 0) status = <Badge variant="warning">Submission due today</Badge>;
  else status = <Badge variant="warning">{daysLeft} day{daysLeft === 1 ? '' : 's'} left</Badge>;

  const empty = (mode === 'dtr' ? !dtr.length : !filtered.length) && !error;

  return (
    <main className="mx-auto w-full max-w-9xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Attendance Logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cut-off runs from the 26th to the 25th of each month for DTR submission.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge>Super admin</Badge>
          <Button variant="outline" onClick={() => { window.location.href = '/?view=manage'; }}><IconArrowLeft /> Employees</Button>
          <Button variant="outline" onClick={signOut}><IconLock /> Lock</Button>
        </div>
      </div>

      {/* DTR cut-off card */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><IconCalendar width={22} height={22} /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">DTR cut-off · {monthLabel}</p>
                {isLatest && <Badge>Current period</Badge>}
                {status}
              </div>
              <p className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">{fmtLong(from)} <span className="font-normal text-muted-foreground">→</span> {fmtLong(to)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border bg-card shadow-sm">
              <Button variant="ghost" size="icon" className="rounded-r-none" onClick={() => setEnd((e) => shift(e, -1))} aria-label="Previous cut-off"><IconChevronLeft /></Button>
              <button
                onClick={() => setEnd(currentPeriodEnd())}
                disabled={isLatest}
                className="h-9 border-x px-3 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent"
              >
                Current
              </button>
              <Button variant="ghost" size="icon" className="rounded-l-none" disabled={isLatest} onClick={() => setEnd((e) => shift(e, 1))} aria-label="Next cut-off"><IconChevronRight /></Button>
            </div>
            <Button variant="outline" onClick={() => { window.location.href = `/?view=dtr&end=${to.getFullYear()}-${pad(to.getMonth() + 1)}`; }}><IconPrinter /> Print DTR</Button>
            <Button onClick={exportCsv}><IconDownload /> Export CSV</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Employees with records" value={dtr.length} hint="In this cut-off" />
        <StatCard label="Total punches" value={filtered.length} hint="Time in and time out" />
        <StatCard label="Days with records" value={daysRecorded} hint="Employee-days logged" />
      </div>

      <Card>
        <CardHeader row>
          <div className="space-y-1.5">
            <CardTitle className="text-lg">{mode === 'dtr' ? 'DTR summary' : 'All punches'}</CardTitle>
            <CardDescription>{loading ? 'Loading…' : `${fmtLong(from)} – ${fmtLong(to)}`}</CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-72 sm:flex-none">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or ID" aria-label="Filter logs" />
            </div>
            <Tabs value={mode} onChange={setMode} items={[['dtr', 'DTR summary'], ['punches', 'All punches']]} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && <div className="px-6 pb-4"><Alert variant="destructive">{error}</Alert></div>}
          <div className="border-t">
            {mode === 'dtr' ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Employee</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time in</TableHead>
                    <TableHead>Time out</TableHead>
                    <TableHead className="pr-6">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dtr.flatMap((emp) =>
                    emp.rows.map((x, i) => (
                      <TableRow key={`${emp.no}-${x.day}-${x.inP?.uuid || x.outP?.uuid}`} className={i === 0 ? 'border-t-2' : 'border-b-0'}>
                        <TableCell className="py-2 pl-6">
                          {i === 0 && (
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(emp.name)}</div>
                              <span className="font-medium">{emp.name}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2 font-mono text-xs text-muted-foreground">{i === 0 ? emp.no : ''}</TableCell>
                        <TableCell className="py-2">{fmtDay(x.day)}</TableCell>
                        <TableCell className="py-2">{renderPunch(emp, x.inP, undefined, 'TIME IN', x.outP?.at)}</TableCell>
                        <TableCell className="py-2">{renderPunch(emp, x.outP, x.inP?.day, 'TIME OUT', x.inP?.at)}</TableCell>
                        <TableCell className="py-2 pr-6 tabular-nums">{hoursText(x) || <span className="text-muted-foreground">—</span>}</TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Employee</TableHead>
                    <TableHead>Photo</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Date &amp; time</TableHead>
                    <TableHead className="pr-6">Station</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.record_uuid}>
                      <TableCell className="pl-6">
                        <div className="font-medium">{l.employee?.full_name || l.employee_no_snapshot}</div>
                        <div className="font-mono text-xs text-muted-foreground">{l.employee_no_snapshot}</div>
                      </TableCell>
                      <TableCell>
                        <PunchPhoto
                          uuid={l.record_uuid}
                          label={`${l.employee?.full_name || l.employee_no_snapshot} ${l.event_type}`}
                          onOpen={() => openPhoto(l.employee?.full_name || l.employee_no_snapshot, { uuid: l.record_uuid, event: l.event_type, at: l.recorded_at })}
                        />
                      </TableCell>
                      <TableCell><Badge variant={isOut(l.event_type) ? 'warning' : 'default'}>{l.event_type}</Badge></TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          {new Date(l.recorded_at).toLocaleString()}
                          {l.status === 'edited' && <Badge variant="warning" className="px-1.5 text-[10px]">Edited</Badge>}
                          {l.status === 'manual' && <Badge variant="secondary" className="px-1.5 text-[10px]">Manual</Badge>}
                          <button type="button" onClick={() => openEdit({ no: l.employee_no_snapshot, name: l.employee?.full_name || l.employee_no_snapshot }, { uuid: l.record_uuid, event: l.event_type, at: l.recorded_at })} aria-label="Edit time" title="Edit time" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><IconPencil width={14} height={14} /></button>
                        </span>
                      </TableCell>
                      <TableCell className="pr-6">{l.station_code || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {empty && <p className="py-12 text-center text-sm text-muted-foreground">{loading ? 'Loading…' : 'No attendance records for this cut-off period.'}</p>}
          </div>
          {mode === 'dtr' && dtr.length > 0 && (
            <p className="border-t px-6 py-2.5 text-xs text-muted-foreground">Each row is one shift: a TIME IN paired with the next TIME OUT, listed under the date of the TIME IN. A missing time in or out is shown as —.</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit ? `${edit.mode === 'edit' ? 'Edit time' : 'Add time'} · ${edit.name}` : 'Edit time'}
        description={edit?.mode === 'add' ? 'Add a missing punch. It is saved without a photo and marked Manual.' : 'Correct this punch. It will be marked Edited.'}
      >
        {edit && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-event">Event</Label>
              <Select id="edit-event" value={edit.event} onChange={(e) => setEdit((s) => ({ ...s, event: e.target.value }))}>
                <option value="TIME IN">TIME IN</option>
                <option value="TIME OUT">TIME OUT</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-time">Date &amp; time</Label>
              <Input id="edit-time" type="datetime-local" data-autofocus value={edit.value} onChange={(e) => setEdit((s) => ({ ...s, value: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Night shift: set the TIME OUT to the next day&apos;s date.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEdit(null)} disabled={saving}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving || !edit.value}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.title || 'Photo'} className="max-w-2xl">
        {preview && <PhotoViewer uuid={preview.uuid} />}
      </Dialog>
    </main>
  );
}
