import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoredSignal } from "#/features/signals/components/InboxView";
import { TaskDetail } from "./task";

const ticketSignal: StoredSignal = {
  id: "t1",
  provider: "linear",
  kind: "ticket_assigned",
  source_id: "ENG-123",
  title: "Fix flaky retry test",
  url: null,
  payload: {
    identifier: "ENG-123",
    state_name: "In progress",
    priority_label: "High",
    team_key: "ENG",
  },
  requires_action: false,
  source_created_at: "2026-05-04T15:00:00Z",
  dismissed_at: null,
};

describe("TaskDetail", () => {
  it("renders without crashing for a representative ticket signal", () => {
    render(<TaskDetail signal={ticketSignal} />);
    expect(screen.getByText("ENG-123")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("ENG")).toBeTruthy();
  });

  it("omits rows whose payload fields are missing", () => {
    const sparse: StoredSignal = { ...ticketSignal, payload: {} };
    const { container } = render(<TaskDetail signal={sparse} />);
    expect(container.querySelectorAll("dt").length).toBe(0);
  });
});
