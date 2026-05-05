// Pure helpers backing the Today page's "Today schedule" and "Inbox preview"
// cards. Selection is deterministic and timezone-explicit so behavioral
// tests stay stable across CI zones.

import {
  eventsForDay,
  type MeetingEvent,
  toMeetingEvents,
} from "#/lib/calendar-view";
import type { StoredSignal } from "#/lib/next-up";
import type { SignalKind } from "#/lib/signal";

const TICKET_KINDS: SignalKind[] = [
  "ticket_assigned",
  "ticket_in_progress",
  "ticket_in_review",
  "ticket_blocked",
];

const PR_REVIEW_KIND: SignalKind = "pr_review_requested";
const MEETING_KIND: SignalKind = "meeting";

// Sort priority: in-progress first, then in-review, blocked, then assigned.
const TICKET_KIND_RANK: Record<string, number> = {
  ticket_in_progress: 0,
  ticket_in_review: 1,
  ticket_blocked: 2,
  ticket_assigned: 3,
};

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

/**
 * Currently in-progress tickets. Drops dismissed rows and orders by status
 * (in-progress > in-review > blocked > assigned), then most-recent
 * `source_created_at`.
 */
export function pickInProgressTickets(
  signals: StoredSignal[],
  limit?: number,
): StoredSignal[] {
  const live = signals.filter(
    (s) =>
      !s.dismissed_at && (TICKET_KINDS as readonly string[]).includes(s.kind),
  );
  const sorted = [...live].sort((a, b) => {
    const ra = TICKET_KIND_RANK[a.kind] ?? 99;
    const rb = TICKET_KIND_RANK[b.kind] ?? 99;
    if (ra !== rb) return ra - rb;
    const at = a.source_created_at ? Date.parse(a.source_created_at) : 0;
    const bt = b.source_created_at ? Date.parse(b.source_created_at) : 0;
    return bt - at;
  });
  return typeof limit === "number"
    ? sorted.slice(0, Math.max(0, limit))
    : sorted;
}

export type WeekStats = {
  prsReviewed: number;
  ticketsShipped: number;
  focusHours: number;
  meetingsAttended: number;
};

/**
 * Aggregate counts over the rolling 7-day window ending at `now`. Caller is
 * responsible for fetching the raw signals (with dismissed rows included)
 * for that window. The helper itself is pure and time-zone agnostic.
 *
 * - PRs reviewed = `pr_review_requested` rows that are no longer actionable
 *   (dismissed or `requires_action=false` after being acted on).
 * - Tickets shipped = ticket-kind rows dismissed within the window.
 * - Focus hours = sum of meeting durations (hours, rounded to 1 decimal) for
 *   meeting rows where `payload.is_focus === true` whose start is in window.
 * - Meetings attended = meeting rows whose start is in [now-7d, now].
 */
export function computeWeekStats(
  signals: StoredSignal[],
  now: Date,
): WeekStats {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const inWindow = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return false;
    return t >= weekAgo && t <= now.getTime();
  };

  let prsReviewed = 0;
  let ticketsShipped = 0;
  let focusMs = 0;
  let meetingsAttended = 0;

  for (const s of signals) {
    if (s.kind === PR_REVIEW_KIND) {
      const acted = !s.requires_action || s.dismissed_at != null;
      if (acted && inWindow(s.source_created_at)) prsReviewed += 1;
      continue;
    }
    if ((TICKET_KINDS as readonly string[]).includes(s.kind)) {
      if (s.dismissed_at && inWindow(s.dismissed_at)) ticketsShipped += 1;
      continue;
    }
    if (s.kind === MEETING_KIND) {
      const startsAt = (s.payload?.starts_at as string | undefined) ?? null;
      if (inWindow(startsAt)) meetingsAttended += 1;
      if (s.payload?.is_focus === true && inWindow(startsAt)) {
        const endsAtRaw = s.payload?.ends_at as string | undefined;
        const startMs = startsAt ? Date.parse(startsAt) : Number.NaN;
        const endMs = endsAtRaw ? Date.parse(endsAtRaw) : Number.NaN;
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
          focusMs += endMs - startMs;
        }
      }
    }
  }

  const focusHours = Math.round((focusMs / 3_600_000) * 10) / 10;
  return { prsReviewed, ticketsShipped, focusHours, meetingsAttended };
}
