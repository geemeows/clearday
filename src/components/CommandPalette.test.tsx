import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Calendar, Moon } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Asker,
  CommandPalette,
  type PaletteCommand,
  type Result,
  type Searcher,
} from "#/components/CommandPalette";

type SearcherResponse = Awaited<ReturnType<Searcher>>;

function fakeSearcher(map: Record<string, SearcherResponse>): Searcher {
  return vi.fn(async (query) => {
    return map[query.trim()] ?? map[""] ?? { signals: [] };
  });
}

const prResult: Result = {
  id: "s1",
  provider: "github",
  kind: "pr_review_requested",
  source_id: "owner/repo#1",
  title: "Add CommandPalette",
  url: "https://github.com/owner/repo/pull/1",
  payload: { repo: "owner/repo" },
  requires_action: true,
  source_created_at: null,
};

const ticketResult: Result = {
  id: "s2",
  provider: "linear",
  kind: "ticket_in_progress",
  source_id: "linear-uuid",
  title: "Wire dispatcher",
  url: null,
  payload: { identifier: "ENG-42", state_name: "In Progress" },
  requires_action: false,
  source_created_at: null,
};

const meetingResult: Result = {
  id: "s3",
  provider: "google",
  kind: "meeting",
  source_id: "ev-3",
  title: "Standup",
  url: null,
  payload: {},
  requires_action: false,
  source_created_at: null,
};

const slackResult: Result = {
  id: "s4",
  provider: "slack",
  kind: "mention",
  source_id: "C2:222",
  title: "deploy ready",
  url: null,
  payload: { channel: "eng-deploys" },
  requires_action: true,
  source_created_at: null,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CommandPalette", () => {
  it("opens via the devy:open-cmdk event", async () => {
    render(<CommandPalette searcher={fakeSearcher({})} />);
    expect(
      screen.queryByRole("dialog", { name: /command palette/i }),
    ).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("devy:open-cmdk"));
    });
    expect(
      screen.getByRole("dialog", { name: /command palette/i }),
    ).toBeTruthy();
  });

  it("opens via Cmd+K", async () => {
    render(<CommandPalette searcher={fakeSearcher({})} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      screen.getByRole("dialog", { name: /command palette/i }),
    ).toBeTruthy();
  });

  it("renders results grouped by source with a SourceGlyph per row", async () => {
    vi.useFakeTimers();
    const searcher = fakeSearcher({
      "": { signals: [prResult, ticketResult, meetingResult, slackResult] },
    });
    render(<CommandPalette searcher={searcher} initialOpen />);
    await flushDebounce();
    expect(screen.getByText("PRs")).toBeTruthy();
    expect(screen.getByText("Tickets")).toBeTruthy();
    expect(screen.getByText("Meetings")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();
    // SourceGlyph is rendered as role="img" with a labelled source per row.
    expect(screen.getAllByRole("img", { name: /git source/i })).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: /task source/i })).toHaveLength(
      1,
    );
    expect(
      screen.getAllByRole("img", { name: /calendar source/i }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: /slack source/i })).toHaveLength(
      1,
    );
  });

  it("typing filters results across groups", async () => {
    vi.useFakeTimers();
    const searcher = fakeSearcher({
      "": { signals: [prResult, ticketResult, meetingResult, slackResult] },
      deploy: { signals: [slackResult] },
    });
    render(<CommandPalette searcher={searcher} initialOpen />);
    await flushDebounce();
    expect(screen.getByText("Add CommandPalette")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/search signals/i), {
      target: { value: "deploy" },
    });
    await flushDebounce();
    expect(screen.queryByText("Add CommandPalette")).toBeNull();
    expect(screen.queryByText("Wire dispatcher")).toBeNull();
    expect(screen.queryByText("Standup")).toBeNull();
    expect(screen.getByText("deploy ready")).toBeTruthy();
    expect(screen.queryByText("PRs")).toBeNull();
    expect(screen.getByText("Slack")).toBeTruthy();
  });

  it("ArrowDown / ArrowUp moves the visible selection across grouped items", async () => {
    vi.useFakeTimers();
    const searcher = fakeSearcher({
      "": { signals: [prResult, ticketResult] },
    });
    render(<CommandPalette searcher={searcher} initialOpen />);
    await flushDebounce();
    const items = screen.getAllByRole("option");
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute("data-selected")).toBe("true");
    expect(items[1].getAttribute("data-selected")).toBe("false");
    fireEvent.keyDown(screen.getByLabelText(/search signals/i), {
      key: "ArrowDown",
    });
    expect(items[0].getAttribute("data-selected")).toBe("false");
    expect(items[1].getAttribute("data-selected")).toBe("true");
    fireEvent.keyDown(screen.getByLabelText(/search signals/i), {
      key: "ArrowUp",
    });
    expect(items[0].getAttribute("data-selected")).toBe("true");
    expect(items[1].getAttribute("data-selected")).toBe("false");
  });

  it("Enter fires the open-result callback for the active row", async () => {
    vi.useFakeTimers();
    const searcher = fakeSearcher({ "": { signals: [prResult] } });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CommandPalette searcher={searcher} initialOpen />);
    await flushDebounce();
    fireEvent.keyDown(screen.getByLabelText(/search signals/i), {
      key: "Enter",
    });
    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/owner/repo/pull/1",
      "_blank",
      "noreferrer",
    );
  });

  it("Cmd+Enter fires the ask-AI callback instead of opening the active row", async () => {
    const searcher = fakeSearcher({ "": { signals: [prResult] } });
    const asker: Asker = vi.fn(
      async () =>
        ({
          ok: true,
          answer: "You're waiting on alice's review.",
          provider: "anthropic",
          model: "claude-haiku-4-5",
          used_fallback: false,
        }) as const,
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CommandPalette searcher={searcher} asker={asker} initialOpen />);
    await waitFor(() => {
      expect(screen.getByText("Add CommandPalette")).toBeTruthy();
    });
    const input = screen.getByLabelText(/search signals/i);
    fireEvent.change(input, { target: { value: "what's blocking me?" } });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    await waitFor(() => {
      expect(asker).toHaveBeenCalledWith("what's blocking me?", ["s1"]);
    });
    expect(openSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByText(/you're waiting on alice's review\./i),
      ).toBeTruthy();
    });
  });

  it("renders provided commands grouped by Navigation and Actions", async () => {
    const navigate = vi.fn();
    const toggleTheme = vi.fn();
    const commands: PaletteCommand[] = [
      {
        id: "nav:/calendar",
        group: "Navigation",
        label: "Go to Calendar",
        keywords: "Calendar",
        icon: Calendar,
        onSelect: () => navigate("/calendar"),
      },
      {
        id: "action:theme-toggle",
        group: "Actions",
        label: "Switch to dark mode",
        keywords: "theme dark light mode",
        icon: Moon,
        onSelect: toggleTheme,
      },
    ];
    render(
      <CommandPalette
        searcher={fakeSearcher({})}
        commands={commands}
        initialOpen
      />,
    );
    expect(screen.getByText("Navigation")).toBeTruthy();
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getByText("Go to Calendar")).toBeTruthy();
    expect(screen.getByText("Switch to dark mode")).toBeTruthy();
  });

  it("filters commands by typed query (label + keywords)", async () => {
    vi.useFakeTimers();
    const commands: PaletteCommand[] = [
      {
        id: "nav:/calendar",
        group: "Navigation",
        label: "Go to Calendar",
        keywords: "Calendar",
        icon: Calendar,
        onSelect: () => {},
      },
      {
        id: "action:theme-toggle",
        group: "Actions",
        label: "Switch to dark mode",
        keywords: "theme appearance",
        icon: Moon,
        onSelect: () => {},
      },
    ];
    render(
      <CommandPalette
        searcher={fakeSearcher({})}
        commands={commands}
        initialOpen
      />,
    );
    fireEvent.change(screen.getByLabelText(/search signals/i), {
      target: { value: "appearance" },
    });
    await flushDebounce();
    expect(screen.queryByText("Go to Calendar")).toBeNull();
    expect(screen.getByText("Switch to dark mode")).toBeTruthy();
  });

  it("selecting a command invokes onSelect and closes the palette", async () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const commands: PaletteCommand[] = [
      {
        id: "action:theme-toggle",
        group: "Actions",
        label: "Switch to dark mode",
        icon: Moon,
        onSelect,
      },
    ];
    render(
      <CommandPalette
        searcher={fakeSearcher({})}
        commands={commands}
        initialOpen
      />,
    );
    await flushDebounce();
    fireEvent.keyDown(screen.getByLabelText(/search signals/i), {
      key: "Enter",
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("dialog", { name: /command palette/i }),
    ).toBeNull();
  });

  it("Ask AI footer shows the typed query and the provider chip", async () => {
    render(<CommandPalette searcher={fakeSearcher({})} initialOpen />);
    const footer = screen.getByRole("region", { name: /ask ai/i });
    expect(within(footer).getByText("HAIKU 4.5")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/search signals/i), {
      target: { value: "what's blocking me?" },
    });
    expect(within(footer).getByText("what's blocking me?")).toBeTruthy();
  });
});
