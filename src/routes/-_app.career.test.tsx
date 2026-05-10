import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AddCompetencyForm,
  AddCriterionForm,
  AddEvidenceForm,
  AddIndicatorForm,
  CareerLevelView,
  CareerOnboardingView,
  CareerPage,
  CriteriaList,
  EvidenceList,
  IndicatorList,
  LevelHeader,
} from "#/routes/_app.career";
import {
  getActiveLevel,
  listCompetencies,
  listLevels,
  seedSampleTemplate,
  type StoredCompetency,
  type StoredCriterion,
  type StoredEvidence,
  type StoredIndicator,
  type StoredLevel,
} from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

// CareerPage uses the bundled supabase client, while sub-component tests pass
// their own fake. Stub the module so a component-level render of CareerPage
// can drive the store fns directly via vi.mocked(...). Sub-components keep
// using their fake clients — the real store fns (listCompetencies / etc) are
// pass-through except for the four listed below.
vi.mock("#/lib/supabase", () => ({
  supabase: { from: () => ({}) },
}));

vi.mock("#/features/career/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/career/store")>();
  return {
    ...actual,
    listLevels: vi.fn(actual.listLevels),
    getActiveLevel: vi.fn(actual.getActiveLevel),
    seedSampleTemplate: vi.fn(actual.seedSampleTemplate),
    listCompetencies: vi.fn(actual.listCompetencies),
  };
});

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

describe("CareerPage first-run seed", () => {
  let originalListCompetencies: typeof listCompetencies;
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import("#/features/career/store")>(
      "#/features/career/store",
    );
    originalListCompetencies = actual.listCompetencies;
    vi.mocked(listLevels).mockReset();
    vi.mocked(getActiveLevel).mockReset();
    vi.mocked(seedSampleTemplate).mockReset();
    vi.mocked(listCompetencies).mockReset().mockResolvedValue([]);
    vi.mocked(seedSampleTemplate).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.mocked(listCompetencies).mockImplementation(originalListCompetencies);
  });

  it("seeds the sample template when no levels exist and renders the active level", async () => {
    vi.mocked(listLevels).mockResolvedValue([]);
    vi.mocked(getActiveLevel).mockResolvedValue({
      id: "lvl-seeded",
      title: "Sample",
      status: "active",
      header: [],
      sheet_id: null,
      last_synced_at: null,
      created_at: "2026-05-10T00:00:00Z",
      archived_at: null,
    });
    render(<CareerPage />);
    await waitFor(() => {
      expect(screen.getByText("Sample")).toBeTruthy();
    });
    expect(seedSampleTemplate).toHaveBeenCalledTimes(1);
  });

  it("does not re-seed when levels already exist", async () => {
    vi.mocked(listLevels).mockResolvedValue([
      {
        id: "lvl-existing",
        title: "L4",
        status: "active",
        header: [],
        sheet_id: null,
        last_synced_at: null,
        created_at: "2026-05-10T00:00:00Z",
        archived_at: null,
      },
    ]);
    vi.mocked(getActiveLevel).mockResolvedValue({
      id: "lvl-existing",
      title: "L4",
      status: "active",
      header: [],
      sheet_id: null,
      last_synced_at: null,
      created_at: "2026-05-10T00:00:00Z",
      archived_at: null,
    });
    render(<CareerPage />);
    await waitFor(() => {
      expect(screen.getByText("L4")).toBeTruthy();
    });
    expect(seedSampleTemplate).not.toHaveBeenCalled();
  });

  it("does not re-seed when only archived levels remain", async () => {
    vi.mocked(listLevels).mockResolvedValue([
      {
        id: "lvl-archived",
        title: "Old",
        status: "archived",
        header: [],
        sheet_id: null,
        last_synced_at: null,
        created_at: "2026-05-10T00:00:00Z",
        archived_at: "2026-05-10T00:00:00Z",
      },
    ]);
    vi.mocked(getActiveLevel).mockResolvedValue(null);
    render(<CareerPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Level name")).toBeTruthy();
    });
    expect(seedSampleTemplate).not.toHaveBeenCalled();
  });
});

describe("CareerOnboardingView", () => {
  it("renders the level title input and create button", () => {
    render(<CareerOnboardingView onCreateLevel={vi.fn()} />);
    expect(screen.getByLabelText("Level name")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /create level/i }),
    ).toBeTruthy();
  });

  it("calls onCreateLevel with the trimmed title on submit", async () => {
    const onCreateLevel = vi.fn();
    render(<CareerOnboardingView onCreateLevel={onCreateLevel} />);
    const input = screen.getByLabelText("Level name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  L5  " } });
    fireEvent.click(
      screen.getByRole("button", { name: /create level/i }),
    );
    await waitFor(() =>
      expect(onCreateLevel).toHaveBeenCalledWith("L5"),
    );
  });

  it("disables the create button when title is empty", () => {
    render(<CareerOnboardingView onCreateLevel={vi.fn()} />);
    const input = screen.getByLabelText("Level name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    const button = screen.getByRole("button", {
      name: /create level/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("does not render the archived levels panel when there are none", () => {
    render(<CareerOnboardingView onCreateLevel={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Archived levels" })).toBeNull();
  });

  it("renders archived levels and triggers onCloneArchived with id + title", () => {
    const onCloneArchived = vi.fn();
    const archived = [
      level({
        id: "lvl-arch",
        title: "Old L4",
        status: "archived",
        archived_at: "2026-04-01T00:00:00Z",
      }),
    ];
    render(
      <CareerOnboardingView
        onCreateLevel={vi.fn()}
        archivedLevels={archived}
        onCloneArchived={onCloneArchived}
      />,
    );
    expect(screen.getByRole("region", { name: "Archived levels" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: /clone old l4 as starting template/i,
      }),
    );
    expect(onCloneArchived).toHaveBeenCalledWith("lvl-arch", "Old L4");
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

function makeFakeClient(
  initial: StoredCompetency[] = [],
  initialCriteria: StoredCriterion[] = [],
  initialIndicators: StoredIndicator[] = [],
  initialEvidence: StoredEvidence[] = [],
  initialCards: Array<{ id: string; title: string }> = [],
) {
  const compRowsRef: { current: StoredCompetency[] } = {
    current: [...initial],
  };
  const critRowsRef: { current: StoredCriterion[] } = {
    current: [...initialCriteria],
  };
  const indRowsRef: { current: StoredIndicator[] } = {
    current: [...initialIndicators],
  };
  const evRowsRef: { current: StoredEvidence[] } = {
    current: [...initialEvidence],
  };
  const cardRowsRef: { current: Array<{ id: string; title: string }> } = {
    current: [...initialCards],
  };
  const upsertComp = vi.fn(
    async (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const v = (Array.isArray(values) ? values[0] : values) as Record<
        string,
        unknown
      >;
      compRowsRef.current.push({
        id: v.id as string,
        level_id: v.level_id as string,
        name: v.name as string,
        position: v.position as number,
        created_at: new Date().toISOString(),
        deleted_at: null,
      });
      return { error: null };
    },
  );
  const upsertCrit = vi.fn(
    async (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const v = (Array.isArray(values) ? values[0] : values) as Record<
        string,
        unknown
      >;
      critRowsRef.current.push({
        id: v.id as string,
        competency_id: v.competency_id as string,
        name: v.name as string,
        target: (v.target as number) ?? 1,
        position: v.position as number,
        created_at: new Date().toISOString(),
        deleted_at: null,
      });
      return { error: null };
    },
  );
  const upsertInd = vi.fn(
    async (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const v = (Array.isArray(values) ? values[0] : values) as Record<
        string,
        unknown
      >;
      indRowsRef.current.push({
        id: v.id as string,
        criterion_id: v.criterion_id as string,
        code: (v.code as string | null) ?? null,
        description: (v.description as string) ?? "",
        notes: (v.notes as string | null) ?? null,
        score: (v.score as number) ?? 1,
        position: v.position as number,
        created_at: new Date().toISOString(),
        deleted_at: null,
      });
      return { error: null };
    },
  );
  const upsertEv = vi.fn(
    async (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const v = (Array.isArray(values) ? values[0] : values) as Record<
        string,
        unknown
      >;
      evRowsRef.current.push({
        id: v.id as string,
        indicator_id: v.indicator_id as string,
        title: (v.title as string) ?? "",
        url: (v.url as string | null) ?? null,
        note: (v.note as string | null) ?? null,
        card_id: (v.card_id as string | null) ?? null,
        position: v.position as number,
        created_at: new Date().toISOString(),
        deleted_at: null,
      });
      return { error: null };
    },
  );
  const updateEq = vi.fn(async () => ({ error: null as null }));
  const updateComp = vi.fn((values: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      compRowsRef.current = compRowsRef.current
        .map((r) =>
          r.id === id
            ? {
                ...r,
                ...(typeof values.name === "string"
                  ? { name: values.name as string }
                  : {}),
                ...(typeof values.deleted_at === "string"
                  ? { deleted_at: values.deleted_at as string }
                  : {}),
              }
            : r,
        )
        .filter((r) => r.deleted_at === null);
      return updateEq();
    },
  }));
  const updateCrit = vi.fn((values: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      critRowsRef.current = critRowsRef.current
        .map((r) =>
          r.id === id
            ? {
                ...r,
                ...(typeof values.name === "string"
                  ? { name: values.name as string }
                  : {}),
                ...(typeof values.target === "number"
                  ? { target: values.target as number }
                  : {}),
                ...(typeof values.deleted_at === "string"
                  ? { deleted_at: values.deleted_at as string }
                  : {}),
              }
            : r,
        )
        .filter((r) => r.deleted_at === null);
      return updateEq();
    },
  }));
  const updateInd = vi.fn((values: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      indRowsRef.current = indRowsRef.current
        .map((r) =>
          r.id === id
            ? {
                ...r,
                ...("code" in values
                  ? { code: values.code as string | null }
                  : {}),
                ...(typeof values.description === "string"
                  ? { description: values.description as string }
                  : {}),
                ...("notes" in values
                  ? { notes: values.notes as string | null }
                  : {}),
                ...(typeof values.score === "number"
                  ? { score: values.score as number }
                  : {}),
                ...(typeof values.deleted_at === "string"
                  ? { deleted_at: values.deleted_at as string }
                  : {}),
              }
            : r,
        )
        .filter((r) => r.deleted_at === null);
      return updateEq();
    },
  }));
  const updateEv = vi.fn((values: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      evRowsRef.current = evRowsRef.current
        .map((r) =>
          r.id === id
            ? {
                ...r,
                ...(typeof values.title === "string"
                  ? { title: values.title as string }
                  : {}),
                ...("url" in values
                  ? { url: values.url as string | null }
                  : {}),
                ...("note" in values
                  ? { note: values.note as string | null }
                  : {}),
                ...("card_id" in values
                  ? { card_id: values.card_id as string | null }
                  : {}),
                ...(typeof values.deleted_at === "string"
                  ? { deleted_at: values.deleted_at as string }
                  : {}),
              }
            : r,
        )
        .filter((r) => r.deleted_at === null);
      return updateEq();
    },
  }));
  const store = {
    compRowsRef,
    critRowsRef,
    indRowsRef,
    evRowsRef,
    rowsRef: compRowsRef,
    upsert: upsertComp,
    update: updateComp,
    upsertCrit,
    updateCrit,
    upsertInd,
    updateInd,
    upsertEv,
    updateEv,
    updateEq,
  };

  const buildSelectChain = (table: string) => {
    let filteredKey: string | null = null;
    let filteredVal: string | null = null;
    let ilikePattern: string | null = null;
    const chain = {
      is: vi.fn(() => chain),
      in: vi.fn(() => chain),
      ilike: vi.fn((_col: string, pattern: string) => {
        ilikePattern = pattern;
        return chain;
      }),
      or: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      eq: vi.fn((col: string, val: string) => {
        filteredKey = col;
        filteredVal = val;
        return chain;
      }),
      order: vi.fn(() => chain),
      limit: vi.fn(async () => {
        if (table === "career_evidence") {
          return {
            data: evRowsRef.current.filter(
              (r) =>
                r.deleted_at === null &&
                (filteredKey !== "indicator_id" ||
                  r.indicator_id === filteredVal),
            ) as unknown as Record<string, unknown>[],
            error: null,
          };
        }
        if (table === "project_cards") {
          const stripped = (ilikePattern ?? "").replace(/^%|%$/g, "").toLowerCase();
          return {
            data: cardRowsRef.current.filter((c) =>
              !stripped ? true : c.title.toLowerCase().includes(stripped),
            ) as unknown as Record<string, unknown>[],
            error: null,
          };
        }
        if (table === "career_indicators") {
          return {
            data: indRowsRef.current.filter(
              (r) =>
                r.deleted_at === null &&
                (filteredKey !== "criterion_id" ||
                  r.criterion_id === filteredVal),
            ) as unknown as Record<string, unknown>[],
            error: null,
          };
        }
        if (table === "career_criteria") {
          return {
            data: critRowsRef.current.filter(
              (r) =>
                r.deleted_at === null &&
                (filteredKey !== "competency_id" ||
                  r.competency_id === filteredVal),
            ) as unknown as Record<string, unknown>[],
            error: null,
          };
        }
        return {
          data: compRowsRef.current.filter(
            (r) =>
              r.deleted_at === null &&
              (filteredKey !== "level_id" || r.level_id === filteredVal),
          ) as unknown as Record<string, unknown>[],
          error: null,
        };
      }),
    };
    return chain;
  };

  const upsertFor = (table: string) => {
    if (table === "career_evidence") return upsertEv;
    if (table === "career_indicators") return upsertInd;
    if (table === "career_criteria") return upsertCrit;
    return upsertComp;
  };
  const updateFor = (table: string) => {
    if (table === "career_evidence") return updateEv;
    if (table === "career_indicators") return updateInd;
    if (table === "career_criteria") return updateCrit;
    return updateComp;
  };
  const client: SupabaseLike = {
    from: (table: string) => ({
      upsert: upsertFor(table),
      select: vi.fn(() => buildSelectChain(table)),
      update: updateFor(table),
      delete: vi.fn(() => ({ eq: vi.fn() })),
    }),
  };

  return { client, store };
}

describe("CareerLevelView", () => {
  const originalConfirm = window.confirm;
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });
  afterEach(() => {
    window.confirm = originalConfirm;
  });

  it("renders the level title", async () => {
    const { client } = makeFakeClient();
    render(
      <CareerLevelView
        level={level({ title: "Staff Engineer" })}
        client={client}
      />,
    );
    expect(screen.getByText("Staff Engineer")).toBeTruthy();
  });

  it("toggles between the tree and wheel views", async () => {
    const { client } = makeFakeClient([
      competency({ id: "c1", name: "Craft" }),
    ]);
    render(<CareerLevelView level={level()} client={client} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Craft")).toBeTruthy();
    });
    expect(screen.queryByRole("img", { name: /career wheel/i })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /wheel/i }));
    await waitFor(() => {
      expect(screen.getByRole("img", { name: /career wheel/i })).toBeTruthy();
    });
    // Tree is hidden when wheel is active.
    expect(screen.queryByDisplayValue("Craft")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /tree/i }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("Craft")).toBeTruthy();
    });
  });

  it("shows an empty competency tree placeholder", async () => {
    const { client } = makeFakeClient();
    render(<CareerLevelView level={level()} client={client} />);
    await waitFor(() => {
      expect(screen.getByText(/no competencies yet/i)).toBeTruthy();
    });
  });

  it("loads and renders existing competencies", async () => {
    const { client } = makeFakeClient([
      competency({ id: "c1", name: "Craft" }),
      competency({ id: "c2", name: "Collaboration", position: 1024 }),
    ]);
    render(<CareerLevelView level={level()} client={client} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Craft")).toBeTruthy();
      expect(screen.getByDisplayValue("Collaboration")).toBeTruthy();
    });
  });

  it("adds a competency via the form and renders it", async () => {
    const { client, store } = makeFakeClient();
    render(<CareerLevelView level={level()} client={client} />);
    await waitFor(() =>
      expect(screen.getByText(/no competencies yet/i)).toBeTruthy(),
    );
    const input = screen.getByLabelText(
      "New competency name",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Craft  " } });
    fireEvent.click(screen.getByRole("button", { name: /add competency/i }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("Craft")).toBeTruthy();
    });
    expect(store.upsert).toHaveBeenCalledTimes(1);
    const args = store.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.name).toBe("Craft");
    expect(args.level_id).toBe("lvl1");
    expect(args.position).toBe(0);
  });

  it("renames a competency on input blur with a different value", async () => {
    const { client, store } = makeFakeClient([
      competency({ id: "c1", name: "Craft" }),
    ]);
    render(<CareerLevelView level={level()} client={client} />);
    const input = (await screen.findByDisplayValue(
      "Craft",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Engineering Craft" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(store.update).toHaveBeenCalledWith({ name: "Engineering Craft" });
    });
  });

  it("does not call rename when blur leaves the name unchanged", async () => {
    const { client, store } = makeFakeClient([
      competency({ id: "c1", name: "Craft" }),
    ]);
    render(<CareerLevelView level={level()} client={client} />);
    const input = (await screen.findByDisplayValue(
      "Craft",
    )) as HTMLInputElement;
    fireEvent.blur(input);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("soft-deletes a competency and removes it from the list", async () => {
    const { client, store } = makeFakeClient([
      competency({ id: "c1", name: "Craft" }),
    ]);
    render(<CareerLevelView level={level()} client={client} />);
    const deleteBtn = await screen.findByRole("button", {
      name: /delete competency craft/i,
    });
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(store.update).toHaveBeenCalledTimes(1);
    });
    const arg = store.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg.deleted_at).toBe("string");
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Craft")).toBeNull(),
    );
  });

  it("does not delete when the user cancels the confirm prompt", async () => {
    window.confirm = vi.fn(() => false);
    const { client, store } = makeFakeClient([
      competency({ id: "c1", name: "Craft" }),
    ]);
    render(<CareerLevelView level={level()} client={client} />);
    const deleteBtn = await screen.findByRole("button", {
      name: /delete competency craft/i,
    });
    fireEvent.click(deleteBtn);
    expect(store.update).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Craft")).toBeTruthy();
  });
});

describe("CareerLevelView drag-reorder", () => {
  const originalConfirm = window.confirm;
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });
  afterEach(() => {
    window.confirm = originalConfirm;
  });

  it("reorders competencies via drag-and-drop and persists positions", async () => {
    const { client, store } = makeFakeClient([
      competency({ id: "c1", name: "Alpha", position: 0 }),
      competency({ id: "c2", name: "Beta", position: 1024 }),
    ]);
    render(<CareerLevelView level={level()} client={client} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Alpha")).toBeTruthy();
      expect(screen.getByDisplayValue("Beta")).toBeTruthy();
    });

    const list = screen.getByRole("list", { name: "Competencies" });
    const rows = list.querySelectorAll(":scope > li");
    expect(rows.length).toBe(2);

    // Drag Alpha (row 0) and drop after Beta (row 1).
    fireEvent.dragStart(rows[0]);
    fireEvent.dragEnter(rows[1]);
    fireEvent.drop(list);

    // Optimistic patch: visible order should swap based on rewritten positions.
    await waitFor(() => {
      const labels = Array.from(
        list.querySelectorAll('input[aria-label^="Rename competency"]'),
      ).map((el) => el.getAttribute("aria-label"));
      expect(labels).toEqual([
        "Rename competency Beta",
        "Rename competency Alpha",
      ]);
    });

    // Two position writes hit the store (one per competency in the new order).
    const positionWrites = store.update.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((v) => typeof v.position === "number");
    expect(positionWrites.map((v) => v.position).sort()).toEqual([0, 1024]);
  });

  it("no-ops when dragged onto its current position", async () => {
    const { client, store } = makeFakeClient([
      competency({ id: "c1", name: "Alpha", position: 0 }),
      competency({ id: "c2", name: "Beta", position: 1024 }),
    ]);
    render(<CareerLevelView level={level()} client={client} />);
    await waitFor(() => expect(screen.getByDisplayValue("Alpha")).toBeTruthy());

    const list = screen.getByRole("list", { name: "Competencies" });
    const rows = list.querySelectorAll(":scope > li");
    // Drag Alpha (row 0, already at top) with no dragEnter on a different row
    // — drop falls back to afterId=null, which puts Alpha at the top: a no-op.
    // The pure module's no-churn check returns the input array unchanged so
    // no position writes are issued.
    fireEvent.dragStart(rows[0]);
    fireEvent.drop(list);

    const positionWrites = store.update.mock.calls.filter((c) => {
      const v = c[0] as Record<string, unknown>;
      return typeof v.position === "number";
    });
    expect(positionWrites).toHaveLength(0);
  });
});

describe("AddCompetencyForm", () => {
  it("submits the trimmed name and clears the input", async () => {
    const onAdd = vi.fn();
    render(<AddCompetencyForm onAdd={onAdd} />);
    const input = screen.getByLabelText(
      "New competency name",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Craft  " } });
    fireEvent.click(screen.getByRole("button", { name: /add competency/i }));
    expect(onAdd).toHaveBeenCalledWith("Craft");
    expect(input.value).toBe("");
  });

  it("disables the button when the name is empty", () => {
    render(<AddCompetencyForm onAdd={vi.fn()} />);
    const button = screen.getByRole("button", {
      name: /add competency/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
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

describe("CriteriaList", () => {
  const originalConfirm = window.confirm;
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });
  afterEach(() => {
    window.confirm = originalConfirm;
  });

  it("loads and renders existing criteria for the competency", async () => {
    const { client } = makeFakeClient(
      [competency({ id: "c1", name: "Craft" })],
      [
        criterion({ id: "cr1", competency_id: "c1", name: "Review depth" }),
        criterion({
          id: "cr2",
          competency_id: "c1",
          name: "Design tradeoffs",
          position: 1024,
        }),
      ],
    );
    render(
      <CriteriaList
        competency={competency({ id: "c1", name: "Craft" })}
        client={client}
      />,
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("Review depth")).toBeTruthy();
      expect(screen.getByDisplayValue("Design tradeoffs")).toBeTruthy();
    });
  });

  it("only loads criteria for the matching competency", async () => {
    const { client } = makeFakeClient(
      [
        competency({ id: "c1", name: "Craft" }),
        competency({ id: "c2", name: "Collab" }),
      ],
      [
        criterion({ id: "cr1", competency_id: "c1", name: "Review depth" }),
        criterion({ id: "cr2", competency_id: "c2", name: "Mentoring" }),
      ],
    );
    render(
      <CriteriaList
        competency={competency({ id: "c1", name: "Craft" })}
        client={client}
      />,
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue("Review depth")).toBeTruthy(),
    );
    expect(screen.queryByDisplayValue("Mentoring")).toBeNull();
  });

  it("adds a criterion via the form with target default 1", async () => {
    const { client, store } = makeFakeClient([
      competency({ id: "c1", name: "Craft" }),
    ]);
    render(
      <CriteriaList
        competency={competency({ id: "c1", name: "Craft" })}
        client={client}
      />,
    );
    const input = await screen.findByLabelText("New criterion name");
    fireEvent.change(input, { target: { value: "  Review depth  " } });
    fireEvent.click(
      screen.getByRole("button", { name: /add criterion/i }),
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue("Review depth")).toBeTruthy(),
    );
    expect(store.upsertCrit).toHaveBeenCalledTimes(1);
    const args = store.upsertCrit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.name).toBe("Review depth");
    expect(args.competency_id).toBe("c1");
    expect(args.target).toBe(1);
    expect(args.position).toBe(0);
  });

  it("renames a criterion on input blur with a different value", async () => {
    const { client, store } = makeFakeClient(
      [competency({ id: "c1", name: "Craft" })],
      [criterion({ id: "cr1", competency_id: "c1", name: "Review depth" })],
    );
    render(
      <CriteriaList
        competency={competency({ id: "c1", name: "Craft" })}
        client={client}
      />,
    );
    const input = (await screen.findByDisplayValue(
      "Review depth",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Code review depth" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(store.updateCrit).toHaveBeenCalledWith({
        name: "Code review depth",
      }),
    );
  });

  it("writes the target on blur and clamps out-of-range values", async () => {
    const { client, store } = makeFakeClient(
      [competency({ id: "c1", name: "Craft" })],
      [
        criterion({
          id: "cr1",
          competency_id: "c1",
          name: "Review depth",
          target: 1,
        }),
      ],
    );
    render(
      <CriteriaList
        competency={competency({ id: "c1", name: "Craft" })}
        client={client}
      />,
    );
    const target = (await screen.findByLabelText(
      "Target for Review depth",
    )) as HTMLInputElement;
    fireEvent.change(target, { target: { value: "9" } });
    fireEvent.blur(target);
    await waitFor(() =>
      expect(store.updateCrit).toHaveBeenCalledWith({ target: 4 }),
    );
    expect(target.value).toBe("4");
  });

  it("does not write a target on blur when the value is unchanged", async () => {
    const { client, store } = makeFakeClient(
      [competency({ id: "c1", name: "Craft" })],
      [
        criterion({
          id: "cr1",
          competency_id: "c1",
          name: "Review depth",
          target: 2,
        }),
      ],
    );
    render(
      <CriteriaList
        competency={competency({ id: "c1", name: "Craft" })}
        client={client}
      />,
    );
    const target = (await screen.findByLabelText(
      "Target for Review depth",
    )) as HTMLInputElement;
    fireEvent.blur(target);
    expect(store.updateCrit).not.toHaveBeenCalled();
  });

  it("soft-deletes a criterion and removes it from the list", async () => {
    const { client, store } = makeFakeClient(
      [competency({ id: "c1", name: "Craft" })],
      [criterion({ id: "cr1", competency_id: "c1", name: "Review depth" })],
    );
    render(
      <CriteriaList
        competency={competency({ id: "c1", name: "Craft" })}
        client={client}
      />,
    );
    const deleteBtn = await screen.findByRole("button", {
      name: /delete criterion review depth/i,
    });
    fireEvent.click(deleteBtn);
    await waitFor(() =>
      expect(store.updateCrit).toHaveBeenCalledTimes(1),
    );
    const arg = store.updateCrit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg.deleted_at).toBe("string");
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Review depth")).toBeNull(),
    );
  });

  it("does not delete when the user cancels the confirm prompt", async () => {
    window.confirm = vi.fn(() => false);
    const { client, store } = makeFakeClient(
      [competency({ id: "c1", name: "Craft" })],
      [criterion({ id: "cr1", competency_id: "c1", name: "Review depth" })],
    );
    render(
      <CriteriaList
        competency={competency({ id: "c1", name: "Craft" })}
        client={client}
      />,
    );
    const deleteBtn = await screen.findByRole("button", {
      name: /delete criterion review depth/i,
    });
    fireEvent.click(deleteBtn);
    expect(store.updateCrit).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Review depth")).toBeTruthy();
  });
});

describe("AddCriterionForm", () => {
  it("submits the trimmed name and clears the input", async () => {
    const onAdd = vi.fn();
    render(<AddCriterionForm onAdd={onAdd} />);
    const input = screen.getByLabelText(
      "New criterion name",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Review depth  " } });
    fireEvent.click(screen.getByRole("button", { name: /add criterion/i }));
    expect(onAdd).toHaveBeenCalledWith("Review depth");
    expect(input.value).toBe("");
  });

  it("disables the button when the name is empty", () => {
    render(<AddCriterionForm onAdd={vi.fn()} />);
    const button = screen.getByRole("button", {
      name: /add criterion/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
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

describe("IndicatorList", () => {
  const originalConfirm = window.confirm;
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });
  afterEach(() => {
    window.confirm = originalConfirm;
  });

  it("loads and renders existing indicators for the criterion", async () => {
    const { client } = makeFakeClient(
      [],
      [],
      [
        indicator({ id: "i1", criterion_id: "cr1", description: "Reviews PRs" }),
        indicator({
          id: "i2",
          criterion_id: "cr1",
          description: "Mentors juniors",
          position: 1024,
        }),
      ],
    );
    render(
      <IndicatorList
        criterion={criterion({ id: "cr1", name: "Review depth" })}
        client={client}
      />,
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("Reviews PRs")).toBeTruthy();
      expect(screen.getByDisplayValue("Mentors juniors")).toBeTruthy();
    });
  });

  it("only loads indicators for the matching criterion", async () => {
    const { client } = makeFakeClient(
      [],
      [],
      [
        indicator({ id: "i1", criterion_id: "cr1", description: "A1" }),
        indicator({ id: "i2", criterion_id: "cr2", description: "B1" }),
      ],
    );
    render(
      <IndicatorList
        criterion={criterion({ id: "cr1", name: "Review depth" })}
        client={client}
      />,
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue("A1")).toBeTruthy(),
    );
    expect(screen.queryByDisplayValue("B1")).toBeNull();
  });

  it("adds an indicator via the form with score default 1", async () => {
    const { client, store } = makeFakeClient();
    render(
      <IndicatorList
        criterion={criterion({ id: "cr1", name: "Review depth" })}
        client={client}
      />,
    );
    const input = await screen.findByLabelText("New indicator description");
    fireEvent.change(input, { target: { value: "  Reviews PRs  " } });
    fireEvent.click(screen.getByRole("button", { name: /add indicator/i }));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Reviews PRs")).toBeTruthy(),
    );
    expect(store.upsertInd).toHaveBeenCalledTimes(1);
    const args = store.upsertInd.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.description).toBe("Reviews PRs");
    expect(args.criterion_id).toBe("cr1");
    expect(args.score).toBe(1);
    expect(args.position).toBe(0);
  });

  it("renames the description on input blur with a different value", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [
        indicator({
          id: "i1",
          criterion_id: "cr1",
          description: "Reviews PRs",
        }),
      ],
    );
    render(
      <IndicatorList
        criterion={criterion({ id: "cr1", name: "Review depth" })}
        client={client}
      />,
    );
    const input = (await screen.findByDisplayValue(
      "Reviews PRs",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Reviews PRs deeply" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(store.updateInd).toHaveBeenCalledWith({
        description: "Reviews PRs deeply",
      }),
    );
  });

  it("writes the score on blur and clamps out-of-range values", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [
        indicator({
          id: "i1",
          criterion_id: "cr1",
          description: "Reviews PRs",
          score: 1,
        }),
      ],
    );
    render(
      <IndicatorList
        criterion={criterion({ id: "cr1", name: "Review depth" })}
        client={client}
      />,
    );
    const score = (await screen.findByLabelText(
      "Score for A",
    )) as HTMLInputElement;
    fireEvent.change(score, { target: { value: "9" } });
    fireEvent.blur(score);
    await waitFor(() =>
      expect(store.updateInd).toHaveBeenCalledWith({ score: 4 }),
    );
    expect(score.value).toBe("4");
  });

  it("does not write a score on blur when the value is unchanged", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [
        indicator({
          id: "i1",
          criterion_id: "cr1",
          description: "Reviews PRs",
          score: 2,
        }),
      ],
    );
    render(
      <IndicatorList
        criterion={criterion({ id: "cr1", name: "Review depth" })}
        client={client}
      />,
    );
    const score = (await screen.findByLabelText(
      "Score for A",
    )) as HTMLInputElement;
    fireEvent.blur(score);
    expect(store.updateInd).not.toHaveBeenCalled();
  });

  it("soft-deletes an indicator and removes it from the list", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [
        indicator({
          id: "i1",
          criterion_id: "cr1",
          description: "Reviews PRs",
        }),
      ],
    );
    render(
      <IndicatorList
        criterion={criterion({ id: "cr1", name: "Review depth" })}
        client={client}
      />,
    );
    const deleteBtn = await screen.findByRole("button", {
      name: /delete indicator a/i,
    });
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(store.updateInd).toHaveBeenCalledTimes(1));
    const arg = store.updateInd.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg.deleted_at).toBe("string");
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Reviews PRs")).toBeNull(),
    );
  });

  it("does not delete when the user cancels the confirm prompt", async () => {
    window.confirm = vi.fn(() => false);
    const { client, store } = makeFakeClient(
      [],
      [],
      [
        indicator({
          id: "i1",
          criterion_id: "cr1",
          description: "Reviews PRs",
        }),
      ],
    );
    render(
      <IndicatorList
        criterion={criterion({ id: "cr1", name: "Review depth" })}
        client={client}
      />,
    );
    const deleteBtn = await screen.findByRole("button", {
      name: /delete indicator a/i,
    });
    fireEvent.click(deleteBtn);
    expect(store.updateInd).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Reviews PRs")).toBeTruthy();
  });
});

describe("AddIndicatorForm", () => {
  it("submits the trimmed description and clears the input", async () => {
    const onAdd = vi.fn();
    render(<AddIndicatorForm onAdd={onAdd} />);
    const input = screen.getByLabelText(
      "New indicator description",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Reviews PRs  " } });
    fireEvent.click(screen.getByRole("button", { name: /add indicator/i }));
    expect(onAdd).toHaveBeenCalledWith("Reviews PRs");
    expect(input.value).toBe("");
  });

  it("disables the button when the description is empty", () => {
    render(<AddIndicatorForm onAdd={vi.fn()} />);
    const button = screen.getByRole("button", {
      name: /add indicator/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

function evidenceRow(
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

function indicatorFixture(
  overrides: Partial<StoredIndicator> = {},
): StoredIndicator {
  return {
    id: "i1",
    criterion_id: "cr1",
    code: "A",
    description: "Reviews PRs",
    notes: null,
    score: 1,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("EvidenceList", () => {
  const originalConfirm = window.confirm;
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });
  afterEach(() => {
    window.confirm = originalConfirm;
  });

  it("loads and renders existing evidence for the indicator", async () => {
    const { client } = makeFakeClient(
      [],
      [],
      [],
      [
        evidenceRow({ id: "e1", indicator_id: "i1", title: "Postmortem" }),
        evidenceRow({
          id: "e2",
          indicator_id: "i1",
          title: "Design doc",
          position: 1024,
        }),
      ],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Postmortem")).toBeTruthy();
      expect(screen.getByDisplayValue("Design doc")).toBeTruthy();
    });
  });

  it("only loads evidence for the matching indicator", async () => {
    const { client } = makeFakeClient(
      [],
      [],
      [],
      [
        evidenceRow({ id: "e1", indicator_id: "i1", title: "Mine" }),
        evidenceRow({ id: "e2", indicator_id: "i2", title: "Other" }),
      ],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("Mine")).toBeTruthy(),
    );
    expect(screen.queryByDisplayValue("Other")).toBeNull();
  });

  it("adds an evidence row via the form with title-only payload", async () => {
    const { client, store } = makeFakeClient();
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    const input = await screen.findByLabelText("New evidence title");
    fireEvent.change(input, { target: { value: "  Postmortem  " } });
    fireEvent.click(screen.getByRole("button", { name: /add evidence/i }));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Postmortem")).toBeTruthy(),
    );
    expect(store.upsertEv).toHaveBeenCalledTimes(1);
    const args = store.upsertEv.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.title).toBe("Postmortem");
    expect(args.indicator_id).toBe("i1");
    expect(args.url).toBeNull();
    expect(args.note).toBeNull();
    expect(args.card_id).toBeNull();
    expect(args.position).toBe(0);
  });

  it("renames the title on input blur with a different value", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [],
      [evidenceRow({ id: "e1", indicator_id: "i1", title: "Old" })],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    const input = (await screen.findByDisplayValue("Old")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(store.updateEv).toHaveBeenCalledWith({ title: "New" }),
    );
  });

  it("writes a valid URL on blur and renders an open link", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [],
      [evidenceRow({ id: "e1", indicator_id: "i1", title: "Postmortem" })],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    const url = (await screen.findByLabelText(
      "URL for Postmortem",
    )) as HTMLInputElement;
    fireEvent.change(url, { target: { value: "https://example.com/x" } });
    fireEvent.blur(url);
    await waitFor(() =>
      expect(store.updateEv).toHaveBeenCalledWith({
        url: "https://example.com/x",
      }),
    );
  });

  it("ignores an invalid URL on blur (does not write)", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [],
      [evidenceRow({ id: "e1", indicator_id: "i1", title: "Postmortem" })],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    const url = (await screen.findByLabelText(
      "URL for Postmortem",
    )) as HTMLInputElement;
    fireEvent.change(url, { target: { value: "not-a-url" } });
    fireEvent.blur(url);
    expect(store.updateEv).not.toHaveBeenCalled();
  });

  it("links a project card via the picker", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [],
      [evidenceRow({ id: "e1", indicator_id: "i1", title: "Postmortem" })],
      [{ id: "card-1", title: "Q4 launch retro" }],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    const search = (await screen.findByLabelText(
      "Search project cards for Postmortem",
    )) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "launch" } });
    const result = await screen.findByRole("button", { name: /Q4 launch retro/i });
    fireEvent.click(result);
    await waitFor(() =>
      expect(store.updateEv).toHaveBeenCalledWith({ card_id: "card-1" }),
    );
  });

  it("unlinks a card via the unlink button", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [],
      [
        evidenceRow({
          id: "e1",
          indicator_id: "i1",
          title: "Postmortem",
          card_id: "card-1",
        }),
      ],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    const unlink = await screen.findByRole("button", {
      name: /unlink card from postmortem/i,
    });
    fireEvent.click(unlink);
    await waitFor(() =>
      expect(store.updateEv).toHaveBeenCalledWith({ card_id: null }),
    );
  });

  it("soft-deletes evidence and removes it from the list", async () => {
    const { client, store } = makeFakeClient(
      [],
      [],
      [],
      [evidenceRow({ id: "e1", indicator_id: "i1", title: "Postmortem" })],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    const deleteBtn = await screen.findByRole("button", {
      name: /delete evidence postmortem/i,
    });
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(store.updateEv).toHaveBeenCalledTimes(1));
    const arg = store.updateEv.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg.deleted_at).toBe("string");
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Postmortem")).toBeNull(),
    );
  });

  it("does not delete when the user cancels the confirm prompt", async () => {
    window.confirm = vi.fn(() => false);
    const { client, store } = makeFakeClient(
      [],
      [],
      [],
      [evidenceRow({ id: "e1", indicator_id: "i1", title: "Postmortem" })],
    );
    render(<EvidenceList indicator={indicatorFixture()} client={client} />);
    const deleteBtn = await screen.findByRole("button", {
      name: /delete evidence postmortem/i,
    });
    fireEvent.click(deleteBtn);
    expect(store.updateEv).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Postmortem")).toBeTruthy();
  });
});

describe("AddEvidenceForm", () => {
  it("submits the trimmed title and clears the input", async () => {
    const onAdd = vi.fn();
    render(<AddEvidenceForm onAdd={onAdd} />);
    const input = screen.getByLabelText(
      "New evidence title",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Postmortem  " } });
    fireEvent.click(screen.getByRole("button", { name: /add evidence/i }));
    expect(onAdd).toHaveBeenCalledWith("Postmortem");
    expect(input.value).toBe("");
  });

  it("disables the button when the title is empty", () => {
    render(<AddEvidenceForm onAdd={vi.fn()} />);
    const button = screen.getByRole("button", {
      name: /add evidence/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

function makeLevelHeaderClient() {
  const calls: Array<Record<string, unknown>> = [];
  const updateEq = vi.fn(async () => ({ error: null as null }));
  const update = vi.fn((values: Record<string, unknown>) => {
    calls.push(values);
    return { eq: updateEq };
  });
  const client: SupabaseLike = {
    from: () => ({
      upsert: vi.fn(async () => ({ error: null })),
      // biome-ignore lint/suspicious/noExplicitAny: select unused in this test seam
      select: vi.fn(() => ({}) as any),
      update,
      delete: vi.fn(() => ({ eq: vi.fn() })),
    }),
  };
  return { client, calls, update, updateEq };
}

describe("LevelHeader", () => {
  it("renders an empty placeholder when the header has no rows", () => {
    const { client } = makeLevelHeaderClient();
    render(<LevelHeader level={level()} client={client} />);
    expect(screen.getByText(/no header rows/i)).toBeTruthy();
  });

  it("renders existing rows in order", () => {
    const { client } = makeLevelHeaderClient();
    render(
      <LevelHeader
        level={level({
          header: [
            { key: "role", value: "Staff" },
            { key: "employer", value: "Acme" },
          ],
        })}
        client={client}
      />,
    );
    expect(screen.getByDisplayValue("role")).toBeTruthy();
    expect(screen.getByDisplayValue("Staff")).toBeTruthy();
    expect(screen.getByDisplayValue("employer")).toBeTruthy();
    expect(screen.getByDisplayValue("Acme")).toBeTruthy();
  });

  it("appends a new empty row on Add", async () => {
    const { client, update } = makeLevelHeaderClient();
    render(<LevelHeader level={level()} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        header: [{ key: "", value: "" }],
      });
    });
  });

  it("renames a key on blur with a different value", async () => {
    const { client, update } = makeLevelHeaderClient();
    render(
      <LevelHeader
        level={level({ header: [{ key: "role", value: "Staff" }] })}
        client={client}
      />,
    );
    const input = screen.getByDisplayValue("role") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "title" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        header: [{ key: "title", value: "Staff" }],
      });
    });
  });

  it("does not write when blur leaves the value unchanged", () => {
    const { client, update } = makeLevelHeaderClient();
    render(
      <LevelHeader
        level={level({ header: [{ key: "role", value: "Staff" }] })}
        client={client}
      />,
    );
    fireEvent.blur(screen.getByDisplayValue("role"));
    expect(update).not.toHaveBeenCalled();
  });

  it("edits a value on blur with a different value", async () => {
    const { client, update } = makeLevelHeaderClient();
    render(
      <LevelHeader
        level={level({ header: [{ key: "role", value: "Staff" }] })}
        client={client}
      />,
    );
    const input = screen.getByDisplayValue("Staff") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Senior" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        header: [{ key: "role", value: "Senior" }],
      });
    });
  });

  it("deletes a row and persists the new array", async () => {
    const { client, update } = makeLevelHeaderClient();
    render(
      <LevelHeader
        level={level({
          header: [
            { key: "role", value: "Staff" },
            { key: "employer", value: "Acme" },
          ],
        })}
        client={client}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /delete header row role/i }),
    );
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        header: [{ key: "employer", value: "Acme" }],
      });
    });
    expect(screen.queryByDisplayValue("role")).toBeNull();
  });

  it("reorders a row down and persists the new order", async () => {
    const { client, update } = makeLevelHeaderClient();
    render(
      <LevelHeader
        level={level({
          header: [
            { key: "role", value: "Staff" },
            { key: "employer", value: "Acme" },
          ],
        })}
        client={client}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /move role down/i }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        header: [
          { key: "employer", value: "Acme" },
          { key: "role", value: "Staff" },
        ],
      });
    });
  });
});
