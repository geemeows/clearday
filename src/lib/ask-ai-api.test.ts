import { describe, expect, it, vi } from "vitest";
import type { AiSettingsRow } from "#/lib/ai-settings-api";
import { buildAskAiPrompt, handleAskAi } from "#/lib/ask-ai-api";
import { encryptSecret } from "#/lib/llm-crypto";
import type { StoredSignal } from "#/shared/signal";

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

function okFetch(content = "Answer.") {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          model: "gpt-4o-mini",
          usage: { prompt_tokens: 50, completion_tokens: 20 },
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

const prSignal: StoredSignal = {
  id: "s1",
  provider: "github",
  kind: "pr_review_requested",
  source_id: "owner/repo#42",
  title: "Add cron orchestrator",
  url: "https://github.com/owner/repo/pull/42",
  payload: { repo: "owner/repo", author: "alice" },
  requires_action: true,
  source_created_at: "2026-05-01T10:00:00Z",
  unread_count: 0,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
  dismissed_at: null,
};

describe("buildAskAiPrompt", () => {
  it("includes the question + a context block built from signals", () => {
    const messages = buildAskAiPrompt("what's blocking me?", [prSignal]);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("what's blocking me?");
    expect(messages[1].content).toContain("Add cron orchestrator");
    expect(messages[1].content).toContain("github/pr_review_requested");
    expect(messages[1].content).toContain("owner/repo");
    expect(messages[1].content).toContain("by @alice");
  });

  it("emits an explicit 'no Signals' marker when context is empty", () => {
    const messages = buildAskAiPrompt("hi", []);
    expect(messages[1].content).toContain("(no current Signals available");
  });
});

describe("handleAskAi", () => {
  it("rejects an empty question", async () => {
    const out = await handleAskAi(
      { q: "" },
      {
        aiStore: memAiStore(null),
        loadSignals: async () => [],
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });

  it("returns no_provider when AI settings are missing", async () => {
    const out = await handleAskAi(
      { q: "what?" },
      {
        aiStore: memAiStore(null),
        loadSignals: async () => [],
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(out).toEqual({ ok: false, reason: "no_provider" });
  });

  it("decrypts the key, loads signals, calls the LLM, and returns the answer", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch("You're waiting on alice's review.");
    const out = await handleAskAi(
      { q: "what's blocking me?" },
      {
        aiStore: memAiStore(row),
        loadSignals: async () => [prSignal],
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: fetchMock,
      },
    );
    expect(out).toMatchObject({
      ok: true,
      answer: "You're waiting on alice's review.",
      provider: "openai",
      model: "gpt-4o-mini",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    expect(
      ((init as RequestInit).headers as Record<string, string>).authorization,
    ).toBe("Bearer sk-real");
  });

  it("forwards signal_ids to the loader", async () => {
    const row = await configuredRow();
    const loader = vi.fn(async () => [prSignal]);
    await handleAskAi(
      { q: "summary?", signal_ids: ["s1", "s2"] },
      {
        aiStore: memAiStore(row),
        loadSignals: loader,
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(loader).toHaveBeenCalledWith(["s1", "s2"]);
  });

  it("surfaces budget_reached when the meter refuses", async () => {
    const row = await configuredRow();
    const usage = {
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
    const out = await handleAskAi(
      { q: "hi" },
      {
        aiStore: memAiStore(row),
        loadSignals: async () => [],
        usageStore: usage,
        keySecret: KEY_SECRET,
        fetch: fetchMock,
      },
    );
    expect(out).toEqual({ ok: false, reason: "budget_reached" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
