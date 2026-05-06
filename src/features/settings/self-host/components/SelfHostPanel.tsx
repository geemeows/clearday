// Settings → Self-host panel (per PRD #29 mockup #2).
//
// Pure presentational shell over /api/self-host data. Loader, copy,
// export, run-rollup, and disconnect-all callbacks are injected so the
// component is trivially testable.

import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/coss/button";
import type { SelfHostInfo } from "#/features/settings/self-host/api";
import { apiFetch } from "#/lib/api-client";

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
    <section>
      <header>
        <h2 className="font-semibold text-xl">Self-host</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Deployment metadata for this Devy instance.
        </p>
      </header>

      {error && (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {error}
        </p>
      )}

      {info && (
        <>
          <div className="mt-6 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.label}
                    className={idx > 0 ? "border-border border-t" : undefined}
                  >
                    <th
                      scope="row"
                      className="w-[200px] px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      {row.label}
                    </th>
                    <td className="px-4 py-3">
                      <code className="font-mono text-foreground">
                        {row.value ?? "—"}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="mt-8">
            <h3 className="font-semibold text-base">Data</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Export your signals or trigger a fresh rollup.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onExportJson?.()}
              >
                Export JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRunRollup?.()}
              >
                Run rollup
              </Button>
            </div>
          </section>

          <section className="mt-8">
            <h3 className="font-semibold text-base text-destructive">
              Danger zone
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Removes every connected provider and clears their stored tokens.
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDisconnectAll?.()}
              >
                Disconnect all providers
              </Button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
