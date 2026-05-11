-- Career — read-only public share links (issue #133, PRD #115).
--
-- A share link points anon (unauthenticated) viewers at a level's tree. The
-- tree tables (career_levels / competencies / criteria / indicators / evidence)
-- stay locked behind is_allowed_user() — anon never queries them directly.
-- Reads go through the SECURITY DEFINER function career_share_read(token)
-- which returns the full tree only when the token matches an unrevoked row in
-- career_shares. Owners manage the share rows under the same is_allowed_user()
-- predicate the rest of the career schema uses.

create table public.career_shares (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.career_levels (id) on delete cascade,
  token text not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index career_shares_level_id_idx on public.career_shares (level_id);

alter table public.career_shares enable row level security;
create policy career_shares_allowed_user on public.career_shares
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- career_share_read(token) — returns the full level tree as a single jsonb
-- payload when the token matches an unrevoked share, NULL otherwise. Anon-
-- callable via the explicit grant below; SECURITY DEFINER bypasses RLS on the
-- tree tables for this read path only. Soft-deleted rows are excluded.
create or replace function public.career_share_read(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_id uuid;
  v_payload jsonb;
begin
  select s.level_id into v_level_id
  from public.career_shares s
  where s.token = p_token
    and s.revoked_at is null
  limit 1;

  if v_level_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'level', jsonb_build_object(
      'id', l.id,
      'title', l.title,
      'status', l.status,
      'header', l.header,
      'created_at', l.created_at,
      'archived_at', l.archived_at
    ),
    'competencies', coalesce(
      (select jsonb_agg(to_jsonb(c.*) order by c.position)
       from public.career_competencies c
       where c.level_id = v_level_id and c.deleted_at is null),
      '[]'::jsonb
    ),
    'criteria', coalesce(
      (select jsonb_agg(to_jsonb(cr.*) order by cr.position)
       from public.career_criteria cr
       where cr.competency_id in (
         select c.id from public.career_competencies c
         where c.level_id = v_level_id and c.deleted_at is null
       )
       and cr.deleted_at is null),
      '[]'::jsonb
    ),
    'indicators', coalesce(
      (select jsonb_agg(to_jsonb(i.*) order by i.position)
       from public.career_indicators i
       where i.criterion_id in (
         select cr.id from public.career_criteria cr
         where cr.competency_id in (
           select c.id from public.career_competencies c
           where c.level_id = v_level_id and c.deleted_at is null
         )
         and cr.deleted_at is null
       )
       and i.deleted_at is null),
      '[]'::jsonb
    ),
    'evidence', coalesce(
      (select jsonb_agg(to_jsonb(e.*) order by e.position)
       from public.career_evidence e
       where e.indicator_id in (
         select i.id from public.career_indicators i
         where i.criterion_id in (
           select cr.id from public.career_criteria cr
           where cr.competency_id in (
             select c.id from public.career_competencies c
             where c.level_id = v_level_id and c.deleted_at is null
           )
           and cr.deleted_at is null
         )
         and i.deleted_at is null
       )
       and e.deleted_at is null),
      '[]'::jsonb
    )
  ) into v_payload
  from public.career_levels l
  where l.id = v_level_id;

  return v_payload;
end;
$$;

grant execute on function public.career_share_read(text) to anon, authenticated;
