import { describe, expect, it, vi } from "vitest";
import { requestReviewers } from "#/features/integrations/providers/github/capabilities/request-reviewers";

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

describe("requestReviewers", () => {
  it("posts to the requested_reviewers endpoint with users and teams", async () => {
    const { fn, calls } = recordingFetch(() =>
      jsonResponse(201, {
        requested_reviewers: [{ login: "alice" }, { login: "bob" }],
        requested_teams: [{ slug: "platform" }],
      }),
    );
    const out = await requestReviewers(
      {
        repo: "owner/repo",
        number: 42,
        reviewers: ["alice", "bob"],
        team_reviewers: ["platform"],
      },
      { token: "gh-tok", fetch: fn },
    );
    expect(out).toEqual({
      ok: true,
      requested: { users: ["alice", "bob"], teams: ["platform"] },
    });
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/owner/repo/pulls/42/requested_reviewers",
    );
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      reviewers: ["alice", "bob"],
      team_reviewers: ["platform"],
    });
  });

  it("rejects when neither reviewers nor team_reviewers provided", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, {}));
    const out = await requestReviewers(
      { repo: "o/r", number: 1, reviewers: [], team_reviewers: [] },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("missing_reviewers");
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid repo", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, {}));
    const out = await requestReviewers(
      { repo: "bogus", number: 1, reviewers: ["alice"] },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("invalid_repo");
  });

  it("rejects a missing token and flags reauth", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, {}));
    const out = await requestReviewers(
      { repo: "o/r", number: 1, reviewers: ["alice"] },
      { token: null, fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("no_token");
      expect(out.needs_reauth).toBe(true);
    }
  });

  it("flags reauth on 403 / scope errors", async () => {
    const { fn } = recordingFetch(
      () =>
        new Response("missing scope: repo", {
          status: 403,
          headers: { "content-type": "text/plain" },
        }),
    );
    const out = await requestReviewers(
      { repo: "o/r", number: 1, reviewers: ["alice"] },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(true);
    }
  });
});
