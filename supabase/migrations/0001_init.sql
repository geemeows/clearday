-- Clearday v1 bootstrap schema.
--
-- Single-user gate: every RLS policy below requires the JWT email to match
-- the value stored in public.app_settings.allowed_email. The owner sets this
-- once after deploy:  update public.app_settings set allowed_email = '...';

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- app_settings: single-row config table for deployment-wide settings.
-- ----------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true,
  allowed_email text,
  constraint app_settings_singleton check (id = true)
);

insert into public.app_settings (id, allowed_email) values (true, null);

create or replace function public.allowed_email() returns text
  language sql stable security definer set search_path = public as $$
  select allowed_email from public.app_settings where id = true;
$$;

create or replace function public.is_allowed_user() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') = coalesce(public.allowed_email(), '__unset__');
$$;

alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings
  for select using (public.is_allowed_user());

-- ----------------------------------------------------------------------------
-- signals: unified actionable/time-bound entity.
-- See docs/adr/0002-unified-signal-entity.md.
-- ----------------------------------------------------------------------------
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  kind text not null,
  source_id text not null,
  title text not null,
  url text,
  payload jsonb not null default '{}'::jsonb,
  requires_action boolean not null default false,
  unread_count integer not null default 0,
  source_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (provider, kind, source_id)
);

create index signals_kind_created_idx on public.signals (kind, created_at desc);
create index signals_requires_action_idx on public.signals (requires_action)
  where dismissed_at is null;
create index signals_payload_gin on public.signals using gin (payload);

-- ----------------------------------------------------------------------------
-- signal_rollups: pre-aggregated counts per (period, kind) for old data.
-- ----------------------------------------------------------------------------
create table public.signal_rollups (
  id uuid primary key default gen_random_uuid(),
  period text not null,           -- 'month' | 'quarter' | 'year'
  period_start date not null,
  kind text not null,
  count integer not null default 0,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (period, period_start, kind)
);

-- ----------------------------------------------------------------------------
-- provider_accounts: per-provider OAuth tokens for the deployment owner.
-- ----------------------------------------------------------------------------
create table public.provider_accounts (
  provider text primary key,        -- 'github' | 'slack' | 'google' | ...
  account_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- user_preferences: alert channels, quiet hours, focus defaults, etc.
-- ----------------------------------------------------------------------------
create table public.user_preferences (
  id boolean primary key default true,
  alert_channels text[] not null default '{}',  -- 'slack' | 'web_push'
  quiet_hours jsonb not null default '{}'::jsonb,
  focus_defaults jsonb not null default '{}'::jsonb,
  briefing jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_preferences_singleton check (id = true)
);

insert into public.user_preferences (id) values (true);

-- ----------------------------------------------------------------------------
-- web_push_subscriptions: per-device PWA push endpoints.
-- ----------------------------------------------------------------------------
create table public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- slack_channel_allowlist: channels in which @here / @channel become Signals.
-- ----------------------------------------------------------------------------
create table public.slack_channel_allowlist (
  channel_id text primary key,
  channel_name text,
  added_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- inbox_rules: user-defined filter / route / dismiss rules.
-- ----------------------------------------------------------------------------
create table public.inbox_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  priority integer not null default 100,
  match jsonb not null default '{}'::jsonb,
  action jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ai_settings: BYO AI provider config (provider, model, encrypted-ish key).
-- ----------------------------------------------------------------------------
create table public.ai_settings (
  id boolean primary key default true,
  provider text,                    -- 'openai' | 'anthropic' | 'gemini' | ...
  model text,
  api_key text,
  base_url text,
  updated_at timestamptz not null default now(),
  constraint ai_settings_singleton check (id = true)
);

insert into public.ai_settings (id) values (true);

-- ----------------------------------------------------------------------------
-- ai_usage: per-day token + cost ledger for the AI budget meter.
-- ----------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  provider text not null,
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now()
);

create index ai_usage_day_idx on public.ai_usage (day desc);

-- ----------------------------------------------------------------------------
-- RLS: every authenticated session must match the allowed email.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'signals',
    'signal_rollups',
    'provider_accounts',
    'user_preferences',
    'web_push_subscriptions',
    'slack_channel_allowlist',
    'inbox_rules',
    'ai_settings',
    'ai_usage'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user())',
      t || '_allowed_user',
      t
    );
  end loop;
end $$;
