// Pure module behind /api/week-start GET/PUT. The DB column
// `user_preferences.calendar_week_start` (sun|mon|sat) is the source of truth;
// the worker injects a store so this module stays Supabase-free and testable.

export const WEEK_START_UPDATED_EVENT = "devy:weekStartChanged";
export const WEEK_START_STORAGE_KEY = "devy.weekStart";

export const WEEK_STARTS = ["sun", "mon", "sat"] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];

export type WeekStartView = { weekStart: WeekStart };

export const DEFAULT_WEEK_START: WeekStartView = { weekStart: "mon" };

export type WeekStartStore = {
  load: () => Promise<WeekStartView>;
  save: (patch: WeekStartView) => Promise<WeekStartView>;
};

export type WeekStartPutBody = { weekStart?: unknown };

export async function getWeekStart(
  store: WeekStartStore,
): Promise<WeekStartView> {
  return store.load();
}

export async function putWeekStart(
  body: WeekStartPutBody,
  store: WeekStartStore,
): Promise<
  { ok: true; weekStart: WeekStartView } | { ok: false; error: string }
> {
  if (body.weekStart === undefined) {
    const current = await store.load();
    return { ok: true, weekStart: current };
  }
  if (typeof body.weekStart !== "string") {
    return { ok: false, error: "weekStart must be a string" };
  }
  if (!(WEEK_STARTS as readonly string[]).includes(body.weekStart)) {
    return {
      ok: false,
      error: `weekStart must be one of ${WEEK_STARTS.join(", ")}`,
    };
  }
  const next = await store.save({ weekStart: body.weekStart as WeekStart });
  return { ok: true, weekStart: next };
}
