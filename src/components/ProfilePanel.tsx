// Settings → Profile panel (per PRD #29 mockup #2).
//
// Composes the existing /api/profile, /api/integrations, and Supabase
// session into a single read-only view with a Sign out action.

import { LogOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { apiFetch } from "#/lib/api-client";
import { signOut as defaultSignOut } from "#/lib/auth";
import type { IntegrationView } from "#/lib/integrations-api";
import type { ProfileView } from "#/lib/profile-api";
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

async function loadProfileFields(): Promise<ProfileFields> {
  const [profile, integrations, session] = await Promise.all([
    (apiFetch("/api/profile") as Promise<ProfileView>).catch(() => null),
    (
      apiFetch("/api/integrations") as Promise<{
        integrations: IntegrationView[];
      }>
    ).catch(() => ({ integrations: [] as IntegrationView[] })),
    supabase.auth.getSession().then((r) => r.data.session),
  ]);
  const github = integrations.integrations.find((i) => i.provider === "github");
  return {
    displayName: profile?.display_name ?? null,
    email: session?.user?.email ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    githubHandle: github?.account_id ?? null,
  };
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
    <section>
      <header>
        <h2 className="font-semibold text-xl">Profile</h2>
        <p className="mt-2 text-muted-foreground text-sm">Your Devy account.</p>
      </header>

      {fields === null ? (
        <p className="mt-6 text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="mt-6 flex max-w-xl items-center gap-5">
          <Avatar className="size-16">
            {fields.avatarUrl ? (
              <AvatarImage
                src={fields.avatarUrl}
                alt={fields.displayName ?? "You"}
              />
            ) : null}
            <AvatarFallback>
              {(fields.displayName ?? fields.email ?? "D")
                .charAt(0)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{fields.displayName ?? "—"}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{fields.email ?? "—"}</dd>
            <dt className="text-muted-foreground">GitHub</dt>
            <dd>
              {fields.githubHandle ? (
                <code className="font-mono">@{fields.githubHandle}</code>
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </div>
      )}

      <div className="mt-8">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleSignOut()}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </section>
  );
}
