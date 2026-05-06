import { describe, expect, it, vi } from "vitest";
import type { DispatcherDeps } from "#/features/alerts/dispatcher";
import { runAlertQueueDrain } from "#/features/alerts/server/queue-drain";
import type { StoredSignal } from "#/shared/signal";

function signal(id: string, over?: Partial<StoredSignal>): StoredSignal {
  return {
    id,
    provider: "slack",
    kind: "mention",
    source_id: id,
    title: `mention ${id}`,
    url: null,
    payload: {},
    requires_action: true,
    source_created_at: null,
    unread_count: 0,
    created_at: "2026-05-04T22:00:00Z",
    updated_at: "2026-05-04T22:00:00Z",
    dismissed_at: null,
    priority: null,
    snoozed_until: null,
    alert_channels_override: null,
    tags: null,
    ...over,
  };
}

function makeDispatcher(): {
  deps: DispatcherDeps;
  slack: ReturnType<typeof vi.fn>;
} {
  const slack = vi.fn(async () => undefined);
  const deps: DispatcherDeps = {
    loadPreferences: async () => {
      throw new Error("not used by drain");
    },
    loadFocusContext: async () => ({ active: false, endsAt: null }),
    recordIdempotency: async () => ({ alreadyRecorded: false }),
    enqueueDelivery: async () => undefined,
    channels: { slack_dm: slack },
  };
  return { deps, slack };
}

describe("runAlertQueueDrain", () => {
  it("fires the queued channels for each due signal and removes the row", async () => {
    const { deps, slack } = makeDispatcher();
    const remove = vi.fn(async () => undefined);
    const sig = signal("s1");
    const report = await runAlertQueueDrain({
      loadDue: async () => [
        {
          queued: {
            signal_id: "s1",
            threshold: "new",
            channels: ["slack_dm"],
            deliver_at: "2026-05-05T08:00:00Z",
          },
          signal: sig,
        },
      ],
      removeQueued: remove,
      dispatcher: deps,
      now: () => new Date("2026-05-05T08:00:01Z"),
    });
    expect(report.delivered).toEqual([
      { signalId: "s1", fired: ["slack_dm"], errors: {} },
    ]);
    expect(slack).toHaveBeenCalledWith(sig);
    expect(remove).toHaveBeenCalledWith("s1", "new");
  });

  it("drops queued rows whose Signal is missing or dismissed", async () => {
    const { deps, slack } = makeDispatcher();
    const remove = vi.fn(async () => undefined);
    const dismissed = signal("s2", { dismissed_at: "2026-05-05T07:30:00Z" });
    const report = await runAlertQueueDrain({
      loadDue: async () => [
        {
          queued: {
            signal_id: "s2",
            threshold: "new",
            channels: ["slack_dm"],
            deliver_at: "2026-05-05T08:00:00Z",
          },
          signal: dismissed,
        },
        {
          queued: {
            signal_id: "missing",
            threshold: "new",
            channels: ["slack_dm"],
            deliver_at: "2026-05-05T08:00:00Z",
          },
          signal: null,
        },
      ],
      removeQueued: remove,
      dispatcher: deps,
      now: () => new Date("2026-05-05T08:00:01Z"),
    });
    expect(slack).not.toHaveBeenCalled();
    expect(report.dropped.sort()).toEqual(["missing", "s2"]);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("captures channel errors per row but still removes the queued row", async () => {
    const slack = vi.fn(async () => {
      throw new Error("slack 500");
    });
    const deps: DispatcherDeps = {
      loadPreferences: async () => {
        throw new Error("nope");
      },
      loadFocusContext: async () => ({ active: false, endsAt: null }),
      recordIdempotency: async () => ({ alreadyRecorded: false }),
      enqueueDelivery: async () => undefined,
      channels: { slack_dm: slack },
    };
    const remove = vi.fn(async () => undefined);
    const sig = signal("s3");
    const report = await runAlertQueueDrain({
      loadDue: async () => [
        {
          queued: {
            signal_id: "s3",
            threshold: "new",
            channels: ["slack_dm"],
            deliver_at: "2026-05-05T08:00:00Z",
          },
          signal: sig,
        },
      ],
      removeQueued: remove,
      dispatcher: deps,
      now: () => new Date("2026-05-05T08:00:01Z"),
    });
    expect(report.delivered[0]).toEqual({
      signalId: "s3",
      fired: [],
      errors: { slack_dm: "slack 500" },
    });
    expect(remove).toHaveBeenCalledWith("s3", "new");
  });
});
