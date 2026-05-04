import { describe, expect, it } from "vitest";
import { Route as AppRoute } from "#/routes/_app";
import { Route as IndexRoute } from "#/routes/index";

type BeforeLoad = (args: {
  context: { auth: { loading: boolean; session: unknown } };
  location: { href: string };
}) => unknown;

const callBeforeLoad = (
  route: { options: { beforeLoad?: BeforeLoad } },
  args: Parameters<BeforeLoad>[0],
) => {
  if (!route.options.beforeLoad) throw new Error("beforeLoad missing");
  return route.options.beforeLoad(args);
};

type Redirect = { options: { to: string } };

const isRedirect = (err: unknown): err is Redirect => {
  if (typeof err !== "object" || err === null) return false;
  const r = err as { options?: { to?: unknown } };
  return typeof r.options?.to === "string";
};

const redirectTarget = (err: unknown): string | undefined =>
  isRedirect(err) ? err.options.to : undefined;

describe("/_app route gate", () => {
  it("redirects to /login when there is no session", () => {
    expect(() =>
      callBeforeLoad(AppRoute as never, {
        context: { auth: { loading: false, session: null } },
        location: { href: "/today" },
      }),
    ).toThrow();

    try {
      callBeforeLoad(AppRoute as never, {
        context: { auth: { loading: false, session: null } },
        location: { href: "/today" },
      });
    } catch (err) {
      expect(isRedirect(err)).toBe(true);
      expect(redirectTarget(err)).toBe("/login");
    }
  });

  it("does not redirect while auth is still loading", () => {
    expect(
      callBeforeLoad(AppRoute as never, {
        context: { auth: { loading: true, session: null } },
        location: { href: "/today" },
      }),
    ).toBeUndefined();
  });

  it("allows through when a session exists (allowed-email check happens client-side)", () => {
    expect(
      callBeforeLoad(AppRoute as never, {
        context: {
          auth: { loading: false, session: { user: { email: "x" } } },
        },
        location: { href: "/today" },
      }),
    ).toBeUndefined();
  });
});

describe("/ index route", () => {
  it("redirects unauthenticated users to /login", () => {
    try {
      callBeforeLoad(IndexRoute as never, {
        context: { auth: { loading: false, session: null } },
        location: { href: "/" },
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRedirect(err)).toBe(true);
      expect(redirectTarget(err)).toBe("/login");
    }
  });

  it("redirects authenticated users to /today", () => {
    try {
      callBeforeLoad(IndexRoute as never, {
        context: {
          auth: { loading: false, session: { user: { email: "x" } } },
        },
        location: { href: "/" },
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRedirect(err)).toBe(true);
      expect(redirectTarget(err)).toBe("/today");
    }
  });
});
