import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "#/components/ui/StatusBadge";

describe("StatusBadge", () => {
  it("renders children", () => {
    render(<StatusBadge tone="success">OK</StatusBadge>);
    expect(screen.getByText("OK")).toBeTruthy();
  });

  it.each([
    ["success", "var(--good-soft)", "var(--good)"],
    ["warning", "var(--warn-soft)", "var(--warn)"],
    ["danger", "var(--danger-soft)", "var(--destructive)"],
    ["muted", "var(--surface-strong)", "var(--muted-foreground)"],
    ["info", "var(--src-ai-bg)", "var(--src-ai)"],
  ] as const)("maps tone %s to design tokens", (tone, bg, fg) => {
    const { container } = render(<StatusBadge tone={tone}>x</StatusBadge>);
    const el = container.querySelector(
      '[data-slot="status-badge"]',
    ) as HTMLElement;
    expect(el.dataset.tone).toBe(tone);
    expect(el.style.background).toBe(bg);
    expect(el.style.color).toBe(fg);
  });

  it("forwards className", () => {
    const { container } = render(
      <StatusBadge tone="muted" className="custom-x">
        x
      </StatusBadge>,
    );
    const el = container.querySelector(
      '[data-slot="status-badge"]',
    ) as HTMLElement;
    expect(el.className).toMatch(/custom-x/);
  });
});
