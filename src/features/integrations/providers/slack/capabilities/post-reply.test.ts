import { describe, expect, it, vi } from "vitest";
import { postSlackReply } from "#/features/integrations/providers/slack/capabilities/post-reply";

type Call = { url: string; init: RequestInit };

function recordingFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("postSlackReply", () => {
  it("posts to chat.postMessage with channel + text and bearer auth", async () => {
    const { fn, calls } = recordingFetch(() =>
      jsonResponse(200, { ok: true, ts: "1700000000.000200", channel: "C123" }),
    );

    const out = await postSlackReply(
      { channel: "C123", text: "thanks, taking a look" },
      { token: "xoxp-tok", fetch: fn },
    );

    expect(out).toEqual({
      ok: true,
      ts: "1700000000.000200",
      channel: "C123",
    });
    expect(calls[0].url).toBe("https://slack.com/api/chat.postMessage");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer xoxp-tok");
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent).toEqual({ channel: "C123", text: "thanks, taking a look" });
  });

  it("forwards thread_ts when provided", async () => {
    const { fn, calls } = recordingFetch(() =>
      jsonResponse(200, { ok: true, ts: "1.2", channel: "C1" }),
    );
    await postSlackReply(
      { channel: "C1", text: "+1", thread_ts: "1700000000.000100" },
      { token: "t", fetch: fn },
    );
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent).toEqual({
      channel: "C1",
      text: "+1",
      thread_ts: "1700000000.000100",
    });
  });

  it("rejects empty text before hitting the network", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const out = await postSlackReply(
      { channel: "C1", text: "   " },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("missing_text");
    expect(calls).toHaveLength(0);
  });

  it("rejects empty channel before hitting the network", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const out = await postSlackReply(
      { channel: "", text: "hi" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("invalid_channel");
  });

  it("flags needs_reauth when no Slack token is available", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const out = await postSlackReply(
      { channel: "C1", text: "hi" },
      { token: null, fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("no_token");
      expect(out.needs_reauth).toBe(true);
    }
  });

  it("flags needs_reauth on missing_scope / token_revoked", async () => {
    const { fn } = recordingFetch(() =>
      jsonResponse(200, { ok: false, error: "missing_scope" }),
    );
    const out = await postSlackReply(
      { channel: "C1", text: "hi" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(true);
      expect(out.error).toMatch(/missing_scope/);
    }
  });

  it("does not flag reauth on non-auth errors", async () => {
    const { fn } = recordingFetch(() =>
      jsonResponse(200, { ok: false, error: "channel_not_found" }),
    );
    const out = await postSlackReply(
      { channel: "C1", text: "hi" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.needs_reauth).toBeFalsy();
      expect(out.error).toMatch(/channel_not_found/);
    }
  });

  it("surfaces non-2xx HTTP responses", async () => {
    const { fn } = recordingFetch(() => new Response("nope", { status: 500 }));
    const out = await postSlackReply(
      { channel: "C1", text: "hi" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.error).toMatch(/HTTP 500/);
    }
  });
});
