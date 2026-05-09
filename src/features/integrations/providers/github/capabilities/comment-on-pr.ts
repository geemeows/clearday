// PR comment action: post a top-level Issue comment on a GitHub pull request
// via `POST /repos/:owner/:repo/issues/:number/comments`. PR comments and
// Issue comments share the same endpoint on GitHub. Pure module with injected
// fetch + token; mirrors `submit-pr-review.ts`.

export type CommentOnPrParams = {
  repo: string; // "owner/repo"
  number: number;
  body: string;
};

export type GithubFetch = typeof fetch;

export type CommentOnPrDeps = {
  token: string | null;
  fetch: GithubFetch;
};

export type CommentOnPrResult =
  | { ok: true; comment_id: number }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "missing_body" | "invalid_repo" | "api_error";
      needs_reauth?: boolean;
    };

export async function commentOnPr(
  params: CommentOnPrParams,
  deps: CommentOnPrDeps,
): Promise<CommentOnPrResult> {
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
  const body = (params.body ?? "").trim();
  if (body.length === 0) {
    return { ok: false, error: "body required", reason: "missing_body" };
  }
  if (!deps.token) {
    return {
      ok: false,
      error: "github not connected",
      reason: "no_token",
      needs_reauth: true,
    };
  }
  const url = `https://api.github.com/repos/${repo}/issues/${params.number}/comments`;
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
      body: JSON.stringify({ body }),
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
  const respBody = (await safeJson(res)) as { id?: number } | null;
  return { ok: true, comment_id: respBody?.id ?? 0 };
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
