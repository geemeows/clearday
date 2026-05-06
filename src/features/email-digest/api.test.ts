import { describe, expect, it, vi } from "vitest";
import {
  type EmailDigestRow,
  type EmailDigestStore,
  getEmailDigestSettings,
  putEmailDigestSettings,
  renderDigest,
  runEmailDigestTick,
  sendEmailDigestTest,
} from "#/features/email-digest/api";
import { decryptSecret } from "#/shared/crypto";
import type { StoredSignal } from "#/shared/signal";

const KEY_SECRET = "deployment-secret-32-bytes-long!!";

function memStore(initial: EmailDigestRow | null = null): EmailDigestStore & {
  current: () => EmailDigestRow | null;
} {
  let row: EmailDigestRow | null = initial;
  return {
    load: async () => row,
    save: async (patch) => {
      row = { ...(row ?? {}), ...patch };
      return row;
    },
    current: () => row,
  };
}

function okResendFetch() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ id: "resend-id-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

function badResendFetch(status = 401, message = "invalid api key") {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ message }), {
        status,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

function fakeSignal(overrides: Partial<StoredSignal> = {}): StoredSignal {
  return {
    id: "sig-1",
    provider: "github",
    kind: "pr_review_requested",
    source_id: "repo#1",
    title: "Add login button",
    url: "https://example.com/pr/1",
    payload: {},
    requires_action: true,
    source_created_at: null,
    unread_count: 0,
    created_at: "2026-05-04T08:00:00.000Z",
    updated_at: "2026-05-04T08:00:00.000Z",
    dismissed_at: null,
    ...overrides,
  };
}

describe("renderDigest", () => {
  it("groups signals into PR / Meeting / Slack sections in stable order", () => {
    const signals: StoredSignal[] = [
      fakeSignal({
        kind: "mention",
        title: "Question from @priya",
        url: "https://slack.com/x",
      }),
      fakeSignal({
        kind: "pr_review_requested",
        title: "Refactor auth middleware",
      }),
      fakeSignal({
        kind: "meeting",
        title: "Standup",
        url: "https://meet.example.com/abc",
      }),
      fakeSignal({
        kind: "pr_authored",
        title: "WIP: add caching",
        url: null,
      }),
    ];
    const out = renderDigest({
      signals,
      sinceIso: null,
      now: new Date("2026-05-04T13:00:00.000Z"),
      isTest: false,
    });
    expect(out.subject).toBe("Clearday digest — 4 new signals (2026-05-04)");
    // Sections appear in PR → Meeting → Slack order.
    const prIdx = out.text.indexOf("Pull requests (2)");
    const meetIdx = out.text.indexOf("Meetings (1)");
    const slackIdx = out.text.indexOf("Slack (1)");
    expect(prIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeLessThan(meetIdx);
    expect(meetIdx).toBeLessThan(slackIdx);
    expect(out.text).toContain("- Refactor auth middleware");
    expect(out.text).toContain("- Standup — https://meet.example.com/abc");
    expect(out.html).toContain('<a href="https://example.com/pr/1">');
  });

  it("escapes HTML in titles", () => {
    const out = renderDigest({
      signals: [
        fakeSignal({
          title: "<script>alert(1)</script>",
          url: 'https://example.com/?x="y"',
        }),
      ],
      sinceIso: null,
      now: new Date("2026-05-04T13:00:00.000Z"),
      isTest: false,
    });
    expect(out.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out.html).toContain("https://example.com/?x=&quot;y&quot;");
  });

  it("renders a 'quiet day' message when there are no signals", () => {
    const out = renderDigest({
      signals: [],
      sinceIso: null,
      now: new Date("2026-05-04T13:00:00.000Z"),
      isTest: false,
    });
    expect(out.subject).toBe("Clearday digest — quiet day (2026-05-04)");
    expect(out.text).toContain("No new signals");
  });

  it("renders a distinct test message when isTest is true", () => {
    const out = renderDigest({
      signals: [],
      sinceIso: null,
      now: new Date("2026-05-04T13:00:00.000Z"),
      isTest: true,
    });
    expect(out.subject).toBe("Clearday digest — test message (2026-05-04)");
    expect(out.text).toContain("Resend transport is configured correctly");
  });

  it("ignores dismissed signals", () => {
    const out = renderDigest({
      signals: [
        fakeSignal({ id: "a", kind: "mention", title: "stays" }),
        fakeSignal({
          id: "b",
          kind: "mention",
          title: "dropped",
          dismissed_at: "2026-05-04T08:00:00.000Z",
        }),
      ],
      sinceIso: null,
      now: new Date("2026-05-04T13:00:00.000Z"),
      isTest: false,
    });
    expect(out.text).toContain("- stays");
    expect(out.text).not.toContain("dropped");
  });
});

describe("getEmailDigestSettings", () => {
  it("returns defaults when no row exists", async () => {
    const view = await getEmailDigestSettings(memStore(null));
    expect(view).toEqual({
      enabled: false,
      transport: "resend",
      has_api_key: false,
      from_email: null,
      to_email: null,
      hour_utc: 13,
      last_sent_date: null,
    });
  });

  it("never reveals the stored ciphertext, only has_api_key", async () => {
    const view = await getEmailDigestSettings(
      memStore({
        enabled: true,
        api_key: "enc:v1:abc.def",
        from_email: "Clearday <noreply@example.com>",
        to_email: "owner@example.com",
        hour_utc: 8,
      }),
    );
    expect(view.has_api_key).toBe(true);
    expect(view.enabled).toBe(true);
    expect(view.from_email).toBe("Clearday <noreply@example.com>");
    expect(view.to_email).toBe("owner@example.com");
    expect(view.hour_utc).toBe(8);
    // No api_key field on the view at all.
    expect((view as unknown as { api_key?: unknown }).api_key).toBeUndefined();
  });
});

describe("putEmailDigestSettings", () => {
  it("encrypts a new api_key with the deployment secret", async () => {
    const store = memStore();
    const out = await putEmailDigestSettings(
      {
        enabled: true,
        api_key: "re_real_key_123",
        from_email: "Clearday <noreply@example.com>",
        to_email: "owner@example.com",
        hour_utc: 9,
      },
      { store, keySecret: KEY_SECRET },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.settings.has_api_key).toBe(true);
    const stored = store.current()?.api_key ?? "";
    expect(stored).toMatch(/^enc:v1:/);
    expect(await decryptSecret(stored, KEY_SECRET)).toBe("re_real_key_123");
  });

  it("rejects out-of-range hour_utc", async () => {
    const out = await putEmailDigestSettings(
      { hour_utc: 24 },
      { store: memStore(), keySecret: KEY_SECRET },
    );
    expect(out).toEqual({
      ok: false,
      error: "hour_utc must be an integer 0-23",
    });
  });

  it("rejects to_email without an @", async () => {
    const out = await putEmailDigestSettings(
      { to_email: "not-an-email" },
      { store: memStore(), keySecret: KEY_SECRET },
    );
    expect(out).toMatchObject({ ok: false });
  });

  it("does not clobber the api_key when omitted on save", async () => {
    const store = memStore({
      api_key: "enc:v1:existing",
      enabled: false,
    });
    await putEmailDigestSettings(
      { enabled: true },
      { store, keySecret: KEY_SECRET },
    );
    expect(store.current()?.api_key).toBe("enc:v1:existing");
    expect(store.current()?.enabled).toBe(true);
  });
});

describe("sendEmailDigestTest", () => {
  it("returns not_configured-style error when missing config", async () => {
    const out = await sendEmailDigestTest({
      store: memStore(),
      keySecret: KEY_SECRET,
      fetch: okResendFetch(),
      loadSignals: async () => [],
    });
    expect(out).toMatchObject({ ok: false });
  });

  it("calls Resend with bearer + decrypted key on success", async () => {
    const store = memStore();
    await putEmailDigestSettings(
      {
        api_key: "re_real_key_123",
        from_email: "Clearday <noreply@example.com>",
        to_email: "owner@example.com",
      },
      { store, keySecret: KEY_SECRET },
    );
    const fetchMock = okResendFetch();
    const out = await sendEmailDigestTest({
      store,
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      loadSignals: async () => [],
    });
    expect(out).toEqual({ ok: true });
    const [, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    expect(
      ((init as RequestInit).headers as Record<string, string>).authorization,
    ).toBe("Bearer re_real_key_123");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.subject).toContain("test message");
    expect(body.to).toEqual(["owner@example.com"]);
  });

  it("surfaces upstream Resend errors", async () => {
    const store = memStore();
    await putEmailDigestSettings(
      {
        api_key: "re_bad",
        from_email: "from@example.com",
        to_email: "to@example.com",
      },
      { store, keySecret: KEY_SECRET },
    );
    const out = await sendEmailDigestTest({
      store,
      keySecret: KEY_SECRET,
      fetch: badResendFetch(401, "invalid api key"),
      loadSignals: async () => [],
    });
    expect(out).toMatchObject({ ok: false });
    if (out.ok) return;
    expect(out.error).toContain("401");
  });
});

describe("runEmailDigestTick", () => {
  function configuredStore(extra: EmailDigestRow = {}) {
    return memStore({
      enabled: true,
      transport: "resend",
      api_key: "enc:v1:will-be-replaced",
      from_email: "from@example.com",
      to_email: "to@example.com",
      hour_utc: 13,
      ...extra,
    });
  }

  async function configured(extra: EmailDigestRow = {}) {
    const store = configuredStore(extra);
    await putEmailDigestSettings(
      { api_key: "re_real_key" },
      { store, keySecret: KEY_SECRET },
    );
    return store;
  }

  it("skips with reason 'disabled' when the master toggle is off", async () => {
    const out = await runEmailDigestTick({
      store: memStore({ enabled: false }),
      keySecret: KEY_SECRET,
      fetch: okResendFetch(),
      loadSignals: async () => [],
      now: () => new Date("2026-05-04T15:00:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "disabled" });
  });

  it("skips with reason 'not_due' before the configured hour", async () => {
    const store = await configured({ hour_utc: 13 });
    const out = await runEmailDigestTick({
      store,
      keySecret: KEY_SECRET,
      fetch: okResendFetch(),
      loadSignals: async () => [],
      now: () => new Date("2026-05-04T11:30:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "not_due" });
  });

  it("skips with reason 'already_sent_today' on a second tick the same day", async () => {
    const store = await configured({ last_sent_date: "2026-05-04" });
    const out = await runEmailDigestTick({
      store,
      keySecret: KEY_SECRET,
      fetch: okResendFetch(),
      loadSignals: async () => [],
      now: () => new Date("2026-05-04T15:00:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "already_sent_today" });
  });

  it("skips with reason 'not_configured' when api_key/from/to is missing", async () => {
    const out = await runEmailDigestTick({
      store: memStore({
        enabled: true,
        from_email: "from@example.com",
      }),
      keySecret: KEY_SECRET,
      fetch: okResendFetch(),
      loadSignals: async () => [],
      now: () => new Date("2026-05-04T15:00:00.000Z"),
    });
    expect(out).toEqual({ kind: "skipped", reason: "not_configured" });
  });

  it("sends the digest, stamps last_sent_date, and reports recipient + count", async () => {
    const store = await configured();
    const fetchMock = okResendFetch();
    const out = await runEmailDigestTick({
      store,
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      loadSignals: async () => [
        fakeSignal({ kind: "pr_review_requested", title: "Fix bug" }),
        fakeSignal({ id: "sig-2", kind: "mention", title: "@you" }),
      ],
      now: () => new Date("2026-05-04T15:00:00.000Z"),
    });
    expect(out).toEqual({
      kind: "sent",
      recipient: "to@example.com",
      signal_count: 2,
      date: "2026-05-04",
    });
    expect(store.current()?.last_sent_date).toBe("2026-05-04");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not stamp last_sent_date when Resend returns an error", async () => {
    const store = await configured();
    const out = await runEmailDigestTick({
      store,
      keySecret: KEY_SECRET,
      fetch: badResendFetch(500, "boom"),
      loadSignals: async () => [],
      now: () => new Date("2026-05-04T15:00:00.000Z"),
    });
    expect(out.kind).toBe("error");
    expect(store.current()?.last_sent_date).toBeUndefined();
  });

  it("loads signals since the last_sent_date when available", async () => {
    const store = await configured({ last_sent_date: "2026-05-03" });
    const loadSignals = vi.fn(async () => [] as StoredSignal[]);
    await runEmailDigestTick({
      store,
      keySecret: KEY_SECRET,
      fetch: okResendFetch(),
      loadSignals,
      now: () => new Date("2026-05-04T15:00:00.000Z"),
    });
    expect(loadSignals).toHaveBeenCalledWith("2026-05-03T00:00:00.000Z");
  });
});

describe("Postmark transport", () => {
  it("rejects an unknown transport in putEmailDigestSettings", async () => {
    const out = await putEmailDigestSettings(
      { transport: "smtp" },
      { store: memStore(), keySecret: KEY_SECRET },
    );
    expect(out).toMatchObject({ ok: false });
  });

  it("persists transport=postmark and surfaces it on the view", async () => {
    const store = memStore();
    const out = await putEmailDigestSettings(
      {
        transport: "postmark",
        api_key: "pm_token",
        from_email: "from@example.com",
        to_email: "to@example.com",
      },
      { store, keySecret: KEY_SECRET },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.settings.transport).toBe("postmark");
    expect(store.current()?.transport).toBe("postmark");
  });

  it("sends the test email via Postmark with the server token header", async () => {
    const store = memStore();
    await putEmailDigestSettings(
      {
        transport: "postmark",
        api_key: "pm_token_123",
        from_email: "Clearday <noreply@example.com>",
        to_email: "owner@example.com",
      },
      { store, keySecret: KEY_SECRET },
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ MessageID: "abc" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const out = await sendEmailDigestTest({
      store,
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      loadSignals: async () => [],
    });
    expect(out).toEqual({ ok: true });
    const [url, init] = (
      fetchMock as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    expect(url).toBe("https://api.postmarkapp.com/email");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Postmark-Server-Token"]).toBe("pm_token_123");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.From).toBe("Clearday <noreply@example.com>");
    expect(body.To).toBe("owner@example.com");
    expect(body.Subject).toContain("test message");
    expect(body.MessageStream).toBe("outbound");
    expect(body.TextBody).toContain(
      "Postmark transport is configured correctly",
    );
  });

  it("surfaces upstream Postmark errors with the Message field", async () => {
    const store = memStore();
    await putEmailDigestSettings(
      {
        transport: "postmark",
        api_key: "pm_bad",
        from_email: "from@example.com",
        to_email: "to@example.com",
      },
      { store, keySecret: KEY_SECRET },
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ErrorCode: 10,
            Message: "Bad or missing API token",
          }),
          {
            status: 422,
            headers: { "content-type": "application/json" },
          },
        ),
    ) as unknown as typeof fetch;
    const out = await sendEmailDigestTest({
      store,
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      loadSignals: async () => [],
    });
    expect(out).toMatchObject({ ok: false });
    if (out.ok) return;
    expect(out.error).toContain("422");
    expect(out.error).toContain("Bad or missing API token");
  });

  it("runEmailDigestTick routes to Postmark when the row's transport is postmark", async () => {
    const store = memStore({
      enabled: true,
      transport: "postmark",
      from_email: "from@example.com",
      to_email: "to@example.com",
      hour_utc: 13,
    });
    await putEmailDigestSettings(
      { api_key: "pm_real" },
      { store, keySecret: KEY_SECRET },
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ MessageID: "abc" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const out = await runEmailDigestTick({
      store,
      keySecret: KEY_SECRET,
      fetch: fetchMock,
      loadSignals: async () => [],
      now: () => new Date("2026-05-04T15:00:00.000Z"),
    });
    expect(out.kind).toBe("sent");
    const [url] = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    expect(url).toBe("https://api.postmarkapp.com/email");
    expect(store.current()?.last_sent_date).toBe("2026-05-04");
  });
});
