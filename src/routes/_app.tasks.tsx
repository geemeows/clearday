// Wholesale port from docs/design/devy-ui/tasks.jsx (Redesign v4 / Slice 4).
//
// Slice 4 shipped the presentational tree against `FIXTURE_TASKS`. Issue #172
// landed the read path + status / link-PR / create / delete / assign mutations
// and wired them into the route. With `createTask` live, the fixture fallback
// is retired: an empty `listTasks` result now renders a real empty state that
// invites the user to create their first task via the inline form. The
// `FIXTURE_TASKS` export is kept for the presentational tests.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  createTask,
  deleteTask,
  linkTaskPr,
  listTasks,
  setTaskAssignee,
  setTaskDays,
  setTaskLabels,
  setTaskPriority,
  setTaskTitle,
  updateTaskStatus,
} from "#/features/tasks/store";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

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
  assignee: string | null;
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
    assignee: "you",
  },
  {
    id: "DEV-447",
    title: "Cron orchestrator: idempotent retry tick",
    p: "P2",
    status: "in_progress",
    days: 3,
    pr: null,
    labels: ["infra"],
    assignee: null,
  },
  {
    id: "DEV-401",
    title: "Signal-store upsert benchmarks",
    p: "P3",
    status: "in_progress",
    days: 6,
    pr: "#410",
    labels: ["perf"],
    assignee: null,
  },
  {
    id: "DEV-432",
    title: "Privacy redactor patterns",
    p: "P2",
    status: "todo",
    days: 0,
    pr: null,
    labels: ["ai"],
    assignee: null,
  },
  {
    id: "DEV-455",
    title: "Settings shell: AI provider sub-page",
    p: "P2",
    status: "todo",
    days: 0,
    pr: null,
    labels: ["frontend"],
    assignee: null,
  },
  {
    id: "DEV-460",
    title: "Web-push VAPID key rotation flow",
    p: "P3",
    status: "todo",
    days: 0,
    pr: null,
    labels: ["alerts"],
    assignee: null,
  },
  {
    id: "DEV-388",
    title: "Onboarding: Slack-channel allowlist step",
    p: "P2",
    status: "review",
    days: 1,
    pr: "#398",
    labels: ["onboarding"],
    assignee: null,
  },
  {
    id: "DEV-378",
    title: "Calendar adapter: dedupe by event_id",
    p: "P3",
    status: "review",
    days: 2,
    pr: "#392",
    labels: ["sync"],
    assignee: null,
  },
  {
    id: "DEV-360",
    title: "Auth-proxy state token TTL audit",
    p: "P1",
    status: "done",
    days: 4,
    pr: "#372",
    labels: ["security"],
    assignee: "you",
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
  const client = supabase as unknown as SupabaseLike;
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTasks(client)
      .then((list) => {
        if (cancelled) return;
        setTasks(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load tasks");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleMoveTask = async (id: string, status: TaskStatus) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      await updateTaskStatus(client, id, status);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to update task status");
    }
  };

  const handleCreateTask = async (task: Task) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks([task, ...tasks]);
    try {
      await createTask(client, task);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to create task");
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks(tasks.filter((t) => t.id !== id));
    try {
      await deleteTask(client, id);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to delete task");
    }
  };

  const handleLinkPr = async (id: string, pr: string | null) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, pr } : t)));
    try {
      await linkTaskPr(client, id, pr);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to link task pr");
    }
  };

  const handleSetPriority = async (id: string, p: TaskPriority) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, p } : t)));
    try {
      await setTaskPriority(client, id, p);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to update task priority");
    }
  };

  const handleSetTitle = async (id: string, title: string) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, title } : t)));
    try {
      await setTaskTitle(client, id, title);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to update task title");
    }
  };

  const handleSetDays = async (id: string, days: number) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, days } : t)));
    try {
      await setTaskDays(client, id, days);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to update task days");
    }
  };

  const handleSetLabels = async (id: string, labels: string[]) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, labels } : t)));
    try {
      await setTaskLabels(client, id, labels);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to update task labels");
    }
  };

  const handleAssign = async (id: string, assignee: string | null) => {
    if (tasks === null) return;
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, assignee } : t)));
    try {
      await setTaskAssignee(client, id, assignee);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : "failed to assign task");
    }
  };

  if (error) {
    return (
      <section className="mx-auto max-w-[1500px] px-9 pt-7 pb-12">
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {error}
        </p>
      </section>
    );
  }

  if (tasks === null) {
    return (
      <section
        aria-busy="true"
        className="mx-auto max-w-[1500px] px-9 pt-7 pb-12 text-muted-foreground text-sm"
      >
        Loading…
      </section>
    );
  }

  return (
    <TasksPage
      tasks={tasks}
      onMoveTask={handleMoveTask}
      onLinkPr={handleLinkPr}
      onAssign={handleAssign}
      onSetPriority={handleSetPriority}
      onSetTitle={handleSetTitle}
      onSetLabels={handleSetLabels}
      onSetDays={handleSetDays}
      onCreateTask={handleCreateTask}
      onDeleteTask={handleDeleteTask}
    />
  );
}

export function TasksPage({
  tasks,
  onMoveTask,
  onLinkPr,
  onAssign,
  onSetPriority,
  onSetTitle,
  onSetLabels,
  onSetDays,
  onCreateTask,
  onDeleteTask,
}: {
  tasks: Task[];
  onMoveTask?: (id: string, status: TaskStatus) => void;
  onLinkPr?: (id: string, pr: string | null) => void;
  onAssign?: (id: string, assignee: string | null) => void;
  onSetPriority?: (id: string, p: TaskPriority) => void;
  onSetTitle?: (id: string, title: string) => void;
  onSetLabels?: (id: string, labels: string[]) => void;
  onSetDays?: (id: string, days: number) => void;
  onCreateTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
}) {
  // Shared ref for the card currently being dragged. Mirrors the
  // `dragCardIdRef` pattern in src/routes/_app.projects.$projectId.tsx — avoids
  // dataTransfer serialization, keeps the test boundary honest.
  const dragTaskIdRef = useRef<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">(
    "all",
  );
  const [labelFilter, setLabelFilter] = useState<string>("all");
  const [prFilter, setPrFilter] = useState<"all" | "with" | "without">("all");
  const [daysFilter, setDaysFilter] = useState<"all" | "1" | "3" | "7">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<
    | "default"
    | "priority"
    | "days"
    | "id"
    | "title"
    | "assignee"
    | "pr"
    | "label"
  >("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [collapsedColumns, setCollapsedColumns] = useState<Set<TaskStatus>>(
    () => new Set(),
  );
  const toggleColumnCollapsed = (id: TaskStatus) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allCollapsed = collapsedColumns.size === COLUMNS.length;
  const toggleAllColumnsCollapsed = () => {
    setCollapsedColumns(
      allCollapsed ? new Set() : new Set(COLUMNS.map((c) => c.id)),
    );
  };
  const availableLabels = Array.from(
    new Set(tasks.flatMap((t) => t.labels)),
  ).sort();
  const availableAssignees = Array.from(
    new Set(
      tasks
        .map((t) => t.assignee)
        .filter((a): a is string => a !== null),
    ),
  ).sort();
  const filtersActive =
    mineOnly ||
    query !== "" ||
    priorityFilter !== "all" ||
    labelFilter !== "all" ||
    prFilter !== "all" ||
    daysFilter !== "all" ||
    assigneeFilter !== "all";
  const clearFilters = () => {
    setMineOnly(false);
    setQuery("");
    setPriorityFilter("all");
    setLabelFilter("all");
    setPrFilter("all");
    setDaysFilter("all");
    setAssigneeFilter("all");
  };
  const handleKeyboardMove = (id: string, direction: "left" | "right") => {
    if (!onMoveTask) return;
    const current = COLUMNS.findIndex(
      (c) => c.id === (tasks.find((t) => t.id === id)?.status ?? null),
    );
    if (current === -1) return;
    const next = direction === "left" ? current - 1 : current + 1;
    if (next < 0 || next >= COLUMNS.length) return;
    onMoveTask(id, COLUMNS[next].id);
  };
  const assignedToYou = tasks.filter((t) => t.assignee === "you").length;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTasks = tasks.filter((t) => {
    if (mineOnly && t.assignee !== "you") return false;
    if (priorityFilter !== "all" && t.p !== priorityFilter) return false;
    if (labelFilter !== "all" && !t.labels.includes(labelFilter)) return false;
    if (prFilter === "with" && t.pr === null) return false;
    if (prFilter === "without" && t.pr !== null) return false;
    if (daysFilter !== "all" && t.days < Number(daysFilter)) return false;
    if (assigneeFilter === "unassigned" && t.assignee !== null) return false;
    if (
      assigneeFilter !== "all" &&
      assigneeFilter !== "unassigned" &&
      t.assignee !== assigneeFilter
    )
      return false;
    if (normalizedQuery === "") return true;
    return (
      t.id.toLowerCase().includes(normalizedQuery) ||
      t.title.toLowerCase().includes(normalizedQuery)
    );
  });
  const PRIORITY_ORDER: Record<TaskPriority, number> = { P1: 0, P2: 1, P3: 2 };
  const visibleTasks =
    sortBy === "default"
      ? filteredTasks
      : [...filteredTasks].sort((a, b) => {
          const base =
            sortBy === "priority"
              ? PRIORITY_ORDER[a.p] - PRIORITY_ORDER[b.p]
              : sortBy === "days"
                ? b.days - a.days
                : sortBy === "title"
                  ? a.title.localeCompare(b.title)
                  : sortBy === "assignee"
                    ? a.assignee === null
                      ? b.assignee === null
                        ? 0
                        : 1
                      : b.assignee === null
                        ? -1
                        : a.assignee.localeCompare(b.assignee)
                    : sortBy === "pr"
                      ? a.pr === null
                        ? b.pr === null
                          ? 0
                          : 1
                        : b.pr === null
                          ? -1
                          : a.pr.localeCompare(b.pr)
                      : sortBy === "label"
                        ? a.labels.length === 0
                          ? b.labels.length === 0
                            ? 0
                            : 1
                          : b.labels.length === 0
                            ? -1
                            : a.labels[0].localeCompare(b.labels[0])
                        : a.id.localeCompare(b.id);
          return sortDir === "asc" ? base : -base;
        });
  const totalP1 = filteredTasks.filter((t) => t.p === "P1").length;
  const totalStale = filteredTasks.filter((t) => t.days >= 3).length;
  const totalUnassigned = filteredTasks.filter(
    (t) => t.assignee === null,
  ).length;
  const totalPrLinked = filteredTasks.filter((t) => t.pr !== null).length;
  const totalInReview = filteredTasks.filter(
    (t) => t.status === "review",
  ).length;
  const totalInProgress = filteredTasks.filter(
    (t) => t.status === "in_progress",
  ).length;
  const totalTodo = filteredTasks.filter((t) => t.status === "todo").length;
  return (
    <div className="mx-auto max-w-[1500px] px-9 pt-7 pb-12">
      <header className="mb-[18px] flex items-baseline">
        <h1
          className="m-0 font-semibold text-[44px] text-foreground leading-[1.05]"
          style={{ letterSpacing: "-0.6px" }}
        >
          Tasks
        </h1>
        <button
          type="button"
          aria-label="Show only tasks assigned to you"
          aria-pressed={mineOnly}
          onClick={() => setMineOnly((v) => !v)}
          className="ml-[14px] cursor-pointer border-none bg-transparent p-0 text-left text-[13px] text-muted-foreground underline-offset-2 hover:underline aria-pressed:text-foreground aria-pressed:underline"
        >
          {assignedToYou} assigned to you · Linear · Sprint 24
        </button>
        {totalP1 > 0 && (
          <span
            aria-label="Total P1 count"
            className="ml-2 rounded-sm font-mono font-semibold text-[10px]"
            style={{
              background: "var(--danger-soft)",
              color: "var(--danger)",
              padding: "1px 6px",
            }}
          >
            {totalP1} P1
          </span>
        )}
        {totalStale > 0 && (
          <span
            aria-label="Total stale count"
            className="ml-2 rounded-sm font-mono font-semibold text-[10px]"
            style={{
              background: "var(--warn-soft)",
              color: "var(--warn)",
              padding: "1px 6px",
            }}
          >
            {totalStale} ≥3d
          </span>
        )}
        {totalUnassigned > 0 && (
          <span
            aria-label="Total unassigned count"
            className="ml-2 rounded-sm font-mono font-semibold text-[10px]"
            style={{
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
              padding: "1px 6px",
            }}
          >
            {totalUnassigned} unassigned
          </span>
        )}
        {totalPrLinked > 0 && (
          <span
            aria-label="Total PR-linked count"
            className="ml-2 rounded-sm font-mono font-semibold text-[10px]"
            style={{
              background: "var(--good-soft)",
              color: "var(--good)",
              padding: "1px 6px",
            }}
          >
            {totalPrLinked} PR
          </span>
        )}
        {totalInReview > 0 && (
          <span
            aria-label="Total in-review count"
            className="ml-2 rounded-sm font-mono font-semibold text-[10px]"
            style={{
              background: "var(--brand-lavender-soft)",
              color: "var(--brand-lavender)",
              padding: "1px 6px",
            }}
          >
            {totalInReview} in review
          </span>
        )}
        {totalInProgress > 0 && (
          <span
            aria-label="Total in-progress count"
            className="ml-2 rounded-sm font-mono font-semibold text-[10px]"
            style={{
              background: "var(--brand-blue-soft)",
              color: "var(--brand-blue)",
              padding: "1px 6px",
            }}
          >
            {totalInProgress} in progress
          </span>
        )}
        {totalTodo > 0 && (
          <span
            aria-label="Total to-do count"
            className="ml-2 rounded-sm font-mono font-semibold text-[10px]"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent-foreground)",
              padding: "1px 6px",
            }}
          >
            {totalTodo} to do
          </span>
        )}
        <input
          aria-label="Filter tasks"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Filter by id or title"
          className="ml-auto w-56 rounded-[4px] border border-border bg-transparent px-2 py-[3px] text-[12px] text-foreground"
        />
        <select
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.currentTarget.value as TaskPriority | "all")
          }
          className="ml-2 rounded-[4px] border border-border bg-transparent px-1 py-[3px] font-mono text-[11px] text-muted-foreground"
        >
          <option value="all">All priorities</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        <select
          aria-label="Filter by label"
          value={labelFilter}
          onChange={(e) => setLabelFilter(e.currentTarget.value)}
          className="ml-2 rounded-[4px] border border-border bg-transparent px-1 py-[3px] font-mono text-[11px] text-muted-foreground"
        >
          <option value="all">All labels</option>
          {availableLabels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by PR"
          value={prFilter}
          onChange={(e) =>
            setPrFilter(
              e.currentTarget.value as "all" | "with" | "without",
            )
          }
          className="ml-2 rounded-[4px] border border-border bg-transparent px-1 py-[3px] font-mono text-[11px] text-muted-foreground"
        >
          <option value="all">All PR states</option>
          <option value="with">Has PR</option>
          <option value="without">No PR</option>
        </select>
        <select
          aria-label="Filter by days"
          value={daysFilter}
          onChange={(e) =>
            setDaysFilter(
              e.currentTarget.value as "all" | "1" | "3" | "7",
            )
          }
          className="ml-2 rounded-[4px] border border-border bg-transparent px-1 py-[3px] font-mono text-[11px] text-muted-foreground"
        >
          <option value="all">Any age</option>
          <option value="1">≥1d</option>
          <option value="3">≥3d</option>
          <option value="7">≥7d</option>
        </select>
        <select
          aria-label="Filter by assignee"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.currentTarget.value)}
          className="ml-2 rounded-[4px] border border-border bg-transparent px-1 py-[3px] font-mono text-[11px] text-muted-foreground"
        >
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {availableAssignees.map((a) => (
            <option key={a} value={a}>
              @{a}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button
            type="button"
            aria-label="Clear filters"
            onClick={clearFilters}
            className="ml-2 rounded-[4px] border border-border bg-transparent px-2 py-[3px] font-mono text-[11px] text-muted-foreground"
          >
            Clear
          </button>
        )}
        {filtersActive && (
          <span
            aria-label="Visible task count"
            className="ml-2 font-mono text-[11px] text-muted-foreground"
          >
            {filteredTasks.length} of {tasks.length}
          </span>
        )}
        <select
          aria-label="Sort tasks"
          value={sortBy}
          onChange={(e) =>
            setSortBy(
              e.currentTarget.value as
                | "default"
                | "priority"
                | "days"
                | "id"
                | "title"
                | "assignee"
                | "pr"
                | "label",
            )
          }
          className="ml-2 rounded-[4px] border border-border bg-transparent px-1 py-[3px] font-mono text-[11px] text-muted-foreground"
        >
          <option value="default">Default order</option>
          <option value="priority">Sort by priority</option>
          <option value="days">Sort by days</option>
          <option value="id">Sort by id</option>
          <option value="title">Sort by title</option>
          <option value="assignee">Sort by assignee</option>
          <option value="pr">Sort by PR</option>
          <option value="label">Sort by label</option>
        </select>
        {sortBy !== "default" && (
          <button
            type="button"
            aria-label="Toggle sort direction"
            aria-pressed={sortDir === "desc"}
            onClick={() =>
              setSortDir((d) => (d === "asc" ? "desc" : "asc"))
            }
            className="ml-2 rounded-[4px] border border-border bg-transparent px-2 py-[3px] font-mono text-[11px] text-muted-foreground"
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        )}
        <button
          type="button"
          aria-label="Collapse all columns"
          aria-pressed={allCollapsed}
          onClick={toggleAllColumnsCollapsed}
          className="ml-2 rounded-[4px] border border-border bg-transparent px-2 py-[3px] font-mono text-[11px] text-muted-foreground"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </header>

      {onCreateTask && <CreateTaskForm onCreateTask={onCreateTask} />}

      {visibleTasks.length === 0 && (
        <p
          role="status"
          className="mb-3 rounded-lg border border-border bg-card px-3 py-6 text-center text-[13px] text-muted-foreground"
        >
          {normalizedQuery !== "" ||
          priorityFilter !== "all" ||
          labelFilter !== "all" ||
          prFilter !== "all" ||
          daysFilter !== "all" ||
          assigneeFilter !== "all"
            ? "No tasks match your filter."
            : mineOnly
              ? "No tasks assigned to you."
              : onCreateTask
                ? "No tasks yet. Use the form above to create your first task."
                : "No tasks yet."}
        </p>
      )}

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        {COLUMNS.map((col) => {
          const items = visibleTasks.filter((t) => t.status === col.id);
          const collapsed = collapsedColumns.has(col.id);
          const p1Count = items.filter((t) => t.p === "P1").length;
          const staleCount = items.filter((t) => t.days >= 3).length;
          return (
            <section
              key={col.id}
              aria-label={col.label}
              onDragOver={
                onMoveTask
                  ? (e) => {
                      e.preventDefault();
                    }
                  : undefined
              }
              onDrop={
                onMoveTask
                  ? (e) => {
                      e.preventDefault();
                      const id = dragTaskIdRef.current;
                      dragTaskIdRef.current = null;
                      if (id) onMoveTask(id, col.id);
                    }
                  : undefined
              }
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
                {p1Count > 0 && (
                  <span
                    aria-label={`P1 count for ${col.label}`}
                    className="rounded-sm font-mono font-semibold text-[9px]"
                    style={{
                      background: "var(--danger-soft)",
                      color: "var(--danger)",
                      padding: "1px 6px",
                    }}
                  >
                    {p1Count} P1
                  </span>
                )}
                {staleCount > 0 && (
                  <span
                    aria-label={`Stale count for ${col.label}`}
                    className="rounded-sm font-mono font-semibold text-[9px]"
                    style={{
                      background: "var(--warn-soft)",
                      color: "var(--warn)",
                      padding: "1px 6px",
                    }}
                  >
                    {staleCount} ≥3d
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Collapse ${col.label}`}
                  aria-pressed={collapsed}
                  onClick={() => toggleColumnCollapsed(col.id)}
                  className="rounded-[4px] border border-border bg-transparent px-1 py-[1px] font-mono text-[9px] text-muted-foreground"
                >
                  {collapsed ? "+" : "−"}
                </button>
              </header>
              {!collapsed && items.length === 0 && (
                <p
                  aria-label={`No tasks in ${col.label}`}
                  className="pt-3 pb-1 text-center font-mono text-[10px] text-muted-foreground"
                >
                  No tasks
                </p>
              )}
              {!collapsed && items.length > 0 && (
              <ul className="flex flex-col gap-2 pt-2.5">
                {items.map((t) => (
                  <li key={t.id}>
                    <TaskCard
                      task={t}
                      onMoveTask={onMoveTask}
                      onLinkPr={onLinkPr}
                      onAssign={onAssign}
                      onSetPriority={onSetPriority}
                      onSetTitle={onSetTitle}
                      onSetLabels={onSetLabels}
                      onSetDays={onSetDays}
                      onDeleteTask={onDeleteTask}
                      onDragStart={
                        onMoveTask
                          ? () => {
                              dragTaskIdRef.current = t.id;
                            }
                          : undefined
                      }
                      onKeyboardMove={
                        onMoveTask
                          ? (dir) => handleKeyboardMove(t.id, dir)
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onMoveTask,
  onLinkPr,
  onAssign,
  onSetPriority,
  onSetTitle,
  onSetLabels,
  onSetDays,
  onDeleteTask,
  onDragStart,
  onKeyboardMove,
}: {
  task: Task;
  onMoveTask?: (id: string, status: TaskStatus) => void;
  onLinkPr?: (id: string, pr: string | null) => void;
  onAssign?: (id: string, assignee: string | null) => void;
  onSetPriority?: (id: string, p: TaskPriority) => void;
  onSetTitle?: (id: string, title: string) => void;
  onSetLabels?: (id: string, labels: string[]) => void;
  onSetDays?: (id: string, days: number) => void;
  onDeleteTask?: (id: string) => void;
  onDragStart?: () => void;
  onKeyboardMove?: (direction: "left" | "right") => void;
}) {
  const pri = PRIORITY_STYLE[task.p];
  return (
    <article
      aria-label={task.id}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      tabIndex={onKeyboardMove ? 0 : undefined}
      onKeyDown={
        onKeyboardMove
          ? (e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                onKeyboardMove("left");
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                onKeyboardMove("right");
              }
            }
          : undefined
      }
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
        {onSetPriority ? (
          <select
            aria-label={`Priority for ${task.id}`}
            value={task.p}
            onChange={(e) =>
              onSetPriority(task.id, e.currentTarget.value as TaskPriority)
            }
            className="rounded-sm font-semibold text-[9px]"
            style={{
              background: pri.bg,
              color: pri.color,
              padding: "1px 6px",
              border: "none",
            }}
          >
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
        ) : (
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
        )}
        {onAssign ? (
          <AssigneeInput task={task} onAssign={onAssign} />
        ) : (
          task.assignee && (
            <span className="font-mono text-[10px] text-muted-foreground">
              @{task.assignee}
            </span>
          )
        )}
        {onLinkPr ? (
          <PrLinkInput task={task} onLinkPr={onLinkPr} />
        ) : (
          task.pr && (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              PR {task.pr}
            </span>
          )
        )}
      </div>
      {onSetTitle ? (
        <TitleInput task={task} onSetTitle={onSetTitle} />
      ) : (
        <div className="mb-1.5 font-medium text-[13px] text-foreground leading-[1.35]">
          {task.title}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {onSetLabels ? (
          <LabelsInput task={task} onSetLabels={onSetLabels} />
        ) : (
          task.labels.map((l) => (
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
          ))
        )}
        {onSetDays ? (
          <DaysInput task={task} onSetDays={onSetDays} />
        ) : (
          task.days > 0 && (
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">
              {task.days}d
            </span>
          )
        )}
        {onDeleteTask && (
          <button
            type="button"
            aria-label={`Delete ${task.id}`}
            onClick={() => onDeleteTask(task.id)}
            className={
              onSetDays || task.days > 0
                ? "ml-1 rounded-[4px] border border-border bg-transparent px-1 py-[1px] font-mono text-[9px] text-muted-foreground"
                : "ml-auto rounded-[4px] border border-border bg-transparent px-1 py-[1px] font-mono text-[9px] text-muted-foreground"
            }
          >
            ×
          </button>
        )}
        {onMoveTask && (
          <select
            aria-label={`Status for ${task.id}`}
            value={task.status}
            onChange={(e) =>
              onMoveTask(task.id, e.currentTarget.value as TaskStatus)
            }
            className={
              onSetDays || task.days > 0 || onDeleteTask
                ? "ml-1.5 rounded-[4px] border border-border bg-transparent px-1 py-[1px] font-mono text-[9px] text-muted-foreground"
                : "ml-auto rounded-[4px] border border-border bg-transparent px-1 py-[1px] font-mono text-[9px] text-muted-foreground"
            }
          >
            {COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </article>
  );
}

function CreateTaskForm({
  onCreateTask,
}: {
  onCreateTask: (task: Task) => void;
}) {
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("P3");
  const [status, setStatus] = useState<TaskStatus>("todo");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedId = id.trim();
    const trimmedTitle = title.trim();
    if (!trimmedId || !trimmedTitle) return;
    onCreateTask({
      id: trimmedId,
      title: trimmedTitle,
      p: priority,
      status,
      days: 0,
      pr: null,
      labels: [],
      assignee: null,
    });
    setId("");
    setTitle("");
    setPriority("P3");
    setStatus("todo");
  };

  return (
    <form
      aria-label="Create task"
      onSubmit={handleSubmit}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
    >
      <input
        aria-label="New task id"
        value={id}
        onChange={(e) => setId(e.currentTarget.value)}
        placeholder="DEV-###"
        className="w-24 rounded-[4px] border border-border bg-transparent px-2 py-[3px] font-mono text-[11px] text-foreground"
      />
      <input
        aria-label="New task title"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        placeholder="Title"
        className="flex-1 rounded-[4px] border border-border bg-transparent px-2 py-[3px] text-[12px] text-foreground"
      />
      <select
        aria-label="New task priority"
        value={priority}
        onChange={(e) => setPriority(e.currentTarget.value as TaskPriority)}
        className="rounded-[4px] border border-border bg-transparent px-1 py-[3px] font-mono text-[11px] text-muted-foreground"
      >
        <option value="P1">P1</option>
        <option value="P2">P2</option>
        <option value="P3">P3</option>
      </select>
      <select
        aria-label="New task status"
        value={status}
        onChange={(e) => setStatus(e.currentTarget.value as TaskStatus)}
        className="rounded-[4px] border border-border bg-transparent px-1 py-[3px] font-mono text-[11px] text-muted-foreground"
      >
        {COLUMNS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!id.trim() || !title.trim()}
        className="rounded-[4px] border border-border bg-primary/10 px-2 py-[3px] text-[11px] text-primary disabled:opacity-40"
      >
        Add task
      </button>
    </form>
  );
}

function TitleInput({
  task,
  onSetTitle,
}: {
  task: Task;
  onSetTitle: (id: string, title: string) => void;
}) {
  const [value, setValue] = useState(task.title);
  useEffect(() => {
    setValue(task.title);
  }, [task.title]);
  const commit = () => {
    const next = value.trim();
    if (next === "" || next === task.title) {
      setValue(task.title);
      return;
    }
    onSetTitle(task.id, next);
  };
  return (
    <input
      aria-label={`Title for ${task.id}`}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className="mb-1.5 w-full rounded-[4px] border border-transparent bg-transparent px-1 py-[1px] font-medium text-[13px] text-foreground leading-[1.35] hover:border-border focus:border-border"
    />
  );
}

function AssigneeInput({
  task,
  onAssign,
}: {
  task: Task;
  onAssign: (id: string, assignee: string | null) => void;
}) {
  const [value, setValue] = useState(task.assignee ?? "");
  useEffect(() => {
    setValue(task.assignee ?? "");
  }, [task.assignee]);
  const commit = () => {
    const next = value.trim() === "" ? null : value.trim();
    if (next === task.assignee) return;
    onAssign(task.id, next);
  };
  return (
    <input
      aria-label={`Assignee for ${task.id}`}
      value={value}
      placeholder="@who"
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className="w-16 rounded-[4px] border border-border bg-transparent px-1 py-[1px] font-mono text-[10px] text-muted-foreground"
    />
  );
}

function LabelsInput({
  task,
  onSetLabels,
}: {
  task: Task;
  onSetLabels: (id: string, labels: string[]) => void;
}) {
  const stored = task.labels.join(", ");
  const [value, setValue] = useState(stored);
  useEffect(() => {
    setValue(stored);
  }, [stored]);
  const commit = () => {
    const next = value
      .split(",")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (
      next.length === task.labels.length &&
      next.every((l, i) => l === task.labels[i])
    ) {
      return;
    }
    onSetLabels(task.id, next);
  };
  return (
    <input
      aria-label={`Labels for ${task.id}`}
      value={value}
      placeholder="labels"
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className="flex-1 rounded-[4px] border border-border bg-transparent px-1 py-[1px] font-mono text-[9px] text-muted-foreground"
    />
  );
}

function DaysInput({
  task,
  onSetDays,
}: {
  task: Task;
  onSetDays: (id: string, days: number) => void;
}) {
  const stored = String(task.days);
  const [value, setValue] = useState(stored);
  useEffect(() => {
    setValue(stored);
  }, [stored]);
  const commit = () => {
    const trimmed = value.trim();
    const next = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(next) || !Number.isInteger(next) || next < 0) {
      setValue(stored);
      return;
    }
    if (next === task.days) return;
    onSetDays(task.id, next);
  };
  return (
    <input
      aria-label={`Days for ${task.id}`}
      value={value}
      inputMode="numeric"
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className="ml-auto w-10 rounded-[4px] border border-border bg-transparent px-1 py-[1px] text-right font-mono text-[9px] text-muted-foreground"
    />
  );
}

function PrLinkInput({
  task,
  onLinkPr,
}: {
  task: Task;
  onLinkPr: (id: string, pr: string | null) => void;
}) {
  const [value, setValue] = useState(task.pr ?? "");
  useEffect(() => {
    setValue(task.pr ?? "");
  }, [task.pr]);
  const commit = () => {
    const next = value.trim() === "" ? null : value.trim();
    if (next === task.pr) return;
    onLinkPr(task.id, next);
  };
  return (
    <input
      aria-label={`PR for ${task.id}`}
      value={value}
      placeholder="PR"
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className="ml-auto w-14 rounded-[4px] border border-border bg-transparent px-1 py-[1px] font-mono text-[10px] text-muted-foreground"
    />
  );
}
