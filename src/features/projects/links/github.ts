// GitHub PR/issue link resolver. Pure module: parse a URL or shorthand into
// a normalised key and fetch read-only metadata via the user's GitHub token.
// Read-only by design — there are no write-side endpoints here. Moving a
// linked card across columns must never touch the upstream PR/issue.

export type GithubLinkKey = {
  owner: string;
  repo: string;
  number: number;
};

// Accepts:
//   https://github.com/owner/repo/pull/123
//   https://github.com/owner/repo/issues/123
//   git@github.com:owner/repo (with optional /pull/N or #N suffix not supported here)
//   git+ssh://git@github.com/owner/repo/pull/123
//   owner/repo#123
export function parseGithubLink(input: string): GithubLinkKey | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Shorthand: owner/repo#N
  const shorthand = raw.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)#(\d+)$/);
  if (shorthand) {
    return {
      owner: shorthand[1],
      repo: shorthand[2],
      number: Number(shorthand[3]),
    };
  }

  // git@github.com:owner/repo(.git)?/(pull|issues)/N
  const ssh = raw.match(
    /^git(?:\+ssh)?(?:@|:\/\/git@)github\.com[:/]([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/(?:pull|issues)\/(\d+)\/?$/,
  );
  if (ssh) {
    return { owner: ssh[1], repo: ssh[2], number: Number(ssh[3]) };
  }

  // https URL
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return null;
  }
  const m = url.pathname.match(
    /^\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(?:pull|issues)\/(\d+)\/?$/,
  );
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

export function formatGithubKey(key: GithubLinkKey): string {
  return `${key.owner}/${key.repo}#${key.number}`;
}

export function githubKeyUrl(key: GithubLinkKey): string {
  // We don't know whether the upstream is a PR or an issue from the key
  // alone, but GitHub auto-redirects /issues/N → /pull/N (and vice-versa)
  // when the type is wrong, so we link via /issues which is the union.
  return `https://github.com/${key.owner}/${key.repo}/issues/${key.number}`;
}

export type GithubTicketMeta = {
  status: string;
  assignee: string | null;
  updatedAt: string | null;
};

export type GithubFetch = typeof fetch;

export type FetchGithubTicketDeps = {
  token: string | null;
  fetch: GithubFetch;
};

export type FetchGithubTicketResult =
  | { ok: true; meta: GithubTicketMeta }
  | {
      ok: false;
      reason: "no_token" | "invalid_repo" | "api_error";
      error: string;
      needs_reauth?: boolean;
    };

export async function fetchGithubTicketMeta(
  key: GithubLinkKey,
  deps: FetchGithubTicketDeps,
): Promise<FetchGithubTicketResult> {
  if (
    !key ||
    !key.owner ||
    !key.repo ||
    !Number.isInteger(key.number) ||
    key.number <= 0
  ) {
    return { ok: false, reason: "invalid_repo", error: "invalid key" };
  }
  if (!deps.token) {
    return {
      ok: false,
      reason: "no_token",
      error: "github not connected",
      needs_reauth: true,
    };
  }
  // /issues/N covers both pulls and issues — GitHub's issues endpoint returns
  // a row for either, with `pull_request` set when it's a PR. We use only
  // read-only GETs; nothing here writes to GitHub.
  const url = `https://api.github.com/repos/${key.owner}/${key.repo}/issues/${key.number}`;
  const headers = {
    authorization: `Bearer ${deps.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "clearday-worker",
  };
  let res: Awaited<ReturnType<GithubFetch>>;
  try {
    res = await deps.fetch(url, { method: "GET", headers });
  } catch (err) {
    return {
      ok: false,
      reason: "api_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (!res.ok) {
    let text = "";
    try {
      text = await res.text();
    } catch {}
    const needsReauth =
      res.status === 401 ||
      res.status === 403 ||
      /scope/i.test(text) ||
      /bad credentials/i.test(text);
    return {
      ok: false,
      reason: "api_error",
      error: `github HTTP ${res.status}: ${text.slice(0, 200)}`,
      needs_reauth: needsReauth,
    };
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "api_error", error: "invalid response body" };
  }
  const state = typeof body?.state === "string" ? (body.state as string) : "";
  const isPr = body?.pull_request != null;
  const stateReason =
    typeof body?.state_reason === "string"
      ? (body.state_reason as string)
      : null;
  const merged = (body?.pull_request as { merged_at?: string } | undefined)
    ?.merged_at;
  const status = isPr
    ? merged
      ? "merged"
      : state === "closed"
        ? "closed"
        : "open"
    : state === "closed"
      ? stateReason === "completed"
        ? "closed"
        : "closed"
      : "open";
  const assigneeObj = body?.assignee as { login?: string } | undefined;
  const assignee =
    typeof assigneeObj?.login === "string" ? assigneeObj.login : null;
  const updatedAt =
    typeof body?.updated_at === "string" ? (body.updated_at as string) : null;
  return { ok: true, meta: { status, assignee, updatedAt } };
}
