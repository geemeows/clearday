// GitHub provider adapter. v1 polls three search-API queries that cover the
// only PRs we care about: where the user is a requested reviewer, the
// author, or an assignee. The adapter is pure (parametric on a fetch
// function) so it can be driven from the cron orchestrator on the Worker
// and from fixture-driven tests under jsdom.

import type { Signal, SignalKind } from "#/shared/signal";

export type GithubFetch = (
  input: string,
  init: { headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

const SEARCH = "https://api.github.com/search/issues";

export type GithubSearchItem = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft?: boolean;
  created_at: string;
  updated_at: string;
  repository_url: string;
  user: { login: string } | null;
  assignees?: Array<{ login: string }> | null;
  requested_reviewers?: Array<{ login: string }> | null;
};

export type GithubSearchResponse = {
  total_count: number;
  items: GithubSearchItem[];
};

const QUERIES: Array<{ q: string; kind: SignalKind; requiresAction: boolean }> =
  [
    {
      q: "is:open is:pr review-requested:@me archived:false",
      kind: "pr_review_requested",
      requiresAction: true,
    },
    {
      q: "is:open is:pr author:@me archived:false",
      kind: "pr_authored",
      requiresAction: false,
    },
    {
      q: "is:open is:pr assignee:@me archived:false",
      kind: "pr_assigned",
      requiresAction: true,
    },
  ];

export async function pollGithubSignals(
  accessToken: string,
  fetchImpl: GithubFetch,
): Promise<Signal[]> {
  const out: Signal[] = [];
  const seen = new Set<string>();
  for (const query of QUERIES) {
    const items = await runQuery(accessToken, query.q, fetchImpl);
    for (const item of items) {
      const sig = normalize(item, query.kind, query.requiresAction);
      // The same PR can match multiple queries (author+assignee). Keep the
      // first kind seen for that source_id so we don't write duplicates;
      // identity uniqueness is ultimately enforced by the DB constraint.
      if (seen.has(sig.source_id)) continue;
      seen.add(sig.source_id);
      out.push(sig);
    }
  }
  return out;
}

async function runQuery(
  accessToken: string,
  q: string,
  fetchImpl: GithubFetch,
): Promise<GithubSearchItem[]> {
  const url = `${SEARCH}?per_page=50&q=${encodeURIComponent(q)}`;
  const res = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "clearday-worker",
    },
  });
  if (!res.ok) {
    throw new GithubPollError(res.status, await safeText(res));
  }
  const body = (await res.json()) as GithubSearchResponse;
  return body.items ?? [];
}

export function normalize(
  item: GithubSearchItem,
  kind: SignalKind,
  requiresAction: boolean,
): Signal {
  const repo = repoFromUrl(item.repository_url);
  return {
    provider: "github",
    kind,
    source_id: `${repo}#${item.number}`,
    title: item.title,
    url: item.html_url,
    payload: {
      repo,
      number: item.number,
      author: item.user?.login ?? null,
      draft: item.draft ?? false,
      assignees: (item.assignees ?? []).map((a) => a.login),
      requested_reviewers: (item.requested_reviewers ?? []).map((r) => r.login),
    },
    requires_action: requiresAction && !item.draft,
    source_created_at: item.created_at,
  };
}

function repoFromUrl(repositoryUrl: string): string {
  // repositoryUrl shape: https://api.github.com/repos/<owner>/<repo>
  const m = repositoryUrl.match(/repos\/([^/]+\/[^/]+)$/);
  return m ? m[1] : repositoryUrl;
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export class GithubPollError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`github poll failed (${status}): ${body.slice(0, 200)}`);
    this.name = "GithubPollError";
  }
}
