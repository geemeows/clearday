import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutomationsPanel } from "#/features/automations/components/AutomationsPanel";
import type { Automation } from "#/features/automations/engine";

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: overrides.id ?? "a-1",
    name: overrides.name ?? "Snooze deps",
    enabled: overrides.enabled ?? true,
    priority: overrides.priority ?? 100,
    trigger_kind: "signal_ingested",
    predicates: overrides.predicates ?? [{ type: "kind", kind: "mention" }],
    actions: overrides.actions ?? [{ type: "tag", tag: "x" }],
  };
}

const list: Automation[] = [
  automation({ id: "a-1", name: "Snooze deps" }),
  automation({ id: "a-2", name: "Mute weekend pings" }),
  automation({ id: "a-3", name: "Tag dependabot PRs" }),
];

function renderPanel(props: Partial<Parameters<typeof AutomationsPanel>[0]> = {}) {
  const loader = props.loader ?? vi.fn(async () => ({ automations: list }));
  const saver = props.saver ?? vi.fn(async () => ({ ok: true }));
  const signalsLoader = props.signalsLoader ?? vi.fn(async () => []);
  return render(
    <AutomationsPanel
      loader={loader}
      saver={saver}
      signalsLoader={signalsLoader}
      {...props}
    />,
  );
}

describe("AutomationsPanel search", () => {
  it("renders the search input above the cards once loaded", async () => {
    renderPanel();
    expect(await screen.findByLabelText("Search automations")).toBeTruthy();
    expect(screen.getByText("Snooze deps")).toBeTruthy();
    expect(screen.getByText("Mute weekend pings")).toBeTruthy();
    expect(screen.getByText("Tag dependabot PRs")).toBeTruthy();
  });

  it("filters cards by case-insensitive substring on name (uncontrolled)", async () => {
    renderPanel();
    const input = (await screen.findByLabelText(
      "Search automations",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "DEP" } });
    await waitFor(() => {
      expect(screen.queryByText("Mute weekend pings")).toBeNull();
    });
    expect(screen.getByText("Snooze deps")).toBeTruthy();
    expect(screen.getByText("Tag dependabot PRs")).toBeTruthy();
  });

  it("renders a no-matches message distinct from the first-run empty state", async () => {
    renderPanel();
    const input = (await screen.findByLabelText(
      "Search automations",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzznope" } });
    expect(await screen.findByText(/No matches for/)).toBeTruthy();
    expect(screen.queryByText(/No automations yet/)).toBeNull();
  });

  it("uses the controlled q value and calls onQChange on input", async () => {
    const onQChange = vi.fn();
    const { rerender } = renderPanel({ q: "snooze", onQChange });
    await waitFor(() => {
      expect(screen.getByText("Snooze deps")).toBeTruthy();
    });
    expect(screen.queryByText("Mute weekend pings")).toBeNull();
    const input = screen.getByLabelText(
      "Search automations",
    ) as HTMLInputElement;
    expect(input.value).toBe("snooze");
    fireEvent.change(input, { target: { value: "mute" } });
    expect(onQChange).toHaveBeenCalledWith("mute");
    rerender(
      <AutomationsPanel
        loader={vi.fn(async () => ({ automations: list }))}
        saver={vi.fn(async () => ({ ok: true }))}
        signalsLoader={vi.fn(async () => [])}
        q="mute"
        onQChange={onQChange}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Mute weekend pings")).toBeTruthy();
    });
    expect(screen.queryByText("Snooze deps")).toBeNull();
  });

  it("still renders the first-run empty state when there are no automations", async () => {
    renderPanel({
      loader: vi.fn(async () => ({ automations: [] })),
    });
    expect(await screen.findByText(/No automations yet/)).toBeTruthy();
    expect(screen.queryByText(/No matches for/)).toBeNull();
  });
});

describe("AutomationsPanel delete-with-history-purge", () => {
  it("opens a confirmation dialog instead of deleting on first click", async () => {
    const saver = vi.fn(async () => ({ ok: true }));
    renderPanel({ saver });
    const deleteButton = await screen.findByLabelText("Delete Snooze deps");
    fireEvent.click(deleteButton);
    expect(await screen.findByText("Delete automation")).toBeTruthy();
    expect(
      screen.getByText(/also purges its run history/i),
    ).toBeTruthy();
    expect(saver).not.toHaveBeenCalled();
    expect(screen.getAllByText("Snooze deps").length).toBeGreaterThan(0);
  });

  it("Cancel closes the dialog and keeps the automation", async () => {
    const saver = vi.fn(async () => ({ ok: true }));
    renderPanel({ saver });
    fireEvent.click(await screen.findByLabelText("Delete Snooze deps"));
    await screen.findByText("Delete automation");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByText("Delete automation")).toBeNull();
    });
    expect(saver).not.toHaveBeenCalled();
    expect(screen.getByText("Snooze deps")).toBeTruthy();
  });

  it("Confirm persists the list without the deleted row", async () => {
    const saver = vi.fn<(next: Automation[]) => Promise<{ ok: true }>>(
      async () => ({ ok: true }),
    );
    renderPanel({ saver });
    fireEvent.click(await screen.findByLabelText("Delete Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("Confirm delete automation"),
    );
    await waitFor(() => {
      expect(saver).toHaveBeenCalledTimes(1);
    });
    const persisted = saver.mock.calls[0]?.[0] ?? [];
    expect(persisted.map((a) => a.id)).toEqual(["a-2", "a-3"]);
  });
});

describe("AutomationsPanel transition_ticket warning", () => {
  it("renders the deferred-capability warning when the action is selected in the builder", async () => {
    const transitionList: Automation[] = [
      automation({
        id: "a-1",
        name: "PR merged → ticket Done",
        actions: [{ type: "transition_ticket", to_status: "Done" }],
      }),
    ];
    renderPanel({
      loader: vi.fn(async () => ({ automations: transitionList })),
    });
    fireEvent.click(await screen.findByText("Edit"));
    expect(
      await screen.findByText(/Linear \/ Jira not yet integrated/i),
    ).toBeTruthy();
    expect(screen.getByLabelText("Transition to status")).toBeTruthy();
  });
});

describe("AutomationsPanel ?demo=1 empty-state toggle", () => {
  it("does not render the toggle when demo is false (default)", async () => {
    renderPanel();
    expect(await screen.findByText("Snooze deps")).toBeTruthy();
    expect(screen.queryByLabelText("Toggle empty state preview")).toBeNull();
  });

  it("renders the toggle when demo is true", async () => {
    renderPanel({ demo: true });
    expect(await screen.findByLabelText("Toggle empty state preview")).toBeTruthy();
    // Populated list still rendered initially.
    expect(screen.getByText("Snooze deps")).toBeTruthy();
  });

  it("flipping the toggle swaps the populated list for the empty state without touching data", async () => {
    const loader = vi.fn(async () => ({ automations: list }));
    const saver = vi.fn(async () => ({ ok: true }));
    renderPanel({ demo: true, loader, saver });
    const toggle = await screen.findByLabelText("Toggle empty state preview");
    expect(screen.getByText("Snooze deps")).toBeTruthy();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByText("Snooze deps")).toBeNull();
    });
    expect(screen.getByText(/No automations yet/)).toBeTruthy();
    // The search input is also hidden in the empty preview.
    expect(screen.queryByLabelText("Search automations")).toBeNull();
    // No DB writes.
    expect(saver).not.toHaveBeenCalled();
    // Loader fired exactly once on mount.
    expect(loader).toHaveBeenCalledTimes(1);

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByText("Snooze deps")).toBeTruthy();
    });
    expect(saver).not.toHaveBeenCalled();
  });
});
