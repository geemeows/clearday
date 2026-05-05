// Email per-Signal alert channel. Posts a single-Signal email via the Resend
// transport already configured for the email digest, reusing its api_key /
// from_email / to_email so users only configure email once.
//
// The dispatcher fan-out passes a `(signal) => Promise<void>` sender; this
// module renders a single-Signal email and throws on transport failure so
// the dispatcher records the error against this channel.

import type { StoredSignal } from "#/lib/signal";

export type EmailAlertDeps = {
  apiKey: string;
  from: string;
  to: string;
  fetch: typeof fetch;
};

export async function sendEmailAlert(
  signal: StoredSignal,
  deps: EmailAlertDeps,
): Promise<void> {
  const message = formatAlertEmail(signal);
  const res = await deps.fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${deps.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: deps.from,
      to: [deps.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let detail = "";
    try {
      const body = JSON.parse(raw) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? "";
    } catch {
      detail = raw;
    }
    throw new Error(
      `resend HTTP ${res.status}${detail ? `: ${detail}` : ""}`.trim(),
    );
  }
}

export type AlertEmail = {
  subject: string;
  html: string;
  text: string;
};

export function formatAlertEmail(signal: StoredSignal): AlertEmail {
  const lead = leadFor(signal);
  const subject = `${lead}: ${signal.title}`;
  const linkLine = signal.url ? `Open: ${signal.url}` : "";
  const text = [lead, signal.title, linkLine].filter(Boolean).join("\n");
  const html = [
    `<h1 style="font-family:sans-serif;font-size:18px">${escapeHtml(lead)}</h1>`,
    `<p style="font-family:sans-serif;font-size:14px">${escapeHtml(signal.title)}</p>`,
    signal.url
      ? `<p style="font-family:sans-serif;font-size:14px"><a href="${escapeAttr(signal.url)}">Open</a></p>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  return { subject, html, text };
}

function leadFor(signal: StoredSignal): string {
  if (signal.kind === "meeting") return "Meeting starts in 10 min";
  if (signal.kind === "dm") return "New direct message";
  if (signal.kind === "mention") return "You were mentioned";
  if (signal.kind === "thread_reply") return "New reply in your thread";
  if (signal.kind === "pr_review_requested") return "Review requested";
  if (signal.kind === "pr_authored") return "Update on your PR";
  if (signal.kind === "pr_assigned") return "PR assigned to you";
  return "New signal";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
