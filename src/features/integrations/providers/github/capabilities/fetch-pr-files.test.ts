import { describe, expect, it, vi } from "vitest";
import { fetchPrFiles } from "#/features/integrations/providers/github/capabilities/fetch-pr-files";

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

describe("fetchPrFiles", () => {
  it("calls the GitHub /pulls/:n/files endpoint with auth + headers", async () => {
    const { fn, calls } = recordingFetch(() =>
      jsonResponse(200, [
        {
          filename: "src/a.ts",
          status: "modified",
          additions: 3,
          deletions: 1,
          patch: "@@ -1,2 +1,4 @@\n hi\n+new\n+row\n-old",
        },
      ]),
    );

    const out = await fetchPrFiles(
      { repo: "owner/repo", number: 42 },
      { token: "gh-tok", fetch: fn },
    );

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.files).toHaveLength(1);
    expect(out.files[0].filename).toBe("src/a.ts");
    expect(out.files[0].patch).toContain("+new");
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/owner/repo/pulls/42/files?per_page=50",
    );
    expect(calls[0].init.method).toBe("GET");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer gh-tok");
    expect(headers.accept).toBe("application/vnd.github+json");
  });

  it("returns null patch for binary or oversized files", async () => {
    const { fn } = recordingFetch(() =>
      jsonResponse(200, [
        {
          filename: "logo.png",
          status: "modified",
          additions: 0,
          deletions: 0,
        },
      ]),
    );
    const out = await fetchPrFiles(
      { repo: "o/r", number: 1 },
      { token: "tok", fetch: fn },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.files[0].patch).toBeNull();
  });

  it("rejects invalid repo strings", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, []));
    const out = await fetchPrFiles(
      { repo: "no-slash", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("invalid_repo");
  });

  it("rejects non-positive PR numbers", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, []));
    const out = await fetchPrFiles(
      { repo: "o/r", number: 0 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("invalid_repo");
  });

  it("returns no_token + needs_reauth when token is missing", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, []));
    const out = await fetchPrFiles(
      { repo: "o/r", number: 1 },
      { token: null, fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no_token");
    expect(out.needs_reauth).toBe(true);
  });

  it("flags 401 / 403 as needs_reauth", async () => {
    const { fn } = recordingFetch(() => jsonResponse(401, { message: "bad" }));
    const out = await fetchPrFiles(
      { repo: "o/r", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("api_error");
    expect(out.needs_reauth).toBe(true);
  });

  it("clamps per_page to the GitHub-allowed [1,100] window", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, []));
    await fetchPrFiles(
      { repo: "o/r", number: 1, per_page: 500 },
      { token: "t", fetch: fn },
    );
    expect(calls[0].url).toContain("per_page=100");
  });

  it("surfaces fetch exceptions as api_error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const out = await fetchPrFiles(
      { repo: "o/r", number: 1 },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("api_error");
    expect(out.error).toContain("offline");
  });
});
