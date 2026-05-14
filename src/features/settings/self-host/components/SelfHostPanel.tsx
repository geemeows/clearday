// Settings → Self-host panel.
// Aligned to docs/design/devy-ui/settings.jsx:967-997 (SelfHostPanel).
// FIXTURE_STATS are hardcoded per the v4 fixture rule; wire from
// /api/self-host when the backend surfaces signal/rollup counts.

import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import type { SelfHostInfo } from "#/features/settings/self-host/api";
import { apiFetch } from "#/lib/api-client";

const FIXTURE_STATS = "1,847 raw signals · 12 rollups · 90-day retention";

type Row = { label: string; value: string | null };

export type SelfHostPanelProps = {
  loader?: () => Promise<SelfHostInfo>;
  onCopy?: (value: string) => Promise<void> | void;
  onExportJson?: () => void;
  onRunRollup?: () => void;
  onDisconnectAll?: () => void;
};

export function SelfHostPanel({
  loader,
  onCopy,
  onExportJson,
  onRunRollup,
  onDisconnectAll,
}: SelfHostPanelProps = {}) {
  const [info, setInfo] = useState<SelfHostInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useMemo(
    () => loader ?? (() => apiFetch("/api/self-host") as Promise<SelfHostInfo>),
    [loader],
  );
  const copy = useMemo(
    () =>
      onCopy ??
      ((value: string) => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          return navigator.clipboard.writeText(value);
        }
      }),
    [onCopy],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((view) => {
        if (!cancelled) setInfo(view);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const rows: Row[] = info
    ? [
        { label: "Deployment URL", value: info.worker_url },
        { label: "Worker version", value: info.worker_version },
        { label: "Supabase project", value: info.supabase_url },
        { label: "Allowed email", value: info.allowed_email },
        { label: "Auth proxy URL", value: info.auth_proxy_url },
      ]
    : [];

  const handleCopy = async (label: string, value: string) => {
    await copy(value);
    setCopied(label);
    setTimeout(() => {
      setCopied((current) => (current === label ? null : current));
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-xl tracking-[-0.2px] text-[var(--ink)]">
          Self-host
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your deployment. All data and tokens live in your own Supabase +
          Cloudflare Worker.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {info && (
        <>
          {/* Info card — row-per-field layout per settings.jsx:970-984 */}
          <div className="overflow-hidden rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)]">
            {rows.map((row, idx) => (
              <div
                key={row.label}
                className={`flex items-center gap-3 px-3.5 py-2.5${
                  idx < rows.length - 1
                    ? " border-b border-[var(--hairline-soft)]"
                    : ""
                }`}
              >
                <span className="w-40 shrink-0 text-[13px] text-[var(--muted)]">
                  {row.label}
                </span>
                <code className="flex-1 font-mono text-[12px] text-[var(--ink)]">
                  {row.value ?? "—"}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!row.value}
                  onClick={() =>
                    row.value && handleCopy(row.label, row.value)
                  }
                  aria-label={`Copy ${row.label}`}
                >
                  {copied === row.label ? (
                    <>
                      <Check aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy aria-hidden="true" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {/* Data section — settings.jsx:986-992 */}
          <section>
            <h3 className="mb-2.5 mt-7 font-semibold text-base text-[var(--ink)]">
              Data
            </h3>
            <div className="flex items-center gap-2.5 rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onExportJson?.()}
              >
                Export my data (JSON)
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onRunRollup?.()}
              >
                Run signal-rollup now
              </Button>
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {FIXTURE_STATS}
              </span>
            </div>
          </section>

          {/* Danger zone — settings.jsx:993-996 */}
          <section>
            <h3 className="mb-2.5 mt-7 font-semibold text-base text-[var(--danger)]">
              Danger zone
            </h3>
            <div className="rounded-lg border border-[var(--danger-soft)] bg-[var(--canvas)] p-[18px]">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="border-[var(--danger)] text-[var(--danger)]"
                onClick={() => onDisconnectAll?.()}
              >
                Disconnect all providers
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
