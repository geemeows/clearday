import { CalendarClock, ExternalLink, Video, X } from "lucide-react";
import { Button as CossButton } from "#/components/coss/button";
import { CountdownRing } from "#/features/today/CountdownRing";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { NextUpMeeting } from "#/features/signals/views/today";

export function NextUpHero({
  meeting,
  now,
  alertArmed,
  onSkipAlert,
}: {
  meeting: NextUpMeeting | null;
  now: Date;
  alertArmed: boolean;
  onSkipAlert?: () => void;
}) {
  if (!meeting) return null;
  const { signal, startsAt, endsAt, videoLink, linkedItems } = meeting;
  const minutesUntil = Math.max(
    0,
    Math.round((startsAt.getTime() - now.getTime()) / 60_000),
  );

  return (
    <article
      aria-label="Next up"
      className="grid grid-cols-1 items-stretch gap-6 rounded-lg border border-border bg-card p-6 md:grid-cols-[1fr_auto]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <SourceGlyph source="cal" size={20} />
          <span>
            <CalendarClock
              className="mr-1 inline h-3.5 w-3.5"
              aria-hidden="true"
            />
            Next up · {formatRelative(minutesUntil)}
          </span>
          {alertArmed && (
            <span className="rounded-sm bg-primary/10 px-2 py-0.5 font-medium text-[11px] text-primary normal-case tracking-normal">
              10-min alert armed
            </span>
          )}
        </div>

        <h2 className="font-semibold text-2xl text-foreground leading-tight">
          {signal.title}
        </h2>
        <p className="font-mono text-muted-foreground text-xs">
          {formatTimeRange(startsAt, endsAt)}
        </p>

        {linkedItems.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Agenda · pulled from invite
            </div>
            <ul className="flex flex-col gap-0.5">
              {linkedItems.map((item) => (
                <li
                  key={item.url}
                  className="flex items-baseline gap-2 text-foreground text-sm"
                >
                  <span className="text-muted-foreground">·</span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:underline"
                  >
                    {agendaLabel(item)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {videoLink && (
            <CossButton
              variant="default"
              size="sm"
              render={
                <a href={videoLink} target="_blank" rel="noreferrer">
                  <Video aria-hidden="true" />
                  Join meeting
                </a>
              }
            />
          )}
          {signal.url && (
            <CossButton
              variant="outline"
              size="sm"
              render={
                <a href={signal.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Open agenda
                </a>
              }
            />
          )}
          {alertArmed && onSkipAlert && (
            <CossButton
              variant="ghost"
              size="sm"
              onClick={onSkipAlert}
              aria-label="Skip 10-min alert"
            >
              <X aria-hidden="true" />
              Skip 10-min alert
            </CossButton>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 px-2">
        <CountdownRing
          targetIso={startsAt.toISOString()}
          label="UNTIL MEETING"
        />
      </div>
    </article>
  );
}

function formatRelative(minutes: number): string {
  if (minutes <= 0) return "starting now";
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

function formatTimeRange(startsAt: Date, endsAt: Date | null): string {
  const start = formatTime(startsAt);
  if (!endsAt) return start;
  return `${start} → ${formatTime(endsAt)}`;
}

function formatTime(d: Date): string {
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

function agendaLabel(item: {
  kind?: string;
  repo?: string | null;
  number?: number | null;
  url: string;
}): string {
  if (item.repo && item.number != null) {
    return `${item.repo} #${item.number}`;
  }
  return item.url;
}
