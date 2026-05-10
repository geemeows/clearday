-- Career — flip the score/target scale from 0–4 to 1–4 (PRD #115, slice #127).
-- The 0–4 scale shipped in 0028 left "0" semantically ambiguous against the
-- legend (no clear "level 0" meaning) and made the wheel's gap-to-target
-- visual undefined when current=0. Rescaling to 1–4 fixes both: every
-- indicator has a meaningful floor and every criterion's target is one of
-- the legend's four real labels.

-- ---------------------------------------------------------------------------
-- career_indicators.score: backfill 0→1, default 1, CHECK (1..4)
-- ---------------------------------------------------------------------------
update public.career_indicators set score = 1 where score = 0;

alter table public.career_indicators
  alter column score set default 1;

alter table public.career_indicators
  drop constraint if exists career_indicators_score_check;

alter table public.career_indicators
  add constraint career_indicators_score_check
    check (score between 1 and 4);

-- ---------------------------------------------------------------------------
-- career_criteria.target: backfill 0→1, default 1, CHECK (1..4)
-- ---------------------------------------------------------------------------
update public.career_criteria set target = 1 where target = 0;

alter table public.career_criteria
  alter column target set default 1;

alter table public.career_criteria
  drop constraint if exists career_criteria_target_check;

alter table public.career_criteria
  add constraint career_criteria_target_check
    check (target between 1 and 4);

-- ---------------------------------------------------------------------------
-- career_scale_legend: drop label_0 (no zero in the new scale)
-- ---------------------------------------------------------------------------
alter table public.career_scale_legend
  drop column if exists label_0;
