import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrReviewActions } from "./ReviewActions";

describe("PrReviewActions smoke", () => {
  it("renders the three review action buttons", () => {
    render(<PrReviewActions repo="o/r" number={1} submit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Request changes" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Comment" })).toBeTruthy();
  });
});
