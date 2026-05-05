-- Bump signals.unread_count whenever a poll re-upsert brings new content
-- (title / url / payload / requires_action changed). A no-op re-upsert with
-- the same content leaves the count alone, and a dismiss (dismissed_at
-- update only) does not bump either. Pairs with the (provider, kind,
-- source_id) unique-key upsert in src/lib/signal-store.ts so every conflict
-- path that represents "new comments / new reviews" bumps unread_count
-- automatically, satisfying the deferred AC item from issue #4.

create or replace function public.bump_signal_unread_count()
returns trigger
language plpgsql
as $$
begin
  if (new.title is distinct from old.title
      or new.url is distinct from old.url
      or new.payload is distinct from old.payload
      or new.requires_action is distinct from old.requires_action) then
    new.unread_count := old.unread_count + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists signals_bump_unread_count on public.signals;
create trigger signals_bump_unread_count
before update on public.signals
for each row
execute function public.bump_signal_unread_count();
