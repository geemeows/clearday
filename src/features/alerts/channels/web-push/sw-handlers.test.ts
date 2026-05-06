import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPushNotification,
  notificationClickUrl,
} from "#/features/alerts/channels/web-push/sw-handlers";

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

describe("public/sw.js parity with canonical helpers", () => {
  const swSource = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  const swExports = new Function(
    `${swSource}\nreturn { buildPushNotification, notificationClickUrl };`,
  )() as {
    buildPushNotification: typeof buildPushNotification;
    notificationClickUrl: typeof notificationClickUrl;
  };

  const pushCases: Array<Parameters<typeof buildPushNotification>[0]> = [
    null,
    {},
    { title: "PR review requested", body: "Review me", url: "/inbox?id=sig-1" },
    { title: "  ", body: "" },
    { title: "Only title" },
    { url: "/today" },
  ];

  for (const input of pushCases) {
    it(`buildPushNotification matches canonical for ${JSON.stringify(input)}`, () => {
      expect(swExports.buildPushNotification(input)).toEqual(
        buildPushNotification(input),
      );
    });
  }

  const clickCases = [
    null,
    undefined,
    {},
    { url: "/inbox?id=abc" },
    { url: "/" },
  ];

  for (const input of clickCases) {
    it(`notificationClickUrl matches canonical for ${JSON.stringify(input)}`, () => {
      expect(swExports.notificationClickUrl(input)).toBe(
        notificationClickUrl(input),
      );
    });
  }
});
