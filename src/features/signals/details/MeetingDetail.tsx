// Meeting detail pane — shown when a cal signal is selected in Inbox.

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

      {/* Agenda */}
      {s.agenda && s.agenda.length > 0 && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--muted-foreground, var(--muted))",
              marginBottom: 4,
            }}
          >
            AGENDA
          </div>
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
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <Button variant="default" size="sm">
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
