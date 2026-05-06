import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RETENTION_DAYS,
  exportData,
  getRetention,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  PURGE_CONFIRMATION,
  purgeData,
  putRetention,
  type RetentionStore,
  type RetentionView,
} from "#/features/settings/data-privacy/api";

describe("exportData", () => {
  it("returns a JSON-serializable payload with each table's rows", async () => {
    const out = await exportData({
      loadSignals: async () => [{ id: "s1" }],
      loadRollups: async () => [{ id: "r1" }],
      loadInboxRules: async () => [{ id: "ir1" }],
      loadSlackAllowlist: async () => [{ channel_id: "C1" }],
      loadUserPreferences: async () => ({ alert_channels: ["slack_dm"] }),
      loadAiSettings: async () => ({ provider: "openai", model: "gpt-4o" }),
      now: () => new Date("2026-05-04T10:00:00Z"),
    });
    expect(out).toEqual({
      exported_at: "2026-05-04T10:00:00.000Z",
      signals: [{ id: "s1" }],
      signal_rollups: [{ id: "r1" }],
      inbox_rules: [{ id: "ir1" }],
      slack_channel_allowlist: [{ channel_id: "C1" }],
      user_preferences: { alert_channels: ["slack_dm"] },
      ai_settings: { provider: "openai", model: "gpt-4o" },
    });
    // Round-trips through JSON.stringify without throwing.
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it("strips api_key from ai_settings", async () => {
    const out = await exportData({
      loadSignals: async () => [],
      loadRollups: async () => [],
      loadInboxRules: async () => [],
      loadSlackAllowlist: async () => [],
      loadUserPreferences: async () => null,
      loadAiSettings: async () => ({
        provider: "openai",
        model: "gpt-4o",
        api_key: "ciphertext-do-not-export",
      }),
    });
    expect(out.ai_settings).toEqual({ provider: "openai", model: "gpt-4o" });
    expect(out.ai_settings).not.toHaveProperty("api_key");
  });

  it("handles null ai_settings and user_preferences", async () => {
    const out = await exportData({
      loadSignals: async () => [],
      loadRollups: async () => [],
      loadInboxRules: async () => [],
      loadSlackAllowlist: async () => [],
      loadUserPreferences: async () => null,
      loadAiSettings: async () => null,
    });
    expect(out.user_preferences).toBeNull();
    expect(out.ai_settings).toBeNull();
  });
});

describe("purgeData", () => {
  it("requires the literal DELETE confirmation string", async () => {
    const purgeSignals = vi.fn(async () => 5);
    const purgeRollups = vi.fn(async () => 2);
    const out = await purgeData(
      { confirmation: "delete" },
      { purgeSignals, purgeRollups },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/DELETE/);
    expect(purgeSignals).not.toHaveBeenCalled();
    expect(purgeRollups).not.toHaveBeenCalled();
  });

  it("rejects a missing confirmation", async () => {
    const purgeSignals = vi.fn(async () => 0);
    const purgeRollups = vi.fn(async () => 0);
    const out = await purgeData({}, { purgeSignals, purgeRollups });
    expect(out.ok).toBe(false);
    expect(purgeSignals).not.toHaveBeenCalled();
  });

  it("calls both purgers and reports counts when confirmed", async () => {
    const purgeSignals = vi.fn(async () => 17);
    const purgeRollups = vi.fn(async () => 4);
    const out = await purgeData(
      { confirmation: PURGE_CONFIRMATION },
      { purgeSignals, purgeRollups },
    );
    expect(out).toEqual({
      ok: true,
      deleted: { signals: 17, signal_rollups: 4 },
    });
    expect(purgeSignals).toHaveBeenCalledTimes(1);
    expect(purgeRollups).toHaveBeenCalledTimes(1);
  });
});

function makeRetentionStore(initial: RetentionView): RetentionStore {
  let row = { ...initial };
  return {
    load: vi.fn(async () => ({ ...row })),
    save: vi.fn(async (patch) => {
      row = { ...row, ...patch };
      return { ...row };
    }),
  };
}

describe("getRetention / putRetention", () => {
  it("returns the stored retention", async () => {
    const store = makeRetentionStore({ retention_days: 90 });
    expect(await getRetention(store)).toEqual({ retention_days: 90 });
  });

  it("persists a valid override", async () => {
    const store = makeRetentionStore({ retention_days: 90 });
    const out = await putRetention({ retention_days: 30 }, store);
    expect(out).toEqual({ ok: true, retention: { retention_days: 30 } });
    expect(store.save).toHaveBeenCalledWith({ retention_days: 30 });
  });

  it("rejects non-integer values", async () => {
    const store = makeRetentionStore({ retention_days: 90 });
    const out = await putRetention({ retention_days: 30.5 }, store);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/integer/);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects values outside the [min, max] window", async () => {
    const store = makeRetentionStore({ retention_days: 90 });
    const tooSmall = await putRetention(
      { retention_days: MIN_RETENTION_DAYS - 1 },
      store,
    );
    expect(tooSmall.ok).toBe(false);
    const tooLarge = await putRetention(
      { retention_days: MAX_RETENTION_DAYS + 1 },
      store,
    );
    expect(tooLarge.ok).toBe(false);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects non-numeric input", async () => {
    const store = makeRetentionStore({ retention_days: 90 });
    const out = await putRetention(
      { retention_days: "30" as unknown as number },
      store,
    );
    expect(out.ok).toBe(false);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("DEFAULT_RETENTION_DAYS matches PRD baseline", () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(90);
  });
});
