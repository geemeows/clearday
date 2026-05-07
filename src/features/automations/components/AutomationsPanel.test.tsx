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
