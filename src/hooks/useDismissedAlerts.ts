import { useCallback } from "react";

const ALERT_STORAGE_PREFIX = "clearday:meeting-alert:";

export type DismissedAlerts = {
  alertAlreadyFired: (id: string) => boolean;
  markAlertFired: (id: string) => void;
};

// localStorage-backed dismissal of meeting alerts so the 10-minute alert
// fires at most once per Signal across reloads / sessions. Pure plumbing —
// not Signal logic — so it lives outside features/signals/display.
export function useDismissedAlerts(): DismissedAlerts {
  const alertAlreadyFired = useCallback((id: string): boolean => {
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem(ALERT_STORAGE_PREFIX + id) != null;
    } catch {
      return false;
    }
  }, []);

  const markAlertFired = useCallback((id: string): void => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(ALERT_STORAGE_PREFIX + id, String(Date.now()));
    } catch {
      // best-effort; if storage is full or disabled, the next render will
      // simply re-fire (the inner setActiveAlertId is also idempotent in
      // the active session).
    }
  }, []);

  return { alertAlreadyFired, markAlertFired };
}
