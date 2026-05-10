import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PrOverviewLoader } from "./_shared";
import { PrDescription } from "./Description";

describe("PrDescription smoke", () => {
  it("shows the loading skeleton while the loader is in flight", () => {
    const load: PrOverviewLoader = () => new Promise(() => {});
    render(<PrDescription repo="o/r" number={1} load={load} />);
    expect(screen.getByLabelText("Loading description")).toBeTruthy();
  });
});
