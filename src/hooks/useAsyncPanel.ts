// Owns the load → state → persist(patch) lifecycle every settings panel
// currently re-types by hand. Pessimistic: data updates only after save
// resolves; in-flight patches are queued and flushed as one fresh save once
// the in-flight save settles.

import { useCallback, useEffect, useRef, useState } from "react";

export type UseAsyncPanelOptions<T> = {
  load: () => Promise<T>;
  save: (next: T) => Promise<void>;
  debounceMs?: number;
};

export type UseAsyncPanelResult<T> = {
  data: T | null;
  error: Error | null;
  busy: boolean;
  persist: (patch: Partial<T>) => void;
  reload: () => void;
};

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function useAsyncPanel<T>(
  options: UseAsyncPanelOptions<T>,
): UseAsyncPanelResult<T> {
  const { debounceMs = 0 } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRef = useRef(options.load);
  const saveRef = useRef(options.save);
  loadRef.current = options.load;
  saveRef.current = options.save;

  const dataRef = useRef<T | null>(null);
  dataRef.current = data;

  const mountedRef = useRef(true);
  const loadEpochRef = useRef(0);
  const pendingPatchRef = useRef<Partial<T> | null>(null);
  const inFlightRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (inFlightRef.current) return;
    const patch = pendingPatchRef.current;
    if (patch == null) return;
    const base = dataRef.current;
    if (base == null) return; // wait until initial load lands

    pendingPatchRef.current = null;
    const next = { ...base, ...patch } as T;
    inFlightRef.current = true;
    setBusy(true);

    saveRef.current(next).then(
      () => {
        inFlightRef.current = false;
        if (!mountedRef.current) return;
        dataRef.current = next;
        setData(next);
        setError(null);
        if (pendingPatchRef.current != null) {
          flush();
        } else {
          setBusy(false);
        }
      },
      (err: unknown) => {
        inFlightRef.current = false;
        if (!mountedRef.current) return;
        setError(toError(err));
        if (pendingPatchRef.current != null) {
          flush();
        } else {
          setBusy(false);
        }
      },
    );
  }, []);

  const reload = useCallback(() => {
    const epoch = ++loadEpochRef.current;
    setBusy(true);
    loadRef.current().then(
      (loaded) => {
        if (!mountedRef.current || epoch !== loadEpochRef.current) return;
        dataRef.current = loaded;
        setData(loaded);
        setError(null);
        if (pendingPatchRef.current != null && !inFlightRef.current) {
          flush();
        } else if (!inFlightRef.current) {
          setBusy(false);
        }
      },
      (err: unknown) => {
        if (!mountedRef.current || epoch !== loadEpochRef.current) return;
        setError(toError(err));
        if (!inFlightRef.current) setBusy(false);
      },
    );
  }, [flush]);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [reload]);

  const persist = useCallback(
    (patch: Partial<T>) => {
      pendingPatchRef.current = {
        ...(pendingPatchRef.current ?? {}),
        ...patch,
      } as Partial<T>;
      setBusy(true);
      if (debounceMs > 0) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          flush();
        }, debounceMs);
      } else {
        flush();
      }
    },
    [debounceMs, flush],
  );

  return { data, error, busy, persist, reload };
}
