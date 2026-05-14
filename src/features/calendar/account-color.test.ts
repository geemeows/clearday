import { describe, expect, it } from "vitest";
import { accountColor, PALETTE_SIZE } from "./account-color";

// Minimal WCAG relative-luminance / contrast helpers (no deps).
function linearize(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}
function wcagContrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("accountColor", () => {
  it("is deterministic for the same id (no ordinal)", () => {
    const a = accountColor("user-abc-123-def");
    const b = accountColor("user-abc-123-def");
    expect(a.background).toBe(b.background);
    expect(a.foreground).toBe(b.foreground);
  });

  it("different ids may get different slots", () => {
    const results = new Set(
      ["id-1", "id-2", "id-3", "id-4", "id-5"].map((id) => accountColor(id).background),
    );
    expect(results.size).toBeGreaterThan(1);
  });

  it("ordinal takes precedence over id hash", () => {
    const withOrdinal0_idA = accountColor("uuid-aaa", 0);
    const withOrdinal0_idB = accountColor("uuid-bbb", 0);
    expect(withOrdinal0_idA.background).toBe(withOrdinal0_idB.background);
  });

  it("ordinal 0 and ordinal PALETTE_SIZE map to the same slot (wraps)", () => {
    const first = accountColor("any-id", 0);
    const wrapped = accountColor("any-id", PALETTE_SIZE);
    expect(first.background).toBe(wrapped.background);
  });

  it("all palette slots have WCAG AA contrast (≥ 4.5:1) with white foreground", () => {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const { background, foreground } = accountColor("x", i);
      expect(foreground).toBe("#ffffff");
      const ratio = wcagContrast(background, foreground);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
