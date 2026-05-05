// Pure module behind /api/self-host GET and /api/self-host/health POST.
//
// The Self-host settings sub-page surfaces information a deployment owner
// needs to keep their instance running and to back it up: the public Worker
// URL, Supabase URL, Worker version, an env-var checklist (presence only,
// never values), and a "Run health check" action that pings Supabase.
//
// Pure so the env shape and supabase client are injected; trivially
// testable without a live Worker / DB.

export const REQUIRED_ENV_VARS = [
  "ALLOWED_EMAIL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STATE_HMAC_SECRET",
  "AUTH_PROXY_URL",
  "AI_KEY_SECRET",
] as const;

export const OPTIONAL_ENV_VARS = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];
export type OptionalEnvVar = (typeof OPTIONAL_ENV_VARS)[number];
export type KnownEnvVar = RequiredEnvVar | OptionalEnvVar;

export type SelfHostEnv = Partial<Record<KnownEnvVar, string>> & {
  WORKER_VERSION?: string;
};

export type EnvVarStatus = {
  name: KnownEnvVar;
  present: boolean;
  required: boolean;
};

export type SelfHostInfo = {
  worker_url: string | null;
  supabase_url: string | null;
  auth_proxy_url: string | null;
  worker_version: string;
  env_vars: EnvVarStatus[];
};

export const DEFAULT_WORKER_VERSION = "dev";

export function getSelfHostInfo(
  env: SelfHostEnv,
  workerUrl: string | null,
): SelfHostInfo {
  const envVars: EnvVarStatus[] = [
    ...REQUIRED_ENV_VARS.map((name) => ({
      name,
      present: hasValue(env[name]),
      required: true,
    })),
    ...OPTIONAL_ENV_VARS.map((name) => ({
      name,
      present: hasValue(env[name]),
      required: false,
    })),
  ];
  return {
    worker_url: workerUrl ?? null,
    supabase_url: env.SUPABASE_URL ?? null,
    auth_proxy_url: env.AUTH_PROXY_URL ?? null,
    worker_version: env.WORKER_VERSION?.trim() || DEFAULT_WORKER_VERSION,
    env_vars: envVars,
  };
}

function hasValue(v: string | undefined): boolean {
  return typeof v === "string" && v.length > 0;
}

export type HealthCheck = { name: string; ok: boolean; detail?: string };

export type HealthCheckResult = {
  ok: boolean;
  checks: HealthCheck[];
};

export type HealthCheckDeps = {
  env: SelfHostEnv;
  pingDatabase: () => Promise<{ ok: boolean; error?: string }>;
};

export async function runHealthCheck(
  deps: HealthCheckDeps,
): Promise<HealthCheckResult> {
  const checks: HealthCheck[] = [];
  for (const name of REQUIRED_ENV_VARS) {
    const present = hasValue(deps.env[name]);
    checks.push({
      name: `env:${name}`,
      ok: present,
      detail: present ? undefined : "missing required env var",
    });
  }
  const db = await safe(deps.pingDatabase);
  checks.push({
    name: "supabase",
    ok: db.ok,
    detail: db.ok ? undefined : (db.error ?? "unreachable"),
  });
  return { ok: checks.every((c) => c.ok), checks };
}

async function safe(
  fn: () => Promise<{ ok: boolean; error?: string }>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await fn();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
