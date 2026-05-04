// Email digest — fourth alert channel as a periodic morning summary of new
// Signals since the last digest. The user supplies a Resend API key and a
// from / to address; Clearday never operates a shared mailer.
//
// This module is the single seam every email-digest call site goes through:
//   - getEmailDigestSettings / putEmailDigestSettings  (Settings panel)
//   - sendEmailDigestTest                               ("Send test email")
//   - runEmailDigestTick                                (daily cron)
//
// Render + Resend transport are co-located here for v1; SMTP transport and
// per-Signal email-channel routing through the alert-dispatcher are deferred.

import { decryptSecret, encryptSecret } from "#/lib/llm-crypto";
import type { StoredSignal } from "#/lib/signal";

export type EmailDigestRow = {
  enabled?: boolean;
  transport?: "resend";
  api_key?: string | null;
  from_email?: string | null;
  to_email?: string | null;
  hour_utc?: number | null;
  last_sent_date?: string | null;
};

export type EmailDigestStore = {
  load: () => Promise<EmailDigestRow | null>;
  save: (patch: EmailDigestRow) => Promise<EmailDigestRow>;
};

export type EmailDigestSettingsView = {
  enabled: boolean;
  transport: "resend";
  has_api_key: boolean;
  from_email: string | null;
  to_email: string | null;
  hour_utc: number;
  last_sent_date: string | null;
};

export type EmailDigestPutBody = {
  enabled?: unknown;
  api_key?: unknown;
  from_email?: unknown;
  to_email?: unknown;
  hour_utc?: unknown;
};

export type EmailDigestDeps = {
  store: EmailDigestStore;
  keySecret: string;
  fetch: typeof fetch;
  loadSignals: (sinceIso: string | null) => Promise<StoredSignal[]>;
  now?: () => Date;
};

const DEFAULT_HOUR_UTC = 13; // 9am ET / 6am PT — a reasonable default

export async function getEmailDigestSettings(
  store: EmailDigestStore,
): Promise<EmailDigestSettingsView> {
  const row = (await store.load()) ?? {};
  return toView(row);
}

export async function putEmailDigestSettings(
  body: EmailDigestPutBody,
  deps: { store: EmailDigestStore; keySecret: string },
): Promise<
  { ok: true; settings: EmailDigestSettingsView } | { ok: false; error: string }
> {
  const patch: EmailDigestRow = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return { ok: false, error: "enabled must be boolean" };
    }
    patch.enabled = body.enabled;
  }
  if (body.from_email !== undefined) {
    if (body.from_email === null || body.from_email === "") {
      patch.from_email = null;
    } else if (typeof body.from_email === "string") {
      patch.from_email = body.from_email.trim();
    } else {
      return { ok: false, error: "from_email must be a string" };
    }
  }
  if (body.to_email !== undefined) {
    if (body.to_email === null || body.to_email === "") {
      patch.to_email = null;
    } else if (typeof body.to_email === "string") {
      const trimmed = body.to_email.trim();
      if (!trimmed.includes("@")) {
        return { ok: false, error: "to_email must contain @" };
      }
      patch.to_email = trimmed;
    } else {
      return { ok: false, error: "to_email must be a string" };
    }
  }
  if (body.hour_utc !== undefined) {
    const hour = Number(body.hour_utc);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return { ok: false, error: "hour_utc must be an integer 0-23" };
    }
    patch.hour_utc = hour;
  }
  if (body.api_key !== undefined && body.api_key !== "") {
    if (typeof body.api_key !== "string") {
      return { ok: false, error: "api_key must be a string" };
    }
    patch.api_key = await encryptSecret(body.api_key, deps.keySecret);
  }
  patch.transport = "resend";
  const saved = await deps.store.save(patch);
  return { ok: true, settings: toView(saved) };
}

export async function sendEmailDigestTest(
  deps: EmailDigestDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = (await deps.store.load()) ?? {};
  const ready = await readyToSend(row, deps.keySecret);
  if (!ready.ok) return ready;

  const now = deps.now?.() ?? new Date();
  const message = renderDigest({
    signals: [],
    sinceIso: null,
    now,
    isTest: true,
  });
  try {
    await sendViaResend({
      apiKey: ready.apiKey,
      from: ready.from,
      to: ready.to,
      message,
      fetch: deps.fetch,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type EmailDigestTickResult =
  | { kind: "sent"; recipient: string; signal_count: number; date: string }
  | {
      kind: "skipped";
      reason: "disabled" | "not_configured" | "not_due" | "already_sent_today";
    }
  | { kind: "error"; error: string };

export async function runEmailDigestTick(
  deps: EmailDigestDeps,
): Promise<EmailDigestTickResult> {
  const row = (await deps.store.load()) ?? {};
  if (!row.enabled) return { kind: "skipped", reason: "disabled" };

  const now = deps.now?.() ?? new Date();
  const today = utcDateString(now);
  if (row.last_sent_date === today) {
    return { kind: "skipped", reason: "already_sent_today" };
  }
  const hour =
    typeof row.hour_utc === "number" ? row.hour_utc : DEFAULT_HOUR_UTC;
  if (now.getUTCHours() < hour) {
    return { kind: "skipped", reason: "not_due" };
  }

  const ready = await readyToSend(row, deps.keySecret);
  if (!ready.ok) {
    if (ready.error === "not_configured") {
      return { kind: "skipped", reason: "not_configured" };
    }
    return { kind: "error", error: ready.error };
  }

  const sinceIso = row.last_sent_date
    ? `${row.last_sent_date}T00:00:00.000Z`
    : new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const signals = await deps.loadSignals(sinceIso);
  const message = renderDigest({ signals, sinceIso, now, isTest: false });

  try {
    await sendViaResend({
      apiKey: ready.apiKey,
      from: ready.from,
      to: ready.to,
      message,
      fetch: deps.fetch,
    });
  } catch (err) {
    return {
      kind: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  await deps.store.save({ last_sent_date: today });
  return {
    kind: "sent",
    recipient: ready.to,
    signal_count: signals.length,
    date: today,
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export type RenderArgs = {
  signals: StoredSignal[];
  sinceIso: string | null;
  now: Date;
  isTest: boolean;
};

export type DigestMessage = {
  subject: string;
  html: string;
  text: string;
};

export function renderDigest(args: RenderArgs): DigestMessage {
  const { signals, now, isTest } = args;
  const date = utcDateString(now);
  const grouped = groupByKind(signals);

  if (isTest) {
    return {
      subject: `Clearday digest — test message (${date})`,
      html: testHtml(date),
      text: testText(date),
    };
  }

  const subject =
    signals.length === 0
      ? `Clearday digest — quiet day (${date})`
      : `Clearday digest — ${signals.length} new ${signals.length === 1 ? "signal" : "signals"} (${date})`;

  return {
    subject,
    html: digestHtml(date, grouped, signals.length),
    text: digestText(date, grouped, signals.length),
  };
}

const SECTION_ORDER: Array<{ key: string; label: string; kinds: string[] }> = [
  {
    key: "prs",
    label: "Pull requests",
    kinds: ["pr_review_requested", "pr_authored", "pr_assigned"],
  },
  {
    key: "meetings",
    label: "Meetings",
    kinds: ["meeting"],
  },
  {
    key: "mentions",
    label: "Slack",
    kinds: ["mention", "dm", "thread_reply"],
  },
];

function groupByKind(signals: StoredSignal[]): Record<string, StoredSignal[]> {
  const out: Record<string, StoredSignal[]> = {};
  for (const section of SECTION_ORDER) out[section.key] = [];
  for (const s of signals) {
    if (s.dismissed_at) continue;
    for (const section of SECTION_ORDER) {
      if (section.kinds.includes(s.kind)) {
        out[section.key].push(s);
        break;
      }
    }
  }
  return out;
}

function digestText(
  date: string,
  grouped: Record<string, StoredSignal[]>,
  total: number,
): string {
  const lines: string[] = [];
  lines.push(`Clearday digest — ${date}`);
  lines.push("");
  if (total === 0) {
    lines.push("No new signals since the last digest. Enjoy the quiet.");
    return lines.join("\n");
  }
  for (const section of SECTION_ORDER) {
    const items = grouped[section.key];
    if (items.length === 0) continue;
    lines.push(`${section.label} (${items.length}):`);
    for (const s of items) {
      lines.push(s.url ? `- ${s.title} — ${s.url}` : `- ${s.title}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function digestHtml(
  date: string,
  grouped: Record<string, StoredSignal[]>,
  total: number,
): string {
  const parts: string[] = [];
  parts.push(
    `<h1 style="font-family:sans-serif;font-size:18px">Clearday digest — ${escapeHtml(date)}</h1>`,
  );
  if (total === 0) {
    parts.push(
      `<p style="font-family:sans-serif;color:#52525b">No new signals since the last digest. Enjoy the quiet.</p>`,
    );
    return parts.join("");
  }
  for (const section of SECTION_ORDER) {
    const items = grouped[section.key];
    if (items.length === 0) continue;
    parts.push(
      `<h2 style="font-family:sans-serif;font-size:14px;margin-top:18px">${escapeHtml(section.label)} (${items.length})</h2>`,
    );
    parts.push(`<ul style="font-family:sans-serif;font-size:14px">`);
    for (const s of items) {
      const title = escapeHtml(s.title);
      parts.push(
        s.url
          ? `<li><a href="${escapeAttr(s.url)}">${title}</a></li>`
          : `<li>${title}</li>`,
      );
    }
    parts.push(`</ul>`);
  }
  return parts.join("");
}

function testText(date: string): string {
  return `Clearday digest — test message\n\nIf you're seeing this, your Resend transport is configured correctly. Sent at ${date}.`;
}

function testHtml(date: string): string {
  return `<h1 style="font-family:sans-serif;font-size:18px">Clearday digest — test message</h1><p style="font-family:sans-serif">If you're seeing this, your Resend transport is configured correctly. Sent at ${escapeHtml(date)}.</p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Resend transport
// ---------------------------------------------------------------------------

type ResendSendArgs = {
  apiKey: string;
  from: string;
  to: string;
  message: DigestMessage;
  fetch: typeof fetch;
};

async function sendViaResend(args: ResendSendArgs): Promise<void> {
  const res = await args.fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.message.subject,
      html: args.message.html,
      text: args.message.text,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(
      `resend HTTP ${res.status}${detail ? `: ${detail}` : ""}`.trim(),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ReadyToSend =
  | { ok: true; apiKey: string; from: string; to: string }
  | { ok: false; error: string };

async function readyToSend(
  row: EmailDigestRow,
  keySecret: string,
): Promise<ReadyToSend> {
  if (!row.api_key || !row.from_email || !row.to_email) {
    return { ok: false, error: "not_configured" };
  }
  let apiKey: string;
  try {
    apiKey = await decryptSecret(row.api_key, keySecret);
  } catch {
    return { ok: false, error: "api key could not be decrypted" };
  }
  return {
    ok: true,
    apiKey,
    from: row.from_email,
    to: row.to_email,
  };
}

function toView(row: EmailDigestRow): EmailDigestSettingsView {
  return {
    enabled: !!row.enabled,
    transport: "resend",
    has_api_key: typeof row.api_key === "string" && row.api_key.length > 0,
    from_email: row.from_email ?? null,
    to_email: row.to_email ?? null,
    hour_utc:
      typeof row.hour_utc === "number" ? row.hour_utc : DEFAULT_HOUR_UTC,
    last_sent_date: row.last_sent_date ?? null,
  };
}

function utcDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
