import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SourceFilter,
  type SourceProvider,
  type SourceSelection,
} from "#/features/signals/components/SourceFilter";

const githubTwoAccounts: SourceProvider = {
  provider: "github",
  label: "GitHub",
  accounts: [
    { id: "g-personal", handle: "alice", context: "Personal", status: "ok" },
    {
      id: "g-work",
      handle: "alice@acme",
      context: "Work",
      status: "auth_failed",
    },
  ],
};

const slackOneAccount: SourceProvider = {
  provider: "slack",
  label: "Slack",
  accounts: [{ id: "s-1", handle: "alice", context: "Acme", status: "ok" }],
};

const defaultValue: SourceSelection = { provider: null, accountId: null };

describe("SourceFilter", () => {
  it("renders one chip per provider regardless of account count", () => {
    const { container } = render(
      <SourceFilter
        providers={[githubTwoAccounts, slackOneAccount]}
        value={defaultValue}
        onChange={() => {}}
      />,
    );
    // One chip per provider (data-provider on the chip body); the GitHub
    // provider has 2 accounts but still one chip.
    const chips = container.querySelectorAll(
      'button[data-provider]:not([data-slot])',
    );
    expect(chips).toHaveLength(2);
  });

  it("All sources is pressed by default and selects union when clicked", () => {
    const onChange = vi.fn();
    render(
      <SourceFilter
        providers={[githubTwoAccounts]}
        value={defaultValue}
        onChange={onChange}
      />,
    );
    const all = screen.getByRole("button", { name: "All sources" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(all);
    expect(onChange).toHaveBeenCalledWith({ provider: null, accountId: null });
  });

  it("clicking the provider chip filters to the provider with no accountId", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SourceFilter
        providers={[githubTwoAccounts]}
        value={defaultValue}
        onChange={onChange}
      />,
    );
    const githubChip = container.querySelector(
      'button[data-provider="github"]:not([data-slot])',
    ) as HTMLButtonElement;
    fireEvent.click(githubChip);
    expect(onChange).toHaveBeenCalledWith({
      provider: "github",
      accountId: null,
    });
  });

  it("renders an expand caret only when the provider has ≥2 accounts", () => {
    const { container, rerender } = render(
      <SourceFilter
        providers={[slackOneAccount]}
        value={defaultValue}
        onChange={() => {}}
      />,
    );
    expect(
      container.querySelector('[data-slot="source-filter-expand"]'),
    ).toBeNull();
    rerender(
      <SourceFilter
        providers={[githubTwoAccounts]}
        value={defaultValue}
        onChange={() => {}}
      />,
    );
    expect(
      container.querySelector(
        '[data-slot="source-filter-expand"][data-provider="github"]',
      ),
    ).not.toBeNull();
  });

  it("expanding the chip exposes one entry per account with handle + context + status dot", () => {
    const { container } = render(
      <SourceFilter
        providers={[githubTwoAccounts]}
        value={defaultValue}
        onChange={() => {}}
      />,
    );
    const expand = screen.getByRole("button", {
      name: /Pick a GitHub account/,
    });
    fireEvent.click(expand);
    const menu = container.querySelector(
      '[data-slot="source-filter-menu"][data-provider="github"]',
    );
    expect(menu).not.toBeNull();
    const items = menu?.querySelectorAll("[data-account-id]");
    expect(items?.length).toBe(2);
    // Status dot present per item.
    expect(menu?.querySelector('[data-account-status="ok"]')).not.toBeNull();
    expect(
      menu?.querySelector('[data-account-status="auth_failed"]'),
    ).not.toBeNull();
    // Handle + context rendered.
    expect(menu?.textContent).toContain("alice");
    expect(menu?.textContent).toContain("Personal");
    expect(menu?.textContent).toContain("Work");
  });

  it("selecting a per-account entry scopes to that account_id", () => {
    const onChange = vi.fn();
    render(
      <SourceFilter
        providers={[githubTwoAccounts]}
        value={defaultValue}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Pick a GitHub account/ }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: /alice@acme/ }),
    );
    expect(onChange).toHaveBeenCalledWith({
      provider: "github",
      accountId: "g-work",
    });
  });

  it("submenu offers an All-accounts entry that clears accountId", () => {
    const onChange = vi.fn();
    render(
      <SourceFilter
        providers={[githubTwoAccounts]}
        value={{ provider: "github", accountId: "g-work" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Pick a GitHub account/ }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: /All GitHub accounts/ }),
    );
    expect(onChange).toHaveBeenCalledWith({
      provider: "github",
      accountId: null,
    });
  });
});
