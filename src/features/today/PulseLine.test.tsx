import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PulseLine } from "#/features/today/PulseLine";

describe("PulseLine", () => {
  it("renders one point per value and a labelled last value", () => {
    const { container } = render(
      <PulseLine values={[9, 11, 7, 6, 8, 5, 4]} />,
    );
    const points = container.querySelectorAll("[data-pulse-point]");
    expect(points).toHaveLength(7);
    const text = container.querySelector("text");
    expect(text?.textContent).toBe("4h");
  });

  it("includes a single path element across all points", () => {
    const { container } = render(
      <PulseLine values={[1, 2, 3]} />,
    );
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(1);
  });

  it("renders nothing when given an empty series", () => {
    const { container } = render(<PulseLine values={[]} />);
    expect(container.querySelectorAll("[data-pulse-point]")).toHaveLength(0);
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });
});
