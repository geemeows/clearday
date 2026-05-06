import { describe, expect, it, vi } from "vitest";
import type { AiSettingsRow } from "#/lib/ai-settings-api";
import {
  buildDraftPrompt,
  draftKindForSignal,
  handleDraftReply,
} from "#/lib/draft-reply-api";
import { encryptSecret } from "#/lib/llm-crypto";
import type { StoredSignal } from "#/shared/signal";

const KEY_SECRET = "deployment-secret-32-bytes-long!!";

function memAiStore(row: AiSettingsRow | null) {
  return {
    load: async () => row,
    save: async (patch: Partial<AiSettingsRow>) => ({
      ...(row ?? ({} as AiSettingsRow)),
      ...patch,
    }),
  };
}

function fakeUsageStore() {
  return {
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => ({
        gte: () => ({
          lt: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };
}

function okFetch(content = "Looks good — small nit on line 3.") {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          model: "gpt-4o-mini",
          usage: { prompt_tokens: 30, completion_tokens: 12 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  ) as unknown as typeof fetch;
}

async function configuredRow(): Promise<AiSettingsRow> {
  const apiKey = await encryptSecret("sk-real", KEY_SECRET);
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    api_key: apiKey,
    base_url: null,
    last_validated_at: null,
    monthly_budget_usd: 25,
    fallback_model: null,
    privacy_mode: false,
    redact_patterns: null,
    ai_disabled: false,
  };
}

const prSignal: StoredSignal = {
  id: "s1",
  provider: "github",
  kind: "pr_review_requested",
  source_id: "owner/repo#42",
  title: "Add cron orchestrator",
  url: "https://github.com/owner/repo/pull/42",
  payload: { repo: "owner/repo", author: "alice" },
  requires_action: true,
  source_created_at: "2026-05-01T10:00:00Z",
  unread_count: 0,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
  dismissed_at: null,
};

const slackSignal: StoredSignal = {
  id: "s2",
  provider: "slack",
  kind: "mention",
  source_id: "C123:1700.0001",
  title: "@you mentioned in #oncall",
  url: "https://slack.com/archives/C123/p1700",
  payload: {
    channel: "oncall",
    channel_type: "channel",
    author: "U999",
    text: "can you take a look at the deploy?",
  },
  requires_action: true,
  source_created_at: "2026-05-01T10:00:00Z",
  unread_count: 0,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
  dismissed_at: null,
};

const meetingSignal: StoredSignal = {
  ...prSignal,
  id: "s3",
  provider: "google",
  kind: "meeting",
  payload: {},
};

describe("draftKindForSignal", () => {
  it("maps GitHub PR signals to pr_comment", () => {
    expect(draftKindForSignal(prSignal)).toBe("pr_comment");
  });

  it("maps Slack mention/dm/thread to slack_reply", () => {
    expect(draftKindForSignal(slackSignal)).toBe("slack_reply");
    expect(draftKindForSignal({ ...slackSignal, kind: "dm" })).toBe(
      "slack_reply",
    );
    expect(draftKindForSignal({ ...slackSignal, kind: "thread_reply" })).toBe(
      "slack_reply",
    );
  });

  it("returns null for unsupported kinds", () => {
    expect(draftKindForSignal(meetingSignal)).toBeNull();
  });
});

describe("buildDraftPrompt", () => {
  it("includes PR repo + author + instruction", () => {
    const messages = buildDraftPrompt(
      "pr_comment",
      prSignal,
      "ask about tests",
    );
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/review comment/i);
    expect(messages[1].content).toContain("Add cron orchestrator");
    expect(messages[1].content).toContain("owner/repo");
    expect(messages[1].content).toContain("@alice");
    expect(messages[1].content).toContain("ask about tests");
  });

  it("includes Slack channel + author + message text", () => {
    const messages = buildDraftPrompt("slack_reply", slackSignal, null);
    expect(messages[0].content).toMatch(/slack reply/i);
    expect(messages[1].content).toContain("#oncall");
    expect(messages[1].content).toContain("<@U999>");
    expect(messages[1].content).toContain("can you take a look");
    expect(messages[1].content).toContain("Draft a brief reply");
  });

  it("uses 'DM' label for IM channel type", () => {
    const dm: StoredSignal = {
      ...slackSignal,
      payload: { ...slackSignal.payload, channel_type: "im" },
    };
    const messages = buildDraftPrompt("slack_reply", dm, null);
    expect(messages[1].content).toContain("Where: DM");
  });
});

describe("handleDraftReply", () => {
  it("rejects a missing signal_id", async () => {
    const out = await handleDraftReply(
      {},
      {
        aiStore: memAiStore(null),
        loadSignal: async () => null,
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(out).toMatchObject({ ok: false, reason: "error" });
  });

  it("returns not_found when the signal is missing", async () => {
    const out = await handleDraftReply(
      { signal_id: "missing" },
      {
        aiStore: memAiStore(await configuredRow()),
        loadSignal: async () => null,
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(out).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns wrong_kind for an unsupported signal kind", async () => {
    const out = await handleDraftReply(
      { signal_id: "s3" },
      {
        aiStore: memAiStore(await configuredRow()),
        loadSignal: async () => meetingSignal,
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(out).toEqual({ ok: false, reason: "wrong_kind" });
  });

  it("returns no_provider when AI settings are missing", async () => {
    const out = await handleDraftReply(
      { signal_id: "s1" },
      {
        aiStore: memAiStore(null),
        loadSignal: async () => prSignal,
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: okFetch(),
      },
    );
    expect(out).toEqual({ ok: false, reason: "no_provider" });
  });

  it("decrypts the key, loads the signal, and returns the draft", async () => {
    const row = await configuredRow();
    const fetchMock = okFetch("Approving — small nit on line 3.");
    const out = await handleDraftReply(
      { signal_id: "s1", instruction: "approve with a small nit" },
      {
        aiStore: memAiStore(row),
        loadSignal: async () => prSignal,
        usageStore: fakeUsageStore(),
        keySecret: KEY_SECRET,
        fetch: fetchMock,
      },
    );
    expect(out).toMatchObject({
      ok: true,
      draft: "Approving — small nit on line 3.",
      kind: "pr_comment",
      provider: "openai",
      model: "gpt-4o-mini",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    expect(
      ((init as RequestInit).headers as Record<string, string>).authorization,
    ).toBe("Bearer sk-real");
  });

  it("surfaces budget_reached when the meter refuses", async () => {
    const row = await configuredRow();
    const usage = {
      from: () => ({
        insert: async () => ({ error: null }),
        select: () => ({
          gte: () => ({
            lt: async () => ({ data: [{ cost_usd: 30 }], error: null }),
          }),
        }),
      }),
    };
    const fetchMock = okFetch();
    const out = await handleDraftReply(
      { signal_id: "s1" },
      {
        aiStore: memAiStore(row),
        loadSignal: async () => prSignal,
        usageStore: usage,
        keySecret: KEY_SECRET,
        fetch: fetchMock,
      },
    );
    expect(out).toEqual({ ok: false, reason: "budget_reached" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
