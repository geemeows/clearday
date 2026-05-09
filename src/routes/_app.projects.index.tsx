import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Kanban } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/coss/button";
import {
  createColumn,
  createProject,
  listProjects,
  type StoredProject,
} from "#/features/projects/store";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

export const Route = createFileRoute("/_app/projects/")({
  component: ProjectsIndexPage,
});

const DEFAULT_TEMPLATE_COLUMNS = [
  "Backlog",
  "In progress",
  "In review",
  "Done",
] as const;

function ProjectsIndexPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<StoredProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = supabase as unknown as SupabaseLike;

  useEffect(() => {
    let cancelled = false;
    listProjects(client)
      .then((list) => {
        if (cancelled) return;
        if (list.length > 0) {
          router.navigate({
            to: "/projects/$projectId",
            params: { projectId: list[0].id },
          });
        } else {
          setProjects([]);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (name: string) => {
    const projectId = crypto.randomUUID();
    try {
      await createProject(client, { id: projectId, name });
      for (let i = 0; i < DEFAULT_TEMPLATE_COLUMNS.length; i++) {
        await createColumn(client, {
          id: crypto.randomUUID(),
          project_id: projectId,
          name: DEFAULT_TEMPLATE_COLUMNS[i],
          order: i,
        });
      }
      router.navigate({
        to: "/projects/$projectId",
        params: { projectId },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create project");
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

  if (projects === null) {
    return (
      <section
        aria-busy="true"
        className="mx-auto max-w-2xl p-8 text-muted-foreground text-sm"
      >
        Loading…
      </section>
    );
  }

  return <OnboardingView onCreateProject={handleCreate} />;
}

export function OnboardingView({
  onCreateProject,
}: {
  onCreateProject: (name: string) => void;
}) {
  const [name, setName] = useState("My first project");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    onCreateProject(name.trim());
  };

  return (
    <section className="mx-auto max-w-2xl p-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Kanban className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl text-foreground tracking-tight">
            Projects
          </h1>
          <p className="text-muted-foreground text-sm">
            Organise your work into kanban boards
          </p>
        </div>
      </header>

      <div
        role="region"
        aria-label="Create your first project"
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="mb-1 font-semibold text-lg text-foreground">
          Create your first project
        </h2>
        <p className="mb-6 text-muted-foreground text-sm">
          Starts with Backlog · In progress · In review · Done columns. You
          can rename, reorder, and add more later.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="project-name"
              className="text-foreground text-sm font-medium"
            >
              Project name
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Backend refactor"
              required
              disabled={submitting}
            />
          </div>

          <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5 text-muted-foreground text-xs">
            <span className="font-medium text-foreground">Template:</span>
            {DEFAULT_TEMPLATE_COLUMNS.map((col, i) => (
              <span key={col}>
                {col}
                {i < DEFAULT_TEMPLATE_COLUMNS.length - 1 && (
                  <span className="ml-3 opacity-40">→</span>
                )}
              </span>
            ))}
          </div>

          <Button
            type="submit"
            disabled={!name.trim() || submitting}
            className="w-full"
          >
            {submitting ? "Creating…" : "Create project"}
          </Button>
        </form>
      </div>
    </section>
  );
}
