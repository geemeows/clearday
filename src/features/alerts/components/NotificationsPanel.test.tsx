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

  it("renders the quiet hours strip with weekday/weekend labels", () => {
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
});
