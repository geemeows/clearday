import { describe, expect, it, vi } from "vitest";
import {
  normalizeSlackEvent,
  pollSlackSignals,
  type SlackEventPayload,
  type SlackNormalizeContext,
  threadKey,
} from "#/lib/provider-adapter/slack";

const SELF = "U_SELF";

const ctx = (
  overrides: Partial<SlackNormalizeContext> = {},
): SlackNormalizeContext => ({
  selfUserId: SELF,
  broadcastAllowlist: new Set(),
  participatedThreads: new Set(),
  teamId: "T1",
  ...overrides,
});

const baseMessage: SlackEventPayload = {
  type: "message",
  user: "U_OTHER",
  channel: "C_GENERAL",
  channel_type: "channel",
  ts: "1714820000.000100",
  text: "hello world",
  team: "T1",
};

describe("normalizeSlackEvent", () => {
  it("creates a DM Signal for an `im` channel message", () => {
    const sig = normalizeSlackEvent(
      { ...baseMessage, channel_type: "im", channel: "D_DIRECT" },
      ctx(),
    );
    expect(sig).not.toBeNull();
    expect(sig).toMatchObject({
      provider: "slack",
      kind: "dm",
      source_id: "D_DIRECT:1714820000.000100",
      requires_action: true,
    });
    expect(sig?.payload).toMatchObject({
      author: "U_OTHER",
      channel_type: "im",
    });
  });

  it("creates a mention Signal when text contains <@self>", () => {
    const sig = normalizeSlackEvent(
      { ...baseMessage, text: `hey <@${SELF}> can you look?` },
      ctx(),
    );
    expect(sig?.kind).toBe("mention");
    expect(sig?.requires_action).toBe(true);
  });

  it("creates a mention Signal for app_mention events", () => {
    const sig = normalizeSlackEvent(
      { ...baseMessage, type: "app_mention" },
      ctx(),
    );
    expect(sig?.kind).toBe("mention");
  });

  it("captures @here only when channel is in the allowlist", () => {
    const event = { ...baseMessage, text: "<!here> ship it" };
    expect(normalizeSlackEvent(event, ctx())).toBeNull();
    const channel = baseMessage.channel as string;
    const allowed = ctx({ broadcastAllowlist: new Set([channel]) });
    expect(normalizeSlackEvent(event, allowed)?.kind).toBe("mention");
  });

  it("creates a thread_reply Signal only when the user is in the thread", () => {
    const event: SlackEventPayload = {
      ...baseMessage,
      ts: "1714820500.000200",
      thread_ts: "1714820000.000100",
    };
    expect(normalizeSlackEvent(event, ctx())).toBeNull();
    const channel = baseMessage.channel as string;
    const sig = normalizeSlackEvent(
      event,
      ctx({
        participatedThreads: new Set([threadKey(channel, "1714820000.000100")]),
      }),
    );
    expect(sig?.kind).toBe("thread_reply");
    // Folds into the parent's row.
    expect(sig?.source_id).toBe("C_GENERAL:1714820000.000100");
  });

  it("ignores messages from the user themself", () => {
    expect(
      normalizeSlackEvent(
        { ...baseMessage, user: SELF, channel_type: "im", channel: "D" },
        ctx(),
      ),
    ).toBeNull();
  });

  it("ignores bot messages and message edits/deletes", () => {
    expect(
      normalizeSlackEvent({ ...baseMessage, bot_id: "B1" }, ctx()),
    ).toBeNull();
    expect(
      normalizeSlackEvent(
        { ...baseMessage, subtype: "message_changed" },
        ctx(),
      ),
    ).toBeNull();
  });

  it("builds a slack deep-link from team + channel + thread anchor", () => {
    const sig = normalizeSlackEvent(
      { ...baseMessage, channel_type: "im", channel: "D1" },
      ctx({ teamId: "TEAM" }),
    );
    expect(sig?.url).toBe(
      "https://app.slack.com/client/TEAM/D1/thread/D1-1714820000.000100",
    );
  });

  it("truncates very long titles to 140 chars", () => {
    const longText = "a".repeat(300);
    const sig = normalizeSlackEvent(
      { ...baseMessage, channel_type: "im", channel: "D1", text: longText },
      ctx(),
    );
    expect(sig?.title.length).toBe(140);
    expect(sig?.title.endsWith("…")).toBe(true);
  });
});

describe("pollSlackSignals", () => {
  function jsonResponse(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }

  type ConvFixtures = {
    channels?: Array<{ id: string; is_archived?: boolean }>;
    ims?: Array<{ id: string }>;
    history?: Record<string, unknown[]>;
    replies?: Record<string, unknown[]>;
  };

  function buildFetch(fx: ConvFixtures) {
    return vi.fn(async (url: string) => {
      if (url.includes("users.conversations")) {
        if (/types=im(&|$)/.test(url)) {
          return jsonResponse({ ok: true, channels: fx.ims ?? [] });
        }
        return jsonResponse({ ok: true, channels: fx.channels ?? [] });
      }
      if (url.includes("conversations.history")) {
        const m = url.match(/channel=([^&]+)/);
        const ch = m ? decodeURIComponent(m[1]!) : "";
        return jsonResponse({ ok: true, messages: fx.history?.[ch] ?? [] });
      }
      if (url.includes("conversations.replies")) {
        const m = url.match(/channel=([^&]+)/);
        const ts = url.match(/ts=([^&]+)/);
        const key = `${m ? decodeURIComponent(m[1]!) : ""}:${
          ts ? decodeURIComponent(ts[1]!) : ""
        }`;
        return jsonResponse({ ok: true, messages: fx.replies?.[key] ?? [] });
      }
      return jsonResponse({ ok: false, error: `unexpected ${url}` });
    });
  }

  it("lists the user's channels + DMs and scans conversations.history with an oldest cutoff", async () => {
    const now = new Date("2026-05-05T00:00:00Z");
    const fetchImpl = buildFetch({
      channels: [{ id: "C1" }],
      ims: [{ id: "D1" }],
      history: { C1: [], D1: [] },
    });
    await pollSlackSignals("tok", "U_SELF", fetchImpl, {
      now,
      historyWindowSec: 120,
    });
    const calls = (
      fetchImpl.mock.calls as unknown as Array<[string, unknown]>
    ).map((c) => c[0]);
    expect(
      calls.some((u) => u.includes("users.conversations") && u.includes("im")),
    ).toBe(true);
    expect(
      calls.some(
        (u) =>
          u.includes("users.conversations") && u.includes("public_channel"),
      ),
    ).toBe(true);
    const expectedOldest = (now.getTime() / 1000 - 120).toFixed(6);
    const histories = calls.filter((u) => u.includes("conversations.history"));
    expect(histories.length).toBe(2);
    for (const u of histories) {
      expect(u).toContain(`oldest=${encodeURIComponent(expectedOldest)}`);
    }
  });

  it("emits a mention Signal for a channel message containing <@self>", async () => {
    const fetchImpl = buildFetch({
      channels: [{ id: "C1" }],
      history: {
        C1: [
          {
            type: "message",
            user: "U_OTHER",
            ts: "1714820000.000100",
            text: "<@U_SELF> can you take a look?",
            team: "T1",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      provider: "slack",
      kind: "mention",
      source_id: "C1:1714820000.000100",
      requires_action: true,
    });
    expect(out[0]?.payload).toMatchObject({
      channel: "C1",
      author: "U_OTHER",
      team: "T1",
    });
    expect(out[0]?.url).toBe(
      "https://app.slack.com/client/T1/C1/thread/C1-1714820000.000100",
    );
  });

  it("anchors a reply to the parent's thread_ts so it folds into the parent row", async () => {
    const fetchImpl = buildFetch({
      channels: [{ id: "C1" }],
      history: {
        C1: [
          {
            type: "message",
            user: "U_OTHER",
            ts: "1714820100.000200",
            thread_ts: "1714820000.000100",
            text: "<@U_SELF> ping",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out[0]?.source_id).toBe("C1:1714820000.000100");
  });

  it("drops channel messages authored by self and messages without a self mention", async () => {
    const fetchImpl = buildFetch({
      channels: [{ id: "C1" }],
      history: {
        C1: [
          {
            type: "message",
            user: "U_SELF",
            ts: "1.0",
            text: "<@U_SELF> note to self",
          },
          {
            type: "message",
            user: "U_OTHER",
            ts: "2.0",
            text: "ordinary chatter",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(0);
  });

  it("emits a dm Signal for every non-self message in an im channel", async () => {
    const fetchImpl = buildFetch({
      ims: [{ id: "D1" }],
      history: {
        D1: [
          {
            type: "message",
            user: "U_OTHER",
            ts: "1714820500.000100",
            text: "hey, got a sec?",
            team: "T1",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      provider: "slack",
      kind: "dm",
      source_id: "D1:1714820500.000100",
      requires_action: true,
    });
    expect(out[0]?.payload).toMatchObject({
      channel: "D1",
      channel_type: "im",
      author: "U_OTHER",
    });
  });

  it("drops dm messages authored by self", async () => {
    const fetchImpl = buildFetch({
      ims: [{ id: "D1" }],
      history: {
        D1: [
          {
            type: "message",
            user: "U_SELF",
            ts: "1.0",
            text: "note to self",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(0);
  });

  it("calls conversations.replies for each participated thread and emits thread_reply Signals for non-self replies", async () => {
    const fetchImpl = buildFetch({
      replies: {
        "C1:1714820000.000100": [
          {
            type: "message",
            user: "U_SELF",
            ts: "1714820000.000100",
            thread_ts: "1714820000.000100",
            text: "I'll look into this",
            team: "T1",
          },
          {
            type: "message",
            user: "U_OTHER",
            ts: "1714820500.000200",
            thread_ts: "1714820000.000100",
            text: "thanks!",
            team: "T1",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl, {
      participatedThreads: [{ channel: "C1", thread_ts: "1714820000.000100" }],
    });
    const repliesCall = (fetchImpl.mock.calls as unknown as Array<[string]>)
      .map((c) => c[0])
      .find((u) => u.includes("conversations.replies"));
    expect(repliesCall).toBeDefined();
    expect(repliesCall).toContain(`channel=${encodeURIComponent("C1")}`);
    expect(repliesCall).toContain(
      `ts=${encodeURIComponent("1714820000.000100")}`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      provider: "slack",
      kind: "thread_reply",
      source_id: "C1:1714820000.000100",
      requires_action: false,
    });
    expect(out[0]?.payload).toMatchObject({
      channel: "C1",
      author: "U_OTHER",
      thread_ts: "1714820000.000100",
      text: "thanks!",
    });
  });

  it("drops thread replies authored by self and the parent message itself", async () => {
    const fetchImpl = buildFetch({
      replies: {
        "C1:1714820000.000100": [
          {
            type: "message",
            user: "U_SELF",
            ts: "1714820000.000100",
            thread_ts: "1714820000.000100",
            text: "parent",
          },
          {
            type: "message",
            user: "U_SELF",
            ts: "1714820500.000200",
            thread_ts: "1714820000.000100",
            text: "self reply",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl, {
      participatedThreads: [{ channel: "C1", thread_ts: "1714820000.000100" }],
    });
    expect(out).toHaveLength(0);
  });

  it("picks the latest non-self reply when a thread has many", async () => {
    const fetchImpl = buildFetch({
      replies: {
        "C1:1714820000.000100": [
          {
            type: "message",
            user: "U_OTHER",
            ts: "1714820100.000200",
            thread_ts: "1714820000.000100",
            text: "first reply",
          },
          {
            type: "message",
            user: "U_OTHER",
            ts: "1714820900.000300",
            thread_ts: "1714820000.000100",
            text: "newest reply",
          },
          {
            type: "message",
            user: "U_OTHER",
            ts: "1714820500.000400",
            thread_ts: "1714820000.000100",
            text: "middle reply",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl, {
      participatedThreads: [{ channel: "C1", thread_ts: "1714820000.000100" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe("newest reply");
  });

  it("does not call conversations.replies when no participated threads are supplied", async () => {
    const fetchImpl = buildFetch({});
    await pollSlackSignals("token", "U_SELF", fetchImpl);
    const urls = (fetchImpl.mock.calls as unknown as Array<[string]>).map(
      (c) => c[0],
    );
    expect(urls.every((u) => !u.includes("conversations.replies"))).toBe(true);
  });

  it("emits a mention Signal for @here / @channel posts only when the channel is in the broadcast allowlist", async () => {
    const broadcastMessages = [
      {
        type: "message",
        user: "U_OTHER",
        ts: "1714820000.000100",
        text: "<!here> deploy starting now",
        team: "T1",
      },
      {
        type: "message",
        user: "U_OTHER",
        ts: "1714820100.000200",
        text: "ordinary chatter",
        team: "T1",
      },
    ];
    // Allowlisted: emits a mention.
    const allowedFetch = buildFetch({
      channels: [{ id: "C_ANNOUNCE" }],
      history: { C_ANNOUNCE: broadcastMessages },
    });
    const allowedOut = await pollSlackSignals("token", "U_SELF", allowedFetch, {
      broadcastChannels: ["C_ANNOUNCE"],
    });
    expect(allowedOut).toHaveLength(1);
    expect(allowedOut[0]).toMatchObject({
      provider: "slack",
      kind: "mention",
      source_id: "C_ANNOUNCE:1714820000.000100",
      requires_action: true,
    });
    expect(allowedOut[0]?.payload).toMatchObject({
      channel: "C_ANNOUNCE",
      author: "U_OTHER",
      text: "<!here> deploy starting now",
    });

    // Not allowlisted: broadcast token alone doesn't fire.
    const deniedFetch = buildFetch({
      channels: [{ id: "C_ANNOUNCE" }],
      history: { C_ANNOUNCE: broadcastMessages },
    });
    const deniedOut = await pollSlackSignals("token", "U_SELF", deniedFetch);
    expect(deniedOut).toHaveLength(0);
  });

  it("drops history entries authored by self, by bots, or with non-broadcast / non-mention text", async () => {
    const fetchImpl = buildFetch({
      channels: [{ id: "C_ANNOUNCE" }],
      history: {
        C_ANNOUNCE: [
          {
            type: "message",
            user: "U_SELF",
            ts: "1.0",
            text: "<!here> from self",
          },
          {
            type: "message",
            user: "U_OTHER",
            bot_id: "B1",
            ts: "2.0",
            text: "<!channel> from bot",
          },
          {
            type: "message",
            user: "U_OTHER",
            ts: "3.0",
            text: "no broadcast token",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl, {
      broadcastChannels: ["C_ANNOUNCE"],
    });
    expect(out).toHaveLength(0);
  });

  it("skips archived channels returned by users.conversations", async () => {
    const fetchImpl = buildFetch({
      channels: [{ id: "C_ARCHIVED", is_archived: true }],
      history: {
        C_ARCHIVED: [
          {
            type: "message",
            user: "U_OTHER",
            ts: "1.0",
            text: "<@U_SELF>",
          },
        ],
      },
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(0);
    const urls = (fetchImpl.mock.calls as unknown as Array<[string]>).map(
      (c) => c[0],
    );
    expect(urls.every((u) => !u.includes("conversations.history"))).toBe(true);
  });

  it("resolves author user-ids to display names via users.info and attaches author_name", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("users.conversations")) {
        const isIm = /types=im(&|$)/.test(url);
        return jsonResponse({
          ok: true,
          channels: isIm ? [{ id: "D1" }] : [],
        });
      }
      if (url.includes("conversations.history")) {
        return jsonResponse({
          ok: true,
          messages: [
            {
              type: "message",
              user: "U_OTHER",
              ts: "1.0",
              text: "hi",
            },
          ],
        });
      }
      if (url.includes("users.info")) {
        expect(url).toContain(`user=${encodeURIComponent("U_OTHER")}`);
        return jsonResponse({
          ok: true,
          user: {
            real_name: "Babyyy McUser",
            profile: { display_name: "babyyy" },
          },
        });
      }
      return jsonResponse({ ok: true });
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(1);
    expect(out[0]?.payload.author_name).toBe("babyyy");
  });

  it("falls back to <@id> rendering when users.info fails (best-effort)", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("users.conversations")) {
        const isIm = /types=im(&|$)/.test(url);
        return jsonResponse({
          ok: true,
          channels: isIm ? [{ id: "D1" }] : [],
        });
      }
      if (url.includes("conversations.history")) {
        return jsonResponse({
          ok: true,
          messages: [
            { type: "message", user: "U_OTHER", ts: "1.0", text: "hi" },
          ],
        });
      }
      if (url.includes("users.info")) {
        return jsonResponse({ ok: false, error: "user_not_found" });
      }
      return jsonResponse({ ok: true });
    });
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(1);
    expect(out[0]?.payload.author_name).toBeUndefined();
    expect(out[0]?.payload.author).toBe("U_OTHER");
  });

  it("throws on non-2xx HTTP", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "ratelimited" }, 429),
    );
    await expect(
      pollSlackSignals("token", "U_SELF", fetchImpl),
    ).rejects.toThrow(/slack poll failed/);
  });

  it("throws when the body is `ok: false`", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: false, error: "invalid_auth" }),
    );
    await expect(
      pollSlackSignals("token", "U_SELF", fetchImpl),
    ).rejects.toThrow(/invalid_auth/);
  });
});
