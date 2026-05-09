import { describe, expect, it, vi } from "vitest";
import {
  createCard,
  createColumn,
  createProject,
  deleteCard,
  listCards,
  listColumns,
  listProjects,
  type StoredCard,
  type StoredColumn,
  type StoredProject,
  updateCard,
} from "#/features/projects/store";
import type { SupabaseLike } from "#/shared/db";

function makeClient(overrides: {
  upsertResult?: { error: { message: string } | null };
  listData?: Record<string, unknown>[];
  listError?: { message: string } | null;
  updateResult?: { error: { message: string } | null };
  deleteResult?: { error: { message: string } | null };
} = {}): {
  client: SupabaseLike;
  spies: {
    upsert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateEq: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteEq: ReturnType<typeof vi.fn>;
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
    eq,
    order,
    limit,
  };
  const select = vi.fn(() => chain);
  const upsert = vi.fn(async () => overrides.upsertResult ?? { error: null });
  const updateEq = vi.fn(async () => overrides.updateResult ?? { error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const deleteEq = vi.fn(async () => overrides.deleteResult ?? { error: null });
  const deleteFn = vi.fn(() => ({ eq: deleteEq }));
  const client: SupabaseLike = {
    from: () => ({ upsert, select, update, delete: deleteFn }),
  };
  return {
    client,
    spies: {
      upsert,
      select,
      eq,
      order,
      limit,
      update,
      updateEq,
      delete: deleteFn,
      deleteEq,
    },
  };
}

describe("createProject", () => {
  it("upserts on id with name", async () => {
    const { client, spies } = makeClient();
    await createProject(client, { id: "p1", name: "My Project" });
    expect(spies.upsert).toHaveBeenCalledWith(
      { id: "p1", name: "My Project" },
      { onConflict: "id" },
    );
  });

  it("throws when upsert fails", async () => {
    const { client } = makeClient({ upsertResult: { error: { message: "oops" } } });
    await expect(createProject(client, { id: "p1", name: "X" })).rejects.toThrow("oops");
  });
});

describe("listProjects", () => {
  it("filters non-archived projects and orders by created_at", async () => {
    const row: StoredProject = {
      id: "p1",
      name: "My Project",
      archived: false,
      created_at: "2026-01-01T00:00:00Z",
    };
    const { client, spies } = makeClient({ listData: [row] });
    const result = await listProjects(client);
    expect(spies.eq).toHaveBeenCalledWith("archived", "false");
    expect(spies.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual([row]);
  });

  it("returns empty array when no rows", async () => {
    const { client } = makeClient({ listData: [] });
    expect(await listProjects(client)).toEqual([]);
  });

  it("throws when list fails", async () => {
    const { client } = makeClient({ listError: { message: "db error" } });
    await expect(listProjects(client)).rejects.toThrow("db error");
  });
});

describe("createColumn", () => {
  it("upserts on id with all column fields", async () => {
    const { client, spies } = makeClient();
    await createColumn(client, {
      id: "col1",
      project_id: "p1",
      name: "Backlog",
      order: 0,
    });
    expect(spies.upsert).toHaveBeenCalledWith(
      { id: "col1", project_id: "p1", name: "Backlog", order: 0 },
      { onConflict: "id" },
    );
  });

  it("throws when upsert fails", async () => {
    const { client } = makeClient({ upsertResult: { error: { message: "err" } } });
    await expect(
      createColumn(client, { id: "c1", project_id: "p1", name: "X", order: 0 }),
    ).rejects.toThrow("err");
  });
});

describe("listColumns", () => {
  it("filters by project_id and orders by order asc", async () => {
    const row: StoredColumn = {
      id: "col1",
      project_id: "p1",
      name: "Backlog",
      order: 0,
      wip_limit: null,
    };
    const { client, spies } = makeClient({ listData: [row] });
    const result = await listColumns(client, "p1");
    expect(spies.eq).toHaveBeenCalledWith("project_id", "p1");
    expect(spies.order).toHaveBeenCalledWith("order", { ascending: true });
    expect(result).toEqual([row]);
  });

  it("throws when list fails", async () => {
    const { client } = makeClient({ listError: { message: "fail" } });
    await expect(listColumns(client, "p1")).rejects.toThrow("fail");
  });
});

describe("createCard", () => {
  it("upserts on id with all card fields", async () => {
    const { client, spies } = makeClient();
    await createCard(client, {
      id: "card1",
      project_id: "p1",
      column_id: "col1",
      order: 0,
      title: "My card",
    });
    expect(spies.upsert).toHaveBeenCalledWith(
      {
        id: "card1",
        project_id: "p1",
        column_id: "col1",
        order: 0,
        title: "My card",
      },
      { onConflict: "id" },
    );
  });

  it("throws when upsert fails", async () => {
    const { client } = makeClient({ upsertResult: { error: { message: "bad" } } });
    await expect(
      createCard(client, {
        id: "c1",
        project_id: "p1",
        column_id: "col1",
        order: 0,
        title: "X",
      }),
    ).rejects.toThrow("bad");
  });
});

describe("updateCard", () => {
  it("updates the row by id with the patch fields", async () => {
    const { client, spies } = makeClient();
    await updateCard(client, "card1", {
      title: "Renamed",
      column_id: "col2",
      priority: "p1",
      tags: ["a", "b"],
      due_at: "2026-06-01T00:00:00Z",
      body: "details",
    });
    expect(spies.update).toHaveBeenCalledWith({
      title: "Renamed",
      column_id: "col2",
      priority: "p1",
      tags: ["a", "b"],
      due_at: "2026-06-01T00:00:00Z",
      body: "details",
    });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "card1");
  });

  it("supports clearing fields with null", async () => {
    const { client, spies } = makeClient();
    await updateCard(client, "card1", { priority: null, due_at: null, body: null });
    expect(spies.update).toHaveBeenCalledWith({
      priority: null,
      due_at: null,
      body: null,
    });
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({ updateResult: { error: { message: "nope" } } });
    await expect(updateCard(client, "c1", { title: "x" })).rejects.toThrow("nope");
  });
});

describe("deleteCard", () => {
  it("deletes the row by id", async () => {
    const { client, spies } = makeClient();
    await deleteCard(client, "card1");
    expect(spies.delete).toHaveBeenCalled();
    expect(spies.deleteEq).toHaveBeenCalledWith("id", "card1");
  });

  it("throws when delete fails", async () => {
    const { client } = makeClient({ deleteResult: { error: { message: "boom" } } });
    await expect(deleteCard(client, "c1")).rejects.toThrow("boom");
  });
});

describe("listCards", () => {
  it("filters by project_id and orders by order asc", async () => {
    const row: StoredCard = {
      id: "card1",
      project_id: "p1",
      column_id: "col1",
      order: 0,
      title: "My card",
      body: null,
      priority: null,
      tags: [],
      due_at: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const { client, spies } = makeClient({ listData: [row] });
    const result = await listCards(client, "p1");
    expect(spies.eq).toHaveBeenCalledWith("project_id", "p1");
    expect(spies.order).toHaveBeenCalledWith("order", { ascending: true });
    expect(result).toEqual([row]);
  });

  it("throws when list fails", async () => {
    const { client } = makeClient({ listError: { message: "oops" } });
    await expect(listCards(client, "p1")).rejects.toThrow("oops");
  });
});
