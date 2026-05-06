import { describe, expect, it, vi } from "vitest";
import {
  type BriefingCacheEntry,
  buildBriefingPrompt,
  generateBriefing,
} from "#/lib/morning-briefing";
import type { StoredSignal } from "#/shared/signal";

const baseSettings = {
  provider: "openai" as const,
  apiKey: "sk-real",
  defaultModel: "gpt-4o-mini",
  baseUrl: undefined,
  fallbackModel: null,
  monthlyBudgetUsd: 25,
  privacyMode: false,
  redactPatterns: [],
  aiDisabled: false,
};

function meetingSignal(title: string, startsAt: string): StoredSignal {
  return {
    id: `m-${title}`,
    provider: "google",
    kind: "meeting",
    source_id: `m-${title}`,
    title,
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

function prSignal(kind: StoredSignal["kind"], title: string): StoredSignal {
  return {
    id: `p-${title}`,
    provider: "github",
    kind,
    source_id: `p-${title}`,
    title,
    url: null,
    payload: {},
    requires_action: kind === "pr_review_requested",
    source_created_at: null,
    unread_count: 0,
    created_at: "2026-05-04T08:00:00Z",
    updated_at: "2026-05-04T08:00:00Z",
    dismissed_at: null,
  };
}

function memCacheStore(initial: BriefingCacheEntry | null = null) {
  let row = initial;
  return {
    saved: [] as BriefingCacheEntry[],
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
    inserts: [] as unknown[],
    from: (_: string) => ({
      insert: async (_row: unknown) => ({ error: null }),
      select: () => ({
        gte: () => ({
          lt: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };
}

function okFetch(content = "Lead with the design review at 10:30.") {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          model: "gpt-4o-mini",
          usage: { prompt_tokens: 200, completion_tokens: 60 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  ) as unknown as typeof fetch;
}

describe("buildBriefingPrompt", () => {
  it("groups today's meetings, PR review requests, authored PRs, and mentions", () => {
    const messages = buildBriefingPrompt(
      [
        meetingSignal("Standup", "2026-05-04T10:30:00.000Z"),
        meetingSignal("Yesterday's call", "2026-05-03T15:00:00.000Z"),
        prSignal("pr_review_requested", "feat: add focus session"),
        prSignal("pr_authored", "fix: nil deref"),
        prSignal("pr_assigned", "chore: bump deps"),
        prSignal("mention", "@you in #oncall"),
      ],
      "2026-05-04",
      new Date("2026-05-04T07:00:00.000Z"),
    );
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    const userContent = messages[1].content;
    expect(userContent).toContain("Date: 2026-05-04");
    expect(userContent).toContain("Meetings today (1)");
    expect(userContent).toContain("Standup");
    expect(userContent).not.toContain("Yesterday's call");
    expect(userContent).toContain("PRs awaiting your review (1)");
    expect(userContent).toContain("feat: add focus session");
    expect(userContent).toContain("Your open / assigned PRs (2)");
    expect(userContent).toContain("New mentions / DMs (1)");
  });

  it("emits '(none)' rows when nothing is in a section", () => {
    const messages = buildBriefingPrompt(
      [],
      "2026-05-04",
      new Date("2026-05-04T07:00:00.000Z"),
    );
    expect(messages[1].content).toContain("Meetings today (0)");
    expect(messages[1].content).toContain("- (none)");
  });

  it("caps each bucket and surfaces the dropped count", () => {
    const mentions: StoredSignal[] = [];
    for (let i = 0; i < 20; i++) {
      mentions.push(prSignal("mention", `mention-${i}`));
    }
    const meetings: StoredSignal[] = [];
    for (let i = 0; i < 12; i++) {
      // Spread across today so all 12 land in the bucket.
      const hour = String(7 + i).padStart(2, "0");
      meetings.push(
        meetingSignal(`meeting-${i}`, `2026-05-04T${hour}:00:00.000Z`),
      );
    }
    const messages = buildBriefingPrompt(
      [...meetings, ...mentions],
      "2026-05-04",
      new Date("2026-05-04T07:00:00.000Z"),
    );
    const userContent = messages[1].content;
    // Counts reflect the full bucket size, not the truncated render.
    expect(userContent).toContain("Meetings today (12)");
    expect(userContent).toContain("New mentions / DMs (20)");
    // First N rendered, overflow tally appended.
    expect(userContent).toContain("meeting-0");
    expect(userContent).toContain("meeting-7");
    expect(userContent).not.toContain("meeting-8");
    expect(userContent).toContain("(+4 more not shown)");
    expect(userContent).toContain("mention-0");
    expect(userContent).toContain("mention-11");
    expect(userContent).not.toContain("mention-12");
    expect(userContent).toContain("(+8 more not shown)");
  });

  it("excludes dismissed signals", () => {
    const dismissed = {
      ...prSignal("pr_review_requested", "stale PR"),
      dismissed_at: "2026-05-03T08:00:00.000Z",
    };
    const messages = buildBriefingPrompt(
      [dismissed],
      "2026-05-04",
      new Date("2026-05-04T07:00:00.000Z"),
    );
    expect(messages[1].content).toContain("PRs awaiting your review (0)");
  });
});

describe("generateBriefing", () => {
  it("returns the cached entry when date + provider + model match", async () => {
    const cache = memCacheStore({
      date: "2026-05-04",
      text: "Cached briefing.",
      provider: "openai",
      model: "gpt-4o-mini",
      used_fallback: false,
      generated_at: "2026-05-04T07:00:00.000Z",
    });
    const fetchMock = okFetch();
    const result = await generateBriefing({
      date: "2026-05-04",
      signals: [],
      settings: baseSettings,
      cacheStore: cache,
      usageStore: fakeUsageStore(),
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: true,
      cached: true,
      text: "Cached briefing.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the LLM and persists when no cache exists, returns cached:false", async () => {
    const cache = memCacheStore();
    const fetchMock = okFetch("Fresh briefing for today.");
    const result = await generateBriefing({
      date: "2026-05-04",
      signals: [meetingSignal("Standup", "2026-05-04T10:30:00.000Z")],
      settings: baseSettings,
      cacheStore: cache,
      usageStore: fakeUsageStore(),
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: true,
      cached: false,
      text: "Fresh briefing for today.",
      provider: "openai",
      model: "gpt-4o-mini",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.current).toMatchObject({
      date: "2026-05-04",
      text: "Fresh briefing for today.",
    });
  });

  it("regenerates on a new date even when a cached entry exists", async () => {
    const cache = memCacheStore({
      date: "2026-05-03",
      text: "Yesterday.",
      provider: "openai",
      model: "gpt-4o-mini",
      used_fallback: false,
      generated_at: "2026-05-03T07:00:00.000Z",
    });
    const fetchMock = okFetch("Today.");
    const result = await generateBriefing({
      date: "2026-05-04",
      signals: [],
      settings: baseSettings,
      cacheStore: cache,
      usageStore: fakeUsageStore(),
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(result).toMatchObject({ ok: true, cached: false, text: "Today." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("regenerates when force=true even when cache matches", async () => {
    const cache = memCacheStore({
      date: "2026-05-04",
      text: "Stale.",
      provider: "openai",
      model: "gpt-4o-mini",
      used_fallback: false,
      generated_at: "2026-05-04T07:00:00.000Z",
    });
    const fetchMock = okFetch("Regenerated.");
    const result = await generateBriefing({
      date: "2026-05-04",
      force: true,
      signals: [],
      settings: baseSettings,
      cacheStore: cache,
      usageStore: fakeUsageStore(),
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: true,
      cached: false,
      text: "Regenerated.",
    });
    // Force-regenerate increments the per-day counter so the budget guard
    // can refuse later calls.
    expect(cache.current?.regen_count).toBe(1);
  });

  it("refuses with regenerate_limit after the daily cap is reached", async () => {
    const cache = memCacheStore({
      date: "2026-05-04",
      text: "Already regenerated thrice.",
      provider: "openai",
      model: "gpt-4o-mini",
      used_fallback: false,
      generated_at: "2026-05-04T07:00:00.000Z",
      regen_count: 3,
    });
    const fetchMock = okFetch("Should not be called.");
    const result = await generateBriefing({
      date: "2026-05-04",
      force: true,
      signals: [],
      settings: baseSettings,
      cacheStore: cache,
      usageStore: fakeUsageStore(),
      fetch: fetchMock,
      now: () => new Date("2026-05-04T09:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "regenerate_limit" });
    expect(fetchMock).not.toHaveBeenCalled();
    // Count is unchanged — no LLM call was made.
    expect(cache.current?.regen_count).toBe(3);
  });

  it("resets the regenerate counter when the date rolls over", async () => {
    const cache = memCacheStore({
      date: "2026-05-03",
      text: "Yesterday.",
      provider: "openai",
      model: "gpt-4o-mini",
      used_fallback: false,
      generated_at: "2026-05-03T07:00:00.000Z",
      regen_count: 3,
    });
    const fetchMock = okFetch("Today, fresh.");
    const result = await generateBriefing({
      date: "2026-05-04",
      force: true,
      signals: [],
      settings: baseSettings,
      cacheStore: cache,
      usageStore: fakeUsageStore(),
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(result).toMatchObject({ ok: true, cached: false });
    // New date = fresh entry. The counter resets to 0 — this is the first
    // paragraph for the new day, not a regenerate.
    expect(cache.current?.regen_count).toBe(0);
  });

  it("returns no_provider when AI is not configured", async () => {
    const fetchMock = okFetch();
    const result = await generateBriefing({
      date: "2026-05-04",
      signals: [],
      settings: { ...baseSettings, apiKey: "" },
      cacheStore: memCacheStore(),
      usageStore: fakeUsageStore(),
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "no_provider" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns disabled when ai_disabled is true", async () => {
    const result = await generateBriefing({
      date: "2026-05-04",
      signals: [],
      settings: { ...baseSettings, aiDisabled: true },
      cacheStore: memCacheStore(),
      usageStore: fakeUsageStore(),
      fetch: okFetch(),
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "disabled" });
  });

  it("surfaces budget_reached when the meter refuses", async () => {
    // 30 USD spent against a $25 budget → over 100%.
    const usage = {
      inserts: [] as unknown[],
      from: () => ({
        insert: async () => ({ error: null }),
        select: () => ({
          gte: () => ({
            lt: async () => ({ data: [{ cost_usd: 30 }], error: null }),
          }),
        }),
      }),
    };
    const fetchMock = okFetch();
    const result = await generateBriefing({
      date: "2026-05-04",
      signals: [],
      settings: baseSettings,
      cacheStore: memCacheStore(),
      usageStore: usage,
      fetch: fetchMock,
      now: () => new Date("2026-05-04T08:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "budget_reached" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
