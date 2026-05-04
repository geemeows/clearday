import { describe, expect, it, vi } from "vitest";
import type { ExchangeEnv } from "#/lib/oauth-exchange";
import {
  type OrchestratorDeps,
  runScheduledPoll,
} from "#/worker/cron-orchestrator";

function makeStore(
  upsertResult: { error: { message: string } | null } = { error: null },
) {
  const upsert = vi.fn(async () => upsertResult);
  return {
    upsert,
    client: {
      from: () => ({
        upsert,
        // unused in this test
        select: () => ({}) as never,
        update: () => ({}) as never,
      }),
    },
  };
}

const githubItem = {
  id: 1,
  number: 7,
  title: "Wire cron",
  html_url: "https://github.com/owner/repo/pull/7",
  state: "open",
  draft: false,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-02T11:00:00Z",
  repository_url: "https://api.github.com/repos/owner/repo",
  user: { login: "alice" },
  assignees: [],
  requested_reviewers: [{ login: "me" }],
};

const oauthEnv: ExchangeEnv = {
  GITHUB_CLIENT_ID: "gh-id",
  GITHUB_CLIENT_SECRET: "gh-secret",
  GOOGLE_CLIENT_ID: "go-id",
  GOOGLE_CLIENT_SECRET: "go-secret",
  SLACK_CLIENT_ID: "sl-id",
  SLACK_CLIENT_SECRET: "sl-secret",
  AUTH_PROXY_URL: "https://auth.example.com",
};

const calendarEvent = {
  id: "evt-1",
  summary: "Standup",
  hangoutLink: "https://meet.google.com/abc-defg-hij",
  htmlLink: "https://calendar.google.com/event?eid=evt-1",
  start: { dateTime: "2026-05-04T15:00:00.000Z" },
  end: { dateTime: "2026-05-04T15:15:00.000Z" },
  attendees: [{ self: true, responseStatus: "accepted" }],
};

describe("runScheduledPoll", () => {
  it("polls github with the stored access_token and upserts every Signal", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [githubItem] }), { status: 200 }),
    );
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "github",
          access_token: "ghu_abc",
          refresh_token: null,
          expires_at: null,
        },
      ],
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(store.upsert).toHaveBeenCalledTimes(1);
    expect(reports).toEqual([{ provider: "github", upserted: 1 }]);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(firstCall[1].headers.authorization).toBe("Bearer ghu_abc");
  });

  it("captures per-provider errors without throwing the whole batch", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(
      async () => new Response("rate-limited", { status: 403 }),
    );
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "github",
          access_token: "ghu_abc",
          refresh_token: null,
          expires_at: null,
        },
      ],
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(reports[0].provider).toBe("github");
    expect(reports[0].upserted).toBe(0);
    expect(reports[0].error).toMatch(/github poll failed/);
  });

  it("flags accounts with no access_token", async () => {
    const store = makeStore();
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "github",
          access_token: null,
          refresh_token: null,
          expires_at: null,
        },
      ],
      store: store.client,
      fetch: (async () => new Response()) as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(reports[0].error).toBe("no access_token");
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("polls google calendar with a non-expired token without refreshing", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/calendar/v3/")) {
        return new Response(JSON.stringify({ items: [calendarEvent] }), {
          status: 200,
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "google",
          access_token: "ya29.fresh",
          refresh_token: "1//rt",
          expires_at: "2026-05-04T13:00:00.000Z",
        },
      ],
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
      oauthEnv,
      now: () => new Date("2026-05-04T12:00:00.000Z"),
    };
    const reports = await runScheduledPoll(deps);
    expect(reports).toEqual([{ provider: "google", upserted: 1 }]);
    expect(store.upsert).toHaveBeenCalledTimes(1);
    // Only the calendar list call — no refresh.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("polls linear with the stored access_token and upserts ticket Signals", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.linear.app/graphql");
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              id: "viewer-1",
              assignedIssues: {
                nodes: [
                  {
                    id: "uuid-1",
                    identifier: "ENG-42",
                    title: "Wire orchestrator for linear",
                    url: "https://linear.app/acme/issue/ENG-42/x",
                    priority: 2,
                    priorityLabel: "High",
                    createdAt: "2026-05-01T10:00:00Z",
                    updatedAt: "2026-05-01T10:00:00Z",
                    state: { id: "s1", name: "Todo", type: "unstarted" },
                    team: { id: "t1", key: "ENG", name: "Engineering" },
                    assignee: { id: "u1", name: "Alice" },
                  },
                ],
              },
            },
          },
        }),
        { status: 200 },
      );
    });
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "linear",
          access_token: "lin_oauth_abc",
          refresh_token: null,
          expires_at: null,
        },
      ],
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(reports).toEqual([{ provider: "linear", upserted: 1 }]);
    expect(store.upsert).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(call[1].headers.authorization).toBe("Bearer lin_oauth_abc");
  });

  it("polls jira accessible-resources then per-cloud search and upserts ticket Signals", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async (url: string) => {
      if (
        url === "https://api.atlassian.com/oauth/token/accessible-resources"
      ) {
        return new Response(
          JSON.stringify([
            {
              id: "cloud-1",
              name: "Acme",
              url: "https://acme.atlassian.net",
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("/ex/jira/cloud-1/")) {
        return new Response(
          JSON.stringify({
            issues: [
              {
                id: "10001",
                key: "ENG-42",
                fields: {
                  summary: "Wire orchestrator for jira",
                  created: "2026-05-01T10:00:00Z",
                  status: {
                    name: "To Do",
                    statusCategory: { key: "new" },
                  },
                  priority: { name: "High" },
                  assignee: { displayName: "Alice" },
                  project: { key: "ENG" },
                  issuetype: { name: "Task" },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "jira",
          access_token: "atl_oauth_abc",
          refresh_token: null,
          expires_at: null,
        },
      ],
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(reports).toEqual([{ provider: "jira", upserted: 1 }]);
    expect(store.upsert).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(firstCall[1].headers.authorization).toBe("Bearer atl_oauth_abc");
  });

  it("refreshes an expired google token, persists it, and then polls", async () => {
    const store = makeStore();
    const saveRefreshedToken = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({
            access_token: "ya29.refreshed",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar.readonly",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/calendar/v3/")) {
        return new Response(JSON.stringify({ items: [calendarEvent] }), {
          status: 200,
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "google",
          access_token: "ya29.stale",
          refresh_token: "1//rt",
          expires_at: "2026-05-04T11:30:00.000Z",
        },
      ],
      saveRefreshedToken,
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
      oauthEnv,
      now: () => new Date("2026-05-04T12:00:00.000Z"),
    };
    const reports = await runScheduledPoll(deps);
    expect(reports).toEqual([{ provider: "google", upserted: 1 }]);
    expect(saveRefreshedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        access_token: "ya29.refreshed",
      }),
    );
    const calendarCall = fetchImpl.mock.calls.find((c) =>
      String(c[0]).includes("/calendar/v3/"),
    ) as unknown as [string, { headers: Record<string, string> }] | undefined;
    expect(calendarCall?.[1].headers.authorization).toBe(
      "Bearer ya29.refreshed",
    );
  });
});
