-- project_card_signals: links an inbox Signal to a project card.
-- UNIQUE(signal_id) enforces "one Signal, one card" — the same signal cannot
-- be attached to two cards simultaneously.
-- Deleting a card cascades to remove its links.
-- Deleting a signal tombstones the link row (deleted_at set) rather than
-- removing it, so the card UI can show a "signal deleted" indicator.

-- ----------------------------------------------------------------------------
-- project_card_signals
-- ----------------------------------------------------------------------------
create table public.project_card_signals (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.project_cards (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  signal_id uuid references public.signals (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Partial unique index: a non-null signal_id may appear in at most one row.
create unique index project_card_signals_signal_id_unique
  on public.project_card_signals (signal_id)
  where signal_id is not null;

create index project_card_signals_card_id_idx
  on public.project_card_signals (card_id);

-- Tombstone trigger: sets deleted_at on the link row before the FK nulls
-- signal_id, so the card can distinguish "signal deleted" from "never linked".
create or replace function public.tombstone_card_signal()
returns trigger language plpgsql security definer as $$
begin
  update public.project_card_signals
  set deleted_at = now()
  where signal_id = OLD.id and deleted_at is null;
  return OLD;
end;
$$;

create trigger signals_before_delete_tombstone_card_signals
  before delete on public.signals
  for each row execute function public.tombstone_card_signal();

alter table public.project_card_signals enable row level security;
create policy project_card_signals_allowed_user on public.project_card_signals
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
