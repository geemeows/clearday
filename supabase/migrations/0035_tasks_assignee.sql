-- Tasks: nullable assignee column (Redesign v4 / Slice 4 tracer, issue #172).
--
-- Unblocks the `setTaskAssignee` store mutation. The redesigned Tasks page
-- has no per-task assign affordance yet — the column lands now so the
-- mutation boundary can ship without a schema-then-mutation gap. UI wiring
-- follows in a subsequent iteration once an affordance is spec'd.

alter table public.tasks
  add column if not exists assignee text;
