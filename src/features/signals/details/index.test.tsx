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

  it("renders SlackDetail for slack signals", () => {
    const signal: StoredSignal = {
      ...baseSignal,
      id: "s",
      provider: "slack",
      kind: "dm",
      payload: {
        channel: "C1",
        channel_name: "engineering",
        author_name: "Alice",
      },
    };
    render(<SignalDetail signal={signal} />);
    expect(screen.getByText("#engineering")).toBeTruthy();
  });

  it("renders PRDetail for pr signals", () => {
    const signal: StoredSignal = {
      ...baseSignal,
      id: "p",
      kind: "pr_review_requested",
      payload: { ai_summary: "summary text" },
    };
    render(<SignalDetail signal={signal} />);
    expect(screen.getByText("summary text")).toBeTruthy();
  });
});
