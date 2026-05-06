// Slack provider — cron-polled DM/mention/thread-reply Signals plus
// post-reply / load-thread / list-channels capabilities.

import type { Provider } from "#/features/integrations/provider";
import {
  type ListSlackChannelsResult,
  listSlackChannels,
} from "#/features/integrations/providers/slack/capabilities/list-channels";
import {
  type LoadSlackThreadParams,
  type LoadSlackThreadResult,
  loadSlackThread,
} from "#/features/integrations/providers/slack/capabilities/load-thread";
import {
  type PostSlackReplyParams,
  type PostSlackReplyResult,
  postSlackReply,
} from "#/features/integrations/providers/slack/capabilities/post-reply";
import { exchangeSlack } from "#/features/integrations/providers/slack/oauth";
import { pollSlackSignals } from "#/features/integrations/providers/slack/poll";
import {
  loadSlackState,
  type SlackDelta,
  type SlackState,
  saveSlackState,
} from "#/features/integrations/providers/slack/state";
import { AUTHORIZE_PROVIDERS } from "#/shared/oauth/scopes";

export type SlackCapabilities = {
  postReply: (
    params: PostSlackReplyParams,
    deps: { fetch: typeof fetch; token: string | null },
  ) => Promise<PostSlackReplyResult>;
  loadThread: (
    params: LoadSlackThreadParams,
    deps: { fetch: typeof fetch; token: string | null },
    selfUserId?: string | null,
  ) => Promise<LoadSlackThreadResult>;
  listChannels: (deps: {
    fetch: typeof fetch;
    token: string | null;
  }) => Promise<ListSlackChannelsResult>;
};

export type {
  PostSlackReplyParams,
  PostSlackReplyResult,
  LoadSlackThreadParams,
  LoadSlackThreadResult,
  ListSlackChannelsResult,
  SlackState,
  SlackDelta,
};

export const slack: Provider<SlackState, SlackDelta, SlackCapabilities> = {
  id: "slack",
  authorize: AUTHORIZE_PROVIDERS.slack,
  exchange: (code, env, fetchImpl) => exchangeSlack(code, env, fetchImpl),
  refresh: null,
  loadState: (deps) => {
    if (!deps.account.account_id) {
      throw new Error(
        "slack account_id missing — cannot scan history for self mentions",
      );
    }
    return loadSlackState({
      supabase: deps.supabase,
      accountId: deps.account.account_id,
    });
  },
  poll: async (token, ctx, state) => {
    const result = await pollSlackSignals(
      token,
      state.accountId,
      async (url, init) => ctx.fetch(url, init),
      {
        participatedThreads: state.threads,
        broadcastChannels: state.allowlist,
        now: ctx.now,
      },
    );
    return {
      signals: result.signals,
      delta: { discoveredThreads: result.discoveredThreads },
    };
  },
  saveState: (deps, delta) => saveSlackState(deps, delta),
  capabilities: {
    postReply: (params, deps) => postSlackReply(params, deps),
    loadThread: (params, deps, selfUserId) =>
      loadSlackThread(params, deps, selfUserId),
    listChannels: (deps) => listSlackChannels(deps),
  },
};
