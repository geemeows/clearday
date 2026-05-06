import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCountdown,
  CountdownRing,
  DEFAULT_LOOKAHEAD_MS,
} from "#/features/today/CountdownRing";

describe("computeCountdown", () => {
  it("formats mm:ss with zero padding", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const target = "2026-05-04T12:01:15.000Z"; // 75s
    const { mm, ss, totalSeconds } = computeCountdown(target, now);
    expect(mm).toBe("01");
    expect(ss).toBe("15");
    expect(totalSeconds).toBe(75);
  });

  it("formats long countdowns (>10 min) without truncating mm", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const target = "2026-05-04T12:13:09.000Z"; // 13:09
    const { mm, ss } = computeCountdown(target, now);
    expect(mm).toBe("13");
    expect(ss).toBe("09");
  });

  it("ring fraction is full at the start of the lookahead window", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const target = "2026-05-04T12:15:00.000Z";
    const { fraction } = computeCountdown(target, now, DEFAULT_LOOKAHEAD_MS);
    expect(fraction).toBeCloseTo(1, 5);
  });

  it("ring fraction is half at the midpoint of the lookahead window", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const target = "2026-05-04T12:07:30.000Z";
    const { fraction } = computeCountdown(target, now, DEFAULT_LOOKAHEAD_MS);
    expect(fraction).toBeCloseTo(0.5, 5);
  });

  it("ring fraction clamps to 1 when the meeting is further than the lookahead", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const target = "2026-05-04T13:00:00.000Z"; // 60 min away, lookahead 15
    const { fraction } = computeCountdown(target, now);
    expect(fraction).toBe(1);
  });

  it("clamps to 00:00 and zero fraction past the target", () => {
    const now = new Date("2026-05-04T12:05:00.000Z");
    const target = "2026-05-04T12:00:00.000Z"; // 5 min ago
    const { mm, ss, totalSeconds, fraction } = computeCountdown(target, now);
    expect(mm).toBe("00");
    expect(ss).toBe("00");
    expect(totalSeconds).toBe(0);
    expect(fraction).toBe(0);
  });

  it("treats an unparseable target ISO as already past", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const { mm, ss, fraction } = computeCountdown("not-a-date", now);
    expect(mm).toBe("00");
    expect(ss).toBe("00");
    expect(fraction).toBe(0);
  });
});

describe("CountdownRing component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the initial mm:ss and ticks live each second", () => {
    render(<CountdownRing targetIso="2026-05-04T12:01:05.000Z" />);
    const timer = screen.getByRole("timer");
    expect(timer.textContent).toContain("01");
    expect(timer.textContent).toContain("05");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(timer.textContent).toContain("01");
    expect(timer.textContent).toContain("03");
  });

  it("reaches 00:00 when the target passes and stays there", () => {
    render(<CountdownRing targetIso="2026-05-04T12:00:02.000Z" />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("aria-label")).toBe("00:00 remaining");
  });

  it("renders the supplied label", () => {
    render(
      <CountdownRing
        targetIso="2026-05-04T12:01:00.000Z"
        label="UNTIL STANDUP"
      />,
    );
    expect(screen.getByText("UNTIL STANDUP")).toBeTruthy();
  });
});
