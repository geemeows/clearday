import { describe, expect, it, vi } from "vitest";
import { declineCalendarEvent } from "#/lib/calendar-actions";

type Call = { url: string; init: RequestInit };

function recordingFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("declineCalendarEvent", () => {
  it("GETs the event then PATCHes with self.responseStatus=declined", async () => {
    const { fn, calls } = recordingFetch((_url, init) => {
      if (init.method === "GET") {
        return jsonResponse(200, {
          id: "ev1",
          attendees: [
            { email: "alice@example.com", responseStatus: "accepted" },
            { email: "me@example.com", self: true, responseStatus: "accepted" },
          ],
        });
      }
      return jsonResponse(200, {});
    });

    const out = await declineCalendarEvent(
      { event_id: "ev1" },
      { token: "g-tok", fetch: fn },
    );

    expect(out).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/ev1",
    );
    expect(calls[0].init.method).toBe("GET");
    const getHeaders = calls[0].init.headers as Record<string, string>;
    expect(getHeaders.authorization).toBe("Bearer g-tok");

    expect(calls[1].url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/ev1?sendUpdates=all",
    );
    expect(calls[1].init.method).toBe("PATCH");
    const sent = JSON.parse(calls[1].init.body as string);
    expect(sent).toEqual({
      attendees: [
        { email: "alice@example.com", responseStatus: "accepted" },
        { email: "me@example.com", self: true, responseStatus: "declined" },
      ],
    });
  });

  it("URL-encodes event_id and respects calendar_id override", async () => {
    const { fn, calls } = recordingFetch((_url, init) => {
      if (init.method === "GET") {
        return jsonResponse(200, {
          attendees: [{ self: true, responseStatus: "accepted" }],
        });
      }
      return jsonResponse(200, {});
    });

    await declineCalendarEvent(
      { event_id: "evt/with slash", calendar_id: "team@example.com" },
      { token: "t", fetch: fn },
    );

    expect(calls[0].url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/team%40example.com/events/evt%2Fwith%20slash",
    );
  });

  it("rejects an empty event_id without a network call", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, {}));
    const out = await declineCalendarEvent(
      { event_id: "  " },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("invalid_event");
    expect(calls).toHaveLength(0);
  });

  it("returns no_token + needs_reauth when token is missing", async () => {
    const { fn, calls } = recordingFetch(() => jsonResponse(200, {}));
    const out = await declineCalendarEvent(
      { event_id: "ev1" },
      { token: null, fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("no_token");
      expect(out.needs_reauth).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });

  it("flags needs_reauth on a 401 GET response", async () => {
    const { fn } = recordingFetch(() => jsonResponse(401, { error: "nope" }));
    const out = await declineCalendarEvent(
      { event_id: "ev1" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(true);
    }
  });

  it("returns not_attendee when the user has no attendee row", async () => {
    const { fn, calls } = recordingFetch((_url, init) => {
      if (init.method === "GET") {
        return jsonResponse(200, {
          attendees: [
            { email: "alice@example.com", responseStatus: "accepted" },
          ],
        });
      }
      return jsonResponse(200, {});
    });
    const out = await declineCalendarEvent(
      { event_id: "ev1" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("not_attendee");
    // Only the GET ran.
    expect(calls).toHaveLength(1);
  });

  it("surfaces a non-2xx PATCH as api_error", async () => {
    const { fn } = recordingFetch((_url, init) => {
      if (init.method === "GET") {
        return jsonResponse(200, {
          attendees: [{ self: true, responseStatus: "accepted" }],
        });
      }
      return new Response("forbidden", { status: 403 });
    });
    const out = await declineCalendarEvent(
      { event_id: "ev1" },
      { token: "t", fetch: fn },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("api_error");
      expect(out.needs_reauth).toBe(true);
      expect(out.error).toContain("403");
    }
  });
});
