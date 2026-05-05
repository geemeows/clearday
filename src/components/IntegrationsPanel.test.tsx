import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntegrationsPanel } from "#/components/IntegrationsPanel";
import type { ApiSourceStatus } from "#/lib/source-status";

const NOW = Date.parse("2026-05-05T12:00:00Z");

type ApiSource = {
  provider: string;
  status: ApiSourceStatus;
  last_polled_at?: string | null;
};

function loaderWith(sources: ApiSource[]) {
  return () => Promise.resolve({ sources });
}

const FRESH_GITHUB = {
  provider: "github",
  status: "connected" as const,
  last_polled_at: new Date(NOW - 32_000).toISOString(),
};
const FRESH_SLACK = {
  provider: "slack",
  status: "connected" as const,
  last_polled_at: new Date(NOW - 60_000).toISOString(),
};
const FRESH_GOOGLE = {
  provider: "google",
  status: "connected" as const,
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
