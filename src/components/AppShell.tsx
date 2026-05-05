import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { Calendar, CheckSquare, Inbox, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CommandPalette } from "#/components/CommandPalette";
import {
  type FocusState,
  NavigationSidebar,
  type NavigationSidebarProps,
  type NavPage,
  type NavProfile,
  type NavSource,
  OPEN_CMDK_EVENT,
} from "#/components/NavigationSidebar";
import type { SourceKind } from "#/components/SourceGlyph";
import { apiFetch } from "#/lib/api-client";
import { PROFILE_UPDATED_EVENT, type ProfileView } from "#/lib/profile-api";
import {
  type ApiSourceStatus,
  deriveSourceStatus,
  type SourceStatus,
} from "#/lib/source-status";

const PAGES: NavPage[] = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/calendar", label: "Calendar", icon: Calendar },
];

type SourceDef = { id: string; label: string; kind: SourceKind };

const SOURCE_DEFS: SourceDef[] = [
  { id: "github", label: "GitHub", kind: "git" },
  { id: "slack", label: "Slack", kind: "slack" },
  { id: "google-calendar", label: "Google Calendar", kind: "cal" },
  { id: "linear", label: "Linear", kind: "task" },
  { id: "jira", label: "Jira", kind: "task" },
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
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const sourceMeta = useSourceStatuses();
  const inboxBadge = useInboxBadge();
  const profile = useProfile();

  const sources = useMemo<NavSource[]>(
    () =>
      SOURCE_DEFS.map((def) => ({
        id: def.id,
        label: def.label,
        kind: def.kind,
        count: 0,
        // TODO(post-redesign): Linear/Jira live counts ship with the adapters
        // (see PRD #29 provider-scope decision).
        status: sourceMeta[def.id]?.status ?? ("neutral" as SourceStatus),
      })),
    [sourceMeta],
  );

  // focus.active is stubbed to false until the focus session slice (#39)
  // wires the live countdown.
  const focus: FocusState = { active: false };

  const props: NavigationSidebarProps = {
    pages: PAGES,
    page: path,
    onPage: (to) => router.navigate({ to }),
    inboxBadge,
    sources,
    focus,
    onStartFocus: () => {
      // Inline FocusButton owns its own dialog for now.
    },
    onOpenSettings: () => router.navigate({ to: "/settings" }),
    onOpenCmdk: () => window.dispatchEvent(new CustomEvent(OPEN_CMDK_EVENT)),
    profile,
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <NavigationSidebar {...props} />
      <main className="flex-1">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}

function useProfile(): NavProfile {
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      (apiFetch("/api/profile") as Promise<ProfileView>)
        .then((p) => {
          if (!cancelled) setProfile(p);
        })
        .catch(() => {
          // Leave profile null; sidebar shows the generic fallback.
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
  }, []);

  return {
    displayName: profile?.display_name ?? null,
    email: null,
    avatarUrl: profile?.avatar_url ?? null,
  };
}

function useInboxBadge(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/signals?filter=all")
      .then((body) => {
        if (cancelled) return;
        const signals = (body as { signals?: unknown[] }).signals ?? [];
        setCount(signals.length);
      })
      .catch(() => {
        // Leave at 0 on auth/network failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
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
