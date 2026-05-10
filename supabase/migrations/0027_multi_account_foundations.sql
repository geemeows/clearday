-- Multi-account per provider — foundations slice (#121).
--
-- Reshapes provider_accounts so a deployment owner can connect N identities
-- under the same provider. Each existing single-account row migrates in
-- place to the first Account for its provider with primary = true. Signals
-- now carry account_id so provenance is preserved as new accounts come
-- online.

-- 1. provider_accounts reshape -------------------------------------------------

alter table public.provider_accounts
  add column if not exists id uuid not null default gen_random_uuid();

-- Drop the old (provider) PK and adopt the synthetic id as the new PK.
alter table public.provider_accounts
  drop constraint if exists provider_accounts_pkey;

alter table public.provider_accounts
  add constraint provider_accounts_pkey primary key (id);

-- New columns:
--   handle         — human-readable identity string (e.g. @alice on github)
--   display_name   — upstream display string
--   context        — short qualifier ("Personal · 14 repos", "@kovacs.dev")
--   primary        — default account for the provider when ambiguous
--   added_at       — connection time, independent of updated_at
alter table public.provider_accounts
  add column if not exists handle text,
  add column if not exists display_name text,
  add column if not exists context text,
  add column if not exists "primary" boolean not null default false,
  add column if not exists added_at timestamptz not null default now();

-- Backfill: existing rows become the first Account for their provider with
-- primary = true. account_id stays as-is when present; null gets a stable
-- placeholder so the (provider, account_id) unique can be enforced going
-- forward without re-OAuth.
update public.provider_accounts
set "primary" = true,
    account_id = coalesce(account_id, provider || ':migrated'),
    added_at = coalesce(added_at, created_at);

-- Identity uniqueness: never connect the same upstream identity twice.
create unique index if not exists provider_accounts_provider_account_idx
  on public.provider_accounts (provider, account_id);

-- One primary per (owner, provider). Single-tenant deployment ⇒ owner is
-- implicit; the partial unique index gates "exactly one primary" cleanly.
create unique index if not exists provider_accounts_one_primary_idx
  on public.provider_accounts (provider) where "primary";

-- 2. signals.account_id provenance + relaxed unique ---------------------------

alter table public.signals
  add column if not exists account_id uuid
  references public.provider_accounts (id) on delete set null;

create index if not exists signals_account_id_idx on public.signals (account_id);

-- The original (provider, kind, source_id) unique becomes too strict once
-- the same upstream id can arrive on two accounts of the same provider.
alter table public.signals
  drop constraint if exists signals_provider_kind_source_id_key;

create unique index if not exists signals_provider_account_kind_source_idx
  on public.signals (provider, account_id, kind, source_id);

-- Backfill: stamp existing signals with the migrated primary account of
-- their provider. There was only ever one row per provider before this
-- slice, so the mapping is unambiguous.
update public.signals s
set account_id = pa.id
from public.provider_accounts pa
where s.account_id is null
  and pa.provider = s.provider
  and pa."primary" = true;
