import { describe, expect, it, vi } from "vitest";
import {
  createCompetency,
  createLevel,
  getActiveLevel,
  listCompetencies,
  listLevels,
  renameCompetency,
  softDeleteCompetency,
  type StoredCompetency,
  type StoredLevel,
} from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

function makeClient(overrides: {
  upsertResult?: { error: { message: string } | null };
  listData?: Record<string, unknown>[];
  listError?: { message: string } | null;
  updateResult?: { error: { message: string } | null };
} = {}): {
  client: SupabaseLike;
  spies: {
    upsert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateEq: ReturnType<typeof vi.fn>;
  };
} {
  const limit = vi.fn(async () => ({
    data: overrides.listData ?? [],
    error: overrides.listError ?? null,
  }));
  const order = vi.fn(() => chain);
  const eq = vi.fn(() => chain);
  const is = vi.fn(() => chain);
  const chain = {
    is,
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
  const updateEq = vi.fn(
    async () => overrides.updateResult ?? { error: null },
  );
  const update = vi.fn(() => ({ eq: updateEq }));
  const client: SupabaseLike = {
    from: () => ({
      upsert,
      select,
      update,
      delete: vi.fn(() => ({ eq: vi.fn() })),
    }),
  };
  return {
    client,
    spies: { upsert, select, eq, is, order, limit, update, updateEq },
  };
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

function competency(
  overrides: Partial<StoredCompetency> = {},
): StoredCompetency {
  return {
    id: "c1",
    level_id: "lvl1",
    name: "Engineering Excellence",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("createCompetency", () => {
  it("upserts on id with level_id, name, and position", async () => {
    const { client, spies } = makeClient();
    await createCompetency(client, {
      id: "c1",
      level_id: "lvl1",
      name: "Engineering Excellence",
      position: 0,
    });
    expect(spies.upsert).toHaveBeenCalledWith(
      {
        id: "c1",
        level_id: "lvl1",
        name: "Engineering Excellence",
        position: 0,
      },
      { onConflict: "id" },
    );
  });

  it("throws when upsert fails", async () => {
    const { client } = makeClient({
      upsertResult: { error: { message: "boom" } },
    });
    await expect(
      createCompetency(client, {
        id: "c1",
        level_id: "lvl1",
        name: "x",
        position: 0,
      }),
    ).rejects.toThrow("boom");
  });
});

describe("listCompetencies", () => {
  it("filters by level_id, excludes soft-deleted, orders by position asc", async () => {
    const row = competency();
    const { client, spies } = makeClient({ listData: [row] });
    const result = await listCompetencies(client, "lvl1");
    expect(spies.eq).toHaveBeenCalledWith("level_id", "lvl1");
    expect(spies.is).toHaveBeenCalledWith("deleted_at", null);
    expect(spies.order).toHaveBeenCalledWith("position", { ascending: true });
    expect(result).toEqual([row]);
  });

  it("returns empty array when no rows", async () => {
    const { client } = makeClient({ listData: [] });
    expect(await listCompetencies(client, "lvl1")).toEqual([]);
  });

  it("throws when list fails", async () => {
    const { client } = makeClient({ listError: { message: "db error" } });
    await expect(listCompetencies(client, "lvl1")).rejects.toThrow("db error");
  });
});

describe("renameCompetency", () => {
  it("updates the name on the matching id", async () => {
    const { client, spies } = makeClient();
    await renameCompetency(client, "c1", "Craft");
    expect(spies.update).toHaveBeenCalledWith({ name: "Craft" });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "c1");
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "rename boom" } },
    });
    await expect(renameCompetency(client, "c1", "x")).rejects.toThrow(
      "rename boom",
    );
  });
});

describe("softDeleteCompetency", () => {
  it("stamps deleted_at on the matching id", async () => {
    const { client, spies } = makeClient();
    await softDeleteCompetency(client, "c1");
    expect(spies.update).toHaveBeenCalledTimes(1);
    const arg = spies.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg.deleted_at).toBe("string");
    expect(spies.updateEq).toHaveBeenCalledWith("id", "c1");
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "delete boom" } },
    });
    await expect(softDeleteCompetency(client, "c1")).rejects.toThrow(
      "delete boom",
    );
  });
});
