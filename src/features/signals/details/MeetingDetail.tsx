// Meeting detail pane — shown when a cal signal is selected in Inbox.
// Shows private notes, agenda, and attendees from the event payload.

import { Button } from "#/components/ui/button";
import { VideoIcon, CalendarIcon } from "lucide-react";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { InboxSignal } from "#/features/signals/components/InboxView";

function formatMeetingTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = d.getMinutes();
  const h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  const mm = mins.toString().padStart(2, "0");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getDay()]} ${hh}:${mm} ${ampm}`;
}

type Props = { signal: InboxSignal };

export function MeetingDetail({ signal: s }: Props) {
  const timeLabel = s.age ? `Meeting · ${formatMeetingTime(s.age)}` : "Meeting";
  const videoLink =
    s.url && s.url.length > 0 ? s.url : null;

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", flex: 1 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <SourceGlyph source="cal" size={18} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--muted-foreground, var(--muted))",
          }}
        >
          {timeLabel}
        </span>
      </div>

      <h1
        style={{
          margin: "0 0 6px",
          fontSize: 18,
          fontWeight: 600,
          color: "var(--foreground)",
        }}
      >
        {s.title}
      </h1>

      {s.sub && (
        <div
          style={{
            fontSize: 14,
            color: "var(--muted-foreground, var(--muted))",
            marginBottom: 20,
          }}
        >
          {s.sub}
        </div>
      )}

      {/* Private notes / description */}
      {s.meetingNotes && (
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--muted-foreground, var(--muted))",
              marginBottom: 6,
            }}
          >
            NOTES
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--body, var(--foreground))",
              background: "var(--surface-soft)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              border: "1px solid var(--hairline-soft, var(--border))",
              whiteSpace: "pre-wrap",
            }}
          >
            {s.meetingNotes}
          </div>
        </div>
      )}

      {/* Agenda */}
      {s.agenda && s.agenda.length > 0 && (
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--muted-foreground, var(--muted))",
              marginBottom: 6,
            }}
          >
            AGENDA
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {s.agenda.map((item, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static agenda items
                key={i}
                style={{
                  fontSize: 13.5,
                  color: "var(--body, var(--foreground))",
                }}
              >
                · {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attendees */}
      {s.meetingAttendees && s.meetingAttendees.length > 0 && (
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--muted-foreground, var(--muted))",
              marginBottom: 6,
            }}
          >
            ATTENDEES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {s.meetingAttendees.map((a, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: attendees list order is stable
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
              >
                <span style={{ color: "var(--body, var(--foreground))" }}>
                  {a.name ?? a.email ?? "Unknown"}
                </span>
                {a.organizer && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: "var(--surface-strong)",
                      color: "var(--muted-foreground, var(--muted))",
                    }}
                  >
                    organizer
                  </span>
                )}
                {a.response && a.response !== "accepted" && (
                  <span
                    style={{
                      fontSize: 10,
                      color: a.response === "declined" ? "var(--destructive, #ef4444)" : "var(--muted-foreground, var(--muted))",
                    }}
                  >
                    {a.response}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <Button
          variant="default"
          size="sm"
          onClick={() => videoLink && window.open(videoLink, "_blank")}
          disabled={!videoLink}
        >
          <VideoIcon />
          Join meeting
        </Button>
        <Button variant="outline" size="sm">
          <CalendarIcon />
          Open invite
        </Button>
      </div>
    </div>
  );
}
