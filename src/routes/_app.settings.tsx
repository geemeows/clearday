import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { signOut, useAuth } from "#/lib/auth";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { session } = useAuth();
  return (
    <section className="p-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Signed in as <code>{session?.user.email}</code>
      </p>
      <button
        type="button"
        onClick={() => signOut()}
        className="mt-4 rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
      >
        Sign out
      </button>

      <NotificationsPanel />
    </section>
  );
}

type LoadResponse = { alert_channels: string[] };

export function NotificationsPanel({
  loader,
  saver,
  tester,
}: {
  loader?: () => Promise<LoadResponse>;
  saver?: (channels: string[]) => Promise<LoadResponse>;
  tester?: () => Promise<{ ok?: boolean; error?: string }>;
} = {}) {
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useMemo(
    () =>
      loader ?? (() => apiFetch("/api/preferences") as Promise<LoadResponse>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((channels: string[]) =>
        apiFetch("/api/preferences", {
          method: "PUT",
          body: { alert_channels: channels },
        }) as Promise<LoadResponse>),
    [saver],
  );
  const test = useMemo(
    () =>
      tester ??
      (() =>
        apiFetch("/api/notifications/test", { method: "POST" }) as Promise<{
          ok?: boolean;
          error?: string;
        }>),
    [tester],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((body) => {
        if (cancelled) return;
        setEnabled(new Set(body.alert_channels));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const toggle = useCallback(
    async (channel: string) => {
      if (!enabled) return;
      const next = new Set(enabled);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      setEnabled(next);
      setBusy(true);
      try {
        const body = await save([...next]);
        setEnabled(new Set(body.alert_channels));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setBusy(false);
      }
    },
    [enabled, save],
  );

  const sendTest = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await test();
      if (result.ok) setStatus("Test notification sent");
      else setStatus(`Failed: ${result.error ?? "unknown error"}`);
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [test]);

  return (
    <section
      aria-label="Notifications"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">Notifications</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Where Clearday pings you when a Signal needs you.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {enabled == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {enabled && (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={enabled.has("slack_dm")}
              onChange={() => toggle("slack_dm")}
              disabled={busy}
            />
            <span>
              <strong className="font-medium">Slack self-DM</strong>
              <span className="ml-2 text-zinc-500">
                Posts to your Slackbot DM via your connected Slack account.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={sendTest}
            disabled={busy || !enabled.has("slack_dm")}
            className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            Send test notification
          </button>

          {status && (
            <output className="text-sm text-zinc-600">{status}</output>
          )}
        </div>
      )}
    </section>
  );
}
