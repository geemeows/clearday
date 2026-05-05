// Tasks page kanban (per PRD #29 mockup #2). Four columns
// (To do / In progress / In review / Done this week) of TaskCards. Pure
// presentational over a typed `cards[]` — the route owns fetching and
// mock-padding.

import { GitPullRequest } from "lucide-react";
import { SourceGlyph, type SourceKind } from "#/components/SourceGlyph";
import { cn } from "#/lib/cn";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "P1" | "P2" | "P3";

export type TaskCard = {
  key: string;
  id: string;
  source: SourceKind;
  status: TaskStatus;
  priority: TaskPriority;
  title: string;
  labels: string[];
  daysInProgress: number;
  prNumber?: number | null;
  url?: string | null;
};

const COLUMNS: ReadonlyArray<{
  status: TaskStatus;
  label: string;
  toneClass: string;
}> = [
  { status: "todo", label: "To do", toneClass: "bg-zinc-400" },
  { status: "in_progress", label: "In progress", toneClass: "bg-sky-500" },
  { status: "in_review", label: "In review", toneClass: "bg-amber-500" },
  { status: "done", label: "Done this week", toneClass: "bg-emerald-500" },
];

const PRIORITY_TONE: Record<TaskPriority, string> = {
  P1: "bg-red-100 text-red-800 border-red-200",
  P2: "bg-amber-100 text-amber-800 border-amber-200",
  P3: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function TasksKanban({ cards }: { cards: TaskCard[] }) {
  return (
    <ul
      aria-label="Task columns"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 list-none p-0"
    >
      {COLUMNS.map((col) => {
        const columnCards = cards.filter((c) => c.status === col.status);
        return (
          <li
            key={col.status}
            aria-label={col.label}
            data-column={col.status}
            className="rounded-md border border-border bg-muted p-3"
          >
            <header className="mb-3 flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn("h-2 w-2 rounded-full", col.toneClass)}
              />
              <h2 className="text-sm font-medium text-foreground">
                {col.label}
              </h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {columnCards.length}
              </span>
            </header>
            <ul className="space-y-2">
              {columnCards.map((card) => (
                <li key={card.key}>
                  <TaskCardView card={card} />
                </li>
              ))}
              {columnCards.length === 0 && (
                <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  Nothing here.
                </li>
              )}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function TaskCardView({ card }: { card: TaskCard }) {
  return (
    <article
      data-priority={card.priority}
      aria-label={card.title}
      className="rounded-md border border-border bg-card p-3 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <SourceGlyph source={card.source} size={20} />
        <span className="font-mono text-xs text-muted-foreground">
          {card.id}
        </span>
        <span
          data-priority-chip={card.priority}
          className={cn(
            "ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
            PRIORITY_TONE[card.priority],
          )}
        >
          {card.priority}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{card.title}</p>
      {card.labels.length > 0 && (
        <ul aria-label="Labels" className="mt-2 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <li
              key={l}
              className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {l}
            </li>
          ))}
        </ul>
      )}
      <footer className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{card.daysInProgress}d</span>
        {typeof card.prNumber === "number" && (
          <span
            data-pr-number
            className="inline-flex items-center gap-1 font-mono"
          >
            <GitPullRequest className="h-3 w-3" />#{card.prNumber}
          </span>
        )}
      </footer>
    </article>
  );
}
