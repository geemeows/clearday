// Pure presentational sidebar for the Devy app shell. All data comes in as
// props — no fetches, no router lookups inside. The parent (AppShell) wires
// hooks and route navigation; this module just renders.

import { Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { FocusButton } from "#/components/FocusButton";
import { SourceGlyph, type SourceKind } from "#/components/SourceGlyph";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/cn";
import type { SourceStatus } from "#/lib/source-status";

export const OPEN_CMDK_EVENT = "devy:open-cmdk";

export type NavPage = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type NavSource = {
  id: string;
  label: string;
  kind: SourceKind;
  count: number;
  status: SourceStatus;
};

export type FocusState =
  | { active: false }
  | { active: true; remainingSeconds: number };

export type NavProfile = {
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type NavigationSidebarProps = {
  pages: NavPage[];
  page: string;
  onPage: (to: string) => void;
  inboxBadge: number;
  sources: NavSource[];
  focus: FocusState;
  onStartFocus: () => void;
  onOpenSettings: () => void;
  onOpenCmdk: () => void;
  profile: NavProfile;
};

export function NavigationSidebar({
  pages,
  page,
  onPage,
  inboxBadge,
  sources,
  focus,
  onStartFocus,
  onOpenSettings,
  onOpenCmdk,
  profile,
}: NavigationSidebarProps) {
  return (
    <aside
      aria-label="Primary"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground"
    >
      <BrandWordmark />

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onOpenCmdk}
          aria-label="Search anything"
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-muted-foreground text-sm hover:bg-accent"
        >
          <span className="flex-1 truncate">Search anything…</span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav aria-label="Workspace" className="px-2">
        <SectionTitle>Workspace</SectionTitle>
        <ul className="mt-1 space-y-0.5">
          {pages.map((p) => {
            const active = page === p.to || page.startsWith(`${p.to}/`);
            const showBadge = p.to === "/inbox" && inboxBadge > 0;
            return (
              <li key={p.to}>
                <Button
                  type="button"
                  variant={active ? "secondary" : "ghost"}
                  onClick={() => onPage(p.to)}
                  aria-current={active ? "page" : undefined}
                  className="h-9 w-full justify-start gap-2 px-2 font-normal"
                >
                  <p.icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{p.label}</span>
                  {showBadge ? (
                    <span
                      data-testid="inbox-badge"
                      className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground"
                    >
                      {inboxBadge}
                    </span>
                  ) : null}
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Sources" className="mt-6 px-2">
        <SectionTitle>Sources</SectionTitle>
        <ul className="mt-1 space-y-0.5">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground"
              title={`${s.label}: ${statusLabel(s.status)}`}
            >
              <SourceGlyph source={s.kind} size={20} />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {s.count}
              </span>
              <output
                aria-label={`${s.label} status: ${statusLabel(s.status)}`}
                data-source={s.id}
                data-status={s.status}
                className={cn("h-2 w-2 rounded-full", dotClass(s.status))}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-2 px-3 pb-3">
        <FocusSlot focus={focus} onStartFocus={onStartFocus} />
        <AccountRow profile={profile} onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

function BrandWordmark() {
  return (
    <div className="flex items-center gap-2 px-4 py-5">
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground text-xs"
      >
        D
      </span>
      <span className="font-semibold text-sm tracking-tight">Devy</span>
      <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        Self-hosted
      </span>
    </div>
  );
}

function FocusSlot({
  focus,
  onStartFocus,
}: {
  focus: FocusState;
  onStartFocus: () => void;
}) {
  // onStartFocus exists for the dedicated focus-session slice (#39) which
  // replaces the inline FocusButton with a Dialog-driven flow. Reference
  // it here so the prop API is stable.
  void onStartFocus;
  if (focus.active) {
    const total = focus.remainingSeconds;
    const mm = Math.max(0, Math.floor(total / 60));
    const ss = Math.max(0, total % 60);
    return (
      <output
        aria-label="Focus session active"
        data-focus-active="true"
        className="block rounded-md bg-foreground p-3 text-background"
      >
        <div className="font-mono font-semibold text-lg tabular-nums">
          {pad(mm)}:{pad(ss)}
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-background/20">
          <div
            className="h-full bg-primary"
            style={{ width: `${barFill(total)}%` }}
          />
        </div>
        <div className="mt-2 text-[11px] text-background/70">
          Slack DND on · Calendar busy
        </div>
      </output>
    );
  }
  return (
    <div data-focus-active="false">
      <FocusButton />
    </div>
  );
}

function AccountRow({
  profile,
  onOpenSettings,
}: {
  profile: NavProfile;
  onOpenSettings: () => void;
}) {
  const name = profile.displayName?.trim() || "Account";
  const initials = name.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
      <Avatar className="h-8 w-8">
        {profile.avatarUrl ? (
          <AvatarImage src={profile.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{name}</div>
        {profile.email ? (
          <div className="truncate text-[11px] text-muted-foreground">
            {profile.email}
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onOpenSettings}
        aria-label="Settings"
      >
        <SettingsIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}

function statusLabel(status: SourceStatus): string {
  switch (status) {
    case "ok":
      return "connected";
    case "stale":
      return "no recent activity";
    case "rate_limited":
      return "rate-limited";
    case "auth_failed":
      return "authorization failed";
    default:
      return "not connected";
  }
}

function dotClass(status: SourceStatus): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500";
    case "stale":
    case "rate_limited":
      return "bg-amber-500";
    case "auth_failed":
      return "bg-red-500";
    default:
      return "bg-zinc-300";
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function barFill(remainingSeconds: number): number {
  // Stub fill — real countdown wiring lands in the Focus session slice (#39).
  if (remainingSeconds <= 0) return 100;
  return 50;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-2 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
      {children}
    </div>
  );
}
