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
    <section aria-label="Career settings">
      <h2 className="font-semibold text-xl tracking-[-0.2px] text-[var(--ink)]">
        Career settings
      </h2>
      <p className="mt-1 text-[var(--muted)] text-sm">
        Labels for the 1–4 score scale used by the career wheel and exported
        sheets.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-[var(--danger)] text-sm"
        >
          {error}
        </p>
      )}

      {legend === null ? (
        <p className="mt-6 text-[var(--muted)] text-sm">Loading…</p>
      ) : (
        <div className="mt-6 rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)]">
          <div className="border-[var(--hairline-soft)] border-b px-4 py-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
              SCALE LEGEND (1–4)
            </div>
          </div>
          <ul>
            {FIELDS.map(({ key, score }, i) => (
              <li
                key={key}
                className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-[var(--hairline-soft)] border-t" : ""}`}
              >
                <span className="w-5 font-mono text-[12px] text-[var(--muted)]">
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
      className="min-w-0 flex-1 rounded-md border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-1.5 text-[13px] text-[var(--ink)] placeholder:text-[var(--muted-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
    />
  );
}
