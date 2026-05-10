import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CareerWheelChart } from "#/features/career/components/CareerWheel";

describe("CareerWheelChart", () => {
  it("shows an empty-state hint when there are no competencies", () => {
    render(<CareerWheelChart points={[]} />);
    expect(screen.getByText(/no competencies yet/i)).toBeTruthy();
  });

  it("renders both polygons when given points", () => {
    const { container } = render(
      <CareerWheelChart
        points={[
          { competencyId: "c1", name: "Craft", current: 2, target: 3 },
          { competencyId: "c2", name: "Collab", current: 3, target: 4 },
          { competencyId: "c3", name: "Impact", current: 1, target: 4 },
        ]}
      />,
    );
    const polys = container.querySelectorAll("polygon");
    expect(polys.length).toBe(2);
    expect(screen.getByText("Craft")).toBeTruthy();
    expect(screen.getByText("Collab")).toBeTruthy();
    expect(screen.getByText("Impact")).toBeTruthy();
  });
});
