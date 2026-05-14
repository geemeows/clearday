import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxRule } from "#/features/alerts/rules/api";
import { NotificationsPanel } from "#/features/alerts/components/NotificationsPanel";

// ---------------------------------------------------------------------------
// Fetch stub helpers for InboxRulesPanel tests
// ---------------------------------------------------------------------------

function makeInboxRule(overrides: Partial<InboxRule> = {}): InboxRule {
  return {
    id: "rule-1",
    name: "Auto-snooze dependabot",
    match_all: true,
    conditions: [{ field: "author", op: "is", value: "dependabot" }],
    action: "snooze",
    action_param: "1 day",
    enabled: true,
    hits_30d: 47,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const FIXTURE_INBOX_RULES: InboxRule[] = [
  makeInboxRule({ id: "r1", conditions: [{ field: "author", op: "is", value: "dependabot" }], action: "snooze", action_param: "1 day", enabled: true, hits_30d: 47 }),
  makeInboxRule({ id: "r2", conditions: [{ field: "channel", op: "is", value: "#eng-announce" }], action: "low", action_param: null, enabled: true, hits_30d: 12 }),
  makeInboxRule({ id: "r3", conditions: [{ field: "labels include", op: "all of", value: "lockfile" }], action: "dismiss", action_param: null, enabled: false, hits_30d: 31 }),
  makeInboxRule({ id: "r4", conditions: [{ field: "title contains", op: "matches", value: "prod" }], action: "bypass", action_param: null, enabled: true, hits_30d: 4 }),
  makeInboxRule({ id: "r5", conditions: [{ field: "source", op: "is", value: "calendar" }], action: "weekly", action_param: null, enabled: false, hits_30d: 8 }),
];

function stubFetch(rules: InboxRule[] = FIXTURE_INBOX_RULES) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? "";
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/inbox-rules" && method === "GET") {
      return new Response(JSON.stringify({ rules }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("/api/inbox-rules/") && method === "PATCH") {
      const id = url.replace("/api/inbox-rules/", "");
      const body = init?.body ? JSON.parse(init.body as string) as { enabled: boolean } : { enabled: true };
      const updated = rules.map((r) => r.id === id ? { ...r, ...body } : r);
      return new Response(JSON.stringify({ ok: true, rule: updated.find((r) => r.id === id) }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "unexpected" }), { status: 500 });
  });
}

describe("NotificationsPanel", () => {
  it("renders the four channel rows with Test + Switch", () => {
    render(<NotificationsPanel />);
    const list = screen.getByLabelText("Notification channels");
    for (const label of [
      "PWA Web Push",
      "Slack self-DM",
      "Email digest",
      "Desktop banner",
    ]) {
      expect(within(list).getByText(label)).toBeTruthy();
      expect(within(list).getByLabelText(`Test ${label}`)).toBeTruthy();
      expect(within(list).getByLabelText(`${label} enabled`)).toBeTruthy();
    }
  });

  it("toggling a channel switch flips aria-checked", () => {
    render(<NotificationsPanel />);
    const toggle = screen.getByLabelText("PWA Web Push enabled");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("renders the per-event matrix and clicking a cell flips its state", () => {
    render(<NotificationsPanel />);
    const cell = screen.getByLabelText("PR review via Email");
    expect(cell.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(cell);
    expect(cell.getAttribute("aria-checked")).toBe("true");
  });

  it("renders the quiet hours strip with weekday/weekend labels (default weekday-weekend mode)", () => {
    render(<NotificationsPanel />);
    const strip = screen.getByLabelText("Quiet hours week strip");
    expect(within(strip).getAllByText("22:00–08:00").length).toBe(5);
    expect(within(strip).getAllByText("all day").length).toBe(2);
  });

  it("toggling quiet hours flips its switch", () => {
    render(<NotificationsPanel />);
    const toggle = screen.getByLabelText("Quiet hours enabled");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("renders the default allow-through pills and supports add/remove", () => {
    render(<NotificationsPanel />);
    const pills = screen.getByLabelText("Allow through pills");
    for (const name of ["@mentions", "CI red on prod", "On-call pages"]) {
      expect(within(pills).getByText(name)).toBeTruthy();
    }
    fireEvent.click(within(pills).getByLabelText("Remove @mentions"));
    expect(within(pills).queryByText("@mentions")).toBeNull();

    const input = within(pills).getByLabelText(
      "Add allow-through rule",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Pager escalations" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(within(pills).getByText("Pager escalations")).toBeTruthy();
  });

  describe("InboxRulesPanel (Slice 9.3c)", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { fetchSpy = stubFetch(); });
    afterEach(() => { fetchSpy.mockRestore(); });

    it("renders api-loaded rules with WHEN / THEN labels and hit counts", async () => {
      render(<NotificationsPanel />);
      const list = await screen.findByLabelText("Inbox rules list");
      expect(within(list).getByText("author is dependabot")).toBeTruthy();
      expect(within(list).getByText("Snooze 1 day")).toBeTruthy();
      expect(within(list).getByText("47 hits / 30d")).toBeTruthy();
    });

    it("renders active count summary", async () => {
      render(<NotificationsPanel />);
      // 3 of 5 rules are enabled (r1, r2, r4)
      await waitFor(() =>
        expect(screen.getByText("3 of 5 active · evaluated in order, top-down")).toBeTruthy(),
      );
    });

    it("toggling a rule switch calls PATCH and reload", async () => {
      render(<NotificationsPanel />);
      const toggle = await screen.findByLabelText("Rule 1 enabled");
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      fireEvent.click(toggle);
      await waitFor(() =>
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("/api/inbox-rules/r1"),
          expect.objectContaining({ method: "PATCH" }),
        ),
      );
    });

    it("clicking New rule shows the RuleBuilder and Cancel hides it", () => {
      render(<NotificationsPanel />);
      expect(screen.queryByLabelText("New rule builder")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /new rule/i }));
      expect(screen.getByLabelText("New rule builder")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(screen.queryByLabelText("New rule builder")).toBeNull();
    });

    it("RuleBuilder: Add condition adds a row; Remove condition removes it", () => {
      render(<NotificationsPanel />);
      fireEvent.click(screen.getByRole("button", { name: /new rule/i }));
      // starts with 1 condition (condition 1 field)
      expect(screen.getByLabelText("Condition 1 field")).toBeTruthy();
      fireEvent.click(screen.getByLabelText("Add condition"));
      expect(screen.getByLabelText("Condition 2 field")).toBeTruthy();
      fireEvent.click(screen.getByLabelText("Remove condition 2"));
      expect(screen.queryByLabelText("Condition 2 field")).toBeNull();
    });
  });

  describe("schedule mode tabs (Slice 9.3b)", () => {
    it("renders the three mode tab buttons", () => {
      render(<NotificationsPanel />);
      expect(screen.getByText("Same every day")).toBeTruthy();
      expect(screen.getByText("Weekday / weekend")).toBeTruthy();
      expect(screen.getByText("Per day")).toBeTruthy();
    });

    it("default mode is weekday-weekend — shows Mon–Fri and Sat–Sun rows", () => {
      render(<NotificationsPanel />);
      expect(screen.getByText("Mon–Fri")).toBeTruthy();
      expect(screen.getByText("Sat–Sun")).toBeTruthy();
      expect(screen.getByLabelText("Weekday quiet start")).toBeTruthy();
      expect(screen.getByLabelText("Weekday quiet end")).toBeTruthy();
    });

    it("switching to uniform mode shows the uniform row with overnight/same-day note", () => {
      render(<NotificationsPanel />);
      fireEvent.click(screen.getByText("Same every day"));
      expect(screen.getByText("Every day from")).toBeTruthy();
      expect(screen.getByLabelText("Uniform quiet start")).toBeTruthy();
      expect(screen.getByLabelText("Uniform quiet end")).toBeTruthy();
      // default 22:00 > 08:00 → "overnight"
      expect(screen.getByText("overnight")).toBeTruthy();
    });

    it("switching to per-day mode shows 7 day rows", () => {
      render(<NotificationsPanel />);
      fireEvent.click(screen.getByText("Per day"));
      for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
        expect(screen.getByLabelText(`Quiet hours ${day} on`)).toBeTruthy();
        expect(screen.getByLabelText(`Quiet start ${day}`)).toBeTruthy();
        expect(screen.getByLabelText(`Quiet end ${day}`)).toBeTruthy();
      }
    });

    it("switching to uniform updates the week strip to show the same time for all 7 days", () => {
      render(<NotificationsPanel />);
      fireEvent.click(screen.getByText("Same every day"));
      const strip = screen.getByLabelText("Quiet hours week strip");
      // default uniform 22:00–08:00 shows on all 7 days
      expect(within(strip).getAllByText("22:00–08:00").length).toBe(7);
    });

    it("week strip shows 'off' for all days when quiet hours disabled", () => {
      render(<NotificationsPanel />);
      const toggle = screen.getByLabelText("Quiet hours enabled");
      fireEvent.click(toggle);
      const strip = screen.getByLabelText("Quiet hours week strip");
      expect(within(strip).getAllByText("off").length).toBe(7);
    });
  });
});
