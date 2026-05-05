import { describe, expect, it } from "vitest";
import { type AuthorizeEnv, buildAuthorizeUrl } from "#/lib/authorize-url";
import { verifyState } from "#/lib/oauth-state";

const env: AuthorizeEnv = {
  GITHUB_CLIENT_ID: "gh-client-id",
  GOOGLE_CLIENT_ID: "go-client-id",
  SLACK_CLIENT_ID: "sl-client-id",
  LINEAR_CLIENT_ID: "lin-client-id",
  JIRA_CLIENT_ID: "atl-client-id",
  STATE_HMAC_SECRET: "test-secret",
  AUTH_PROXY_URL: "https://auth.example.com",
};

describe("buildAuthorizeUrl (github)", () => {
  it("builds the github authorize URL with project client_id, redirect_uri, scopes, and a verifying state", async () => {
    const out = await buildAuthorizeUrl(
      "github",
      "https://owner.example.com",
      env,
      1000,
      () => "fixed-nonce",
    );
    if (!out.ok) throw new Error(`expected ok, got ${out.error}`);
    const url = new URL(out.url);
    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("gh-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://auth.example.com/callback/github",
    );
    expect(url.searchParams.get("scope")).toBe("read:user repo");
    expect(url.searchParams.get("response_type")).toBe("code");

    const state = url.searchParams.get("state") ?? "";
    const verified = await verifyState(state, env.STATE_HMAC_SECRET, 1000);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.userBackendUrl).toBe(
        "https://owner.example.com/",
      );
      expect(verified.payload.nonce).toBe("fixed-nonce");
    }
  });

  it("strips a trailing slash from AUTH_PROXY_URL when assembling redirect_uri", async () => {
    const out = await buildAuthorizeUrl(
      "github",
      "https://owner.example.com",
      { ...env, AUTH_PROXY_URL: "https://auth.example.com/" },
      1000,
      () => "n",
    );
    if (!out.ok) throw new Error("expected ok");
    expect(new URL(out.url).searchParams.get("redirect_uri")).toBe(
      "https://auth.example.com/callback/github",
    );
  });

  it("rejects unknown providers", async () => {
    const out = await buildAuthorizeUrl(
      "evil",
      "https://owner.example.com",
      env,
      1000,
    );
    expect(out).toEqual({ ok: false, error: "unknown_provider" });
  });

  it("builds the google authorize URL with offline access + prompt=consent + calendar scope", async () => {
    const out = await buildAuthorizeUrl(
      "google",
      "https://owner.example.com",
      env,
      1000,
      () => "fixed-nonce",
    );
    if (!out.ok) throw new Error(`expected ok, got ${out.error}`);
    const url = new URL(out.url);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("go-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://auth.example.com/callback/google",
    );
    expect(url.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/calendar.events",
    );
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("errors when the project google client_id is not configured", async () => {
    const out = await buildAuthorizeUrl(
      "google",
      "https://owner.example.com",
      { ...env, GOOGLE_CLIENT_ID: undefined },
      1000,
    );
    expect(out).toEqual({ ok: false, error: "missing_client_id" });
  });

  it("rejects missing backend", async () => {
    const out = await buildAuthorizeUrl("github", null, env, 1000);
    expect(out).toEqual({ ok: false, error: "missing_backend" });
  });

  it("rejects malformed backend", async () => {
    const out = await buildAuthorizeUrl("github", "not a url", env, 1000);
    expect(out).toEqual({ ok: false, error: "invalid_backend" });
  });

  it("rejects non-https backend", async () => {
    const out = await buildAuthorizeUrl(
      "github",
      "http://owner.example.com",
      env,
      1000,
    );
    expect(out).toEqual({ ok: false, error: "non_https_backend" });
  });

  it("errors when the project client_id is not configured", async () => {
    const out = await buildAuthorizeUrl(
      "github",
      "https://owner.example.com",
      { ...env, GITHUB_CLIENT_ID: undefined },
      1000,
    );
    expect(out).toEqual({ ok: false, error: "missing_client_id" });
  });

  it("builds the slack authorize URL with user_scope (not scope) and comma-joined read scopes", async () => {
    const out = await buildAuthorizeUrl(
      "slack",
      "https://owner.example.com",
      env,
      1000,
      () => "fixed-nonce",
    );
    if (!out.ok) throw new Error(`expected ok, got ${out.error}`);
    const url = new URL(out.url);
    expect(url.origin + url.pathname).toBe(
      "https://slack.com/oauth/v2/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("sl-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://auth.example.com/callback/slack",
    );
    // Slack v2 uses `user_scope` for user-token scopes; `scope` (bot) must not
    // be set since v1 requests no bot scopes.
    expect(url.searchParams.get("user_scope")).toBe(
      "channels:read,groups:read,im:read,mpim:read,channels:history,groups:history,im:history,mpim:history,users:read,users.profile:write,dnd:write,chat:write",
    );
    expect(url.searchParams.get("scope")).toBeNull();
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("errors when the project slack client_id is not configured", async () => {
    const out = await buildAuthorizeUrl(
      "slack",
      "https://owner.example.com",
      { ...env, SLACK_CLIENT_ID: undefined },
      1000,
    );
    expect(out).toEqual({ ok: false, error: "missing_client_id" });
  });

  it("builds the linear authorize URL with read scope and prompt=consent", async () => {
    const out = await buildAuthorizeUrl(
      "linear",
      "https://owner.example.com",
      env,
      1000,
      () => "fixed-nonce",
    );
    if (!out.ok) throw new Error(`expected ok, got ${out.error}`);
    const url = new URL(out.url);
    expect(url.origin + url.pathname).toBe(
      "https://linear.app/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("lin-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://auth.example.com/callback/linear",
    );
    expect(url.searchParams.get("scope")).toBe("read");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("errors when the project linear client_id is not configured", async () => {
    const out = await buildAuthorizeUrl(
      "linear",
      "https://owner.example.com",
      { ...env, LINEAR_CLIENT_ID: undefined },
      1000,
    );
    expect(out).toEqual({ ok: false, error: "missing_client_id" });
  });

  it("builds the jira authorize URL with audience, read scopes, offline_access, and prompt=consent", async () => {
    const out = await buildAuthorizeUrl(
      "jira",
      "https://owner.example.com",
      env,
      1000,
      () => "fixed-nonce",
    );
    if (!out.ok) throw new Error(`expected ok, got ${out.error}`);
    const url = new URL(out.url);
    expect(url.origin + url.pathname).toBe(
      "https://auth.atlassian.com/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("atl-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://auth.example.com/callback/jira",
    );
    expect(url.searchParams.get("scope")).toBe(
      "read:jira-user read:jira-work offline_access",
    );
    expect(url.searchParams.get("audience")).toBe("api.atlassian.com");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("errors when the project jira client_id is not configured", async () => {
    const out = await buildAuthorizeUrl(
      "jira",
      "https://owner.example.com",
      { ...env, JIRA_CLIENT_ID: undefined },
      1000,
    );
    expect(out).toEqual({ ok: false, error: "missing_client_id" });
  });
});
