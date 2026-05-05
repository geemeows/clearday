import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusButton } from "#/components/FocusButton";
import type { FocusStartResult } from "#/lib/focus-session";
import type { StoredSignal } from "#/lib/next-up";

const noMeetings = async (): Promise<StoredSignal[]> => [];

function focusMeeting(
  startsAt: string,
  endsAt: string,
  overrides: Partial<StoredSignal> = {},
): StoredSignal {
  return {
    id: overrides.id ?? "m1",
    provider: "google",
    kind: "meeting",
    source_id: overrides.source_id ?? "src",
    title: "Focus block",
    url: null,
    source_created_at: startsAt,
    requires_action: false,
    dismissed_at: null,
    payload: { starts_at: startsAt, ends_at: endsAt, is_focus: true },
    ...overrides,
  };
}

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
    render(<FocusButton starter={starter} meetingsLoader={noMeetings} />);

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
    render(<FocusButton starter={starter} meetingsLoader={noMeetings} />);
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
    render(<FocusButton starter={starter} meetingsLoader={noMeetings} />);
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
    render(<FocusButton starter={starter} meetingsLoader={noMeetings} />);
    fireEvent.click(
      screen.getByRole("button", { name: /start focus session/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^start focus$/i }));
    expect(await screen.findByText(/failed:.*network down/i)).toBeTruthy();
  });

  it("renders an active state while a focus block is in progress", async () => {
    const now = new Date("2026-05-05T10:00:00Z");
    const meeting = focusMeeting(
      "2026-05-05T09:30:00Z",
      "2026-05-05T11:00:00Z",
    );
    const meetingsLoader = vi.fn(async () => [meeting]);
    const starter = vi.fn(async () => okResult());
    render(
      <FocusButton
        starter={starter}
        meetingsLoader={meetingsLoader}
        now={now}
      />,
    );
    const button = await screen.findByRole("button", {
      name: /start focus session/i,
    });
    await waitFor(() =>
      expect(button.getAttribute("data-focus-active")).toBe("true"),
    );
    expect(button.textContent ?? "").toMatch(/Focusing until/i);
  });

  it("stays inactive when no focus block is currently in progress", async () => {
    const now = new Date("2026-05-05T10:00:00Z");
    const meeting = focusMeeting(
      "2026-05-05T12:00:00Z",
      "2026-05-05T13:00:00Z",
    );
    const meetingsLoader = vi.fn(async () => [meeting]);
    render(
      <FocusButton
        starter={vi.fn(async () => okResult())}
        meetingsLoader={meetingsLoader}
        now={now}
      />,
    );
    const button = await screen.findByRole("button", {
      name: /start focus session/i,
    });
    await waitFor(() => expect(meetingsLoader).toHaveBeenCalled());
    expect(button.getAttribute("data-focus-active")).toBeNull();
    expect(button.textContent ?? "").not.toMatch(/Focusing until/i);
  });

  it("ignores meetings without is_focus", async () => {
    const now = new Date("2026-05-05T10:00:00Z");
    const meeting = focusMeeting(
      "2026-05-05T09:30:00Z",
      "2026-05-05T11:00:00Z",
      {
        title: "Standup",
        payload: {
          starts_at: "2026-05-05T09:30:00Z",
          ends_at: "2026-05-05T11:00:00Z",
        },
      },
    );
    const meetingsLoader = vi.fn(async () => [meeting]);
    render(
      <FocusButton
        starter={vi.fn(async () => okResult())}
        meetingsLoader={meetingsLoader}
        now={now}
      />,
    );
    const button = await screen.findByRole("button", {
      name: /start focus session/i,
    });
    await waitFor(() => expect(meetingsLoader).toHaveBeenCalled());
    expect(button.getAttribute("data-focus-active")).toBeNull();
  });
});
