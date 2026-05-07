import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoredSignal } from "#/features/signals/components/InboxView";
import { PRDetail } from "./index";

const baseSignal: StoredSignal = {
  id: "p",
  provider: "github",
  kind: "pr_review_requested",
  source_id: "owner/repo#1",
  title: "Add cron",
  url: null,
  payload: {},
  requires_action: true,
  source_created_at: "2026-05-01T10:00:00Z",
  dismissed_at: null,
};

describe("PRDetail smoke", () => {
  it("renders the AI summary section when present", () => {
    const signal: StoredSignal = {
      ...baseSignal,
      payload: { ai_summary: "Looks good." },
    };
    render(<PRDetail signal={signal} />);
    expect(screen.getByLabelText("AI summary")).toBeTruthy();
    expect(screen.getByText("Looks good.")).toBeTruthy();
  });

  it("renders the files-changed list when payload includes files", () => {
    const signal: StoredSignal = {
      ...baseSignal,
      payload: {
        files_changed: [{ path: "src/x.ts", additions: 3, deletions: 1 }],
      },
    };
    render(<PRDetail signal={signal} />);
    expect(screen.getByLabelText("Files changed")).toBeTruthy();
    expect(screen.getByText("src/x.ts")).toBeTruthy();
  });

  it("renders without crashing for a sparse payload", () => {
    const { container } = render(<PRDetail signal={baseSignal} />);
    expect(container.querySelector('[data-slot="pr-detail"]')).toBeTruthy();
  });
});
