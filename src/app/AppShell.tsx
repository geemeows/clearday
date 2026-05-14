// Top-level app shell — sidebar + main content area.
// CommandPalette is mounted here so it's always available regardless of active route.

import type { ReactNode } from "react";
import { CommandPalette } from "#/app/CommandPalette";
import { NavigationSidebar } from "#/app/NavigationSidebar";
import { FocusModal } from "#/features/focus/components/FocusModal";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      <NavigationSidebar />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {children}
      </div>
      <CommandPalette />
      <FocusModal />
    </div>
  );
}
