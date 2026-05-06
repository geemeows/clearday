// HTTP handlers for /api/signals* and /api/sources. The SPA reads through
// these so it inherits the user's bearer-token auth (RLS would also gate the
// queries if the SPA went direct, but routing through the Worker lets us
// apply server-side filters and unify shapes).

import {
  deriveProviderAccountStatus,
  type ProviderAccountStatus,
} from "#/features/integrations/provider-account-status";
import {
  dismissSignal,
  listSignals,
  type SupabaseLike,
} from "#/lib/signal-store";
import type { SignalKind, SignalProvider } from "#/shared/signal";
import { json } from "#/worker/middleware";

const KIND_BY_FILTER: Record<string, SignalKind[]> = {
  prs: ["pr_review_requested", "pr_authored", "pr_assigned"],
  meetings: ["meeting"],
  mentions: ["dm", "mention", "thread_reply"],
  tickets: [
    "ticket_assigned",
    "ticket_in_progress",
    "ticket_in_review",
    "ticket_blocked",
  ],
};

const PROVIDERS: SignalProvider[] = [
  "github",
  "google",
  "slack",
  "linear",
  "jira",
];

export async function handleListSignals(
  url: URL,
  client: SupabaseLike,
): Promise<Response> {
  const filter = url.searchParams.get("filter") ?? "all";
  const kinds = filter === "all" ? undefined : KIND_BY_FILTER[filter];
  if (filter !== "all" && !kinds) {
    return json({ error: `unknown filter: ${filter}` }, 400);
  }
  const query = url.searchParams.get("q") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit =
    limitParam && /^\d+$/.test(limitParam)
      ? Math.min(Number(limitParam), 200)
      : undefined;
  const sinceParam = url.searchParams.get("since");
  const since =
    sinceParam && !Number.isNaN(Date.parse(sinceParam))
      ? new Date(sinceParam).toISOString()
      : undefined;
  const includeDismissed = url.searchParams.get("include_dismissed") === "true";
  const includeSnoozed = url.searchParams.get("include_snoozed") === "true";
  const signals = await listSignals(client, {
    kinds,
    query,
    limit,
    since,
    includeDismissed,
    includeSnoozed,
  });
  return json({ signals });
}

export async function handleDismissSignal(
  id: string,
  client: SupabaseLike,
): Promise<Response> {
  if (!id) return json({ error: "missing id" }, 400);
  await dismissSignal(client, id);
  return json({ ok: true });
}

export type SourceStatusRow = {
  provider: string;
  account_id: string | null;
  updated_at: string | null;
  status: string | null;
  last_polled_at?: string | null;
};

export type SourceStatus = {
  provider: SignalProvider;
  status: ProviderAccountStatus;
  account_id: string | null;
  updated_at: string | null;
  last_polled_at: string | null;
};

export async function handleSources(
  loadAccounts: () => Promise<SourceStatusRow[]>,
  now: number = Date.now(),
): Promise<Response> {
  const rows = await loadAccounts();
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const sources: SourceStatus[] = PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      status: deriveProviderAccountStatus({
        providerId: provider,
        rowPresent: row !== undefined,
        rowStatus: row?.status ?? null,
        lastPolledAt: row?.last_polled_at ?? null,
        now,
      }),
      account_id: row?.account_id ?? null,
      updated_at: row?.updated_at ?? null,
      last_polled_at: row?.last_polled_at ?? null,
    };
  });
  return json({ sources });
}
