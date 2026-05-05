// Pure conflict detection for the Calendar week view. Operates on lightweight
// {day, start, end} records so it can be tested without touching the
// MeetingEvent / Date pipeline. Cross-day events never conflict; edge-touching
// events (a.end === b.start) do not conflict.

export type WeekEventInterval = {
  /** 0 = Monday, 1 = Tuesday, … 4 = Friday for the Mon–Fri week grid. */
  day: number;
  /** Minutes from midnight, inclusive. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
};

export type ConflictPair<T extends WeekEventInterval = WeekEventInterval> = {
  a: T;
  b: T;
};

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
