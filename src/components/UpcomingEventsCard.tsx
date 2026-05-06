// Today-page upcoming events card. Renders a clean list of upcoming meetings
// without any countdown — see issue #47 (revision of PRD #29 mockup #2).

import { CalendarClock, ExternalLink, Video } from "lucide-react";
import type { NextUpMeeting } from "#/lib/next-up";

export function UpcomingEventsCard({
  meetings,
}: {
  meetings: NextUpMeeting[];
}) {
  return (
    <article
      aria-label="Upcoming events"
      className="rounded-lg border border-border bg-card p-5"
    >
      <header className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <CalendarClock className="h-4 w-4" />
        Upcoming events
      </header>
      {meetings.length === 0 ? (
        <p className="mt-3 text-muted-foreground text-sm">
          Nothing on your calendar in the next 24 hours.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {meetings.map((m) => (
            <li
              key={m.signal.id}
              className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
            >
              <time
                dateTime={m.startsAt.toISOString()}
                className="w-24 shrink-0 font-mono text-muted-foreground text-xs"
              >
                {formatLocalTime(m.startsAt)}
              </time>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground text-sm">
                  {m.signal.title}
                </p>
                {m.endsAt && (
                  <p className="text-muted-foreground text-xs">
                    Ends {formatLocalTime(m.endsAt)}
                  </p>
                )}
              </div>
              {m.videoLink && (
                <a
                  href={m.videoLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 font-medium text-primary-foreground text-xs hover:opacity-90"
                >
                  <Video className="h-3 w-3" />
                  Join
                </a>
              )}
              {!m.videoLink && m.signal.url && (
                <a
                  href={m.signal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 text-foreground text-xs hover:bg-accent"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function formatLocalTime(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
