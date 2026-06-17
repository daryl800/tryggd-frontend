-- Reach Out Status Setup
-- Adds a dedicated reach_out_status column for the "Reach Out" check-in mode.
-- Kept separate from home_presence so each mode has its own semantic column.
-- All new columns are nullable so existing app versions are unaffected.

-- 1. Add reach_out_status to checkins table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checkins'
      and column_name = 'reach_out_status'
  ) then
    alter table public.checkins add column reach_out_status text;
  end if;
end $$;

-- 2. Add reach_out_status to users_latest_checkin table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users_latest_checkin'
      and column_name = 'reach_out_status'
  ) then
    alter table public.users_latest_checkin add column reach_out_status text;
  end if;
end $$;

-- 3. Add check constraint for valid reach_out_status values
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'checkins_reach_out_status_values'
      and table_name = 'checkins'
  ) then
    alter table public.checkins
      add constraint checkins_reach_out_status_values
      check (reach_out_status is null or reach_out_status in (
        'call_now', 'call_available'
      ));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'users_latest_checkin_reach_out_status_values'
      and table_name = 'users_latest_checkin'
  ) then
    alter table public.users_latest_checkin
      add constraint users_latest_checkin_reach_out_status_values
      check (reach_out_status is null or reach_out_status in (
        'call_now', 'call_available'
      ));
  end if;
end $$;
