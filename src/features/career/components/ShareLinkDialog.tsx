// Generate / list / revoke read-only share links for a Career level. Anon
// viewers consume tokens via the SECURITY DEFINER `career_share_read` fn
// (migration 0030); this dialog is the owner-side surface.

import { useEffect, useState } from "react";
import { Button } from "#/components/coss/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/coss/dialog";
import {
  createShareLink,
  getShareLinks,
  revokeShareLink,
  type StoredShare,
} from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

export function shareUrlFor(token: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/share/career/${token}`;
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  levelId,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levelId: string;
  client: SupabaseLike;
}) {
  const [shares, setShares] = useState<StoredShare[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setShares(null);
    setError(null);
    getShareLinks(client, levelId)
      .then((rows) => {
        if (!cancelled) setShares(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [open, client, levelId]);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      await createShareLink(client, levelId);
      const rows = await getShareLinks(client, levelId);
      setShares(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to generate link");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    setBusy(true);
    try {
      await revokeShareLink(client, shareId);
      const rows = await getShareLinks(client, levelId);
      setShares(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to revoke");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            Anyone with the link can view this level read-only. Revoke at any
            time.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleGenerate}
            disabled={busy}
          >
            Generate share link
          </Button>
        </div>

        {shares === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : shares.length === 0 ? (
          <p className="text-muted-foreground text-sm">No share links yet.</p>
        ) : (
          <ul aria-label="Share links" className="space-y-2">
            {shares.map((s) => (
              <ShareLinkRow
                key={s.id}
                share={s}
                onRevoke={() => handleRevoke(s.id)}
                disabled={busy}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShareLinkRow({
  share,
  onRevoke,
  disabled,
}: {
  share: StoredShare;
  onRevoke: () => void;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const url = shareUrlFor(share.token);
  const revoked = share.revoked_at !== null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked; ignore — the URL is still visible.
    }
  };

  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
      <input
        readOnly
        aria-label="Share URL"
        value={url}
        className="flex-1 bg-transparent px-1 text-foreground text-xs outline-none"
        onFocus={(e) => e.currentTarget.select()}
      />
      {revoked ? (
        <span className="text-muted-foreground text-xs">Revoked</span>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCopy}
            aria-label="Copy share link"
            disabled={disabled}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRevoke}
            aria-label="Revoke share link"
            disabled={disabled}
          >
            Revoke
          </Button>
        </>
      )}
    </li>
  );
}
