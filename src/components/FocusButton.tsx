// Focus session launcher in the App Shell header. Click → prompt for
// duration + optional message → POST /api/focus. The Worker fans the
// request out to Calendar (busy event), Slack profile (status with
// auto-expiration), and Slack DND (snooze). Best-effort: per-provider
// outcomes are surfaced so a partial success doesn't read as a failure.

import { Moon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import {
  type MeetingEvent,
  pickActiveFocus,
  toMeetingEvents,
} from "#/lib/calendar-view";
import { cn } from "#/lib/cn";
import type { FocusStartResult } from "#/lib/focus-session";
import type { StoredSignal } from "#/lib/next-up";

const PRESETS = [25, 60, 90];

export type FocusStarter = (params: {
  duration_minutes: number;
  message?: string;
}) => Promise<FocusStartResult>;

export type MeetingsLoader = () => Promise<StoredSignal[]>;

const defaultStarter: FocusStarter = async (params) =>
  (await apiFetch("/api/focus", {
    method: "POST",
    body: params,
  })) as FocusStartResult;

const defaultMeetingsLoader: MeetingsLoader = async () => {
  const body = (await apiFetch("/api/signals?filter=meetings")) as {
    signals: StoredSignal[];
  };
  return body.signals;
};

export function FocusButton({
  starter,
  meetingsLoader,
  now,
}: {
  starter?: FocusStarter;
  meetingsLoader?: MeetingsLoader;
  now?: Date;
} = {}) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState<number>(60);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState<Date>(() => now ?? new Date());
  const [activeFocus, setActiveFocus] = useState<MeetingEvent | null>(null);

  const start = starter ?? defaultStarter;
  const loadMeetings = meetingsLoader ?? defaultMeetingsLoader;

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const signals = await loadMeetings();
        if (cancelled) return;
        const events = toMeetingEvents(signals);
        setActiveFocus(pickActiveFocus(events, now ?? new Date()));
      } catch {
        if (cancelled) return;
        setActiveFocus(null);
      }
    };
    refresh();
    const t = setInterval(() => {
      setTick(new Date());
      refresh();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [loadMeetings, now]);

  // Drop active focus the moment its end-time passes locally without waiting
  // for the next refresh.
  useEffect(() => {
    if (!activeFocus) return;
    if (activeFocus.endsAt.getTime() <= tick.getTime()) setActiveFocus(null);
  }, [activeFocus, tick]);

  const submit = useCallback(async () => {
    if (!Number.isFinite(duration) || duration <= 0) {
      setStatus("Pick a positive duration.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await start({
        duration_minutes: duration,
        message: message.trim() || undefined,
      });
      setStatus(summarize(result));
      if (allOk(result)) {
        setOpen(false);
        setMessage("");
      }
    } catch (err) {
      setStatus(
        `Failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setBusy(false);
    }
  }, [duration, message, start]);

  if (!open) {
    if (activeFocus) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 hover:bg-violet-100"
          aria-label="Start focus session"
          aria-pressed="true"
          data-focus-active="true"
        >
          <Moon className="h-4 w-4" />
          Focusing until {formatEndTime(activeFocus.endsAt)}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        aria-label="Start focus session"
      >
        <Moon className="h-4 w-4" />
        Focus
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Start focus session"
      className="rounded border border-zinc-200 bg-white p-3 text-sm shadow-sm"
    >
      <div className="font-medium text-zinc-900">Start a focus session</div>
      <fieldset className="mt-3 flex items-center gap-2">
        <legend className="sr-only">Duration</legend>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setDuration(p)}
            aria-pressed={duration === p}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              duration === p
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
            )}
          >
            {p}m
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-zinc-600">
          Custom
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-16 rounded border border-zinc-200 px-1 py-0.5 text-right"
            aria-label="Duration in minutes"
          />
          min
        </label>
      </fieldset>
      <label className="mt-3 block">
        <span className="text-xs text-zinc-600">Status message (optional)</span>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Deep work"
          className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm"
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start focus"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setStatus(null);
          }}
          disabled={busy}
          className="rounded border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {status && (
        <output className="mt-2 block text-xs text-zinc-600">{status}</output>
      )}
    </div>
  );
}

function allOk(r: FocusStartResult): boolean {
  return r.calendar.ok && r.slack_status.ok && r.slack_dnd.ok;
}

function summarize(r: FocusStartResult): string {
  if (allOk(r)) return "Focus session started.";
  const failed: string[] = [];
  if (!r.calendar.ok) failed.push(`calendar (${reasonOf(r.calendar)})`);
  if (!r.slack_status.ok)
    failed.push(`slack status (${reasonOf(r.slack_status)})`);
  if (!r.slack_dnd.ok) failed.push(`slack DND (${reasonOf(r.slack_dnd)})`);
  return `Started with issues: ${failed.join(", ")}`;
}

function reasonOf(o: { ok: false; error: string } | { ok: true }): string {
  return o.ok ? "" : o.error;
}

function formatEndTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
