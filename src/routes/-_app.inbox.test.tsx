import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Signal } from "#/lib/signal";
import { InboxDetailPane, InboxView } from "#/routes/_app.inbox";

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
  it("renders signal rows with provider, title, and an Open link", () => {
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
    expect(screen.getByLabelText("Source: github")).toBeTruthy();
    const link = screen.getByRole("link", { name: /open/i });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/owner/repo/pull/42",
    );
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
    const all = within(filters).getByRole("button", { name: "All" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(filters).getByRole("button", { name: "PRs" }));
    expect(onFilterChange).toHaveBeenCalledWith("prs");
  });

  it("invokes onDismiss with the signal id", async () => {
    const onDismiss = vi.fn();
    render(
      <InboxView
        filter="all"
        onFilterChange={() => {}}
        signals={[sample({ id: "abc" })]}
        error={null}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
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
    expect(within(pane).getByText("owner/repo#42")).toBeTruthy();
    expect(within(pane).getByText("@alice")).toBeTruthy();
    expect(within(pane).getByText(/awaiting your action/i)).toBeTruthy();
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

  it("renders a Meeting layout with time, Join button and linked PRs", () => {
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
    const join = within(pane).getByRole("link", { name: /^join$/i });
    expect(join.getAttribute("href")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    const linked = within(pane).getByRole("link", { name: "acme/web#123" });
    expect(linked.getAttribute("href")).toBe(
      "https://github.com/acme/web/pull/123",
    );
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
