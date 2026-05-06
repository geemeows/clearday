// Vitest setup. The env layer (#/env) reads import.meta.env at module
// evaluation, so seed test values before any test imports it.
import.meta.env.VITE_SUPABASE_URL = "https://test.supabase.co";
import.meta.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";

// jsdom doesn't ship ResizeObserver; cmdk (and other Radix-adjacent libs)
// expect it on the global. Stub the minimum surface used by consumers.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom doesn't ship matchMedia; ThemeToggle and the theme controller read
// (prefers-color-scheme: dark) at render time. Default to light so tests have
// a stable baseline; individual tests can override per-suite.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
