import { describe, expect, it, vi } from "vitest";
import {
  cloneArchivedLevelAsActive,
  createCompetency,
  createCriterion,
  createEvidence,
  createIndicator,
  createLevel,
  getActiveLevel,
  getLevelTree,
  getScaleLegend,
  listCompetencies,
  listCriteria,
  listEvidence,
  listIndicators,
  listLevels,
  renameCompetency,
  renameCriterion,
  renameIndicator,
  searchProjectCards,
  setCriterionTarget,
  seedSampleTemplate,
  setIndicatorScore,
  setLevelHeader,
  setScaleLegend,
  softDeleteCompetency,
  softDeleteCriterion,
  softDeleteEvidence,
  softDeleteIndicator,
  type StoredCompetency,
  type StoredCriterion,
  type StoredEvidence,
  type StoredIndicator,
  type StoredLevel,
  updateEvidence,
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

function criterion(
  overrides: Partial<StoredCriterion> = {},
): StoredCriterion {
  return {
    id: "cr1",
    competency_id: "c1",
    name: "Code review depth",
    target: 1,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("createCriterion", () => {
  it("upserts on id with competency_id, name, target, position", async () => {
    const { client, spies } = makeClient();
    await createCriterion(client, {
      id: "cr1",
      competency_id: "c1",
      name: "Code review depth",
      target: 1,
      position: 0,
    });
    expect(spies.upsert).toHaveBeenCalledWith(
      {
        id: "cr1",
        competency_id: "c1",
        name: "Code review depth",
        target: 1,
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
      createCriterion(client, {
        id: "cr1",
        competency_id: "c1",
        name: "x",
        target: 1,
        position: 0,
      }),
    ).rejects.toThrow("boom");
  });
});

describe("listCriteria", () => {
  it("filters by competency_id, excludes soft-deleted, orders by position asc", async () => {
    const row = criterion();
    const { client, spies } = makeClient({ listData: [row] });
    const result = await listCriteria(client, "c1");
    expect(spies.eq).toHaveBeenCalledWith("competency_id", "c1");
    expect(spies.is).toHaveBeenCalledWith("deleted_at", null);
    expect(spies.order).toHaveBeenCalledWith("position", { ascending: true });
    expect(result).toEqual([row]);
  });

  it("returns empty array when no rows", async () => {
    const { client } = makeClient({ listData: [] });
    expect(await listCriteria(client, "c1")).toEqual([]);
  });

  it("throws when list fails", async () => {
    const { client } = makeClient({ listError: { message: "db error" } });
    await expect(listCriteria(client, "c1")).rejects.toThrow("db error");
  });
});

describe("renameCriterion", () => {
  it("updates the name on the matching id", async () => {
    const { client, spies } = makeClient();
    await renameCriterion(client, "cr1", "Review depth");
    expect(spies.update).toHaveBeenCalledWith({ name: "Review depth" });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "cr1");
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "rename boom" } },
    });
    await expect(renameCriterion(client, "cr1", "x")).rejects.toThrow(
      "rename boom",
    );
  });
});

describe("setCriterionTarget", () => {
  it("updates target on the matching id", async () => {
    const { client, spies } = makeClient();
    await setCriterionTarget(client, "cr1", 3);
    expect(spies.update).toHaveBeenCalledWith({ target: 3 });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "cr1");
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "target boom" } },
    });
    await expect(setCriterionTarget(client, "cr1", 2)).rejects.toThrow(
      "target boom",
    );
  });
});

describe("softDeleteCriterion", () => {
  it("stamps deleted_at on the matching id", async () => {
    const { client, spies } = makeClient();
    await softDeleteCriterion(client, "cr1");
    expect(spies.update).toHaveBeenCalledTimes(1);
    const arg = spies.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg.deleted_at).toBe("string");
    expect(spies.updateEq).toHaveBeenCalledWith("id", "cr1");
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "delete boom" } },
    });
    await expect(softDeleteCriterion(client, "cr1")).rejects.toThrow(
      "delete boom",
    );
  });
});

function indicator(
  overrides: Partial<StoredIndicator> = {},
): StoredIndicator {
  return {
    id: "i1",
    criterion_id: "cr1",
    code: "A",
    description: "Reviews PRs with substantive feedback",
    notes: null,
    score: 1,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("createIndicator", () => {
  it("upserts on id with criterion_id, fields, score=1, and position", async () => {
    const { client, spies } = makeClient();
    await createIndicator(client, {
      id: "i1",
      criterion_id: "cr1",
      code: "A",
      description: "Reviews PRs",
      notes: null,
      position: 0,
    });
    expect(spies.upsert).toHaveBeenCalledWith(
      {
        id: "i1",
        criterion_id: "cr1",
        code: "A",
        description: "Reviews PRs",
        notes: null,
        score: 1,
        position: 0,
      },
      { onConflict: "id" },
    );
  });

  it("defaults code and notes to null when omitted", async () => {
    const { client, spies } = makeClient();
    await createIndicator(client, {
      id: "i1",
      criterion_id: "cr1",
      description: "x",
      position: 0,
    });
    const arg = spies.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.code).toBeNull();
    expect(arg.notes).toBeNull();
    expect(arg.score).toBe(1);
  });

  it("throws when upsert fails", async () => {
    const { client } = makeClient({
      upsertResult: { error: { message: "boom" } },
    });
    await expect(
      createIndicator(client, {
        id: "i1",
        criterion_id: "cr1",
        description: "x",
        position: 0,
      }),
    ).rejects.toThrow("boom");
  });
});

describe("listIndicators", () => {
  it("filters by criterion_id, excludes soft-deleted, orders by position asc", async () => {
    const row = indicator();
    const { client, spies } = makeClient({ listData: [row] });
    const result = await listIndicators(client, "cr1");
    expect(spies.eq).toHaveBeenCalledWith("criterion_id", "cr1");
    expect(spies.is).toHaveBeenCalledWith("deleted_at", null);
    expect(spies.order).toHaveBeenCalledWith("position", { ascending: true });
    expect(result).toEqual([row]);
  });

  it("returns empty array when no rows", async () => {
    const { client } = makeClient({ listData: [] });
    expect(await listIndicators(client, "cr1")).toEqual([]);
  });

  it("throws when list fails", async () => {
    const { client } = makeClient({ listError: { message: "db error" } });
    await expect(listIndicators(client, "cr1")).rejects.toThrow("db error");
  });
});

describe("renameIndicator", () => {
  it("updates only the supplied fields", async () => {
    const { client, spies } = makeClient();
    await renameIndicator(client, "i1", { description: "Reviews PRs" });
    expect(spies.update).toHaveBeenCalledWith({
      description: "Reviews PRs",
    });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "i1");
  });

  it("supports updating code and notes", async () => {
    const { client, spies } = makeClient();
    await renameIndicator(client, "i1", { code: "B", notes: "see doc" });
    expect(spies.update).toHaveBeenCalledWith({ code: "B", notes: "see doc" });
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "rename boom" } },
    });
    await expect(
      renameIndicator(client, "i1", { description: "x" }),
    ).rejects.toThrow("rename boom");
  });
});

describe("setIndicatorScore", () => {
  it("updates score on the matching id", async () => {
    const { client, spies } = makeClient();
    await setIndicatorScore(client, "i1", 3);
    expect(spies.update).toHaveBeenCalledWith({ score: 3 });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "i1");
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "score boom" } },
    });
    await expect(setIndicatorScore(client, "i1", 2)).rejects.toThrow(
      "score boom",
    );
  });
});

describe("softDeleteIndicator", () => {
  it("stamps deleted_at on the matching id", async () => {
    const { client, spies } = makeClient();
    await softDeleteIndicator(client, "i1");
    expect(spies.update).toHaveBeenCalledTimes(1);
    const arg = spies.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg.deleted_at).toBe("string");
    expect(spies.updateEq).toHaveBeenCalledWith("id", "i1");
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "delete boom" } },
    });
    await expect(softDeleteIndicator(client, "i1")).rejects.toThrow(
      "delete boom",
    );
  });
});

function evidence(
  overrides: Partial<StoredEvidence> = {},
): StoredEvidence {
  return {
    id: "e1",
    indicator_id: "i1",
    title: "Q4 launch postmortem",
    url: null,
    note: null,
    card_id: null,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("createEvidence", () => {
  it("upserts on id with indicator_id, title, and position; nulls optional fields by default", async () => {
    const { client, spies } = makeClient();
    await createEvidence(client, {
      id: "e1",
      indicator_id: "i1",
      title: "Q4 launch postmortem",
      position: 0,
    });
    expect(spies.upsert).toHaveBeenCalledWith(
      {
        id: "e1",
        indicator_id: "i1",
        title: "Q4 launch postmortem",
        url: null,
        note: null,
        card_id: null,
        position: 0,
      },
      { onConflict: "id" },
    );
  });

  it("passes through url, note, and card_id when supplied", async () => {
    const { client, spies } = makeClient();
    await createEvidence(client, {
      id: "e1",
      indicator_id: "i1",
      title: "Postmortem",
      url: "https://example.com",
      note: "see appendix",
      card_id: "card-1",
      position: 1024,
    });
    const arg = spies.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.url).toBe("https://example.com");
    expect(arg.note).toBe("see appendix");
    expect(arg.card_id).toBe("card-1");
    expect(arg.position).toBe(1024);
  });

  it("throws when upsert fails", async () => {
    const { client } = makeClient({
      upsertResult: { error: { message: "boom" } },
    });
    await expect(
      createEvidence(client, {
        id: "e1",
        indicator_id: "i1",
        title: "x",
        position: 0,
      }),
    ).rejects.toThrow("boom");
  });
});

describe("listEvidence", () => {
  it("filters by indicator_id, excludes soft-deleted, orders by position asc", async () => {
    const row = evidence();
    const { client, spies } = makeClient({ listData: [row] });
    const result = await listEvidence(client, "i1");
    expect(spies.eq).toHaveBeenCalledWith("indicator_id", "i1");
    expect(spies.is).toHaveBeenCalledWith("deleted_at", null);
    expect(spies.order).toHaveBeenCalledWith("position", { ascending: true });
    expect(result).toEqual([row]);
  });

  it("returns empty array when no rows", async () => {
    const { client } = makeClient({ listData: [] });
    expect(await listEvidence(client, "i1")).toEqual([]);
  });

  it("throws when list fails", async () => {
    const { client } = makeClient({ listError: { message: "db error" } });
    await expect(listEvidence(client, "i1")).rejects.toThrow("db error");
  });
});

describe("updateEvidence", () => {
  it("updates only the supplied fields", async () => {
    const { client, spies } = makeClient();
    await updateEvidence(client, "e1", { title: "New title" });
    expect(spies.update).toHaveBeenCalledWith({ title: "New title" });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "e1");
  });

  it("supports linking and unlinking a card via card_id", async () => {
    const { client, spies } = makeClient();
    await updateEvidence(client, "e1", { card_id: "card-1" });
    expect(spies.update).toHaveBeenLastCalledWith({ card_id: "card-1" });
    await updateEvidence(client, "e1", { card_id: null });
    expect(spies.update).toHaveBeenLastCalledWith({ card_id: null });
  });

  it("supports clearing url and note to null", async () => {
    const { client, spies } = makeClient();
    await updateEvidence(client, "e1", { url: null, note: null });
    expect(spies.update).toHaveBeenCalledWith({ url: null, note: null });
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "update boom" } },
    });
    await expect(
      updateEvidence(client, "e1", { title: "x" }),
    ).rejects.toThrow("update boom");
  });
});

describe("softDeleteEvidence", () => {
  it("stamps deleted_at on the matching id", async () => {
    const { client, spies } = makeClient();
    await softDeleteEvidence(client, "e1");
    expect(spies.update).toHaveBeenCalledTimes(1);
    const arg = spies.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg.deleted_at).toBe("string");
    expect(spies.updateEq).toHaveBeenCalledWith("id", "e1");
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "delete boom" } },
    });
    await expect(softDeleteEvidence(client, "e1")).rejects.toThrow(
      "delete boom",
    );
  });
});

describe("searchProjectCards", () => {
  it("returns empty array for an empty query without hitting the DB", async () => {
    const { client, spies } = makeClient();
    const result = await searchProjectCards(client, "   ");
    expect(result).toEqual([]);
    expect(spies.select).not.toHaveBeenCalled();
  });

  it("ilikes title with %query% and limits results", async () => {
    const { client, spies } = makeClient({
      listData: [{ id: "card-1", title: "Postmortem" }],
    });
    const result = await searchProjectCards(client, "post");
    expect(spies.select).toHaveBeenCalledWith("id,title");
    const ilikeSpy = spies.select.mock.results[0]?.value.ilike;
    expect(ilikeSpy).toHaveBeenCalledWith("title", "%post%");
    expect(result).toEqual([{ id: "card-1", title: "Postmortem" }]);
  });

  it("throws when search fails", async () => {
    const { client } = makeClient({ listError: { message: "search boom" } });
    await expect(searchProjectCards(client, "x")).rejects.toThrow(
      "search boom",
    );
  });
});

describe("setLevelHeader", () => {
  it("writes the header jsonb array to the matching level id, preserving order", async () => {
    const { client, spies } = makeClient();
    const header = [
      { key: "role", value: "Staff" },
      { key: "employer", value: "Acme" },
    ];
    await setLevelHeader(client, "lvl1", header);
    expect(spies.update).toHaveBeenCalledWith({ header });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "lvl1");
    // Order preserved (array identity check on the call arg).
    const args = spies.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.header).toEqual(header);
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "header boom" } },
    });
    await expect(setLevelHeader(client, "lvl1", [])).rejects.toThrow(
      "header boom",
    );
  });
});

describe("getScaleLegend", () => {
  it("filters by id=1 and selects the four labels", async () => {
    const row = {
      label_1: "Beginner",
      label_2: "Working",
      label_3: "Advanced",
      label_4: "Expert",
    };
    const { client, spies } = makeClient({ listData: [row] });
    const result = await getScaleLegend(client);
    expect(spies.select).toHaveBeenCalledWith("label_1,label_2,label_3,label_4");
    expect(spies.eq).toHaveBeenCalledWith("id", "1");
    expect(result).toEqual(row);
  });

  it("returns empty-string defaults when no row is present", async () => {
    const { client } = makeClient({ listData: [] });
    expect(await getScaleLegend(client)).toEqual({
      label_1: "",
      label_2: "",
      label_3: "",
      label_4: "",
    });
  });

  it("throws when query fails", async () => {
    const { client } = makeClient({ listError: { message: "legend boom" } });
    await expect(getScaleLegend(client)).rejects.toThrow("legend boom");
  });
});

describe("getLevelTree", () => {
  function makeTreeClient(rowsByTable: {
    career_competencies: StoredCompetency[];
    career_criteria: StoredCriterion[];
    career_indicators: StoredIndicator[];
  }) {
    const inSpies: Array<{ table: string; col: string; vals: string[] }> = [];
    const client: SupabaseLike = {
      from: (table: string) => {
        let currentTable = table;
        const chain = {
          is: () => chain,
          in: (col: string, vals: string[]) => {
            inSpies.push({ table: currentTable, col, vals });
            return chain;
          },
          ilike: () => chain,
          or: () => chain,
          gte: () => chain,
          lt: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: async () => ({
            data:
              currentTable === "career_competencies"
                ? rowsByTable.career_competencies
                : currentTable === "career_criteria"
                  ? rowsByTable.career_criteria
                  : rowsByTable.career_indicators,
            error: null,
          }),
        };
        return {
          upsert: vi.fn(async () => ({ error: null })),
          select: vi.fn(() => {
            currentTable = table;
            return chain;
          }),
          update: vi.fn(() => ({ eq: vi.fn() })),
          delete: vi.fn(() => ({ eq: vi.fn() })),
        };
      },
    };
    return { client, inSpies };
  }

  it("loads competencies, then criteria scoped to comp ids, then indicators scoped to crit ids", async () => {
    const competencies: StoredCompetency[] = [
      {
        id: "c1",
        level_id: "lvl1",
        name: "Eng",
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ];
    const criteria: StoredCriterion[] = [
      {
        id: "cr1",
        competency_id: "c1",
        name: "Quality",
        target: 3,
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ];
    const indicators: StoredIndicator[] = [
      {
        id: "i1",
        criterion_id: "cr1",
        code: null,
        description: "writes tests",
        notes: null,
        score: 2,
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ];
    const { client, inSpies } = makeTreeClient({
      career_competencies: competencies,
      career_criteria: criteria,
      career_indicators: indicators,
    });

    const result = await getLevelTree(client, "lvl1");

    expect(result.competencies).toEqual(competencies);
    expect(result.criteria).toEqual(criteria);
    expect(result.indicators).toEqual(indicators);
    expect(inSpies).toEqual([
      { table: "career_criteria", col: "competency_id", vals: ["c1"] },
      { table: "career_indicators", col: "criterion_id", vals: ["cr1"] },
    ]);
  });

  it("short-circuits criteria + indicators when there are no competencies", async () => {
    const { client, inSpies } = makeTreeClient({
      career_competencies: [],
      career_criteria: [],
      career_indicators: [],
    });
    const result = await getLevelTree(client, "lvl1");
    expect(result).toEqual({
      competencies: [],
      criteria: [],
      indicators: [],
    });
    expect(inSpies).toEqual([]);
  });
});

describe("seedSampleTemplate", () => {
  it("writes one level, then competencies, criteria, and indicators", async () => {
    const upsertCalls: Array<{ table: string; values: Record<string, unknown> }> =
      [];
    const client: SupabaseLike = {
      from: (table: string) => ({
        upsert: async (
          values: Record<string, unknown> | Record<string, unknown>[],
        ) => {
          const v = (Array.isArray(values) ? values[0] : values) as Record<
            string,
            unknown
          >;
          upsertCalls.push({ table, values: v });
          return { error: null as null };
        },
        select: vi.fn() as never,
        update: vi.fn() as never,
        delete: vi.fn() as never,
      }),
    };
    await seedSampleTemplate(client, {
      title: "Sample",
      competencies: [
        {
          name: "C1",
          criteria: [
            {
              name: "Cr1",
              target: 3,
              indicators: [{ code: "A", description: "Ind1" }],
            },
          ],
        },
        {
          name: "C2",
          criteria: [],
        },
      ],
    });
    const tables = upsertCalls.map((c) => c.table);
    expect(tables).toEqual([
      "career_levels",
      "career_competencies",
      "career_criteria",
      "career_indicators",
      "career_competencies",
    ]);
    const levelCall = upsertCalls[0];
    expect(levelCall?.values).toMatchObject({ title: "Sample", status: "active" });
    const compCall = upsertCalls[1];
    expect(compCall?.values).toMatchObject({
      name: "C1",
      level_id: levelCall?.values.id,
      position: 0,
    });
    const critCall = upsertCalls[2];
    expect(critCall?.values).toMatchObject({
      name: "Cr1",
      target: 3,
      competency_id: compCall?.values.id,
      position: 0,
    });
    const indCall = upsertCalls[3];
    expect(indCall?.values).toMatchObject({
      code: "A",
      description: "Ind1",
      criterion_id: critCall?.values.id,
      score: 1,
      position: 0,
    });
    const comp2Call = upsertCalls[4];
    expect(comp2Call?.values).toMatchObject({
      name: "C2",
      position: 1024,
    });
  });

  it("uses the bundled SAMPLE_TEMPLATE by default", async () => {
    const upsertCalls: Array<{ table: string; values: Record<string, unknown> }> =
      [];
    const client: SupabaseLike = {
      from: (table: string) => ({
        upsert: async (
          values: Record<string, unknown> | Record<string, unknown>[],
        ) => {
          const v = (Array.isArray(values) ? values[0] : values) as Record<
            string,
            unknown
          >;
          upsertCalls.push({ table, values: v });
          return { error: null as null };
        },
        select: vi.fn() as never,
        update: vi.fn() as never,
        delete: vi.fn() as never,
      }),
    };
    await seedSampleTemplate(client);
    expect(upsertCalls[0]?.values).toMatchObject({ title: "Sample" });
    const compCount = upsertCalls.filter(
      (c) => c.table === "career_competencies",
    ).length;
    const indCount = upsertCalls.filter(
      (c) => c.table === "career_indicators",
    ).length;
    expect(compCount).toBe(2);
    expect(indCount).toBe(6);
  });

  it("throws when an inner write fails", async () => {
    let calls = 0;
    const client: SupabaseLike = {
      from: (_table: string) => ({
        upsert: async () => {
          calls += 1;
          if (calls === 2)
            return { error: { message: "boom" } as { message: string } };
          return { error: null as null };
        },
        select: vi.fn() as never,
        update: vi.fn() as never,
        delete: vi.fn() as never,
      }),
    };
    await expect(seedSampleTemplate(client)).rejects.toThrow("boom");
  });
});

describe("cloneArchivedLevelAsActive", () => {
  function makeCloneClient(opts: {
    activeLevels?: StoredLevel[];
    sourceLevel?: StoredLevel | null;
    competencies?: StoredCompetency[];
    criteria?: StoredCriterion[];
    indicators?: StoredIndicator[];
  }) {
    const upsertCalls: Array<{ table: string; values: Record<string, unknown> }> =
      [];
    const client: SupabaseLike = {
      from: (table: string) => {
        let currentTable = table;
        const chain = {
          is: () => chain,
          in: () => chain,
          ilike: () => chain,
          or: () => chain,
          gte: () => chain,
          lt: () => chain,
          eq: (col: string, value: unknown) => {
            if (currentTable === "career_levels" && col === "status") {
              chain.__listData = (opts.activeLevels ?? []) as Record<
                string,
                unknown
              >[];
            } else if (currentTable === "career_levels" && col === "id") {
              chain.__listData = opts.sourceLevel
                ? [opts.sourceLevel as unknown as Record<string, unknown>]
                : [];
              void value;
            }
            return chain;
          },
          order: () => chain,
          limit: async () => ({
            data:
              currentTable === "career_competencies"
                ? (opts.competencies ?? [])
                : currentTable === "career_criteria"
                  ? (opts.criteria ?? [])
                  : currentTable === "career_indicators"
                    ? (opts.indicators ?? [])
                    : (chain.__listData ?? []),
            error: null,
          }),
          __listData: undefined as Record<string, unknown>[] | undefined,
        };
        return {
          upsert: async (
            values: Record<string, unknown> | Record<string, unknown>[],
          ) => {
            const v = (Array.isArray(values) ? values[0] : values) as Record<
              string,
              unknown
            >;
            upsertCalls.push({ table, values: v });
            return { error: null as null };
          },
          select: () => {
            currentTable = table;
            return chain;
          },
          update: () => ({ eq: async () => ({ error: null as null }) }),
          delete: () => ({ eq: async () => ({ error: null as null }) }),
        };
      },
    };
    return { client, upsertCalls };
  }

  function archivedSource(
    overrides: Partial<StoredLevel> = {},
  ): StoredLevel {
    return level({
      id: "lvl-arch",
      title: "Old L4",
      status: "archived",
      archived_at: "2026-04-01T00:00:00Z",
      ...overrides,
    });
  }

  it("writes a new active level + cloned tree, returns the new id", async () => {
    const { client, upsertCalls } = makeCloneClient({
      activeLevels: [],
      sourceLevel: archivedSource(),
      competencies: [
        {
          id: "c1",
          level_id: "lvl-arch",
          name: "Eng",
          position: 0,
          created_at: "2026-01-01T00:00:00Z",
          deleted_at: null,
        },
      ],
      criteria: [
        {
          id: "cr1",
          competency_id: "c1",
          name: "Quality",
          target: 3,
          position: 0,
          created_at: "2026-01-01T00:00:00Z",
          deleted_at: null,
        },
      ],
      indicators: [
        {
          id: "i1",
          criterion_id: "cr1",
          code: "A",
          description: "tests",
          notes: null,
          score: 4,
          position: 0,
          created_at: "2026-01-01T00:00:00Z",
          deleted_at: null,
        },
      ],
    });

    const newId = await cloneArchivedLevelAsActive(client, "lvl-arch", "New L4");

    expect(typeof newId).toBe("string");
    const tables = upsertCalls.map((c) => c.table);
    expect(tables).toEqual([
      "career_levels",
      "career_competencies",
      "career_criteria",
      "career_indicators",
    ]);
    expect(upsertCalls[0]?.values).toMatchObject({
      title: "New L4",
      status: "active",
    });
    expect(upsertCalls[1]?.values).toMatchObject({
      name: "Eng",
      level_id: upsertCalls[0]?.values.id,
    });
    expect(upsertCalls[2]?.values).toMatchObject({
      name: "Quality",
      target: 3,
      competency_id: upsertCalls[1]?.values.id,
    });
    expect(upsertCalls[3]?.values).toMatchObject({
      code: "A",
      description: "tests",
      notes: null,
      criterion_id: upsertCalls[2]?.values.id,
      score: 1,
    });
  });

  it("throws when an active level already exists", async () => {
    const { client } = makeCloneClient({
      activeLevels: [level({ id: "lvl-active", status: "active" })],
      sourceLevel: archivedSource(),
    });
    await expect(
      cloneArchivedLevelAsActive(client, "lvl-arch", "New"),
    ).rejects.toThrow(/active level already exists/);
  });

  it("throws when the source level is not archived", async () => {
    const { client } = makeCloneClient({
      activeLevels: [],
      sourceLevel: level({ id: "lvl-arch", status: "active" }),
    });
    await expect(
      cloneArchivedLevelAsActive(client, "lvl-arch", "New"),
    ).rejects.toThrow(/not archived/);
  });

  it("throws when the source level does not exist", async () => {
    const { client } = makeCloneClient({
      activeLevels: [],
      sourceLevel: null,
    });
    await expect(
      cloneArchivedLevelAsActive(client, "missing", "New"),
    ).rejects.toThrow(/source level not found/);
  });
});

describe("setScaleLegend", () => {
  it("updates only the provided label fields on id=1", async () => {
    const { client, spies } = makeClient();
    await setScaleLegend(client, { label_2: "Working" });
    expect(spies.update).toHaveBeenCalledWith({ label_2: "Working" });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "1");
  });

  it("supports a multi-field write", async () => {
    const { client, spies } = makeClient();
    await setScaleLegend(client, { label_1: "a", label_4: "d" });
    expect(spies.update).toHaveBeenCalledWith({ label_1: "a", label_4: "d" });
  });

  it("throws when update fails", async () => {
    const { client } = makeClient({
      updateResult: { error: { message: "set boom" } },
    });
    await expect(
      setScaleLegend(client, { label_1: "x" }),
    ).rejects.toThrow("set boom");
  });
});
