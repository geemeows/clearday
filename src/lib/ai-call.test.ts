import { describe, expect, it, vi } from "vitest";
import { AiCallRefused, runAiCall } from "#/lib/ai-call";

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

function fakeUsageStore({ spend = 0 }: { spend?: number } = {}) {
  const inserts: unknown[] = [];
  const store = {
    inserts,
    from: (table: string) => {
      if (table !== "ai_usage") throw new Error(`unexpected table ${table}`);
      return {
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: null };
        },
        select: () => ({
          gte: () => ({
            lt: async () => ({
              data: spend > 0 ? [{ cost_usd: spend }] : [],
              error: null,
            }),
          }),
        }),
      };
    },
  };
  return store;
}

function okFetch(content = "OK", model = "gpt-4o-mini") {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          model,
          usage: { prompt_tokens: 1000, completion_tokens: 50 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  ) as unknown as typeof fetch;
}

describe("runAiCall", () => {
  it("calls chat() with the requested model and records usage on success", async () => {
    const usage = fakeUsageStore();
    const fetchMock = okFetch();
    const result = await runAiCall(
      { messages: [{ role: "user", content: "hi" }] },
      { settings: baseSettings, usageStore: usage, fetch: fetchMock },
    );
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.usedFallback).toBe(false);
    expect(result.response.content).toBe("OK");
    expect(usage.inserts).toHaveLength(1);
    expect(usage.inserts[0]).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      prompt_tokens: 1000,
      completion_tokens: 50,
    });
  });

  it("uses the configured fallback model when ≥80% of budget is spent", async () => {
    const usage = fakeUsageStore({ spend: 22 });
    const fetchMock = okFetch("OK", "gpt-4o-mini");
    const result = await runAiCall(
      { messages: [{ role: "user", content: "hi" }] },
      {
        settings: {
          ...baseSettings,
          defaultModel: "gpt-4o",
          fallbackModel: "gpt-4o-mini",
        },
        usageStore: usage,
        fetch: fetchMock,
      },
    );
    expect(result.usedFallback).toBe(true);
    expect(result.model).toBe("gpt-4o-mini");
    const [, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as {
      model: string;
    };
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("refuses with budget_reached when ≥100% of budget is spent", async () => {
    const usage = fakeUsageStore({ spend: 30 });
    const fetchMock = okFetch();
    await expect(
      runAiCall(
        { messages: [{ role: "user", content: "hi" }] },
        { settings: baseSettings, usageStore: usage, fetch: fetchMock },
      ),
    ).rejects.toMatchObject({
      name: "AiCallRefused",
      reason: "budget_reached",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses with disabled when ai_disabled is true", async () => {
    const usage = fakeUsageStore();
    const fetchMock = okFetch();
    await expect(
      runAiCall(
        { messages: [{ role: "user", content: "hi" }] },
        {
          settings: { ...baseSettings, aiDisabled: true },
          usageStore: usage,
          fetch: fetchMock,
        },
      ),
    ).rejects.toMatchObject({ name: "AiCallRefused", reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redacts messages before sending when privacyMode is on", async () => {
    const usage = fakeUsageStore();
    const fetchMock = okFetch();
    await runAiCall(
      {
        messages: [
          { role: "user", content: "Authorization: Bearer abcdefghijklmnop" },
        ],
      },
      {
        settings: { ...baseSettings, privacyMode: true },
        usageStore: usage,
        fetch: fetchMock,
      },
    );
    const [, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: { content: string }[];
    };
    expect(body.messages[0].content).not.toContain("abcdefghijklmnop");
    expect(body.messages[0].content).toContain("[redacted]");
  });

  it("records 0 cost for an unknown model but still inserts the row", async () => {
    const usage = fakeUsageStore();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
            model: "weird-model-9000",
            usage: { prompt_tokens: 12, completion_tokens: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    await runAiCall(
      { messages: [{ role: "user", content: "hi" }] },
      {
        settings: { ...baseSettings, defaultModel: "weird-model-9000" },
        usageStore: usage,
        fetch: fetchMock,
      },
    );
    expect(usage.inserts).toHaveLength(1);
    expect((usage.inserts[0] as { cost_usd: number }).cost_usd).toBe(0);
  });

  it("verifies AiCallRefused is throwable and inspectable", () => {
    const err = new AiCallRefused("nope", "disabled");
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe("disabled");
  });
});
