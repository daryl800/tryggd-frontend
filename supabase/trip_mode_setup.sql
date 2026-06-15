-- Trip Mode Setup
-- Run this migration to enable Trip Mode feature.
-- All new columns are nullable so existing app versions are unaffected.

-- 1. Add trip_status to checkins table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checkins'
      and column_name = 'trip_status'
  ) then
    alter table public.checkins add column trip_status text;
  end if;
end $$;

-- 2. Add trip_status to users_latest_checkin table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users_latest_checkin'
      and column_name = 'trip_status'
  ) then
    alter table public.users_latest_checkin add column trip_status text;
  end if;
end $$;

-- 3. Add checkin_mode to user_settings table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_settings'
      and column_name = 'checkin_mode'
  ) then
    alter table public.user_settings add column checkin_mode text default 'home';
  end if;
end $$;

-- 4. Add home_style to user_settings table
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_settings'
      and column_name = 'home_style'
  ) then
    alter table public.user_settings add column home_style text default 'simple'
      check (home_style in ('simple', 'detailed'));
  end if;
end $$;

-- 5. Optional: add a check constraint for valid trip_status values
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'checkins_trip_status_values'
      and table_name = 'checkins'
  ) then
    alter table public.checkins
      add constraint checkins_trip_status_values
      check (trip_status is null or trip_status in (
        'leaving', 'boarding', 'layover', 'landed',
        'on_the_move', 'at_hotel', 'on_trip', 'heading_home', 'trip_ended'
      ));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'users_latest_checkin_trip_status_values'
      and table_name = 'users_latest_checkin'
  ) then
    alter table public.users_latest_checkin
      add constraint users_latest_checkin_trip_status_values
      check (trip_status is null or trip_status in (
        'leaving', 'boarding', 'layover', 'landed',
        'on_the_move', 'at_hotel', 'on_trip', 'heading_home', 'trip_ended'
      ));
  end if;
end $$;
