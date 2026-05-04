import { describe, expect, it, vi } from "vitest";
import {
  type AlertChannel,
  type AlertThreshold,
  type DispatcherDeps,
  dispatchAlert,
} from "#/lib/alert-dispatcher";
import type { StoredSignal } from "#/lib/signal";

const meeting: StoredSignal = {
  id: "sig-meeting",
  provider: "google",
  kind: "meeting",
  source_id: "evt-1",
  title: "Standup",
  url: null,
  payload: { starts_at: "2026-05-04T10:00:00Z" },
  requires_action: false,
  source_created_at: "2026-05-04T10:00:00Z",
  unread_count: 0,
  created_at: "2026-05-04T09:00:00Z",
  updated_at: "2026-05-04T09:00:00Z",
  dismissed_at: null,
};

const mention: StoredSignal = {
  id: "sig-mention",
  provider: "slack",
  kind: "mention",
  source_id: "C1:1.1",
  title: "ping",
  url: null,
  payload: {},
  requires_action: true,
  source_created_at: "2026-05-04T09:00:00Z",
  unread_count: 0,
  created_at: "2026-05-04T09:00:00Z",
  updated_at: "2026-05-04T09:00:00Z",
  dismissed_at: null,
};

function makeDeps(overrides: {
  enabledChannels?: AlertChannel[];
  alreadyRecorded?: boolean;
  slackDm?: (signal: StoredSignal) => Promise<void>;
}): {
  deps: DispatcherDeps;
  spies: {
    record: ReturnType<typeof vi.fn>;
    slackDm: ReturnType<typeof vi.fn>;
  };
} {
  const slackDm = vi.fn(
    overrides.slackDm ?? (async (_s: StoredSignal) => undefined),
  );
  const record = vi.fn(
    async (
      _id: string,
      _t: AlertThreshold,
      _cs: AlertChannel[],
    ): Promise<{ alreadyRecorded: boolean }> => ({
      alreadyRecorded: overrides.alreadyRecorded ?? false,
    }),
  );
  const deps: DispatcherDeps = {
    loadPreferences: async () => ({
      enabledChannels: overrides.enabledChannels ?? ["slack_dm"],
    }),
    recordIdempotency: record,
    channels: { slack_dm: slackDm },
  };
  return { deps, spies: { record, slackDm } };
}

describe("dispatchAlert", () => {
  it("fires the slack_dm channel for the 10-min meeting threshold", async () => {
    const { deps, spies } = makeDeps({});
    const result = await dispatchAlert(meeting, "10min", deps);
    expect(result).toEqual({ fired: ["slack_dm"], errors: {} });
    expect(spies.slackDm).toHaveBeenCalledWith(meeting);
    expect(spies.record).toHaveBeenCalledWith("sig-meeting", "10min", [
      "slack_dm",
    ]);
  });

  it("fires for new requires-action signals (Slack mentions/DMs)", async () => {
    const { deps, spies } = makeDeps({});
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ fired: ["slack_dm"], errors: {} });
    expect(spies.slackDm).toHaveBeenCalledTimes(1);
  });

  it("skips when the signal does not require action on threshold=new", async () => {
    const { deps, spies } = makeDeps({});
    const noAction: StoredSignal = { ...mention, requires_action: false };
    const result = await dispatchAlert(noAction, "new", deps);
    expect(result).toEqual({ skipped: "below_threshold" });
    expect(spies.record).not.toHaveBeenCalled();
    expect(spies.slackDm).not.toHaveBeenCalled();
  });

  it("skips when the threshold=10min is applied to a non-meeting signal", async () => {
    const { deps } = makeDeps({});
    const result = await dispatchAlert(mention, "10min", deps);
    expect(result).toEqual({ skipped: "below_threshold" });
  });

  it("skips when no channels are enabled", async () => {
    const { deps, spies } = makeDeps({ enabledChannels: [] });
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ skipped: "no_channels" });
    expect(spies.record).not.toHaveBeenCalled();
  });

  it("does not re-fire when the (signal_id, threshold) row already exists", async () => {
    const { deps, spies } = makeDeps({ alreadyRecorded: true });
    const result = await dispatchAlert(meeting, "10min", deps);
    expect(result).toEqual({ skipped: "already_dispatched" });
    expect(spies.slackDm).not.toHaveBeenCalled();
  });

  it("captures per-channel errors without throwing", async () => {
    const { deps } = makeDeps({
      slackDm: async () => {
        throw new Error("slack 500");
      },
    });
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ fired: [], errors: { slack_dm: "slack 500" } });
  });
});
