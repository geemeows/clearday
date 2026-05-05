// Slack Events API endpoint. Two responsibilities:
//   1) Verify the v0 signature (HMAC-SHA256 over `v0:${timestamp}:${body}`)
//      and reject events outside a ±5 minute replay window.
//   2) Translate a verified `event_callback` envelope into a Signal upsert
//      via the slack provider adapter, after consulting the channel
//      allowlist for @here/@channel broadcasts.
//
// The handler is parametric on its dependencies so it can be tested without
// the Worker runtime.

import type { InboxRule } from "#/lib/inbox-rules-engine";
import {
  normalizeSlackEvent,
  type SlackEventPayload,
  type SlackNormalizeContext,
  threadKey,
} from "#/lib/provider-adapter/slack";
import type { Signal } from "#/lib/signal";
import type { SupabaseLike } from "#/lib/signal-store";
import { upsertSignal } from "#/lib/signal-store";

const REPLAY_WINDOW_SECONDS = 5 * 60;

const enc = new TextEncoder();

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "stale" | "bad_signature" };

export async function verifySlackSignature(
  signingSecret: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  rawBody: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!timestampHeader || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }
  const ts = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: "missing_headers" };
  if (Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const base = `v0:${timestampHeader}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(signingSecret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(base) as BufferSource),
  );
  const expected = `v0=${toHex(sigBytes)}`;
  if (!constantTimeEqual(expected, signatureHeader)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type SlackEnvelope = {
  type?: string;
  challenge?: string;
  event?: SlackEventPayload;
  team_id?: string;
  authorizations?: Array<{ user_id?: string; is_bot?: boolean }>;
};

export type SlackWebhookDeps = {
  signingSecret: string;
  store: SupabaseLike;
  loadAllowlist: () => Promise<string[]>;
  /** Owner's Slack user id; loaded from provider_accounts.account_id. */
  loadSelfUserId: () => Promise<string | null>;
  /**
   * Called after a Signal is upserted. The Worker plumbs this to
   * alert-dispatcher so requires-action mentions/DMs ping the user via
   * their enabled channels. Errors here must not fail the webhook —
   * Slack will retry the event and the upsert is the source of truth.
   */
  onStored?: (signal: Signal) => Promise<void>;
  /** Loaded once per webhook for the inbox-rules engine. Optional. */
  loadInboxRules?: () => Promise<InboxRule[]>;
  /**
   * Marks `(channel, thread_ts)` as a thread the owner has posted in, so
   * subsequent replies from other users in that thread become `thread_reply`
   * Signals. Called when the inbound event is authored by `selfUserId`.
   */
  recordParticipatedThread?: (
    channel: string,
    threadTs: string,
  ) => Promise<void>;
  /**
   * Returns true when `(channel, thread_ts)` is a thread the owner has
   * previously participated in. Looked up only for thread replies authored
   * by other users.
   */
  loadParticipatedThread?: (
    channel: string,
    threadTs: string,
  ) => Promise<boolean>;
  now?: () => number;
};

export type WebhookOutcome =
  | { kind: "challenge"; challenge: string }
  | { kind: "ignored"; reason: string }
  | { kind: "stored"; signal: Signal }
  | { kind: "rejected"; status: number; reason: string };

export async function handleSlackWebhook(
  request: {
    headers: { get: (name: string) => string | null };
    text: () => Promise<string>;
  },
  deps: SlackWebhookDeps,
): Promise<WebhookOutcome> {
  const rawBody = await request.text();
  const verified = await verifySlackSignature(
    deps.signingSecret,
    request.headers.get("x-slack-request-timestamp"),
    request.headers.get("x-slack-signature"),
    rawBody,
    deps.now?.() ?? Math.floor(Date.now() / 1000),
  );
  if (!verified.ok) {
    const status = verified.reason === "stale" ? 408 : 401;
    return { kind: "rejected", status, reason: verified.reason };
  }

  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return { kind: "rejected", status: 400, reason: "invalid_json" };
  }

  if (envelope.type === "url_verification" && envelope.challenge) {
    return { kind: "challenge", challenge: envelope.challenge };
  }

  if (envelope.type !== "event_callback" || !envelope.event) {
    return { kind: "ignored", reason: "non_event_callback" };
  }

  const selfUserId = await deps.loadSelfUserId();
  if (!selfUserId) return { kind: "ignored", reason: "no_self_user_id" };

  const event = envelope.event;

  // If the owner authored a (real) message in a channel/thread, mark the
  // thread anchor as participated so future replies from other users
  // surface as thread_reply Signals.
  if (
    event.type === "message" &&
    !event.bot_id &&
    (!event.subtype || event.subtype === "thread_broadcast") &&
    event.user === selfUserId &&
    event.channel &&
    event.ts &&
    deps.recordParticipatedThread
  ) {
    const anchor = event.thread_ts ?? event.ts;
    try {
      await deps.recordParticipatedThread(event.channel, anchor);
    } catch {
      // best-effort: a participation-record failure must not bubble up to
      // Slack as a webhook error. The Signal path below is unaffected.
    }
  }

  // For replies authored by other users, look up whether the parent thread
  // is one the owner has participated in.
  const participatedThreads = await loadParticipatedThreadsForEvent(
    event,
    selfUserId,
    deps.loadParticipatedThread,
  );

  const allowlist = await deps.loadAllowlist();
  const ctx: SlackNormalizeContext = {
    selfUserId,
    broadcastAllowlist: new Set(allowlist),
    participatedThreads,
    teamId: envelope.team_id ?? null,
  };
  const signal = normalizeSlackEvent(event, ctx);
  if (!signal) return { kind: "ignored", reason: "not_actionable" };

  const rules = deps.loadInboxRules ? await deps.loadInboxRules() : [];
  await upsertSignal(deps.store, signal, { rules });
  if (deps.onStored) {
    try {
      await deps.onStored(signal);
    } catch {
      // best-effort: swallow so Slack doesn't retry on a downstream alert
      // failure. The Signal is already persisted.
    }
  }
  return { kind: "stored", signal };
}

async function loadParticipatedThreadsForEvent(
  event: SlackEventPayload,
  selfUserId: string,
  loader: SlackWebhookDeps["loadParticipatedThread"],
): Promise<ReadonlySet<string> | undefined> {
  if (!loader) return undefined;
  if (event.type !== "message" && event.type !== "app_mention")
    return undefined;
  if (event.bot_id) return undefined;
  if (event.user === selfUserId) return undefined;
  const threadParent = event.thread_ts;
  if (!threadParent || !event.channel) return undefined;
  if (threadParent === event.ts) return undefined;
  let participated = false;
  try {
    participated = await loader(event.channel, threadParent);
  } catch {
    // best-effort: a lookup failure simply leaves the thread unmarked, so
    // the event normalizes as today (drop) rather than failing the webhook.
    return undefined;
  }
  if (!participated) return undefined;
  return new Set([threadKey(event.channel, threadParent)]);
}
