import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Tabs } from "./ui/tabs";
import { Alert } from "./ui/alert";
import { Input, Select } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  IconArrowLeft,
  IconChart,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconLock,
  IconSearch,
  IconShield,
} from "./ui/icons";
import { ymd } from "../dtr";
import {
  actionLabel,
  analyzeLogs,
  CATEGORIES,
  CATEGORY_LABEL,
  fetchSystemLogs,
  logsToCsv,
  SEVERITIES,
} from "../systemLogs";

const PAGE_SIZE = 20;
const RANGES = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
];

const addDays = (d, n) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const rangeDates = (key) => {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = key === "today" ? 0 : key === "7d" ? 6 : 29;
  return { from: addDays(to, -back), to };
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
const fmtShort = (d) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtDay = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const fmtStamp = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const fmtFull = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "medium",
  });
const initials = (n = "?") =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const show = (v) => (v == null || v === "" ? "—" : String(v));

const SEV = {
  info: { variant: "secondary", dot: "bg-slate-400", label: "Info" },
  warning: { variant: "warning", dot: "bg-amber-500", label: "Warning" },
  critical: {
    variant: "destructive",
    dot: "bg-rose-600",
    label: "Critical",
  },
};

function Stat({ label, value, sub, tone = "bg-sky-600" }) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className={`absolute inset-x-0 top-0 h-1 ${tone}`}
        aria-hidden="true"
      />
      <CardHeader tight className="pt-5">
        <CardDescription className="font-medium">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// Events per day, stacked by severity.
function ActivityChart({ days }) {
  const totals = days.map((d) => d.info + d.warning + d.critical);
  const max = Math.max(1, ...totals);
  const every = days.length > 16 ? 5 : days.length > 8 ? 2 : 1;
  return (
    <div>
      <div
        className="flex h-40 items-end gap-[3px]"
        role="img"
        aria-label="System events per day"
      >
        {days.map((d, i) => {
          const t = totals[i];
          return (
            <div
              key={d.date}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${fmtDay(d.date)}: ${t} events (${d.warning} warning, ${d.critical} critical)`}
            >
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                style={{ height: `${(t / max) * 100}%`, minHeight: t ? 3 : 0 }}
              >
                <div
                  className="bg-slate-300"
                  style={{ height: `${t ? (d.info / t) * 100 : 0}%` }}
                />
                <div
                  className="bg-amber-400"
                  style={{ height: `${t ? (d.warning / t) * 100 : 0}%` }}
                />
                <div
                  className="bg-rose-500"
                  style={{ height: `${t ? (d.critical / t) * 100 : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {days.map((d, i) => (
          <span
            key={d.date}
            className="min-w-0 flex-1 text-center text-[10px] tabular-nums text-slate-400"
          >
            {i % every === 0 ? new Date(`${d.date}T00:00:00`).getDate() : ""}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {[
          ["bg-slate-300", "Info"],
          ["bg-amber-400", "Warning"],
          ["bg-rose-500", "Critical"],
        ].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <i className={`h-2.5 w-2.5 rounded-sm ${c}`} /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// "Worth a look" findings, written from the data.
function buildFindings(a) {
  const out = [];
  a.bursts.forEach((b) =>
    out.push({
      tone: "rose",
      title: `${b.count} failed sign-ins in 15 minutes`,
      body: `From ${b.ip}, starting ${fmtStamp(b.at.toISOString())}. If this was not you or a coworker, change the admin password.`,
    }),
  );
  if (a.deletions.length)
    out.push({
      tone: "rose",
      title: `${plural(a.deletions.length, "punch")} deleted`,
      body: `Deleted punches cannot appear on a DTR. Latest: ${a.deletions[0].summary} Open the row to see the old values.`,
    });
  if (a.afterHours.length)
    out.push({
      tone: "amber",
      title: `${plural(a.afterHours.length, "admin action")} outside office hours`,
      body: "Made before 6 AM or after 9 PM. Worth confirming with whoever holds the admin account.",
    });
  const top = a.actors.find((x) => x.type === "admin" && x.changes >= 5);
  if (top)
    out.push({
      tone: "amber",
      title: `${top.name} made ${plural(top.changes, "attendance change")}`,
      body: "That is the most of any admin this period. Frequent hand edits can mean the kiosk or camera needs attention.",
    });
  if (a.drops >= 3)
    out.push({
      tone: "amber",
      title: `Kiosk dropped offline ${a.drops} times`,
      body: "Punches were queued and synced afterwards, but check the station's network cable or Wi-Fi.",
    });
  if (!out.length)
    out.push({
      tone: "emerald",
      title: "Nothing unusual",
      body: "No sign-in bursts, deletions or after-hours changes in this period.",
    });
  return out;
}

const TONE = {
  rose: { box: "border-rose-200 bg-rose-50", text: "text-rose-700" },
  amber: { box: "border-amber-200 bg-amber-50", text: "text-amber-700" },
  emerald: {
    box: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-700",
  },
};

function headline(a, rangeLabel) {
  if (!a.total) return `No system events were recorded ${rangeLabel}.`;
  const people = a.actors.filter((x) => x.type !== "system").length;
  let s = `${plural(a.total, "event")} ${rangeLabel} from ${plural(people, "actor")}.`;
  if (!a.attention) return `${s} Everything was routine.`;
  const bits = [];
  if (a.criticals) bits.push(`${a.criticals} critical`);
  if (a.warnings)
    bits.push(`${a.warnings} warning${a.warnings === 1 ? "" : "s"}`);
  return `${s} ${bits.join(" and ")} ${a.attention === 1 ? "needs" : "need"} a look.`;
}

function Changes({ changes }) {
  if (!changes?.length)
    return <p className="text-sm text-muted-foreground">No field changes.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Before</th>
            <th className="px-3 py-2 font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{c.field}</td>
              <td className="px-3 py-2 text-rose-700">
                {c.old == null ? (
                  "—"
                ) : (
                  <s className="decoration-rose-300">{show(c.old)}</s>
                )}
              </td>
              <td className="px-3 py-2 font-medium text-emerald-700">
                {show(c.new)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SystemLogsPage({ onLock, signOut }) {
  const [range, setRange] = useState("7d");
  const [state, setState] = useState({ rows: [], demo: false, note: "" });
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(() => new Set());
  const [reload, setReload] = useState(0);

  const { from, to } = useMemo(() => rangeDates(range), [range]);

  useEffect(() => {
    window.history.replaceState(null, "", "/?view=syslogs");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSystemLogs(from, to).then((res) => {
      if (cancelled) return;
      if (res.unauthorized)
        return onLock("Your session expired. Please sign in again.");
      setState(res);
      setOpen(new Set());
      setPage(0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [range, reload]);

  const a = useMemo(
    () => analyzeLogs(state.rows, from, to),
    [state.rows, range],
  );
  const findings = useMemo(() => buildFindings(a), [a]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (severity !== "all" && r.severity !== severity) return false;
      if (!q) return true;
      return [
        r.summary,
        r.actor?.name,
        r.target?.label,
        actionLabel(r.action),
        r.ip,
        r.station_code,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [state.rows, category, severity, search]);

  useEffect(() => setPage(0), [category, severity, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rangeLabel =
    range === "today"
      ? "today"
      : `in the last ${range === "7d" ? "7" : "30"} days`;

  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const exportCsv = () => {
    const blob = new Blob([logsToCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `system-logs-${ymd(from)}_${ymd(to)}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const go = (view) => () => {
    window.location.href = `/?view=${view}`;
  };

  return (
    <main className="mx-auto w-full max-w-9xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Admin
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            System logs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            An audit trail of who signed in, what was changed, and how the
            kiosks behaved.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Super admin</Badge>
          <Button variant="outline" onClick={go("kpi")}>
            <IconChart /> KPIs
          </Button>
          <Button variant="outline" onClick={go("logs")}>
            Attendance logs
          </Button>
          <Button variant="outline" onClick={go("manage")}>
            <IconArrowLeft /> Employees
          </Button>
          <Button variant="outline" onClick={signOut}>
            <IconLock /> Lock
          </Button>
        </div>
      </div>

      {state.demo && !loading && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <Badge variant="warning">Demo data</Badge>
          <span>
            {state.note} The entries below are generated examples so you can
            review the layout. They will be replaced by real records once the
            backend is connected.
          </span>
        </div>
      )}

      <Card className="relative overflow-hidden rounded-xl border-slate-200/80 bg-white">
        <div
          className="absolute inset-y-0 left-0 w-1 bg-sky-600"
          aria-hidden="true"
        />
        <div className="grid gap-5 p-5 pl-6 sm:p-6 sm:pl-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100">
              <IconShield width={22} height={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {range === "today"
                  ? fmtShort(to)
                  : `${fmtShort(from)} – ${fmtShort(to)}`}
              </p>
              <p className="mt-2 max-w-3xl text-[15px] leading-7 text-slate-700">
                {loading ? "Loading…" : headline(a, rangeLabel)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Tabs value={range} onChange={setRange} items={RANGES} />
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {!loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Events recorded"
              value={a.total}
              sub={`About ${a.avgPerDay.toFixed(1)} per day`}
            />
            <Stat
              label="Needs attention"
              value={a.attention}
              tone={
                a.criticals
                  ? "bg-rose-500"
                  : a.warnings
                    ? "bg-amber-400"
                    : "bg-emerald-500"
              }
              sub={`${a.criticals} critical · ${a.warnings} warning`}
            />
            <Stat
              label="Failed sign-ins"
              value={a.failedLogins}
              tone={a.failedLogins >= 3 ? "bg-rose-500" : "bg-sky-600"}
              sub={
                a.bursts.length
                  ? `${plural(a.bursts.length, "burst")} detected`
                  : "No bursts detected"
              }
            />
            <Stat
              label="Attendance changes"
              value={a.changes}
              tone={a.deletions.length ? "bg-rose-500" : "bg-amber-400"}
              sub={`${a.deletions.length} deleted · punches added or edited by hand`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity</CardTitle>
                <CardDescription>
                  Events per day
                  {a.busiest && a.total
                    ? ` · busiest: ${fmtDay(a.busiest.date)}`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityChart days={a.days} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Who is acting</CardTitle>
                <CardDescription>By number of events</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {a.actors.slice(0, 5).map((x) => (
                    <li
                      key={`${x.type}|${x.name}`}
                      className="flex items-center gap-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(x.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{x.name}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {x.type} · last {fmtStamp(x.last)}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums text-slate-600">
                        {x.events}
                      </span>
                    </li>
                  ))}
                  {!a.actors.length && (
                    <li className="text-sm text-muted-foreground">
                      No activity yet.
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>

          <section className="space-y-3" aria-labelledby="syslog-findings">
            <h3
              id="syslog-findings"
              className="text-lg font-semibold tracking-tight"
            >
              Worth a look
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {findings.map((f) => (
                <div
                  key={f.title}
                  className={`rounded-xl border p-4 ${TONE[f.tone].box}`}
                >
                  <p className={`text-sm font-semibold ${TONE[f.tone].text}`}>
                    {f.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-slate-700">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <Card>
        <CardHeader row>
          <div className="space-y-1.5">
            <CardTitle className="text-lg">Event log</CardTitle>
            <CardDescription>
              {loading
                ? "Loading…"
                : `${plural(filtered.length, "event")}${filtered.length !== state.rows.length ? ` of ${state.rows.length}` : ""}`}
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actor, target, IP…"
                aria-label="Search system logs"
              />
            </div>
            <Select
              className="w-40"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              aria-label="Filter by severity"
            >
              {SEVERITIES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!filtered.length}
            >
              <IconDownload /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto px-6 pb-3">
          <Tabs value={category} onChange={setCategory} items={CATEGORIES} />
        </div>
        <CardContent className="p-0">
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">When</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="pr-6 text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const sev = SEV[r.severity] || SEV.info;
                  const isOpen = open.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <TableRow>
                        <TableCell
                          className="whitespace-nowrap pl-6 tabular-nums"
                          title={fmtFull(r.created_at)}
                        >
                          {fmtStamp(r.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sev.variant}>
                            <i
                              className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sev.dot}`}
                            />
                            {sev.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {actionLabel(r.action)}
                          </div>
                          <div className="max-w-md text-xs text-muted-foreground">
                            {r.summary}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                              {initials(r.actor?.name)}
                            </div>
                            <div className="leading-tight">
                              <div className="text-sm">
                                {show(r.actor?.name)}
                              </div>
                              <div className="text-xs capitalize text-muted-foreground">
                                {r.actor?.type}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {show(r.target?.label)}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggle(r.id)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Hide" : "Show"} details`}
                          >
                            {isOpen ? "Hide" : "View"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                          <TableCell colSpan={6} className="px-6 py-4">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  What changed
                                </p>
                                <Changes changes={r.changes} />
                              </div>
                              <dl className="space-y-1.5 text-sm">
                                {[
                                  ["Exact time", fmtFull(r.created_at)],
                                  [
                                    "Category",
                                    CATEGORY_LABEL[r.category] || r.category,
                                  ],
                                  ["IP address", r.ip],
                                  ["Station", r.station_code],
                                  ["Record ID", r.uuid],
                                  ["Action code", r.action],
                                ].map(([k, v]) => (
                                  <div key={k} className="flex gap-3">
                                    <dt className="w-24 shrink-0 text-muted-foreground">
                                      {k}
                                    </dt>
                                    <dd className="min-w-0 break-words font-mono text-xs leading-5">
                                      {show(v)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {!loading && !filtered.length && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {state.rows.length
                  ? "No events match these filters."
                  : "No system events in this period."}
              </p>
            )}
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-6 py-3 text-sm text-muted-foreground">
              <span>
                Page {page + 1} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  <IconChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <IconChevronRight />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
