// Event detail dialog — title, time, account, location, attendees, agenda,
// editable notes, and footer CTAs. Matches the EventDialog in calendar.jsx.

import { useEffect, useState } from "react";
import {
  ExternalLinkIcon,
  ListIcon,
  MapPinIcon,
  StickyNoteIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "#/components/ui/dialog";
import type { CalEvent } from "./cal-event";
import { accountFor, fmtCalHour } from "./cal-event";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

type Props = {
  event: CalEvent | null;
  onOpenChange: (open: boolean) => void;
};

export function EventDialog({ event, onOpenChange }: Props) {
  const [notes, setNotes] = useState("");
  const [privateOnly, setPrivateOnly] = useState(false);

  useEffect(() => {
    if (event) {
      setNotes(event.notes ?? "");
      setPrivateOnly(false);
    }
  }, [event]);

  const acc = event ? accountFor(event.account) : accountFor("cal-work");
  const isFocus = event?.kind === "focus";
  const dayLabel = event ? (DAY_LABELS[event.day] ?? "") : "";
  const isVideoLink = Boolean(event?.location?.startsWith("http"));

  return (
    <Dialog open={event !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[560px] p-0 gap-0"
        showCloseButton={false}
      >
        {event && (
          <>
            {/* Header */}
            <div
              style={{
                padding: "16px 20px 14px",
                display: "flex",
                alignItems: "start",
                gap: 12,
                borderBottom: "1px solid var(--hairline)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 36,
                  borderRadius: 3,
                  background: acc.color,
                  marginTop: 3,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <DialogTitle
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--foreground)",
                    letterSpacing: -0.2,
                    margin: 0,
                  }}
                >
                  {event.title}
                </DialogTitle>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--muted-foreground)",
                    marginTop: 2,
                  }}
                >
                  {dayLabel} · {fmtCalHour(event.start)} –{" "}
                  {fmtCalHour(event.end)} ·{" "}
                  <span style={{ color: "var(--foreground)" }}>
                    {acc.short}
                  </span>{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    ({acc.label})
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <XIcon />
              </Button>
            </div>

            {/* Body */}
            <div
              style={{
                padding: "12px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Location / video link */}
              {event.location && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  {isVideoLink ? (
                    <VideoIcon size={14} />
                  ) : (
                    <MapPinIcon size={14} />
                  )}
                  <a
                    href={event.location}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--primary)",
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {event.location}
                  </a>
                </div>
              )}

              {/* Attendees */}
              {event.attendees && event.attendees.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "start",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <UsersIcon size={14} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        color: "var(--foreground)",
                      }}
                    >
                      {event.attendees.length} attendee
                      {event.attendees.length !== 1 ? "s" : ""}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {event.attendees.map((name, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: 11.5,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "var(--surface-strong)",
                            border: "1px solid var(--hairline)",
                            color: "var(--foreground)",
                          }}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Agenda */}
              {event.agenda && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "start",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <ListIcon size={14} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        color: "var(--muted-foreground)",
                        marginBottom: 4,
                      }}
                    >
                      Agenda
                    </div>
                    <div
                      style={{
                        color: "var(--foreground)",
                        lineHeight: 1.5,
                      }}
                    >
                      {event.agenda}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginTop: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <StickyNoteIcon size={13} />
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    Notes
                  </span>
                  <span style={{ flex: 1 }} />
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11.5,
                      color: "var(--muted-foreground)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={privateOnly}
                      onChange={(ev) => setPrivateOnly(ev.target.checked)}
                    />
                    Visible to me only
                  </label>
                </div>
                <textarea
                  value={notes}
                  onChange={(ev) => setNotes(ev.target.value)}
                  placeholder="Talking points, prep, follow-ups…"
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: 13,
                    lineHeight: 1.5,
                    fontFamily: "inherit",
                    color: "var(--foreground)",
                    background: "var(--background)",
                    border: "1px solid var(--input)",
                    borderRadius: "var(--radius-md)",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Footer CTAs */}
              <div
                style={{
                  marginTop: 6,
                  padding: "10px 0 0",
                  borderTop: "1px solid var(--hairline-soft)",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    event.location &&
                    window.open(event.location, "_blank")
                  }
                >
                  <ExternalLinkIcon />
                  Open in Google Calendar
                </Button>
                <span style={{ flex: 1 }} />
                <Button variant="default" size="sm" disabled={isFocus}>
                  Update meeting agenda
                </Button>
              </div>

              {isFocus && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                    textAlign: "right",
                  }}
                >
                  Focus blocks don't have shared agendas — notes stay on
                  your end.
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
