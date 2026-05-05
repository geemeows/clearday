import { describe, expect, it, vi } from "vitest";
import {
  handleDismissSignal,
  handleListSignals,
  handleSources,
} from "#/worker/signals-api";

function listClient() {
  const limit = vi.fn(async () => ({ data: [], error: null }));
  const order = vi.fn(() => chain);
  const inFn = vi.fn(() => chain);
  const is = vi.fn(() => chain);
  const ilike = vi.fn(() => chain);
  const or = vi.fn(() => chain);
  const gte = vi.fn(() => chain);
  const chain = { is, in: inFn, ilike, or, gte, order, limit };
  const select = vi.fn(() => chain);
  return {
    spies: { is, in: inFn, ilike, or, gte, order, limit, select },
    client: {
      from: () => ({
        select,
        upsert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    },
  };
}

describe("handleListSignals", () => {
  it("rejects unknown filter values", async () => {
    const { client } = listClient();
    const res = await handleListSignals(
      new URL("https://x/api/signals?filter=foo"),
      client,
    );
    expect(res.status).toBe(400);
  });

  it("translates filter=prs into the three PR kinds", async () => {
    const { client, spies } = listClient();
    const res = await handleListSignals(
      new URL("https://x/api/signals?filter=prs"),
      client,
    );
    expect(res.status).toBe(200);
    expect(spies.in).toHaveBeenCalledWith("kind", [
      "pr_review_requested",
      "pr_authored",
      "pr_assigned",
    ]);
  });

  it("translates filter=tickets into the four ticket kinds", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL("https://x/api/signals?filter=tickets"),
      client,
    );
    expect(spies.in).toHaveBeenCalledWith("kind", [
      "ticket_assigned",
      "ticket_in_progress",
      "ticket_in_review",
      "ticket_blocked",
    ]);
  });

  it("filter=all skips kind filtering", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL("https://x/api/signals?filter=all"),
      client,
    );
    expect(spies.in).not.toHaveBeenCalled();
  });

  it("forwards q= as an ilike filter on title", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL("https://x/api/signals?filter=all&q=focus"),
      client,
    );
    expect(spies.ilike).toHaveBeenCalledWith("title", "%focus%");
  });

  it("forwards since= as a gte filter on source_created_at", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL(
        "https://x/api/signals?filter=all&since=2026-04-27T00%3A00%3A00.000Z",
      ),
      client,
    );
    expect(spies.gte).toHaveBeenCalledWith(
      "source_created_at",
      "2026-04-27T00:00:00.000Z",
    );
  });

  it("ignores a malformed since value", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL("https://x/api/signals?filter=all&since=garbage"),
      client,
    );
    expect(spies.gte).not.toHaveBeenCalled();
  });

  it("skips the dismissed filter when include_dismissed=true", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL("https://x/api/signals?filter=all&include_dismissed=true"),
      client,
    );
    // is("dismissed_at", null) is the gate; absence means dismissed rows
    // are returned alongside live ones.
    expect(
      spies.is.mock.calls.some((call: unknown[]) => call[0] === "dismissed_at"),
    ).toBe(false);
  });

  it("skips the snoozed filter when include_snoozed=true", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL("https://x/api/signals?filter=all&include_snoozed=true"),
      client,
    );
    // The snoozed-future gate is the only `or(...)` call listSignals issues.
    // Absence means snoozed-future rows come back alongside live ones.
    expect(spies.or).not.toHaveBeenCalled();
  });

  it("applies the snoozed filter by default", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL("https://x/api/signals?filter=all"),
      client,
    );
    expect(spies.or).toHaveBeenCalled();
  });

  it("clamps user-supplied limit to 200", async () => {
    const { client, spies } = listClient();
    await handleListSignals(
      new URL("https://x/api/signals?filter=all&limit=9999"),
      client,
    );
    expect(spies.limit).toHaveBeenCalledWith(200);
  });
});

describe("handleDismissSignal", () => {
  it("returns 400 on missing id", async () => {
    const { client } = listClient();
    const res = await handleDismissSignal("", client);
    expect(res.status).toBe(400);
  });

  it("returns ok on successful dismiss", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const client = {
      from: () => ({
        update,
        upsert: async () => ({ error: null }),
        select: () => ({}) as never,
      }),
    };
    const res = await handleDismissSignal("abc", client);
    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalledWith("id", "abc");
  });
});

describe("handleSources", () => {
  it("returns one row per known provider with connected/disconnected", async () => {
    const res = await handleSources(async () => [
      {
        provider: "github",
        account_id: "alice",
        updated_at: "2026-05-01T00:00:00Z",
        status: "ok",
      },
    ]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ provider: string; status: string }>;
    };
    expect(body.sources).toHaveLength(5);
    const map = Object.fromEntries(
      body.sources.map((s) => [s.provider, s.status]),
    );
    expect(map.github).toBe("connected");
    expect(map.google).toBe("disconnected");
    expect(map.slack).toBe("disconnected");
    expect(map.linear).toBe("disconnected");
    expect(map.jira).toBe("disconnected");
  });

  it("surfaces rate_limited from provider_accounts.status", async () => {
    const res = await handleSources(async () => [
      {
        provider: "github",
        account_id: "alice",
        updated_at: "2026-05-01T00:00:00Z",
        status: "rate_limited",
      },
    ]);
    const body = (await res.json()) as {
      sources: Array<{ provider: string; status: string }>;
    };
    const github = body.sources.find((s) => s.provider === "github");
    expect(github?.status).toBe("rate_limited");
  });

  it("surfaces auth_failed from provider_accounts.status", async () => {
    const res = await handleSources(async () => [
      {
        provider: "slack",
        account_id: "U1",
        updated_at: "2026-05-01T00:00:00Z",
        status: "auth_failed",
      },
    ]);
    const body = (await res.json()) as {
      sources: Array<{ provider: string; status: string }>;
    };
    const slack = body.sources.find((s) => s.provider === "slack");
    expect(slack?.status).toBe("auth_failed");
  });

  it("surfaces last_webhook_received_at as last_webhook_at on the source row", async () => {
    const res = await handleSources(async () => [
      {
        provider: "slack",
        account_id: "U1",
        updated_at: "2026-05-01T00:00:00Z",
        status: "ok",
        last_webhook_received_at: "2026-05-01T12:34:56Z",
      },
    ]);
    const body = (await res.json()) as {
      sources: Array<{
        provider: string;
        last_webhook_at: string | null;
      }>;
    };
    const slack = body.sources.find((s) => s.provider === "slack");
    expect(slack?.last_webhook_at).toBe("2026-05-01T12:34:56Z");
  });

  it("surfaces last_polled_at on the source row", async () => {
    const res = await handleSources(async () => [
      {
        provider: "slack",
        account_id: "U1",
        updated_at: "2026-05-01T00:00:00Z",
        status: "ok",
        last_polled_at: "2026-05-01T12:00:00Z",
      },
    ]);
    const body = (await res.json()) as {
      sources: Array<{
        provider: string;
        last_polled_at: string | null;
      }>;
    };
    const slack = body.sources.find((s) => s.provider === "slack");
    expect(slack?.last_polled_at).toBe("2026-05-01T12:00:00Z");
  });

  it("returns last_polled_at as null when the column is absent", async () => {
    const res = await handleSources(async () => [
      {
        provider: "github",
        account_id: "alice",
        updated_at: "2026-05-01T00:00:00Z",
        status: "ok",
      },
    ]);
    const body = (await res.json()) as {
      sources: Array<{
        provider: string;
        last_polled_at: string | null;
      }>;
    };
    for (const s of body.sources) {
      expect(s.last_polled_at).toBeNull();
    }
  });

  it("returns last_webhook_at as null when the column is absent or null", async () => {
    const res = await handleSources(async () => [
      {
        provider: "github",
        account_id: "alice",
        updated_at: "2026-05-01T00:00:00Z",
        status: "ok",
      },
    ]);
    const body = (await res.json()) as {
      sources: Array<{
        provider: string;
        last_webhook_at: string | null;
      }>;
    };
    for (const s of body.sources) {
      expect(s.last_webhook_at).toBeNull();
    }
  });

  it("treats null/unknown status as connected when a row exists", async () => {
    const res = await handleSources(async () => [
      {
        provider: "linear",
        account_id: "u1",
        updated_at: "2026-05-01T00:00:00Z",
        status: null,
      },
    ]);
    const body = (await res.json()) as {
      sources: Array<{ provider: string; status: string }>;
    };
    const linear = body.sources.find((s) => s.provider === "linear");
    expect(linear?.status).toBe("connected");
  });
});
