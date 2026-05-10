import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsPanel } from "#/features/integrations/components/IntegrationsPanel";
import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";

const NOW = Date.parse("2026-05-05T12:00:00Z");

type ApiSource = {
  provider: string;
  status: ProviderAccountStatus;
  last_polled_at?: string | null;
  id?: string | null;
  account_id?: string | null;
  handle?: string | null;
  display_name?: string | null;
  context?: string | null;
  primary?: boolean | null;
};

function loaderWith(sources: ApiSource[]) {
  return () => Promise.resolve({ sources });
}

const GITHUB_ACCT: ApiSource = {
  provider: "github",
  status: "ok",
  last_polled_at: new Date(NOW - 32_000).toISOString(),
  id: "acc-gh-1",
  account_id: "alice",
  handle: "@alice",
  display_name: "Alice",
  context: "Personal · 14 repos",
  primary: true,
};

const GITHUB_WORK: ApiSource = {
  provider: "github",
  status: "ok",
  last_polled_at: new Date(NOW - 60_000).toISOString(),
  id: "acc-gh-2",
  account_id: "alice-work",
  handle: "@alice-work",
  display_name: "Alice (Acme)",
  context: "Acme · 22 repos",
  primary: false,
};

const SLACK_ACCT: ApiSource = {
  provider: "slack",
  status: "auth_failed",
  last_polled_at: null,
  id: "acc-slack-1",
  account_id: "T1",
  handle: "@kovacs",
  display_name: "Kovacs",
  context: "Acme workspace",
  primary: true,
};

beforeEach(() => {
  if (typeof window !== "undefined") window.localStorage.clear();
});

describe("IntegrationsPanel", () => {
  it("renders one provider card per provider with header + count + add button", async () => {
    const loader = loaderWith([GITHUB_ACCT]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);

    for (const label of ["GitHub", "Slack", "Google Calendar", "Linear"]) {
      const card = screen.getByRole("listitem", {
        name: `${label} integration`,
      });
      expect(card).toBeTruthy();
      // Single "+ Add account" affordance per card.
      expect(
        within(card).getByRole("button", { name: `Add ${label} account` }),
      ).toBeTruthy();
    }

    // No provider-level toggle, no per-account on/off Switch anywhere.
    expect(screen.queryByLabelText(/enabled$/i)).toBeNull();
  });

  it("renders one AccountRow per connected account with primary tag, status dot, last sync, and context", async () => {
    const loader = loaderWith([GITHUB_ACCT, GITHUB_WORK]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);

    await waitFor(() => {
      expect(
        screen.getByRole("listitem", { name: /GitHub account @alice$/ }),
      ).toBeTruthy();
    });

    const personal = screen.getByRole("listitem", {
      name: "GitHub account @alice",
    });
    const work = screen.getByRole("listitem", {
      name: "GitHub account @alice-work",
    });

    expect(within(personal).getByText("Primary")).toBeTruthy();
    expect(within(work).queryByText("Primary")).toBeNull();

    expect(
      within(personal)
        .getByLabelText(/status:/i)
        .getAttribute("data-account-status"),
    ).toBe("ok");

    // Status text reflects the last-sync timestamp.
    expect(within(personal).getByText(/last sync/i)).toBeTruthy();
    // Context string renders.
    expect(within(personal).getByText(/Personal · 14 repos/)).toBeTruthy();
  });

  it("renders no AccountRow when the provider has zero connected accounts", async () => {
    const loader = loaderWith([
      // Server emits a neutral placeholder row (id null) for unconnected
      // providers; the panel must drop those rather than render a row.
      {
        provider: "slack",
        status: "neutral",
        id: null,
        account_id: null,
        primary: false,
      },
    ]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);
    await waitFor(() => {
      expect(
        screen.getByRole("listitem", { name: "Slack integration" }),
      ).toBeTruthy();
    });
    const slack = screen.getByRole("listitem", { name: "Slack integration" });
    expect(within(slack).queryByLabelText(/Slack accounts/)).toBeNull();
  });

  it("'+ Add account' triggers a fresh OAuth flow with no account_id", async () => {
    const loader = loaderWith([GITHUB_ACCT]);
    const connectUrl = vi.fn(async () => ({
      ok: true,
      url: "https://auth.example.com/start/github",
    }));
    const openUrl = vi.fn();
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        connectUrl={connectUrl}
        openUrl={openUrl}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add GitHub account" }));
    await waitFor(() => {
      expect(connectUrl).toHaveBeenCalled();
      expect(openUrl).toHaveBeenCalledWith(
        "https://auth.example.com/start/github",
      );
    });
    const callArgs = connectUrl.mock.calls[0] as unknown as
      | [string, string | undefined]
      | undefined;
    expect(callArgs?.[0]).toBe("github");
    // Fresh OAuth: no account_id passed.
    expect(callArgs?.[1]).toBeUndefined();
  });

  it("Reauthorize triggers connect-url keyed to the row's account_id", async () => {
    const loader = loaderWith([GITHUB_ACCT]);
    const connectUrl = vi.fn(async () => ({
      ok: true,
      url: "https://auth.example.com/start/github?account_id=acc-gh-1",
    }));
    const openUrl = vi.fn();
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        connectUrl={connectUrl}
        openUrl={openUrl}
        now={NOW}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Reauthorize @alice" }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Reauthorize @alice" }));
    await waitFor(() => {
      expect(connectUrl).toHaveBeenCalledWith("github", "acc-gh-1");
      expect(openUrl).toHaveBeenCalled();
    });
  });

  it("Remove calls removeAccount with the row's id and refreshes", async () => {
    let call = 0;
    const sourcesLoader = vi.fn(async () => {
      call += 1;
      return call === 1
        ? { sources: [GITHUB_ACCT] }
        : { sources: [] as ApiSource[] };
    });
    const removeAccount = vi.fn(async () => ({ ok: true }));
    render(
      <IntegrationsPanel
        sourcesLoader={sourcesLoader}
        removeAccount={removeAccount}
        now={NOW}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove @alice" }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove @alice" }));
    await waitFor(() => {
      expect(removeAccount).toHaveBeenCalledWith("acc-gh-1");
      expect(sourcesLoader).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Remove @alice" }),
      ).toBeNull();
    });
  });

  it("Remove surfaces an error from removeAccount", async () => {
    const loader = loaderWith([GITHUB_ACCT]);
    const removeAccount = vi.fn(async () => ({
      ok: false,
      error: "server boom",
    }));
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        removeAccount={removeAccount}
        now={NOW}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove @alice" }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove @alice" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("server boom");
    });
    // Row still present since remove failed.
    expect(screen.getByRole("button", { name: "Remove @alice" })).toBeTruthy();
  });

  it("Add account button is disabled for mock providers", () => {
    const loader = loaderWith([]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);
    const linear = screen.getByRole("button", { name: "Add Linear account" });
    expect(linear.hasAttribute("disabled")).toBe(true);
  });

  it("auth-failed accounts render an auth_failed status dot", async () => {
    const loader = loaderWith([SLACK_ACCT]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);
    await waitFor(() => {
      expect(
        screen.getByRole("listitem", { name: "Slack account @kovacs" }),
      ).toBeTruthy();
    });
    const row = screen.getByRole("listitem", {
      name: "Slack account @kovacs",
    });
    expect(
      within(row)
        .getByLabelText(/status:/i)
        .getAttribute("data-account-status"),
    ).toBe("auth_failed");
  });

  it("Slack channel allowlist renders inside the Slack provider card", () => {
    const loader = loaderWith([]);
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        initialAllowlist={["#eng-platform"]}
        now={NOW}
      />,
    );
    const slack = screen.getByRole("listitem", { name: "Slack integration" });
    const list = within(slack).getByRole("list", {
      name: "Slack channel allowlist",
    });
    expect(within(list).getAllByRole("listitem").length).toBe(1);

    const input = within(slack).getByLabelText(
      "Add Slack channel",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "design-review" } });
    fireEvent.click(
      within(slack).getByRole("button", { name: /add channel/i }),
    );
    expect(within(list).getAllByRole("listitem").length).toBe(2);
    expect(within(list).getByText("#design-review")).toBeTruthy();
  });

  it("week-start setting renders inside the Calendar card and persists to localStorage + dispatches devy:weekStartChanged", () => {
    const loader = loaderWith([]);
    const handler = vi.fn();
    window.addEventListener("devy:weekStartChanged", handler as EventListener);

    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        initialWeekStart="monday"
        now={NOW}
      />,
    );
    const calendar = screen.getByRole("listitem", {
      name: "Google Calendar integration",
    });
    const group = within(calendar).getByRole("radiogroup", {
      name: "Week start",
    });
    const sunday = within(group).getByRole("radio", { name: /sunday/i });
    fireEvent.click(sunday);
    expect(window.localStorage.getItem("devy:weekStart")).toBe("sunday");
    expect(handler).toHaveBeenCalled();
    const evt = handler.mock.calls[0]?.[0] as CustomEvent<{
      weekStart: string;
    }>;
    expect(evt.detail.weekStart).toBe("sunday");

    window.removeEventListener(
      "devy:weekStartChanged",
      handler as EventListener,
    );
  });

  it("Reauthorize surfaces an error when connectUrl fails", async () => {
    const loader = loaderWith([GITHUB_ACCT]);
    const connectUrl = vi.fn(async () => ({
      ok: false,
      error: "no backend",
    }));
    const openUrl = vi.fn();
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        connectUrl={connectUrl}
        openUrl={openUrl}
        now={NOW}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Reauthorize @alice" }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Reauthorize @alice" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("no backend");
    });
    expect(openUrl).not.toHaveBeenCalled();
  });
});
