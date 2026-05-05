// Per-provider authorize-URL configuration. The auth-proxy looks up scopes
// (and provider-specific extra params like Google's `access_type=offline`)
// from this table when building the authorize URL for /start/<provider>.
//
// Adding a provider here is the only schema change required to extend the
// kickoff to a new OAuth target — the authorize-URL builder reads the rest
// from this entry. Scopes start narrow; widen by feature issue when needed.

export type AuthorizeProvider = "github" | "google";

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
    scopes: ["openid", "https://www.googleapis.com/auth/calendar.readonly"],
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
};

export function isAuthorizeProvider(p: string): p is AuthorizeProvider {
  return Object.hasOwn(AUTHORIZE_PROVIDERS, p);
}
