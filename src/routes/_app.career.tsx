import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/coss/button";
import {
  createLevel,
  getActiveLevel,
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

  return <CareerLevelView level={active} />;
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

export function CareerLevelView({ level }: { level: StoredLevel }) {
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
            Active level — competencies, criteria, indicators, and evidence
            land here in the next slice.
          </p>
        </div>
      </header>

      <div
        role="region"
        aria-label="Competency tree"
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <p className="text-muted-foreground text-sm">
          No competencies yet.
        </p>
      </div>
    </section>
  );
}
