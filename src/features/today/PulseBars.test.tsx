import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PulseBars } from "#/features/today/PulseBars";

describe("PulseBars", () => {
  it("renders one group per weekday with two bars (PRs + tickets)", () => {
    const { container } = render(
      <PulseBars
        data={[
          { day: "Mon", prs: 2, tickets: 1 },
          { day: "Tue", prs: 3, tickets: 1 },
          { day: "Wed", prs: 1, tickets: 0 },
          { day: "Thu", prs: 4, tickets: 2 },
          { day: "Fri", prs: 2, tickets: 0 },
        ]}
      />,
    );
    const groups = container.querySelectorAll("[data-pulse-bar-group]");
    expect(groups).toHaveLength(5);
    const prBars = container.querySelectorAll('[data-pulse-bar="prs"]');
    const ticketBars = container.querySelectorAll('[data-pulse-bar="tickets"]');
    expect(prBars).toHaveLength(5);
    expect(ticketBars).toHaveLength(5);
    const labels = Array.from(container.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    expect(labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("sizes bars proportionally to the data max", () => {
    const { container } = render(
      <PulseBars
        data={[
          { day: "Mon", prs: 0, tickets: 0 },
          { day: "Tue", prs: 4, tickets: 2 },
        ]}
      />,
    );
    const prBars = container.querySelectorAll('[data-pulse-bar="prs"]');
    expect(prBars[0].getAttribute("height")).toBe("0");
    expect(prBars[1].getAttribute("height")).toBe("90");
    const ticketBars = container.querySelectorAll('[data-pulse-bar="tickets"]');
    expect(ticketBars[1].getAttribute("height")).toBe("45");
  });

  it("renders a ChartEmpty placeholder for an all-zero dataset", () => {
    const { container, getByText } = render(
      <PulseBars
        data={[
          { day: "Mon", prs: 0, tickets: 0 },
          { day: "Tue", prs: 0, tickets: 0 },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-pulse-bar="prs"]')).toHaveLength(
      0,
    );
    expect(getByText("Nothing shipped yet this week")).toBeTruthy();
    expect(
      getByText("Bars will appear once a PR merges or a ticket closes"),
    ).toBeTruthy();
  });
});
