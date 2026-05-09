// Request reviewers action: ask GitHub to assign one or more reviewers (or
// team reviewers) to a pull request via
// `POST /repos/:owner/:repo/pulls/:number/requested_reviewers`. Pure module
// with injected fetch + token; mirrors `submit-pr-review.ts`.

export type RequestReviewersParams = {
  repo: string; // "owner/repo"
  number: number;
  reviewers?: string[]; // user logins
  team_reviewers?: string[]; // team slugs (within the repo's org)
};

export type GithubFetch = typeof fetch;

export type RequestReviewersDeps = {
  token: string | null;
  fetch: GithubFetch;
};

export type RequestReviewersResult =
  | { ok: true; requested: { users: string[]; teams: string[] } }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "missing_reviewers" | "invalid_repo" | "api_error";
      needs_reauth?: boolean;
    };

export async function requestReviewers(
  params: RequestReviewersParams,
  deps: RequestReviewersDeps,
): Promise<RequestReviewersResult> {
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
  const reviewers = (params.reviewers ?? []).filter(
    (r) => typeof r === "string" && r.trim().length > 0,
  );
  const teams = (params.team_reviewers ?? []).filter(
    (r) => typeof r === "string" && r.trim().length > 0,
  );
  if (reviewers.length === 0 && teams.length === 0) {
    return {
      ok: false,
      error: "at least one reviewer or team_reviewer required",
      reason: "missing_reviewers",
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
  const url = `https://api.github.com/repos/${repo}/pulls/${params.number}/requested_reviewers`;
  const payload: Record<string, unknown> = {};
  if (reviewers.length > 0) payload.reviewers = reviewers;
  if (teams.length > 0) payload.team_reviewers = teams;

  let res: Awaited<ReturnType<GithubFetch>>;
  try {
    res = await deps.fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${deps.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        "user-agent": "clearday-worker",
      },
      body: JSON.stringify(payload),
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
  const respBody = (await safeJson(res)) as {
    requested_reviewers?: Array<{ login?: string }>;
    requested_teams?: Array<{ slug?: string }>;
  } | null;
  return {
    ok: true,
    requested: {
      users: (respBody?.requested_reviewers ?? [])
        .map((u) => u.login ?? "")
        .filter((s) => s.length > 0),
      teams: (respBody?.requested_teams ?? [])
        .map((t) => t.slug ?? "")
        .filter((s) => s.length > 0),
    },
  };
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
