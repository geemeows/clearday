import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  type TaskCard,
  type TaskStatus,
  TasksKanban,
} from "#/components/TasksKanban";
import { apiFetch } from "#/lib/api-client";
import type { Signal, SignalKind } from "#/shared/signal";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksPage,
});

type StoredSignal = Signal & { id: string; dismissed_at: string | null };

// TODO(post-redesign): replace with real Linear/Jira adapters per PRD #29.
const MOCK_TICKETS: TaskCard[] = [
  {
    key: "mock-eng-101",
    id: "ENG-101",
    source: "task",
    status: "todo",
    priority: "P1",
    title: "Migrate cron orchestrator to Durable Objects",
    labels: ["infra", "blocker"],
    daysInProgress: 0,
  },
  {
    key: "mock-eng-118",
    id: "ENG-118",
    source: "task",
    status: "todo",
    priority: "P3",
    title: "Tighten copy on onboarding hero",
    labels: ["copy"],
    daysInProgress: 0,
  },
  {
    key: "mock-eng-91",
    id: "ENG-91",
    source: "task",
    status: "in_progress",
    priority: "P2",
    title: "Slack DND auto-on during focus sessions",
    labels: ["focus", "slack"],
    daysInProgress: 2,
  },
  {
    key: "mock-eng-86",
    id: "ENG-86",
    source: "task",
    status: "in_review",
    priority: "P2",
    title: "Conflict banner on Calendar week view",
    labels: ["calendar"],
    daysInProgress: 4,
    prNumber: 412,
  },
  {
    key: "mock-eng-77",
    id: "ENG-77",
    source: "task",
    status: "done",
    priority: "P1",
    title: "Notification routing matrix",
    labels: ["notifications"],
    daysInProgress: 6,
    prNumber: 401,
  },
  {
    key: "mock-eng-72",
    id: "ENG-72",
    source: "task",
    status: "done",
    priority: "P3",
    title: "Self-host panel polish",
    labels: ["settings"],
    daysInProgress: 5,
  },
];

function TasksPage() {
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/signals?filter=prs")
      .then((body) => {
        if (cancelled) return;
        setSignals((body as { signals: StoredSignal[] }).signals);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => buildCards(signals ?? []), [signals]);

  return (
    <TasksView
      signals={signals}
      cards={cards}
      error={error}
      loading={signals === null}
    />
  );
}

export function TasksView({
  signals,
  cards,
  error,
  loading,
}: {
  signals: StoredSignal[] | null;
  cards: TaskCard[];
  error: string | null;
  loading: boolean;
}) {
  return (
    <section className="p-8">
      <header>
        <h1 className="text-xl font-semibold">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open work — your PRs from GitHub plus tickets from Linear/Jira.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {loading && !error && signals === null && (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      )}

      <div className="mt-6">
        <TasksKanban cards={cards} />
      </div>
    </section>
  );
}

export function buildCards(signals: StoredSignal[]): TaskCard[] {
  const ghCards = signals
    .map(signalToCard)
    .filter((c): c is TaskCard => c !== null);
  return [...ghCards, ...MOCK_TICKETS];
}

const PR_STATUS_BY_KIND: Partial<Record<SignalKind, TaskStatus>> = {
  pr_authored: "in_progress",
  pr_assigned: "in_review",
  pr_review_requested: "in_review",
};

function signalToCard(s: StoredSignal): TaskCard | null {
  const status = PR_STATUS_BY_KIND[s.kind];
  if (!status) return null;
  const repo = (s.payload?.repo as string | undefined) ?? "";
  const number = s.payload?.number as number | undefined;
  const id = repo && number ? `${repo}#${number}` : s.source_id;
  const labels = (s.payload?.labels as string[] | undefined) ?? [];
  return {
    key: s.id,
    id,
    source: "git",
    status,
    priority: derivePriority(s),
    title: s.title,
    labels,
    daysInProgress: daysSince(s.source_created_at),
    prNumber: typeof number === "number" ? number : null,
    url: s.url,
  };
}

function derivePriority(s: StoredSignal): "P1" | "P2" | "P3" {
  const label = (
    s.payload?.priority_label as string | undefined
  )?.toLowerCase();
  if (label === "urgent" || label === "high" || label === "p1") return "P1";
  if (label === "medium" || label === "p2") return "P2";
  return "P3";
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  const ms = Date.now() - t;
  return Math.max(0, Math.floor(ms / 86_400_000));
}
