import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Signal } from "#/lib/signal";
import {
  InboxDetailPane,
  InboxView,
  PrReviewActions,
  SlackReplyComposer,
} from "#/routes/_app.inbox";

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
    const reauth = within(alert).getByRole("link", { name: /reauthorize/i });
    expect(reauth.getAttribute("href")).toBe("/settings");
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
    const reauth = within(alert).getByRole("link", { name: /reauthorize/i });
    expect(reauth.getAttribute("href")).toBe("/settings");
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
