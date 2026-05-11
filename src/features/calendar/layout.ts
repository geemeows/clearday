// Pure geometry for the Calendar week / day views. Off-by-one bugs at
// week boundaries and lane collisions used to live in _app.calendar.tsx —
// pulling them here makes them table-testable without rendering the route.
//
// All time math uses host-local Date arithmetic; tests construct Dates
// explicitly (or rely on TZ=UTC in CI) so behavior stays stable across zones.

import type {
  ConflictPair,
  EventKind,
  MeetingEvent,
  WeekEvent,
  WeekEventInterval,
} from "./types";

export type { ConflictPair, WeekEventInterval };

/** Monday 00:00 local for the week containing `d`. */
export function mondayOf(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

/**
 * Week-start 00:00 local for the week containing `d`, anchored to the user's
 * preferred first day of the week. JS Date.getDay() returns 0=Sun..6=Sat;
 * map weekStart to that anchor.
 */
export type WeekStartDay = "sun" | "mon" | "sat";

export function weekStartOf(d: Date, weekStart: WeekStartDay): Date {
  const anchor = weekStart === "sun" ? 0 : weekStart === "sat" ? 6 : 1;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (start.getDay() - anchor + 7) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

/** 0..4 if `d` falls Mon–Fri, else null (weekend). */
export function mondayCol(d: Date): number | null {
  const offset = (d.getDay() + 6) % 7;
  if (offset > 4) return null;
  return offset;
}

export function dayLabel(weekStart: Date, dayIdx: number): string {
  const day = new Date(weekStart);
  day.setDate(weekStart.getDate() + dayIdx);
  return day.toLocaleDateString(undefined, { weekday: "short" });
}

export function dayLongLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function weekRangeLabel(now: Date): string {
  const start = mondayOf(now);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function fmtHour(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function detectKind(e: MeetingEvent): EventKind {
  if (e.isFocus) return "focus";
  const t = e.signal.title?.toLowerCase() ?? "";
  if (/\bbreak\b|\blunch\b/.test(t)) return "break";
  return "meeting";
}

export function toWeekEvents(
  events: MeetingEvent[],
  weekStart: Date,
  options: { dayStartMin?: number; dayEndMin?: number } = {},
): WeekEvent[] {
  const dayStartMin = options.dayStartMin ?? 0;
  const dayEndMin = options.dayEndMin ?? 24 * 60;
  const start = weekStart.getTime();
  const end = start + 5 * 24 * 60 * 60 * 1000;
  const out: WeekEvent[] = [];
  for (const e of events) {
    const t = e.startsAt.getTime();
    if (t < start || t >= end) continue;
    const day = Math.floor((t - start) / (24 * 60 * 60 * 1000));
    if (day < 0 || day > 4) continue;
    const startMin = e.startsAt.getHours() * 60 + e.startsAt.getMinutes();
    const endMin = e.endsAt.getHours() * 60 + e.endsAt.getMinutes();
    if (endMin <= dayStartMin || startMin >= dayEndMin) continue;
    out.push({
      id: e.signal.id,
      day,
      start: Math.max(startMin, dayStartMin),
      end: Math.min(endMin, dayEndMin),
      kind: detectKind(e),
      title: e.signal.title,
    });
  }
  return out;
}

/**
 * Pack same-day overlapping events into side-by-side lanes. Greedy: events
 * sorted by start, each placed in the leftmost lane whose previous event
 * has already ended.
 */
export function layoutLanes(
  events: WeekEvent[],
): Map<string, { col: number; of: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start);
  const out = new Map<string, { col: number; of: number }>();
  type Cluster = { items: WeekEvent[]; end: number };
  const clusters: Cluster[] = [];
  for (const e of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && e.start < last.end) {
      last.items.push(e);
      last.end = Math.max(last.end, e.end);
    } else {
      clusters.push({ items: [e], end: e.end });
    }
  }
  for (const cluster of clusters) {
    const lanes: number[] = [];
    const assigned = new Map<string, number>();
    for (const e of cluster.items) {
      let col = lanes.findIndex((endMin) => endMin <= e.start);
      if (col === -1) {
        col = lanes.length;
        lanes.push(e.end);
      } else {
        lanes[col] = e.end;
      }
      assigned.set(e.id, col);
    }
    const of = lanes.length;
    for (const e of cluster.items) {
      const col = assigned.get(e.id) ?? 0;
      out.set(e.id, { col, of });
    }
  }
  return out;
}

/**
 * Per-day overlap detector for the week grid. Cross-day events never
 * conflict; edge-touching events (a.end === b.start) do not conflict.
 */
export function detectConflicts<T extends WeekEventInterval>(
  events: T[],
): ConflictPair<T>[] {
  const out: ConflictPair<T>[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const a = events[i];
    for (let j = i + 1; j < events.length; j += 1) {
      const b = events[j];
      if (a.day !== b.day) continue;
      if (a.start < b.end && b.start < a.end) {
        out.push({ a, b });
      }
    }
  }
  return out;
}
