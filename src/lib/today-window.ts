// Restricts meeting Signals to ones whose start time is in the user's current
// local day. The cron ingests a 30-day Google Calendar window so the Calendar
// route can render Week/Month, but the Inbox + /today widgets are for "what's
// happening now/next" — a month of meetings would drown out everything else.
//
// Non-meeting Signals (PRs, mentions, tickets) pass through untouched.

type SignalLike = {
  kind: string;
  payload?: Record<string, unknown> | null;
  source_created_at?: string | null;
};

export function filterMeetingsToToday<T extends SignalLike>(
  signals: T[],
  now: Date = new Date(),
): T[] {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const end = start + 24 * 60 * 60 * 1000;
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
