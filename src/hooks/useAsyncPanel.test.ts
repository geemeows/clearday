import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAsyncPanel } from "#/hooks/useAsyncPanel";

type Settings = { a: number; b: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useAsyncPanel", () => {
  it("loads on mount and exposes data", async () => {
    const load = vi.fn(async () => ({ a: 1, b: "x" }) as Settings);
    const save = vi.fn(async () => {});

    const { result } = renderHook(() => useAsyncPanel({ load, save }));

    expect(result.current.busy).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data).toEqual({ a: 1, b: "x" }));
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("captures load failure on error and keeps data null", async () => {
    const load = vi.fn(async () => {
      throw new Error("nope");
    });
    const save = vi.fn(async () => {});

    const { result } = renderHook(() => useAsyncPanel({ load, save }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("nope");
    expect(result.current.data).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("persist updates data only after save resolves (pessimistic)", async () => {
    const load = vi.fn(async () => ({ a: 1, b: "x" }) as Settings);
    const saveCtl = deferred<void>();
    const save = vi.fn(() => saveCtl.promise);

    const { result } = renderHook(() => useAsyncPanel({ load, save }));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      result.current.persist({ a: 2 });
    });

    expect(result.current.busy).toBe(true);
    expect(result.current.data).toEqual({ a: 1, b: "x" });
    expect(save).toHaveBeenCalledWith({ a: 2, b: "x" });

    await act(async () => {
      saveCtl.resolve();
    });

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.data).toEqual({ a: 2, b: "x" });
  });

  it("save failure sets error and leaves data untouched", async () => {
    const load = vi.fn(async () => ({ a: 1, b: "x" }) as Settings);
    const save = vi.fn(async () => {
      throw new Error("save-fail");
    });

    const { result } = renderHook(() => useAsyncPanel({ load, save }));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      result.current.persist({ a: 5 });
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("save-fail");
    expect(result.current.data).toEqual({ a: 1, b: "x" });
    expect(result.current.busy).toBe(false);
  });

  it("clears error on a subsequent successful save", async () => {
    const load = vi.fn(async () => ({ a: 1, b: "x" }) as Settings);
    let attempt = 0;
    const save = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error("first-fail");
    });

    const { result } = renderHook(() => useAsyncPanel({ load, save }));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      result.current.persist({ a: 2 });
    });
    await waitFor(() =>
      expect(result.current.error?.message).toBe("first-fail"),
    );

    await act(async () => {
      result.current.persist({ a: 3 });
    });
    await waitFor(() => expect(result.current.data).toEqual({ a: 3, b: "x" }));
    expect(result.current.error).toBeNull();
  });

  it("coalesces persist calls under debounceMs into a single save", async () => {
    const load = vi.fn(async () => ({ a: 0, b: "x" }) as Settings);
    const save = vi.fn(async () => {});

    const { result } = renderHook(() =>
      useAsyncPanel({ load, save, debounceMs: 50 }),
    );

    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      result.current.persist({ a: 1 });
      result.current.persist({ a: 2 });
      result.current.persist({ b: "y" });
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(true);

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ a: 2, b: "y" });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.data).toEqual({ a: 2, b: "y" });
  });

  it("queues patches arriving during an in-flight save and sends one fresh save", async () => {
    const load = vi.fn(async () => ({ a: 0, b: "x" }) as Settings);
    const ctl1 = deferred<void>();
    const ctl2 = deferred<void>();
    let call = 0;
    const save = vi.fn(() => {
      call++;
      return call === 1 ? ctl1.promise : ctl2.promise;
    });

    const { result } = renderHook(() => useAsyncPanel({ load, save }));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => {
      result.current.persist({ a: 1 });
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith({ a: 1, b: "x" });

    act(() => {
      result.current.persist({ a: 2 });
      result.current.persist({ b: "z" });
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      ctl1.resolve();
    });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith({ a: 2, b: "z" });
    expect(result.current.busy).toBe(true);
    expect(result.current.data).toEqual({ a: 1, b: "x" });

    await act(async () => {
      ctl2.resolve();
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.data).toEqual({ a: 2, b: "z" });
  });

  it("reload re-runs load and clears error on success", async () => {
    let calls = 0;
    const load = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("fail-load");
      return { a: 9, b: "ok" } as Settings;
    });
    const save = vi.fn(async () => {});

    const { result } = renderHook(() => useAsyncPanel({ load, save }));
    await waitFor(() =>
      expect(result.current.error?.message).toBe("fail-load"),
    );

    act(() => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.data).toEqual({ a: 9, b: "ok" }));
    expect(result.current.error).toBeNull();
  });

  it("is StrictMode-safe: only the latest load wins", async () => {
    let calls = 0;
    const responses = [
      { a: 1, b: "first" },
      { a: 2, b: "second" },
    ];
    const load = vi.fn(async () => {
      const i = calls++;
      return responses[Math.min(i, responses.length - 1)] as Settings;
    });
    const save = vi.fn(async () => {});

    const { result } = renderHook(() => useAsyncPanel({ load, save }), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ a: 2, b: "second" });
  });
});
