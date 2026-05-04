// Pure module behind /api/profile GET/PUT.
//
// Profile fields live on the singleton user_preferences row (display_name,
// timezone, locale, avatar_url). The worker injects a store so this module
// stays free of Supabase imports and is testable in isolation.

export const PROFILE_UPDATED_EVENT = "clearday:profile-updated";

export type ProfileView = {
  display_name: string | null;
  timezone: string | null;
  locale: string | null;
  avatar_url: string | null;
};

export type ProfileStore = {
  load: () => Promise<ProfileView>;
  save: (patch: Partial<ProfileView>) => Promise<ProfileView>;
};

export type ProfilePutBody = {
  display_name?: unknown;
  timezone?: unknown;
  locale?: unknown;
  avatar_url?: unknown;
};

const FIELDS = ["display_name", "timezone", "locale", "avatar_url"] as const;
const MAX_LEN = 200;

export async function getProfile(store: ProfileStore): Promise<ProfileView> {
  return store.load();
}

export async function putProfile(
  body: ProfilePutBody,
  store: ProfileStore,
): Promise<{ ok: true; profile: ProfileView } | { ok: false; error: string }> {
  const patch: Partial<ProfileView> = {};
  for (const k of FIELDS) {
    const v = body[k];
    if (v === undefined) continue;
    if (v === null || v === "") {
      patch[k] = null;
      continue;
    }
    if (typeof v !== "string") {
      return { ok: false, error: `${k} must be a string` };
    }
    const trimmed = v.trim();
    if (trimmed.length === 0) {
      patch[k] = null;
      continue;
    }
    if (trimmed.length > MAX_LEN) {
      return { ok: false, error: `${k} must be at most ${MAX_LEN} characters` };
    }
    patch[k] = trimmed;
  }
  const profile = await store.save(patch);
  return { ok: true, profile };
}
