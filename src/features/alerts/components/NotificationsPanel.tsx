// Settings → Notifications panel (per PRD #29 mockup #2 / issue #41).
//
// Three sub-sections: channels list (Test + Switch per row), per-event
// routing matrix, and a Quiet hours card with day strip + allow-through
// pills. Backend dispatch is out of scope — toggles update local state only.

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

  return (
    <section className="space-y-8">
      <header>
        <h2 className="font-semibold text-2xl tracking-tight">Notifications</h2>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Choose channels, route per event kind, and define quiet hours.
        </p>
      </header>

      <section>
        <h3 className="font-semibold text-base tracking-tight">Channels</h3>
        <ul
          aria-label="Notification channels"
          className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card"
        >
          {CHANNELS.map((c) => (
            <li key={c.id} className="flex items-center gap-4 px-4 py-3">
              <ChannelIcon kind={c.icon} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">{c.label}</div>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {c.description}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
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
        <h3 className="font-semibold text-base tracking-tight">
          Per-event routing
        </h3>
        <p className="mt-1 text-muted-foreground text-sm">
          Pick which channels fire for each kind of signal.
        </p>
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
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
          <h3 className="font-semibold text-base tracking-tight">
            Quiet hours
          </h3>
          <Switch
            aria-label="Quiet hours enabled"
            checked={quietHoursOn}
            onCheckedChange={setQuietHoursOn}
          />
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          Hold non-urgent pings during these windows. Items still land in your
          Inbox.
        </p>
        <ul
          aria-label="Quiet hours week strip"
          className="mt-3 grid grid-cols-7 gap-2"
        >
          {DAYS.map((d) => (
            <li
              key={d.id}
              className={cn(
                "rounded-md border border-border p-3 text-center",
                d.weekend
                  ? "bg-muted text-muted-foreground"
                  : "bg-foreground text-background",
              )}
            >
              <div className="font-medium text-xs uppercase tracking-wider">
                {d.label}
              </div>
              <div className="mt-1 font-mono text-[11px]">
                {d.weekend ? "all day" : "22:00–08:00"}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <h4 className="font-medium text-sm">Allow through</h4>
          <ul
            aria-label="Allow through pills"
            className="mt-2 flex flex-wrap gap-2"
          >
            {allowThrough.map((name) => (
              <li key={name}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
                  {name}
                  <button
                    type="button"
                    onClick={() => onRemoveAllow(name)}
                    aria-label={`Remove ${name}`}
                    className="text-muted-foreground hover:text-foreground"
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
