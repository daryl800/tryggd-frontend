-- Home Presence Setup
-- Mirrors trip_mode_setup.sql's trip_status columns so daily presence
-- (home / outside / busy / relaxing) is persisted server-side instead of AsyncStorage-only.
-- All new columns are nullable so existing app versions are unaffected.

-- 1. Add home_presence to checkins table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checkins'
      and column_name = 'home_presence'
  ) then
    alter table public.checkins add column home_presence text;
  end if;
end $$;

-- 2. Add home_presence to users_latest_checkin table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users_latest_checkin'
      and column_name = 'home_presence'
  ) then
    alter table public.users_latest_checkin add column home_presence text;
  end if;
end $$;

-- 3. Add a check constraint for valid home_presence values
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'checkins_home_presence_values'
      and table_name = 'checkins'
  ) then
    alter table public.checkins
      add constraint checkins_home_presence_values
      check (home_presence is null or home_presence in (
        'chilling', 'home', 'outside', 'busy', 'relaxing'
      ));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'users_latest_checkin_home_presence_values'
      and table_name = 'users_latest_checkin'
  ) then
    alter table public.users_latest_checkin
      add constraint users_latest_checkin_home_presence_values
      check (home_presence is null or home_presence in (
        'chilling', 'home', 'outside', 'busy', 'relaxing'
      ));
  end if;
end $$;
