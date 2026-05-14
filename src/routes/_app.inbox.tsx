import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "#/lib/supabase";
import { listSignals, dismissSignal } from "#/features/signals/store";
import { useSignalsLive } from "#/features/signals/realtime";
import {
  InboxView,
  storedSignalToInboxSignal,
} from "#/features/signals/components/InboxView";
import type { SupabaseLike } from "#/shared/db";
import type { StoredSignal } from "#/shared/signal";

const db = supabase as unknown as SupabaseLike;

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/inbox")({
  loader: async (): Promise<{ signals: StoredSignal[] }> => {
    const signals = await listSignals(db, {
      includeDismissed: false,
      includeSnoozed: false,
    });
    return { signals };
  },
  component: InboxRoute,
  errorComponent: InboxErrorPage,
});

function InboxErrorPage() {
  return (
    <main
      style={{ flex: 1, overflow: "hidden", display: "flex", height: "100%" }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          color: "var(--muted-foreground, var(--muted))",
        }}
      >
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>
          Failed to load inbox
        </div>
        <div style={{ fontSize: 13 }}>
          Check your connection and try refreshing.
        </div>
      </div>
    </main>
  );
}

// Route component reads loader data and passes it down.
function InboxRoute() {
  const { signals: rawSignals } = Route.useLoaderData();
  return <InboxPage initialSignals={rawSignals} />;
}

// ── InboxPage ─────────────────────────────────────────────────────────────────
// Exported so tests can render it directly with initialSignals prop,
// mirroring the AutomationsPage / CareerPage pattern.

export function InboxPage({
  initialSignals = [],
}: {
  initialSignals?: StoredSignal[];
}) {
  const signals = initialSignals.map(storedSignalToInboxSignal);

  useSignalsLive();

  const handleDismiss = async (id: string) => {
    await dismissSignal(db, id);
  };

  return (
    <main
      style={{ flex: 1, overflow: "hidden", display: "flex", height: "100%" }}
    >
      <InboxView
        signals={signals}
        defaultSelectedId={signals[0]?.id}
        onDismiss={handleDismiss}
      />
    </main>
  );
}
