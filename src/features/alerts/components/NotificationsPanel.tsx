// Settings → Notifications panel (per PRD #29 mockup #2 / issue #41).
//
// Four sub-sections: channels list (Test + Switch per row), per-event
// routing matrix, a Quiet hours card with mode tabs + schedule editors
// + day strip + allow-through pills, and an Inbox rules section
// (RulesPanel + RuleBuilder — fixture-backed; see needs-triage backend issue).

import { Bell, Mail, Monitor, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import {
  type MatrixChannel,
  type MatrixKind,
  type MatrixValue,
  NotificationMatrix,
} from "#/features/alerts/components/NotificationMatrix";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { cn } from "#/lib/cn";

type ChannelDef = {
  id: string;
  label: string;
  description: string;
  icon: "push" | "slack" | "email" | "desktop";
};

const CHANNELS: ReadonlyArray<ChannelDef> = [
  {
    id: "web_push",
    label: "PWA Web Push",
    description: "Native browser notifications on registered devices.",
    icon: "push",
  },
  {
    id: "slack_dm",
    label: "Slack self-DM",
    description: "Posts to your Slackbot DM via your connected Slack account.",
    icon: "slack",
  },
  {
    id: "email",
    label: "Email digest",
    description: "Daily rollup to your work email at 08:00 local.",
    icon: "email",
  },
  {
    id: "desktop",
    label: "Desktop banner",
    description: "Native OS banner via the desktop companion app.",
    icon: "desktop",
  },
];

function ChannelIcon({ kind }: { kind: ChannelDef["icon"] }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
    >
      {kind === "push" && <Bell className="size-4" />}
      {kind === "slack" && <SourceGlyph source="slack" size={18} />}
      {kind === "email" && <Mail className="size-4" />}
      {kind === "desktop" && <Monitor className="size-4" />}
    </span>
  );
}

const MATRIX_KINDS: ReadonlyArray<MatrixKind> = [
  { id: "pr_review", label: "PR review" },
  { id: "mention", label: "@mention" },
  { id: "ci_failure", label: "CI failure" },
  { id: "meeting_10m", label: "Meeting in 10m" },
  { id: "ticket_comment", label: "Ticket comment" },
  { id: "slack_broadcast", label: "Slack broadcast" },
];

const MATRIX_CHANNELS: ReadonlyArray<MatrixChannel> = [
  { id: "push", label: "Push" },
  { id: "slack", label: "Slack" },
  { id: "email", label: "Email" },
  { id: "desktop", label: "Desktop" },
  { id: "sound", label: "Sound" },
];

const DEFAULT_MATRIX: MatrixValue = {
  pr_review: {
    push: true,
    slack: true,
    email: false,
    desktop: false,
    sound: false,
  },
  mention: {
    push: true,
    slack: true,
    email: false,
    desktop: true,
    sound: true,
  },
  ci_failure: {
    push: true,
    slack: true,
    email: true,
    desktop: true,
    sound: true,
  },
  meeting_10m: {
    push: true,
    slack: false,
    email: false,
    desktop: true,
    sound: true,
  },
  ticket_comment: {
    push: false,
    slack: true,
    email: false,
    desktop: false,
    sound: false,
  },
  slack_broadcast: {
    push: false,
    slack: false,
    email: false,
    desktop: false,
    sound: false,
  },
};

const DAYS = [
  { id: "mon", label: "Mon", weekend: false },
  { id: "tue", label: "Tue", weekend: false },
  { id: "wed", label: "Wed", weekend: false },
  { id: "thu", label: "Thu", weekend: false },
  { id: "fri", label: "Fri", weekend: false },
  { id: "sat", label: "Sat", weekend: true },
  { id: "sun", label: "Sun", weekend: true },
] as const;

const DEFAULT_ALLOW_THROUGH = ["@mentions", "CI red on prod", "On-call pages"];

// ── Quiet hours schedule types ────────────────────────────────────────────────

type QHMode = "uniform" | "weekday-weekend" | "per-day";

type PerDayEntry = { on: boolean; from: string; to: string };

const QH_MODES: ReadonlyArray<{ id: QHMode; label: string }> = [
  { id: "uniform", label: "Same every day" },
  { id: "weekday-weekend", label: "Weekday / weekend" },
  { id: "per-day", label: "Per day" },
];

const DEFAULT_PER_DAY: Record<string, PerDayEntry> = {
  Mon: { on: true, from: "22:00", to: "08:00" },
  Tue: { on: true, from: "22:00", to: "08:00" },
  Wed: { on: true, from: "22:00", to: "08:00" },
  Thu: { on: true, from: "22:00", to: "08:00" },
  Fri: { on: true, from: "22:00", to: "09:00" },
  Sat: { on: true, from: "00:00", to: "23:59" },
  Sun: { on: true, from: "00:00", to: "23:59" },
};

function TimeField({
  value,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  "aria-label"?: string;
}) {
  return (
    <input
      type="time"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "rounded-[6px] border border-[var(--hairline)] px-[10px] py-[6px] font-mono text-[12px] outline-none focus:ring-1 focus:ring-[var(--ring)]",
        disabled
          ? "bg-[var(--surface-strong)] text-[var(--muted-soft)]"
          : "bg-[var(--canvas)] text-[var(--ink)]",
      )}
    />
  );
}

// ── Inbox rules (fixture-backed per v4 fixture rule; backend follow-up needed) ─

type Condition = { field: string; op: string; value: string };
type RuleAction = { id: string; label: string; params: string[] | null };

const FIELDS = [
  "source",
  "author",
  "channel",
  "repo",
  "title contains",
  "labels include",
  "diff size",
  "is draft",
] as const;

const OPS_BY_FIELD: Record<string, string[]> = {
  source: ["is", "is not"],
  author: ["is", "is not", "matches"],
  channel: ["is", "is not", "in"],
  repo: ["is", "is not", "matches"],
  "title contains": ["matches", "doesn't match"],
  "labels include": ["any of", "all of", "none of"],
  "diff size": [">", "<", "="],
  "is draft": ["is true", "is false"],
};

const VALUES_BY_FIELD: Record<string, string[]> = {
  source: ["github", "slack", "calendar", "linear"],
  author: ["dependabot", "renovate-bot", "@me", "team:platform"],
  channel: ["#eng-announce", "#incidents", "#deploys", "#random"],
  repo: ["acme/web", "acme/api", "acme/infra", "acme/*"],
  "title contains": ["prod", "incident", "[WIP]", "lockfile only"],
  "labels include": ["urgent", "blocked", "good-first-issue"],
  "diff size": ["10 lines", "100 lines", "500 lines"],
  "is draft": ["—"],
};

const RULE_ACTIONS: RuleAction[] = [
  { id: "snooze", label: "Snooze", params: ["1 hour", "4 hours", "1 day", "until tomorrow", "until Monday"] },
  { id: "low", label: "Mark as low-prio", params: null },
  { id: "dismiss", label: "Auto-dismiss", params: null },
  { id: "bypass", label: "Bypass quiet hours", params: null },
  { id: "weekly", label: "Add to weekly review", params: null },
  { id: "tag", label: "Add tag", params: ["follow-up", "review", "later", "incident"] },
  { id: "route", label: "Route to", params: ["push", "Slack DM", "email", "desktop"] },
];

type FixtureRule = {
  when: string;
  then: string;
  on: boolean;
  hits: number;
};

// Fixture — UI ships here; wire backend when ready (needs-triage issue filed).
const FIXTURE_RULES: FixtureRule[] = [
  { when: "PR author is dependabot", then: "Snooze 1 day", on: true, hits: 47 },
  { when: "Slack channel is #eng-announce", then: "Mark as low-priority", on: true, hits: 12 },
  { when: "PR has only lockfile changes", then: "Auto-dismiss", on: false, hits: 31 },
  { when: "Mention contains \"prod\" or \"incident\"", then: "Bypass quiet hours", on: true, hits: 4 },
  { when: "Meeting has no agenda", then: "Add to weekly review", on: false, hits: 8 },
];

function RuleChip({
  value,
  options,
  onChange,
  kind,
  "aria-label": ariaLabel,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  kind: "field" | "op" | "value";
  "aria-label"?: string;
}) {
  const base =
    "rounded-md border-none outline-none cursor-pointer text-[13px] appearance-none";
  const kindCls =
    kind === "field"
      ? "bg-[var(--surface-strong)] text-[var(--ink)] font-semibold px-2.5 py-[5px] pr-6"
      : kind === "op"
        ? "bg-transparent text-[var(--muted)] font-medium px-1 py-[4px]"
        : "bg-[var(--primary-disabled)] text-[var(--primary-active)] font-mono font-medium px-2.5 py-[5px] pr-6";

  return (
    <span className="relative inline-block">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${base} ${kindCls}`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {kind !== "op" && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[var(--muted)]"
        >
          ▾
        </span>
      )}
    </span>
  );
}

function RuleBuilder({
  onSave,
  onCancel,
}: {
  onSave: () => void;
  onCancel: () => void;
}) {
  const [matchAll, setMatchAll] = useState(true);
  const [conds, setConds] = useState<Condition[]>([
    { field: "source", op: "is", value: "github" },
  ]);
  const [action, setAction] = useState("snooze");
  const [actionParam, setActionParam] = useState<string | null>("1 day");
  const [ruleName, setRuleName] = useState("Auto-snooze dependabot");

  const updateCond = (i: number, patch: Partial<Condition>) =>
    setConds((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addCond = () =>
    setConds((cs) => [
      ...cs,
      { field: "author", op: "is", value: "dependabot" },
    ]);
  const removeCond = (i: number) =>
    setConds((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs));

  const currentAction = RULE_ACTIONS.find((a) => a.id === action);

  return (
    <div
      aria-label="New rule builder"
      className="mb-3.5 rounded-xl border-[1.5px] border-[var(--primary)] bg-[var(--canvas)] p-[18px]"
    >
      <div className="mb-3.5 flex items-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.6px] text-[var(--primary-active)]">
          NEW RULE
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-[var(--muted)]">
          preview matches{" "}
          <b className="text-[var(--ink)]">3 signals</b> from last 7d
        </span>
      </div>

      {/* WHEN */}
      <div className="mb-3.5 flex items-start gap-3.5">
        <span className="w-[50px] pt-2 font-mono text-[11px] font-bold text-[var(--muted)]">
          WHEN
        </span>
        <div className="flex-1">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[13px] text-[var(--body)]">
              signal matches
            </span>
            <div className="inline-flex rounded-md bg-[var(--surface-soft)] p-0.5">
              {(
                [
                  ["all", true],
                  ["any", false],
                ] as const
              ).map(([l, v]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setMatchAll(v)}
                  className={cn(
                    "rounded px-3 py-1 text-[12px] font-semibold transition-colors",
                    matchAll === v
                      ? "bg-[var(--canvas)] text-[var(--ink)] shadow-sm"
                      : "bg-transparent text-[var(--muted)]",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-[13px] text-[var(--body)]">
              of these conditions:
            </span>
          </div>
          {conds.map((c, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: condition order is stable within the builder
              key={i}
              className="mb-2 flex items-center gap-1.5 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"
            >
              <RuleChip
                aria-label={`Condition ${i + 1} field`}
                kind="field"
                value={c.field}
                options={FIELDS}
                onChange={(v) =>
                  updateCond(i, {
                    field: v,
                    op: OPS_BY_FIELD[v]?.[0] ?? "is",
                    value: VALUES_BY_FIELD[v]?.[0] ?? "",
                  })
                }
              />
              <RuleChip
                aria-label={`Condition ${i + 1} op`}
                kind="op"
                value={c.op}
                options={OPS_BY_FIELD[c.field] ?? ["is"]}
                onChange={(v) => updateCond(i, { op: v })}
              />
              <RuleChip
                aria-label={`Condition ${i + 1} value`}
                kind="value"
                value={c.value}
                options={VALUES_BY_FIELD[c.field] ?? [c.value]}
                onChange={(v) => updateCond(i, { value: v })}
              />
              <span className="flex-1" />
              {conds.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCond(i)}
                  aria-label={`Remove condition ${i + 1}`}
                  className="cursor-pointer border-none bg-transparent px-1 text-[16px] leading-none text-[var(--muted)]"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addCond}
            aria-label="Add condition"
            className="cursor-pointer rounded-md border border-dashed border-[var(--hairline)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[var(--muted)]"
          >
            + Add condition
          </button>
        </div>
      </div>

      {/* THEN */}
      <div className="mb-3.5 flex items-start gap-3.5 border-t border-[var(--hairline-soft)] pt-3.5">
        <span className="w-[50px] pt-2 font-mono text-[11px] font-bold text-[var(--primary)]">
          THEN
        </span>
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
          <RuleChip
            aria-label="Rule action"
            kind="field"
            value={currentAction?.label ?? RULE_ACTIONS[0].label}
            options={RULE_ACTIONS.map((a) => a.label)}
            onChange={(v) => {
              const a = RULE_ACTIONS.find((x) => x.label === v);
              if (!a) return;
              setAction(a.id);
              setActionParam(a.params?.[0] ?? null);
            }}
          />
          {currentAction?.params && actionParam !== null && (
            <RuleChip
              aria-label="Rule action parameter"
              kind="value"
              value={actionParam}
              options={currentAction.params}
              onChange={setActionParam}
            />
          )}
        </div>
      </div>

      {/* NAME */}
      <div className="mb-[18px] flex items-center gap-3.5 border-t border-[var(--hairline-soft)] pt-3.5">
        <span className="w-[50px] font-mono text-[11px] font-bold text-[var(--muted)]">
          NAME
        </span>
        <input
          aria-label="Rule name"
          value={ruleName}
          onChange={(e) => setRuleName(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="outline" onClick={onSave}>
          Test on history
        </Button>
        <Button type="button" variant="default" onClick={onSave}>
          Save rule
        </Button>
      </div>
    </div>
  );
}

function InboxRulesPanel() {
  const [rules, setRules] = useState<FixtureRule[]>(FIXTURE_RULES);
  const [editing, setEditing] = useState(false);

  const toggleRule = (i: number) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, on: !r.on } : r)));

  const activeCount = rules.filter((r) => r.on).length;

  return (
    <section>
      <h3 className="font-semibold text-[15px] text-[var(--ink)] tracking-tight">
        Inbox rules
      </h3>
      <p className="mt-1 text-[var(--body)] text-sm">
        Pure rule evaluator over Signals — runs after upsert, before alert
        dispatch.
      </p>

      <div className="mt-3 flex items-center">
        <span className="text-[13px] text-[var(--body)]">
          {activeCount} of {rules.length} active · evaluated in order, top-down
        </span>
        <span className="flex-1" />
        {!editing && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Plus className="size-3.5" />
            New rule
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-3">
          <RuleBuilder
            onSave={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      <ul
        aria-label="Inbox rules list"
        className="mt-3 overflow-hidden rounded-lg border border-[var(--hairline-soft)]"
      >
        {rules.map((r, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: rule order is stable fixture data
            key={i}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 border-b border-[var(--hairline-soft)] px-3.5 py-3 last:border-b-0"
          >
            <span className="w-6 text-right font-mono text-[11px] font-bold text-[var(--muted)]">
              {i + 1}
            </span>
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="font-mono text-[11px] text-[var(--muted)]">
                WHEN
              </span>
              <code className="rounded bg-[var(--surface-soft)] px-2 py-[3px] font-mono text-[12px]">
                {r.when}
              </code>
              <span className="font-mono text-[11px] text-[var(--muted)]">
                THEN
              </span>
              <span className="font-medium">{r.then}</span>
              <span className="ml-auto pl-3 font-mono text-[10px] text-[var(--muted)]">
                {r.hits} hits / 30d
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Edit rule ${i + 1}`}
            >
              Edit
            </Button>
            <Switch
              aria-label={`Rule ${i + 1} enabled`}
              checked={r.on}
              onCheckedChange={() => toggleRule(i)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NotificationsPanel() {
  const [channelEnabled, setChannelEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CHANNELS.map((c) => [c.id, true])),
  );
  const [matrix, setMatrix] = useState<MatrixValue>(DEFAULT_MATRIX);
  const [quietHoursOn, setQuietHoursOn] = useState(true);
  const [allowThrough, setAllowThrough] = useState<string[]>(
    DEFAULT_ALLOW_THROUGH,
  );
  const [draft, setDraft] = useState("");

  // Quiet hours schedule state
  const [qhMode, setQhMode] = useState<QHMode>("weekday-weekend");
  const [uniform, setUniform] = useState({ from: "22:00", to: "08:00" });
  const [weekday, setWeekday] = useState({ from: "22:00", to: "08:00" });
  const [weekend, setWeekend] = useState({
    on: true,
    allDay: true,
    from: "00:00",
    to: "23:59",
  });
  const [perDay, setPerDay] =
    useState<Record<string, PerDayEntry>>(DEFAULT_PER_DAY);

  const onMatrixToggle = (kind: string, channel: string) => {
    setMatrix((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        [channel]: !prev[kind]?.[channel],
      },
    }));
  };

  const onAddAllow = () => {
    const v = draft.trim();
    if (!v) return;
    if (allowThrough.includes(v)) {
      setDraft("");
      return;
    }
    setAllowThrough((prev) => [...prev, v]);
    setDraft("");
  };

  const onRemoveAllow = (name: string) => {
    setAllowThrough((prev) => prev.filter((x) => x !== name));
  };

  const summaryFor = (label: string, i: number): string => {
    if (!quietHoursOn) return "off";
    if (qhMode === "uniform") return `${uniform.from}–${uniform.to}`;
    if (qhMode === "weekday-weekend") {
      if (i < 5) return `${weekday.from}–${weekday.to}`;
      return weekend.on
        ? weekend.allDay
          ? "all day"
          : `${weekend.from}–${weekend.to}`
        : "off";
    }
    const p = perDay[label];
    return p?.on ? `${p.from}–${p.to}` : "off";
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="font-semibold text-[var(--ink)] text-xl tracking-tight">
          Notifications
        </h2>
        <p className="mt-2 max-w-2xl text-[var(--body)] text-sm">
          Choose channels, route per event kind, and define quiet hours.
        </p>
      </header>

      <section>
        <h3 className="font-semibold text-[15px] text-[var(--ink)] tracking-tight">
          Channels
        </h3>
        <ul
          aria-label="Notification channels"
          className="mt-3 divide-y divide-[var(--hairline-soft)] overflow-hidden rounded-lg border border-[var(--hairline-soft)] bg-[var(--surface-card)]"
        >
          {CHANNELS.map((c) => (
            <li key={c.id} className="flex items-center gap-3.5 px-4 py-3.5">
              <ChannelIcon kind={c.icon} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[14px] text-[var(--ink)]">
                  {c.label}
                </div>
                <p className="mt-0.5 text-[13px] text-[var(--body)]">
                  {c.description}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Test ${c.label}`}
              >
                Test
              </Button>
              <Switch
                aria-label={`${c.label} enabled`}
                checked={channelEnabled[c.id] ?? false}
                onCheckedChange={(next) =>
                  setChannelEnabled((prev) => ({ ...prev, [c.id]: next }))
                }
              />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-[15px] text-[var(--ink)] tracking-tight">
          Per-event routing
        </h3>
        <p className="mt-1 text-[var(--body)] text-sm">
          Pick which channels fire for each kind of signal.
        </p>
        <div className="mt-3 rounded-lg border border-[var(--hairline-soft)] bg-[var(--surface-card)] p-4">
          <NotificationMatrix
            kinds={MATRIX_KINDS}
            channels={MATRIX_CHANNELS}
            value={matrix}
            onToggle={onMatrixToggle}
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[15px] text-[var(--ink)] tracking-tight">
            Quiet hours
          </h3>
          <Switch
            aria-label="Quiet hours enabled"
            checked={quietHoursOn}
            onCheckedChange={setQuietHoursOn}
          />
        </div>
        <p className="mt-1 text-[var(--body)] text-sm">
          Hold non-urgent pings during these windows. Items still land in your
          Inbox.
        </p>

        {/* schedule mode tabs */}
        <div
          className={cn(
            "mt-4 inline-flex rounded-lg bg-[var(--surface-soft)] p-0.75",
            !quietHoursOn && "pointer-events-none opacity-50",
          )}
        >
          {QH_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={qhMode === m.id}
              onClick={() => setQhMode(m.id)}
              className={cn(
                "rounded-[6px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                qhMode === m.id
                  ? "bg-[var(--canvas)] text-[var(--ink)] shadow-sm"
                  : "bg-transparent text-[var(--muted)]",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* schedule editors */}
        <div
          className={cn(
            "mt-3",
            !quietHoursOn && "pointer-events-none opacity-50",
          )}
        >
          {qhMode === "uniform" && (
            <div className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5">
              <span className="text-[13px] text-[var(--body)]">
                Every day from
              </span>
              <TimeField
                aria-label="Uniform quiet start"
                value={uniform.from}
                onChange={(v) => setUniform((s) => ({ ...s, from: v }))}
              />
              <span className="text-[13px] text-[var(--body)]">to</span>
              <TimeField
                aria-label="Uniform quiet end"
                value={uniform.to}
                onChange={(v) => setUniform((s) => ({ ...s, to: v }))}
              />
              <span className="ml-auto font-mono text-[11px] text-[var(--muted)]">
                {uniform.from > uniform.to ? "overnight" : "same day"}
              </span>
            </div>
          )}

          {qhMode === "weekday-weekend" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5">
                <span className="w-24 text-[13px] font-semibold text-[var(--ink)]">
                  Mon–Fri
                </span>
                <span className="text-[13px] text-[var(--body)]">from</span>
                <TimeField
                  aria-label="Weekday quiet start"
                  value={weekday.from}
                  onChange={(v) => setWeekday((s) => ({ ...s, from: v }))}
                />
                <span className="text-[13px] text-[var(--body)]">to</span>
                <TimeField
                  aria-label="Weekday quiet end"
                  value={weekday.to}
                  onChange={(v) => setWeekday((s) => ({ ...s, to: v }))}
                />
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5">
                <span className="w-24 text-[13px] font-semibold text-[var(--ink)]">
                  Sat–Sun
                </span>
                <Switch
                  aria-label="Weekend quiet hours on"
                  checked={weekend.on}
                  onCheckedChange={(v) =>
                    setWeekend((s) => ({ ...s, on: v }))
                  }
                />
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={weekend.allDay}
                    onChange={(e) =>
                      setWeekend((s) => ({ ...s, allDay: e.target.checked }))
                    }
                  />
                  All day
                </label>
                {!weekend.allDay && (
                  <>
                    <span className="text-[13px] text-[var(--body)]">from</span>
                    <TimeField
                      aria-label="Weekend quiet start"
                      value={weekend.from}
                      onChange={(v) =>
                        setWeekend((s) => ({ ...s, from: v }))
                      }
                    />
                    <span className="text-[13px] text-[var(--body)]">to</span>
                    <TimeField
                      aria-label="Weekend quiet end"
                      value={weekend.to}
                      onChange={(v) => setWeekend((s) => ({ ...s, to: v }))}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {qhMode === "per-day" && (
            <div className="flex flex-col gap-1.5">
              {DAYS.map((d) => {
                const p = perDay[d.label];
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-soft)] px-3 py-2"
                  >
                    <span className="w-10 text-[13px] font-semibold text-[var(--ink)]">
                      {d.label}
                    </span>
                    <Switch
                      aria-label={`Quiet hours ${d.label} on`}
                      checked={p?.on ?? false}
                      onCheckedChange={(v) =>
                        setPerDay((s) => ({
                          ...s,
                          [d.label]: { ...s[d.label], on: v },
                        }))
                      }
                    />
                    <span
                      className={cn(
                        "text-[13px]",
                        p?.on
                          ? "text-[var(--body)]"
                          : "text-[var(--muted-soft)]",
                      )}
                    >
                      from
                    </span>
                    <TimeField
                      aria-label={`Quiet start ${d.label}`}
                      value={p?.from ?? "22:00"}
                      disabled={!p?.on}
                      onChange={(v) =>
                        setPerDay((s) => ({
                          ...s,
                          [d.label]: { ...s[d.label], from: v },
                        }))
                      }
                    />
                    <span
                      className={cn(
                        "text-[13px]",
                        p?.on
                          ? "text-[var(--body)]"
                          : "text-[var(--muted-soft)]",
                      )}
                    >
                      to
                    </span>
                    <TimeField
                      aria-label={`Quiet end ${d.label}`}
                      value={p?.to ?? "08:00"}
                      disabled={!p?.on}
                      onChange={(v) =>
                        setPerDay((s) => ({
                          ...s,
                          [d.label]: { ...s[d.label], to: v },
                        }))
                      }
                    />
                    <span className="ml-auto font-mono text-[10px] text-[var(--muted)]">
                      {p?.on && p.from > p.to ? "overnight" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* week summary strip — computed from current schedule state */}
        <ul
          aria-label="Quiet hours week strip"
          className={cn(
            "mt-3 grid grid-cols-7 gap-1.5",
            !quietHoursOn && "opacity-50",
          )}
        >
          {DAYS.map((d, i) => {
            const summary = summaryFor(d.label, i);
            const off = summary === "off";
            return (
              <li
                key={d.id}
                className={cn(
                  "rounded-lg p-2 text-center",
                  off
                    ? "bg-[var(--surface-strong)] text-[var(--muted)]"
                    : "bg-[var(--ink)] text-white",
                )}
              >
                <div className="font-semibold text-[11px]">{d.label}</div>
                <div className="mt-0.5 font-mono text-[10px] opacity-75">
                  {summary}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4">
          <div className="font-mono text-[10px] text-[var(--muted)] uppercase tracking-[0.04em]">
            Allow through
          </div>
          <ul
            aria-label="Allow through pills"
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            {allowThrough.map((name) => (
              <li key={name}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-disabled)] px-2.5 py-1 text-[12px] text-[var(--primary-active)]">
                  {name}
                  <button
                    type="button"
                    onClick={() => onRemoveAllow(name)}
                    aria-label={`Remove ${name}`}
                    className="text-[var(--primary-active)]/70 hover:text-[var(--primary-active)]"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </li>
            ))}
            <li>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onAddAllow();
                }}
              >
                <Input
                  aria-label="Add allow-through rule"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="+ Add rule"
                  className="h-7 max-w-[10rem] text-xs"
                />
                <Button type="submit" variant="outline" size="sm">
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </form>
            </li>
          </ul>
        </div>
      </section>

      <InboxRulesPanel />
    </section>
  );
}
