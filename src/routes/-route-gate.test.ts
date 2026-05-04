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
  it("redirects unauthenticated users to /login", async () => {
    let caught: unknown;
    try {
      await callBeforeLoad(IndexRoute as never, {
        context: { auth: { loading: false, session: null } },
        location: { href: "/" },
      });
    } catch (err) {
      caught = err;
    }
    expect(isRedirect(caught)).toBe(true);
    expect(redirectTarget(caught)).toBe("/login");
  });

  it("redirects authenticated users to /today when status fetch fails", async () => {
    let caught: unknown;
    try {
      await callBeforeLoad(IndexRoute as never, {
        context: {
          auth: { loading: false, session: { user: { email: "x" } } },
        },
        location: { href: "/" },
      });
    } catch (err) {
      caught = err;
    }
    // Without a real supabase session the status fetch throws and is caught;
    // beforeLoad falls through to /today.
    expect(isRedirect(caught)).toBe(true);
    expect(redirectTarget(caught)).toBe("/today");
  });
});
