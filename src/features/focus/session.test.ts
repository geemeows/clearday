import { describe, expect, it, vi } from "vitest";
import {
  emitFocusEnded,
  emitFocusStarted,
  endFocusSession,
  startFocusSession,
} from "#/features/focus/session";

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
const oneSlack = [{ accountId: "acc-slack-1", token: "s-tok" }];

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
        tokens: { google: "g-tok", slack: oneSlack },
        fetch: fn,
        now: () => fixedNow,
      },
    );

    expect(result.calendar.ok).toBe(true);
    if (result.calendar.ok) expect(result.calendar.eventId).toBe("event-123");
    expect(result.slack).toHaveLength(1);
    expect(result.slack[0].accountId).toBe("acc-slack-1");
    expect(result.slack[0].status.ok).toBe(true);
    expect(result.slack[0].dnd.ok).toBe(true);

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
      {
        tokens: { google: "g", slack: oneSlack },
        fetch: fn,
        now: () => fixedNow,
      },
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
      {
        tokens: { google: "g", slack: oneSlack },
        fetch: fn,
        now: () => fixedNow,
      },
    );

    expect(result.calendar.ok).toBe(true);
    expect(result.slack[0].status.ok).toBe(false);
    if (!result.slack[0].status.ok) {
      expect(result.slack[0].status.error).toContain("token_revoked");
      expect(result.slack[0].status.reason).toBe("auth_failed");
    }
    expect(result.slack[0].dnd.ok).toBe(true);
  });

  it("reports no_token reason when google is not connected", async () => {
    const { fn } = recordingFetch(() => jsonResponse(200, { ok: true }));
    const result = await startFocusSession(
      { duration_minutes: 30 },
      { tokens: { google: null, slack: [] }, fetch: fn, now: () => fixedNow },
    );
    expect(result.calendar.ok).toBe(false);
    if (!result.calendar.ok) expect(result.calendar.reason).toBe("no_token");
    expect(result.slack).toEqual([]);
  });

  it("surfaces calendar HTTP error bodies", async () => {
    const { fn } = recordingFetch((url) => {
      if (url.includes("calendar/v3"))
        return new Response("Insufficient Permission", { status: 403 });
      return jsonResponse(200, { ok: true });
    });
    const result = await startFocusSession(
      { duration_minutes: 25 },
      {
        tokens: { google: "g", slack: oneSlack },
        fetch: fn,
        now: () => fixedNow,
      },
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
        tokens: { google: "g", slack: oneSlack },
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
      {
        tokens: { google: "g", slack: oneSlack },
        fetch: fn,
        now: () => fixedNow,
      },
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
          tokens: { google: "g", slack: oneSlack },
          fetch: vi.fn() as unknown as typeof fetch,
        },
      ),
    ).rejects.toThrow(/positive/);
  });

  it("fans out DND + status across every connected Slack account (#120)", async () => {
    const slackCallsByToken: Record<string, string[]> = {};
    const { fn } = recordingFetch((url, init) => {
      if (url.includes("calendar/v3")) return jsonResponse(200, { id: "e" });
      const auth = String(
        (init.headers as Record<string, string>)["authorization"] ?? "",
      );
      const token = auth.replace(/^Bearer /, "");
      slackCallsByToken[token] = slackCallsByToken[token] ?? [];
      if (url.endsWith("users.profile.set"))
        slackCallsByToken[token].push("status");
      if (url.endsWith("dnd.setSnooze")) slackCallsByToken[token].push("dnd");
      return jsonResponse(200, { ok: true });
    });

    const result = await startFocusSession(
      { duration_minutes: 30 },
      {
        tokens: {
          google: "g",
          slack: [
            { accountId: "acc-A", token: "tok-A" },
            { accountId: "acc-B", token: "tok-B" },
            { accountId: "acc-C", token: "tok-C" },
          ],
        },
        fetch: fn,
        now: () => fixedNow,
      },
    );

    expect(result.slack).toHaveLength(3);
    expect(result.slack.map((s) => s.accountId).sort()).toEqual([
      "acc-A",
      "acc-B",
      "acc-C",
    ]);
    for (const acct of result.slack) {
      expect(acct.status.ok).toBe(true);
      expect(acct.dnd.ok).toBe(true);
    }
    // Each account's token saw exactly one status + one dnd call.
    expect(slackCallsByToken["tok-A"].sort()).toEqual(["dnd", "status"]);
    expect(slackCallsByToken["tok-B"].sort()).toEqual(["dnd", "status"]);
    expect(slackCallsByToken["tok-C"].sort()).toEqual(["dnd", "status"]);
  });

  it("partial fan-out failure: one expired token does not abort the rest (#120)", async () => {
    const { fn } = recordingFetch((url, init) => {
      if (url.includes("calendar/v3")) return jsonResponse(200, { id: "e" });
      const auth = String(
        (init.headers as Record<string, string>)["authorization"] ?? "",
      );
      if (auth === "Bearer tok-bad") {
        return jsonResponse(200, { ok: false, error: "token_expired" });
      }
      return jsonResponse(200, { ok: true });
    });
    const result = await startFocusSession(
      { duration_minutes: 25 },
      {
        tokens: {
          google: "g",
          slack: [
            { accountId: "acc-good", token: "tok-good" },
            { accountId: "acc-bad", token: "tok-bad" },
          ],
        },
        fetch: fn,
        now: () => fixedNow,
      },
    );
    const good = result.slack.find((s) => s.accountId === "acc-good");
    const bad = result.slack.find((s) => s.accountId === "acc-bad");
    expect(good?.status.ok).toBe(true);
    expect(good?.dnd.ok).toBe(true);
    expect(bad?.status.ok).toBe(false);
    if (bad && !bad.status.ok) expect(bad.status.reason).toBe("auth_failed");
    expect(bad?.dnd.ok).toBe(false);
    if (bad && !bad.dnd.ok) expect(bad.dnd.reason).toBe("auth_failed");
    // Calendar still wrote despite Slack partial failure.
    expect(result.calendar.ok).toBe(true);
  });
});

describe("endFocusSession (#120)", () => {
  it("clears DND + status symmetrically across all Slack accounts", async () => {
    const { fn, calls } = recordingFetch(() =>
      jsonResponse(200, { ok: true }),
    );
    const result = await endFocusSession({
      tokens: {
        slack: [
          { accountId: "acc-A", token: "tok-A" },
          { accountId: "acc-B", token: "tok-B" },
        ],
      },
      fetch: fn,
    });

    expect(result.slack).toHaveLength(2);
    for (const acct of result.slack) {
      expect(acct.status.ok).toBe(true);
      expect(acct.dnd.ok).toBe(true);
    }
    // dnd.endDnd called per account; profile.set with empty status per account.
    const dndCalls = calls.filter((c) => c.url.endsWith("dnd.endDnd"));
    const statusCalls = calls.filter((c) => c.url.endsWith("users.profile.set"));
    expect(dndCalls).toHaveLength(2);
    expect(statusCalls).toHaveLength(2);
    const cleared = JSON.parse(statusCalls[0].init.body as string);
    expect(cleared.profile.status_text).toBe("");
    expect(cleared.profile.status_emoji).toBe("");
    expect(cleared.profile.status_expiration).toBe(0);
  });

  it("partial failure on end records per-account auth_failed and continues", async () => {
    const { fn } = recordingFetch((_url, init) => {
      const auth = String(
        (init.headers as Record<string, string>)["authorization"] ?? "",
      );
      if (auth === "Bearer tok-bad") {
        return jsonResponse(200, { ok: false, error: "invalid_auth" });
      }
      return jsonResponse(200, { ok: true });
    });
    const result = await endFocusSession({
      tokens: {
        slack: [
          { accountId: "acc-good", token: "tok-good" },
          { accountId: "acc-bad", token: "tok-bad" },
        ],
      },
      fetch: fn,
    });
    const good = result.slack.find((s) => s.accountId === "acc-good");
    const bad = result.slack.find((s) => s.accountId === "acc-bad");
    expect(good?.status.ok).toBe(true);
    expect(good?.dnd.ok).toBe(true);
    expect(bad?.status.ok).toBe(false);
    if (bad && !bad.status.ok) expect(bad.status.reason).toBe("auth_failed");
    expect(bad?.dnd.ok).toBe(false);
  });
});

describe("emitFocusStarted / emitFocusEnded", () => {
  it("dispatches the start boundary with session id and duration", async () => {
    const calls: Array<{ b: string; id: string; d: number }> = [];
    await emitFocusStarted("sess-1", 25, async (b, id, d) => {
      calls.push({ b, id, d });
    });
    expect(calls).toEqual([{ b: "focus_started", id: "sess-1", d: 25 }]);
  });

  it("dispatches the end boundary with session id and duration", async () => {
    const calls: Array<{ b: string; id: string; d: number }> = [];
    await emitFocusEnded("sess-1", 25, async (b, id, d) => {
      calls.push({ b, id, d });
    });
    expect(calls).toEqual([{ b: "focus_ended", id: "sess-1", d: 25 }]);
  });
});
