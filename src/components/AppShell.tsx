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
// /api/sources. Jira isn't a real provider yet; it stays neutral until the
// adapter lands.
const SOURCE_PROVIDER: Record<string, string> = {
  github: "github",
  slack: "slack",
  "google-calendar": "google",
  linear: "linear",
};

type SourceStatus = "ok" | "error" | "neutral";

type ApiSource = { provider: string; status: "connected" | "disconnected" };

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const statuses = useSourceStatuses();

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <aside
        aria-label="Primary"
        className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white"
      >
        <div className="px-4 py-5 text-sm font-semibold tracking-tight">
          ClearDay
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
              const status = statuses[s.id] ?? "neutral";
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-600"
                >
                  <s.icon className="h-4 w-4" />
                  <span className="flex-1">{s.label}</span>
                  <output
                    aria-label={`${s.label} status: ${statusLabel(status)}`}
                    data-source={s.id}
                    data-status={status}
                    className={cn("h-2 w-2 rounded-full", dotClass(status))}
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
        <header className="flex items-center justify-end border-b border-zinc-200 bg-white px-6 py-3">
          <FocusButton />
        </header>
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}

function useSourceStatuses(): Record<string, SourceStatus> {
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({});
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/sources")
      .then((body) => {
        if (cancelled) return;
        const sources = (body as { sources: ApiSource[] }).sources;
        const next: Record<string, SourceStatus> = {};
        for (const id of Object.keys(SOURCE_PROVIDER)) {
          const match = sources.find((s) => s.provider === SOURCE_PROVIDER[id]);
          next[id] = match?.status === "connected" ? "ok" : "neutral";
        }
        setStatuses(next);
      })
      .catch(() => {
        // Leave dots neutral on auth/network failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return statuses;
}

function statusLabel(status: SourceStatus): string {
  switch (status) {
    case "ok":
      return "connected";
    case "error":
      return "error";
    default:
      return "not connected";
  }
}

function dotClass(status: SourceStatus): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500";
    case "error":
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
