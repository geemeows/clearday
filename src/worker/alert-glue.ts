// Worker-side glue between the pure alert-dispatcher / channel modules and
// Supabase + Slack. Kept thin: the heavy logic lives in
// src/lib/alert-dispatcher.ts and src/lib/alert-channel/*. This file just
// loads runtime state (preferences, Slack token) and turns idempotency
// failures into the dispatcher's `alreadyRecorded` contract.

import { sendSlackDm } from "#/lib/alert-channel/slack-dm";
import type {
  AlertChannel,
  AlertThreshold,
  DispatcherDeps,
} from "#/lib/alert-dispatcher";
import { dispatchAlert } from "#/lib/alert-dispatcher";
import type { Signal, StoredSignal } from "#/lib/signal";

const KNOWN_CHANNELS: AlertChannel[] = ["slack_dm"];

// biome-ignore lint/suspicious/noExplicitAny: thin Supabase client surface
type Service = any;

export function buildDispatcherDeps(
  service: Service,
  fetchImpl: typeof fetch,
): DispatcherDeps {
  return {
    loadPreferences: async () => {
      const { data, error } = await service
        .from("user_preferences")
        .select("alert_channels")
        .eq("id", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const raw = (data?.alert_channels ?? []) as string[];
      const enabledChannels = raw.filter((c): c is AlertChannel =>
        (KNOWN_CHANNELS as string[]).includes(c),
      );
      return { enabledChannels };
    },
    recordIdempotency: async (signalId, threshold, channels) => {
      const { error } = await service.from("signal_alerts").insert({
        signal_id: signalId,
        threshold,
        channels,
      });
      if (!error) return { alreadyRecorded: false };
      // Postgres unique violation is the idempotency signal.
      const code = (error as { code?: string }).code;
      if (code === "23505") return { alreadyRecorded: true };
      throw new Error(error.message);
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
    },
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
