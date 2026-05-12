// Wholesale port from docs/design/devy-ui/tasks.jsx (Redesign v4 / Slice 4).
//
// The live app has no Tasks backend yet, so the page renders against a
// co-located fixture typed against the eventual shape. A `needs-triage`
// backend follow-up issue tracks wiring the model + persistence; the swap
// will be mechanical.

import { createFileRoute } from "@tanstack/react-router";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "P1" | "P2" | "P3";

export type Task = {
  id: string;
  title: string;
  p: TaskPriority;
  status: TaskStatus;
  days: number;
  pr: string | null;
  labels: string[];
};

export const FIXTURE_TASKS: Task[] = [
  {
    id: "DEV-441",
    title: "Add timestamp-replay rejection to slack-webhook",
    p: "P1",
    status: "in_progress",
    days: 1,
    pr: "#421",
    labels: ["security"],
  },
  {
    id: "DEV-447",
    title: "Cron orchestrator: idempotent retry tick",
    p: "P2",
    status: "in_progress",
    days: 3,
    pr: null,
    labels: ["infra"],
  },
  {
    id: "DEV-401",
    title: "Signal-store upsert benchmarks",
    p: "P3",
    status: "in_progress",
    days: 6,
    pr: "#410",
    labels: ["perf"],
  },
  {
    id: "DEV-432",
    title: "Privacy redactor patterns",
    p: "P2",
    status: "todo",
    days: 0,
    pr: null,
    labels: ["ai"],
  },
  {
    id: "DEV-455",
    title: "Settings shell: AI provider sub-page",
    p: "P2",
    status: "todo",
    days: 0,
    pr: null,
    labels: ["frontend"],
  },
  {
    id: "DEV-460",
    title: "Web-push VAPID key rotation flow",
    p: "P3",
    status: "todo",
    days: 0,
    pr: null,
    labels: ["alerts"],
  },
  {
    id: "DEV-388",
    title: "Onboarding: Slack-channel allowlist step",
    p: "P2",
    status: "review",
    days: 1,
    pr: "#398",
    labels: ["onboarding"],
  },
  {
    id: "DEV-378",
    title: "Calendar adapter: dedupe by event_id",
    p: "P3",
    status: "review",
    days: 2,
    pr: "#392",
    labels: ["sync"],
  },
  {
    id: "DEV-360",
    title: "Auth-proxy state token TTL audit",
    p: "P1",
    status: "done",
    days: 4,
    pr: "#372",
    labels: ["security"],
  },
];

type TaskColumn = {
  id: TaskStatus;
  label: string;
  toneVar: string;
};

const COLUMNS: TaskColumn[] = [
  { id: "todo", label: "To do", toneVar: "var(--muted-foreground)" },
  { id: "in_progress", label: "In progress", toneVar: "var(--primary)" },
  { id: "review", label: "In review", toneVar: "var(--warn)" },
  { id: "done", label: "Done this week", toneVar: "var(--good)" },
];

const PRIORITY_STYLE: Record<
  TaskPriority,
  { bg: string; color: string }
> = {
  P1: { bg: "var(--danger-soft)", color: "var(--danger)" },
  P2: { bg: "var(--warn-soft)", color: "var(--warn)" },
  P3: { bg: "var(--surface-strong)", color: "var(--muted-foreground)" },
};

export const Route = createFileRoute("/_app/tasks")({
  component: TasksRoute,
});

function TasksRoute() {
  return <TasksPage tasks={FIXTURE_TASKS} />;
}

export function TasksPage({ tasks }: { tasks: Task[] }) {
  return (
    <div className="mx-auto max-w-[1500px] px-9 pt-7 pb-12">
      <header className="mb-[18px] flex items-baseline">
        <h1
          className="m-0 font-semibold text-[44px] text-foreground leading-[1.05]"
          style={{ letterSpacing: "-0.6px" }}
        >
          Tasks
        </h1>
        <span className="ml-[14px] text-[13px] text-muted-foreground">
          {tasks.length} assigned to you · Linear · Sprint 24
        </span>
      </header>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          return (
            <section
              key={col.id}
              aria-label={col.label}
              className="rounded-lg border border-border bg-card px-3 pt-3.5 pb-3"
            >
              <header
                className="flex items-center gap-2 px-1.5 pb-2.5"
                style={{
                  borderBottom: "1px solid var(--hairline-soft)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: col.toneVar }}
                />
                <span className="font-semibold text-[13px] text-foreground">
                  {col.label}
                </span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {items.length}
                </span>
              </header>
              <ul className="flex flex-col gap-2 pt-2.5">
                {items.map((t) => (
                  <li key={t.id}>
                    <TaskCard task={t} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const pri = PRIORITY_STYLE[task.p];
  return (
    <article
      aria-label={task.id}
      className="rounded-[10px] px-3 py-2.5"
      style={{
        border: "1px solid var(--hairline-soft)",
        background: "var(--canvas)",
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="font-mono font-bold text-[10px] text-muted-foreground">
          {task.id}
        </span>
        <span
          className="rounded-sm px-1.5 font-semibold text-[9px]"
          style={{
            background: pri.bg,
            color: pri.color,
            padding: "1px 6px",
          }}
        >
          {task.p}
        </span>
        {task.pr && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            PR {task.pr}
          </span>
        )}
      </div>
      <div className="mb-1.5 font-medium text-[13px] text-foreground leading-[1.35]">
        {task.title}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {task.labels.map((l) => (
          <span
            key={l}
            className="rounded-[4px] font-mono font-medium text-[9px] text-muted-foreground"
            style={{
              background: "var(--surface-soft)",
              padding: "1px 6px",
            }}
          >
            {l}
          </span>
        ))}
        {task.days > 0 && (
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">
            {task.days}d
          </span>
        )}
      </div>
    </article>
  );
}
