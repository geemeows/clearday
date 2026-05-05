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

  it("stamps provider_accounts.status='ok' on a successful poll", async () => {
    const store = makeStore();
    const saveProviderStatus = vi.fn(async () => {});
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
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
      saveProviderStatus,
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(saveProviderStatus).toHaveBeenCalledWith("github", "ok");
    expect(reports[0].status).toBe("ok");
  });

  it("stamps status='auth_failed' on 401/403", async () => {
    const store = makeStore();
    const saveProviderStatus = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "github",
          access_token: "ghu_abc",
          refresh_token: null,
          expires_at: null,
        },
      ],
      saveProviderStatus,
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(saveProviderStatus).toHaveBeenCalledWith("github", "auth_failed");
    expect(reports[0].status).toBe("auth_failed");
    expect(reports[0].error).toMatch(/github poll failed/);
  });

  it("stamps status='rate_limited' on 429", async () => {
    const store = makeStore();
    const saveProviderStatus = vi.fn(async () => {});
    const fetchImpl = vi.fn(
      async () => new Response("slow down", { status: 429 }),
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
      saveProviderStatus,
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(saveProviderStatus).toHaveBeenCalledWith("github", "rate_limited");
    expect(reports[0].status).toBe("rate_limited");
  });

  it("leaves status alone for unclassified errors (no_token, network)", async () => {
    const store = makeStore();
    const saveProviderStatus = vi.fn(async () => {});
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "github",
          access_token: null,
          refresh_token: null,
          expires_at: null,
        },
      ],
      saveProviderStatus,
      store: store.client,
      fetch: (async () => new Response()) as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(saveProviderStatus).not.toHaveBeenCalled();
    expect(reports[0].status).toBeUndefined();
    expect(reports[0].error).toBe("no access_token");
  });

  it("swallows saveProviderStatus errors so they never mask the poll outcome", async () => {
    const store = makeStore();
    const saveProviderStatus = vi.fn(async () => {
      throw new Error("db down");
    });
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
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
      saveProviderStatus,
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(reports[0].provider).toBe("github");
    expect(reports[0].error).toBeUndefined();
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

  it("refreshes an expired linear token (rotating refresh_token) and polls with the new access_token", async () => {
    const store = makeStore();
    const saveRefreshedToken = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://api.linear.app/oauth/token") {
        return new Response(
          JSON.stringify({
            access_token: "lin_refreshed",
            refresh_token: "lin_rt_2",
            expires_in: 3600,
            scope: "read,write",
          }),
          { status: 200 },
        );
      }
      if (url === "https://api.linear.app/graphql") {
        return new Response(
          JSON.stringify({
            data: {
              viewer: { id: "v1", assignedIssues: { nodes: [] } },
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "linear",
          access_token: "lin_stale",
          refresh_token: "lin_rt",
          expires_at: "2026-05-04T11:30:00.000Z",
        },
      ],
      saveRefreshedToken,
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
      oauthEnv: {
        ...oauthEnv,
        LINEAR_CLIENT_ID: "lin-id",
        LINEAR_CLIENT_SECRET: "lin-secret",
      },
      now: () => new Date("2026-05-04T12:00:00.000Z"),
    };
    const reports = await runScheduledPoll(deps);
    expect(reports).toEqual([{ provider: "linear", upserted: 0 }]);
    expect(saveRefreshedToken).toHaveBeenCalledWith({
      provider: "linear",
      access_token: "lin_refreshed",
      refresh_token: "lin_rt_2",
      expires_at: expect.any(String),
    });
    const graphqlCall = fetchImpl.mock.calls.find(
      (c) => String(c[0]) === "https://api.linear.app/graphql",
    ) as unknown as [string, { headers: Record<string, string> }] | undefined;
    expect(graphqlCall?.[1].headers.authorization).toBe("Bearer lin_refreshed");
  });

  it("refreshes an expired jira token and polls with the new access_token", async () => {
    const store = makeStore();
    const saveRefreshedToken = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://auth.atlassian.com/oauth/token") {
        return new Response(
          JSON.stringify({
            access_token: "atl_refreshed",
            refresh_token: "atl_rt_2",
            expires_in: 3600,
            scope: "read:jira-work offline_access",
          }),
          { status: 200 },
        );
      }
      if (
        url === "https://api.atlassian.com/oauth/token/accessible-resources"
      ) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        {
          provider: "jira",
          access_token: "atl_stale",
          refresh_token: "atl_rt",
          expires_at: "2026-05-04T11:30:00.000Z",
        },
      ],
      saveRefreshedToken,
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
      oauthEnv: {
        ...oauthEnv,
        JIRA_CLIENT_ID: "atl-id",
        JIRA_CLIENT_SECRET: "atl-secret",
      },
      now: () => new Date("2026-05-04T12:00:00.000Z"),
    };
    const reports = await runScheduledPoll(deps);
    expect(reports).toEqual([{ provider: "jira", upserted: 0 }]);
    expect(saveRefreshedToken).toHaveBeenCalledWith({
      provider: "jira",
      access_token: "atl_refreshed",
      refresh_token: "atl_rt_2",
      expires_at: expect.any(String),
    });
    const resourcesCall = fetchImpl.mock.calls.find(
      (c) =>
        String(c[0]) ===
        "https://api.atlassian.com/oauth/token/accessible-resources",
    ) as unknown as [string, { headers: Record<string, string> }] | undefined;
    expect(resourcesCall?.[1].headers.authorization).toBe(
      "Bearer atl_refreshed",
    );
  });

  it("does not pass refresh_token to saveRefreshedToken when google does not rotate it", async () => {
    const store = makeStore();
    const saveRefreshedToken = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({ access_token: "ya29.refreshed", expires_in: 3600 }),
          { status: 200 },
        );
      }
      if (url.includes("/calendar/v3/")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
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
    await runScheduledPoll(deps);
    const update = (
      saveRefreshedToken.mock.calls as unknown as Array<
        [Record<string, unknown>]
      >
    )[0][0];
    expect(update.refresh_token).toBeUndefined();
  });
});
