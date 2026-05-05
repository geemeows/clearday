-- Inbox rule priority override on signals.
--
-- The inbox-rules-engine (issue #20) maps a `priority` rule effect onto this
-- column at the signal-store.upsert seam. Null means "no override" — the
-- inbox renders these without a priority badge. "high" / "low" override the
-- default and surface as a colored badge in the inbox row.

alter table public.signals
  add column if not exists priority text;

alter table public.signals
  drop constraint if exists signals_priority_check;
alter table public.signals
  add constraint signals_priority_check
  check (priority is null or priority in ('low', 'high'));

create index if not exists signals_priority_idx
  on public.signals (priority)
  where dismissed_at is null and priority is not null;
