import { describe, expect, it, vi } from "vitest";
import { listSlackChannels } from "#/lib/slack-channels";

type Call = { url: string; init: RequestInit };

function recordingFetch(handlers: Array<(url: string) => Response>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const handler = handlers[Math.min(i, handlers.length - 1)];
    i++;
    return handler(url);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("listSlackChannels", () => {
  it("returns only channels the user is a member of and forwards bearer auth", async () => {
    const { fn, calls } = recordingFetch([
      () =>
        jsonResponse(200, {
          ok: true,
          channels: [
            { id: "C001", name: "general", is_member: true, is_private: false },
            { id: "C002", name: "random", is_member: false, is_private: false },
            { id: "C003", name: "leads", is_member: true, is_private: true },
          ],
        }),
    ]);

    const out = await listSlackChannels({ token: "xoxb-tok", fetch: fn });

    expect(out).toEqual({
      ok: true,
      channels: [
        { id: "C001", name: "general", is_private: false },
        { id: "C003", name: "leads", is_private: true },
      ],
    });
    expect(calls[0].url).toContain("https://slack.com/api/conversations.list?");
    expect(calls[0].url).toContain("types=public_channel%2Cprivate_channel");
    expect(calls[0].url).toContain("exclude_archived=true");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer xoxb-tok");
  });

  it("follows response_metadata.next_cursor across pages", async () => {
    const { fn, calls } = recordingFetch([
      () =>
        jsonResponse(200, {
          ok: true,
          channels: [
            { id: "C001", name: "a", is_member: true, is_private: false },
          ],
          response_metadata: { next_cursor: "next-1" },
        }),
      () =>
        jsonResponse(200, {
          ok: true,
          channels: [
            { id: "C002", name: "b", is_member: true, is_private: false },
          ],
          response_metadata: { next_cursor: "" },
        }),
    ]);

    const out = await listSlackChannels({ token: "t", fetch: fn });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.channels.map((c) => c.id)).toEqual(["C001", "C002"]);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain("cursor=next-1");
  });

  it("returns no_token without hitting the network when token is missing", async () => {
    const { fn, calls } = recordingFetch([
      () => jsonResponse(200, { ok: true }),
    ]);
    const out = await listSlackChannels({ token: null, fetch: fn });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("no_token");
      expect(out.needs_reauth).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });

  it("flags needs_reauth when Slack returns an auth error code", async () => {
    const { fn } = recordingFetch([
      () => jsonResponse(200, { ok: false, error: "token_revoked" }),
    ]);
    const out = await listSlackChannels({ token: "t", fetch: fn });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(true);
      expect(out.error).toContain("token_revoked");
    }
  });

  it("flags needs_reauth on HTTP 401", async () => {
    const { fn } = recordingFetch([() => jsonResponse(401, {})]);
    const out = await listSlackChannels({ token: "t", fetch: fn });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(true);
    }
  });

  it("does not flag needs_reauth for non-auth Slack error codes", async () => {
    const { fn } = recordingFetch([
      () => jsonResponse(200, { ok: false, error: "rate_limited" }),
    ]);
    const out = await listSlackChannels({ token: "t", fetch: fn });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(false);
    }
  });
});
