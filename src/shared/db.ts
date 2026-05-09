// Minimal Supabase-client surface that's enough for every consumer in the
// codebase. Used as a dependency-injection seam: production code passes the
// real `SupabaseClient` (FE anon-key client or Worker service-role client),
// tests pass an in-memory fake. Lives in `shared/` because both FE and
// Worker code depends on it.

export type SupabaseLike = {
  from: (table: string) => {
    upsert: (
      values: Record<string, unknown> | Record<string, unknown>[],
      options: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
    select: (cols: string) => SelectChain;
    update: (values: Record<string, unknown>) => UpdateChain;
  };
};

export type SelectChain = {
  is: (col: string, val: null) => SelectChain;
  in: (col: string, vals: string[]) => SelectChain;
  ilike: (col: string, pattern: string) => SelectChain;
  or: (filter: string) => SelectChain;
  gte: (col: string, val: string) => SelectChain;
  eq: (col: string, val: string) => SelectChain;
  order: (col: string, opts: { ascending: boolean }) => SelectChain;
  limit: (n: number) => Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>;
};

type UpdateChain = {
  eq: (
    col: string,
    val: string,
  ) => Promise<{ error: { message: string } | null }>;
};
