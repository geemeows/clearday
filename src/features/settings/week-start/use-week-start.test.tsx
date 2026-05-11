import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEEK_START_STORAGE_KEY,
  WEEK_START_UPDATED_EVENT,
} from "#/features/settings/week-start/api";
import { useWeekStart } from "#/features/settings/week-start/use-week-start";

vi.mock("#/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "#/lib/api-client";

const mockApi = vi.mocked(apiFetch);

describe("useWeekStart", () => {
  beforeEach(() => {
    mockApi.mockReset();
    window.localStorage.removeItem(WEEK_START_STORAGE_KEY);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts at the cached/default value before /api/week-start resolves", () => {
    mockApi.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useWeekStart());
    expect(result.current.weekStart).toBe("mon");
  });

  it("reads the cached value from localStorage on mount", () => {
    window.localStorage.setItem(WEEK_START_STORAGE_KEY, "sun");
    mockApi.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useWeekStart());
    expect(result.current.weekStart).toBe("sun");
  });

  it("hydrates from /api/week-start after mount", async () => {
    mockApi.mockResolvedValueOnce({ weekStart: "sat" });
    const { result } = renderHook(() => useWeekStart());
    await waitFor(() => {
      expect(result.current.weekStart).toBe("sat");
    });
    expect(window.localStorage.getItem(WEEK_START_STORAGE_KEY)).toBe("sat");
  });

  it("setWeekStart mirrors to localStorage, dispatches the event, and PUTs the API", async () => {
    mockApi.mockResolvedValueOnce({ weekStart: "mon" });
    mockApi.mockResolvedValueOnce({ ok: true, weekStart: { weekStart: "sun" } });

    const { result } = renderHook(() => useWeekStart());
    await waitFor(() => {
      expect(result.current.weekStart).toBe("mon");
    });

    const onChanged = vi.fn();
    window.addEventListener(WEEK_START_UPDATED_EVENT, onChanged);
    try {
      await act(async () => {
        result.current.setWeekStart("sun");
      });
      await waitFor(() => {
        expect(mockApi).toHaveBeenCalledTimes(2);
      });
      expect(mockApi).toHaveBeenLastCalledWith("/api/week-start", {
        method: "PUT",
        body: { weekStart: "sun" },
      });
      expect(result.current.weekStart).toBe("sun");
      expect(window.localStorage.getItem(WEEK_START_STORAGE_KEY)).toBe("sun");
      const evt = onChanged.mock.calls[0]?.[0] as CustomEvent<{
        weekStart: string;
      }>;
      expect(evt.detail.weekStart).toBe("sun");
    } finally {
      window.removeEventListener(WEEK_START_UPDATED_EVENT, onChanged);
    }
  });

  it("picks up devy:weekStartChanged from elsewhere in the app", async () => {
    mockApi.mockResolvedValueOnce({ weekStart: "mon" });
    const { result } = renderHook(() => useWeekStart());
    await waitFor(() => {
      expect(result.current.weekStart).toBe("mon");
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent(WEEK_START_UPDATED_EVENT, {
          detail: { weekStart: "sat" },
        }),
      );
    });
    expect(result.current.weekStart).toBe("sat");
  });
});
