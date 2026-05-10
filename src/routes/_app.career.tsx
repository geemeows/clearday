import { createFileRoute } from "@tanstack/react-router";
import { Target, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/coss/button";
import {
  createCompetency,
  createLevel,
  getActiveLevel,
  listCompetencies,
  renameCompetency,
  softDeleteCompetency,
  type StoredCompetency,
  type StoredLevel,
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

function CompetencyRow({
  competency,
  onRename,
  onDelete,
}: {
  competency: StoredCompetency;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState(competency.name);

  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
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
    </li>
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
