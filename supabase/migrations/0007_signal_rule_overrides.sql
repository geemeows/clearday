-- Inbox rule overrides on signals: snoozed_until + tags.
--
-- The inbox-rules-engine (issue #20) maps rule effects onto these columns at
-- the signal-store.upsert seam. listSignals defaults to filtering out signals
-- whose snoozed_until is in the future so snoozed rows leave the inbox until
-- the window expires; tags are accumulated for later display / filtering.
--
-- snoozed_until is indexed because the default Inbox query filters on it on
-- every read.

alter table public.signals
  add column if not exists snoozed_until timestamptz,
  add column if not exists tags text[] not null default '{}';

create index if not exists signals_snoozed_until_idx
  on public.signals (snoozed_until)
  where dismissed_at is null;
