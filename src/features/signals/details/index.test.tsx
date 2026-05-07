import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoredSignal } from "#/features/signals/components/InboxView";
import { SignalDetail } from "./index";

const baseSignal: Omit<StoredSignal, "kind" | "id"> = {
  provider: "github",
  source_id: "x",
  title: "x",
  url: null,
  payload: {},
  requires_action: false,
  source_created_at: "2026-05-04T15:00:00Z",
  dismissed_at: null,
};

describe("SignalDetail dispatcher", () => {
  it("renders TaskDetail for ticket signals", () => {
    const signal: StoredSignal = {
      ...baseSignal,
      id: "t",
      kind: "ticket_assigned",
      payload: { identifier: "ENG-1" },
    };
    render(<SignalDetail signal={signal} />);
    expect(screen.getByText("ENG-1")).toBeTruthy();
  });

  it("renders MeetingDetail for meeting signals", () => {
    const signal: StoredSignal = {
      ...baseSignal,
      id: "m",
      kind: "meeting",
      payload: { organizer: "boss@acme.com" },
    };
    render(<SignalDetail signal={signal} />);
    expect(screen.getByText("boss@acme.com")).toBeTruthy();
  });

  it("returns null (no crash) for groups not yet routed", () => {
    const slackSignal: StoredSignal = { ...baseSignal, id: "s", kind: "dm" };
    const { container } = render(<SignalDetail signal={slackSignal} />);
    expect(container.firstChild).toBeNull();
    const prSignal: StoredSignal = {
      ...baseSignal,
      id: "p",
      kind: "pr_review_requested",
    };
    const { container: c2 } = render(<SignalDetail signal={prSignal} />);
    expect(c2.firstChild).toBeNull();
  });
});
