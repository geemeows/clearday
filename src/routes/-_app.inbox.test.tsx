import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Signal } from "#/lib/signal";
import { InboxView } from "#/routes/_app.inbox";

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
});
