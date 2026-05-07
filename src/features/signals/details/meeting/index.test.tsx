import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoredSignal } from "#/features/signals/components/InboxView";
import { MeetingDetail } from "./index";

const meetingSignal: StoredSignal = {
  id: "m1",
  provider: "google",
  kind: "meeting",
  source_id: "evt-1",
  title: "Standup",
  url: null,
  payload: {
    starts_at: "2026-05-04T15:00:00Z",
    ends_at: "2026-05-04T15:15:00Z",
    organizer: "boss@acme.com",
    description: "- Token refresh\n- Retry budget",
    attendees: [{ email: "p@acme.com", name: "Priya", response: "accepted" }],
  },
  requires_action: false,
  source_created_at: "2026-05-04T15:00:00Z",
  dismissed_at: null,
};

describe("MeetingDetail", () => {
  it("renders without crashing for a representative meeting signal", () => {
    render(<MeetingDetail signal={meetingSignal} />);
    expect(screen.getByText("boss@acme.com")).toBeTruthy();
    expect(screen.getByText("Token refresh")).toBeTruthy();
    expect(screen.getByText("Retry budget")).toBeTruthy();
    expect(screen.getByText(/1 attendee/)).toBeTruthy();
  });
});
