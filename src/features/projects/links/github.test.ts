import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  fetchGithubTicketMeta,
  formatGithubKey,
  githubKeyUrl,
  parseGithubLink,
} from "#/features/projects/links/github";

const __dirname = dirname(fileURLToPath(import.meta.url));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parseGithubLink", () => {
  it("parses an https PR URL", () => {
    expect(parseGithubLink("https://github.com/octocat/Hello-World/pull/42")).toEqual(
      { owner: "octocat", repo: "Hello-World", number: 42 },
    );
  });

  it("parses an https issue URL", () => {
    expect(
      parseGithubLink("https://github.com/octo/repo/issues/7"),
    ).toEqual({ owner: "octo", repo: "repo", number: 7 });
  });

  it("parses a git ssh PR URL", () => {
    expect(
      parseGithubLink("git@github.com:octo/repo/pull/3"),
    ).toEqual({ owner: "octo", repo: "repo", number: 3 });
  });

  it("parses owner/repo#N shorthand", () => {
    expect(parseGithubLink("octo/repo#9")).toEqual({
      owner: "octo",
      repo: "repo",
      number: 9,
    });
  });

  it("rejects unrelated URLs", () => {
    expect(parseGithubLink("https://gitlab.com/x/y/-/merge_requests/1")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseGithubLink("not a link")).toBeNull();
    expect(parseGithubLink("")).toBeNull();
  });
});

describe("formatGithubKey / githubKeyUrl", () => {
  it("renders ext id and URL", () => {
    const k = { owner: "octo", repo: "repo", number: 5 };
    expect(formatGithubKey(k)).toBe("octo/repo#5");
    expect(githubKeyUrl(k)).toBe("https://github.com/octo/repo/issues/5");
  });
});

describe("fetchGithubTicketMeta", () => {
  it("returns ok with status, assignee, updatedAt for an open PR", async () => {
    const fn = vi.fn(async () =>
      jsonResponse(200, {
        state: "open",
        pull_request: { merged_at: null },
        assignee: { login: "alice" },
        updated_at: "2026-05-01T00:00:00Z",
      }),
    ) as unknown as typeof fetch;
    const out = await fetchGithubTicketMeta(
      { owner: "o", repo: "r", number: 1 },
      { token: "tok", fetch: fn },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.meta.status).toBe("open");
    expect(out.meta.assignee).toBe("alice");
    expect(out.meta.updatedAt).toBe("2026-05-01T00:00:00Z");
  });

  it("flags merged PRs as merged", async () => {
    const fn = vi.fn(async () =>
      jsonResponse(200, {
        state: "closed",
        pull_request: { merged_at: "2026-05-02T00:00:00Z" },
        assignee: null,
      }),
    ) as unknown as typeof fetch;
    const out = await fetchGithubTicketMeta(
      { owner: "o", repo: "r", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.meta.status).toBe("merged");
    expect(out.meta.assignee).toBeNull();
  });

  it("returns no_token + needs_reauth when token is missing", async () => {
    const fn = vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const out = await fetchGithubTicketMeta(
      { owner: "o", repo: "r", number: 1 },
      { token: null, fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no_token");
    expect(out.needs_reauth).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("flags 401 as needs_reauth", async () => {
    const fn = vi.fn(async () =>
      jsonResponse(401, { message: "Bad credentials" }),
    ) as unknown as typeof fetch;
    const out = await fetchGithubTicketMeta(
      { owner: "o", repo: "r", number: 1 },
      { token: "expired", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("api_error");
    expect(out.needs_reauth).toBe(true);
  });

  it("only issues GET requests — never writes to GitHub (read-only invariant)", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: (init.method ?? "GET").toUpperCase() });
      return jsonResponse(200, { state: "open", assignee: null });
    }) as unknown as typeof fetch;
    await fetchGithubTicketMeta(
      { owner: "o", repo: "r", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("source contains no write-side endpoints (no POST/PATCH/PUT/DELETE to api.github.com)", () => {
    const src = readFileSync(
      resolve(__dirname, "github.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"/i);
  });
});
