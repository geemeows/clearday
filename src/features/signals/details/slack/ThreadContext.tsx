import { useEffect, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";

export type SlackThreadMessage = {
  ts: string;
  user_id: string | null;
  user_name: string | null;
  text: string;
  is_self: boolean;
};

export type SlackThreadResult =
  | { ok: true; messages: SlackThreadMessage[] }
  | { ok: false; error: string; needs_reauth?: boolean };

export type SlackThreadLoader = (params: {
  channel: string;
  thread_ts: string;
}) => Promise<SlackThreadResult>;

const defaultSlackThreadLoader: SlackThreadLoader = async ({
  channel,
  thread_ts,
}) => {
  const qs = `channel=${encodeURIComponent(channel)}&thread_ts=${encodeURIComponent(
    thread_ts,
  )}`;
  return (await apiFetch(`/api/slack/thread?${qs}`)) as SlackThreadResult;
};

export function SlackThreadContext({
  channel,
  thread_ts,
  load = defaultSlackThreadLoader,
}: {
  channel: string;
  thread_ts: string;
  load?: SlackThreadLoader;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; messages: SlackThreadMessage[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load({ channel, thread_ts })
      .then((out) => {
        if (cancelled) return;
        if (out.ok) {
          setState({ kind: "ok", messages: out.messages });
        } else {
          setState({ kind: "error", message: out.error });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "failed to load thread",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [channel, thread_ts, load]);

  if (state.kind === "loading") {
    return <p className="text-xs text-muted-foreground">Loading thread…</p>;
  }
  if (state.kind === "error") {
    return (
      <p className="text-xs text-rose-700" role="alert">
        Couldn't load thread: {state.message}
      </p>
    );
  }
  if (state.messages.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Thread context"
      className="space-y-2 rounded-md border border-border bg-background p-3"
    >
      <header className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Thread
      </header>
      <ol className="space-y-2">
        {state.messages.map((m) => (
          <li
            key={m.ts}
            className={cn(
              "rounded px-2 py-1.5 text-xs",
              m.is_self ? "bg-muted" : "bg-muted/40",
            )}
          >
            <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
              <span className="font-medium text-foreground">
                {m.user_name ?? (m.user_id ? `<@${m.user_id}>` : "(unknown)")}
                {m.is_self && (
                  <span className="ml-1 text-muted-foreground">(you)</span>
                )}
              </span>
              <time className="tabular-nums">{formatSlackTs(m.ts)}</time>
            </div>
            <p className="mt-0.5 whitespace-pre-line text-foreground">
              {m.text || "(empty message)"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatSlackTs(ts: string): string {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return ts;
  const d = new Date(seconds * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
