// Cmd-K command palette — listens to devy:open-cmdk event and ⌘K shortcut.
// Built on the coss Command + CommandDialog primitives.

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandShortcut,
} from "#/components/ui/command";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { SourceId } from "#/features/signals/components/SourceGlyph";

type CmdItem = {
  title: string;
  sub: string;
  shortcut?: string;
  source: SourceId | "ai";
};

type CmdGroup = {
  group: string;
  items: CmdItem[];
};

const NAV_ITEMS: CmdItem[] = [
  { title: "Go to Today", sub: "Daily summary and schedule", source: "ai" },
  { title: "Go to Inbox", sub: "Signals and actions", source: "slack" },
  { title: "Go to Projects", sub: "Kanban boards", source: "ai" },
  { title: "Go to Career", sub: "Competency tracker", source: "ai" },
  { title: "Go to Calendar", sub: "Agenda view", source: "cal" },
  { title: "Go to Automations", sub: "Workflow automations", source: "ai" },
];

const CMD_ITEMS: CmdItem[] = [
  {
    title: "Start focus session",
    sub: "Blocks calendar, sets Slack DND",
    shortcut: "⌘ F",
    source: "ai",
  },
  {
    title: "Generate morning briefing",
    sub: "haiku 4.5 · ~$0.003",
    shortcut: "⌘ ⇧ B",
    source: "ai",
  },
  {
    title: "Triage inbox",
    sub: "Auto-resolve low-priority signals",
    shortcut: "⌘ I",
    source: "ai",
  },
];

const GROUPS: CmdGroup[] = [
  { group: "Navigate", items: NAV_ITEMS },
  { group: "Commands", items: CMD_ITEMS },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onEvent = () => setOpen(true);
    window.addEventListener("devy:open-cmdk", onEvent);

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("devy:open-cmdk", onEvent);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search for pages and commands"
      showCloseButton={false}
    >
      <CommandInput placeholder="Search for apps and commands…" />
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {GROUPS.map((g) => (
          <CommandGroup key={g.group} heading={g.group}>
            {g.items.map((item) => (
              <CommandItem key={item.title}>
                <SourceGlyph source={item.source} size={16} />
                <div
                  style={{
                    minWidth: 0,
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                  }}
                >
                  <span style={{ fontSize: 13.5 }}>{item.title}</span>
                  <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    {item.sub}
                  </span>
                </div>
                {item.shortcut && (
                  <CommandShortcut>{item.shortcut}</CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandEmpty>No results found.</CommandEmpty>
      </div>
      {/* Footer hints */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-soft)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 12,
          color: "var(--muted-foreground)",
          flexShrink: 0,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span style={{ marginLeft: 2 }}>Navigate</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Kbd>↵</Kbd>
          <span style={{ marginLeft: 2 }}>Open</span>
        </span>
        <span
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Kbd>esc</Kbd>
          <span style={{ marginLeft: 2 }}>Close</span>
        </span>
      </div>
    </CommandDialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 4px",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        color: "var(--muted-foreground)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 4,
      }}
    >
      {children}
    </span>
  );
}
