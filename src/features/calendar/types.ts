// Shared Calendar types. The data-shaping layer (events.ts) and the
// geometry layer (layout.ts) both consume these. Keeping them in one
// file means downstream renderers can import a single namespace.

import type { LinkedItem, StoredSignal } from "#/shared/signal";

export type MeetingEvent = {
  signal: StoredSignal;
  startsAt: Date;
  endsAt: Date;
  videoLink: string | null;
  linkedItems: LinkedItem[];
  isFocus: boolean;
};

export type DayBucket = { day: Date; events: MeetingEvent[] };

export type MonthCell = DayBucket & { inMonth: boolean };

export type Conflict = { a: MeetingEvent; b: MeetingEvent };

export type EventKind = "focus" | "meeting" | "break";

export type WeekEvent = {
  id: string;
  /** 0 = Monday, 1 = Tuesday, … 4 = Friday for the Mon–Fri week grid. */
  day: number;
  /** Minutes from midnight, inclusive. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
  kind: EventKind;
  title: string;
};

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
