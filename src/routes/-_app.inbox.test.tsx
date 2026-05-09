import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AttendeeStack,
  InboxDetailPane,
  InboxView,
  MeetingDetail,
  PrComments,
  PrDescription,
  PrDiffViewer,
  PrReviewActions,
  PrReviewSubmitPanel,
  parsePatch,
  reviewDraftKey,
  SlackReplyComposer,
  SlackThreadContext,
} from "#/routes/_app.inbox";
import {
  createCard,
  getLinkForSignal,
  linkSignalToCard,
  listCards,
  listColumns,
  listProjects,
  type StoredCardSignal,
  type StoredColumn,
  type StoredProject,
} from "#/features/projects/store";
import type { Signal } from "#/shared/signal";

// Supabase client is not exercised in component tests — store functions are
// mocked at the module level instead. We keep auth.getSession so PR detail
// components that call it don't throw.
vi.mock("#/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
    }),
  },
}));

vi.mock("#/features/projects/store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/features/projects/store")>();
  return {
    ...actual,
    getLinkForSignal: vi.fn(async (): Promise<StoredCardSignal | null> => null),
    linkSignalToCard: vi.fn(async () => {}),
    createCard: vi.fn(async () => {}),
    listProjects: vi.fn(async (): Promise<StoredProject[]> => []),
    listColumns: vi.fn(async (): Promise<StoredColumn[]> => []),
    listCards: vi.fn(async () => []),
  };
});

const sample = (
  overrides: Partial<Signal & { id: string }> = {},
): Signal & { id: string; dismissed_at: string | null } => ({
  id: "sig-1",
  provider: "github",
  kind: "pr_review_requested",
  source_id: "owner/repo#42",
  title: "Add cron orchestrator",
  url: "https://github.com/owner/repo/pull/42",
  payload: { repo: "owner/repo", author: "alice" },
  requires_action: true,
  source_created_at: "2026-05-01T10:00:00Z",
  dismissed_at: null,
  ...overrides,
});

describe("InboxView", () => {
  it("renders signal rows with source glyph and title", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample()]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("Add cron orchestrator")).toBeTruthy();
    expect(screen.getByLabelText("Git source")).toBeTruthy();
  });

  it("renders live filter counts derived from the signals", () => {
    const signals = [
      sample({ id: "a" }),
      sample({ id: "b", kind: "pr_authored" }),
      sample({
        id: "c",
        kind: "mention",
        provider: "slack",
        payload: { channel: "C1", author: "U1" },
      }),
    ];
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={signals}
        error={null}
        onDismiss={() => {}}
      />,
    );
    const filters = screen.getByRole("navigation", { name: /inbox filters/i });
    const all = within(filters).getByRole("button", { name: /^All/ });
    const prs = within(filters).getByRole("button", { name: /^PRs/ });
    const mentions = within(filters).getByRole("button", { name: /^Mentions/ });
    const tickets = within(filters).getByRole("button", { name: /^Tickets/ });
    expect(within(all).getByText("3")).toBeTruthy();
    expect(within(prs).getByText("2")).toBeTruthy();
    expect(within(mentions).getByText("1")).toBeTruthy();
    expect(within(tickets).getByText("0")).toBeTruthy();
  });

  it("filters list contents client-side when the filter changes", () => {
    const signals = [
      sample({ id: "a", title: "PR one" }),
      sample({
        id: "b",
        kind: "mention",
        provider: "slack",
        title: "Mention one",
        payload: { channel: "C1", author: "U1" },
      }),
    ];
    const { rerender } = render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={signals}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("PR one")).toBeTruthy();
    expect(screen.getByText("Mention one")).toBeTruthy();
    rerender(
      <InboxView
        filter="prs"
        onFilterChange={() => {}}
        signals={signals}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("PR one")).toBeTruthy();
    expect(screen.queryByText("Mention one")).toBeNull();
  });

  it("renders CI FAIL severity chip when payload signals it", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[
          sample({
            id: "a",
            payload: { repo: "o/r", author: "x", severity: "ci_fail" },
          }),
        ]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("CI FAIL")).toBeTruthy();
  });

  it("renders CONFLICT severity chip when payload signals it", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[
          sample({
            id: "a",
            payload: { repo: "o/r", author: "x", has_conflict: true },
          }),
        ]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("CONFLICT")).toBeTruthy();
  });

  it("renders RULE chip when signal.payload.badge === 'auto-rule'", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[
          sample({
            id: "a",
            payload: { repo: "o/r", author: "x", badge: "auto-rule" },
          }),
        ]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("RULE")).toBeTruthy();
  });

  it("marks the selected row with a Rausch left-border accent (data-selected)", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample({ id: "abc" })]}
        error={null}
        onDismiss={() => {}}
        selectedId="abc"
        onSelect={() => {}}
      />,
    );
    const row = document.querySelector('li[data-selected="true"]');
    expect(row).not.toBeNull();
    const rowEl = row as HTMLElement;
    expect(rowEl.style.borderLeft).toMatch(/var\(--primary\)/);
  });

  it("renders an unread indicator when unread_count > 0", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[{ ...sample({ id: "abc" }), unread_count: 3 }]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByLabelText("3 unread")).toBeTruthy();
  });

  it("shows the empty-state copy when the list is empty", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/nothing here/i)).toBeTruthy();
  });

  it("highlights the active filter chip and reports clicks", async () => {
    const onFilterChange = vi.fn();
    render(
      <InboxView
        filter="all"
        onFilterChange={onFilterChange}
        signals={[sample()]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    const filters = screen.getByRole("navigation", { name: /inbox filters/i });
    const all = within(filters).getByRole("button", { name: /^All/ });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(filters).getByRole("button", { name: /^PRs/ }));
    expect(onFilterChange).toHaveBeenCalledWith("prs");
  });

  it("invokes onDismiss with the signal id from the detail pane", async () => {
    const onDismiss = vi.fn();
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample({ id: "abc" })]}
        error={null}
        onDismiss={onDismiss}
        selectedId="abc"
        onSelect={() => {}}
      />,
    );
    const pane = screen.getByLabelText(/signal detail/i);
    fireEvent.click(within(pane).getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith("abc");
  });

  it("invokes onSelect when a row is clicked and shows the detail pane", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample({ id: "abc" })]}
        error={null}
        onDismiss={() => {}}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("Add cron orchestrator"));
    expect(onSelect).toHaveBeenCalledWith("abc");

    rerender(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample({ id: "abc" })]}
        error={null}
        onDismiss={() => {}}
        selectedId="abc"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByLabelText("Signal detail")).toBeTruthy();
  });

  it("dims the row and shows a Replied pill for ids in repliedIds", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample({ id: "abc" })]}
        error={null}
        onDismiss={() => {}}
        repliedIds={new Set(["abc"])}
      />,
    );
    expect(screen.getByText("Replied")).toBeTruthy();
    const row = screen.getByText("Add cron orchestrator").closest("li");
    expect(row?.className).toMatch(/opacity-60/);
  });

  it("renders a High pill when the signal has priority=high", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[{ ...sample({ id: "abc" }), priority: "high" }]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("High")).toBeTruthy();
  });

  it("renders a Low pill when the signal has priority=low", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[{ ...sample({ id: "abc" }), priority: "low" }]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("Low")).toBeTruthy();
  });

  it("renders no priority pill when the signal has no priority override", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample({ id: "abc" })]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.queryByText("High")).toBeNull();
    expect(screen.queryByText("Low")).toBeNull();
  });

  it("renders a Snoozed pill when the signal is snoozed in the future", () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[{ ...sample({ id: "abc" }), snoozed_until: future }]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/snoozed · returns/i)).toBeTruthy();
  });

  it("does not render a Snoozed pill when snoozed_until is in the past", () => {
    const past = new Date(Date.now() - 60 * 60_000).toISOString();
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[{ ...sample({ id: "abc" }), snoozed_until: past }]}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.queryByText(/snoozed · returns/i)).toBeNull();
  });

  it("does not show a Replied pill when the id is not in repliedIds", () => {
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample({ id: "abc" })]}
        error={null}
        onDismiss={() => {}}
        repliedIds={new Set()}
      />,
    );
    expect(screen.queryByText("Replied")).toBeNull();
  });
});

describe("InboxDetailPane", () => {
  const baseSignal = (overrides: Partial<Signal & { id: string }> = {}) => ({
    id: "sig-1",
    provider: "github" as const,
    kind: "pr_review_requested" as const,
    source_id: "owner/repo#42",
    title: "Add cron orchestrator",
    url: "https://github.com/owner/repo/pull/42",
    payload: { repo: "owner/repo", number: 42, author: "alice", draft: false },
    requires_action: true,
    source_created_at: "2026-05-01T10:00:00Z",
    dismissed_at: null,
    ...overrides,
  });

  it("renders a PR layout with repo, author and an Open in GitHub action", () => {
    const onClose = vi.fn();
    const onDismiss = vi.fn();
    render(
      <InboxDetailPane
        signal={baseSignal()}
        onClose={onClose}
        onDismiss={onDismiss}
      />,
    );
    const pane = screen.getByLabelText("Signal detail");
    expect(within(pane).getByText("Add cron orchestrator")).toBeTruthy();
    expect(within(pane).getByText("owner/repo #42")).toBeTruthy();
    expect(within(pane).getByText("@alice")).toBeTruthy();
    expect(
      within(pane).getByText("Open · review requested", {
        selector: '[data-slot="status-badge"]',
      }),
    ).toBeTruthy();
    const open = within(pane).getByRole("link", { name: /open in github/i });
    expect(open.getAttribute("href")).toBe(
      "https://github.com/owner/repo/pull/42",
    );
  });

  it("renders a Slack layout with channel, author and the message text", () => {
    render(
      <InboxDetailPane
        signal={baseSignal({
          provider: "slack",
          kind: "mention",
          payload: {
            channel: "oncall",
            channel_type: "channel",
            author: "U123",
            text: "hey can you take a look at this",
          },
          title: "hey can you take a look at this",
          url: "https://slack.example/archives/C/p1",
        })}
        onClose={() => {}}
        onDismiss={() => {}}
      />,
    );
    const pane = screen.getByLabelText("Signal detail");
    expect(within(pane).getByText("#oncall")).toBeTruthy();
    expect(within(pane).getByText("<@U123>")).toBeTruthy();
    expect(
      within(pane).getAllByText(/hey can you take a look at this/).length,
    ).toBeGreaterThan(0);
    const open = within(pane).getByRole("link", { name: /open in slack/i });
    expect(open.getAttribute("href")).toBe(
      "https://slack.example/archives/C/p1",
    );
  });

  it("renders a Meeting layout with time, Join meeting button, Open invite, agenda and linked PRs", () => {
    render(
      <InboxDetailPane
        signal={baseSignal({
          provider: "google",
          kind: "meeting",
          payload: {
            starts_at: "2026-05-04T12:30:00.000Z",
            ends_at: "2026-05-04T12:45:00.000Z",
            video_link: "https://meet.google.com/abc-defg-hij",
            organizer: "boss@acme.com",
            description: "- Roadmap review\n- Q&A",
            linked_items: [
              {
                kind: "pr",
                url: "https://github.com/acme/web/pull/123",
                repo: "acme/web",
                number: 123,
              },
            ],
          },
          title: "Standup",
          url: "https://calendar.google.com/event?eid=evt-1",
        })}
        onClose={() => {}}
        onDismiss={() => {}}
      />,
    );
    const pane = screen.getByLabelText("Signal detail");
    expect(within(pane).getByText("Standup")).toBeTruthy();
    expect(within(pane).getByText("boss@acme.com")).toBeTruthy();
    expect(within(pane).getByText("Roadmap review")).toBeTruthy();
    const join = within(pane).getByRole("link", { name: /join meeting/i });
    expect(join.getAttribute("href")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    const invite = within(pane).getByRole("link", { name: /open invite/i });
    expect(invite.getAttribute("href")).toBe(
      "https://calendar.google.com/event?eid=evt-1",
    );
    const linked = within(pane).getByRole("link", { name: "acme/web#123" });
    expect(linked.getAttribute("href")).toBe(
      "https://github.com/acme/web/pull/123",
    );
  });

  it("renders a Task layout for ticket signals with id, title, status and Open in Linear", () => {
    render(
      <InboxDetailPane
        signal={baseSignal({
          provider: "linear",
          kind: "ticket_assigned",
          source_id: "lin-issue-1",
          title: "Implement onboarding",
          url: "https://linear.app/acme/issue/ENG-42",
          payload: {
            identifier: "ENG-42",
            state_name: "Todo",
            team_key: "ENG",
            priority_label: "P2",
          },
        })}
        onClose={() => {}}
        onDismiss={() => {}}
      />,
    );
    const pane = screen.getByLabelText("Signal detail");
    expect(pane.getAttribute("data-detail-kind")).toBe("ticket");
    expect(within(pane).getByText("Implement onboarding")).toBeTruthy();
    expect(within(pane).getByText("ENG-42")).toBeTruthy();
    expect(within(pane).getByText("ENG")).toBeTruthy();
    expect(within(pane).getByText("P2")).toBeTruthy();
    const open = within(pane).getByRole("link", { name: /open in linear/i });
    expect(open.getAttribute("href")).toBe(
      "https://linear.app/acme/issue/ENG-42",
    );
  });

  it("dispatches to the right detail by kind via data-detail-kind", () => {
    const { rerender } = render(
      <InboxDetailPane
        signal={baseSignal()}
        onClose={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(
      screen.getByLabelText("Signal detail").getAttribute("data-detail-kind"),
    ).toBe("pr");
    rerender(
      <InboxDetailPane
        signal={baseSignal({
          provider: "slack",
          kind: "mention",
          payload: { channel: "C1", author: "U1", text: "hey" },
        })}
        onClose={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(
      screen.getByLabelText("Signal detail").getAttribute("data-detail-kind"),
    ).toBe("slack");
    rerender(
      <InboxDetailPane
        signal={baseSignal({
          provider: "google",
          kind: "meeting",
          payload: { starts_at: "2026-05-04T12:30:00.000Z" },
        })}
        onClose={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(
      screen.getByLabelText("Signal detail").getAttribute("data-detail-kind"),
    ).toBe("meeting");
  });

  it("renders an empty detail prompt when no signal is selected", () => {
    render(
      <InboxDetailPane signal={null} onClose={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByText(/select a signal/i)).toBeTruthy();
  });

  it("dismiss and close buttons fire their handlers", () => {
    const onClose = vi.fn();
    const onDismiss = vi.fn();
    render(
      <InboxDetailPane
        signal={baseSignal({ id: "xyz" })}
        onClose={onClose}
        onDismiss={onDismiss}
      />,
    );
    const pane = screen.getByLabelText("Signal detail");
    fireEvent.click(
      within(pane).getByRole("button", { name: /close detail/i }),
    );
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(within(pane).getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith("xyz");
  });
});

describe("PR detail extras", () => {
  it("renders +/- diff stats, AI summary, files-changed and recent comments when present", () => {
    render(
      <InboxDetailPane
        signal={{
          id: "p1",
          provider: "github" as const,
          kind: "pr_review_requested" as const,
          source_id: "o/r#9",
          title: "Refactor cron",
          url: "https://github.com/o/r/pull/9",
          payload: {
            repo: "o/r",
            number: 9,
            author: "alice",
            additions: 42,
            deletions: 7,
            ai_summary: "Refactors the cron orchestrator into a state machine.",
            files_changed: [
              { path: "src/cron.ts", additions: 30, deletions: 5 },
              { path: "src/cron.test.ts", additions: 12, deletions: 2 },
            ],
            recent_comments: [
              { author: "bob", body: "lgtm with nits" },
              { author: "carol", body: "thanks" },
            ],
          },
          requires_action: true,
          source_created_at: "2026-05-01T10:00:00Z",
          dismissed_at: null,
        }}
        onClose={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("+42")).toBeTruthy();
    expect(screen.getByText("−7")).toBeTruthy();
    expect(screen.getByLabelText("AI summary")).toBeTruthy();
    expect(screen.getByLabelText("Files changed")).toBeTruthy();
    expect(screen.getByText("src/cron.ts")).toBeTruthy();
    expect(screen.getByLabelText("Recent comments")).toBeTruthy();
    expect(screen.getByText("lgtm with nits")).toBeTruthy();
  });
});

describe("PrReviewActions", () => {
  it("approves a PR with empty body and forwards repo+number", async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    render(<PrReviewActions repo="o/r" number={42} submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({
      repo: "o/r",
      number: 42,
      event: "APPROVE",
      body: "",
    });
    expect(screen.getByRole("status").textContent).toMatch(/approved/i);
  });

  it("disables Request changes / Comment until a body is typed", () => {
    render(
      <PrReviewActions
        repo="o/r"
        number={1}
        submit={async () => ({ ok: true })}
      />,
    );
    const req = screen.getByRole("button", { name: /request changes/i });
    const com = screen.getByRole("button", { name: /^comment$/i });
    expect(req.hasAttribute("disabled")).toBe(true);
    expect(com.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/review comment/i), {
      target: { value: "lgtm with nits" },
    });
    expect(req.hasAttribute("disabled")).toBe(false);
    expect(com.hasAttribute("disabled")).toBe(false);
  });

  it("posts a comment with the typed body", async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    render(<PrReviewActions repo="o/r" number={3} submit={submit} />);
    fireEvent.change(screen.getByLabelText(/review comment/i), {
      target: { value: "  please rename foo  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^comment$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({
      repo: "o/r",
      number: 3,
      event: "COMMENT",
      body: "please rename foo",
    });
  });

  it("surfaces a Reauthorize hint on needs_reauth", async () => {
    const submit = vi.fn(async () => ({
      ok: false,
      error: "scope missing",
      needs_reauth: true,
    }));
    render(<PrReviewActions repo="o/r" number={1} submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/scope missing/);
    const reauth = within(alert).getByRole("button", {
      name: /reauthorize github/i,
    });
    expect(reauth).toBeTruthy();
  });

  it("opens the GitHub connect URL when Reauthorize is clicked", async () => {
    const submit = vi.fn(async () => ({
      ok: false,
      error: "scope missing",
      needs_reauth: true,
    }));
    const requestConnectUrl = vi.fn(async () => ({
      ok: true,
      url: "https://example.test/oauth/github",
    }));
    const openUrl = vi.fn();
    render(
      <PrReviewActions
        repo="o/r"
        number={1}
        submit={submit}
        requestConnectUrl={requestConnectUrl}
        openUrl={openUrl}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    const alert = await screen.findByRole("alert");
    fireEvent.click(
      within(alert).getByRole("button", { name: /reauthorize github/i }),
    );
    await waitFor(() =>
      expect(requestConnectUrl).toHaveBeenCalledWith("github"),
    );
    await waitFor(() =>
      expect(openUrl).toHaveBeenCalledWith("https://example.test/oauth/github"),
    );
  });

  it("forwards signal_id when provided so the worker can flip requires_action", async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    render(
      <PrReviewActions
        repo="o/r"
        number={9}
        signalId="sig-pr-1"
        submit={submit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ signal_id: "sig-pr-1" }),
    );
  });
});

describe("SlackReplyComposer", () => {
  it("disables Send until text is typed", () => {
    render(
      <SlackReplyComposer channel="C123" submit={async () => ({ ok: true })} />,
    );
    const send = screen.getByRole("button", { name: /^send$/i });
    expect(send.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Slack reply"), {
      target: { value: "looking now" },
    });
    expect(send.hasAttribute("disabled")).toBe(false);
  });

  it("forwards channel + thread_ts and clears the textarea on success", async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    render(
      <SlackReplyComposer
        channel="C123"
        thread_ts="1700000000.000100"
        submit={submit}
      />,
    );
    const textarea = screen.getByLabelText(
      "Slack reply",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  on it  " } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({
      channel: "C123",
      text: "on it",
      thread_ts: "1700000000.000100",
    });
    await waitFor(() => expect(textarea.value).toBe(""));
    expect(screen.getByRole("status").textContent).toMatch(/reply sent/i);
  });

  it("omits thread_ts when the user toggles 'send as new message in #channel'", async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    render(
      <SlackReplyComposer
        channel="C123"
        thread_ts="1700000000.000100"
        submit={submit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Slack reply"), {
      target: { value: "fresh top-level message" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /send as a new message in #C123/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({
      channel: "C123",
      text: "fresh top-level message",
      thread_ts: undefined,
    });
  });

  it("does not render the new-message toggle when there is no thread_ts", () => {
    render(
      <SlackReplyComposer channel="C1" submit={async () => ({ ok: true })} />,
    );
    expect(
      screen.queryByRole("checkbox", { name: /send as a new message/i }),
    ).toBeNull();
  });

  it("surfaces a Reauthorize hint on needs_reauth", async () => {
    const submit = vi.fn(async () => ({
      ok: false,
      error: "missing_scope",
      needs_reauth: true,
    }));
    render(<SlackReplyComposer channel="C1" submit={submit} />);
    fireEvent.change(screen.getByLabelText("Slack reply"), {
      target: { value: "hi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/missing_scope/);
    const reauth = within(alert).getByRole("button", {
      name: /reauthorize slack/i,
    });
    expect(reauth).toBeTruthy();
  });

  it("opens the Slack connect URL when Reauthorize is clicked", async () => {
    const submit = vi.fn(async () => ({
      ok: false,
      error: "missing_scope",
      needs_reauth: true,
    }));
    const requestConnectUrl = vi.fn(async () => ({
      ok: true,
      url: "https://example.test/oauth/slack",
    }));
    const openUrl = vi.fn();
    render(
      <SlackReplyComposer
        channel="C1"
        submit={submit}
        requestConnectUrl={requestConnectUrl}
        openUrl={openUrl}
      />,
    );
    fireEvent.change(screen.getByLabelText("Slack reply"), {
      target: { value: "hi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    const alert = await screen.findByRole("alert");
    fireEvent.click(
      within(alert).getByRole("button", { name: /reauthorize slack/i }),
    );
    await waitFor(() =>
      expect(requestConnectUrl).toHaveBeenCalledWith("slack"),
    );
    await waitFor(() =>
      expect(openUrl).toHaveBeenCalledWith("https://example.test/oauth/slack"),
    );
  });

  it("forwards signal_id when provided so the worker can flip requires_action", async () => {
    const submit = vi.fn(async () => ({ ok: true }));
    render(
      <SlackReplyComposer
        channel="C1"
        signalId="sig-slack-1"
        submit={submit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Slack reply"), {
      target: { value: "thx" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ signal_id: "sig-slack-1" }),
    );
  });
});

describe("SlackThreadContext", () => {
  it("renders thread messages with author names and a (you) marker for self", async () => {
    const load = vi.fn(async () => ({
      ok: true as const,
      messages: [
        {
          ts: "100",
          user_id: "U001SELF",
          user_name: "geemeows",
          text: "starting a thread",
          is_self: true,
        },
        {
          ts: "200",
          user_id: "U001OTHER",
          user_name: "Other Person",
          text: "thanks",
          is_self: false,
        },
      ],
    }));
    render(<SlackThreadContext channel="C1" thread_ts="100" load={load} />);
    await screen.findByText("starting a thread");
    expect(load).toHaveBeenCalledWith({ channel: "C1", thread_ts: "100" });
    expect(screen.getByText("geemeows")).toBeTruthy();
    expect(screen.getByText("(you)")).toBeTruthy();
    expect(screen.getByText("Other Person")).toBeTruthy();
    expect(screen.getByText("thanks")).toBeTruthy();
  });

  it("falls back to <@id> when the user couldn't be resolved", async () => {
    const load = vi.fn(async () => ({
      ok: true as const,
      messages: [
        {
          ts: "100",
          user_id: "U999",
          user_name: null,
          text: "hi",
          is_self: false,
        },
      ],
    }));
    render(<SlackThreadContext channel="C1" thread_ts="100" load={load} />);
    await screen.findByText("hi");
    expect(screen.getByText("<@U999>")).toBeTruthy();
  });

  it("surfaces a load error", async () => {
    const load = vi.fn(async () => ({
      ok: false as const,
      error: "missing_scope",
    }));
    render(<SlackThreadContext channel="C1" thread_ts="100" load={load} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/missing_scope/);
  });
});

describe("Draft with AI", () => {
  it("seeds a PR review comment from the AI draft", async () => {
    const requestDraft = vi.fn(async () => ({
      ok: true as const,
      draft: "Approving — small nit on naming.",
    }));
    render(
      <PrReviewActions
        repo="o/r"
        number={5}
        signalId="sig-1"
        submit={async () => ({ ok: true })}
        requestDraft={requestDraft}
      />,
    );
    const textarea = screen.getByLabelText(
      /review comment/i,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /draft with ai/i }));
    await waitFor(() =>
      expect(textarea.value).toBe("Approving — small nit on naming."),
    );
    expect(requestDraft).toHaveBeenCalledWith({ signal_id: "sig-1" });
  });

  it("seeds a Slack reply from the AI draft", async () => {
    const requestDraft = vi.fn(async () => ({
      ok: true as const,
      draft: "Looking now.",
    }));
    render(
      <SlackReplyComposer
        channel="C1"
        signalId="sig-2"
        submit={async () => ({ ok: true })}
        requestDraft={requestDraft}
      />,
    );
    const textarea = screen.getByLabelText(
      "Slack reply",
    ) as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: /draft with ai/i }));
    await waitFor(() => expect(textarea.value).toBe("Looking now."));
    expect(requestDraft).toHaveBeenCalledWith({ signal_id: "sig-2" });
  });

  it("surfaces a no_provider message without seeding the textarea", async () => {
    const requestDraft = vi.fn(async () => ({
      ok: false as const,
      reason: "no_provider",
    }));
    render(
      <PrReviewActions
        repo="o/r"
        number={1}
        signalId="sig-3"
        submit={async () => ({ ok: true })}
        requestDraft={requestDraft}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /draft with ai/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no ai provider/i);
    const textarea = screen.getByLabelText(
      /review comment/i,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("hides the Draft button when no signalId is provided", () => {
    render(
      <PrReviewActions
        repo="o/r"
        number={1}
        submit={async () => ({ ok: true })}
      />,
    );
    expect(screen.queryByRole("button", { name: /draft with ai/i })).toBeNull();
  });
});

describe("Optimistic reply UI", () => {
  it("PR review: fires onReplyStart immediately and not onReplyRollback on success", async () => {
    const onReplyStart = vi.fn();
    const onReplyRollback = vi.fn();
    render(
      <PrReviewActions
        repo="o/r"
        number={1}
        signalId="sig-pr"
        submit={async () => ({ ok: true })}
        onReplyStart={onReplyStart}
        onReplyRollback={onReplyRollback}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onReplyStart).toHaveBeenCalledWith("sig-pr");
    await waitFor(() => screen.getByRole("status"));
    expect(onReplyRollback).not.toHaveBeenCalled();
  });

  it("PR review: rolls back on submit failure", async () => {
    const onReplyStart = vi.fn();
    const onReplyRollback = vi.fn();
    render(
      <PrReviewActions
        repo="o/r"
        number={1}
        signalId="sig-pr"
        submit={async () => ({ ok: false, error: "nope" })}
        onReplyStart={onReplyStart}
        onReplyRollback={onReplyRollback}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(onReplyRollback).toHaveBeenCalledWith("sig-pr"));
    expect(onReplyStart).toHaveBeenCalledWith("sig-pr");
  });

  it("PR review: rolls back when submit throws", async () => {
    const onReplyRollback = vi.fn();
    render(
      <PrReviewActions
        repo="o/r"
        number={1}
        signalId="sig-pr"
        submit={async () => {
          throw new Error("boom");
        }}
        onReplyRollback={onReplyRollback}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(onReplyRollback).toHaveBeenCalledWith("sig-pr"));
  });

  it("Slack reply: fires onReplyStart and not onReplyRollback on success", async () => {
    const onReplyStart = vi.fn();
    const onReplyRollback = vi.fn();
    render(
      <SlackReplyComposer
        channel="C1"
        signalId="sig-slack"
        submit={async () => ({ ok: true })}
        onReplyStart={onReplyStart}
        onReplyRollback={onReplyRollback}
      />,
    );
    fireEvent.change(screen.getByLabelText("Slack reply"), {
      target: { value: "on it" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(onReplyStart).toHaveBeenCalledWith("sig-slack");
    await waitFor(() => screen.getByRole("status"));
    expect(onReplyRollback).not.toHaveBeenCalled();
  });

  it("Slack reply: rolls back on submit failure", async () => {
    const onReplyRollback = vi.fn();
    render(
      <SlackReplyComposer
        channel="C1"
        signalId="sig-slack"
        submit={async () => ({ ok: false, error: "nope" })}
        onReplyRollback={onReplyRollback}
      />,
    );
    fireEvent.change(screen.getByLabelText("Slack reply"), {
      target: { value: "on it" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() =>
      expect(onReplyRollback).toHaveBeenCalledWith("sig-slack"),
    );
  });

  it("does not fire callbacks when no signalId is provided", async () => {
    const onReplyStart = vi.fn();
    const onReplyRollback = vi.fn();
    render(
      <PrReviewActions
        repo="o/r"
        number={1}
        submit={async () => ({ ok: false, error: "nope" })}
        onReplyStart={onReplyStart}
        onReplyRollback={onReplyRollback}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => screen.getByRole("alert"));
    expect(onReplyStart).not.toHaveBeenCalled();
    expect(onReplyRollback).not.toHaveBeenCalled();
  });
});

describe("PrDiffViewer", () => {
  const PATCH = "@@ -1,2 +1,3 @@\n hi\n+added\n-removed";

  it("auto-fetches the diff on mount and renders each file collapsed", async () => {
    const load = vi.fn(async () => ({
      ok: true as const,
      files: [
        {
          filename: "src/a.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          patch: PATCH,
        },
      ],
    }));
    render(<PrDiffViewer repo="o/r" number={1} load={load} />);

    await waitFor(() => screen.getByText("src/a.ts"));

    expect(load).toHaveBeenCalledWith({ repo: "o/r", number: 1 });

    const article = screen
      .getByText("src/a.ts")
      .closest('[data-slot="pr-file-patch"]');
    expect(article).not.toBeNull();
    expect(article?.getAttribute("data-open")).toBeNull();
    expect(article?.querySelector("[data-tone]")).toBeNull();

    fireEvent.click(within(article as HTMLElement).getByRole("button"));
    expect(article?.getAttribute("data-open")).toBe("true");

    const lines = article?.querySelectorAll("[data-tone]") ?? [];
    const tones = Array.from(lines).map((l) => l.getAttribute("data-tone"));
    expect(tones).toEqual(["hunk", "ctx", "add", "del"]);
  });

  it("toggles a single file independently — expanding one does not expand others", async () => {
    const load = vi.fn(async () => ({
      ok: true as const,
      files: [
        {
          filename: "a.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: PATCH,
        },
        {
          filename: "b.ts",
          status: "modified",
          additions: 0,
          deletions: 1,
          patch: PATCH,
        },
      ],
    }));
    render(<PrDiffViewer repo="o/r" number={1} load={load} />);
    await waitFor(() => screen.getByText("a.ts"));

    const articleA = screen
      .getByText("a.ts")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;
    const articleB = screen
      .getByText("b.ts")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;

    fireEvent.click(within(articleA).getByRole("button"));
    expect(articleA.getAttribute("data-open")).toBe("true");
    expect(articleB.getAttribute("data-open")).toBeNull();
  });

  it("re-fetches when the repo or number changes", async () => {
    const load = vi.fn(
      async ({ number }: { repo: string; number: number }) => ({
        ok: true as const,
        files: [
          {
            filename: `f-${number}.ts`,
            status: "modified",
            additions: 0,
            deletions: 0,
            patch: PATCH,
          },
        ],
      }),
    );
    const { rerender } = render(
      <PrDiffViewer repo="o/r" number={1} load={load} />,
    );
    await waitFor(() => screen.getByText("f-1.ts"));

    rerender(<PrDiffViewer repo="o/r" number={2} load={load} />);
    await waitFor(() => screen.getByText("f-2.ts"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shows a fallback when a file's patch is unavailable", async () => {
    const load = vi.fn(async () => ({
      ok: true as const,
      files: [
        {
          filename: "logo.png",
          status: "modified",
          additions: 0,
          deletions: 0,
          patch: null,
        },
      ],
    }));
    render(<PrDiffViewer repo="o/r" number={1} load={load} />);
    await waitFor(() => screen.getByText("logo.png"));
    const article = screen
      .getByText("logo.png")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;
    fireEvent.click(within(article).getByRole("button"));
    expect(within(article).getByText(/patch not available/i)).toBeTruthy();
  });

  it("surfaces load failures via an alert", async () => {
    const load = vi.fn(async () => ({
      ok: false as const,
      error: "github HTTP 401",
    }));
    render(<PrDiffViewer repo="o/r" number={1} load={load} />);
    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByRole("alert").textContent).toMatch(/github HTTP 401/);
  });

  it("badges the file header with the count of review comments and renders them when expanded", async () => {
    const PATCH = "@@ -1 +1 @@\n hi\n+x";
    const load = vi.fn(async () => ({
      ok: true as const,
      files: [
        {
          filename: "src/a.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: PATCH,
        },
      ],
    }));
    render(
      <PrDiffViewer
        repo="o/r"
        number={1}
        load={load}
        commentsByPath={{
          "src/a.ts": [
            {
              id: 7,
              path: "src/a.ts",
              line: 12,
              side: "RIGHT",
              diff_hunk: PATCH,
              body: "nit: rename this",
              user: "rahul",
              user_avatar_url: null,
              created_at: null,
            },
          ],
        }}
      />,
    );
    await waitFor(() => screen.getByText("src/a.ts"));
    const article = screen
      .getByText("src/a.ts")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;
    const badge = within(article).getByText("1", {
      selector: '[data-slot="comment-count"]',
    });
    expect(badge).toBeTruthy();
    expect(within(article).queryByText(/nit: rename this/)).toBeNull();
    fireEvent.click(within(article).getByRole("button"));
    expect(within(article).getByText(/nit: rename this/)).toBeTruthy();
    expect(within(article).getByText(/line 12/)).toBeTruthy();
    expect(within(article).getByText("@rahul")).toBeTruthy();
  });
});

describe("PrDescription", () => {
  it("auto-fetches and renders the PR body and forwards review comments by path", async () => {
    const onComments = vi.fn();
    const load = vi.fn(async () => ({
      ok: true as const,
      body: "Reworks the slack webhook to batch-upsert.",
      author: "alice",
      author_avatar_url: null,
      review_comments: [
        {
          id: 1,
          path: "src/a.ts",
          line: 4,
          side: "RIGHT" as const,
          diff_hunk: null,
          body: "fix this",
          user: "bob",
          user_avatar_url: null,
          created_at: null,
        },
      ],
      issue_comments: [],
      state: "open" as const,
      merged: false,
      merged_at: null,
    }));
    render(
      <PrDescription
        repo="o/r"
        number={42}
        load={load}
        onComments={onComments}
      />,
    );
    await waitFor(() =>
      screen.getByText(/Reworks the slack webhook to batch-upsert/),
    );
    expect(load).toHaveBeenCalledWith({ repo: "o/r", number: 42 });
    expect(onComments).toHaveBeenCalledWith({
      "src/a.ts": expect.arrayContaining([expect.objectContaining({ id: 1 })]),
    });
  });

  it("renders the empty-description state when the PR body is null", async () => {
    const load = vi.fn(async () => ({
      ok: true as const,
      body: null,
      author: null,
      author_avatar_url: null,
      review_comments: [],
      issue_comments: [],
      state: "open" as const,
      merged: false,
      merged_at: null,
    }));
    render(<PrDescription repo="o/r" number={1} load={load} />);
    await waitFor(() => screen.getByText(/no description provided/i));
  });

  it("forwards the live PR state via onPrState so the chip can flip to Merged without a re-poll", async () => {
    const onPrState = vi.fn();
    const load = vi.fn(async () => ({
      ok: true as const,
      body: "shipped",
      author: "alice",
      author_avatar_url: null,
      review_comments: [],
      issue_comments: [],
      state: "closed" as const,
      merged: true,
      merged_at: "2026-05-02T11:00:00Z",
    }));
    render(
      <PrDescription repo="o/r" number={2} load={load} onPrState={onPrState} />,
    );
    await waitFor(() => expect(onPrState).toHaveBeenCalledTimes(1));
    expect(onPrState).toHaveBeenCalledWith({
      state: "closed",
      merged: true,
      merged_at: "2026-05-02T11:00:00Z",
    });
  });

  it("surfaces description-load failures via an alert", async () => {
    const load = vi.fn(async () => ({
      ok: false as const,
      error: "github HTTP 500",
    }));
    render(<PrDescription repo="o/r" number={1} load={load} />);
    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByRole("alert").textContent).toMatch(/github HTTP 500/);
  });
});

describe("parsePatch", () => {
  it("annotates each row with the right-side / left-side file line numbers", () => {
    const rows = parsePatch(
      "@@ -10,3 +10,4 @@\n line a\n+added\n-removed\n line c",
    );
    // Hunk header
    expect(rows[0].tone).toBe("hunk");
    // " line a" — context, both sides advance from 10
    expect(rows[1]).toMatchObject({ tone: "ctx", oldLine: 10, newLine: 10 });
    // "+added" — right side only
    expect(rows[2]).toMatchObject({ tone: "add", newLine: 11 });
    expect(rows[2].oldLine).toBeUndefined();
    // "-removed" — left side only, oldLine 11 (10 + 1 ctx)
    expect(rows[3]).toMatchObject({ tone: "del", oldLine: 11 });
    expect(rows[3].newLine).toBeUndefined();
    // " line c" — context resumes
    expect(rows[4]).toMatchObject({ tone: "ctx", oldLine: 12, newLine: 12 });
  });
});

describe("PrDiffViewer inline comments", () => {
  const PATCH = "@@ -1 +1,2 @@\n hi\n+x";

  function loadOne(patch: string) {
    return vi.fn(async () => ({
      ok: true as const,
      files: [
        {
          filename: "src/a.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch,
        },
      ],
    }));
  }

  it("renders existing review comments inline directly under the matching diff line", async () => {
    const load = loadOne(PATCH);
    render(
      <PrDiffViewer
        repo="o/r"
        number={1}
        load={load}
        commentsByPath={{
          "src/a.ts": [
            {
              id: 7,
              path: "src/a.ts",
              line: 2,
              side: "RIGHT",
              diff_hunk: PATCH,
              body: "**rename** this",
              user: "rahul",
              user_avatar_url: null,
              created_at: null,
            },
          ],
        }}
      />,
    );
    await waitFor(() => screen.getByText("src/a.ts"));
    const article = screen
      .getByText("src/a.ts")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;
    fireEvent.click(within(article).getAllByRole("button")[0]);
    const row = within(article)
      .getByText("+x")
      .closest('[data-line-key="RIGHT|2"]') as HTMLElement;
    expect(row).not.toBeNull();
    const thread = row.querySelector(
      '[data-slot="inline-thread"]',
    ) as HTMLElement;
    expect(thread).not.toBeNull();
    expect(within(thread).getByText("@rahul")).toBeTruthy();
    expect(within(thread).getByText("rename").tagName).toBe("STRONG");
  });

  it("opens an inline composer when the + button on a line is clicked, then commits the draft", async () => {
    const onAdd = vi.fn();
    const load = loadOne(PATCH);
    render(
      <PrDiffViewer
        repo="o/r"
        number={1}
        load={load}
        drafts={{}}
        onAddDraft={onAdd}
      />,
    );
    await waitFor(() => screen.getByText("src/a.ts"));
    const article = screen
      .getByText("src/a.ts")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;
    // expand
    fireEvent.click(within(article).getAllByRole("button")[0]);
    const addBtn = within(article).getByRole("button", {
      name: /comment on new line 2/i,
    });
    fireEvent.click(addBtn);
    const composer = within(article).getByRole("textbox", {
      name: /inline review comment/i,
    });
    fireEvent.change(composer, { target: { value: "rename this" } });
    fireEvent.click(
      within(article).getByRole("button", { name: /add to review/i }),
    );
    expect(onAdd).toHaveBeenCalledWith({
      path: "src/a.ts",
      side: "RIGHT",
      line: 2,
      body: "rename this",
    });
  });

  it("shift-click on a second line extends the composer into a multi-line range", async () => {
    const onAdd = vi.fn();
    const PATCH_MULTI = "@@ -1,1 +1,3 @@\n hi\n+a\n+b\n+c";
    const load = loadOne(PATCH_MULTI);
    render(
      <PrDiffViewer
        repo="o/r"
        number={1}
        load={load}
        drafts={{}}
        onAddDraft={onAdd}
      />,
    );
    await waitFor(() => screen.getByText("src/a.ts"));
    const article = screen
      .getByText("src/a.ts")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;
    fireEvent.click(within(article).getAllByRole("button")[0]); // expand file
    fireEvent.click(
      within(article).getByRole("button", { name: /comment on new line 2/i }),
    );
    // Shift-click on line 4 should extend composer to range 2-4.
    fireEvent.click(
      within(article).getByRole("button", { name: /comment on new line 4/i }),
      { shiftKey: true },
    );
    expect(within(article).getByText(/new lines 2–4/i)).toBeTruthy();
    fireEvent.change(
      within(article).getByRole("textbox", {
        name: /inline review comment/i,
      }),
      { target: { value: "extract this block" } },
    );
    fireEvent.click(
      within(article).getByRole("button", { name: /add to review/i }),
    );
    expect(onAdd).toHaveBeenCalledWith({
      path: "src/a.ts",
      side: "RIGHT",
      line: 4,
      startLine: 2,
      body: "extract this block",
    });
  });

  it("click-and-drag from one line down through other lines selects the range and opens the composer", async () => {
    const onAdd = vi.fn();
    const PATCH_MULTI = "@@ -1,1 +1,3 @@\n hi\n+a\n+b\n+c";
    const load = loadOne(PATCH_MULTI);
    render(
      <PrDiffViewer
        repo="o/r"
        number={1}
        load={load}
        drafts={{}}
        onAddDraft={onAdd}
      />,
    );
    await waitFor(() => screen.getByText("src/a.ts"));
    const article = screen
      .getByText("src/a.ts")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;
    fireEvent.click(within(article).getAllByRole("button")[0]); // expand file
    const startBtn = within(article).getByRole("button", {
      name: /comment on new line 2/i,
    });
    const endRow = article.querySelector(
      '[data-line-key="RIGHT|4"]',
    ) as HTMLElement;
    fireEvent.pointerDown(startBtn);
    fireEvent.pointerEnter(endRow);
    fireEvent.pointerUp(document);
    expect(within(article).getByText(/new lines 2–4/i)).toBeTruthy();
    fireEvent.change(
      within(article).getByRole("textbox", {
        name: /inline review comment/i,
      }),
      { target: { value: "extract block" } },
    );
    fireEvent.click(
      within(article).getByRole("button", { name: /add to review/i }),
    );
    expect(onAdd).toHaveBeenCalledWith({
      path: "src/a.ts",
      side: "RIGHT",
      line: 4,
      startLine: 2,
      body: "extract block",
    });
  });

  it("falls back to an Outdated section for comments whose line isn't in the patch", async () => {
    const load = loadOne(PATCH);
    render(
      <PrDiffViewer
        repo="o/r"
        number={1}
        load={load}
        commentsByPath={{
          "src/a.ts": [
            {
              id: 9,
              path: "src/a.ts",
              line: 99,
              side: "RIGHT",
              diff_hunk: null,
              body: "old comment",
              user: "carol",
              user_avatar_url: null,
              created_at: null,
            },
          ],
        }}
      />,
    );
    await waitFor(() => screen.getByText("src/a.ts"));
    const article = screen
      .getByText("src/a.ts")
      .closest('[data-slot="pr-file-patch"]') as HTMLElement;
    fireEvent.click(within(article).getAllByRole("button")[0]);
    const orphan = article.querySelector(
      '[data-slot="orphan-comments"]',
    ) as HTMLElement;
    expect(orphan).not.toBeNull();
    expect(within(orphan).getByText(/old comment/)).toBeTruthy();
  });
});

describe("PrReviewSubmitPanel", () => {
  it("submits queued drafts as one review and clears them on success", async () => {
    const submit = vi.fn(async () => ({ ok: true as const }));
    const onCleared = vi.fn();
    const drafts = {
      [reviewDraftKey({ path: "a.ts", line: 12, side: "RIGHT" })]: {
        path: "a.ts",
        line: 12,
        side: "RIGHT" as const,
        body: "rename",
      },
      [reviewDraftKey({ path: "b.ts", line: 4, side: "RIGHT" })]: {
        path: "b.ts",
        line: 4,
        side: "RIGHT" as const,
        body: "extract",
      },
    };
    render(
      <PrReviewSubmitPanel
        repo="o/r"
        number={1}
        drafts={drafts}
        onCleared={onCleared}
        submit={submit}
      />,
    );
    fireEvent.click(screen.getByLabelText(/request changes/i));
    fireEvent.change(screen.getByLabelText(/review summary/i), {
      target: { value: "general feedback" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: "o/r",
        number: 1,
        event: "REQUEST_CHANGES",
        body: "general feedback",
        comments: expect.arrayContaining([
          expect.objectContaining({ path: "a.ts", line: 12, body: "rename" }),
          expect.objectContaining({ path: "b.ts", line: 4, body: "extract" }),
        ]),
      }),
    );
    expect(onCleared).toHaveBeenCalled();
  });

  it("forwards multi-line drafts as start_line / start_side on the wire", async () => {
    const submit = vi.fn(async () => ({ ok: true as const }));
    const drafts = {
      [reviewDraftKey({
        path: "a.ts",
        line: 12,
        side: "RIGHT",
        startLine: 8,
      })]: {
        path: "a.ts",
        line: 12,
        startLine: 8,
        side: "RIGHT" as const,
        body: "extract",
      },
    };
    render(
      <PrReviewSubmitPanel
        repo="o/r"
        number={1}
        drafts={drafts}
        onCleared={() => {}}
        submit={submit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        comments: [
          expect.objectContaining({
            path: "a.ts",
            line: 12,
            side: "RIGHT",
            start_line: 8,
            start_side: "RIGHT",
            body: "extract",
          }),
        ],
      }),
    );
  });

  it("surfaces submit errors as alerts and keeps drafts intact", async () => {
    const submit = vi.fn(async () => ({
      ok: false as const,
      error: "github HTTP 422",
    }));
    const onCleared = vi.fn();
    const drafts = {
      [reviewDraftKey({ path: "a.ts", line: 1, side: "RIGHT" })]: {
        path: "a.ts",
        line: 1,
        side: "RIGHT" as const,
        body: "x",
      },
    };
    render(
      <PrReviewSubmitPanel
        repo="o/r"
        number={1}
        drafts={drafts}
        onCleared={onCleared}
        submit={submit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));
    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByRole("alert").textContent).toMatch(/422/);
    expect(onCleared).not.toHaveBeenCalled();
  });
});

describe("PrComments", () => {
  it("shows a skeleton while loading", () => {
    render(
      <PrComments loading={true} reviewComments={[]} issueComments={[]} />,
    );
    expect(screen.getByLabelText(/loading comments/i)).toBeTruthy();
  });

  it("renders an empty state when there are no comments", () => {
    render(
      <PrComments loading={false} reviewComments={[]} issueComments={[]} />,
    );
    expect(screen.getByText(/no comments yet/i)).toBeTruthy();
  });

  it("merges issue + review comments into one chronological timeline and renders bodies as markdown", () => {
    render(
      <PrComments
        loading={false}
        reviewComments={[
          {
            id: 7,
            path: "src/a.ts",
            line: 12,
            side: "RIGHT",
            diff_hunk: null,
            body: "**nit**: rename this",
            user: "rahul",
            user_avatar_url: null,
            created_at: "2026-05-02T10:00:00Z",
          },
        ]}
        issueComments={[
          {
            id: 100,
            body: "looks good to me",
            user: "carol",
            user_avatar_url: null,
            created_at: "2026-05-01T09:00:00Z",
          },
        ]}
      />,
    );
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(articles[0].textContent).toMatch(/looks good to me/);
    expect(articles[1].textContent).toMatch(/nit/);
    expect(within(articles[1]).getByText(/src\/a\.ts:12/)).toBeTruthy();
    expect(
      within(articles[1]).getByText("Review", {
        selector: '[data-slot="comment-kind"]',
      }),
    ).toBeTruthy();
    expect(within(articles[1]).getByText("nit").tagName).toBe("STRONG");
  });
});

// ─── Send to project ─────────────────────────────────────────────────────────

describe("InboxDetailPane — Send to project", () => {
  const sig = (): Signal & { id: string; dismissed_at: string | null } => ({
    id: "sig-1",
    provider: "github" as const,
    kind: "pr_review_requested" as const,
    source_id: "o/r#1",
    title: "Fix the bug",
    url: "https://github.com/o/r/pull/1",
    payload: { repo: "o/r", number: 1, author: "alice" },
    requires_action: true,
    source_created_at: "2026-05-01T10:00:00Z",
    dismissed_at: null,
  });

  const project: StoredProject = {
    id: "proj-1",
    name: "Backend",
    archived: false,
    created_at: "2026-01-01T00:00:00Z",
  };

  const col: StoredColumn = {
    id: "col-1",
    project_id: "proj-1",
    name: "Backlog",
    order: 0,
    wip_limit: null,
  };

  it("shows Send to project button when signal is not linked", async () => {
    vi.mocked(getLinkForSignal).mockResolvedValue(null);
    render(
      <InboxDetailPane signal={sig()} onClose={() => {}} onDismiss={() => {}} />,
    );
    const btn = await screen.findByRole("button", {
      name: /send to project/i,
    });
    expect(btn).toBeTruthy();
  });

  it("shows Open card button when signal is already linked", async () => {
    vi.mocked(getLinkForSignal).mockResolvedValue({
      id: "link-1",
      card_id: "card-1",
      project_id: "proj-1",
      signal_id: "sig-1",
      deleted_at: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    vi.mocked(listProjects).mockResolvedValue([project]);
    render(
      <InboxDetailPane signal={sig()} onClose={() => {}} onDismiss={() => {}} />,
    );
    const btn = await screen.findByRole("button", { name: /open card/i });
    expect(btn.textContent).toContain("Backend");
  });

  it("calls onOpenCard with projectId and cardId when Open card is clicked", async () => {
    const onOpenCard = vi.fn();
    vi.mocked(getLinkForSignal).mockResolvedValue({
      id: "link-1",
      card_id: "card-42",
      project_id: "proj-1",
      signal_id: "sig-1",
      deleted_at: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    vi.mocked(listProjects).mockResolvedValue([project]);
    render(
      <InboxDetailPane
        signal={sig()}
        onClose={() => {}}
        onDismiss={() => {}}
        onOpenCard={onOpenCard}
      />,
    );
    const btn = await screen.findByRole("button", { name: /open card/i });
    fireEvent.click(btn);
    expect(onOpenCard).toHaveBeenCalledWith("proj-1", "card-42");
  });

  it("clicking Send to project opens the project picker with project names", async () => {
    vi.mocked(getLinkForSignal).mockResolvedValue(null);
    vi.mocked(listProjects).mockResolvedValue([project]);
    render(
      <InboxDetailPane signal={sig()} onClose={() => {}} onDismiss={() => {}} />,
    );
    const btn = await screen.findByRole("button", { name: /send to project/i });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText("Backend")).toBeTruthy());
  });

  it("selecting a project creates a card and links the signal", async () => {
    vi.mocked(getLinkForSignal).mockResolvedValue(null);
    vi.mocked(listProjects).mockResolvedValue([project]);
    vi.mocked(listColumns).mockResolvedValue([col]);
    vi.mocked(listCards).mockResolvedValue([]);
    vi.mocked(createCard).mockResolvedValue(undefined);
    vi.mocked(linkSignalToCard).mockResolvedValue(undefined);
    render(
      <InboxDetailPane signal={sig()} onClose={() => {}} onDismiss={() => {}} />,
    );
    const sendBtn = await screen.findByRole("button", {
      name: /send to project/i,
    });
    fireEvent.click(sendBtn);
    const projectBtn = await screen.findByRole("button", { name: "Backend" });
    fireEvent.click(projectBtn);
    await waitFor(() => expect(createCard).toHaveBeenCalled());
    expect(createCard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: "proj-1",
        column_id: "col-1",
        title: "Fix the bug",
      }),
    );
    await waitFor(() => expect(linkSignalToCard).toHaveBeenCalled());
    expect(linkSignalToCard).toHaveBeenCalledWith(
      expect.anything(),
      "sig-1",
      expect.any(String),
      "proj-1",
    );
    // After linking, "Open card" button should appear.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /send to project/i }),
      ).toBeNull(),
    );
  });
});

describe("MeetingDetail / AttendeeStack", () => {
  const meetingSignal = {
    id: "m1",
    provider: "google" as const,
    kind: "meeting" as const,
    source_id: "evt-1",
    title: "Standup",
    url: null,
    payload: {
      starts_at: "2026-05-04T15:00:00Z",
      ends_at: "2026-05-04T15:15:00Z",
      organizer: "boss@acme.com",
      description: "- Token refresh edge case\n- Slack adapter retry budget",
      attendees: [
        { email: "p@acme.com", name: "Priya", response: "accepted" as const },
        {
          email: "r@acme.com",
          name: "Rahul",
          response: "needsAction" as const,
        },
        {
          email: "j@acme.com",
          name: "Joon",
          response: "declined" as const,
        },
      ],
    },
    requires_action: false,
    source_created_at: "2026-05-04T15:00:00Z",
    dismissed_at: null,
  } as const;

  it("renders the agenda parsed from the description", () => {
    render(<MeetingDetail signal={meetingSignal} />);
    expect(screen.getByText("Token refresh edge case")).toBeTruthy();
    expect(screen.getByText("Slack adapter retry budget")).toBeTruthy();
  });

  it("renders one avatar per attendee with a hover title showing the attendee's name", () => {
    render(
      <AttendeeStack
        attendees={[
          { email: "p@acme.com", name: "Priya", response: "accepted" },
          { email: "r@acme.com", name: "Rahul", response: "needsAction" },
        ]}
      />,
    );
    expect(screen.getByTitle("Priya")).toBeTruthy();
    expect(screen.getByTitle(/Rahul · needsAction/)).toBeTruthy();
  });

  it("collapses the overflow into a +N pill listing the hidden names", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      email: `u${i}@acme.com`,
      name: `User ${i}`,
      response: "accepted" as const,
    }));
    render(<AttendeeStack attendees={many} max={5} />);
    const overflow = screen.getByText("+3");
    expect(overflow).toBeTruthy();
    const title = overflow.getAttribute("title") ?? "";
    expect(title).toContain("User 5");
    expect(title).toContain("User 7");
  });

  it("uses email as a fallback label when name is missing", () => {
    render(
      <AttendeeStack
        attendees={[{ email: "guest@acme.com", name: null, response: null }]}
      />,
    );
    expect(screen.getByTitle("guest@acme.com")).toBeTruthy();
  });
});
