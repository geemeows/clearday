import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrReviewSubmitPanel } from "./ReviewComposer";

describe("PrReviewSubmitPanel smoke", () => {
  it("renders nothing when there are no drafts", () => {
    const { container } = render(
      <PrReviewSubmitPanel
        repo="o/r"
        number={1}
        drafts={{}}
        onCleared={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
