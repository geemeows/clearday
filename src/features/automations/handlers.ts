// Action handler factory. Routes external automation actions through the
// matching provider Capability surface — Slack `chat.postMessage`, GitHub
// Issue Comments, GitHub `requested_reviewers`. Pure against the injected
// capability functions; the worker plumbs real fetch + tokens, tests pass
// mocked capabilities.
//
// Internal actions (dismiss / snooze / tag / set_priority / set_channels) and
// the deferred `transition_ticket` are handled by the executor's default
// internal handler — this factory only covers external actions.

import type { AutomationAction } from "#/features/automations/engine";
import type {
  ActionHandler,
  ExecuteCtx,
  ExecutedAction,
} from "#/features/automations/executor";
import { renderTemplate } from "#/features/automations/templating";
import type {
  CommentOnPrParams,
  CommentOnPrResult,
} from "#/features/integrations/providers/github/capabilities/comment-on-pr";
import type {
  RequestReviewersParams,
  RequestReviewersResult,
} from "#/features/integrations/providers/github/capabilities/request-reviewers";
import type {
  PostSlackReplyParams,
  PostSlackReplyResult,
} from "#/features/integrations/providers/slack/capabilities/post-reply";
import type { Signal } from "#/shared/signal";

export type SlackPostFn = (
  params: PostSlackReplyParams,
) => Promise<PostSlackReplyResult>;

export type CommentOnPrFn = (
  params: CommentOnPrParams,
) => Promise<CommentOnPrResult>;

export type RequestReviewersFn = (
  params: RequestReviewersParams,
) => Promise<RequestReviewersResult>;

export type SetFocusFn = (params: {
  duration_minutes: number;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

export type AutomationHandlerDeps = {
  /** Slack `chat.postMessage` capability. */
  slackPost?: SlackPostFn;
  /** Self-DM channel id used when target = self_dm (e.g. user's own DM id). */
  slackSelfDm?: string;
  github?: {
    commentOnPr?: CommentOnPrFn;
    requestReviewers?: RequestReviewersFn;
  };
  setFocus?: SetFocusFn;
};

export function createAutomationHandler(
  deps: AutomationHandlerDeps,
): ActionHandler {
  return async (action, ctx) => dispatch(action, ctx, deps);
}

async function dispatch(
  action: AutomationAction,
  ctx: ExecuteCtx,
  deps: AutomationHandlerDeps,
): Promise<ExecutedAction> {
  switch (action.type) {
    case "post_message":
      return await runPostMessage(action, ctx, deps);
    case "comment_on_pr":
      return await runCommentOnPr(action, ctx, deps);
    case "request_reviewers":
      return await runRequestReviewers(action, ctx, deps);
    case "set_focus": {
      if (!deps.setFocus) {
        return { type: action.type, ok: true };
      }
      const out = await deps.setFocus({
        duration_minutes: action.duration_minutes,
      });
      return out.ok
        ? { type: action.type, ok: true }
        : { type: action.type, ok: false, error: out.error };
    }
    default:
      // Internal / deferred actions — the executor handles them via the
      // default internal handler / capability short-circuit, but this
      // function is also installed as the universal handler in some tests,
      // so be safe and stamp them as ok.
      return { type: action.type, ok: true };
  }
}

async function runPostMessage(
  action: AutomationAction & { type: "post_message" },
  ctx: ExecuteCtx,
  deps: AutomationHandlerDeps,
): Promise<ExecutedAction> {
  if (!deps.slackPost) {
    return {
      type: action.type,
      ok: false,
      error: "slack capability not configured",
    };
  }
  const body = ctx.signal
    ? renderTemplate(action.body, ctx.signal)
    : action.body;
  const resolved = resolveSlackTarget(action, ctx, deps);
  if (!resolved.ok) {
    return { type: action.type, ok: false, error: resolved.error };
  }
  const result = await deps.slackPost({
    channel: resolved.channel,
    text: body,
    thread_ts: resolved.thread_ts,
  });
  if (!result.ok) {
    return { type: action.type, ok: false, error: result.error };
  }
  return {
    type: action.type,
    ok: true,
    ref: { channel: result.channel, ts: result.ts },
  };
}

function resolveSlackTarget(
  action: AutomationAction & { type: "post_message" },
  ctx: ExecuteCtx,
  deps: AutomationHandlerDeps,
):
  | { ok: true; channel: string; thread_ts?: string }
  | { ok: false; error: string } {
  if (action.target === "channel") {
    if (!action.channel) {
      return { ok: false, error: "post_message: channel required" };
    }
    return { ok: true, channel: action.channel };
  }
  if (action.target === "self_dm") {
    if (!deps.slackSelfDm) {
      return { ok: false, error: "post_message: self_dm not configured" };
    }
    return { ok: true, channel: deps.slackSelfDm };
  }
  // thread_reply — only valid for Slack signal triggers; the channel + thread
  // ts come from the triggering Signal's payload.
  if (!ctx.signal) {
    return {
      ok: false,
      error: "post_message: thread_reply requires a Slack signal",
    };
  }
  const payload = ctx.signal.payload as Record<string, unknown> | null;
  const channel = stringField(payload, "channel");
  const threadTs =
    stringField(payload, "thread_ts") ?? stringField(payload, "ts");
  if (!channel || !threadTs) {
    return {
      ok: false,
      error: "post_message: signal payload missing channel or thread_ts",
    };
  }
  return { ok: true, channel, thread_ts: threadTs };
}

async function runCommentOnPr(
  action: AutomationAction & { type: "comment_on_pr" },
  ctx: ExecuteCtx,
  deps: AutomationHandlerDeps,
): Promise<ExecutedAction> {
  if (!deps.github?.commentOnPr) {
    return {
      type: action.type,
      ok: false,
      error: "github commentOnPr capability not configured",
    };
  }
  const body = ctx.signal
    ? renderTemplate(action.body, ctx.signal)
    : action.body;
  const target = resolvePrTarget(action.repo, action.number, ctx.signal);
  if (!target.ok) {
    return { type: action.type, ok: false, error: target.error };
  }
  const result = await deps.github.commentOnPr({
    repo: target.repo,
    number: target.number,
    body,
  });
  if (!result.ok) {
    return { type: action.type, ok: false, error: result.error };
  }
  return {
    type: action.type,
    ok: true,
    ref: {
      repo: target.repo,
      number: target.number,
      comment_id: result.comment_id,
    },
  };
}

async function runRequestReviewers(
  action: AutomationAction & { type: "request_reviewers" },
  ctx: ExecuteCtx,
  deps: AutomationHandlerDeps,
): Promise<ExecutedAction> {
  if (!deps.github?.requestReviewers) {
    return {
      type: action.type,
      ok: false,
      error: "github requestReviewers capability not configured",
    };
  }
  const target = resolvePrTarget(action.repo, action.number, ctx.signal);
  if (!target.ok) {
    return { type: action.type, ok: false, error: target.error };
  }
  const result = await deps.github.requestReviewers({
    repo: target.repo,
    number: target.number,
    reviewers: action.reviewers,
    team_reviewers: action.team_reviewers,
  });
  if (!result.ok) {
    return { type: action.type, ok: false, error: result.error };
  }
  return {
    type: action.type,
    ok: true,
    ref: {
      repo: target.repo,
      number: target.number,
      requested: result.requested,
    },
  };
}

function resolvePrTarget(
  repoOverride: string | undefined,
  numberOverride: number | undefined,
  signal: Signal | null,
): { ok: true; repo: string; number: number } | { ok: false; error: string } {
  const payload = signal?.payload as Record<string, unknown> | null | undefined;
  const repo = repoOverride ?? stringField(payload, "repo");
  const number =
    numberOverride ??
    (() => {
      const raw = (payload as Record<string, unknown> | undefined)?.number;
      return typeof raw === "number" && Number.isInteger(raw) && raw > 0
        ? raw
        : undefined;
    })();
  if (!repo) {
    return {
      ok: false,
      error: "no repo on action and signal.payload.repo missing",
    };
  }
  if (!number) {
    return {
      ok: false,
      error: "no PR number on action and signal.payload.number missing",
    };
  }
  return { ok: true, repo, number };
}

function stringField(
  obj: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
