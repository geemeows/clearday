// Pure derivation: StoredSignal[] → InProgressTicket[].
// Filters on ticket kinds, dedupes by source_id, orders by status rank then
// recency, ignores dismissed rows.

import type { InProgressTicket } from "#/features/today/components/InProgressCard";
import type { StoredSignal } from "#/shared/signal";

const TICKET_KINDS = [
  "ticket_in_progress",
  "ticket_in_review",
  "ticket_blocked",
  "ticket_assigned",
] as const;

const TICKET_KIND_RANK: Record<string, number> = {
  ticket_in_progress: 0,
  ticket_in_review: 1,
  ticket_blocked: 2,
  ticket_assigned: 3,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgo(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / MS_PER_DAY));
}

function priorityLabel(signal: StoredSignal): string {
  // Linear/Jira-style numeric priority in payload (1=urgent, 2=high, 3=medium, 4=low)
  const pl = signal.payload?.priority;
  if (typeof pl === "number") {
    if (pl <= 1) return "P1";
    if (pl === 2) return "P2";
    if (pl === 3) return "P3";
    return "P4";
  }
  if (signal.priority === "high") return "P1";
  if (signal.priority === "low") return "P3";
  return "P2";
}

function prRef(signal: StoredSignal): string | null {
  const pr = signal.payload?.pr_number ?? signal.payload?.pr;
  if (typeof pr === "number") return `#${pr}`;
  if (typeof pr === "string") return pr.startsWith("#") ? pr : `#${pr}`;
  return null;
}

/**
 * Derives the in-progress ticket list from raw signal rows. Pure — no I/O.
 *
 * @param signals All StoredSignal rows (dismissed rows are dropped internally).
 * @param now     Current time; used to compute days-in-progress.
 * @param limit   Maximum number of tickets to return (default 5).
 */
export function deriveInProgress(
  signals: StoredSignal[],
  now: Date = new Date(),
  limit = 5,
): InProgressTicket[] {
  const tickets = signals.filter(
    (s) =>
      !s.dismissed_at &&
      (TICKET_KINDS as readonly string[]).includes(s.kind),
  );

  const sorted = [...tickets].sort((a, b) => {
    const ra = TICKET_KIND_RANK[a.kind] ?? 99;
    const rb = TICKET_KIND_RANK[b.kind] ?? 99;
    if (ra !== rb) return ra - rb;
    const at = a.source_created_at ? Date.parse(a.source_created_at) : 0;
    const bt = b.source_created_at ? Date.parse(b.source_created_at) : 0;
    return bt - at;
  });

  // Dedupe by source_id (keep first = highest-rank occurrence)
  const seen = new Set<string>();
  const deduped = sorted.filter((s) => {
    const key = s.source_id || s.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, Math.max(0, limit)).map((s) => ({
    id: s.source_id || s.id,
    title: s.title,
    p: priorityLabel(s),
    days: daysAgo(s.source_created_at, now),
    pr: prRef(s),
  }));
}
