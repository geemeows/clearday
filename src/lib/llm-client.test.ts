import { describe, expect, it, vi } from "vitest";
import { chat, type LlmConfig, LlmError } from "#/lib/llm-client";

type Call = { url: string; init: RequestInit };

function recording(handler: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function bodyOf(call: Call): unknown {
  return JSON.parse(call.init.body as string);
}

describe("llm-client.chat", () => {
  it("anthropic: posts /v1/messages, splits system, normalizes content + usage", async () => {
    const { fn, calls } = recording(() =>
      ok({
        content: [
          { type: "text", text: "OK" },
          { type: "text", text: "" },
        ],
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 4, output_tokens: 1 },
      }),
    );
    const cfg: LlmConfig = {
      provider: "anthropic",
      apiKey: "sk-ant-xxx",
      defaultModel: "claude-sonnet-4-6",
      fetch: fn,
    };
    const res = await chat(
      {
        messages: [
          { role: "system", content: "be terse" },
          { role: "user", content: "ping" },
        ],
      },
      cfg,
    );
    expect(res).toEqual({
      content: "OK",
      model: "claude-sonnet-4-6",
      usage: { prompt_tokens: 4, completion_tokens: 1 },
    });
    const call = calls[0];
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    const body = bodyOf(call) as {
      system: string;
      messages: Array<{ role: string; content: string }>;
      model: string;
    };
    expect(body.system).toBe("be terse");
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
    expect(body.model).toBe("claude-sonnet-4-6");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-xxx");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("openai: posts /chat/completions with bearer + normalizes choice", async () => {
    const { fn, calls } = recording(() =>
      ok({
        choices: [{ message: { content: "OK" } }],
        model: "gpt-4o-mini",
        usage: { prompt_tokens: 8, completion_tokens: 1 },
      }),
    );
    const cfg: LlmConfig = {
      provider: "openai",
      apiKey: "sk-xxx",
      defaultModel: "gpt-4o-mini",
      fetch: fn,
    };
    const res = await chat(
      { messages: [{ role: "user", content: "ping" }] },
      cfg,
    );
    expect(res.content).toBe("OK");
    expect(res.usage).toEqual({ prompt_tokens: 8, completion_tokens: 1 });
    const call = calls[0];
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect((call.init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-xxx",
    );
  });

  it("groq: defaults to groq base URL but is OpenAI-compatible", async () => {
    const { fn, calls } = recording(() =>
      ok({ choices: [{ message: { content: "ok" } }], model: "llama-3.1" }),
    );
    const cfg: LlmConfig = {
      provider: "groq",
      apiKey: "gsk_xxx",
      defaultModel: "llama-3.1",
      fetch: fn,
    };
    await chat({ messages: [{ role: "user", content: "ping" }] }, cfg);
    expect(calls[0].url).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
  });

  it("gemini: encodes model + key in URL, splits system, maps assistant→model", async () => {
    const { fn, calls } = recording(() =>
      ok({
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 },
      }),
    );
    const cfg: LlmConfig = {
      provider: "gemini",
      apiKey: "AIza-xxx",
      defaultModel: "gemini-1.5-flash",
      fetch: fn,
    };
    const res = await chat(
      {
        messages: [
          { role: "system", content: "system rules" },
          { role: "user", content: "hi" },
          { role: "assistant", content: "yo" },
          { role: "user", content: "ping" },
        ],
      },
      cfg,
    );
    expect(res.content).toBe("OK");
    expect(res.usage).toEqual({ prompt_tokens: 3, completion_tokens: 1 });
    const call = calls[0];
    expect(call.url).toContain(
      "generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
    );
    expect(call.url).toContain("key=AIza-xxx");
    const body = bodyOf(call) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    };
    expect(body.systemInstruction.parts[0].text).toBe("system rules");
    expect(body.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("ollama: posts /api/chat to baseUrl, returns eval counts as usage", async () => {
    const { fn, calls } = recording(() =>
      ok({
        message: { content: "OK" },
        model: "llama3",
        prompt_eval_count: 5,
        eval_count: 1,
      }),
    );
    const cfg: LlmConfig = {
      provider: "ollama",
      apiKey: "",
      defaultModel: "llama3",
      baseUrl: "http://localhost:11434",
      fetch: fn,
    };
    const res = await chat(
      { messages: [{ role: "user", content: "ping" }] },
      cfg,
    );
    expect(res.content).toBe("OK");
    expect(res.usage).toEqual({ prompt_tokens: 5, completion_tokens: 1 });
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
    const body = bodyOf(calls[0]) as { stream: boolean };
    expect(body.stream).toBe(false);
  });

  it("throws LlmError with status on non-2xx response", async () => {
    const { fn } = recording(() => new Response("nope", { status: 401 }));
    const cfg: LlmConfig = {
      provider: "openai",
      apiKey: "bad",
      defaultModel: "gpt-4o-mini",
      fetch: fn,
    };
    await expect(
      chat({ messages: [{ role: "user", content: "ping" }] }, cfg),
    ).rejects.toMatchObject({
      name: "LlmError",
      status: 401,
    });
  });

  it("throws if no model is supplied and no default is configured", async () => {
    const cfg: LlmConfig = {
      provider: "openai",
      apiKey: "x",
      fetch: vi.fn() as unknown as typeof fetch,
    };
    await expect(
      chat({ messages: [{ role: "user", content: "ping" }] }, cfg),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it("respects per-call model override", async () => {
    const { fn, calls } = recording(() =>
      ok({ choices: [{ message: { content: "ok" } }], model: "gpt-4o" }),
    );
    const cfg: LlmConfig = {
      provider: "openai",
      apiKey: "x",
      defaultModel: "gpt-4o-mini",
      fetch: fn,
    };
    await chat(
      { messages: [{ role: "user", content: "ping" }], model: "gpt-4o" },
      cfg,
    );
    expect((bodyOf(calls[0]) as { model: string }).model).toBe("gpt-4o");
  });
});
