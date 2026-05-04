import { describe, expect, it, vi } from "vitest";
import { submitPrReview } from "#/lib/pr-review";

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

describe("submitPrReview", () => {
  it("posts to the GitHub Reviews API with the right URL, headers, and body", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, { id: 555 }));

    const out = await submitPrReview(
      { repo: "owner/repo", number: 42, event: "APPROVE" },
      { token: "gh-tok", fetch: fn },
    );

    expect(out).toEqual({ ok: true, review_id: 555 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/owner/repo/pulls/42/reviews",
    );
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer gh-tok");
    expect(headers.accept).toBe("application/vnd.github+json");
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent).toEqual({ event: "APPROVE" });
  });

  it("includes the body for COMMENT and REQUEST_CHANGES", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, { id: 1 }));
    await submitPrReview(
      { repo: "o/r", number: 1, event: "COMMENT", body: "looks good" },
      { token: "t", fetch: fn },
    );
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent).toEqual({ event: "COMMENT", body: "looks good" });
  });

  it("rejects REQUEST_CHANGES / COMMENT without a body", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, { id: 1 }));
    const out = await submitPrReview(
      { repo: "o/r", number: 1, event: "REQUEST_CHANGES", body: "  " },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("missing_body");
  });

  it("rejects when no GitHub token is available and flags reauth", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, {}));
    const out = await submitPrReview(
      { repo: "o/r", number: 1, event: "APPROVE" },
      { token: null, fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("no_token");
      expect(out.needs_reauth).toBe(true);
    }
  });

  it("rejects malformed repo / number before hitting the network", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, {}));
    const bad1 = await submitPrReview(
      { repo: "no-slash", number: 1, event: "APPROVE" },
      { token: "t", fetch: fn },
    );
    expect(bad1.ok).toBe(false);
    if (!bad1.ok) expect(bad1.reason).toBe("invalid_repo");

    const bad2 = await submitPrReview(
      { repo: "o/r", number: 0, event: "APPROVE" },
      { token: "t", fetch: fn },
    );
    expect(bad2.ok).toBe(false);
    if (!bad2.ok) expect(bad2.reason).toBe("invalid_repo");

    expect(calls).toHaveLength(0);
  });

  it("flags 403 with scope hint as needs_reauth", async () => {
    const { fn } = recordingFetch(() =>
      jsonResponse(403, {
        message:
          "Resource not accessible by personal access token; missing scope: repo",
      }),
    );
    const out = await submitPrReview(
      { repo: "o/r", number: 1, event: "APPROVE" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(true);
    }
  });

  it("surfaces non-2xx with status", async () => {
    const { fn } = recordingFetch(() =>
      jsonResponse(422, { message: "Validation Failed" }),
    );
    const out = await submitPrReview(
      { repo: "o/r", number: 1, event: "APPROVE" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toMatch(/HTTP 422/);
      expect(out.needs_reauth).toBeFalsy();
    }
  });
});
