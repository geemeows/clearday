import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDismissedAlerts } from "#/hooks/useDismissedAlerts";

describe("useDismissedAlerts", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts with no fired alerts", () => {
    const { result } = renderHook(() => useDismissedAlerts());
    expect(result.current.alertAlreadyFired("sig-1")).toBe(false);
  });

  it("markAlertFired persists across re-reads", () => {
    const { result } = renderHook(() => useDismissedAlerts());
    result.current.markAlertFired("sig-1");
    expect(result.current.alertAlreadyFired("sig-1")).toBe(true);
    expect(result.current.alertAlreadyFired("sig-2")).toBe(false);
  });

  it("namespaces keys under clearday:meeting-alert:", () => {
    const { result } = renderHook(() => useDismissedAlerts());
    result.current.markAlertFired("sig-x");
    expect(localStorage.getItem("clearday:meeting-alert:sig-x")).not.toBeNull();
  });

  it("alertAlreadyFired returns false when localStorage.getItem throws", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const { result } = renderHook(() => useDismissedAlerts());
    expect(result.current.alertAlreadyFired("sig-1")).toBe(false);
    spy.mockRestore();
  });

  it("markAlertFired swallows errors when localStorage.setItem throws", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    const { result } = renderHook(() => useDismissedAlerts());
    expect(() => result.current.markAlertFired("sig-1")).not.toThrow();
    spy.mockRestore();
  });
});
