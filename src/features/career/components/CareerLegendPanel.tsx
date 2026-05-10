// Settings → Career — 1–4 scale legend editor (PRD #115, slice #126).
//
// Reads/writes the singleton career_scale_legend row's label_1..label_4. The
// labels are what the wheel and the exported Sheet show as the score legend.
// Inline-edit + autosave on blur, matching the rest of Career.

import { useEffect, useState } from "react";
import {
  getScaleLegend,
  type ScaleLegend,
  setScaleLegend,
} from "#/features/career/store";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

const FIELDS: ReadonlyArray<{ key: keyof ScaleLegend; score: 1 | 2 | 3 | 4 }> =
  [
    { key: "label_1", score: 1 },
    { key: "label_2", score: 2 },
    { key: "label_3", score: 3 },
    { key: "label_4", score: 4 },
  ];

export function CareerLegendPanel({
  client = supabase as unknown as SupabaseLike,
}: {
  client?: SupabaseLike;
} = {}) {
  const [legend, setLegend] = useState<ScaleLegend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getScaleLegend(client)
      .then((l) => {
        if (!cancelled) setLegend(l);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleBlur = async (key: keyof ScaleLegend, value: string) => {
    if (!legend || legend[key] === value) return;
    const next = { ...legend, [key]: value };
    setLegend(next);
    try {
      await setScaleLegend(client, { [key]: value });
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save legend");
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="font-semibold text-2xl tracking-tight">Career</h2>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Labels for the 1–4 score scale used by the wheel and exported sheets.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {error}
        </p>
      )}

      {legend === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="max-w-xl space-y-3 rounded-lg border border-border bg-card p-5">
          <h3 className="font-medium text-foreground text-sm">
            Scale legend (1–4)
          </h3>
          <ul className="space-y-2">
            {FIELDS.map(({ key, score }) => (
              <li key={key} className="flex items-center gap-3">
                <span className="w-6 font-mono text-muted-foreground text-xs">
                  {score}
                </span>
                <LegendInput
                  defaultValue={legend[key]}
                  ariaLabel={`Label for score ${score}`}
                  onCommit={(v) => handleBlur(key, v)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function LegendInput({
  defaultValue,
  ariaLabel,
  onCommit,
}: {
  defaultValue: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(defaultValue);
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      placeholder="e.g. Beginner"
      className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
    />
  );
}
