// Worker-side glue between the pure alert-dispatcher / channel modules and
// Supabase + Slack. Loads runtime state (preferences, Slack token,
// active focus block) and turns idempotency / queue inserts into the
// dispatcher's `alreadyRecorded` / `enqueueDelivery` contracts.

import { sendEmailAlert } from "#/lib/alert-channel/email";
import { sendSlackDm } from "#/lib/alert-channel/slack-dm";
import { sendWebPush } from "#/lib/alert-channel/web-push";
import type {
  AlertChannel,
  AlertThreshold,
  DispatcherDeps,
} from "#/lib/alert-dispatcher";
import { dispatchAlert } from "#/lib/alert-dispatcher";
import type { EmailDigestRow } from "#/lib/email-digest-api";
import { decryptSecret } from "#/lib/llm-crypto";
import {
  DEFAULT_FOCUS_BLOCK,
  DEFAULT_MATRIX,
  DEFAULT_QUIET_HOURS,
  type FocusBlockContext,
  type FocusBlockSettings,
  type NotificationMatrix,
  type NotificationPrefs,
  type QuietHoursWindow,
} from "#/lib/quiet-hours";
import type { Signal, StoredSignal } from "#/lib/signal";
import type { VapidConfig } from "#/lib/web-push-vapid";

const KNOWN_CHANNELS: AlertChannel[] = [
  "slack_dm",
  "web_push",
  "email",
  "desktop",
];

// biome-ignore lint/suspicious/noExplicitAny: thin Supabase client surface
type Service = any;

export function buildDispatcherDeps(
  service: Service,
  fetchImpl: typeof fetch,
  vapid?: VapidConfig | null,
  emailKeySecret?: string | null,
): DispatcherDeps {
  return {
    loadPreferences: () => loadNotificationPrefs(service),
    loadFocusContext: () => loadFocusContext(service),
    recordIdempotency: async (signalId, threshold, channels) => {
      const { error } = await service.from("signal_alerts").insert({
        signal_id: signalId,
        threshold,
        channels,
      });
      if (!error) return { alreadyRecorded: false };
      const code = (error as { code?: string }).code;
      if (code === "23505") return { alreadyRecorded: true };
      throw new Error(error.message);
    },
    enqueueDelivery: async (signalId, threshold, channels, deliverAt) => {
      const { error } = await service.from("signal_alert_queue").upsert(
        {
          signal_id: signalId,
          threshold,
          channels,
          deliver_at: deliverAt.toISOString(),
        },
        { onConflict: "signal_id,threshold" },
      );
      if (error) throw new Error(error.message);
    },
    channels: {
      slack_dm: async (signal: StoredSignal) => {
        const { data, error } = await service
          .from("provider_accounts")
          .select("access_token, account_id")
          .eq("provider", "slack")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data?.access_token || !data?.account_id) {
          throw new Error("slack provider account not connected");
        }
        await sendSlackDm(signal, {
          accessToken: data.access_token as string,
          selfUserId: data.account_id as string,
          fetch: fetchImpl,
        });
      },
      ...(emailKeySecret
        ? {
            email: async (signal: StoredSignal) => {
              const { data, error } = await service
                .from("user_preferences")
                .select("email_digest")
                .eq("id", true)
                .maybeSingle();
              if (error) throw new Error(error.message);
              const row = (data?.email_digest as EmailDigestRow | null) ?? null;
              if (!row?.api_key || !row?.from_email || !row?.to_email) {
                throw new Error("email channel not configured");
              }
              const apiKey = await decryptSecret(row.api_key, emailKeySecret);
              await sendEmailAlert(signal, {
                apiKey,
                from: row.from_email,
                to: row.to_email,
                transport: row.transport ?? "resend",
                fetch: fetchImpl,
              });
            },
          }
        : {}),
      ...(vapid
        ? {
            web_push: async (signal: StoredSignal) => {
              await sendWebPush(signal, {
                vapid,
                fetch: fetchImpl,
                loadSubscriptions: async () => {
                  const { data, error } = await service
                    .from("web_push_subscriptions")
                    .select("id, endpoint, p256dh, auth");
                  if (error) throw new Error(error.message);
                  return (
                    (data ?? []) as Array<{
                      id: string;
                      endpoint: string;
                      p256dh: string;
                      auth: string;
                    }>
                  ).map((r) => ({
                    id: r.id,
                    endpoint: r.endpoint,
                    p256dh: r.p256dh,
                    auth: r.auth,
                  }));
                },
                removeSubscription: async (id) => {
                  const { error } = await service
                    .from("web_push_subscriptions")
                    .delete()
                    .eq("id", id);
                  if (error) throw new Error(error.message);
                },
                stampDelivered: async (ids, at) => {
                  const { error } = await service
                    .from("web_push_subscriptions")
                    .update({ last_delivered_at: at.toISOString() })
                    .in("id", ids);
                  if (error) throw new Error(error.message);
                },
              });
            },
          }
        : {}),
    },
  };
}

async function loadNotificationPrefs(
  service: Service,
): Promise<NotificationPrefs> {
  const { data, error } = await service
    .from("user_preferences")
    .select("alert_channels, notification_matrix, quiet_hours_v2, focus_block")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data?.alert_channels ?? []) as string[];
  const enabledChannels = raw.filter((c): c is AlertChannel =>
    (KNOWN_CHANNELS as string[]).includes(c),
  );
  const matrix = sanitizeMatrix(data?.notification_matrix);
  const quietHours = sanitizeQuietHours(data?.quiet_hours_v2);
  const focusBlock = sanitizeFocusBlock(data?.focus_block);
  return { enabledChannels, matrix, quietHours, focusBlock };
}

async function loadFocusContext(service: Service): Promise<FocusBlockContext> {
  const nowIso = new Date().toISOString();
  // Calendar focus events become regular meeting Signals; we mark them with
  // payload.is_focus when ingesting (focusTime eventType or
  // extendedProperties.private.clearday_focus from focus-session) and fall
  // back to a "focus" title regex for events created elsewhere. For v1, we
  // look for any active meeting Signal with starts_at <= now < ends_at.
  const { data, error } = await service
    .from("signals")
    .select("payload, title")
    .eq("kind", "meeting")
    .is("dismissed_at", null)
    .order("source_created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    payload: Record<string, unknown> | null;
    title: string | null;
  }>;
  const now = Date.parse(nowIso);
  let endsAt: Date | null = null;
  for (const row of rows) {
    const startsAt = row.payload?.starts_at;
    const endsAtRaw = row.payload?.ends_at;
    if (typeof startsAt !== "string" || typeof endsAtRaw !== "string") continue;
    const start = Date.parse(startsAt);
    const end = Date.parse(endsAtRaw);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (start > now || end <= now) continue;
    const isFocus =
      row.payload?.is_focus === true ||
      (typeof row.title === "string" && /focus/i.test(row.title));
    if (!isFocus) continue;
    endsAt = new Date(end);
    break;
  }
  return { active: endsAt !== null, endsAt };
}

function sanitizeMatrix(value: unknown): NotificationMatrix {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_MATRIX;
  }
  const out: NotificationMatrix = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const cs = v.filter(
      (c): c is AlertChannel =>
        typeof c === "string" && (KNOWN_CHANNELS as string[]).includes(c),
    );
    out[k as keyof NotificationMatrix] = cs;
  }
  // Merge with defaults so any kind missing from the user's row still has a
  // sensible default. The user's explicit choices win.
  return { ...DEFAULT_MATRIX, ...out };
}

function sanitizeQuietHours(value: unknown): QuietHoursWindow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_QUIET_HOURS;
  }
  const v = value as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    days: Array.isArray(v.days)
      ? v.days
          .filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
          .slice(0, 7)
      : DEFAULT_QUIET_HOURS.days,
    start: typeof v.start === "string" ? v.start : DEFAULT_QUIET_HOURS.start,
    end: typeof v.end === "string" ? v.end : DEFAULT_QUIET_HOURS.end,
    utc_offset_minutes:
      typeof v.utc_offset_minutes === "number" ? v.utc_offset_minutes : 0,
    allow_through: Array.isArray(v.allow_through)
      ? (v.allow_through.filter(
          (r) => r && typeof r === "object",
        ) as QuietHoursWindow["allow_through"])
      : [],
  };
}

function sanitizeFocusBlock(value: unknown): FocusBlockSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_FOCUS_BLOCK;
  }
  const v = value as Record<string, unknown>;
  return {
    enabled:
      typeof v.enabled === "boolean" ? v.enabled : DEFAULT_FOCUS_BLOCK.enabled,
    allow_mentions:
      typeof v.allow_mentions === "boolean"
        ? v.allow_mentions
        : DEFAULT_FOCUS_BLOCK.allow_mentions,
    allow_imminent_meeting_minutes:
      typeof v.allow_imminent_meeting_minutes === "number"
        ? v.allow_imminent_meeting_minutes
        : DEFAULT_FOCUS_BLOCK.allow_imminent_meeting_minutes,
  };
}

/**
 * Resolve an upserted Signal back to its StoredSignal row (we need the id
 * for idempotency) and dispatch the "new" threshold.
 */
export async function dispatchUpsertedSignal(
  signal: Signal,
  service: Service,
  dispatcher: DispatcherDeps,
): Promise<void> {
  const stored = await fetchSignalRow(signal, service);
  if (!stored) return;
  await dispatchAlert(stored, "new", dispatcher);
}

export async function loadUpcomingMeetings(
  service: Service,
): Promise<StoredSignal[]> {
  const { data, error } = await service
    .from("signals")
    .select("*")
    .eq("kind", "meeting")
    .is("dismissed_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as StoredSignal[];
}

/**
 * Loads queued alerts due for delivery (deliver_at <= now), joining on
 * signals so the drain caller can decide whether each row should still
 * fire. Limit is intentionally small — the drain runs every 2 min so a
 * single pass doesn't have to clear a backlog all at once.
 */
export async function loadDueQueuedAlerts(
  service: Service,
  now: Date,
): Promise<
  Array<{
    queued: {
      signal_id: string;
      threshold: AlertThreshold;
      channels: AlertChannel[];
      deliver_at: string;
    };
    signal: StoredSignal | null;
  }>
> {
  const { data, error } = await service
    .from("signal_alert_queue")
    .select("signal_id, threshold, channels, deliver_at, signals(*)")
    .lte("deliver_at", now.toISOString())
    .order("deliver_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as Array<{
      signal_id: string;
      threshold: AlertThreshold;
      channels: AlertChannel[];
      deliver_at: string;
      signals: StoredSignal | null;
    }>
  ).map((r) => ({
    queued: {
      signal_id: r.signal_id,
      threshold: r.threshold,
      channels: r.channels,
      deliver_at: r.deliver_at,
    },
    signal: r.signals,
  }));
}

export async function removeQueuedAlert(
  service: Service,
  signalId: string,
  threshold: AlertThreshold,
): Promise<void> {
  const { error } = await service
    .from("signal_alert_queue")
    .delete()
    .eq("signal_id", signalId)
    .eq("threshold", threshold);
  if (error) throw new Error(error.message);
}

async function fetchSignalRow(
  signal: Signal,
  service: Service,
): Promise<StoredSignal | null> {
  const { data, error } = await service
    .from("signals")
    .select("*")
    .eq("provider", signal.provider)
    .eq("kind", signal.kind)
    .eq("source_id", signal.source_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StoredSignal | null) ?? null;
}

export type { AlertThreshold };
