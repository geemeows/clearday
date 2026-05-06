import { describe, expect, it } from "vitest";
import {
  currentQuietHoursWindow,
  DEFAULT_FOCUS_BLOCK,
  DEFAULT_MATRIX,
  DEFAULT_QUIET_HOURS,
  decideDelivery,
  type FocusBlockContext,
  type NotificationPrefs,
  type QuietHoursWindow,
} from "#/features/alerts/delivery-decision";
import type { StoredSignal } from "#/shared/signal";

const baseMention: StoredSignal = {
  id: "m1",
  provider: "slack",
  kind: "mention",
  source_id: "C:1",
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

const baseMeeting: StoredSignal = {
  ...baseMention,
  id: "g1",
  provider: "google",
  kind: "meeting",
  source_id: "evt-1",
  title: "Standup",
  payload: { starts_at: "2026-05-04T10:00:00Z" },
  requires_action: false,
};

function prefs(over?: Partial<NotificationPrefs>): NotificationPrefs {
  return {
    enabledChannels: ["slack_dm"],
    matrix: DEFAULT_MATRIX,
    quietHours: DEFAULT_QUIET_HOURS,
    focusBlock: DEFAULT_FOCUS_BLOCK,
    ...over,
  };
}

const inactive: FocusBlockContext = { active: false, endsAt: null };

describe("decideDelivery — matrix", () => {
  it("delivers when the matrix permits a channel that is also enabled", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs(),
      new Date("2026-05-04T14:00:00Z"),
      inactive,
    );
    expect(result).toEqual({ action: "deliver", channels: ["slack_dm"] });
  });

  it("suppresses (no_matrix_channel) when the matrix has no entry for the kind", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({ matrix: { ...DEFAULT_MATRIX, mention: [] } }),
      new Date("2026-05-04T14:00:00Z"),
      inactive,
    );
    expect(result).toEqual({ action: "suppress", reason: "no_matrix_channel" });
  });

  it("suppresses (no_enabled_channel) when matrix-eligible channels aren't enabled", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({ enabledChannels: ["email"] }),
      new Date("2026-05-04T14:00:00Z"),
      inactive,
    );
    expect(result).toEqual({
      action: "suppress",
      reason: "no_enabled_channel",
    });
  });

  it("alert_channels_override replaces the matrix lookup for the signal", () => {
    const result = decideDelivery(
      { ...baseMention, alert_channels_override: ["email"] },
      "new",
      prefs({ enabledChannels: ["slack_dm", "email"] }),
      new Date("2026-05-04T14:00:00Z"),
      inactive,
    );
    expect(result).toEqual({ action: "deliver", channels: ["email"] });
  });

  it("alert_channels_override still respects enabledChannels", () => {
    const result = decideDelivery(
      { ...baseMention, alert_channels_override: ["email"] },
      "new",
      prefs({ enabledChannels: ["slack_dm"] }),
      new Date("2026-05-04T14:00:00Z"),
      inactive,
    );
    expect(result).toEqual({
      action: "suppress",
      reason: "no_enabled_channel",
    });
  });

  it("alert_channels_override empty array suppresses (no_matrix_channel)", () => {
    const result = decideDelivery(
      { ...baseMention, alert_channels_override: [] },
      "new",
      prefs(),
      new Date("2026-05-04T14:00:00Z"),
      inactive,
    );
    expect(result).toEqual({ action: "suppress", reason: "no_matrix_channel" });
  });
});

describe("decideDelivery — focus block", () => {
  const focusActive: FocusBlockContext = {
    active: true,
    endsAt: new Date("2026-05-04T15:00:00Z"),
  };

  it("suppresses (focus_block) for non-mentions when allow_mentions=true", () => {
    const result = decideDelivery(
      { ...baseMention, kind: "thread_reply" },
      "new",
      prefs(),
      new Date("2026-05-04T14:00:00Z"),
      focusActive,
    );
    expect(result).toEqual({ action: "suppress", reason: "focus_block" });
  });

  it("lets mentions through when allow_mentions=true (default)", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs(),
      new Date("2026-05-04T14:00:00Z"),
      focusActive,
    );
    expect(result).toEqual({ action: "deliver", channels: ["slack_dm"] });
  });

  it("suppresses mentions when allow_mentions=false", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({
        focusBlock: { ...DEFAULT_FOCUS_BLOCK, allow_mentions: false },
      }),
      new Date("2026-05-04T14:00:00Z"),
      focusActive,
    );
    expect(result).toEqual({ action: "suppress", reason: "focus_block" });
  });

  it("lets imminent meetings (<5 min) through", () => {
    const meeting = {
      ...baseMeeting,
      payload: { starts_at: "2026-05-04T14:03:00Z" },
    };
    const result = decideDelivery(
      meeting,
      "10min",
      prefs(),
      new Date("2026-05-04T14:00:00Z"),
      focusActive,
    );
    expect(result).toEqual({ action: "deliver", channels: ["slack_dm"] });
  });

  it("suppresses meetings starting >5 min away", () => {
    const meeting = {
      ...baseMeeting,
      payload: { starts_at: "2026-05-04T14:08:00Z" },
    };
    const result = decideDelivery(
      meeting,
      "10min",
      prefs(),
      new Date("2026-05-04T14:00:00Z"),
      focusActive,
    );
    expect(result).toEqual({ action: "suppress", reason: "focus_block" });
  });

  it("respects focusBlock.enabled=false (no auto suppression)", () => {
    const result = decideDelivery(
      { ...baseMention, kind: "thread_reply" },
      "new",
      prefs({
        focusBlock: { ...DEFAULT_FOCUS_BLOCK, enabled: false },
      }),
      new Date("2026-05-04T14:00:00Z"),
      focusActive,
    );
    expect(result).toEqual({ action: "deliver", channels: ["slack_dm"] });
  });
});

describe("decideDelivery — quiet hours", () => {
  const window22to8: QuietHoursWindow = {
    enabled: true,
    days: [1, 2, 3, 4, 5], // Mon-Fri
    start: "22:00",
    end: "08:00",
    utc_offset_minutes: 0,
    allow_through: [],
  };

  it("delivers immediately when outside the window", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({ quietHours: window22to8 }),
      new Date("2026-05-04T14:00:00Z"), // Mon 14:00 UTC
      inactive,
    );
    expect(result).toEqual({ action: "deliver", channels: ["slack_dm"] });
  });

  it("queues until window end when inside the late-evening half", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({ quietHours: window22to8 }),
      new Date("2026-05-04T23:30:00Z"), // Mon 23:30
      inactive,
    );
    if (result.action !== "queue_until") throw new Error("expected queue");
    expect(result.deliverAt.toISOString()).toBe("2026-05-05T08:00:00.000Z");
    expect(result.channels).toEqual(["slack_dm"]);
    expect(result.reason).toBe("quiet_hours");
  });

  it("queues until window end when inside the early-morning half", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({ quietHours: window22to8 }),
      new Date("2026-05-05T03:00:00Z"), // Tue 03:00 — yesterday (Mon) is a quiet day
      inactive,
    );
    if (result.action !== "queue_until") throw new Error("expected queue");
    expect(result.deliverAt.toISOString()).toBe("2026-05-05T08:00:00.000Z");
  });

  it("delivers on the boundary at exactly end time", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({ quietHours: window22to8 }),
      new Date("2026-05-05T08:00:00Z"),
      inactive,
    );
    expect(result.action).toBe("deliver");
  });

  it("does not queue on a weekend (Sat→Sun) when window is Mon-Fri", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({ quietHours: window22to8 }),
      new Date("2026-05-09T23:30:00Z"), // Saturday 23:30
      inactive,
    );
    expect(result.action).toBe("deliver");
  });

  it("allow_through={kind} bypasses the window", () => {
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({
        quietHours: { ...window22to8, allow_through: [{ kind: "mention" }] },
      }),
      new Date("2026-05-04T23:30:00Z"),
      inactive,
    );
    expect(result.action).toBe("deliver");
  });

  it("allow_through={threshold:'10min'} bypasses for the 10-min meeting alert", () => {
    const meeting = {
      ...baseMeeting,
      payload: { starts_at: "2026-05-04T23:39:00Z" },
    };
    const result = decideDelivery(
      meeting,
      "10min",
      prefs({
        quietHours: {
          ...window22to8,
          allow_through: [{ threshold: "10min" }],
        },
      }),
      new Date("2026-05-04T23:30:00Z"),
      inactive,
    );
    expect(result.action).toBe("deliver");
  });

  it("allow_through={tag} matches when payload.tags contains the tag", () => {
    const tagged = {
      ...baseMention,
      payload: { tags: ["ci_red", "prod"] },
    };
    const result = decideDelivery(
      tagged,
      "new",
      prefs({
        quietHours: { ...window22to8, allow_through: [{ tag: "prod" }] },
      }),
      new Date("2026-05-04T23:30:00Z"),
      inactive,
    );
    expect(result.action).toBe("deliver");
  });

  it("respects utc_offset_minutes (UTC-5 means 22:00 local = 03:00 UTC)", () => {
    // User in UTC-5. Local 22:00 = 03:00 UTC. Window 22:00-08:00 local.
    // It's Tue 03:30 UTC — that's Mon 22:30 local for the user; quiet.
    const offsetWindow: QuietHoursWindow = {
      ...window22to8,
      utc_offset_minutes: -300,
    };
    const result = decideDelivery(
      baseMention,
      "new",
      prefs({ quietHours: offsetWindow }),
      new Date("2026-05-05T03:30:00Z"),
      inactive,
    );
    if (result.action !== "queue_until") throw new Error("expected queue");
    // window ends at 08:00 local Tue = 13:00 UTC Tue
    expect(result.deliverAt.toISOString()).toBe("2026-05-05T13:00:00.000Z");
  });
});

describe("currentQuietHoursWindow — non-wrapping window", () => {
  it("returns endsAt when inside a same-day window", () => {
    const qh: QuietHoursWindow = {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      start: "12:00",
      end: "13:00",
      utc_offset_minutes: 0,
      allow_through: [],
    };
    const w = currentQuietHoursWindow(new Date("2026-05-04T12:30:00Z"), qh);
    expect(w?.endsAt.toISOString()).toBe("2026-05-04T13:00:00.000Z");
  });

  it("returns null when before window start", () => {
    const qh: QuietHoursWindow = {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      start: "12:00",
      end: "13:00",
      utc_offset_minutes: 0,
      allow_through: [],
    };
    const w = currentQuietHoursWindow(new Date("2026-05-04T11:00:00Z"), qh);
    expect(w).toBeNull();
  });

  it("returns null when enabled=false", () => {
    const qh: QuietHoursWindow = {
      ...DEFAULT_QUIET_HOURS,
      enabled: false,
    };
    expect(
      currentQuietHoursWindow(new Date("2026-05-04T23:30:00Z"), qh),
    ).toBeNull();
  });
});
