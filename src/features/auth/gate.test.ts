import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "#/features/auth/gate";

describe("isAllowedEmail", () => {
  it("accepts an exact match", () => {
    expect(isAllowedEmail("owner@example.com", "owner@example.com")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isAllowedEmail("  Owner@Example.com ", "owner@example.com")).toBe(
      true,
    );
  });

  it("rejects a different email", () => {
    expect(isAllowedEmail("stranger@example.com", "owner@example.com")).toBe(
      false,
    );
  });

  it.each([
    [null, "owner@example.com"],
    [undefined, "owner@example.com"],
    ["", "owner@example.com"],
    ["owner@example.com", null],
    ["owner@example.com", ""],
  ])("rejects when an input is missing (%j vs %j)", (a, b) => {
    expect(isAllowedEmail(a, b)).toBe(false);
  });
});
