import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Asker,
  CommandPalette,
  type Searcher,
} from "#/components/CommandPalette";

type SearcherResponse = Awaited<ReturnType<Searcher>>;

function fakeSearcher(map: Record<string, SearcherResponse>): Searcher {
  return vi.fn(async (scope, query) => {
    const key = `${scope}:${query.trim()}`;
    return map[key] ?? map[scope] ?? { signals: [] };
  });
}

const prResult = {
  id: "s1",
  provider: "github" as const,
  kind: "pr_review_requested" as const,
  source_id: "owner/repo#1",
  title: "Add CommandPalette",
  url: "https://github.com/owner/repo/pull/1",
  payload: {},
  requires_action: true,
  source_created_at: null,
};

const meetingResult = {
  id: "s2",
  provider: "google" as const,
  kind: "meeting" as const,
  source_id: "ev-2",
  title: "Standup",
  url: null,
  payload: {},
  requires_action: false,
  source_created_at: null,
};

afterEach(() => {
  vi.useRealTimers();
});

async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CommandPalette", () => {
  it("opens when the user presses Cmd+K", async () => {
    render(<CommandPalette searcher={fakeSearcher({})} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      screen.getByRole("dialog", { name: /command palette/i }),
    ).toBeTruthy();
  });

  it("renders results from the searcher and arrow-key navigation moves focus", async () => {
    vi.useFakeTimers();
    const searcher = fakeSearcher({
      all: { signals: [prResult, meetingResult] },
    });
    render(<CommandPalette searcher={searcher} initialOpen />);
    await flushDebounce();
    const list = screen.getByRole("list", { name: /results/i });
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].dataset.active).toBe("true");
    expect(buttons[1].dataset.active).toBe("false");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });
    expect(buttons[1].dataset.active).toBe("true");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowUp" });
    expect(buttons[0].dataset.active).toBe("true");
  });

  it("Enter opens the active result via window.open", async () => {
    vi.useFakeTimers();
    const searcher = fakeSearcher({ all: { signals: [prResult] } });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CommandPalette searcher={searcher} initialOpen />);
    await flushDebounce();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/owner/repo/pull/1",
      "_blank",
      "noreferrer",
    );
  });

  it("Tab cycles through enabled scope chips, skipping disabled ones", async () => {
    vi.useFakeTimers();
    render(<CommandPalette searcher={fakeSearcher({})} initialOpen />);
    await flushDebounce();
    const dialog = screen.getByRole("dialog");
    expect(
      screen.getByRole("button", { name: "All", pressed: true }),
    ).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(
      screen.getByRole("button", { name: "PRs", pressed: true }),
    ).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(
      screen.getByRole("button", { name: "Tickets", pressed: true }),
    ).toBeTruthy();
  });

  it("does not open while another modal is already focused", async () => {
    const existing = document.createElement("div");
    existing.setAttribute("role", "dialog");
    existing.setAttribute("aria-label", "Focus session");
    document.body.appendChild(existing);
    try {
      render(<CommandPalette searcher={fakeSearcher({})} />);
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(
        screen.queryByRole("dialog", { name: /command palette/i }),
      ).toBeNull();
    } finally {
      document.body.removeChild(existing);
    }
  });

  it("Escape closes the palette", async () => {
    render(<CommandPalette searcher={fakeSearcher({})} initialOpen />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Ask AI button calls the asker and renders the answer", async () => {
    const searcher = fakeSearcher({ all: { signals: [prResult] } });
    const asker: Asker = vi.fn(
      async () =>
        ({
          ok: true,
          answer: "You're waiting on alice's review.",
          provider: "openai",
          model: "gpt-4o-mini",
          used_fallback: false,
        }) as const,
    );
    render(<CommandPalette searcher={searcher} asker={asker} initialOpen />);
    await waitFor(() => {
      expect(screen.getByText("Add CommandPalette")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText(/search signals/i), {
      target: { value: "what's blocking me?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask ai/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/you're waiting on alice's review\./i),
      ).toBeTruthy();
    });
    expect(asker).toHaveBeenCalledWith("what's blocking me?", ["s1"]);
  });

  it("renders provider-typed secondary metadata for each kind", async () => {
    vi.useFakeTimers();
    const slackDm = {
      id: "s3",
      provider: "slack" as const,
      kind: "dm" as const,
      source_id: "C1:111",
      title: "ping?",
      url: null,
      payload: { channel_type: "im", channel: "alice" },
      requires_action: true,
      source_created_at: null,
    };
    const slackChannel = {
      id: "s4",
      provider: "slack" as const,
      kind: "mention" as const,
      source_id: "C2:222",
      title: "deploy ready",
      url: null,
      payload: { channel: "eng-deploys" },
      requires_action: true,
      source_created_at: null,
    };
    const meeting = {
      ...meetingResult,
      payload: { starts_at: "2026-05-05T15:30:00Z" },
    };
    const linearTicket = {
      id: "s5",
      provider: "linear" as const,
      kind: "ticket_in_progress" as const,
      source_id: "linear-uuid",
      title: "Wire dispatcher",
      url: null,
      payload: { identifier: "ENG-42", state_name: "In Progress" },
      requires_action: false,
      source_created_at: null,
    };
    const githubPr = {
      ...prResult,
      payload: { repo: "owner/repo" },
    };
    const searcher = fakeSearcher({
      all: {
        signals: [slackDm, slackChannel, meeting, linearTicket, githubPr],
      },
    });
    render(<CommandPalette searcher={searcher} initialOpen />);
    await flushDebounce();
    const list = screen.getByRole("list", { name: /results/i });
    const buttons = within(list).getAllByRole("button");
    expect(buttons[0].textContent).toContain("Direct message · DM");
    expect(buttons[1].textContent).toContain("Mention · #eng-deploys");
    expect(buttons[2].textContent).toMatch(/Meeting · /);
    expect(buttons[3].textContent).toContain(
      "In progress · ENG-42 · In Progress",
    );
    expect(buttons[4].textContent).toContain("Review requested · owner/repo");
  });

  it("Ask AI surfaces no_provider with a Settings link", async () => {
    const asker: Asker = vi.fn(
      async () =>
        ({
          ok: false,
          reason: "no_provider",
        }) as const,
    );
    render(
      <CommandPalette searcher={fakeSearcher({})} asker={asker} initialOpen />,
    );
    fireEvent.change(screen.getByLabelText(/search signals/i), {
      target: { value: "hi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask ai/i }));
    await waitFor(() => {
      expect(screen.getByText(/no ai provider configured/i)).toBeTruthy();
    });
    expect(
      screen.getByRole("link", { name: /set one in settings/i }),
    ).toBeTruthy();
  });
});
