// Linear provider adapter. Polls the GraphQL API for issues assigned to the
// authenticated user (`viewer.assignedIssues`) and normalizes them into ticket
// Signals. Pure on a fetch fn so it can be driven from the cron orchestrator
// on the Worker and from fixture-driven tests under jsdom.

import type { Signal, SignalKind } from "#/lib/signal";

export type LinearFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

const ENDPOINT = "https://api.linear.app/graphql";

const ASSIGNED_QUERY = `
query ClearDayAssignedIssues {
  viewer {
    id
    assignedIssues(first: 100, filter: {
      state: { type: { in: ["triage", "backlog", "unstarted", "started"] } }
    }) {
      nodes {
        id
        identifier
        title
        url
        priority
        priorityLabel
        createdAt
        updatedAt
        state { id name type }
        team { id key name }
        assignee { id name }
      }
    }
  }
}`;

export type LinearIssueNode = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  priorityLabel: string;
  createdAt: string;
  updatedAt: string;
  state: { id: string; name: string; type: string };
  team: { id: string; key: string; name: string };
  assignee: { id: string; name: string } | null;
};

export type LinearAssignedResponse = {
  data?: {
    viewer?: {
      id?: string;
      assignedIssues?: { nodes?: LinearIssueNode[] };
    };
  };
  errors?: Array<{ message: string }>;
};

export async function pollLinearSignals(
  accessToken: string,
  fetchImpl: LinearFetch,
): Promise<Signal[]> {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ query: ASSIGNED_QUERY }),
  });
  if (!res.ok) {
    throw new LinearPollError(res.status, await safeText(res));
  }
  const body = (await res.json()) as LinearAssignedResponse;
  if (body.errors && body.errors.length > 0) {
    throw new LinearPollError(
      res.status,
      body.errors.map((e) => e.message).join("; "),
    );
  }
  const nodes = body.data?.viewer?.assignedIssues?.nodes ?? [];
  const out: Signal[] = [];
  for (const node of nodes) {
    const sig = normalize(node);
    if (sig) out.push(sig);
  }
  return out;
}

export function normalize(node: LinearIssueNode): Signal | null {
  const kind = mapKind(node.state);
  if (!kind) return null;
  return {
    provider: "linear",
    kind,
    source_id: node.identifier,
    title: node.title,
    url: node.url,
    payload: {
      identifier: node.identifier,
      team_key: node.team?.key ?? null,
      state_name: node.state?.name ?? null,
      state_type: node.state?.type ?? null,
      priority: node.priority,
      priority_label: node.priorityLabel,
      assignee: node.assignee?.name ?? null,
    },
    requires_action: kind !== "ticket_in_progress",
    source_created_at: node.createdAt,
  };
}

function mapKind(state: LinearIssueNode["state"]): SignalKind | null {
  const name = (state?.name ?? "").toLowerCase();
  const type = state?.type ?? "";
  // Linear's state.type values: triage | backlog | unstarted | started |
  // completed | canceled. We surface only the four task-board states.
  if (type === "completed" || type === "canceled") return null;
  if (name.includes("review")) return "ticket_in_review";
  if (name.includes("blocked")) return "ticket_blocked";
  if (type === "started") return "ticket_in_progress";
  return "ticket_assigned";
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export class LinearPollError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`linear poll failed (${status}): ${body.slice(0, 200)}`);
    this.name = "LinearPollError";
  }
}
