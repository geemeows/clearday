import { describe, expect, it, vi } from "vitest";
import {
  type CalendarFetch,
  CalendarPollError,
  type GoogleCalendarEvent,
  normalize,
  parseLinkedItems,
  pollCalendarSignals,
} from "#/lib/provider-adapter/google-calendar";

const baseEvent: GoogleCalendarEvent = {
  id: "evt-1",
  summary: "Standup",
  description: "agenda",
  status: "confirmed",
  hangoutLink: "https://meet.google.com/abc-defg-hij",
  htmlLink: "https://calendar.google.com/event?eid=evt-1",
  start: { dateTime: "2026-05-04T15:00:00.000Z" },
  end: { dateTime: "2026-05-04T15:15:00.000Z" },
  attendees: [{ self: true, responseStatus: "accepted" }],
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe("normalize", () => {
  it("turns an accepted Google Meet event into a meeting Signal", () => {
    const sig = normalize(baseEvent);
    expect(sig).not.toBeNull();
    if (!sig) return;
    expect(sig.provider).toBe("google");
    expect(sig.kind).toBe("meeting");
    expect(sig.source_id).toBe("evt-1");
    expect(sig.url).toBe("https://calendar.google.com/event?eid=evt-1");
    expect(sig.payload).toMatchObject({
      starts_at: "2026-05-04T15:00:00.000Z",
      ends_at: "2026-05-04T15:15:00.000Z",
      video_link: "https://meet.google.com/abc-defg-hij",
      response_status: "accepted",
    });
    expect(sig.source_created_at).toBe("2026-05-04T15:00:00.000Z");
    expect(sig.requires_action).toBe(false);
  });

  it("returns null for declined events", () => {
    expect(
      normalize({
        ...baseEvent,
        attendees: [{ self: true, responseStatus: "declined" }],
      }),
    ).toBeNull();
  });

  it("returns null for events with only needsAction (no response yet)", () => {
    expect(
      normalize({
        ...baseEvent,
        attendees: [{ self: true, responseStatus: "needsAction" }],
      }),
    ).toBeNull();
  });

  it("accepts tentative responses", () => {
    expect(
      normalize({
        ...baseEvent,
        attendees: [{ self: true, responseStatus: "tentative" }],
      }),
    ).not.toBeNull();
  });

  it("returns null for all-day events (date instead of dateTime)", () => {
    expect(
      normalize({
        ...baseEvent,
        start: { date: "2026-05-04" },
        end: { date: "2026-05-05" },
      }),
    ).toBeNull();
  });

  it("returns null for events without any video link", () => {
    expect(
      normalize({
        ...baseEvent,
        hangoutLink: undefined,
        location: "Room 4",
        description: "no link here",
      }),
    ).toBeNull();
  });

  it("falls back to conferenceData entry points", () => {
    const sig = normalize({
      ...baseEvent,
      hangoutLink: undefined,
      conferenceData: {
        entryPoints: [
          { entryPointType: "video", uri: "https://zoom.us/j/123" },
          { entryPointType: "phone", uri: "tel:+1-555-0001" },
        ],
      },
    });
    expect(sig?.payload.video_link).toBe("https://zoom.us/j/123");
  });

  it("falls back to a Zoom/Teams URL parsed out of the description", () => {
    const sig = normalize({
      ...baseEvent,
      hangoutLink: undefined,
      description: "Notes: join at https://acme.zoom.us/j/9988 (host: priya)",
    });
    expect(sig?.payload.video_link).toBe("https://acme.zoom.us/j/9988");
  });

  it("treats organizer-self solo events as accepted", () => {
    const sig = normalize({
      ...baseEvent,
      attendees: undefined,
      organizer: { self: true, email: "me@example.com" },
    });
    expect(sig?.payload.response_status).toBe("accepted");
  });

  it("uses a placeholder title when summary is missing", () => {
    const sig = normalize({ ...baseEvent, summary: undefined });
    expect(sig?.title).toBe("(untitled meeting)");
  });
});

describe("parseLinkedItems", () => {
  it("extracts GitHub PR, Linear, and Jira links once each", () => {
    const items = parseLinkedItems(
      [
        "PR: https://github.com/acme/web/pull/123 .",
        "Ticket: https://linear.app/acme/issue/ENG-42",
        "Also https://acme.atlassian.net/browse/PROJ-7).",
        "Duplicate https://github.com/acme/web/pull/123",
      ].join("\n"),
    );
    expect(items).toEqual([
      {
        kind: "pr",
        url: "https://github.com/acme/web/pull/123",
        repo: "acme/web",
        number: 123,
      },
      {
        kind: "ticket",
        url: "https://linear.app/acme/issue/ENG-42",
        key: "ENG-42",
      },
      {
        kind: "ticket",
        url: "https://acme.atlassian.net/browse/PROJ-7",
        key: "PROJ-7",
      },
    ]);
  });

  it("returns empty for descriptions without links", () => {
    expect(parseLinkedItems("just notes")).toEqual([]);
  });
});

describe("pollCalendarSignals", () => {
  it("queries primary calendar with a 24h forward window and returns normalized Signals", async () => {
    const fetchImpl: CalendarFetch = vi.fn(async (url, init) => {
      const u = new URL(url);
      expect(u.pathname).toMatch(/calendars\/primary\/events$/);
      expect(u.searchParams.get("singleEvents")).toBe("true");
      expect(u.searchParams.get("orderBy")).toBe("startTime");
      expect(init.headers.authorization).toBe("Bearer tok");
      const timeMin = u.searchParams.get("timeMin");
      const timeMax = u.searchParams.get("timeMax");
      expect(timeMin).toBe("2026-05-04T12:00:00.000Z");
      expect(timeMax).toBe("2026-05-05T12:00:00.000Z");
      return okJson({
        items: [
          baseEvent,
          {
            ...baseEvent,
            id: "evt-2",
            start: { date: "2026-05-04" },
            end: { date: "2026-05-05" },
          },
        ],
      });
    });
    const sigs = await pollCalendarSignals(
      "tok",
      fetchImpl,
      new Date("2026-05-04T12:00:00.000Z"),
    );
    expect(sigs).toHaveLength(1);
    expect(sigs[0].source_id).toBe("evt-1");
  });

  it("throws CalendarPollError on non-2xx", async () => {
    const fetchImpl: CalendarFetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "unauthorized",
    });
    await expect(pollCalendarSignals("tok", fetchImpl)).rejects.toBeInstanceOf(
      CalendarPollError,
    );
  });
});
