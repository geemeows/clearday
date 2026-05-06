import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextUpHero } from "#/features/today/NextUpHero";
import type { NextUpMeeting } from "#/features/signals/views/today";
import type { StoredSignal } from "#/shared/signal";

const meetingSignal: StoredSignal = {
  id: "m1",
  provider: "google",
  kind: "meeting",
  source_id: "m1",
  title: "Standup",
  url: "https://calendar.google.com/event?eid=evt-1",
  payload: {},
  requires_action: false,
  source_created_at: "2026-05-04T12:30:00.000Z",
  unread_count: 0,
  created_at: "2026-05-04T12:30:00.000Z",
  updated_at: "2026-05-04T12:30:00.000Z",
  dismissed_at: null,
  priority: null,
  snoozed_until: null,
  alert_channels_override: null,
  tags: null,
};

const meeting = (overrides: Partial<NextUpMeeting> = {}): NextUpMeeting => ({
  signal: meetingSignal,
  startsAt: new Date("2026-05-04T12:13:00.000Z"),
  endsAt: new Date("2026-05-04T12:30:00.000Z"),
  videoLink: "https://meet.google.com/abc-defg-hij",
  linkedItems: [],
  ...overrides,
});

describe("NextUpHero", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when there is no meeting", () => {
    const { container } = render(
      <NextUpHero
        meeting={null}
        now={new Date("2026-05-04T12:00:00.000Z")}
        alertArmed={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the meeting title and a Join meeting link to the video URL", () => {
    render(
      <NextUpHero
        meeting={meeting()}
        now={new Date("2026-05-04T12:00:00.000Z")}
        alertArmed={false}
      />,
    );
    expect(screen.getByText("Standup")).toBeTruthy();
    const join = screen.getByRole("link", { name: /join meeting/i });
    expect(join.getAttribute("href")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    const agenda = screen.getByRole("link", { name: /open agenda/i });
    expect(agenda.getAttribute("href")).toBe(
      "https://calendar.google.com/event?eid=evt-1",
    );
  });

  it("shows the alert-armed chip and a Skip 10-min alert button when armed", () => {
    const onSkipAlert = vi.fn();
    render(
      <NextUpHero
        meeting={meeting()}
        now={new Date("2026-05-04T12:00:00.000Z")}
        alertArmed={true}
        onSkipAlert={onSkipAlert}
      />,
    );
    expect(screen.getByText(/10-min alert armed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /skip 10-min alert/i }));
    expect(onSkipAlert).toHaveBeenCalledOnce();
  });

  it("hides the Skip alert button when not armed", () => {
    render(
      <NextUpHero
        meeting={meeting()}
        now={new Date("2026-05-04T12:00:00.000Z")}
        alertArmed={false}
        onSkipAlert={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /skip 10-min alert/i })).toBeNull();
  });

  it("renders agenda items derived from linked invite items", () => {
    render(
      <NextUpHero
        meeting={meeting({
          linkedItems: [
            {
              kind: "pr",
              url: "https://github.com/acme/web/pull/123",
              repo: "acme/web",
              number: 123,
            },
          ],
        })}
        now={new Date("2026-05-04T12:00:00.000Z")}
        alertArmed={false}
      />,
    );
    const agendaLink = screen.getByRole("link", { name: /acme\/web #123/i });
    expect(agendaLink.getAttribute("href")).toBe(
      "https://github.com/acme/web/pull/123",
    );
  });

  it("renders the countdown ring with mm:ss", () => {
    render(
      <NextUpHero
        meeting={meeting()}
        now={new Date("2026-05-04T12:00:00.000Z")}
        alertArmed={false}
      />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("aria-label")).toBe("13:00 remaining");
  });
});
