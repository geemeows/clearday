import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Kanban, X } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "#/components/coss/button";
import {
  createColumn,
  createProject,
  listProjects,
  type StoredProject,
} from "#/features/projects/store";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

const searchSchema = z.object({
  mode: z.string().optional(),
});

export const Route = createFileRoute("/_app/projects/")({
  validateSearch: searchSchema,
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
  const { mode } = Route.useSearch();
  const [projects, setProjects] = useState<StoredProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = supabase as unknown as SupabaseLike;

  useEffect(() => {
    let cancelled = false;
    listProjects(client)
      .then((list) => {
        if (cancelled) return;
        if (list.length > 0 && mode !== "new") {
          router.navigate({
            to: "/projects/$projectId",
            params: { projectId: list[0].id },
          });
        } else {
          setProjects(list);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, router.navigate]);

  const handleCreate = async (name: string, columns: string[]) => {
    const projectId = crypto.randomUUID();
    try {
      await createProject(client, { id: projectId, name });
      for (let i = 0; i < columns.length; i++) {
        await createColumn(client, {
          id: crypto.randomUUID(),
          project_id: projectId,
          name: columns[i],
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

type ColumnMode = "template" | "custom";

export function OnboardingView({
  onCreateProject,
}: {
  onCreateProject: (name: string, columns: string[]) => void;
}) {
  const [name, setName] = useState("My first project");
  const [columnMode, setColumnMode] = useState<ColumnMode>("template");
  const [customColumns, setCustomColumns] = useState<string[]>([
    "To do",
    "In progress",
    "Done",
  ]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    const cols =
      columnMode === "template"
        ? [...DEFAULT_TEMPLATE_COLUMNS]
        : customColumns.map((c) => c.trim()).filter(Boolean);
    onCreateProject(name.trim(), cols);
  };

  const addCustomColumn = () => setCustomColumns((cs) => [...cs, ""]);
  const removeCustomColumn = (i: number) =>
    setCustomColumns((cs) => cs.filter((_, idx) => idx !== i));
  const updateCustomColumn = (i: number, val: string) =>
    setCustomColumns((cs) => cs.map((c, idx) => (idx === i ? val : c)));

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

      <section
        aria-label="Create project"
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="mb-1 font-semibold text-lg text-foreground">
          Create a project
        </h2>
        <p className="mb-6 text-muted-foreground text-sm">
          Choose a name and pick a column layout to get started.
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

          <div className="space-y-3">
            <fieldset
              aria-label="Column layout"
              className="flex gap-2 border-0 p-0"
            >
              <button
                type="button"
                aria-pressed={columnMode === "template"}
                onClick={() => setColumnMode("template")}
                className={
                  columnMode === "template"
                    ? "rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-primary text-sm font-medium"
                    : "rounded-md border border-border px-3 py-1.5 text-muted-foreground text-sm hover:bg-accent"
                }
              >
                Template
              </button>
              <button
                type="button"
                aria-pressed={columnMode === "custom"}
                onClick={() => setColumnMode("custom")}
                className={
                  columnMode === "custom"
                    ? "rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-primary text-sm font-medium"
                    : "rounded-md border border-border px-3 py-1.5 text-muted-foreground text-sm hover:bg-accent"
                }
              >
                Custom columns
              </button>
            </fieldset>

            {columnMode === "template" ? (
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
            ) : (
              <ul
                aria-label="Custom columns"
                className="list-none space-y-1.5 p-0"
              >
                {customColumns.map((col, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: customColumns is a string[] with no stable per-row id; using index here means deleting a middle row will shift focus, which is acceptable for this small inline editor.
                  <li key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={col}
                      onChange={(e) => updateCustomColumn(i, e.target.value)}
                      placeholder={`Column ${i + 1}`}
                      aria-label={`Column ${i + 1} name`}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomColumn(i)}
                      aria-label={`Remove column ${i + 1}`}
                      disabled={customColumns.length <= 1}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={addCustomColumn}
                    className="mt-1 text-muted-foreground text-xs hover:text-foreground"
                  >
                    + Add column
                  </button>
                </li>
              </ul>
            )}
          </div>

          <Button
            type="submit"
            disabled={!name.trim() || submitting}
            className="w-full"
          >
            {submitting ? "Creating…" : "Create project"}
          </Button>
        </form>
      </section>
    </section>
  );
}
