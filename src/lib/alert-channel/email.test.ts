import { describe, expect, it, vi } from "vitest";
import { formatAlertEmail, sendEmailAlert } from "#/lib/alert-channel/email";
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

describe("formatAlertEmail", () => {
  it("renders a meeting alert with subject + html link + text fallback", () => {
    const m = formatAlertEmail(meeting);
    expect(m.subject).toBe("Meeting starts in 10 min: Standup");
    expect(m.text).toContain("Meeting starts in 10 min");
    expect(m.text).toContain("Standup");
    expect(m.text).toContain("Open: https://calendar.google.com/event?eid=abc");
    expect(m.html).toContain(
      '<a href="https://calendar.google.com/event?eid=abc">Open</a>',
    );
  });

  it("uses a kind-specific lead and omits the link when absent", () => {
    const m = formatAlertEmail({
      ...meeting,
      kind: "mention",
      title: "ping in #ops",
      url: null,
    });
    expect(m.subject).toBe("You were mentioned: ping in #ops");
    expect(m.text).not.toContain("Open:");
    expect(m.html).not.toContain("<a ");
  });

  it("HTML-escapes title text and quotes inside the href attribute", () => {
    const m = formatAlertEmail({
      ...meeting,
      title: 'PR <"hack">',
      url: 'https://x/?q="a"&b=<c>',
    });
    expect(m.html).toContain('PR &lt;"hack"&gt;');
    expect(m.html).toContain(
      'href="https://x/?q=&quot;a&quot;&amp;b=&lt;c&gt;"',
    );
  });
});

describe("sendEmailAlert", () => {
  it("POSTs to Resend with the formatted message", async () => {
    const fetchMock = vi.fn(
      async (
        _url: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await sendEmailAlert(meeting, {
      apiKey: "re_test",
      from: "alerts@example.com",
      to: "owner@example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer re_test",
    );
    const body = JSON.parse((init?.body as string) ?? "{}");
    expect(body).toMatchObject({
      from: "alerts@example.com",
      to: ["owner@example.com"],
      subject: "Meeting starts in 10 min: Standup",
    });
    expect(body.html).toContain("Standup");
    expect(body.text).toContain("Standup");
  });

  it("throws with Resend error detail when the API rejects the send", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "invalid_from" }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      sendEmailAlert(meeting, {
        apiKey: "re_bad",
        from: "alerts@example.com",
        to: "owner@example.com",
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/resend HTTP 422.*invalid_from/);
  });

  it("throws on a non-JSON 5xx response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("upstream_oops", {
          status: 502,
          headers: { "content-type": "text/plain" },
        }),
    );
    await expect(
      sendEmailAlert(meeting, {
        apiKey: "re_test",
        from: "alerts@example.com",
        to: "owner@example.com",
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/resend HTTP 502.*upstream_oops/);
  });
});
