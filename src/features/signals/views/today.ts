// Pure selectors backing the Today and Inbox surfaces. Every function here
// reads StoredSignal[] and returns a derived view — no fetches, no I/O — so
// the rendering layer stays a thin shell over deterministic logic that's
// easy to test. Selection is timezone-explicit where it matters so behavior
// stays stable across CI zones.

import {
  eventsForDay,
  type MeetingEvent,
  toMeetingEvents,
} from "#/features/signals/views/calendar";
import type { LinkedItem, SignalKind, StoredSignal } from "#/shared/signal";

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

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_WINDOW_MIN_MS = 9 * 60 * 1000;
const ALERT_WINDOW_MAX_MS = 11 * 60 * 1000;

export type NextUpMeeting = {
  signal: StoredSignal;
  startsAt: Date;
  endsAt: Date | null;
  videoLink: string | null;
  linkedItems: LinkedItem[];
};

export type WeekStats = {
  prsReviewed: number;
  ticketsShipped: number;
  focusHours: number;
  inboxZeroedDays: number;
};

export function pickNextUp(
  signals: StoredSignal[],
  now: Date,
): NextUpMeeting | null {
  return pickUpcoming(signals, now, 1)[0] ?? null;
}

export function pickUpcoming(
  signals: StoredSignal[],
  now: Date,
  limit: number,
): NextUpMeeting[] {
  const candidates: NextUpMeeting[] = [];
  for (const s of signals) {
    if (s.kind !== "meeting") continue;
    if (s.dismissed_at) continue;
    const startsAtRaw = s.payload?.starts_at;
    if (typeof startsAtRaw !== "string") continue;
    const startsAt = new Date(startsAtRaw);
    if (Number.isNaN(startsAt.getTime())) continue;
    const endsAtRaw = s.payload?.ends_at;
    const endsAt = typeof endsAtRaw === "string" ? new Date(endsAtRaw) : null;
    // Skip meetings that have already ended.
    if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt < now) continue;
    // For meetings without an end time, skip if the start was more than 2h ago.
    if (!endsAt && now.getTime() - startsAt.getTime() > 2 * 60 * 60 * 1000) {
      continue;
    }
    candidates.push({
      signal: s,
      startsAt,
      endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
      videoLink: stringOrNull(s.payload?.video_link),
      linkedItems: (s.payload?.linked_items ?? []) as LinkedItem[],
    });
  }
  candidates.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return candidates.slice(0, Math.max(0, limit));
}

/**
 * Returns the meeting Signal that should fire a "starts in ~10 min" alert
 * right now, or null. The window is [now+9min, now+11min] — symmetric around
 * the 10-minute mark so a 1-minute-tick poller won't miss it.
 */
export function pickMeetingForAlert(
  signals: StoredSignal[],
  now: Date,
): StoredSignal | null {
  const t = now.getTime();
  for (const s of signals) {
    if (s.kind !== "meeting") continue;
    if (s.dismissed_at) continue;
    const startsAtRaw = s.payload?.starts_at;
    if (typeof startsAtRaw !== "string") continue;
    const ms = Date.parse(startsAtRaw);
    if (Number.isNaN(ms)) continue;
    const delta = ms - t;
    if (delta >= ALERT_WINDOW_MIN_MS && delta <= ALERT_WINDOW_MAX_MS) {
      return s;
    }
  }
  return null;
}

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
 * - Inbox-zeroed days = count of completed UTC days in the last 7 where the
 *   user received at least one actionable Signal AND every actionable Signal
 *   created on or before end-of-day was dismissed by end-of-day.
 */
export function computeWeekStats(
  signals: StoredSignal[],
  now: Date,
): WeekStats {
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const inWindow = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return false;
    return t >= weekAgo && t <= now.getTime();
  };

  let prsReviewed = 0;
  let ticketsShipped = 0;
  let focusMs = 0;

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
    if (s.kind === MEETING_KIND && s.payload?.is_focus === true) {
      const startsAt = (s.payload?.starts_at as string | undefined) ?? null;
      if (inWindow(startsAt)) {
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
  const inboxZeroedDays = countInboxZeroedDays(signals, now);
  return { prsReviewed, ticketsShipped, focusHours, inboxZeroedDays };
}

/**
 * Restricts meeting Signals to ones whose start time is in the user's current
 * local day. The cron ingests a 30-day Calendar window so the Calendar route
 * can render Week/Month, but the Inbox + /today widgets are for "what's
 * happening now/next" — a month of meetings would drown out everything else.
 *
 * Non-meeting Signals (PRs, mentions, tickets) pass through untouched.
 */
export function filterMeetingsToToday<T extends MeetingFilterShape>(
  signals: T[],
  now: Date = new Date(),
): T[] {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const end = start + DAY_MS;
  return signals.filter((s) => {
    if (s.kind !== "meeting") return true;
    const startsAt =
      typeof s.payload?.starts_at === "string"
        ? Date.parse(s.payload.starts_at)
        : s.source_created_at
          ? Date.parse(s.source_created_at)
          : Number.NaN;
    if (Number.isNaN(startsAt)) return true;
    return startsAt >= start && startsAt < end;
  });
}

type MeetingFilterShape = {
  kind: string;
  payload?: Record<string, unknown> | null;
  source_created_at?: string | null;
};

function countInboxZeroedDays(signals: StoredSignal[], now: Date): number {
  const todayUtcStart = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  let count = 0;
  for (let i = 1; i <= 7; i++) {
    const dayStart = todayUtcStart - i * DAY_MS;
    const dayEnd = dayStart + DAY_MS - 1;
    let receivedToday = false;
    let unhandledCarry = false;
    for (const s of signals) {
      if (!s.requires_action) continue;
      const created = s.source_created_at
        ? Date.parse(s.source_created_at)
        : Number.NaN;
      if (Number.isNaN(created) || created > dayEnd) continue;
      if (created >= dayStart) receivedToday = true;
      const dismissed = s.dismissed_at
        ? Date.parse(s.dismissed_at)
        : Number.NaN;
      if (Number.isNaN(dismissed) || dismissed > dayEnd) {
        unhandledCarry = true;
      }
    }
    if (receivedToday && !unhandledCarry) count += 1;
  }
  return count;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
