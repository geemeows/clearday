import { describe, expect, it, vi } from "vitest";
import type { DispatcherDeps } from "#/lib/alert-dispatcher";
import { runMeetingAlertTick } from "#/lib/meeting-alert-tick";
import type { StoredSignal } from "#/lib/signal";

function meeting(id: string, startsAt: string): StoredSignal {
  return {
    id,
    provider: "google",
    kind: "meeting",
    source_id: id,
    title: `Meeting ${id}`,
    url: null,
    payload: { starts_at: startsAt },
    requires_action: false,
    source_created_at: startsAt,
    unread_count: 0,
    created_at: startsAt,
    updated_at: startsAt,
    dismissed_at: null,
  };
}

function makeDispatcher(): {
  deps: DispatcherDeps;
  spies: {
    record: ReturnType<typeof vi.fn>;
    slack: ReturnType<typeof vi.fn>;
  };
} {
  const slack = vi.fn(async () => undefined);
  const record = vi.fn(async () => ({ alreadyRecorded: false }));
  return {
    deps: {
      loadPreferences: async () => ({ enabledChannels: ["slack_dm"] }),
      recordIdempotency: record,
      channels: { slack_dm: slack },
    },
    spies: { record, slack },
  };
}

describe("runMeetingAlertTick", () => {
  it("dispatches meetings starting within the 11-min lookahead", async () => {
    const now = new Date("2026-05-04T10:00:00Z");
    const meetings = [
      meeting("m-soon", "2026-05-04T10:09:30Z"),
      meeting("m-far", "2026-05-04T11:00:00Z"),
      meeting("m-past", "2026-05-04T09:55:00Z"),
    ];
    const { deps, spies } = makeDispatcher();
    const report = await runMeetingAlertTick({
      loadUpcomingMeetings: async () => meetings,
      dispatcher: deps,
      now: () => now,
    });
    expect(report.considered).toBe(3);
    expect(report.dispatched).toHaveLength(1);
    expect(report.dispatched[0].signalId).toBe("m-soon");
    expect(spies.slack).toHaveBeenCalledTimes(1);
  });

  it("skips dismissed meetings", async () => {
    const now = new Date("2026-05-04T10:00:00Z");
    const m = meeting("m-soon", "2026-05-04T10:08:00Z");
    m.dismissed_at = "2026-05-04T09:50:00Z";
    const { deps, spies } = makeDispatcher();
    const report = await runMeetingAlertTick({
      loadUpcomingMeetings: async () => [m],
      dispatcher: deps,
      now: () => now,
    });
    expect(report.dispatched).toHaveLength(0);
    expect(spies.slack).not.toHaveBeenCalled();
  });

  it("does not refire when idempotency already recorded", async () => {
    const now = new Date("2026-05-04T10:00:00Z");
    const m = meeting("m-soon", "2026-05-04T10:09:30Z");
    const slack = vi.fn(async () => undefined);
    const record = vi.fn(async () => ({ alreadyRecorded: true }));
    const dispatcher: DispatcherDeps = {
      loadPreferences: async () => ({ enabledChannels: ["slack_dm"] }),
      recordIdempotency: record,
      channels: { slack_dm: slack },
    };
    const report = await runMeetingAlertTick({
      loadUpcomingMeetings: async () => [m],
      dispatcher,
      now: () => now,
    });
    expect(report.dispatched[0].result).toEqual({
      skipped: "already_dispatched",
    });
    expect(slack).not.toHaveBeenCalled();
  });
});
