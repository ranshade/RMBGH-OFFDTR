/*
 * DTR (Civil Service Form No. 48) builder.
 *
 * Every punch is printed on the calendar date it actually happened, in the column that matches its
 * clock time (before 12:00 NN = Morning, 12:00 NN onward = Afternoon). That is what makes night
 * shifts work: TIME IN 7:00 PM lands in Afternoon "Arrived" on day D, and the TIME OUT 7:00 AM on
 * day D+1 lands in Morning "Departure" on day D+1.
 */
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export const NOON = '12:00 NN';
export const ONE_PM = '1:00 PM';
export const MARK_TYPES = ['OFF', 'HOLIDAY', 'SUSPENDED'];

/*
 * Length in hours of the "Official hours" text, e.g. "8:00 AM - 5:00 PM" -> 9, "7:00 PM - 7:00 AM" -> 12.
 * The fixed 12:00 NN / 1:00 PM break is only printed for regular (about 8-hour) schedules;
 * 12-hour shifts show just the real time in and time out (AM in, PM out).
 */
export function officialRange(text) {
  const m = String(text || '').match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])/i);
  if (!m) return null;
  const mins = (h, mi, ap) => ((+h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0)) * 60 + (+mi || 0);
  return { start: mins(m[1], m[2], m[3]), end: mins(m[4], m[5], m[6]) }; // minutes since midnight
}
export function shiftLength(text) {
  const r = officialRange(text);
  return r ? (((r.end - r.start) + 1440) % 1440) / 60 : null;
}

/*
 * Grace period: a time in that is late by no more than `grace` minutes after the official start is
 * printed as the official start (8:14 AM with an 8:00 AM start prints as 8:00 AM). Early arrivals and
 * anything later than the grace period are printed as punched.
 */
export function applyGrace(at, officialStart, grace) {
  if (officialStart == null || !(grace > 0)) return at;
  const m = at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;
  const late = (m - officialStart + 1440) % 1440; // minutes after the official start (wraps over midnight)
  if (late === 0 || late > grace) return at;
  return new Date(at.getTime() - Math.round(late * 60000));
}
export const showsBreak = (officialHours) => {
  const h = shiftLength(officialHours);
  return h == null || h < 10;
};

export function fmtClock(d) {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const isOutEvent = (ev) => String(ev).toUpperCase().includes('OUT');

/* ---- cut-off periods: 26th of the previous month up to the 25th of month `m` (1-12) ---- */
export function periodFromEnd({ y, m }) {
  return { from: new Date(y, m - 2, 26), to: new Date(y, m - 1, 25) };
}
export function currentEnd(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + (now.getDate() >= 26 ? 1 : 0), 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}
export function shiftEnd({ y, m }, delta) {
  const d = new Date(y, m - 1 + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

// The two halves printed side by side: e.g. "JULY 26-31, 2026" and "AUGUST 1-25, 2026".
export function periodPanels(from, to) {
  return [
    { year: from.getFullYear(), month: from.getMonth(), start: from.getDate(), end: new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate() },
    { year: to.getFullYear(), month: to.getMonth(), start: 1, end: to.getDate() },
  ].map((p) => ({ ...p, label: `${MONTHS[p.month]} ${p.start}-${p.end}, ${p.year}` }));
}

// Pair every TIME IN with the next TIME OUT (an unmatched punch stays on its own).
function pair(punches) {
  const sessions = [];
  let open = null;
  punches.forEach((p) => {
    if (!p.out) {
      if (open) sessions.push(open);
      open = { inP: p, outP: null };
    } else if (open) {
      open.outP = p;
      sessions.push(open);
      open = null;
    } else {
      sessions.push({ inP: null, outP: p });
    }
  });
  if (open) sessions.push(open);
  return sessions;
}

function placePunches(punches, inRange, fillBreak) {
  const days = new Map(); // 'YYYY-MM-DD' -> { mA, mD, aA, aD } (Date objects)
  const slot = (day) => { if (!days.has(day)) days.set(day, {}); return days.get(day); };
  const fillers = [];

  pair(punches).forEach((s) => {
    [s.inP, s.outP].filter(Boolean).forEach((p) => {
      const day = ymd(p.at);
      if (!inRange(day)) return;
      const pm = p.at.getHours() >= 12;
      const col = p.out ? (pm ? 'aD' : 'mD') : (pm ? 'aA' : 'mA');
      const cell = slot(day);
      // Arrival keeps the earliest punch, departure keeps the latest.
      if (!cell[col] || (p.out ? p.at > cell[col] : p.at < cell[col])) cell[col] = p.at;
    });
    // Regular day shift (in before noon, out from 1 PM): show the fixed 12:00 NN / 1:00 PM break.
    if (fillBreak && s.inP && s.outP && ymd(s.inP.at) === ymd(s.outP.at) && s.inP.at.getHours() < 12 && s.outP.at.getHours() >= 13) {
      fillers.push(ymd(s.inP.at));
    }
  });
  return { days, fillers };
}

/**
 * @param logs       rows from GET /attendance (include 1 extra day before/after the cut-off)
 * @param employees  rows from GET /employees?all=1 (optional; used for names/status)
 * @param marks      Map of `${employee_no or '*'}|YYYY-MM-DD` -> 'OFF' | 'HOLIDAY' | 'SUSPENDED'
 */
export function buildDtr({ logs, employees = [], from, to, marks = new Map(), fillBreak = true, officialStart = null, grace = 0 }) {
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const inRange = (s) => s >= fromStr && s <= toStr;
  const panels = periodPanels(from, to);

  const punchesByNo = new Map();
  const nameByNo = new Map();
  [...logs]
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at) || (a.id || 0) - (b.id || 0))
    .forEach((l) => {
      const no = l.employee_no_snapshot;
      if (!punchesByNo.has(no)) punchesByNo.set(no, []);
      const out = isOutEvent(l.event_type);
      const at = new Date(l.recorded_at);
      punchesByNo.get(no).push({ out, at: out ? at : applyGrace(at, officialStart, grace) });
      if (l.employee?.full_name) nameByNo.set(no, l.employee.full_name);
    });

  const roster = new Map();
  employees.forEach((e) => {
    if (e.status === 'active' || punchesByNo.has(e.employee_no)) roster.set(e.employee_no, { no: e.employee_no, name: e.full_name, position: e.position || '' });
  });
  punchesByNo.forEach((_, no) => { if (!roster.has(no)) roster.set(no, { no, name: nameByNo.get(no) || no, position: '' }); });

  return [...roster.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((emp) => {
      const { days, fillers } = placePunches(punchesByNo.get(emp.no) || [], inRange, fillBreak);
      fillers.forEach((day) => {
        const c = days.get(day);
        if (c && !c.mD && !c.aA) { c.fillMD = true; c.fillAA = true; }
      });

      let punchDays = 0;
      const out = panels.map((p) => ({
        label: p.label,
        rows: Array.from({ length: 31 }, (_, i) => {
          const day = i + 1;
          if (day < p.start || day > p.end) return { day, inRange: false };
          const date = ymd(new Date(p.year, p.month, day));
          const c = days.get(date) || {};
          const cells = {
            mA: c.mA ? fmtClock(c.mA) : '',
            mD: c.mD ? fmtClock(c.mD) : c.fillMD ? NOON : '',
            aA: c.aA ? fmtClock(c.aA) : c.fillAA ? ONE_PM : '',
            aD: c.aD ? fmtClock(c.aD) : '',
          };
          const hasPunch = !!(c.mA || c.mD || c.aA || c.aD);
          if (hasPunch) punchDays += 1;
          const mark = marks.get(`${emp.no}|${date}`) || marks.get(`*|${date}`) || null;
          if (mark === 'OFF' && hasPunch) {
            // e.g. a night shift that ended this morning, then the day off: keep the punch, fill the rest.
            ['mA', 'mD', 'aA', 'aD'].forEach((k) => { if (!cells[k]) cells[k] = 'OFF'; });
          }
          return { day, inRange: true, date, cells, mark, hasPunch, full: !hasPunch && mark ? mark : null };
        }),
      }));
      return { ...emp, panels: out, punchDays };
    });
}
