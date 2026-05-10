import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CareerLevelView,
  CareerOnboardingView,
} from "#/routes/_app.career";
import type { StoredLevel } from "#/features/career/store";

function level(overrides: Partial<StoredLevel> = {}): StoredLevel {
  return {
    id: "lvl1",
    title: "L4",
    status: "active",
    header: [],
    sheet_id: null,
    last_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("CareerOnboardingView", () => {
  it("renders the level title input and create button", () => {
    render(<CareerOnboardingView onCreateLevel={vi.fn()} />);
    expect(screen.getByLabelText("Level name")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /create level/i }),
    ).toBeTruthy();
  });

  it("calls onCreateLevel with the trimmed title on submit", async () => {
    const onCreateLevel = vi.fn();
    render(<CareerOnboardingView onCreateLevel={onCreateLevel} />);
    const input = screen.getByLabelText("Level name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  L5  " } });
    fireEvent.click(
      screen.getByRole("button", { name: /create level/i }),
    );
    await waitFor(() =>
      expect(onCreateLevel).toHaveBeenCalledWith("L5"),
    );
  });

  it("disables the create button when title is empty", () => {
    render(<CareerOnboardingView onCreateLevel={vi.fn()} />);
    const input = screen.getByLabelText("Level name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    const button = screen.getByRole("button", {
      name: /create level/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe("CareerLevelView", () => {
  it("renders the level title", () => {
    render(<CareerLevelView level={level({ title: "Staff Engineer" })} />);
    expect(screen.getByText("Staff Engineer")).toBeTruthy();
  });

  it("shows an empty competency tree placeholder", () => {
    render(<CareerLevelView level={level()} />);
    const region = screen.getByRole("region", { name: /competency tree/i });
    expect(region.textContent).toContain("No competencies yet");
  });
});
