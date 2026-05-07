import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "#/components/ui/UserAvatar";

describe("UserAvatar", () => {
  it("renders initials from a single-word name", () => {
    render(<UserAvatar name="alice" />);
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("renders two-letter initials from a multi-word name", () => {
    render(<UserAvatar name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("splits on @ . _ - separators", () => {
    render(<UserAvatar name="ada.lovelace@example.com" />);
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("falls back to ? for empty/whitespace name", () => {
    render(<UserAvatar name="   " />);
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("derives a deterministic tint from the name when none provided", () => {
    const { container, rerender } = render(<UserAvatar name="alice" />);
    const first = container.querySelector(
      '[data-slot="user-avatar"]',
    ) as HTMLElement;
    const tintA = first.style.background;
    rerender(<UserAvatar name="alice" />);
    const second = container.querySelector(
      '[data-slot="user-avatar"]',
    ) as HTMLElement;
    expect(second.style.background).toBe(tintA);
  });

  it("uses the provided tint when given", () => {
    const { container } = render(
      <UserAvatar name="alice" tint="rgb(1, 2, 3)" />,
    );
    const el = container.querySelector(
      '[data-slot="user-avatar"]',
    ) as HTMLElement;
    expect(el.style.background).toBe("rgb(1, 2, 3)");
  });

  it("respects size", () => {
    const { container } = render(<UserAvatar name="x" size="lg" />);
    const el = container.querySelector(
      '[data-slot="user-avatar"]',
    ) as HTMLElement;
    expect(el.dataset.size).toBe("lg");
    expect(el.style.width).toBe("32px");
    expect(el.style.height).toBe("32px");
  });
});
