import { describe, expect, it, vi } from "vitest";
import {
  type JiraFetch,
  type JiraIssue,
  JiraPollError,
  type JiraResource,
  normalize,
  pollJiraSignals,
} from "#/lib/provider-adapter/jira";

const resource: JiraResource = {
  id: "cloud-1",
  name: "Acme",
  url: "https://acme.atlassian.net",
  scopes: ["read:jira-work"],
};

const baseIssue: JiraIssue = {
  id: "10001",
  key: "ENG-42",
  fields: {
    summary: "Wire Jira adapter",
    created: "2026-05-01T10:00:00.000Z",
    status: {
      name: "To Do",
      statusCategory: { key: "new", name: "To Do" },
    },
    priority: { name: "High" },
    assignee: { accountId: "u1", displayName: "Alice" },
    project: { key: "ENG", name: "Engineering" },
    issuetype: { name: "Task" },
  },
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe("normalize", () => {
  it("derives source_id from the issue key and tags state metadata in payload", () => {
    const sig = normalize(baseIssue, resource);
    expect(sig).not.toBeNull();
    if (!sig) return;
    expect(sig.provider).toBe("jira");
    expect(sig.kind).toBe("ticket_assigned");
    expect(sig.source_id).toBe("ENG-42");
    expect(sig.url).toBe("https://acme.atlassian.net/browse/ENG-42");
    expect(sig.title).toBe("Wire Jira adapter");
    expect(sig.requires_action).toBe(true);
    expect(sig.payload).toMatchObject({
      identifier: "ENG-42",
      project_key: "ENG",
      state_name: "To Do",
      state_category: "new",
      priority: "High",
      assignee: "Alice",
      issue_type: "Task",
      cloud_id: "cloud-1",
      site_name: "Acme",
    });
    expect(sig.source_created_at).toBe("2026-05-01T10:00:00.000Z");
  });

  it("maps statusCategory='indeterminate' to ticket_in_progress with requires_action=false", () => {
    const sig = normalize(
      {
        ...baseIssue,
        fields: {
          ...baseIssue.fields,
          status: {
            name: "In Progress",
            statusCategory: { key: "indeterminate", name: "In Progress" },
          },
        },
      },
      resource,
    );
    expect(sig?.kind).toBe("ticket_in_progress");
    expect(sig?.requires_action).toBe(false);
  });

  it("maps status.name containing 'review' to ticket_in_review even when category is indeterminate", () => {
    const sig = normalize(
      {
        ...baseIssue,
        fields: {
          ...baseIssue.fields,
          status: {
            name: "In Review",
            statusCategory: { key: "indeterminate", name: "In Progress" },
          },
        },
      },
      resource,
    );
    expect(sig?.kind).toBe("ticket_in_review");
    expect(sig?.requires_action).toBe(true);
  });

  it("maps status.name containing 'blocked' to ticket_blocked", () => {
    const sig = normalize(
      {
        ...baseIssue,
        fields: {
          ...baseIssue.fields,
          status: {
            name: "Blocked",
            statusCategory: { key: "new", name: "To Do" },
          },
        },
      },
      resource,
    );
    expect(sig?.kind).toBe("ticket_blocked");
  });

  it("drops issues whose statusCategory is 'done'", () => {
    expect(
      normalize(
        {
          ...baseIssue,
          fields: {
            ...baseIssue.fields,
            status: {
              name: "Done",
              statusCategory: { key: "done", name: "Done" },
            },
          },
        },
        resource,
      ),
    ).toBeNull();
  });

  it("strips a trailing slash from the resource url before composing the browse link", () => {
    const sig = normalize(baseIssue, {
      ...resource,
      url: "https://acme.atlassian.net/",
    });
    expect(sig?.url).toBe("https://acme.atlassian.net/browse/ENG-42");
  });
});

describe("pollJiraSignals", () => {
  it("loads accessible resources then searches each cloud and normalizes issues", async () => {
    const fetchImpl: JiraFetch = vi.fn(async (url, init) => {
      expect(init.headers.authorization).toBe("Bearer atl_oauth_abc");
      if (
        url === "https://api.atlassian.com/oauth/token/accessible-resources"
      ) {
        return okJson([resource]);
      }
      expect(url).toContain("/ex/jira/cloud-1/rest/api/3/search?jql=");
      expect(url).toContain("assignee%20%3D%20currentUser");
      return okJson({
        issues: [
          baseIssue,
          {
            ...baseIssue,
            id: "10002",
            key: "ENG-43",
            fields: {
              ...baseIssue.fields,
              status: {
                name: "In Progress",
                statusCategory: { key: "indeterminate", name: "In Progress" },
              },
            },
          },
          {
            ...baseIssue,
            id: "10003",
            key: "ENG-44",
            fields: {
              ...baseIssue.fields,
              status: {
                name: "Done",
                statusCategory: { key: "done", name: "Done" },
              },
            },
          },
        ],
      });
    });
    const signals = await pollJiraSignals("atl_oauth_abc", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(signals).toHaveLength(2);
    expect(signals.map((s) => s.source_id).sort()).toEqual([
      "ENG-42",
      "ENG-43",
    ]);
  });

  it("loops over multiple accessible resources", async () => {
    const second: JiraResource = {
      id: "cloud-2",
      name: "Other",
      url: "https://other.atlassian.net",
    };
    const fetchImpl: JiraFetch = vi.fn(async (url) => {
      if (url.endsWith("/accessible-resources")) {
        return okJson([resource, second]);
      }
      if (url.includes("/ex/jira/cloud-1/")) {
        return okJson({ issues: [baseIssue] });
      }
      if (url.includes("/ex/jira/cloud-2/")) {
        return okJson({
          issues: [{ ...baseIssue, id: "20001", key: "OPS-7" }],
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const signals = await pollJiraSignals("tok", fetchImpl);
    expect(signals.map((s) => s.source_id).sort()).toEqual(["ENG-42", "OPS-7"]);
    expect(signals.find((s) => s.source_id === "OPS-7")?.url).toBe(
      "https://other.atlassian.net/browse/OPS-7",
    );
  });

  it("throws JiraPollError when accessible-resources is unauthorized", async () => {
    const fetchImpl: JiraFetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "unauthorized",
    });
    await expect(pollJiraSignals("tok", fetchImpl)).rejects.toBeInstanceOf(
      JiraPollError,
    );
  });

  it("throws JiraPollError when a per-cloud search fails", async () => {
    const fetchImpl: JiraFetch = async (url) => {
      if (url.endsWith("/accessible-resources")) {
        return okJson([resource]);
      }
      return {
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "boom",
      };
    };
    await expect(pollJiraSignals("tok", fetchImpl)).rejects.toMatchObject({
      name: "JiraPollError",
      message: expect.stringContaining("500"),
    });
  });
});
