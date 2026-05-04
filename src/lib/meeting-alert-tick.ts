// Cron-driven 10-minute pre-meeting alert. Runs every Worker scheduled tick
// alongside the provider polls. Loads upcoming meeting Signals, picks any
// that are starting within the lookahead window, and dispatches the
// "10min" threshold through alert-dispatcher. Idempotency (in
// signal_alerts) prevents duplicate fires across overlapping ticks.

import {
  type AlertThreshold,
  type DispatcherDeps,
  type DispatchResult,
  dispatchAlert,
} from "#/lib/alert-dispatcher";
import type { StoredSignal } from "#/lib/signal";

const LOOKAHEAD_MS = 11 * 60 * 1000;

export type MeetingAlertTickDeps = {
  loadUpcomingMeetings: () => Promise<StoredSignal[]>;
  dispatcher: DispatcherDeps;
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
    if (delta > 0 && delta <= LOOKAHEAD_MS) due.push(m);
  }

  const threshold: AlertThreshold = "10min";
  const dispatched: MeetingAlertTickReport["dispatched"] = [];
  for (const m of due) {
    const result = await dispatchAlert(m, threshold, deps.dispatcher);
    dispatched.push({ signalId: m.id, result });
  }
  return { considered: meetings.length, dispatched };
}
