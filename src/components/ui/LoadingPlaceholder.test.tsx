import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingPlaceholder } from "#/components/ui/LoadingPlaceholder";

describe("LoadingPlaceholder", () => {
  it("renders default 'Loading…' copy", () => {
    render(<LoadingPlaceholder />);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("renders custom children", () => {
    render(<LoadingPlaceholder>Fetching rules…</LoadingPlaceholder>);
    expect(screen.getByText("Fetching rules…")).toBeTruthy();
  });

  it("forwards className", () => {
    const { container } = render(
      <LoadingPlaceholder className="extra-pad" />,
    );
    const el = container.querySelector(
      '[data-slot="loading-placeholder"]',
    ) as HTMLElement;
    expect(el.className).toMatch(/extra-pad/);
  });
});
