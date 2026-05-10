import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AddCompetencyForm,
  AddCriterionForm,
  AddIndicatorForm,
  CareerLevelView,
  CareerOnboardingView,
  CriteriaList,
  IndicatorList,
} from "#/routes/_app.career";
import type {
  StoredCompetency,
  StoredCriterion,
  StoredIndicator,
  StoredLevel,
} from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

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
  const store = {
    compRowsRef,
    critRowsRef,
    indRowsRef,
    rowsRef: compRowsRef,
    upsert: upsertComp,
    update: updateComp,
    upsertCrit,
    updateCrit,
    upsertInd,
    updateInd,
    updateEq,
  };

  const buildSelectChain = (table: string) => {
    let filteredKey: string | null = null;
    let filteredVal: string | null = null;
    const chain = {
      is: vi.fn(() => chain),
      in: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
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
    if (table === "career_indicators") return upsertInd;
    if (table === "career_criteria") return upsertCrit;
    return upsertComp;
  };
  const updateFor = (table: string) => {
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
