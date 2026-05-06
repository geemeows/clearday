import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntegrationsPanel } from "#/features/integrations/components/IntegrationsPanel";
import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";

const NOW = Date.parse("2026-05-05T12:00:00Z");

type ApiSource = {
  provider: string;
  status: ProviderAccountStatus;
  last_polled_at?: string | null;
};

function loaderWith(sources: ApiSource[]) {
  return () => Promise.resolve({ sources });
}

const FRESH_GITHUB = {
  provider: "github",
  status: "ok" as const,
  last_polled_at: new Date(NOW - 32_000).toISOString(),
};
const FRESH_SLACK = {
  provider: "slack",
  status: "ok" as const,
  last_polled_at: new Date(NOW - 60_000).toISOString(),
};
const FRESH_GOOGLE = {
  provider: "google",
  status: "ok" as const,
  last_polled_at: new Date(NOW - 90_000).toISOString(),
};

describe("IntegrationsPanel", () => {
  it("renders one row per provider with the right status dot", async () => {
    const loader = loaderWith([FRESH_GITHUB, FRESH_SLACK, FRESH_GOOGLE]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);

    for (const label of ["GitHub", "Slack", "Google Calendar", "Linear"]) {
      expect(
        screen.getByRole("listitem", { name: `${label} integration` }),
      ).toBeTruthy();
    }

    await waitFor(() => {
      const github = screen.getByRole("listitem", {
        name: "GitHub integration",
      });
      const dot = within(github).getByLabelText(/GitHub status/);
      expect(dot.getAttribute("data-status")).toBe("ok");
    });

    const slackDot = within(
      screen.getByRole("listitem", { name: "Slack integration" }),
    ).getByLabelText(/Slack status/);
    expect(slackDot.getAttribute("data-status")).toBe("ok");

    const linearDot = within(
      screen.getByRole("listitem", { name: "Linear integration" }),
    ).getByLabelText(/Linear status/);
    expect(linearDot.getAttribute("data-status")).toBe("neutral");
  });

  it("renders an auth-failed dot when the API reports auth_failed", async () => {
    const loader = loaderWith([
      {
        provider: "github",
        status: "auth_failed" as const,
        last_polled_at: null,
      },
    ]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);
    await waitFor(() => {
      const github = screen.getByRole("listitem", {
        name: "GitHub integration",
      });
      expect(
        within(github)
          .getByLabelText(/GitHub status/)
          .getAttribute("data-status"),
      ).toBe("auth_failed");
    });
  });

  it("toggle flips the Switch's checked state", async () => {
    const loader = loaderWith([FRESH_GITHUB]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);
    const toggle = screen.getByLabelText("GitHub enabled");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("renders a Reauthorize button on each provider row", async () => {
    const loader = loaderWith([FRESH_GITHUB]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);
    const buttons = screen.getAllByRole("button", { name: /reauthorize/i });
    expect(buttons.length).toBe(4);
  });

  it("Reauthorize calls connectUrl and opens the returned URL", async () => {
    const loader = loaderWith([FRESH_GITHUB]);
    const connectUrl = vi.fn(async (provider: string) => ({
      ok: true,
      url: `https://auth.example.com/start/${provider}`,
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
      const github = screen.getByRole("listitem", {
        name: "GitHub integration",
      });
      expect(
        within(github)
          .getByLabelText(/GitHub status/)
          .getAttribute("data-status"),
      ).toBe("ok");
    });
    const github = screen.getByRole("listitem", {
      name: "GitHub integration",
    });
    fireEvent.click(
      within(github).getByRole("button", { name: /reauthorize/i }),
    );
    await waitFor(() => {
      expect(connectUrl).toHaveBeenCalledWith("github");
      expect(openUrl).toHaveBeenCalledWith(
        "https://auth.example.com/start/github",
      );
    });
  });

  it("Reauthorize surfaces an error when connectUrl fails", async () => {
    const loader = loaderWith([FRESH_GITHUB]);
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
    const github = screen.getByRole("listitem", {
      name: "GitHub integration",
    });
    fireEvent.click(
      within(github).getByRole("button", { name: /reauthorize/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("no backend");
    });
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("Disconnect button only renders for connected non-mock providers", async () => {
    const loader = loaderWith([FRESH_GITHUB]);
    render(<IntegrationsPanel sourcesLoader={loader} now={NOW} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Disconnect GitHub" }),
      ).toBeTruthy();
    });
    // Slack/Google have no /api/sources entry → neutral → no Disconnect.
    expect(
      screen.queryByRole("button", { name: "Disconnect Slack" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Disconnect Google Calendar" }),
    ).toBeNull();
    // Linear is mock → no Disconnect even though it's listed.
    expect(
      screen.queryByRole("button", { name: "Disconnect Linear" }),
    ).toBeNull();
  });

  it("Disconnect calls the disconnect handler and refreshes status", async () => {
    let call = 0;
    const sourcesLoader = vi.fn(async () => {
      call += 1;
      return call === 1
        ? { sources: [FRESH_GITHUB] }
        : { sources: [] as (typeof FRESH_GITHUB)[] };
    });
    const disconnect = vi.fn(async () => ({ ok: true }));
    render(
      <IntegrationsPanel
        sourcesLoader={sourcesLoader}
        disconnect={disconnect}
        now={NOW}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Disconnect GitHub" }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Disconnect GitHub" }));
    await waitFor(() => {
      expect(disconnect).toHaveBeenCalledWith("github");
      expect(sourcesLoader).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Disconnect GitHub" }),
      ).toBeNull();
    });
  });

  it("Disconnect surfaces error when handler returns ok:false", async () => {
    const loader = loaderWith([FRESH_GITHUB]);
    const disconnect = vi.fn(async () => ({
      ok: false,
      error: "server boom",
    }));
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        disconnect={disconnect}
        now={NOW}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Disconnect GitHub" }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Disconnect GitHub" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("server boom");
    });
    // Row is still connected since disconnect failed.
    expect(
      screen.getByRole("button", { name: "Disconnect GitHub" }),
    ).toBeTruthy();
  });

  it("allowlist add appends a chip and prefixes # when missing", () => {
    const loader = loaderWith([]);
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        initialAllowlist={["#eng-platform"]}
        now={NOW}
      />,
    );
    const list = screen.getByRole("list", { name: "Slack channel allowlist" });
    expect(within(list).getAllByRole("listitem").length).toBe(1);

    const input = screen.getByLabelText(
      "Add Slack channel",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "design-review" } });
    fireEvent.click(screen.getByRole("button", { name: /add channel/i }));

    expect(within(list).getAllByRole("listitem").length).toBe(2);
    expect(within(list).getByText("#design-review")).toBeTruthy();
    expect(input.value).toBe("");
  });

  it("allowlist remove drops the chip", () => {
    const loader = loaderWith([]);
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        initialAllowlist={["#eng-platform", "#oncall"]}
        now={NOW}
      />,
    );
    const list = screen.getByRole("list", { name: "Slack channel allowlist" });
    expect(within(list).getAllByRole("listitem").length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove #oncall" }));
    expect(within(list).getAllByRole("listitem").length).toBe(1);
    expect(within(list).queryByText("#oncall")).toBeNull();
  });

  it("ignores duplicate channel adds", () => {
    const loader = loaderWith([]);
    render(
      <IntegrationsPanel
        sourcesLoader={loader}
        initialAllowlist={["#eng-platform"]}
        now={NOW}
      />,
    );
    const input = screen.getByLabelText(
      "Add Slack channel",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "eng-platform" } });
    fireEvent.click(screen.getByRole("button", { name: /add channel/i }));
    const list = screen.getByRole("list", { name: "Slack channel allowlist" });
    expect(within(list).getAllByRole("listitem").length).toBe(1);
  });
});
