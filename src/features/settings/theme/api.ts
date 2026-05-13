// Pure module behind /api/theme GET/PUT.
//
// Theme fields live on the singleton user_preferences row (theme, density).
// Like profile-api, the worker injects a store so this module stays free of
// Supabase imports and is testable in isolation.

export const THEME_UPDATED_EVENT = "clearday:theme-updated";

export const THEMES = ["light", "dark", "system"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;

export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

export type ThemeView = {
  theme: Theme;
  density: Density;
};

export const DEFAULT_THEME: ThemeView = {
  theme: "system",
  density: "comfortable",
};

export type ThemeStore = {
  load: () => Promise<ThemeView>;
  save: (patch: Partial<ThemeView>) => Promise<ThemeView>;
};

export type ThemePutBody = {
  theme?: unknown;
  density?: unknown;
};

function checkOneOf<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
): { ok: true; value: T } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  if (!(allowed as readonly string[]).includes(value)) {
    return {
      ok: false,
      error: `${field} must be one of ${allowed.join(", ")}`,
    };
  }
  return { ok: true, value: value as T };
}

export async function getTheme(store: ThemeStore): Promise<ThemeView> {
  return store.load();
}

export async function putTheme(
  body: ThemePutBody,
  store: ThemeStore,
): Promise<{ ok: true; theme: ThemeView } | { ok: false; error: string }> {
  const patch: Partial<ThemeView> = {};
  if (body.theme !== undefined) {
    const r = checkOneOf("theme", body.theme, THEMES);
    if (!r.ok) return r;
    patch.theme = r.value;
  }
  if (body.density !== undefined) {
    const r = checkOneOf("density", body.density, DENSITIES);
    if (!r.ok) return r;
    patch.density = r.value;
  }
  const theme = await store.save(patch);
  return { ok: true, theme };
}

// Resolve the effective theme ('light' | 'dark') given the user's preference
// and the OS preference. Used by the client to decide which token set to apply.
export function resolveEffectiveTheme(
  theme: Theme,
  prefersDark: boolean,
): "light" | "dark" {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}

// Apply the given view to a document element by setting data attributes;
// CSS in styles.css selects on these to switch tokens. Pure DOM mutation
// — caller decides when to invoke (boot, after save, on system change).
export function applyThemeToDocument(
  view: ThemeView,
  root: HTMLElement,
  prefersDark: boolean,
): void {
  const effective = resolveEffectiveTheme(view.theme, prefersDark);
  root.dataset.theme = effective;
  root.dataset.density = view.density;
}
