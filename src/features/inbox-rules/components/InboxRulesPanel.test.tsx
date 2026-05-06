import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InboxRule } from "#/features/inbox-rules/engine";
import type { StoredSignal } from "#/shared/signal";
import { InboxRulesPanel } from "./InboxRulesPanel";

describe("InboxRulesPanel", () => {
  const sampleRule: InboxRule = {
    id: "r-1",
    name: "Snooze deps",
    enabled: true,
    priority: 1,
    predicates: [
      { type: "source_match", field: "author", equals: "dependabot" },
    ],
    effects: [{ type: "snooze", minutes: 60 }],
  };

  it("loads existing rules and renders one row per rule", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn();
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    const name = (await screen.findByLabelText(
      "Rule name",
    )) as HTMLInputElement;
    expect(name.value).toBe("Snooze deps");
  });

  it("adds a new rule through the saver when 'Add rule' is clicked", async () => {
    const loader = vi.fn(async () => ({ rules: [] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    const add = await screen.findByRole("button", { name: /add rule/i });
    fireEvent.click(add);
    await waitFor(() => expect(saver).toHaveBeenCalled());
    const saved = saver.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("New rule");
  });

  it("deletes a rule through the saver", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    const del = await screen.findByRole("button", { name: /delete rule/i });
    fireEvent.click(del);
    await waitFor(() => expect(saver).toHaveBeenCalledWith([]));
  });

  it("toggles enabled state", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    await screen.findByLabelText("Rule name");
    const enabled = screen.getByLabelText(/enabled/i) as HTMLInputElement;
    fireEvent.click(enabled);
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith([
        expect.objectContaining({ enabled: false }),
      ]),
    );
  });

  it("surfaces saver-reported errors", async () => {
    const loader = vi.fn(async () => ({ rules: [] }));
    const saver = vi.fn(async () => ({ ok: false, error: "boom" }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    fireEvent.click(await screen.findByRole("button", { name: /add rule/i }));
    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy());
  });

  it("renders a live preview of recent Signals matched by the rules", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn();
    const previewSignals: StoredSignal[] = [
      {
        id: "s-1",
        provider: "github",
        kind: "pr_review_requested",
        source_id: "pr-1",
        title: "chore: bump deps",
        url: null,
        payload: { author: "dependabot" },
        requires_action: true,
        source_created_at: "2026-05-04T10:00:00.000Z",
        unread_count: 0,
        created_at: "2026-05-04T10:00:00.000Z",
        updated_at: "2026-05-04T10:00:00.000Z",
        dismissed_at: null,
        priority: null,
        snoozed_until: null,
        alert_channels_override: null,
        tags: null,
      },
      {
        id: "s-2",
        provider: "github",
        kind: "pr_review_requested",
        source_id: "pr-2",
        title: "feat: thing",
        url: null,
        payload: { author: "alice" },
        requires_action: true,
        source_created_at: "2026-05-04T10:00:00.000Z",
        unread_count: 0,
        created_at: "2026-05-04T10:00:00.000Z",
        updated_at: "2026-05-04T10:00:00.000Z",
        dismissed_at: null,
        priority: null,
        snoozed_until: null,
        alert_channels_override: null,
        tags: null,
      },
    ];
    const signalsLoader = vi.fn(async () => previewSignals);
    render(
      <InboxRulesPanel
        loader={loader}
        saver={saver}
        signalsLoader={signalsLoader}
      />,
    );
    await screen.findByLabelText("Rule name");
    await waitFor(() =>
      expect(screen.getByText(/1 of 2 recent Signals/i)).toBeTruthy(),
    );
    expect(screen.getByText("chore: bump deps")).toBeTruthy();
    expect(screen.getByText(/Snooze deps/)).toBeTruthy();
  });

  it("switches the effect to a priority override", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    await screen.findByLabelText("Rule name");
    const effectSelect = screen.getByLabelText(/effect type/i);
    fireEvent.change(effectSelect, { target: { value: "priority" } });
    await waitFor(() => expect(saver).toHaveBeenCalled());
    const saved = saver.mock.calls.at(-1)?.[0] as InboxRule[];
    expect(saved[0].effects[0]).toEqual({ type: "priority", value: "high" });
    const value = await screen.findByLabelText(/priority value/i);
    fireEvent.change(value, { target: { value: "low" } });
    await waitFor(() => {
      const last = saver.mock.calls.at(-1)?.[0] as InboxRule[];
      expect(last[0].effects[0]).toEqual({ type: "priority", value: "low" });
    });
  });

  it("switches the effect to a channels override and edits the channel set", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    await screen.findByLabelText("Rule name");
    const effectSelect = screen.getByLabelText(/effect type/i);
    fireEvent.change(effectSelect, { target: { value: "channels" } });
    await waitFor(() => expect(saver).toHaveBeenCalled());
    const seeded = saver.mock.calls.at(-1)?.[0] as InboxRule[];
    expect(seeded[0].effects[0]).toEqual({
      type: "channels",
      channels: ["slack_dm"],
    });
    const emailToggle = await screen.findByLabelText(/email/i);
    fireEvent.click(emailToggle);
    await waitFor(() => {
      const last = saver.mock.calls.at(-1)?.[0] as InboxRule[];
      expect(last[0].effects[0]).toEqual({
        type: "channels",
        channels: ["slack_dm", "email"],
      });
    });
  });

  it("reorders rules via the move buttons", async () => {
    const r1 = { ...sampleRule, id: "a", name: "A", priority: 1 };
    const r2 = { ...sampleRule, id: "b", name: "B", priority: 2 };
    const loader = vi.fn(async () => ({ rules: [r1, r2] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    await screen.findAllByLabelText("Rule name");
    const moveDownButtons = screen.getAllByRole("button", {
      name: /move down/i,
    });
    fireEvent.click(moveDownButtons[0]);
    await waitFor(() => expect(saver).toHaveBeenCalled());
    const saved = saver.mock.calls[0][0];
    expect(saved.map((r: InboxRule) => r.id)).toEqual(["b", "a"]);
  });
});
