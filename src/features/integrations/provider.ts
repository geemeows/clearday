// The Provider seam. Every third-party source (GitHub, Google, Slack, Linear,
// Jira) is one module exporting a Provider<S, D, C> object. The cron
// orchestrator iterates the registry and calls the same uniform interface;
// per-provider quirks live behind loadState / poll / saveState / capabilities.
//
// See CONTEXT.md → "Provider" and "Capability".

import type {
  ExchangeEnv,
  FetchLike,
  RefreshedToken,
  TokenRecord,
} from "#/features/integrations/oauth/types";
import type { SupabaseLike } from "#/shared/db";
import type { AuthorizeProviderConfig } from "#/shared/oauth/scopes";
import type { Signal, SignalProvider } from "#/shared/signal";

export type ProviderId = SignalProvider;

export type {
  AuthorizeProviderConfig,
  ExchangeEnv,
  FetchLike,
  RefreshedToken,
  TokenRecord,
};

export type ProviderHealthStatus = "ok" | "rate_limited" | "auth_failed";

/** Read-side context every provider's poll receives. */
export type PollCtx = {
  fetch: typeof fetch;
  now: Date;
};

/** Per-call context every capability receives. */
export type CapabilityCtx = {
  fetch: typeof fetch;
  accessToken: string;
};

/**
 * Per-account row passed to the orchestrator and into loadState/saveState so
 * provider modules can read fields like `account_id` without leaking the row
 * shape into every consumer.
 */
export type ProviderAccountRow = {
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  /** Provider-side user id (e.g. Slack `authed_user.id`). Required for the
   *  Slack poll's `<@self>` query; unused by other providers. */
  account_id?: string | null;
};

/** Storage + account context for loadState / saveState. */
export type StateDeps = {
  supabase: SupabaseLike;
  account: ProviderAccountRow;
};

/**
 * Uniform return shape for capabilities. Matches today's slack-reply,
 * pr-review, calendar-actions outputs ({ ok: true, ... } | { ok: false, error }).
 */
export type Result<T, E extends string = string> =
  | { ok: true; value: T }
  | { ok: false; error: E; message?: string };

/**
 * The provider interface.
 *
 *  S — per-provider state loaded before each poll (e.g. Slack's
 *      `participated_threads`, broadcast allowlist, account_id). `void` for
 *      providers that need none.
 *  D — per-poll state delta written back after each poll (e.g. Slack's
 *      newly-discovered participated threads). `void` when there's nothing
 *      to persist.
 *  C — capabilities map (user-initiated write actions like postReply,
 *      submitPrReview, decline). Defaults to no capabilities.
 */
export type Provider<
  S = void,
  D = void,
  C extends Record<string, unknown> = Record<string, never>,
> = {
  id: ProviderId;

  authorize: AuthorizeProviderConfig;

  exchange: (
    code: string,
    env: ExchangeEnv,
    fetchImpl: FetchLike,
  ) => Promise<TokenRecord>;

  /** `null` for providers that don't issue refresh tokens (e.g. GitHub PAT-style). */
  refresh:
    | null
    | ((
        refreshToken: string,
        env: ExchangeEnv,
        fetchImpl: FetchLike,
      ) => Promise<RefreshedToken>);

  loadState?: (deps: StateDeps) => Promise<S>;

  poll: (
    accessToken: string,
    ctx: PollCtx,
    state: S,
  ) => Promise<{ signals: Signal[]; delta: D }>;

  saveState?: (deps: StateDeps, delta: D) => Promise<void>;

  capabilities: C;

  /**
   * Provider-specific HTTP error → health classification. The orchestrator
   * falls back to a status-code-based default when this is omitted.
   */
  classifyError?: (err: unknown) => ProviderHealthStatus | undefined;
};

/** Default classifier — used when a provider doesn't override `classifyError`. */
export function defaultClassifyError(
  err: unknown,
): ProviderHealthStatus | undefined {
  const status = (err as { status?: unknown })?.status;
  if (typeof status !== "number") return undefined;
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 429) return "rate_limited";
  return undefined;
}
