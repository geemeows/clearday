// Inbox page — smoke, filter, and per-kind detail tests.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("#/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock("#/features/auth/auth", () => ({
  useAuth: () => ({
    session: { user: { email: "test@example.com", user_metadata: {} } },
    loading: false,
    allowed: true,
    rejected: false,
  }),
  signOut: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (s: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: "/inbox" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

// ── Component imports (after mocks) ──────────────────────────────────────────

import { InboxPage } from "./_app.inbox";
import { InboxView } from "#/features/signals/components/InboxView";
import { InboxRow } from "#/features/signals/components/InboxView";
import { PRDetail } from "#/features/signals/details/PRDetail";
import { SlackDetail } from "#/features/signals/details/SlackDetail";
import { MeetingDetail } from "#/features/signals/details/MeetingDetail";
import { TaskDetail } from "#/features/signals/details/TaskDetail";
import type { InboxSignal } from "#/features/signals/components/InboxView";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date();
const minsAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

const gitSignal: InboxSignal = {
  id: "g1",
  source: "git",
  kind: "pr-review",
  title: "feat: add signal dedup",
  repo: "org/repo",
  num: "#42",
  author: "alice",
  diff: { add: 10, del: 2, files: 1 },
  age: minsAgo(15),
  unread: 2,
  summary: "Adds dedup path.",
};

const slackSignal: InboxSignal = {
  id: "sl1",
  source: "slack",
  kind: "dm",
  title: "DM — Bob",
  sub: "bob: quick Q about the retry budget",
  age: minsAgo(5),
  unread: 1,
  thread: [
    { who: "bob", text: "quick Q about the retry budget", when: minsAgo(5) },
  ],
};

const calSignal: InboxSignal = {
  id: "c1",
  source: "cal",
  kind: "meeting",
  title: "Standup",
  sub: "3 attendees · Google Meet",
  age: minsAgo(60),
  unread: 0,
  agenda: ["Review PRs", "Incident followup"],
};

const taskSignal: InboxSignal = {
  id: "t1",
  source: "task",
  kind: "ticket-assigned",
  title: "DEV-441 — Add replay rejection",
  sub: "P1 · In progress",
  age: minsAgo(60 * 3),
  unread: 0,
};

const ALL_SIGNALS = [gitSignal, slackSignal, calSignal, taskSignal];

// ── InboxPage smoke ───────────────────────────────────────────────────────────

describe("InboxPage", () => {
  it("renders the Inbox heading", () => {
    render(<InboxPage />);
    expect(screen.getByText("Inbox")).toBeTruthy();
  });

  it("renders filter chips", () => {
    render(<InboxPage />);
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("PRs")).toBeTruthy();
    expect(screen.getByText("Tickets")).toBeTruthy();
    expect(screen.getByText("Mentions")).toBeTruthy();
    expect(screen.getByText("Meetings")).toBeTruthy();
  });

  it("renders signal rows", () => {
    render(<InboxPage />);
    // The default selected signal title should appear in both the list and detail
    const titles = screen.getAllByText(
      "feat(signals): batch upsert path for slack webhook",
    );
    expect(titles.length).toBeGreaterThan(0);
  });
});

// ── InboxView filter ──────────────────────────────────────────────────────────

describe("InboxView — filter", () => {
  it("shows all signals by default", () => {
    render(<InboxView signals={ALL_SIGNALS} />);
    // git signal title appears in both list row and PRDetail pane
    expect(screen.getAllByText("feat: add signal dedup").length).toBeGreaterThan(0);
    expect(screen.getByText("DM — Bob")).toBeTruthy();
    expect(screen.getByText("Standup")).toBeTruthy();
    expect(screen.getByText("DEV-441 — Add replay rejection")).toBeTruthy();
  });

  it("filters to PRs only when PRs chip clicked", () => {
    render(<InboxView signals={ALL_SIGNALS} defaultSelectedId="g1" />);
    fireEvent.click(screen.getByRole("button", { name: /prs/i }));
    // Title appears in both list row and detail pane — at least one match expected
    expect(screen.getAllByText("feat: add signal dedup").length).toBeGreaterThan(0);
    // slack signal row button should not be in the filtered list
    const dmRows = screen.queryAllByText("DM — Bob");
    expect(
      dmRows.filter((el) => el.closest("button[type='button']")).length,
    ).toBe(0);
  });

  it("filters to Mentions when Mentions chip clicked", () => {
    render(<InboxView signals={ALL_SIGNALS} />);
    fireEvent.click(screen.getByRole("button", { name: /mentions/i }));
    expect(screen.getByText("DM — Bob")).toBeTruthy();
    // git row should not be visible as a clickable list item
    const gitRows = screen
      .queryAllByText("feat: add signal dedup")
      .filter((el) => el.closest("button[type='button']"));
    expect(gitRows.length).toBe(0);
  });
});

// ── InboxRow unit ─────────────────────────────────────────────────────────────

describe("InboxRow", () => {
  it("renders signal title", () => {
    render(
      <InboxRow signal={gitSignal} selected={false} onClick={() => {}} />,
    );
    expect(screen.getByText("feat: add signal dedup")).toBeTruthy();
  });

  it("shows unread badge when unread > 0", () => {
    render(
      <InboxRow signal={gitSignal} selected={false} onClick={() => {}} />,
    );
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <InboxRow signal={gitSignal} selected={false} onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows severity badge for ci-failure signals", () => {
    const ciSig: InboxSignal = {
      ...gitSignal,
      id: "ci1",
      severity: "high",
      title: "CI failed",
    };
    render(<InboxRow signal={ciSig} selected={false} onClick={() => {}} />);
    expect(screen.getByText("CI fail")).toBeTruthy();
  });

  it("shows auto-rule badge", () => {
    const ruleSig: InboxSignal = {
      ...gitSignal,
      id: "r1",
      badge: "auto-rule",
      title: "chore: bump zod",
      unread: 0,
    };
    render(<InboxRow signal={ruleSig} selected={false} onClick={() => {}} />);
    expect(screen.getByText("Rule")).toBeTruthy();
  });
});

// ── Detail panes ──────────────────────────────────────────────────────────────

describe("PRDetail", () => {
  it("renders PR title", () => {
    render(<PRDetail signal={gitSignal} />);
    expect(screen.getByText("feat: add signal dedup")).toBeTruthy();
  });

  it("renders AI summary", () => {
    render(<PRDetail signal={gitSignal} />);
    expect(screen.getByText("Adds dedup path.")).toBeTruthy();
  });

  it("renders Approve button", () => {
    render(<PRDetail signal={gitSignal} />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeTruthy();
  });

  it("shows Approved state after clicking Approve", () => {
    render(<PRDetail signal={gitSignal} />);
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(screen.getByText("Approved")).toBeTruthy();
  });
});

describe("SlackDetail", () => {
  it("renders heading based on kind", () => {
    render(<SlackDetail signal={slackSignal} />);
    expect(screen.getByText("Direct message")).toBeTruthy();
  });

  it("renders thread messages", () => {
    render(<SlackDetail signal={slackSignal} />);
    expect(
      screen.getByText("quick Q about the retry budget"),
    ).toBeTruthy();
  });

  it("renders reply composer", () => {
    render(<SlackDetail signal={slackSignal} />);
    expect(screen.getByPlaceholderText("Reply to thread…")).toBeTruthy();
  });

  it("Send button is disabled when reply is empty", () => {
    render(<SlackDetail signal={slackSignal} />);
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn.hasAttribute("disabled")).toBe(true);
  });
});

describe("MeetingDetail", () => {
  it("renders meeting title", () => {
    render(<MeetingDetail signal={calSignal} />);
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("renders agenda items", () => {
    render(<MeetingDetail signal={calSignal} />);
    expect(screen.getByText("· Review PRs")).toBeTruthy();
    expect(screen.getByText("· Incident followup")).toBeTruthy();
  });

  it("renders Join meeting button", () => {
    render(<MeetingDetail signal={calSignal} />);
    expect(
      screen.getByRole("button", { name: /join meeting/i }),
    ).toBeTruthy();
  });
});

describe("TaskDetail", () => {
  it("renders ticket title", () => {
    render(<TaskDetail signal={taskSignal} />);
    expect(screen.getByText("DEV-441 — Add replay rejection")).toBeTruthy();
  });

  it("renders sub-label", () => {
    render(<TaskDetail signal={taskSignal} />);
    expect(screen.getByText("P1 · In progress")).toBeTruthy();
  });
});
