import { UserAvatar } from "#/components/UserAvatar";

export type MeetingAttendee = {
  email: string | null;
  name: string | null;
  response: string | null;
  organizer?: boolean;
};

export function AttendeeStack({
  attendees,
  max = 5,
}: {
  attendees: MeetingAttendee[];
  max?: number;
}) {
  const sorted = [...attendees].sort(byResponse);
  const visible = sorted.slice(0, max);
  const overflow = sorted.length - visible.length;
  return (
    <div className="flex items-center" style={{ paddingLeft: 8 }}>
      {visible.map((a, i) => {
        const label = attendeeLabel(a);
        const declined = a.response === "declined";
        return (
          <UserAvatar
            key={attendeeKey(a, i)}
            name={label}
            size="md"
            title={
              a.response && a.response !== "accepted"
                ? `${label} · ${a.response}`
                : label
            }
            data-response={a.response ?? undefined}
            style={{
              border: "2px solid var(--canvas)",
              marginLeft: i > 0 ? -8 : 0,
              opacity: declined ? 0.5 : 1,
            }}
          />
        );
      })}
      {overflow > 0 && (
        <span
          title={sorted
            .slice(max)
            .map((a) => attendeeLabel(a))
            .join(", ")}
          className="inline-flex items-center justify-center"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--surface-strong)",
            color: "var(--ink)",
            fontSize: 10,
            fontWeight: 600,
            border: "2px solid var(--canvas)",
            marginLeft: -8,
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

function attendeeKey(a: MeetingAttendee, i: number): string {
  return a.email ?? a.name ?? `idx-${i}`;
}

function attendeeLabel(a: MeetingAttendee): string {
  return a.name?.trim() || a.email?.trim() || "Guest";
}

function byResponse(a: MeetingAttendee, b: MeetingAttendee): number {
  const order: Record<string, number> = {
    accepted: 0,
    tentative: 1,
    needsAction: 2,
    declined: 3,
  };
  return (order[a.response ?? ""] ?? 4) - (order[b.response ?? ""] ?? 4);
}
