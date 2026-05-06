import { describe, expect, it, vi } from "vitest";
import {
  type AlertChannel,
  type AlertThreshold,
  type DispatcherDeps,
  dispatchAlert,
} from "#/lib/alert-dispatcher";
import {
  DEFAULT_FOCUS_BLOCK,
  DEFAULT_MATRIX,
  DEFAULT_QUIET_HOURS,
  type NotificationPrefs,
} from "#/lib/quiet-hours";
import type { StoredSignal } from "#/shared/signal";

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

type Overrides = {
  prefs?: Partial<NotificationPrefs>;
  alreadyRecorded?: boolean;
  focusActive?: boolean;
  focusEndsAt?: Date | null;
  slackDm?: (signal: StoredSignal) => Promise<void>;
  now?: Date;
};

function defaultPrefs(over?: Partial<NotificationPrefs>): NotificationPrefs {
  return {
    enabledChannels: ["slack_dm"],
    matrix: DEFAULT_MATRIX,
    quietHours: DEFAULT_QUIET_HOURS,
    focusBlock: DEFAULT_FOCUS_BLOCK,
    ...over,
  };
}

function makeDeps(overrides: Overrides = {}): {
  deps: DispatcherDeps;
  spies: {
    record: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
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
  const enqueue = vi.fn(
    async (
      _id: string,
      _t: AlertThreshold,
      _cs: AlertChannel[],
      _at: Date,
    ): Promise<void> => undefined,
  );
  const deps: DispatcherDeps = {
    loadPreferences: async () => defaultPrefs(overrides.prefs),
    loadFocusContext: async () => ({
      active: overrides.focusActive ?? false,
      endsAt: overrides.focusEndsAt ?? null,
    }),
    recordIdempotency: record,
    enqueueDelivery: enqueue,
    channels: { slack_dm: slackDm },
    now: () => overrides.now ?? new Date("2026-05-04T13:00:00Z"),
  };
  return { deps, spies: { record, enqueue, slackDm } };
}

describe("dispatchAlert", () => {
  it("fires the matrix-allowed channel for the 10-min meeting threshold", async () => {
    const { deps, spies } = makeDeps();
    const result = await dispatchAlert(meeting, "10min", deps);
    expect(result).toEqual({ fired: ["slack_dm"], errors: {} });
    expect(spies.slackDm).toHaveBeenCalledWith(meeting);
    expect(spies.record).toHaveBeenCalledWith("sig-meeting", "10min", [
      "slack_dm",
    ]);
  });

  it("fires for new requires-action signals", async () => {
    const { deps, spies } = makeDeps();
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ fired: ["slack_dm"], errors: {} });
    expect(spies.slackDm).toHaveBeenCalledTimes(1);
  });

  it("skips when threshold=new but signal does not require action", async () => {
    const { deps, spies } = makeDeps();
    const noAction: StoredSignal = { ...mention, requires_action: false };
    const result = await dispatchAlert(noAction, "new", deps);
    expect(result).toEqual({ skipped: "below_threshold" });
    expect(spies.record).not.toHaveBeenCalled();
  });

  it("skips when threshold=10min applied to a non-meeting", async () => {
    const { deps } = makeDeps();
    const result = await dispatchAlert(mention, "10min", deps);
    expect(result).toEqual({ skipped: "below_threshold" });
  });

  it("suppresses when matrix has no channels for the kind", async () => {
    const { deps, spies } = makeDeps({
      prefs: { matrix: { ...DEFAULT_MATRIX, mention: [] } },
    });
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ skipped: "no_matrix_channel" });
    // idempotency recorded so this Signal is not re-evaluated.
    expect(spies.record).toHaveBeenCalledWith("sig-mention", "new", []);
    expect(spies.slackDm).not.toHaveBeenCalled();
  });

  it("suppresses when no enabled channels intersect the matrix", async () => {
    const { deps, spies } = makeDeps({
      prefs: { enabledChannels: [] },
    });
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ skipped: "no_enabled_channel" });
    expect(spies.slackDm).not.toHaveBeenCalled();
  });

  it("does not refire when (signal_id, threshold) is already recorded", async () => {
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

  it("suppresses (focus_block) during a focus block when allow_mentions=false", async () => {
    const { deps, spies } = makeDeps({
      focusActive: true,
      focusEndsAt: new Date("2026-05-04T14:00:00Z"),
      prefs: {
        focusBlock: { ...DEFAULT_FOCUS_BLOCK, allow_mentions: false },
      },
    });
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ skipped: "focus_block" });
    expect(spies.slackDm).not.toHaveBeenCalled();
  });

  it("delivers a mention during a focus block when allow_mentions=true", async () => {
    const { deps, spies } = makeDeps({
      focusActive: true,
      focusEndsAt: new Date("2026-05-04T14:00:00Z"),
    });
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ fired: ["slack_dm"], errors: {} });
    expect(spies.slackDm).toHaveBeenCalled();
  });

  it("queues a Signal when in quiet hours, recording idempotency + deliver_at", async () => {
    // 23:30 UTC, weekday. Quiet hours 22:00–08:00 UTC, days Mon-Fri.
    const now = new Date("2026-05-04T23:30:00Z"); // Monday
    const { deps, spies } = makeDeps({
      now,
      prefs: {
        quietHours: {
          enabled: true,
          days: [1, 2, 3, 4, 5],
          start: "22:00",
          end: "08:00",
          utc_offset_minutes: 0,
          allow_through: [],
        },
      },
    });
    const result = await dispatchAlert(mention, "new", deps);
    if (!("queued" in result)) throw new Error("expected queue_until");
    expect(result.queued.channels).toEqual(["slack_dm"]);
    expect(new Date(result.queued.deliverAt).toISOString()).toBe(
      "2026-05-05T08:00:00.000Z",
    );
    expect(spies.enqueue).toHaveBeenCalledTimes(1);
    expect(spies.slackDm).not.toHaveBeenCalled();
  });

  it("delivers immediately when allow-through matches during quiet hours", async () => {
    const now = new Date("2026-05-04T23:30:00Z");
    const { deps, spies } = makeDeps({
      now,
      prefs: {
        quietHours: {
          enabled: true,
          days: [1, 2, 3, 4, 5],
          start: "22:00",
          end: "08:00",
          utc_offset_minutes: 0,
          allow_through: [{ kind: "mention" }],
        },
      },
    });
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ fired: ["slack_dm"], errors: {} });
    expect(spies.slackDm).toHaveBeenCalled();
    expect(spies.enqueue).not.toHaveBeenCalled();
  });

  it("skips already_dispatched when queueing into a window for a known signal", async () => {
    const now = new Date("2026-05-04T23:30:00Z");
    const { deps, spies } = makeDeps({
      now,
      alreadyRecorded: true,
      prefs: {
        quietHours: {
          enabled: true,
          days: [1, 2, 3, 4, 5],
          start: "22:00",
          end: "08:00",
          utc_offset_minutes: 0,
          allow_through: [],
        },
      },
    });
    const result = await dispatchAlert(mention, "new", deps);
    expect(result).toEqual({ skipped: "already_dispatched" });
    expect(spies.enqueue).not.toHaveBeenCalled();
  });
});
