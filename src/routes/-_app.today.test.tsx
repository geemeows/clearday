import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { BriefingResult } from "#/features/briefing/morning-briefing";
import { UpcomingEventsCard } from "#/features/signals/components/UpcomingEventsCard";
import { toMeetingEvents } from "#/features/calendar/events";
import { PulseCard } from "#/features/today/PulseCard";
import {
  BriefingCard,
  formatGreeting,
  InboxPreviewCard,
  InProgressCard,
  renderBold,
  TodaySchedule,
  TodayView,
} from "#/routes/_app.today";
import type { StoredSignal } from "#/shared/signal";

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
  unread_count: 0,
  created_at: "2026-05-04T12:30:00.000Z",
  updated_at: "2026-05-04T12:30:00.000Z",
  dismissed_at: null,
  priority: null,
  snoozed_until: null,
  alert_channels_override: null,
  tags: null,
});

describe("UpcomingEventsCard", () => {
  it("renders a list of upcoming meetings with Join links and no countdown", () => {
    render(
      <UpcomingEventsCard
        meetings={[
          {
            signal: meetingSignal("m1"),
            startsAt: new Date("2026-05-04T12:30:00.000Z"),
            endsAt: new Date("2026-05-04T12:45:00.000Z"),
            videoLink: "https://meet.google.com/abc-defg-hij",
            linkedItems: [],
          },
          {
            signal: { ...meetingSignal("m2"), title: "Design review" },
            startsAt: new Date("2026-05-04T15:00:00.000Z"),
            endsAt: null,
            videoLink: null,
            linkedItems: [],
          },
        ]}
      />,
    );
    const card = screen.getByRole("article", { name: /upcoming events/i });
    expect(card.textContent).toContain("Standup");
    expect(card.textContent).toContain("Design review");
    expect(screen.queryByRole("timer")).toBeNull();
    const join = screen.getByRole("link", { name: /^join$/i });
    expect(join.getAttribute("href")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("shows an empty-state copy when nothing is upcoming", () => {
    render(<UpcomingEventsCard meetings={[]} />);
    expect(screen.getByText(/Nothing on your calendar/i)).toBeTruthy();
  });
});

describe("TodayView greeting + alerts", () => {
  it("renders the greeting heading and the summary line", () => {
    render(
      <TodayView
        meetings={[]}
        error={null}
        alertSignal={null}
        onDismissAlert={() => {}}
        greeting="Good afternoon, Erin"
        summary="No meetings today"
      />,
    );
    expect(
      screen.getByRole("heading", { name: /good afternoon, erin/i }),
    ).toBeTruthy();
    expect(screen.getByText(/no meetings today/i)).toBeTruthy();
  });

  it("renders the alert toast when an alertSignal is supplied and dismisses on click", () => {
    const onDismissAlert = vi.fn();
    render(
      <TodayView
        meetings={[meetingSignal()]}
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
        error={null}
        alertSignal={null}
        onDismissAlert={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Meeting starting soon")).toBeNull();
  });
});

describe("formatGreeting", () => {
  it("includes the user's first name when known", () => {
    const at = (h: number) => new Date(2026, 4, 4, h, 0, 0);
    expect(formatGreeting(at(8), "Erin")).toBe("Good morning, Erin");
    expect(formatGreeting(at(14), "Erin")).toBe("Good afternoon, Erin");
    expect(formatGreeting(at(20), "Erin")).toBe("Good evening, Erin");
  });

  it("falls back to a name-less greeting", () => {
    const at = (h: number) => new Date(2026, 4, 4, h, 0, 0);
    expect(formatGreeting(at(10), null)).toBe("Good morning");
  });
});

describe("renderBold", () => {
  it("wraps **bold** markers in <strong>", () => {
    const out = renderBold("Lead with **design review**, then PRs.");
    const { container } = render(<p>{out}</p>);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("design review");
    expect(container.textContent).toBe("Lead with design review, then PRs.");
  });

  it("passes plain text through untouched", () => {
    const { container } = render(<p>{renderBold("nothing here")}</p>);
    expect(container.textContent).toBe("nothing here");
    expect(container.querySelector("strong")).toBeNull();
  });
});

describe("BriefingCard", () => {
  const okResult: BriefingResult = {
    ok: true,
    text: "Lead with the **design review** at 10:30, then knock out the two PRs awaiting your review.",
    provider: "openai",
    model: "haiku-4-5",
    used_fallback: false,
    generated_at: "2026-05-04T08:00:00.000Z",
    cached: false,
  };

  it("renders briefing text with **bold** parsed and a model footer", async () => {
    const generator = vi.fn(async () => okResult);
    const { container } = render(<BriefingCard generator={generator} />);
    await waitFor(() => screen.getByText(/Lead with the/i));
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("design review");
    expect(screen.getByText(/HAIKU-4-5/)).toBeTruthy();
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
    await waitFor(() => screen.getByText(/running on fallback model/i));
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
    await waitFor(() => screen.getByText(/Lead with the/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    });
    await waitFor(() => screen.getByText(/Daily regenerate limit reached/i));
    // Cached briefing text stays visible alongside the warning.
    expect(screen.getByText(/Lead with the/)).toBeTruthy();
  });

  it("calls generator with force=true when Regenerate is clicked", async () => {
    const generator = vi
      .fn<(force: boolean) => Promise<BriefingResult>>()
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce({ ...okResult, text: "Refreshed briefing." });
    render(<BriefingCard generator={generator} />);
    await waitFor(() => screen.getByText(/Lead with the/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    });
    await waitFor(() => screen.getByText(/Refreshed briefing/));
    expect(generator).toHaveBeenNthCalledWith(2, true);
  });
});

describe("TodaySchedule", () => {
  it("renders today's meetings with a Join link and a time label", () => {
    const events = toMeetingEvents([meetingSignal("evt-1")]);
    render(
      <TodaySchedule
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
      <TodaySchedule events={[]} now={new Date("2026-05-04T12:00:00.000Z")} />,
    );
    expect(screen.getByText(/no meetings today/i)).toBeTruthy();
  });

  it("highlights the current block with a NOW chip", () => {
    const events = toMeetingEvents([meetingSignal("evt-1")]);
    render(
      <TodaySchedule
        events={events}
        // 12:35 is between starts (12:30) and ends (12:45).
        now={new Date("2026-05-04T12:35:00.000Z")}
      />,
    );
    const now = screen.getByText("NOW");
    expect(now).toBeTruthy();
    const item = now.closest("li");
    expect(item?.getAttribute("aria-current")).toBe("true");
  });

  it("renders focus blocks in solid ink", () => {
    const focusSignal: StoredSignal = {
      ...meetingSignal("focus-1"),
      title: "Focus: deep work",
      payload: {
        starts_at: "2026-05-04T13:00:00.000Z",
        ends_at: "2026-05-04T14:00:00.000Z",
        is_focus: true,
      },
    };
    const events = toMeetingEvents([focusSignal]);
    const { container } = render(
      <TodaySchedule
        events={events}
        now={new Date("2026-05-04T12:00:00.000Z")}
      />,
    );
    const focusItem = container.querySelector("li");
    expect(focusItem?.className).toContain("bg-foreground");
  });
});

// Wraps a component tree in a minimal TanStack Router so <Link> calls have a
// router context. Used by InboxPreviewCard tests where rows link to /inbox.
async function renderWithRouter(node: ReactElement) {
  const rootRoute = createRootRoute({ component: () => node });
  const inboxRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/inbox",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([inboxRoute]),
    history: createMemoryHistory({ initialEntries: ["/today"] }),
  });
  await router.load();
  // biome-ignore lint/suspicious/noExplicitAny: test-only router cast
  render(<RouterProvider router={router as any} />);
}

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
    unread_count: 0,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    priority: null,
    snoozed_until: null,
    alert_channels_override: null,
    tags: null,
  });

  it("renders top actionable signals with an Open-all link", async () => {
    const loader = vi.fn(async () => [
      prSignal("1", false, "2026-05-04T08:00:00.000Z"),
      prSignal("2", true, "2026-05-04T10:00:00.000Z"),
    ]);
    await renderWithRouter(<InboxPreviewCard loader={loader} limit={3} />);
    await waitFor(() => screen.getByText("PR 2"));
    expect(screen.getByText("PR 1")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /open all/i }).getAttribute("href"),
    ).toBe("/inbox");
  });

  it("renders an empty-state when nothing is actionable", async () => {
    const loader = vi.fn(async () => [] as StoredSignal[]);
    await renderWithRouter(<InboxPreviewCard loader={loader} />);
    await waitFor(() => screen.getByText(/inbox zero/i));
  });

  it("surfaces a load error", async () => {
    const loader = vi.fn(async () => {
      throw new Error("network down");
    });
    await renderWithRouter(<InboxPreviewCard loader={loader} />);
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
    unread_count: 0,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    priority: null,
    snoozed_until: null,
    alert_channels_override: null,
    tags: null,
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

describe("PulseCard", () => {
  const now = new Date("2026-05-04T12:00:00.000Z");

  it("renders donut, line, and bars driven by computeWeekStats output", async () => {
    const loader = vi.fn(
      async (_since: string) =>
        [
          {
            id: "p1",
            provider: "github",
            kind: "pr_review_requested",
            source_id: "p1",
            title: "PR p1",
            url: null,
            payload: {},
            requires_action: false,
            source_created_at: "2026-05-02T08:00:00.000Z",
            dismissed_at: "2026-05-03T08:00:00.000Z",
          },
          {
            id: "s1",
            provider: "slack",
            kind: "mention",
            source_id: "s1",
            title: "@you",
            url: null,
            payload: {},
            requires_action: true,
            source_created_at: "2026-05-02T09:00:00.000Z",
            dismissed_at: null,
          },
        ] as StoredSignal[],
    );
    const { container } = render(<PulseCard now={now} loader={loader} />);
    await waitFor(() => screen.getByRole("article", { name: /pulse/i }));
    await waitFor(() =>
      expect(
        container.querySelectorAll("circle[data-source]").length,
      ).toBeGreaterThan(0),
    );
    expect(container.querySelectorAll("[data-pulse-point]")).toHaveLength(7);
    expect(container.querySelectorAll("[data-pulse-bar-group]")).toHaveLength(
      5,
    );
    expect(screen.getByText(/last 7 days/i)).toBeTruthy();
    expect(screen.getByText(/Review latency/i)).toBeTruthy();
    expect(screen.getByText(/Shipped this week/i)).toBeTruthy();
  });

  it("passes a 7-day-ago ISO `since` to the loader", async () => {
    const loader = vi.fn(async (_since: string) => [] as StoredSignal[]);
    render(<PulseCard now={now} loader={loader} />);
    await waitFor(() => expect(loader).toHaveBeenCalled());
    expect(loader.mock.calls[0][0]).toBe("2026-04-27T12:00:00.000Z");
  });

  it("surfaces a load error", async () => {
    const loader = vi.fn(async (_since: string) => {
      throw new Error("boom");
    });
    render(<PulseCard now={now} loader={loader} />);
    await waitFor(() => screen.getByText(/boom/i));
  });
});
