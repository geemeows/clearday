// Pure helpers backing the Calendar page: turn meeting Signals into
// view-ready events, group them by local day or week, detect overlapping
// events, and pick out focus blocks.
//
// Local-time bounds are computed against the host's IANA zone via the Date
// constructor — the Calendar page is always rendered in the user's browser
// so this is the right thing here. Tests construct Dates explicitly so they
// stay stable across CI zones (TZ=UTC in CI).

import type { LinkedItem, StoredSignal } from "#/lib/next-up";

export type MeetingEvent = {
  signal: StoredSignal;
  startsAt: Date;
  endsAt: Date;
  videoLink: string | null;
  linkedItems: LinkedItem[];
  isFocus: boolean;
};

export function toMeetingEvent(signal: StoredSignal): MeetingEvent | null {
  if (signal.kind !== "meeting") return null;
  if (signal.dismissed_at) return null;
  const startsAtRaw = signal.payload?.starts_at;
  const endsAtRaw = signal.payload?.ends_at;
  if (typeof startsAtRaw !== "string" || typeof endsAtRaw !== "string") {
    return null;
  }
  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null;
  }
  return {
    signal,
    startsAt,
    endsAt,
    videoLink:
      typeof signal.payload?.video_link === "string"
        ? (signal.payload.video_link as string)
        : null,
    linkedItems: (signal.payload?.linked_items ?? []) as LinkedItem[],
    isFocus: detectFocus(signal),
  };
}

export function toMeetingEvents(signals: StoredSignal[]): MeetingEvent[] {
  const out: MeetingEvent[] = [];
  for (const s of signals) {
    const e = toMeetingEvent(s);
    if (e) out.push(e);
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}

export function localDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function localDayEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
}

/**
 * Sunday 00:00 local for the week containing `d`. JS getDay() returns
 * 0 = Sunday so the offset is the day index itself.
 */
export function weekStartFor(d: Date): Date {
  const start = localDayStart(d);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function eventsForDay(
  events: MeetingEvent[],
  day: Date,
): MeetingEvent[] {
  const start = localDayStart(day).getTime();
  const end = localDayEnd(day).getTime();
  return events.filter(
    (e) => e.startsAt.getTime() >= start && e.startsAt.getTime() < end,
  );
}

export type DayBucket = { day: Date; events: MeetingEvent[] };

export function eventsByWeekDay(
  events: MeetingEvent[],
  weekStart: Date,
): DayBucket[] {
  const start = localDayStart(weekStart);
  const buckets: DayBucket[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    buckets.push({ day, events: eventsForDay(events, day) });
  }
  return buckets;
}

export type Conflict = { a: MeetingEvent; b: MeetingEvent };

/**
 * Returns each pair of events whose intervals overlap (open interval —
 * back-to-back events sharing only an endpoint do *not* conflict).
 * Pairs are emitted once and ordered by their earliest start.
 */
export function findConflicts(events: MeetingEvent[]): Conflict[] {
  const sorted = [...events].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const out: Conflict[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      // Sorted by start, so b.startsAt >= a.startsAt. Stop when b starts
      // at-or-after a ends — no further j can overlap a.
      if (b.startsAt.getTime() >= a.endsAt.getTime()) break;
      out.push({ a, b });
    }
  }
  return out;
}

/** First conflict whose later event is still in the future (or in progress). */
export function pickNextConflict(
  events: MeetingEvent[],
  now: Date,
): Conflict | null {
  for (const c of findConflicts(events)) {
    if (c.b.endsAt.getTime() > now.getTime()) return c;
  }
  return null;
}

export function pickFocusBlocks(events: MeetingEvent[]): MeetingEvent[] {
  return events.filter((e) => e.isFocus);
}

function detectFocus(signal: StoredSignal): boolean {
  if (signal.payload?.is_focus === true) return true;
  const title = signal.title?.toLowerCase() ?? "";
  return /\b(focus|deep work|heads down|dnd)\b/.test(title);
}
