// Jira (Atlassian) provider adapter. Polls the v3 REST API for issues
// assigned to the authenticated user across every accessible Atlassian site
// (cloudId) and normalizes them into ticket Signals. Pure on a fetch fn so it
// runs unchanged on the Worker and under jsdom in fixture-driven tests.

import type { Signal, SignalKind } from "#/shared/signal";

export type JiraFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

const ACCESSIBLE_RESOURCES_URL =
  "https://api.atlassian.com/oauth/token/accessible-resources";

const JQL = "assignee = currentUser() AND statusCategory != Done";

// Fields requested per issue. Keep narrow so payload stays cheap.
const FIELDS = [
  "summary",
  "status",
  "priority",
  "assignee",
  "project",
  "issuetype",
  "created",
].join(",");

export type JiraResource = {
  id: string;
  name?: string;
  url: string;
  scopes?: string[];
  avatarUrl?: string;
};

export type JiraIssue = {
  id: string;
  key: string;
  fields: {
    summary?: string;
    created?: string;
    status?: {
      name?: string;
      statusCategory?: { key?: string; name?: string };
    };
    priority?: { name?: string } | null;
    assignee?: { accountId?: string; displayName?: string } | null;
    project?: { key?: string; name?: string } | null;
    issuetype?: { name?: string } | null;
  };
};

export type JiraSearchResponse = {
  issues?: JiraIssue[];
};

export async function pollJiraSignals(
  accessToken: string,
  fetchImpl: JiraFetch,
): Promise<Signal[]> {
  const resources = await loadAccessibleResources(accessToken, fetchImpl);
  const out: Signal[] = [];
  for (const resource of resources) {
    const issues = await searchAssignedIssues(
      resource.id,
      accessToken,
      fetchImpl,
    );
    for (const issue of issues) {
      const sig = normalize(issue, resource);
      if (sig) out.push(sig);
    }
  }
  return out;
}

async function loadAccessibleResources(
  accessToken: string,
  fetchImpl: JiraFetch,
): Promise<JiraResource[]> {
  const res = await fetchImpl(ACCESSIBLE_RESOURCES_URL, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new JiraPollError(res.status, await safeText(res));
  }
  const body = (await res.json()) as
    | JiraResource[]
    | { values?: JiraResource[] };
  if (Array.isArray(body)) return body;
  return body.values ?? [];
}

async function searchAssignedIssues(
  cloudId: string,
  accessToken: string,
  fetchImpl: JiraFetch,
): Promise<JiraIssue[]> {
  const url =
    `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}` +
    `/rest/api/3/search?jql=${encodeURIComponent(JQL)}` +
    `&fields=${encodeURIComponent(FIELDS)}&maxResults=100`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new JiraPollError(res.status, await safeText(res));
  }
  const body = (await res.json()) as JiraSearchResponse;
  return body.issues ?? [];
}

export function normalize(
  issue: JiraIssue,
  resource: JiraResource,
): Signal | null {
  const kind = mapKind(issue.fields?.status);
  if (!kind) return null;
  const siteUrl = resource.url.replace(/\/$/, "");
  return {
    provider: "jira",
    kind,
    source_id: issue.key,
    title: issue.fields?.summary ?? issue.key,
    url: `${siteUrl}/browse/${issue.key}`,
    payload: {
      identifier: issue.key,
      project_key: issue.fields?.project?.key ?? null,
      state_name: issue.fields?.status?.name ?? null,
      state_category: issue.fields?.status?.statusCategory?.key ?? null,
      priority: issue.fields?.priority?.name ?? null,
      priority_label: issue.fields?.priority?.name ?? null,
      assignee: issue.fields?.assignee?.displayName ?? null,
      issue_type: issue.fields?.issuetype?.name ?? null,
      cloud_id: resource.id,
      site_name: resource.name ?? null,
    },
    requires_action: kind !== "ticket_in_progress",
    source_created_at: issue.fields?.created ?? null,
  };
}

function mapKind(
  status: JiraIssue["fields"]["status"] | undefined,
): SignalKind | null {
  const name = (status?.name ?? "").toLowerCase();
  const category = status?.statusCategory?.key ?? "";
  // Jira's statusCategory.key values: new | indeterminate | done. We surface
  // only non-done states. The four task-board kinds disambiguate via the
  // status name (matching Linear's adapter rules).
  if (category === "done") return null;
  if (name.includes("review")) return "ticket_in_review";
  if (name.includes("blocked")) return "ticket_blocked";
  if (category === "indeterminate") return "ticket_in_progress";
  return "ticket_assigned";
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export class JiraPollError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`jira poll failed (${status}): ${body.slice(0, 200)}`);
    this.name = "JiraPollError";
  }
}
