// Today-page hero card. Composes CountdownRing + meeting meta + linked-signal
// chips + Join meeting / Open agenda / Skip 10-min alert actions per
// PRD #29 mockup #2.

import { CalendarClock, ExternalLink, Video, X } from "lucide-react";
import { CountdownRing } from "#/components/CountdownRing";
import type { LinkedItem, NextUpMeeting } from "#/lib/next-up";

export function NextUpHero({
  meeting,
  onSkipAlert,
}: {
  meeting: NextUpMeeting | null;
  onSkipAlert?: () => void;
}) {
  if (!meeting) {
    return (
      <article
        aria-label="Next up"
        className="rounded-lg border border-border bg-card p-6"
      >
        <header className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <CalendarClock className="h-4 w-4" />
          Next up
        </header>
        <p className="mt-2 text-muted-foreground text-sm">
          Nothing on your calendar in the next 24 hours.
        </p>
      </article>
    );
  }

  const agenda = parseAgenda(meeting.signal.payload?.description);

  return (
    <article
      aria-label="Next up"
      className="flex gap-6 rounded-lg border border-border bg-card p-6"
    >
      <div className="shrink-0">
        <CountdownRing targetIso={meeting.startsAt.toISOString()} />
      </div>
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <CalendarClock className="h-4 w-4" />
          Next up
        </header>
        <h2 className="mt-1 font-semibold text-foreground text-lg">
          {meeting.signal.title}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {formatLocalTime(meeting.startsAt)}
          {meeting.endsAt && ` – ${formatLocalTime(meeting.endsAt)}`}
        </p>

        {agenda.length > 0 && (
          <ul aria-label="Agenda" className="mt-3 space-y-1">
            {agenda.slice(0, 3).map((line) => (
              <li
                key={line}
                className="text-foreground text-sm before:mr-2 before:text-muted-foreground before:content-['•']"
              >
                {line}
              </li>
            ))}
          </ul>
        )}

        {meeting.linkedItems.length > 0 && (
          <ul
            aria-label="Linked items"
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            {meeting.linkedItems.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-sm border border-border bg-secondary px-2 py-0.5 font-mono text-foreground text-xs hover:bg-accent"
                >
                  {linkedLabel(item)}
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {meeting.videoLink && (
            <a
              href={meeting.videoLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary px-3 font-medium text-primary-foreground text-sm hover:opacity-90"
            >
              <Video className="h-4 w-4" />
              Join meeting
            </a>
          )}
          {meeting.signal.url && (
            <a
              href={meeting.signal.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-card px-3 text-foreground text-sm hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" />
              Open agenda
            </a>
          )}
          {onSkipAlert && (
            <button
              type="button"
              onClick={onSkipAlert}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-card px-3 text-muted-foreground text-sm hover:bg-accent"
            >
              <X className="h-4 w-4" />
              Skip 10-min alert
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function parseAgenda(description: unknown): string[] {
  if (typeof description !== "string" || description.length === 0) return [];
  return description
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•·]\s*/, "").trim())
    .filter((line) => line.length > 0);
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
