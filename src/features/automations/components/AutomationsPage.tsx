// AutomationsPage — Redesign v5 / Automations (#183)
// List → Detail → Builder → Runs single-pane navigation.

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  InboxIcon,
  PlusIcon,
  TargetIcon,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { listRuns } from "#/features/automations/runs";
import type { AutomationRunRow } from "#/features/automations/runs";
import { supabase } from "#/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriggerKind =
  | "signal_ingested"
  | "signal_state_change"
  | "focus_started"
  | "focus_ended"
  | "schedule";

export type AutomationTrigger = {
  kind: TriggerKind;
  cron?: string;
  cronLabel?: string;
  watchFields?: string[];
};

export type PredicateOp =
  | "equals"
  | "not_equals"
  | "contains_any"
  | "contains_all"
  | "not_contains"
  | "is_true"
  | "is_false"
  | "in";

export type AutomationPredicate = {
  field: string;
  op: PredicateOp;
  value: string | boolean | string[];
};

export type ActionConfig = {
  target?: "channel" | "self_dm" | "thread_reply";
  channel?: string;
  body?: string;
  softIdempotencyKey?: string;
  tags?: string[];
  until?: string;
  priority?: string;
  minutes?: number;
  to?: string;
};

export type AutomationAction = {
  kind: string;
  config: ActionConfig;
};

export type RunStatus =
  | "succeeded"
  | "failed"
  | "skipped_idempotent"
  | "skipped_dry_run"
  | "partial"
  | "pending";

export type RunStats = {
  lastRunAt: string | null;
  lastStatus: RunStatus | null;
  totalRuns: number;
  fail7d: number;
  deferred?: number;
};

export type AutomationRun = {
  ts: string;
  status: RunStatus;
  trigger: string;
  actions: Array<{ kind: string; ref: string }>;
  error?: string;
};

export type AutomationItem = {
  id: string;
  name: string;
  enabled: boolean;
  dryRun: boolean;
  priority: number;
  trigger: AutomationTrigger;
  predicates: AutomationPredicate[];
  actions: AutomationAction[];
  stats: RunStats;
};

type AutomationMode = "list" | "detail" | "builder" | "runs";

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_KINDS: Array<{ id: TriggerKind; label: string; desc: string }> =
  [
    {
      id: "signal_ingested",
      label: "Signal ingested",
      desc: "Fires when a new Signal lands in the inbox",
    },
    {
      id: "signal_state_change",
      label: "Signal state changed",
      desc: "Fires when a Signal updates (commits, merge, reaction)",
    },
    {
      id: "focus_started",
      label: "Focus session started",
      desc: "Fires when you start a Focus block",
    },
    {
      id: "focus_ended",
      label: "Focus session ended",
      desc: "Fires when a Focus session ends",
    },
    {
      id: "schedule",
      label: "Schedule",
      desc: "Cron-like — fires every weekday at 9am, etc.",
    },
  ];

type ActionMeta = {
  id: string;
  group: string;
  label: string;
  desc: string;
  cap: boolean;
};

const ACTION_KINDS: ActionMeta[] = [
  {
    id: "slack_post_message",
    group: "Slack",
    label: "Post Slack message",
    desc: "Channel, self-DM, or thread reply",
    cap: true,
  },
  {
    id: "github_comment",
    group: "GitHub",
    label: "Comment on PR",
    desc: "Adds a PR review comment",
    cap: true,
  },
  {
    id: "github_request_reviewers",
    group: "GitHub",
    label: "Request reviewers",
    desc: "Re-request review from named users",
    cap: true,
  },
  {
    id: "set_focus",
    group: "Focus",
    label: "Start a Focus session",
    desc: "Begin a Focus block of N minutes",
    cap: true,
  },
  {
    id: "tag",
    group: "Internal",
    label: "Tag the Signal",
    desc: "Apply tags for inbox filtering",
    cap: true,
  },
  {
    id: "snooze",
    group: "Internal",
    label: "Snooze the Signal",
    desc: "Hide until a relative time",
    cap: true,
  },
  {
    id: "set_priority",
    group: "Internal",
    label: "Set Signal priority",
    desc: "Bump or lower priority",
    cap: true,
  },
  {
    id: "dismiss",
    group: "Internal",
    label: "Dismiss the Signal",
    desc: "Mark as handled",
    cap: true,
  },
  {
    id: "transition_ticket",
    group: "Tickets",
    label: "Transition ticket status",
    desc: "Move a Linear/Jira ticket — capability not yet wired",
    cap: false,
  },
];

type PreviewSignal = {
  id: string;
  source: string;
  kind: string;
  title: string;
  repo?: string;
  num?: string;
  author?: string;
  channel?: string;
  payload: Record<string, string>;
};

const PREVIEW_SIGNALS: PreviewSignal[] = [
  {
    id: "s_4471",
    source: "github",
    kind: "pr_authored",
    title: "feat: cap retry budget at 3 with jitter",
    repo: "platform/api",
    num: "#1284",
    author: "erinkov",
    payload: { ticket: "DEV-441" },
  },
  {
    id: "s_4467",
    source: "github",
    kind: "pr_authored",
    title: "fix: replay rejection in slack-webhook",
    repo: "platform/edge",
    num: "#412",
    author: "erinkov",
    payload: { ticket: "DEV-388" },
  },
  {
    id: "s_4470",
    source: "slack",
    kind: "slack_dm",
    title: "Quick Q on the auth-proxy refactor",
    channel: "@priya",
    payload: {},
  },
  {
    id: "s_4459",
    source: "github",
    kind: "pr_review_requested",
    title: "Review request: refactor cron orchestrator",
    repo: "platform/api",
    num: "#1280",
    author: "kalia",
    payload: {},
  },
  {
    id: "s_4452",
    source: "slack",
    kind: "slack_mention",
    title: "@erin — can you eyeball #incidents?",
    channel: "#incidents",
    payload: {},
  },
  {
    id: "s_4444",
    source: "linear",
    kind: "ticket_assigned",
    title: "DEV-447: cron orchestrator idempotency",
    payload: {},
  },
];

// ── DB → UI conversion ────────────────────────────────────────────────────────

function runRowToUiRun(r: AutomationRunRow): AutomationRun {
  return {
    ts: r.started_at,
    status: r.status as RunStatus,
    trigger: r.signal_id ? `signal:${r.signal_id}` : r.trigger_event_id,
    actions: (r.actions_executed ?? []).map((e) => ({
      kind: e.type,
      ref:
        e.ref !== undefined && e.ref !== null
          ? typeof e.ref === "string"
            ? e.ref
            : JSON.stringify(e.ref)
          : "",
    })),
    ...(r.error ? { error: r.error } : {}),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function triggerLabel(t: AutomationTrigger): string {
  return TRIGGER_KINDS.find((k) => k.id === t.kind)?.label ?? t.kind;
}

function actionLabel(kind: string): string {
  return ACTION_KINDS.find((a) => a.id === kind)?.label ?? kind;
}

function actionMeta(kind: string): ActionMeta | undefined {
  return ACTION_KINDS.find((a) => a.id === kind);
}

const OP_LABEL: Record<string, string> = {
  equals: "is",
  not_equals: "is not",
  contains_any: "contains any of",
  contains_all: "contains all of",
  not_contains: "does not contain",
  is_true: "is true",
  is_false: "is false",
};

function formatPredicate(p: AutomationPredicate): string {
  const lbl = (p.field.split(".").pop() ?? p.field).replace(/_/g, " ");
  const op = OP_LABEL[p.op] ?? p.op;
  if (p.op === "is_true" || p.op === "is_false") return `${lbl} ${op}`;
  const val = Array.isArray(p.value)
    ? p.value.join(", ")
    : String(p.value);
  return `${lbl} ${op} ${val}`;
}

function makeBlankAutomation(): AutomationItem {
  return {
    id: "__new__",
    name: "Untitled automation",
    enabled: false,
    dryRun: true,
    priority: 100,
    trigger: { kind: "signal_ingested" },
    predicates: [],
    actions: [],
    stats: {
      lastRunAt: null,
      lastStatus: null,
      totalRuns: 0,
      fail7d: 0,
    },
  };
}

// Map fixture source keys to SourceGlyph keys
function toGlyphSource(source: string): string {
  if (source === "github") return "git";
  return source;
}

// ── StatusDot ─────────────────────────────────────────────────────────────────

const STATUS_DOT_MAP: Record<
  string,
  { color: string; title: string }
> = {
  succeeded: { color: "var(--good)", title: "ok" },
  failed: { color: "var(--danger)", title: "fail" },
  skipped_idempotent: { color: "var(--muted-soft)", title: "dedupe" },
  skipped_dry_run: { color: "var(--warn)", title: "dry" },
  partial: { color: "var(--warn)", title: "partial" },
  pending: { color: "var(--muted-soft)", title: "pending" },
};

function StatusDot({ status }: { status: string | null }) {
  const m = STATUS_DOT_MAP[status ?? "pending"] ?? STATUS_DOT_MAP.pending;
  return (
    <span
      title={m.title}
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: m.color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

// ── Template highlight ────────────────────────────────────────────────────────

function TemplateBody({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("{{") ? (
          <span
            key={i}
            style={{
              background: "var(--primary-disabled)",
              color: "var(--primary-active)",
              padding: "0 3px",
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// ── DetailLabel ───────────────────────────────────────────────────────────────

function DetailLabel({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div
      style={{
        letterSpacing: 0.6,
        fontSize: 10,
        fontWeight: 600,
        color: "var(--muted-foreground)",
        textTransform: "uppercase",
        marginBottom: inline ? 0 : 8,
      }}
    >
      {children}
    </div>
  );
}

// ── Pill ──────────────────────────────────────────────────────────────────────

function Pill({
  children,
  mono,
  accent,
  disabled,
}: {
  children: React.ReactNode;
  mono?: boolean;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 6,
        background: disabled
          ? "var(--surface-strong)"
          : accent
            ? "var(--primary-disabled)"
            : "var(--canvas)",
        color: disabled
          ? "var(--muted-foreground)"
          : accent
            ? "var(--primary-active)"
            : "var(--ink)",
        fontFamily: mono ? "var(--font-mono)" : "inherit",
        fontSize: mono ? 11.5 : 12.5,
        fontWeight: 600,
        border: "1px solid var(--hairline-soft)",
        textDecoration: disabled ? "line-through" : "none",
        margin: "1px 1px",
      }}
    >
      {children}
    </span>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

type BreadcrumbCrumb = { label: string; onClick?: () => void };

function AutomationsBreadcrumb({ crumbs }: { crumbs: BreadcrumbCrumb[] }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
    >
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && (
            <span style={{ color: "var(--muted-soft)" }}>/</span>
          )}
          {c.onClick ? (
            <button
              type="button"
              onClick={c.onClick}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--primary)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {c.label}
            </button>
          ) : (
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>
              {c.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── TriggerIcon ───────────────────────────────────────────────────────────────

function TriggerIcon({ kind }: { kind: TriggerKind }) {
  const size = 14;
  const props = {
    width: size,
    height: size,
    color: "var(--foreground)",
    strokeWidth: 1.8,
    style: { flexShrink: 0 },
  };
  if (kind === "schedule") return <ClockIcon {...props} />;
  if (kind === "focus_started") return <TargetIcon {...props} />;
  if (kind === "focus_ended") return <CheckCircleIcon {...props} />;
  if (kind === "signal_state_change") return <ActivityIcon {...props} />;
  return <InboxIcon {...props} />;
}

// ── TriggerSummary ────────────────────────────────────────────────────────────

function TriggerSummary({ trigger }: { trigger: AutomationTrigger }) {
  const meta = TRIGGER_KINDS.find((k) => k.id === trigger.kind);
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid var(--hairline-soft)",
        borderRadius: 8,
        background: "var(--canvas)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <TriggerIcon kind={trigger.kind} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          {meta?.label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--muted-foreground)",
            marginTop: 2,
          }}
        >
          {trigger.kind === "schedule"
            ? `${trigger.cronLabel} · ${trigger.cron}`
            : trigger.kind === "signal_state_change"
              ? `watches: ${(trigger.watchFields ?? []).join(", ")}`
              : meta?.desc}
        </div>
      </div>
    </div>
  );
}

// ── PredicateLine ─────────────────────────────────────────────────────────────

function PredicateLine({
  p,
  index,
}: {
  p: AutomationPredicate;
  index: number;
}) {
  const showVal = p.op !== "is_true" && p.op !== "is_false";
  const valStr = Array.isArray(p.value)
    ? p.value.join(", ")
    : String(p.value);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span
        style={{
          color: "var(--muted-soft)",
          fontSize: 10,
          width: 22,
          flexShrink: 0,
        }}
      >
        {index === 0 ? "IF" : "AND"}
      </span>
      <code
        style={{
          background: "var(--surface-soft)",
          padding: "3px 8px",
          borderRadius: 4,
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
        }}
      >
        {p.field}
      </code>
      <span
        style={{
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
        }}
      >
        {OP_LABEL[p.op] ?? p.op}
      </span>
      {showVal && (
        <code
          style={{
            background: "var(--primary-disabled)",
            padding: "3px 8px",
            borderRadius: 4,
            color: "var(--primary-active)",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
          }}
        >
          {valStr}
        </code>
      )}
    </div>
  );
}

// ── ActionPreviewCard ─────────────────────────────────────────────────────────

function ActionPreviewCard({
  action,
  index,
}: {
  action: AutomationAction;
  index: number;
}) {
  const meta = actionMeta(action.kind);
  const deferred = !meta?.cap;
  return (
    <div
      style={{
        padding: "12px 14px",
        border: deferred
          ? "1px solid var(--warn-soft)"
          : "1px solid var(--hairline-soft)",
        borderRadius: 8,
        background: deferred ? "var(--warn-soft)" : "var(--canvas)",
        opacity: deferred ? 0.85 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: action.config.body ?? action.config.tags ? 6 : 0,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: deferred ? "var(--warn)" : "var(--primary)",
            color: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          {meta?.label ?? action.kind}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-foreground)",
          }}
        >
          {meta?.group}
        </span>
        {deferred && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--warn)",
              color: "white",
              letterSpacing: 0.4,
              marginLeft: "auto",
              fontWeight: 700,
            }}
          >
            NOT WIRED
          </span>
        )}
        {!deferred && action.config.target === "thread_reply" && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
              letterSpacing: 0.4,
              marginLeft: "auto",
              fontWeight: 700,
            }}
          >
            THREAD REPLY
          </span>
        )}
        {!deferred && action.config.target === "self_dm" && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
              letterSpacing: 0.4,
              marginLeft: "auto",
              fontWeight: 700,
            }}
          >
            SELF-DM
          </span>
        )}
        {!deferred && action.config.target === "channel" && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--muted-foreground)",
              marginLeft: "auto",
            }}
          >
            {action.config.channel}
          </span>
        )}
      </div>
      {action.config.body && (
        <div
          style={{
            background: "var(--surface-soft)",
            padding: "8px 10px",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--body)",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          <TemplateBody text={action.config.body} />
        </div>
      )}
      {action.config.tags && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          {action.config.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 4,
                background: "var(--surface-strong)",
                color: "var(--ink)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {action.config.softIdempotencyKey && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-foreground)",
            marginTop: 6,
          }}
        >
          ⓘ soft idempotency: {action.config.softIdempotencyKey}
        </div>
      )}
    </div>
  );
}

// ── DeferredBanner ────────────────────────────────────────────────────────────

function DeferredBanner() {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "var(--warn-soft)",
        border: "1px solid var(--warn)",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <AlertTriangleIcon
        size={16}
        style={{ color: "var(--warn)", flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--warn)" }}>
          Includes a not-yet-wired action
        </div>
        <div
          style={{ fontSize: 12, color: "var(--body)", marginTop: 1 }}
        >
          This automation will plan correctly, but the{" "}
          <b>Transition ticket</b> step will be a no-op until the Linear/Jira
          capability lands.
        </div>
      </div>
    </div>
  );
}

// ── SentenceSummary ───────────────────────────────────────────────────────────

function SentenceSummary({ a }: { a: AutomationItem }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "var(--surface-soft)",
        borderRadius: 10,
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--body)",
        fontWeight: 400,
      }}
    >
      <span style={{ color: "var(--muted-foreground)" }}>WHEN</span>{" "}
      <Pill>{triggerLabel(a.trigger)}</Pill>
      {a.trigger.kind === "schedule" && (
        <>
          {" "}
          <Pill mono>{a.trigger.cron}</Pill>
        </>
      )}
      {a.predicates.length > 0 && (
        <>
          {" "}
          <span style={{ color: "var(--muted-foreground)" }}>IF</span>{" "}
          {a.predicates.map((p, i) => (
            <span key={i}>
              <Pill mono>{formatPredicate(p)}</Pill>
              {i < a.predicates.length - 1 && (
                <span style={{ color: "var(--muted-foreground)" }}> AND </span>
              )}
            </span>
          ))}
        </>
      )}
      {" "}
      <span style={{ color: "var(--muted-foreground)" }}>THEN</span>{" "}
      {a.actions.map((act, i) => (
        <span key={i}>
          <Pill
            accent={!!actionMeta(act.kind)?.cap}
            disabled={!actionMeta(act.kind)?.cap}
          >
            {actionLabel(act.kind)}
          </Pill>
          {i < a.actions.length - 1 && (
            <span style={{ color: "var(--muted-foreground)" }}> + </span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── RunRow ────────────────────────────────────────────────────────────────────

function RunRow({ r, last }: { r: AutomationRun; last: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 100px 1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "8px 12px",
        borderBottom: last ? "none" : "1px solid var(--hairline-soft)",
        background:
          r.status === "failed" ? "var(--danger-soft)" : "transparent",
      }}
    >
      <StatusDot status={r.status} />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--muted-foreground)",
        }}
      >
        {relTime(r.ts)}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {r.trigger}
          {r.actions[0] ? ` → ${r.actions[0].ref}` : ""}
        </div>
        {r.error && (
          <div
            style={{
              fontSize: 10.5,
              color: "var(--danger)",
              marginTop: 2,
            }}
          >
            {r.error}
          </div>
        )}
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          color: "var(--muted-foreground)",
        }}
      >
        {r.status.replace(/_/g, " ")}
      </span>
    </div>
  );
}

// ── LivePreview ───────────────────────────────────────────────────────────────

function LivePreview({ automation }: { automation: AutomationItem }) {
  const matches = useMemo(() => {
    return PREVIEW_SIGNALS.map((s) => {
      const checks = automation.predicates.map((p) => {
        const fieldVal = (() => {
          if (p.field === "signal.source") return s.source;
          if (p.field === "signal.kind") return s.kind;
          if (p.field === "signal.payload.author") return s.author ?? "";
          if (p.field === "signal.payload.has_review_comments") return "true";
          if (p.field === "transition.field")
            return "payload.commits_after_review";
          if (p.field === "transition.to") return "merged";
          if (p.field === "context.focus.active") return "true";
          return "";
        })();
        const ok =
          p.op === "in"
            ? String(p.value)
                .split(",")
                .map((v) => v.trim())
                .includes(fieldVal)
            : fieldVal === String(p.value);
        return ok;
      });
      return { signal: s, matched: checks.every(Boolean), checks };
    });
  }, [automation.predicates]);

  const matchCount = matches.filter((m) => m.matched).length;

  return (
    <div
      style={{
        border: "1px solid var(--hairline-soft)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          background: "var(--surface-soft)",
          borderBottom: "1px solid var(--hairline-soft)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--muted-foreground)",
          }}
        >
          Last 6 signals ·{" "}
          <span
            style={{
              color:
                matchCount > 0 ? "var(--good)" : "var(--muted-foreground)",
              fontWeight: 600,
            }}
          >
            {matchCount} match
          </span>
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-foreground)",
          }}
        >
          predicates eval'd in 4ms
        </span>
      </div>
      {matches.map((m, i) => (
        <div
          key={m.signal.id}
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: 10,
            alignItems: "center",
            padding: "8px 12px",
            borderBottom:
              i === matches.length - 1
                ? "none"
                : "1px solid var(--hairline-soft)",
            background: m.matched
              ? "rgba(22, 163, 74, 0.06)"
              : "transparent",
          }}
        >
          <SourceGlyph source={toGlyphSource(m.signal.source)} size={14} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {m.signal.title}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--muted-foreground)",
                marginTop: 1,
              }}
            >
              {m.signal.kind}
              {m.signal.repo ? ` · ${m.signal.repo} ${m.signal.num}` : ""}
            </div>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: m.matched ? "var(--good)" : "var(--muted-soft)",
            }}
          >
            {m.matched
              ? "✓ MATCH"
              : automation.predicates.length === 0
                ? "—"
                : `${m.checks.filter(Boolean).length}/${m.checks.length}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── AutomationListCard ────────────────────────────────────────────────────────

export function AutomationListCard({
  a,
  onClick,
  onToggle,
}: {
  a: AutomationItem;
  onClick: () => void;
  onToggle: (v: boolean) => void;
}) {
  const failed = a.stats.lastStatus === "failed";
  const deferred = a.actions.some((act) => !actionMeta(act.kind)?.cap);
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open automation: ${a.name}`}
      style={{
        padding: "14px 16px",
        borderRadius: 10,
        cursor: "pointer",
        background: "var(--surface-card)",
        border: "1px solid var(--hairline-soft)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        opacity: a.enabled ? 1 : 0.7,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "var(--primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "var(--hairline-soft)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot
          status={
            failed ? "failed" : a.dryRun ? "skipped_dry_run" : "succeeded"
          }
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {a.name}
        </span>
        <span
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Switch
            checked={a.enabled}
            onCheckedChange={onToggle}
            aria-label={`Toggle ${a.name}`}
            size="sm"
          />
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            padding: "1px 6px",
            borderRadius: 4,
            background: "var(--surface-strong)",
            color: "var(--muted-foreground)",
            letterSpacing: 0.3,
            fontWeight: 600,
          }}
        >
          {triggerLabel(a.trigger).toUpperCase()}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-foreground)",
          }}
        >
          →
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ink)",
          }}
        >
          {a.actions.length === 1
            ? actionLabel(a.actions[0].kind)
            : `${a.actions.length} actions`}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10.5,
          color: "var(--muted-foreground)",
        }}
      >
        <span>
          {a.stats.totalRuns} runs · last {relTime(a.stats.lastRunAt)}
        </span>
        <span style={{ flex: 1 }} />
        {a.dryRun && (
          <span
            style={{
              fontSize: 9,
              padding: "0 5px",
              borderRadius: 4,
              background: "var(--warn-soft)",
              color: "var(--warn)",
              letterSpacing: 0.4,
              fontWeight: 700,
            }}
          >
            DRY-RUN
          </span>
        )}
        {deferred && !failed && (
          <span
            style={{
              fontSize: 9,
              padding: "0 5px",
              borderRadius: 4,
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
              letterSpacing: 0.4,
              fontWeight: 700,
            }}
            title="Includes a not-yet-wired capability"
          >
            DEFERRED
          </span>
        )}
        {failed && (
          <span
            style={{
              fontSize: 9,
              padding: "0 5px",
              borderRadius: 4,
              background: "var(--danger-soft)",
              color: "var(--danger)",
              letterSpacing: 0.4,
              fontWeight: 700,
            }}
          >
            FAIL
          </span>
        )}
      </div>
    </div>
  );
}

// ── AutomationDetail ──────────────────────────────────────────────────────────

export function AutomationDetail({
  automation: a,
  onEdit,
  onShowRuns,
  onUpdate,
  onDelete,
}: {
  automation: AutomationItem;
  onEdit: () => void;
  onShowRuns: () => void;
  onUpdate: (patch: Partial<AutomationItem>) => void;
  onDelete: () => void;
}) {
  const [recentRuns, setRecentRuns] = useState<AutomationRun[]>([]);
  useEffect(() => {
    if (!a.id || a.id === "__new__") return;
    // Cast needed: PostgrestFilterBuilder is awaitable but not strict Promise<T>
    // biome-ignore lint/suspicious/noExplicitAny: Supabase client vs SupabaseLike compat cast
    listRuns(supabase as any, a.id, { limit: 5 })
      .then((rows) => setRecentRuns(rows.map(runRowToUiRun)))
      .catch(() => {});
  }, [a.id]);

  const deferred = a.actions.some((act) => !actionMeta(act.kind)?.cap);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      {/* Header strip */}
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--hairline-soft)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <StatusDot status={a.stats.lastStatus} />
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            {a.name}
          </h3>
          {!a.enabled && (
            <span
              style={{
                fontSize: 9.5,
                padding: "1px 7px",
                borderRadius: 4,
                background: "var(--surface-strong)",
                color: "var(--muted-foreground)",
                letterSpacing: 0.4,
                fontWeight: 700,
              }}
            >
              PAUSED
            </span>
          )}
          {a.dryRun && (
            <span
              style={{
                fontSize: 9.5,
                padding: "1px 7px",
                borderRadius: 4,
                background: "var(--warn-soft)",
                color: "var(--warn)",
                letterSpacing: 0.4,
                fontWeight: 700,
              }}
            >
              DRY-RUN
            </span>
          )}
        </div>
        <Switch
          checked={a.enabled}
          onCheckedChange={(v) => onUpdate({ enabled: v })}
          aria-label="Toggle automation"
        />
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (
              window.confirm(
                "Delete this automation? Its run history will be purged.",
              )
            )
              onDelete();
          }}
          style={{ color: "var(--danger)" }}
        >
          Delete
        </Button>
      </div>

      {/* Body */}
      <div
        style={{
          overflowY: "auto",
          padding: "20px 22px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <SentenceSummary a={a} />
        {deferred && <DeferredBanner />}

        <div>
          <DetailLabel>WHEN</DetailLabel>
          <TriggerSummary trigger={a.trigger} />
        </div>

        {a.predicates.length > 0 && (
          <div>
            <DetailLabel>IF</DetailLabel>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {a.predicates.map((p, i) => (
                <PredicateLine key={i} p={p} index={i} />
              ))}
            </div>
          </div>
        )}

        <div>
          <DetailLabel>THEN</DetailLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {a.actions.map((act, i) => (
              <ActionPreviewCard key={i} action={act} index={i} />
            ))}
          </div>
        </div>

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              marginBottom: 8,
            }}
          >
            <DetailLabel inline>RECENT RUNS</DetailLabel>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={onShowRuns}>
              Full history →
            </Button>
          </div>
          {recentRuns.length > 0 ? (
            <div
              style={{
                border: "1px solid var(--hairline-soft)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {recentRuns.map((r, i) => (
                <RunRow key={i} r={r} last={i === recentRuns.length - 1} />
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "16px 12px",
                border: "1px dashed var(--hairline)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--muted-soft)",
                textAlign: "center",
              }}
            >
              Hasn't fired yet. Live preview below shows what would match.
            </div>
          )}
        </div>

        <div>
          <DetailLabel>LIVE PREVIEW</DetailLabel>
          <LivePreview automation={a} />
        </div>

        <div
          style={{
            marginTop: 18,
            paddingTop: 18,
            borderTop: "1px solid var(--hairline-soft)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{ fontSize: 12, color: "var(--muted-foreground)" }}
          >
            {a.stats.totalRuns} total runs · last fired{" "}
            {relTime(a.stats.lastRunAt)} · priority {a.priority}
          </span>
          <span style={{ flex: 1 }} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdate({ dryRun: !a.dryRun })}
          >
            {a.dryRun ? "Exit dry-run" : "Switch to dry-run"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── RunsHistogram ─────────────────────────────────────────────────────────────

function RunsHistogram({ runs }: { runs: AutomationRun[] }) {
  const DAYS = 14;
  const buckets = Array.from({ length: DAYS }, (_, i) => ({
    d: i,
    ok: 0,
    fail: 0,
    dry: 0,
  }));
  const now = Date.now();
  for (const r of runs) {
    const ageDays = Math.floor(
      (now - new Date(r.ts).getTime()) / (24 * 3600 * 1000),
    );
    if (ageDays >= 0 && ageDays < DAYS) {
      const b = buckets[DAYS - 1 - ageDays];
      if (b) {
        if (r.status === "failed") b.fail++;
        else if (r.status === "skipped_dry_run") b.dry++;
        else b.ok++;
      }
    }
  }
  const max = Math.max(1, ...buckets.map((b) => b.ok + b.fail + b.dry));
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: 0.6,
          color: "var(--muted-foreground)",
          marginBottom: 8,
        }}
      >
        LAST 14 DAYS
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          height: 60,
        }}
      >
        {buckets.map((b, i) => {
          const total = b.ok + b.fail + b.dry;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                height: 60,
                gap: 1,
              }}
            >
              {b.fail > 0 && (
                <div
                  style={{
                    height: (b.fail / max) * 60,
                    background: "var(--danger)",
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              )}
              {b.dry > 0 && (
                <div
                  style={{
                    height: (b.dry / max) * 60,
                    background: "var(--warn)",
                  }}
                />
              )}
              {b.ok > 0 && (
                <div
                  style={{
                    height: (b.ok / max) * 60,
                    background: "var(--good)",
                    borderRadius:
                      total === b.ok ? "3px 3px 0 0" : 0,
                  }}
                />
              )}
              {total === 0 && (
                <div
                  style={{ height: 2, background: "var(--hairline)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── RunsView ──────────────────────────────────────────────────────────────────

export function RunsView({
  automation: a,
}: {
  automation: AutomationItem;
}) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!a.id || a.id === "__new__") {
      setLoading(false);
      return;
    }
    // biome-ignore lint/suspicious/noExplicitAny: Supabase client vs SupabaseLike compat cast
    listRuns(supabase as any, a.id, { limit: 50 })
      .then((rows) => setRuns(rows.map(runRowToUiRun)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [a.id]);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--hairline-soft)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          {a.name} · runs
        </h3>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--muted-foreground)",
          }}
        >
          {a.stats.totalRuns} runs · {a.stats.fail7d} failed (7d)
        </span>
      </div>
      <div
        style={{ overflowY: "auto", padding: "16px 22px", flex: 1 }}
      >
        {loading ? (
          <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "var(--muted-foreground)" }}>
            Loading runs…
          </div>
        ) : (
          <>
            <RunsHistogram runs={runs} />
            <div
              style={{
                marginTop: 18,
                border: "1px solid var(--hairline-soft)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {runs.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "var(--muted-foreground)" }}>
                  No runs yet.
                </div>
              ) : (
                runs.map((r, i) => (
                  <RunRow key={i} r={r} last={i === runs.length - 1} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Builder: field schema ─────────────────────────────────────────────────────

type FieldType = "enum" | "multi" | "bool";
type FieldSchema = {
  label: string;
  type: FieldType;
  options: string[];
};

const FIELD_SCHEMA: Record<string, FieldSchema> = {
  "signal.source": {
    label: "Source",
    type: "enum",
    options: [
      "github",
      "slack",
      "linear",
      "calendar",
      "mail",
      "pagerduty",
    ],
  },
  "signal.kind": {
    label: "Kind",
    type: "enum",
    options: [
      "pr_opened",
      "pr_review_requested",
      "pr_review_received",
      "pr_merged",
      "mention",
      "dm",
      "calendar_invite",
      "calendar_starting",
      "ticket_assigned",
      "alert",
    ],
  },
  "signal.priority": {
    label: "Priority",
    type: "enum",
    options: ["low", "normal", "high", "critical"],
  },
  "signal.state": {
    label: "State",
    type: "enum",
    options: ["new", "acknowledged", "snoozed", "resolved"],
  },
  "signal.repo": {
    label: "Repo",
    type: "enum",
    options: [
      "frontend",
      "backend",
      "infra",
      "mobile",
      "design-system",
    ],
  },
  "signal.labels": {
    label: "Labels",
    type: "multi",
    options: [
      "urgent",
      "blocked",
      "design",
      "security",
      "needs-review",
      "wip",
    ],
  },
  "signal.is_focus_match": {
    label: "Focus rule matched",
    type: "bool",
    options: [],
  },
  "focus.tag": {
    label: "Focus tag",
    type: "enum",
    options: ["deep_work", "meeting", "break"],
  },
  "signal.author_is_me": {
    label: "Author is me",
    type: "bool",
    options: [],
  },
  "transition.to": {
    label: "New state",
    type: "enum",
    options: [
      "merged",
      "closed",
      "approved",
      "review_requested",
      "ready_for_review",
    ],
  },
};

const FIELD_LIST = Object.keys(FIELD_SCHEMA);

function opsForType(t: FieldType): PredicateOp[] {
  if (t === "enum") return ["equals", "not_equals"];
  if (t === "multi") return ["contains_any", "contains_all", "not_contains"];
  return ["is_true", "is_false"];
}

function defaultPredicate(field: string): AutomationPredicate {
  const s = FIELD_SCHEMA[field];
  if (!s) return { field, op: "equals", value: "" };
  if (s.type === "enum") return { field, op: "equals", value: s.options[0] ?? "" };
  if (s.type === "multi")
    return { field, op: "contains_any", value: [s.options[0] ?? ""] };
  return { field, op: "is_true", value: true };
}

// ── Builder sub-components ────────────────────────────────────────────────────

function BuilderStep({
  n,
  title,
  subtitle,
  active,
  onClick,
  children,
}: {
  n: number;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: active
          ? "1.5px solid var(--primary)"
          : "1px solid var(--hairline-soft)",
        borderRadius: 10,
        background: "var(--canvas)",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: active ? "var(--primary)" : "var(--surface-strong)",
            color: active ? "white" : "var(--muted-foreground)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <div style={{ flex: 1 }}>
          <div
            style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted-foreground)",
              marginTop: 1,
            }}
          >
            {subtitle}
          </div>
        </div>
      </button>
      <div style={{ padding: "0 16px 16px" }}>{children}</div>
    </div>
  );
}

function TriggerStep({
  trigger,
  onChange,
}: {
  trigger: AutomationTrigger;
  onChange: (t: AutomationTrigger) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        {TRIGGER_KINDS.map((k) => (
          <button
            type="button"
            key={k.id}
            onClick={() => onChange({ ...trigger, kind: k.id })}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              border:
                trigger.kind === k.id
                  ? "1.5px solid var(--primary)"
                  : "1px solid var(--hairline-soft)",
              background:
                trigger.kind === k.id
                  ? "var(--primary-disabled)"
                  : "var(--canvas)",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <TriggerIcon kind={k.id} />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ink)",
                }}
              >
                {k.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  marginTop: 1,
                  lineHeight: 1.3,
                }}
              >
                {k.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
      {trigger.kind === "schedule" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 10,
            alignItems: "center",
            padding: "10px 12px",
            border: "1px solid var(--hairline-soft)",
            borderRadius: 8,
            background: "var(--surface-soft)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--muted-foreground)",
            }}
          >
            CRON
          </span>
          <input
            value={trigger.cron ?? "0 9 * * 1-5"}
            onChange={(e) => onChange({ ...trigger, cron: e.target.value })}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              padding: "5px 8px",
              border: "1px solid var(--hairline-soft)",
              borderRadius: 5,
              outline: "none",
              background: "var(--canvas)",
              color: "var(--ink)",
            }}
            aria-label="Cron expression"
          />
        </div>
      )}
      {trigger.kind === "signal_state_change" && (
        <div
          style={{
            padding: "10px 12px",
            border: "1px solid var(--hairline-soft)",
            borderRadius: 8,
            background: "var(--surface-soft)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: 0.4,
              color: "var(--muted-foreground)",
              marginBottom: 8,
            }}
          >
            WATCH FIELDS
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(trigger.watchFields ?? ["payload.commits_after_review"]).map(
              (f) => (
                <span
                  key={f}
                  style={{
                    fontSize: 10.5,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "var(--surface-strong)",
                    color: "var(--ink)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {f}
                </span>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PredicateValueControl({
  p,
  schema,
  onChange,
}: {
  p: AutomationPredicate;
  schema: FieldSchema;
  onChange: (v: string | boolean | string[]) => void;
}) {
  const baseStyle: React.CSSProperties = {
    fontSize: 11.5,
    padding: "5px 8px",
    border: "1px solid var(--hairline-soft)",
    borderRadius: 5,
    outline: "none",
    background: "var(--canvas)",
    color: "var(--ink)",
    width: "100%",
  };
  if (schema.type === "bool")
    return (
      <span
        style={{ fontSize: 11, color: "var(--muted-soft)", fontStyle: "italic" }}
      >
        —
      </span>
    );
  if (schema.type === "enum") {
    return (
      <select
        value={String(p.value)}
        onChange={(e) => onChange(e.target.value)}
        style={baseStyle}
      >
        {schema.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  // multi
  const value = Array.isArray(p.value) ? p.value : [];
  const toggle = (o: string) =>
    onChange(
      value.includes(o) ? value.filter((x) => x !== o) : [...value, o],
    );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {schema.options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => toggle(o)}
            style={{
              fontSize: 10.5,
              padding: "3px 8px",
              borderRadius: 999,
              border: `1px solid ${on ? "var(--primary)" : "var(--hairline-soft)"}`,
              background: on ? "var(--primary-disabled)" : "var(--canvas)",
              color: on ? "var(--primary-active)" : "var(--muted-foreground)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function PredicatesStep({
  predicates,
  onChange,
}: {
  predicates: AutomationPredicate[];
  onChange: (ps: AutomationPredicate[]) => void;
}) {
  const update = (i: number, p: AutomationPredicate) =>
    onChange(predicates.map((x, idx) => (idx === i ? p : x)));
  const remove = (i: number) =>
    onChange(predicates.filter((_, idx) => idx !== i));
  const add = () => onChange([...predicates, defaultPredicate("signal.source")]);
  const changeField = (i: number, field: string) =>
    update(i, defaultPredicate(field));
  const changeOp = (i: number, op: PredicateOp) => {
    const p = predicates[i];
    if (!p) return;
    let value: string | boolean | string[] = p.value;
    if (op === "is_true") value = true;
    if (op === "is_false") value = false;
    update(i, { ...p, op, value });
  };

  if (predicates.length === 0) {
    return (
      <div
        style={{
          padding: "12px 14px",
          border: "1px dashed var(--hairline)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--muted-soft)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ flex: 1 }}>
          No filters — automation fires on every event of this kind.
        </span>
        <Button variant="ghost" size="sm" onClick={add}>
          <PlusIcon size={14} />
          Add filter
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {predicates.map((p, i) => {
        const schema =
          FIELD_SCHEMA[p.field] ?? FIELD_SCHEMA["signal.source"]!;
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 160px 130px 1fr auto",
              gap: 6,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--muted-soft)",
                width: 22,
              }}
            >
              {i === 0 ? "IF" : "AND"}
            </span>
            <select
              value={p.field}
              onChange={(e) => changeField(i, e.target.value)}
              style={{
                fontSize: 11.5,
                padding: "5px 6px",
                border: "1px solid var(--hairline-soft)",
                borderRadius: 5,
                outline: "none",
                background: "var(--canvas)",
                color: "var(--ink)",
              }}
            >
              {FIELD_LIST.map((f) => (
                <option key={f} value={f}>
                  {FIELD_SCHEMA[f]?.label} ({f})
                </option>
              ))}
            </select>
            <select
              value={p.op}
              onChange={(e) => changeOp(i, e.target.value as PredicateOp)}
              style={{
                fontSize: 11.5,
                padding: "5px 6px",
                border: "1px solid var(--hairline-soft)",
                borderRadius: 5,
                outline: "none",
                background: "var(--canvas)",
                color: "var(--ink)",
              }}
            >
              {opsForType(schema.type).map((o) => (
                <option key={o} value={o}>
                  {OP_LABEL[o] ?? o}
                </option>
              ))}
            </select>
            <PredicateValueControl
              p={p}
              schema={schema}
              onChange={(value) => update(i, { ...p, value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove filter"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--muted-foreground)",
                cursor: "pointer",
                fontSize: 14,
                padding: 4,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <span style={{ alignSelf: "flex-start" }}>
        <Button variant="ghost" size="sm" onClick={add}>
          <PlusIcon size={14} />
          Add filter
        </Button>
      </span>
    </div>
  );
}

function ActionPicker({
  onPick,
  onCancel,
}: {
  onPick: (kind: string) => void;
  onCancel: () => void;
}) {
  const groups = ["Slack", "GitHub", "Focus", "Internal", "Tickets"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {groups.map((g) => (
        <div key={g}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: 0.6,
              color: "var(--muted-foreground)",
              marginBottom: 4,
            }}
          >
            {g.toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {ACTION_KINDS.filter((a) => a.group === g).map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => onPick(a.id)}
                disabled={!a.cap}
                title={
                  a.cap
                    ? ""
                    : "Capability not yet wired — action will be a no-op"
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  border: "1px solid var(--hairline-soft)",
                  borderRadius: 6,
                  background: "var(--canvas)",
                  cursor: a.cap ? "pointer" : "not-allowed",
                  textAlign: "left",
                  opacity: a.cap ? 1 : 0.6,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {a.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.desc}
                </span>
                {!a.cap && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "var(--warn-soft)",
                      color: "var(--warn)",
                      letterSpacing: 0.4,
                      fontWeight: 700,
                    }}
                  >
                    NOT WIRED
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
      <span style={{ alignSelf: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </span>
    </div>
  );
}

function SlackPostEditor({
  cfg,
  update,
}: {
  cfg: ActionConfig;
  update: (patch: Partial<ActionConfig>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <DetailLabel>POST TO</DetailLabel>
        <div style={{ display: "flex", gap: 4 }}>
          {(
            [
              { id: "channel", label: "Channel" },
              { id: "self_dm", label: "Self-DM" },
              { id: "thread_reply", label: "Thread reply" },
            ] as const
          ).map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => update({ target: t.id })}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid var(--hairline-soft)",
                background:
                  cfg.target === t.id
                    ? "var(--primary-disabled)"
                    : "var(--canvas)",
                color:
                  cfg.target === t.id
                    ? "var(--primary-active)"
                    : "var(--ink)",
                fontSize: 11.5,
                fontWeight: cfg.target === t.id ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {cfg.target === "channel" && (
          <Input
            value={cfg.channel ?? ""}
            onChange={(e) => update({ channel: e.target.value })}
            placeholder="#channel-name"
            className="mt-1.5 w-60 font-mono text-xs"
          />
        )}
        {cfg.target === "thread_reply" && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              color: "var(--muted-foreground)",
            }}
          >
            Reply will land in the thread of the triggering Slack signal.
          </div>
        )}
      </div>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginBottom: 6,
          }}
        >
          <DetailLabel inline>MESSAGE BODY</DetailLabel>
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              color: "var(--muted-foreground)",
            }}
          >
            {"supports {{ signal.field }} templating"}
          </span>
        </div>
        <textarea
          value={cfg.body ?? ""}
          onChange={(e) => update({ body: e.target.value })}
          rows={4}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            padding: "8px 10px",
            border: "1px solid var(--hairline-soft)",
            borderRadius: 6,
            outline: "none",
            background: "var(--canvas)",
            color: "var(--ink)",
            resize: "vertical",
            lineHeight: 1.5,
          }}
          aria-label="Message body"
        />
        <div
          style={{
            marginTop: 6,
            padding: "6px 10px",
            background: "var(--surface-soft)",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--body)",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          <TemplateBody text={cfg.body ?? ""} />
        </div>
      </div>
    </div>
  );
}

function ActionEditor({
  action,
  index,
  onChange,
  onRemove,
}: {
  action: AutomationAction;
  index: number;
  onChange: (a: AutomationAction) => void;
  onRemove: () => void;
}) {
  const meta = actionMeta(action.kind);
  const update = (configPatch: Partial<ActionConfig>) =>
    onChange({ ...action, config: { ...action.config, ...configPatch } });

  return (
    <div
      style={{
        border: "1px solid var(--hairline-soft)",
        borderRadius: 8,
        background: "var(--canvas)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderBottom: "1px solid var(--hairline-soft)",
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "var(--primary)",
            color: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          {meta?.label ?? action.kind}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-foreground)",
          }}
        >
          {meta?.group}
        </span>
        {!meta?.cap && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--warn-soft)",
              color: "var(--warn)",
              letterSpacing: 0.4,
              fontWeight: 700,
            }}
          >
            NOT WIRED
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove action"
          style={{
            border: "none",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontSize: 14,
            padding: 4,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: "12px 14px" }}>
        {action.kind === "slack_post_message" && (
          <SlackPostEditor cfg={action.config} update={update} />
        )}
        {action.kind === "tag" && (
          <div>
            <DetailLabel>TAGS</DetailLabel>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(action.config.tags ?? []).map((t, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "var(--surface-strong)",
                    color: "var(--ink)",
                    fontFamily: "var(--font-mono)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={() =>
                      update({
                        tags: (action.config.tags ?? []).filter(
                          (_, idx) => idx !== i,
                        ),
                      })
                    }
                    style={{
                      color: "var(--muted-foreground)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        {action.kind === "transition_ticket" && (
          <div>
            <div
              style={{
                color: "var(--warn)",
                fontSize: 12,
                marginBottom: 8,
              }}
            >
              ⚠ Linear / Jira capability not yet wired. This action will plan
              but execute as a no-op.
            </div>
            <DetailLabel>TRANSITION TO</DetailLabel>
            <input
              value={action.config.to ?? "Done"}
              onChange={(e) => update({ to: e.target.value })}
              aria-label="Transition to status"
              style={{
                fontSize: 12.5,
                padding: "6px 10px",
                border: "1px solid var(--hairline-soft)",
                borderRadius: 6,
                outline: "none",
                background: "var(--canvas)",
                color: "var(--ink)",
              }}
            />
          </div>
        )}
        {action.kind === "set_focus" && (
          <div>
            <DetailLabel>FOCUS DURATION</DetailLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                value={action.config.minutes ?? 25}
                onChange={(e) => update({ minutes: Number(e.target.value) })}
                aria-label="Focus duration in minutes"
                style={{
                  width: 80,
                  fontSize: 12.5,
                  padding: "6px 10px",
                  border: "1px solid var(--hairline-soft)",
                  borderRadius: 6,
                  outline: "none",
                  background: "var(--canvas)",
                  color: "var(--ink)",
                }}
              />
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                minutes
              </span>
            </div>
          </div>
        )}
        {(action.kind === "snooze" ||
          action.kind === "set_priority" ||
          action.kind === "dismiss") && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--muted-foreground)",
            }}
          >
            {action.kind === "dismiss"
              ? "No configuration — dismisses the triggering signal."
              : action.kind === "snooze"
                ? `Hides until: ${action.config.until ?? "tomorrow_9am"}`
                : `Sets priority to: ${action.config.priority ?? "high"}`}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionsStep({
  actions,
  onChange,
}: {
  actions: AutomationAction[];
  onChange: (as: AutomationAction[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const remove = (i: number) =>
    onChange(actions.filter((_, idx) => idx !== i));
  const update = (i: number, a: AutomationAction) =>
    onChange(actions.map((x, idx) => (idx === i ? a : x)));
  const add = (kind: string) => {
    const defaultConfig: ActionConfig =
      kind === "slack_post_message"
        ? { target: "channel", channel: "#reviews", body: "{{signal.title}}\n{{signal.url}}" }
        : kind === "tag"
          ? { tags: ["urgent"] }
          : kind === "snooze"
            ? { until: "tomorrow_9am" }
            : kind === "set_priority"
              ? { priority: "high" }
              : kind === "set_focus"
                ? { minutes: 25 }
                : kind === "transition_ticket"
                  ? { to: "Done" }
                  : {};
    onChange([...actions, { kind, config: defaultConfig }]);
    setPicking(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {actions.map((act, i) => (
        <ActionEditor
          key={i}
          action={act}
          index={i}
          onChange={(a) => update(i, a)}
          onRemove={() => remove(i)}
        />
      ))}
      {picking ? (
        <div
          style={{
            border: "1.5px dashed var(--primary)",
            borderRadius: 8,
            padding: 10,
            background: "var(--primary-disabled)",
          }}
        >
          <div
            style={{
              marginBottom: 8,
              color: "var(--primary-active)",
              fontSize: 10,
              letterSpacing: 0.6,
              fontWeight: 700,
            }}
          >
            PICK AN ACTION
          </div>
          <ActionPicker onPick={add} onCancel={() => setPicking(false)} />
        </div>
      ) : (
        <span style={{ alignSelf: "flex-start" }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPicking(true)}
          >
            <PlusIcon size={14} />
            Add action
          </Button>
        </span>
      )}
    </div>
  );
}

// ── AutomationBuilder ─────────────────────────────────────────────────────────

export function AutomationBuilder({
  automation: initial,
  isNew,
  onSave,
  onCancel,
}: {
  automation: AutomationItem;
  isNew: boolean;
  onSave: (a: AutomationItem) => void;
  onCancel: () => void;
}) {
  const [a, setA] = useState<AutomationItem>(initial);
  const [activeStep, setActiveStep] = useState<"trigger" | "predicates" | "actions">("trigger");
  const [previewOpen, setPreviewOpen] = useState(false);

  const update = (patch: Partial<AutomationItem>) =>
    setA((prev) => ({ ...prev, ...patch }));

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--hairline-soft)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <input
          value={a.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Automation name"
          style={{
            flex: 1,
            fontSize: 16,
            fontWeight: 600,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--foreground)",
            padding: "4px 0",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-foreground)",
          }}
        >
          {isNew ? "NEW" : "EDIT"}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          overflowY: "auto",
          padding: "20px 22px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <BuilderStep
          n={1}
          title="When"
          subtitle="The event that triggers this automation"
          active={activeStep === "trigger"}
          onClick={() => setActiveStep("trigger")}
        >
          <TriggerStep
            trigger={a.trigger}
            onChange={(trigger) => update({ trigger })}
          />
        </BuilderStep>

        <BuilderStep
          n={2}
          title="If"
          subtitle="Optional filters — all must match (AND)"
          active={activeStep === "predicates"}
          onClick={() => setActiveStep("predicates")}
        >
          <PredicatesStep
            predicates={a.predicates}
            onChange={(predicates) => update({ predicates })}
          />
        </BuilderStep>

        <BuilderStep
          n={3}
          title="Then"
          subtitle="Actions to fire — they run in order"
          active={activeStep === "actions"}
          onClick={() => setActiveStep("actions")}
        >
          <ActionsStep
            actions={a.actions}
            onChange={(actions) => update({ actions })}
          />
        </BuilderStep>

        <SentenceSummary a={a} />

        {/* Collapsible live preview */}
        <div
          style={{
            border: "1px solid var(--hairline-soft)",
            borderRadius: 10,
            background: "var(--surface-soft)",
          }}
        >
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              style={{
                display: "inline-block",
                transform: previewOpen ? "rotate(90deg)" : "none",
                transition: "transform .15s",
                color: "var(--muted-foreground)",
                fontSize: 12,
              }}
            >
              ▸
            </span>
            <span
              style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
            >
              Live preview
            </span>
            <span
              style={{ fontSize: 12, color: "var(--muted-foreground)", flex: 1 }}
            >
              See which recent signals match before you save.
            </span>
          </button>
          {previewOpen && (
            <div style={{ padding: "0 14px 14px" }}>
              <LivePreview automation={a} />
            </div>
          )}
        </div>

        {/* Dry-run row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 14,
            alignItems: "center",
            padding: "14px 16px",
            border: "1px solid var(--hairline-soft)",
            borderRadius: 10,
            background: "var(--surface-soft)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              Dry-run mode
            </div>
            <div
              style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}
            >
              Plan and log, but don't fire actions. Recommended while you're
              tuning predicates.
            </div>
          </div>
          <Switch
            checked={a.dryRun}
            onCheckedChange={(v) => update({ dryRun: v })}
            aria-label="Toggle dry-run mode"
          />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "14px 22px",
          borderTop: "1px solid var(--hairline-soft)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--muted-foreground)",
          }}
        >
          idempotent on (automation_id, trigger_event_id)
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(a)}
          disabled={a.actions.length === 0}
        >
          {isNew ? "Create automation" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        padding: "60px 40px",
        border: "1px dashed var(--hairline)",
        borderRadius: 12,
        background: "var(--surface-soft)",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <ActivityIcon size={40} style={{ color: "var(--muted-foreground)" }} />
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--ink)",
        }}
      >
        No automations yet
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--muted-foreground)",
          maxWidth: 420,
          lineHeight: 1.5,
        }}
      >
        Connect events from one tool to actions in another. Post to Slack when
        your PR is up, auto-reply during Focus, transition tickets when a PR
        merges.
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Button onClick={onCreate}>
          <PlusIcon size={16} />
          New automation
        </Button>
        <Button variant="outline">Browse templates</Button>
      </div>
    </div>
  );
}

// ── AutomationsPage ───────────────────────────────────────────────────────────

export function AutomationsPage({
  items: initialItems = [],
  onSave,
}: {
  items?: AutomationItem[];
  onSave?: (items: AutomationItem[]) => Promise<void>;
}) {
  const [items, setItems] = useState<AutomationItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string>(initialItems[0]?.id ?? "");
  const [mode, setMode] = useState<AutomationMode>("list");
  const [filter, setFilter] = useState("");

  const visible = items.filter(
    (a) =>
      !filter || a.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const selected = items.find((a) => a.id === selectedId) ?? items[0];

  const updateSelected = (patch: Partial<AutomationItem>) => {
    setItems((prev) => {
      const next = prev.map((a) => (a.id === selectedId ? { ...a, ...patch } : a));
      onSave?.(next).catch(() => {});
      return next;
    });
  };

  const goToBuilder = (id: string) => {
    setSelectedId(id);
    setMode("builder");
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
      data-testid="automations-page"
    >
      {/* Header row */}
      {mode === "list" && (
        <>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              Automations
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "var(--muted-foreground)",
                margin: "4px 0 0",
              }}
            >
              When something happens, do something. Spans GitHub, Slack,
              Calendar, and Focus.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--muted-foreground)",
              }}
            >
              {items.filter((a) => a.enabled).length} active ·{" "}
              {items.filter((a) => !a.enabled).length} paused ·{" "}
              {items.filter((a) => a.dryRun).length} dry-run
            </span>
            <span style={{ flex: 1 }} />
            <Button
              size="sm"
              onClick={() => goToBuilder("__new__")}
            >
              <PlusIcon size={14} />
              New automation
            </Button>
          </div>
        </>
      )}

      {/* Breadcrumb for non-list modes */}
      {mode !== "list" && (
        <AutomationsBreadcrumb
          crumbs={[
            { label: "Automations", onClick: () => setMode("list") },
            {
              label:
                mode === "builder"
                  ? selectedId === "__new__"
                    ? "New"
                    : (selected?.name ?? "")
                  : (selected?.name ?? ""),
            },
            ...(mode === "runs" ? [{ label: "Runs" }] : []),
          ]}
        />
      )}

      {/* Main content pane */}
      {mode === "list" && items.length === 0 && !filter ? (
        <EmptyState onCreate={() => goToBuilder("__new__")} />
      ) : mode === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter automations…"
            className="max-w-sm"
          />
          {visible.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--muted-foreground)",
              }}
            >
              No automations match &ldquo;{filter}&rdquo;.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 10,
              }}
            >
              {visible.map((a) => (
                <AutomationListCard
                  key={a.id}
                  a={a}
                  onClick={() => {
                    setSelectedId(a.id);
                    setMode("detail");
                  }}
                  onToggle={(v) =>
                    setItems((prev) => {
                      const updated = prev.map((x) =>
                        x.id === a.id ? { ...x, enabled: v } : x,
                      );
                      onSave?.(updated).catch(() => {});
                      return updated;
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--hairline-soft)",
            borderRadius: 12,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 600,
          }}
        >
          {mode === "builder" ? (
            <AutomationBuilder
              key={selectedId}
              automation={
                selectedId === "__new__" ? makeBlankAutomation() : (selected ?? makeBlankAutomation())
              }
              isNew={selectedId === "__new__"}
              onSave={(next) => {
                if (selectedId === "__new__") {
                  const id = `a${Date.now()}`;
                  const newItem: AutomationItem = {
                    ...next,
                    id,
                    stats: { lastRunAt: null, lastStatus: null, totalRuns: 0, fail7d: 0 },
                  };
                  setItems((prev) => {
                    const updated = [...prev, newItem];
                    onSave?.(updated).catch(() => {});
                    return updated;
                  });
                  setSelectedId(id);
                } else {
                  setItems((prev) => {
                    const updated = prev.map((x) =>
                      x.id === selectedId ? { ...x, ...next } : x,
                    );
                    onSave?.(updated).catch(() => {});
                    return updated;
                  });
                }
                setMode("detail");
              }}
              onCancel={() =>
                setMode(selectedId === "__new__" ? "list" : "detail")
              }
            />
          ) : mode === "runs" ? (
            selected ? (
              <RunsView automation={selected} />
            ) : null
          ) : selected ? (
            <AutomationDetail
              automation={selected}
              onEdit={() => setMode("builder")}
              onShowRuns={() => setMode("runs")}
              onUpdate={updateSelected}
              onDelete={() => {
                const next = items.filter((x) => x.id !== selectedId);
                setItems(next);
                setSelectedId(next[0]?.id ?? "");
                setMode("list");
                onSave?.(next).catch(() => {});
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
