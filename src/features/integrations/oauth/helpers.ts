import type { ExchangeEnv } from "#/features/integrations/oauth/types";
import type { SignalProvider } from "#/shared/signal";

export function redirectUri(
  env: ExchangeEnv,
  provider: SignalProvider,
): string {
  return `${stripTrailingSlash(env.AUTH_PROXY_URL)}/callback/${provider}`;
}

export function expiresAtFrom(expiresIn: number | undefined): string | null {
  if (typeof expiresIn !== "number") return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export function parseScope(scope: string | undefined, sep: string): string[] {
  if (!scope) return [];
  return scope
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function safeText(res: {
  text: () => Promise<string>;
}): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable>";
  }
}

export function b64urlDecodeToString(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
