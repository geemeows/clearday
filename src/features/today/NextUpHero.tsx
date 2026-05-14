import { ArrowRight, ExternalLink, Target, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button as CossButton } from "#/components/ui/button";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { NextUpMeeting } from "#/features/signals/views/today";
import {
  computeCountdown,
  CountdownRing,
} from "#/features/today/CountdownRing";
import { cn } from "#/lib/cn";

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
  const minutesUntil = Math.max(
    0,
    Math.round((meeting.startsAt.getTime() - now.getTime()) / 60_000),
  );

  if (minutesUntil > 30) {
    return <FocusReadyNow meeting={meeting} minutesUntil={minutesUntil} />;
  }
  return (
    <MeetingCountdownNow
      meeting={meeting}
      minutesUntil={minutesUntil}
      alertArmed={alertArmed}
      onSkipAlert={onSkipAlert}
    />
  );
}

function MeetingCountdownNow({
  meeting,
  minutesUntil,
  alertArmed,
  onSkipAlert,
}: {
  meeting: NextUpMeeting;
  minutesUntil: number;
  alertArmed: boolean;
  onSkipAlert?: () => void;
}) {
  const { signal, startsAt, endsAt, videoLink, linkedItems } = meeting;
  const urgent = minutesUntil <= 10;
  const titleShort = signal.title.split("—")[0]?.trim().toUpperCase() ?? "";

  return (
    <article
      aria-label="Next up"
      data-variant="meeting-countdown"
      data-urgent={urgent ? "true" : undefined}
      className={cn(
        "grid grid-cols-1 items-center gap-6 rounded-[20px] px-7 py-[26px] transition-colors md:grid-cols-[auto_1fr_auto]",
        urgent
          ? "border-0 bg-neutral-900 text-white"
          : "border border-[var(--hairline-soft)] bg-card",
      )}
    >
      <div className="flex min-w-[160px] flex-col items-start">
        {urgent ? (
          <UrgentTimer targetIso={startsAt.toISOString()} />
        ) : (
          <span
            className={cn(
              "font-bold font-mono text-[56px] leading-none tabular-nums",
              "text-foreground",
            )}
            style={{ letterSpacing: "-2px" }}
          >
            {formatTime(startsAt)}
          </span>
        )}
        <span
          className={cn(
            "mt-1.5 font-semibold text-[10px] uppercase leading-[1.25] tracking-[0.6px]",
            urgent ? "text-white/55" : "text-muted-foreground",
          )}
        >
          {urgent ? (
            <>UNTIL {titleShort}</>
          ) : (
            <>
              STARTS IN {minutesUntil}M · {titleShort}
            </>
          )}
        </span>
      </div>

      <div
        className={cn(
          "min-w-0 border-l pl-6",
          urgent ? "border-white/15" : "border-[var(--hairline-soft)]",
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <SourceGlyph source="cal" size={16} />
          <span
            className={cn(
              "text-xs",
              urgent ? "text-white/60" : "text-muted-foreground",
            )}
          >
            {formatTimeRange(startsAt, endsAt)}
            {videoLink ? " · Google Meet" : ""}
          </span>
          {alertArmed && (
            <span
              className={cn(
                "ml-1 rounded-sm px-2 py-0.5 font-medium text-[11px]",
                urgent
                  ? "bg-white/10 text-white"
                  : "bg-primary/10 text-primary",
              )}
            >
              10-min alert armed
            </span>
          )}
        </div>
        <h2
          className={cn(
            "mb-2.5 font-semibold text-[17px] leading-[1.3]",
            urgent ? "text-white" : "text-foreground",
          )}
        >
          {signal.title}
        </h2>
        {linkedItems.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {linkedItems.slice(0, 3).map((item) => (
              <li
                key={item.url}
                className={cn(
                  "flex items-baseline gap-2 text-xs",
                  urgent ? "text-white/70" : "text-foreground",
                )}
              >
                <span
                  className={urgent ? "text-white/35" : undefined}
                  style={urgent ? undefined : { color: "var(--muted-soft)" }}
                >
                  ·
                </span>
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
        )}
      </div>

      <div className="flex min-w-[160px] flex-col items-stretch gap-2">
        {videoLink && (
          <CossButton
            variant="default"
            size="lg"
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
            variant={urgent ? "ghost" : "outline"}
            size="sm"
            className={
              urgent ? "border border-white/20 text-white hover:bg-white/10" : ""
            }
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
            className={urgent ? "text-white/80 hover:bg-white/10" : ""}
          >
            <X aria-hidden="true" />
            Skip 10-min alert
          </CossButton>
        )}
      </div>
    </article>
  );
}

function UrgentTimer({ targetIso }: { targetIso: string }) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const { mm, ss } = computeCountdown(targetIso, now);
  return (
    <span
      role="timer"
      aria-label={`${mm}:${ss} remaining`}
      className="font-bold font-mono text-[64px] text-primary leading-none tabular-nums"
      style={{ letterSpacing: "-3px" }}
    >
      <span data-testid="countdown-mm">{mm}</span>
      <span className="opacity-40">:</span>
      <span data-testid="countdown-ss">{ss}</span>
    </span>
  );
}

function FocusReadyNow({
  meeting,
  minutesUntil,
}: {
  meeting: NextUpMeeting;
  minutesUntil: number;
}) {
  const { signal, startsAt, endsAt } = meeting;
  return (
    <article
      aria-label="Next up"
      data-variant="focus-ready"
      className="grid grid-cols-1 items-center gap-6 rounded-[20px] border border-[var(--hairline-soft)] bg-card px-7 py-7 md:grid-cols-[1fr_auto]"
    >
      <div>
        <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.4px]">
          RIGHT NOW
        </span>
        <div
          className="mt-1.5 mb-2 font-semibold text-[20px] text-foreground leading-[1.25]"
          style={{ letterSpacing: "-0.2px" }}
        >
          Clear runway — {minutesUntil}m until{" "}
          {signal.title.split("—")[0]?.trim() ?? "next meeting"}
        </div>
        <p className="mb-3.5 text-muted-foreground text-sm">
          Enough time for a focused review pass.
        </p>
        <div className="flex flex-wrap gap-2">
          <CossButton variant="default" size="default">
            <Target aria-hidden="true" />
            Start 25-min focus
          </CossButton>
          {signal.url && (
            <CossButton
              variant="outline"
              size="default"
              render={
                <a href={signal.url} target="_blank" rel="noreferrer">
                  Open agenda
                  <ArrowRight aria-hidden="true" />
                </a>
              }
            />
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-2.5">
        <CountdownRing
          targetIso={startsAt.toISOString()}
          lookaheadMs={60 * 60 * 1000}
          label={`UNTIL ${(signal.title.split("—")[0]?.trim().toUpperCase() ?? "MEETING")}`}
        />
        <div className="font-mono text-muted-foreground text-xs">
          {formatTimeRange(startsAt, endsAt)}
        </div>
      </div>
    </article>
  );
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
