// Slack self-DM alert channel. Posts a formatted alert to the user's own
// Slackbot DM via `chat.postMessage`, reusing the Slack OAuth token already
// stored in provider_accounts. Slack auto-opens a DM when `channel` is a
// user id, so we don't have to manage `im.open` ourselves.
//
// The channel is a thin function: build the message, call Slack, throw on a
// non-ok response so the dispatcher records the error against this channel.

import type { StoredSignal } from "#/shared/signal";

export type SlackDmDeps = {
  /** OAuth user-token (xoxp-...) from provider_accounts. */
  accessToken: string;
  /** Owner's Slack user id (e.g. "U123") — the DM target. */
  selfUserId: string;
  fetch: typeof fetch;
};

export async function sendSlackDm(
  signal: StoredSignal,
  deps: SlackDmDeps,
): Promise<void> {
  const text = formatAlertText(signal);
  const res = await deps.fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${deps.accessToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: deps.selfUserId,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`slack chat.postMessage HTTP ${res.status}`);
  }
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!body.ok) {
    throw new Error(`slack chat.postMessage: ${body.error ?? "unknown_error"}`);
  }
}

export function formatAlertText(signal: StoredSignal): string {
  const lead = leadFor(signal);
  const titleLine = signal.title;
  const link = signal.url ? `<${signal.url}|Open>` : "";
  return [`*${lead}*`, titleLine, link].filter(Boolean).join("\n");
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
