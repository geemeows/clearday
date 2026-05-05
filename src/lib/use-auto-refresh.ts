// Re-fetch when the user is actively looking at the page. Calls `reload`:
//   - on tab/window focus (visibilitychange → "visible")
//   - on a fixed interval while the document is visible (paused when hidden)
//
// Pages mount their initial fetch in a separate effect; this hook layers on
// top to keep the view fresh without a manual reload, so a Slack message that
// landed in Supabase a few seconds ago shows up in the Inbox without F5.

import { useEffect } from "react";

export function useAutoRefresh(
  reload: () => void,
  intervalMs: number = 30_000,
): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer != null) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") reload();
      }, intervalMs);
    };
    const stop = () => {
      if (timer == null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        reload();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [reload, intervalMs]);
}
