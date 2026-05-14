// Automations route — wires the loader and onSave handler to the API.
// Type-mapping between engine Automation (DB shape) and AutomationItem (UI shape)
// lives here at the boundary so the feature component stays decoupled from the
// DB schema.

import { createFileRoute } from "@tanstack/react-router";
import type { Automation, AutomationAction as EngineAction, AutomationPredicate as EnginePredicate } from "#/features/automations/engine";
import {
  AutomationsPage,
  type AutomationItem,
  type AutomationPredicate as UiPredicate,
  type AutomationAction as UiAction,
} from "#/features/automations/components/AutomationsPage";
import { apiFetch } from "#/lib/api-client";

// ── Mappers: engine (DB) → UI ────────────────────────────────────────────────

function mapPredicateToUi(p: EnginePredicate): UiPredicate {
  switch (p.type) {
    case "kind":
      return { field: "signal.kind", op: "equals", value: p.kind };
    case "provider":
      return { field: "signal.source", op: "equals", value: p.provider };
    case "source_match":
      return { field: `signal.${p.field}`, op: "equals", value: p.equals };
    case "title_regex":
      return { field: "signal.title", op: "contains_any", value: p.pattern };
    case "state_from_to":
      return {
        field: `transition.${p.field}`,
        op: "equals",
        value: p.to ?? p.from ?? "",
      };
  }
}

function mapActionToUi(act: EngineAction): UiAction {
  switch (act.type) {
    case "post_message":
      return {
        kind: "slack_post_message",
        config: { target: act.target, channel: act.channel, body: act.body },
      };
    case "comment_on_pr":
      return { kind: "github_comment", config: { body: act.body } };
    case "request_reviewers":
      return { kind: "github_request_reviewers", config: {} };
    case "set_focus":
      return { kind: "set_focus", config: { minutes: act.duration_minutes } };
    case "tag":
      return { kind: "tag", config: { tags: [act.tag] } };
    case "snooze":
      return { kind: "snooze", config: { minutes: act.minutes } };
    case "set_priority":
      return { kind: "set_priority", config: { priority: act.value } };
    case "dismiss":
      return { kind: "dismiss", config: {} };
    case "transition_ticket":
      return {
        kind: "transition_ticket",
        config: { to: act.to_status },
      };
    case "set_channels":
      return { kind: "dismiss", config: {} };
  }
}

function automationToItem(a: Automation): AutomationItem {
  return {
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    dryRun: a.dry_run ?? false,
    priority: a.priority,
    trigger: {
      kind: a.trigger_kind,
      cron: a.trigger_config?.cron,
      ...(a.trigger_config?.cron ? { cronLabel: a.trigger_config.cron } : {}),
    },
    predicates: a.predicates.map(mapPredicateToUi),
    actions: a.actions.map(mapActionToUi),
    stats: {
      lastRunAt: a.run_stats?.last_run_at ?? null,
      lastStatus: null,
      totalRuns: a.run_stats?.total_runs ?? 0,
      fail7d: a.run_stats?.fail_7d ?? 0,
    },
  };
}

// ── Mappers: UI → engine (DB) ────────────────────────────────────────────────

function mapPredicateFromUi(p: UiPredicate): EnginePredicate {
  if (p.field === "signal.kind") {
    return { type: "kind", kind: String(p.value) };
  }
  if (p.field === "signal.source" || p.field === "signal.provider") {
    return { type: "provider", provider: String(p.value) };
  }
  if (p.field === "signal.title") {
    return { type: "title_regex", pattern: String(p.value) };
  }
  if (p.field.startsWith("transition.")) {
    return {
      type: "state_from_to",
      field: p.field.slice("transition.".length),
      to: String(p.value),
    };
  }
  const dotIdx = p.field.lastIndexOf(".");
  const fieldName = dotIdx >= 0 ? p.field.slice(dotIdx + 1) : p.field;
  return { type: "source_match", field: fieldName, equals: String(p.value) };
}

function mapActionFromUi(act: UiAction): EngineAction | null {
  switch (act.kind) {
    case "slack_post_message":
      return {
        type: "post_message",
        target:
          (act.config.target as "channel" | "self_dm" | "thread_reply") ??
          "channel",
        body: act.config.body ?? "",
        ...(act.config.channel ? { channel: act.config.channel } : {}),
      };
    case "github_comment":
      return { type: "comment_on_pr", body: act.config.body ?? "" };
    case "github_request_reviewers":
      return { type: "request_reviewers", reviewers: [] };
    case "set_focus":
      return { type: "set_focus", duration_minutes: act.config.minutes ?? 25 };
    case "tag": {
      const tag = Array.isArray(act.config.tags)
        ? (act.config.tags[0] ?? "")
        : "";
      return { type: "tag", tag };
    }
    case "snooze":
      return { type: "snooze", minutes: act.config.minutes ?? 60 };
    case "set_priority":
      return {
        type: "set_priority",
        value: (act.config.priority as "low" | "high") ?? "low",
      };
    case "dismiss":
      return { type: "dismiss" };
    case "transition_ticket":
      return {
        type: "transition_ticket",
        to_status: act.config.to ?? "",
      };
    default:
      return null;
  }
}

function itemToAutomation(item: AutomationItem): Automation {
  return {
    id: item.id === "__new__" ? crypto.randomUUID() : item.id,
    name: item.name,
    enabled: item.enabled,
    dry_run: item.dryRun,
    priority: item.priority,
    trigger_kind: item.trigger.kind,
    ...(item.trigger.cron
      ? { trigger_config: { cron: item.trigger.cron } }
      : {}),
    predicates: item.predicates.map(mapPredicateFromUi),
    actions: item.actions
      .map(mapActionFromUi)
      .filter((a): a is EngineAction => a !== null),
  };
}

// ── Route ────────────────────────────────────────────────────────────────────

type LoaderData = { automations: Automation[] };

export const Route = createFileRoute("/_app/automations")({
  loader: async (): Promise<LoaderData> => {
    const data = (await apiFetch("/api/automations")) as LoaderData;
    return data;
  },
  component: AutomationsPageRoute,
  errorComponent: AutomationsErrorView,
});

function AutomationsPageRoute() {
  const { automations } = Route.useLoaderData();
  const items = automations.map(automationToItem);

  const handleSave = async (updatedItems: AutomationItem[]) => {
    await apiFetch("/api/automations", {
      method: "PUT",
      body: { automations: updatedItems.map(itemToAutomation) },
    });
  };

  return (
    <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
      <AutomationsPage items={items} onSave={handleSave} />
    </main>
  );
}

function AutomationsErrorView() {
  return (
    <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
      <div
        style={{
          padding: "32px",
          textAlign: "center",
          color: "var(--muted-foreground)",
          fontSize: 14,
        }}
      >
        Failed to load automations. Check your connection and refresh.
      </div>
    </main>
  );
}
