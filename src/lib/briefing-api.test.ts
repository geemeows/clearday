import { describe, expect, it, vi } from "vitest";
import type { AiSettingsRow } from "#/lib/ai-settings-api";
import { handleBriefingGenerate, runBriefingTick } from "#/lib/briefing-api";
import { encryptSecret } from "#/lib/llm-crypto";
import type { BriefingCacheEntry } from "#/lib/morning-briefing";

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
  it("rejects invalid date input", async () => {
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

  it("respects a custom hourUtc", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch();
    const out = await runBriefingTick({
      aiStore: memAiStore(row),
      cacheStore: memCacheStore(),
      loadSignals: async () => [],
      usageStore: fakeUsageStore(),
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      hourUtc: 12,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "not_due" });
    expect(fetchMock).not.toHaveBeenCalled();
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
