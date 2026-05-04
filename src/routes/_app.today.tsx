import { createFileRoute } from "@tanstack/react-router";
import { Calendar as CalIcon, ExternalLink, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import {
  formatCountdown,
  type LinkedItem,
  type NextUpMeeting,
  pickMeetingForAlert,
  pickNextUp,
  type StoredSignal,
} from "#/lib/next-up";

export const Route = createFileRoute("/_app/today")({
  component: TodayPage,
});

function TodayPage() {
  const [meetings, setMeetings] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/signals?filter=meetings")
      .then((body) => {
        if (cancelled) return;
        const list = (body as { signals: StoredSignal[] }).signals;
        setMeetings(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick once per minute so the countdown stays fresh and the 10-min alert
  // window is checked each minute.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fire the 10-min alert at most once per Signal across reloads / sessions.
  useEffect(() => {
    if (!meetings) return;
    const due = pickMeetingForAlert(meetings, now);
    if (!due) return;
    if (alertAlreadyFired(due.id)) return;
    markAlertFired(due.id);
    setActiveAlertId(due.id);
  }, [meetings, now]);

  const nextUp = useMemo(
    () => (meetings ? pickNextUp(meetings, now) : null),
    [meetings, now],
  );

  const dismissAlert = useCallback(() => setActiveAlertId(null), []);

  const alertSignal = useMemo(
    () => meetings?.find((m) => m.id === activeAlertId) ?? null,
    [meetings, activeAlertId],
  );

  return (
    <TodayView
      meetings={meetings}
      nextUp={nextUp}
      now={now}
      error={error}
      alertSignal={alertSignal}
      onDismissAlert={dismissAlert}
    />
  );
}

export function TodayView({
  meetings,
  nextUp,
  now,
  error,
  alertSignal,
  onDismissAlert,
}: {
  meetings: StoredSignal[] | null;
  nextUp: NextUpMeeting | null;
  now: Date;
  error: string | null;
  alertSignal: StoredSignal | null;
  onDismissAlert: () => void;
}) {
  return (
    <section className="p-8">
      <header>
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your morning briefing, in-progress work, schedule, and inbox detail
          will live here.
        </p>
      </header>

      {error && (
        <p className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {meetings == null && !error && (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      )}

      {meetings != null && <NextUpCard meeting={nextUp} now={now} />}

      {alertSignal && (
        <MeetingAlertToast signal={alertSignal} onDismiss={onDismissAlert} />
      )}
    </section>
  );
}

export function NextUpCard({
  meeting,
  now,
}: {
  meeting: NextUpMeeting | null;
  now: Date;
}) {
  if (!meeting) {
    return (
      <div className="mt-6 rounded border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Next up</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Nothing on your calendar in the next 24 hours.
        </p>
      </div>
    );
  }
  return (
    <article
      aria-label="Next up"
      className="mt-6 rounded border border-zinc-200 bg-white p-5"
    >
      <header className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <CalIcon className="h-4 w-4" />
        Next up · {formatCountdown(meeting.startsAt, now)}
      </header>
      <h2 className="mt-2 text-lg font-semibold text-zinc-900">
        {meeting.signal.title}
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {formatLocalTime(meeting.startsAt)}
        {meeting.endsAt && ` – ${formatLocalTime(meeting.endsAt)}`}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {meeting.videoLink && (
          <a
            href={meeting.videoLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
          >
            <Video className="h-4 w-4" />
            Join
          </a>
        )}
        {meeting.signal.url && (
          <a
            href={meeting.signal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Calendar
          </a>
        )}
      </div>
      {meeting.linkedItems.length > 0 && (
        <ul aria-label="Linked items" className="mt-4 space-y-1">
          {meeting.linkedItems.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-700 underline hover:text-zinc-900"
              >
                {linkedLabel(item)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function MeetingAlertToast({
  signal,
  onDismiss,
}: {
  signal: StoredSignal;
  onDismiss: () => void;
}) {
  const videoLink = (signal.payload?.video_link as string | undefined) ?? null;
  return (
    <output
      aria-label="Meeting starting soon"
      className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg"
    >
      <CalIcon className="mt-0.5 h-5 w-5 text-zinc-700" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">
          Starts in 10 minutes
        </p>
        <p className="mt-0.5 truncate text-sm text-zinc-700">{signal.title}</p>
        {videoLink && (
          <a
            href={videoLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 text-xs text-white hover:bg-zinc-800"
          >
            <Video className="h-3 w-3" />
            Join
          </a>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss alert"
        onClick={onDismiss}
        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <X className="h-4 w-4" />
      </button>
    </output>
  );
}

function linkedLabel(item: LinkedItem): string {
  if (item.kind === "pr") return `${item.repo}#${item.number}`;
  return item.key;
}

function formatLocalTime(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ALERT_STORAGE_PREFIX = "clearday:meeting-alert:";

function alertAlreadyFired(id: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(ALERT_STORAGE_PREFIX + id) != null;
  } catch {
    return false;
  }
}

function markAlertFired(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ALERT_STORAGE_PREFIX + id, String(Date.now()));
  } catch {
    // best-effort; if storage is full or disabled, the next render will
    // simply re-fire (the inner `setActiveAlertId` is also idempotent in
    // the active session).
  }
}
