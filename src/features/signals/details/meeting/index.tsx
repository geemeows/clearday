import { Calendar as CalIcon, Video } from "lucide-react";
import type { StoredSignal } from "#/features/signals/components/InboxView";
import { formatMeetingTime } from "#/features/signals/display";
import { AttendeeStack, type MeetingAttendee } from "./Attendees";

export function MeetingDetail({ signal }: { signal: StoredSignal }) {
  const startsAt = signal.payload?.starts_at as string | undefined;
  const endsAt = signal.payload?.ends_at as string | undefined;
  const videoLink = signal.payload?.video_link as string | undefined;
  const organizer = signal.payload?.organizer as string | undefined;
  const description = (signal.payload?.description as string | null) ?? "";
  const agenda = parseAgenda(description);
  const attendees =
    (signal.payload?.attendees as MeetingAttendee[] | undefined) ?? [];
  const linkedItems =
    (signal.payload?.linked_items as
      | Array<{
          kind: string;
          url: string;
          repo?: string;
          number?: number;
          key?: string;
        }>
      | undefined) ?? [];
  return (
    <div data-slot="meeting-detail" className="mt-3 space-y-3 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        {startsAt && (
          <>
            <dt className="text-muted-foreground">When</dt>
            <dd className="text-foreground">
              {formatMeetingTime(startsAt, endsAt)}
            </dd>
          </>
        )}
        {organizer && (
          <>
            <dt className="text-muted-foreground">Organizer</dt>
            <dd className="text-foreground">{organizer}</dd>
          </>
        )}
      </dl>
      {attendees.length > 0 && (
        <section aria-label="Attendees" className="flex items-center gap-3">
          <header
            className="font-bold uppercase tracking-wider"
            style={{ fontSize: 9, color: "var(--muted-foreground)" }}
          >
            Attendees
          </header>
          <AttendeeStack attendees={attendees} />
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {attendees.length}{" "}
            {attendees.length === 1 ? "attendee" : "attendees"}
          </span>
        </section>
      )}
      {agenda.length > 0 && (
        <section aria-label="Agenda">
          <header
            className="mb-2 font-bold uppercase tracking-wider"
            style={{ fontSize: 9, color: "var(--muted-foreground)" }}
          >
            Agenda
          </header>
          <ul className="ml-4 list-disc space-y-1 text-sm text-foreground">
            {agenda.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {videoLink && (
          <a
            href={videoLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-active"
          >
            <Video className="h-4 w-4" />
            Join meeting
          </a>
        )}
        {signal.url && (
          <a
            href={signal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <CalIcon className="h-4 w-4" />
            Open invite
          </a>
        )}
      </div>
      {linkedItems.length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Linked items
          </p>
          <ul className="mt-1 space-y-1">
            {linkedItems.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-foreground underline hover:text-foreground/80"
                >
                  {item.kind === "pr" && item.repo
                    ? `${item.repo}#${item.number}`
                    : (item.key ?? item.url)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function parseAgenda(description: string | undefined): string[] {
  if (!description) return [];
  return description
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter((l) => l.length > 0)
    .slice(0, 6);
}
