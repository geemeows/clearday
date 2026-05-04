// Pure module behind /api/data/* endpoints.
//
// Three concerns:
//  - exportData: gather a deterministic JSON dump of signals + rollups
//    + user preferences + slack allowlist + inbox rules + ai settings
//    (without secrets) so the user can back up or migrate their instance.
//  - purgeData: typed-confirmation guarded delete-all of signals + rollups.
//  - get/putRetention: read/write the retention_days override on the
//    singleton user_preferences row.
//
// All Supabase access is injected so the module stays free of supabase-js
// imports and is unit-testable in isolation.

export type SignalRow = Record<string, unknown>;
export type RollupRow = Record<string, unknown>;
export type RuleRow = Record<string, unknown>;
export type AllowlistRow = Record<string, unknown>;

export type ExportPayload = {
  exported_at: string;
  signals: SignalRow[];
  signal_rollups: RollupRow[];
  inbox_rules: RuleRow[];
  slack_channel_allowlist: AllowlistRow[];
  user_preferences: Record<string, unknown> | null;
  ai_settings: Record<string, unknown> | null;
};

export type ExportDeps = {
  loadSignals: () => Promise<SignalRow[]>;
  loadRollups: () => Promise<RollupRow[]>;
  loadInboxRules: () => Promise<RuleRow[]>;
  loadSlackAllowlist: () => Promise<AllowlistRow[]>;
  loadUserPreferences: () => Promise<Record<string, unknown> | null>;
  loadAiSettings: () => Promise<Record<string, unknown> | null>;
  now?: () => Date;
};

// Fields stripped from ai_settings before export — never leak the
// encrypted API key (or its presence) outside the user's worker.
const AI_SECRET_FIELDS = new Set(["api_key"]);

function stripSecrets(
  row: Record<string, unknown> | null,
  secrets: Set<string>,
): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (secrets.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function exportData(deps: ExportDeps): Promise<ExportPayload> {
  const [signals, rollups, rules, allowlist, prefs, ai] = await Promise.all([
    deps.loadSignals(),
    deps.loadRollups(),
    deps.loadInboxRules(),
    deps.loadSlackAllowlist(),
    deps.loadUserPreferences(),
    deps.loadAiSettings(),
  ]);
  const now = deps.now?.() ?? new Date();
  return {
    exported_at: now.toISOString(),
    signals,
    signal_rollups: rollups,
    inbox_rules: rules,
    slack_channel_allowlist: allowlist,
    user_preferences: prefs,
    ai_settings: stripSecrets(ai, AI_SECRET_FIELDS),
  };
}

export const PURGE_CONFIRMATION = "DELETE";

export type PurgeDeps = {
  purgeSignals: () => Promise<number>;
  purgeRollups: () => Promise<number>;
};

export type PurgeBody = { confirmation?: unknown };

export async function purgeData(
  body: PurgeBody,
  deps: PurgeDeps,
): Promise<
  | { ok: true; deleted: { signals: number; signal_rollups: number } }
  | { ok: false; error: string }
> {
  if (body.confirmation !== PURGE_CONFIRMATION) {
    return {
      ok: false,
      error: `confirmation must be the literal string "${PURGE_CONFIRMATION}"`,
    };
  }
  const [signals, rollups] = await Promise.all([
    deps.purgeSignals(),
    deps.purgeRollups(),
  ]);
  return { ok: true, deleted: { signals, signal_rollups: rollups } };
}

export type RetentionView = { retention_days: number };

export const DEFAULT_RETENTION_DAYS = 90;
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 3650;

export type RetentionStore = {
  load: () => Promise<RetentionView>;
  save: (patch: RetentionView) => Promise<RetentionView>;
};

export type RetentionPutBody = { retention_days?: unknown };

export async function getRetention(
  store: RetentionStore,
): Promise<RetentionView> {
  return store.load();
}

export async function putRetention(
  body: RetentionPutBody,
  store: RetentionStore,
): Promise<
  { ok: true; retention: RetentionView } | { ok: false; error: string }
> {
  const v = body.retention_days;
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    return { ok: false, error: "retention_days must be an integer" };
  }
  if (v < MIN_RETENTION_DAYS || v > MAX_RETENTION_DAYS) {
    return {
      ok: false,
      error: `retention_days must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
    };
  }
  const retention = await store.save({ retention_days: v });
  return { ok: true, retention };
}
