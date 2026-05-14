// Inbox page — smoke, filter, per-kind detail, and loader-contract tests.

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
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    })),
    removeChannel: vi.fn(),
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

vi.mock("#/features/signals/realtime", () => ({
  useSignalsLive: vi.fn(),
}));

vi.mock("#/features/signals/store", () => ({
  listSignals: vi.fn().mockResolvedValue([]),
  dismissSignal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/router", () => ({
  router: { invalidate: vi.fn() },
}));

vi.mock("#/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
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
import { storedSignalToInboxSignal } from "#/features/signals/components/InboxView";
import { PRDetail } from "#/features/signals/details/PRDetail";
import { SlackDetail } from "#/features/signals/details/SlackDetail";
import { MeetingDetail } from "#/features/signals/details/MeetingDetail";
import { TaskDetail } from "#/features/signals/details/TaskDetail";
import type { InboxSignal } from "#/features/signals/components/InboxView";
import type { StoredSignal } from "#/shared/signal";

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

// Fake StoredSignal for loader contract tests
function makeStoredSignal(overrides: Partial<StoredSignal> = {}): StoredSignal {
  return {
    id: "stored-1",
    provider: "github",
    kind: "pr_review_requested",
    source_id: "org/repo#42",
    title: "feat: add signal dedup",
    url: "https://github.com/org/repo/pull/42",
    payload: { repo: "org/repo", number: 42, author: "alice", additions: 10, deletions: 2, changed_files: 1 },
    requires_action: true,
    source_created_at: minsAgo(15),
    unread_count: 2,
    created_at: minsAgo(15),
    updated_at: minsAgo(15),
    dismissed_at: null,
    priority: null,
    snoozed_until: null,
    alert_channels_override: null,
    tags: null,
    ...overrides,
  };
}

// ── InboxPage smoke (loader data passed as initialSignals prop) ────────────────

describe("InboxPage", () => {
  it("renders the Inbox heading when given signals", () => {
    render(<InboxPage initialSignals={[makeStoredSignal()]} />);
    expect(screen.getByText("Inbox")).toBeTruthy();
  });

  it("renders filter chips", () => {
    render(<InboxPage initialSignals={[makeStoredSignal()]} />);
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("PRs")).toBeTruthy();
  });

  it("renders empty state when no signals provided", () => {
    render(<InboxPage initialSignals={[]} />);
    expect(screen.getByText("Inbox is empty")).toBeTruthy();
  });

  it("renders signal rows from stored signals", () => {
    render(<InboxPage initialSignals={[makeStoredSignal()]} />);
    expect(
      screen.getAllByText("feat: add signal dedup").length,
    ).toBeGreaterThan(0);
  });
});

// ── storedSignalToInboxSignal mapper ─────────────────────────────────────────

describe("storedSignalToInboxSignal", () => {
  it("maps github → git source", () => {
    const s = storedSignalToInboxSignal(makeStoredSignal({ provider: "github" }));
    expect(s.source).toBe("git");
  });

  it("maps google → cal source", () => {
    const s = storedSignalToInboxSignal(
      makeStoredSignal({ provider: "google", kind: "meeting", payload: {} }),
    );
    expect(s.source).toBe("cal");
  });

  it("maps slack → slack source", () => {
    const s = storedSignalToInboxSignal(
      makeStoredSignal({
        provider: "slack",
        kind: "dm",
        payload: { channel: "C123", thread_ts: "1234.567" },
      }),
    );
    expect(s.source).toBe("slack");
    expect(s.channel).toBe("C123");
    expect(s.thread_ts).toBe("1234.567");
  });

  it("maps linear → task source", () => {
    const s = storedSignalToInboxSignal(
      makeStoredSignal({ provider: "linear", kind: "ticket_assigned", payload: {} }),
    );
    expect(s.source).toBe("task");
  });

  it("extracts repo, num, author, diff from github payload", () => {
    const s = storedSignalToInboxSignal(makeStoredSignal());
    expect(s.repo).toBe("org/repo");
    expect(s.num).toBe("#42");
    expect(s.author).toBe("alice");
    expect(s.diff).toEqual({ add: 10, del: 2, files: 1 });
  });

  it("sets unread from unread_count", () => {
    const s = storedSignalToInboxSignal(makeStoredSignal({ unread_count: 5 }));
    expect(s.unread).toBe(5);
  });

  it("extracts meeting attendees from google payload", () => {
    const s = storedSignalToInboxSignal(
      makeStoredSignal({
        provider: "google",
        kind: "meeting",
        payload: {
          description: "Discuss roadmap",
          attendees: [
            { email: "alice@example.com", name: "Alice", response: "accepted", organizer: true },
          ],
        },
      }),
    );
    expect(s.meetingNotes).toBe("Discuss roadmap");
    expect(s.meetingAttendees?.[0]?.name).toBe("Alice");
    expect(s.meetingAttendees?.[0]?.organizer).toBe(true);
  });
});

// ── InboxView filter ──────────────────────────────────────────────────────────

describe("InboxView — filter", () => {
  it("shows all signals by default", () => {
    render(<InboxView signals={ALL_SIGNALS} />);
    expect(screen.getAllByText("feat: add signal dedup").length).toBeGreaterThan(0);
    expect(screen.getByText("DM — Bob")).toBeTruthy();
    expect(screen.getByText("Standup")).toBeTruthy();
    expect(screen.getByText("DEV-441 — Add replay rejection")).toBeTruthy();
  });

  it("filters to PRs only when PRs chip clicked", () => {
    render(<InboxView signals={ALL_SIGNALS} defaultSelectedId="g1" />);
    fireEvent.click(screen.getByRole("button", { name: /prs/i }));
    expect(screen.getAllByText("feat: add signal dedup").length).toBeGreaterThan(0);
    const dmRows = screen.queryAllByText("DM — Bob");
    expect(
      dmRows.filter((el) => el.closest("button[type='button']")).length,
    ).toBe(0);
  });

  it("filters to Mentions when Mentions chip clicked", () => {
    render(<InboxView signals={ALL_SIGNALS} />);
    fireEvent.click(screen.getByRole("button", { name: /mentions/i }));
    expect(screen.getByText("DM — Bob")).toBeTruthy();
    const gitRows = screen
      .queryAllByText("feat: add signal dedup")
      .filter((el) => el.closest("button[type='button']"));
    expect(gitRows.length).toBe(0);
  });

  it("renders empty state when signals array is empty", () => {
    render(<InboxView signals={[]} />);
    expect(screen.getByText("Inbox is empty")).toBeTruthy();
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

  it("renders rich-text reply composer", () => {
    render(<SlackDetail signal={slackSignal} />);
    // tiptap renders a contenteditable div (placeholder is a CSS pseudo-element, not DOM text)
    const editor = document.querySelector("[contenteditable]");
    expect(editor).toBeTruthy();
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

  it("renders attendees when provided", () => {
    const withAttendees: InboxSignal = {
      ...calSignal,
      meetingAttendees: [
        { email: "alice@ex.com", name: "Alice", response: "accepted", organizer: true },
      ],
    };
    render(<MeetingDetail signal={withAttendees} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("organizer")).toBeTruthy();
  });

  it("renders meeting notes when provided", () => {
    const withNotes: InboxSignal = {
      ...calSignal,
      meetingNotes: "Discuss Q3 roadmap",
    };
    render(<MeetingDetail signal={withNotes} />);
    expect(screen.getByText("Discuss Q3 roadmap")).toBeTruthy();
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
