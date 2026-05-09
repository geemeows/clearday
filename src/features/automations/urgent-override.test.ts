import { describe, expect, it, vi } from "vitest";
import type { DispatcherDeps } from "#/features/alerts/dispatcher";
import { processUrgentReactions } from "#/features/automations/urgent-override";
import type {
  SlackFetch,
  UrgentReactionEvent,
} from "#/features/integrations/providers/slack/poll";
import { pollSlackReactionsForPosts } from "#/features/integrations/providers/slack/poll";
import type { StoredSignal } from "#/shared/signal";

function makeStoredSignal(overrides: Partial<StoredSignal> = {}): StoredSignal {
  return {
    id: "sig-slack-1",
    provider: "slack",
    kind: "dm",
    source_id: "C-1:1700.000",
    title: "is the deploy broken?",
    url: null,
    payload: {
      channel: "C-1",
      ts: "1700.000",
      thread_ts: "1700.000",
      author: "U2",
      text: "is the deploy broken?",
    },
    requires_action: true,
    source_created_at: "2026-05-04T10:00:00.000Z",
    unread_count: 0,
    created_at: "2026-05-04T10:00:00.000Z",
    updated_at: "2026-05-04T10:00:00.000Z",
    dismissed_at: null,
    priority: null,
    snoozed_until: null,
    alert_channels_override: null,
    tags: null,
    ...overrides,
  };
}

function alertDeps(overrides: Partial<DispatcherDeps> = {}): DispatcherDeps & {
  capturedAt: () => StoredSignal[];
} {
  const captured: StoredSignal[] = [];
  const slackSender = vi.fn(async (signal: StoredSignal) => {
    captured.push(signal);
  });
  const deps: DispatcherDeps = {
    loadPreferences: async () => ({
      enabledChannels: ["slack_dm", "web_push"],
      matrix: { dm: ["slack_dm", "web_push"] },
      quietHours: {
        enabled: false,
        days: [],
        start: "22:00",
        end: "08:00",
        utc_offset_minutes: 0,
        allow_through: [],
      },
      focusBlock: {
        enabled: false,
        allow_mentions: true,
        allow_imminent_meeting_minutes: 0,
      },
    }),
    loadFocusContext: async () => ({ active: false, endsAt: null }),
    recordIdempotency: async () => ({ alreadyRecorded: false }),
    enqueueDelivery: async () => {},
    channels: { slack_dm: slackSender, web_push: slackSender },
    ...overrides,
  };
  return Object.assign(deps, { capturedAt: () => captured });
}

describe("pollSlackReactionsForPosts (issue #94)", () => {
  it("emits one urgent reaction event per 🚨 reactor on each post", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        message: {
          reactions: [
            { name: "rotating_light", users: ["U2", "U3"] },
            { name: "tada", users: ["U4"] },
          ],
        },
      }),
      text: async () => "",
    })) as unknown as SlackFetch;
    const events = await pollSlackReactionsForPosts("tok", fetchImpl, [
      { channel: "C-1", ts: "1700.500", signal_id: "sig-slack-1" },
    ]);
    expect(events).toEqual([
      {
        channel: "C-1",
        message_ts: "1700.500",
        reaction: "rotating_light",
        reactor: "U2",
        signal_id: "sig-slack-1",
      },
      {
        channel: "C-1",
        message_ts: "1700.500",
        reaction: "rotating_light",
        reactor: "U3",
        signal_id: "sig-slack-1",
      },
    ]);
  });

  it("emits nothing when no urgent reactions are present", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        message: { reactions: [{ name: "thumbsup", users: ["U2"] }] },
      }),
      text: async () => "",
    })) as unknown as SlackFetch;
    const events = await pollSlackReactionsForPosts("tok", fetchImpl, [
      { channel: "C-1", ts: "1700.500", signal_id: "sig-slack-1" },
    ]);
    expect(events).toEqual([]);
  });

  it("returns an empty list when posts is empty without making any HTTP calls", async () => {
    const fetchImpl = vi.fn();
    const events = await pollSlackReactionsForPosts(
      "tok",
      fetchImpl as unknown as SlackFetch,
      [],
    );
    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("processUrgentReactions — end-to-end reaction → alert dispatch", () => {
  it("re-enters the alerts dispatcher with priority=high and fires the user's enabled channels", async () => {
    const stored = makeStoredSignal();
    const deps = alertDeps();
    const events: UrgentReactionEvent[] = [
      {
        channel: "C-1",
        message_ts: "1700.500",
        reaction: "rotating_light",
        reactor: "U2",
        signal_id: stored.id,
      },
    ];
    const out = await processUrgentReactions(events, {
      loadSignal: async () => stored,
      alerts: deps,
    });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("dispatched");
    const fired = deps.capturedAt();
    expect(fired).toHaveLength(2);
    expect(fired[0].id).toBe(stored.id);
    expect(fired[0].priority).toBe("high");
  });

  it("dedupes within a batch on signal_id so multiple reactors trigger one re-alert", async () => {
    const stored = makeStoredSignal();
    const loadSignal = vi.fn(async () => stored);
    const deps = alertDeps();
    const events: UrgentReactionEvent[] = [
      {
        channel: "C-1",
        message_ts: "1700.500",
        reaction: "rotating_light",
        reactor: "U2",
        signal_id: stored.id,
      },
      {
        channel: "C-1",
        message_ts: "1700.500",
        reaction: "siren",
        reactor: "U3",
        signal_id: stored.id,
      },
    ];
    const out = await processUrgentReactions(events, {
      loadSignal,
      alerts: deps,
    });
    expect(out).toHaveLength(1);
    expect(loadSignal).toHaveBeenCalledTimes(1);
  });

  it("skips when the originating Signal can't be loaded (deleted / dismissed)", async () => {
    const deps = alertDeps();
    const events: UrgentReactionEvent[] = [
      {
        channel: "C-1",
        message_ts: "1700.500",
        reaction: "rotating_light",
        reactor: "U2",
        signal_id: "missing-sig",
      },
    ];
    const out = await processUrgentReactions(events, {
      loadSignal: async () => null,
      alerts: deps,
    });
    expect(out).toEqual([
      { signal_id: "missing-sig", status: "skipped_unknown_signal" },
    ]);
    expect(deps.capturedAt()).toEqual([]);
  });

  it("end-to-end: Slack reaction poll → urgent override → alert channels fired", async () => {
    const stored = makeStoredSignal();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        message: {
          reactions: [{ name: "rotating_light", users: ["U2"] }],
        },
      }),
      text: async () => "",
    })) as unknown as SlackFetch;
    const events = await pollSlackReactionsForPosts("tok", fetchImpl, [
      { channel: "C-1", ts: "1700.500", signal_id: stored.id },
    ]);
    const deps = alertDeps();
    const out = await processUrgentReactions(events, {
      loadSignal: async () => stored,
      alerts: deps,
    });
    expect(out[0].status).toBe("dispatched");
    const fired = deps.capturedAt();
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].priority).toBe("high");
  });
});
