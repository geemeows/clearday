// Cron-driven pre-meeting alert. Runs every Worker scheduled tick alongside
// the provider polls. Loads upcoming meeting Signals, picks any that are
// starting within the user's configured pre-meeting threshold, and dispatches
// the "10min" threshold through alert-dispatcher. Idempotency (in
// signal_alerts) prevents duplicate fires across overlapping ticks.
//
// Lookahead = (notification_threshold_min + 1) * 60_000. The +1 minute padding
// matches the pre-prefs 11-min window so a meeting picked at threshold T still
// fires once delta drops below T, accounting for cron jitter between ticks.

import {
  type AlertThreshold,
  type DispatcherDeps,
  type DispatchResult,
  dispatchAlert,
} from "#/features/alerts/dispatcher";
import type { StoredSignal } from "#/shared/signal";

const DEFAULT_THRESHOLD_MIN = 10;

export type MeetingAlertTickDeps = {
  loadUpcomingMeetings: () => Promise<StoredSignal[]>;
  dispatcher: DispatcherDeps;
  loadMeetingThresholdMin?: () => Promise<number>;
  now?: () => Date;
};

export type MeetingAlertTickReport = {
  considered: number;
  dispatched: Array<{ signalId: string; result: DispatchResult }>;
};

export async function runMeetingAlertTick(
  deps: MeetingAlertTickDeps,
): Promise<MeetingAlertTickReport> {
  const meetings = await deps.loadUpcomingMeetings();
  const thresholdMin = deps.loadMeetingThresholdMin
    ? await deps.loadMeetingThresholdMin()
    : DEFAULT_THRESHOLD_MIN;
  const lookaheadMs = (thresholdMin + 1) * 60 * 1000;
  const now = (deps.now ?? (() => new Date()))();
  const t = now.getTime();
  const due: StoredSignal[] = [];
  for (const m of meetings) {
    if (m.kind !== "meeting") continue;
    if (m.dismissed_at) continue;
    const startsAtRaw = m.payload?.starts_at;
    if (typeof startsAtRaw !== "string") continue;
    const starts = Date.parse(startsAtRaw);
    if (Number.isNaN(starts)) continue;
    const delta = starts - t;
    if (delta > 0 && delta <= lookaheadMs) due.push(m);
  }

  const threshold: AlertThreshold = "10min";
  const dispatched: MeetingAlertTickReport["dispatched"] = [];
  for (const m of due) {
    const result = await dispatchAlert(m, threshold, deps.dispatcher);
    dispatched.push({ signalId: m.id, result });
  }
  return { considered: meetings.length, dispatched };
}
