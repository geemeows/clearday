import { describe, expect, it } from "vitest";
import {
  normalizeSlackEvent,
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
