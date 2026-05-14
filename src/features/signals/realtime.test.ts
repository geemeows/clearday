// Tests for useSignalsLive: subscription lifecycle and invalidate-on-event.

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Use vi.hoisted() to ensure mock variables are available in hoisted vi.mock factories.
const { mockChannel, mockOn, mockSubscribe, mockRemoveChannel, mockInvalidate } =
  vi.hoisted(() => {
    const mockOn = vi.fn();
    const mockSubscribe = vi.fn();
    const mockChannel = { on: mockOn, subscribe: mockSubscribe };
    const mockRemoveChannel = vi.fn();
    const mockInvalidate = vi.fn();
    return { mockChannel, mockOn, mockSubscribe, mockRemoveChannel, mockInvalidate };
  });

vi.mock("#/lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock("#/router", () => ({
  router: {
    invalidate: mockInvalidate,
  },
}));

import { useSignalsLive } from "./realtime";
import { supabase } from "#/lib/supabase";

beforeEach(() => {
  vi.clearAllMocks();
  mockOn.mockReturnValue(mockChannel);
  mockSubscribe.mockReturnValue({ unsubscribe: vi.fn() });
  (supabase.channel as Mock).mockReturnValue(mockChannel);
});

describe("useSignalsLive", () => {
  it("subscribes to the signals table on mount", () => {
    renderHook(() => useSignalsLive());
    expect(supabase.channel).toHaveBeenCalledWith("signals-live");
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "signals" },
      expect.any(Function),
    );
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("calls router.invalidate when a signal change event fires", () => {
    renderHook(() => useSignalsLive());
    const [[, , callback]] = (mockOn as Mock).mock.calls;
    act(() => {
      callback({ eventType: "INSERT" });
    });
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it("calls router.invalidate for each event type", () => {
    renderHook(() => useSignalsLive());
    const [[, , callback]] = (mockOn as Mock).mock.calls;
    act(() => {
      callback({ eventType: "INSERT" });
      callback({ eventType: "UPDATE" });
      callback({ eventType: "DELETE" });
    });
    expect(mockInvalidate).toHaveBeenCalledTimes(3);
  });

  it("unsubscribes via removeChannel on unmount", () => {
    const { unmount } = renderHook(() => useSignalsLive());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });
});
