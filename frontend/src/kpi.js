/*
 * KPI engine for the attendance system.
 *
 * Works only from what the system really records: TIME IN / TIME OUT punches, the employee
 * directory, the OFF / HOLIDAY / SUSPENDED marks and the DTR "Official hours" + grace settings.
 * There is no roster or schedule table, so "coverage" means "active employees with at least one
 * shift in the cut-off", not "scheduled employees who showed up".
 */
import { isOutEvent, officialRange, ymd } from './dtr';

// Mirrors config/attendance.php (max_shift_hours): a TIME IN older than this has a missed time-out.
export const MAX_SHIFT_H = 16;
// A time in counts as a "day-shift arrival" when it lands within this window around the official start.
const WINDOW_BEFORE = 180; // minutes before the official start
const WINDOW_AFTER = 360; // minutes after the official start
const EARLY_LEAVE_MIN = 30; // left this many minutes before the official end
const OVERTIME_MIN = 60; // stayed this many minutes after the official end

export const LATE_BUCKETS = [
  { key: 'ok', label: 'On time (within grace)', tone: 'emerald' },
  { key: 'l1', label: 'Up to 15 min late', tone: 'amber' },
  { key: 'l2', label: '16–30 min late', tone: 'orange' },
  { key: 'l3', label: '31–60 min late', tone: 'rose' },
  { key: 'l4', label: 'Over 1 hour late', tone: 'red' },
];
export const HOURS_BUCKETS = [
  { key: 'h0', label: 'Under 4h', max: 4 },
  { key: 'h1', label: '4–8h', max: 8 },
  { key: 'h2', label: '8–10h', max: 10 },
  { key: 'h3', label: '10–13h', max: 13 },
  { key: 'h4', label: '13h +', max: Infinity },
];

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);

/* Pair every TIME IN with the next TIME OUT (same rule as the DTR and Logs pages). */
function buildSessions(logs, fromStr, toStr) {
  const byEmp = new Map();
  [...logs]
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at) || (a.id || 0) - (b.id || 0))
    .forEach((l) => {
      const no = l.employee_no_snapshot;
      if (!byEmp.has(no)) byEmp.set(no, { no, name: l.employee?.full_name || no, punches: [] });
      const e = byEmp.get(no);
      if (l.employee?.full_name) e.name = l.employee.full_name;
      e.punches.push({ out: isOutEvent(l.event_type), at: new Date(l.recorded_at), status: l.status });
    });

  const sessions = [];
  byEmp.forEach((e) => {
    let open = null;
    e.punches.forEach((p) => {
      if (!p.out) {
        if (open) sessions.push(open);
        open = { no: e.no, name: e.name, inP: p, outP: null };
      } else if (open && (p.at - open.inP.at) / 3600000 <= MAX_SHIFT_H) {
        open.outP = p;
        sessions.push(open);
        open = null;
      } else {
        if (open) { sessions.push(open); open = null; }
        sessions.push({ no: e.no, name: e.name, inP: null, outP: p });
      }
    });
    if (open) sessions.push(open);
  });

  return sessions
    .map((s) => ({ ...s, day: ymd((s.inP || s.outP).at) }))
    .filter((s) => s.day >= fromStr && s.day <= toStr);
}

const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

/**
 * @param logs       GET /attendance rows (with the 1-day margins)
 * @param employees  GET /employees?all=1 rows
 * @param marks      Map of `${scope}|YYYY-MM-DD` -> type (scope '*' = everyone)
 * @param settings   DTR settings ({ official, grace })
 */
export function analyze({ logs, employees, from, to, marks = new Map(), settings, now = new Date() }) {
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const todayStr = ymd(now);
  const official = officialRange(settings.official);
  const grace = Number(settings.grace) || 0;
  const officialSpan = official ? (official.end - official.start + 1440) % 1440 : null;

  const sessions = buildSessions(logs, fromStr, toStr);

  // ---- classify each shift ----
  sessions.forEach((s) => {
    s.mins = s.inP && s.outP ? Math.round((s.outP.at - s.inP.at) / 60000) : null;
    s.inProgress = !!(s.inP && !s.outP && (now - s.inP.at) / 3600000 < MAX_SHIFT_H);
    s.missingOut = !!(s.inP && !s.outP && !s.inProgress);
    s.orphanOut = !!(!s.inP && s.outP);
    s.dayShift = false;
    s.lateMin = null;
    if (s.inP && official) {
      let diff = (minutesOfDay(s.inP.at) - official.start + 1440) % 1440;
      if (diff > 1440 - WINDOW_BEFORE) diff -= 1440; // arrived before the official start
      if (diff <= WINDOW_AFTER) { s.dayShift = true; s.lateMin = diff; }
    }
    s.late = s.dayShift && s.lateMin > grace;
    s.earlyLeave = false;
    s.overtime = false;
    if (s.dayShift && s.mins != null && officialSpan != null) {
      const delta = s.mins - officialSpan;
      s.earlyLeave = delta < -EARLY_LEAVE_MIN;
      s.overtime = delta > OVERTIME_MIN;
    }
  });

  const real = sessions.filter((s) => !s.orphanOut);
  const complete = sessions.filter((s) => s.mins != null);
  const dayIns = sessions.filter((s) => s.dayShift);
  const lateOnes = dayIns.filter((s) => s.late);

  // ---- people ----
  const activeEmps = employees.filter((e) => e.status === 'active');
  const activeNos = new Set(activeEmps.map((e) => e.employee_no));
  const presentNos = new Set(real.map((s) => s.no));
  const presentActive = [...presentNos].filter((n) => activeNos.size === 0 || activeNos.has(n)).length;
  const headcount = activeNos.size || presentNos.size;
  const nameByNo = new Map(employees.map((e) => [e.employee_no, e.full_name]));
  const absentees = activeEmps.filter((e) => !presentNos.has(e.employee_no)).map((e) => ({ no: e.employee_no, name: e.full_name }));

  // ---- daily presence ----
  const days = [];
  const presence = new Map();
  real.forEach((s) => {
    if (!presence.has(s.day)) presence.set(s.day, new Set());
    presence.get(s.day).add(s.no);
  });
  for (let d = new Date(from); ymd(d) <= toStr; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const date = ymd(d);
    days.push({
      date,
      dow: d.getDay(),
      dom: d.getDate(),
      count: presence.get(date)?.size || 0,
      future: date > todayStr,
      mark: marks.get(`*|${date}`) || null,
      weekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  const elapsed = days.filter((d) => !d.future);
  const countable = elapsed.filter((d) => !d.mark);
  const avgPresence = mean(countable.map((d) => d.count));
  const busiest = countable.reduce((best, d) => (!best || d.count > best.count ? d : best), null);

  const dowAgg = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  countable.forEach((d) => { dowAgg[d.dow].sum += d.count; dowAgg[d.dow].n += 1; });
  const weekdays = dowAgg.map((a, i) => ({ dow: i, avg: a.n ? a.sum / a.n : 0, n: a.n }));

  // ---- punch clock (hour of day) ----
  const hourIn = Array(24).fill(0);
  const hourOut = Array(24).fill(0);
  logs.forEach((l) => {
    const at = new Date(l.recorded_at);
    const day = ymd(at);
    if (day < fromStr || day > toStr) return;
    (isOutEvent(l.event_type) ? hourOut : hourIn)[at.getHours()] += 1;
  });
  const peakInHour = hourIn.indexOf(Math.max(...hourIn));
  const totalIns = hourIn.reduce((a, b) => a + b, 0);

  // ---- lateness distribution ----
  const lateDist = { ok: 0, l1: 0, l2: 0, l3: 0, l4: 0 };
  dayIns.forEach((s) => {
    const over = s.lateMin - grace;
    if (over <= 0) lateDist.ok += 1;
    else if (over <= 15) lateDist.l1 += 1;
    else if (over <= 30) lateDist.l2 += 1;
    else if (over <= 60) lateDist.l3 += 1;
    else lateDist.l4 += 1;
  });

  // ---- shift length ----
  const hoursDist = Object.fromEntries(HOURS_BUCKETS.map((b) => [b.key, 0]));
  complete.forEach((s) => {
    const h = s.mins / 60;
    const b = HOURS_BUCKETS.find((x) => h < x.max);
    hoursDist[b.key] += 1;
  });
  const totalMins = complete.reduce((a, s) => a + s.mins, 0);

  // ---- data quality ----
  const punchRows = logs.filter((l) => { const d = ymd(new Date(l.recorded_at)); return d >= fromStr && d <= toStr; });
  const manual = punchRows.filter((l) => l.status === 'manual').length;
  const edited = punchRows.filter((l) => l.status === 'edited').length;
  const missingOut = sessions.filter((s) => s.missingOut);
  const orphanOut = sessions.filter((s) => s.orphanOut);
  const inProgress = sessions.filter((s) => s.inProgress).length;
  const closable = sessions.length - inProgress;
  const cleanShifts = sessions.filter((s) => s.mins != null).length;

  // ---- per employee ----
  const perEmp = new Map();
  const slot = (s) => {
    if (!perEmp.has(s.no)) perEmp.set(s.no, { no: s.no, name: nameByNo.get(s.no) || s.name, days: new Set(), shifts: 0, mins: 0, completeN: 0, dayIns: 0, late: 0, lateMins: 0, missingOut: 0, orphanOut: 0, early: 0, overtime: 0, adjusted: 0 });
    return perEmp.get(s.no);
  };
  sessions.forEach((s) => {
    const e = slot(s);
    e.days.add(s.day);
    e.shifts += 1;
    if (s.mins != null) { e.mins += s.mins; e.completeN += 1; }
    if (s.dayShift) { e.dayIns += 1; if (s.late) { e.late += 1; e.lateMins += s.lateMin - grace; } }
    if (s.missingOut) e.missingOut += 1;
    if (s.orphanOut) e.orphanOut += 1;
    if (s.earlyLeave) e.early += 1;
    if (s.overtime) e.overtime += 1;
    [s.inP, s.outP].forEach((p) => { if (p && (p.status === 'manual' || p.status === 'edited')) e.adjusted += 1; });
  });
  const people = [...perEmp.values()].map((e) => ({
    ...e,
    dayCount: e.days.size,
    avgMins: e.completeN ? e.mins / e.completeN : null,
    lateRate: pct(e.late, e.dayIns),
    score: e.missingOut * 3 + e.orphanOut * 2 + e.late + e.adjusted * 0.5,
  }));

  return {
    period: { fromStr, toStr, totalDays: days.length, elapsedDays: elapsed.length },
    officialLabel: settings.official,
    grace,
    hasOfficial: !!official,
    headcount,
    presentActive,
    coverage: pct(presentActive, headcount),
    absentees,
    shifts: real.length,
    punches: punchRows.length,
    people,
    peopleCount: presentNos.size,
    days,
    avgPresence,
    busiest,
    weekdays,
    hourIn,
    hourOut,
    peakInHour,
    peakInShare: pct(hourIn[peakInHour], totalIns),
    dayIns: dayIns.length,
    lateCount: lateOnes.length,
    onTimeRate: dayIns.length ? 100 - pct(lateOnes.length, dayIns.length) : null,
    avgLateMin: lateOnes.length ? mean(lateOnes.map((s) => s.lateMin - grace)) : 0,
    lateDist,
    otherShifts: real.filter((s) => s.inP && !s.dayShift).length,
    hoursDist,
    completeCount: complete.length,
    avgMins: complete.length ? totalMins / complete.length : null,
    totalMins,
    earlyLeave: sessions.filter((s) => s.earlyLeave).length,
    overtime: sessions.filter((s) => s.overtime).length,
    missingOut,
    orphanOut,
    inProgress,
    manual,
    edited,
    adjustedRate: pct(manual + edited, punchRows.length),
    completeness: pct(cleanShifts, closable),
  };
}

/* ---- tiny formatting helpers shared by the page ---- */
export const fmtHM = (mins) => (mins == null ? '—' : `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, '0')}m`);
export const fmtPct = (v, digits = 0) => (v == null ? '—' : `${v.toFixed(digits)}%`);
export const fmtHour = (h) => `${h % 12 || 12}${h >= 12 ? ' PM' : ' AM'}`;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
