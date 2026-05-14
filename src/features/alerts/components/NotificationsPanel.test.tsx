import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotificationsPanel } from "#/features/alerts/components/NotificationsPanel";

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
