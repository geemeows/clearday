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

const ALLOWED_PROVIDERS = ["github", "slack", "google", "linear", "jira"];

export function buildConnectUrl(
  provider: string,
  authProxyUrl: string | null,
  userBackendUrl: string | null = null,
): { ok: true; url: string } | { ok: false; error: string } {
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return { ok: false, error: "unknown provider" };
  }
  if (!authProxyUrl) {
    return { ok: false, error: "auth-proxy not configured" };
  }
  const base = `${authProxyUrl.replace(/\/$/, "")}/start/${provider}`;
  if (!userBackendUrl) return { ok: true, url: base };
  const url = new URL(base);
  url.searchParams.set("backend", userBackendUrl);
  return { ok: true, url: url.toString() };
}
