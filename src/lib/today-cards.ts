// Pure helpers backing the Today page's "Today schedule" and "Inbox preview"
// cards. Selection is deterministic and timezone-explicit so behavioral
// tests stay stable across CI zones.

import {
  eventsForDay,
  type MeetingEvent,
  toMeetingEvents,
} from "#/lib/calendar-view";
import type { StoredSignal } from "#/lib/next-up";

/**
 * Today's meeting events in start-time order. Dismissed and non-meeting
 * Signals are dropped by `toMeetingEvents`. "Today" is the host-local
 * calendar day for `now`.
 */
export function pickTodaySchedule(
  signals: StoredSignal[],
  now: Date,
): MeetingEvent[] {
  return eventsForDay(toMeetingEvents(signals), now);
}

/**
 * Top `limit` actionable Signals for the Inbox preview card. Drops
 * dismissed rows, prefers `requires_action`, falls back to most-recent
 * `source_created_at`.
 */
export function pickInboxPreview(
  signals: StoredSignal[],
  limit: number,
): StoredSignal[] {
  const live = signals.filter((s) => !s.dismissed_at);
  const sorted = [...live].sort((a, b) => {
    if (a.requires_action !== b.requires_action) {
      return a.requires_action ? -1 : 1;
    }
    const at = a.source_created_at ? Date.parse(a.source_created_at) : 0;
    const bt = b.source_created_at ? Date.parse(b.source_created_at) : 0;
    return bt - at;
  });
  return sorted.slice(0, Math.max(0, limit));
}
