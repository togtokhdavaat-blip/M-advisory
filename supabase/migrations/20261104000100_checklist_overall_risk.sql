-- The advisor's due-diligence checklist lives in reports.content.checklist.
-- A Red (R) item makes the overall risk high and a Yellow (Y) item medium,
-- whatever the risk rows say, so the checklist verdict cannot be traded down.
-- Mirrors overallRisk() in src/lib/reports/schema.ts.
create or replace function app.overall_risk(p_content jsonb) returns public.risk_level
language sql immutable as $$
  with levels as (
    select x ->> 'level' as level from jsonb_array_elements(coalesce(p_content -> 'risks', '[]'::jsonb)) x
    union all
    select case a.value ->> 'v' when 'R' then 'high' when 'Y' then 'medium' end
    from jsonb_each(
      case when jsonb_typeof(p_content -> 'checklist' -> 'items') = 'object'
           then p_content -> 'checklist' -> 'items' else '{}'::jsonb end) a
  )
  select case
    when exists (select 1 from levels where level = 'high') then 'high'
    when exists (select 1 from levels where level = 'medium') then 'medium'
    when exists (select 1 from levels where level = 'not_verified') then 'not_verified'
    when exists (select 1 from levels where level = 'low') then 'low'
    else 'not_verified'
  end::public.risk_level
$$;
