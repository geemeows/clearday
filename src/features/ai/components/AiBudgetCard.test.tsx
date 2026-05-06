import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiBudgetCard } from "#/features/ai/components/AiBudgetCard";

describe("AiBudgetCard", () => {
  it("renders used / cap and the correct rounded percentage", () => {
    render(
      <AiBudgetCard used={6} cap={20} fallbackPct={80} hardStopPct={100} />,
    );
    expect(screen.getByText("$6.00")).toBeTruthy();
    expect(screen.getByText("/ $20.00")).toBeTruthy();
    expect(screen.getByText("30% used")).toBeTruthy();
  });

  it("renders fallback and hard-stop thresholds at the given values", () => {
    render(
      <AiBudgetCard
        used={0}
        cap={50}
        fallbackPct={75}
        hardStopPct={95}
        fallbackModel="claude-haiku-4-5"
      />,
    );
    expect(screen.getByText("Fallback at 75%")).toBeTruthy();
    expect(screen.getByText("Hard stop at 95%")).toBeTruthy();
    expect(screen.getByText("claude-haiku-4-5")).toBeTruthy();
  });

  it("clamps the percentage at 100 when over cap", () => {
    render(
      <AiBudgetCard used={30} cap={20} fallbackPct={80} hardStopPct={100} />,
    );
    expect(screen.getByText("100% used")).toBeTruthy();
  });

  it("renders 0% when cap is zero", () => {
    render(
      <AiBudgetCard used={5} cap={0} fallbackPct={80} hardStopPct={100} />,
    );
    expect(screen.getByText("0% used")).toBeTruthy();
  });
});
