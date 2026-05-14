import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationRunRow } from "#/features/automations/api";
import { AutomationsPanel } from "#/features/automations/components/AutomationsPanel";
import type { Automation } from "#/features/automations/engine";
import { AUTOMATION_TEMPLATES } from "#/features/automations/templates";
import type { StoredSignal } from "#/shared/signal";

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

function renderPanel(
  props: Partial<Parameters<typeof AutomationsPanel>[0]> = {},
) {
  const loader = props.loader ?? vi.fn(async () => ({ automations: list }));
  const saver = props.saver ?? vi.fn(async () => ({ ok: true }));
  const signalsLoader = props.signalsLoader ?? vi.fn(async () => []);
  const latestFailuresLoader =
    props.latestFailuresLoader ?? vi.fn(async () => ({ failures: [] }));
  return render(
    <AutomationsPanel
      loader={loader}
      saver={saver}
      signalsLoader={signalsLoader}
      latestFailuresLoader={latestFailuresLoader}
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
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("Delete Snooze deps (detail)"),
    );
    expect(await screen.findByText("Delete automation")).toBeTruthy();
    expect(screen.getByText(/also purges its run history/i)).toBeTruthy();
    expect(saver).not.toHaveBeenCalled();
    expect(screen.getAllByText("Snooze deps").length).toBeGreaterThan(0);
  });

  it("Cancel closes the dialog and keeps the automation", async () => {
    const saver = vi.fn(async () => ({ ok: true }));
    renderPanel({ saver });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("Delete Snooze deps (detail)"),
    );
    await screen.findByText("Delete automation");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByText("Delete automation")).toBeNull();
    });
    expect(saver).not.toHaveBeenCalled();
    expect(screen.getAllByText("Snooze deps").length).toBeGreaterThan(0);
  });

  it("Confirm persists the list without the deleted row", async () => {
    const saver = vi.fn<(next: Automation[]) => Promise<{ ok: true }>>(
      async () => ({ ok: true }),
    );
    renderPanel({ saver });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("Delete Snooze deps (detail)"),
    );
    fireEvent.click(await screen.findByLabelText("Confirm delete automation"));
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
    fireEvent.click(await screen.findByLabelText("Open PR merged → ticket Done"));
    fireEvent.click(
      await screen.findByLabelText("Edit PR merged → ticket Done (detail)"),
    );
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
    expect(
      screen.getByRole("button", { name: "Browse templates" }),
    ).toBeTruthy();
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
      {
        ...automation({ id: "a-4", name: "A4", enabled: true }),
        dry_run: true,
      },
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
      expect(screen.getByLabelText("Automations summary").textContent).toBe(
        "2 active · 1 paused · 0 dry-run",
      );
    });
  });
});

describe("AutomationsPanel dry-run toggle", () => {
  it("reflects the persisted dry_run flag in the builder checkbox", async () => {
    const dryList: Automation[] = [
      { ...automation({ id: "a-1", name: "Dry one" }), dry_run: true },
    ];
    renderPanel({ loader: vi.fn(async () => ({ automations: dryList })) });
    fireEvent.click(await screen.findByLabelText("Open Dry one"));
    fireEvent.click(await screen.findByLabelText("Edit Dry one (detail)"));
    const checkbox = (await screen.findByLabelText(
      "Dry-run mode",
    )) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("toggling on and saving persists dry_run: true on the automation", async () => {
    const saver = vi.fn<(next: Automation[]) => Promise<{ ok: true }>>(
      async () => ({ ok: true }),
    );
    const single: Automation[] = [
      automation({ id: "a-1", name: "Snooze deps" }),
    ];
    renderPanel({
      loader: vi.fn(async () => ({ automations: single })),
      saver,
    });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(await screen.findByLabelText("Edit Snooze deps (detail)"));
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
    expect(
      await screen.findByLabelText("Toggle empty state preview"),
    ).toBeTruthy();
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
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    const runsButton = await screen.findByLabelText(
      "View runs for Snooze deps (detail)",
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
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps (detail)"),
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
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps (detail)"),
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
      .mockResolvedValueOnce({ runs: [] })
      .mockResolvedValueOnce({ runs: [dryRunRow] });
    const dryRunInvoker = vi.fn(async () => ({
      ok: true as const,
      status: "skipped_dry_run",
      trigger_event_id: dryRunRow.trigger_event_id,
    }));
    renderPanel({ runsLoader, dryRunInvoker });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps (detail)"),
    );
    await waitFor(() => {
      expect(screen.getByText(/No runs yet/)).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText("Test automation in dry-run mode"));
    await waitFor(() => {
      expect(dryRunInvoker).toHaveBeenCalledWith("a-1");
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Dry-run result").textContent).toBe(
        "Dry-run skipped_dry_run",
      );
    });
    await waitFor(() => {
      expect(runsLoader).toHaveBeenCalledTimes(3);
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
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps (detail)"),
    );
    await screen.findByText(/No runs yet/);
    fireEvent.click(screen.getByLabelText("Test automation in dry-run mode"));
    await waitFor(() => {
      expect(screen.getByLabelText("Dry-run result").textContent).toBe(
        "Dry-run failed: automation not found",
      );
    });
    expect(runsLoader).toHaveBeenCalledTimes(2);
  });
});

describe("AutomationsPanel runs histogram", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-07T15:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function run(
    overrides: Partial<AutomationRunRow> & {
      status: AutomationRunRow["status"];
      started_at: string;
    },
  ): AutomationRunRow {
    return {
      id: overrides.id ?? `r-${overrides.started_at}`,
      automation_id: overrides.automation_id ?? "a-1",
      trigger_event_id:
        overrides.trigger_event_id ?? `evt-${overrides.started_at}`,
      signal_id: overrides.signal_id ?? null,
      status: overrides.status,
      actions_planned: overrides.actions_planned ?? [],
      actions_executed: overrides.actions_executed ?? [],
      error: overrides.error ?? null,
      started_at: overrides.started_at,
      finished_at: overrides.finished_at ?? overrides.started_at,
    };
  }

  it("renders 14 day-slots above the runs table with stacked segments and tooltips", async () => {
    const runs: AutomationRunRow[] = [
      run({ status: "succeeded", started_at: "2026-05-07T01:00:00.000Z" }),
      run({ status: "succeeded", started_at: "2026-05-07T02:00:00.000Z" }),
      run({ status: "failed", started_at: "2026-05-07T03:00:00.000Z" }),
      run({
        status: "skipped_dry_run",
        started_at: "2026-05-06T05:00:00.000Z",
      }),
    ];
    const runsLoader = vi.fn(async () => ({ runs }));
    renderPanel({ runsLoader });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps (detail)"),
    );
    const histogram = await screen.findByLabelText("Runs histogram (14-day)");
    const slots = histogram.querySelectorAll("[aria-label*='·']");
    expect(slots.length).toBe(14);
    const today = histogram.querySelector(
      "[aria-label^='May 7']",
    ) as HTMLElement | null;
    expect(today).not.toBeNull();
    expect(today?.getAttribute("aria-label")).toBe(
      "May 7 · 2 succeeded · 1 failed · 0 dry-run",
    );
    expect(today?.querySelector("[data-segment='succeeded']")).not.toBeNull();
    expect(today?.querySelector("[data-segment='failed']")).not.toBeNull();
    expect(today?.querySelector("[data-segment='skipped_dry_run']")).toBeNull();
    const yesterday = histogram.querySelector(
      "[aria-label^='May 6']",
    ) as HTMLElement | null;
    expect(yesterday?.getAttribute("aria-label")).toBe(
      "May 6 · 0 succeeded · 0 failed · 1 dry-run",
    );
    expect(
      yesterday?.querySelector("[data-segment='skipped_dry_run']"),
    ).not.toBeNull();
  });

  it("renders zero-run days as empty slots (axis label present, no bar drawn)", async () => {
    const runs: AutomationRunRow[] = [
      run({ status: "succeeded", started_at: "2026-05-07T01:00:00.000Z" }),
    ];
    const runsLoader = vi.fn(async () => ({ runs }));
    renderPanel({ runsLoader });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps (detail)"),
    );
    const histogram = await screen.findByLabelText("Runs histogram (14-day)");
    const empty = histogram.querySelector(
      "[aria-label^='Apr 30']",
    ) as HTMLElement | null;
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute("aria-label")).toBe(
      "Apr 30 · 0 succeeded · 0 failed · 0 dry-run",
    );
    expect(empty?.querySelector("[data-segment]")).toBeNull();
  });

  it("does not render the histogram when there are no runs", async () => {
    const runsLoader = vi.fn(async () => ({ runs: [] }));
    renderPanel({ runsLoader });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("View runs for Snooze deps (detail)"),
    );
    await screen.findByText(/No runs yet/);
    expect(screen.queryByLabelText("Runs histogram (14-day)")).toBeNull();
  });
});

describe("AutomationsPanel builder live preview", () => {
  function signal(overrides: Partial<StoredSignal> = {}): StoredSignal {
    return {
      provider: overrides.provider ?? "github",
      kind: overrides.kind ?? "mention",
      source_id: overrides.source_id ?? "s-1",
      title: overrides.title ?? "Untitled",
      url: overrides.url ?? null,
      payload: overrides.payload ?? {},
      requires_action: overrides.requires_action ?? false,
      source_created_at: overrides.source_created_at ?? null,
      id: overrides.id ?? "row-1",
      unread_count: overrides.unread_count ?? 0,
      created_at: overrides.created_at ?? "2026-05-07T00:00:00Z",
      updated_at: overrides.updated_at ?? "2026-05-07T00:00:00Z",
      dismissed_at: overrides.dismissed_at ?? null,
      priority: overrides.priority ?? null,
      snoozed_until: overrides.snoozed_until ?? null,
      alert_channels_override: overrides.alert_channels_override ?? null,
      tags: overrides.tags ?? null,
    };
  }

  it("renders matching signals scoped to the editing automation in the builder", async () => {
    const signals: StoredSignal[] = [
      signal({
        id: "row-1",
        source_id: "s-1",
        kind: "mention",
        title: "Mention from Alice",
      }),
      signal({
        id: "row-2",
        source_id: "s-2",
        kind: "pr_review_requested",
        title: "PR review on repo/x",
      }),
    ];
    const single: Automation[] = [
      automation({ id: "a-1", name: "Snooze deps" }),
    ];
    renderPanel({
      loader: vi.fn(async () => ({ automations: single })),
      signalsLoader: vi.fn(async () => signals),
    });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(await screen.findByLabelText("Edit Snooze deps (detail)"));
    await screen.findByLabelText("Builder live preview");
    await waitFor(() => {
      expect(
        screen.getByText("1 of 2 recent Signals match these predicates."),
      ).toBeTruthy();
    });
    const preview = screen.getByLabelText(
      "Builder live preview",
    ) as HTMLElement;
    expect(preview.textContent).toContain("Mention from Alice");
    expect(preview.textContent).not.toContain("PR review on repo/x");
  });

  it("updates the match count live as predicates are edited", async () => {
    const signals: StoredSignal[] = [
      signal({
        id: "row-1",
        source_id: "s-1",
        kind: "mention",
        title: "Mention one",
      }),
      signal({
        id: "row-2",
        source_id: "s-2",
        kind: "pr_review_requested",
        title: "PR review on repo/x",
      }),
    ];
    const single: Automation[] = [
      automation({ id: "a-1", name: "Snooze deps" }),
    ];
    renderPanel({
      loader: vi.fn(async () => ({ automations: single })),
      signalsLoader: vi.fn(async () => signals),
    });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(await screen.findByLabelText("Edit Snooze deps (detail)"));
    await waitFor(() => {
      expect(
        screen.getByText("1 of 2 recent Signals match these predicates."),
      ).toBeTruthy();
    });
    const kindInput = screen.getByLabelText("Kind value") as HTMLInputElement;
    fireEvent.change(kindInput, { target: { value: "pr_review_requested" } });
    await waitFor(() => {
      expect(
        screen.getByText("1 of 2 recent Signals match these predicates."),
      ).toBeTruthy();
    });
    const preview = screen.getByLabelText(
      "Builder live preview",
    ) as HTMLElement;
    expect(preview.textContent).toContain("PR review on repo/x");
    expect(preview.textContent).not.toContain("Mention one");
  });
});

function failureRow(
  overrides: Partial<AutomationRunRow> = {},
): AutomationRunRow {
  return {
    id: overrides.id ?? "r-fail-1",
    automation_id: overrides.automation_id ?? "a-1",
    trigger_event_id: overrides.trigger_event_id ?? "evt-1",
    signal_id: overrides.signal_id ?? null,
    status: "failed",
    actions_planned: overrides.actions_planned ?? [],
    actions_executed: overrides.actions_executed ?? [],
    error: overrides.error ?? "boom",
    started_at: overrides.started_at ?? "2026-05-07T12:00:00.000Z",
    finished_at: overrides.finished_at ?? "2026-05-07T12:00:01.000Z",
  };
}

describe("AutomationsPanel inline failure surfacing", () => {
  it("renders the latest failure error inline on the matching row", async () => {
    renderPanel({
      latestFailuresLoader: vi.fn(async () => ({
        failures: [
          failureRow({
            automation_id: "a-2",
            error: "rate_limit_exceeded: 60 actions/minute",
          }),
        ],
      })),
    });
    const failureLabel = await screen.findByLabelText(
      "Last failure for Mute weekend pings",
    );
    expect(failureLabel.textContent).toContain(
      "rate_limit_exceeded: 60 actions/minute",
    );
    // Other rows have no failure surfaced.
    expect(screen.queryByLabelText("Last failure for Snooze deps")).toBeNull();
    expect(
      screen.queryByLabelText("Last failure for Tag dependabot PRs"),
    ).toBeNull();
  });

  it("renders nothing when there are no failures", async () => {
    renderPanel({
      latestFailuresLoader: vi.fn(async () => ({ failures: [] })),
    });
    await screen.findByText("Snooze deps");
    expect(screen.queryByLabelText(/^Last failure for/)).toBeNull();
  });
});

describe("AutomationsPanel row chips", () => {
  it("renders a Dry-run chip on rows persisted with dry_run", async () => {
    const mixed: Automation[] = [
      automation({ id: "a-1", name: "Snooze deps" }),
      { ...automation({ id: "a-2", name: "Dry one" }), dry_run: true },
    ];
    renderPanel({ loader: vi.fn(async () => ({ automations: mixed })) });
    await screen.findByText("Dry one");
    const chip = screen.getByLabelText("Dry one dry-run");
    expect(chip.textContent).toBe("Dry-run");
    expect(screen.queryByLabelText("Snooze deps dry-run")).toBeNull();
  });

  it("renders a Deferred chip when an action's capability isn't wired", async () => {
    const deferredList: Automation[] = [
      automation({
        id: "a-1",
        name: "Ticket mover",
        actions: [{ type: "transition_ticket", to_status: "in_review" }],
      }),
      automation({ id: "a-2", name: "Plain tagger" }),
    ];
    renderPanel({
      loader: vi.fn(async () => ({ automations: deferredList })),
    });
    await screen.findByText("Ticket mover");
    const chips = screen.getAllByLabelText(
      "Includes a not-yet-wired capability",
    );
    expect(chips.length).toBe(1);
    expect(chips[0]?.textContent).toBe("Deferred");
  });

  it("renders a Fail chip on the row with the latest failure", async () => {
    renderPanel({
      latestFailuresLoader: vi.fn(async () => ({
        failures: [failureRow({ automation_id: "a-3" })],
      })),
    });
    await screen.findByLabelText("Last failure for Tag dependabot PRs");
    const chips = screen.getAllByLabelText("Last run failed");
    expect(chips.length).toBe(1);
    expect(chips[0]?.textContent).toBe("Fail");
  });

  it("renders the trigger label chip and action label on each row", async () => {
    const list: Automation[] = [
      automation({
        id: "a-1",
        name: "Solo action",
        trigger_kind: "signal_ingested",
        actions: [{ type: "tag", tag: "ship" }],
      }),
      automation({
        id: "a-2",
        name: "Multi action",
        trigger_kind: "signal_ingested",
        actions: [
          { type: "tag", tag: "ship" },
          { type: "snooze", minutes: 30 },
        ],
      }),
    ];
    renderPanel({ loader: vi.fn(async () => ({ automations: list })) });
    await screen.findByText("Solo action");
    expect(screen.getAllByText("Signal ingested").length).toBe(2);
    expect(screen.getByText("Tag")).toBeTruthy();
    expect(screen.getByText("2 actions")).toBeTruthy();
  });

  it("status dot reflects fail > dry > ok precedence", async () => {
    const mixed: Automation[] = [
      automation({ id: "a-1", name: "Healthy" }),
      { ...automation({ id: "a-2", name: "Dryish" }), dry_run: true },
      automation({ id: "a-3", name: "Broken" }),
    ];
    renderPanel({
      loader: vi.fn(async () => ({ automations: mixed })),
      latestFailuresLoader: vi.fn(async () => ({
        failures: [failureRow({ automation_id: "a-3" })],
      })),
    });
    await screen.findByLabelText("Last failure for Broken");
    expect(screen.getAllByLabelText("Last run ok").length).toBe(1);
    expect(screen.getAllByLabelText("Last run dry").length).toBe(1);
    expect(screen.getAllByLabelText("Last run fail").length).toBe(1);
  });
});

describe("AutomationsPanel card-as-click-target (Slice 8.3e)", () => {
  it("list card itself is the open-detail click target — no inline Open/Edit/Delete/Runs buttons", async () => {
    renderPanel();
    const card = await screen.findByLabelText("Open Snooze deps");
    expect(card.getAttribute("role")).toBe("button");
    // The card is the click target; per-row Open / Edit / Delete / Runs buttons
    // are gone — those affordances now live in the detail-mode header.
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Runs" })).toBeNull();
    expect(screen.queryByLabelText("Delete Snooze deps")).toBeNull();
    fireEvent.click(card);
    expect(
      await screen.findByLabelText("Automation detail Snooze deps"),
    ).toBeTruthy();
  });

  it("clicking the Switch on the card toggles enabled without opening detail (stops propagation)", async () => {
    const saver = vi.fn<(next: Automation[]) => Promise<{ ok: true }>>(
      async () => ({ ok: true }),
    );
    renderPanel({ saver });
    const toggle = await screen.findByLabelText("Snooze deps enabled");
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(saver).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByLabelText("Automation detail Snooze deps")).toBeNull();
    expect(screen.getByLabelText("Search automations")).toBeTruthy();
  });
});

describe("AutomationsPanel detail mode (Slice 8.3)", () => {
  it("clicking Open enters detail mode and renders the detail header + sentence summary", async () => {
    renderPanel();
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    expect(
      await screen.findByLabelText("Automation detail Snooze deps"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Snooze deps enabled (detail)"),
    ).toBeTruthy();
    // SentenceSummary pill rail + WHEN block both surface the trigger label
    expect(screen.getAllByText("Signal ingested").length).toBeGreaterThan(0);
    expect(screen.getByText("kind is mention")).toBeTruthy();
  });

  it("renders WHEN / IF / THEN detail blocks below the sentence summary", async () => {
    renderPanel();
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    await screen.findByLabelText("Automation detail Snooze deps");
    // WHEN block — TriggerSummary card (label + meta text)
    const whenBlock = screen.getByLabelText("When Snooze deps");
    expect(whenBlock.textContent).toMatch(/Signal ingested/);
    expect(whenBlock.textContent).toMatch(/new signal is ingested/);
    // IF block — PredicateLine: "kind" `is` `mention`
    const ifBlock = screen.getByLabelText("If Snooze deps");
    expect(ifBlock.textContent).toMatch(/^IF/);
    expect(ifBlock.textContent).toMatch(/kind/);
    expect(ifBlock.textContent).toMatch(/mention/);
    // THEN block — ActionPreviewCard with action label + kind tag
    const thenBlock = screen.getByLabelText("Then Snooze deps");
    expect(thenBlock.textContent).toMatch(/Tag/);
    expect(thenBlock.textContent).toMatch(/internal/);
  });

  it("breadcrumb root returns to list from detail", async () => {
    renderPanel();
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    await screen.findByLabelText("Automation detail Snooze deps");
    // Breadcrumb first crumb is a button labeled "Automations"; clicking
    // returns to the list (which renders the search input again).
    fireEvent.click(screen.getByRole("button", { name: "Automations" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Search automations")).toBeTruthy();
      expect(
        screen.queryByLabelText("Automation detail Snooze deps"),
      ).toBeNull();
    });
  });

  it("dry-run footer toggle persists dry_run: true on the open automation", async () => {
    const saver = vi.fn<(next: Automation[]) => Promise<{ ok: true }>>(
      async () => ({ ok: true }),
    );
    renderPanel({ saver });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(
      await screen.findByLabelText("Switch Snooze deps to dry-run"),
    );
    await waitFor(() => {
      expect(saver).toHaveBeenCalledTimes(1);
    });
    const persisted = saver.mock.calls[0]?.[0] ?? [];
    expect(persisted.find((a) => a.id === "a-1")?.dry_run).toBe(true);
  });

  it("Edit from detail enters builder mode", async () => {
    renderPanel();
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    fireEvent.click(await screen.findByLabelText("Edit Snooze deps (detail)"));
    expect(await screen.findByText("Edit automation")).toBeTruthy();
  });

  it("renders the RECENT RUNS strip with up to five run rows + Full history link", async () => {
    const runs: AutomationRunRow[] = Array.from({ length: 7 }, (_, i) => ({
      id: `r-${i}`,
      automation_id: "a-1",
      trigger_event_id: `evt-${i}`,
      signal_id: `sig-${i}`,
      status: i === 0 ? "failed" : "succeeded",
      actions_planned: [{ type: "tag", tag: "x" }],
      actions_executed: [{ type: "tag", ok: i !== 0 }],
      error: i === 0 ? "boom" : null,
      started_at: new Date(Date.now() - i * 60_000).toISOString(),
      finished_at: new Date(Date.now() - i * 60_000 + 500).toISOString(),
    }));
    const runsLoader = vi.fn(async () => ({ runs }));
    renderPanel({ runsLoader });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    await screen.findByLabelText("Automation detail Snooze deps");
    const recent = await screen.findByLabelText("Recent runs for Snooze deps");
    const rows = recent.querySelectorAll(
      "[aria-label^='Run status']",
    );
    expect(rows.length).toBe(5);
    expect(recent.textContent).toMatch(/boom/);
    expect(
      screen.getByLabelText("Full run history for Snooze deps"),
    ).toBeTruthy();
  });

  it("renders the dashed empty-state for an automation that hasn't fired yet", async () => {
    const runsLoader = vi.fn(async () => ({ runs: [] }));
    renderPanel({ runsLoader });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    await screen.findByLabelText("Automation detail Snooze deps");
    const recent = await screen.findByLabelText("Recent runs for Snooze deps");
    expect(recent.textContent).toMatch(/Hasn't fired yet/);
  });

  it("renders the LIVE PREVIEW pane against the open automation's predicates", async () => {
    const signals: StoredSignal[] = [
      {
        provider: "slack",
        kind: "mention",
        source_id: "s-1",
        title: "Mention from Alice",
        url: null,
        payload: {},
        requires_action: false,
        source_created_at: null,
        id: "row-1",
        unread_count: 0,
        created_at: "2026-05-07T00:00:00Z",
        updated_at: "2026-05-07T00:00:00Z",
        dismissed_at: null,
        priority: null,
        snoozed_until: null,
        alert_channels_override: null,
        tags: null,
      },
      {
        provider: "github",
        kind: "pr_review_requested",
        source_id: "s-2",
        title: "PR review on repo/x",
        url: null,
        payload: {},
        requires_action: false,
        source_created_at: null,
        id: "row-2",
        unread_count: 0,
        created_at: "2026-05-07T00:00:00Z",
        updated_at: "2026-05-07T00:00:00Z",
        dismissed_at: null,
        priority: null,
        snoozed_until: null,
        alert_channels_override: null,
        tags: null,
      },
    ];
    renderPanel({ signalsLoader: vi.fn(async () => signals) });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    const pane = await screen.findByLabelText(
      "Live preview for Snooze deps",
    );
    expect(pane.textContent).toMatch(/Last 2 signals/);
    expect(pane.textContent).toMatch(/1 match/);
    // The mention row matches "kind is mention"; the PR row does not.
    const matchRow = screen.getByLabelText("Live preview Mention from Alice");
    expect(matchRow.textContent).toMatch(/MATCH/);
    const missRow = screen.getByLabelText("Live preview PR review on repo/x");
    expect(missRow.textContent).toMatch(/no match/);
  });

  it("Full history link enters runs mode from detail", async () => {
    const runsLoader = vi.fn(async () => ({ runs: [] }));
    renderPanel({ runsLoader });
    fireEvent.click(await screen.findByLabelText("Open Snooze deps"));
    await screen.findByLabelText("Automation detail Snooze deps");
    fireEvent.click(
      await screen.findByLabelText("Full run history for Snooze deps"),
    );
    await waitFor(() => {
      expect(screen.getByText(/Runs · Snooze deps/)).toBeTruthy();
    });
  });
});
