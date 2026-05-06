// Pure helpers backing the Today page's Next-up card and the 10-minute
// in-app meeting alert. Kept module-local so the rendering layer stays a
// thin shell over deterministic functions that are easy to test.

import type { Signal } from "#/lib/signal";

export type StoredSignal = Signal & {
  id: string;
  dismissed_at: string | null;
};

export type LinkedItem =
  | { kind: "pr"; url: string; repo: string; number: number }
  | { kind: "ticket"; url: string; key: string };

export type NextUpMeeting = {
  signal: StoredSignal;
  startsAt: Date;
  endsAt: Date | null;
  videoLink: string | null;
  linkedItems: LinkedItem[];
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

const ALERT_WINDOW_MIN_MS = 9 * 60 * 1000;
const ALERT_WINDOW_MAX_MS = 11 * 60 * 1000;

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

export function formatCountdown(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "now";
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  if (minutes > 0) return `in ${minutes}m`;
  return "in <1m";
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
