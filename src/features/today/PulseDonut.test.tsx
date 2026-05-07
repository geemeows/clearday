import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PulseDonut } from "#/features/today/PulseDonut";

describe("PulseDonut", () => {
  it("renders one slice per non-zero source and the total in the center", () => {
    const { container } = render(
      <PulseDonut
        data={[
          { source: "github", count: 38, color: "#1" },
          { source: "slack", count: 27, color: "#2" },
          { source: "calendar", count: 18, color: "#3" },
          { source: "linear", count: 12, color: "#4" },
          { source: "ai", count: 5, color: "#5" },
        ]}
      />,
    );
    const slices = container.querySelectorAll("circle[data-source]");
    expect(slices).toHaveLength(5);
    const total = container.querySelector("text");
    expect(total?.textContent).toBe("100");
  });

  it("skips zero-count entries", () => {
    const { container } = render(
      <PulseDonut
        data={[
          { source: "github", count: 4, color: "#1" },
          { source: "slack", count: 0, color: "#2" },
          { source: "calendar", count: 6, color: "#3" },
          { source: "linear", count: 0, color: "#4" },
          { source: "ai", count: 0, color: "#5" },
        ]}
      />,
    );
    const slices = container.querySelectorAll("circle[data-source]");
    expect(slices).toHaveLength(2);
    expect(slices[0].getAttribute("data-source")).toBe("github");
    expect(slices[1].getAttribute("data-source")).toBe("calendar");
  });

  it("renders an empty track and zero total when all counts are 0", () => {
    const { container } = render(
      <PulseDonut
        data={[
          { source: "github", count: 0, color: "#1" },
          { source: "slack", count: 0, color: "#2" },
        ]}
      />,
    );
    expect(container.querySelectorAll("circle[data-source]")).toHaveLength(0);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelector("text")?.textContent).toBe("0");
  });
});
