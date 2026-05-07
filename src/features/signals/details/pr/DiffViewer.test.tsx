import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrDiffViewer } from "./DiffViewer";
import type { PrFilesLoader } from "./_shared";

describe("PrDiffViewer smoke", () => {
  it("shows the loading skeleton while files are in flight", () => {
    const load: PrFilesLoader = () => new Promise(() => {});
    render(<PrDiffViewer repo="o/r" number={1} load={load} />);
    expect(screen.getByLabelText("Loading diff")).toBeTruthy();
  });
});
