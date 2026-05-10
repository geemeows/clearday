// "Sync to Google Sheet" controls in the level header. Wraps three actions
// against the worker route in src/worker/index.ts:
//   POST /api/career/sync   { level_id }   → { spreadsheetUrl, last_synced_at }
//   POST /api/career/unlink { level_id }
//
// On success the parent re-fetches the level row so the "Synced Xm ago" pill
// reflects the new last_synced_at. The worker response includes
// `needs_reauth` when Google returns 401/403 — the panel surfaces a hint
// pointing the user at /integrations to re-grant the new Sheets/Drive scopes.

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/coss/button";

export type CareerSyncControlsProps = {
  levelId: string;
  lastSyncedAt: string | null;
  sheetId: string | null;
  // Called after a successful sync or unlink so the parent can re-fetch the
  // level row. The new spreadsheetUrl is forwarded on sync (null on unlink)
  // for callers that want to render an "Open sheet" link.
  onChanged: (next: {
    spreadsheetUrl: string | null;
    lastSyncedAt: string | null;
  }) => void;
  // Injected for tests; defaults to global fetch.
  fetchImpl?: typeof fetch;
  // Injected for tests so "Synced Xm ago" can be pinned.
  now?: () => Date;
};

type Status =
  | { kind: "idle" }
  | { kind: "syncing" }
  | {
      kind: "success";
      spreadsheetUrl: string;
    }
  | {
      kind: "error";
      message: string;
      needs_reauth: boolean;
    };

export function CareerSyncControls(props: CareerSyncControlsProps) {
  const fetchImpl = props.fetchImpl ?? fetch;
  const now = props.now ?? (() => new Date());
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const isSynced = !!props.sheetId;
  const sheetUrl = props.sheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(props.sheetId)}/edit`
    : null;

  const handleSync = async () => {
    setStatus({ kind: "syncing" });
    try {
      const res = await fetchImpl("/api/career/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level_id: props.levelId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        spreadsheetUrl?: string;
        last_synced_at?: string;
        error?: string;
        needs_reauth?: boolean;
      };
      if (!res.ok || !body.ok || !body.spreadsheetUrl) {
        setStatus({
          kind: "error",
          message: body.error ?? `sync failed (HTTP ${res.status})`,
          needs_reauth: body.needs_reauth === true,
        });
        return;
      }
      setStatus({ kind: "success", spreadsheetUrl: body.spreadsheetUrl });
      props.onChanged({
        spreadsheetUrl: body.spreadsheetUrl,
        lastSyncedAt: body.last_synced_at ?? null,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
        needs_reauth: false,
      });
    }
  };

  const handleUnlink = async () => {
    if (
      !confirm("Unlink the Google Sheet? You can re-sync to create a new one.")
    ) {
      return;
    }
    try {
      const res = await fetchImpl("/api/career/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level_id: props.levelId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({
          kind: "error",
          message: body.error ?? `unlink failed (HTTP ${res.status})`,
          needs_reauth: false,
        });
        return;
      }
      setStatus({ kind: "idle" });
      props.onChanged({ spreadsheetUrl: null, lastSyncedAt: null });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
        needs_reauth: false,
      });
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {isSynced && props.lastSyncedAt && (
          <span
            data-testid="career-sync-status"
            className="text-muted-foreground text-xs"
          >
            Synced {relativeTime(props.lastSyncedAt, now())}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSync}
          disabled={status.kind === "syncing"}
          aria-label={isSynced ? "Sync now" : "Sync to Google Sheet"}
        >
          {status.kind === "syncing"
            ? "Syncing…"
            : isSynced
              ? "Sync now"
              : "Sync to Google Sheet"}
        </Button>
        {isSynced && sheetUrl && (
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            aria-label="Open Google Sheet"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {isSynced && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleUnlink}
            aria-label="Unlink Google Sheet"
          >
            Unlink
          </Button>
        )}
      </div>
      {status.kind === "success" && (
        <output className="text-emerald-600 text-xs dark:text-emerald-400">
          Synced —{" "}
          <a
            href={status.spreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            open sheet
          </a>
        </output>
      )}
      {status.kind === "error" && (
        <span role="alert" className="text-destructive text-xs">
          {status.message}
          {status.needs_reauth && (
            <>
              {" — "}
              <a href="/integrations" className="underline">
                reconnect Google
              </a>
            </>
          )}
        </span>
      )}
    </div>
  );
}

function relativeTime(iso: string, now: Date): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "just now";
  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
