// Quiet hours + per-event matrix + auto focus-block decision module.
//
// Pure: (signal, threshold, prefs, now, focus) → DeliveryDecision. The
// dispatcher consults this before fan-out. No side effects, no I/O — the
// matrix gating, allow-through, focus-block suppression, and weekly
// schedule all live here so the rules are easy to test in isolation.

import type { AlertChannel, AlertThreshold } from "#/lib/alert-dispatcher";
import type { SignalKind, StoredSignal } from "#/lib/signal";

export type QuietHoursWindow = {
  enabled: boolean;
  /** Days of week the window applies (0=Sun..6=Sat), in the user's local tz. */
  days: number[];
  /** "HH:MM" 24h, in the user's local tz. */
  start: string;
  /** "HH:MM" 24h, in the user's local tz. If end <= start the window wraps midnight. */
  end: string;
  /** User's UTC offset in minutes (e.g. -240 for EDT, +60 for CET). */
  utc_offset_minutes: number;
  /** Things that bypass the window. Empty = nothing bypasses. */
  allow_through: AllowThroughRule[];
};

export type AllowThroughRule = {
  kind?: SignalKind;
  threshold?: AlertThreshold;
  /** Match against any string in payload.tags. */
  tag?: string;
};

export type NotificationMatrix = Partial<Record<SignalKind, AlertChannel[]>>;

export type FocusBlockSettings = {
  /** Auto-suppress alerts during a calendar focus block. */
  enabled: boolean;
  /** During focus, still let mention/dm Signals through. */
  allow_mentions: boolean;
  /** During focus, still let meetings starting within N minutes through. */
  allow_imminent_meeting_minutes: number;
};

export type NotificationPrefs = {
  enabledChannels: AlertChannel[];
  matrix: NotificationMatrix;
  quietHours: QuietHoursWindow;
  focusBlock: FocusBlockSettings;
};

export type FocusBlockContext = {
  active: boolean;
  /** When the active focus block ends. Null if not active. */
  endsAt: Date | null;
};

export type DeliveryDecision =
  | { action: "deliver"; channels: AlertChannel[] }
  | { action: "suppress"; reason: SuppressReason }
  | {
      action: "queue_until";
      deliverAt: Date;
      channels: AlertChannel[];
      reason: "quiet_hours";
    };

export type SuppressReason =
  | "no_matrix_channel"
  | "no_enabled_channel"
  | "focus_block";

export const DEFAULT_QUIET_HOURS: QuietHoursWindow = {
  enabled: false,
  days: [1, 2, 3, 4, 5],
  start: "22:00",
  end: "08:00",
  utc_offset_minutes: 0,
  allow_through: [{ kind: "mention" }, { kind: "dm" }],
};

export const DEFAULT_FOCUS_BLOCK: FocusBlockSettings = {
  enabled: true,
  allow_mentions: true,
  allow_imminent_meeting_minutes: 5,
};

/** Default per-kind matrix when nothing has been configured yet. */
export const DEFAULT_MATRIX: NotificationMatrix = {
  meeting: ["slack_dm"],
  mention: ["slack_dm"],
  dm: ["slack_dm"],
  thread_reply: ["slack_dm"],
  pr_review_requested: ["slack_dm"],
  pr_authored: [],
  pr_assigned: ["slack_dm"],
};

export function decideDelivery(
  signal: StoredSignal,
  threshold: AlertThreshold,
  prefs: NotificationPrefs,
  now: Date,
  focus: FocusBlockContext,
): DeliveryDecision {
  // 1. Per-event matrix gates which channels are eligible for this kind.
  // An inbox rule may override the matrix lookup via the `channels` effect;
  // when present (non-null), it replaces the matrix entry for this Signal.
  // The per-user `enabledChannels` filter still applies — a rule cannot
  // re-enable a channel the user disabled globally.
  const override = signal.alert_channels_override ?? null;
  const matrixForKind = override ?? prefs.matrix[signal.kind];
  if (!matrixForKind || matrixForKind.length === 0) {
    return { action: "suppress", reason: "no_matrix_channel" };
  }
  const channels = matrixForKind.filter((c) =>
    prefs.enabledChannels.includes(c),
  );
  if (channels.length === 0) {
    return { action: "suppress", reason: "no_enabled_channel" };
  }

  // 2. Focus block: silence everything except mentions/DMs (when
  // allow_mentions=true) and imminent meetings. Focus-block has its own
  // allow rules — quiet-hours allow_through does not bypass focus.
  if (focus.active && prefs.focusBlock.enabled) {
    const focusAllowed =
      (prefs.focusBlock.allow_mentions &&
        (signal.kind === "mention" || signal.kind === "dm")) ||
      isImminentMeeting(signal, now, prefs.focusBlock);
    if (!focusAllowed) {
      return { action: "suppress", reason: "focus_block" };
    }
  }

  const allowThroughHit =
    matchesAllowThrough(signal, threshold, prefs.quietHours.allow_through) ||
    isImminentMeeting(signal, now, prefs.focusBlock);

  // 3. Quiet hours: if currently inside the window and not allow-through,
  // queue until window end. Allow-through delivers immediately.
  if (prefs.quietHours.enabled && !allowThroughHit) {
    const window = currentQuietHoursWindow(now, prefs.quietHours);
    if (window) {
      return {
        action: "queue_until",
        deliverAt: window.endsAt,
        channels,
        reason: "quiet_hours",
      };
    }
  }

  return { action: "deliver", channels };
}

function matchesAllowThrough(
  signal: StoredSignal,
  threshold: AlertThreshold,
  rules: AllowThroughRule[],
): boolean {
  for (const rule of rules) {
    if (rule.kind && signal.kind !== rule.kind) continue;
    if (rule.threshold && threshold !== rule.threshold) continue;
    if (rule.tag) {
      const tags = (signal.payload?.tags ?? []) as unknown;
      if (!Array.isArray(tags) || !tags.includes(rule.tag)) continue;
    }
    return true;
  }
  return false;
}

function isImminentMeeting(
  signal: StoredSignal,
  now: Date,
  fb: FocusBlockSettings,
): boolean {
  if (signal.kind !== "meeting") return false;
  const startsAt = signal.payload?.starts_at;
  if (typeof startsAt !== "string") return false;
  const t = Date.parse(startsAt);
  if (Number.isNaN(t)) return false;
  const minutesUntil = (t - now.getTime()) / 60000;
  return minutesUntil > 0 && minutesUntil <= fb.allow_imminent_meeting_minutes;
}

/**
 * Return the current quiet-hours window if `now` falls inside it, otherwise
 * null. The returned `endsAt` is the absolute Date at which the window
 * closes (so a queued alert knows when to redeliver).
 *
 * Quiet hours are configured in the user's local time; `utc_offset_minutes`
 * shifts the comparison. Wrap-around windows (start > end, e.g. 22:00–08:00)
 * are split: today's quiet ends at end-of-window the next morning; midnight-
 * crossing checks both halves.
 */
export function currentQuietHoursWindow(
  now: Date,
  qh: QuietHoursWindow,
): { endsAt: Date } | null {
  if (!qh.enabled) return null;
  const startMin = parseHHMM(qh.start);
  const endMin = parseHHMM(qh.end);
  if (startMin == null || endMin == null) return null;

  const offsetMs = qh.utc_offset_minutes * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);
  const localDow = localNow.getUTCDay();
  const localMinOfDay = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();

  const wraps = endMin <= startMin;

  // Case A: window does not wrap. In window iff today is configured and
  // localMinOfDay in [start, end).
  if (!wraps) {
    if (!qh.days.includes(localDow)) return null;
    if (localMinOfDay < startMin || localMinOfDay >= endMin) return null;
    const endsAtLocal = withMinuteOfDay(localNow, endMin);
    return { endsAt: localToUtc(endsAtLocal, offsetMs) };
  }

  // Case B: wraps midnight. Two sub-windows touching `now`:
  //   late-evening half: [start, 24:00) on day D    if D in days
  //   early-morning half: [00:00, end) on day D+1   if (D in days)
  // Where "D" is the calendar day the window started on (in user's local tz).
  if (localMinOfDay >= startMin) {
    if (qh.days.includes(localDow)) {
      // We're in the evening half. End is end-of-window on the *next* local
      // day, regardless of whether that day is also a quiet-hours day.
      const tomorrow = addDays(localNow, 1);
      const endsAtLocal = withMinuteOfDay(tomorrow, endMin);
      return { endsAt: localToUtc(endsAtLocal, offsetMs) };
    }
  }
  if (localMinOfDay < endMin) {
    const yesterday = addDays(localNow, -1);
    const yesterdayDow = yesterday.getUTCDay();
    if (qh.days.includes(yesterdayDow)) {
      const endsAtLocal = withMinuteOfDay(localNow, endMin);
      return { endsAt: localToUtc(endsAtLocal, offsetMs) };
    }
  }
  return null;
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function withMinuteOfDay(d: Date, mod: number): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(Math.floor(mod / 60), mod % 60, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function localToUtc(localDate: Date, offsetMs: number): Date {
  return new Date(localDate.getTime() - offsetMs);
}
