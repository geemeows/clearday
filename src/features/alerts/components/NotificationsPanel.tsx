// Settings → Notifications panel (per PRD #29 mockup #2 / issue #41).
//
// Three sub-sections: channels list (Test + Switch per row), per-event
// routing matrix, and a Quiet hours card with mode tabs + schedule editors
// + day strip + allow-through pills. Backend dispatch is out of scope —
// toggles update local state only.

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
    </section>
  );
}
