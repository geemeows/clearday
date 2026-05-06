import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InboxPreviewRow } from "#/features/signals/components/InboxPreviewRow";
import type { StoredSignal } from "#/shared/signal";

const baseSignal = (over: Partial<StoredSignal> = {}): StoredSignal => ({
  id: "p1",
  provider: "github",
  kind: "pr_review_requested",
  source_id: "p1",
  title: "Wire up the new pulse card",
  url: "https://github.com/acme/web/pull/123",
  payload: { repo: "acme/web", number: 123, author: "rin" },
  requires_action: true,
  source_created_at: "2026-05-04T11:00:00.000Z",
  unread_count: 0,
  created_at: "2026-05-04T11:00:00.000Z",
  updated_at: "2026-05-04T11:00:00.000Z",
  dismissed_at: null,
  priority: null,
  snoozed_until: null,
  alert_channels_override: null,
  tags: null,
  ...over,
});

describe("InboxPreviewRow", () => {
  const nowIso = "2026-05-04T12:00:00.000Z";

  it("renders the source glyph for the signal's provider", () => {
    const { container } = render(
      <InboxPreviewRow signal={baseSignal()} nowIso={nowIso} />,
    );
    const glyph = container.querySelector('[data-source="git"]');
    expect(glyph).not.toBeNull();
  });

  it("renders an unread dot when unread_count > 0", () => {
    const { container, rerender } = render(
      <InboxPreviewRow
        signal={baseSignal({ unread_count: 3 })}
        nowIso={nowIso}
      />,
    );
    expect(container.querySelector('[data-slot="unread-dot"]')).not.toBeNull();

    rerender(
      <InboxPreviewRow
        signal={baseSignal({ unread_count: 0 })}
        nowIso={nowIso}
      />,
    );
    expect(container.querySelector('[data-slot="unread-dot"]')).toBeNull();
  });

  it("renders relative age between source_created_at and nowIso", () => {
    render(<InboxPreviewRow signal={baseSignal()} nowIso={nowIso} />);
    expect(screen.getByText("1h ago")).toBeTruthy();
  });

  it("renders the title", () => {
    render(<InboxPreviewRow signal={baseSignal()} nowIso={nowIso} />);
    expect(screen.getByText("Wire up the new pulse card")).toBeTruthy();
  });

  it("renders the unread count with aria-label when unreadDisplay='count'", () => {
    const { container } = render(
      <InboxPreviewRow
        signal={baseSignal({ unread_count: 3 })}
        nowIso={nowIso}
        unreadDisplay="count"
      />,
    );
    expect(screen.getByLabelText("3 unread")).toBeTruthy();
    expect(container.querySelector('[data-slot="unread-dot"]')).toBeNull();
  });

  it("renders chips before the title when provided", () => {
    render(
      <InboxPreviewRow
        signal={baseSignal()}
        nowIso={nowIso}
        chips={<span data-slot="chip">CI FAIL</span>}
      />,
    );
    expect(screen.getByText("CI FAIL")).toBeTruthy();
  });
});
