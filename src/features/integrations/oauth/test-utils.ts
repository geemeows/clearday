import type { ExchangeEnv } from "#/features/integrations/oauth/types";

export const baseEnv: ExchangeEnv = {
  GITHUB_CLIENT_ID: "gh-id",
  GITHUB_CLIENT_SECRET: "gh-secret",
  GOOGLE_CLIENT_ID: "go-id",
  GOOGLE_CLIENT_SECRET: "go-secret",
  SLACK_CLIENT_ID: "sl-id",
  SLACK_CLIENT_SECRET: "sl-secret",
  AUTH_PROXY_URL: "https://auth.example.com",
};

export const okJson = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
