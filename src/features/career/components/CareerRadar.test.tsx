import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CareerRadarChart } from "#/features/career/components/CareerRadar";

describe("CareerRadarChart", () => {
  it("shows an empty-state hint when there are no criteria", () => {
    render(<CareerRadarChart points={[]} />);
    expect(screen.getByText(/no criteria yet/i)).toBeTruthy();
  });

  it("renders target + current polygons and a label per criterion", () => {
    const { container } = render(
      <CareerRadarChart
        points={[
          { criterionId: "cr1", name: "Ships projects", current: 2, target: 3 },
          { criterionId: "cr2", name: "Mentors juniors", current: 3, target: 4 },
          { criterionId: "cr3", name: "System design", current: 1, target: 4 },
        ]}
      />,
    );
    const polys = container.querySelectorAll("polygon");
    expect(polys.length).toBe(2);
    expect(screen.getByText("Ships projects")).toBeTruthy();
    expect(screen.getByText("Mentors juniors")).toBeTruthy();
    expect(screen.getByText("System design")).toBeTruthy();
  });
});
