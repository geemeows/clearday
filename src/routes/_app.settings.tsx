import { createFileRoute } from "@tanstack/react-router";
import type { AiSettingsView } from "#/features/ai/api/settings";
import type { Account as StoreAccount } from "#/features/integrations/accounts/store";
import {
  SettingsPage,
  type SettingsLoaderData,
} from "#/features/settings/components/SettingsPage";
import { apiFetch } from "#/lib/api-client";

const FETCH_PROVIDERS = [
  "github",
  "slack",
  "google",
  "linear",
  "jira",
] as const;

export const Route = createFileRoute("/_app/settings")({
  loader: async (): Promise<SettingsLoaderData> => {
    const [accountBuckets, preferences, aiSettings, retention] =
      await Promise.all([
        Promise.all(
          FETCH_PROVIDERS.map((p) =>
            (
              apiFetch(`/api/providers/${p}/accounts`) as Promise<{
                accounts: StoreAccount[];
              }>
            )
              .then((r) => r.accounts)
              .catch((): StoreAccount[] => []),
          ),
        ),
        apiFetch("/api/preferences").catch(() => ({
          alert_channels: [] as string[],
          notification_matrix: {} as Record<string, string[]>,
          quiet_hours_v2: {} as Record<string, unknown>,
          focus_block: {} as Record<string, unknown>,
          focus_defaults: {} as Record<string, unknown>,
          notification_threshold_min: 10,
        })),
        (apiFetch("/api/ai/settings") as Promise<AiSettingsView>).catch(
          () => null,
        ),
        apiFetch("/api/retention").catch(() => ({ retention_days: 90 })),
      ]);
    return {
      accounts: accountBuckets.flat(),
      preferences: preferences as SettingsLoaderData["preferences"],
      aiSettings: aiSettings as AiSettingsView | null,
      retention: retention as { retention_days: number },
    };
  },
  component: SettingsPageRoute,
  errorComponent: SettingsErrorRoute,
});

function SettingsErrorRoute() {
  return (
    <main
      style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Failed to load settings.</p>
      </div>
    </main>
  );
}

export function SettingsPageRoute() {
  const data = Route.useLoaderData();
  return (
    <main
      style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SettingsPage {...data} />
    </main>
  );
}
