import { describe, expect, it, vi } from "vitest";
import type { AiSettingsRow } from "#/features/ai/api/settings";
import {
  handleBriefingGenerate,
  localDateForTimezone,
  localHourForTimezone,
  runBriefingTick,
} from "#/features/briefing/api";
import type { BriefingCacheEntry } from "#/features/briefing/morning-briefing";
import { encryptSecret } from "#/shared/crypto";

const KEY_SECRET = "deployment-secret-32-bytes-long!!";

function memAiStore(row: AiSettingsRow | null) {
  return {
    load: async () => row,
    save: async (patch: Partial<AiSettingsRow>) => ({
      ...(row ?? ({} as AiSettingsRow)),
      ...patch,
    }),
  };
}

function memCacheStore(initial: BriefingCacheEntry | null = null) {
  let row = initial;
  return {
    load: async () => row,
    save: async (entry: BriefingCacheEntry) => {
      row = entry;
    },
    get current() {
      return row;
    },
  };
}

function fakeUsageStore() {
  return {
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => ({
        gte: () => ({
          lt: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };
}

function okFetch(content = "Briefing.") {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          model: "gpt-4o-mini",
          usage: { prompt_tokens: 100, completion_tokens: 30 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  ) as unknown as typeof fetch;
}

async function configuredRow(): Promise<AiSettingsRow> {
  const apiKey = await encryptSecret("sk-real", KEY_SECRET);
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    api_key: apiKey,
    base_url: null,
    last_validated_at: null,
    monthly_budget_usd: 25,
    fallback_model: null,
    privacy_mode: false,
    redact_patterns: null,
    ai_disabled: false,
  };
}

describe("handleBriefingGenerate", () => {
  it("rejects malformed date input", async () => {
    const out = await handleBriefingGenerate(
      { date: "not-a-date" },
      {
        aiStore: memAiStore(null),
        cacheStore: memCacheStore(),
        loadSignals: async () => [],
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });

  it("derives the local date from the user's timezone when body.date is omitted", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch("Briefing.");
    const cache = memCacheStore();
    const out = await handleBriefingGenerate(
      {},
      {
        aiStore: memAiStore(row),
        cacheStore: cache,
        loadSignals: async () => [],
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: fetchMock,
        // 2026-05-05 02:00 UTC == 2026-05-04 19:00 in LA — the local
        // date the server should pick is 2026-05-04, not the UTC date.
        now: () => new Date("2026-05-05T02:00:00.000Z"),
        loadTimezone: async () => "America/Los_Angeles",
      },
    );
    expect(out).toMatchObject({ ok: true, cached: false });
    expect(cache.current?.date).toBe("2026-05-04");
  });

  it("falls back to UTC date when no timezone is configured", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch("Briefing.");
    const cache = memCacheStore();
    await handleBriefingGenerate(
      {},
      {
        aiStore: memAiStore(row),
        cacheStore: cache,
        loadSignals: async () => [],
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: fetchMock,
        now: () => new Date("2026-05-05T02:00:00.000Z"),
        loadTimezone: async () => null,
      },
    );
    expect(cache.current?.date).toBe("2026-05-05");
  });

  it("returns no_provider when AI settings are not configured", async () => {
    const out = await handleBriefingGenerate(
      { date: "2026-05-04" },
      {
        aiStore: memAiStore(null),
        cacheStore: memCacheStore(),
        loadSignals: async () => [],
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(out).toEqual({ ok: false, reason: "no_provider" });
  });

  it("decrypts the stored API key, calls the LLM, and caches the briefing", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch("Standup at 10:30, then PR review.");
    const cache = memCacheStore();
    const out = await handleBriefingGenerate(
      { date: "2026-05-04" },
      {
        aiStore: memAiStore(row),
        cacheStore: cache,
        loadSignals: async () => [],
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: fetchMock,
        now: () => new Date("2026-05-04T08:00:00.000Z"),
      },
    );
    expect(out).toMatchObject({
      ok: true,
      cached: false,
      provider: "openai",
      model: "gpt-4o-mini",
      text: "Standup at 10:30, then PR review.",
    });
    expect(cache.current?.date).toBe("2026-05-04");
    // Real API key was decrypted and forwarded.
    const [, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    expect(
      ((init as RequestInit).headers as Record<string, string>).authorization,
    ).toBe("Bearer sk-real");
  });

  it("serves the cached briefing on a second call for the same day", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch();
    const cache = memCacheStore();
    const deps = {
      aiStore: memAiStore(row),
      cacheStore: cache,
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    };
    await handleBriefingGenerate({ date: "2026-05-04" }, deps);
    const second = await handleBriefingGenerate({ date: "2026-05-04" }, deps);
    expect(second).toMatchObject({ ok: true, cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("runBriefingTick", () => {
  it("skips before the configured morning hour", async () => {
    const fetchMock = okFetch();
    const out = await runBriefingTick({
      aiStore: memAiStore(await configuredRow()),
      cacheStore: memCacheStore(),
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-05-04T03:00:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "not_due" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips with no_provider when AI settings are missing", async () => {
    const out = await runBriefingTick({
      aiStore: memAiStore(null),
      cacheStore: memCacheStore(),
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: okFetch(),
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "no_provider" });
  });

  it("generates today's briefing when due and not yet cached", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch("Standup at 10:30.");
    const cache = memCacheStore();
    const out = await runBriefingTick({
      aiStore: memAiStore(row),
      cacheStore: cache,
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(out).toEqual({
      kind: "generated",
      date: "2026-05-04",
      cached: false,
    });
    expect(cache.current?.date).toBe("2026-05-04");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a second tick the same day hits the cache", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch();
    const cache = memCacheStore();
    const deps = {
      aiStore: memAiStore(row),
      cacheStore: cache,
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    };
    await runBriefingTick(deps);
    const second = await runBriefingTick(deps);
    expect(second).toEqual({
      kind: "generated",
      date: "2026-05-04",
      cached: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respects a custom hour", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch();
    const out = await runBriefingTick({
      aiStore: memAiStore(row),
      cacheStore: memCacheStore(),
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      hour: 12,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "not_due" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gates fire-time on the user's local hour, not UTC", async () => {
    // 03:00 UTC = 12:00 in Tokyo. UTC-hour gate would skip this tick
    // (3 < 6); the local-hour gate must fire it (Tokyo 12 >= 6).
    const row = await configuredRow();
    const fetchMock = okFetch("Briefing.");
    const out = await runBriefingTick({
      aiStore: memAiStore(row),
      cacheStore: memCacheStore(),
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-05-04T03:00:00.000Z"),
      loadTimezone: async () => "Asia/Tokyo",
    });
    expect(out).toEqual({
      kind: "generated",
      date: "2026-05-04",
      cached: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips when the user's local clock has not yet reached morning", async () => {
    // 13:00 UTC = 06:00 in LA (PDT = UTC-7); with hour=8 the LA clock is
    // still pre-morning so the tick should skip, even though UTC is past 8.
    const row = await configuredRow();
    const fetchMock = okFetch();
    const out = await runBriefingTick({
      aiStore: memAiStore(row),
      cacheStore: memCacheStore(),
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      hour: 8,
      now: () => new Date("2026-05-04T13:00:00.000Z"),
      loadTimezone: async () => "America/Los_Angeles",
    });
    expect(out).toEqual({ kind: "skipped", reason: "not_due" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the user's timezone to compute the date in the cache key", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch("Briefing.");
    const cache = memCacheStore();
    const out = await runBriefingTick({
      aiStore: memAiStore(row),
      cacheStore: cache,
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      // 13:00 UTC = 22:00 in Tokyo on the same UTC day; date should be 2026-05-04.
      now: () => new Date("2026-05-04T13:00:00.000Z"),
      loadTimezone: async () => "Asia/Tokyo",
    });
    expect(out).toEqual({
      kind: "generated",
      date: "2026-05-04",
      cached: false,
    });
    expect(cache.current?.date).toBe("2026-05-04");
  });

  it("maps an ai_disabled row to skipped/disabled", async () => {
    const row = { ...(await configuredRow()), ai_disabled: true };
    const fetchMock = okFetch();
    const out = await runBriefingTick({
      aiStore: memAiStore(row),
      cacheStore: memCacheStore(),
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("localDateForTimezone", () => {
  const lateNight = new Date("2026-05-05T02:00:00.000Z");

  it("returns the UTC date when tz is null", () => {
    expect(localDateForTimezone(lateNight, null)).toBe("2026-05-05");
  });

  it("rolls back a day for west-of-UTC timezones at the right offset", () => {
    expect(localDateForTimezone(lateNight, "America/Los_Angeles")).toBe(
      "2026-05-04",
    );
  });

  it("rolls forward for east-of-UTC timezones past midnight", () => {
    // 14:00 UTC → 23:00 in Tokyo (same day), 00:00 next day in Auckland in winter.
    const t = new Date("2026-05-04T14:00:00.000Z");
    expect(localDateForTimezone(t, "Asia/Tokyo")).toBe("2026-05-04");
  });

  it("falls back to UTC when the timezone identifier is unknown", () => {
    expect(localDateForTimezone(lateNight, "Not/Real")).toBe("2026-05-05");
  });
});

describe("localHourForTimezone", () => {
  const noonUtc = new Date("2026-05-04T12:00:00.000Z");

  it("returns the UTC hour when tz is null", () => {
    expect(localHourForTimezone(noonUtc, null)).toBe(12);
  });

  it("rolls back for west-of-UTC timezones", () => {
    // 12:00 UTC = 05:00 in LA (PDT, UTC-7).
    expect(localHourForTimezone(noonUtc, "America/Los_Angeles")).toBe(5);
  });

  it("rolls forward for east-of-UTC timezones", () => {
    // 12:00 UTC = 21:00 in Tokyo.
    expect(localHourForTimezone(noonUtc, "Asia/Tokyo")).toBe(21);
  });

  it("falls back to UTC when the timezone identifier is unknown", () => {
    expect(localHourForTimezone(noonUtc, "Not/Real")).toBe(12);
  });
});
