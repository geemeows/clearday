import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_UPDATED_EVENT,
  type ThemeView,
} from "#/features/settings/theme/api";
import { useTheme } from "#/features/settings/theme/use-theme";

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

function viewOf(theme: ThemeView["theme"]): ThemeView {
  return { theme, density: "comfortable" };
}

describe("useTheme", () => {
  beforeEach(() => {
    mockApi.mockReset();
    setPrefersDark(false);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts on the default light theme before /api/theme resolves", () => {
    mockApi.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("reflects the stored theme once /api/theme resolves", async () => {
    mockApi.mockResolvedValueOnce(viewOf("dark"));
    const { result } = renderHook(() => useTheme());
    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
    });
  });

  it("resolves system theme via prefers-color-scheme", async () => {
    setPrefersDark(true);
    mockApi.mockResolvedValueOnce(viewOf("system"));
    const { result } = renderHook(() => useTheme());
    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
    });
  });

  it("setTheme PUTs /api/theme and dispatches THEME_UPDATED_EVENT", async () => {
    mockApi.mockResolvedValueOnce(viewOf("light"));
    mockApi.mockResolvedValueOnce({ ok: true, theme: viewOf("dark") });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => {
      expect(result.current.theme).toBe("light");
    });

    const onUpdate = vi.fn();
    window.addEventListener(THEME_UPDATED_EVENT, onUpdate);
    try {
      await act(async () => {
        result.current.setTheme("dark");
      });
      await waitFor(() => {
        expect(mockApi).toHaveBeenCalledTimes(2);
      });
      expect(mockApi).toHaveBeenLastCalledWith("/api/theme", {
        method: "PUT",
        body: { theme: "dark" },
      });
      // Optimistic dispatch + confirmation dispatch.
      expect(onUpdate).toHaveBeenCalledTimes(2);
      expect(result.current.theme).toBe("dark");
    } finally {
      window.removeEventListener(THEME_UPDATED_EVENT, onUpdate);
    }
  });

  it("toggle flips the effective theme", async () => {
    mockApi.mockResolvedValueOnce(viewOf("light"));
    mockApi.mockResolvedValueOnce({ ok: true, theme: viewOf("dark") });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => {
      expect(result.current.theme).toBe("light");
    });

    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
    });
    expect(mockApi).toHaveBeenLastCalledWith("/api/theme", {
      method: "PUT",
      body: { theme: "dark" },
    });
  });

  it("picks up THEME_UPDATED_EVENT from elsewhere in the app", async () => {
    mockApi.mockResolvedValueOnce(viewOf("light"));
    const { result } = renderHook(() => useTheme());
    await waitFor(() => {
      expect(result.current.theme).toBe("light");
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(THEME_UPDATED_EVENT, { detail: viewOf("dark") }),
      );
    });
    expect(result.current.theme).toBe("dark");
  });
});
