import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_UPDATED_EVENT,
  type ThemeView,
} from "#/features/settings/theme/api";
import { ThemeToggle } from "#/features/settings/theme/components/ThemeToggle";

vi.mock("#/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "#/lib/api-client";

const mockApi = vi.mocked(apiFetch);

function setPrefersDark(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockApi.mockReset();
    setPrefersDark(false);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders Switch to dark mode when effective theme is light", async () => {
    mockApi.mockResolvedValueOnce({
      theme: "light",
      density: "comfortable",
    } satisfies ThemeView);
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /switch to dark mode/i }),
      ).toBeTruthy();
    });
    const btn = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(btn.getAttribute("data-effective-theme")).toBe("light");
  });

  it("renders Switch to light mode when effective theme is dark", async () => {
    mockApi.mockResolvedValueOnce({
      theme: "dark",
      density: "comfortable",
    } satisfies ThemeView);
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /switch to light mode/i }),
      ).toBeTruthy();
    });
  });

  it("PUTs the opposite theme on click and dispatches THEME_UPDATED_EVENT", async () => {
    mockApi.mockResolvedValueOnce({
      theme: "light",
      density: "comfortable",
    } satisfies ThemeView);
    const saved: ThemeView = {
      theme: "dark",
      density: "comfortable",
    };
    mockApi.mockResolvedValueOnce({ ok: true, theme: saved });

    render(<ThemeToggle />);
    const btn = await screen.findByRole("button", {
      name: /switch to dark mode/i,
    });

    const onUpdate = vi.fn();
    window.addEventListener(THEME_UPDATED_EVENT, onUpdate);
    try {
      fireEvent.click(btn);
      await waitFor(() => {
        expect(mockApi).toHaveBeenCalledTimes(2);
      });
      expect(mockApi).toHaveBeenLastCalledWith("/api/theme", {
        method: "PUT",
        body: { theme: "dark" },
      });
      // Optimistic dispatch on click + confirmation dispatch after PUT resolves.
      expect(onUpdate).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(THEME_UPDATED_EVENT, onUpdate);
    }
  });

  it("resolves system theme via prefers-color-scheme", async () => {
    setPrefersDark(true);
    mockApi.mockResolvedValueOnce({
      theme: "system",
      density: "comfortable",
    } satisfies ThemeView);
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /switch to light mode/i }),
      ).toBeTruthy();
    });
  });
});
