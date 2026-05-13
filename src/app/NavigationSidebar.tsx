// Pure presentational sidebar for the Devy app shell. All data comes in as
// props — no fetches, no router lookups inside. The parent (AppShell) wires
// hooks and route navigation; this module just renders.
//
// Wholesale port from docs/design/devy-ui/shell.jsx (Redesign v4 / Slice 1).

import {
  ChevronDown,
  ChevronRight,
  Kanban,
  Plus,
  Settings as SettingsIcon,
  Target,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { FocusActiveBlock } from "#/features/focus/components/FocusActiveBlock";
import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";
import {
  SourceGlyph,
  type SourceKind,
} from "#/features/signals/components/SourceGlyph";
import { cn } from "#/lib/cn";

export const OPEN_CMDK_EVENT = "devy:open-cmdk";

export type NavPage = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export type NavSource = {
  id: string;
  label: string;
  kind: SourceKind;
  count: number;
  status: ProviderAccountStatus;
};

export type FocusState =
  | { active: false }
  | { active: true; remainingSeconds: number; totalSeconds: number };

export type NavProfile = {
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type NavProject = {
  id: string;
  name: string;
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
  projects: NavProject[];
  projectsOpen: boolean;
  onToggleProjects: () => void;
  onNavigateToProject: (id: string) => void;
  onNewProject: () => void;
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
  projects,
  projectsOpen,
  onToggleProjects,
  onNavigateToProject,
  onNewProject,
}: NavigationSidebarProps) {
  return (
    <aside
      aria-label="Primary"
      className="flex w-60 shrink-0 flex-col gap-3.5 border-r border-border bg-[var(--surface-soft)] px-2.5 py-3 text-sidebar-foreground"
    >
      <BrandWordmark />

      <button
        type="button"
        onClick={onOpenCmdk}
        aria-label="Search anything"
        className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-muted-foreground text-[12.5px] hover:bg-accent"
      >
        <span className="flex-1 truncate">Search anything…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <nav aria-label="Workspace">
        <ul className="flex flex-col gap-px">
          {pages.map((p) => {
            const isInbox = p.to === "/inbox";
            const active = page === p.to || page.startsWith(`${p.to}/`);
            const badge = isInbox ? inboxBadge : 0;
            const badgeId = isInbox ? "inbox-badge" : undefined;
            const items = [
              <li key={p.to}>
                <NavRowButton
                  icon={p.icon}
                  label={p.label}
                  active={active}
                  onClick={() => onPage(p.to)}
                  badge={badge > 0 ? badge : undefined}
                  badgeTestId={badgeId}
                />
              </li>,
            ];
            // Projects nav sits between Inbox and Career per the mockup.
            if (isInbox) {
              items.push(
                <li key="__projects" className="list-none">
                  <ProjectsNav
                    page={page}
                    projects={projects}
                    projectsOpen={projectsOpen}
                    onToggleProjects={onToggleProjects}
                    onNavigateToProject={onNavigateToProject}
                    onNewProject={onNewProject}
                  />
                </li>,
              );
            }
            return items;
          })}
        </ul>
      </nav>

      <SourcesRail sources={sources} />

      <div className="mt-auto flex flex-col gap-1.5">
        <FocusSlot focus={focus} onStartFocus={onStartFocus} />
        <AccountRow profile={profile} onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

function NavRowButton({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  badgeTestId,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  badgeTestId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        active
          ? "bg-secondary font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:bg-accent",
      )}
    >
      <Icon className="h-[15px] w-[15px] shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 ? (
        <span
          data-testid={badgeTestId}
          className={cn(
            "inline-flex min-w-[18px] justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px]",
            active
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ProjectsNav({
  page,
  projects,
  projectsOpen,
  onToggleProjects,
  onNavigateToProject,
  onNewProject,
}: {
  page: string;
  projects: NavProject[];
  projectsOpen: boolean;
  onToggleProjects: () => void;
  onNavigateToProject: (id: string) => void;
  onNewProject: () => void;
}) {
  const active = page === "/projects" || page.startsWith("/projects/");
  return (
    <nav aria-label="Projects">
      <button
        type="button"
        onClick={onToggleProjects}
        aria-expanded={projectsOpen}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
          active
            ? "bg-secondary font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:bg-accent",
        )}
      >
        <Kanban className="h-[15px] w-[15px] shrink-0" />
        <span className="flex-1 text-left">Projects</span>
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-150",
            projectsOpen && "rotate-90",
          )}
        />
      </button>

      {projectsOpen && (
        <ul className="mt-0.5 max-h-[220px] space-y-px overflow-y-auto pl-[22px]">
          {projects.map((p) => {
            const projActive =
              page === `/projects/${p.id}` ||
              page.startsWith(`/projects/${p.id}/`);
            return (
              <li key={p.id}>
                <Button
                  type="button"
                  variant={projActive ? "secondary" : "ghost"}
                  onClick={() => onNavigateToProject(p.id)}
                  aria-current={projActive ? "page" : undefined}
                  className="h-7 w-full justify-start gap-2 px-2 font-normal text-[12.5px] text-muted-foreground"
                >
                  <span className="flex-1 truncate text-left">{p.name}</span>
                </Button>
              </li>
            );
          })}
          <li>
            <Button
              type="button"
              variant="ghost"
              onClick={onNewProject}
              className="h-7 w-full justify-start gap-1.5 px-2 font-normal text-[12px] text-muted-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New project</span>
            </Button>
          </li>
        </ul>
      )}
    </nav>
  );
}

// Collapsible sources rail per the mockup: header row summarises connection
// state with a single dot + count; expanding reveals each provider's row.
function SourcesRail({ sources }: { sources: NavSource[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  const bad = sources.filter((s) => s.status === "auth_failed").length;
  const warn = sources.filter(
    (s) => s.status === "stale" || s.status === "rate_limited",
  ).length;
  const good = sources.filter((s) => s.status === "ok").length;
  const summary: ProviderAccountStatus =
    bad > 0 ? "auth_failed" : warn > 0 ? "stale" : good > 0 ? "ok" : "neutral";
  const summaryLabel =
    bad > 0
      ? `${bad} down`
      : warn > 0
        ? `${warn} warn`
        : `${sources.length} connected`;
  const Chev = open ? ChevronDown : ChevronRight;
  return (
    <nav aria-label="Sources">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-1.5 py-1"
      >
        <span className="flex-1 text-left font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.4px]">
          Sources
        </span>
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dotClass(summary))}
          aria-hidden="true"
        />
        <span className="font-mono text-[10px] text-muted-foreground">
          {summaryLabel}
        </span>
        <Chev className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <ul className="mt-1 space-y-px">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-[5px] text-[12.5px] text-foreground"
              title={`${s.label}: ${statusLabel(s.status)}`}
            >
              <SourceGlyph source={s.kind} size={16} />
              <span className="flex-1 truncate font-medium">{s.label}</span>
              {s.count > 0 ? (
                <span className="font-medium text-[11px] text-muted-foreground">
                  {s.count}
                </span>
              ) : null}
              <output
                aria-label={`${s.label} status: ${statusLabel(s.status)}`}
                data-source={s.id}
                data-status={s.status}
                className={cn("h-2 w-2 rounded-full", dotClass(s.status))}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}

function BrandWordmark() {
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1">
      <img
        src="/brand/devy-logo.png"
        alt=""
        aria-hidden="true"
        className="block h-[26px] w-[26px]"
      />
      <span className="font-semibold text-[15px] text-foreground tracking-tight">
        Devy
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
  if (focus.active) {
    return (
      <FocusActiveBlock
        remainingSeconds={focus.remainingSeconds}
        totalSeconds={focus.totalSeconds}
      />
    );
  }
  return (
    <div data-focus-active="false">
      <Button
        type="button"
        variant="default"
        onClick={onStartFocus}
        aria-label="Start focus session"
        className="w-full gap-2"
      >
        <Target className="h-4 w-4" />
        Start focus session
      </Button>
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
  const emailLocal = profile.email?.split("@")[0] ?? null;
  const name = profile.displayName?.trim() || emailLocal?.trim() || "Account";
  const initials = (name.match(/\b\w/g) ?? [name[0] ?? "A"])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <button
      type="button"
      onClick={onOpenSettings}
      aria-label="Settings"
      className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent"
    >
      <Avatar className="h-[26px] w-[26px] border border-border">
        {profile.avatarUrl ? (
          <AvatarImage src={profile.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback className="bg-secondary text-[11px] font-semibold text-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-[12.5px] text-foreground">
          {name}
        </div>
        {profile.email ? (
          <div className="truncate text-[11px] text-muted-foreground">
            {profile.email}
          </div>
        ) : null}
      </div>
      <SettingsIcon className="h-[13px] w-[13px] shrink-0 text-muted-foreground" />
    </button>
  );
}

function statusLabel(status: ProviderAccountStatus): string {
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

function dotClass(status: ProviderAccountStatus): string {
  switch (status) {
    case "ok":
      return "bg-[var(--good)]";
    case "stale":
    case "rate_limited":
      return "bg-[var(--warn)]";
    case "auth_failed":
      return "bg-[var(--danger)]";
    default:
      return "bg-muted-foreground/30";
  }
}
