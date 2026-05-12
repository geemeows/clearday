// Settings → Profile panel.
//
// Pulls name / email / avatar from the signed-in Google account
// (Supabase session user_metadata) and joins the GitHub handle from
// /api/integrations. No DB profile read — what you see is what
// Google sent at sign-in.
//
// Identity card chrome mirrors `docs/design/devy-ui/settings.jsx`
// `ProfilePanel` (line 1000): single identity row with a gradient
// 64×64 avatar, name + meta line, and a secondary Sign out button.

import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { signOut as defaultSignOut } from "#/features/auth/auth";
import type { IntegrationView } from "#/features/integrations/api/integrations-api";
import { ThemeToggle } from "#/features/settings/theme/components/ThemeToggle";
import { apiFetch } from "#/lib/api-client";
import { supabase } from "#/lib/supabase";

export type ProfileFields = {
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  githubHandle: string | null;
};

const EMPTY_FIELDS: ProfileFields = {
  displayName: null,
  email: null,
  avatarUrl: null,
  githubHandle: null,
};

// Mock's pink gradient — used as a constant for now. A stable per-user
// gradient (hash user-id → palette index) is the natural follow-up; the
// mock itself hard-codes the pink, so this matches design verbatim.
const AVATAR_GRADIENT = "linear-gradient(135deg, #ffd1da, #ff385c)";

export function useProfile(
  loader: () => Promise<ProfileFields> = loadProfileFields,
): ProfileFields | null {
  const [fields, setFields] = useState<ProfileFields | null>(null);
  useEffect(() => {
    let cancelled = false;
    loader()
      .then((f) => {
        if (!cancelled) setFields(f);
      })
      .catch(() => {
        if (!cancelled) setFields(EMPTY_FIELDS);
      });
    return () => {
      cancelled = true;
    };
  }, [loader]);
  return fields;
}

export async function loadProfileFields(): Promise<ProfileFields> {
  const [integrations, session] = await Promise.all([
    (
      apiFetch("/api/integrations") as Promise<{
        integrations: IntegrationView[];
      }>
    ).catch(() => ({ integrations: [] as IntegrationView[] })),
    supabase.auth.getSession().then((r) => r.data.session),
  ]);
  const github = integrations.integrations.find((i) => i.provider === "github");
  const meta = (session?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null => {
    const v = meta[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  return {
    displayName: str("full_name") ?? str("name") ?? null,
    email: session?.user?.email ?? str("email") ?? null,
    avatarUrl: str("avatar_url") ?? str("picture") ?? null,
    githubHandle: github?.account_id ?? null,
  };
}

export function deriveInitials(
  displayName: string | null,
  email: string | null,
): string {
  const source = (displayName ?? email ?? "").trim();
  if (!source) return "D";
  const tokens = source.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    return `${first?.charAt(0) ?? ""}${last?.charAt(0) ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export type ProfilePanelProps = {
  loader?: () => Promise<ProfileFields>;
  onSignOut?: () => unknown;
};

export function ProfilePanel({ loader, onSignOut }: ProfilePanelProps = {}) {
  const fields = useProfile(loader ?? loadProfileFields);
  const handleSignOut = useMemo(
    () => onSignOut ?? (() => defaultSignOut()),
    [onSignOut],
  );

  return (
    <section className="space-y-[18px]">
      <div>
        <h2 className="font-semibold text-xl leading-[1.25] tracking-[-0.2px]">
          Profile
        </h2>
        <p className="mt-1 text-muted-foreground text-sm leading-[1.5]">
          Used for greeting, AI context, and the avatar.
        </p>
      </div>

      {fields === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="flex items-center gap-[18px] rounded-lg border border-[var(--hairline-soft)] bg-card p-[22px]">
          <div
            aria-hidden="true"
            className="inline-flex size-16 shrink-0 items-center justify-center rounded-full font-semibold text-2xl text-white"
            style={{ background: AVATAR_GRADIENT }}
          >
            {deriveInitials(fields.displayName, fields.email)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate font-semibold text-base">
              {fields.displayName ?? "—"}
            </div>
            <div className="mt-0.5 truncate text-muted-foreground text-sm">
              {[
                fields.email,
                fields.githubHandle ? `GitHub @${fields.githubHandle}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleSignOut()}
          >
            Sign out
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-[var(--hairline-soft)] bg-card p-4">
        <ThemeToggle />
        <span className="text-muted-foreground text-sm">
          Toggle light / dark mode
        </span>
      </div>
    </section>
  );
}
