import { describe, expect, it, vi } from "vitest";
import { startFocusSession } from "#/features/focus/session";

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

const fixedNow = new Date("2026-05-04T13:00:00Z");

describe("startFocusSession", () => {
  it("writes Calendar event + Slack status + DND with the right durations", async () => {
    const { fn, calls } = recordingFetch((url) => {
      if (url.includes("calendar/v3")) {
        return jsonResponse(200, { id: "event-123" });
      }
      if (url.endsWith("users.profile.set")) {
        return jsonResponse(200, { ok: true });
      }
      if (url.endsWith("dnd.setSnooze")) {
        return jsonResponse(200, { ok: true, snooze_enabled: true });
      }
      return new Response("nope", { status: 404 });
    });

    const result = await startFocusSession(
      { duration_minutes: 60, message: "Deep work" },
      {
        tokens: { google: "g-tok", slack: "s-tok" },
        fetch: fn,
        now: () => fixedNow,
      },
    );

    expect(result.calendar.ok).toBe(true);
    if (result.calendar.ok) expect(result.calendar.eventId).toBe("event-123");
    expect(result.slack_status.ok).toBe(true);
    expect(result.slack_dnd.ok).toBe(true);

    const cal = calls.find((c) => c.url.includes("calendar/v3"));
    expect(cal).toBeDefined();
    const calBody = JSON.parse(cal?.init.body as string);
    expect(calBody.summary).toBe("Deep work");
    expect(calBody.start.dateTime).toBe(fixedNow.toISOString());
    expect(calBody.end.dateTime).toBe(
      new Date(fixedNow.getTime() + 60 * 60 * 1000).toISOString(),
    );
    expect(calBody.transparency).toBe("opaque");
    // Tagged so the google-calendar adapter can mark the resulting Signal
    // with payload.is_focus exactly (not via a title heuristic).
    expect(calBody.extendedProperties?.private?.clearday_focus).toBe("1");

    const status = calls.find((c) => c.url.endsWith("users.profile.set"));
    const statusBody = JSON.parse(status?.init.body as string);
    expect(statusBody.profile.status_text).toBe("Deep work");
    // status_expiration is end-time epoch seconds
    expect(statusBody.profile.status_expiration).toBe(
      Math.floor((fixedNow.getTime() + 60 * 60 * 1000) / 1000),
    );

    const dnd = calls.find((c) => c.url.endsWith("dnd.setSnooze"));
    expect(dnd?.init.body).toBe("num_minutes=60");
  });

  it("uses 'Focus' as the default summary when no message is provided", async () => {
    const { fn, calls } = recordingFetch((url) => {
      if (url.includes("calendar/v3")) return jsonResponse(200, { id: "e" });
      return jsonResponse(200, { ok: true });
    });
    await startFocusSession(
      { duration_minutes: 30 },
      { tokens: { google: "g", slack: "s" }, fetch: fn, now: () => fixedNow },
    );
    const cal = calls.find((c) => c.url.includes("calendar/v3"));
    expect(JSON.parse(cal?.init.body as string).summary).toBe("Focus");
  });

  it("does not roll back other providers when one fails", async () => {
    const { fn } = recordingFetch((url) => {
      if (url.includes("calendar/v3")) return jsonResponse(200, { id: "e" });
      if (url.endsWith("users.profile.set"))
        return jsonResponse(200, { ok: false, error: "token_revoked" });
      if (url.endsWith("dnd.setSnooze")) return jsonResponse(200, { ok: true });
      return new Response("nope", { status: 404 });
    });

    const result = await startFocusSession(
      { duration_minutes: 45 },
      { tokens: { google: "g", slack: "s" }, fetch: fn, now: () => fixedNow },
    );

    expect(result.calendar.ok).toBe(true);
    expect(result.slack_status.ok).toBe(false);
    if (!result.slack_status.ok) {
      expect(result.slack_status.error).toContain("token_revoked");
    }
    expect(result.slack_dnd.ok).toBe(true);
  });

  it("reports no_token reason when a provider is not connected", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const result = await startFocusSession(
      { duration_minutes: 30 },
      { tokens: { google: null, slack: null }, fetch: fn, now: () => fixedNow },
    );
    expect(result.calendar.ok).toBe(false);
    if (!result.calendar.ok) expect(result.calendar.reason).toBe("no_token");
    expect(result.slack_status.ok).toBe(false);
    expect(result.slack_dnd.ok).toBe(false);
  });

  it("surfaces calendar HTTP error bodies", async () => {
    const { fn } = recordingFetch((url) => {
      if (url.includes("calendar/v3"))
        return new Response("Insufficient Permission", { status: 403 });
      return jsonResponse(200, { ok: true });
    });
    const result = await startFocusSession(
      { duration_minutes: 25 },
      { tokens: { google: "g", slack: "s" }, fetch: fn, now: () => fixedNow },
    );
    expect(result.calendar.ok).toBe(false);
    if (!result.calendar.ok) {
      expect(result.calendar.error).toContain("403");
      expect(result.calendar.reason).toBe("api_error");
    }
  });

  it("uses the injected statusEmoji on the Slack profile call", async () => {
    const { fn, calls } = recordingFetch((url) => {
      if (url.includes("calendar/v3")) return jsonResponse(200, { id: "e" });
      return jsonResponse(200, { ok: true });
    });
    await startFocusSession(
      { duration_minutes: 30 },
      {
        tokens: { google: "g", slack: "s" },
        fetch: fn,
        now: () => fixedNow,
        statusEmoji: ":headphones:",
      },
    );
    const status = calls.find((c) => c.url.endsWith("users.profile.set"));
    const body = JSON.parse(status?.init.body as string);
    expect(body.profile.status_emoji).toBe(":headphones:");
  });

  it("falls back to :no_bell: when no statusEmoji is provided", async () => {
    const { fn, calls } = recordingFetch((url) => {
      if (url.includes("calendar/v3")) return jsonResponse(200, { id: "e" });
      return jsonResponse(200, { ok: true });
    });
    await startFocusSession(
      { duration_minutes: 30 },
      { tokens: { google: "g", slack: "s" }, fetch: fn, now: () => fixedNow },
    );
    const status = calls.find((c) => c.url.endsWith("users.profile.set"));
    const body = JSON.parse(status?.init.body as string);
    expect(body.profile.status_emoji).toBe(":no_bell:");
  });

  it("rejects non-positive durations", async () => {
    await expect(
      startFocusSession(
        { duration_minutes: 0 },
        {
          tokens: { google: "g", slack: "s" },
          fetch: vi.fn() as unknown as typeof fetch,
        },
      ),
    ).rejects.toThrow(/positive/);
  });
});
