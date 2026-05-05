-- Track Slack threads the deployment owner has posted in. Without this, the
-- webhook drops thread_reply events from unparticipated threads (the v1
-- behavior flagged in the #6 RALPH iteration). When the owner authors a
-- message in any thread, the webhook records `(channel, thread_anchor_ts)`
-- here; subsequent replies from other users in the same thread look up this
-- table and become `thread_reply` Signals.

create table if not exists public.slack_participated_threads (
  channel text not null,
  thread_ts text not null,
  participated_at timestamptz not null default now(),
  primary key (channel, thread_ts)
);

alter table public.slack_participated_threads enable row level security;

create policy slack_participated_threads_allowed_user
  on public.slack_participated_threads
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
