// GitHub provider — read-side cron-polled review-requested / authored /
// assigned PRs, plus the submitPrReview capability.

import type { Provider } from "#/features/integrations/provider";
import {
  type PrReviewEvent,
  type SubmitPrReviewParams,
  type SubmitPrReviewResult,
  submitPrReview,
} from "#/features/integrations/providers/github/capabilities/submit-pr-review";
import { pollGithubSignals } from "#/features/integrations/providers/github/poll";
import { exchangeGithub } from "#/lib/oauth-exchange";
import { AUTHORIZE_PROVIDERS } from "#/shared/oauth/scopes";

export type GithubCapabilities = {
  submitPrReview: (
    params: SubmitPrReviewParams,
    deps: { fetch: typeof fetch; token: string | null },
  ) => Promise<SubmitPrReviewResult>;
};

export type { PrReviewEvent, SubmitPrReviewParams, SubmitPrReviewResult };

export const github: Provider<void, void, GithubCapabilities> = {
  id: "github",
  authorize: AUTHORIZE_PROVIDERS.github,
  exchange: (code, env, fetchImpl) => exchangeGithub(code, env, fetchImpl),
  refresh: null,
  poll: async (token, ctx) => {
    const signals = await pollGithubSignals(token, async (url, init) =>
      ctx.fetch(url, init),
    );
    return { signals, delta: undefined };
  },
  capabilities: {
    submitPrReview: (params, deps) => submitPrReview(params, deps),
  },
};
