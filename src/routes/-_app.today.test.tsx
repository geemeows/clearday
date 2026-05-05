import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toMeetingEvents } from "#/lib/calendar-view";
import type { BriefingResult } from "#/lib/morning-briefing";
import type { StoredSignal } from "#/lib/next-up";
import {
  BriefingCard,
  InboxPreviewCard,
  InProgressCard,
  NextUpCard,
  TodayScheduleCard,
  TodayView,
  WeekStatsCard,
} from "#/routes/_app.today";

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

describe("BriefingCard", () => {
  const okResult: BriefingResult = {
    ok: true,
    text: "Lead with the design review at 10:30, then knock out the two PRs awaiting your review.",
    provider: "openai",
    model: "gpt-4o-mini",
    used_fallback: false,
    generated_at: "2026-05-04T08:00:00.000Z",
    cached: false,
  };

  it("renders the briefing text and provider/model attribution on success", async () => {
    const generator = vi.fn(async () => okResult);
    render(<BriefingCard generator={generator} />);
    await waitFor(() => screen.getByText(/Lead with the design review/));
    expect(screen.getByText(/openai · gpt-4o-mini/)).toBeTruthy();
    expect(generator).toHaveBeenCalledWith(false);
  });

  it("renders the no-provider prompt with a link to Settings", async () => {
    const generator = vi.fn(
      async (): Promise<BriefingResult> => ({
        ok: false,
        reason: "no_provider",
      }),
    );
    render(<BriefingCard generator={generator} />);
    await waitFor(() => screen.getByText(/No AI provider configured/));
    const link = screen.getByRole("link", { name: /AI provider/i });
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("shows a fallback-model badge when the budget meter swapped models", async () => {
    const generator = vi.fn(
      async (): Promise<BriefingResult> => ({
        ...okResult,
        used_fallback: true,
      }),
    );
    render(<BriefingCard generator={generator} />);
    await waitFor(() => screen.getByText(/running on fallback model/));
  });

  it("shows the budget-reached message when refused", async () => {
    const generator = vi.fn(
      async (): Promise<BriefingResult> => ({
        ok: false,
        reason: "budget_reached",
      }),
    );
    render(<BriefingCard generator={generator} />);
    await waitFor(() => screen.getByText(/monthly budget reached/i));
  });

  it("keeps the existing briefing visible when Regenerate hits the daily cap", async () => {
    const generator = vi
      .fn<(force: boolean) => Promise<BriefingResult>>()
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce({ ok: false, reason: "regenerate_limit" });
    render(<BriefingCard generator={generator} />);
    await waitFor(() => screen.getByText(/Lead with the design review/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    });
    await waitFor(() => screen.getByText(/Daily regenerate limit reached/i));
    // Cached briefing text stays visible alongside the warning.
    expect(screen.getByText(/Lead with the design review/)).toBeTruthy();
  });

  it("calls generator with force=true when Regenerate is clicked", async () => {
    const generator = vi
      .fn<(force: boolean) => Promise<BriefingResult>>()
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce({ ...okResult, text: "Refreshed briefing." });
    render(<BriefingCard generator={generator} />);
    await waitFor(() => screen.getByText(/Lead with the design review/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    });
    await waitFor(() => screen.getByText(/Refreshed briefing/));
    expect(generator).toHaveBeenNthCalledWith(2, true);
  });
});

describe("TodayScheduleCard", () => {
  it("renders today's meetings with Join links and a time range", () => {
    const events = toMeetingEvents([meetingSignal("evt-1")]);
    render(
      <TodayScheduleCard
        events={events}
        now={new Date("2026-05-04T12:00:00.000Z")}
      />,
    );
    const card = screen.getByRole("article", { name: /today schedule/i });
    expect(card.textContent).toContain("Standup");
    expect(
      screen.getByRole("link", { name: /^join$/i }).getAttribute("href"),
    ).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("renders an empty-state when nothing is scheduled today", () => {
    render(
      <TodayScheduleCard
        events={[]}
        now={new Date("2026-05-04T12:00:00.000Z")}
      />,
    );
    expect(screen.getByText(/no meetings today/i)).toBeTruthy();
  });
});

describe("InboxPreviewCard", () => {
  const prSignal = (
    id: string,
    requires_action: boolean,
    createdAt: string,
  ): StoredSignal => ({
    id,
    provider: "github",
    kind: requires_action ? "pr_review_requested" : "pr_authored",
    source_id: id,
    title: `PR ${id}`,
    url: `https://github.com/acme/web/pull/${id}`,
    payload: {},
    requires_action,
    source_created_at: createdAt,
    dismissed_at: null,
  });

  it("renders top actionable signals with an Open-all link", async () => {
    const loader = vi.fn(async () => [
      prSignal("1", false, "2026-05-04T08:00:00.000Z"),
      prSignal("2", true, "2026-05-04T10:00:00.000Z"),
    ]);
    render(<InboxPreviewCard loader={loader} limit={3} />);
    await waitFor(() => screen.getByText("PR 2"));
    expect(screen.getByText("PR 1")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /open all/i }).getAttribute("href"),
    ).toBe("/inbox");
  });

  it("renders an empty-state when nothing is actionable", async () => {
    const loader = vi.fn(async () => [] as StoredSignal[]);
    render(<InboxPreviewCard loader={loader} />);
    await waitFor(() => screen.getByText(/inbox zero/i));
  });

  it("surfaces a load error", async () => {
    const loader = vi.fn(async () => {
      throw new Error("network down");
    });
    render(<InboxPreviewCard loader={loader} />);
    await waitFor(() => screen.getByText(/network down/i));
  });
});

describe("InProgressCard", () => {
  const ticket = (
    id: string,
    kind:
      | "ticket_in_progress"
      | "ticket_in_review"
      | "ticket_blocked"
      | "ticket_assigned",
  ): StoredSignal => ({
    id,
    provider: "linear",
    kind,
    source_id: id,
    title: `Ticket ${id}`,
    url: `https://linear.app/x/issue/${id}`,
    payload: {},
    requires_action: kind !== "ticket_in_progress",
    source_created_at: "2026-05-04T08:00:00.000Z",
    dismissed_at: null,
  });

  it("renders tickets with their status label and an Open link", async () => {
    const loader = vi.fn(async () => [
      ticket("ENG-1", "ticket_in_progress"),
      ticket("ENG-2", "ticket_blocked"),
    ]);
    render(<InProgressCard loader={loader} />);
    await waitFor(() => screen.getByText("Ticket ENG-1"));
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: /^open$/i })[0].getAttribute("href"),
    ).toBe("https://linear.app/x/issue/ENG-1");
  });

  it("renders an empty-state with a Settings link when nothing is in progress", async () => {
    const loader = vi.fn(async () => [] as StoredSignal[]);
    render(<InProgressCard loader={loader} />);
    await waitFor(() => screen.getByText(/Connect Linear or Jira/i));
    expect(
      screen.getByRole("link", { name: /settings/i }).getAttribute("href"),
    ).toBe("/settings");
  });
});

describe("WeekStatsCard", () => {
  const now = new Date("2026-05-04T12:00:00.000Z");

  it("renders the four counts from the loaded signals", async () => {
    const loader = vi.fn(
      async (_since: string) =>
        [
          // PR reviewed (acted, in window)
          {
            id: "p1",
            provider: "github",
            kind: "pr_review_requested",
            source_id: "p1",
            title: "PR p1",
            url: null,
            payload: {},
            requires_action: false,
            source_created_at: "2026-05-02T09:00:00.000Z",
            dismissed_at: null,
          },
          // Ticket shipped (dismissed in window)
          {
            id: "t1",
            provider: "linear",
            kind: "ticket_in_progress",
            source_id: "t1",
            title: "Ticket t1",
            url: null,
            payload: {},
            requires_action: false,
            source_created_at: "2026-04-20T09:00:00.000Z",
            dismissed_at: "2026-05-02T09:00:00.000Z",
          },
          // Meeting attended
          {
            id: "m1",
            provider: "google",
            kind: "meeting",
            source_id: "m1",
            title: "Standup",
            url: null,
            payload: { starts_at: "2026-05-03T10:00:00.000Z" },
            requires_action: false,
            source_created_at: "2026-05-03T10:00:00.000Z",
            dismissed_at: null,
          },
        ] as StoredSignal[],
    );
    render(<WeekStatsCard now={now} loader={loader} />);
    await waitFor(() => {
      const card = screen.getByRole("article", { name: /this week/i });
      expect(card.textContent).toContain("PRs reviewed");
    });
    const card = screen.getByRole("article", { name: /this week/i });
    // Each stat is rendered as label + value pair; assert via dt/dd.
    const dts = card.querySelectorAll("dt");
    const dds = card.querySelectorAll("dd");
    const map: Record<string, string> = {};
    dts.forEach((dt, i) => {
      map[dt.textContent ?? ""] = dds[i]?.textContent ?? "";
    });
    expect(map["PRs reviewed"]).toBe("1");
    expect(map["Tickets shipped"]).toBe("1");
    expect(map.Meetings).toBe("1");
    expect(map["Mentions handled"]).toBe("0");
  });

  it("passes a 7-day-ago ISO `since` to the loader", async () => {
    const loader = vi.fn(async (_since: string) => [] as StoredSignal[]);
    render(<WeekStatsCard now={now} loader={loader} />);
    await waitFor(() => expect(loader).toHaveBeenCalled());
    const since = loader.mock.calls[0][0];
    expect(since).toBe("2026-04-27T12:00:00.000Z");
  });

  it("surfaces a load error", async () => {
    const loader = vi.fn(async (_since: string) => {
      throw new Error("boom");
    });
    render(<WeekStatsCard now={now} loader={loader} />);
    await waitFor(() => screen.getByText(/boom/i));
  });
});
