import { describe, expect, it } from "vitest";
import { buildPushNotification, notificationClickUrl } from "#/lib/sw-handlers";

describe("buildPushNotification", () => {
  it("renders a generic notification for tickle pushes", () => {
    const out = buildPushNotification(null);
    expect(out.title).toBe("New Clearday signal");
    expect(out.options.body).toBe("Open Clearday to see it");
    expect(out.options.data.url).toBe("/");
    expect(out.options.icon).toBe("/favicon.ico");
  });

  it("uses payload fields when present", () => {
    const out = buildPushNotification({
      title: "PR review requested",
      body: "Review me · github/x/y#1",
      url: "/inbox?id=sig-1",
    });
    expect(out.title).toBe("PR review requested");
    expect(out.options.body).toBe("Review me · github/x/y#1");
    expect(out.options.data.url).toBe("/inbox?id=sig-1");
  });

  it("falls back to defaults for empty fields", () => {
    const out = buildPushNotification({ title: "  ", body: "" });
    expect(out.title).toBe("New Clearday signal");
    expect(out.options.body).toBe("Open Clearday to see it");
  });
});

describe("notificationClickUrl", () => {
  it("returns the notification's url when set", () => {
    expect(notificationClickUrl({ url: "/inbox?id=abc" })).toBe(
      "/inbox?id=abc",
    );
  });
  it("falls back to root when missing", () => {
    expect(notificationClickUrl(null)).toBe("/");
    expect(notificationClickUrl(undefined)).toBe("/");
    expect(notificationClickUrl({})).toBe("/");
  });
});
