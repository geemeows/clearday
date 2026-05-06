import { describe, expect, it, vi } from "vitest";
import {
  type LinearFetch,
  type LinearIssueNode,
  LinearPollError,
  normalize,
  pollLinearSignals,
} from "#/features/integrations/providers/linear/poll";

const baseNode: LinearIssueNode = {
  id: "uuid-1",
  identifier: "ENG-42",
  title: "Implement Tasks page",
  url: "https://linear.app/acme/issue/ENG-42/implement-tasks-page",
  priority: 2,
  priorityLabel: "High",
  createdAt: "2026-05-01T10:00:00Z",
  updatedAt: "2026-05-02T11:00:00Z",
  state: { id: "s1", name: "Todo", type: "unstarted" },
  team: { id: "t1", key: "ENG", name: "Engineering" },
  assignee: { id: "u1", name: "Alice" },
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe("normalize", () => {
  it("derives source_id from the issue identifier and tags state metadata in payload", () => {
    const sig = normalize(baseNode);
    expect(sig).not.toBeNull();
    if (!sig) return;
    expect(sig.provider).toBe("linear");
    expect(sig.kind).toBe("ticket_assigned");
    expect(sig.source_id).toBe("ENG-42");
    expect(sig.url).toBe(baseNode.url);
    expect(sig.title).toBe("Implement Tasks page");
    expect(sig.requires_action).toBe(true);
    expect(sig.payload).toMatchObject({
      identifier: "ENG-42",
      team_key: "ENG",
      state_name: "Todo",
      state_type: "unstarted",
      priority: 2,
      priority_label: "High",
      assignee: "Alice",
    });
    expect(sig.source_created_at).toBe(baseNode.createdAt);
  });

  it("maps state.type='started' to ticket_in_progress with requires_action=false", () => {
    const sig = normalize({
      ...baseNode,
      state: { id: "s2", name: "In Progress", type: "started" },
    });
    expect(sig?.kind).toBe("ticket_in_progress");
    expect(sig?.requires_action).toBe(false);
  });

  it("maps state.name containing 'review' to ticket_in_review even when type is started", () => {
    const sig = normalize({
      ...baseNode,
      state: { id: "s3", name: "In Review", type: "started" },
    });
    expect(sig?.kind).toBe("ticket_in_review");
    expect(sig?.requires_action).toBe(true);
  });

  it("maps state.name containing 'blocked' to ticket_blocked", () => {
    const sig = normalize({
      ...baseNode,
      state: { id: "s4", name: "Blocked", type: "unstarted" },
    });
    expect(sig?.kind).toBe("ticket_blocked");
  });

  it("drops completed and canceled tickets", () => {
    expect(
      normalize({
        ...baseNode,
        state: { id: "s5", name: "Done", type: "completed" },
      }),
    ).toBeNull();
    expect(
      normalize({
        ...baseNode,
        state: { id: "s6", name: "Canceled", type: "canceled" },
      }),
    ).toBeNull();
  });
});

describe("pollLinearSignals", () => {
  it("posts the GraphQL query with bearer auth and normalizes the nodes", async () => {
    const fetchImpl: LinearFetch = vi.fn(async (url, init) => {
      expect(url).toBe("https://api.linear.app/graphql");
      expect(init.method).toBe("POST");
      expect(init.headers.authorization).toBe("Bearer lin_oauth_abc");
      expect(init.headers["content-type"]).toBe("application/json");
      const body = JSON.parse(init.body) as { query: string };
      expect(body.query).toContain("assignedIssues");
      return okJson({
        data: {
          viewer: {
            id: "viewer-1",
            assignedIssues: {
              nodes: [
                baseNode,
                {
                  ...baseNode,
                  id: "uuid-2",
                  identifier: "ENG-43",
                  state: { id: "s2", name: "In Progress", type: "started" },
                },
                {
                  ...baseNode,
                  id: "uuid-3",
                  identifier: "ENG-44",
                  state: { id: "s5", name: "Done", type: "completed" },
                },
              ],
            },
          },
        },
      });
    });
    const signals = await pollLinearSignals("lin_oauth_abc", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(signals).toHaveLength(2);
    const ids = signals.map((s) => s.source_id).sort();
    expect(ids).toEqual(["ENG-42", "ENG-43"]);
  });

  it("throws LinearPollError on non-2xx", async () => {
    const fetchImpl: LinearFetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "unauthorized",
    });
    await expect(pollLinearSignals("tok", fetchImpl)).rejects.toBeInstanceOf(
      LinearPollError,
    );
  });

  it("throws LinearPollError when the response body has GraphQL errors", async () => {
    const fetchImpl: LinearFetch = async () =>
      okJson({ errors: [{ message: "not authenticated" }] });
    await expect(pollLinearSignals("tok", fetchImpl)).rejects.toMatchObject({
      name: "LinearPollError",
      message: expect.stringContaining("not authenticated"),
    });
  });
});
