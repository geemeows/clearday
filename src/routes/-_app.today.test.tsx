import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoredSignal } from "#/lib/next-up";
import { NextUpCard, TodayView } from "#/routes/_app.today";

const meetingSignal = (id = "m1"): StoredSignal => ({
  id,
  provider: "google",
  kind: "meeting",
  source_id: id,
  title: "Standup",
  url: "https://calendar.google.com/event?eid=evt-1",
  payload: {
    starts_at: "2026-05-04T12:30:00.000Z",
    ends_at: "2026-05-04T12:45:00.000Z",
    video_link: "https://meet.google.com/abc-defg-hij",
    linked_items: [
      {
        kind: "pr",
        url: "https://github.com/acme/web/pull/123",
        repo: "acme/web",
        number: 123,
      },
    ],
  },
  requires_action: false,
  source_created_at: "2026-05-04T12:30:00.000Z",
  dismissed_at: null,
});

describe("NextUpCard", () => {
  it("renders title, countdown, Join, and linked PR", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    render(
      <NextUpCard
        now={now}
        meeting={{
          signal: meetingSignal(),
          startsAt: new Date("2026-05-04T12:30:00.000Z"),
          endsAt: new Date("2026-05-04T12:45:00.000Z"),
          videoLink: "https://meet.google.com/abc-defg-hij",
          linkedItems: [
            {
              kind: "pr",
              url: "https://github.com/acme/web/pull/123",
              repo: "acme/web",
              number: 123,
            },
          ],
        }}
      />,
    );
    const card = screen.getByRole("article", { name: /next up/i });
    expect(card.textContent).toContain("Standup");
    expect(card.textContent).toContain("in 30m");
    const join = screen.getByRole("link", { name: /^join$/i });
    expect(join.getAttribute("href")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    const pr = screen.getByRole("link", { name: "acme/web#123" });
    expect(pr.getAttribute("href")).toBe(
      "https://github.com/acme/web/pull/123",
    );
  });

  it("shows an empty-state copy when nothing is upcoming", () => {
    render(
      <NextUpCard meeting={null} now={new Date("2026-05-04T12:00:00.000Z")} />,
    );
    expect(screen.getByText(/Nothing on your calendar/i)).toBeTruthy();
  });
});

describe("TodayView 10-min alert", () => {
  it("renders the alert toast when an alertSignal is supplied and dismisses on click", () => {
    const onDismissAlert = vi.fn();
    render(
      <TodayView
        meetings={[meetingSignal()]}
        nextUp={null}
        now={new Date("2026-05-04T12:20:00.000Z")}
        error={null}
        alertSignal={meetingSignal()}
        onDismissAlert={onDismissAlert}
      />,
    );
    expect(screen.getByLabelText("Meeting starting soon")).toBeTruthy();
    expect(screen.getByText("Starts in 10 minutes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /dismiss alert/i }));
    expect(onDismissAlert).toHaveBeenCalled();
  });

  it("does not render an alert toast when no alertSignal is set", () => {
    render(
      <TodayView
        meetings={[]}
        nextUp={null}
        now={new Date("2026-05-04T12:00:00.000Z")}
        error={null}
        alertSignal={null}
        onDismissAlert={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Meeting starting soon")).toBeNull();
  });
});
