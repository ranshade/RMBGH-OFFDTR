/*
 * System logs (audit trail) — frontend data layer.
 *
 * EXPECTED API CONTRACT (to be built in Laravel later)
 *   GET /api/system-logs?from=YYYY-MM-DD&to=YYYY-MM-DD      (admin bearer token)
 *   -> 200  [ Entry, ... ]   or   { data: [ Entry, ... ] }   newest first
 *
 *   Entry = {
 *     id:         number | string,
 *     created_at: ISO-8601 string,
 *     category:   "auth" | "attendance" | "employee" | "dtr" | "system",
 *     action:     string,              // see ACTIONS below, e.g. "attendance.edited"
 *     severity:   "info" | "warning" | "critical",
 *     actor:      { type: "admin" | "employee" | "kiosk" | "system", name: string, id?: string },
 *     target:     { type: string, label: string } | null,
 *     summary:    string,              // one human sentence
 *     changes:    [{ field: string, old: any, new: any }] | null,
 *     ip:         string | null,
 *     station_code: string | null,
 *     uuid:       string | null        // e.g. the punch record_uuid
 *   }
 *
 * Until that endpoint exists the page falls back to generated demo data and says so on screen.
 */
import { adminFetch } from "./lib";
import { ymd } from "./dtr";

export const CATEGORIES = [
  ["all", "All"],
  ["auth", "Sign-ins"],
  ["attendance", "Punches"],
  ["employee", "Employees"],
  ["dtr", "DTR"],
  ["system", "System"],
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);

export const SEVERITIES = [
  ["all", "All severities"],
  ["info", "Info"],
  ["warning", "Warning"],
  ["critical", "Critical"],
];

// action -> short label shown in the table
export const ACTIONS = {
  "auth.login": "Admin signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.logout": "Admin signed out",
  "auth.lockout": "Sign-in locked out",
  "attendance.manual_added": "Punch added manually",
  "attendance.edited": "Punch edited",
  "attendance.deleted": "Punch deleted",
  "attendance.photo_viewed": "Punch photo viewed",
  "employee.created": "Employee added",
  "employee.updated": "Employee updated",
  "employee.deactivated": "Employee deactivated",
  "employee.reactivated": "Employee reactivated",
  "dtr.mark_set": "Day mark set",
  "dtr.mark_removed": "Day mark removed",
  "dtr.printed": "DTR printed",
  "report.exported": "Report exported",
  "system.station_offline": "Kiosk lost connection",
  "system.station_online": "Kiosk back online",
};

export const actionLabel = (a) => ACTIONS[a] || a;

/* ------------------------------------------------------------------ fetching */

const unwrap = (json) => (Array.isArray(json) ? json : json?.data || []);

/**
 * @returns {{ rows: Entry[], demo: boolean, note: string, unauthorized?: boolean }}
 */
export async function fetchSystemLogs(from, to) {
  const fromStr = ymd(from);
  const toStr = ymd(to);
  try {
    const r = await adminFetch(`/system-logs?from=${fromStr}&to=${toStr}`);
    if (r.status === 401)
      return { rows: [], demo: false, note: "", unauthorized: true };
    if (r.ok) return { rows: unwrap(await r.json()), demo: false, note: "" };
    return {
      rows: demoLogs(from, to),
      demo: true,
      note: "The /system-logs endpoint is not available on the server yet.",
    };
  } catch {
    return {
      rows: demoLogs(from, to),
      demo: true,
      note: "The server could not be reached.",
    };
  }
}

/* ------------------------------------------------------------------ demo data */

// Small seeded PRNG so the demo looks the same on every render.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function demoLogs(from, to, now = new Date()) {
  const rand = rng(20260901);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const admins = ["Super Admin", "HR Officer"];
  const staff = [
    ["EMP-1042", "Maria Santos"],
    ["EMP-1107", "Jose Reyes"],
    ["EMP-1215", "Ana Dela Cruz"],
    ["EMP-1330", "Carlo Bautista"],
    ["EMP-1408", "Liza Mendoza"],
  ];
  const rows = [];
  let id = 1;
  const add = (
    at,
    category,
    action,
    severity,
    actor,
    target,
    summary,
    extra = {},
  ) => {
    rows.push({
      id: id++,
      created_at: at.toISOString(),
      category,
      action,
      severity,
      actor,
      target,
      summary,
      changes: null,
      ip: actor.type === "admin" ? "192.168.1.20" : null,
      station_code: actor.type === "kiosk" ? "NURSE-STN-01" : null,
      uuid: null,
      ...extra,
    });
  };
  const at = (d, h, m) =>
    new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      h,
      m,
      Math.floor(rand() * 60),
    );

  const days = 35;
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (at(d, 0, 0) > now) continue;
    const admin = { type: "admin", name: pick(admins) };

    if (!weekend) {
      add(
        at(d, 8, 10 + Math.floor(rand() * 40)),
        "auth",
        "auth.login",
        "info",
        admin,
        null,
        `${admin.name} signed in to the admin area.`,
      );
      if (rand() < 0.45) {
        const [no, name] = pick(staff);
        const oldT = "08:41 AM";
        add(
          at(d, 9, 30 + Math.floor(rand() * 25)),
          "attendance",
          "attendance.edited",
          "warning",
          admin,
          { type: "punch", label: `${name} (${no})` },
          `Time in corrected for ${name}.`,
          {
            changes: [
              {
                field: "recorded_at",
                old: `${ymd(d)} ${oldT}`,
                new: `${ymd(d)} 08:05 AM`,
              },
              {
                field: "reason",
                old: null,
                new: "Forgot to punch; confirmed by supervisor",
              },
            ],
            uuid: `9f2c${i}a1e-77b0-4c1b-9d5e-${1000 + i}`,
          },
        );
      }
      if (rand() < 0.35) {
        const [no, name] = pick(staff);
        add(
          at(d, 10, 5 + Math.floor(rand() * 40)),
          "attendance",
          "attendance.manual_added",
          "warning",
          admin,
          { type: "punch", label: `${name} (${no})` },
          `Missing TIME OUT added for ${name}.`,
          {
            changes: [
              { field: "event_type", old: null, new: "TIME OUT" },
              { field: "recorded_at", old: null, new: `${ymd(d)} 05:02 PM` },
            ],
          },
        );
      }
      if (rand() < 0.2) {
        const [no, name] = pick(staff);
        add(
          at(d, 11, 15),
          "attendance",
          "attendance.photo_viewed",
          "info",
          admin,
          { type: "punch", label: `${name} (${no})` },
          `Punch photo of ${name} opened.`,
        );
      }
      if (rand() < 0.12) {
        add(
          at(d, 13, 20),
          "employee",
          rand() < 0.5 ? "employee.updated" : "employee.created",
          "info",
          admin,
          { type: "employee", label: pick(staff)[1] },
          "Employee record changed.",
          {
            changes: [
              { field: "department", old: "Nursing", new: "Laboratory" },
            ],
          },
        );
      }
      if (rand() < 0.25)
        add(
          at(d, 16, 40),
          "dtr",
          "dtr.printed",
          "info",
          admin,
          { type: "dtr", label: "Current cut-off" },
          "DTRs printed for the cut-off.",
        );
      add(
        at(d, 17, 30 + Math.floor(rand() * 25)),
        "auth",
        "auth.logout",
        "info",
        admin,
        null,
        `${admin.name} signed out.`,
      );
    }
    // a few kiosk drop-outs, mostly in the early morning rush
    if (rand() < 0.18) {
      const down = at(d, 6, 30 + Math.floor(rand() * 30));
      const station = { type: "kiosk", name: "NURSE-STN-01" };
      add(
        down,
        "system",
        "system.station_offline",
        "warning",
        station,
        { type: "station", label: "NURSE-STN-01" },
        "Kiosk could not reach the server; punches queued offline.",
      );
      add(
        new Date(down.getTime() + (8 + Math.floor(rand() * 40)) * 60000),
        "system",
        "system.station_online",
        "info",
        station,
        { type: "station", label: "NURSE-STN-01" },
        "Kiosk reconnected and synced queued punches.",
      );
    }
  }

  // Storylines worth surfacing: a failed-login burst, an after-hours deletion, a holiday mark.
  const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
  for (let k = 0; k < 5; k++) {
    add(
      new Date(at(d2, 2, 14).getTime() + k * 70000),
      "auth",
      "auth.login_failed",
      "warning",
      { type: "admin", name: "Unknown" },
      null,
      "Wrong admin password.",
      { ip: "203.0.113.44" },
    );
  }
  add(
    new Date(at(d2, 2, 21).getTime()),
    "auth",
    "auth.lockout",
    "critical",
    { type: "admin", name: "Unknown" },
    null,
    "Admin sign-in locked after repeated failures.",
    { ip: "203.0.113.44" },
  );
  const d3 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4);
  add(
    at(d3, 22, 48),
    "attendance",
    "attendance.deleted",
    "critical",
    { type: "admin", name: "HR Officer" },
    { type: "punch", label: "Jose Reyes (EMP-1107)" },
    "TIME IN punch deleted outside office hours.",
    {
      changes: [
        { field: "recorded_at", old: `${ymd(d3)} 08:33 AM`, new: null },
        { field: "event_type", old: "TIME IN", new: null },
      ],
      uuid: "b61d03ee-1f4a-47c2-8a9b-0c5e4d7f2a11",
    },
  );
  const d4 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  add(
    at(d4, 9, 2),
    "dtr",
    "dtr.mark_set",
    "info",
    { type: "admin", name: "Super Admin" },
    { type: "mark", label: ymd(d4) },
    "Marked as HOLIDAY for all employees.",
    { changes: [{ field: "type", old: null, new: "HOLIDAY" }] },
  );

  return rows
    .filter((r) => {
      const day = ymd(new Date(r.created_at));
      return (
        day >= ymd(from) && day <= ymd(to) && new Date(r.created_at) <= now
      );
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/* ------------------------------------------------------------------ analysis */

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export function analyzeLogs(rows, from, to, now = new Date()) {
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const warnings = rows.filter((r) => r.severity === "warning").length;
  const criticals = rows.filter((r) => r.severity === "critical").length;
  const failedLogins = rows.filter((r) => r.action === "auth.login_failed");
  const changes = rows.filter((r) =>
    [
      "attendance.manual_added",
      "attendance.edited",
      "attendance.deleted",
    ].includes(r.action),
  );
  const deletions = rows.filter((r) => r.action === "attendance.deleted");
  const afterHours = rows.filter((r) => {
    if (r.actor?.type !== "admin" || r.actor?.name === "Unknown") return false;
    if (r.category === "auth") return false;
    const h = new Date(r.created_at).getHours();
    return h < 6 || h >= 21;
  });

  // per-day counts, split by severity
  const dayMap = new Map();
  for (
    let d = new Date(from);
    ymd(d) <= toStr;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    dayMap.set(ymd(d), {
      date: ymd(d),
      dow: d.getDay(),
      info: 0,
      warning: 0,
      critical: 0,
    });
  }
  rows.forEach((r) => {
    const slot = dayMap.get(ymd(new Date(r.created_at)));
    if (slot) slot[r.severity] += 1;
  });
  const days = [...dayMap.values()];

  // failed sign-in bursts: 3+ failures from one IP within 15 minutes
  const byIp = new Map();
  failedLogins.forEach((r) => {
    const k = r.ip || "unknown";
    if (!byIp.has(k)) byIp.set(k, []);
    byIp.get(k).push(new Date(r.created_at).getTime());
  });
  const bursts = [];
  byIp.forEach((times, ip) => {
    times.sort((a, b) => a - b);
    let best = 0;
    let start = 0;
    for (let i = 0; i < times.length; i++) {
      while (times[i] - times[start] > 15 * 60000) start++;
      best = Math.max(best, i - start + 1);
    }
    if (best >= 3) bursts.push({ ip, count: best, at: new Date(times[0]) });
  });

  // who is making changes
  const actorMap = new Map();
  rows.forEach((r) => {
    const key = `${r.actor?.type}|${r.actor?.name}`;
    if (!actorMap.has(key))
      actorMap.set(key, {
        type: r.actor?.type || "system",
        name: r.actor?.name || "System",
        events: 0,
        changes: 0,
        last: r.created_at,
      });
    const a = actorMap.get(key);
    a.events += 1;
    if (changes.includes(r)) a.changes += 1;
    if (r.created_at > a.last) a.last = r.created_at;
  });
  const actors = [...actorMap.values()].sort((a, b) => b.events - a.events);

  const drops = rows.filter(
    (r) => r.action === "system.station_offline",
  ).length;
  const busiest = days.reduce(
    (b, d) =>
      !b || d.info + d.warning + d.critical > b.info + b.warning + b.critical
        ? d
        : b,
    null,
  );

  return {
    total: rows.length,
    warnings,
    criticals,
    attention: warnings + criticals,
    failedLogins: failedLogins.length,
    changes: changes.length,
    deletions,
    afterHours,
    bursts,
    drops,
    days,
    busiest,
    actors,
    avgPerDay: mean(days.map((d) => d.info + d.warning + d.critical)),
    fromStr,
    toStr,
    isToday: toStr === ymd(now),
  };
}

/* ------------------------------------------------------------------ export */

export function logsToCsv(rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    "Time",
    "Severity",
    "Category",
    "Action",
    "Actor",
    "Target",
    "Summary",
    "Changes",
    "IP",
    "Station",
  ];
  const lines = rows.map((r) =>
    [
      new Date(r.created_at).toLocaleString(),
      r.severity,
      r.category,
      actionLabel(r.action),
      r.actor?.name,
      r.target?.label,
      r.summary,
      (r.changes || [])
        .map((c) => `${c.field}: ${c.old ?? "—"} -> ${c.new ?? "—"}`)
        .join("; "),
      r.ip,
      r.station_code,
    ]
      .map(esc)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}
