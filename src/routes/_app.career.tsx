import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Target, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/coss/button";
import {
  createCompetency,
  createCriterion,
  createEvidence,
  createIndicator,
  createLevel,
  getActiveLevel,
  type LevelHeaderRow,
  listCompetencies,
  listCriteria,
  listEvidence,
  listIndicators,
  renameCompetency,
  renameCriterion,
  renameIndicator,
  searchProjectCards,
  setCriterionTarget,
  setLevelHeader,
  setIndicatorScore,
  softDeleteCompetency,
  softDeleteCriterion,
  softDeleteEvidence,
  softDeleteIndicator,
  type StoredCompetency,
  type StoredCriterion,
  type StoredEvidence,
  type StoredIndicator,
  type StoredLevel,
  updateEvidence,
} from "#/features/career/store";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

export const Route = createFileRoute("/_app/career")({
  component: CareerPage,
});

function CareerPage() {
  const [active, setActive] = useState<StoredLevel | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const client = supabase as unknown as SupabaseLike;

  useEffect(() => {
    let cancelled = false;
    getActiveLevel(client)
      .then((level) => {
        if (!cancelled) setActive(level);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (title: string) => {
    const id = crypto.randomUUID();
    try {
      await createLevel(client, { id, title });
      const level = await getActiveLevel(client);
      setActive(level);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create level");
    }
  };

  if (error) {
    return (
      <section className="mx-auto max-w-2xl p-8">
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {error}
        </p>
      </section>
    );
  }

  if (active === undefined) {
    return (
      <section
        aria-busy="true"
        className="mx-auto max-w-2xl p-8 text-muted-foreground text-sm"
      >
        Loading…
      </section>
    );
  }

  if (active === null) {
    return <CareerOnboardingView onCreateLevel={handleCreate} />;
  }

  return <CareerLevelView level={active} client={client} />;
}

export function CareerOnboardingView({
  onCreateLevel,
}: {
  onCreateLevel: (title: string) => void;
}) {
  const [title, setTitle] = useState("L4");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    onCreateLevel(title.trim());
  };

  return (
    <section className="mx-auto max-w-2xl p-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Target className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl text-foreground tracking-tight">
            Career
          </h1>
          <p className="text-muted-foreground text-sm">
            Track competencies, criteria, and evidence across your career levels.
          </p>
        </div>
      </header>

      <div
        role="region"
        aria-label="Create level"
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="mb-1 font-semibold text-lg text-foreground">
          Create your first level
        </h2>
        <p className="mb-6 text-muted-foreground text-sm">
          A level is your current rung — e.g. "L4" or "Staff Engineer". You'll
          add competencies, criteria, and evidence under it.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="career-level-title"
              className="text-foreground text-sm font-medium"
            >
              Level name
            </label>
            <input
              id="career-level-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. L4"
              required
              disabled={submitting}
            />
          </div>

          <Button
            type="submit"
            disabled={!title.trim() || submitting}
            className="w-full"
          >
            {submitting ? "Creating…" : "Create level"}
          </Button>
        </form>
      </div>
    </section>
  );
}

export function CareerLevelView({
  level,
  client,
}: {
  level: StoredLevel;
  client: SupabaseLike;
}) {
  const [competencies, setCompetencies] = useState<StoredCompetency[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCompetencies(client, level.id)
      .then((rows) => {
        if (!cancelled) setCompetencies(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, level.id]);

  const handleAdd = async (name: string) => {
    const id = crypto.randomUUID();
    const position = (competencies?.length ?? 0) * 1024;
    try {
      await createCompetency(client, {
        id,
        level_id: level.id,
        name,
        position,
      });
      const rows = await listCompetencies(client, level.id);
      setCompetencies(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add competency");
    }
  };

  const handleRename = async (id: string, name: string) => {
    setCompetencies((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, name } : c)) : prev,
    );
    try {
      await renameCompetency(client, id, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to rename competency");
    }
  };

  const handleDelete = async (id: string) => {
    const target = competencies?.find((c) => c.id === id);
    if (!target) return;
    if (!confirm(`Delete "${target.name}" and all its children?`)) return;
    setCompetencies((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    try {
      await softDeleteCompetency(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete competency");
    }
  };

  return (
    <section className="mx-auto max-w-4xl p-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Target className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl text-foreground tracking-tight">
            {level.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            Active level — add competencies to start building your tree.
          </p>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {error}
        </p>
      )}

      <LevelHeader level={level} client={client} />

      <div
        role="region"
        aria-label="Competency tree"
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        {competencies === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : competencies.length === 0 ? (
          <p className="mb-4 text-muted-foreground text-sm">
            No competencies yet.
          </p>
        ) : (
          <ul className="mb-4 space-y-2">
            {competencies.map((c) => (
              <CompetencyRow
                key={c.id}
                competency={c}
                client={client}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}

        <AddCompetencyForm onAdd={handleAdd} />
      </div>
    </section>
  );
}

export function LevelHeader({
  level,
  client,
}: {
  level: StoredLevel;
  client: SupabaseLike;
}) {
  const [rows, setRows] = useState<LevelHeaderRow[]>(level.header ?? []);
  const [error, setError] = useState<string | null>(null);

  const persist = async (next: LevelHeaderRow[]) => {
    setRows(next);
    try {
      await setLevelHeader(client, level.id, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save header");
    }
  };

  const addRow = () => {
    persist([...rows, { key: "", value: "" }]);
  };

  const updateRow = (i: number, field: "key" | "value", v: string) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [field]: v } : r));
    if (next[i]?.[field] === rows[i]?.[field]) return;
    persist(next);
  };

  const deleteRow = (i: number) => {
    persist(rows.filter((_, idx) => idx !== i));
  };

  const moveRow = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    const a = next[i];
    const b = next[j];
    if (!a || !b) return;
    next[i] = b;
    next[j] = a;
    persist(next);
  };

  return (
    <div
      role="region"
      aria-label="Level header"
      className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium text-foreground text-sm">Header</h2>
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          Add row
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
        >
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No header rows. Add role, employer, date, etc.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: header rows have no stable id; index is fine here
            <li key={i} className="flex items-center gap-2">
              <HeaderRow
                row={row}
                index={i}
                onRename={(v) => updateRow(i, "key", v)}
                onSetValue={(v) => updateRow(i, "value", v)}
                onDelete={() => deleteRow(i)}
                onMoveUp={i > 0 ? () => moveRow(i, -1) : undefined}
                onMoveDown={i < rows.length - 1 ? () => moveRow(i, 1) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HeaderRow({
  row,
  index,
  onRename,
  onSetValue,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  row: LevelHeaderRow;
  index: number;
  onRename: (v: string) => void;
  onSetValue: (v: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [keyDraft, setKeyDraft] = useState(row.key);
  const [valueDraft, setValueDraft] = useState(row.value);
  // Re-sync drafts when the underlying row changes (e.g. after a reorder or
  // delete repositions sibling rows into this index slot).
  useEffect(() => {
    setKeyDraft(row.key);
  }, [row.key]);
  useEffect(() => {
    setValueDraft(row.value);
  }, [row.value]);
  const label = row.key || `row ${index + 1}`;

  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="text"
        aria-label={`Header key for ${label}`}
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        onBlur={() => {
          if (keyDraft !== row.key) onRename(keyDraft);
        }}
        placeholder="Key"
        className="w-32 rounded border border-border bg-background px-2 py-1 text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/50"
      />
      <input
        type="text"
        aria-label={`Header value for ${label}`}
        value={valueDraft}
        onChange={(e) => setValueDraft(e.target.value)}
        onBlur={() => {
          if (valueDraft !== row.value) onSetValue(valueDraft);
        }}
        placeholder="Value"
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/50"
      />
      <button
        type="button"
        aria-label={`Move ${label} up`}
        onClick={onMoveUp}
        disabled={!onMoveUp}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
      >
        <ArrowUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        onClick={onMoveDown}
        disabled={!onMoveDown}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
      >
        <ArrowDown className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label={`Delete header row ${label}`}
        onClick={onDelete}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function CompetencyRow({
  competency,
  client,
  onRename,
  onDelete,
}: {
  competency: StoredCompetency;
  client: SupabaseLike;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState(competency.name);

  return (
    <li className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={`Rename competency ${competency.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim();
            if (trimmed && trimmed !== competency.name) {
              onRename(competency.id, trimmed);
            } else if (!trimmed) {
              setDraft(competency.name);
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-foreground text-sm outline-none focus:border-border focus:bg-muted"
        />
        <button
          type="button"
          aria-label={`Delete competency ${competency.name}`}
          onClick={() => onDelete(competency.id)}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <CriteriaList competency={competency} client={client} />
    </li>
  );
}

export function CriteriaList({
  competency,
  client,
}: {
  competency: StoredCompetency;
  client: SupabaseLike;
}) {
  const [criteria, setCriteria] = useState<StoredCriterion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCriteria(client, competency.id)
      .then((rows) => {
        if (!cancelled) setCriteria(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, competency.id]);

  const handleAdd = async (name: string) => {
    const id = crypto.randomUUID();
    const position = (criteria?.length ?? 0) * 1024;
    try {
      await createCriterion(client, {
        id,
        competency_id: competency.id,
        name,
        target: 1,
        position,
      });
      const rows = await listCriteria(client, competency.id);
      setCriteria(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add criterion");
    }
  };

  const handleRename = async (id: string, name: string) => {
    setCriteria((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, name } : c)) : prev,
    );
    try {
      await renameCriterion(client, id, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to rename criterion");
    }
  };

  const handleSetTarget = async (id: string, target: number) => {
    setCriteria((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, target } : c)) : prev,
    );
    try {
      await setCriterionTarget(client, id, target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update target");
    }
  };

  const handleDelete = async (id: string) => {
    const target = criteria?.find((c) => c.id === id);
    if (!target) return;
    if (
      !confirm(
        `Delete "${target.name}" and its indicators / evidence?`,
      )
    )
      return;
    setCriteria((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    try {
      await softDeleteCriterion(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete criterion");
    }
  };

  return (
    <div className="mt-2 ml-4 space-y-2 border-border border-l pl-4">
      {error && (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
        >
          {error}
        </p>
      )}
      {criteria === null ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : criteria.length === 0 ? null : (
        <ul className="space-y-1.5">
          {criteria.map((c) => (
            <CriterionRow
              key={c.id}
              criterion={c}
              client={client}
              onRename={handleRename}
              onSetTarget={handleSetTarget}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
      <AddCriterionForm onAdd={handleAdd} />
    </div>
  );
}

function CriterionRow({
  criterion,
  client,
  onRename,
  onSetTarget,
  onDelete,
}: {
  criterion: StoredCriterion;
  client: SupabaseLike;
  onRename: (id: string, name: string) => void;
  onSetTarget: (id: string, target: number) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState(criterion.name);
  const [targetDraft, setTargetDraft] = useState(String(criterion.target));

  return (
    <li className="rounded-md border border-border bg-card px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={`Rename criterion ${criterion.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim();
            if (trimmed && trimmed !== criterion.name) {
              onRename(criterion.id, trimmed);
            } else if (!trimmed) {
              setDraft(criterion.name);
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-foreground text-sm outline-none focus:border-border focus:bg-muted"
        />
        <input
          type="number"
          aria-label={`Target for ${criterion.name}`}
          min={1}
          max={4}
          step={1}
          value={targetDraft}
          onChange={(e) => setTargetDraft(e.target.value)}
          onBlur={() => {
            const parsed = Number.parseInt(targetDraft, 10);
            if (Number.isFinite(parsed)) {
              const clamped = Math.max(1, Math.min(4, parsed));
              setTargetDraft(String(clamped));
              if (clamped !== criterion.target) {
                onSetTarget(criterion.id, clamped);
              }
            } else {
              setTargetDraft(String(criterion.target));
            }
          }}
          className="w-12 rounded border border-border bg-background px-1.5 py-0.5 text-center text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="button"
          aria-label={`Delete criterion ${criterion.name}`}
          onClick={() => onDelete(criterion.id)}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <IndicatorList criterion={criterion} client={client} />
    </li>
  );
}

export function IndicatorList({
  criterion,
  client,
}: {
  criterion: StoredCriterion;
  client: SupabaseLike;
}) {
  const [indicators, setIndicators] = useState<StoredIndicator[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listIndicators(client, criterion.id)
      .then((rows) => {
        if (!cancelled) setIndicators(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, criterion.id]);

  const handleAdd = async (description: string) => {
    const id = crypto.randomUUID();
    const position = (indicators?.length ?? 0) * 1024;
    try {
      await createIndicator(client, {
        id,
        criterion_id: criterion.id,
        description,
        position,
      });
      const rows = await listIndicators(client, criterion.id);
      setIndicators(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add indicator");
    }
  };

  const handleRename = async (
    id: string,
    fields: { code?: string | null; description?: string; notes?: string | null },
  ) => {
    setIndicators((prev) =>
      prev ? prev.map((i) => (i.id === id ? { ...i, ...fields } : i)) : prev,
    );
    try {
      await renameIndicator(client, id, fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update indicator");
    }
  };

  const handleSetScore = async (id: string, score: number) => {
    setIndicators((prev) =>
      prev ? prev.map((i) => (i.id === id ? { ...i, score } : i)) : prev,
    );
    try {
      await setIndicatorScore(client, id, score);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update score");
    }
  };

  const handleDelete = async (id: string) => {
    const target = indicators?.find((i) => i.id === id);
    if (!target) return;
    const label = target.code || target.description || "indicator";
    if (!confirm(`Delete "${label}" and its evidence?`)) return;
    setIndicators((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    try {
      await softDeleteIndicator(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete indicator");
    }
  };

  return (
    <div className="mt-2 ml-4 space-y-1.5 border-border border-l pl-3">
      {error && (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
        >
          {error}
        </p>
      )}
      {indicators === null ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : indicators.length === 0 ? null : (
        <ul className="space-y-1">
          {indicators.map((i) => (
            <IndicatorRow
              key={i.id}
              indicator={i}
              client={client}
              onRename={handleRename}
              onSetScore={handleSetScore}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
      <AddIndicatorForm onAdd={handleAdd} />
    </div>
  );
}

function IndicatorRow({
  indicator,
  client,
  onRename,
  onSetScore,
  onDelete,
}: {
  indicator: StoredIndicator;
  client: SupabaseLike;
  onRename: (
    id: string,
    fields: { code?: string | null; description?: string; notes?: string | null },
  ) => void;
  onSetScore: (id: string, score: number) => void;
  onDelete: (id: string) => void;
}) {
  const [codeDraft, setCodeDraft] = useState(indicator.code ?? "");
  const [descDraft, setDescDraft] = useState(indicator.description);
  const [notesDraft, setNotesDraft] = useState(indicator.notes ?? "");
  const [scoreDraft, setScoreDraft] = useState(String(indicator.score));

  const label = indicator.code || indicator.description;

  return (
    <li className="rounded-md border border-border bg-background px-2 py-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={`Code for ${label}`}
          value={codeDraft}
          onChange={(e) => setCodeDraft(e.target.value)}
          onBlur={() => {
            const trimmed = codeDraft.trim();
            const next = trimmed === "" ? null : trimmed;
            if (next !== (indicator.code ?? null)) {
              onRename(indicator.id, { code: next });
            }
          }}
          placeholder="A"
          className="w-10 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-foreground text-xs outline-none focus:border-border focus:bg-muted"
        />
        <input
          type="text"
          aria-label={`Description for ${label}`}
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => {
            const trimmed = descDraft.trim();
            if (trimmed && trimmed !== indicator.description) {
              onRename(indicator.id, { description: trimmed });
            } else if (!trimmed) {
              setDescDraft(indicator.description);
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-foreground text-xs outline-none focus:border-border focus:bg-muted"
        />
        <input
          type="number"
          aria-label={`Score for ${label}`}
          min={1}
          max={4}
          step={1}
          value={scoreDraft}
          onChange={(e) => setScoreDraft(e.target.value)}
          onBlur={() => {
            const parsed = Number.parseInt(scoreDraft, 10);
            if (Number.isFinite(parsed)) {
              const clamped = Math.max(1, Math.min(4, parsed));
              setScoreDraft(String(clamped));
              if (clamped !== indicator.score) {
                onSetScore(indicator.id, clamped);
              }
            } else {
              setScoreDraft(String(indicator.score));
            }
          }}
          className="w-12 rounded border border-border bg-background px-1.5 py-0.5 text-center text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="button"
          aria-label={`Delete indicator ${label}`}
          onClick={() => onDelete(indicator.id)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <input
        type="text"
        aria-label={`Notes for ${label}`}
        value={notesDraft}
        onChange={(e) => setNotesDraft(e.target.value)}
        onBlur={() => {
          const trimmed = notesDraft.trim();
          const next = trimmed === "" ? null : trimmed;
          if (next !== (indicator.notes ?? null)) {
            onRename(indicator.id, { notes: next });
          }
        }}
        placeholder="Notes…"
        className="mt-1 w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-muted-foreground text-xs outline-none focus:border-border focus:bg-muted"
      />
      <EvidenceList indicator={indicator} client={client} />
    </li>
  );
}

export function EvidenceList({
  indicator,
  client,
}: {
  indicator: StoredIndicator;
  client: SupabaseLike;
}) {
  const [evidence, setEvidence] = useState<StoredEvidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEvidence(client, indicator.id)
      .then((rows) => {
        if (!cancelled) setEvidence(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, indicator.id]);

  const handleAdd = async (title: string) => {
    const id = crypto.randomUUID();
    const position = (evidence?.length ?? 0) * 1024;
    try {
      await createEvidence(client, {
        id,
        indicator_id: indicator.id,
        title,
        position,
      });
      const rows = await listEvidence(client, indicator.id);
      setEvidence(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add evidence");
    }
  };

  const handleUpdate = async (
    id: string,
    fields: {
      title?: string;
      url?: string | null;
      note?: string | null;
      card_id?: string | null;
    },
  ) => {
    setEvidence((prev) =>
      prev ? prev.map((ev) => (ev.id === id ? { ...ev, ...fields } : ev)) : prev,
    );
    try {
      await updateEvidence(client, id, fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update evidence");
    }
  };

  const handleDelete = async (id: string) => {
    const target = evidence?.find((ev) => ev.id === id);
    if (!target) return;
    if (!confirm(`Delete "${target.title}"?`)) return;
    setEvidence((prev) => (prev ? prev.filter((ev) => ev.id !== id) : prev));
    try {
      await softDeleteEvidence(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete evidence");
    }
  };

  return (
    <div className="mt-2 ml-3 space-y-1.5 border-border border-l pl-3">
      {error && (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
        >
          {error}
        </p>
      )}
      {evidence === null ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : evidence.length === 0 ? null : (
        <ul className="space-y-1">
          {evidence.map((ev) => (
            <EvidenceRow
              key={ev.id}
              evidence={ev}
              client={client}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
      <AddEvidenceForm onAdd={handleAdd} />
    </div>
  );
}

function EvidenceRow({
  evidence,
  client,
  onUpdate,
  onDelete,
}: {
  evidence: StoredEvidence;
  client: SupabaseLike;
  onUpdate: (
    id: string,
    fields: {
      title?: string;
      url?: string | null;
      note?: string | null;
      card_id?: string | null;
    },
  ) => void;
  onDelete: (id: string) => void;
}) {
  const [titleDraft, setTitleDraft] = useState(evidence.title);
  const [urlDraft, setUrlDraft] = useState(evidence.url ?? "");
  const [noteDraft, setNoteDraft] = useState(evidence.note ?? "");

  const isValidUrl = (s: string) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <li className="rounded-md border border-border bg-card px-2 py-1.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={`Title for ${evidence.title}`}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            const trimmed = titleDraft.trim();
            if (trimmed && trimmed !== evidence.title) {
              onUpdate(evidence.id, { title: trimmed });
            } else if (!trimmed) {
              setTitleDraft(evidence.title);
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-foreground text-xs outline-none focus:border-border focus:bg-muted"
        />
        <button
          type="button"
          aria-label={`Delete evidence ${evidence.title}`}
          onClick={() => onDelete(evidence.id)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="url"
          aria-label={`URL for ${evidence.title}`}
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onBlur={() => {
            const trimmed = urlDraft.trim();
            const next = trimmed === "" ? null : trimmed;
            if (next !== null && !isValidUrl(next)) {
              setUrlDraft(evidence.url ?? "");
              return;
            }
            if (next !== (evidence.url ?? null)) {
              onUpdate(evidence.id, { url: next });
            }
          }}
          placeholder="https://…"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-muted-foreground text-xs outline-none focus:border-border focus:bg-muted"
        />
        {evidence.url && (
          <a
            href={evidence.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${evidence.title} link`}
            className="text-primary text-xs underline"
          >
            open
          </a>
        )}
      </div>
      <input
        type="text"
        aria-label={`Note for ${evidence.title}`}
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          const trimmed = noteDraft.trim();
          const next = trimmed === "" ? null : trimmed;
          if (next !== (evidence.note ?? null)) {
            onUpdate(evidence.id, { note: next });
          }
        }}
        placeholder="Note…"
        className="mt-1 w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-muted-foreground text-xs outline-none focus:border-border focus:bg-muted"
      />
      <CardPicker
        evidence={evidence}
        client={client}
        onPick={(card_id) => onUpdate(evidence.id, { card_id })}
      />
    </li>
  );
}

export function CardPicker({
  evidence,
  client,
  onPick,
}: {
  evidence: StoredEvidence;
  client: SupabaseLike;
  onPick: (cardId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; title: string }>>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchProjectCards(client, query)
      .then((rows) => {
        if (!cancelled) setResults(rows);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, query]);

  return (
    <div className="mt-1 flex items-center gap-2">
      {evidence.card_id ? (
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          Linked card
          <button
            type="button"
            aria-label={`Unlink card from ${evidence.title}`}
            onClick={() => onPick(null)}
            className="rounded px-1 text-primary underline"
          >
            unlink
          </button>
        </span>
      ) : (
        <div className="relative flex-1">
          <input
            type="text"
            aria-label={`Search project cards for ${evidence.title}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Link a project card…"
            className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-muted-foreground text-xs outline-none focus:border-border focus:bg-muted"
          />
          {results.length > 0 && (
            <ul
              role="listbox"
              aria-label={`Card search results for ${evidence.title}`}
              className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-md"
            >
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r.id);
                      setQuery("");
                      setResults([]);
                    }}
                    className="w-full rounded px-2 py-1 text-left text-foreground text-xs hover:bg-muted"
                  >
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AddEvidenceForm({
  onAdd,
}: {
  onAdd: (title: string) => void;
}) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        aria-label="New evidence title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add evidence…"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <Button type="submit" disabled={!title.trim()} size="sm">
        Add evidence
      </Button>
    </form>
  );
}

export function AddIndicatorForm({
  onAdd,
}: {
  onAdd: (description: string) => void;
}) {
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDescription("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        aria-label="New indicator description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add indicator…"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <Button type="submit" disabled={!description.trim()} size="sm">
        Add indicator
      </Button>
    </form>
  );
}

export function AddCriterionForm({
  onAdd,
}: {
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        aria-label="New criterion name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add criterion…"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <Button type="submit" disabled={!name.trim()} size="sm">
        Add criterion
      </Button>
    </form>
  );
}

export function AddCompetencyForm({
  onAdd,
}: {
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        aria-label="New competency name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Engineering Excellence"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <Button type="submit" disabled={!name.trim()}>
        Add competency
      </Button>
    </form>
  );
}
