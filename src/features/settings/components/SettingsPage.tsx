// SettingsPage — Redesign v5 / Settings (#184)
// All tabs: Profile, Integrations, Notifications, Inbox rules, AI provider,
// Self-host, Theme, Week start, Data & privacy, Career.

import { useEffect, useState } from "react";
import { CheckIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { ProfilePanel } from "#/features/settings/profile/components/ProfilePanel";
import { SelfHostPanel } from "#/features/settings/self-host/components/SelfHostPanel";
import { useWeekStart } from "#/features/settings/week-start/use-week-start";
import { WEEK_STARTS } from "#/features/settings/week-start/api";
import {
  THEME_UPDATED_EVENT,
  DEFAULT_THEME,
  type ThemeView,
  type Theme,
  type Density,
} from "#/features/settings/theme/api";
import { apiFetch } from "#/lib/api-client";

// ── Tabs ─────────────────────────────────────────────────────────────────────

const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "integrations", label: "Integrations" },
  { id: "notifications", label: "Notifications" },
  { id: "inbox-rules", label: "Inbox rules" },
  { id: "ai", label: "AI provider" },
  { id: "selfhost", label: "Self-host" },
  { id: "theme", label: "Theme" },
  { id: "week-start", label: "Week start" },
  { id: "data-privacy", label: "Data & privacy" },
  { id: "career", label: "Career" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-[18px]">
      <h2 className="font-semibold text-xl leading-[1.25] tracking-[-0.2px]">
        {title}
      </h2>
      {sub && (
        <p className="mt-1 text-muted-foreground text-sm leading-[1.5]">{sub}</p>
      )}
    </div>
  );
}

function SettingsRow({
  children,
  last = false,
}: {
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 px-4 py-3.5${last ? "" : " border-b border-[var(--hairline-soft)]"}`}
    >
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-[var(--surface-soft)] p-[3px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            value === o.id
              ? "bg-[var(--canvas)] text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,.05)]"
              : "text-[var(--muted)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Integrations panel ────────────────────────────────────────────────────────

const ACCOUNT_GRADIENTS = [
  "linear-gradient(135deg, #ffd1da, #ff385c)",
  "linear-gradient(135deg, #bfdbfe, #2563eb)",
  "linear-gradient(135deg, #ddd6fe, #7c3aed)",
  "linear-gradient(135deg, #a7e0c0, #0a8754)",
  "linear-gradient(135deg, #fde68a, #b45309)",
];

export type Account = {
  id: string;
  handle: string;
  initials: string;
  context: string;
  scopes?: string;
  status: "good" | "warn" | "bad";
  last: string;
  primary: boolean;
};

function AccountAvatar({
  initials,
  idx = 0,
  size = 28,
}: {
  initials: string;
  idx?: number;
  size?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: ACCOUNT_GRADIENTS[idx % ACCOUNT_GRADIENTS.length],
      }}
    >
      {initials}
    </div>
  );
}

function AccountRow({
  acc,
  idx,
  onRemove,
  isLast,
}: {
  acc: Account;
  idx: number;
  onRemove: () => void;
  isLast: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 pl-[60px] pr-4 py-3${isLast ? "" : " border-b border-[var(--hairline-soft)]"}`}
    >
      <AccountAvatar initials={acc.initials} idx={idx} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--ink)]">
            {acc.handle}
          </span>
          {acc.primary && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4px] bg-[var(--surface-strong)] text-[var(--muted)]">
              PRIMARY
            </span>
          )}
          <span
            className={`size-[7px] rounded-full ${acc.status === "good" ? "bg-[var(--good)]" : acc.status === "warn" ? "bg-[var(--warn)]" : "bg-[var(--danger)]"}`}
          />
          <span className="font-mono text-[11px] text-[var(--muted)]">
            {acc.last}
          </span>
        </div>
        <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--muted)]">
          {acc.context}
          {acc.scopes && (
            <span className="ml-2 font-mono text-[10px] text-[var(--muted-soft)]">
              {acc.scopes}
            </span>
          )}
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm">
        Reauthorize
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="text-destructive hover:text-destructive"
      >
        Remove
      </Button>
    </div>
  );
}

const SLACK_CHANNELS_DEFAULT = [
  "#incidents",
  "#platform-eng",
  "#oncall",
  "#deploys",
];

function SlackChannelAllowlist() {
  const [channels, setChannels] = useState(SLACK_CHANNELS_DEFAULT);
  const [draft, setDraft] = useState("");

  return (
    <div className="border-t border-[var(--hairline-soft)] bg-[var(--canvas)] px-4 py-3.5">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--muted)]">
          Channel allowlist
        </span>
        <span className="text-xs text-[var(--muted)]">
          Capture{" "}
          <code className="rounded bg-[var(--surface-soft)] px-[5px] py-[1px] font-mono text-[11px]">
            @here
          </code>{" "}
          /{" "}
          <code className="rounded bg-[var(--surface-soft)] px-[5px] py-[1px] font-mono text-[11px]">
            @channel
          </code>{" "}
          only here.
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {channels.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-strong)] px-2.5 py-1 font-mono text-xs"
          >
            {c}
            <button
              type="button"
              onClick={() => setChannels((cs) => cs.filter((x) => x !== c))}
              className="ml-1 text-[var(--muted)] hover:text-[var(--ink)]"
            >
              ×
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (v && !channels.includes(v)) setChannels((cs) => [...cs, v]);
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="+ Add channel"
            className="rounded-full border border-dashed border-[var(--hairline)] bg-transparent px-2.5 py-1 text-xs text-[var(--muted)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
          />
        </form>
      </div>
    </div>
  );
}

function CalendarWeekStartInline() {
  const { weekStart, setWeekStart } = useWeekStart();
  const options = WEEK_STARTS.map((id) => ({
    id,
    label: id === "sun" ? "Sunday" : id === "mon" ? "Monday" : "Saturday",
  }));
  return (
    <div className="border-t border-[var(--hairline-soft)] bg-[var(--canvas)] px-4 py-3.5">
      <div className="flex items-center gap-3.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--muted)]">
            Week starts on
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Affects the week view on the Calendar page and weekly stats.
          </div>
        </div>
        <span className="flex-1" />
        <SegmentedControl
          options={options}
          value={weekStart}
          onChange={setWeekStart}
        />
      </div>
    </div>
  );
}

function ProviderExtras({ providerId }: { providerId: string }) {
  if (providerId === "slack") return <SlackChannelAllowlist />;
  if (providerId === "cal") return <CalendarWeekStartInline />;
  return null;
}

export type Provider = {
  id: string;
  name: string;
  desc: string;
};

type AccountsByProvider = Record<string, Account[]>;

function IntegrationCard({
  provider,
  accounts,
  onRemoveAccount,
  onAddAccount,
}: {
  provider: Provider;
  accounts: Account[];
  onRemoveAccount: (id: string) => void;
  onAddAccount: () => void;
}) {
  return (
    <div className="mb-3.5 overflow-hidden rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)]">
      <div
        className={`grid grid-cols-[auto_1fr_auto] items-center gap-3.5 px-4 py-4 bg-[var(--surface-soft)]${accounts.length > 0 ? " border-b border-[var(--hairline-soft)]" : ""}`}
      >
        <SourceGlyph source={provider.id} size={32} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px]">{provider.name}</span>
            <span className="font-mono text-[11px] text-[var(--muted)]">
              {accounts.length}{" "}
              {accounts.length === 1 ? "account" : "accounts"} connected
            </span>
          </div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">
            {provider.desc}
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onAddAccount}
        >
          <PlusIcon className="size-3.5" />
          Add account
        </Button>
      </div>
      {accounts.map((acc, i) => (
        <AccountRow
          key={acc.id}
          acc={acc}
          idx={i}
          onRemove={() => onRemoveAccount(acc.id)}
          isLast={i === accounts.length - 1}
        />
      ))}
      {accounts.length === 0 && (
        <div className="px-4 py-5 text-center text-[13px] text-[var(--muted)]">
          No accounts connected.{" "}
          <button
            type="button"
            onClick={onAddAccount}
            className="font-semibold text-[var(--primary)] hover:underline"
          >
            Connect one →
          </button>
        </div>
      )}
      <ProviderExtras providerId={provider.id} />
    </div>
  );
}

const INTEGRATIONS_PROVIDERS: Provider[] = [
  {
    id: "git",
    name: "GitHub",
    desc: "PR reviews, CI status, comments. Polls each connected account separately.",
  },
  {
    id: "slack",
    name: "Slack",
    desc: "DMs, @mentions, threads. Each workspace gets its own Events API subscription.",
  },
  {
    id: "cal",
    name: "Google Calendar",
    desc: "Per-account: pick which calendars feed your inbox.",
  },
  {
    id: "task",
    name: "Linear",
    desc: "Assigned tickets, in-progress widget. Cron-polled per workspace.",
  },
];

const INITIAL_ACCOUNTS: AccountsByProvider = {
  git: [
    {
      id: "git-1",
      handle: "erinkov",
      initials: "EK",
      context: "Personal · 14 repos · public + private",
      scopes: "repo, read:user",
      status: "good",
      last: "polled 32s ago",
      primary: true,
    },
    {
      id: "git-2",
      handle: "kovacs-acme",
      initials: "AC",
      context: "Acme org · 47 repos · SSO via Okta",
      scopes: "repo, read:org",
      status: "good",
      last: "polled 1m ago",
      primary: false,
    },
  ],
  slack: [
    {
      id: "slack-1",
      handle: "kovacs-team.slack.com",
      initials: "KT",
      context: "Engineering workspace · 23 channels",
      scopes: "channels:history, chat:write",
      status: "good",
      last: "live · 2 events / min",
      primary: true,
    },
  ],
  cal: [
    {
      id: "cal-1",
      handle: "erin@kovacs.dev",
      initials: "EK",
      context: "Work · primary + 2 shared calendars",
      scopes: "calendar.events",
      status: "good",
      last: "polled 1m ago",
      primary: true,
    },
  ],
  task: [
    {
      id: "task-1",
      handle: "Acme Inc",
      initials: "AC",
      context: "Linear workspace · 4 teams · 12 projects",
      scopes: "read, write:comments",
      status: "warn",
      last: "rate-limited · retry 0:42",
      primary: true,
    },
  ],
};

export function IntegrationsPanel() {
  const [accounts, setAccounts] = useState<AccountsByProvider>(INITIAL_ACCOUNTS);

  const removeAccount = (provId: string, accId: string) =>
    setAccounts((s) => ({
      ...s,
      [provId]: (s[provId] ?? []).filter((a) => a.id !== accId),
    }));

  const addAccount = (provId: string) =>
    setAccounts((s) => {
      const existing = s[provId] ?? [];
      return {
        ...s,
        [provId]: [
          ...existing,
          {
            id: `${provId}-${Date.now()}`,
            handle: `account-${existing.length + 1}`,
            initials: "??",
            context: "Newly authorized account",
            scopes: "default scopes",
            status: "good" as const,
            last: "just connected",
            primary: existing.length === 0,
          },
        ],
      };
    });

  const totalAccounts = Object.values(accounts).reduce(
    (a, b) => a + b.length,
    0,
  );

  return (
    <div>
      <SectionHead
        title="Integrations"
        sub="Per-user backend — refresh tokens stored in your own Supabase, never on shared infrastructure. Connect multiple accounts per provider to merge work and personal contexts in one inbox."
      />

      {/* Google Sheets re-consent banner */}
      <div className="mb-3.5 grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-lg border border-[var(--hairline-soft)] bg-[var(--surface-card)] p-3.5">
        <div className="inline-flex size-9 items-center justify-center rounded-lg bg-[var(--good-soft)]">
          <span className="inline-flex size-[22px] items-center justify-center rounded font-bold text-sm text-white" style={{ background: "#0F9D58" }}>
            S
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              Google Sheets — for Career sync
            </span>
            <span className="rounded-full bg-[var(--warn-soft)] px-[7px] py-[1px] text-[10px] font-bold uppercase tracking-[0.4px] text-[var(--warn)]">
              Re-auth needed
            </span>
          </div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">
            Adds{" "}
            <code className="font-mono text-[11.5px]">spreadsheets</code> +{" "}
            <code className="font-mono text-[11.5px]">drive.file</code> scopes
            to your existing Google connection. Per-file access only.
          </div>
        </div>
        <Button type="button" variant="default" size="sm">
          <ShieldCheckIcon className="size-3.5" />
          Re-authorize Google
        </Button>
      </div>

      <div className="mb-3.5 text-xs text-[var(--muted)]">
        {totalAccounts} accounts across {INTEGRATIONS_PROVIDERS.length}{" "}
        providers
      </div>

      {INTEGRATIONS_PROVIDERS.map((p) => (
        <IntegrationCard
          key={p.id}
          provider={p}
          accounts={accounts[p.id] ?? []}
          onRemoveAccount={(accId) => removeAccount(p.id, accId)}
          onAddAccount={() => addAccount(p.id)}
        />
      ))}
    </div>
  );
}

// ── Notifications panel ───────────────────────────────────────────────────────

type ChannelKey = "push" | "slack" | "email" | "desktop";
type MatrixKey = "push" | "slack" | "email" | "desktop" | "sound";
type MatrixRow = Record<MatrixKey, boolean>;

const NOTIFICATION_CHANNELS: {
  id: ChannelKey;
  name: string;
  desc: string;
  icon: string;
}[] = [
  {
    id: "push",
    name: "PWA Web Push",
    desc: "Browser/OS notifications when Devy is installed as a PWA.",
    icon: "🔔",
  },
  {
    id: "slack",
    name: "Slack self-DM",
    desc: "Sends a DM to yourself. Threads keep history.",
    icon: "slack",
  },
  {
    id: "email",
    name: "Email digest",
    desc: "Daily summary at 8:00. Requires SMTP or BYO Resend key.",
    icon: "✉",
  },
  {
    id: "desktop",
    name: "Desktop banner",
    desc: "Native macOS/Windows notification while Devy is open.",
    icon: "🖥",
  },
];

const INITIAL_MATRIX: Record<string, MatrixRow> = {
  "PR review": {
    push: true,
    slack: true,
    email: false,
    desktop: true,
    sound: false,
  },
  "@mention": {
    push: true,
    slack: true,
    email: false,
    desktop: true,
    sound: true,
  },
  "CI failure": {
    push: true,
    slack: false,
    email: true,
    desktop: true,
    sound: true,
  },
  "Meeting in 10m": {
    push: true,
    slack: false,
    email: false,
    desktop: true,
    sound: true,
  },
  "Ticket comment": {
    push: false,
    slack: true,
    email: false,
    desktop: false,
    sound: false,
  },
  "Slack broadcast": {
    push: false,
    slack: false,
    email: false,
    desktop: false,
    sound: false,
  },
};

function NotificationMatrix({
  matrix,
  onToggle,
}: {
  matrix: Record<string, MatrixRow>;
  onToggle: (kind: string, ch: MatrixKey) => void;
}) {
  const cols: MatrixKey[] = ["push", "slack", "email", "desktop", "sound"];
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--hairline-soft)]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-[var(--surface-soft)]">
            <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
              Event kind
            </th>
            {["Push", "Slack", "Email", "Desktop", "Sound"].map((c) => (
              <th
                key={c}
                className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(matrix).map(([k, v]) => (
            <tr key={k} className="border-t border-[var(--hairline-soft)]">
              <td className="px-3.5 py-2.5 font-medium">{k}</td>
              {cols.map((ch) => (
                <td key={ch} className="px-3.5 py-2 text-center">
                  <button
                    type="button"
                    aria-label={`Toggle ${ch} for ${k}`}
                    aria-pressed={v[ch]}
                    onClick={() => onToggle(k, ch)}
                    className={`size-[22px] rounded-[5px] text-xs transition-colors ${v[ch] ? "border border-[var(--primary)] bg-[var(--primary)] text-white" : "border border-[var(--hairline)] bg-[var(--canvas)] text-transparent"}`}
                  >
                    {v[ch] ? "✓" : ""}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// TimeField ───────────────────────────────────────────────────────────────────

function TimeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border px-2.5 py-1.5 font-mono text-xs outline-none ${disabled ? "border-[var(--hairline-soft)] bg-[var(--surface-strong)] text-[var(--muted-soft)]" : "border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink)]"}`}
    />
  );
}

// QuietHoursCard ──────────────────────────────────────────────────────────────

type QhMode = "uniform" | "weekday-weekend" | "per-day";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const BYPASS_PRESETS = [
  "@mentions",
  "CI red on prod",
  "On-call pages",
  "Slack DMs from manager",
  "PRs marked Urgent",
  "Calendar starts in <10m",
  "Linear · P0",
  "GitHub · review-requested:@me",
];

function BypassRulesEditor() {
  const [rules, setRules] = useState(["@mentions", "CI red on prod", "On-call pages"]);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  const add = (t: string) => {
    const v = t.trim();
    if (!v || rules.includes(v)) return;
    setRules((r) => [...r, v]);
  };

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--muted)]">
        Allow through
      </div>
      <p className="mb-2 text-xs leading-[1.5] text-[var(--muted)]">
        Signals matching any of these{" "}
        <b className="text-[var(--ink)]">bypass rules</b> override quiet hours
        and ring through.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {rules.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-disabled)] px-2.5 py-1 text-xs text-[var(--primary-active)]"
          >
            {t}
            <button
              type="button"
              onClick={() => setRules((r) => r.filter((x) => x !== t))}
              className="ml-0.5 opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            className="rounded-full border border-dashed border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--muted)] hover:border-[var(--primary)]"
          >
            + Add rule
          </PopoverTrigger>
          <PopoverContent className="w-[340px] p-2" align="start">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a rule, or pick one below…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  add(draft);
                  setDraft("");
                  setOpen(false);
                }
              }}
              className="mb-2 w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-sm outline-none"
            />
            <div className="mb-1 px-1 text-[9.5px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
              Common picks
            </div>
            <div className="flex max-h-[200px] flex-col gap-0.5 overflow-y-auto">
              {BYPASS_PRESETS.filter(
                (p) =>
                  !rules.includes(p) &&
                  (!draft || p.toLowerCase().includes(draft.toLowerCase())),
              ).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    add(p);
                    setDraft("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-[var(--accent)]"
                >
                  <PlusIcon className="size-3 shrink-0" />
                  {p}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function QuietHoursCard() {
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<QhMode>("weekday-weekend");
  const [uniform, setUniform] = useState({ from: "22:00", to: "08:00" });
  const [weekday, setWeekday] = useState({ from: "22:00", to: "08:00" });
  const [weekend, setWeekend] = useState({
    on: true,
    allDay: true,
    from: "00:00",
    to: "23:59",
  });
  const [perDay, setPerDay] = useState<
    Record<string, { on: boolean; from: string; to: string }>
  >({
    Mon: { on: true, from: "22:00", to: "08:00" },
    Tue: { on: true, from: "22:00", to: "08:00" },
    Wed: { on: true, from: "22:00", to: "08:00" },
    Thu: { on: true, from: "22:00", to: "08:00" },
    Fri: { on: true, from: "22:00", to: "09:00" },
    Sat: { on: true, from: "00:00", to: "23:59" },
    Sun: { on: true, from: "00:00", to: "23:59" },
  });

  const summaryFor = (d: string, i: number): string => {
    if (!enabled) return "off";
    if (mode === "uniform") return `${uniform.from}–${uniform.to}`;
    if (mode === "weekday-weekend") {
      if (i < 5) return `${weekday.from}–${weekday.to}`;
      return weekend.on ? (weekend.allDay ? "all day" : `${weekend.from}–${weekend.to}`) : "off";
    }
    const p = perDay[d];
    return p?.on ? `${p.from}–${p.to}` : "off";
  };

  const modeTabs: { id: QhMode; label: string }[] = [
    { id: "uniform", label: "Same every day" },
    { id: "weekday-weekend", label: "Weekday / weekend" },
    { id: "per-day", label: "Per day" },
  ];

  return (
    <div className="rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
      {/* master toggle */}
      <div className="mb-3.5 flex items-center gap-2.5">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Enable quiet hours"
        />
        <span className="text-sm font-medium">
          Suppress alerts during quiet hours
        </span>
        <span className="ml-auto font-mono text-[11px] text-[var(--muted)]">
          queued and delivered at end
        </span>
      </div>

      <div
        className="mb-3.5 transition-opacity"
        style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? "auto" : "none" }}
      >
        <SegmentedControl options={modeTabs} value={mode} onChange={setMode} />
      </div>

      <div
        className="transition-opacity"
        style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? "auto" : "none" }}
      >
        {/* Mode editors */}
        {mode === "uniform" && (
          <div className="mb-3.5 flex items-center gap-2.5 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5">
            <span className="text-[13px]">Every day from</span>
            <TimeField value={uniform.from} onChange={(v) => setUniform((s) => ({ ...s, from: v }))} />
            <span className="text-[13px]">to</span>
            <TimeField value={uniform.to} onChange={(v) => setUniform((s) => ({ ...s, to: v }))} />
            <span className="ml-auto font-mono text-[11px] text-[var(--muted)]">
              {uniform.from > uniform.to ? "overnight" : "same day"}
            </span>
          </div>
        )}

        {mode === "weekday-weekend" && (
          <div className="mb-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5">
              <span className="w-24 text-[13px] font-semibold text-[var(--ink)]">Mon–Fri</span>
              <span className="text-[13px]">from</span>
              <TimeField value={weekday.from} onChange={(v) => setWeekday((s) => ({ ...s, from: v }))} />
              <span className="text-[13px]">to</span>
              <TimeField value={weekday.to} onChange={(v) => setWeekday((s) => ({ ...s, to: v }))} />
            </div>
            <div className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5">
              <span className="w-24 text-[13px] font-semibold text-[var(--ink)]">Sat–Sun</span>
              <Switch
                checked={weekend.on}
                onCheckedChange={(v) => setWeekend((s) => ({ ...s, on: v }))}
                aria-label="Enable weekend quiet hours"
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={weekend.allDay}
                  onChange={(e) => setWeekend((s) => ({ ...s, allDay: e.target.checked }))}
                  className="accent-[var(--primary)]"
                />
                All day
              </label>
              {!weekend.allDay && (
                <>
                  <span className="text-[13px]">from</span>
                  <TimeField value={weekend.from} onChange={(v) => setWeekend((s) => ({ ...s, from: v }))} />
                  <span className="text-[13px]">to</span>
                  <TimeField value={weekend.to} onChange={(v) => setWeekend((s) => ({ ...s, to: v }))} />
                </>
              )}
            </div>
          </div>
        )}

        {mode === "per-day" && (
          <div className="mb-3.5 flex flex-col gap-1.5">
            {DAY_NAMES.map((d) => {
              const p = perDay[d] ?? { on: true, from: "22:00", to: "08:00" };
              return (
                <div key={d} className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-soft)] px-3 py-2">
                  <span className="w-14 text-[13px] font-semibold text-[var(--ink)]">
                    {d}
                  </span>
                  <Switch
                    checked={p.on}
                    onCheckedChange={(v) => setPerDay((s) => ({ ...s, [d]: { ...s[d]!, on: v } }))}
                    aria-label={`Enable quiet hours for ${d}`}
                  />
                  <span className={`text-[13px] ${p.on ? "text-[var(--body)]" : "text-[var(--muted-soft)]"}`}>from</span>
                  <TimeField value={p.from} disabled={!p.on} onChange={(v) => setPerDay((s) => ({ ...s, [d]: { ...s[d]!, from: v } }))} />
                  <span className={`text-[13px] ${p.on ? "text-[var(--body)]" : "text-[var(--muted-soft)]"}`}>to</span>
                  <TimeField value={p.to} disabled={!p.on} onChange={(v) => setPerDay((s) => ({ ...s, [d]: { ...s[d]!, to: v } }))} />
                  {p.on && p.from > p.to && (
                    <span className="ml-auto font-mono text-[10px] text-[var(--muted)]">overnight</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Week summary strip */}
        <div className="mb-4 grid grid-cols-7 gap-1.5">
          {DAY_NAMES.map((d, i) => {
            const summary = summaryFor(d, i);
            const off = summary === "off";
            return (
              <div
                key={d}
                className="rounded-lg py-2 text-center text-[11px] font-semibold"
                style={{
                  background: off ? "var(--surface-strong)" : "var(--ink)",
                  color: off ? "var(--muted)" : "white",
                }}
              >
                <div>{d}</div>
                <div className="mt-0.5 font-mono text-[9px] font-medium opacity-75">
                  {summary}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BypassRulesEditor />
    </div>
  );
}

export function NotificationsPanel() {
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    push: true,
    slack: true,
    email: false,
    desktop: true,
  });
  const [matrix, setMatrix] = useState(INITIAL_MATRIX);

  const toggleMatrix = (kind: string, ch: MatrixKey) =>
    setMatrix((m) => ({
      ...m,
      [kind]: { ...m[kind]!, [ch]: !m[kind]![ch] },
    }));

  return (
    <div>
      <SectionHead
        title="Notifications"
        sub="Choose channels, route per event kind, and define quiet hours."
      />

      <h3 className="mb-2.5 font-semibold text-base">Channels</h3>
      <div className="mb-7 overflow-hidden rounded-lg border border-[var(--hairline-soft)]">
        {NOTIFICATION_CHANNELS.map((c, idx, arr) => (
          <SettingsRow key={c.id} last={idx === arr.length - 1}>
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[var(--surface-strong)]">
              {c.id === "slack" ? (
                <SourceGlyph source="slack" size={20} />
              ) : (
                <span>{c.icon}</span>
              )}
            </span>
            <div>
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{c.desc}</div>
            </div>
            <Button type="button" variant="ghost" size="sm">
              Test
            </Button>
            <Switch
              checked={channels[c.id]}
              onCheckedChange={(v) =>
                setChannels((s) => ({ ...s, [c.id]: v }))
              }
              aria-label={`Toggle ${c.name}`}
            />
          </SettingsRow>
        ))}
      </div>

      <h3 className="mb-2.5 font-semibold text-base">Per-event routing</h3>
      <div className="mb-7">
        <NotificationMatrix matrix={matrix} onToggle={toggleMatrix} />
      </div>

      <h3 className="mb-2.5 font-semibold text-base">Quiet hours</h3>
      <QuietHoursCard />
    </div>
  );
}

// ── Inbox rules panel ─────────────────────────────────────────────────────────

const RULE_FIELDS = [
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

const RULE_ACTIONS = [
  { id: "snooze", label: "Snooze", params: ["1 hour", "4 hours", "1 day", "until tomorrow", "until Monday"] },
  { id: "low", label: "Mark as low-prio", params: null },
  { id: "dismiss", label: "Auto-dismiss", params: null },
  { id: "bypass", label: "Bypass quiet hours", params: null },
  { id: "weekly", label: "Add to weekly review", params: null },
  { id: "tag", label: "Add tag", params: ["follow-up", "review", "later", "incident"] },
  { id: "route", label: "Route to", params: ["push", "Slack DM", "email", "desktop"] },
] as const;

type RuleCond = { field: string; op: string; value: string };
type SavedRule = { when: string; then: string; on: boolean; hits: number };

function RuleCondChip({
  label,
  value,
  options,
  onChange,
  kind = "value",
}: {
  label?: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  kind?: "field" | "op" | "value";
}) {
  const bg =
    kind === "field"
      ? "bg-[var(--surface-strong)] text-[var(--ink)] font-semibold"
      : kind === "op"
        ? "bg-transparent text-[var(--muted)]"
        : "bg-[var(--primary-disabled)] text-[var(--primary-active)] font-mono";

  return (
    <label className="sr-only">
      {label ?? kind}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-md border-0 px-2.5 py-[5px] text-[13px] outline-none cursor-pointer ${bg}`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RuleBuilder({
  onSave,
  onCancel,
}: {
  onSave: (rule: { when: string; then: string }) => void;
  onCancel: () => void;
}) {
  const [matchAll, setMatchAll] = useState(true);
  const [conds, setConds] = useState<RuleCond[]>([
    { field: "source", op: "is", value: "github" },
  ]);
  const [action, setAction] = useState("snooze");
  const [actionParam, setActionParam] = useState("1 day");
  const [name, setName] = useState("Auto-snooze dependabot");

  const updateCond = (i: number, patch: Partial<RuleCond>) =>
    setConds((cs) =>
      cs.map((c, idx) =>
        idx === i
          ? {
              ...c,
              ...patch,
              ...(patch.field
                ? {
                    op: OPS_BY_FIELD[patch.field]?.[0] ?? c.op,
                    value: VALUES_BY_FIELD[patch.field]?.[0] ?? c.value,
                  }
                : {}),
            }
          : c,
      ),
    );

  const addCond = () =>
    setConds((cs) => [
      ...cs,
      { field: "author", op: "is", value: "dependabot" },
    ]);

  const removeCond = (i: number) =>
    setConds((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs));

  const currentAction = RULE_ACTIONS.find((a) => a.id === action);

  const handleSave = () => {
    const condStr = conds
      .map((c) => `${c.field} ${c.op} ${c.value}`)
      .join(matchAll ? " AND " : " OR ");
    onSave({ when: condStr, then: currentAction?.label ?? action });
  };

  return (
    <div className="mb-3.5 rounded-xl border-[1.5px] border-[var(--primary)] bg-[var(--canvas)] p-[18px]">
      <div className="mb-3.5 flex items-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[var(--primary-active)]">
          New rule
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-[var(--muted)]">
          preview matches <b className="text-[var(--ink)]">3 signals</b> from last 7d
        </span>
      </div>

      {/* WHEN */}
      <div className="mb-3.5 flex items-start gap-3.5">
        <span className="w-[50px] pt-2 font-mono text-[11px] font-bold text-[var(--muted)]">
          WHEN
        </span>
        <div className="flex-1">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[13px]">signal matches</span>
            <SegmentedControl
              options={[
                { id: "all" as const, label: "all" },
                { id: "any" as const, label: "any" },
              ]}
              value={matchAll ? "all" : "any"}
              onChange={(v) => setMatchAll(v === "all")}
            />
            <span className="text-[13px]">of these conditions:</span>
          </div>
          {conds.map((c, i) => (
            <div
              key={i}
              className="mb-2 flex items-center gap-1.5 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"
            >
              <RuleCondChip
                label="field"
                kind="field"
                value={c.field}
                options={[...RULE_FIELDS]}
                onChange={(v) => updateCond(i, { field: v })}
              />
              <RuleCondChip
                label="operator"
                kind="op"
                value={c.op}
                options={OPS_BY_FIELD[c.field] ?? ["is"]}
                onChange={(v) => updateCond(i, { op: v })}
              />
              <RuleCondChip
                label="value"
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
                  className="px-1 text-base text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addCond}
            className="rounded-md border border-dashed border-[var(--hairline)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--primary)]"
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
          <RuleCondChip
            label="action"
            kind="field"
            value={currentAction?.label ?? action}
            options={RULE_ACTIONS.map((a) => a.label)}
            onChange={(v) => {
              const a = RULE_ACTIONS.find((x) => x.label === v);
              if (a) {
                setAction(a.id);
                setActionParam(a.params?.[0] ?? "");
              }
            }}
          />
          {currentAction?.params && (
            <RuleCondChip
              label="parameter"
              kind="value"
              value={actionParam}
              options={[...currentAction.params]}
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
          placeholder="Rule name"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="secondary" onClick={handleSave}>
          Test on history
        </Button>
        <Button type="button" variant="default" onClick={handleSave}>
          Save rule
        </Button>
      </div>
    </div>
  );
}

const INITIAL_RULES: SavedRule[] = [
  { when: "PR author is dependabot", then: "Snooze 1 day", on: true, hits: 47 },
  { when: "Slack channel is #eng-announce", then: "Mark as low-priority", on: true, hits: 12 },
  { when: "PR has only lockfile changes", then: "Auto-dismiss", on: false, hits: 31 },
  { when: 'Mention contains "prod" or "incident"', then: "Bypass quiet hours", on: true, hits: 4 },
  { when: "Meeting has no agenda", then: "Add to weekly review", on: false, hits: 8 },
];

export function InboxRulesPanel() {
  const [rules, setRules] = useState<SavedRule[]>(INITIAL_RULES);
  const [editing, setEditing] = useState(false);

  const toggle = (i: number) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, on: !r.on } : r)));

  const handleSave = (rule: { when: string; then: string }) => {
    setRules((rs) => [...rs, { ...rule, on: true, hits: 0 }]);
    setEditing(false);
  };

  return (
    <div>
      <SectionHead
        title="Inbox rules"
        sub="Pure rule evaluator over Signals — runs after upsert, before alert dispatch."
      />
      <div className="mb-3 flex items-center">
        <span className="text-xs text-[var(--muted)]">
          {rules.filter((r) => r.on).length} of {rules.length} active ·
          evaluated in order, top-down
        </span>
        <span className="flex-1" />
        {!editing && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <PlusIcon className="size-3.5" />
            New rule
          </Button>
        )}
      </div>

      {editing && (
        <RuleBuilder onSave={handleSave} onCancel={() => setEditing(false)} />
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--hairline-soft)]">
        {rules.map((r, i) => (
          <SettingsRow key={i} last={i === rules.length - 1}>
            <span className="w-6 text-right font-mono text-[11px] font-bold text-[var(--muted)]">
              {i + 1}
            </span>
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="font-mono text-[11px] text-[var(--muted)]">WHEN</span>
              <code className="rounded bg-[var(--surface-soft)] px-2 py-[3px] font-mono text-xs">
                {r.when}
              </code>
              <span className="font-mono text-[11px] text-[var(--muted)]">THEN</span>
              <span className="font-medium">{r.then}</span>
              <span className="ml-auto pl-3 font-mono text-[10px] text-[var(--muted)]">
                {r.hits} hits / 30d
              </span>
            </div>
            <Button type="button" variant="ghost" size="sm">
              Edit
            </Button>
            <Switch
              checked={r.on}
              onCheckedChange={() => toggle(i)}
              aria-label={`Toggle rule ${i + 1}`}
            />
          </SettingsRow>
        ))}
      </div>
    </div>
  );
}

// ── AI panel ──────────────────────────────────────────────────────────────────

const AI_CATALOG = {
  anthropic: {
    name: "Anthropic",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tier: "smartest", cost: "$3 / $15 per Mtok" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5", tier: "best for hard reasoning", cost: "$15 / $75 per Mtok" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", tier: "fast & cheap", cost: "$1 / $5 per Mtok" },
    ],
  },
  openai: {
    name: "OpenAI",
    models: [
      { id: "gpt-4o", label: "GPT-4o", tier: "balanced", cost: "$2.50 / $10 per Mtok" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "fast & cheap", cost: "$0.15 / $0.60 per Mtok" },
    ],
  },
  google: {
    name: "Google",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "smartest", cost: "$1.25 / $10 per Mtok" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "fast & cheap", cost: "$0.30 / $2.50 per Mtok" },
    ],
  },
  groq: {
    name: "Groq",
    models: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B", tier: "fast inference", cost: "$0.59 / $0.79 per Mtok" },
      { id: "llama-3.1-8b", label: "Llama 3.1 8B", tier: "fastest", cost: "$0.05 / $0.08 per Mtok" },
    ],
  },
} as const;

type AiProviderId = keyof typeof AI_CATALOG;

const AI_PRIVACY_CONTROLS = [
  { id: "strip_code", name: "Strip code blocks", desc: "Removes ``` fenced blocks before sending.", defaultOn: true },
  { id: "strip_paths", name: "Strip file paths", desc: "Replaces /src/foo/bar.ts with [path].", defaultOn: true },
  { id: "strip_secrets", name: "Strip secrets", desc: "Pattern match: API keys, JWTs, env vars.", defaultOn: true },
  { id: "strip_diffs", name: "Strip PR diffs", desc: "Drops + / − lines entirely.", defaultOn: false },
  { id: "ai_disabled_personal", name: "Disable AI on personal account", desc: "No outbound LLM calls when this profile is active.", defaultOn: false },
];

export function AIPanel() {
  const [provider, setProvider] = useState<AiProviderId>("anthropic");
  const [primaryModel, setPrimaryModel] = useState("claude-sonnet-4-6");
  const [fallbackModel, setFallbackModel] = useState("claude-haiku-4-5");
  const [fallbackThreshold, setFallbackThreshold] = useState("80");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [privacy, setPrivacy] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(AI_PRIVACY_CONTROLS.map((c) => [c.id, c.defaultOn])),
  );

  const cat = AI_CATALOG[provider];
  const providers = Object.entries(AI_CATALOG) as [AiProviderId, (typeof AI_CATALOG)[AiProviderId]][];

  const primaryMeta = cat.models.find((m) => m.id === primaryModel) ?? cat.models[0]!;
  const fallbackMeta = cat.models.find((m) => m.id === fallbackModel) ?? cat.models[cat.models.length - 1]!;

  // Reset models when provider changes
  useEffect(() => {
    setPrimaryModel(cat.models[0]!.id);
    setFallbackModel(cat.models[cat.models.length - 1]!.id);
  }, [provider, cat.models]);

  const budgetCap = 25;
  const budgetSpent = 8.41;
  const budgetPct = Math.round((budgetSpent / budgetCap) * 100);

  return (
    <div>
      <SectionHead
        title="AI provider"
        sub="Bring your own key. Devy never stores prompts; spend tracked locally in your Supabase."
      />

      <h3 className="mb-2.5 font-semibold text-base">Provider</h3>
      <div className="mb-6 grid grid-cols-4 gap-2.5">
        {providers.map(([id, p]) => (
          <button
            key={id}
            type="button"
            onClick={() => setProvider(id)}
            className={`rounded-xl p-4 text-left transition-colors ${
              provider === id
                ? "border-[1.5px] border-[var(--primary)] bg-[var(--primary-disabled)]"
                : "border border-[var(--hairline)] bg-[var(--canvas)] hover:border-[var(--border)]"
            }`}
          >
            <div className="mb-1 text-sm font-semibold">{p.name}</div>
            <div className="font-mono text-[10px] text-[var(--muted)]">
              {p.models.length} models
            </div>
          </button>
        ))}
      </div>

      <h3 className="mb-2.5 font-semibold text-base">Models</h3>
      <div className="mb-6 rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
              Primary model
            </span>
            <select
              value={primaryModel}
              onChange={(e) => setPrimaryModel(e.target.value)}
              className="h-8 cursor-pointer rounded-md border border-[var(--input)] bg-[var(--background)] px-3 font-mono text-[13px] outline-none"
            >
              {cat.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.tier}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-[var(--muted)]">
              Used for daily briefing, smart routing, and inbox triage.{" "}
              <span className="font-mono">{primaryMeta.cost}</span>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
              Fallback model
            </span>
            <select
              value={fallbackModel}
              onChange={(e) => setFallbackModel(e.target.value)}
              className="h-8 cursor-pointer rounded-md border border-[var(--input)] bg-[var(--background)] px-3 font-mono text-[13px] outline-none"
            >
              {cat.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.tier}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-[var(--muted)]">
              Used after the budget threshold below.{" "}
              <span className="font-mono">{fallbackMeta.cost}</span>
            </span>
          </label>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
          API key
        </div>
        <div className="mb-1.5 flex gap-2.5">
          <input
            type={apiKeyVisible ? "text" : "password"}
            defaultValue="sk-ant-api03-••••••••••••••••••"
            className="h-8 flex-1 rounded-md border border-[var(--input)] bg-[var(--surface-soft)] px-3 font-mono text-[13px] outline-none"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setApiKeyVisible((v) => !v)}
          >
            {apiKeyVisible ? "Hide" : "Show"}
          </Button>
          <Button type="button" variant="secondary" size="sm">
            Validate
          </Button>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--good)]">
          <span className="size-[7px] rounded-full bg-[var(--good)]" />
          Last validated 4m ago
        </div>
      </div>

      <h3 className="mb-2.5 font-semibold text-base">Monthly budget</h3>
      <div className="mb-6 rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
        <div className="mb-2.5 flex items-baseline">
          <span className="text-[32px] font-bold tracking-[-1px]">
            ${budgetSpent.toFixed(2)}
          </span>
          <span className="ml-1.5 text-[var(--muted)]">of ${budgetCap}.00 cap</span>
          <span className="ml-auto font-mono text-[11px] text-[var(--muted)]">
            {budgetPct}% used · resets May 31
          </span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]">
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-all"
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <div className="mb-4 flex gap-3 text-xs text-[var(--muted)]">
          <span>
            ↓{" "}
            <b className="text-[var(--ink)]">Fallback at {fallbackThreshold}%</b>{" "}
            → <span className="font-mono">{fallbackMeta.label}</span>
          </span>
          <span>
            ·{" "}
            <b className="text-[var(--ink)]">Hard stop at 100%</b> (${budgetCap})
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-[var(--hairline-soft)] pt-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
              Monthly cap
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--muted-foreground)]">
                $
              </span>
              <input
                type="number"
                defaultValue={budgetCap}
                min={1}
                step={1}
                className="h-8 w-full rounded-md border border-[var(--input)] bg-[var(--background)] pl-6 pr-3 font-mono text-[13px] outline-none"
              />
            </div>
            <span className="text-[11px] text-[var(--muted)]">
              Hard stop when reached. Resets on the 1st of each month.
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
              Fallback threshold
            </span>
            <select
              value={fallbackThreshold}
              onChange={(e) => setFallbackThreshold(e.target.value)}
              className="h-8 cursor-pointer rounded-md border border-[var(--input)] bg-[var(--background)] px-3 font-mono text-[13px] outline-none"
              aria-label="Fallback threshold"
            >
              <option value="50">50% — switch early</option>
              <option value="70">70%</option>
              <option value="80">80% — recommended</option>
              <option value="90">90%</option>
              <option value="off">Never (always primary)</option>
            </select>
            <span className="text-[11px] text-[var(--muted)]">
              Switches{" "}
              <span className="font-mono">{primaryMeta.label}</span> →{" "}
              <span className="font-mono">{fallbackMeta.label}</span> at this
              percentage.
            </span>
          </label>
        </div>
      </div>

      <h3 className="mb-2.5 font-semibold text-base">Privacy</h3>
      <div className="overflow-hidden rounded-lg border border-[var(--hairline-soft)]">
        {AI_PRIVACY_CONTROLS.map((c, i, arr) => (
          <SettingsRow key={c.id} last={i === arr.length - 1}>
            <span className="w-5" />
            <div>
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{c.desc}</div>
            </div>
            <span />
            <Switch
              checked={privacy[c.id] ?? false}
              onCheckedChange={(v) =>
                setPrivacy((s) => ({ ...s, [c.id]: v }))
              }
              aria-label={c.name}
            />
          </SettingsRow>
        ))}
      </div>
    </div>
  );
}

// ── Theme panel ───────────────────────────────────────────────────────────────

type ThemeSaveResult =
  | { ok: true; theme: ThemeView }
  | { ok: false; error: string };

export function ThemePanel() {
  const [view, setView] = useState<ThemeView>(DEFAULT_THEME);

  useEffect(() => {
    let cancelled = false;
    (apiFetch("/api/theme") as Promise<ThemeView>)
      .then((t) => { if (!cancelled) setView(t); })
      .catch(() => {});
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ThemeView>).detail;
      if (detail) setView(detail);
    };
    window.addEventListener(THEME_UPDATED_EVENT, onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(THEME_UPDATED_EVENT, onUpdate);
    };
  }, []);

  const save = async (patch: Partial<ThemeView>) => {
    const next = { ...view, ...patch };
    setView(next);
    window.dispatchEvent(new CustomEvent(THEME_UPDATED_EVENT, { detail: next }));
    try {
      const out = (await apiFetch("/api/theme", {
        method: "PUT",
        body: patch,
      })) as ThemeSaveResult;
      if (out.ok) {
        setView(out.theme);
        window.dispatchEvent(new CustomEvent(THEME_UPDATED_EVENT, { detail: out.theme }));
      }
    } catch {
      setView(view);
      window.dispatchEvent(new CustomEvent(THEME_UPDATED_EVENT, { detail: view }));
    }
  };

  const themeOptions: { id: Theme; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ];

  const densityOptions: { id: Density; label: string }[] = [
    { id: "comfortable", label: "Comfortable" },
    { id: "compact", label: "Compact" },
  ];

  return (
    <div>
      <SectionHead
        title="Theme"
        sub="Controls the color scheme and information density of the app."
      />

      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
            Color scheme
          </div>
          <SegmentedControl
            options={themeOptions}
            value={view.theme}
            onChange={(v) => save({ theme: v })}
          />
        </div>

        <div className="rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
            Density
          </div>
          <SegmentedControl
            options={densityOptions}
            value={view.density}
            onChange={(v) => save({ density: v })}
          />
          <p className="mt-2 text-xs text-[var(--muted)]">
            Compact reduces row heights and padding across the whole app.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Week start panel ──────────────────────────────────────────────────────────

export function WeekStartPanel() {
  const { weekStart, setWeekStart } = useWeekStart();
  const options = WEEK_STARTS.map((id) => ({
    id,
    label: id === "sun" ? "Sunday" : id === "mon" ? "Monday" : "Saturday",
  }));

  return (
    <div>
      <SectionHead
        title="Week start"
        sub="Affects the week view on the Calendar page and weekly stats."
      />
      <div className="rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
          Week starts on
        </div>
        <SegmentedControl options={options} value={weekStart} onChange={setWeekStart} />
      </div>
    </div>
  );
}

// ── Data & privacy panel ──────────────────────────────────────────────────────

export function DataPrivacyPanel() {
  const [retention, setRetention] = useState(90);
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [purgeOpen, setPurgeOpen] = useState(false);

  return (
    <div>
      <SectionHead
        title="Data & privacy"
        sub="Export or delete the data your Devy instance has collected. All data lives in your own Supabase."
      />

      <div className="space-y-4">
        {/* Export */}
        <section>
          <h3 className="mb-2.5 font-semibold text-base">Export</h3>
          <div className="flex items-center gap-2.5 rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
            <Button type="button" variant="secondary" size="sm">
              Export my data (JSON)
            </Button>
            <span className="flex-1" />
            <span className="font-mono text-[11px] text-[var(--muted)]">
              1,847 signals · 12 rollups · includes preferences
            </span>
          </div>
        </section>

        {/* Retention */}
        <section>
          <h3 className="mb-2.5 font-semibold text-base">Retention</h3>
          <div className="rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[var(--muted)]">
                Signal retention (days)
              </span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={retention}
                  min={7}
                  max={3650}
                  onChange={(e) => setRetention(Number(e.target.value))}
                  className="h-8 w-28 rounded-md border border-[var(--input)] bg-[var(--background)] px-3 font-mono text-[13px] outline-none"
                />
                <span className="text-xs text-[var(--muted)]">
                  Signals older than {retention} days are purged nightly.
                </span>
              </div>
            </label>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h3 className="mb-2.5 font-semibold text-base text-[var(--danger)]">
            Danger zone
          </h3>
          <div className="rounded-lg border border-[var(--danger-soft)] bg-[var(--canvas)] p-[18px]">
            {purgeOpen ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--muted)]">
                  Type <b className="text-[var(--ink)]">DELETE</b> to confirm
                  purging all signals and rollups.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={purgeConfirm}
                    onChange={(e) => setPurgeConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="w-40 font-mono"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="border-[var(--danger)] text-[var(--danger)]"
                    disabled={purgeConfirm !== "DELETE"}
                    onClick={() => {
                      setPurgeOpen(false);
                      setPurgeConfirm("");
                    }}
                  >
                    Confirm purge
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPurgeOpen(false);
                      setPurgeConfirm("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="border-[var(--danger)] text-[var(--danger)]"
                onClick={() => setPurgeOpen(true)}
              >
                Purge all signals
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Career panel ──────────────────────────────────────────────────────────────

export function CareerSheetsPanel() {
  const [authorized, setAuthorized] = useState(false);

  return (
    <div>
      <SectionHead
        title="Career"
        sub="Connect Google Sheets to sync your career data. Devy only accesses sheets it creates — per-file scope only."
      />

      <div className="rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]">
        {authorized ? (
          <div className="flex items-center gap-3">
            <div className="inline-flex size-9 items-center justify-center rounded-lg bg-[var(--good-soft)]">
              <CheckIcon className="size-5 text-[var(--good)]" />
            </div>
            <div>
              <div className="text-sm font-semibold">Google Sheets connected</div>
              <div className="text-xs text-[var(--muted)]">
                Devy can read and write sheets it created. Sync runs nightly.
              </div>
            </div>
            <span className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAuthorized(false)}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3.5">
            <div className="inline-flex size-9 items-center justify-center rounded-lg bg-[var(--warn-soft)]">
              <span className="inline-flex size-[22px] items-center justify-center rounded font-bold text-sm text-white" style={{ background: "#0F9D58" }}>
                S
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Google Sheets</span>
                <span className="rounded-full bg-[var(--warn-soft)] px-[7px] py-[1px] text-[10px] font-bold uppercase tracking-[0.4px] text-[var(--warn)]">
                  Not connected
                </span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">
                Adds{" "}
                <code className="font-mono text-[11.5px]">spreadsheets</code> +{" "}
                <code className="font-mono text-[11.5px]">drive.file</code> scopes
                to your Google connection.
              </div>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setAuthorized(true)}
            >
              <ShieldCheckIcon className="size-3.5" />
              Authorize Google Sheets
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SettingsPage ──────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  return (
    <div className="flex h-full overflow-hidden">
      {/* Aside nav */}
      <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-[var(--hairline-soft)] bg-[var(--surface-soft)] px-3.5 py-6">
        <div className="mb-3.5 px-2 font-semibold text-xl tracking-[-0.2px]">
          Settings
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Settings navigation">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              aria-current={activeTab === t.id ? "page" : undefined}
              className={`rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                activeTab === t.id
                  ? "bg-[var(--surface-strong)] font-semibold text-[var(--ink)]"
                  : "font-medium text-[var(--body)] hover:bg-[var(--surface-strong)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-10 pb-16 pt-8">
        {activeTab === "profile" && <ProfilePanel />}
        {activeTab === "integrations" && <IntegrationsPanel />}
        {activeTab === "notifications" && <NotificationsPanel />}
        {activeTab === "inbox-rules" && <InboxRulesPanel />}
        {activeTab === "ai" && <AIPanel />}
        {activeTab === "selfhost" && <SelfHostPanel />}
        {activeTab === "theme" && <ThemePanel />}
        {activeTab === "week-start" && <WeekStartPanel />}
        {activeTab === "data-privacy" && <DataPrivacyPanel />}
        {activeTab === "career" && <CareerSheetsPanel />}
      </main>
    </div>
  );
}
