// Week-start hook: hydrates from /api/week-start on mount (DB is source of
// truth), mirrors to localStorage.devy.weekStart for fast pre-hydration reads,
// and dispatches devy:weekStartChanged whenever the value changes so the
// Calendar (and any other consumer) can react without a refresh.

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_WEEK_START,
  WEEK_START_STORAGE_KEY,
  WEEK_START_UPDATED_EVENT,
  WEEK_STARTS,
  type WeekStart,
  type WeekStartView,
} from "#/features/settings/week-start/api";
import { apiFetch } from "#/lib/api-client";

export type UseWeekStartResult = {
  weekStart: WeekStart;
  setWeekStart: (next: WeekStart) => void;
};

type SaveResult =
  | { ok: true; weekStart: WeekStartView }
  | { ok: false; error: string };

function isWeekStart(v: unknown): v is WeekStart {
  return (
    typeof v === "string" && (WEEK_STARTS as readonly string[]).includes(v)
  );
}

export function readCachedWeekStart(): WeekStart {
  if (typeof window === "undefined") return DEFAULT_WEEK_START.weekStart;
  try {
    const v = window.localStorage.getItem(WEEK_START_STORAGE_KEY);
    if (isWeekStart(v)) return v;
  } catch {
    // localStorage unavailable: fall through to default.
  }
  return DEFAULT_WEEK_START.weekStart;
}

export function writeCachedWeekStart(value: WeekStart): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WEEK_START_STORAGE_KEY, value);
  } catch {
    // private mode / quota: in-memory listeners still get the event below.
  }
}

export function dispatchWeekStartChanged(value: WeekStart): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(WEEK_START_UPDATED_EVENT, {
        detail: { weekStart: value },
      }),
    );
  } catch {
    // very old runtimes lacking CustomEvent: noop.
  }
}

export function useWeekStart(): UseWeekStartResult {
  const [value, setValue] = useState<WeekStart>(() => readCachedWeekStart());

  // Hydration must run once on mount; we don't want a stale `value`
  // closure to trigger re-fetches.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hydration runs once on mount
  useEffect(() => {
    let cancelled = false;
    (apiFetch("/api/week-start") as Promise<WeekStartView>)
      .then((v) => {
        if (cancelled) return;
        if (isWeekStart(v.weekStart) && v.weekStart !== value) {
          setValue(v.weekStart);
          writeCachedWeekStart(v.weekStart);
          dispatchWeekStartChanged(v.weekStart);
        } else if (isWeekStart(v.weekStart)) {
          writeCachedWeekStart(v.weekStart);
        }
      })
      .catch(() => {
        // Pre-auth or worker error: keep cached/default.
      });
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ weekStart: unknown }>).detail;
      if (detail && isWeekStart(detail.weekStart)) {
        setValue(detail.weekStart);
      }
    };
    window.addEventListener(WEEK_START_UPDATED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(WEEK_START_UPDATED_EVENT, onChanged);
    };
  }, []);

  const setWeekStart = useCallback(
    (next: WeekStart) => {
      const previous = value;
      setValue(next);
      writeCachedWeekStart(next);
      dispatchWeekStartChanged(next);
      (
        apiFetch("/api/week-start", {
          method: "PUT",
          body: { weekStart: next },
        }) as Promise<SaveResult>
      )
        .then((out) => {
          if (!out.ok) {
            setValue(previous);
            writeCachedWeekStart(previous);
            dispatchWeekStartChanged(previous);
          }
        })
        .catch(() => {
          setValue(previous);
          writeCachedWeekStart(previous);
          dispatchWeekStartChanged(previous);
        });
    },
    [value],
  );

  return { weekStart: value, setWeekStart };
}
