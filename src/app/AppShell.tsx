import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Calendar,
  Inbox,
  Kanban,
  Moon,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CommandPalette, type PaletteCommand } from "#/app/CommandPalette";
import {
  type FocusState,
  NavigationSidebar,
  type NavigationSidebarProps,
  type NavPage,
  type NavProfile,
  type NavSource,
  OPEN_CMDK_EVENT,
} from "#/app/NavigationSidebar";
import { FocusModal } from "#/features/focus/components/FocusModal";
import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";
import {
  PROFILE_UPDATED_EVENT,
  type ProfileView,
} from "#/features/settings/profile/api";
import {
  DEFAULT_THEME,
  resolveEffectiveTheme,
  THEME_UPDATED_EVENT,
  type ThemeView,
} from "#/features/settings/theme/api";
import type { SourceKind } from "#/features/signals/components/SourceGlyph";
import {
  pickActiveFocus,
  toMeetingEvents,
} from "#/features/calendar/events";
import { apiFetch } from "#/lib/api-client";
import type { Signal, StoredSignal } from "#/shared/signal";

const PAGES: NavPage[] = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/projects", label: "Projects", icon: Kanban },
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
  status: ProviderAccountStatus;
  last_polled_at?: string | null;
};

type SourceMeta = {
  status: ProviderAccountStatus;
  lastPolledAt: string | null;
};

export function AppShell() {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const sourceMeta = useSourceStatuses();
  const { inboxBadge } = useNavBadges();
  const profile = useProfile();
  const theme = useEffectiveTheme();

  const sources = useMemo<NavSource[]>(
    () =>
      SOURCE_DEFS.map((def) => ({
        id: def.id,
        label: def.label,
        kind: def.kind,
        count: 0,
        // TODO(post-redesign): Linear/Jira live counts ship with the adapters
        // (see PRD #29 provider-scope decision).
        status: sourceMeta[def.id]?.status ?? "neutral",
      })),
    [sourceMeta],
  );

  const focus = useActiveFocus();
  const [focusModalOpen, setFocusModalOpen] = useState(false);

  const props: NavigationSidebarProps = {
    pages: PAGES,
    page: path,
    onPage: (to) => router.navigate({ to }),
    inboxBadge,
    sources,
    focus,
    onStartFocus: () => setFocusModalOpen(true),
    onOpenSettings: () => router.navigate({ to: "/settings" }),
    onOpenCmdk: () => window.dispatchEvent(new CustomEvent(OPEN_CMDK_EVENT)),
    profile,
  };

  const startFocusSession = async ({
    minutes,
    message,
  }: {
    minutes: number;
    message: string;
  }) => {
    try {
      await apiFetch("/api/focus", {
        method: "POST",
        body: {
          duration_minutes: minutes,
          message: message.trim() || undefined,
        },
      });
    } catch {
      // Best-effort; the FocusActiveBlock will reflect calendar state on the
      // next refresh once the busy event lands. Errors here are surfaced via
      // the existing toast/log layer in apiFetch.
    }
  };

  const commands: PaletteCommand[] = useMemo(() => {
    const navItems: PaletteCommand[] = PAGES.map((p) => ({
      id: `nav:${p.to}`,
      group: "Navigation",
      label: `Go to ${p.label}`,
      keywords: p.label,
      icon: p.icon,
      onSelect: () => router.navigate({ to: p.to }),
    }));
    navItems.push({
      id: "nav:/settings",
      group: "Navigation",
      label: "Go to Settings",
      keywords: "settings preferences",
      icon: SettingsIcon,
      onSelect: () => router.navigate({ to: "/settings" }),
    });
    const actionItems: PaletteCommand[] = [
      {
        id: "action:theme-toggle",
        group: "Actions",
        label:
          theme.effective === "dark"
            ? "Switch to light mode"
            : "Switch to dark mode",
        keywords: "theme dark light mode appearance",
        icon: theme.effective === "dark" ? Sun : Moon,
        onSelect: () => void theme.toggle(),
      },
    ];
    return [...navItems, ...actionItems];
  }, [router, theme]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <NavigationSidebar {...props} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <CommandPalette commands={commands} />
      <FocusModal
        open={focusModalOpen}
        onOpenChange={setFocusModalOpen}
        onStart={startFocusSession}
      />
    </div>
  );
}

// Polls /api/signals?filter=meetings each minute to detect a currently-active
// focus block (calendar event with payload.is_focus or a focus-shaped title).
// Returns the FocusState shape consumed by NavigationSidebar.
function useActiveFocus(): FocusState {
  const [state, setState] = useState<FocusState>({ active: false });
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const body = (await apiFetch("/api/signals?filter=meetings")) as {
          signals: StoredSignal[];
        };
        if (cancelled) return;
        const events = toMeetingEvents(body.signals);
        const block = pickActiveFocus(events, new Date());
        if (!block) {
          setState({ active: false });
          return;
        }
        const now = Date.now();
        const total = Math.max(
          1,
          Math.round(
            (block.endsAt.getTime() - block.startsAt.getTime()) / 1000,
          ),
        );
        const remaining = Math.max(
          0,
          Math.round((block.endsAt.getTime() - now) / 1000),
        );
        setState({
          active: true,
          remainingSeconds: remaining,
          totalSeconds: total,
        });
      } catch {
        if (!cancelled) setState({ active: false });
      }
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return state;
}

type ThemeSaveResult =
  | { ok: true; theme: ThemeView }
  | { ok: false; error: string };

function useEffectiveTheme(): {
  effective: "light" | "dark";
  toggle: () => Promise<void>;
} {
  const [view, setView] = useState<ThemeView>(DEFAULT_THEME);
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    let cancelled = false;
    (apiFetch("/api/theme") as Promise<ThemeView>)
      .then((t) => {
        if (!cancelled) setView(t);
      })
      .catch(() => {
        // Pre-auth or worker error: stay on defaults.
      });
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ThemeView>).detail;
      if (detail) setView(detail);
    };
    window.addEventListener(THEME_UPDATED_EVENT, onUpdate);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => setPrefersDark(media.matches);
    media.addEventListener("change", onMedia);
    return () => {
      cancelled = true;
      window.removeEventListener(THEME_UPDATED_EVENT, onUpdate);
      media.removeEventListener("change", onMedia);
    };
  }, []);

  const effective = resolveEffectiveTheme(view.theme, prefersDark);

  const toggle = async () => {
    const next: ThemeView = {
      ...view,
      theme: effective === "dark" ? "light" : "dark",
    };
    setView(next);
    try {
      const out = (await apiFetch("/api/theme", {
        method: "PUT",
        body: { theme: next.theme },
      })) as ThemeSaveResult;
      if (out.ok) {
        setView(out.theme);
        window.dispatchEvent(
          new CustomEvent(THEME_UPDATED_EVENT, { detail: out.theme }),
        );
      }
    } catch {
      // Save failed: revert optimistic state on next /api/theme load.
    }
  };

  return { effective, toggle };
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

function useNavBadges(): { inboxBadge: number } {
  const [badges, setBadges] = useState({ inboxBadge: 0 });
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/signals?filter=all")
      .then((body) => {
        if (cancelled) return;
        const signals = (body as { signals?: Signal[] }).signals ?? [];
        const inboxBadge = signals.filter((s) => s.requires_action).length;
        setBadges({ inboxBadge });
      })
      .catch(() => {
        // Leave at 0 on auth/network failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return badges;
}

function useSourceStatuses(): Record<string, SourceMeta> {
  const [meta, setMeta] = useState<Record<string, SourceMeta>>({});
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/sources")
      .then((body) => {
        if (cancelled) return;
        const sources = (body as { sources: ApiSource[] }).sources;
        const next: Record<string, SourceMeta> = {};
        for (const id of Object.keys(SOURCE_PROVIDER)) {
          const match = sources.find((s) => s.provider === SOURCE_PROVIDER[id]);
          next[id] = {
            status: match?.status ?? "neutral",
            lastPolledAt: match?.last_polled_at ?? null,
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
