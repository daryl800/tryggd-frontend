-- Expand home_presence valid values to include new statuses.
-- Drops and recreates check constraints on both tables (ALTER TABLE cannot modify CHECK inline).
-- Existing values (chilling, home, outside, busy, relaxing) remain valid for backward compatibility.

do $$ begin
  alter table public.checkins
    drop constraint if exists checkins_home_presence_values;

  alter table public.checkins
    add constraint checkins_home_presence_values
    check (home_presence is null or home_presence in (
      'chilling', 'home', 'outside', 'busy', 'relaxing',
      'eating', 'exhausted', 'sleepy', 'daydreaming', 'having_fun',
      'goodmorning', 'goodnight'
    ));
end $$;

do $$ begin
  alter table public.users_latest_checkin
    drop constraint if exists users_latest_checkin_home_presence_values;

  alter table public.users_latest_checkin
    add constraint users_latest_checkin_home_presence_values
    check (home_presence is null or home_presence in (
      'chilling', 'home', 'outside', 'busy', 'relaxing',
      'eating', 'exhausted', 'sleepy', 'daydreaming', 'having_fun',
      'goodmorning', 'goodnight'
    ));
end $$;
