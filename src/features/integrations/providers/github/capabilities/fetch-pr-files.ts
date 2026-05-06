// PR files capability: fetch the per-file patch hunks for a pull request via
// `GET /repos/{owner}/{repo}/pulls/{number}/files`. Pure module with injected
// fetch + token, mirroring submit-pr-review.

export type FetchPrFilesParams = {
  repo: string; // "owner/repo"
  number: number;
  // GitHub paginates at 30 by default, max 100. We fetch a single page.
  per_page?: number;
};

export type GithubFetch = typeof fetch;

export type FetchPrFilesDeps = {
  token: string | null;
  fetch: GithubFetch;
};

export type PrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
};

export type FetchPrFilesResult =
  | { ok: true; files: PrFile[] }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "invalid_repo" | "api_error";
      needs_reauth?: boolean;
    };

export async function fetchPrFiles(
  params: FetchPrFilesParams,
  deps: FetchPrFilesDeps,
): Promise<FetchPrFilesResult> {
  const repo = (params.repo ?? "").trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    return {
      ok: false,
      error: "repo must be 'owner/name'",
      reason: "invalid_repo",
    };
  }
  if (!Number.isInteger(params.number) || params.number <= 0) {
    return {
      ok: false,
      error: "number must be a positive integer",
      reason: "invalid_repo",
    };
  }
  if (!deps.token) {
    return {
      ok: false,
      error: "github not connected",
      reason: "no_token",
      needs_reauth: true,
    };
  }
  const perPage = Math.min(Math.max(params.per_page ?? 50, 1), 100);
  const url = `https://api.github.com/repos/${repo}/pulls/${params.number}/files?per_page=${perPage}`;
  let res: Awaited<ReturnType<GithubFetch>>;
  try {
    res = await deps.fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${deps.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "clearday-worker",
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "api_error",
    };
  }
  if (!res.ok) {
    const text = await safeText(res);
    const needsReauth =
      res.status === 401 ||
      res.status === 403 ||
      /scope/i.test(text) ||
      /not accessible/i.test(text);
    return {
      ok: false,
      error: `github HTTP ${res.status}: ${text.slice(0, 200)}`,
      reason: "api_error",
      needs_reauth: needsReauth,
    };
  }
  const raw = (await safeJson(res)) as Array<Record<string, unknown>> | null;
  const files: PrFile[] = Array.isArray(raw)
    ? raw.map((f) => ({
        filename: typeof f.filename === "string" ? f.filename : "",
        status: typeof f.status === "string" ? f.status : "",
        additions: typeof f.additions === "number" ? f.additions : 0,
        deletions: typeof f.deletions === "number" ? f.deletions : 0,
        patch: typeof f.patch === "string" ? f.patch : null,
      }))
    : [];
  return { ok: true, files };
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeJson(res: {
  json: () => Promise<unknown>;
}): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
