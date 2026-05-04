import { describe, expect, it, vi } from "vitest";
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

describe("runScheduledPoll", () => {
  it("polls github with the stored access_token and upserts every Signal", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [githubItem] }), { status: 200 }),
    );
    const deps: OrchestratorDeps = {
      loadAccounts: async () => [
        { provider: "github", access_token: "ghu_abc" },
      ],
      store: store.client,
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    // 3 search queries → 1 deduped signal → 1 upsert
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(store.upsert).toHaveBeenCalledTimes(1);
    expect(reports).toEqual([{ provider: "github", upserted: 1 }]);
    // Token was forwarded
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
        { provider: "github", access_token: "ghu_abc" },
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
      loadAccounts: async () => [{ provider: "github", access_token: null }],
      store: store.client,
      fetch: (async () => new Response()) as unknown as typeof fetch,
    };
    const reports = await runScheduledPoll(deps);
    expect(reports[0].error).toBe("no access_token");
    expect(store.upsert).not.toHaveBeenCalled();
  });
});
