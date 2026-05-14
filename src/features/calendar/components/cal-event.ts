// Shared types and constants for the Calendar page fixture layer.
// The real data pipeline (events.ts / layout.ts) uses MeetingEvent and
// WeekEvent; this file covers the fixture-friendly decimal-hour shape used
// by the Calendar route until real data wiring lands.

export type CalEventKind = "focus" | "meeting" | "break" | "personal";

export type CalEvent = {
  id: string;
  /** 0 = Mon, 1 = Tue, … 4 = Fri in a Mon-start week. */
  day: number;
  /** Decimal hours from midnight (9.75 = 09:45). */
  start: number;
  /** Decimal hours from midnight, exclusive. */
  end: number;
  title: string;
  kind: CalEventKind;
  /** One of the CAL_ACCOUNTS ids. */
  account: string;
  /** True when this event overlaps another and should render with the conflict stripe. */
  conflict?: boolean;
  location?: string;
  attendees?: string[];
  notes?: string;
  agenda?: string;
};

export type CalAccount = {
  id: string;
  label: string;
  short: string;
  color: string;
};

export const CAL_ACCOUNTS: CalAccount[] = [
  { id: "cal-work", label: "erin@kovacs.dev", short: "Work", color: "#1d4ed8" },
  {
    id: "cal-personal",
    label: "erin@personal.com",
    short: "Personal",
    color: "#0a8754",
  },
  {
    id: "cal-team",
    label: "team.calendar (shared)",
    short: "Team",
    color: "#9333ea",
  },
];

/** Pixels per hour in the 24-h timeline grid. */
export const ROW_H = 44;

/** Pixel height of the scrollable grid viewport. */
export const VISIBLE_H = 560;

/** Hour the timeline auto-scrolls to on mount. */
export const SCROLL_TO_HOUR = 7;

/** Full 0-23 hour array for rendering hour rules. */
export const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

/** Format decimal hours as "H:MM" (9.75 → "9:45"). */
export function fmtCalHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

/** Resolve a CalAccount by id, falling back to the first account. */
export function accountFor(id: string): CalAccount {
  return CAL_ACCOUNTS.find((a) => a.id === id) ?? CAL_ACCOUNTS[0];
}

/**
 * Build a per-event conflict layout map.
 *
 * Groups same-day events into overlap clusters (à la layoutLanes in
 * layout.ts). Multi-event clusters get side-by-side column assignments;
 * single-event clusters are omitted so those events render full-width.
 */
export function buildConflictLayout(
  events: CalEvent[],
): Map<string, { col: number; of: number }> {
  const byDay = new Map<number, CalEvent[]>();
  for (const e of events) {
    const bucket = byDay.get(e.day);
    if (bucket) {
      bucket.push(e);
    } else {
      byDay.set(e.day, [e]);
    }
  }

  const result = new Map<string, { col: number; of: number }>();

  for (const dayEvents of byDay.values()) {
    const sorted = [...dayEvents].sort((a, b) => a.start - b.start);

    type Cluster = { items: CalEvent[]; end: number };
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
      if (cluster.items.length <= 1) continue;

      const lanes: number[] = [];
      const assigned = new Map<string, number>();

      for (const e of cluster.items) {
        let col = lanes.findIndex((endTime) => endTime <= e.start);
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
        result.set(e.id, { col: assigned.get(e.id) ?? 0, of });
      }
    }
  }

  return result;
}
