-- Inbox rule channel-matrix override on signals.
--
-- The inbox-rules-engine (issue #20) maps a `channels` rule effect onto this
-- column at the signal-store.upsert seam. Null means "no override" — the
-- alert dispatcher consults the per-event matrix as usual. A non-null value
-- (including the empty array) replaces the matrix lookup for this Signal,
-- so a rule can route a kind to channels different from the matrix default.
-- The per-user enabled-channels list still gates the override at fan-out.

alter table public.signals
  add column if not exists alert_channels_override text[];
