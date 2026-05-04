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
  const chain = { is, in: inFn, ilike, order, limit };
  const select = vi.fn(() => chain);
  return {
    spies: { is, in: inFn, ilike, order, limit, select },
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
      },
    ]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ provider: string; status: string }>;
    };
    expect(body.sources).toHaveLength(3);
    const map = Object.fromEntries(
      body.sources.map((s) => [s.provider, s.status]),
    );
    expect(map.github).toBe("connected");
    expect(map.google).toBe("disconnected");
    expect(map.slack).toBe("disconnected");
  });
});
