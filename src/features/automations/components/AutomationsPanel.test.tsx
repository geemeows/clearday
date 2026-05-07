import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AutomationRunRow } from "#/features/automations/api";
import { AutomationsPanel } from "#/features/automations/components/AutomationsPanel";
import type { Automation } from "#/features/automations/engine";
import { AUTOMATION_TEMPLATES } from "#/features/automations/templates";

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

describe("AutomationsPanel empty-state Browse templates", () => {
  it("renders both '+ New automation' and 'Browse templates' on the empty state", async () => {
    renderPanel({
      loader: vi.fn(async () => ({ automations: [] })),
    });
    expect(await screen.findByText(/No automations yet/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /\+ New automation/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Browse templates" })).toBeTruthy();
  });

  it("opens the templates modal listing the fixture templates", async () => {
    renderPanel({
      loader: vi.fn(async () => ({ automations: [] })),
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Browse templates" }),
    );
    expect(await screen.findByLabelText("Automation templates")).toBeTruthy();
    for (const tpl of AUTOMATION_TEMPLATES) {
      expect(screen.getByText(tpl.automation.name)).toBeTruthy();
    }
  });

  it("clicking 'Use template' opens the builder pre-filled with that template", async () => {
    const saver = vi.fn(async () => ({ ok: true }));
    renderPanel({
      loader: vi.fn(async () => ({ automations: [] })),
      saver,
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Browse templates" }),
    );
    const tpl = AUTOMATION_TEMPLATES[0];
    if (!tpl) throw new Error("expected at least one template");
    fireEvent.click(
      await screen.findByLabelText(`Use template ${tpl.automation.name}`),
    );
    // Builder dialog opens with the template's name pre-filled.
    const nameInput = (await screen.findByLabelText(
      "Automation name",
    )) as HTMLInputElement;
    expect(nameInput.value).toBe(tpl.automation.name);
    // Trigger select reflects the template's trigger_kind.
    const trigger = screen.getByLabelText(
      "Trigger kind",
    ) as unknown as HTMLSelectElement;
    expect(trigger.value).toBe(tpl.automation.trigger_kind);
    // No save until the user confirms — cancelling leaves no row in `automations`.
    expect(saver).not.toHaveBeenCalled();
  });

  it("cancelling the builder after picking a template does not persist a row", async () => {
    const saver = vi.fn(async () => ({ ok: true }));
    renderPanel({
      loader: vi.fn(async () => ({ automations: [] })),
      saver,
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Browse templates" }),
    );
    const tpl = AUTOMATION_TEMPLATES[0];
    if (!tpl) throw new Error("expected at least one template");
    fireEvent.click(
      await screen.findByLabelText(`Use template ${tpl.automation.name}`),
    );
    await screen.findByLabelText("Automation name");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Automation name")).toBeNull();
    });
    expect(saver).not.toHaveBeenCalled();
  });
});

describe("AutomationsPanel count strip", () => {
  it("renders the active / paused / dry-run summary above the cards", async () => {
    const mixed: Automation[] = [
      automation({ id: "a-1", name: "A1", enabled: true }),
      automation({ id: "a-2", name: "A2", enabled: true }),
      automation({ id: "a-3", name: "A3", enabled: false }),
      { ...automation({ id: "a-4", name: "A4", enabled: true }), dry_run: true },
    ];
    renderPanel({ loader: vi.fn(async () => ({ automations: mixed })) });
    const strip = await screen.findByLabelText("Automations summary");
    expect(strip.textContent).toBe("2 active · 1 paused · 1 dry-run");
  });

  it("hides the summary when the list is empty", async () => {
    renderPanel({ loader: vi.fn(async () => ({ automations: [] })) });
    expect(await screen.findByText(/No automations yet/)).toBeTruthy();
    expect(screen.queryByLabelText("Automations summary")).toBeNull();
  });

  it("updates reactively when an automation is toggled", async () => {
    renderPanel();
    const strip = await screen.findByLabelText("Automations summary");
    expect(strip.textContent).toBe("3 active · 0 paused · 0 dry-run");
    fireEvent.click(screen.getByLabelText("Snooze deps enabled"));
    await waitFor(() => {
      expect(
        screen.getByLabelText("Automations summary").textContent,
      ).toBe("2 active · 1 paused · 0 dry-run");
    });
  });
});

describe("AutomationsPanel dry-run toggle", () => {
  it("reflects the persisted dry_run flag in the builder checkbox", async () => {
    const dryList: Automation[] = [
      { ...automation({ id: "a-1", name: "Dry one" }), dry_run: true },
    ];
    renderPanel({ loader: vi.fn(async () => ({ automations: dryList })) });
    fireEvent.click(await screen.findByText("Edit"));
    const checkbox = (await screen.findByLabelText(
      "Dry-run mode",
    )) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("toggling on and saving persists dry_run: true on the automation", async () => {
    const saver = vi.fn<(next: Automation[]) => Promise<{ ok: true }>>(
      async () => ({ ok: true }),
    );
    const single: Automation[] = [automation({ id: "a-1", name: "Snooze deps" })];
    renderPanel({ loader: vi.fn(async () => ({ automations: single })), saver });
    fireEvent.click(await screen.findByText("Edit"));
    const checkbox = (await screen.findByLabelText(
      "Dry-run mode",
    )) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saver).toHaveBeenCalledTimes(1));
    const saved = saver.mock.calls[0]?.[0] ?? [];
    const target = saved.find((a) => a.id === "a-1");
    expect(target?.dry_run).toBe(true);
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

describe("AutomationsPanel runs view", () => {
  it("loads and renders runs in a dialog when the Runs button is clicked", async () => {
    const runs: AutomationRunRow[] = [
      {
        id: "r-1",
        automation_id: "a-1",
        trigger_event_id: "evt-1",
        signal_id: "sig-1",
        status: "succeeded",
        actions_planned: [{ type: "tag", tag: "x" }],
        actions_executed: [{ type: "tag", ok: true }],
        error: null,
        started_at: "2026-05-07T12:00:00.000Z",
        finished_at: "2026-05-07T12:00:01.000Z",
      },
      {
        id: "r-2",
        automation_id: "a-1",
        trigger_event_id: "evt-2",
        signal_id: null,
        status: "failed",
        actions_planned: [{ type: "tag", tag: "x" }],
        actions_executed: [{ type: "tag", ok: false, error: "boom" }],
        error: "boom",
        started_at: "2026-05-07T11:00:00.000Z",
        finished_at: "2026-05-07T11:00:01.000Z",
      },
    ];
    const runsLoader = vi.fn(async () => ({ runs }));
    renderPanel({ runsLoader });
    const runsButton = await screen.findByLabelText(
      "View runs for Snooze deps",
    );
    fireEvent.click(runsButton);
    expect(runsLoader).toHaveBeenCalledWith("a-1");
    await waitFor(() => {
      expect(screen.getByLabelText("Automation runs")).toBeTruthy();
    });
    expect(screen.getByText(/Runs · Snooze deps/)).toBeTruthy();
    const statusChips = screen.getAllByLabelText("Run status");
    expect(statusChips.map((el) => el.textContent)).toEqual([
      "succeeded",
      "failed",
    ]);
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("renders the empty-state copy when the automation has no runs", async () => {
    const runsLoader = vi.fn(async () => ({ runs: [] }));
    renderPanel({ runsLoader });
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps"),
    );
    await waitFor(() => {
      expect(screen.getByText(/No runs yet/)).toBeTruthy();
    });
  });

  it("surfaces a runs-loader failure inline in the dialog", async () => {
    const runsLoader = vi.fn(async () => {
      throw new Error("network down");
    });
    renderPanel({ runsLoader });
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps"),
    );
    await waitFor(() => {
      expect(screen.getByText("network down")).toBeTruthy();
    });
  });
});

describe("AutomationsPanel dry-run button", () => {
  it("posts to the dry-run invoker, surfaces the result, and reloads runs", async () => {
    const dryRunRow: AutomationRunRow = {
      id: "r-dry",
      automation_id: "a-1",
      trigger_event_id: "dryrun:a-1:2026-05-07T13:00:00.000Z",
      signal_id: null,
      status: "skipped_dry_run",
      actions_planned: [{ type: "tag", tag: "x" }],
      actions_executed: [],
      error: null,
      started_at: "2026-05-07T13:00:00.000Z",
      finished_at: "2026-05-07T13:00:00.000Z",
    };
    const runsLoader = vi
      .fn<(id: string) => Promise<{ runs: AutomationRunRow[] }>>()
      .mockResolvedValueOnce({ runs: [] })
      .mockResolvedValueOnce({ runs: [dryRunRow] });
    const dryRunInvoker = vi.fn(async () => ({
      ok: true as const,
      status: "skipped_dry_run",
      trigger_event_id: dryRunRow.trigger_event_id,
    }));
    renderPanel({ runsLoader, dryRunInvoker });
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps"),
    );
    await waitFor(() => {
      expect(screen.getByText(/No runs yet/)).toBeTruthy();
    });
    fireEvent.click(
      screen.getByLabelText("Test automation in dry-run mode"),
    );
    await waitFor(() => {
      expect(dryRunInvoker).toHaveBeenCalledWith("a-1");
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Dry-run result").textContent).toBe(
        "Dry-run skipped_dry_run",
      );
    });
    await waitFor(() => {
      expect(runsLoader).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.getAllByLabelText("Run status").map((el) => el.textContent),
    ).toEqual(["skipped_dry_run"]);
  });

  it("surfaces a dry-run invoker failure inline without clobbering runs", async () => {
    const runsLoader = vi.fn(async () => ({ runs: [] }));
    const dryRunInvoker = vi.fn(async () => ({
      ok: false as const,
      error: "automation not found",
    }));
    renderPanel({ runsLoader, dryRunInvoker });
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps"),
    );
    await screen.findByText(/No runs yet/);
    fireEvent.click(
      screen.getByLabelText("Test automation in dry-run mode"),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Dry-run result").textContent).toBe(
        "Dry-run failed: automation not found",
      );
    });
    expect(runsLoader).toHaveBeenCalledTimes(1);
  });
});
