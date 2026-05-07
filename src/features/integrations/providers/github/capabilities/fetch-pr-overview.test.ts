import { describe, expect, it, vi } from "vitest";
import { fetchPrOverview } from "#/features/integrations/providers/github/capabilities/fetch-pr-overview";

type Call = { url: string; init: RequestInit };

function recordingFetch(handler: (url: string) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
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

const PR_BODY = {
  body: "Reworks the slack webhook to batch-upsert.",
  user: { login: "alice", avatar_url: "https://avatars/u/1" },
};

const COMMENTS = [
  {
    id: 1,
    path: "src/a.ts",
    line: 12,
    side: "RIGHT",
    diff_hunk: "@@ -1 +1 @@\n+x",
    body: "nit: rename",
    user: { login: "rahul", avatar_url: "https://avatars/u/2" },
    created_at: "2026-05-01T10:00:00Z",
  },
];

const ISSUE_COMMENTS = [
  {
    id: 100,
    body: "Looks great overall — left a few notes inline.",
    user: { login: "carol", avatar_url: "https://avatars/u/3" },
    created_at: "2026-05-02T09:00:00Z",
  },
];

describe("fetchPrOverview", () => {
  it("fetches /pulls/N, /pulls/N/comments, and /issues/N/comments and surfaces body, author, both comment streams", async () => {
    const { fn, calls } = recordingFetch((url) => {
      if (url.endsWith("/pulls/42")) return jsonResponse(200, PR_BODY);
      if (url.includes("/issues/42/comments"))
        return jsonResponse(200, ISSUE_COMMENTS);
      return jsonResponse(200, COMMENTS);
    });
    const out = await fetchPrOverview(
      { repo: "owner/repo", number: 42 },
      { token: "tok", fetch: fn },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.body).toBe("Reworks the slack webhook to batch-upsert.");
    expect(out.author).toBe("alice");
    expect(out.author_avatar_url).toBe("https://avatars/u/1");
    expect(out.review_comments).toHaveLength(1);
    expect(out.review_comments[0]).toMatchObject({
      path: "src/a.ts",
      line: 12,
      side: "RIGHT",
      body: "nit: rename",
      user: "rahul",
    });
    expect(out.issue_comments).toHaveLength(1);
    expect(out.issue_comments[0]).toMatchObject({
      id: 100,
      body: "Looks great overall — left a few notes inline.",
      user: "carol",
      user_avatar_url: "https://avatars/u/3",
      created_at: "2026-05-02T09:00:00Z",
    });
    const urls = calls.map((c) => c.url);
    expect(urls).toContain("https://api.github.com/repos/owner/repo/pulls/42");
    expect(urls).toContain(
      "https://api.github.com/repos/owner/repo/pulls/42/comments?per_page=100",
    );
    expect(urls).toContain(
      "https://api.github.com/repos/owner/repo/issues/42/comments?per_page=100",
    );
  });

  it("falls back to original_line when line is null on outdated comments", async () => {
    const { fn } = recordingFetch((url) => {
      if (url.endsWith("/pulls/1")) return jsonResponse(200, PR_BODY);
      if (url.includes("/issues/1/comments")) return jsonResponse(200, []);
      return jsonResponse(200, [
        {
          id: 9,
          path: "f.ts",
          line: null,
          original_line: 7,
          body: "hi",
          user: { login: "x" },
        },
      ]);
    });
    const out = await fetchPrOverview(
      { repo: "o/r", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.review_comments[0].line).toBe(7);
  });

  it("rejects invalid repo strings", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, {}));
    const out = await fetchPrOverview(
      { repo: "no-slash", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("invalid_repo");
  });

  it("returns no_token + needs_reauth when token is missing", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, {}));
    const out = await fetchPrOverview(
      { repo: "o/r", number: 1 },
      { token: null, fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no_token");
    expect(out.needs_reauth).toBe(true);
  });

  it("flags 401 / 403 from either subrequest as needs_reauth", async () => {
    const { fn } = recordingFetch((url) => {
      if (url.endsWith("/pulls/1")) return jsonResponse(200, PR_BODY);
      return jsonResponse(403, { message: "forbidden" });
    });
    const out = await fetchPrOverview(
      { repo: "o/r", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("api_error");
    expect(out.needs_reauth).toBe(true);
  });

  it("surfaces fetch exceptions as api_error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const out = await fetchPrOverview(
      { repo: "o/r", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("api_error");
    expect(out.error).toContain("offline");
  });
});
