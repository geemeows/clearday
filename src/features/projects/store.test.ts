import { describe, expect, it, vi } from "vitest";
import {
  createCard,
  createColumn,
  createProject,
  deleteCard,
  deleteColumn,
  listAllCards,
  listCards,
  listCardsDueOn,
  listColumns,
  listProjects,
  type CardWithProject,
  type DueCard,
  type StoredCard,
  type StoredColumn,
  type StoredProject,
  updateCard,
  updateColumn,
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
    lt: vi.fn(() => chain),
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

describe("updateColumn", () => {
  it("updates the row by id with patch fields", async () => {
    const { client, spies } = makeClient();
    await updateColumn(client, "col1", { name: "Renamed", wip_limit: 5 });
    expect(spies.update).toHaveBeenCalledWith({ name: "Renamed", wip_limit: 5 });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "col1");
  });

  it("supports clearing wip_limit with null", async () => {
    const { client, spies } = makeClient();
    await updateColumn(client, "col1", { wip_limit: null });
    expect(spies.update).toHaveBeenCalledWith({ wip_limit: null });
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({ updateResult: { error: { message: "col err" } } });
    await expect(updateColumn(client, "col1", { name: "x" })).rejects.toThrow("col err");
  });
});

describe("deleteColumn", () => {
  it("deletes the row by id", async () => {
    const { client, spies } = makeClient();
    await deleteColumn(client, "col1");
    expect(spies.delete).toHaveBeenCalled();
    expect(spies.deleteEq).toHaveBeenCalledWith("id", "col1");
  });

  it("throws when delete fails", async () => {
    const { client } = makeClient({ deleteResult: { error: { message: "del err" } } });
    await expect(deleteColumn(client, "col1")).rejects.toThrow("del err");
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

// ── listCardsDueOn ─────────────────────────────────────────────────────────

function makeDueTodayClient({
  projects = [] as StoredProject[],
  cards = [] as StoredCard[],
  cardError = null as { message: string } | null,
} = {}) {
  const makeChain = (limitData: Record<string, unknown>[], limitError: { message: string } | null) => {
    const chain: {
      is: ReturnType<typeof vi.fn>;
      in: ReturnType<typeof vi.fn>;
      ilike: ReturnType<typeof vi.fn>;
      or: ReturnType<typeof vi.fn>;
      gte: ReturnType<typeof vi.fn>;
      lt: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    } = {
      is: vi.fn(() => chain),
      in: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      or: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(async () => ({ data: limitData, error: limitError })),
    };
    return chain;
  };

  const projectChain = makeChain(projects as Record<string, unknown>[], null);
  const cardChain = makeChain(cards as Record<string, unknown>[], cardError);

  const client = {
    from: (table: string) => {
      const chain = table === "projects" ? projectChain : cardChain;
      return {
        upsert: vi.fn(async () => ({ error: null })),
        select: vi.fn(() => chain),
        update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      };
    },
  } as unknown as SupabaseLike;

  return { client, projectChain, cardChain };
}

const baseProject: StoredProject = {
  id: "p1",
  name: "My Project",
  archived: false,
  created_at: "2026-01-01T00:00:00Z",
};

const baseCard = (dueAt: string): StoredCard => ({
  id: "card1",
  project_id: "p1",
  column_id: "col1",
  order: 0,
  title: "My card",
  body: null,
  priority: null,
  tags: [],
  due_at: dueAt,
  created_at: "2026-01-01T00:00:00Z",
});

describe("listCardsDueOn", () => {
  it("returns empty array when no non-archived projects exist", async () => {
    const { client } = makeDueTodayClient({ projects: [] });
    const result = await listCardsDueOn(client, new Date(2026, 4, 9));
    expect(result).toEqual([]);
  });

  it("attaches project_name to each returned card", async () => {
    const card = baseCard("2026-05-09T00:00:00.000Z");
    const { client } = makeDueTodayClient({
      projects: [baseProject],
      cards: [card],
    });
    const result = await listCardsDueOn(client, new Date(2026, 4, 9));
    expect(result).toHaveLength(1);
    expect((result[0] as DueCard).project_name).toBe("My Project");
    expect(result[0].id).toBe("card1");
  });

  it("queries with gte(dayStart) and lt(dayEnd) for the given date", async () => {
    // 2026-05-09 local — bounds are midnight local → midnight local next day
    const date = new Date(2026, 4, 9); // May 9 local
    const { client, cardChain } = makeDueTodayClient({ projects: [baseProject] });
    await listCardsDueOn(client, date);
    const expectedStart = new Date(2026, 4, 9, 0, 0, 0, 0).toISOString();
    const expectedEnd = new Date(2026, 4, 10, 0, 0, 0, 0).toISOString();
    expect(cardChain.gte).toHaveBeenCalledWith("due_at", expectedStart);
    expect(cardChain.lt).toHaveBeenCalledWith("due_at", expectedEnd);
  });

  it("filters by non-archived project IDs", async () => {
    const { client, cardChain } = makeDueTodayClient({ projects: [baseProject] });
    await listCardsDueOn(client, new Date(2026, 4, 9));
    expect(cardChain.in).toHaveBeenCalledWith("project_id", ["p1"]);
  });

  it("throws when card query fails", async () => {
    const { client } = makeDueTodayClient({
      projects: [baseProject],
      cardError: { message: "db error" },
    });
    await expect(listCardsDueOn(client, new Date(2026, 4, 9))).rejects.toThrow("db error");
  });

  it("returns empty array when no cards match the date", async () => {
    const { client } = makeDueTodayClient({ projects: [baseProject], cards: [] });
    const result = await listCardsDueOn(client, new Date(2026, 4, 9));
    expect(result).toEqual([]);
  });
});

// ── listAllCards ──────────────────────────────────────────────────────────────

const baseCardSimple: StoredCard = {
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

describe("listAllCards", () => {
  it("returns empty array when no projects exist", async () => {
    const { client } = makeDueTodayClient({ projects: [] });
    const result = await listAllCards(client);
    expect(result).toEqual([]);
  });

  it("attaches project_name to each returned card", async () => {
    const { client } = makeDueTodayClient({
      projects: [baseProject],
      cards: [baseCardSimple],
    });
    const result = await listAllCards(client);
    expect(result).toHaveLength(1);
    expect((result[0] as CardWithProject).project_name).toBe("My Project");
    expect(result[0].id).toBe("card1");
  });

  it("returns empty array when project has no cards", async () => {
    const { client } = makeDueTodayClient({ projects: [baseProject], cards: [] });
    const result = await listAllCards(client);
    expect(result).toEqual([]);
  });
});
