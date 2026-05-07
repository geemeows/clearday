import { describe, expect, it, vi } from "vitest";
import { commentOnPr } from "#/features/integrations/providers/github/capabilities/comment-on-pr";

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

describe("commentOnPr", () => {
  it("posts to the GitHub Issue Comments endpoint with the right URL/body", async () => {
    const { fn, calls } = recordingFetch(() =>
      jsonResponse(201, { id: 9999 }),
    );
    const out = await commentOnPr(
      { repo: "owner/repo", number: 42, body: "looks good" },
      { token: "gh-tok", fetch: fn },
    );
    expect(out).toEqual({ ok: true, comment_id: 9999 });
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/owner/repo/issues/42/comments",
    );
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer gh-tok");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      body: "looks good",
    });
  });

  it("rejects an empty body before hitting the network", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, {}));
    const out = await commentOnPr(
      { repo: "o/r", number: 1, body: "  " },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("missing_body");
    expect(calls).toHaveLength(0);
  });

  it("rejects a missing token and flags reauth", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, {}));
    const out = await commentOnPr(
      { repo: "o/r", number: 1, body: "hi" },
      { token: null, fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("no_token");
      expect(out.needs_reauth).toBe(true);
    }
  });

  it("rejects a malformed repo", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, {}));
    const out = await commentOnPr(
      { repo: "no-slash", number: 1, body: "hi" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("invalid_repo");
    expect(calls).toHaveLength(0);
  });

  it("flags reauth on 401 / scope errors", async () => {
    const { fn } = recordingFetch(
      () =>
        new Response("missing scope: repo", {
          status: 403,
          headers: { "content-type": "text/plain" },
        }),
    );
    const out = await commentOnPr(
      { repo: "o/r", number: 1, body: "hi" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(true);
    }
  });
});
