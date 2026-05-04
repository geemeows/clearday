import { describe, expect, it, vi } from "vitest";
import { formatAlertText, sendSlackDm } from "#/lib/alert-channel/slack-dm";
import type { StoredSignal } from "#/lib/signal";

const meeting: StoredSignal = {
  id: "sig-1",
  provider: "google",
  kind: "meeting",
  source_id: "evt-1",
  title: "Standup",
  url: "https://calendar.google.com/event?eid=abc",
  payload: {},
  requires_action: false,
  source_created_at: "2026-05-04T10:00:00Z",
  unread_count: 0,
  created_at: "2026-05-04T09:00:00Z",
  updated_at: "2026-05-04T09:00:00Z",
  dismissed_at: null,
};

describe("formatAlertText", () => {
  it("renders a meeting alert with a 10-min lead and Slack link", () => {
    const text = formatAlertText(meeting);
    expect(text).toContain("Meeting starts in 10 min");
    expect(text).toContain("Standup");
    expect(text).toContain("<https://calendar.google.com/event?eid=abc|Open>");
  });

  it("uses a mention-specific lead and omits the link when absent", () => {
    const text = formatAlertText({
      ...meeting,
      kind: "mention",
      title: "ping in #ops",
      url: null,
    });
    expect(text).toContain("You were mentioned");
    expect(text).toContain("ping in #ops");
    expect(text).not.toContain("Open");
  });
});

describe("sendSlackDm", () => {
  it("calls chat.postMessage with the self user id as channel", async () => {
    const fetchImpl = vi.fn(
      async (
        _url: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await sendSlackDm(meeting, {
      accessToken: "xoxp-abc",
      selfUserId: "U_SELF",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer xoxp-abc",
    );
    const body = JSON.parse((init?.body as string) ?? "{}");
    expect(body.channel).toBe("U_SELF");
    expect(typeof body.text).toBe("string");
    expect(body.text).toContain("Standup");
  });

  it("throws when Slack returns ok:false", async () => {
    const fetchImpl = vi.fn(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({ ok: false, error: "channel_not_found" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    await expect(
      sendSlackDm(meeting, {
        accessToken: "xoxp-abc",
        selfUserId: "U_SELF",
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/channel_not_found/);
  });

  it("throws on non-2xx HTTP", async () => {
    const fetchImpl = vi.fn(
      async (): Promise<Response> => new Response("nope", { status: 500 }),
    );
    await expect(
      sendSlackDm(meeting, {
        accessToken: "xoxp-abc",
        selfUserId: "U_SELF",
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
