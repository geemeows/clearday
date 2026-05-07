// PR review action: submit an Approve / Request changes / Comment review
// against a GitHub pull request via the GitHub Reviews API. Pure module
// with injected fetch + token; no Supabase, no SDKs. Worker glue loads
// the GitHub access token from provider_accounts and calls this.
//
// GitHub Reviews API requires `body` for REQUEST_CHANGES and COMMENT
// events; APPROVE allows it to be omitted.

export type PrReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export type PrReviewDraftComment = {
  path: string;
  line: number;
  side?: "LEFT" | "RIGHT";
  /** When set, the comment spans the range [start_line .. line]. GitHub
   * requires start_side too — we default it to side. */
  start_line?: number;
  start_side?: "LEFT" | "RIGHT";
  body: string;
};

export type SubmitPrReviewParams = {
  repo: string; // "owner/repo"
  number: number;
  event: PrReviewEvent;
  body?: string;
  comments?: PrReviewDraftComment[];
};

export type GithubFetch = typeof fetch;

export type SubmitPrReviewDeps = {
  token: string | null;
  fetch: GithubFetch;
};

export type SubmitPrReviewResult =
  | { ok: true; review_id: number }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "missing_body" | "invalid_repo" | "api_error";
      needs_reauth?: boolean;
    };

const VALID_EVENTS: PrReviewEvent[] = ["APPROVE", "REQUEST_CHANGES", "COMMENT"];

export async function submitPrReview(
  params: SubmitPrReviewParams,
  deps: SubmitPrReviewDeps,
): Promise<SubmitPrReviewResult> {
  if (!VALID_EVENTS.includes(params.event)) {
    return {
      ok: false,
      error: `unknown event: ${params.event}`,
      reason: "api_error",
    };
  }
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
  const drafts = (params.comments ?? []).filter(
    (c) => typeof c.body === "string" && c.body.trim().length > 0,
  );
  if (params.event !== "APPROVE" && body.length === 0 && drafts.length === 0) {
    return {
      ok: false,
      error: "body or inline comments required for request changes / comment",
      reason: "missing_body",
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
  const url = `https://api.github.com/repos/${repo}/pulls/${params.number}/reviews`;
  const payload: Record<string, unknown> = { event: params.event };
  if (body.length > 0) payload.body = body;
  if (drafts.length > 0) {
    payload.comments = drafts.map((c) => {
      const side = c.side ?? "RIGHT";
      const out: Record<string, unknown> = {
        path: c.path,
        line: c.line,
        side,
        body: c.body.trim(),
      };
      if (
        typeof c.start_line === "number" &&
        c.start_line > 0 &&
        c.start_line < c.line
      ) {
        out.start_line = c.start_line;
        out.start_side = c.start_side ?? side;
      }
      return out;
    });
  }
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
    // 401/403 (or a body that mentions "scope") signals an auth/scope
    // problem — the SPA can prompt the user to reauthorize with the
    // wider `repo` scope through the auth-proxy.
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
  return { ok: true, review_id: respBody?.id ?? 0 };
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
