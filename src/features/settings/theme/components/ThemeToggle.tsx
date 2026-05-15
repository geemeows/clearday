// Sidebar light/dark toggle. Reads the current theme via /api/theme, listens
// for THEME_UPDATED_EVENT + system color-scheme changes, and on click PUTs
// the opposite explicit theme. System mode stays available in Settings —
// this toggle just flips the effective theme.

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  DEFAULT_THEME,
  readCachedTheme,
  resolveEffectiveTheme,
  THEME_UPDATED_EVENT,
  type ThemeView,
} from "#/features/settings/theme/api";
import { apiFetch } from "#/lib/api-client";

type ThemeSaveResult =
  | { ok: true; theme: ThemeView }
  | { ok: false; error: string };

export function ThemeToggle() {
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
  const next: ThemeView = {
    ...view,
    theme: effective === "dark" ? "light" : "dark",
  };
  const label =
    effective === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const onClick = async () => {
    const previous = view;
    setView(next);
    // Drive <html data-theme> immediately so the swap is instant; the network
    // PUT below confirms (or, on failure, we revert to the prior value).
    window.dispatchEvent(
      new CustomEvent(THEME_UPDATED_EVENT, { detail: next }),
    );
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
      setView(previous);
      window.dispatchEvent(
        new CustomEvent(THEME_UPDATED_EVENT, { detail: previous }),
      );
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      data-effective-theme={effective}
    >
      {effective === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
