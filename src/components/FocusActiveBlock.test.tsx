import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusActiveBlock } from "#/components/FocusActiveBlock";

describe("FocusActiveBlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders mm:ss for the initial remaining seconds and the DND caption", () => {
    render(<FocusActiveBlock remainingSeconds={1500} totalSeconds={1500} />);
    expect(screen.getByLabelText(/time remaining/i).textContent).toBe("25:00");
    expect(screen.getByText(/slack dnd on · calendar busy/i)).toBeTruthy();
  });

  it("decrements the countdown every second", () => {
    render(<FocusActiveBlock remainingSeconds={65} totalSeconds={1500} />);
    expect(screen.getByLabelText(/time remaining/i).textContent).toBe("01:05");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText(/time remaining/i).textContent).toBe("01:04");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByLabelText(/time remaining/i).textContent).toBe("01:02");
  });

  it("progress bar fills proportionally to elapsed time", () => {
    render(<FocusActiveBlock remainingSeconds={100} totalSeconds={200} />);
    const fill = screen.getByTestId("focus-progress-fill") as HTMLDivElement;
    // Half remaining → 50% fill.
    expect(fill.style.width).toBe("50%");

    act(() => {
      vi.advanceTimersByTime(50_000);
    });
    // 50s elapsed → 50/200 + initial 100 elapsed = 150/200 = 75%.
    expect(fill.style.width).toBe("75%");
  });

  it("clamps the countdown at zero and stops decrementing", () => {
    render(<FocusActiveBlock remainingSeconds={2} totalSeconds={60} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByLabelText(/time remaining/i).textContent).toBe("00:00");
  });
});
