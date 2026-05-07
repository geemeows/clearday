import { useState } from "react";
import { apiFetch } from "#/lib/api-client";
import {
  type DraftRequest,
  defaultDraftRequest,
  defaultOpenUrl,
  defaultRequestConnectUrl,
  draftRefusedMessage,
  type OpenUrl,
  type RequestConnectUrl,
} from "../_shared";

export type SlackReplySubmit = (params: {
  channel: string;
  text: string;
  thread_ts?: string;
  signal_id?: string;
}) => Promise<{ ok: boolean; error?: string; needs_reauth?: boolean }>;

const defaultSlackReplySubmit: SlackReplySubmit = async (params) =>
  (await apiFetch("/api/slack/reply", {
    method: "POST",
    body: params,
  })) as { ok: boolean; error?: string; needs_reauth?: boolean };

export function SlackReplyComposer({
  channel,
  channelName,
  thread_ts,
  signalId,
  submit = defaultSlackReplySubmit,
  requestDraft = defaultDraftRequest,
  requestConnectUrl = defaultRequestConnectUrl,
  openUrl = defaultOpenUrl,
  onReplyStart,
  onReplyRollback,
}: {
  channel: string;
  channelName?: string;
  thread_ts?: string;
  signalId?: string;
  submit?: SlackReplySubmit;
  requestDraft?: DraftRequest;
  requestConnectUrl?: RequestConnectUrl;
  openUrl?: OpenUrl;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const channelLabel = channelName ?? channel;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "ok" }
    | { kind: "error"; message: string; needs_reauth?: boolean }
    | null
  >(null);
  // When the signal lives inside a thread, default to replying in-thread.
  const [asNewMessage, setAsNewMessage] = useState(false);
  const effectiveThreadTs = asNewMessage ? undefined : thread_ts;

  const reauth = async () => {
    setReauthing(true);
    try {
      const out = await requestConnectUrl("slack");
      if (out.ok && out.url) {
        openUrl(out.url);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? "reauthorize failed",
          needs_reauth: true,
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reauthorize failed",
        needs_reauth: true,
      });
    } finally {
      setReauthing(false);
    }
  };

  const draft = async () => {
    if (!signalId) return;
    setDrafting(true);
    setStatus(null);
    try {
      const out = await requestDraft({ signal_id: signalId });
      if (out.ok) {
        setText(out.draft);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? draftRefusedMessage(out.reason),
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "draft failed",
      });
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    setPending(true);
    setStatus(null);
    if (signalId) onReplyStart?.(signalId);
    try {
      const out = await submit({
        channel,
        text: text.trim(),
        thread_ts: effectiveThreadTs,
        signal_id: signalId,
      });
      if (out.ok) {
        setStatus({ kind: "ok" });
        setText("");
      } else {
        if (signalId) onReplyRollback?.(signalId);
        setStatus({
          kind: "error",
          message: out.error ?? "reply failed",
          needs_reauth: out.needs_reauth,
        });
      }
    } catch (e) {
      if (signalId) onReplyRollback?.(signalId);
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reply failed",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-label="Slack reply composer"
      className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          effectiveThreadTs
            ? "Reply in thread…"
            : `Send a message to #${channelLabel}`
        }
        aria-label="Slack reply"
        rows={3}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/40"
      />
      {thread_ts && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={asNewMessage}
            onChange={(e) => setAsNewMessage(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Send as a new message in #{channelLabel} (don't reply in thread)
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending || text.trim().length === 0}
          className="rounded bg-foreground px-3 py-1.5 text-sm text-background hover:bg-foreground/90 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        {signalId && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending}
            className="ml-auto rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            {drafting ? "Drafting…" : "Draft with AI"}
          </button>
        )}
      </div>
      {status?.kind === "ok" && (
        <output className="block text-xs text-emerald-700">Reply sent.</output>
      )}
      {status?.kind === "error" && (
        <p role="alert" className="text-xs text-rose-700">
          {status.message}
          {status.needs_reauth && (
            <>
              {" "}
              <button
                type="button"
                onClick={reauth}
                disabled={reauthing}
                className="underline disabled:opacity-60"
              >
                {reauthing ? "Reauthorizing…" : "Reauthorize Slack"}
              </button>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}
