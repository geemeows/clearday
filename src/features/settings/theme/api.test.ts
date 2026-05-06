import { describe, expect, it, vi } from "vitest";
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  getTheme,
  putTheme,
  resolveEffectiveTheme,
  type ThemeStore,
  type ThemeView,
} from "#/features/settings/theme/api";

function makeStore(initial: ThemeView = DEFAULT_THEME): ThemeStore {
  let row: ThemeView = { ...initial };
  return {
    load: vi.fn(async () => ({ ...row })),
    save: vi.fn(async (patch) => {
      row = { ...row, ...patch };
      return { ...row };
    }),
  };
}

describe("getTheme", () => {
  it("returns the stored view", async () => {
    const store = makeStore({
      theme: "dark",
      density: "compact",
      accent: "ocean",
    });
    expect(await getTheme(store)).toEqual({
      theme: "dark",
      density: "compact",
      accent: "ocean",
    });
  });
});

describe("putTheme", () => {
  it("persists each supplied field, leaves omitted fields untouched", async () => {
    const store = makeStore();
    const out = await putTheme({ theme: "dark" }, store);
    expect(out).toEqual({
      ok: true,
      theme: { theme: "dark", density: "comfortable", accent: "rausch" },
    });
    expect(store.save).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("accepts every documented theme / density / accent", async () => {
    const store = makeStore();
    const out = await putTheme(
      { theme: "system", density: "compact", accent: "plum" },
      store,
    );
    expect(out).toEqual({
      ok: true,
      theme: { theme: "system", density: "compact", accent: "plum" },
    });
  });

  it("rejects unknown theme values", async () => {
    const store = makeStore();
    const out = await putTheme({ theme: "pink" }, store);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/theme must be one of/);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects non-string field values", async () => {
    const store = makeStore();
    const out = await putTheme({ density: 42 as unknown as string }, store);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("density must be a string");
  });

  it("is a no-op when no recognized fields are supplied", async () => {
    const store = makeStore();
    const out = await putTheme({}, store);
    expect(out).toEqual({ ok: true, theme: DEFAULT_THEME });
    expect(store.save).toHaveBeenCalledWith({});
  });
});

describe("resolveEffectiveTheme", () => {
  it("light/dark are returned as-is", () => {
    expect(resolveEffectiveTheme("light", true)).toBe("light");
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
  });
  it("system follows the OS preference", () => {
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
    expect(resolveEffectiveTheme("system", false)).toBe("light");
  });
});

describe("applyThemeToDocument", () => {
  it("sets data attributes for theme, density, accent", () => {
    const root = document.createElement("html");
    applyThemeToDocument(
      { theme: "dark", density: "compact", accent: "ocean" },
      root,
      false,
    );
    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.density).toBe("compact");
    expect(root.dataset.accent).toBe("ocean");
  });

  it("resolves system theme against the OS preference", () => {
    const root = document.createElement("html");
    applyThemeToDocument(
      { theme: "system", density: "comfortable", accent: "rausch" },
      root,
      true,
    );
    expect(root.dataset.theme).toBe("dark");
  });
});
