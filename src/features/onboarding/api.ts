// Pure module behind /api/onboarding/{status,complete} and the
// /api/providers/:name/connect-url endpoint. Everything that touches the DB
// or env is injected so the module is testable without Supabase or wrangler.

export type OnboardingStatus = {
  onboarded_at: string | null;
  providers_connected: number;
  auth_proxy_url: string | null;
};

export type OnboardingDeps = {
  loadOnboardedAt: () => Promise<string | null>;
  countConnectedProviders: () => Promise<number>;
  authProxyUrl: string | null;
};

export type CompleteDeps = {
  setOnboardedAt: (iso: string) => Promise<void>;
  now?: () => Date;
};

export async function getOnboardingStatus(
  deps: OnboardingDeps,
): Promise<OnboardingStatus> {
  const [onboarded_at, providers_connected] = await Promise.all([
    deps.loadOnboardedAt(),
    deps.countConnectedProviders(),
  ]);
  return {
    onboarded_at,
    providers_connected,
    auth_proxy_url: deps.authProxyUrl,
  };
}

export async function completeOnboarding(
  deps: CompleteDeps,
): Promise<{ ok: true; onboarded_at: string }> {
  const iso = (deps.now?.() ?? new Date()).toISOString();
  await deps.setOnboardedAt(iso);
  return { ok: true, onboarded_at: iso };
}

// Soft gate verdict consumed by /today. `onboarded_at` non-null is the
// source of truth for "completion"; the PRD's nominal `onboarding_completed`
// boolean would be redundant given the existing column.
//
// - `showBanner` → render the "finish onboarding" banner on /today.
// - `autoComplete` → flip onboarded_at to now() (criterion: ≥1 provider
//   connected). Callers are expected to POST /api/onboarding/complete and
//   stop showing the banner afterwards.
export type GateVerdict = {
  showBanner: boolean;
  autoComplete: boolean;
};

export function decideOnboardingGate(
  status: Pick<OnboardingStatus, "onboarded_at" | "providers_connected">,
): GateVerdict {
  const completed = status.onboarded_at != null;
  if (completed) return { showBanner: false, autoComplete: false };
  if (status.providers_connected >= 1)
    return { showBanner: false, autoComplete: true };
  return { showBanner: true, autoComplete: false };
}

const ALLOWED_PROVIDERS = ["github", "slack", "google", "linear", "jira"];

export function buildConnectUrl(
  provider: string,
  authProxyUrl: string | null,
  userBackendUrl: string | null = null,
  /**
   * When supplied, signals re-auth of the named local account row rather
   * than a fresh add. Plumbed through to the auth-proxy as a query param so
   * the proxy can surface a "reconnect this identity" hint. Without it,
   * `/start/:provider` always begins a fresh OAuth dance and creates a new
   * account row on callback.
   */
  accountId: string | null = null,
): { ok: true; url: string } | { ok: false; error: string } {
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return { ok: false, error: "unknown provider" };
  }
  if (!authProxyUrl) {
    return { ok: false, error: "auth-proxy not configured" };
  }
  const base = `${authProxyUrl.replace(/\/$/, "")}/start/${provider}`;
  if (!userBackendUrl && !accountId) return { ok: true, url: base };
  const url = new URL(base);
  if (userBackendUrl) url.searchParams.set("backend", userBackendUrl);
  if (accountId) url.searchParams.set("account_id", accountId);
  return { ok: true, url: url.toString() };
}
