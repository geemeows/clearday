import { describe, expect, it, vi } from "vitest";
import {
  createLevel,
  getActiveLevel,
  listLevels,
  type StoredLevel,
} from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

function makeClient(overrides: {
  upsertResult?: { error: { message: string } | null };
  listData?: Record<string, unknown>[];
  listError?: { message: string } | null;
} = {}): {
  client: SupabaseLike;
  spies: {
    upsert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
} {
  const limit = vi.fn(async () => ({
    data: overrides.listData ?? [],
    error: overrides.listError ?? null,
  }));
  const order = vi.fn(() => chain);
  const eq = vi.fn(() => chain);
  const chain = {
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    eq,
    order,
    limit,
  };
  const select = vi.fn(() => chain);
  const upsert = vi.fn(async () => overrides.upsertResult ?? { error: null });
  const client: SupabaseLike = {
    from: () => ({
      upsert,
      select,
      update: vi.fn(() => ({ eq: vi.fn() })),
      delete: vi.fn(() => ({ eq: vi.fn() })),
    }),
  };
  return { client, spies: { upsert, select, eq, order, limit } };
}

function level(overrides: Partial<StoredLevel> = {}): StoredLevel {
  return {
    id: "lvl1",
    title: "L4",
    status: "active",
    header: [],
    sheet_id: null,
    last_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("createLevel", () => {
  it("upserts on id with title and status='active'", async () => {
    const { client, spies } = makeClient();
    await createLevel(client, { id: "lvl1", title: "L4" });
    expect(spies.upsert).toHaveBeenCalledWith(
      { id: "lvl1", title: "L4", status: "active" },
      { onConflict: "id" },
    );
  });

  it("throws when upsert fails", async () => {
    const { client } = makeClient({
      upsertResult: { error: { message: "boom" } },
    });
    await expect(
      createLevel(client, { id: "lvl1", title: "L4" }),
    ).rejects.toThrow("boom");
  });
});

describe("listLevels", () => {
  it("orders by created_at descending", async () => {
    const row = level();
    const { client, spies } = makeClient({ listData: [row] });
    const result = await listLevels(client);
    expect(spies.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([row]);
  });

  it("returns empty array when no rows", async () => {
    const { client } = makeClient({ listData: [] });
    expect(await listLevels(client)).toEqual([]);
  });

  it("throws when list fails", async () => {
    const { client } = makeClient({ listError: { message: "db error" } });
    await expect(listLevels(client)).rejects.toThrow("db error");
  });
});

describe("getActiveLevel", () => {
  it("filters by status='active' and returns the first row", async () => {
    const row = level();
    const { client, spies } = makeClient({ listData: [row] });
    const result = await getActiveLevel(client);
    expect(spies.eq).toHaveBeenCalledWith("status", "active");
    expect(result).toEqual(row);
  });

  it("returns null when no active level exists", async () => {
    const { client } = makeClient({ listData: [] });
    expect(await getActiveLevel(client)).toBeNull();
  });

  it("throws when query fails", async () => {
    const { client } = makeClient({ listError: { message: "fail" } });
    await expect(getActiveLevel(client)).rejects.toThrow("fail");
  });
});
