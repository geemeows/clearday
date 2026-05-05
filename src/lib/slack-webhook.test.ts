import { describe, expect, it, vi } from "vitest";
import { handleSlackWebhook, verifySlackSignature } from "#/lib/slack-webhook";

const SECRET = "test-signing-secret";

async function sign(secret: string, ts: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`v0:${ts}:${body}`)),
  );
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `v0=${hex}`;
}

function makeRequest(opts: {
  ts: string;
  signature: string;
  body: string;
}): Parameters<typeof handleSlackWebhook>[0] {
  return {
    headers: {
      get: (name) => {
        const lower = name.toLowerCase();
        if (lower === "x-slack-request-timestamp") return opts.ts;
        if (lower === "x-slack-signature") return opts.signature;
        return null;
      },
    },
    text: async () => opts.body,
  };
}

function makeStore() {
  const upsert = vi.fn(
    async (
      _values: Record<string, unknown> | Record<string, unknown>[],
      _options: { onConflict: string },
    ) => ({
      error: null,
    }),
  );
  return {
    upsert,
    client: {
      from: () => ({
        upsert,
        select: () => ({}) as never,
        update: () => ({}) as never,
      }),
    },
  };
}

describe("verifySlackSignature", () => {
  it("accepts a fresh, correctly-signed body", async () => {
    const ts = "1714820000";
    const body = "{}";
    const sig = await sign(SECRET, ts, body);
    const result = await verifySlackSignature(
      SECRET,
      ts,
      sig,
      body,
      1714820010,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects mismatched signatures", async () => {
    const ts = "1714820000";
    const body = "{}";
    const result = await verifySlackSignature(
      SECRET,
      ts,
      "v0=deadbeef",
      body,
      1714820010,
    );
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects timestamps older than 5 minutes (replay)", async () => {
    const ts = "1714820000";
    const body = "{}";
    const sig = await sign(SECRET, ts, body);
    const tenMinLater = 1714820000 + 10 * 60;
    const result = await verifySlackSignature(
      SECRET,
      ts,
      sig,
      body,
      tenMinLater,
    );
    expect(result).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects when headers are missing", async () => {
    const result = await verifySlackSignature(SECRET, null, "v0=x", "{}", 0);
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });
});

describe("handleSlackWebhook", () => {
  it("answers url_verification with the challenge", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({ type: "url_verification", challenge: "abc" });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        now: () => 1714820010,
      },
    );
    expect(outcome).toEqual({ kind: "challenge", challenge: "abc" });
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("upserts a Signal for an actionable event", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "im",
        channel: "D1",
        user: "U_OTHER",
        ts: "1714820000.000100",
        text: "ping",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        now: () => 1714820010,
      },
    );
    expect(outcome.kind).toBe("stored");
    expect(store.upsert).toHaveBeenCalledTimes(1);
    const rows = store.upsert.mock.calls[0][0] as Array<{ kind: string }>;
    expect(rows[0].kind).toBe("dm");
  });

  it("ignores events that don't normalize to a Signal", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "channel",
        channel: "C1",
        user: "U_OTHER",
        ts: "1714820000.000100",
        text: "general chatter, no mentions",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        now: () => 1714820010,
      },
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "not_actionable" });
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects with 401 on a bad signature without touching the store", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({ type: "url_verification", challenge: "x" });
    const store = makeStore();
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: "v0=wrong", body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        now: () => 1714820010,
      },
    );
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.status).toBe(401);
      expect(outcome.reason).toBe("bad_signature");
    }
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects stale timestamps with 408", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({ type: "url_verification", challenge: "x" });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        now: () => 1714820000 + 10 * 60,
      },
    );
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") expect(outcome.status).toBe(408);
  });

  it("filters @here broadcasts by allowlist", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "channel",
        channel: "C_OPS",
        user: "U_OTHER",
        ts: "1714820000.000100",
        text: "<!here> deploy is red",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => ["C_OPS"],
        loadSelfUserId: async () => "U_SELF",
        now: () => 1714820010,
      },
    );
    expect(outcome.kind).toBe("stored");
    expect(store.upsert).toHaveBeenCalledTimes(1);
  });

  it("calls onStored after a successful Signal upsert", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "im",
        channel: "D1",
        user: "U_OTHER",
        ts: "1714820000.000100",
        text: "ping",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const onStored = vi.fn(async (_s: unknown) => undefined);
    await handleSlackWebhook(makeRequest({ ts, signature: sig, body }), {
      signingSecret: SECRET,
      store: store.client,
      loadAllowlist: async () => [],
      loadSelfUserId: async () => "U_SELF",
      onStored,
      now: () => 1714820010,
    });
    expect(onStored).toHaveBeenCalledTimes(1);
    const [stored] = onStored.mock.calls[0];
    expect((stored as { kind: string }).kind).toBe("dm");
  });

  it("swallows onStored errors so Slack does not retry", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "im",
        channel: "D1",
        user: "U_OTHER",
        ts: "1714820000.000100",
        text: "ping",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const onStored = vi.fn(async (_s: unknown) => {
      throw new Error("dispatch boom");
    });
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        onStored,
        now: () => 1714820010,
      },
    );
    expect(outcome.kind).toBe("stored");
  });

  it("records the parent thread when the owner posts in a channel", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "channel",
        channel: "C1",
        user: "U_SELF",
        ts: "1714820000.000100",
        text: "kicking off the thread",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const recordParticipatedThread = vi.fn(
      async (_c: string, _t: string) => undefined,
    );
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        recordParticipatedThread,
        now: () => 1714820010,
      },
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "not_actionable" });
    expect(recordParticipatedThread).toHaveBeenCalledWith(
      "C1",
      "1714820000.000100",
    );
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("records the existing thread anchor when the owner replies in a thread", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "channel",
        channel: "C1",
        user: "U_SELF",
        ts: "1714820000.000200",
        thread_ts: "1714820000.000100",
        text: "my reply",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const recordParticipatedThread = vi.fn(
      async (_c: string, _t: string) => undefined,
    );
    await handleSlackWebhook(makeRequest({ ts, signature: sig, body }), {
      signingSecret: SECRET,
      store: store.client,
      loadAllowlist: async () => [],
      loadSelfUserId: async () => "U_SELF",
      recordParticipatedThread,
      now: () => 1714820010,
    });
    expect(recordParticipatedThread).toHaveBeenCalledWith(
      "C1",
      "1714820000.000100",
    );
  });

  it("turns thread replies in participated threads into thread_reply Signals", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "channel",
        channel: "C1",
        user: "U_OTHER",
        ts: "1714820000.000300",
        thread_ts: "1714820000.000100",
        text: "follow-up on the thread",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const loadParticipatedThread = vi.fn(
      async (channel: string, thread_ts: string) =>
        channel === "C1" && thread_ts === "1714820000.000100",
    );
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        loadParticipatedThread,
        now: () => 1714820010,
      },
    );
    expect(outcome.kind).toBe("stored");
    expect(loadParticipatedThread).toHaveBeenCalledWith(
      "C1",
      "1714820000.000100",
    );
    const rows = store.upsert.mock.calls[0][0] as Array<{ kind: string }>;
    expect(rows[0].kind).toBe("thread_reply");
  });

  it("drops thread replies in unparticipated threads", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "channel",
        channel: "C1",
        user: "U_OTHER",
        ts: "1714820000.000300",
        thread_ts: "1714820000.000100",
        text: "follow-up nobody asked for",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const loadParticipatedThread = vi.fn(async () => false);
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        loadParticipatedThread,
        now: () => 1714820010,
      },
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "not_actionable" });
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("swallows recordParticipatedThread errors so the webhook does not fail", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "channel",
        channel: "C1",
        user: "U_SELF",
        ts: "1714820000.000100",
        text: "owner saying hi",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const recordParticipatedThread = vi.fn(async () => {
      throw new Error("db down");
    });
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        recordParticipatedThread,
        now: () => 1714820010,
      },
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "not_actionable" });
  });

  it("calls recordWebhookReceived once per verified event_callback", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "im",
        channel: "D1",
        user: "U_OTHER",
        ts: "1714820000.000100",
        text: "ping",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const recordWebhookReceived = vi.fn(async () => undefined);
    await handleSlackWebhook(makeRequest({ ts, signature: sig, body }), {
      signingSecret: SECRET,
      store: store.client,
      loadAllowlist: async () => [],
      loadSelfUserId: async () => "U_SELF",
      recordWebhookReceived,
      now: () => 1714820010,
    });
    expect(recordWebhookReceived).toHaveBeenCalledTimes(1);
  });

  it("does not call recordWebhookReceived on url_verification challenges", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({ type: "url_verification", challenge: "abc" });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const recordWebhookReceived = vi.fn(async () => undefined);
    await handleSlackWebhook(makeRequest({ ts, signature: sig, body }), {
      signingSecret: SECRET,
      store: store.client,
      loadAllowlist: async () => [],
      loadSelfUserId: async () => "U_SELF",
      recordWebhookReceived,
      now: () => 1714820010,
    });
    expect(recordWebhookReceived).not.toHaveBeenCalled();
  });

  it("does not call recordWebhookReceived when the signature is bad", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({ type: "url_verification", challenge: "x" });
    const store = makeStore();
    const recordWebhookReceived = vi.fn(async () => undefined);
    await handleSlackWebhook(makeRequest({ ts, signature: "v0=wrong", body }), {
      signingSecret: SECRET,
      store: store.client,
      loadAllowlist: async () => [],
      loadSelfUserId: async () => "U_SELF",
      recordWebhookReceived,
      now: () => 1714820010,
    });
    expect(recordWebhookReceived).not.toHaveBeenCalled();
  });

  it("swallows recordWebhookReceived errors so the webhook does not fail", async () => {
    const ts = "1714820000";
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "message",
        channel_type: "im",
        channel: "D1",
        user: "U_OTHER",
        ts: "1714820000.000100",
        text: "ping",
      },
    });
    const sig = await sign(SECRET, ts, body);
    const store = makeStore();
    const recordWebhookReceived = vi.fn(async () => {
      throw new Error("db down");
    });
    const outcome = await handleSlackWebhook(
      makeRequest({ ts, signature: sig, body }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        recordWebhookReceived,
        now: () => 1714820010,
      },
    );
    // Signal still upserts; webhook stamping is best-effort.
    expect(outcome.kind).toBe("stored");
  });

  it("upsert is idempotent across resent events (same source_id)", async () => {
    const ts1 = "1714820010";
    const ts2 = "1714820020";
    const eventBody = (_ts: string) =>
      JSON.stringify({
        type: "event_callback",
        team_id: "T1",
        event: {
          type: "message",
          channel_type: "im",
          channel: "D1",
          user: "U_OTHER",
          ts: "1714820000.000100",
          text: "ping",
        },
        // event_ts omitted intentionally; source_id is (channel, ts)
      });

    const body1 = eventBody(ts1);
    const body2 = eventBody(ts2);
    const sig1 = await sign(SECRET, ts1, body1);
    const sig2 = await sign(SECRET, ts2, body2);
    const store = makeStore();

    await handleSlackWebhook(
      makeRequest({ ts: ts1, signature: sig1, body: body1 }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        now: () => Number.parseInt(ts1, 10),
      },
    );
    await handleSlackWebhook(
      makeRequest({ ts: ts2, signature: sig2, body: body2 }),
      {
        signingSecret: SECRET,
        store: store.client,
        loadAllowlist: async () => [],
        loadSelfUserId: async () => "U_SELF",
        now: () => Number.parseInt(ts2, 10),
      },
    );

    // Both calls should hit upsert with the same (provider, kind, source_id);
    // the DB enforces uniqueness so the second collapses into the first.
    expect(store.upsert).toHaveBeenCalledTimes(2);
    const first = store.upsert.mock.calls[0][0] as { source_id: string };
    const second = store.upsert.mock.calls[1][0] as { source_id: string };
    expect(first.source_id).toBe(second.source_id);
  });
});
