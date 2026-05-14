// Shared realtime hook for signals. Subscribes to the `signals` table via
// Supabase realtime and invalidates the TanStack Router cache on any
// insert/update/delete so Today + Inbox stay live without manual refresh.

import { useEffect } from "react";
import { supabase } from "#/lib/supabase";
import { router } from "#/router";

export function useSignalsLive(): void {
  useEffect(() => {
    const channel = supabase.channel("signals-live");
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals" },
        () => {
          router.invalidate();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
