// Accounts data module — the multi-account-per-provider seam (#121).
//
// Hides the reshaped `provider_accounts` table behind a small interface so
// callers don't need to know about the synthetic id, the primary partial
// unique index, or auto-promotion semantics. `addAccount` handles "first
// account on a provider becomes primary" atomically; `promotePrimary`
// flips the primary flag without violating the partial unique. The
// reauthorize / removeAccount writes land in the OAuth slice (#122).

import type { SupabaseLike } from "#/shared/db";

export type Account = {
  id: string;
  provider: string;
  account_id: string | null;
  handle: string | null;
  display_name: string | null;
  context: string | null;
  primary: boolean;
  added_at: string;
};

export type AddAccountInput = {
  provider: string;
  account_id: string;
  handle?: string | null;
  display_name?: string | null;
  context?: string | null;
};

const ACCOUNT_COLUMNS =
  "id, provider, account_id, handle, display_name, context, primary, added_at";

type RawAccount = {
  id: string;
  provider: string;
  account_id: string | null;
  handle: string | null;
  display_name: string | null;
  context: string | null;
  primary: boolean | null;
  added_at: string;
};

function toAccount(row: RawAccount): Account {
  return {
    id: row.id,
    provider: row.provider,
    account_id: row.account_id,
    handle: row.handle,
    display_name: row.display_name,
    context: row.context,
    primary: row.primary === true,
    added_at: row.added_at,
  };
}

export async function listAccounts(
  client: SupabaseLike,
  args: { providerId?: string } = {},
): Promise<Account[]> {
  let q = client.from("provider_accounts").select(ACCOUNT_COLUMNS);
  if (args.providerId) q = q.eq("provider", args.providerId);
  const { data, error } = await q
    .order("added_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`accounts list failed: ${error.message}`);
  return (data ?? []).map((r) => toAccount(r as RawAccount));
}

export async function getPrimary(
  client: SupabaseLike,
  providerId: string,
): Promise<Account | null> {
  const { data, error } = await client
    .from("provider_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("provider", providerId)
    .eq("primary", "true")
    .order("added_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`primary lookup failed: ${error.message}`);
  const row = data?.[0] as RawAccount | undefined;
  return row ? toAccount(row) : null;
}

/**
 * Insert a new Account row. When the provider has no existing accounts the
 * row is auto-flagged primary so the deployment is never left without a
 * default. Idempotent on `(provider, account_id)`: re-adding an existing
 * identity returns the existing Account untouched (the OAuth slice will
 * route reauth through this path keyed by `account_id`).
 */
export async function addAccount(
  client: SupabaseLike,
  input: AddAccountInput,
): Promise<Account> {
  const existing = await listAccounts(client, { providerId: input.provider });
  const already = existing.find((a) => a.account_id === input.account_id);
  if (already) return already;
  const isPrimary = existing.length === 0;
  const row = {
    provider: input.provider,
    account_id: input.account_id,
    handle: input.handle ?? null,
    display_name: input.display_name ?? null,
    context: input.context ?? null,
    primary: isPrimary,
    added_at: new Date().toISOString(),
  };
  const { error } = await client
    .from("provider_accounts")
    .upsert(row, { onConflict: "provider,account_id" });
  if (error) throw new Error(`account add failed: ${error.message}`);
  const after = await listAccounts(client, { providerId: input.provider });
  const inserted = after.find((a) => a.account_id === input.account_id);
  if (!inserted) throw new Error("account add: row not found after upsert");
  return inserted;
}

/**
 * Flip the primary flag to the named account. Demotes the previous primary
 * first to keep the partial unique `(provider) where primary` happy. No-op
 * when the account is already primary.
 */
export async function promotePrimary(
  client: SupabaseLike,
  accountId: string,
): Promise<void> {
  const target = await loadById(client, accountId);
  if (!target) throw new Error(`promote primary: account not found`);
  if (target.primary) return;
  const demote = await client
    .from("provider_accounts")
    .update({ primary: false })
    .eq("provider", target.provider);
  if (demote.error) {
    throw new Error(`promote primary demote failed: ${demote.error.message}`);
  }
  const promote = await client
    .from("provider_accounts")
    .update({ primary: true })
    .eq("id", accountId);
  if (promote.error) {
    throw new Error(`promote primary set failed: ${promote.error.message}`);
  }
}

async function loadById(
  client: SupabaseLike,
  id: string,
): Promise<Account | null> {
  const { data, error } = await client
    .from("provider_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(`account load failed: ${error.message}`);
  const row = data?.[0] as RawAccount | undefined;
  return row ? toAccount(row) : null;
}
