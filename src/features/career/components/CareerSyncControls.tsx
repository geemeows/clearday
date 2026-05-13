// "Sync to Google Sheet" pill in the level header. Wraps three actions
// against the worker route in src/worker/index.ts:
//   POST /api/career/sync   { level_id }   → { spreadsheetUrl, last_synced_at }
//   POST /api/career/unlink { level_id }
//
// Slice 7.5.1 reshape: the chrome here matches the mockup's `SyncPill`
// (docs/design/devy-ui/career.jsx:353-385) — a single pill button with a
// green "S" badge, status label, hairline divider, and "Sync now" trigger.
// The mockup's `SyncDialog` (line 430+) is not yet ported; until it is, the
// inline "Open sheet" link in the success output preserves the affordance
// to reach the new sheet, and the inline "Unlink" ghost button stays put
// (its consolidation into `ActionsMenu` is the next sub-slice — would
// rewire the unlink mutation across two surfaces in one pass).
//
// On success the parent re-fetches the level row so the "Synced Xm ago" pill
// reflects the new last_synced_at. The worker response includes
// `needs_reauth` when Google returns 401/403 — the panel surfaces a hint
// pointing the user at /integrations to re-grant the new Sheets/Drive scopes.

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";

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

  const syncing = status.kind === "syncing";
  const pillLabel = isSynced ? "Sync now" : "Sync to Google Sheet";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          aria-label={pillLabel}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card py-[5px] pr-2.5 pl-2 text-foreground disabled:cursor-default disabled:opacity-70"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-[18px] w-[18px] items-center justify-center rounded font-bold text-[11px] text-white"
            style={{ background: "#0F9D58" }}
          >
            S
          </span>
          {isSynced && props.lastSyncedAt ? (
            <>
              <span
                data-testid="career-sync-status"
                className="text-[12.5px]"
              >
                Synced{" "}
                <span className="text-muted-foreground">
                  {relativeTime(props.lastSyncedAt, now())}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 border-hairline border-l pl-1.5 font-semibold text-[12.5px] text-primary">
                <RefreshCw aria-hidden="true" className="h-[11px] w-[11px]" />
                {syncing ? "Syncing…" : "Sync now"}
              </span>
            </>
          ) : (
            <span className="font-semibold text-[12.5px] text-primary">
              {syncing ? "Syncing…" : "Sync to Google Sheet"}
            </span>
          )}
        </button>
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
