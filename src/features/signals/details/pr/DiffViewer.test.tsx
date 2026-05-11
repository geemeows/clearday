import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PrFilesLoader } from "./_shared";
import { PrDiffViewer } from "./DiffViewer";

describe("PrDiffViewer smoke", () => {
  it("shows the loading skeleton while files are in flight", () => {
    const load: PrFilesLoader = () => new Promise(() => {});
    render(<PrDiffViewer repo="o/r" number={1} load={load} />);
    expect(screen.getByLabelText("Loading diff")).toBeTruthy();
  });
});
