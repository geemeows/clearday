import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type MatrixChannel,
  type MatrixKind,
  type MatrixValue,
  NotificationMatrix,
} from "#/features/alerts/components/NotificationMatrix";

const KINDS: MatrixKind[] = [
  { id: "pr_review", label: "PR review" },
  { id: "mention", label: "@mention" },
];

const CHANNELS: MatrixChannel[] = [
  { id: "push", label: "Push" },
  { id: "slack", label: "Slack" },
];

describe("NotificationMatrix", () => {
  it("clicking a cell fires onToggle once with (kind, channel)", () => {
    const onToggle = vi.fn();
    const value: MatrixValue = {
      pr_review: { push: true, slack: false },
      mention: { push: false, slack: true },
    };
    render(
      <NotificationMatrix
        kinds={KINDS}
        channels={CHANNELS}
        value={value}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByLabelText("@mention via Push"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("mention", "push");
  });

  it("does not mutate the value prop", () => {
    const onToggle = vi.fn();
    const value: MatrixValue = {
      pr_review: { push: true, slack: false },
      mention: { push: false, slack: true },
    };
    const snapshot = JSON.stringify(value);
    render(
      <NotificationMatrix
        kinds={KINDS}
        channels={CHANNELS}
        value={value}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByLabelText("PR review via Slack"));
    expect(JSON.stringify(value)).toBe(snapshot);
  });

  it("reflects the value prop in the rendered checkboxes", () => {
    const value: MatrixValue = {
      pr_review: { push: true, slack: false },
      mention: { push: false, slack: true },
    };
    render(
      <NotificationMatrix
        kinds={KINDS}
        channels={CHANNELS}
        value={value}
        onToggle={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText("PR review via Push").getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByLabelText("PR review via Slack").getAttribute("aria-checked"),
    ).toBe("false");
  });
});
