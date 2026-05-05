// Per-provider authorize-URL configuration. The auth-proxy looks up scopes
// (and provider-specific extra params like Google's `access_type=offline`)
// from this table when building the authorize URL for /start/<provider>.
//
// Adding a provider here is the only schema change required to extend the
// kickoff to a new OAuth target — the authorize-URL builder reads the rest
// from this entry. Scopes start narrow; widen by feature issue when needed.

export type AuthorizeProvider =
  | "github"
  | "google"
  | "slack"
  | "linear"
  | "jira";

export type AuthorizeProviderConfig = {
  authorizeUrl: string;
  scopes: string[];
  // Joins scopes for the URL (GitHub uses space, Slack would use comma, etc).
  scopeSeparator: string;
  // Slack uses `user_scope` rather than `scope`; the rest use `scope`.
  scopeParam: string;
  // Extra static params (e.g. Google's `access_type=offline` + `prompt=consent`).
  extraParams: Record<string, string>;
};

export const AUTHORIZE_PROVIDERS: Record<
  AuthorizeProvider,
  AuthorizeProviderConfig
> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    scopes: ["read:user", "repo"],
    scopeSeparator: " ",
    scopeParam: "scope",
    extraParams: {},
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: ["openid", "https://www.googleapis.com/auth/calendar.events"],
    scopeSeparator: " ",
    scopeParam: "scope",
    // `access_type=offline` + `prompt=consent` together force Google to issue
    // a refresh_token on every authorization (Google omits it on subsequent
    // consents to a previously-authorized app otherwise).
    extraParams: {
      access_type: "offline",
      prompt: "consent",
    },
  },
  linear: {
    authorizeUrl: "https://linear.app/oauth/authorize",
    // `read` is sufficient for the v1 cron-polled `viewer.assignedIssues`
    // ingest. Write actions (state transitions, comments) widen this per
    // feature issue.
    scopes: ["read"],
    scopeSeparator: ",",
    scopeParam: "scope",
    // `prompt=consent` forces Linear to re-issue a refresh_token on every
    // authorization rather than only on the first consent — keeps the cron
    // refresh path live across re-connects.
    extraParams: {
      prompt: "consent",
    },
  },
  jira: {
    authorizeUrl: "https://auth.atlassian.com/authorize",
    // v1 read-only ingest of assigned issues across all accessible Atlassian
    // sites. `offline_access` is what makes Atlassian return a `refresh_token`
    // — without it the cron refresh path can't keep tokens fresh.
    scopes: ["read:jira-user", "read:jira-work", "offline_access"],
    scopeSeparator: " ",
    scopeParam: "scope",
    // `audience=api.atlassian.com` is required for the 3LO flow against the
    // Jira REST API; `prompt=consent` matches google/linear so re-connects
    // re-issue the refresh_token rather than only returning it on first
    // consent.
    extraParams: {
      audience: "api.atlassian.com",
      prompt: "consent",
    },
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    // User-token scopes for read-only Slack ingest. Bot-token scopes are not
    // requested in v1 — added per feature issue when needed (e.g. chat:write
    // for #19's quick-reply).
    scopes: [
      "channels:read",
      "groups:read",
      "im:read",
      "mpim:read",
      "channels:history",
      "groups:history",
      "im:history",
      "mpim:history",
      "users.profile:write",
      "dnd:write",
    ],
    scopeSeparator: ",",
    // Slack's v2 endpoint uses `user_scope` for user-token scopes (and `scope`
    // for bot-token scopes — unused in v1).
    scopeParam: "user_scope",
    extraParams: {},
  },
};

export function isAuthorizeProvider(p: string): p is AuthorizeProvider {
  return Object.hasOwn(AUTHORIZE_PROVIDERS, p);
}
