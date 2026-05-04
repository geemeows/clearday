import { describe, expect, it, vi } from "vitest";
import type { Signal, StoredSignal } from "#/lib/signal";
import {
  dismissSignal,
  listSignals,
  type SupabaseLike,
  upsertSignal,
} from "#/lib/signal-store";

function makeClient(overrides: {
  upsertResult?: { error: { message: string } | null };
  listData?: StoredSignal[];
  listError?: { message: string } | null;
  updateResult?: { error: { message: string } | null };
}): {
  client: SupabaseLike;
  spies: {
    upsert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    ilike: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
  };
} {
  const limit = vi.fn(async () => ({
    data: overrides.listData ?? [],
    error: overrides.listError ?? null,
  }));
  const order = vi.fn(() => chain);
  const inFn = vi.fn(() => chain);
  const is = vi.fn(() => chain);
  const ilike = vi.fn(() => chain);
  const or = vi.fn(() => chain);
  const chain = { is, in: inFn, ilike, or, order, limit };
  const select = vi.fn(() => chain);
  const upsert = vi.fn(async () => overrides.upsertResult ?? { error: null });
  const eq = vi.fn(async () => overrides.updateResult ?? { error: null });
  const update = vi.fn(() => ({ eq }));
  const client: SupabaseLike = {
    from: () => ({ upsert, select, update }),
  };
  return {
    client,
    spies: {
      upsert,
      select,
      is,
      in: inFn,
      ilike,
      or,
      order,
      limit,
      update,
      eq,
    },
  };
}

const sample: Signal = {
  provider: "github",
  kind: "pr_review_requested",
  source_id: "owner/repo#42",
  title: "Add cron orchestrator",
  url: "https://github.com/owner/repo/pull/42",
  payload: { author: "alice" },
  requires_action: true,
  source_created_at: "2026-05-01T10:00:00Z",
};

describe("upsertSignal", () => {
  it("upserts on (provider, kind, source_id) with payload + requires_action", async () => {
    const { client, spies } = makeClient({});
    await upsertSignal(client, sample);
    expect(spies.upsert).toHaveBeenCalledTimes(1);
    const [values, opts] = spies.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: "provider,kind,source_id" });
    expect(values).toMatchObject({
      provider: "github",
      kind: "pr_review_requested",
      source_id: "owner/repo#42",
      title: "Add cron orchestrator",
      url: sample.url,
      payload: { author: "alice" },
      requires_action: true,
      source_created_at: "2026-05-01T10:00:00Z",
    });
    expect(typeof values.updated_at).toBe("string");
  });

  it("re-upserts the same identity (idempotent caller-side)", async () => {
    const { client, spies } = makeClient({});
    await upsertSignal(client, sample);
    await upsertSignal(client, { ...sample, title: "renamed" });
    expect(spies.upsert).toHaveBeenCalledTimes(2);
    const second = spies.upsert.mock.calls[1][0];
    expect(second.title).toBe("renamed");
    expect(second.source_id).toBe(sample.source_id);
  });

  it("throws when supabase returns an error", async () => {
    const { client } = makeClient({
      upsertResult: { error: { message: "boom" } },
    });
    await expect(upsertSignal(client, sample)).rejects.toThrow(/boom/);
  });
});

describe("listSignals", () => {
  it("excludes dismissed by default and filters by kind", async () => {
    const { client, spies } = makeClient({ listData: [] });
    await listSignals(client, {
      kinds: ["pr_review_requested", "pr_authored"],
    });
    expect(spies.is).toHaveBeenCalledWith("dismissed_at", null);
    expect(spies.in).toHaveBeenCalledWith("kind", [
      "pr_review_requested",
      "pr_authored",
    ]);
    expect(spies.order).toHaveBeenCalledWith("source_created_at", {
      ascending: false,
    });
  });

  it("includes dismissed when requested", async () => {
    const { client, spies } = makeClient({ listData: [] });
    await listSignals(client, { includeDismissed: true });
    expect(spies.is).not.toHaveBeenCalled();
  });

  it("applies ilike on title when query is provided", async () => {
    const { client, spies } = makeClient({ listData: [] });
    await listSignals(client, { query: "focus" });
    expect(spies.ilike).toHaveBeenCalledWith("title", "%focus%");
  });

  it("escapes LIKE metacharacters in the query", async () => {
    const { client, spies } = makeClient({ listData: [] });
    await listSignals(client, { query: "50%_off" });
    expect(spies.ilike).toHaveBeenCalledWith("title", "%50\\%\\_off%");
  });

  it("skips ilike when query is whitespace-only", async () => {
    const { client, spies } = makeClient({ listData: [] });
    await listSignals(client, { query: "  " });
    expect(spies.ilike).not.toHaveBeenCalled();
  });
});

describe("upsertSignal — inbox rules", () => {
  it("auto_dismiss rule sets dismissed_at on the upsert", async () => {
    const { client, spies } = makeClient({});
    const now = new Date("2026-05-04T12:00:00.000Z");
    await upsertSignal(client, sample, {
      now,
      rules: [
        {
          id: "r-dismiss",
          name: "x",
          enabled: true,
          priority: 1,
          predicates: [{ type: "kind", kind: "pr_review_requested" }],
          effects: [{ type: "auto_dismiss" }],
        },
      ],
    });
    const values = spies.upsert.mock.calls[0][0];
    expect(values.dismissed_at).toBe("2026-05-04T12:00:00.000Z");
  });

  it("snooze rule sets snoozed_until column", async () => {
    const { client, spies } = makeClient({});
    const now = new Date("2026-05-04T12:00:00.000Z");
    await upsertSignal(client, sample, {
      now,
      rules: [
        {
          id: "r-snooze",
          name: "x",
          enabled: true,
          priority: 1,
          predicates: [{ type: "kind", kind: "pr_review_requested" }],
          effects: [{ type: "snooze", minutes: 60 }],
        },
      ],
    });
    const values = spies.upsert.mock.calls[0][0];
    expect(values.snoozed_until).toBe("2026-05-04T13:00:00.000Z");
  });

  it("does not set override columns when no rule matches", async () => {
    const { client, spies } = makeClient({});
    await upsertSignal(client, sample, {
      rules: [
        {
          id: "r-other",
          name: "x",
          enabled: true,
          priority: 1,
          predicates: [{ type: "kind", kind: "mention" }],
          effects: [{ type: "auto_dismiss" }],
        },
      ],
    });
    const values = spies.upsert.mock.calls[0][0];
    expect(values).not.toHaveProperty("dismissed_at");
    expect(values).not.toHaveProperty("snoozed_until");
    expect(values).not.toHaveProperty("tags");
  });
});

describe("listSignals — snoozed filter", () => {
  it("filters out future-snoozed signals by default", async () => {
    const { client, spies } = makeClient({ listData: [] });
    const now = new Date("2026-05-04T12:00:00.000Z");
    await listSignals(client, { now });
    expect(spies.or).toHaveBeenCalledWith(
      "snoozed_until.is.null,snoozed_until.lt.2026-05-04T12:00:00.000Z",
    );
  });

  it("does not call or() when includeSnoozed", async () => {
    const { client, spies } = makeClient({ listData: [] });
    await listSignals(client, { includeSnoozed: true });
    expect(spies.or).not.toHaveBeenCalled();
  });
});

describe("dismissSignal", () => {
  it("sets dismissed_at on the matching id", async () => {
    const { client, spies } = makeClient({});
    await dismissSignal(client, "abc-123");
    expect(spies.update).toHaveBeenCalledTimes(1);
    expect(spies.update.mock.calls[0][0]).toHaveProperty("dismissed_at");
    expect(spies.eq).toHaveBeenCalledWith("id", "abc-123");
  });
});
