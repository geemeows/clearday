import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusButton } from "#/components/FocusButton";
import type { FocusStartResult } from "#/lib/focus-session";

function okResult(): FocusStartResult {
  return {
    calendar: { ok: true, eventId: "e1" },
    slack_status: { ok: true },
    slack_dnd: { ok: true },
  };
}

describe("FocusButton", () => {
  it("opens a duration prompt and starts a session with the selected preset", async () => {
    const starter = vi.fn(async () => okResult());
    render(<FocusButton starter={starter} />);

    fireEvent.click(
      screen.getByRole("button", { name: /start focus session/i }),
    );
    // Default preset is 60min
    fireEvent.click(screen.getByRole("button", { name: "25m" }));
    fireEvent.click(screen.getByRole("button", { name: /^start focus$/i }));

    await waitFor(() => expect(starter).toHaveBeenCalledTimes(1));
    expect(starter).toHaveBeenCalledWith({
      duration_minutes: 25,
      message: undefined,
    });
  });

  it("forwards a typed status message and a custom duration", async () => {
    const starter = vi.fn(async () => okResult());
    render(<FocusButton starter={starter} />);
    fireEvent.click(
      screen.getByRole("button", { name: /start focus session/i }),
    );
    fireEvent.change(screen.getByLabelText(/duration in minutes/i), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByPlaceholderText(/deep work/i), {
      target: { value: "Heads down" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^start focus$/i }));
    await waitFor(() => expect(starter).toHaveBeenCalled());
    expect(starter).toHaveBeenCalledWith({
      duration_minutes: 45,
      message: "Heads down",
    });
  });

  it("surfaces partial-success when one provider fails", async () => {
    const starter = vi.fn(
      async (): Promise<FocusStartResult> => ({
        calendar: { ok: true, eventId: "e1" },
        slack_status: { ok: false, error: "token_revoked" },
        slack_dnd: { ok: true },
      }),
    );
    render(<FocusButton starter={starter} />);
    fireEvent.click(
      screen.getByRole("button", { name: /start focus session/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^start focus$/i }));
    expect(
      await screen.findByText(/started with issues.*slack status/i),
    ).toBeTruthy();
  });

  it("surfaces a thrown error from the starter", async () => {
    const starter = vi.fn(async () => {
      throw new Error("network down");
    });
    render(<FocusButton starter={starter} />);
    fireEvent.click(
      screen.getByRole("button", { name: /start focus session/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^start focus$/i }));
    expect(await screen.findByText(/failed:.*network down/i)).toBeTruthy();
  });
});
