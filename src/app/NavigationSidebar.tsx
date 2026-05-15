// App sidebar — brand row, Cmd-K trigger, nav list, SourcesRail,
// foot block (FocusActiveBlock or Start session button), user button.

import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarClockIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  InboxIcon,
  LayoutGridIcon,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TargetIcon,
  TrendingUpIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { signOut, useAuth } from "#/features/auth/auth";
import { FocusActiveBlock } from "#/features/focus/components/FocusActiveBlock";
import { useTheme } from "#/features/settings/theme/use-theme";
import { SourcesRail } from "#/features/signals/components/SourcesRail";

type FocusState =
  | { active: false }
  | { active: true; startedAt: number; durationSeconds: number };

function NavItem({
  to,
  icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const active = location === to || location.startsWith(to + "/");

  return (
    <button
      type="button"
      onClick={() => void navigate({ to })}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        borderRadius: "var(--radius-md)",
        background: active ? "var(--secondary)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        textDecoration: "none",
        transition: "background 80ms ease",
        border: "none",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && badge > 0 && (
        <span
          style={{
            background: active ? "var(--primary)" : "var(--secondary)",
            color: active
              ? "var(--primary-foreground)"
              : "var(--secondary-foreground)",
            minWidth: 18,
            height: 18,
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ProjectsTreeNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const active = location === "/projects" || location.startsWith("/projects/");

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void navigate({ to: "/projects" });
          setOpen((o) => !o);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 8px",
          borderRadius: "var(--radius-md)",
          background: active ? "var(--secondary)" : "transparent",
          color: active ? "var(--foreground)" : "var(--muted-foreground)",
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          border: "none",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          transition: "background 80ms ease",
        }}
        onMouseEnter={(e) => {
          if (!active)
            (e.currentTarget as HTMLElement).style.background = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          if (!active)
            (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
      >
        <LayoutGridIcon size={15} />
        <span style={{ flex: 1 }}>Projects</span>
        <ChevronRightIcon
          size={12}
          style={{
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 150ms ease",
          }}
        />
      </button>
      {open && (
        <div
          style={{
            paddingLeft: 22,
            marginTop: 2,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <button
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 8px",
              borderRadius: 6,
              color: "var(--muted-foreground)",
              fontSize: 12,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            + New project
          </button>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const { session } = useAuth();
  const { theme, toggle: flipTheme } = useTheme();

  const email = session?.user?.email ?? "";
  const name =
    (session?.user?.user_metadata?.full_name as string | undefined) ??
    email.split("@")[0] ??
    "User";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2)
    .padEnd(2, name[1]?.toUpperCase() ?? "?");

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "6px 6px",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: open ? "var(--accent)" : "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
        onMouseEnter={(e) => {
          if (!open)
            (e.currentTarget as HTMLElement).style.background = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          if (!open)
            (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "var(--secondary)",
            color: "var(--foreground)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 600,
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {email}
          </div>
        </div>
        <ChevronUpIcon
          size={13}
          style={{ color: "var(--muted-foreground)", flexShrink: 0 }}
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 29 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              right: 0,
              zIndex: 30,
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              padding: 4,
            }}
            role="menu"
          >
            <MenuItem
              icon={
                theme === "dark" ? (
                  <MoonIcon size={13} />
                ) : (
                  <SunIcon size={13} />
                )
              }
              label={theme === "dark" ? "Dark theme" : "Light theme"}
              onClick={flipTheme}
              right={
                <span
                  style={{
                    fontSize: 9.5,
                    color: "var(--muted-foreground)",
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "var(--surface-strong)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {theme === "dark" ? "ON" : "OFF"}
                </span>
              }
            />
            <MenuItem
              icon={<SettingsIcon size={13} />}
              label="Settings"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            />
            <div
              style={{
                height: 1,
                background: "var(--border)",
                margin: "4px 4px",
              }}
            />
            <MenuItem
              icon={<LogOutIcon size={13} />}
              label="Sign out"
              onClick={() => void signOut()}
              danger
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 10px",
        borderRadius: 6,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: danger ? "var(--danger, #ef4444)" : "var(--foreground)",
        fontSize: 13,
        textAlign: "left",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "var(--accent)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "transparent")
      }
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {right}
    </button>
  );
}

export function NavigationSidebar() {
  const [focus, setFocus] = useState<FocusState>({ active: false });
  const navigate = useNavigate();

  const onStartFocus = () => {
    // Dispatch event so the Focus modal (built in #178) can open.
    window.dispatchEvent(new CustomEvent("devy:open-focus-modal"));
  };

  // Listen for focus session start/end events (wired from the FocusModal in #178).
  // When devy:focus-started fires with { durationSeconds }, flip to active state.
  useEffect(() => {
    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<{ durationSeconds: number }>).detail;
      setFocus({
        active: true,
        startedAt: Date.now(),
        durationSeconds: detail?.durationSeconds ?? 45 * 60,
      });
    };
    const onEnd = () => setFocus({ active: false });
    window.addEventListener("devy:focus-started", onStart);
    window.addEventListener("devy:focus-ended", onEnd);
    return () => {
      window.removeEventListener("devy:focus-started", onStart);
      window.removeEventListener("devy:focus-ended", onEnd);
    };
  }, []);

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: "var(--surface-soft)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "12px 10px",
        gap: 14,
        overflowY: "auto",
      }}
      aria-label="Navigation"
    >
      {/* Brand row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 6px",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
            D
          </span>
        </div>
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: -0.3,
            color: "var(--foreground)",
          }}
        >
          Devy
        </span>
      </div>

      {/* Search / Cmd-K trigger */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("devy:open-cmdk"))}
        aria-label="Search — press ⌘K"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: "var(--radius-md)",
          background: "var(--background)",
          border: "1px solid var(--border)",
          color: "var(--muted-foreground)",
          fontSize: 12.5,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <SearchIcon size={13} />
        <span style={{ flex: 1 }}>Search anything…</span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            padding: "1px 5px",
            borderRadius: 4,
            background: "var(--surface-strong)",
            border: "1px solid var(--border)",
          }}
        >
          ⌘K
        </span>
      </button>

      {/* Nav list */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <NavItem
          to="/today"
          icon={<CalendarClockIcon size={15} />}
          label="Today"
        />
        <NavItem to="/inbox" icon={<InboxIcon size={15} />} label="Inbox" />
        <ProjectsTreeNav />
        <NavItem
          to="/career"
          icon={<TrendingUpIcon size={15} />}
          label="Career"
        />
        <NavItem
          to="/calendar"
          icon={<CalendarDaysIcon size={15} />}
          label="Calendar"
        />
        <NavItem
          to="/automations"
          icon={<ZapIcon size={15} />}
          label="Automations"
        />
      </nav>

      {/* Sources rail */}
      <SourcesRail />

      {/* Foot block */}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {focus.active ? (
          <FocusActiveBlock
            durationSeconds={focus.durationSeconds}
            startedAt={focus.startedAt}
          />
        ) : (
          <Button
            variant="default"
            size="default"
            onClick={onStartFocus}
            style={{ width: "100%" }}
            aria-label="Start focus session"
          >
            <TargetIcon size={15} />
            Start focus session
          </Button>
        )}
        <AccountMenu
          onOpenSettings={() => void navigate({ to: "/settings" })}
        />
      </div>
    </aside>
  );
}
