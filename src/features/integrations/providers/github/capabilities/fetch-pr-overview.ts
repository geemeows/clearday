// PR overview capability: fetch the PR body (description), the per-line
// review comments, and the top-level conversation (issue) comments via:
//   GET /repos/{owner}/{repo}/pulls/{number}             → body
//   GET /repos/{owner}/{repo}/pulls/{number}/comments    → review comments (inline, on diff hunks)
//   GET /repos/{owner}/{repo}/issues/{number}/comments   → issue comments (top-level conversation)

export type FetchPrOverviewParams = {
  repo: string;
  number: number;
};

export type GithubFetch = typeof fetch;

export type FetchPrOverviewDeps = {
  token: string | null;
  fetch: GithubFetch;
};

export type PrReviewComment = {
  id: number;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT" | null;
  diff_hunk: string | null;
  body: string;
  user: string | null;
  user_avatar_url: string | null;
  created_at: string | null;
};

export type PrIssueComment = {
  id: number;
  body: string;
  user: string | null;
  user_avatar_url: string | null;
  created_at: string | null;
};

export type FetchPrOverviewResult =
  | {
      ok: true;
      body: string | null;
      author: string | null;
      author_avatar_url: string | null;
      state: "open" | "closed";
      merged: boolean;
      merged_at: string | null;
      review_comments: PrReviewComment[];
      issue_comments: PrIssueComment[];
    }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "invalid_repo" | "api_error";
      needs_reauth?: boolean;
    };

export async function fetchPrOverview(
  params: FetchPrOverviewParams,
  deps: FetchPrOverviewDeps,
): Promise<FetchPrOverviewResult> {
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
  const headers = {
    authorization: `Bearer ${deps.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "clearday-worker",
  };
  const prUrl = `https://api.github.com/repos/${repo}/pulls/${params.number}`;
  const commentsUrl = `https://api.github.com/repos/${repo}/pulls/${params.number}/comments?per_page=100`;
  const issueCommentsUrl = `https://api.github.com/repos/${repo}/issues/${params.number}/comments?per_page=100`;
  let prRes: Awaited<ReturnType<GithubFetch>>;
  let commentsRes: Awaited<ReturnType<GithubFetch>>;
  let issueCommentsRes: Awaited<ReturnType<GithubFetch>>;
  try {
    [prRes, commentsRes, issueCommentsRes] = await Promise.all([
      deps.fetch(prUrl, { method: "GET", headers }),
      deps.fetch(commentsUrl, { method: "GET", headers }),
      deps.fetch(issueCommentsUrl, { method: "GET", headers }),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "api_error",
    };
  }
  for (const res of [prRes, commentsRes, issueCommentsRes]) {
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
  }
  const prBody = (await safeJson(prRes)) as Record<string, unknown> | null;
  const commentsBody = (await safeJson(commentsRes)) as Array<
    Record<string, unknown>
  > | null;
  const issueCommentsBody = (await safeJson(issueCommentsRes)) as Array<
    Record<string, unknown>
  > | null;

  const user = prBody?.user as
    | { login?: string; avatar_url?: string }
    | undefined;
  const review_comments: PrReviewComment[] = Array.isArray(commentsBody)
    ? commentsBody.map((c) => ({
        id: typeof c.id === "number" ? c.id : 0,
        path: typeof c.path === "string" ? c.path : "",
        line:
          typeof c.line === "number"
            ? c.line
            : typeof c.original_line === "number"
              ? c.original_line
              : null,
        side:
          c.side === "LEFT" || c.side === "RIGHT"
            ? (c.side as "LEFT" | "RIGHT")
            : null,
        diff_hunk: typeof c.diff_hunk === "string" ? c.diff_hunk : null,
        body: typeof c.body === "string" ? c.body : "",
        user:
          typeof (c.user as { login?: string } | undefined)?.login === "string"
            ? (c.user as { login: string }).login
            : null,
        user_avatar_url:
          typeof (c.user as { avatar_url?: string } | undefined)?.avatar_url ===
          "string"
            ? (c.user as { avatar_url: string }).avatar_url
            : null,
        created_at:
          typeof c.created_at === "string" ? (c.created_at as string) : null,
      }))
    : [];

  const issue_comments: PrIssueComment[] = Array.isArray(issueCommentsBody)
    ? issueCommentsBody.map((c) => {
        const cu = c.user as
          | { login?: string; avatar_url?: string }
          | undefined;
        return {
          id: typeof c.id === "number" ? c.id : 0,
          body: typeof c.body === "string" ? c.body : "",
          user: typeof cu?.login === "string" ? cu.login : null,
          user_avatar_url:
            typeof cu?.avatar_url === "string" ? cu.avatar_url : null,
          created_at:
            typeof c.created_at === "string" ? (c.created_at as string) : null,
        };
      })
    : [];

  const state: "open" | "closed" =
    prBody?.state === "closed" ? "closed" : "open";
  const merged = Boolean(prBody?.merged);
  const merged_at =
    typeof prBody?.merged_at === "string" ? (prBody.merged_at as string) : null;

  return {
    ok: true,
    body: typeof prBody?.body === "string" ? (prBody.body as string) : null,
    author: typeof user?.login === "string" ? user.login : null,
    author_avatar_url:
      typeof user?.avatar_url === "string" ? user.avatar_url : null,
    state,
    merged,
    merged_at,
    review_comments,
    issue_comments,
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
