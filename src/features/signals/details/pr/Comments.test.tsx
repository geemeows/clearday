import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrComments } from "./Comments";

describe("PrComments smoke", () => {
  it("shows the loading skeleton while loading", () => {
    render(
      <PrComments loading={true} reviewComments={[]} issueComments={[]} />,
    );
    expect(screen.getByLabelText("Loading comments")).toBeTruthy();
  });

  it("shows the empty state when there are no comments", () => {
    render(
      <PrComments loading={false} reviewComments={[]} issueComments={[]} />,
    );
    expect(screen.getByText("No comments yet.")).toBeTruthy();
  });
});
