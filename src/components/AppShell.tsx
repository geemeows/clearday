import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Calendar,
  CheckSquare,
  Github,
  Inbox,
  Layers,
  Slack,
  Sun,
  Trello,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CommandPalette } from "#/components/CommandPalette";
import { FocusButton } from "#/components/FocusButton";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import { PROFILE_UPDATED_EVENT, type ProfileView } from "#/lib/profile-api";
import {
  type ApiSourceStatus,
  deriveSourceStatus,
  type SourceStatus,
} from "#/lib/source-status";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const WORKSPACE: NavItem[] = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/calendar", label: "Calendar", icon: Calendar },
];

type Source = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const SOURCES: Source[] = [
  { id: "github", label: "GitHub", icon: Github },
  { id: "linear", label: "Linear", icon: Layers },
  { id: "jira", label: "Jira", icon: Trello },
  { id: "slack", label: "Slack", icon: Slack },
  { id: "google-calendar", label: "Google Calendar", icon: Calendar },
];

// Maps the AppShell's Source ids onto the backend provider keys returned by
// /api/sources.
const SOURCE_PROVIDER: Record<string, string> = {
  github: "github",
  slack: "slack",
  "google-calendar": "google",
  linear: "linear",
  jira: "jira",
};

type ApiSource = {
  provider: string;
  status: ApiSourceStatus;
  last_polled_at?: string | null;
};

type SourceMeta = {
  status: SourceStatus;
  lastPolledAt: string | null;
};

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const sourceMeta = useSourceStatuses();

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <aside
        aria-label="Primary"
        className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white"
      >
        <div className="flex items-center gap-2 px-4 py-5 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground text-xs"
          >
            D
          </span>
          Devy
        </div>

        <nav aria-label="Workspace" className="px-2">
          <SectionTitle>Workspace</SectionTitle>
          <ul className="mt-1 space-y-0.5">
            {WORKSPACE.map((item) => {
              const active = path === item.to || path.startsWith(`${item.to}/`);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1.5 text-sm",
                      active
                        ? "bg-zinc-100 font-medium text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <nav aria-label="Sources" className="mt-6 px-2">
          <SectionTitle>Sources</SectionTitle>
          <ul className="mt-1 space-y-0.5">
            {SOURCES.map((s) => {
              const meta = sourceMeta[s.id] ?? {
                status: "neutral" as SourceStatus,
                lastPolledAt: null,
              };
              const tooltip = sourceTooltip(s.label, meta);
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-600"
                  title={tooltip}
                >
                  <s.icon className="h-4 w-4" />
                  <span className="flex-1">{s.label}</span>
                  <output
                    aria-label={`${s.label} status: ${statusLabel(meta.status)}`}
                    data-source={s.id}
                    data-status={meta.status}
                    data-last-polled-at={meta.lastPolledAt ?? ""}
                    className={cn(
                      "h-2 w-2 rounded-full",
                      dotClass(meta.status),
                    )}
                  />
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto px-2 pb-3">
          <Link
            to="/settings"
            className={cn(
              "block rounded px-2 py-1.5 text-sm",
              path.startsWith("/settings")
                ? "bg-zinc-100 font-medium"
                : "text-zinc-600 hover:bg-zinc-100",
            )}
          >
            Settings
          </Link>
        </div>
      </aside>

      <main className="flex-1">
        <header className="flex items-center justify-end gap-3 border-b border-zinc-200 bg-white px-6 py-3">
          <FocusButton />
          <UserMenu />
        </header>
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}

export function UserMenu({
  loader,
}: {
  loader?: () => Promise<ProfileView>;
} = {}) {
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load =
      loader ?? (() => apiFetch("/api/profile") as Promise<ProfileView>);
    const refresh = () =>
      load()
        .then((p) => {
          if (!cancelled) setProfile(p);
        })
        .catch(() => {
          // Leave profile null; menu shows the generic fallback.
        });
    refresh();
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ProfileView>).detail;
      if (detail) setProfile(detail);
      else refresh();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_UPDATED_EVENT, onUpdate);
    };
  }, [loader]);

  const display = profile?.display_name?.trim() || "Account";
  return (
    <output
      aria-label="User menu"
      data-display-name={profile?.display_name ?? ""}
      className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
    >
      {display}
    </output>
  );
}

function useSourceStatuses(): Record<string, SourceMeta> {
  const [meta, setMeta] = useState<Record<string, SourceMeta>>({});
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/sources")
      .then((body) => {
        if (cancelled) return;
        const sources = (body as { sources: ApiSource[] }).sources;
        const now = Date.now();
        const next: Record<string, SourceMeta> = {};
        for (const id of Object.keys(SOURCE_PROVIDER)) {
          const match = sources.find((s) => s.provider === SOURCE_PROVIDER[id]);
          const lastPolledAt = match?.last_polled_at ?? null;
          next[id] = {
            status: deriveSourceStatus({
              providerId: id,
              apiStatus: match?.status,
              lastPolledAt,
              now,
            }),
            lastPolledAt,
          };
        }
        setMeta(next);
      })
      .catch(() => {
        // Leave dots neutral on auth/network failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return meta;
}

function sourceTooltip(label: string, meta: SourceMeta): string | undefined {
  const status = statusLabel(meta.status);
  if (meta.lastPolledAt) {
    return `${label}: ${status} · last poll ${meta.lastPolledAt}`;
  }
  return `${label}: ${status}`;
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
      {children}
    </div>
  );
}
