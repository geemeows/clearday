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

  const allowlist = await deps.loadAllowlist();
  const ctx: SlackNormalizeContext = {
    selfUserId,
    broadcastAllowlist: new Set(allowlist),
    teamId: envelope.team_id ?? null,
  };
  const signal = normalizeSlackEvent(envelope.event, ctx);
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
