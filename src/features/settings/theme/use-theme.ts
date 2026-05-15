// Theme hook: exposes the effective ('light' | 'dark') theme plus setters that
// persist via /api/theme and broadcast THEME_UPDATED_EVENT so the rest of the
// app (sidebar toggle, document data-theme) stays in sync.
//
// This is the public hook the redesign components reach for; it wraps the
// same wire shape ThemeToggle and the boot controller in main.tsx use, so
// updates from anywhere propagate everywhere.

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_THEME,
  readCachedTheme,
  resolveEffectiveTheme,
  THEME_UPDATED_EVENT,
  type ThemeView,
} from "#/features/settings/theme/api";
import { apiFetch } from "#/lib/api-client";

export type EffectiveTheme = "light" | "dark";

export type UseThemeResult = {
  theme: EffectiveTheme;
  setTheme: (theme: EffectiveTheme) => void;
  toggle: () => void;
};

type ThemeSaveResult =
  | { ok: true; theme: ThemeView }
  | { ok: false; error: string };

export function useTheme(): UseThemeResult {
  // localStorage is the source of truth — see startThemeController in main.tsx.
  // The server PUT in setTheme keeps Supabase in sync best-effort, but we never
  // overwrite a cached choice with a server GET response.
  const [view, setView] = useState<ThemeView>(
    () => readCachedTheme() ?? DEFAULT_THEME,
  );
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    let cancelled = false;
    if (!readCachedTheme()) {
      (apiFetch("/api/theme") as Promise<ThemeView>)
        .then((t) => {
          if (!cancelled) setView(t);
        })
        .catch(() => {
          // Pre-auth or worker error: stay on defaults.
        });
    }
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

  const setTheme = useCallback(
    (next: EffectiveTheme) => {
      const previous = view;
      const optimistic: ThemeView = { ...view, theme: next };
      setView(optimistic);
      window.dispatchEvent(
        new CustomEvent(THEME_UPDATED_EVENT, { detail: optimistic }),
      );
      (
        apiFetch("/api/theme", {
          method: "PUT",
          body: { theme: next },
        }) as Promise<ThemeSaveResult>
      )
        .then((out) => {
          if (out.ok) {
            setView(out.theme);
            window.dispatchEvent(
              new CustomEvent(THEME_UPDATED_EVENT, { detail: out.theme }),
            );
          }
        })
        .catch(() => {
          setView(previous);
          window.dispatchEvent(
            new CustomEvent(THEME_UPDATED_EVENT, { detail: previous }),
          );
        });
    },
    [view],
  );

  const toggle = useCallback(() => {
    setTheme(effective === "dark" ? "light" : "dark");
  }, [effective, setTheme]);

  return { theme: effective, setTheme, toggle };
}
