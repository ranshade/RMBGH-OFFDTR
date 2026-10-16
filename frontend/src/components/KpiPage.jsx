import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../lib";
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
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconList,
  IconLock,
  IconPrinter,
  IconShield,
} from "./ui/icons";
import { currentEnd, periodFromEnd, shiftEnd, ymd } from "../dtr";
import {
  analyze,
  fmtHM,
  fmtHour,
  fmtPct,
  HOURS_BUCKETS,
  LATE_BUCKETS,
  WEEKDAYS,
} from "../kpi";
import { loadSettings } from "./DtrPrint";

const addDays = (d, n) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtShort = (d) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtRange = (a, b) =>
  a.getFullYear() === b.getFullYear()
    ? `${fmtShort(a)} – ${fmtShort(b)}, ${b.getFullYear()}`
    : `${fmtShort(a)}, ${a.getFullYear()} – ${fmtShort(b)}, ${b.getFullYear()}`;
const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
const initials = (n) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

const TONES = {
  emerald: {
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    soft: "bg-emerald-50 border-emerald-200",
  },
  amber: {
    bar: "bg-amber-400",
    text: "text-amber-700",
    soft: "bg-amber-50 border-amber-200",
  },
  orange: {
    bar: "bg-orange-500",
    text: "text-orange-700",
    soft: "bg-orange-50 border-orange-200",
  },
  rose: {
    bar: "bg-rose-500",
    text: "text-rose-700",
    soft: "bg-rose-50 border-rose-200",
  },
  red: {
    bar: "bg-red-600",
    text: "text-red-700",
    soft: "bg-red-50 border-red-200",
  },
  sky: {
    bar: "bg-sky-600",
    text: "text-sky-700",
    soft: "bg-sky-50 border-sky-200",
  },
  slate: {
    bar: "bg-slate-400",
    text: "text-slate-600",
    soft: "bg-slate-50 border-slate-200",
  },
};

/* ------------------------------------------------------------------ building blocks */

// Up/down chip comparing this cut-off with the previous one. `good` says which direction is healthy.
function Delta({ now, before, unit = "", good = "up", digits = 0, scale = 1 }) {
  if (now == null || before == null)
    return (
      <span className="text-xs text-muted-foreground">
        No earlier period to compare
      </span>
    );
  const diff = (now - before) / scale;
  if (Math.abs(diff) < 0.5 / 10 ** digits)
    return (
      <span className="text-xs text-muted-foreground">
        Same as previous cut-off
      </span>
    );
  const up = diff > 0;
  const healthy = good === "up" ? up : !up;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${healthy ? "text-emerald-700" : "text-rose-700"}`}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {Math.abs(diff).toFixed(digits)}
      {unit}{" "}
      <span className="font-normal text-muted-foreground">
        vs previous cut-off
      </span>
    </span>
  );
}

function Kpi({ label, value, sub, tone = "sky", children }) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className={`absolute inset-x-0 top-0 h-1 ${TONES[tone].bar}`}
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
        {children && <div className="mt-2">{children}</div>}
      </CardContent>
    </Card>
  );
}

// Chapter wrapper: number + question, then the one-sentence "so what", then the evidence.
function Chapter({ n, title, finding, children }) {
  return (
    <section className="space-y-3" aria-labelledby={`kpi-ch-${n}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {n}
        </span>
        <div className="min-w-0">
          <h3
            id={`kpi-ch-${n}`}
            className="text-lg font-semibold tracking-tight"
          >
            {title}
          </h3>
          <p className="mt-0.5 max-w-3xl text-sm leading-6 text-slate-700">
            {finding}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Note({ children }) {
  return (
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{children}</p>
  );
}

// Horizontal proportional bar list (used for lateness and shift-length breakdowns).
function BreakdownBars({ rows, total }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const share = total ? (r.value / total) * 100 : 0;
        return (
          <li key={r.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-700">{r.label}</span>
              <span className="tabular-nums text-slate-500">
                <b className="font-semibold text-slate-900">{r.value}</b> ·{" "}
                {share.toFixed(0)}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${TONES[r.tone || "sky"].bar}`}
                style={{ width: `${share}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Daily headcount: one column per day of the cut-off, with the average as a dashed line.
function DailyPresence({ days, avg }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <div
        className="relative flex h-44 items-end gap-[3px]"
        role="img"
        aria-label="Employees present per day"
      >
        {avg > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-400"
            style={{ bottom: `${(avg / max) * 100}%` }}
          >
            <span className="absolute -top-5 right-0 rounded bg-white/90 px-1 text-[10px] font-medium text-slate-500">
              avg {avg.toFixed(1)}
            </span>
          </div>
        )}
        {days.map((d) => {
          const tone = d.future
            ? "bg-slate-100"
            : d.mark
              ? "bg-slate-300"
              : d.weekend
                ? "bg-sky-300"
                : "bg-sky-600";
          return (
            <div
              key={d.date}
              className="group relative flex h-full min-w-0 flex-1 items-end"
              title={`${fmtDate(d.date)}: ${d.mark ? d.mark.toLowerCase() : d.future ? "upcoming" : `${d.count} present`}`}
            >
              <div
                className={`w-full rounded-t ${tone}`}
                style={{
                  height: d.future
                    ? "4%"
                    : `${Math.max((d.count / max) * 100, d.count ? 4 : 1.5)}%`,
                }}
              />
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
            {i === 0 || d.dom === 1 || d.dom % 5 === 0 ? d.dom : ""}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-sky-600" /> Weekday
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-sky-300" /> Weekend
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Holiday / off /
          suspended
        </span>
      </div>
    </div>
  );
}

// 24-hour punch clock: TIME IN beside TIME OUT for every hour of the day.
function PunchClock({ hourIn, hourOut, peak }) {
  const max = Math.max(1, ...hourIn, ...hourOut);
  return (
    <div>
      <div
        className="flex h-40 items-end gap-[2px]"
        role="img"
        aria-label="Punches by hour of day"
      >
        {hourIn.map((v, h) => (
          <div
            key={h}
            className="flex h-full min-w-0 flex-1 items-end gap-px"
            title={`${fmtHour(h)}: ${v} time in, ${hourOut[h]} time out`}
          >
            <div
              className={`w-1/2 rounded-t ${h === peak && v ? "bg-sky-700" : "bg-sky-400"}`}
              style={{ height: `${(v / max) * 100}%` }}
            />
            <div
              className="w-1/2 rounded-t bg-amber-400"
              style={{ height: `${(hourOut[h] / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {hourIn.map((_, h) => (
          <span
            key={h}
            className="min-w-0 flex-1 text-center text-[10px] text-slate-400"
          >
            {h % 3 === 0 ? (h % 12 || 12) + (h >= 12 ? "p" : "a") : ""}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-sky-400" /> Time in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Time out
        </span>
      </div>
    </div>
  );
}

// Average headcount by weekday.
function WeekdayBars({ weekdays }) {
  const order = [1, 2, 3, 4, 5, 6, 0].map((i) => weekdays[i]);
  const max = Math.max(1, ...order.map((w) => w.avg));
  return (
    <ul className="space-y-2.5">
      {order.map((w) => (
        <li key={w.dow} className="flex items-center gap-3 text-sm">
          <span className="w-9 shrink-0 text-slate-500">{WEEKDAYS[w.dow]}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${w.dow === 0 || w.dow === 6 ? "bg-sky-300" : "bg-sky-600"}`}
              style={{ width: `${(w.avg / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums font-medium">
            {w.n ? w.avg.toFixed(1) : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Circular gauge for the data-trust numbers.
function Gauge({ value, label, hint, goodAt = 95, okAt = 85 }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone =
    value == null
      ? "text-slate-300"
      : v >= goodAt
        ? "text-emerald-500"
        : v >= okAt
          ? "text-amber-500"
          : "text-rose-500";
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 80 80"
        className="h-20 w-20 shrink-0 -rotate-90"
        role="img"
        aria-label={`${label}: ${fmtPct(value)}`}
      >
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="8"
          className="stroke-slate-100"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={`stroke-current ${tone}`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div>
        <p className="text-2xl font-semibold tabular-nums">{fmtPct(value)}</p>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading KPIs">
      <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}

/* ------------------------------------------------------------------ storytelling copy */

function buildHeadline(k, prev) {
  if (!k.shifts) return "No attendance has been recorded in this cut-off yet.";
  const parts = [];
  parts.push(
    `${k.presentActive} of ${k.headcount} active employees (${fmtPct(k.coverage)}) logged ${plural(k.shifts, "shift")} this cut-off`,
  );
  if (k.avgMins != null) parts[0] += `, averaging ${fmtHM(k.avgMins)} on site`;
  parts[0] += ".";
  if (k.onTimeRate != null) {
    const trend =
      prev?.onTimeRate != null
        ? k.onTimeRate > prev.onTimeRate + 1
          ? ", better than the previous cut-off"
          : k.onTimeRate < prev.onTimeRate - 1
            ? ", worse than the previous cut-off"
            : ", in line with the previous cut-off"
        : "";
    parts.push(
      `${fmtPct(k.onTimeRate)} of day-shift arrivals were on time${trend}.`,
    );
  }
  const open = k.missingOut.length + k.orphanOut.length;
  parts.push(
    open
      ? `${plural(open, "record")} still ${open === 1 ? "needs" : "need"} a fix before DTRs can be signed.`
      : "Every record is complete and ready for DTR printing.",
  );
  return parts.join(" ");
}

function chapter1(k) {
  if (!k.shifts)
    return "There is nothing to chart yet — headcount will appear here as employees start punching in.";
  const wk = k.weekdays.filter((w) => w.dow >= 1 && w.dow <= 5 && w.n >= 2);
  let spread = "";
  if (wk.length >= 3) {
    const hi = wk.reduce((a, b) => (b.avg > a.avg ? b : a));
    const lo = wk.reduce((a, b) => (b.avg < a.avg ? b : a));
    spread =
      hi.avg - lo.avg >= Math.max(1, hi.avg * 0.2)
        ? ` ${WEEKDAYS[hi.dow]}s are the strongest weekday (${hi.avg.toFixed(1)} people) and ${WEEKDAYS[lo.dow]}s the weakest (${lo.avg.toFixed(1)}).`
        : " Weekday headcount is steady, with no day standing out.";
  }
  const busiest = k.busiest
    ? `${fmtDate(k.busiest.date)} was the busiest day with ${k.busiest.count} present.`
    : "";
  return `On a typical day ${k.avgPresence.toFixed(1)} employees are on site. ${busiest}${spread}`;
}

function chapter2(k) {
  if (!k.punches)
    return "Arrival patterns will show up once punches are recorded.";
  const peak = `${fmtPct(k.peakInShare)} of all time-ins happen in the ${fmtHour(k.peakInHour)} hour`;
  if (!k.hasOfficial || !k.dayIns)
    return `${peak}. Set the Official hours (e.g. 8:00 AM - 5:00 PM) in the DTR settings to unlock punctuality tracking.`;
  const late = k.lateCount
    ? `${plural(k.lateCount, "day-shift arrival")} (${fmtPct(100 - k.onTimeRate)}) came in after the ${k.officialLabel.split("-")[0].trim()} start plus ${k.grace}-minute grace, ${k.avgLateMin.toFixed(0)} minutes past it on average.`
    : `Nobody arrived beyond the ${k.grace}-minute grace period — punctuality is perfect.`;
  return `${peak}, so expect the kiosk queue then. ${late}`;
}

function chapter3(k) {
  if (!k.completeCount)
    return "Shift length needs completed shifts (a time in paired with a time out).";
  const bits = [
    `Completed shifts average ${fmtHM(k.avgMins)} between time in and time out (this includes meal breaks, since the kiosk does not record them).`,
  ];
  if (k.earlyLeave)
    bits.push(
      `${plural(k.earlyLeave, "day shift")} ended more than 30 minutes before the official end.`,
    );
  if (k.overtime)
    bits.push(`${plural(k.overtime, "day shift")} ran over an hour past it.`);
  if (k.otherShifts)
    bits.push(
      `${plural(k.otherShifts, "shift")} started outside the day window (night or 12-hour schedules) and are left out of punctuality.`,
    );
  return bits.join(" ");
}

function chapter4(k) {
  if (!k.shifts)
    return "Record quality will be measured as soon as shifts are logged.";
  const issues = k.missingOut.length + k.orphanOut.length;
  if (!issues && !k.manual && !k.edited)
    return "Every shift has both a time in and a time out, and nothing was added or changed by hand. The records are clean.";
  const bits = [];
  if (k.missingOut.length)
    bits.push(
      `${plural(k.missingOut.length, "shift")} ${k.missingOut.length === 1 ? "has" : "have"} no time-out`,
    );
  if (k.orphanOut.length)
    bits.push(
      `${plural(k.orphanOut.length, "time-out")} ${k.orphanOut.length === 1 ? "has" : "have"} no matching time-in`,
    );
  const adj = k.manual + k.edited;
  if (adj)
    bits.push(
      `${fmtPct(k.adjustedRate, 1)} of punches (${adj}) were added or edited by hand`,
    );
  return `${bits.join(", ")}. Missing punches print as blanks on the DTR, so fix them before the submission date.`;
}

function buildActions(k, isLatest) {
  const a = [];
  if (k.missingOut.length)
    a.push({
      tone: "rose",
      title: `Close ${plural(k.missingOut.length, "open shift")}`,
      body: "Add the missing TIME OUT from Attendance Logs so hours can be computed.",
      href: "/?view=logs",
    });
  if (k.orphanOut.length)
    a.push({
      tone: "rose",
      title: `Match ${plural(k.orphanOut.length, "orphan time-out")}`,
      body: "Each one has no time-in before it. Add the missing TIME IN or correct the employee ID.",
      href: "/?view=logs",
    });
  const repeat = k.people.filter((p) => p.late >= 3 && p.lateRate >= 25);
  if (repeat.length)
    a.push({
      tone: "amber",
      title: `Talk to ${plural(repeat.length, "repeat late arriver")}`,
      body: `${repeat
        .slice(0, 3)
        .map((p) => p.name)
        .join(
          ", ",
        )}${repeat.length > 3 ? " and others" : ""} were late on at least 25% of their shifts.`,
      href: null,
    });
  if (k.absentees.length && k.shifts)
    a.push({
      tone: "amber",
      title: `${plural(k.absentees.length, "active employee")} with no records`,
      body: "Confirm they are on leave — or mark them inactive so they stop counting against coverage.",
      href: "/?view=manage",
    });
  if (k.adjustedRate != null && k.adjustedRate > 10)
    a.push({
      tone: "amber",
      title: "High share of manual edits",
      body: `${fmtPct(k.adjustedRate)} of punches were typed in or edited. Check for kiosk or camera problems.`,
      href: "/?view=logs",
    });
  if (isLatest && a.length === 0 && k.shifts)
    a.push({
      tone: "emerald",
      title: "Ready for submission",
      body: "No open issues. You can print the DTRs.",
      href: "/?view=dtr",
    });
  return a;
}

/* ------------------------------------------------------------------ page */

export default function KpiPage({ onLock, signOut }) {
  const [end, setEnd] = useState(currentEnd);
  const [cur, setCur] = useState(null); // { logs, employees, marks }
  const [prevLogs, setPrevLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [peopleTab, setPeopleTab] = useState("attention");
  const settings = useMemo(loadSettings, []);

  const { from, to } = useMemo(() => periodFromEnd(end), [end]);
  const prevEnd = useMemo(() => shiftEnd(end, -1), [end]);
  const prev = useMemo(() => periodFromEnd(prevEnd), [prevEnd]);
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const latest = currentEnd();
  const isLatest = end.y === latest.y && end.m === latest.m;

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `/?view=kpi&end=${end.y}-${String(end.m).padStart(2, "0")}`,
    );
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // One extra day on each side so overnight shifts at the cut-off edges still pair up.
        const range = (a, b) =>
          `/attendance?from=${ymd(addDays(a, -1))}&to=${ymd(addDays(b, 1))}`;
        const [a, e, m, p] = await Promise.all([
          adminFetch(range(from, to)),
          adminFetch("/employees?all=1"),
          adminFetch(`/dtr/marks?from=${fromStr}&to=${toStr}`),
          adminFetch(range(prev.from, prev.to)),
        ]);
        if ([a, e, m, p].some((r) => r.status === 401))
          return onLock("Your session expired. Please sign in again.");
        if (!a.ok || !e.ok) throw new Error();
        const [logs, employees, markRows, pLogs] = await Promise.all([
          a.json(),
          e.json(),
          m.ok ? m.json() : [],
          p.ok ? p.json() : null,
        ]);
        if (cancelled) return;
        setCur({
          logs,
          employees,
          marks: new Map(markRows.map((x) => [`${x.scope}|${x.date}`, x.type])),
        });
        setPrevLogs(pLogs);
        setError("");
      } catch {
        if (!cancelled)
          setError(
            "Unable to load KPI data. Check that Laravel and MySQL are running.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromStr, toStr]);

  const k = useMemo(
    () => (cur ? analyze({ ...cur, from, to, settings }) : null),
    [cur, fromStr, toStr, settings],
  );
  const kPrev = useMemo(
    () =>
      cur && prevLogs
        ? analyze({
            logs: prevLogs,
            employees: cur.employees,
            from: prev.from,
            to: prev.to,
            settings,
          })
        : null,
    [cur, prevLogs, settings],
  );
  const hasPrev = !!(kPrev && kPrev.shifts);

  const people = useMemo(() => {
    if (!k) return [];
    if (peopleTab === "attention")
      return k.people
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    const top = Math.max(1, ...k.people.map((p) => p.dayCount));
    return k.people
      .filter(
        (p) =>
          p.missingOut === 0 && p.orphanOut === 0 && p.dayCount >= top * 0.6,
      )
      .sort((a, b) => b.dayCount - a.dayCount || a.late - b.late)
      .slice(0, 10);
  }, [k, peopleTab]);

  const actions = k ? buildActions(k, isLatest) : [];
  const monthLabel = to.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const hasData = !!k && k.shifts > 0;

  return (
    <main className="mx-auto w-full max-w-9xl space-y-8 px-4 py-6 sm:px-6">
      {/* page header — same pattern as Logs / Employees */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Admin
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Attendance KPIs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The story of this cut-off: who showed up, when, for how long, and
            whether the records can be trusted.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <Badge>Super admin</Badge>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/?view=logs";
            }}
          >
            <IconList /> Attendance Logs
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/?view=syslogs";
            }}
          >
            <IconShield /> System logs
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <IconPrinter /> Print
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/?view=manage";
            }}
          >
            <IconArrowLeft /> Employees
          </Button>
          <Button variant="outline" onClick={signOut}>
            <IconLock /> Lock
          </Button>
        </div>
      </div>

      {/* period selector + headline */}
      <Card className="relative overflow-hidden rounded-xl border-slate-200/80 bg-white">
        <div
          className="absolute inset-y-0 left-0 w-1 bg-sky-600"
          aria-hidden="true"
        />
        <div className="grid gap-5 p-5 pl-6 sm:p-6 sm:pl-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100">
              <IconCalendar width={22} height={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {monthLabel} cut-off
                </p>
                {isLatest ? (
                  <Badge>This period</Badge>
                ) : (
                  <Badge variant="secondary">Closed</Badge>
                )}
              </div>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                {fmtRange(from, to)}
              </p>
              {k && !loading && (
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-700">
                  {buildHeadline(k, hasPrev ? kPrev : null)}
                </p>
              )}
            </div>
          </div>
          <div className="inline-flex h-10 items-center self-start rounded-lg border border-slate-200 bg-slate-50 p-0.5 print:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg text-slate-600 hover:bg-white"
              onClick={() => setEnd((e) => shiftEnd(e, -1))}
              aria-label="Previous cut-off"
            >
              <IconChevronLeft />
            </Button>
            <button
              onClick={() => setEnd(currentEnd())}
              disabled={isLatest}
              className="h-9 rounded-lg px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              Current
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg text-slate-600 hover:bg-white"
              disabled={isLatest}
              onClick={() => setEnd((e) => shiftEnd(e, 1))}
              aria-label="Next cut-off"
            >
              <IconChevronRight />
            </Button>
          </div>
        </div>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
      {loading && <Skeleton />}

      {!loading && k && !hasData && !error && (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No attendance records for this cut-off period.
          </CardContent>
        </Card>
      )}

      {!loading && hasData && (
        <>
          {/* the four numbers that matter */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Coverage"
              value={fmtPct(k.coverage)}
              tone="sky"
              sub={`${k.presentActive} of ${k.headcount} active employees had at least one shift`}
            >
              <Delta
                now={k.coverage}
                before={hasPrev ? kPrev.coverage : null}
                unit=" pts"
              />
            </Kpi>
            <Kpi
              label="On-time arrivals"
              value={fmtPct(k.onTimeRate)}
              tone={
                k.onTimeRate == null
                  ? "slate"
                  : k.onTimeRate >= 90
                    ? "emerald"
                    : k.onTimeRate >= 75
                      ? "amber"
                      : "rose"
              }
              sub={
                k.dayIns
                  ? `${k.dayIns - k.lateCount} of ${k.dayIns} day-shift arrivals within grace`
                  : "Set Official hours in the DTR settings"
              }
            >
              <Delta
                now={k.onTimeRate}
                before={hasPrev ? kPrev.onTimeRate : null}
                unit=" pts"
              />
            </Kpi>
            <Kpi
              label="Average time on site"
              value={fmtHM(k.avgMins)}
              tone="sky"
              sub={`${fmtHM(k.totalMins)} across ${plural(k.completeCount, "completed shift")}`}
            >
              <Delta
                now={k.avgMins}
                before={hasPrev ? kPrev.avgMins : null}
                unit=" min"
                scale={1}
                digits={0}
              />
            </Kpi>
            <Kpi
              label="Record completeness"
              value={fmtPct(k.completeness)}
              tone={
                k.completeness == null
                  ? "slate"
                  : k.completeness >= 95
                    ? "emerald"
                    : k.completeness >= 85
                      ? "amber"
                      : "rose"
              }
              sub={`${k.completeCount} of ${k.shifts - k.inProgress} shifts have both punches`}
            >
              <Delta
                now={k.completeness}
                before={hasPrev ? kPrev.completeness : null}
                unit=" pts"
              />
            </Kpi>
          </div>

          {/* chapter 1 */}
          <Chapter n={1} title="Who showed up?" finding={chapter1(k)}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Employees present each day
                  </CardTitle>
                  <CardDescription>
                    Distinct employees with a shift starting that day
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DailyPresence days={k.days} avg={k.avgPresence} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Average by weekday
                  </CardTitle>
                  <CardDescription>
                    Holidays and suspensions excluded
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WeekdayBars weekdays={k.weekdays} />
                  {k.absentees.length > 0 && (
                    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      <b>{plural(k.absentees.length, "active employee")}</b>{" "}
                      with no records:{" "}
                      {k.absentees
                        .slice(0, 4)
                        .map((x) => x.name)
                        .join(", ")}
                      {k.absentees.length > 4
                        ? ` and ${k.absentees.length - 4} more`
                        : ""}
                      .
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </Chapter>

          {/* chapter 2 */}
          <Chapter
            n={2}
            title="When do they arrive and leave?"
            finding={chapter2(k)}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Punch clock</CardTitle>
                  <CardDescription>
                    Time in and time out by hour of day
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PunchClock
                    hourIn={k.hourIn}
                    hourOut={k.hourOut}
                    peak={k.peakInHour}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Punctuality</CardTitle>
                  <CardDescription>
                    {k.hasOfficial
                      ? `Day-shift arrivals vs ${k.officialLabel}, ${k.grace}-minute grace`
                      : "Official hours are not set"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {k.dayIns ? (
                    <BreakdownBars
                      total={k.dayIns}
                      rows={LATE_BUCKETS.map((b) => ({
                        ...b,
                        value: k.lateDist[b.key],
                      }))}
                    />
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No day-shift arrivals to measure.
                    </p>
                  )}
                  {k.otherShifts > 0 && (
                    <Note>
                      {plural(k.otherShifts, "shift")} began outside the day
                      window (night / 12-hour) and are not counted here.
                    </Note>
                  )}
                </CardContent>
              </Card>
            </div>
          </Chapter>

          {/* chapter 3 */}
          <Chapter n={3} title="How long do they stay?" finding={chapter3(k)}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Shift length</CardTitle>
                  <CardDescription>
                    Completed shifts grouped by hours between time in and time
                    out
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BreakdownBars
                    total={k.completeCount}
                    rows={HOURS_BUCKETS.map((b) => ({
                      key: b.key,
                      label: b.label,
                      value: k.hoursDist[b.key],
                      tone: "sky",
                    }))}
                  />
                </CardContent>
              </Card>
              <div className="grid content-start gap-4 sm:grid-cols-3 lg:grid-cols-1">
                <Kpi
                  label="Left early"
                  value={k.earlyLeave}
                  tone={k.earlyLeave ? "amber" : "emerald"}
                  sub="Day shifts ending 30+ min before the official end"
                />
                <Kpi
                  label="Stayed late"
                  value={k.overtime}
                  tone="sky"
                  sub="Day shifts running 60+ min past the official end"
                />
                <Kpi
                  label="Shifts in progress"
                  value={k.inProgress}
                  tone="slate"
                  sub={`Timed in within the last ${16} hours — not counted as missing`}
                />
              </div>
            </div>
          </Chapter>

          {/* chapter 4 */}
          <Chapter
            n={4}
            title="Can we trust the numbers?"
            finding={chapter4(k)}
          >
            <Card>
              <CardContent className="grid gap-6 pt-6 md:grid-cols-3">
                <Gauge
                  value={k.completeness}
                  label="Complete shifts"
                  hint="Time in paired with a time out"
                />
                <Gauge
                  value={k.adjustedRate == null ? null : 100 - k.adjustedRate}
                  label="Untouched punches"
                  hint={`${k.manual} manual · ${k.edited} edited of ${k.punches}`}
                  goodAt={95}
                  okAt={85}
                />
                <Gauge
                  value={
                    k.shifts
                      ? 100 - (k.orphanOut.length / k.shifts) * 100
                      : null
                  }
                  label="Punches with a partner"
                  hint={`${plural(k.orphanOut.length, "time-out")} without a time in`}
                  goodAt={98}
                  okAt={90}
                />
              </CardContent>
            </Card>
          </Chapter>

          {/* chapter 5 */}
          <Chapter
            n={5}
            title="What should we do next?"
            finding={
              actions.length
                ? `${plural(actions.length, "thing")} worth doing before the ${fmtShort(to)} submission:`
                : "Nothing is flagged for this cut-off."
            }
          >
            {actions.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {actions.map((a) => (
                  <div
                    key={a.title}
                    className={`rounded-xl border p-4 ${TONES[a.tone].soft}`}
                  >
                    <p
                      className={`text-sm font-semibold ${TONES[a.tone].text}`}
                    >
                      {a.title}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-slate-700">
                      {a.body}
                    </p>
                    {a.href && (
                      <a
                        href={a.href}
                        className="mt-2 inline-block text-sm font-medium text-primary hover:underline print:hidden"
                      >
                        Open →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Card>
              <CardHeader row>
                <div className="space-y-1.5">
                  <CardTitle className="text-base">
                    {peopleTab === "attention"
                      ? "Needs attention"
                      : "Most dependable"}
                  </CardTitle>
                  <CardDescription>
                    {peopleTab === "attention"
                      ? "Ranked by open punches, late arrivals and manual edits"
                      : "Highest attendance with no open punches"}
                  </CardDescription>
                </div>
                <Tabs
                  value={peopleTab}
                  onChange={setPeopleTab}
                  items={[
                    ["attention", "Needs attention"],
                    ["reliable", "Most dependable"],
                  ]}
                />
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-6">Employee</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Avg on site</TableHead>
                        <TableHead>Late</TableHead>
                        <TableHead>Open punches</TableHead>
                        <TableHead className="pr-6">Hand-edited</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {people.map((p) => (
                        <TableRow key={p.no}>
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {initials(p.name)}
                              </div>
                              <div>
                                <div className="font-medium">{p.name}</div>
                                <div className="font-mono text-xs text-muted-foreground">
                                  {p.no}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {p.dayCount}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {fmtHM(p.avgMins)}
                          </TableCell>
                          <TableCell>
                            {p.late ? (
                              <Badge variant="warning">
                                {p.late}
                                {p.lateRate != null
                                  ? ` · ${p.lateRate.toFixed(0)}%`
                                  : ""}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.missingOut + p.orphanOut ? (
                              <Badge variant="destructive">
                                {p.missingOut + p.orphanOut}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="pr-6">
                            {p.adjusted ? (
                              <Badge variant="secondary">{p.adjusted}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!people.length && (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {peopleTab === "attention"
                        ? "Nobody is flagged — a clean cut-off."
                        : "Not enough data to rank yet."}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Chapter>

          <Card className="border-dashed bg-transparent">
            <CardContent className="space-y-1.5 py-5 text-xs leading-5 text-muted-foreground">
              <p className="font-semibold text-slate-600">
                How these numbers are calculated
              </p>
              <p>
                A shift is a TIME IN paired with the next TIME OUT (up to 16
                hours later, the same limit the server uses). It is counted on
                the date of its TIME IN.
              </p>
              <p>
                Coverage is active employees with at least one shift ÷ all
                active employees. The system has no roster, so it cannot know
                who was scheduled to work.
              </p>
              <p>
                Punctuality only covers arrivals within 3 hours before to 6
                hours after the Official hours start ({k.officialLabel}), using
                the grace period set in DTR settings ({k.grace} min). Night and
                12-hour shifts are excluded.
              </p>
              <p>
                Time on site is time in to time out, so it includes meal breaks.
                Percent changes are shown in points against the previous
                cut-off.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
