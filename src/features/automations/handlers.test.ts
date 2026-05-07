import { describe, expect, it, vi } from "vitest";
import {
  type Automation,
  type AutomationAction,
} from "#/features/automations/engine";
import {
  type AutomationRunInsert,
  type AutomationRunsStore,
  type ExecuteCtx,
} from "#/features/automations/executor";
import { createAutomationHandler } from "#/features/automations/handlers";
import { runAutomationsForInsertedSignals } from "#/features/automations/orchestrator";
import type { Signal, StoredSignal } from "#/shared/signal";

function memoryRunsStore(): AutomationRunsStore & {
  rows: AutomationRunInsert[];
} {
  const rows: AutomationRunInsert[] = [];
  return {
    rows,
    insertIfNew: async (row) => {
      if (
        rows.find(
          (r) =>
            r.automation_id === row.automation_id &&
            r.trigger_event_id === row.trigger_event_id,
        )
      )
        return false;
      rows.push(row);
      return true;
    },
  };
}

function makeStored(overrides: Partial<StoredSignal> = {}): StoredSignal {
  return {
    id: "sig-1",
    provider: "github",
    kind: "pr_authored",
    source_id: "pr-1",
    title: "feat: add knobs",
    url: "https://github.com/x/y/pull/1",
    payload: { repo: "x/y", number: 1, author: "alice" },
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

function makeCtx(signal: Signal | null): ExecuteCtx {
  return {
    signalId: signal ? "sig-1" : null,
    triggerEventId: "sig-1:t",
    signal,
    internalActionsAppliedByUpsert: false,
  };
}

describe("createAutomationHandler — post_message", () => {
  it("renders the body via templating and routes to slackPost with the configured channel", async () => {
    const slackPost = vi.fn(async () => ({
      ok: true as const,
      ts: "111.222",
      channel: "C-CHAN",
    }));
    const handler = createAutomationHandler({ slackPost });
    const action: AutomationAction = {
      type: "post_message",
      target: "channel",
      channel: "C-CHAN",
      body: "PR {{signal.title}} from {{signal.payload.author}}",
    };
    const out = await handler(action, makeCtx(makeStored()));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.ref).toEqual({ channel: "C-CHAN", ts: "111.222" });
    expect(slackPost).toHaveBeenCalledWith({
      channel: "C-CHAN",
      text: "PR feat: add knobs from alice",
      thread_ts: undefined,
    });
  });

  it("self_dm target routes to the configured self-DM channel", async () => {
    const slackPost = vi.fn(async () => ({
      ok: true as const,
      ts: "1",
      channel: "D-SELF",
    }));
    const handler = createAutomationHandler({
      slackPost,
      slackSelfDm: "D-SELF",
    });
    const out = await handler(
      {
        type: "post_message",
        target: "self_dm",
        body: "back online",
      },
      makeCtx(null),
    );
    expect(out.ok).toBe(true);
    expect(slackPost).toHaveBeenCalledWith({
      channel: "D-SELF",
      text: "back online",
      thread_ts: undefined,
    });
  });

  it("thread_reply target derives channel + thread_ts from the Slack signal payload", async () => {
    const slackPost = vi.fn(async () => ({
      ok: true as const,
      ts: "2",
      channel: "C-T",
    }));
    const handler = createAutomationHandler({ slackPost });
    const slackSignal = makeStored({
      provider: "slack",
      kind: "mention",
      payload: { channel: "C-T", thread_ts: "999.000", text: "hey" },
    });
    const out = await handler(
      {
        type: "post_message",
        target: "thread_reply",
        body: "heads-down",
      },
      makeCtx(slackSignal),
    );
    expect(out.ok).toBe(true);
    expect(slackPost).toHaveBeenCalledWith({
      channel: "C-T",
      text: "heads-down",
      thread_ts: "999.000",
    });
  });

  it("returns failed when the slackPost capability rejects", async () => {
    const slackPost = vi.fn(async () => ({
      ok: false as const,
      error: "channel_not_found",
      reason: "api_error" as const,
    }));
    const handler = createAutomationHandler({ slackPost });
    const out = await handler(
      {
        type: "post_message",
        target: "channel",
        channel: "C-X",
        body: "hi",
      },
      makeCtx(makeStored()),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("channel_not_found");
  });
});

describe("createAutomationHandler — comment_on_pr", () => {
  it("derives repo + number from the triggering signal payload by default", async () => {
    const commentOnPr = vi.fn(async () => ({
      ok: true as const,
      comment_id: 7,
    }));
    const handler = createAutomationHandler({ github: { commentOnPr } });
    const out = await handler(
      {
        type: "comment_on_pr",
        body: "{{signal.title}}",
      },
      makeCtx(makeStored()),
    );
    expect(out.ok).toBe(true);
    expect(commentOnPr).toHaveBeenCalledWith({
      repo: "x/y",
      number: 1,
      body: "feat: add knobs",
    });
  });

  it("uses the action's repo + number when pinned", async () => {
    const commentOnPr = vi.fn(async () => ({
      ok: true as const,
      comment_id: 8,
    }));
    const handler = createAutomationHandler({ github: { commentOnPr } });
    await handler(
      {
        type: "comment_on_pr",
        repo: "other/repo",
        number: 99,
        body: "static body",
      },
      makeCtx(makeStored({ payload: {} })),
    );
    expect(commentOnPr).toHaveBeenCalledWith({
      repo: "other/repo",
      number: 99,
      body: "static body",
    });
  });

  it("fails when neither action nor signal carries a repo", async () => {
    const commentOnPr = vi.fn();
    const handler = createAutomationHandler({ github: { commentOnPr } });
    const out = await handler(
      {
        type: "comment_on_pr",
        body: "hi",
      },
      makeCtx(makeStored({ payload: {} })),
    );
    expect(out.ok).toBe(false);
    expect(commentOnPr).not.toHaveBeenCalled();
  });

  it("returns failed when the capability rejects", async () => {
    const commentOnPr = vi.fn(async () => ({
      ok: false as const,
      error: "github HTTP 404",
      reason: "api_error" as const,
    }));
    const handler = createAutomationHandler({ github: { commentOnPr } });
    const out = await handler(
      { type: "comment_on_pr", body: "hi" },
      makeCtx(makeStored()),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("github HTTP 404");
  });
});

describe("createAutomationHandler — request_reviewers", () => {
  it("forwards reviewers + team_reviewers to the capability and uses signal repo/number", async () => {
    const requestReviewers = vi.fn(async () => ({
      ok: true as const,
      requested: { users: ["alice"], teams: [] },
    }));
    const handler = createAutomationHandler({
      github: { requestReviewers },
    });
    const out = await handler(
      {
        type: "request_reviewers",
        reviewers: ["alice"],
        team_reviewers: ["platform"],
      },
      makeCtx(makeStored()),
    );
    expect(out.ok).toBe(true);
    expect(requestReviewers).toHaveBeenCalledWith({
      repo: "x/y",
      number: 1,
      reviewers: ["alice"],
      team_reviewers: ["platform"],
    });
  });
});

// End-to-end: a signal_ingested trigger flows through the orchestrator and
// fires a Slack post_message via the handler. Mocks the Slack capability at
// the boundary; nothing else stubbed.
describe("orchestrator + post_message handler — end-to-end", () => {
  it("posts a templated Slack message when a matching pr_authored Signal lands", async () => {
    const slackPost = vi.fn(async () => ({
      ok: true as const,
      ts: "1700.111",
      channel: "C-REV",
    }));
    const automation: Automation = {
      id: "pr-review-post",
      name: "PR review post",
      enabled: true,
      priority: 1,
      trigger_kind: "signal_ingested",
      predicates: [
        { type: "provider", provider: "github" },
        { type: "kind", kind: "pr_authored" },
      ],
      actions: [
        {
          type: "post_message",
          target: "channel",
          channel: "C-REV",
          body: "Review me: {{signal.title}} {{signal.url}}",
        },
      ],
    };
    const store = memoryRunsStore();
    const handler = createAutomationHandler({ slackPost });
    const out = await runAutomationsForInsertedSignals(
      [makeStored()],
      [automation],
      store,
      { handler, internalActionsAppliedByUpsert: false },
    );
    expect(out[0].results[0].status).toBe("succeeded");
    expect(slackPost).toHaveBeenCalledTimes(1);
    expect(slackPost).toHaveBeenCalledWith({
      channel: "C-REV",
      text: "Review me: feat: add knobs https://github.com/x/y/pull/1",
      thread_ts: undefined,
    });
    expect(store.rows[0].status).toBe("succeeded");
    expect(store.rows[0].actions_executed[0].ref).toEqual({
      channel: "C-REV",
      ts: "1700.111",
    });
  });
});
