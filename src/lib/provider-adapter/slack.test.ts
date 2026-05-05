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

  it("calls search.messages once for the self-mention query and once for is:dm with bearer auth", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, messages: { matches: [] } }),
    );
    await pollSlackSignals(SELF, "U_SELF", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const calls = fetchImpl.mock.calls as unknown as Array<
      [string, { method: string; headers: Record<string, string> }]
    >;
    const queries = calls.map((c) => c[0]);
    expect(
      queries.some((q) =>
        q.includes(`query=${encodeURIComponent("<@U_SELF>")}`),
      ),
    ).toBe(true);
    expect(
      queries.some((q) => q.includes(`query=${encodeURIComponent("is:dm")}`)),
    ).toBe(true);
    for (const [url, init] of calls) {
      expect(url).toContain("https://slack.com/api/search.messages");
      expect(init.method).toBe("GET");
      expect(init.headers.authorization).toBe(`Bearer ${SELF}`);
    }
  });

  it("normalizes mention matches into Signals with the shared identity rule", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("is%3Adm")
        ? jsonResponse({ ok: true, messages: { matches: [] } })
        : jsonResponse({
            ok: true,
            messages: {
              matches: [
                {
                  type: "message",
                  user: "U_OTHER",
                  channel: { id: "C1", name: "general" },
                  ts: "1714820000.000100",
                  text: "<@U_SELF> can you take a look?",
                  team: "T1",
                },
              ],
            },
          }),
    );
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

  it("uses thread_ts as the identity anchor so a reply folds into the parent row", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("is%3Adm")
        ? jsonResponse({ ok: true, messages: { matches: [] } })
        : jsonResponse({
            ok: true,
            messages: {
              matches: [
                {
                  type: "message",
                  user: "U_OTHER",
                  channel: { id: "C1" },
                  ts: "1714820100.000200",
                  thread_ts: "1714820000.000100",
                  text: "<@U_SELF> ping",
                },
              ],
            },
          }),
    );
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out[0]?.source_id).toBe("C1:1714820000.000100");
  });

  it("drops mention matches authored by self and matches that don't contain the self mention", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("is%3Adm")
        ? jsonResponse({ ok: true, messages: { matches: [] } })
        : jsonResponse({
            ok: true,
            messages: {
              matches: [
                {
                  type: "message",
                  user: "U_SELF",
                  channel: { id: "C1" },
                  ts: "1.0",
                  text: "<@U_SELF> note to self",
                },
                {
                  type: "message",
                  user: "U_OTHER",
                  channel: { id: "C1" },
                  ts: "2.0",
                  text: "no mention here",
                },
              ],
            },
          }),
    );
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(0);
  });

  it("normalizes is:dm matches into dm Signals (no <@self> required, channel_type=im)", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("is%3Adm")
        ? jsonResponse({
            ok: true,
            messages: {
              matches: [
                {
                  type: "message",
                  user: "U_OTHER",
                  channel: { id: "D1" },
                  ts: "1714820500.000100",
                  text: "hey, got a sec?",
                  team: "T1",
                },
              ],
            },
          })
        : jsonResponse({ ok: true, messages: { matches: [] } }),
    );
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

  it("drops is:dm matches authored by self", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("is%3Adm")
        ? jsonResponse({
            ok: true,
            messages: {
              matches: [
                {
                  type: "message",
                  user: "U_SELF",
                  channel: { id: "D1" },
                  ts: "1.0",
                  text: "note to self",
                },
              ],
            },
          })
        : jsonResponse({ ok: true, messages: { matches: [] } }),
    );
    const out = await pollSlackSignals("token", "U_SELF", fetchImpl);
    expect(out).toHaveLength(0);
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
