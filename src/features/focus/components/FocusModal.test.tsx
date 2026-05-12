import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusModal } from "#/features/focus/components/FocusModal";

function renderOpen(
  overrides: Partial<React.ComponentProps<typeof FocusModal>> = {},
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onStart: vi.fn(),
    ...overrides,
  };
  render(<FocusModal {...props} />);
  return props;
}

describe("FocusModal", () => {
  it("renders all duration chips, the status input, and the will-do preview", () => {
    renderOpen();

    const group = screen.getByRole("group", { name: /duration/i });
    for (const d of [25, 45, 60, 90, 120]) {
      expect(
        within(group).getByRole("button", { name: `${d} min` }),
      ).toBeTruthy();
    }
    expect(screen.getByLabelText(/slack status/i)).toBeTruthy();

    const willDo = screen.getByRole("region", { name: /will do/i });
    expect(within(willDo).getByText(/calendar busy event/i)).toBeTruthy();
    expect(within(willDo).getByText(/slack status with a/i)).toBeTruthy();
    expect(within(willDo).getByText(/dnd\.setSnooze/i)).toBeTruthy();
  });

  it("defaults to 45 min and selecting a duration chip flips aria-pressed", () => {
    renderOpen();
    const fortyFive = screen.getByRole("button", { name: "45 min" });
    const ninety = screen.getByRole("button", { name: "90 min" });

    expect(fortyFive.getAttribute("aria-pressed")).toBe("true");
    expect(ninety.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(ninety);
    expect(ninety.getAttribute("aria-pressed")).toBe("true");
    expect(fortyFive.getAttribute("aria-pressed")).toBe("false");
  });

  it("editing the status input updates the input value", () => {
    renderOpen();
    const input = screen.getByLabelText(/slack status/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Pairing on auth" } });
    expect(input.value).toBe("Pairing on auth");
  });

  it("the will-do preview reflects the selected duration", () => {
    renderOpen();
    fireEvent.click(screen.getByRole("button", { name: "60 min" }));

    const willDo = screen.getByRole("region", { name: /will do/i });
    expect(within(willDo).getByText(/10:00 → 11:00/)).toBeTruthy();
    expect(within(willDo).getByText(/60-min auto-expiry/i)).toBeTruthy();
    expect(within(willDo).getByText(/for 60 min/i)).toBeTruthy();
  });

  it("Start fires onStart with the selected minutes + message and closes", () => {
    const props = renderOpen();
    fireEvent.click(screen.getByRole("button", { name: "25 min" }));
    fireEvent.change(screen.getByLabelText(/slack status/i), {
      target: { value: "Deep work" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start 25-min focus/i }));

    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(props.onStart).toHaveBeenCalledWith({
      minutes: 25,
      message: "Deep work",
    });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Cancel closes the modal without firing onStart", () => {
    const props = renderOpen();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(props.onStart).not.toHaveBeenCalled();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
