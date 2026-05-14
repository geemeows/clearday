// Calendar route — loader reads meeting signals from Supabase and passes them
// to CalendarPage. All fixture data lives in the component's props contract;
// none lives here.

import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "#/lib/supabase";
import { listSignals } from "#/features/signals/store";
import type { StoredSignal } from "#/shared/signal";
import type { SupabaseLike } from "#/shared/db";
import { CalendarPage } from "#/features/calendar/components/CalendarPage";

type LoaderData = { signals: StoredSignal[] };

export const Route = createFileRoute("/_app/calendar")({
  loader: async (): Promise<LoaderData> => {
    const signals = await listSignals(supabase as unknown as SupabaseLike, {
      kinds: ["meeting"],
    });
    return { signals };
  },
  component: CalendarPageRoute,
  errorComponent: CalendarErrorView,
});

function CalendarPageRoute() {
  const { signals } = Route.useLoaderData();
  return <CalendarPage signals={signals} />;
}

function CalendarErrorView() {
  return (
    <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
      <div
        style={{
          padding: "32px",
          textAlign: "center",
          color: "var(--muted-foreground)",
          fontSize: 14,
        }}
      >
        Failed to load calendar events. Check your connection and refresh.
      </div>
    </main>
  );
}
