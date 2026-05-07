// UI-layer helpers for rendering Signals. Anything of the form "given a
// Signal, give me a string / group / tone for the UI" lives here so the
// inbox / today / detail routes share one source of truth.

import type { Signal, SignalKind, StoredSignal } from "#/shared/signal";

// SignalGroup is the UI-layer rollup over Signal.kind. The Slack group
// rolls up DMs / mentions / thread replies; the PR group rolls up review
// requested / authored / assigned. See CONTEXT.md for the glossary entry.
export type SignalGroup = "pr" | "slack" | "meeting" | "ticket";

export type Filter = "all" | "prs" | "tickets" | "mentions" | "meetings";

export function kindGroup(kind: SignalKind): SignalGroup {
  if (kind === "meeting") return "meeting";
  if (kind === "dm" || kind === "mention" || kind === "thread_reply")
    return "slack";
  if (
    kind === "ticket_assigned" ||
    kind === "ticket_in_progress" ||
    kind === "ticket_in_review" ||
    kind === "ticket_blocked"
  )
    return "ticket";
  return "pr";
}

export function groupOf(signal: Signal): SignalGroup {
  return kindGroup(signal.kind);
}

export function filterToGroup(f: Filter): SignalGroup | null {
  if (f === "prs") return "pr";
  if (f === "tickets") return "ticket";
  if (f === "mentions") return "slack";
  if (f === "meetings") return "meeting";
  return null;
}

export function computeFilterCounts(
  signals: ReadonlyArray<Signal>,
): Record<Filter, number> {
  const counts: Record<Filter, number> = {
    all: signals.length,
    prs: 0,
    tickets: 0,
    mentions: 0,
    meetings: 0,
  };
  for (const s of signals) {
    const g = kindGroup(s.kind);
    if (g === "pr") counts.prs += 1;
    else if (g === "ticket") counts.tickets += 1;
    else if (g === "slack") counts.mentions += 1;
    else if (g === "meeting") counts.meetings += 1;
  }
  return counts;
}

export function severityOf(signal: Signal): "ci_fail" | "conflict" | null {
  const explicit = signal.payload?.severity as string | undefined;
  if (explicit === "ci_fail") return "ci_fail";
  if (explicit === "conflict") return "conflict";
  if (signal.payload?.ci_failed === true) return "ci_fail";
  if (signal.payload?.has_conflict === true) return "conflict";
  return null;
}

export function secondaryLabel(s: Signal): string {
  if (s.provider === "slack") {
    const channelType = s.payload?.channel_type as string | undefined;
    const channel = s.payload?.channel as string | undefined;
    const channelName = s.payload?.channel_name as string | undefined;
    const author = s.payload?.author as string | undefined;
    const authorName = s.payload?.author_name as string | undefined;
    const where =
      channelType === "im"
        ? "DM"
        : channelName
          ? `#${channelName}`
          : channel
            ? `#${channel}`
            : "";
    const fromLabel = authorName
      ? `from ${authorName}`
      : author
        ? `from <@${author}>`
        : "";
    return [where, fromLabel].filter(Boolean).join(" · ");
  }
  if (s.kind === "meeting") {
    const startsAt = s.payload?.starts_at as string | undefined;
    if (!startsAt) return "";
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (s.provider === "linear" || s.provider === "jira") {
    const identifier =
      (s.payload?.identifier as string | undefined) ?? s.source_id;
    const stateName = (s.payload?.state_name as string | undefined) ?? "";
    return [identifier, stateName].filter(Boolean).join(" · ");
  }
  const repo = (s.payload?.repo as string | undefined) ?? "";
  const number = s.payload?.number as number | undefined;
  const author = (s.payload?.author as string | undefined) ?? "";
  const additions = s.payload?.additions as number | undefined;
  const deletions = s.payload?.deletions as number | undefined;
  const repoCell = repo
    ? `${repo}${typeof number === "number" ? ` #${number}` : ""}`
    : "";
  const diffCell =
    typeof additions === "number" && typeof deletions === "number"
      ? `+${additions} −${deletions}`
      : "";
  return [repoCell, author && `${author}`, diffCell]
    .filter(Boolean)
    .join(" · ");
}

export function relAgo(iso: string | null, nowIso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(now)) return "";
  const diffMs = now - t;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return future ? "now" : "now";
  if (abs < hour) {
    const m = Math.round(abs / minute);
    return future ? `in ${m}m` : `${m}m ago`;
  }
  if (abs < day) {
    const h = Math.round(abs / hour);
    return future ? `in ${h}h` : `${h}h ago`;
  }
  const d = Math.round(abs / day);
  return future ? `in ${d}d` : `${d}d ago`;
}

export function formatMeetingTime(startsAt: string, endsAt?: string): string {
  const s = new Date(startsAt);
  if (Number.isNaN(s.getTime())) return startsAt;
  const start = s.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endsAt) return start;
  const e = new Date(endsAt);
  if (Number.isNaN(e.getTime())) return start;
  const end = e.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${start} – ${end}`;
}

export function formatSnoozeReturn(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function prRefOf(s: Signal | StoredSignal): string | null {
  const num = s.payload?.pr_number ?? s.payload?.number;
  if (typeof num === "number") return `#${num}`;
  return null;
}

export function daysInProgress(s: Signal | StoredSignal): number | null {
  const iso = s.source_created_at;
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const days = Math.max(
    0,
    Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)),
  );
  return days;
}
