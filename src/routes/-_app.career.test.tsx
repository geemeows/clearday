import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AddCompetencyForm,
  CareerLevelView,
  CareerOnboardingView,
} from "#/routes/_app.career";
import type { StoredCompetency, StoredLevel } from "#/features/career/store";
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

function makeFakeClient(initial: StoredCompetency[] = []) {
  const rowsRef: { current: StoredCompetency[] } = { current: [...initial] };
  const upsert = vi.fn(
    async (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const v = (Array.isArray(values) ? values[0] : values) as Record<
        string,
        unknown
      >;
      rowsRef.current.push({
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
  const updateEq = vi.fn(async () => ({ error: null as null }));
  const update = vi.fn((values: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      rowsRef.current = rowsRef.current
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
  const store = { rowsRef, upsert, update, updateEq };

  const buildSelectChain = () => {
    let filteredLevelId: string | null = null;
    const chain = {
      is: vi.fn(() => chain),
      in: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      or: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      eq: vi.fn((col: string, val: string) => {
        if (col === "level_id") filteredLevelId = val;
        return chain;
      }),
      order: vi.fn(() => chain),
      limit: vi.fn(async () => ({
        data: rowsRef.current.filter(
          (r) =>
            r.deleted_at === null &&
            (filteredLevelId === null || r.level_id === filteredLevelId),
        ) as unknown as Record<string, unknown>[],
        error: null,
      })),
    };
    return chain;
  };

  const client: SupabaseLike = {
    from: () => ({
      upsert,
      select: vi.fn(() => buildSelectChain()),
      update,
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
