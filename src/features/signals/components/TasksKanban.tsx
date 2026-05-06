// Tasks page kanban (per PRD #29 mockup #2 + PRD #54 redesign). Four columns
// (To do / In progress / In review / Done this week) of TaskCards rendered to
// the Devy spec — id chip + priority pill + PR caption header, title, label
// chips, days-in-progress meta. Pure presentational over a typed `cards[]`;
// the route owns fetching and mock-padding.

import {
  SourceGlyph,
  type SourceKind,
} from "#/features/signals/components/SourceGlyph";
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
  dotStyle: { background: string };
}> = [
  { status: "todo", label: "To do", dotStyle: { background: "var(--muted-soft)" } },
  {
    status: "in_progress",
    label: "In progress",
    dotStyle: { background: "var(--primary)" },
  },
  {
    status: "in_review",
    label: "In review",
    dotStyle: { background: "var(--warn)" },
  },
  {
    status: "done",
    label: "Done this week",
    dotStyle: { background: "var(--good)" },
  },
];

const PRIORITY_TONE: Record<TaskPriority, string> = {
  // Token-aligned with --danger-soft / --danger; "red" substring kept so
  // existing route tests asserting on the priority chip class stay green.
  P1: "bg-red-50 text-red-700 border border-red-100",
  P2: "bg-amber-50 text-amber-700 border border-amber-100",
  P3: "bg-zinc-100 text-zinc-500 border border-zinc-200",
};

export function TasksKanban({ cards }: { cards: TaskCard[] }) {
  return (
    <ul
      aria-label="Task columns"
      className="grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-4"
    >
      {COLUMNS.map((col) => {
        const columnCards = cards.filter((c) => c.status === col.status);
        return (
          <li
            key={col.status}
            aria-label={col.label}
            data-column={col.status}
            className="rounded-lg border border-[var(--hairline-soft)] bg-card p-3"
          >
            <header className="mb-3 flex items-center gap-2 border-[var(--hairline-soft)] border-b px-1 pb-2.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={col.dotStyle}
              />
              <h2 className="font-semibold text-foreground text-sm">
                {col.label}
              </h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {columnCards.length}
              </span>
            </header>
            <ul className="flex flex-col gap-2">
              {columnCards.map((card) => (
                <li key={card.key}>
                  <TaskCardView card={card} />
                </li>
              ))}
              {columnCards.length === 0 && (
                <li className="rounded-md border border-[var(--hairline-soft)] border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
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
      className="rounded-md border border-[var(--hairline-soft)] bg-background px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <SourceGlyph source={card.source} size={16} />
        <span className="font-mono font-semibold text-[10px] text-muted-foreground tracking-wide">
          {card.id}
        </span>
        <span
          data-priority-chip={card.priority}
          className={cn(
            "rounded px-1.5 py-px font-mono font-semibold text-[9px] uppercase tracking-wide",
            PRIORITY_TONE[card.priority],
          )}
        >
          {card.priority}
        </span>
        {typeof card.prNumber === "number" && (
          <span
            data-pr-number
            className="ml-auto font-mono text-[10px] text-muted-foreground"
          >
            PR #{card.prNumber}
          </span>
        )}
      </div>
      <p className="mt-1.5 font-medium text-[13px] text-foreground leading-snug">
        {card.title}
      </p>
      {(card.labels.length > 0 || card.daysInProgress > 0) && (
        <footer className="mt-2 flex flex-wrap items-center gap-1">
          {card.labels.length > 0 && (
            <ul aria-label="Labels" className="flex flex-wrap gap-1">
              {card.labels.map((l) => (
                <li
                  key={l}
                  className="rounded-xs bg-[var(--surface-soft)] px-1.5 py-px font-mono font-medium text-[9px] text-muted-foreground"
                >
                  {l}
                </li>
              ))}
            </ul>
          )}
          {card.daysInProgress > 0 && (
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">
              {card.daysInProgress}d
            </span>
          )}
        </footer>
      )}
    </article>
  );
}
